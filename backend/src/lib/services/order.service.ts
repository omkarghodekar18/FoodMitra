// src/lib/services/order.service.ts
// Order state machine + creation + transition logic.
// Spec: docs/order-state-machine.md

import { db } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import type { AuthContext } from '@/lib/auth/session';
import { PricingService, round2 } from './pricing.service';
import { NotificationService } from './notification.service';
import { sendOrderAlert } from '@/lib/integrations/telegram';

export type OrderStatus =
  | 'PLACED'
  | 'APPROVED'
  | 'PAID'
  | 'DELIVERED'
  | 'CANCELLED';

// Simplified state machine — admin drives every transition:
//   PLACED → APPROVED (admin approves)
//   APPROVED → PAID (admin marks as paid)
//   PAID → DELIVERED (admin marks as delivered)
//   {PLACED, APPROVED, PAID} → CANCELLED (admin or customer cancels before delivery)
const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PLACED: ['APPROVED', 'CANCELLED'],
  APPROVED: ['PAID', 'CANCELLED'],
  PAID: ['DELIVERED', 'CANCELLED'],
  DELIVERED: [],
  CANCELLED: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// Generate a human-friendly order code in the format YYMMDD-####
// (e.g. "261010-0347") where YYMMDD is the order date and #### is a 4-digit
// numeric suffix (0000-9999).
function genShortCode(): string {
  const now = new Date();
  const yy = String(now.getUTCFullYear()).slice(-2);
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const datePart = `${yy}${mm}${dd}`;

  const suffix = String(Math.floor(Math.random() * 10000)).padStart(4, '0');

  return `${datePart}-${suffix}`;
}

export class OrderService {
  /**
   * Create a new order from the customer's cart.
   * Server-side pricing only. Snapshots item name + price.
   */
  static async createOrder(input: {
    customerId: string;
    deliveryAddressId: string;
    notes?: string;
    idempotencyKey?: string;
  }) {
    // Idempotency check
    if (input.idempotencyKey) {
      const existing = await db.order.findFirst({
        where: { idempotencyKey: input.idempotencyKey },
        include: { items: true, payment: true },
      });
      if (existing) {
        logger.info('order.idempotent_hit', { orderId: existing.id, idempotencyKey: input.idempotencyKey });
        return { order: existing, payment: existing.payment, created: false };
      }
    }

    // Get cart + verify ownership
    const cart = await db.cart.findUnique({
      where: { customerId: input.customerId },
      include: { items: { include: { menuItem: true } }, restaurant: true },
    });
    if (!cart) throw new AppError('CART_EMPTY', 'Your cart is empty', 400);
    if (cart.items.length === 0) throw new AppError('CART_EMPTY', 'Your cart is empty', 400);

    // Verify restaurant is ACTIVE and OPEN
    if (cart.restaurant.status !== 'ACTIVE') {
      throw new AppError('RESTAURANT_NOT_AVAILABLE', `Restaurant is ${cart.restaurant.status}`, 409);
    }
    if (cart.restaurant.availability !== 'OPEN') {
      throw new AppError('RESTAURANT_NOT_AVAILABLE', `Restaurant is ${cart.restaurant.availability}`, 409);
    }

    // Re-fetch all menu items fresh from DB (no cart snapshot trust)
    // Pass the delivery address so the delivery fee is resolved from the
    // admin-configured distance-based tier (see PricingService).
    const pricing = await PricingService.computeCartPricing(cart.id, {
      deliveryAddressId: input.deliveryAddressId,
    });
    if (!pricing.meetsMinimum) {
      throw new AppError(
        'INSUFFICIENT_CART_TOTAL',
        `Minimum order amount is ₹${pricing.minOrderAmount}`,
        400,
        { details: { subtotal: pricing.subtotal, minOrderAmount: pricing.minOrderAmount } },
      );
    }

    // Verify delivery address belongs to customer
    const addr = await db.deliveryAddress.findUnique({
      where: { id: input.deliveryAddressId },
    });
    if (!addr || addr.customerId !== input.customerId) {
      throw AppError.notFound('Delivery address');
    }

    // Get customer phone
    const customer = await db.user.findUnique({
      where: { id: input.customerId },
      select: { id: true, phone: true, customerProfile: true, email: true },
    });
    if (!customer) throw AppError.notFound('Customer');

    let shortCode = genShortCode();
    // Ensure uniqueness (very low collision probability but check)
    while (await db.order.findFirst({ where: { shortCode } })) {
      shortCode = genShortCode();
    }

    return db.$transaction(async (tx) => {
      // Create order + order items in a single query (nested create)
      const order = await tx.order.create({
        data: {
          shortCode,
          customerId: input.customerId,
          restaurantId: cart.restaurantId,
          deliveryAddressLine1: addr.line1,
          deliveryAddressLine2: addr.line2,
          deliveryCity: addr.city,
          deliveryLatitude: addr.latitude,
          deliveryLongitude: addr.longitude,
          deliveryPhone: customer.phone || customer.customerProfile?.phone || '',
          subtotal: pricing.subtotal,
          deliveryFee: pricing.deliveryFee,
          tax: 0,
          discount: pricing.discount,
          totalAmount: pricing.totalAmount,
          orderStatus: 'PLACED',
          paymentStatus: 'PENDING',
          notes: input.notes,
          idempotencyKey: input.idempotencyKey,
          items: {
            create: pricing.items.map((it) => ({
              menuItemId: it.menuItemId,
              itemNameSnapshot: it.name,
              itemPriceSnapshot: it.unitPrice,
              isVeg: it.isVeg,
              quantity: it.quantity,
              subtotal: it.subtotal,
            })),
          },
          // Nested create for status history — eliminates a separate query
          statusHistory: {
            create: {
              fromStatus: null,
              toStatus: 'PLACED',
              changedByUserId: input.customerId,
              note: 'Order placed',
            },
          },
          // Nested create for payment — eliminates a separate query
          payment: {
            create: {
              amount: pricing.totalAmount,
              currency: 'INR',
              method: 'MANUAL',
              status: 'PENDING',
            },
          },
        },
        include: { items: true, payment: true },
      });

      // Clear cart (2 queries — must run after order is created)
      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
      await tx.cart.delete({ where: { id: cart.id } });

      return { order, payment: order.payment, created: true };
    }, { timeout: 15000 }).then(async (result) => {
      // Side effects — run AFTER the transaction commits (outside the DB transaction so they don't add latency)
      // 1. In-app notifications (customer + admin)
      await NotificationService.notifyOrderPlaced(result.order.id).catch((e) =>
        logger.error('notification.failed', { orderId: result.order.id, error: e }),
      );
      // 2. Telegram alert to admin
      try {
        const fullOrder = await db.order.findUnique({
          where: { id: result.order.id },
          include: {
            restaurant: { select: { name: true } },
            customer: { select: { phone: true, customerProfile: { select: { fullName: true } } } },
            items: { select: { itemNameSnapshot: true, quantity: true, subtotal: true } },
          },
        });
        if (fullOrder) {
          await sendOrderAlert({
            shortCode: fullOrder.shortCode,
            totalAmount: fullOrder.totalAmount,
            deliveryFee: fullOrder.deliveryFee,
            subtotal: fullOrder.subtotal,
            restaurantName: fullOrder.restaurant.name,
            customerPhone: fullOrder.customer.phone,
            customerName: fullOrder.customer.customerProfile?.fullName || null,
            items: fullOrder.items.map((it) => ({
              name: it.itemNameSnapshot,
              quantity: it.quantity,
              subtotal: it.subtotal,
            })),
            deliveryAddress: `${fullOrder.deliveryAddressLine1}, ${fullOrder.deliveryCity}`,
            paymentStatus: fullOrder.paymentStatus,
          });
        }
      } catch (err) {
        logger.error('telegram.order_alert_failed', { orderId: result.order.id, error: String(err) });
      }
      return result;
    });
  }

