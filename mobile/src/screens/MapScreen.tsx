import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar, Badge, Btn, Card, Feedback, Field, H2, H3, HoldButton, Input, P, Row, Section, Toggle, tap, type Msg } from '../components/ui';
import { ago, errText } from '../lib/format';
import { PERSONAS } from '../personas';
import { C } from '../theme';
import { GroupOverview } from '../components/GroupOverview';
import { CHECKIN_LABELS, SAFETY_NOTE, useNightOut, useProfile, useSafety, type CheckinKind, type ConcernCategory, type ConsumptionLevel, type VisibleLocation } from '../web';

const CENTER = { lat: 32.7842, lng: -96.7805 }; // Deep Ellum, Dallas (demo venue)
const QUICK: CheckinKind[] = ['okay', 'need_friend', 'need_ride', 'unwell'];
const CATEGORIES: { value: ConcernCategory; label: string }[] = [
  { value: 'possible_consumption', label: 'May have been drinking' },
  { value: 'separated', label: 'Got separated' },
  { value: 'unwell', label: 'Seems unwell' },
  { value: 'unsafe', label: 'Feels unsafe' },
];
const LEVELS: { value: ConsumptionLevel; label: string }[] = [
  { value: 'none', label: 'Not drinking' },
  { value: 'some', label: 'Had some' },
  { value: 'impaired_feeling', label: 'Feeling impaired' },
];

function colorOf(displayName: string): string {
  return PERSONAS.find((p) => p.name.toLowerCase() === displayName.trim().toLowerCase())?.accent ?? C.muted;
}

function RadioList<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View accessibilityRole="radiogroup">
      {options.map((o) => (
        <Pressable key={o.value} accessibilityRole="radio" accessibilityState={{ checked: value === o.value }} onPress={() => { tap('select'); onChange(o.value); }} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, opacity: pressed ? 0.6 : 1 })}>
          <P style={{ flex: 1 }}>{o.label}</P>
          <Text style={{ color: C.accent, fontSize: 18, fontWeight: '600', width: 20 }}>{value === o.value ? '✓' : ''}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function ConcernSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { me, sessionId, actions } = useSafety();
  const nightOut = useNightOut();
  const others = (sessionId ? (nightOut.roster(sessionId)?.members ?? []) : []).filter((m) => m.leftAt === null && m.userId !== me);
  const [who, setWho] = useState('');
  const [cat, setCat] = useState<ConcernCategory>('possible_consumption');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<Msg>(null);
  const [level, setLevel] = useState<ConsumptionLevel>('none');
  const [share, setShare] = useState(false);
  const [selfMsg, setSelfMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setMsg(null); setSelfMsg(null); } }, [open]);

  async function submit() {
    if (!who) return setMsg({ ok: false, text: 'Choose who you are concerned about.' });
    setBusy(true);
    try {
      await actions.reportConcern(who, cat, note.trim());
      setMsg({ ok: true, text: 'Concern sent to the people who can help.' });
      setNote('');
    } catch (e) { setMsg({ ok: false, text: errText(e, 'Could not send.') }); } finally { setBusy(false); }
  }
  async function submitSelf() {
    setBusy(true);
    try { await actions.reportConsumption(level, share); setSelfMsg({ ok: true, text: 'Saved privately.' }); }
    catch (e) { setSelfMsg({ ok: false, text: errText(e, 'Could not save.') }); } finally { setBusy(false); }
  }

  return (
    <Modal visible={open} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24, gap: 14 }} keyboardShouldPersistTaps="handled">
        <H2>Report a concern</H2>
        <Card>
          <Field label="Who">
            {others.length === 0 ? <P muted small>Nobody else is in this Night Out.</P> : (
              <Row>{others.map((m) => (
                <Pressable key={m.userId} accessibilityRole="radio" accessibilityState={{ checked: who === m.userId }} onPress={() => setWho(m.userId)} style={{ backgroundColor: who === m.userId ? C.accent : C.fill, borderRadius: 999, paddingHorizontal: 16, minHeight: 40, justifyContent: 'center' }}>
                  <Text style={{ color: C.text, fontWeight: '600' }}>{m.displayName}</Text>
                </Pressable>
              ))}</Row>
            )}
          </Field>
          <Field label="What is the concern?"><RadioList options={CATEGORIES} value={cat} onChange={setCat} /></Field>
          <Field label={`Note (optional) ${note.length}/200`}><Input value={note} onChangeText={(t) => setNote(t.slice(0, 200))} multiline style={{ minHeight: 70, paddingTop: 10 }} /></Field>
          <Feedback msg={msg} />
          <Btn title="Send concern" busy={busy} onPress={() => void submit()} />
        </Card>
        <Card>
          <H3>About me (private)</H3>
          <P muted small>Your answer stays private. If you are tonight's accepted driver and say you have had some, you get a private reminder not to drive. The group is told only if you tick "Share with my buddies".</P>
          <RadioList options={LEVELS} value={level} onChange={setLevel} />
          <Toggle label="Share with my buddies" checked={share} onChange={() => setShare((v) => !v)} />
          <Feedback msg={selfMsg} />
          <Btn title="Save privately" variant="secondary" busy={busy} onPress={() => void submitSelf()} />
        </Card>
        <Btn title="Done" variant="ghost" onPress={onClose} />
      </ScrollView>
    </Modal>
  );
}

