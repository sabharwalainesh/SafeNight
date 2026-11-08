import { useEffect, useRef, useState } from 'react';
import { useNightOut } from '../../features/night-out/api';
import { INCIDENT_STATUS_LABELS, useSafety, type IncidentEvent } from '../../features/safety/api';
import { AgentPanel } from '../../features/agent-panel';
import { HomeConfirm, RidePanel } from '../../features/rides';
import { CoordinationPanel } from '../../features/coordination';
import { MeetupPanel, useIsMeetupIncident } from '../../features/meetup'; // meetup feature: "Come to me" compass
import { Pill, Row, Section } from '../../ui';
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
  const [showAllEvents, setShowAllEvents] = useState(false);
  const [details, setDetails] = useState(false); // meetup feature: focused screen hides the rest until asked
  const isMeetup = useIsMeetupIncident(incidentId);
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
      <div className="incident-screen">
        <button type="button" className="btn plain back-link" onClick={onBack}>‹ Back</button>
        <p role="status">You are not part of this incident</p>
      </div>
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

  const shownEvents = showAllEvents ? events : events.slice(-5);
  const primaryIsResolve = !canAck;

  // meetup feature: a "Come to me" request gets one screen with one action; everything else is behind Details.
  if (isMeetup && !closed && !details) {
    return (
      <div className="incident-screen incident-meetup">
        <button type="button" className="btn plain back-link" onClick={onBack}>‹ Back</button>
        <header className="inc-head">
          <h2 className="large-title">Come to me</h2>
          <p className="muted footnote">{incident.subjectName} · {ago(incident.openedAt)}</p>
        </header>
        <MeetupPanel incidentId={incident.id} focused />
        <div className="inc-actions">
          {isSubject && (
            <button type="button" className="btn secondary block" disabled={busy} onClick={() => run(() => actions.resolveIncident(incident.id, "I'm safe"))}>
              I&apos;m safe — close this
            </button>
          )}
          <button type="button" className="btn plain small-btn" onClick={() => setDetails(true)}>Details</button>
        </div>
        {error && <p role="alert" className="inc-error">{error}</p>}
      </div>
    );
  }

  return (
    <div className="incident-screen">
      <button type="button" className="btn plain back-link" onClick={() => (isMeetup && !closed && details ? setDetails(false) : onBack())}>‹ Back</button>
      <header className="inc-head">
        <h2 className="large-title">{KIND_LABELS[incident.kind] ?? incident.kind}</h2>
        <p className="inc-sub">
          <span className="headline">{incident.subjectName}</span>
          <Pill tone={incident.severity === 'urgent' ? 'danger' : incident.severity === 'elevated' ? 'warn' : 'neutral'}>
            {incident.severity}
          </Pill>
          <Pill tone={incident.status === 'resolved' ? 'ok' : 'info'}>{INCIDENT_STATUS_LABELS[incident.status]}</Pill>
          {mocked && <span className="badge sim">MOCK DATA</span>}
        </p>
        <p className="muted footnote">Opened {ago(incident.openedAt)}</p>
        {incident.status === 'resolved' && resolvedByName && (
          <p className="inc-resolved">Resolved by {resolvedByName}</p>
        )}
      </header>

      <HomeConfirm incidentId={incident.id} />

      <Section title="What's happening">
        <div className="inc-sr" aria-live="polite" role="status">{announce}</div>
        {events.length === 0 ? (
          <p className="inc-empty">No events yet.</p>
        ) : (
          <ol className="inc-events">
            {shownEvents.map(e => (
              <li key={e.id}>
                <time dateTime={new Date(e.at).toISOString()} className="footnote muted">{clock(e.at)}</time>{' '}
                <strong>{e.actorName}</strong> {eventText(e)}
                {e.simulated && <> <Pill tone="warn">SIMULATED</Pill></>}
              </li>
            ))}
          </ol>
        )}
        {events.length > 5 && (
          <button type="button" className="btn plain small-btn inc-more" aria-expanded={showAllEvents} onClick={() => setShowAllEvents(v => !v)}>
            {showAllEvents ? 'Show fewer' : `Show all (${events.length})`}
          </button>
        )}
      </Section>

      <AgentPanel incidentId={incident.id} />
      <MeetupPanel incidentId={incident.id} />
      <RidePanel incidentId={incident.id} />
      <CoordinationPanel incidentId={incident.id} />

      <Section title="People">
        {incident.participants.map(p => (
          <Row
            key={p.userId}
            label={
              <>
                <span className="headline">{p.displayName}</span> <span className="muted subhead">({p.role})</span>
              </>
            }
            value={
              p.acknowledgedAt !== null ? (
                <Pill tone="ok">Acknowledged {ago(p.acknowledgedAt)}</Pill>
              ) : (
                <span className="footnote">Not yet acknowledged</span>
              )
            }
          />
        ))}
      </Section>

      {error && <p role="alert" className="inc-error">{error}</p>}

      {!closed && mode === 'none' && (canAck || canResolve || canCancel) && (
        <div className="inc-actions">
          {canAck && (
            <button
              type="button"
              className="btn block"
              disabled={busy}
              onClick={() => run(() => actions.acknowledgeIncident(incident.id))}
            >
              Acknowledge
            </button>
          )}
          {canResolve && (
            <button
              type="button"
              className={primaryIsResolve ? 'btn block' : 'btn secondary block'}
              disabled={busy}
              onClick={() => openMode('resolve')}
            >
              {isSubject ? "I'm safe — resolve" : 'Resolve'}
            </button>
          )}
          {canCancel && (
            <button type="button" className="btn plain inc-cancel" disabled={busy} onClick={() => openMode('cancel')}>
              Cancel incident
            </button>
          )}
        </div>
      )}

      {mode === 'resolve' && (
        <form
          className="card inc-form"
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
            <button type="submit" className="btn block" disabled={busy || !text.trim()}>
              {confirming ? 'Yes, resolve' : 'Continue'}
            </button>
            <button type="button" className="btn plain" disabled={busy} onClick={() => setMode('none')}>Back</button>
          </div>
        </form>
      )}

      {mode === 'cancel' && (
        <form
          className="card inc-form"
          onSubmit={ev => {
            ev.preventDefault();
            if (text.trim() && !busy) void run(() => actions.cancelIncident(incident.id, text.trim()));
          }}
        >
          <label htmlFor="inc-reason">Reason for cancelling</label>
          <input id="inc-reason" ref={reasonRef} value={text} maxLength={200} onChange={e => setText(e.target.value)} />
          <div className="inc-actions">
            <button type="submit" className="btn block" disabled={busy || !text.trim()}>
              Cancel incident
            </button>
            <button type="button" className="btn plain" disabled={busy} onClick={() => setMode('none')}>Back</button>
          </div>
        </form>
      )}
    </div>
  );
}
