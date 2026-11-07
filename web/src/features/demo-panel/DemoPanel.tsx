// MOCK until C3-A bindings: judge controls for the simulated agent.
import { useEffect, useState } from 'react';
import { JOB_STATUS_LABELS, useAgent } from '../agent/api';
import { useNightOut } from '../night-out/api';
import { useSafety } from '../safety/api';
import './demo-panel.css';

const TIER_LABELS = ['Primary buddy', 'Backup buddy', 'Organizer'];
const CLOSED = ['resolved', 'cancelled', 'handed_off'];

export function DemoPanel() {
  const agent = useAgent();
  const safety = useSafety();
  const mockedNightOut = useNightOut().mocked;
  const [now, setNow] = useState(() => Date.now());
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

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

  const jobs = safety.incidents.flatMap((i) => {
    const j = agent.jobForIncident(i.id);
    return j && !CLOSED.includes(j.status) ? [{ job: j, subject: i.subjectName }] : [];
  });

  return (
    <section className="card demo-panel" aria-label="Judge demo">
      <div className="demo-head">
        <h2>Judge demo</h2>
        <span className="badge sim">{agent.mocked ? 'MOCK' : 'LIVE'}</span>
      </div>
      <div className="demo-row">
        <button type="button" className="demo-btn primary" disabled={busy || !mockedNightOut || !agent.mocked} onClick={() => void run('Demo group is ready', () => agent.demo.setupGroup())}>
          Set up demo group
        </button>
        {!agent.mocked ? (
          <span className="small muted">Create the session from the Night Out tab and join from each persona tab</span>
        ) : (
          !mockedNightOut && <span className="small muted">Group setup needs the demo reducer from the backend (live mode)</span>
        )}
        {!confirming ? (
          <button type="button" className="demo-btn danger" disabled={busy} onClick={() => setConfirming(true)}>
            Reset demo
          </button>
        ) : (
          <>
            <button
              type="button"
              className="demo-btn danger"
              disabled={busy}
              onClick={() => {
                setConfirming(false);
                void run(
                  !agent.mocked
                    ? 'Demo data wiped on the server; venues and resources stay'
                    : mockedNightOut && safety.mocked
                    ? 'Demo data cleared'
                    : `Cleared local agent${safety.mocked ? ', safety and report' : ''} demo data only. ${safety.mocked ? '' : 'Live safety data (incidents, check-ins) is untouched. '}${mockedNightOut ? '' : 'Live Night Out data is untouched.'}`,
                  () => agent.demo.reset(),
                );
              }}
            >
              Yes, erase all demo data
            </button>
            <button type="button" className="demo-btn" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </>
        )}
      </div>
      {!agent.mocked && <p className="small muted">Wipes every demo row on the server; venues and resources stay.</p>}
      {msg && (
        <div className={`result ${msg.ok ? 'ok' : 'err'}`} role="status">
          {msg.text}
        </div>
      )}
      {jobs.map(({ job, subject }) => {
        const secs = job.followupDueAt === null ? null : Math.max(0, Math.ceil((job.followupDueAt - now) / 1000));
        return (
          <div className="demo-job" key={job.id}>
            <strong>
              {subject}: {JOB_STATUS_LABELS[job.status]} {agent.plannerMode === 'simulated' && <span className="badge sim">SIMULATED</span>}
            </strong>
            <span className="small muted">
              Tier {job.escalationTier} ({TIER_LABELS[job.escalationTier] ?? 'Unknown'})
              {secs !== null ? ` · follow-up due in ${secs}s` : (agent.mocked ? ' · no follow-up timer' : '')}
            </span>
            <div className="demo-row">
              <button
                type="button"
                className="demo-btn"
                disabled={busy || (agent.mocked && secs === null)}
                onClick={() => void run('Timer advanced', () => agent.demo.fireFollowup(job.id))}
              >
                Advance timer (simulate no reply)
              </button>
            </div>
          </div>
        );
      })}
      <ol className="demo-script small muted">
        <li>Set up the demo group, then switch persona to Sam or Alex.</li>
        <li>Report a concern about the driver (Sam) from the Map tab.</li>
        <li>Switch to Maya: acknowledge, or advance the timer to escalate to Jordan.</li>
        <li>Choose and book a ride, confirm pickup, then Sam confirms "I'm home".</li>
      </ol>
    </section>
  );
}
