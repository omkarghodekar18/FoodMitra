import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  StatusBar,
  TextInput,
  Modal,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { api, ApiError } from '../api/client';
import { colors, radius, shadow } from '../theme/colors';
import { Btn, Input } from '../components/ui';

const DEFAULT_LAT = 18.52;
const DEFAULT_LNG = 73.85;
const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const LABELS = ['HOME', 'WORK', 'OTHER'] as const;
type LabelType = (typeof LABELS)[number];

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

const labelIcon = (l: LabelType) => {
  if (l === 'HOME') return 'home-outline';
  if (l === 'WORK') return 'briefcase-outline';
  return 'location-outline';
};

// Builds the Leaflet HTML for a given lat/lng
const buildLeafletHTML = (initLat: number, initLng: number) => `
<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <style>
      * { box-sizing: border-box; }
      body { padding: 0; margin: 0; }
      html, body, #map { height: 100%; width: 100%; }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <script>
      var map = L.map('map', { zoomControl: true }).setView([${initLat}, ${initLng}], 15);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap'
      }).addTo(map);

      var customIcon = L.icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
      });

      var marker = L.marker([${initLat}, ${initLng}], { icon: customIcon, draggable: true }).addTo(map);

      // Tap on map moves marker
      map.on('click', function(e) {
        marker.setLatLng(e.latlng);
        window.ReactNativeWebView.postMessage(JSON.stringify({ lat: e.latlng.lat, lng: e.latlng.lng }));
      });

      // Drag marker
      marker.on('dragend', function() {
        var ll = marker.getLatLng();
        window.ReactNativeWebView.postMessage(JSON.stringify({ lat: ll.lat, lng: ll.lng }));
      });

      window.updateMap = function(newLat, newLng) {
        marker.setLatLng([newLat, newLng]);
        map.setView([newLat, newLng], 15);
      };
    </script>
  </body>
</html>
`;

// ─────────────────────────────────────────────
// Full-screen map modal component
// ─────────────────────────────────────────────
interface MapModalProps {
  visible: boolean;
  initialLat: number;
  initialLng: number;
  onConfirm: (lat: number, lng: number) => void;
  onClose: () => void;
}

