import { SafetyNote } from '../legal';
import { useEffect, useRef, useState } from 'react';
import { CHECKIN_LABELS, useSafety } from '../safety/api';
import type { CheckinKind } from '../safety/api';
import { ConcernSheet } from './ConcernSheet';
import { HoldButton } from './HoldButton';
import { useMeetups } from '../meetup/api'; // meetup feature: "Come to me" (null on mock data)
import './status.css';

const HELP: CheckinKind[] = ['need_friend', 'need_ride', 'unwell'];

export function StatusBar() {
  const { sessionId, me, incidents, actions } = useSafety();
  const comeToMe = useMeetups()?.actions.requestCompany ?? null; // meetup feature
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const [openNote, setOpenNote] = useState(false);
  const [help, setHelp] = useState(false);
  const firstHelp = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!help) return;
    firstHelp.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setHelp(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [help]);

  if (!sessionId) return null;

  const canHome = incidents.some((i) => i.subject === me && i.status === 'awaiting_home_confirmation');

  async function send(kind: CheckinKind | 'come_to_me') {
    setHelp(false);
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      if (kind === 'come_to_me') {
        // meetup feature: opens the need-help incident and flags it as wanting company
        await comeToMe!('');
        setResult('Sent: Come to me. Friends who accept will get a compass to you.');
        return;
      }
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
        <button type="button" className="status-btn status-okay" disabled={busy} onClick={() => send('okay')}>
          {CHECKIN_LABELS.okay}
        </button>
        <button type="button" className="status-btn status-needhelp" aria-haspopup="dialog" onClick={() => setHelp(true)}>
          Need help
        </button>
        {canHome && (
          <button type="button" className="status-home" disabled={busy} onClick={() => send('home')}>
            {CHECKIN_LABELS.home}
          </button>
        )}
      </div>
      <div className={`status-help-wrap${help ? ' is-open' : ''}`}>
        <div className="status-help-backdrop" onClick={() => setHelp(false)} aria-hidden="true" />
        <div className="status-help-sheet" role="dialog" aria-label="Need help">
          <div className="status-sheet-head">
            <h2 className="status-help-title">Need help</h2>
            <button type="button" className="status-help-close" onClick={() => setHelp(false)}>
              Close
            </button>
          </div>
          {HELP.map((k, i) => (
            <button key={k} ref={i === 0 ? firstHelp : undefined} type="button" className="status-help-opt" disabled={busy} onClick={() => send(k)}>
              {CHECKIN_LABELS[k]}
            </button>
          ))}
          {comeToMe && (
            /* meetup feature */
            <button type="button" className="status-help-opt" disabled={busy} onClick={() => send('come_to_me')}>
              Come to me
            </button>
          )}
          <button
            type="button"
            className="status-help-opt"
            onClick={() => {
              setHelp(false);
              setSheet(true);
            }}
          >
            Report a concern about someone
          </button>
          <div className="status-help-danger">
            <HoldButton label="Hold for Emergency" describedBy="status-hold-help" disabled={busy} onConfirm={() => send('emergency')} />
            <p id="status-hold-help" className="status-help">
              Press and hold for 1.5 seconds. Releasing early cancels.
            </p>
            <SafetyNote />
          </div>
        </div>
      </div>
      <ConcernSheet open={sheet} onClose={() => setSheet(false)} />
    </section>
  );
}
