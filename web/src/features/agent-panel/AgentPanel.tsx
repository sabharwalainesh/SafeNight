import { useEffect, useState } from 'react';
import { DELIVERY_LABELS, JOB_STATUS_LABELS, useAgent, type ActionStatus } from '../agent/api';
import { Pill, Section } from '../../ui';
import './agent-panel.css';

const TIERS = ['Primary buddy', 'Backup buddy', 'Handed off to organizer'];
const ACTION_LABELS: Record<ActionStatus, string> = {
  proposed: 'Proposed',
  rejected: 'Rejected',
  executed: 'Executed',
  failed: 'Failed',
  delivered: 'Delivered',
  acknowledged: 'Acknowledged',
};
const humanize = (t: string) => {
  const s = t.replace(/[_.-]+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const clock = (at: number) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
type Tone = 'neutral' | 'ok' | 'warn' | 'danger' | 'info';
const ACTION_TONE: Record<ActionStatus, Tone> = {
  proposed: 'neutral',
  rejected: 'danger',
  executed: 'info',
  failed: 'danger',
  delivered: 'ok',
  acknowledged: 'ok',
};
const DELIVERY_TONE: Record<string, Tone> = { queued: 'neutral', sent: 'info', delivered: 'ok', acknowledged: 'ok', failed: 'danger' };
const Sim = () => <Pill tone="warn">SIMULATED</Pill>;

export default function AgentPanel({ incidentId }: { incidentId: string }) {
  const agent = useAgent();
  const job = agent.jobForIncident(incidentId);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const [showAllReceipts, setShowAllReceipts] = useState(false);
  const due = job?.followupDueAt ?? null;

  useEffect(() => {
    if (due === null) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [due]);

  if (!job) return null;
  const plan = agent.latestPlan(job.id);
  const receipts = agent.receipts(job.id);
  const notes = agent.notifications(incidentId);

  const pending = [...notes].reverse().find(n => n.status !== 'acknowledged');
  const waitingName = notes.find(n => n.recipient === job.followupExpectedFrom)?.recipientName ?? 'a buddy';
  const isMine =
    job.followupExpectedFrom === agent.me || (job.followupExpectedFrom === null && pending?.recipient === agent.me);
  const canAct = isMine && (job.status === 'waiting_for_ack' || job.status === 'escalated');

  async function run(fn: () => Promise<void>, done: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setAnnounce(done);
      setDeclining(false);
      setReason('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not go through. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const jobId = job.id;
  const shownReceipts = showAllReceipts ? receipts : receipts.slice(-3);
  return (
    <Section title="SafeNight agent">
      <div className="agent-panel" aria-label="SafeNight agent" role="group">
        <div className="ap-row">
          <Pill tone="info">{JOB_STATUS_LABELS[job.status]}</Pill>
          {plan?.simulated && <Sim />}
          <span className="ap-muted">
            {TIERS[job.escalationTier] ?? TIERS[0]}
            {plan ? ` · model ${plan.model}` : ''}
          </span>
        </div>
        {due !== null && (
          <p className="ap-timer">
            Waiting on {waitingName} — follow-up in {mmss(due - now)}
          </p>
        )}

        {plan && (
          <div className="ap-block">
            <p className="headline">
              Plan v{plan.version} {plan.version > 1 && <Pill tone="info">Plan updated</Pill>}
            </p>
            <p>{plan.summary}</p>
            <details className="ap-steps-wrap">
              <summary>Steps ({plan.steps.length})</summary>
              <ol className="ap-steps">
                {plan.steps.map((s, i) => (
                  <li key={i}>
                    <strong>{s.title}</strong>
                    {s.detail && <span className="ap-muted"> — {s.detail}</span>}
                  </li>
                ))}
              </ol>
            </details>
          </div>
        )}

        <div className="ap-block">
          <p className="headline">Receipts ({receipts.length})</p>
          {receipts.length === 0 ? (
            <p className="ap-muted">No actions yet.</p>
          ) : (
            <ul className="ap-list">
              {shownReceipts.map(r => (
                <li key={r.id}>
                  <div className="ap-row">
                    <strong>{humanize(r.tool)}</strong>
                    <Pill tone={ACTION_TONE[r.status]}>{ACTION_LABELS[r.status]}</Pill>
                    {r.simulated && <Sim />}
                    <time className="ap-muted">{clock(r.at)}</time>
                  </div>
                  {r.resultText && <p>{r.resultText}</p>}
                  {r.status === 'rejected' && r.rejectReason && <p className="ap-blocked">Blocked: {r.rejectReason}</p>}
                </li>
              ))}
            </ul>
          )}
          {receipts.length > 3 && (
            <button type="button" className="btn plain small-btn" aria-expanded={showAllReceipts} onClick={() => setShowAllReceipts(v => !v)}>
              {showAllReceipts ? 'Show fewer' : `Show all (${receipts.length})`}
            </button>
          )}
        </div>

        <div className="ap-block">
          <p className="headline">Messages</p>
          {notes.length === 0 ? (
            <p className="ap-muted">No messages yet.</p>
          ) : (
            <ul className="ap-list">
              {notes.map(n => (
                <li key={n.id}>
                  <div className="ap-row">
                    <strong>{n.recipientName}</strong>
                    <span className="ap-muted">{n.channel.replace('_', '-')}</span>
                    <Pill tone={DELIVERY_TONE[n.status]}>{DELIVERY_LABELS[n.status]}</Pill>
                    {n.simulated && <Sim />}
                  </div>
                  <p>{n.body}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {canAct && (
          <div className="ap-block">
            <p className="headline">Your help is requested</p>
            <div className="ap-row">
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => run(() => agent.actions.acknowledgeAssistance(jobId), 'You told the group you are on it.')}
              >
                I'm on it
              </button>
              <button type="button" className="btn plain" disabled={busy} onClick={() => setDeclining(d => !d)} aria-expanded={declining}>
                I can't help
              </button>
            </div>
            {declining && (
              <div className="ap-row">
                <label className="ap-label">
                  Reason (optional)
                  <input value={reason} onChange={e => setReason(e.target.value)} disabled={busy} autoFocus />
                </label>
                <button
                  type="button"
                  className="btn secondary"
                  disabled={busy}
                  onClick={() =>
                    run(() => agent.actions.declineAssistance(jobId, reason.trim()), 'You said you cannot help. The next contact will be asked.')
                  }
                >
                  Send decline
                </button>
              </div>
            )}
          </div>
        )}
        {error && <p role="alert" className="ap-error">{error}</p>}
        <p role="status" className="ap-muted">{announce}</p>
      </div>
    </Section>
  );
}
