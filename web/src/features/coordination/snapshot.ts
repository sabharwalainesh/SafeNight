import type { SessionRoster } from '../night-out/api';
import type { Checkin, Incident, IncidentEvent, VisibleLocation } from '../safety/api';
import type { SyncBody } from './types';

const PERSONAS = ['alex', 'sam', 'maya', 'jordan'];
const MAX = 280;
const cut = (s: string) => (s.length > MAX ? s.slice(0, MAX) : s);
const iso = (ms: number) => new Date(ms).toISOString();

// Personas decide whose real phone the bridge texts or calls, so they must come
// from the server's persona registry (demo_personas), never from a display name
// a user can set. Mock ids are already persona ids.
export type PersonaMap = Readonly<Record<string, string>>;

export function personaId(userId: string, personaOf: PersonaMap = {}): string {
  if (PERSONAS.includes(userId)) return userId;
  return personaOf[userId] ?? userId;
}

export type SnapshotInput = {
  incident: Incident;
  timeline: IncidentEvent[];
  roster: SessionRoster | null;
  locations: VisibleLocation[];
  myLocation: VisibleLocation | null;
  myCheckins: Checkin[];
  me: string;
  personaOf?: PersonaMap;
};

export function buildSnapshot(i: SnapshotInput): SyncBody {
  const { incident: inc } = i;
  // Only send a location the caller can already see under consent. The subject's
  // own tab may add its location only while it is sharing, and only rounded.
  const sharing = i.roster?.members.find(m => m.userId === inc.subject && m.leftAt === null)?.sharingScope ?? 'none';
  const own =
    inc.subject === i.me && i.myLocation && sharing !== 'none'
      ? { ...i.myLocation, lat: Math.round(i.myLocation.lat * 1000) / 1000, lng: Math.round(i.myLocation.lng * 1000) / 1000, approximate: true }
      : null;
  const loc = i.locations.find(l => l.userId === inc.subject) ?? own;
  return {
    incident: {
      id: inc.id,
      kind: inc.kind,
      severity: inc.severity,
      status: inc.status,
      subjectName: inc.subjectName,
      subjectPersonaId: personaId(inc.subject, i.personaOf),
      sessionName: cut(i.roster?.session.name ?? ''),
      venue: cut(i.roster?.session.venueHint ?? ''),
      lastLocation: loc
        ? { lat: loc.lat, lng: loc.lng, approximate: loc.approximate, recordedAt: iso(loc.recordedAt) }
        : null,
      participants: inc.participants.map(p => ({
        personaId: personaId(p.userId, i.personaOf),
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
