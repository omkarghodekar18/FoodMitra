import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Alert,
  StatusBar,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, shadow } from '../theme/colors';

const SUPPORT_PHONE = '+918446855637';
const SUPPORT_PHONE_DISPLAY = '+91 8446855637';
const SUPPORT_EMAIL = 'omkarghodekar03@gmail.com';

export default function ContactSupportScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();

  const handlePhone = async () => {
    const url = `tel:${SUPPORT_PHONE}`;
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      Linking.openURL(url);
    } else {
      Alert.alert('Unable to open dialer', 'Please call us at ' + SUPPORT_PHONE_DISPLAY);
    }
  };

  const handleEmail = async () => {
    const url = `mailto:${SUPPORT_EMAIL}`;
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      Linking.openURL(url);
    } else {
      Alert.alert('Unable to open email app', 'Please email us at ' + SUPPORT_EMAIL);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />

      {/* Red hero header — mirrors NotificationsScreen / AddressesScreen pattern */}
      <View style={[s.hero, { paddingTop: Math.max(insets.top + 4, 16) }]}>
        <TouchableOpacity
          style={s.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.8}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={s.heroTitle}>Contact & Support</Text>
          <Text style={s.heroSub}>We're here to help</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: Math.max(insets.bottom + 24, 32) }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Customer Support card ───────────────────────────────────── */}
        <View style={s.sectionLabel}>
          <Ionicons name="headset-outline" size={15} color={colors.textSecondary} />
          <Text style={s.sectionLabelText}>Customer Support</Text>
        </View>

        <View style={s.card}>
          <Text style={s.cardHeading}>Need help with your FoodMitra orders?</Text>
          <Text style={s.cardBody}>
            Our support team is available to help you with order issues, delivery questions, or anything else related to your experience.
          </Text>

          <View style={s.divider} />

          {/* Phone row */}
          <TouchableOpacity style={s.contactRow} onPress={handlePhone} activeOpacity={0.7}>
            <View style={s.contactIconWrap}>
              <Ionicons name="call-outline" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.contactLabel}>Phone</Text>
              <Text style={s.contactValue}>{SUPPORT_PHONE_DISPLAY}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textLight} />
          </TouchableOpacity>
        </View>

        {/* ── Technical Support card ──────────────────────────────────── */}
        <View style={[s.sectionLabel, { marginTop: 8 }]}>
          <Ionicons name="build-outline" size={15} color={colors.textSecondary} />
          <Text style={s.sectionLabelText}>Technical Support</Text>
        </View>

        <View style={s.card}>
          <Text style={s.cardHeading}>Facing a technical issue?</Text>
          <Text style={s.cardBody}>
            Facing any technical issue with the platform? Drop us an email and we'll get back to you.
          </Text>

          <View style={s.divider} />

          {/* Email row */}
          <TouchableOpacity style={s.contactRow} onPress={handleEmail} activeOpacity={0.7}>
            <View style={s.contactIconWrap}>
              <Ionicons name="mail-outline" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.contactLabel}>Email</Text>
              <Text style={s.contactValue}>{SUPPORT_EMAIL}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textLight} />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  // ── Hero ──────────────────────────────────────────────────────────────────
  hero: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingBottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
  },
  heroSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 1,
  },

  // ── Scroll content ────────────────────────────────────────────────────────
  content: {
    paddingHorizontal: 16,
    paddingTop: 20,
  },

  // ── Section label row ─────────────────────────────────────────────────────
  sectionLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  sectionLabelText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },

  // ── Card ──────────────────────────────────────────────────────────────────
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: 16,
    ...shadow.sm,
  },
  cardHeading: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  cardBody: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },

  // ── Divider inside card ───────────────────────────────────────────────────
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
  },

  // ── Contact row (matches ProfileScreen menuRow exactly) ───────────────────
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  contactIconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.primaryBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contactLabel: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '500',
    marginBottom: 1,
  },
  contactValue: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary,
  },
});