function StatusBar() {
  const { sessionId, me, incidents, actions } = useSafety();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [sheet, setSheet] = useState(false);
  if (!sessionId) return null;
  async function send(kind: CheckinKind) {
    setBusy(true); setMsg(null);
    try {
      await actions.checkIn(kind, '');
      const openMine = incidents.some((i) => i.subject === me && i.status !== 'resolved' && i.status !== 'cancelled');
      setMsg({ ok: true, text: `Sent: ${CHECKIN_LABELS[kind]}.${kind === 'okay' && openMine ? ' Recorded. Your open alert stays open until someone confirms you are safe.' : ''}` });
    } catch (e) { setMsg({ ok: false, text: errText(e, 'Could not send. Try again.') }); } finally { setBusy(false); }
  }
  return (
    <Section header="How are you?" footer={`Hold for 1.5 seconds to alert your group. ${SAFETY_NOTE}`}>
      <Row>
        {QUICK.map((k) => <Btn key={k} title={CHECKIN_LABELS[k]} small variant="secondary" disabled={busy} onPress={() => void send(k)} />)}
        <Btn title={CHECKIN_LABELS.home} small variant="secondary" disabled={busy} onPress={() => void send('home')} />
        <Btn title="Report a concern" small variant="ghost" onPress={() => setSheet(true)} />
      </Row>
      <HoldButton label="Hold for Emergency" disabled={busy} onConfirm={() => void send('emergency')} />
      <Feedback msg={msg} />
      <ConcernSheet open={sheet} onClose={() => setSheet(false)} />
    </Section>
  );
}

export function MapScreen() {
  const safety = useSafety();
  const { photos } = useProfile();
  const [selected, setSelected] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const post = async () => {
    setMsg(null);
    const j = () => (Math.random() * 2 - 1) * 0.004;
    try { await safety.actions.postLocation(CENTER.lat + j(), CENTER.lng + j(), 25, 'simulated'); }
    catch (e) { setMsg({ ok: false, text: errText(e, 'Could not post location') }); }
  };
  const points: VisibleLocation[] = [...(safety.myLocation ? [safety.myLocation] : []), ...safety.locations];
  const nameOf = (p: VisibleLocation) => (p.userId === safety.me ? `${p.displayName} (you)` : p.displayName);
  return (
    <View style={{ gap: 28 }}>
      <StatusBar />
      <Card>
        <Row style={{ justifyContent: 'space-between' }}><H2>Your group</H2><Badge tone="sim">SIMULATED</Badge></Row>
        {!safety.sessionId ? (
          <P muted>You are not in a Night Out yet. Start or join one in the Night Out tab to see your group here.</P>
        ) : (<>
          <GroupOverview points={points} selected={selected} onSelect={setSelected} photos={photos} />
          <Btn title="Post simulated location" variant="ghost" small onPress={() => void post()} />
          <Feedback msg={msg} />
          {safety.locations.length === 0 && <P muted small>Nobody is sharing their location with you yet. People appear here only after they turn on sharing and give you consent in the Night Out tab.</P>}
          {points.map((p) => (
            <Pressable key={p.userId} accessibilityRole="button" accessibilityLabel={`Focus ${nameOf(p)}`} accessibilityState={{ selected: selected === p.userId }} onPress={() => setSelected(p.userId)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10, minHeight: 64, borderRadius: 12, borderCurve: 'continuous', backgroundColor: selected === p.userId ? 'rgba(10,132,255,0.16)' : pressed ? C.surface2 : 'transparent' })}>
              <Avatar uri={photos[p.userId]} name={p.displayName} size={40} color={colorOf(p.displayName)} />
              <View style={{ flex: 1 }}>
                <P style={{ fontWeight: '700' }}>{nameOf(p)}</P>
                <P muted small>{p.approximate ? 'Approximate' : 'Precise'} · accuracy {Math.round(p.accuracyM)} m · updated {ago(p.recordedAt)}</P>
              </View>
              {p.isStale && <Badge tone="warn">Stale</Badge>}
            </Pressable>
          ))}
        </>)}
      </Card>
    </View>
  );
}