  static async transitionOrder(
    orderId: string,
    toStatus: OrderStatus,
    ctx: AuthContext,
    note?: string,
  ) {
    const order = await db.order.findFirst({
      where: { id: orderId },
      include: { restaurant: true, items: true, payment: true },
    });
    if (!order) throw AppError.notFound('Order');

    const from = order.orderStatus as OrderStatus;
    if (!canTransition(from, toStatus)) {
      throw AppError.conflict(
        'INVALID_STATE_TRANSITION',
        `Cannot transition order ${order.shortCode} from ${from} to ${toStatus}`,
        { from, to: toStatus },
      );
    }

    // Ownership / role checks — admin manages all restaurant orders now
    if (ctx.role === 'CUSTOMER' && order.customerId !== ctx.userId) {
      throw AppError.forbidden('Not your order');
    }
    if (ctx.role !== 'ADMIN' && ctx.role !== 'CUSTOMER') {
      throw AppError.forbidden('Only admin can manage restaurant orders');
    }

    return db.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id: orderId },
        data: { orderStatus: toStatus },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: from,
          toStatus,
          changedByUserId: ctx.userId,
          note,
        },
      });
      return updated;
    }, { timeout: 15000 }).then(async (updated) => {
      // Side effects (outside TX)
      await NotificationService.notifyOrderTransition(order.id, from, toStatus, ctx).catch((e) =>
        logger.error('notification.failed', { orderId: order.id, error: e }),
      );
      return updated;
    });
  }

  static async cancelOrder(orderId: string, ctx: AuthContext, reason?: string) {
    const order = await db.order.findFirst({ where: { id: orderId }, include: { payment: true } });
    if (!order) throw AppError.notFound('Order');
    if (ctx.role === 'CUSTOMER' && order.customerId !== ctx.userId) {
      throw AppError.forbidden('Not your order');
    }

    const from = order.orderStatus as OrderStatus;
    // Customers can only cancel pre-restaurant-acceptance
    if (ctx.role === 'CUSTOMER' && !['PLACED', 'APPROVED', 'PAID'].includes(from)) {
      throw AppError.conflict(
        'INVALID_STATE_TRANSITION',
        'Cannot cancel order once it has been delivered',
        { from },
      );
    }
    if (!canTransition(from, 'CANCELLED')) {
      throw AppError.conflict('INVALID_STATE_TRANSITION', `Cannot cancel from ${from}`, { from });
    }

    const updated = await this.transitionOrder(orderId, 'CANCELLED', ctx, reason);

    // If payment was captured, mark refund pending (manual refund — admin handles actual money movement)
    if (order.payment && order.payment.status === 'CAPTURED') {
      await db.payment.update({
        where: { orderId },
        data: { refundStatus: 'pending' },
      });
    }

    return updated;
  }

  /**
   * Admin approves a freshly-placed order.
   * Transitions PLACED → APPROVED.
   */
  static async approveOrder(orderId: string, ctx: AuthContext) {
    return this.transitionOrder(orderId, 'APPROVED', ctx, 'Order approved by admin');
  }

  /**
   * Admin manually marks an order as paid.
   * Transitions APPROVED → PAID and updates the Payment record to CAPTURED.
   */
  static async markOrderPaid(orderId: string, ctx: AuthContext) {
    const order = await db.order.findFirst({
      where: { id: orderId },
      include: { payment: true },
    });
    if (!order) throw AppError.notFound('Order');

    const from = order.orderStatus as OrderStatus;
    if (!canTransition(from, 'PAID')) {
      throw AppError.conflict(
        'INVALID_STATE_TRANSITION',
        `Cannot mark order ${order.shortCode} as paid — current status is ${from}`,
        { from, to: 'PAID' },
      );
    }

    return db.$transaction(async (tx) => {
      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: { orderStatus: 'PAID', paymentStatus: 'CAPTURED' },
      });
      if (order.payment) {
        await tx.payment.update({
          where: { id: order.payment.id },
          data: { status: 'CAPTURED' },
        });
      }
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: from,
          toStatus: 'PAID',
          changedByUserId: ctx.userId,
          note: 'Marked as paid by admin',
        },
      });
      return updatedOrder;
    }, { timeout: 15000 }).then(async (updated) => {
      await NotificationService.notifyOrderTransition(order.id, from, 'PAID', ctx).catch((e) =>
        logger.error('notification.failed', { orderId: order.id, error: e }),
      );
      return updated;
    });
  }

  static async getTracking(orderId: string, ctx: AuthContext) {
    const order = await db.order.findFirst({
      where: { id: orderId },
      include: {
        items: true,
        restaurant: true,
        statusHistory: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!order) throw AppError.notFound('Order');

    // Authorization — admin or owner-customer
    if (ctx.role === 'CUSTOMER' && order.customerId !== ctx.userId) {
      throw AppError.forbidden('Not your order');
    }
    if (ctx.role !== 'ADMIN' && ctx.role !== 'CUSTOMER') {
      throw AppError.forbidden('Only admin or order owner');
    }

    return {
      orderId: order.id,
      shortCode: order.shortCode,
      currentStatus: order.orderStatus,
      timeline: order.statusHistory.map((h) => ({
        status: h.toStatus,
        timestamp: h.createdAt,
        changedBy: h.changedByUserId,
        note: h.note,
      })),
      rider:
        order.riderId || order.riderName
          ? { name: order.riderName, phone: order.riderPhone }
          : null,
      restaurant: {
        id: order.restaurant.id,
        name: order.restaurant.name,
      },
      items: order.items.map((i) => ({
        name: i.itemNameSnapshot,
        quantity: i.quantity,
        price: i.itemPriceSnapshot,
      })),
      total: order.totalAmount,
      paymentStatus: order.paymentStatus,
    };
  }

  static async assignRider(orderId: string, riderInfo: { riderName: string; riderPhone: string }, ctx: AuthContext) {
    if (ctx.role !== 'ADMIN') {
      throw AppError.forbidden('Only admin can assign riders in MVP');
    }
    const order = await db.order.findFirst({ where: { id: orderId } });
    if (!order) throw AppError.notFound('Order');
    if (!['READY_FOR_PICKUP', 'PICKED_UP'].includes(order.orderStatus)) {
      throw AppError.conflict(
        'INVALID_STATE_TRANSITION',
        'Rider can only be assigned to READY_FOR_PICKUP or PICKED_UP orders',
        { currentStatus: order.orderStatus },
      );
    }
    const updated = await db.order.update({
      where: { id: orderId },
      data: {
        riderName: riderInfo.riderName,
        riderPhone: riderInfo.riderPhone,
        riderAssignmentStatus: 'ASSIGNED',
      },
    });
    await NotificationService.notifyRiderAssigned(orderId, riderInfo).catch(() => null);
    return updated;
  }
}

// Export pricing helper for re-use
export { round2 };
