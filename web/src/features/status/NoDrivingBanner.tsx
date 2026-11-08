import { useSafety } from '../safety/api';
import './status.css';

export function NoDrivingBanner({ onViewIncident }: { onViewIncident?: (incidentId: string) => void }) {
  const { alerts, dismissAlert } = useSafety();
  const driving = alerts.filter((a) => a.kind === 'no_driving_warning');
  const others = alerts.filter((a) => a.kind !== 'no_driving_warning');

  return (
    <>
      {driving.map((a) => (
        <div key={a.id} role="alert" className="status-nodrive">
          <strong>Do not drive</strong>
          <p>{a.message}</p>
          <div className="status-row">
            <button type="button" className="status-btn" onClick={() => dismissAlert(a.id)}>I won't drive</button>
            {onViewIncident && a.incidentId && (
              <button type="button" className="status-btn" onClick={() => onViewIncident(a.incidentId)}>
                View incident
              </button>
            )}
          </div>
        </div>
      ))}
      {others.length > 0 && (
        <ul role="status" className="status-toasts">
          {others.map((a) => (
            <li key={a.id} className="status-toast">
              {onViewIncident && a.incidentId ? (
                <button type="button" className="status-toast-body" onClick={() => onViewIncident(a.incidentId)}>
                  {a.message} <span className="muted">· Open</span>
                </button>
              ) : (
                <span>{a.message}</span>
              )}
              <button type="button" className="status-toast-x" aria-label="Dismiss" onClick={() => dismissAlert(a.id)}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
