import { useEffect, useRef, useState, type FormEvent } from 'react';
import { roleForPosition, useProfile, type ContactRole, type DefaultSharing } from '../../features/profile/api';
import { formatPhone, formatPhoneInput, normalizePhone } from '../../lib/phone';
import { prepareProfilePhoto } from '../../lib/profilePhoto';
import { Avatar, MenuSelect, Pill, Section } from '../../ui';
import './profile.css';

const EMOJIS = ['🙂', '😎', '🦊', '🐼', '🌙', '⭐', '🚗', '🛡️'];
const ROLE_LABEL: Record<ContactRole, string> = { buddy: 'Buddy', backup_buddy: 'Backup buddy', emergency: 'Emergency' };
const SHARING: { value: DefaultSharing; label: string; hint: string }[] = [
  { value: 'none', label: 'Off', hint: 'Nobody sees your location unless you choose.' },
  { value: 'approximate', label: 'Approximate', hint: 'Roughly where you are.' },
  { value: 'precise', label: 'Precise', hint: 'Exact location.' },
];
const MINUTES = [
  { value: 60, label: '1 hour' },
  { value: 180, label: '3 hours' },
  { value: 300, label: '5 hours' },
];
const RETAIN = [
  { value: 1, label: '1 day' },
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
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

export function ProfileScreen({ onOpenPrivacy }: { onOpenPrivacy?: () => void }) {
  const api = useProfile();
  const { profile, contacts, knownPeople, privacy, actions } = api;
  const myPhoto = api.photos?.[api.me];

  const [name, setName] = useState(profile?.displayName ?? '');
  const [emoji, setEmoji] = useState(profile?.avatarEmoji ?? EMOJIS[0]);
  const [phone, setPhone] = useState(formatPhone(profile?.phone ?? ''));
  const [profMsg, setProfMsg] = useState<Msg>(null);
  const [photoMsg, setPhotoMsg] = useState<Msg>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [person, setPerson] = useState('');
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
    if (pPhone !== undefined) setPhone(formatPhone(pPhone));
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
  const nextRole = roleForPosition(contacts.length);

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
        const e164 = normalizePhone(phone);
        await actions.setProfile(name, emoji);
        if (e164 !== (profile?.phone ?? '')) await actions.setPhone(e164);
        setPhone(formatPhone(e164));
      },
      setProfMsg,
      'Profile saved.',
    );
  };
  const onPhoto = async (file: File | undefined) => {
    if (!file) return;
    setPhotoBusy(true);
    await attempt(
      async () => {
        if (!profile) throw new Error('Save your profile first, then add a photo.');
        await actions.setProfilePhoto(await prepareProfilePhoto(file));
      },
      setPhotoMsg,
      'Photo updated.',
    );
    setPhotoBusy(false);
    if (fileRef.current) fileRef.current.value = '';
  };
  const addContact = (e: FormEvent) => {
    e.preventDefault();
    void attempt(
      async () => {
        await actions.addTrustedContact(selected, nextRole, consent, contacts.length + 1);
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

      <Section
        title="You"
        footer={
          onOpenPrivacy ? (
            <>
              Your phone number is private. See how we handle your data in the{' '}
              <button type="button" className="sn-link" onClick={onOpenPrivacy}>Privacy Policy</button>.
            </>
          ) : undefined
        }
      >
        <div className="pf-hero">
          <Avatar name={name || '?'} emoji={emoji} photo={myPhoto} size={84} />
          <div className="pf-hero-actions">
            <span className="headline">{profile?.displayName ?? 'Set up your profile'}</span>
            <div className="pf-photo-btns">
              <button type="button" className="btn secondary small-btn" disabled={photoBusy} onClick={() => fileRef.current?.click()}>
                {photoBusy ? 'Uploading…' : myPhoto ? 'Change photo' : 'Add photo'}
              </button>
              {myPhoto && (
                <button type="button" className="btn plain small-btn red" disabled={photoBusy}
                  onClick={() => void attempt(() => actions.setProfilePhoto(''), setPhotoMsg, 'Photo removed.')}>
                  Remove
                </button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1}
              aria-label="Choose profile photo" onChange={(e) => void onPhoto(e.target.files?.[0])} />
          </div>
        </div>
        <Feedback msg={photoMsg} />
        <form className="pf-body" onSubmit={saveProfile} aria-label="Profile">
          {!profile && <p className="muted subhead">{api.mocked ? 'You have no profile yet. Save one to appear to others.' : 'You have no profile yet. Set up your profile to continue.'}</p>}
          <label>
            Display name
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoComplete="nickname" />
          </label>
          <label>
            Phone (optional)
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(formatPhoneInput(phone, e.target.value))}
              autoComplete="tel"
              placeholder="(555) 123-4567"
              inputMode="tel"
            />
            <span className="muted footnote">Used only to call you about an alert. Outside the US or Canada, start with + and your country code.</span>
          </label>
          <fieldset>
            <legend>{myPhoto ? 'Emoji (shown when your photo can’t load)' : 'Avatar'}</legend>
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
          {contacts.length > 0 && (
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
                    <Avatar userId={c.contact} name={c.contactName} size={36} />
                    <span className="rung-main">
                      <span className="headline">{c.contactName}</span>
                      <span className="muted footnote">
                        {ROLE_LABEL[roleForPosition(i)]} · {c.messagingConsent ? 'Can be messaged' : 'No messages'}
                      </span>
                    </span>
                    <Pill>{i + 1}</Pill>
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
                <MenuSelect
                  label="Person"
                  value={selected}
                  options={candidates.map((p) => ({ value: p.userId, label: p.displayName }))}
                  onChange={setPerson}
                />
                <p className="muted footnote">They’ll be your {ROLE_LABEL[nextRole].toLowerCase()}. Reorder anytime with Edit.</p>
                <label className="inline switch-row">
                  <span>They agreed to get messages from SafeNight</span>
                  <input type="checkbox" role="switch" className="sn-switch" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                </label>
                <button className="btn block" type="submit" disabled={!selected}>Add contact</button>
              </>
            )}
            <Feedback msg={contactMsg} />
          </form>
        </div>
        <p className="sn-section-footer">
          When you need help, SafeNight asks your contacts in this order: first your buddy, then your backup, then everyone else. Each step waits for a reply.
        </p>
      </section>

      <Section title="Privacy" footer={!api.privacySaved && !api.mocked ? 'Not saved yet. These are the starting defaults.' : undefined}>
        <form className="pf-body" onSubmit={savePrivacy} aria-label="Privacy defaults">
          <MenuSelect label="Location sharing" value={sharing} options={SHARING} onChange={setSharing} />
          <p className="muted footnote">{SHARING.find((o) => o.value === sharing)?.hint}</p>
          <MenuSelect label="Sharing lasts" value={minutes} options={MINUTES} onChange={setMinutes} />
          <label className="inline switch-row">
            <span>Allow alerts to my buddies</span>
            <input type="checkbox" role="switch" className="sn-switch" checked={buddyAlerts} onChange={(e) => setBuddyAlerts(e.target.checked)} />
          </label>
          <label className="inline switch-row">
            <span>Allow alerts to my Night Out group</span>
            <input type="checkbox" role="switch" className="sn-switch" checked={groupAlerts} onChange={(e) => setGroupAlerts(e.target.checked)} />
          </label>
          <MenuSelect label="Keep check-ins for" value={retain} options={RETAIN} onChange={setRetain} />
          <button className="btn block" type="submit">Save privacy defaults</button>
          <Feedback msg={privMsg} />
        </form>
      </Section>

      <Section title="Demo" footer="A scripted walkthrough with simulated people at UT Dallas. No real friends or server data needed; runs on this phone alone.">
        <a className="btn secondary block" href="?demo=utd">
          Demo mode (UT Dallas)
        </a>
      </Section>

      <Section
        title="Data"
        footer={
          api.mocked
            ? "Deleting removes your profile, photo, your trusted contacts, other people's contacts lists that include you, and your privacy defaults. Night Out, location, incident and report data are not deleted by this demo control yet. Full deletion arrives with the backend. This cannot be undone."
            : 'Delete my data deletes everything SafeNight stores about you: your profile, photo, trusted contacts, privacy settings, locations, check-ins and your part in Night Out sessions and incidents. Reports you posted stay, anonymized. This cannot be undone.'
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
