import { useState } from 'react';
import { CHECKIN_LABELS, useSafety } from '../safety/api';
import type { CheckinKind } from '../safety/api';
import { ConcernSheet } from './ConcernSheet';
import { HoldButton } from './HoldButton';
import './status.css';

const QUICK: CheckinKind[] = ['okay', 'need_friend', 'need_ride', 'unwell'];

export function StatusBar() {
  const { sessionId, me, incidents, actions } = useSafety();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const [openNote, setOpenNote] = useState(false);

  if (!sessionId) return null;

  async function send(kind: CheckinKind) {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      await actions.checkIn(kind, '');
      setResult(`Sent: ${CHECKIN_LABELS[kind]}.`);
      setOpenNote(
        kind === 'okay' &&
          incidents.some((i) => i.subject === me && i.status !== 'resolved' && i.status !== 'cancelled'),
      );
    } catch (e) {
      setOpenNote(false);
      setError(e instanceof Error ? e.message : 'Could not send. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="status-bar" aria-label="Your status">
      {error && <p role="alert" className="status-error">{error}</p>}
      <p role="status" className="status-result">
        {!error && result}
        {!error && result && openNote && ' Recorded. Your open alert stays open until someone confirms you are safe.'}
      </p>
      <div className="status-row">
        {QUICK.map((k) => (
          <button key={k} type="button" className="status-btn" disabled={busy} onClick={() => send(k)}>
            {CHECKIN_LABELS[k]}
          </button>
        ))}
        <button type="button" className="status-btn status-home" disabled={busy} onClick={() => send('home')}>
          {CHECKIN_LABELS.home}
        </button>
        <button type="button" className="status-btn status-link" onClick={() => setSheet(true)}>
          Report a concern
        </button>
      </div>
      <HoldButton
        label="Hold for Emergency"
        describedBy="status-hold-help"
        disabled={busy}
        onConfirm={() => send('emergency')}
      />
      <p id="status-hold-help" className="status-help">
        Press and hold for 1.5 seconds. Releasing early cancels.
      </p>
      <ConcernSheet open={sheet} onClose={() => setSheet(false)} />
    </section>
  );
}