function MapModal({ visible, initialLat, initialLng, onConfirm, onClose }: MapModalProps) {
  const insets = useSafeAreaInsets();
  const webViewRef = useRef<WebView>(null);
  const [pendingLat, setPendingLat] = useState(initialLat);
  const [pendingLng, setPendingLng] = useState(initialLng);
  const [locating, setLocating] = useState(false);

  // Search state inside modal
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<NominatimResult[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Reset pending coords when modal opens
  useEffect(() => {
    if (visible) {
      setPendingLat(initialLat);
      setPendingLng(initialLng);
      setSearchQuery('');
      setSearchResults([]);
    }
  }, [visible]);

  // Debounced Nominatim search
  useEffect(() => {
    if (!searchQuery || searchQuery.trim().length < 3) {
      setSearchResults([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=6&q=${encodeURIComponent(searchQuery)}`;
        const res = await fetch(url, {
          headers: {
            Accept: 'application/json',
            'User-Agent': 'FoodMitraApp/1.0 (contact@foodmitra.com)',
          },
        });
        if (res.ok) {
          const data = (await res.json()) as NominatimResult[];
          setSearchResults(data);
        }
      } catch {
        // silently ignore
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery]);

  const moveMap = (newLat: number, newLng: number) => {
    setPendingLat(newLat);
    setPendingLng(newLng);
    webViewRef.current?.injectJavaScript(`window.updateMap(${newLat}, ${newLng}); true;`);
  };

  const handleMapMessage = (e: any) => {
    try {
      const data = JSON.parse(e.nativeEvent.data);
      setPendingLat(data.lat);
      setPendingLng(data.lng);
    } catch {}
  };

  const pickSearchResult = (r: NominatimResult) => {
    const newLat = parseFloat(r.lat);
    const newLng = parseFloat(r.lon);
    setSearchQuery(r.display_name.split(',')[0]);
    setSearchResults([]);
    moveMap(newLat, newLng);
  };

  const useMyLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        alert('Permission to access location was denied');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      moveMap(loc.coords.latitude, loc.coords.longitude);
    } catch {
      alert('Could not get your location');
    } finally {
      setLocating(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <StatusBar barStyle="light-content" backgroundColor={colors.primary} />

        {/* Header */}
        <View style={[ms.header, { paddingTop: Math.max(insets.top + 4, 16) }]}>
          <TouchableOpacity style={ms.closeBtn} onPress={onClose} activeOpacity={0.8}>
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </TouchableOpacity>
          <Text style={ms.headerTitle}>Pick Location</Text>
          <View style={{ width: 36 }} />
        </View>

        {/* Search bar */}
        <View style={ms.searchContainer}>
          <View style={ms.searchWrap}>
            <Ionicons name="search" size={18} color={colors.textMuted} style={{ marginRight: 8 }} />
            <TextInput
              style={ms.searchInput}
              placeholder="Search a place…"
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searching && <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: 8 }} />}
            {searchQuery !== '' && !searching && (
              <TouchableOpacity onPress={() => { setSearchQuery(''); setSearchResults([]); }} style={{ marginLeft: 8 }}>
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {/* Search results dropdown */}
          {searchResults.length > 0 && (
            <View style={ms.searchResults}>
              {searchResults.map((r, i) => (
                <TouchableOpacity
                  key={r.place_id}
                  style={[ms.resultItem, i === searchResults.length - 1 && { borderBottomWidth: 0 }]}
                  onPress={() => pickSearchResult(r)}
                >
                  <Ionicons name="location-outline" size={18} color={colors.primary} style={{ marginTop: 2 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={ms.resultTitle} numberOfLines={1}>{r.display_name.split(',')[0]}</Text>
                    <Text style={ms.resultSub} numberOfLines={1}>{r.display_name.split(',').slice(1).join(',').trim()}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Full-screen map — takes all remaining space */}
        <View style={{ flex: 1 }}>
          <WebView
            ref={webViewRef}
            source={{ html: buildLeafletHTML(initialLat, initialLng) }}
            style={{ flex: 1 }}
            onMessage={handleMapMessage}
            scrollEnabled={false}
            bounces={false}
            javaScriptEnabled
            domStorageEnabled
            startInLoadingState
            renderLoading={() => (
              <View style={ms.mapLoader}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            )}
          />
        </View>

        {/* Bottom action bar */}
        <View style={[ms.bottomBar, { paddingBottom: Math.max(insets.bottom + 8, 16) }]}>
          <TouchableOpacity
            style={ms.currentLocationBtn}
            onPress={useMyLocation}
            disabled={locating}
            activeOpacity={0.8}
          >
            {locating
              ? <ActivityIndicator size="small" color={colors.primary} />
              : <Ionicons name="locate" size={18} color={colors.primary} />}
            <Text style={ms.currentLocationText}>
              {locating ? 'Getting location…' : 'Use my current location'}
            </Text>
          </TouchableOpacity>

          {/* Coords + confirm row */}
          <View style={ms.confirmRow}>
            <View style={{ flex: 1 }}>
              <Text style={ms.coordText}>
                {pendingLat.toFixed(5)}, {pendingLng.toFixed(5)}
              </Text>
              <Text style={ms.hintText}>Tap map or drag pin to adjust</Text>
            </View>
            <TouchableOpacity
              style={ms.confirmBtn}
              onPress={() => onConfirm(pendingLat, pendingLng)}
              activeOpacity={0.85}
            >
              <Ionicons name="checkmark" size={20} color="#fff" />
              <Text style={ms.confirmText}>Confirm</Text>
            </TouchableOpacity>
          </View>

        </View>
      </View>
    </Modal>
  );
}

// ─────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────
export default function AddAddressScreen({ navigation }: any) {
  const [label, setLabel] = useState<LabelType>('HOME');
  const [line1, setLine1] = useState('');
  const [city, setCity] = useState('Pune');
  const [pincode, setPincode] = useState('');
  const [lat, setLat] = useState(DEFAULT_LAT);
  const [lng, setLng] = useState(DEFAULT_LNG);
  const [saving, setSaving] = useState(false);
  const [mapModalVisible, setMapModalVisible] = useState(false);
  const insets = useSafeAreaInsets();

  // Static preview WebView (non-interactive, just shows where the pin is)
  const previewRef = useRef<WebView>(null);

  const handleConfirmLocation = (newLat: number, newLng: number) => {
    setLat(newLat);
    setLng(newLng);
    setMapModalVisible(false);
    // Update the preview pin
    previewRef.current?.injectJavaScript(`window.updateMap(${newLat}, ${newLng}); true;`);
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.post('/customers/addresses', {
        label,
        line1,
        city,
        postalCode: pincode,
        latitude: lat,
        longitude: lng,
      });
      navigation.goBack();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : 'Failed to save address');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F8F8F8' }}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />

      {/* Header */}
      <View style={[s.hero, { paddingTop: Math.max(insets.top + 4, 16) }]}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={s.heroTitle}>Add New Address</Text>
          <Text style={s.heroSub}>Fill in your location details</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Label selector */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>ADDRESS TYPE</Text>
          <View style={s.labelRow}>
            {LABELS.map((l) => (
              <TouchableOpacity
                key={l}
                style={[s.labelBtn, label === l && s.labelBtnActive]}
                onPress={() => setLabel(l)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={labelIcon(l) as any}
                  size={16}
                  color={label === l ? colors.primary : colors.textSecondary}
                />
                <Text style={[s.labelText, label === l && s.labelTextActive]}>{l}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Map preview + picker ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>PIN YOUR LOCATION</Text>
          <View style={s.card}>

            {/* Static preview map */}
            <View style={s.previewWrap}>
              <WebView
                ref={previewRef}
                source={{ html: buildLeafletHTML(lat, lng) }}
                style={{ flex: 1 }}
                scrollEnabled={false}
                bounces={false}
                javaScriptEnabled
                domStorageEnabled
                // Disable all touches so scroll/zoom doesn't fight the ScrollView
                pointerEvents="none"
              />
              {/* Tap overlay — opens the full-screen modal */}
              <TouchableOpacity
                style={s.previewOverlay}
                onPress={() => setMapModalVisible(true)}
                activeOpacity={0.85}
              >
                <View style={s.editBadge}>
                  <Ionicons name="pencil" size={14} color="#fff" />
                  <Text style={s.editBadgeText}>Change Location</Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* Coordinates display */}
            <View style={s.coordPill}>
              <Ionicons name="location" size={14} color={colors.primary} />
              <Text style={s.coordPillText}>{lat.toFixed(5)}, {lng.toFixed(5)}</Text>
            </View>
          </View>
        </View>

        {/* Form fields */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>LOCATION DETAILS</Text>
          <View style={s.formCard}>
            <Input
              label="Address Line 1 *"
              value={line1}
              onChangeText={setLine1}
              placeholder="Flat 101, Building Name, Street"
            />
            <Input
              label="City *"
              value={city}
              onChangeText={setCity}
              placeholder="City"
            />
            <Input
              label="Pincode"
              value={pincode}
              onChangeText={setPincode}
              keyboardType="numeric"
              placeholder="411001"
            />
          </View>
        </View>

        <Btn
          title={saving ? 'Saving…' : 'Save Address'}
          onPress={save}
          loading={saving}
          disabled={!line1.trim()}
        />
      </ScrollView>

      {/* Full-screen interactive map modal */}
      <MapModal
        visible={mapModalVisible}
        initialLat={lat}
        initialLng={lng}
        onConfirm={handleConfirmLocation}
        onClose={() => setMapModalVisible(false)}
      />
    </View>
  );
}

// ─────────────────────────────────────────────
// Styles — main screen
// ─────────────────────────────────────────────
const s = StyleSheet.create({
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
  content: {
    padding: 16,
    gap: 4,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.8,
    marginBottom: 8,
    marginLeft: 4,
  },
  labelRow: {
    flexDirection: 'row',
    gap: 10,
  },
  labelBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: '#fff',
    ...shadow.sm,
  },
  labelBtnActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryBg,
  },
  labelText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  labelTextActive: {
    color: colors.primary,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },
  // ── Form card (has padding, no overflow hidden) ──
  formCard: {
    backgroundColor: '#fff',
    borderRadius: radius.md,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },
  // ── Map preview ──
  previewWrap: {
    height: 180,
    position: 'relative',
  },
  previewOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    padding: 10,
  },
  editBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    ...shadow.md,
  },
  editBadgeText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  coordPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  coordPillText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
});

// ─────────────────────────────────────────────
// Styles — map modal
// ─────────────────────────────────────────────
const ms = StyleSheet.create({
  header: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
  },
  searchContainer: {
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
    zIndex: 10,
    elevation: 4,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    height: 44,
    backgroundColor: '#fff',
    marginBottom: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
  },
  searchResults: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    marginBottom: 6,
    maxHeight: 220,
    ...shadow.md,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    gap: 8,
  },
  resultTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  resultSub: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  mapLoader: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
  },
  bottomBar: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    ...shadow.md,
  },
  currentLocationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 11,
    marginBottom: 10,
    backgroundColor: colors.primaryBg,
  },
  currentLocationText: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 14,
  },
  confirmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  coordText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  hintText: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: radius.md,
  },
  confirmText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
});
