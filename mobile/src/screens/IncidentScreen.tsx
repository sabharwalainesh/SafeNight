import { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { Badge, Btn, Card, Confirm, Feedback, Field, H2, H3, Input, P, Row, type Msg } from '../components/ui';
import { ago, clock, errText, humanize, mmss } from '../lib/format';
import { C } from '../theme';
import { DELIVERY_LABELS, INCIDENT_STATUS_LABELS, JOB_STATUS_LABELS, RIDE_STATUS_LABELS, useAgent, useNightOut, useSafety, type ActionStatus, type IncidentEvent, type RideStatus } from '../web';

export const KIND_LABELS: Record<string, string> = {
  possible_impaired_driving: 'Possible impaired driving',
  help_requested: 'Help requested',
  missed_checkin: 'Missed check-in',
  feeling_unsafe: 'Feeling unsafe',
};
const EVENT_TEXT: Record<string, string> = { opened: 'opened this incident', acknowledged: 'acknowledged', subject_says_fine: 'says they are fine', resolved: 'resolved this incident', cancelled: 'cancelled this incident' };
const eventText = (e: IncidentEvent) => { const base = EVENT_TEXT[e.kind] ?? e.kind.replace(/_/g, ' '); return e.detail ? `${base}: ${e.detail}` : base; };
const TIERS = ['Primary buddy', 'Backup buddy', 'Handed off to organizer'];
const ACTION_LABELS: Record<ActionStatus, string> = { proposed: 'Proposed', rejected: 'Rejected', executed: 'Executed', failed: 'Failed', delivered: 'Delivered', acknowledged: 'Acknowledged' };
const STEPS: RideStatus[] = ['proposed', 'accepted', 'booked_by_user', 'pickup_confirmed', 'completed'];
const SAFE_HOSTS = ['m.uber.com', 'uber.com', 'www.uber.com', 'lyft.com', 'www.lyft.com', 'ride.lyft.com'];
function safeRideLink(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol === 'uber:' || u.protocol === 'lyft:') return u.href;
    if (u.protocol === 'https:' && SAFE_HOSTS.includes(u.hostname)) return u.href;
    if (u.protocol === 'https:' && u.hostname === 'www.google.com' && u.pathname.startsWith('/maps/')) return u.href;
  } catch { /* unparseable */ }
  return null;
}
const Sim = () => <Badge tone="sim">SIMULATED</Badge>;

