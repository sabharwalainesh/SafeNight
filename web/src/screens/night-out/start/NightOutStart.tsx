import { useState, type FormEvent } from 'react';
import { useNightOut, type NightSession } from '../../../features/night-out/api';
import './start.css';

type Props = { onOpen: (sessionId: string) => void };

const INTERVALS = [15, 30, 45, 60];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Epoch ms to the value format of <input type="datetime-local"> (local time). */
function toLocalInput(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(v: string): number {
  return new Date(v).getTime();
}

/** Relative time that works for past and future ("in 3 h", "2 min ago"). */
function relMs(target: number, now: number = Date.now()): string {
  const diff = target - now;
  const m = Math.round(Math.abs(diff) / 60000);
  let text: string;
  if (m < 1) return 'now';
  if (m < 60) text = `${m} min`;
  else if (m < 48 * 60) text = `${Math.round(m / 60)} h`;
  else text = `${Math.round(m / 1440)} d`;
  return diff >= 0 ? `in ${text}` : `${text} ago`;
}

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function SessionRow({ s, onOpen }: { s: NightSession; onOpen: (id: string) => void }) {
  const ended = s.status === 'ended' || s.status === 'expired';
  return (
    <li className="sess">
      <div className="sess-main">
        <strong>{s.name}</strong>
        {s.venueHint && <span className="muted small">{s.venueHint}</span>}
        <span className="muted small">
          {ended ? 'Expired' : 'Expires'} {relMs(s.expiresAt)}
        </span>
      </div>
      <div className="sess-side">
        <span className="badge">{s.status}</span>
        <button type="button" className="btn" onClick={() => onOpen(s.id)} aria-label={`Open ${s.name}`}>
          Open
        </button>
      </div>
    </li>
  );
}

export function NightOutStart({ onOpen }: Props) {
  const api = useNightOut();
  const [name, setName] = useState('');
  const [venue, setVenue] = useState('');
  const [starts, setStarts] = useState(() => toLocalInput(Date.now()));
  const [ends, setEnds] = useState(() => toLocalInput(Date.now() + 5 * 3600_000));
  const [interval, setIntervalMin] = useState(30);
  const [code, setCode] = useState('');
  const [createBusy, setCreateBusy] = useState(false);
  const [joinBusy, setJoinBusy] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);
  const [joinErr, setJoinErr] = useState<string | null>(null);

  async function create(e: FormEvent) {
    e.preventDefault();
    setCreateErr(null);
    const startsAt = fromLocalInput(starts);
    const expiresAt = fromLocalInput(ends);
    if (!Number.isFinite(startsAt) || !Number.isFinite(expiresAt)) {
      setCreateErr('Enter a valid start and end time.');
      return;
    }
    if (expiresAt <= startsAt) {
      setCreateErr('End time must be after the start time.');
      return;
    }
    setCreateBusy(true);
    try {
      const id = await api.actions.createSession({
        name: name.trim(),
        venueHint: venue.trim(),
        startsAt,
        expiresAt,
        checkinIntervalMinutes: interval,
      });
      onOpen(id);
    } catch (err) {
      setCreateErr(errMessage(err));
    } finally {
      setCreateBusy(false);
    }
  }

  async function join(e: FormEvent) {
    e.preventDefault();
    setJoinErr(null);
    setJoinBusy(true);
    try {
      const id = await api.actions.joinSession(code);
      onOpen(id);
    } catch (err) {
      setJoinErr(errMessage(err));
    } finally {
      setJoinBusy(false);
    }
  }

  if (!api.ready) {
    return (
      <section className="nos card" aria-busy="true">
        <p className="muted">Loading your sessions…</p>
      </section>
    );
  }

  return (
    <div className="nos">
      {api.mocked && (
        <div>
          <span className="badge sim">MOCK DATA — C1-A pending</span>
        </div>
      )}

      <section className="card" aria-labelledby="nos-sessions">
        <h2 id="nos-sessions">Your sessions</h2>
        {api.mySessions.length === 0 ? (
          <p className="muted">No sessions yet. Start one below or join with a code.</p>
        ) : (
          <ul className="list">
            {api.mySessions.map((s) => (
              <SessionRow key={s.id} s={s} onOpen={onOpen} />
            ))}
          </ul>
        )}
      </section>

      <section className="card" aria-labelledby="nos-create">
        <h2 id="nos-create">Start a Night Out</h2>
        <form onSubmit={create}>
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} />
          </label>
          <label>
            Venue hint
            <input value={venue} onChange={(e) => setVenue(e.target.value)} maxLength={120} />
          </label>
          <label>
            Starts
            <input type="datetime-local" value={starts} onChange={(e) => setStarts(e.target.value)} required />
          </label>
          <label>
            Ends
            <input type="datetime-local" value={ends} onChange={(e) => setEnds(e.target.value)} required />
          </label>
          <label>
            Check-in interval (minutes)
            <select value={interval} onChange={(e) => setIntervalMin(Number(e.target.value))}>
              {INTERVALS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn" disabled={createBusy || !name.trim()}>
            {createBusy ? 'Creating…' : 'Start Night Out'}
          </button>
          {createErr && (
            <div role="alert" className="result err">
              {createErr}
            </div>
          )}
        </form>
      </section>

      <section className="card" aria-labelledby="nos-join">
        <h2 id="nos-join">Join with a code</h2>
        <form onSubmit={join}>
          <label>
            Invite code
            <input
              className="code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s/g, '').slice(0, 6))}
              maxLength={6}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              required
            />
          </label>
          <button type="submit" className="btn" disabled={joinBusy || code.length !== 6}>
            {joinBusy ? 'Joining…' : 'Join'}
          </button>
          {joinErr && (
            <div role="alert" className="result err">
              {joinErr}
            </div>
          )}
        </form>
      </section>
    </div>
  );
}
