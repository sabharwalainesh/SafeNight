import { useEffect, useState, type FormEvent } from 'react';
import { useProfile, type ContactRole, type DefaultSharing } from '../../features/profile/api';
import { Pill, Section } from '../../ui';
import './profile.css';

const EMOJIS = ['🙂', '😎', '🦊', '🐼', '🌙', '⭐', '🚗', '🛡️'];
const ROLE_LABEL: Record<ContactRole, string> = { buddy: 'Buddy', backup_buddy: 'Backup buddy', emergency: 'Emergency' };
const SHARING: { v: DefaultSharing; label: string; hint: string }[] = [
  { v: 'none', label: 'Not shared', hint: 'Nobody sees your location unless you choose.' },
  { v: 'approximate', label: 'Approximate', hint: 'Roughly where you are.' },
  { v: 'precise', label: 'Precise', hint: 'Exact location.' },
];

type Msg = { kind: 'ok' | 'err'; text: string } | null;

function Feedback({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return msg.kind === 'err' ? (
    <p className="result err" role="alert">{msg.text}</p>
  ) : (
    <p className="result ok" role="status">{msg.text}</p>
  );
}

const errText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');

export function ProfileScreen() {
  const api = useProfile();
  const { profile, contacts, knownPeople, privacy, actions } = api;

  const [name, setName] = useState(profile?.displayName ?? '');
  const [emoji, setEmoji] = useState(profile?.avatarEmoji ?? EMOJIS[0]);
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [profMsg, setProfMsg] = useState<Msg>(null);

  const [person, setPerson] = useState('');
  const [role, setRole] = useState<ContactRole>('buddy');
  const [consent, setConsent] = useState(false);
  const [contactMsg, setContactMsg] = useState<Msg>(null);

  const [sharing, setSharing] = useState(privacy.defaultSharing);
  const [minutes, setMinutes] = useState(privacy.defaultConsentMinutes);
  const [buddyAlerts, setBuddyAlerts] = useState(privacy.allowBuddyAlerts);
  const [groupAlerts, setGroupAlerts] = useState(privacy.allowGroupAlerts);
  const [retain, setRetain] = useState(privacy.retainCheckinsDays);
  const [privMsg, setPrivMsg] = useState<Msg>(null);

  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [delMsg, setDelMsg] = useState<Msg>(null);

  const pName = profile?.displayName;
  const pEmoji = profile?.avatarEmoji;
  const pPhone = profile?.phone;
  useEffect(() => {
    if (pName !== undefined) setName(pName);
    if (pEmoji !== undefined) setEmoji(pEmoji);
    if (pPhone !== undefined) setPhone(pPhone);
  }, [pName, pEmoji, pPhone]);
  useEffect(() => {
    setSharing(privacy.defaultSharing);
    setMinutes(privacy.defaultConsentMinutes);
    setBuddyAlerts(privacy.allowBuddyAlerts);
    setGroupAlerts(privacy.allowGroupAlerts);
    setRetain(privacy.retainCheckinsDays);
  }, [privacy.defaultSharing, privacy.defaultConsentMinutes, privacy.allowBuddyAlerts, privacy.allowGroupAlerts, privacy.retainCheckinsDays]);

  const candidates = knownPeople.filter((p) => p.userId !== api.me && !contacts.some((c) => c.contact === p.userId));
  const selected = candidates.some((p) => p.userId === person) ? person : (candidates[0]?.userId ?? '');

  async function attempt(fn: () => Promise<void>, set: (m: Msg) => void, okText: string) {
    try {
      await fn();
      set({ kind: 'ok', text: okText });
    } catch (e) {
      set({ kind: 'err', text: errText(e) });
    }
  }

  const saveProfile = (e: FormEvent) => {
    e.preventDefault();
    void attempt(
      async () => {
        await actions.setProfile(name, emoji);
        if (phone.trim() !== (profile?.phone ?? '')) await actions.setPhone(phone.trim());
      },
      setProfMsg,
      'Profile saved.',
    );
  };
  const addContact = (e: FormEvent) => {
    e.preventDefault();
    void attempt(
      async () => {
        await actions.addTrustedContact(selected, role, consent, contacts.length + 1);
        setConsent(false);
      },
      setContactMsg,
      'Contact added.',
    );
  };
  const savePrivacy = (e: FormEvent) => {
    e.preventDefault();
    void attempt(
      () => actions.setPrivacyDefaults({ defaultSharing: sharing, defaultConsentMinutes: minutes, allowBuddyAlerts: buddyAlerts, allowGroupAlerts: groupAlerts, retainCheckinsDays: retain }),
      setPrivMsg,
      'Privacy defaults saved.',
    );
  };
  const del = (e: FormEvent) => {
    e.preventDefault();
    if (confirmText !== 'DELETE') return;
    void attempt(
      async () => {
        await actions.deleteMyData();
        setConfirmText('');
      },
      setDelMsg,
      api.mocked ? 'Your profile, contacts and privacy defaults were deleted.' : 'Your data was deleted. Set up your profile to continue.',
    );
  };

  return (
    <div className="profile-screen">
      {api.mocked && (
        <div className="strip">
          <span className="badge sim">MOCK</span>
        </div>
      )}

      <Section title="You">
        <form className="pf-body" onSubmit={saveProfile} aria-label="Profile">
          {!profile && <p className="muted subhead">{api.mocked ? 'You have no profile yet. Save one to appear to others.' : 'You have no profile yet. Set up your profile to continue.'}</p>}
          <label>
            Display name
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoComplete="nickname" />
          </label>
          <label>
            Phone (optional)
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" placeholder="+15551234567" inputMode="tel" />
            <span className="muted footnote">International format (E.164), like +15551234567. Leave empty for none. Only you and SafeNight's server can see this number.</span>
          </label>
          <fieldset>
            <legend>Avatar</legend>
            <div className="emoji-group" role="radiogroup" aria-label="Avatar emoji">
              {EMOJIS.map((em) => (
                <label key={em} className="emoji-opt">
                  <input type="radio" name="avatar" value={em} checked={emoji === em} onChange={() => setEmoji(em)} aria-label={`Avatar ${em}`} />
                  <span aria-hidden="true">{em}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <button className="btn block" type="submit">Save profile</button>
          <Feedback msg={profMsg} />
        </form>
      </Section>

      <section className="sn-section" aria-labelledby="pf-contacts">
        <div className="pf-title-row">
          <h2 id="pf-contacts" className="sn-section-title">Trusted contacts</h2>
          {contacts.length > 1 && (
            <button type="button" className="btn plain small-btn" aria-pressed={editing} onClick={() => { setEditing((v) => !v); setRemoving(null); }}>
              {editing ? 'Done' : 'Edit'}
            </button>
          )}
        </div>
        <div className="sn-section-body">
          {contacts.length === 0 ? (
            <p className="pf-empty">No trusted contacts yet.</p>
          ) : (
            <ol className="ladder">
              {contacts.map((c, i) => (
                <li key={c.id}>
                  <div className="rung">
                    <span className="rung-no">{i + 1}.</span>
                    <span className="headline">{c.contactName}</span>
                    <Pill>{ROLE_LABEL[c.role]}</Pill>
                    {c.messagingConsent ? <Pill tone="ok">Can message</Pill> : <Pill>No messages</Pill>}
                  </div>
                  {editing && (
                    <div className="rung-actions">
                      <button type="button" className="btn secondary small-btn icon" disabled={i === 0} aria-label={`Move ${c.contactName} up`}
                        onClick={() => void attempt(() => actions.moveContact(c.id, 'up'), setContactMsg, `Moved ${c.contactName} up.`)}>↑</button>
                      <button type="button" className="btn secondary small-btn icon" disabled={i === contacts.length - 1} aria-label={`Move ${c.contactName} down`}
                        onClick={() => void attempt(() => actions.moveContact(c.id, 'down'), setContactMsg, `Moved ${c.contactName} down.`)}>↓</button>
                      {removing === c.id ? (
                        <>
                          <button type="button" className="btn plain small-btn red" aria-label={`Confirm remove ${c.contactName}`}
                            onClick={() => { setRemoving(null); void attempt(() => actions.removeTrustedContact(c.id), setContactMsg, `Removed ${c.contactName}.`); }}>Confirm remove</button>
                          <button type="button" className="btn plain small-btn" onClick={() => setRemoving(null)}>Keep</button>
                        </>
                      ) : (
                        <button type="button" className="btn plain small-btn red" aria-label={`Remove ${c.contactName}`} onClick={() => setRemoving(c.id)}>Remove</button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
          <form className="pf-body pf-add" onSubmit={addContact} aria-label="Add a contact">
            <h3 className="headline">Add a contact</h3>
            {candidates.length === 0 ? (
              <p className="muted footnote">Nobody else with a SafeNight profile is available to add.</p>
            ) : (
              <>
                <label>
                  Person
                  <select value={selected} onChange={(e) => setPerson(e.target.value)}>
                    {candidates.map((p) => <option key={p.userId} value={p.userId}>{p.displayName}</option>)}
                  </select>
                </label>
                <label>
                  Role
                  <select value={role} onChange={(e) => setRole(e.target.value as ContactRole)}>
                    <option value="buddy">Buddy</option>
                    <option value="backup_buddy">Backup buddy</option>
                    <option value="emergency">Emergency</option>
                  </select>
                </label>
                <label className="inline">
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                  They agreed to get messages from SafeNight
                </label>
                <button className="btn block" type="submit" disabled={!selected}>Add contact</button>
              </>
            )}
            <Feedback msg={contactMsg} />
          </form>
        </div>
        <p className="sn-section-footer">
          When you need help, SafeNight asks your contacts in this order. Each step waits for a reply before moving on.
        </p>
      </section>

      <Section title="Privacy" footer={!api.privacySaved && !api.mocked ? 'Not saved yet. These are the starting defaults.' : undefined}>
        <form className="pf-body" onSubmit={savePrivacy} aria-label="Privacy defaults">
          <fieldset>
            <legend>Default location sharing</legend>
            {SHARING.map((o) => (
              <label key={o.v} className="inline">
                <input type="radio" name="sharing" value={o.v} checked={sharing === o.v} onChange={() => setSharing(o.v)} />
                <span>{o.label} <span className="muted footnote">{o.hint}</span></span>
              </label>
            ))}
          </fieldset>
          <label>
            Consent lasts
            <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
              <option value={60}>60 minutes</option>
              <option value={180}>180 minutes</option>
              <option value={300}>300 minutes</option>
            </select>
          </label>
          <label className="inline">
            <input type="checkbox" checked={buddyAlerts} onChange={(e) => setBuddyAlerts(e.target.checked)} />
            Allow alerts to my buddies
          </label>
          <label className="inline">
            <input type="checkbox" checked={groupAlerts} onChange={(e) => setGroupAlerts(e.target.checked)} />
            Allow alerts to my Night Out group
          </label>
          <label>
            Keep my check-ins for
            <select value={retain} onChange={(e) => setRetain(Number(e.target.value))}>
              <option value={1}>1 day</option>
              <option value={7}>7 days</option>
              <option value={30}>30 days</option>
            </select>
          </label>
          <button className="btn block" type="submit">Save privacy defaults</button>
          <Feedback msg={privMsg} />
        </form>
      </Section>

      <Section
        title="Data"
        footer={
          api.mocked
            ? "Deleting removes your profile, your trusted contacts, other people's contacts lists that include you, and your privacy defaults. Night Out, location, incident and report data are not deleted by this demo control yet. Full deletion arrives with the backend. This cannot be undone."
            : 'Delete my data deletes everything SafeNight stores about you: your profile, trusted contacts, privacy settings, locations, check-ins and your part in Night Out sessions and incidents. Reports you posted stay, anonymized. This cannot be undone.'
        }
      >
        <form className="pf-body" onSubmit={del} aria-label="Delete my data">
          <label>
            Type DELETE to confirm
            <input type="text" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" autoCapitalize="characters" />
          </label>
          <button className="btn plain pf-delete" type="submit" disabled={confirmText !== 'DELETE'}>Delete my data</button>
          <Feedback msg={delMsg} />
        </form>
      </Section>
    </div>
  );
}
