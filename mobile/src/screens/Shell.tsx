import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSpacetimeDB, useTable } from 'spacetimedb/react';
import { Badge, Btn, Card, P, Row } from '../components/ui';
import type { Persona } from '../personas';
import { C } from '../theme';
import { tables, useSafety } from '../web';
import { InboxScreen } from './InboxScreen';
import { MapScreen } from './MapScreen';
import { NightOutScreen } from './NightOutScreen';
import { ProfileScreen } from './ProfileScreen';

type TabId = 'night' | 'map' | 'inbox' | 'profile';
const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'night', label: 'Night Out', icon: '◐' },
  { id: 'map', label: 'Map', icon: '◎' },
  { id: 'inbox', label: 'Inbox', icon: '✉' },
  { id: 'profile', label: 'Profile', icon: '●' },
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
  const [inboxTarget, setInboxTarget] = useState<{ id: string; n: number } | null>(null);
  const { isActive, identity, connectionError } = useSpacetimeDB();
  const conn = isActive ? 'connected' : connectionError ? 'disconnected' : 'connecting';
  const dot = conn === 'connected' ? C.ok : conn === 'connecting' ? C.warn : C.danger;
  const openIncident = (id: string) => {
    setInboxTarget((p) => ({ id, n: (p?.n ?? 0) + 1 }));
    setTab('inbox');
  };

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.top}>
        <Text style={s.word}>SafeNight</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`${persona.name}, ${persona.roleHint}. ${conn}. Switch persona or server`} onPress={onSwitch} style={[s.chip, { borderColor: persona.accent }]}>
          <View style={[s.dot, { backgroundColor: dot }]} />
          <Text style={s.chipText}>{persona.name}</Text>
          <Text style={s.chipId}>{identity?.toHexString().slice(0, 8) ?? conn}</Text>
        </Pressable>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Alerts onViewIncident={openIncident} />
        <RuntimeStrip />
        {conn !== 'connected' && (
          <Card>
            <P>{conn === 'connecting' ? `Connecting to ${host}…` : `Disconnected from ${host}.`}</P>
            {connectionError && <P muted small>{connectionError.message}</P>}
            <P muted small>Phone and laptop must share a network, or point the app at Maincloud (tap your name to change the server).</P>
          </Card>
        )}
        {tab === 'night' && <NightOutScreen />}
        {tab === 'map' && <MapScreen />}
        {tab === 'inbox' && <InboxScreen key={inboxTarget?.n ?? 0} initialIncidentId={inboxTarget?.id} />}
        {tab === 'profile' && <ProfileScreen persona={persona} />}
        <P muted small>Server {host} · database {dbName}</P>
      </ScrollView>

      <View style={[s.tabbar, { paddingBottom: Math.max(insets.bottom, 8) }]} accessibilityRole="tablist">
        {TABS.map((t) => {
          const on = t.id === tab;
          return (
            <Pressable key={t.id} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => setTab(t.id)} style={s.tab}>
              <Text style={[s.tabIcon, on && { color: persona.accent }]}>{t.icon}</Text>
              <Text style={[s.tabLabel, on && { color: C.text }]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  word: { color: C.text, fontSize: 18, fontWeight: '800', letterSpacing: 0.4 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 10, minHeight: 36 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  chipText: { color: C.text, fontWeight: '700' },
  chipId: { color: C.muted, fontSize: 12, fontFamily: 'Menlo' },
  content: { padding: 12, gap: 12, paddingBottom: 24 },
  tabbar: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.surface, paddingTop: 6 },
  tab: { flex: 1, alignItems: 'center', minHeight: 48, justifyContent: 'center' },
  tabIcon: { color: C.muted, fontSize: 18 },
  tabLabel: { color: C.muted, fontSize: 11, fontWeight: '600' },
  nodrive: { backgroundColor: '#3a1818', borderColor: C.danger, borderWidth: 2, borderRadius: 14, padding: 14, gap: 8 },
  nodriveTitle: { color: C.danger, fontSize: 18, fontWeight: '800' },
  toast: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.surface2, borderColor: C.border, borderWidth: 1, borderRadius: 12, padding: 10 },
  toastText: { color: C.text },
  toastX: { color: C.muted, fontSize: 22, paddingHorizontal: 6 },
});
