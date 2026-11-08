import type { SessionRoster } from '../night-out/api';
import type { Checkin, Incident, IncidentEvent, VisibleLocation } from '../safety/api';
import type { SyncBody } from './types';

const PERSONAS = ['alex', 'sam', 'maya', 'jordan'];
const MAX = 280;
const cut = (s: string) => (s.length > MAX ? s.slice(0, MAX) : s);
const iso = (ms: number) => new Date(ms).toISOString();

export function personaId(displayName: string, userId: string): string {
  const n = displayName.trim().toLowerCase();
  return PERSONAS.includes(n) ? n : userId;
}

export type SnapshotInput = {
  incident: Incident;
  timeline: IncidentEvent[];
  roster: SessionRoster | null;
  locations: VisibleLocation[];
  myLocation: VisibleLocation | null;
  myCheckins: Checkin[];
  me: string;
};

export function buildSnapshot(i: SnapshotInput): SyncBody {
  const { incident: inc } = i;
  const loc =
    i.locations.find(l => l.userId === inc.subject) ?? (inc.subject === i.me ? i.myLocation : null) ?? null;
  return {
    incident: {
      id: inc.id,
      kind: inc.kind,
      severity: inc.severity,
      status: inc.status,
      subjectName: inc.subjectName,
      subjectPersonaId: personaId(inc.subjectName, inc.subject),
      sessionName: cut(i.roster?.session.name ?? ''),
      venue: cut(i.roster?.session.venueHint ?? ''),
      lastLocation: loc
        ? { lat: loc.lat, lng: loc.lng, approximate: loc.approximate, recordedAt: iso(loc.recordedAt) }
        : null,
      participants: inc.participants.map(p => ({
        personaId: personaId(p.displayName, p.userId),
        displayName: p.displayName,
        role: p.role,
        acknowledged: p.acknowledgedAt !== null,
      })),
      recentCheckins: i.myCheckins
        .filter(c => c.userId === inc.subject)
        .slice(0, 10)
        .map(c => ({ kind: c.kind, at: iso(c.createdAt) })),
      events: i.timeline.slice(-30).map(e => ({ kind: e.kind, detail: cut(e.detail), at: iso(e.at) })),
    },
  };
}
