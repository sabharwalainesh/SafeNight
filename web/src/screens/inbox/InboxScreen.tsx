import { useState } from 'react';
import { INCIDENT_STATUS_LABELS, useSafety, type AlertKind } from '../../features/safety/api';
import { IncidentScreen } from '../incident';
import { ago, KIND_LABELS } from '../incident/time';
import './inbox.css';

const ALERT_LABELS: Record<AlertKind, string> = {
  no_driving_warning: 'Driving warning',
  help_requested: 'Help requested',
  ack_requested: 'Acknowledgment requested',
  incident_update: 'Incident update',
};
const CLOSED = ['resolved', 'cancelled', 'handed_off'];

export default function InboxScreen({ initialIncidentId }: { initialIncidentId?: string }) {
  const { me, alerts, incidents, dismissAlert, mocked } = useSafety();
  const [openId, setOpenId] = useState<string | null>(initialIncidentId ?? null);

  if (openId) return <IncidentScreen incidentId={openId} onBack={() => setOpenId(null)} />;

  const sortedAlerts = [...alerts].sort((a, b) => b.at - a.at);
  const active = incidents.filter(i => !CLOSED.includes(i.status));
  const closed = incidents.filter(i => CLOSED.includes(i.status));

  return (
    <section className="inbox-screen">
      {mocked && <span className="inbox-pill">MOCK DATA</span>}
      <h2>Alerts</h2>
      {sortedAlerts.length === 0 ? (
        <p className="muted">No alerts.</p>
      ) : (
        <ul className="inbox-list">
          {sortedAlerts.map(a => (
            <li key={a.id}>
              <strong>{ALERT_LABELS[a.kind]}</strong>
              <p>{a.message}</p>
              <p className="small muted">{ago(a.at)}</p>
              <div className="inbox-actions">
                {a.incidentId && <button type="button" className="btn" onClick={() => setOpenId(a.incidentId)}>Open incident</button>}
                <button type="button" className="btn" onClick={() => dismissAlert(a.id)}>Dismiss</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <h2>Incidents</h2>
      {incidents.length === 0 ? (
        <p className="muted">No incidents.</p>
      ) : (
        <ul className="inbox-list">
          {[...active, ...closed].map(i => {
            const needs =
              i.status === 'open' && i.participants.some(p => p.userId === me && p.role !== 'subject' && p.acknowledgedAt === null);
            return (
              <li key={i.id}>
                <button type="button" className="inbox-row" onClick={() => setOpenId(i.id)}>
                  <strong>{i.subjectName}</strong>
                  <span className="small muted"> · {KIND_LABELS[i.kind] ?? i.kind} · {ago(i.openedAt)}</span>
                  <span className="inbox-badges">
                    <span className="inbox-pill">{INCIDENT_STATUS_LABELS[i.status]}</span>
                    {needs && <span className="inbox-pill inbox-need">Needs your acknowledgment</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