function AgentPanel({ incidentId }: { incidentId: string }) {
  const agent = useAgent();
  const job = agent.jobForIncident(incidentId);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const due = job?.followupDueAt ?? null;
  useEffect(() => { if (due === null) return; setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [due]);
  if (!job) return null;
  const plan = agent.latestPlan(job.id);
  const receipts = agent.receipts(job.id);
  const notes = agent.notifications(incidentId);
  const pending = [...notes].reverse().find((n) => n.status !== 'acknowledged');
  const waitingName = notes.find((n) => n.recipient === job.followupExpectedFrom)?.recipientName ?? 'a buddy';
  const isMine = job.followupExpectedFrom === agent.me || (job.followupExpectedFrom === null && pending?.recipient === agent.me);
  const canAct = isMine && (job.status === 'waiting_for_ack' || job.status === 'escalated');
  async function run(fn: () => Promise<void>, done: string) {
    setBusy(true); setMsg(null);
    try { await fn(); setMsg({ ok: true, text: done }); setDeclining(false); setReason(''); }
    catch (e) { setMsg({ ok: false, text: errText(e, 'That did not go through. Try again.') }); } finally { setBusy(false); }
  }
  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}><H2>SafeNight agent</H2><Badge tone="accent">{JOB_STATUS_LABELS[job.status]}</Badge></Row>
      <P muted small>{TIERS[job.escalationTier] ?? TIERS[0]}{plan ? ` · model ${plan.model}` : ''}{plan?.simulated ? ' · SIMULATED planner' : ''}</P>
      {due !== null && <P style={{ color: C.warn, fontWeight: '700' }}>Waiting on {waitingName} — follow-up in {mmss(due - now)}</P>}
      {plan && (
        <View style={{ gap: 4 }}>
          <Row><H3>Plan v{plan.version}</H3>{plan.version > 1 && <Badge>Plan updated</Badge>}{plan.simulated && <Sim />}</Row>
          <P>{plan.summary}</P>
          {plan.steps.map((st, i) => <P key={i} small>{i + 1}. <Text style={{ fontWeight: '700' }}>{st.title}</Text>{st.detail ? <Text style={{ color: C.muted }}> — {st.detail}</Text> : null}</P>)}
        </View>
      )}
      <H3>Receipts ({receipts.length})</H3>
      {receipts.length === 0 ? <P muted small>No actions yet.</P> : receipts.map((r) => {
        const policy = r.resultText.startsWith('Policy:');
        return (
          <View key={r.id} style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.separator, paddingTop: 6, gap: 2 }}>
            <Row><P style={{ fontWeight: '700' }}>{humanize(r.tool)}</P><Badge tone={r.status === 'rejected' || r.status === 'failed' ? 'danger' : 'ok'}>{ACTION_LABELS[r.status]}</Badge>{policy && <Badge tone="policy">Policy</Badge>}{r.simulated && <Sim />}<P muted small>{clock(r.at)}</P></Row>
            {!!r.resultText && <P small>{r.resultText}</P>}
            {r.status === 'rejected' && !!r.rejectReason && <P small style={{ color: C.danger }}>Blocked: {r.rejectReason}</P>}
          </View>
        );
      })}
      <H3>Messages</H3>
      {notes.length === 0 ? <P muted small>No messages yet.</P> : notes.map((n) => (
        <View key={n.id} style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.separator, paddingTop: 6, gap: 2 }}>
          <Row><P style={{ fontWeight: '700' }}>{n.recipientName}</P><P muted small>{n.channel.replace('_', '-')}</P><Badge tone={n.status === 'acknowledged' ? 'ok' : n.status === 'failed' ? 'danger' : 'default'}>{DELIVERY_LABELS[n.status]}</Badge>{n.simulated && <Sim />}</Row>
          <P small>{n.body}</P>
        </View>
      ))}
      {canAct && (
        <View style={{ gap: 8 }}>
          <H3>Your help is requested</H3>
          <Row>
            <Btn title="I'm on it" busy={busy} onPress={() => void run(() => agent.actions.acknowledgeAssistance(job.id), 'You told the group you are on it.')} />
            <Btn title="I can't help" variant="secondary" disabled={busy} onPress={() => setDeclining((d) => !d)} />
          </Row>
          {declining && (<>
            <Field label="Reason (optional)"><Input value={reason} onChangeText={setReason} /></Field>
            <Btn title="Send decline" variant="secondary" busy={busy} onPress={() => void run(() => agent.actions.declineAssistance(job.id, reason.trim()), 'You said you cannot help. The next contact will be asked.')} />
          </>)}
        </View>
      )}
      <Feedback msg={msg} />
    </Card>
  );
}

function RidePanel({ incidentId }: { incidentId: string }) {
  const { ridePlan, actions } = useAgent();
  const plan = ridePlan(incidentId);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  if (!plan) return null;
  const run = async (fn: () => Promise<void>) => { setBusy(true); setMsg(null); try { await fn(); } catch (e) { setMsg({ ok: false, text: errText(e, 'That did not work.') }); } finally { setBusy(false); } };
  const idx = STEPS.indexOf(plan.status);
  return (
    <Card>
      <H2>Ride for {plan.riderName}</H2>
      {plan.status === 'cancelled' ? <P>{RIDE_STATUS_LABELS.cancelled}</P> : (
        <Row>{STEPS.map((st, i) => <Badge key={st} tone={i < idx ? 'ok' : i === idx ? 'accent' : 'default'}>{RIDE_STATUS_LABELS[st]}</Badge>)}</Row>
      )}
      {(plan.status === 'proposed' || plan.status === 'accepted') && plan.options.map((o) => {
        const chosen = plan.chosenOption === o.id;
        const link = safeRideLink(o.url);
        return (
          <View key={o.id} style={{ borderRadius: 12, borderCurve: 'continuous', backgroundColor: chosen ? 'rgba(10,132,255,0.16)' : C.surface2, padding: 12, gap: 4 }}>
            <Row><P style={{ fontWeight: '700' }}>{o.label}</P><P muted small>{o.kind.replace(/_/g, ' ')}</P>{o.simulated && <Sim />}{chosen && <Badge tone="accent">Chosen</Badge>}</Row>
            <P muted small>{o.etaMinutes !== null ? `ETA ${o.etaMinutes} min · ` : ''}{o.source}, fetched {ago(o.fetchedAt)}</P>
            <Row>
              {link && <Btn title="Open in app" small variant="secondary" onPress={() => void Linking.openURL(link).catch(() => setMsg({ ok: false, text: 'Could not open that link on this phone.' }))} />}
              {plan.status === 'proposed' && <Btn title="Choose this" small busy={busy} onPress={() => void run(() => actions.acceptRideOption(plan.id, o.id))} />}
            </Row>
          </View>
        );
      })}
      {plan.status === 'accepted' && (<><P muted small>SafeNight never books or pays. Book it yourself, then confirm.</P><Btn title="I booked this" busy={busy} onPress={() => void run(() => actions.confirmRideBooked(plan.id))} /></>)}
      {plan.status === 'booked_by_user' && <Btn title="Confirm pickup" busy={busy} onPress={() => void run(() => actions.confirmPickup(plan.id))} />}
      <Feedback msg={msg} />
    </Card>
  );
}

