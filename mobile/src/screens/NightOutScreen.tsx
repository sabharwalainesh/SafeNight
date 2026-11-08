import { useState } from 'react';
import { View } from 'react-native';
import { Badge, Btn, Card, Feedback, Field, H2, Input, P, Row, Segmented, type Msg } from '../components/ui';
import { errText, relFuture } from '../lib/format';
import { useNightOut, useSetCurrentSessionId, type NightSession } from '../web';
import { SessionDetail } from './SessionDetail';

const HOURS = [2, 4, 6, 8].map((h) => ({ id: String(h), label: `${h} h` }));
const INTERVALS = [15, 30, 45, 60].map((m) => ({ id: String(m), label: `${m} min` }));

export function NightOutScreen() {
  const api = useNightOut();
  const setCurrent = useSetCurrentSessionId();
  const [openId, setOpenId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [venue, setVenue] = useState('');
  const [hours, setHours] = useState('6');
  const [interval, setInterval] = useState('30');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [createMsg, setCreateMsg] = useState<Msg>(null);
  const [joinMsg, setJoinMsg] = useState<Msg>(null);

  const open = (id: string) => {
    setCurrent(id);
    setOpenId(id);
  };

  if (openId) return <SessionDetail sessionId={openId} onBack={() => setOpenId(null)} />;

  if (!api.ready) return <Card><P muted>Loading your sessions…</P></Card>;

  async function create() {
    setBusy('create');
    setCreateMsg(null);
    try {
      const now = Date.now();
      const id = await api.actions.createSession({ name: name.trim(), venueHint: venue.trim(), startsAt: now, expiresAt: now + Number(hours) * 3600_000, checkinIntervalMinutes: Number(interval) });
      setName(''); setVenue('');
      open(id);
    } catch (e) {
      setCreateMsg({ ok: false, text: errText(e) });
    } finally {
      setBusy(null);
    }
  }
  async function join() {
    setBusy('join');
    setJoinMsg(null);
    try {
      const id = await api.actions.joinSession(code);
      setCode('');
      open(id);
    } catch (e) {
      setJoinMsg({ ok: false, text: errText(e) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={{ gap: 12 }}>
      <Card>
        <H2>Your sessions</H2>
        {api.mySessions.length === 0 ? (
          <P muted>No sessions yet. Start one below or join with a code.</P>
        ) : (
          api.mySessions.map((s: NightSession) => (
            <Row key={s.id} style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <P style={{ fontWeight: '700' }}>{s.name}</P>
                {!!s.venueHint && <P muted small>{s.venueHint}</P>}
                <P muted small>{s.status === 'ended' || s.status === 'expired' ? 'Expired' : 'Expires'} {relFuture(s.expiresAt)}</P>
              </View>
              <Badge>{s.status}</Badge>
              <Btn title="Open" small onPress={() => open(s.id)} accessibilityLabel={`Open ${s.name}`} />
            </Row>
          ))
        )}
      </Card>

      <Card>
        <H2>Start a Night Out</H2>
        <Field label="Name"><Input value={name} onChangeText={setName} maxLength={80} placeholder="Saturday night" /></Field>
        <Field label="Venue hint (optional)"><Input value={venue} onChangeText={setVenue} maxLength={120} placeholder="Deep Ellum, Dallas, TX" /></Field>
        <Field label="Ends in"><Segmented options={HOURS} value={hours} onChange={setHours} /></Field>
        <Field label="Check-in every"><Segmented options={INTERVALS} value={interval} onChange={setInterval} /></Field>
        <Btn title="Start Night Out" busy={busy === 'create'} disabled={!name.trim() || busy !== null} onPress={() => void create()} />
        <Feedback msg={createMsg} />
      </Card>

      <Card>
        <H2>Join with a code</H2>
        <Field label="Invite code" hint="Six characters from the organizer. Joining shares nothing until you choose to.">
          <Input value={code} onChangeText={(t) => setCode(t.toUpperCase().replace(/\s/g, '').slice(0, 6))} autoCapitalize="characters" autoCorrect={false} maxLength={6} placeholder="ABC123" style={{ letterSpacing: 4, fontFamily: 'Menlo' }} />
        </Field>
        <Btn title="Join" busy={busy === 'join'} disabled={code.length !== 6 || busy !== null} onPress={() => void join()} />
        <Feedback msg={joinMsg} />
      </Card>
      <P muted small>Only what you choose is shared, only with people you pick, only until it expires.</P>
    </View>
  );
}
