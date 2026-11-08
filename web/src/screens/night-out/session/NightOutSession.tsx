import { useEffect, useRef, useState } from 'react';
import {
  useNightOut,
  type ConsentGrant,
  type ConsentScope,
  type DriverEndReason,
  type EpochMs,
  type Invite,
  type SharingScope,
} from '../../../features/night-out/api';
import { pickContactPhone, smsHref, supportsContactPicker } from '../../../lib/contacts';
import { inviteMessage, inviteUrl, shareInvite } from '../../../lib/invite';
import { PrivacyLink } from '../../../features/legal';
import { Avatar } from '../../../ui';
import './session.css';

type Props = { sessionId: string; onBack: () => void };

const SCOPES: { id: ConsentScope; label: string }[] = [
  { id: 'location_precise', label: 'Precise location' },
  { id: 'location_approximate', label: 'Approximate location' },
  { id: 'checkins', label: 'Check-ins' },
  { id: 'concern_reports', label: 'Concern reports' },
  { id: 'messaging', label: 'Messaging' },
];
const scopeLabel = (s: ConsentScope) => SCOPES.find(x => x.id === s)?.label ?? s;

const SHARING: { id: SharingScope; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'approximate', label: 'Approx' },
  { id: 'precise', label: 'Precise' },
];
const sharingLabel = (s: SharingScope) =>
  s === 'none' ? 'Not sharing' : s === 'approximate' ? 'Sharing approx' : 'Sharing precise';
const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