function HomeConfirm({ incidentId }: { incidentId: string }) {
  const { me, incidents } = useSafety();
  const { actions } = useAgent();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const inc = incidents.find((i) => i.id === incidentId);
  if (!inc) return null;
  const isSubject = inc.subject === me;
  if (inc.status === 'resolved') return inc.resolvedBy === inc.subject ? <P style={{ color: C.ok, fontWeight: '700' }}>Confirmed home by {inc.subjectName}</P> : null;
  if (!isSubject) return inc.status === 'awaiting_home_confirmation' ? <P muted small>Waiting for {inc.subjectName} to confirm they're home. Location or a ride ending is not confirmation.</P> : null;
  if (!['transport_arranged', 'awaiting_home_confirmation', 'assistance_underway'].includes(inc.status)) return null;
  const go = async () => { setBusy(true); setMsg(null); try { await actions.confirmHome(incidentId); setConfirming(false); } catch (e) { setMsg({ ok: false, text: errText(e, 'That did not work.') }); } finally { setBusy(false); } };
  return (
    <View style={{ gap: 8 }}>
      {!confirming ? <Btn title="I'm home safe" onPress={() => setConfirming(true)} /> : (<>
        <P>Confirm you are home and safe? This closes the incident for everyone.</P>
        <Row><Btn title="Yes, I'm home" busy={busy} onPress={() => void go()} /><Btn title="Not yet" variant="secondary" disabled={busy} onPress={() => setConfirming(false)} /></Row>
      </>)}
      <Feedback msg={msg} />
    </View>
  );
}

