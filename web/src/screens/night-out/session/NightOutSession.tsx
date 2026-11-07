import { useState } from 'react';
import {
  useNightOut,
  type ConsentGrant,
  type ConsentScope,
  type DriverEndReason,
  type EpochMs,
  type Invite,
  type SharingScope,
} from '../../../features/night-out/api';
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
  { id: 'none', label: 'Not sharing' },
  { id: 'approximate', label: 'Approximate' },
  { id: 'precise', label: 'Precise' },
];
const sharingLabel = (s: SharingScope) => SHARING.find(x => x.id === s)?.label ?? s;

function relFuture(at: EpochMs, now: number): string {
  const diff = at - now;
  const m = Math.round(Math.abs(diff) / 60000);
  const text =
    m < 1 ? 'less than a minute' : m < 60 ? `${m} min` : m < 2880 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`;
  return diff >= 0 ? `in ${text}` : `${text} ago`;
}

type ConfirmProps = { show: boolean; busy: boolean; text: string; label: string; onYes: () => void; onCancel: () => void };
function ConfirmStep({ show, busy, text, label, onYes, onCancel }: ConfirmProps) {
  if (!show) return null;
  return (
    <div className="nos-confirm" role="group" aria-label="Confirm">
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

  const mockBadge = api.mocked ? <span className="badge sim">MOCK DATA — C1-A pending</span> : null;

  if (!roster) {
    return (
      <section className="card nos">
        {mockBadge}
        <p>You are not in this session</p>
        <button type="button" className="btn" onClick={onBack}>Back</button>
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

  async function run(fn: () => Promise<unknown>, after?: () => void) {
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

  const activeGrant = (g: ConsentGrant) => g.revokedAt === null && g.expiresAt > now;
  const myGrant = (recipient: string, scope: ConsentScope) =>
    myConsents.find(
      g => g.subject === me && g.recipient === recipient && g.sessionId === sessionId && g.scope === scope && activeGrant(g),
    );
  const sharedWithMe = myConsents.filter(g => g.recipient === me && g.sessionId === sessionId && activeGrant(g));
  const activeInvites = invites.filter(i => i.revokedAt === null && i.expiresAt > now && i.uses < i.maxUses);

  function driverState(userId: string): string | null {
    if (!openDriver || openDriver.driverId !== userId) return null;
    return openDriver.acceptedAt === null ? 'Volunteered — awaiting acceptance' : 'Driver';
  }

  const endDriver = (reason: DriverEndReason) => {
    if (openDriver) void run(() => actions.endDriverRole(openDriver.id, reason));
  };
  const cancel = () => setConfirm(null);

  return (
    <div className="nos">
      <section className="card nos-head" aria-labelledby="nos-title">
        <div><button type="button" className="btn secondary" onClick={onBack}>← Back</button></div>
        <h2 id="nos-title">{session.name}</h2>
        <p className="muted">{session.venueHint}</p>
        <div className="nos-row">
          <span className="badge">{session.status}</span>
          <span className="badge">Ends {relFuture(session.expiresAt, now)}</span>
          {mockBadge}
        </div>
      </section>

      {error && <div className="result err" role="alert">{error}</div>}

      <section className="card" aria-labelledby="nos-roster">
        <h2 id="nos-roster">Roster</h2>
        <ul className="list nos-members">
          {active.map(m => {
            const ds = driverState(m.userId);
            return (
              <li key={m.id}>
                <span className="nos-name">{m.displayName}{m.userId === me ? ' (you)' : ''}</span>
                {m.role === 'organizer' && <span className="badge">Organizer</span>}
                <span className="badge">{sharingLabel(m.sharingScope)}</span>
                {ds && <span className="badge">{ds}</span>}
              </li>
            );
          })}
        </ul>
        {departed.length > 0 && (
          <details className="nos-left">
            <summary>Left ({departed.length})</summary>
            <ul className="list">
              {departed.map(m => (
                <li key={m.id}><span className="muted">{m.displayName}</span><span className="badge">Left</span></li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {isOrganizer && (
        <section className="card" aria-labelledby="nos-invite">
          <h2 id="nos-invite">Invite</h2>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                setNewInvite(await actions.createInvite(sessionId, 60, 6));
                setCopied(null);
              })
            }
          >
            Create invite (60 min, 6 uses)
          </button>
          {newInvite && (
            <div>
              <p className="nos-code" aria-label="Invite code">{newInvite.code}</p>
              <p className="muted small">
                Expires {relFuture(newInvite.expiresAt, now)} · {newInvite.uses}/{newInvite.maxUses} uses
              </p>
              <button type="button" className="btn secondary" onClick={() => void copy(newInvite.code)}>Copy code</button>
              {copied && <p className="small" role="status">{copied}</p>}
            </div>
          )}
          <h3>Active invites</h3>
          {activeInvites.length === 0 ? (
            <p className="muted small">No active invites.</p>
          ) : (
            <ul className="list">
              {activeInvites.map(i => (
                <li key={i.id}>
                  <span>
                    <code>{i.code}</code>{' '}
                    <span className="muted small">{i.uses}/{i.maxUses} uses · expires {relFuture(i.expiresAt, now)}</span>
                  </span>
                  <button type="button" className="btn secondary" disabled={busy} onClick={() => void run(() => actions.revokeInvite(i.id))}>
                    Revoke<span className="sr-only"> {i.code}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="card" aria-labelledby="nos-driver">
        <h2 id="nos-driver">Driver</h2>
        {!openDriver && (
          <>
            <p className="muted">No driver yet.</p>
            <button type="button" className="btn" disabled={busy || !meMember} onClick={() => void run(() => actions.volunteerDriver(sessionId))}>
              I can drive tonight
            </button>
          </>
        )}
        {openDriver && (
          <p>
            {nameOf(openDriver.driverId)}: {driverState(openDriver.driverId)}
          </p>
        )}
        {openDriver && openDriver.driverId === me && openDriver.acceptedAt === null && (
          <>
            <p className="muted small">
              Volunteering does not make you the driver. Nobody is relying on you until you explicitly accept the role.
            </p>
            <button type="button" className="btn" disabled={busy} onClick={() => void run(() => actions.acceptDriverRole(openDriver.id))}>
              Accept driver role
            </button>
          </>
        )}
        {openDriver && openDriver.driverId === me && openDriver.acceptedAt !== null && (
          <>
            <button type="button" className="btn secondary" disabled={busy} onClick={() => setConfirm('driver-quit')}>
              I can no longer drive
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
        {openDriver && isOrganizer && openDriver.driverId !== me && (
          <>
            <div className="nos-actions">
              <button type="button" className="btn secondary" disabled={busy} onClick={() => setConfirm('driver-remove')}>
                Remove driver
              </button>
            </div>
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
      </section>

      <section className="card" aria-labelledby="nos-sharing">
        <h2 id="nos-sharing">My sharing</h2>
        <fieldset disabled={busy || !meMember}>
          <legend>What I share with this session</legend>
          {SHARING.map(s => (
            <label key={s.id} className="nos-check">
              <input
                type="radio"
                name={`sharing-${sessionId}`}
                checked={(meMember?.sharingScope ?? 'none') === s.id}
                onChange={() => void run(() => actions.setSharingScope(sessionId, s.id))}
              />
              {s.label}
            </label>
          ))}
        </fieldset>
      </section>

      <section className="card" aria-labelledby="nos-consent">
        <h2 id="nos-consent">Consent</h2>
        <p className="muted small">Each toggle grants that person access for 5 hours. Turn it off to revoke.</p>
        {others.length === 0 && <p className="muted">No other members yet.</p>}
        {others.map(m => (
          <fieldset key={m.id} disabled={busy}>
            <legend>Share with {m.displayName}</legend>
            {SCOPES.map(sc => {
              const grant = myGrant(m.userId, sc.id);
              return (
                <label key={sc.id} className="nos-check">
                  <input
                    type="checkbox"
                    checked={!!grant}
                    onChange={() =>
                      void run(() => (grant ? actions.revokeConsent(grant.id) : actions.grantConsent(m.userId, sessionId, sc.id, 300)))
                    }
                  />
                  {sc.label}
                </label>
              );
            })}
          </fieldset>
        ))}
        <h3>Shared with you</h3>
        {sharedWithMe.length === 0 ? (
          <p className="muted small">Nobody is sharing with you yet.</p>
        ) : (
          <ul className="list">
            {sharedWithMe.map(g => (
              <li key={g.id}>
                <span>{nameOf(g.subject)}: {scopeLabel(g.scope)}</span>
                <span className="muted small">expires {relFuture(g.expiresAt, now)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card" aria-labelledby="nos-leave">
        <h2 id="nos-leave">{isOrganizer ? 'End session' : 'Leave session'}</h2>
        {isOrganizer ? (
          <>
            <button type="button" className="btn danger" disabled={busy} onClick={() => setConfirm('end')}>
              End session for everyone
            </button>
            <ConfirmStep
              show={confirm === 'end'}
              busy={busy}
              text="This ends the session for all members and stops all sharing."
              label="Yes, end it"
              onYes={() => void run(() => actions.endSession(sessionId), onBack)}
              onCancel={cancel}
            />
          </>
        ) : (
          <>
            <button type="button" className="btn danger" disabled={busy || !meMember} onClick={() => setConfirm('leave')}>
              Leave session
            </button>
            <ConfirmStep
              show={confirm === 'leave'}
              busy={busy}
              text="You will leave this session and stop sharing with it."
              label="Yes, leave"
              onYes={() => void run(() => actions.leaveSession(sessionId), onBack)}
              onCancel={cancel}
            />
          </>
        )}
      </section>
    </div>
  );
}

export default NightOutSession;
