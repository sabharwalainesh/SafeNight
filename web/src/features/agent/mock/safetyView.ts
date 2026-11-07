// MOCK until C3-A bindings: what the simulated agent may read from / write to the safety side.
// The engine never imports the safety store; AgentMockProvider builds a view from either the
// safety mock store (mock mode) or useSafety() data (live mode), like nightOutView.ts.
import type { UserId } from '../../night-out/api';
import type { Incident, IncidentStatus, SafetyApi } from '../../safety/api';
import { getSnapshot as safeSnap, mutate as safeMutate, subscribe as safeSubscribe } from '../../safety/mock/store';
import { mutate as agentMutate } from './store';

export type StatusExtras = { ackBy?: UserId; resolvedBy?: UserId };

export type SafetyView = {
  /** Incidents the agent may act on. Mock mode: all. Live mode: only those visible to the caller (my_incidents). */
  incidents(): Incident[];
  /** Number of check-ins by `userId` in the session. Live mode only knows the caller's own. */
  checkinCount(sessionId: string, userId: UserId): number;
  writeIncidentStatus(incidentId: string, status: IncidentStatus, extras?: StatusExtras): void;
  appendEvent(incidentId: string, kind: string, detail: string, simulated: boolean, actor: UserId, actorName: string): void;
  /** Subject confirms they are home. Live mode records a real check-in; mock mode is covered by writeIncidentStatus. */
  confirmHome(): Promise<void>;
  /** Mock mode only: run `fn` whenever the safety store changes. Returns an unsubscribe. */
  onChange(fn: () => void): () => void;
};

export const EMPTY_SAFETY_VIEW: SafetyView = {
  incidents: () => [],
  checkinCount: () => 0,
  writeIncidentStatus: () => {},
  appendEvent: () => {},
  confirmHome: async () => {},
  onChange: () => () => {},
};

const LADDER: IncidentStatus[] = ['open', 'acknowledged', 'assistance_underway', 'transport_arranged', 'awaiting_home_confirmation'];
const CLOSED: IncidentStatus[] = ['resolved', 'cancelled', 'handed_off'];

export function mockSafetyView(): SafetyView {
  return {
    incidents: () => safeSnap().incidents,
    checkinCount: (sid, uid) => safeSnap().checkins.filter((c) => c.sessionId === sid && c.userId === uid).length,
    writeIncidentStatus: (incidentId, status, extras = {}) =>
      safeMutate((s) => {
        const inc = s.incidents.find((i) => i.id === incidentId);
        if (!inc) return;
        const cur = LADDER.indexOf(inc.status);
        const next = LADDER.indexOf(status);
        // Only upgrade along the ladder; closed incidents and downgrades are left alone.
        if (next === -1 ? cur !== -1 || !CLOSED.includes(inc.status) : cur !== -1 && next > cur) inc.status = status;
        if (extras.ackBy) {
          const p = inc.participants.find((x) => x.userId === extras.ackBy);
          if (p && p.acknowledgedAt === null) p.acknowledgedAt = Date.now();
        }
        if (extras.resolvedBy) {
          inc.resolvedAt = Date.now();
          inc.resolvedBy = extras.resolvedBy;
        }
      }),
    appendEvent: (incidentId, kind, detail, simulated, actor, actorName) =>
      safeMutate((s, id) => {
        if (!s.incidents.some((i) => i.id === incidentId)) return;
        s.events.push({ id: id(), incidentId, at: Date.now(), actor, actorName, kind, detail, simulated });
      }),
    confirmHome: async () => {},
    onChange: safeSubscribe,
  };
}

/** Live mode: reads come from useSafety(); incident writes are not possible yet, so they become agent receipts. */
export function apiSafetyView(safety: SafetyApi): SafetyView {
  return {
    incidents: () => safety.incidents,
    checkinCount: (sid, uid) => (uid === safety.me && sid === safety.sessionId ? safety.myCheckins.length : 0),
    writeIncidentStatus: (incidentId, status) =>
      agentMutate((s, id) => {
        const job = s.jobs.find((j) => j.incidentId === incidentId);
        if (!job) return;
        s.actions.push({
          id: id(),
          jobId: job.id,
          planVersion: job.planVersion,
          tool: 'update_incident_status',
          args: { status },
          status: 'proposed',
          resultText: `Incident status change to "${status}" pending backend C3-A (SIMULATED, not written)`,
          rejectReason: '',
          simulated: true,
          at: Date.now(),
        });
      }),
    appendEvent: () => {}, // timeline events need the backend; the agent receipts carry the same information
    confirmHome: () => safety.actions.checkIn('home', ''),
    onChange: () => () => {},
  };
}

/** Mock mode only: clear the safety mock store. */
export function resetMockSafety() {
  safeMutate((s) => {
    s.counter = 0;
    s.locations = [];
    s.checkins = [];
    s.incidents = [];
    s.events = [];
    s.alerts = [];
    s.reports = [];
    s.dismissed = [];
    s.consumptions = [];
  });
}
