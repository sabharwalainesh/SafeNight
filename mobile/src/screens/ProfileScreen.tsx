import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Badge, Btn, Card, Confirm, Feedback, Field, H2, H3, Input, P, Row, Segmented, Toggle, type Msg } from '../components/ui';
import { errText, mmss } from '../lib/format';
import { PERSONAS, type Persona } from '../personas';
import { C } from '../theme';
import { JOB_STATUS_LABELS, useAgent, useDemoLive, useProfile, useSafety, type ContactRole, type DefaultSharing } from '../web';

const EMOJIS = ['🙂', '😎', '🦊', '🐼', '🌙', '⭐', '🚗', '🛡️'];
const ROLES: { id: ContactRole; label: string }[] = [{ id: 'buddy', label: 'Buddy' }, { id: 'backup_buddy', label: 'Backup' }, { id: 'emergency', label: 'Emergency' }];
const SHARING: { id: DefaultSharing; label: string }[] = [{ id: 'none', label: 'Not shared' }, { id: 'approximate', label: 'Approximate' }, { id: 'precise', label: 'Precise' }];
const MINUTES = [60, 180, 300].map((m) => ({ id: String(m), label: `${m} min` }));
const DAYS = [1, 7, 30].map((d) => ({ id: String(d), label: `${d} d` }));
const CLOSED = ['resolved', 'cancelled', 'handed_off'];
const TIER_LABELS = ['Primary buddy', 'Backup buddy', 'Organizer'];

function DemoPanel() {
  const demo = useDemoLive();
  const agent = useAgent();
  const safety = useSafety();
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<'reset' | 'wipe' | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const run = async (label: string, fn: () => Promise<void>) => { setBusy(true); try { await fn(); setMsg({ ok: true, text: label }); } catch (e) { setMsg({ ok: false, text: errText(e) }); } finally { setBusy(false); setConfirm(null); } };
  const jobs = safety.incidents.flatMap((i) => { const j = agent.jobForIncident(i.id); return j && !CLOSED.includes(j.status) ? [{ job: j, subject: i.subjectName }] : []; });
  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}><H2>Judge demo</H2><Badge tone="ok">LIVE</Badge></Row>
      {PERSONAS.map((p) => <P key={p.id} small>{p.name}: {demo.registered.has(p.id) ? '✓ registered' : 'missing (open that persona on a device)'}</P>)}
      <Btn title="Set up demo group" disabled={busy || !demo.allRegistered} onPress={() => void run('Demo group is ready', () => demo.setupGroup('Saturday night'))} />
      {!demo.allRegistered && <P muted small>All four personas must be connected first.</P>}
      {jobs.map(({ job, subject }) => (
        <View key={job.id} style={{ gap: 6, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 8 }}>
          <P style={{ fontWeight: '700' }}>{subject}: {JOB_STATUS_LABELS[job.status]}</P>
          <P muted small>Tier {job.escalationTier} ({TIER_LABELS[job.escalationTier] ?? 'Unknown'}){job.followupDueAt !== null ? ` · follow-up due in ${mmss(job.followupDueAt - now)}` : ''}</P>
          <Btn title="Advance timer (simulate no reply)" small variant="secondary" disabled={busy} onPress={() => void run('Timer advanced', () => agent.demo.fireFollowup(job.id))} />
        </View>
      ))}
      <Row>
        <Btn title="Reset demo group" variant="secondary" disabled={busy} onPress={() => setConfirm('reset')} />
        <Btn title="Wipe all demo data" variant="danger" disabled={busy} onPress={() => setConfirm('wipe')} />
      </Row>
      <Confirm show={confirm === 'reset'} busy={busy} text="End the demo session and cancel its incidents? Personas stay registered." label="Yes, reset the group" onYes={() => void run('Demo group reset', () => demo.resetGroup())} onCancel={() => setConfirm(null)} />
      <Confirm show={confirm === 'wipe'} busy={busy} text="Wipe every demo row on the server? Venues and resources stay." label="Yes, wipe all demo data" onYes={() => void run('Demo data wiped on the server', () => agent.demo.reset())} onCancel={() => setConfirm(null)} />
      <Feedback msg={msg} />
      <P muted small>1. Set up the group. 2. Alex reports a concern about Sam (Map). 3. Maya ignores or you advance the timer; Jordan taps "I'm on it". 4. Sam chooses a ride, books, confirms pickup, then "I'm home".</P>
    </Card>
  );
}

