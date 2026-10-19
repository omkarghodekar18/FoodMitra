import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  SectionList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Animated,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';
import { colors, radius, shadow } from '../theme/colors';
import { Screen } from '../components/ui';
import { useCartStore } from '../store/cart';
import type { MenuCategory, MenuItem, Restaurant } from '../types';

// ─── Menu Item Card ──────────────────────────────────────────────────────────
function MenuItemCard({
  item,
  cartQty,
  onAdd,
  onDecrement,
}: {
  item: MenuItem;
  cartQty: number;
  onAdd: () => void;
  onDecrement: () => void;
}) {
  const available = item.availability === 'AVAILABLE';
  const isVeg = item.isVeg;

  return (
    <View style={[mc.card, !available && { opacity: 0.5 }]}>
      {/* Left: text info */}
      <View style={mc.info}>
        <View style={[mc.vegDot, { borderColor: isVeg ? colors.veg : colors.nonVeg }]}>
          <View style={[mc.vegDotInner, { backgroundColor: isVeg ? colors.veg : colors.nonVeg }]} />
        </View>
        <Text style={mc.name} numberOfLines={2}>{item.name}</Text>
        <Text style={mc.price}>₹{item.price}</Text>
        {item.description ? (
          <Text style={mc.desc} numberOfLines={2}>{item.description}</Text>
        ) : null}
      </View>

      {/* Right column: image on top, ADD/stepper below */}
      <View style={mc.rightCol}>
        <View style={mc.imgPlaceholder}>
          {item.imageUrl ? (
            <Image
              source={{ uri: item.imageUrl }}
              style={{ width: '100%', height: '100%', borderRadius: radius.md }}
              resizeMode="cover"
            />
          ) : (
            <Ionicons name="fast-food-outline" size={28} color="#D0D0D0" />
          )}
        </View>

        {cartQty > 0 ? (
          <View style={mc.stepper}>
            <TouchableOpacity
              style={mc.stepBtn}
              onPress={onDecrement}
              activeOpacity={0.7}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              {cartQty === 1
                ? <Ionicons name="trash-outline" size={15} color={colors.primary} />
                : <Text style={mc.stepMinus}>−</Text>
              }
            </TouchableOpacity>
            <Text style={mc.stepQty}>{cartQty}</Text>
            <TouchableOpacity
              style={mc.stepBtn}
              onPress={onAdd}
              activeOpacity={0.7}
              disabled={!available}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Ionicons name="add" size={15} color={colors.primary} />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[mc.addBtn, !available && mc.addBtnDisabled]}
            onPress={onAdd}
            disabled={!available}
            activeOpacity={0.8}
          >
            <Text style={mc.addText}>ADD</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ─── Category Header ─────────────────────────────────────────────────────────
function CategoryHeader({ title, count }: { title: string; count: number }) {
  return (
    <View style={ch.wrap}>
      <Text style={ch.title}>{title}</Text>
      <Text style={ch.count}>{count} items</Text>
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function RestaurantScreen({ route, navigation }: any) {
  const { restaurantId, restaurantName } = route.params;
  const insets = useSafeAreaInsets();

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<TextInput>(null);
  const searchAnim = useRef(new Animated.Value(0)).current;

  // ── Cart store (in-memory, no DB calls here) ───────────────────────────────
  const cartItems      = useCartStore((s) => s.items);
  const cartRestaurant = useCartStore((s) => s.restaurant);
  const addItem        = useCartStore((s) => s.addItem);
  const replaceAndAdd  = useCartStore((s) => s.replaceAndAdd);
  const setQty         = useCartStore((s) => s.setQty);
  const totalItems     = useCartStore((s) => s.totalItems);
  const subtotal       = useCartStore((s) => s.subtotal);

  // ── Load data ──────────────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      api.get<{ menuCategories: MenuCategory[] }>(`/restaurants/${restaurantId}/menu`),
      api.get<Restaurant>(`/restaurants/${restaurantId}`).catch(() => null),
    ]).then(([menu, rest]) => {
      setCategories(menu.menuCategories || []);
      if (rest) setRestaurant(rest);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [restaurantId]);

  // ── Toggle search ──────────────────────────────────────────────────────────
  const openSearch = useCallback(() => {
    setSearchVisible(true);
    Animated.timing(searchAnim, { toValue: 1, duration: 220, useNativeDriver: false }).start(() => {
      searchInputRef.current?.focus();
    });
  }, []);

  const closeSearch = useCallback(() => {
    setSearchQuery('');
    Animated.timing(searchAnim, { toValue: 0, duration: 180, useNativeDriver: false }).start(() => {
      setSearchVisible(false);
    });
  }, []);

  const displayName = restaurant?.name ?? restaurantName;
  const cuisine     = restaurant?.cuisine ?? '';
  const rating      = restaurant?.avgRating ?? 0;
  const ratingCount = restaurant?.ratingCount ?? 0;

  // ── Filtered sections ──────────────────────────────────────────────────────
  const sections = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return categories
      .map((cat) => ({
        ...cat,
        data: cat.items
          .filter((it) => it.availability === 'AVAILABLE')
          .filter(
            (it) =>
              !q ||
              it.name.toLowerCase().includes(q) ||
              (it.description ?? '').toLowerCase().includes(q),
          ),
      }))
      .filter((cat) => cat.data.length > 0);
  }, [categories, searchQuery]);

  // ── Per-item quantity map from the store ────────────────────────────────────
  const cartQtyMap = useMemo(() => {
    // Only show quantities for items from THIS restaurant
    if (cartRestaurant?.id !== restaurantId) return {} as Record<string, number>;
    const map: Record<string, number> = {};
    cartItems.forEach((i) => { map[i.menuItemId] = i.quantity; });
    return map;
  }, [cartItems, cartRestaurant, restaurantId]);

  // ── Add item — instant, no network call ────────────────────────────────────
  const handleAddItem = useCallback((item: MenuItem) => {
    const result = addItem(
      { id: restaurantId, name: displayName },
      { menuItemId: item.id, name: item.name, unitPrice: item.price, isVeg: item.isVeg },
    );

    if (result === 'mismatch') {
      Alert.alert(
        'Start new cart?',
        `Your cart has items from "${cartRestaurant?.name}". Starting a new cart will remove those items.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Start new cart',
            style: 'destructive',
            onPress: () =>
              replaceAndAdd(
                { id: restaurantId, name: displayName },
                { menuItemId: item.id, name: item.name, unitPrice: item.price, isVeg: item.isVeg },
              ),
          },
        ],
      );
    }
  }, [addItem, replaceAndAdd, restaurantId, displayName, cartRestaurant]);

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <Screen>
      {/* ── Top header ── */}
      <View style={[s.header, { paddingTop: insets.top }]}>
        <TouchableOpacity style={s.iconBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </TouchableOpacity>

        {!searchVisible && (
          <Text style={s.headerTitle} numberOfLines={1}>{displayName}</Text>
        )}

        {searchVisible && (
          <Animated.View style={[s.searchBar, { opacity: searchAnim, flex: 1 }]}>
            <Ionicons name="search" size={16} color={colors.textMuted} style={{ marginRight: 6 }} />
            <TextInput
              ref={searchInputRef}
              style={s.searchInput}
              placeholder="Search menu..."
              placeholderTextColor={colors.textLight}
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </Animated.View>
        )}

        <View style={s.headerRight}>
          {!searchVisible ? (
            <TouchableOpacity style={s.iconBtn} onPress={openSearch} activeOpacity={0.7}>
              <Ionicons name="search" size={20} color={colors.text} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={s.iconBtn} onPress={closeSearch} activeOpacity={0.7}>
              <Text style={s.cancelText}>Cancel</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Restaurant info strip ── */}
      {!searchVisible && (
        <View style={s.infoStrip}>
          <View style={s.infoLeft}>
            <Text style={s.restName} numberOfLines={1}>{displayName}</Text>
            {cuisine ? <Text style={s.cuisineText}>{cuisine}</Text> : null}
            {/* <View style={s.metaRow}>
              <Ionicons name="time-outline" size={13} color={colors.textMuted} />
              <Text style={s.metaText}>20–35 mins</Text>
              <View style={s.metaDot} />
              <Ionicons name="bicycle-outline" size={14} color={colors.textMuted} />
              <Text style={s.metaText}>Free delivery</Text>
            </View> */}
          </View>
          {/* rating badge — disabled
          rating > 0 &&
            <View style={s.ratingBadge}>
              <Ionicons name="star" size={12} color="#fff" />
              <Text style={s.ratingText}>{rating.toFixed(1)}</Text>
              ratingCount > 0 &&
                <Text style={s.ratingCount}>
                  {ratingCount > 1000 ? (ratingCount / 1000).toFixed(1) + 'k' : ratingCount}+
                </Text>
            </View>
          */}
        </View>
      )}

      {/* ── Section divider ── */}
      {/* <View style={s.stripDivider} /> */}

      {/* ── Menu list ── */}
      {loading ? (
        <View style={s.loadWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={s.loadText}>Loading menu…</Text>
        </View>
      ) : sections.length === 0 ? (
        <View style={s.emptyWrap}>
          <Ionicons name="search-outline" size={44} color={colors.textLight} />
          <Text style={s.emptyTitle}>{searchQuery ? 'No items found' : 'No menu available'}</Text>
          <Text style={s.emptySubtitle}>
            {searchQuery ? `No results for "${searchQuery}"` : 'This restaurant has no menu yet'}
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          stickySectionHeadersEnabled
          renderSectionHeader={({ section }) => (
            <CategoryHeader title={section.name} count={section.data.length} />
          )}
          renderItem={({ item }) => (
            <MenuItemCard
              item={item}
              cartQty={cartQtyMap[item.id] ?? 0}
              onAdd={() => handleAddItem(item)}
              onDecrement={() => setQty(item.id, (cartQtyMap[item.id] ?? 1) - 1)}
            />
          )}
          contentContainerStyle={[
            s.listContent,
            { paddingBottom: totalItems() > 0 ? 100 : 24 },
          ]}
          ItemSeparatorComponent={() => <View style={s.itemSep} />}
          SectionSeparatorComponent={() => <View style={s.sectionSep} />}
        />
      )}

      {/* ── Floating cart bar ── */}
      {totalItems() > 0 && cartRestaurant?.id === restaurantId && (
        <TouchableOpacity
          style={[s.cartBar, { bottom: insets.bottom + 12 }]}
          onPress={() => navigation.navigate('CartTab')}
          activeOpacity={0.92}
        >
          <View style={s.cartLeft}>
            <View style={s.cartBadge}>
              <Text style={s.cartBadgeText}>{totalItems()}</Text>
            </View>
            <Text style={s.cartItemsText}>
              {totalItems()} item{totalItems() !== 1 ? 's' : ''}
            </Text>
          </View>
          <Text style={s.cartTotal}>₹{subtotal()}</Text>
          <View style={s.cartRight}>
            <Text style={s.cartAction}>View Cart</Text>
            <Ionicons name="arrow-forward" size={14} color="#fff" />
          </View>
        </TouchableOpacity>
      )}
    </Screen>
  );
}

// ─── Menu item card styles ────────────────────────────────────────────────────
const mc = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: colors.white,
  },
  info: {
    flex: 1,
    paddingRight: 12,
  },
  vegDot: {
    width: 14,
    height: 14,
    borderRadius: 2,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  vegDotInner: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    lineHeight: 20,
  },
  price: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginTop: 4,
  },
  desc: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
    lineHeight: 17,
  },
  rightCol: {
    width: 100,
    alignItems: 'center',
    gap: 8,                        // space between image and ADD/stepper
  },
  imgPlaceholder: {
    width: 96,
    height: 88,
    borderRadius: radius.md,
    backgroundColor: 'rgba(245,245,245,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  addBtn: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radius.sm,
    paddingHorizontal: 20,
    paddingVertical: 6,
    ...shadow.sm,
  },
  addBtnDisabled: {
    borderColor: colors.textLight,
  },
  addText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radius.sm,
    ...shadow.sm,
  },
  stepBtn: {
    width: 30,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepMinus: {
    fontSize: 20,
    fontWeight: '300',
    color: colors.primary,
    lineHeight: 22,
  },
  stepQty: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.primary,
    minWidth: 22,
    textAlign: 'center',
  },
});

// ─── Category header styles ───────────────────────────────────────────────────
const ch = StyleSheet.create({
  wrap: {
    backgroundColor: 'rgba(248,248,248,0.88)',  // semi-transparent so bg shows through
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: 0.1,
  },
  count: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '500',
  },
});

// ─── Screen styles ────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  // Header — transparent so bg pattern shows through
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 10,
    backgroundColor: 'transparent',
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.white,
    ...shadow.sm,
  },
  headerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginHorizontal: 10,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 8,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceGrey,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginHorizontal: 8,
    flex: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    paddingVertical: 0,
  },
  cancelText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
    paddingHorizontal: 6,
  },

  // Info strip — white card
  infoStrip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    backgroundColor: colors.white,
  },
  infoLeft: {
    flex: 1,
    paddingRight: 12,
  },
  restName: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 2,
  },
  cuisineText: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.textLight,
    marginHorizontal: 2,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#48C479',
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 5,
    gap: 3,
    alignSelf: 'flex-start',
  },
  ratingText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
  ratingCount: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 10,
    fontWeight: '500',
  },

  // Thin section divider — slightly transparent
  stripDivider: {
    height: 6,
    backgroundColor: 'rgba(244,244,244,0.7)',
  },

  // List
  listContent: {
    paddingTop: 4,
  },
  itemSep: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginHorizontal: 16,
  },
  sectionSep: {
    height: 0,
  },

  // Loading / empty
  loadWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 10,
    marginBottom: 60,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Cart bar
  cartBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...shadow.lg,
  },
  cartLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cartBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cartBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  cartItemsText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  cartTotal: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  cartRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cartAction: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
});
