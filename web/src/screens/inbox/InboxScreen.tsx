import { useState, type ReactNode } from 'react';
import { INCIDENT_STATUS_LABELS, useSafety, type AlertKind, type Incident } from '../../features/safety/api';
import { Pill, Row, Section } from '../../ui';
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
  const needsMe = (i: Incident) =>
    i.status === 'open' && i.participants.some(p => p.userId === me && p.role !== 'subject' && p.acknowledgedAt === null);
  const open = incidents.filter(i => !CLOSED.includes(i.status));
  const needs = open.filter(needsMe);
  const active = open.filter(i => !needsMe(i));
  const earlier = incidents.filter(i => CLOSED.includes(i.status));

  const incidentRow = (i: Incident): ReactNode => (
    <Row
      key={i.id}
      chevron
      onClick={() => setOpenId(i.id)}
      label={
        <>
          <span className="headline">{i.subjectName}</span>
          <span className="subhead muted"> · {KIND_LABELS[i.kind] ?? i.kind} · {ago(i.openedAt)}</span>
        </>
      }
      value={needsMe(i) ? <Pill tone="warn">Needs your acknowledgment</Pill> : <Pill>{INCIDENT_STATUS_LABELS[i.status]}</Pill>}
    />
  );

  return (
    <div className="inbox-screen">
      {mocked && (
        <div className="strip">
          <span className="badge sim">MOCK DATA</span>
        </div>
      )}

      {needs.length > 0 && <Section title="Needs you">{needs.map(incidentRow)}</Section>}
      {active.length > 0 && <Section title="Active">{active.map(incidentRow)}</Section>}
      {incidents.length === 0 && (
        <Section title="Incidents">
          <p className="inbox-empty">No incidents.</p>
        </Section>
      )}

      <Section title="Alerts">
        {sortedAlerts.length === 0 ? (
          <p className="inbox-empty">No alerts.</p>
        ) : (
          sortedAlerts.map(a => (
            <div className="inbox-item" key={a.id}>
              <span className="headline">{ALERT_LABELS[a.kind]}</span>
              <p>{a.message}</p>
              <p className="footnote muted">{ago(a.at)}</p>
              <div className="inbox-item-actions">
                {a.incidentId && (
                  <button type="button" className="btn plain small-btn" onClick={() => setOpenId(a.incidentId)}>
                    Open incident
                  </button>
                )}
                <button type="button" className="btn plain small-btn" onClick={() => dismissAlert(a.id)}>
                  Dismiss
                </button>
              </div>
            </div>
          ))
        )}
      </Section>

      {earlier.length > 0 && <Section title="Earlier">{earlier.map(incidentRow)}</Section>}
    </div>
  );
}