export function ProfileScreen({ persona }: { persona: Persona }) {
  const api = useProfile();
  const { profile, contacts, knownPeople, privacy, actions } = api;
  const [name, setName] = useState(profile?.displayName ?? persona.name);
  const [emoji, setEmoji] = useState(profile?.avatarEmoji ?? EMOJIS[0]);
  const [profMsg, setProfMsg] = useState<Msg>(null);
  const [person, setPerson] = useState('');
  const [role, setRole] = useState<ContactRole>('buddy');
  const [consent, setConsent] = useState(false);
  const [contactMsg, setContactMsg] = useState<Msg>(null);
  const [sharing, setSharing] = useState(privacy.defaultSharing);
  const [minutes, setMinutes] = useState(String(privacy.defaultConsentMinutes));
  const [buddyAlerts, setBuddyAlerts] = useState(privacy.allowBuddyAlerts);
  const [groupAlerts, setGroupAlerts] = useState(privacy.allowGroupAlerts);
  const [retain, setRetain] = useState(String(privacy.retainCheckinsDays));
  const [privMsg, setPrivMsg] = useState<Msg>(null);
  const [confirmText, setConfirmText] = useState('');
  const [delMsg, setDelMsg] = useState<Msg>(null);
  const pName = profile?.displayName; const pEmoji = profile?.avatarEmoji;
  useEffect(() => { if (pName !== undefined) setName(pName); if (pEmoji !== undefined) setEmoji(pEmoji); }, [pName, pEmoji]);
  useEffect(() => { setSharing(privacy.defaultSharing); setMinutes(String(privacy.defaultConsentMinutes)); setBuddyAlerts(privacy.allowBuddyAlerts); setGroupAlerts(privacy.allowGroupAlerts); setRetain(String(privacy.retainCheckinsDays)); }, [privacy.defaultSharing, privacy.defaultConsentMinutes, privacy.allowBuddyAlerts, privacy.allowGroupAlerts, privacy.retainCheckinsDays]);
  const candidates = knownPeople.filter((p) => p.userId !== api.me && !contacts.some((c) => c.contact === p.userId));
  const selected = candidates.some((p) => p.userId === person) ? person : (candidates[0]?.userId ?? '');
  async function attempt(fn: () => Promise<void>, set: (m: Msg) => void, ok: string) { try { await fn(); set({ ok: true, text: ok }); } catch (e) { set({ ok: false, text: errText(e) }); } }
  return (
    <View style={{ gap: 12 }}>
      <Card>
        <H2>Profile</H2>
        {!profile && <P muted>You have no profile yet. Save one to appear to others.</P>}
        <Field label="Display name"><Input value={name} onChangeText={setName} maxLength={40} /></Field>
        <Field label="Avatar">
          <Row>{EMOJIS.map((em) => (
            <Pressable key={em} accessibilityRole="radio" accessibilityLabel={`Avatar ${em}`} accessibilityState={{ checked: emoji === em }} onPress={() => setEmoji(em)} style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: emoji === em ? C.accent : C.border, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 22 }}>{em}</Text>
            </Pressable>
          ))}</Row>
        </Field>
        <P muted small>Phone numbers are stored privately on the server and are optional; they are not collected here.</P>
        <Btn title="Save profile" disabled={!name.trim()} onPress={() => void attempt(() => actions.setProfile(name, emoji), setProfMsg, 'Profile saved.')} />
        <Feedback msg={profMsg} />
      </Card>

      <Card>
        <H2>Trusted contacts & backup ladder</H2>
        <P muted small>When you need help, SafeNight asks your contacts in this order. Each step waits for a reply before moving on.</P>
        {contacts.length === 0 ? <P muted>No trusted contacts yet.</P> : contacts.map((c, i) => (
          <Row key={c.id} style={{ justifyContent: 'space-between' }}>
            <P>{i + 1}. <Text style={{ fontWeight: '700' }}>{c.contactName}</Text></P>
            <Badge>{ROLES.find((r) => r.id === c.role)?.label ?? c.role}</Badge>
            <Badge tone={c.messagingConsent ? 'ok' : 'default'}>{c.messagingConsent ? 'Can message' : 'No messages'}</Badge>
            <Btn title="Remove" small variant="secondary" accessibilityLabel={`Remove ${c.contactName}`} onPress={() => void attempt(() => actions.removeTrustedContact(c.id), setContactMsg, `Removed ${c.contactName}.`)} />
          </Row>
        ))}
        <H3>Add a contact</H3>
        {candidates.length === 0 ? <P muted small>Nobody else from your Night Outs is available to add.</P> : (<>
          <Field label="Person"><Row>{candidates.map((p) => (
            <Pressable key={p.userId} accessibilityRole="radio" accessibilityState={{ checked: selected === p.userId }} onPress={() => setPerson(p.userId)} style={{ borderWidth: 2, borderColor: selected === p.userId ? C.accent : C.border, borderRadius: 999, paddingHorizontal: 14, minHeight: 40, justifyContent: 'center' }}><Text style={{ color: C.text, fontWeight: '700' }}>{p.displayName}</Text></Pressable>
          ))}</Row></Field>
          <Field label="Role"><Segmented options={ROLES} value={role} onChange={setRole} /></Field>
          <Toggle label="They agreed to get messages from SafeNight" checked={consent} onChange={() => setConsent((v) => !v)} />
          <Btn title="Add contact" disabled={!selected} onPress={() => void attempt(async () => { await actions.addTrustedContact(selected, role, consent, contacts.length + 1); setConsent(false); }, setContactMsg, 'Contact added.')} />
        </>)}
        <Feedback msg={contactMsg} />
      </Card>

      <Card>
        <H2>Privacy defaults</H2>
        {!api.privacySaved && <P muted small>Not saved yet. These are the starting defaults.</P>}
        <Field label="Default location sharing"><Segmented options={SHARING} value={sharing} onChange={setSharing} /></Field>
        <Field label="Consent lasts"><Segmented options={MINUTES} value={minutes} onChange={setMinutes} /></Field>
        <Toggle label="Allow alerts to my buddies" checked={buddyAlerts} onChange={() => setBuddyAlerts((v) => !v)} />
        <Toggle label="Allow alerts to my Night Out group" checked={groupAlerts} onChange={() => setGroupAlerts((v) => !v)} />
        <Field label="Keep my check-ins for"><Segmented options={DAYS} value={retain} onChange={setRetain} /></Field>
        <Btn title="Save privacy defaults" onPress={() => void attempt(() => actions.setPrivacyDefaults({ defaultSharing: sharing, defaultConsentMinutes: Number(minutes), allowBuddyAlerts: buddyAlerts, allowGroupAlerts: groupAlerts, retainCheckinsDays: Number(retain) }), setPrivMsg, 'Privacy defaults saved.')} />
        <Feedback msg={privMsg} />
      </Card>

      <Card>
        <H2>Your data</H2>
        <P muted small>Delete my data deletes everything SafeNight stores about you: your profile, trusted contacts, privacy settings, locations, check-ins and your part in Night Out sessions and incidents. Reports you posted stay, anonymized. This cannot be undone.</P>
        <Field label="Type DELETE to confirm"><Input value={confirmText} onChangeText={setConfirmText} autoCapitalize="characters" autoCorrect={false} /></Field>
        <Btn title="Delete my data" variant="danger" disabled={confirmText !== 'DELETE'} onPress={() => void attempt(async () => { await actions.deleteMyData(); setConfirmText(''); }, setDelMsg, 'Your data was deleted. Set up your profile to continue.')} />
        <Feedback msg={delMsg} />
      </Card>

      <DemoPanel />
    </View>
  );
}
