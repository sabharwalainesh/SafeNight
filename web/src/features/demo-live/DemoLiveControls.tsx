import { useState } from 'react';
import { PERSONAS } from '../../personas';
import { useDemoLive } from './useDemoLive';

/** Live-only demo group controls. Mount only when the SpacetimeDB provider is present. */
export function DemoLiveControls() {
  const demo = useDemoLive();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      setMsg({ ok: true, text: label });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Something went wrong' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="demo-live">
      <ul className="demo-personas small" aria-label="Registered demo personas">
        {PERSONAS.map((p) => (
          <li key={p.id}>
            {p.name}: {demo.registered.has(p.id) ? '✓ registered' : 'missing'}
          </li>
        ))}
      </ul>
      <div className="demo-row">
        <button
          type="button"
          className="btn block"
          disabled={busy || !demo.allRegistered}
          onClick={() => void run('Demo group is ready', () => demo.setupGroup('Saturday night'))}
        >
          Set up demo group
        </button>
        {!demo.allRegistered && <span className="small muted">Open the four persona tabs first</span>}
        {!confirming ? (
          <button type="button" className="btn plain demo-danger" disabled={busy} onClick={() => setConfirming(true)}>
            Reset demo group
          </button>
        ) : (
          <>
            <button
              type="button"
              className="btn plain demo-danger"
              disabled={busy}
              onClick={() => {
                setConfirming(false);
                void run('Demo group reset', () => demo.resetGroup());
              }}
            >
              Yes, reset the group
            </button>
            <button type="button" className="btn plain" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </>
        )}
      </div>
      {msg && (
        <div className={`result ${msg.ok ? 'ok' : 'err'}`} role={msg.ok ? 'status' : 'alert'}>
          {msg.text}
        </div>
      )}
    </div>
  );
}
