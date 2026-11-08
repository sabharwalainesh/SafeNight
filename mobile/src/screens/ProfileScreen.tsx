import { useEffect, useState } from 'react';
import { LayoutAnimation, Pressable, Text, View } from 'react-native';
import { Avatar, Badge, Btn, Card, Confirm, Feedback, Field, H2, Input, ListRow, P, Row, Rows, Section, Select, Toggle, tap, type Msg } from '../components/ui';
import { errText, mmss } from '../lib/format';
import { displayPhone, formatPhone, normalizePhone } from '../lib/phone';
import { askPhotoSource, pickProfilePhoto } from '../lib/photo';
import { PERSONAS, type Persona } from '../personas';
import { C } from '../theme';
import { JOB_STATUS_LABELS, SAFETY_NOTE, roleForPosition, useAgent, useDemoLive, useProfile, useSafety, type ContactRole, type DefaultSharing } from '../web';
import { LegalScreen, type LegalPage } from './LegalScreen';

const EMOJIS = ['🙂', '😎', '🦊', '🐼', '🌙', '⭐', '🚗', '🛡️'];
// Contacts don't pick a role; it follows their order in the list.
const ROLE_LABEL: Record<ContactRole, string> = { buddy: 'Primary buddy', backup_buddy: 'Backup buddy', emergency: 'Emergency contact' };
const SHARING: { id: DefaultSharing; label: string }[] = [{ id: 'none', label: 'Off' }, { id: 'approximate', label: 'Approximate' }, { id: 'precise', label: 'Precise' }];
const MINUTES = [60, 180, 300].map((m) => ({ id: String(m), label: m === 60 ? '1 hour' : `${m / 60} hours` }));
const DAYS = [1, 7, 30].map((d) => ({ id: String(d), label: d === 1 ? '1 day' : `${d} days` }));
const smooth = () => LayoutAnimation.configureNext(LayoutAnimation.create(220, 'easeInEaseOut', 'opacity'));
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
        <View key={job.id} style={{ gap: 6, borderTopWidth: 0.5, borderTopColor: C.separator, paddingTop: 8 }}>
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
  const { profile, contacts, knownPeople, privacy, actions, photos } = api;
  const [legal, setLegal] = useState<LegalPage | null>(null);
  const [name, setName] = useState(profile?.displayName ?? persona.name);
  const [emoji, setEmoji] = useState(profile?.avatarEmoji ?? EMOJIS[0]);
  const [profMsg, setProfMsg] = useState<Msg>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [phone, setPhone] = useState(displayPhone(profile?.phone ?? ''));
  const [phoneMsg, setPhoneMsg] = useState<Msg>(null);
  const [adding, setAdding] = useState(false);
  const [consent, setConsent] = useState(true);
  const [contactMsg, setContactMsg] = useState<Msg>(null);
  const [sharing, setSharing] = useState(privacy.defaultSharing);
  const [minutes, setMinutes] = useState(String(privacy.defaultConsentMinutes));
  const [buddyAlerts, setBuddyAlerts] = useState(privacy.allowBuddyAlerts);
  const [groupAlerts, setGroupAlerts] = useState(privacy.allowGroupAlerts);
  const [retain, setRetain] = useState(String(privacy.retainCheckinsDays));
  const [privMsg, setPrivMsg] = useState<Msg>(null);
  const [confirmText, setConfirmText] = useState('');
  const [delMsg, setDelMsg] = useState<Msg>(null);
  const pName = profile?.displayName; const pEmoji = profile?.avatarEmoji; const pPhone = profile?.phone;
  useEffect(() => { if (pName !== undefined) setName(pName); if (pEmoji !== undefined) setEmoji(pEmoji); }, [pName, pEmoji]);
  useEffect(() => { if (pPhone !== undefined) setPhone(displayPhone(pPhone)); }, [pPhone]);
  useEffect(() => { setSharing(privacy.defaultSharing); setMinutes(String(privacy.defaultConsentMinutes)); setBuddyAlerts(privacy.allowBuddyAlerts); setGroupAlerts(privacy.allowGroupAlerts); setRetain(String(privacy.retainCheckinsDays)); }, [privacy.defaultSharing, privacy.defaultConsentMinutes, privacy.allowBuddyAlerts, privacy.allowGroupAlerts, privacy.retainCheckinsDays]);
  const candidates = knownPeople.filter((p) => p.userId !== api.me && !contacts.some((c) => c.contact === p.userId));
  const myPhoto = photos[api.me] ?? null;
  async function attempt(fn: () => Promise<void>, set: (m: Msg) => void, ok: string) { try { await fn(); smooth(); set({ ok: true, text: ok }); } catch (e) { set({ ok: false, text: errText(e) }); } }

  if (legal) return <LegalScreen page={legal} onBack={() => setLegal(null)} />;

  async function editPhoto() {
    const choice = await askPhotoSource(!!myPhoto);
    if (!choice) return;
    setPhotoBusy(true);
    try {
      if (choice === 'remove') { await actions.setProfilePhoto(''); setProfMsg({ ok: true, text: 'Photo removed.' }); return; }
      const url = await pickProfilePhoto(choice);
      if (!url) return;
      await actions.setProfilePhoto(url);
      setProfMsg({ ok: true, text: 'Photo updated. Only your current group can see it.' });
    } catch (e) { setProfMsg({ ok: false, text: errText(e) }); } finally { setPhotoBusy(false); }
  }

  return (
    <View style={{ gap: 28 }}>
      <Card style={{ alignItems: 'center', paddingVertical: 24 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={myPhoto ? 'Change or remove profile photo' : 'Add profile photo'} disabled={photoBusy || !profile} onPress={() => void editPhoto()} style={({ pressed }) => ({ opacity: pressed || photoBusy ? 0.6 : 1, alignItems: 'center', gap: 8 })}>
          <Avatar uri={myPhoto} emoji={emoji} name={name} size={96} />
          <Text style={{ color: profile ? C.accent : C.faint, fontSize: 15 }}>{photoBusy ? 'Uploading…' : myPhoto ? 'Edit photo' : 'Add photo'}</Text>
        </Pressable>
        {!profile && <P muted small style={{ textAlign: 'center' }}>Save your profile first to add a photo and appear to your group.</P>}
        <View style={{ alignSelf: 'stretch', gap: 12 }}>
          <Field label="Name"><Input value={name} onChangeText={setName} maxLength={40} textContentType="givenName" autoCorrect={false} /></Field>
          {!myPhoto && (
            <Row style={{ justifyContent: 'center' }}>{EMOJIS.map((em) => (
              <Pressable key={em} accessibilityRole="radio" accessibilityLabel={`Avatar ${em}`} accessibilityState={{ checked: emoji === em }} onPress={() => { tap('select'); setEmoji(em); }} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: emoji === em ? 'rgba(10,132,255,0.25)' : C.fill, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 22 }}>{em}</Text>
              </Pressable>
            ))}</Row>
          )}
          <Btn title={profile ? 'Save' : 'Create profile'} disabled={!name.trim()} onPress={() => void attempt(() => actions.setProfile(name, emoji), setProfMsg, 'Profile saved.')} />
          <Feedback msg={profMsg} />
        </View>
      </Card>

      <Section header="Phone" footer="Private. Only used to call or text you about a safety alert. Your group never sees it.">
        <Input value={phone} onChangeText={(t) => setPhone(formatPhone(t))} placeholder="(555) 123-4567" keyboardType="phone-pad" textContentType="telephoneNumber" autoComplete="tel" maxLength={22} />
        <Row>
          <Btn title="Save number" small disabled={!profile} onPress={() => void attempt(async () => { const e164 = normalizePhone(phone); await actions.setPhone(e164); setPhone(displayPhone(e164)); }, setPhoneMsg, phone.trim() ? 'Number saved.' : 'Number removed.')} />
          {!!profile?.phone && <Btn title="Remove" small variant="ghost" onPress={() => void attempt(async () => { await actions.setPhone(''); setPhone(''); }, setPhoneMsg, 'Number removed.')} />}
        </Row>
        <Feedback msg={phoneMsg} />
      </Section>

      <Section header="Trusted contacts" flush footer="If you need help, SafeNight asks them in this order. The first is your buddy, the second your backup. Reorder with the arrows.">
        <Rows inset={68}>
          {contacts.map((c, i) => (
            <ListRow
              key={c.id}
              left={<Avatar uri={photos[c.contact]} name={c.contactName} size={40} />}
              title={c.contactName}
              subtitle={`${ROLE_LABEL[roleForPosition(i)]}${c.messagingConsent ? '' : ' · no messages'}`}
              right={
                <Row style={{ gap: 4, flexWrap: 'nowrap' }}>
                  <MiniBtn label="↑" a11y={`Move ${c.contactName} up`} disabled={i === 0} onPress={() => void attempt(() => actions.moveContact(c.id, 'up'), setContactMsg, `${c.contactName} moved up.`)} />
                  <MiniBtn label="↓" a11y={`Move ${c.contactName} down`} disabled={i === contacts.length - 1} onPress={() => void attempt(() => actions.moveContact(c.id, 'down'), setContactMsg, `${c.contactName} moved down.`)} />
                  <MiniBtn label="✕" a11y={`Remove ${c.contactName}`} danger onPress={() => void attempt(() => actions.removeTrustedContact(c.id), setContactMsg, `Removed ${c.contactName}.`)} />
                </Row>
              }
            />
          ))}
          {contacts.length === 0 && !adding && <ListRow title="No trusted contacts yet" subtitle="Add people from your Night Outs." />}
          {!adding ? (
            <ListRow title="Add contact" accent onPress={() => { smooth(); setAdding(true); }} left={<View style={{ width: 40, alignItems: 'center' }}><Text style={{ color: C.accent, fontSize: 26 }}>＋</Text></View>} />
          ) : candidates.length === 0 ? (
            <ListRow title="Nobody else to add yet" subtitle="People appear here after you share a Night Out." right={<MiniBtn label="Done" a11y="Close" onPress={() => { smooth(); setAdding(false); }} />} />
          ) : (
            <View style={{ padding: 16, gap: 10 }}>
              <Toggle label="They agreed to get texts and calls from SafeNight" checked={consent} onChange={() => setConsent((v) => !v)} />
              {candidates.map((p) => (
                <ListRow key={p.userId} left={<Avatar uri={photos[p.userId]} name={p.displayName} size={36} />} title={p.displayName} subtitle={`Will be your ${ROLE_LABEL[roleForPosition(contacts.length)].toLowerCase()}`} accessibilityLabel={`Add ${p.displayName}`}
                  onPress={() => void attempt(async () => { await actions.addTrustedContact(p.userId, roleForPosition(contacts.length), consent, contacts.length + 1); setAdding(false); }, setContactMsg, `${p.displayName} added.`)} right={<Text style={{ color: C.accent, fontSize: 15 }}>Add</Text>} />
              ))}
              <Btn title="Cancel" variant="ghost" small onPress={() => { smooth(); setAdding(false); }} />
            </View>
          )}
        </Rows>
      </Section>
      <Feedback msg={contactMsg} />

      <Section header="Privacy" footer={api.privacySaved ? undefined : 'Not saved yet. These are the starting defaults.'}>
        <Select label="Location sharing" options={SHARING} value={sharing} onChange={setSharing} />
        <Select label="Sharing lasts" options={MINUTES} value={minutes} onChange={setMinutes} />
        <Select label="Keep check-ins" options={DAYS} value={retain} onChange={setRetain} />
        <Toggle label="Alerts to my buddies" checked={buddyAlerts} onChange={() => setBuddyAlerts((v) => !v)} />
        <Toggle label="Alerts to my group" checked={groupAlerts} onChange={() => setGroupAlerts((v) => !v)} />
        <Btn title="Save privacy settings" variant="secondary" onPress={() => void attempt(() => actions.setPrivacyDefaults({ defaultSharing: sharing, defaultConsentMinutes: Number(minutes), allowBuddyAlerts: buddyAlerts, allowGroupAlerts: groupAlerts, retainCheckinsDays: Number(retain) }), setPrivMsg, 'Privacy settings saved.')} />
        <Feedback msg={privMsg} />
      </Section>

      <Section header="About" flush footer={SAFETY_NOTE}>
        <Rows>
          <ListRow title="Privacy Policy" chevron onPress={() => setLegal('privacy')} />
          <ListRow title="Terms of Use" chevron onPress={() => setLegal('terms')} />
          <ListRow title="Acknowledgements" chevron onPress={() => setLegal('acknowledgements')} />
        </Rows>
      </Section>

      <Section header="Your data" footer="Deletes your profile, photo, phone number, trusted contacts, privacy settings, locations, check-ins and your part in Night Outs and incidents. Reports you posted stay, anonymized. This cannot be undone.">
        <Field label="Type DELETE to confirm"><Input value={confirmText} onChangeText={setConfirmText} autoCapitalize="characters" autoCorrect={false} /></Field>
        <Btn title="Delete my data" variant="danger" disabled={confirmText !== 'DELETE'} onPress={() => void attempt(async () => { await actions.deleteMyData(); setConfirmText(''); }, setDelMsg, 'Your data was deleted. Set up your profile to continue.')} />
        <Feedback msg={delMsg} />
      </Section>

      <DemoPanel />
    </View>
  );
}

function MiniBtn({ label, a11y, onPress, disabled, danger }: { label: string; a11y: string; onPress: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y} disabled={disabled} hitSlop={4} onPress={() => { tap('select'); onPress(); }}
      style={({ pressed }) => ({ minWidth: 34, height: 34, paddingHorizontal: 8, borderRadius: 17, backgroundColor: danger ? 'rgba(255,69,58,0.16)' : C.fill, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.3 : pressed ? 0.6 : 1 })}>
      <Text style={{ color: danger ? C.danger : C.text, fontSize: 14, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}
