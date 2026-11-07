import { useEffect, useState, type FormEvent } from 'react';
import { useProfile, type ContactRole, type DefaultSharing } from '../../features/profile/api';
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
  const [profMsg, setProfMsg] = useState<Msg>(null);

  const [person, setPerson] = useState('');
  const [role, setRole] = useState<ContactRole>('buddy');
  const [consent, setConsent] = useState(false);
  const [contactMsg, setContactMsg] = useState<Msg>(null);

  const [sharing, setSharing] = useState(privacy.defaultSharing);
  const [minutes, setMinutes] = useState(privacy.defaultConsentMinutes);
  const [checkins, setCheckins] = useState(privacy.shareCheckinsWithBuddies);
  const [privMsg, setPrivMsg] = useState<Msg>(null);

  const [confirmText, setConfirmText] = useState('');
  const [delMsg, setDelMsg] = useState<Msg>(null);

  const pName = profile?.displayName;
  const pEmoji = profile?.avatarEmoji;
  useEffect(() => {
    if (pName !== undefined) setName(pName);
    if (pEmoji !== undefined) setEmoji(pEmoji);
  }, [pName, pEmoji]);
  useEffect(() => {
    setSharing(privacy.defaultSharing);
    setMinutes(privacy.defaultConsentMinutes);
    setCheckins(privacy.shareCheckinsWithBuddies);
  }, [privacy.defaultSharing, privacy.defaultConsentMinutes, privacy.shareCheckinsWithBuddies]);

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
    void attempt(() => actions.setProfile(name, emoji), setProfMsg, 'Profile saved.');
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
      () => actions.setPrivacyDefaults({ defaultSharing: sharing, defaultConsentMinutes: minutes, shareCheckinsWithBuddies: checkins }),
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
      'Your profile, contacts and privacy defaults were deleted.',
    );
  };

  return (
    <div className="profile-screen">
      <div className="strip">{api.mocked && <span className="badge sim">MOCK</span>}</div>

      <section className="card" aria-labelledby="pf-profile">
        <h2 id="pf-profile">Profile</h2>
        {!profile && <p className="muted">You have no profile yet. Save one to appear to others.</p>}
        <form onSubmit={saveProfile}>
          <label>
            Display name
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoComplete="nickname" />
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
          <button className="btn" type="submit">Save profile</button>
        </form>
        <Feedback msg={profMsg} />
      </section>

      <section className="card" aria-labelledby="pf-contacts">
        <h2 id="pf-contacts">Trusted contacts &amp; backup ladder</h2>
        <p className="muted small">
          When you need help, SafeNight asks your contacts in this order. Each step waits for a reply before moving on.
        </p>
        {contacts.length === 0 ? (
          <p className="muted">No trusted contacts yet.</p>
        ) : (
          <ol className="ladder">
            {contacts.map((c, i) => (
              <li key={c.id}>
                <div className="rung">
                  <span className="rung-no">{i + 1}.</span>
                  <strong>{c.contactName}</strong>
                  <span className="tag">{ROLE_LABEL[c.role]}</span>
                  {c.messagingConsent ? <span className="tag consent">Can message</span> : <span className="tag">No messages</span>}
                </div>
                <div className="rung-actions">
                  <button type="button" className="btn secondary icon" disabled={i === 0} aria-label={`Move ${c.contactName} up`}
                    onClick={() => void attempt(() => actions.moveContact(c.id, 'up'), setContactMsg, `Moved ${c.contactName} up.`)}>↑</button>
                  <button type="button" className="btn secondary icon" disabled={i === contacts.length - 1} aria-label={`Move ${c.contactName} down`}
                    onClick={() => void attempt(() => actions.moveContact(c.id, 'down'), setContactMsg, `Moved ${c.contactName} down.`)}>↓</button>
                  <button type="button" className="btn secondary" aria-label={`Remove ${c.contactName}`}
                    onClick={() => void attempt(() => actions.removeTrustedContact(c.id), setContactMsg, `Removed ${c.contactName}.`)}>Remove</button>
                </div>
              </li>
            ))}
          </ol>
        )}
        <form onSubmit={addContact}>
          <h3>Add a contact</h3>
          {candidates.length === 0 ? (
            <p className="muted small">Nobody else with a SafeNight profile is available to add.</p>
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
              <button className="btn" type="submit" disabled={!selected}>Add contact</button>
            </>
          )}
        </form>
        <Feedback msg={contactMsg} />
      </section>

      <section className="card" aria-labelledby="pf-privacy">
        <h2 id="pf-privacy">Privacy defaults</h2>
        <form onSubmit={savePrivacy}>
          <fieldset>
            <legend>Default location sharing</legend>
            {SHARING.map((o) => (
              <label key={o.v} className="inline">
                <input type="radio" name="sharing" value={o.v} checked={sharing === o.v} onChange={() => setSharing(o.v)} />
                <span>{o.label} <span className="muted small">{o.hint}</span></span>
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
            <input type="checkbox" checked={checkins} onChange={(e) => setCheckins(e.target.checked)} />
            Share my check-ins with my buddies
          </label>
          <button className="btn" type="submit">Save privacy defaults</button>
        </form>
        <Feedback msg={privMsg} />
      </section>

      <section className="card danger-zone" aria-labelledby="pf-data">
        <h2 id="pf-data">Your data</h2>
        <p className="muted small">
          Deleting removes your profile, your trusted contacts and your privacy defaults from SafeNight. This cannot be undone.
        </p>
        <form onSubmit={del}>
          <label>
            Type DELETE to confirm
            <input type="text" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" autoCapitalize="characters" />
          </label>
          <button className="btn danger" type="submit" disabled={confirmText !== 'DELETE'}>Delete my data</button>
        </form>
        <Feedback msg={delMsg} />
      </section>
    </div>
  );
}