export function IncidentScreen({ incidentId, onBack }: { incidentId: string; onBack: () => void }) {
  const { me, incidents, timeline, actions } = useSafety();
  const { myConsents } = useNightOut();
  const incident = incidents.find((i) => i.id === incidentId) ?? null;
  const events = timeline(incidentId);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [mode, setMode] = useState<'none' | 'resolve' | 'cancel'>('none');
  const [text, setText] = useState('');
  const [confirming, setConfirming] = useState(false);
  const mine = incident?.participants.find((p) => p.userId === me);
  if (!incident || (events.length === 0 && !mine)) return <Card><Btn title="← Back" variant="ghost" small onPress={onBack} style={{ alignSelf: 'flex-start' }} /><P>You are not part of this incident</P></Card>;
  const isSubject = incident.subject === me;
  const closed = ['resolved', 'cancelled', 'handed_off'].includes(incident.status);
  const canAck = !!mine && mine.role !== 'subject' && mine.acknowledgedAt === null && incident.status === 'open';
  const now = Date.now();
  const hasGrant = (scope: string) => myConsents.some((c) => c.subject === incident.subject && c.recipient === me && c.revokedAt === null && c.expiresAt > now && c.sessionId === incident.sessionId && c.scope === scope);
  const canResolve = isSubject || (!!mine && (mine.role === 'organizer' || mine.role === 'buddy') && hasGrant('messaging') && hasGrant('checkins'));
  const canCancel = isSubject && !closed && now - incident.openedAt <= 120_000;
  const resolvedByName = incident.resolvedBy ? (incident.participants.find((p) => p.userId === incident.resolvedBy)?.displayName ?? incident.resolvedBy.slice(0, 8)) : null;
  async function run(fn: () => Promise<void>) { setBusy(true); setMsg(null); try { await fn(); setMode('none'); setText(''); setConfirming(false); } catch (e) { setMsg({ ok: false, text: errText(e, 'Action failed') }); } finally { setBusy(false); } }
  return (
    <View style={{ gap: 24 }}>
      <Card>
        <Btn title="← Back" variant="ghost" small onPress={onBack} style={{ alignSelf: 'flex-start' }} />
        <H2>{KIND_LABELS[incident.kind] ?? incident.kind}</H2>
        <P style={{ fontWeight: '700' }}>{incident.subjectName}</P>
        <Row><Badge tone={incident.severity === 'urgent' ? 'danger' : incident.severity === 'elevated' ? 'warn' : 'default'}>{incident.severity}</Badge><Badge tone="accent">{INCIDENT_STATUS_LABELS[incident.status]}</Badge></Row>
        <P muted small>Opened {ago(incident.openedAt)}</P>
        {incident.status === 'resolved' && resolvedByName && <P style={{ color: C.ok, fontWeight: '700' }}>Resolved by {resolvedByName}</P>}
        <HomeConfirm incidentId={incident.id} />
      </Card>
      <Card>
        <H2>Participants</H2>
        {incident.participants.map((p) => (
          <Row key={p.userId} style={{ justifyContent: 'space-between' }}>
            <P><Text style={{ fontWeight: '700' }}>{p.displayName}</Text> <Text style={{ color: C.muted }}>({p.role})</Text></P>
            <P muted small>{p.acknowledgedAt !== null ? `Acknowledged ${ago(p.acknowledgedAt)}` : 'Not yet acknowledged'}</P>
          </Row>
        ))}
        <Feedback msg={msg} />
        {!closed && mode === 'none' && (
          <Row>
            {canAck && <Btn title="Acknowledge" busy={busy} onPress={() => void run(() => actions.acknowledgeIncident(incident.id))} />}
            {canResolve && <Btn title={isSubject ? "I'm safe — resolve" : 'Resolve'} variant="secondary" disabled={busy} onPress={() => { setMode('resolve'); setText(''); setConfirming(false); }} />}
            {canCancel && <Btn title="Cancel incident" variant="ghost" disabled={busy} onPress={() => { setMode('cancel'); setText(''); }} />}
          </Row>
        )}
        {mode === 'resolve' && (<>
          <Field label="Short note (required)"><Input value={text} maxLength={200} onChangeText={(t) => { setText(t); setConfirming(false); }} /></Field>
          <Confirm show={confirming} busy={busy} text={isSubject ? 'Confirm you are safe and want to close this incident?' : 'Confirm you want to resolve this incident?'} label="Yes, resolve" onYes={() => void run(() => actions.resolveIncident(incident.id, text.trim()))} onCancel={() => setConfirming(false)} />
          {!confirming && <Row><Btn title="Continue" disabled={busy || !text.trim()} onPress={() => setConfirming(true)} /><Btn title="Back" variant="secondary" onPress={() => setMode('none')} /></Row>}
        </>)}
        {mode === 'cancel' && (<>
          <Field label="Reason for cancelling"><Input value={text} maxLength={200} onChangeText={setText} /></Field>
          <Row><Btn title="Cancel incident" variant="danger" disabled={busy || !text.trim()} onPress={() => void run(() => actions.cancelIncident(incident.id, text.trim()))} /><Btn title="Back" variant="secondary" onPress={() => setMode('none')} /></Row>
        </>)}
      </Card>
      <AgentPanel incidentId={incident.id} />
      <RidePanel incidentId={incident.id} />
      <Card>
        <H2>Timeline</H2>
        {events.length === 0 ? <P muted>No events yet.</P> : events.map((e) => (
          <P key={e.id} small><Text style={{ color: C.muted }}>{clock(e.at)}</Text> <Text style={{ fontWeight: '700' }}>{e.actorName}</Text> {eventText(e)}{e.simulated ? ' · SIMULATED' : ''}</P>
        ))}
      </Card>
    </View>
  );
}
