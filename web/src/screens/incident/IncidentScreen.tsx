import { useEffect, useRef, useState } from 'react';
import { useNightOut } from '../../features/night-out/api';
import { INCIDENT_STATUS_LABELS, useSafety, type IncidentEvent } from '../../features/safety/api';
import { ago, KIND_LABELS } from './time';
import './incident.css';

type Props = { incidentId: string; onBack: () => void };

const EVENT_TEXT: Record<string, string> = {
  opened: 'opened this incident',
  acknowledged: 'acknowledged',
  subject_says_fine: 'says they are fine',
  resolved: 'resolved this incident',
  cancelled: 'cancelled this incident',
};

function eventText(e: IncidentEvent): string {
  const base = EVENT_TEXT[e.kind] ?? e.kind.replace(/_/g, ' ');
  return e.detail ? `${base}: ${e.detail}` : base;
}

const clock = (at: number) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export default function IncidentScreen({ incidentId, onBack }: Props) {
  const { me, incidents, timeline, actions, mocked } = useSafety();
  const incident = incidents.find(i => i.id === incidentId) ?? null;
  const events = timeline(incidentId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'none' | 'resolve' | 'cancel'>('none');
  const [text, setText] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [announce, setAnnounce] = useState('');
  const seen = useRef<number | null>(null);
  const { myConsents } = useNightOut();
  const noteRef = useRef<HTMLInputElement>(null);
  const reasonRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode === 'resolve') noteRef.current?.focus();
    else if (mode === 'cancel') reasonRef.current?.focus();
  }, [mode]);

  useEffect(() => {
    if (seen.current === null) {
      seen.current = events.length;
      return;
    }
    if (events.length > seen.current) {
      const e = events[events.length - 1];
      setAnnounce(`${e.actorName} ${eventText(e)}`);
    }
    seen.current = events.length;
  }, [events.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const mine = incident?.participants.find(p => p.userId === me);
  if (!incident || (events.length === 0 && !mine)) {
    return (
      <section className="incident-screen">
        <button type="button" className="btn" onClick={onBack}>← Back</button>
        <p role="status">You are not part of this incident</p>
      </section>
    );
  }

  const isSubject = incident.subject === me;
  const closed = ['resolved', 'cancelled', 'handed_off'].includes(incident.status);
  const canAck =
    !!mine && mine.role !== 'subject' && mine.acknowledgedAt === null && incident.status === 'open' && !closed;
  const now = Date.now();
  const hasGrant = (scope: string) =>
    myConsents.some(
      c =>
        c.subject === incident.subject &&
        c.recipient === me &&
        c.revokedAt === null &&
        c.expiresAt > now &&
        c.sessionId === incident.sessionId &&
        c.scope === scope,
    );
  const canResolve =
    isSubject ||
    (!!mine && (mine.role === 'organizer' || mine.role === 'buddy') && hasGrant('messaging') && hasGrant('checkins'));
  const canCancel = isSubject && !closed && Date.now() - incident.openedAt <= 120_000;
  const resolvedByName = incident.resolvedBy
    ? (incident.participants.find(p => p.userId === incident.resolvedBy)?.displayName ?? incident.resolvedBy)
    : null;

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setMode('none');
      setText('');
      setConfirming(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  function openMode(m: 'resolve' | 'cancel') {
    setMode(m);
    setText('');
    setConfirming(false);
    setError(null);
  }

  return (
    <section className="incident-screen">
      <button type="button" className="btn" onClick={onBack}>← Back</button>
      <header>
        <h2>{KIND_LABELS[incident.kind] ?? incident.kind}</h2>
        <p className="inc-subject">{incident.subjectName}</p>
        <div className="inc-badges">
          <span className={`inc-pill sev-${incident.severity}`}>{incident.severity}</span>
          <span className="inc-pill">{INCIDENT_STATUS_LABELS[incident.status]}</span>
          {mocked && <span className="inc-pill">MOCK DATA</span>}
        </div>
        <p className="muted small">Opened {ago(incident.openedAt)}</p>
        {incident.status === 'resolved' && resolvedByName && (
          <p className="inc-resolved">Resolved by {resolvedByName}</p>
        )}
      </header>

      <h3>Participants</h3>
      <ul className="inc-list">
        {incident.participants.map(p => (
          <li key={p.userId}>
            <strong>{p.displayName}</strong> <span className="muted">({p.role})</span>
            <div className="small muted">
              {p.acknowledgedAt !== null ? `Acknowledged ${ago(p.acknowledgedAt)}` : 'Not yet acknowledged'}
            </div>
          </li>
        ))}
      </ul>

      {error && <p role="alert" className="inc-error">{error}</p>}

      {!closed && mode === 'none' && (
        <div className="inc-actions">
          {canAck && (
            <button
              type="button"
              className="btn inc-primary"
              disabled={busy}
              onClick={() => run(() => actions.acknowledgeIncident(incident.id))}
            >
              Acknowledge
            </button>
          )}
          {canResolve && (
            <button type="button" className="btn inc-primary" disabled={busy} onClick={() => openMode('resolve')}>
              {isSubject ? "I'm safe — resolve" : 'Resolve'}
            </button>
          )}
          {canCancel && (
            <button type="button" className="btn" disabled={busy} onClick={() => openMode('cancel')}>
              Cancel incident
            </button>
          )}
        </div>
      )}

      {mode === 'resolve' && (
        <form
          className="inc-form"
          onSubmit={ev => {
            ev.preventDefault();
            if (!text.trim() || busy) return;
            if (!confirming) {
              setConfirming(true);
              return;
            }
            void run(() => actions.resolveIncident(incident.id, text.trim()));
          }}
        >
          <label htmlFor="inc-note">Short note (required)</label>
          <input
            id="inc-note"
            ref={noteRef}
            value={text}
            maxLength={200}
            onChange={e => {
              setText(e.target.value);
              setConfirming(false);
            }}
          />
          {confirming && (
            <p>
              {isSubject
                ? 'Confirm you are safe and want to close this incident?'
                : 'Confirm you want to resolve this incident?'}
            </p>
          )}
          <div className="inc-actions">
            <button type="submit" className="btn inc-primary" disabled={busy || !text.trim()}>
              {confirming ? 'Yes, resolve' : 'Continue'}
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => setMode('none')}>Back</button>
          </div>
        </form>
      )}

      {mode === 'cancel' && (
        <form
          className="inc-form"
          onSubmit={ev => {
            ev.preventDefault();
            if (text.trim() && !busy) void run(() => actions.cancelIncident(incident.id, text.trim()));
          }}
        >
          <label htmlFor="inc-reason">Reason for cancelling</label>
          <input id="inc-reason" ref={reasonRef} value={text} maxLength={200} onChange={e => setText(e.target.value)} />
          <div className="inc-actions">
            <button type="submit" className="btn inc-primary" disabled={busy || !text.trim()}>
              Cancel incident
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => setMode('none')}>Back</button>
          </div>
        </form>
      )}

      <h3>Timeline</h3>
      <div className="inc-sr" aria-live="polite" role="status">{announce}</div>
      {events.length === 0 ? (
        <p className="muted">No events yet.</p>
      ) : (
        <ol className="inc-list">
          {events.map(e => (
            <li key={e.id}>
              <time dateTime={new Date(e.at).toISOString()} className="small muted">{clock(e.at)}</time>{' '}
              <strong>{e.actorName}</strong> {eventText(e)}
              {e.simulated && <span className="inc-pill inc-sim">SIMULATED</span>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