function relFuture(at: EpochMs, now: number): string {
  const diff = at - now;
  const m = Math.round(Math.abs(diff) / 60000);
  const text =
    m < 1 ? 'less than a minute' : m < 60 ? `${m} min` : m < 2880 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`;
  return diff >= 0 ? `in ${text}` : `${text} ago`;
}

type ConfirmProps = { show: boolean; busy: boolean; text: string; label: string; onYes: () => void; onCancel: () => void };
function ConfirmStep({ show, busy, text, label, onYes, onCancel }: ConfirmProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (show) ref.current?.focus();
  }, [show]);
  if (!show) return null;
  return (
    <div className="nos-confirm" role="group" aria-label={`Confirm: ${label}`} tabIndex={-1} ref={ref}>
      <p>{text}</p>
      <div className="nos-actions">
        <button type="button" className="btn danger" disabled={busy} onClick={onYes}>{label}</button>
        <button type="button" className="btn secondary" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

export function NightOutSession({ sessionId, onBack }: Props) {
  const api = useNightOut();
  const { actions, me, myConsents } = api;
  const roster = api.roster(sessionId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [newInvite, setNewInvite] = useState<Invite | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const [privOpen, setPrivOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const privRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (sheet) sheetRef.current?.focus();
  }, [sheet]);
  useEffect(() => {
    if (privOpen) privRef.current?.focus();
  }, [privOpen]);

  const mockBadge = api.mocked ? <span className="badge sim">MOCK</span> : null;

  if (!roster) {
    return (
      <section className="nos-session">
        {mockBadge}
        <p>You are not in this session</p>
        <button type="button" className="nos-back" onClick={onBack}>‹ Tonight</button>
      </section>
    );
  }

  const now = Date.now();
  const { session, members, drivers, invites } = roster;
  const active = members.filter(m => m.leftAt === null);
  const departed = members.filter(m => m.leftAt !== null);
  const meMember = active.find(m => m.userId === me);
  const isOrganizer = meMember?.role === 'organizer';
  const openDriver = drivers.find(d => d.endedAt === null) ?? null;
  const nameOf = (id: string) => members.find(m => m.userId === id)?.displayName ?? id;
  const others = active.filter(m => m.userId !== me);
  const orderedActive = [...active.filter(m => m.userId === me), ...others];

  async function run(fn: () => Promise<unknown>, after?: () => void) {
    // Ignore input while an action is in flight; disabling the fieldsets instead would drop keyboard focus.
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
      setConfirm(null);
      after?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied('Copied');
    } catch {
      setCopied('Copy failed — select the code manually');
    }
  }

  async function share(code: string) {
    try {
      const r = await shareInvite(session.name, code);
      setCopied(r === 'copied' ? 'Invite link copied' : r === 'shared' ? 'Invite shared' : null);
    } catch {
      setCopied('Sharing is unavailable here. Copy the code instead.');
    }
  }

  async function inviteContact(code: string) {
    try {
      const c = await pickContactPhone();
      if (!c) return;
      const body = `${inviteMessage(session.name, code)}\n${inviteUrl(window.location.href, code)}`;
      window.location.href = smsHref(c.tel, body);
      setCopied(`Opening Messages for ${c.name}`);
    } catch {
      setCopied('Contacts are unavailable. Use Share instead.');
    }
  }

  const activeGrant = (g: ConsentGrant) => g.revokedAt === null && g.expiresAt > now;
  const myGrant = (recipient: string, scope: ConsentScope) =>
    myConsents.find(
      g => g.subject === me && g.recipient === recipient && g.sessionId === sessionId && g.scope === scope && activeGrant(g),
    );
  const sharedWithMe = myConsents.filter(g => g.recipient === me && g.sessionId === sessionId && activeGrant(g));
  const activeInvites = invites.filter(i => i.revokedAt === null && i.expiresAt > now && i.uses < i.maxUses);
  const shownInvite = newInvite && activeInvites.some(i => i.id === newInvite.id) ? newInvite : (activeInvites[0] ?? null);

  function driverState(userId: string): string | null {
    if (!openDriver || openDriver.driverId !== userId) return null;
    return openDriver.acceptedAt === null ? 'Volunteered, awaiting acceptance' : 'Driver ✓';
  }
  const iAmDriver = !!openDriver && openDriver.driverId === me;

  const endDriver = (reason: DriverEndReason) => {
    if (openDriver) void run(() => actions.endDriverRole(openDriver.id, reason));
  };
  const cancel = () => setConfirm(null);

  function toggleInvite() {
    if (sheet) {
      setSheet(false);
      return;
    }
    setSheet(true);
    setCopied(null);
    if (activeInvites.length === 0) {
      void run(async () => {
        setNewInvite(await actions.createInvite(sessionId, 60, 6));
      });
    }
  }

  return (
    <div className="nos-session">
      <header className="nos-head">
        <button type="button" className="nos-back" onClick={onBack}>‹ Tonight</button>
        <h2 id="nos-title">{session.name}{mockBadge}</h2>
        <p>
          {session.venueHint ? `${session.venueHint} · ` : ''}
          {session.status === 'ended' || session.status === 'expired' ? session.status : 'until'} {clock(session.expiresAt)}
        </p>
      </header>

      {error && <div className="result err" role="alert">{error}</div>}

      <section aria-labelledby="nos-roster">
        <h3 id="nos-roster" className="nos-label">People</h3>
        <ul className="nos-group">
          {orderedActive.map(m => {
            const sub = [
              m.userId === me ? 'You' : null,
              m.role === 'organizer' ? 'Organizer' : null,
              driverState(m.userId),
              sharingLabel(m.sharingScope),
            ].filter(Boolean).join(' · ');
            return (
              <li key={m.id} className="nos-person">
                <Avatar userId={m.userId} name={m.displayName} size={40} />
                <span className="nos-pm">
                  <span className="nos-name">{m.displayName}</span>
                  <span className="nos-sub">{sub}</span>
                </span>
              </li>
            );
          })}
        </ul>
        {departed.length > 0 && (
          <p className="nos-sub" style={{ margin: '0.4rem 0 0 0.4rem' }}>
            Left: {departed.map(m => m.displayName).join(', ')}
          </p>
        )}
      </section>

      <section aria-label="Actions">
        <div className="nos-primary">
          {isOrganizer && (
            <button type="button" className="btn" disabled={busy} aria-expanded={sheet} onClick={toggleInvite}>
              Invite friends
            </button>
          )}
          {!openDriver && (
            <button type="button" className="btn secondary" disabled={busy || !meMember} onClick={() => void run(() => actions.volunteerDriver(sessionId))}>
              I'll drive
            </button>
          )}
          {openDriver && iAmDriver && openDriver.acceptedAt === null && (
            <button type="button" className="btn" disabled={busy} onClick={() => void run(() => actions.acceptDriverRole(openDriver.id))}>
              Accept driving
            </button>
          )}
          {openDriver && iAmDriver && openDriver.acceptedAt !== null && (
            <span className="nos-pill">You're the driver</span>
          )}
        </div>
        {openDriver && iAmDriver && openDriver.acceptedAt === null && (
          <p className="nos-sub">Volunteering does not make you the driver. Nobody is relying on you until you accept.</p>
        )}
        {openDriver && iAmDriver && openDriver.acceptedAt !== null && (
          <>
            <button type="button" className="nos-link" disabled={busy} onClick={() => setConfirm('driver-quit')}>
              Can't drive anymore
            </button>
            <ConfirmStep
              show={confirm === 'driver-quit'}
              busy={busy}
              text="Tell the group you can no longer drive?"
              label="Yes, I can't drive"
              onYes={() => endDriver('cannot_drive')}
              onCancel={cancel}
            />
          </>
        )}
        {openDriver && isOrganizer && !iAmDriver && (
          <>
            <button type="button" className="nos-link" disabled={busy} onClick={() => setConfirm('driver-remove')}>
              Remove driver
            </button>
            <ConfirmStep
              show={confirm === 'driver-remove'}
              busy={busy}
              text={`Remove ${nameOf(openDriver.driverId)} as driver?`}
              label="Remove driver"
              onYes={() => endDriver('replaced')}
              onCancel={cancel}
            />
          </>
        )}
        {isOrganizer && sheet && (
          <div className="nos-sheet" role="group" aria-label="Invite code" tabIndex={-1} ref={sheetRef}>
            {shownInvite ? (
              <>
                <p className="nos-code"><span className="sr-only">Invite code </span>{shownInvite.code}</p>
                <p className="nos-sub">
                  Expires {relFuture(shownInvite.expiresAt, now)} · {shownInvite.uses}/{shownInvite.maxUses} uses
                </p>
                <div className="nos-share">
                  <button type="button" className="btn block" onClick={() => void share(shownInvite.code)}>
                    <ShareIcon /> Share invite link
                  </button>
                  {supportsContactPicker() && (
                    <button type="button" className="btn secondary block" onClick={() => void inviteContact(shownInvite.code)}>
                      Invite from contacts
                    </button>
                  )}
                </div>
                <div className="nos-actions">
                  <button type="button" className="btn plain small-btn" onClick={() => void copy(shownInvite.code)}>Copy code</button>
                  <button type="button" className="btn plain small-btn red" disabled={busy} onClick={() => void run(() => actions.revokeInvite(shownInvite.id))}>
                    Revoke<span className="sr-only"> {shownInvite.code}</span>
                  </button>
                </div>
                <p className="nos-sub">Friends join with the link or the code. Nothing is shared until they choose.</p>
                <p className="nos-sub" role="status">{copied ?? ''}</p>
              </>
            ) : (
              <p className="nos-sub" role="status">Creating invite…</p>
            )}
            <button type="button" className="nos-link" onClick={() => setSheet(false)}>Done</button>
          </div>
        )}
      </section>

      <section aria-label="Privacy">
        <h3 className="nos-label">Privacy</h3>
        <button
          type="button"
          className="nos-disc"
          aria-expanded={privOpen}
          aria-controls="nos-priv"
          onClick={() => setPrivOpen(o => !o)}
        >
          <span>What I share</span>
          <span className="nos-sub">{sharingLabel(meMember?.sharingScope ?? 'none')} {privOpen ? '⌃' : '›'}</span>
        </button>
        {privOpen && (
          <div id="nos-priv" className="nos-privbody" tabIndex={-1} ref={privRef} role="group" aria-label="Sharing settings">
            <fieldset className="nos-fs" disabled={!meMember} aria-busy={busy}>
              <legend>My location</legend>
              <div className="nos-seg">
                {SHARING.map(s => (
                  <label key={s.id}>
                    <input
                      type="radio"
                      name={`sharing-${sessionId}`}
                      checked={(meMember?.sharingScope ?? 'none') === s.id}
                      onChange={() => void run(() => actions.setSharingScope(sessionId, s.id))}
                    />
                    {s.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <p className="nos-sub">Each toggle grants that person access for 5 hours. Turn it off to revoke. <PrivacyLink label="How we use your location" /></p>
            {others.length === 0 && <p className="nos-sub">No other members yet.</p>}
            {others.map(m => (
              <fieldset key={m.id} className="nos-fs" aria-busy={busy}>
                <legend>Share with {m.displayName}</legend>
                {SCOPES.map(sc => {
                  const grant = myGrant(m.userId, sc.id);
                  return (
                    <label key={sc.id} className="nos-check">
                      <span>{sc.label}</span>
                      <input
                        type="checkbox"
                        role="switch"
                        className="sn-switch"
                        checked={!!grant}
                        onChange={() =>
                          void run(() => (grant ? actions.revokeConsent(grant.id) : actions.grantConsent(m.userId, sessionId, sc.id, 300)))
                        }
                      />
                    </label>
                  );
                })}
              </fieldset>
            ))}
            <div>
              <p className="nos-name">Shared with you</p>
              {sharedWithMe.length === 0 ? (
                <p className="nos-sub">Nobody is sharing with you yet.</p>
              ) : (
                <ul className="list">
                  {sharedWithMe.map(g => (
                    <li key={g.id}>
                      <span>{nameOf(g.subject)}: {scopeLabel(g.scope)}</span>
                      <span className="nos-sub">expires {relFuture(g.expiresAt, now)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </section>

      <footer className="nos-footer">
        {isOrganizer ? (
          <>
            <button type="button" className="nos-destroy" disabled={busy} onClick={() => setConfirm('end')}>
              End hangout for everyone
            </button>
            <ConfirmStep
              show={confirm === 'end'}
              busy={busy}
              text="This ends the hangout for all members and stops all sharing."
              label="Yes, end it"
              onYes={() => void run(() => actions.endSession(sessionId), onBack)}
              onCancel={cancel}
            />
          </>
        ) : (
          <>
            <button type="button" className="nos-destroy" disabled={busy || !meMember} onClick={() => setConfirm('leave')}>
              Leave hangout
            </button>
            <ConfirmStep
              show={confirm === 'leave'}
              busy={busy}
              text="You will leave this hangout and stop sharing with it."
              label="Yes, leave"
              onYes={() => void run(() => actions.leaveSession(sessionId), onBack)}
              onCancel={cancel}
            />
          </>
        )}
      </footer>
    </div>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </svg>
  );
}

export default NightOutSession;
