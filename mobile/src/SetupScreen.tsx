import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Badge, Btn, Card, Feedback, Field, H2, Input, P, type Msg } from './components/ui';
import { PERSONAS } from './personas';
import { healthUrl, normalizeWsHost, type PersonaId } from './settings';
import type { Settings } from './storage';
import { C } from './theme';

type Props = { initial: Settings; onDone: (s: Settings) => void };

/** "Who is this phone?" plus the server to connect to. Shown until a persona is chosen. */
export function SetupScreen({ initial, onDone }: Props) {
  const [persona, setPersona] = useState<PersonaId | null>(initial.persona);
  const [host, setHost] = useState(initial.host);
  const [db, setDb] = useState(initial.db);
  const [msg, setMsg] = useState<Msg>(null);
  const [testing, setTesting] = useState(false);

  async function test() {
    setTesting(true);
    setMsg(null);
    try {
      const res = await fetch(healthUrl(host, db));
      if (!res.ok) throw new Error(`Server answered ${res.status}`);
      const j = (await res.json()) as { moduleVersion?: string; nemotronMode?: string; messagingMode?: string };
      setMsg({ ok: true, text: `Connected: module ${j.moduleVersion ?? '?'} · Nemotron ${j.nemotronMode ?? '?'} · messaging ${j.messagingMode ?? '?'}` });
    } catch (e) {
      setMsg({ ok: false, text: `Cannot reach ${normalizeWsHost(host)}: ${e instanceof Error ? e.message : String(e)}. Phone and laptop must be on the same Wi-Fi, or use Maincloud.` });
    } finally {
      setTesting(false);
    }
  }

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
      <Text style={s.word}>SafeNight</Text>
      <P muted>Go out together. Get home together.</P>

      <Card>
        <H2>Who is this phone?</H2>
        <P muted small>Each phone is one person. Pick a different persona on each device.</P>
        <View style={{ gap: 8 }}>
          {PERSONAS.map((p) => {
            const on = p.id === persona;
            return (
              <Pressable
                key={p.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={`${p.name}, ${p.roleHint}`}
                onPress={() => setPersona(p.id)}
                style={[s.persona, { borderColor: on ? C.accent : 'transparent', backgroundColor: on ? 'rgba(10,132,255,0.14)' : C.surface }]}
              >
                <View style={[s.swatch, { backgroundColor: p.accent }]} />
                <View style={{ flex: 1 }}>
                  <Text style={s.pName}>{p.name}</Text>
                  <Text style={s.pRole}>{p.roleHint}</Text>
                </View>
                {on && <Badge tone="accent">Selected</Badge>}
              </Pressable>
            );
          })}
        </View>
      </Card>

      <Card>
        <H2>Server</H2>
        <Field label="SpacetimeDB host" hint="LAN: ws://<laptop-ip>:3000 · Maincloud: wss://maincloud.spacetimedb.com">
          <Input value={host} onChangeText={setHost} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="ws://192.168.1.10:3000" />
        </Field>
        <Field label="Database">
          <Input value={db} onChangeText={setDb} autoCapitalize="none" autoCorrect={false} placeholder="safenight" />
        </Field>
        <Btn title="Test connection" variant="secondary" busy={testing} onPress={() => void test()} />
        <Feedback msg={msg} />
      </Card>

      <Btn title="Continue" disabled={!persona || !db.trim()} onPress={() => persona && onDone({ host: normalizeWsHost(host), db: db.trim(), persona })} />
      <P muted small>Nothing is shared until you choose to. Anything simulated is labeled on screen.</P>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { padding: 16, paddingTop: 72, paddingBottom: 48, gap: 14 },
  word: { color: C.text, fontSize: 32, fontWeight: '800', letterSpacing: 0.5 },
  persona: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 2, borderRadius: 14, borderCurve: 'continuous', padding: 12, minHeight: 60 },
  swatch: { width: 14, height: 14, borderRadius: 7 },
  pName: { color: C.text, fontSize: 17, fontWeight: '700' },
  pRole: { color: C.muted, fontSize: 13 },
});
