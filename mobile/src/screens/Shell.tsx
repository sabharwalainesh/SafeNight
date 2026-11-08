import { useEffect, useRef, useState } from 'react';
import { Animated, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSpacetimeDB, useTable } from 'spacetimedb/react';
import { Avatar, Badge, Btn, Card, P, Row, tap } from '../components/ui';
import { inviteCodeFromUrl } from '../lib/invite';
import type { Persona } from '../personas';
import { C } from '../theme';
import { tables, useProfile, useSafety } from '../web';
import { InboxScreen } from './InboxScreen';
import { MapScreen } from './MapScreen';
import { NightOutScreen } from './NightOutScreen';
import { ProfileScreen } from './ProfileScreen';

type TabId = 'night' | 'map' | 'inbox' | 'profile';
const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'night', label: 'Tonight', icon: '◐' },
  { id: 'map', label: 'Map', icon: '◎' },
  { id: 'inbox', label: 'Alerts', icon: '✉' },
  { id: 'profile', label: 'You', icon: '●' },
];

function RuntimeStrip() {
  const [rows, ready] = useTable(tables.runtimeStatus);
  const st = rows[0];
  if (!ready || !st) return <Row><Badge>Loading backend status…</Badge></Row>;
  return (
    <Row>
      <Badge tone={st.nemotronMode === 'live' ? 'ok' : 'sim'}>Nemotron: {st.nemotronMode}</Badge>
      <Badge tone={st.messagingMode === 'live' ? 'ok' : 'sim'}>Messaging: {st.messagingMode}</Badge>
      <Badge>module {st.moduleVersion}</Badge>
    </Row>
  );
}

/** The deterministic no-driving warning plus other alert toasts (from the safety_alert event table). */
function Alerts({ onViewIncident }: { onViewIncident: (id: string) => void }) {
  const { alerts, dismissAlert } = useSafety();
  const driving = alerts.filter((a) => a.kind === 'no_driving_warning');
  const others = alerts.filter((a) => a.kind !== 'no_driving_warning');
  return (
    <>
      {driving.map((a) => (
        <View key={a.id} style={s.nodrive} accessibilityRole="alert">
          <Text style={s.nodriveTitle}>Do not drive</Text>
          <P>{a.message}</P>
          <Row>
            <Btn title="I won't drive" variant="secondary" onPress={() => dismissAlert(a.id)} />
            {a.incidentId ? <Btn title="View incident" variant="secondary" onPress={() => onViewIncident(a.incidentId)} /> : null}
          </Row>
        </View>
      ))}
      {others.slice(0, 4).map((a) => (
        <View key={a.id} style={s.toast}>
          <Text style={[s.toastText, { flex: 1 }]}>{a.message}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" onPress={() => dismissAlert(a.id)} hitSlop={10}>
            <Text style={s.toastX}>×</Text>
          </Pressable>
        </View>
      ))}
    </>
  );
}

