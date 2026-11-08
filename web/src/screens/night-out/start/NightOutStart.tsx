import { useRef, useState, type FormEvent } from 'react';
import { useNightOut, type NightSession } from '../../../features/night-out/api';
import './start.css';

type Props = { onOpen: (sessionId: string) => void };

const DEFAULT_NAME = "New Year's Eve";
const DEFAULT_VENUE = 'Times Square, New York';
const HOURS_8 = 8 * 3600_000;

function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function SessionRow({ s, onOpen }: { s: NightSession; onOpen: (id: string) => void }) {
  const ended = s.status === 'ended' || s.status === 'expired';
  return (
    <li>
      <button type="button" className="nos-rowbtn" onClick={() => onOpen(s.id)}>
        <span className="nos-rowmain">
          <strong>{s.name}</strong>
          <span className="nos-sub">
            {s.venueHint ? `${s.venueHint} · ` : ''}
            {ended ? 'ended' : 'ends'} {clock(s.expiresAt)}
          </span>
        </span>
        <span className="nos-chev" aria-hidden="true">›</span>
      </button>
    </li>
  );
}

export function NightOutStart({ onOpen }: Props) {
  const api = useNightOut();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [venue, setVenue] = useState('');
  const [code, setCode] = useState('');
  const [createBusy, setCreateBusy] = useState(false);
  const [joinBusy, setJoinBusy] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);
  const [joinErr, setJoinErr] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  async function create() {
    setCreateErr(null);
    setCreateBusy(true);
    const now = Date.now();
    try {
      const id = await api.actions.createSession({
        name: name.trim() || DEFAULT_NAME,
        venueHint: venue.trim() || DEFAULT_VENUE,
        startsAt: now,
        expiresAt: now + HOURS_8,
        checkinIntervalMinutes: 30,
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
      <section className="nos-start" aria-busy="true" aria-live="polite">
        <p className="muted">Loading your hangouts…</p>
      </section>
    );
  }

  return (
    <div className="nos-start">
      <header className="nos-hero">
        <h2>Tonight</h2>
        {api.mocked && <span className="badge sim">MOCK</span>}
      </header>

      {api.mySessions.length > 0 && (
        <section aria-labelledby="nos-sessions">
          <h3 id="nos-sessions" className="nos-label">Your hangouts</h3>
          <ul className="nos-group">
            {api.mySessions.map((s) => (
              <SessionRow key={s.id} s={s} onOpen={onOpen} />
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Start a hangout">
        <button type="button" className="btn nos-big" disabled={createBusy} onClick={() => void create()}>
          {createBusy ? 'Starting…' : 'Start a hangout'}
        </button>
        <button
          type="button"
          className="nos-link"
          aria-expanded={editing}
          aria-controls="nos-edit"
          onClick={() => {
            const next = !editing;
            setEditing(next);
            if (next) setTimeout(() => nameRef.current?.focus(), 0);
          }}
        >
          Edit details
        </button>
        {editing && (
          <div id="nos-edit" className="nos-group nos-fields">
            <label>
              Name
              <input ref={nameRef} value={name} placeholder={DEFAULT_NAME} onChange={(e) => setName(e.target.value)} maxLength={80} />
            </label>
            <label>
              Venue
              <input value={venue} placeholder={DEFAULT_VENUE} onChange={(e) => setVenue(e.target.value)} maxLength={120} />
            </label>
          </div>
        )}
        {createErr && (
          <div role="alert" className="result err">
            {createErr}
          </div>
        )}
      </section>

      <section aria-labelledby="nos-join">
        <h3 id="nos-join" className="nos-label">Have a code?</h3>
        <form onSubmit={join} className="nos-joinrow">
          <input
            aria-label="Invite code"
            className="code"
            placeholder="ABC123"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s/g, '').slice(0, 6))}
            maxLength={6}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
          />
          <button type="submit" className="btn secondary" disabled={joinBusy || code.length !== 6}>
            {joinBusy ? 'Joining…' : 'Join'}
          </button>
        </form>
        {joinErr && (
          <div role="alert" className="result err">
            {joinErr}
          </div>
        )}
      </section>
    </div>
  );
}
