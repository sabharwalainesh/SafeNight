import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Badge, Btn, Card, H2, P, Row } from '../components/ui';
import { ago } from '../lib/format';
import { C } from '../theme';
import { INCIDENT_STATUS_LABELS, useSafety, type AlertKind } from '../web';
import { IncidentScreen, KIND_LABELS } from './IncidentScreen';

const ALERT_LABELS: Record<AlertKind, string> = {
  no_driving_warning: 'Driving warning',
  help_requested: 'Help requested',
  ack_requested: 'Acknowledgment requested',
  incident_update: 'Incident update',
};
const CLOSED = ['resolved', 'cancelled', 'handed_off'];

export function InboxScreen({ initialIncidentId }: { initialIncidentId?: string }) {
  const { me, alerts, incidents, dismissAlert } = useSafety();
  const [openId, setOpenId] = useState<string | null>(initialIncidentId ?? null);
  if (openId) return <IncidentScreen incidentId={openId} onBack={() => setOpenId(null)} />;
  const sorted = [...alerts].sort((a, b) => b.at - a.at);
  const active = incidents.filter((i) => !CLOSED.includes(i.status));
  const closed = incidents.filter((i) => CLOSED.includes(i.status));
  return (
    <View style={{ gap: 12 }}>
      <Card>
        <H2>Alerts</H2>
        {sorted.length === 0 ? <P muted>No alerts.</P> : sorted.map((a) => (
          <View key={a.id} style={{ gap: 4, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 8 }}>
            <P style={{ fontWeight: '700' }}>{ALERT_LABELS[a.kind]}</P>
            <P>{a.message}</P>
            <P muted small>{ago(a.at)}</P>
            <Row>
              {!!a.incidentId && <Btn title="Open incident" small onPress={() => setOpenId(a.incidentId)} />}
              <Btn title="Dismiss" small variant="secondary" onPress={() => dismissAlert(a.id)} />
            </Row>
          </View>
        ))}
      </Card>
      <Card>
        <H2>Incidents</H2>
        {incidents.length === 0 ? <P muted>No incidents.</P> : [...active, ...closed].map((i) => {
          const needs = i.status === 'open' && i.participants.some((p) => p.userId === me && p.role !== 'subject' && p.acknowledgedAt === null);
          return (
            <Pressable key={i.id} accessibilityRole="button" onPress={() => setOpenId(i.id)} style={{ borderTopWidth: 1, borderTopColor: C.border, paddingVertical: 10, gap: 4 }}>
              <Text style={{ color: C.text, fontWeight: '700', fontSize: 16 }}>{i.subjectName} <Text style={{ color: C.muted, fontWeight: '400', fontSize: 13 }}>· {KIND_LABELS[i.kind] ?? i.kind} · {ago(i.openedAt)}</Text></Text>
              <Row><Badge>{INCIDENT_STATUS_LABELS[i.status]}</Badge>{needs && <Badge tone="warn">Needs your acknowledgment</Badge>}</Row>
            </Pressable>
          );
        })}
      </Card>
    </View>
  );
}