export function Shell({ persona, host, dbName, onSwitch }: { persona: Persona; host: string; dbName: string; onSwitch: () => void }) {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<TabId>('night');
  const [details, setDetails] = useState(false);
  const [inboxTarget, setInboxTarget] = useState<{ id: string; n: number } | null>(null);
  const { isActive, identity, connectionError } = useSpacetimeDB();
  const conn = isActive ? 'connected' : connectionError ? 'disconnected' : 'connecting';
  const dot = conn === 'connected' ? C.ok : conn === 'connecting' ? C.warn : C.danger;
  const { photos, profile } = useProfile();
  const me = identity?.toHexString() ?? '';
  // Invite links: safenight://join?code=ABC123 (cold start or while running) open Tonight with the code filled in.
  const [joinCode, setJoinCode] = useState<string | undefined>();
  useEffect(() => {
    const handle = (url: string | null | undefined) => {
      const code = inviteCodeFromUrl(url);
      if (code) { setJoinCode(code); setTab('night'); }
    };
    void Linking.getInitialURL().then(handle).catch(() => undefined);
    const sub = Linking.addEventListener('url', (e) => handle(e.url));
    return () => sub.remove();
  }, []);
  // Gentle cross-fade between tabs.
  const fade = useRef(new Animated.Value(1)).current;
  const switchTab = (t: TabId) => {
    if (t === tab) return;
    tap('select');
    fade.setValue(0.4);
    setTab(t);
    Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: true }).start();
  };
  const openIncident = (id: string) => {
    setInboxTarget((p) => ({ id, n: (p?.n ?? 0) + 1 }));
    setTab('inbox');
  };

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.top}>
        <Text accessibilityRole="header" style={s.word}>{TABS.find(t => t.id === tab)?.label}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`${persona.name}, ${persona.roleHint}. ${conn}. Switch persona or server`} onPress={onSwitch} style={({ pressed }) => [s.chip, { opacity: pressed ? 0.6 : 1 }]}>
          <View>
            <Avatar uri={photos[me]} emoji={profile?.avatarEmoji} name={persona.name} size={36} />
            <View style={[s.dot, { backgroundColor: dot }]} />
          </View>
        </Pressable>
      </View>

      <Animated.ScrollView style={{ flex: 1, opacity: fade }} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
        <Alerts onViewIncident={openIncident} />

        {conn !== 'connected' && (
          <Card>
            <P>{conn === 'connecting' ? `Connecting to ${host}…` : `Disconnected from ${host}.`}</P>
            {connectionError && <P muted small>{connectionError.message}</P>}
            <P muted small>Phone and laptop must share a network, or point the app at Maincloud (tap your name to change the server).</P>
          </Card>
        )}
        {tab === 'night' && <NightOutScreen joinCode={joinCode} />}
        {tab === 'map' && <MapScreen />}
        {tab === 'inbox' && <InboxScreen key={inboxTarget?.n ?? 0} initialIncidentId={inboxTarget?.id} />}
        {tab === 'profile' && <ProfileScreen persona={persona} />}
        <Btn title={details ? 'Hide connection details' : 'Connection details'} variant="ghost" small style={{ alignSelf: 'center' }} onPress={() => setDetails(v => !v)} />
        {details && <Card><RuntimeStrip /><P muted small>Server {host} · database {dbName}</P><P muted small>Identity {identity?.toHexString().slice(0, 8) ?? conn}</P></Card>}
      </Animated.ScrollView>

      <View style={[s.tabbar, { paddingBottom: Math.max(insets.bottom, 8) }]} accessibilityRole="tablist">
        {TABS.map((t) => {
          const on = t.id === tab;
          return (
            <Pressable key={t.id} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => switchTab(t.id)} style={s.tab}>
              <Text style={[s.tabIcon, on && { color: C.accent }]}>{t.icon}</Text>
              <Text style={[s.tabLabel, on && { color: C.accent }]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  top: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  word: { color: C.text, fontSize: 34, fontWeight: '700', letterSpacing: 0.4 },
  chip: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', right: -1, bottom: -1, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: C.bg },
  chipText: { color: C.text, fontWeight: '700' },
  chipId: { color: C.muted, fontSize: 12, fontFamily: 'Menlo' },
  content: { paddingHorizontal: 16, paddingTop: 8, gap: 24, paddingBottom: 32 },
  tabbar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.separator, backgroundColor: 'rgba(22,22,24,0.96)', paddingTop: 6 },
  tab: { flex: 1, alignItems: 'center', minHeight: 50, justifyContent: 'center', gap: 2 },
  tabIcon: { color: C.faint, fontSize: 20 },
  tabLabel: { color: C.faint, fontSize: 10, fontWeight: '500' },
  nodrive: { backgroundColor: 'rgba(255,69,58,0.16)', borderRadius: 16, borderCurve: 'continuous', padding: 16, gap: 8 },
  nodriveTitle: { color: C.danger, fontSize: 20, fontWeight: '700' },
  toast: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.surface, borderRadius: 14, borderCurve: 'continuous', paddingVertical: 12, paddingHorizontal: 14 },
  toastText: { color: C.text },
  toastX: { color: C.muted, fontSize: 22, paddingHorizontal: 6 },
});
