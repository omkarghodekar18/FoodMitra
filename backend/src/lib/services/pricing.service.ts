// src/lib/services/pricing.service.ts
// Server-side pricing engine. Backend is the ONLY source of truth.
// Tax removed. Delivery fee is distance-based via admin-configured DeliveryFeeTier
// (when a deliveryAddressId is passed), else falls back to restaurant.flat deliveryFee.

import { db } from '@/lib/db';
import { AppError } from '@/lib/errors';

export interface CartPricingInput {
  cartId: string;
}

export interface PricingBreakdown {
  subtotal: number;
  deliveryFee: number;
  deliveryFeeSource: 'tier' | 'restaurant_default' | 'platform_default';
  deliveryDistanceKm: number | null;
  discount: number;
  totalAmount: number;
  currency: string;
}

export interface CartPricingResult extends PricingBreakdown {
  items: Array<{
    menuItemId: string;
    name: string;
    unitPrice: number;
    quantity: number;
    subtotal: number;
    isVeg: boolean;
    imageUrl: string | null;
    availability: 'AVAILABLE' | 'UNAVAILABLE';
  }>;
  restaurantId: string;
  restaurantName: string;
  restaurantStatus: string;
  restaurantAvailability: string;
  minOrderAmount: number;
  meetsMinimum: boolean;
}

export interface ComputePricingOptions {
  /** If provided, the delivery fee is computed from the active DeliveryFeeTier
   * matching the haversine distance between this address and the restaurant. */
  deliveryAddressId?: string;
}

async function getDefaultDeliveryFee(): Promise<number> {
  const setting = await db.platformSettings.findUnique({ where: { key: 'defaultDeliveryFee' } });
  if (!setting) return 30;
  const parsed = parseFloat(setting.value);
  return Number.isFinite(parsed) ? parsed : 30;
}

async function getMinOrderAmount(): Promise<number> {
  const setting = await db.platformSettings.findUnique({ where: { key: 'minOrderAmount' } });
  if (!setting) return 99;
  const parsed = parseFloat(setting.value);
  return Number.isFinite(parsed) ? parsed : 99;
}

/**
 * Resolve the delivery fee for a given distance using the admin-configured DeliveryFeeTier table.
 * Returns the matching tier fee or null if no tiers configured.
 */
async function getTierDeliveryFee(distanceKm: number): Promise<{ fee: number; tierId: string } | null> {
  const tiers = await db.deliveryFeeTier.findMany({
    where: { isActive: true },
    orderBy: [{ minKm: 'asc' }, { maxKm: 'asc' }],
  });
  if (tiers.length === 0) return null;

  for (const t of tiers) {
    if (distanceKm >= t.minKm && distanceKm < t.maxKm) {
      return { fee: t.fee, tierId: t.id };
    }
  }
  if (distanceKm < tiers[0].minKm) {
    return { fee: tiers[0].fee, tierId: tiers[0].id };
  }
  const last = tiers[tiers.length - 1];
  return { fee: last.fee, tierId: last.id };
}

/**
 * Haversine distance in km between two lat/lng points.
 * Multiplied by 1.35 to approximate actual road distance (straight-line distance
 * underestimates real driving distance by ~35% due to road curvature, turns, and
 * non-direct routing — this is a standard heuristic used by delivery platforms).
 */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const straightLineKm = R * c;
  // Approximate road distance: straight-line × 1.35 (35% longer due to road layout)
  return straightLineKm * 1.35;
}

export class PricingService {
  static async computeCartPricing(cartId: string, opts: ComputePricingOptions = {}): Promise<CartPricingResult> {
    const cart = await db.cart.findUnique({
      where: { id: cartId },
      include: {
        items: { include: { menuItem: true } },
        restaurant: true,
      },
    });
    if (!cart) throw AppError.notFound('Cart');
    if (cart.items.length === 0) {
      throw new AppError('CART_EMPTY', 'Your cart is empty', 400);
    }
    if (cart.restaurant.status !== 'ACTIVE') {
      throw new AppError('RESTAURANT_NOT_AVAILABLE', `Restaurant is ${cart.restaurant.status}`, 409);
    }

    const items = cart.items.map((ci) => ({
      id: ci.id,
      menuItemId: ci.menuItem.id,
      name: ci.menuItem.name,
      unitPrice: ci.menuItem.price,
      quantity: ci.quantity,
      subtotal: round2(ci.menuItem.price * ci.quantity),
      isVeg: ci.menuItem.isVeg,
      imageUrl: ci.menuItem.imageUrl,
      availability: ci.menuItem.availability,
    }));

    const subtotal = round2(items.reduce((s, i) => s + i.subtotal, 0));

    let deliveryFee: number;
    let deliveryFeeSource: 'tier' | 'restaurant_default' | 'platform_default';
    let deliveryDistanceKm: number | null = null;

    if (opts.deliveryAddressId) {
      const addr = await db.deliveryAddress.findUnique({ where: { id: opts.deliveryAddressId } });
      if (!addr) throw AppError.notFound('Delivery address');
      const restaurant = cart.restaurant;
      const rLat = restaurant.latitude;
      const rLng = restaurant.longitude;
      if (rLat != null && rLng != null && addr.latitude != null && addr.longitude != null) {
        deliveryDistanceKm = round2(haversineKm(rLat, rLng, addr.latitude, addr.longitude));
        const tier = await getTierDeliveryFee(deliveryDistanceKm);
        if (tier) {
          deliveryFee = round2(tier.fee);
          deliveryFeeSource = 'tier';
        } else {
          deliveryFee = round2(restaurant.deliveryFee ?? (await getDefaultDeliveryFee()));
          deliveryFeeSource = restaurant.deliveryFee != null ? 'restaurant_default' : 'platform_default';
        }
      } else {
        deliveryFee = round2(restaurant.deliveryFee ?? (await getDefaultDeliveryFee()));
        deliveryFeeSource = restaurant.deliveryFee != null ? 'restaurant_default' : 'platform_default';
      }
    } else {
      deliveryFee = round2(cart.restaurant.deliveryFee ?? (await getDefaultDeliveryFee()));
      deliveryFeeSource = cart.restaurant.deliveryFee != null ? 'restaurant_default' : 'platform_default';
    }

    const discount = 0;
    const totalAmount = round2(subtotal + deliveryFee - discount);
    const minOrderAmount = cart.restaurant.minOrderAmount ?? (await getMinOrderAmount());

    return {
      items,
      restaurantId: cart.restaurantId,
      restaurantName: cart.restaurant.name,
      restaurantStatus: cart.restaurant.status,
      restaurantAvailability: cart.restaurant.availability,
      subtotal,
      deliveryFee,
      deliveryFeeSource,
      deliveryDistanceKm,
      discount,
      totalAmount,
      currency: 'INR',
      minOrderAmount,
      meetsMinimum: subtotal >= minOrderAmount,
    };
  }
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
