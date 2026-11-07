import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useNightOut } from '../night-out/api';
import { useSafety } from '../safety/api';
import type { ConcernCategory, ConsumptionLevel } from '../safety/api';
import './status.css';

const CATEGORIES: { value: ConcernCategory; label: string }[] = [
  { value: 'possible_consumption', label: 'May have been drinking' },
  { value: 'separated', label: 'Got separated' },
  { value: 'unwell', label: 'Seems unwell' },
  { value: 'unsafe', label: 'Feels unsafe' },
];
const LEVELS: { value: ConsumptionLevel; label: string }[] = [
  { value: 'none', label: 'Not drinking' },
  { value: 'some', label: 'Had some' },
  { value: 'impaired_feeling', label: 'Feeling impaired' },
];

type Msg = { ok: boolean; text: string } | null;

function MsgLine({ m }: { m: Msg }) {
  if (!m) return null;
  return (
    <p role={m.ok ? 'status' : 'alert'} className={m.ok ? 'status-result' : 'status-error'}>
      {m.text}
    </p>
  );
}

export function ConcernSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { me, sessionId, mocked, actions } = useSafety();
  const nightOut = useNightOut();
  const ref = useRef<HTMLDialogElement>(null);
  const firstField = useRef<HTMLSelectElement>(null);
  const opener = useRef<Element | null>(null);
  const [who, setWho] = useState('');
  const [cat, setCat] = useState<ConcernCategory>('possible_consumption');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<Msg>(null);
  const [level, setLevel] = useState<ConsumptionLevel>('none');
  const [share, setShare] = useState(false);
  const [selfMsg, setSelfMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);

  const others = (sessionId ? (nightOut.roster(sessionId)?.members ?? []) : []).filter(
    (m) => m.leftAt === null && m.userId !== me,
  );

  useEffect(() => {
    if (who && !others.some((m) => m.userId === who)) setWho('');
  }, [who, others]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      opener.current = document.activeElement;
      setMsg(null);
      setSelfMsg(null);
      d.showModal();
      firstField.current?.focus();
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);

  function handleClose() {
    (opener.current as HTMLElement | null)?.focus?.();
    if (open) onClose();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!who) {
      setMsg({ ok: false, text: 'Choose who you are concerned about.' });
      return;
    }
    setBusy(true);
    try {
      await actions.reportConcern(who, cat, note.trim());
      setMsg({ ok: true, text: 'Concern sent to the people who can help.' });
      setNote('');
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'Could not send.' });
    } finally {
      setBusy(false);
    }
  }

  async function submitSelf(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await actions.reportConsumption(level, share);
      setSelfMsg({ ok: true, text: 'Saved privately.' });
    } catch (err) {
      setSelfMsg({ ok: false, text: err instanceof Error ? err.message : 'Could not save.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog ref={ref} className="status-sheet" onClose={handleClose} aria-labelledby="status-sheet-title">
      <div className="status-sheet-head">
        <h2 id="status-sheet-title">Report a concern</h2>
        {mocked && <span className="badge sim">MOCK DATA</span>}
      </div>

      <form onSubmit={submit} className="status-form">
        <label className="status-field">
          Who
          <select ref={firstField} value={who} onChange={(e) => setWho(e.target.value)} required>
            <option value="">Select a person</option>
            {others.map((m) => (
              <option key={m.userId} value={m.userId}>{m.displayName}</option>
            ))}
          </select>
        </label>
        <fieldset className="status-field">
          <legend>What is the concern?</legend>
          {CATEGORIES.map((c) => (
            <label key={c.value} className="status-radio">
              <input type="radio" name="status-cat" checked={cat === c.value} onChange={() => setCat(c.value)} />
              {c.label}
            </label>
          ))}
        </fieldset>
        <label className="status-field">
          Note (optional)
          <textarea value={note} maxLength={200} rows={3} onChange={(e) => setNote(e.target.value)} />
          <span className="status-help">{note.length}/200</span>
        </label>
        <MsgLine m={msg} />
        <button type="submit" className="status-btn" disabled={busy}>Send concern</button>
      </form>

      <form onSubmit={submitSelf} className="status-form status-private">
        <h3>About me (private)</h3>
        <p className="status-help">
          Your answer stays private. If you are tonight's accepted driver and say you have had some, you get a
          private reminder not to drive. The group is told only if you tick "Share with my buddies".
        </p>
        <fieldset className="status-field">
          <legend>How are you?</legend>
          {LEVELS.map((l) => (
            <label key={l.value} className="status-radio">
              <input type="radio" name="status-level" checked={level === l.value} onChange={() => setLevel(l.value)} />
              {l.label}
            </label>
          ))}
        </fieldset>
        <label className="status-radio">
          <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} />
          Share with my buddies
        </label>
        <MsgLine m={selfMsg} />
        <button type="submit" className="status-btn" disabled={busy}>Save privately</button>
      </form>

      <button type="button" className="status-btn status-link" onClick={onClose}>Close</button>
    </dialog>
  );
}
