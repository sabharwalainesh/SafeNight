import type { CoordAction } from './types';
import { useCoordination } from './useCoordination';
import { Pill, Section } from '../../ui';
import './coordination.css';

const STATUS_TONE: Record<string, 'neutral' | 'ok' | 'warn' | 'danger' | 'info'> = {
  planned: 'neutral',
  blocked: 'danger',
  sent: 'info',
  in_progress: 'info',
  completed: 'ok',
  no_answer: 'warn',
  failed: 'danger',
};

const typeLabel = (a: CoordAction) =>
  a.type === 'text_group' ? 'Text to friends' : a.type === 'call_person' ? `Call ${a.target}` : 'Dispatch call';

function statusLabel(a: CoordAction): string {
  switch (a.status) {
    case 'planned': return 'Planned';
    case 'blocked': return `Blocked: ${a.detail || 'not allowed'}`;
    case 'sent': return 'Sent';
    case 'in_progress': return 'Calling…';
    case 'completed': return 'Completed';
    case 'no_answer': return 'No answer';
    case 'failed': return 'Failed';
    default: return String(a.status);
  }
}

export default function CoordinationPanel({ incidentId }: { incidentId: string }) {
  const { enabled, decisions, dispatch, error } = useCoordination(incidentId);
  if (!enabled) return null;
  const ordered = [...decisions].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const latest = ordered[0];
  const older = ordered.slice(1);
  const nemotron = !!latest && !latest.simulated && /nemotron/i.test(latest.model);

  return (
    <Section title="Emergency coordination">
      <div className="coord-panel" role="group" aria-label="Emergency coordination">
        {latest && (
          <div className="coord-head">
            <Pill tone="info">{nemotron ? 'Nemotron' : 'SIMULATED planner'}</Pill>
          </div>
        )}
        {error && <p className="coord-err" role="alert">{error}</p>}
        {!latest && !error && <p className="muted">No coordination plan yet.</p>}
        {latest && (
          <>
            <details className="coord-why">
              <summary>Why this plan</summary>
              <p>Why: {latest.reasoning}</p>
            </details>
            <ul className="coord-actions" aria-live="polite">
              {latest.actions.map(a => (
                <li key={a.id}>
                  <strong>{typeLabel(a)}</strong>
                  <Pill tone={STATUS_TONE[a.status] ?? 'neutral'}>{statusLabel(a)}</Pill>
                  {a.simulated && <Pill tone="warn">SIMULATED</Pill>}
                  {a.detail && a.status !== 'blocked' && <div className="footnote muted coord-detail">{a.detail}</div>}
                </li>
              ))}
            </ul>
          </>
        )}
        {dispatch && (
          <div className="coord-dispatch">
            <strong>SIMULATED DISPATCH — demo number, not emergency services</strong>
            <div>Status: {dispatch.status}</div>
            {dispatch.summary && <p>Summary sent: {dispatch.summary}</p>}
            {dispatch.transcriptSummary && <p>Transcript summary: {dispatch.transcriptSummary}</p>}
          </div>
        )}
        {older.length > 0 && (
          <details className="coord-why">
            <summary>Earlier decisions ({older.length})</summary>
            {older.map(d => (
              <div key={d.id} className="coord-old">
                <p className="footnote muted">Why: {d.reasoning}</p>
                <ul>
                  {d.actions.map(a => (
                    <li key={a.id}>
                      {typeLabel(a)}: {statusLabel(a)} {a.simulated && <Pill tone="warn">SIMULATED</Pill>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </details>
        )}
      </div>
    </Section>
  );
}
