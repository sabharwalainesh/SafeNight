import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Badge, Btn, Feedback, Field, Input, ListRow, P, Rows, Section, Select, type Msg } from '../components/ui';
import { errText, relFuture } from '../lib/format';
import { useNightOut, useSetCurrentSessionId, type NightSession } from '../web';
import { SessionDetail } from './SessionDetail';

const HOURS = [2, 4, 6, 8].map((h) => ({ id: String(h), label: `${h} hours` }));
const INTERVALS = [15, 30, 45, 60].map((m) => ({ id: String(m), label: m === 60 ? 'Every hour' : `Every ${m} min` }));

/** `joinCode` comes from an invite link (safenight://join?code=…) and pre-fills the join field. */
export function NightOutScreen({ joinCode }: { joinCode?: string }) {
  const api = useNightOut();
  const setCurrent = useSetCurrentSessionId();
  const [openId, setOpenId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [venue, setVenue] = useState('');
  const [hours, setHours] = useState('6');
  const [interval, setInterval] = useState('30');
  const [code, setCode] = useState(joinCode ?? '');
  useEffect(() => { if (joinCode) setCode(joinCode); }, [joinCode]);
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [createMsg, setCreateMsg] = useState<Msg>(null);
  const [joinMsg, setJoinMsg] = useState<Msg>(null);

  const open = (id: string) => {
    setCurrent(id);
    setOpenId(id);
  };

  if (openId) return <SessionDetail sessionId={openId} onBack={() => setOpenId(null)} />;

  if (!api.ready) return <P muted>Loading your sessions…</P>;

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

  const active = api.mySessions.filter((x) => x.status !== 'ended' && x.status !== 'expired');
  const past = api.mySessions.filter((x) => x.status === 'ended' || x.status === 'expired');
  return (
    <View style={{ gap: 28 }}>
      {!!joinCode && code === joinCode && (
        <Section header="You're invited" footer="Joining shares nothing until you choose to.">
          <P>Join with code <P style={{ fontWeight: '700', letterSpacing: 2 }}>{joinCode}</P>?</P>
          <Btn title="Join group" busy={busy === 'join'} disabled={busy !== null} onPress={() => void join()} />
          <Feedback msg={joinMsg} />
        </Section>
      )}

      {active.length > 0 && (
        <Section header="Tonight" flush>
          <Rows>
            {active.map((x: NightSession) => (
              <ListRow key={x.id} title={x.name} subtitle={`${x.venueHint ? `${x.venueHint} · ` : ''}Ends ${relFuture(x.expiresAt)}`} chevron onPress={() => open(x.id)} accessibilityLabel={`Open ${x.name}`} />
            ))}
          </Rows>
        </Section>
      )}

      <Section header="Start a group" footer="Only what you choose is shared, only with people you pick, only until it ends.">
        <Input value={name} onChangeText={setName} maxLength={80} placeholder="Name, e.g. Saturday night" returnKeyType="next" />
        <Input value={venue} onChangeText={setVenue} maxLength={120} placeholder="Where (optional)" />
        <Select label="Ends in" options={HOURS} value={hours} onChange={setHours} />
        <Select label="Check-ins" options={INTERVALS} value={interval} onChange={setInterval} />
        <Btn title="Start" busy={busy === 'create'} disabled={!name.trim() || busy !== null} onPress={() => void create()} />
        <Feedback msg={createMsg} />
      </Section>

      <Section header="Join with a code" footer="Six characters from a friend's invite.">
        <Field label="Invite code">
          <Input value={code} onChangeText={(t) => setCode(t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))} autoCapitalize="characters" autoCorrect={false} maxLength={6} placeholder="ABC123" style={{ letterSpacing: 6, fontFamily: 'Menlo', fontSize: 22, textAlign: 'center' }} />
        </Field>
        <Btn title="Join" variant="secondary" busy={busy === 'join'} disabled={code.length !== 6 || busy !== null} onPress={() => void join()} />
        {!(joinCode && code === joinCode) && <Feedback msg={joinMsg} />}
      </Section>

      {past.length > 0 && (
        <Section header="Earlier" flush>
          <Rows>
            {past.map((x: NightSession) => (
              <ListRow key={x.id} title={x.name} subtitle={x.venueHint || undefined} right={<Badge>{x.status}</Badge>} chevron onPress={() => open(x.id)} accessibilityLabel={`Open ${x.name}`} />
            ))}
          </Rows>
        </Section>
      )}
    </View>
  );
}
