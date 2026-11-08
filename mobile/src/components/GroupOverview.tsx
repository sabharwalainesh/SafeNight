import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import type { VisibleLocation } from '../web';
import { C } from '../theme';
import { Avatar, Btn, P } from './ui';

/** Relative position view of already-authorized coordinates; deliberately not a street map or route. */
export function GroupOverview({ points, selected, onSelect, photos = {} }: { points: VisibleLocation[]; selected: string | null; onSelect: (id: string) => void; photos?: Record<string, string> }) {
  const progress = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(true);
  const [width, setWidth] = useState(280);
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(v => { if (mounted) setReduceMotion(v); });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { mounted = false; sub.remove(); progress.stopAnimation(); };
  }, [progress]);
  const latitudes = points.map(p => p.lat);
  const longitudes = points.map(p => p.lng);
  const centerLat = points.length ? (Math.min(...latitudes) + Math.max(...latitudes)) / 2 : 0;
  const centerLng = points.length ? (Math.min(...longitudes) + Math.max(...longitudes)) / 2 : 0;
  const cos = Math.cos(centerLat * Math.PI / 180);
  const span = Math.max(0.001, (Math.max(...latitudes) - Math.min(...latitudes)), (Math.max(...longitudes) - Math.min(...longitudes)) * cos);
  const find = () => {
    progress.stopAnimation(); progress.setValue(0);
    if (!reduceMotion) Animated.timing(progress, { toValue: 1, duration: 1100, useNativeDriver: true }).start();
  };
  return (
    <View style={{ gap: 12 }}>
      <View style={s.canvas} onLayout={e => setWidth(e.nativeEvent.layout.width)}>
        <View style={s.vertical} /><View style={s.horizontal} />
        <Text style={s.north}>N ↑</Text>
        {!reduceMotion && <Animated.View pointerEvents="none" style={[s.ring, { opacity: progress.interpolate({ inputRange: [0, .2, 1], outputRange: [0, .7, 0] }), transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [.2, 6] }) }] }]} />}
        {points.map((p, i) => {
          const scale = Math.min(width - 100, 150) / span;
          return <Pressable key={p.userId} accessibilityRole="button" accessibilityLabel={`Focus ${p.displayName}${p.isStale ? ', stale location' : ''}`} accessibilityState={{ selected: selected === p.userId }} onPress={() => onSelect(p.userId)} style={[s.pin, { left: width / 2 + (p.lng - centerLng) * cos * scale - 24, top: 108 - (p.lat - centerLat) * scale - 24, zIndex: selected === p.userId ? 100 : i }]}>
            <View style={[s.avatar, selected === p.userId && s.selected, p.isStale && { borderStyle: 'dashed', borderColor: C.warn }]}><Avatar uri={photos[p.userId]} name={p.displayName} size={38} /></View>
            <Text numberOfLines={1} style={s.name}>{p.displayName}</Text>
          </Pressable>;
        })}
        {!points.length && <Text style={s.empty}>Shared locations will appear here</Text>}
      </View>
      <P muted small>Relative group positions · not a street map or route. Select a person below when markers overlap.</P>
      <Btn title="Find my group" variant="secondary" disabled={!points.length} onPress={find} />
    </View>
  );
}
const s = StyleSheet.create({
  canvas: { height: 240, backgroundColor: '#0d0d0f', borderRadius: 14, borderCurve: 'continuous', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  vertical: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: C.separator },
  horizontal: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: C.separator },
  north: { position: 'absolute', right: 14, top: 12, color: C.muted, fontSize: 12 },
  pin: { position: 'absolute', width: 48, minHeight: 64, alignItems: 'center' },
  avatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: C.surface, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
  selected: { borderColor: C.accent },
  initial: { color: C.text, fontSize: 18, fontWeight: '700' },
  name: { color: C.text, backgroundColor: 'rgba(28,28,30,0.85)', fontSize: 12, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, overflow: 'hidden', maxWidth: 90, marginTop: 2 },
  ring: { position: 'absolute', width: 80, height: 80, borderRadius: 40, borderWidth: 2, borderColor: C.accent },
  empty: { color: C.muted, fontSize: 13, backgroundColor: C.bg, padding: 8 },
});
