// MOCK until C3-A bindings: what the simulated agent may know about a Night Out session.
// The engine never imports a Night Out store; AgentMockProvider builds a view from
// either the mock store (mock mode) or useNightOut() (live mode).
import type { ConsentGrant, NightOutApi, SessionMember, UserId } from '../../night-out/api';
import { getSnapshot as noSnap, mutate as noMutate } from '../../night-out/mock/store';

export type NightOutView = {
  /** Active members only, in join order. */
  members(sessionId: string): SessionMember[];
  organizer(sessionId: string): UserId | null;
  /** Accepted, active driver. */
  driverId(sessionId: string): UserId | null;
  /**
   * Consent grants for the session. Mock mode sees every grant. Live mode sees only
   * grants where the caller is subject or recipient (my_consents), so the agent treats
   * consent between two other people as ABSENT: a known limitation until the real agent
   * runs server-side.
   */
  grants(sessionId: string): ConsentGrant[];
};

export const EMPTY_VIEW: NightOutView = { members: () => [], organizer: () => null, driverId: () => null, grants: () => [] };

export function mockStoreView(): NightOutView {
  return {
    members: (sid) => noSnap().members.filter((m) => m.sessionId === sid && m.leftAt === null),
    organizer: (sid) => noSnap().sessions.find((x) => x.id === sid)?.organizer ?? null,
    driverId: (sid) => noSnap().drivers.find((d) => d.sessionId === sid && d.endedAt === null && d.acceptedAt !== null)?.driverId ?? null,
    grants: (sid) => noSnap().grants.filter((g) => g.sessionId === sid),
  };
}

export function apiView(no: NightOutApi): NightOutView {
  return {
    members: (sid) => no.roster(sid)?.members.filter((m) => m.leftAt === null) ?? [],
    organizer: (sid) => no.roster(sid)?.session.organizer ?? null,
    driverId: (sid) => no.roster(sid)?.drivers.find((d) => d.endedAt === null && d.acceptedAt !== null)?.driverId ?? null,
    grants: (sid) => no.myConsents.filter((g) => g.sessionId === sid),
  };
}

const MIN = 60000;

/** Mock mode only: clear the mock Night Out store. */
export function resetMockNightOut() {
  noMutate((s) => {
    s.counter = 0;
    s.sessions = [];
    s.members = [];
    s.invites = [];
    s.drivers = [];
    s.grants = [];
  });
}

/** Mock mode only: create the four-persona demo session. */
export function setupMockGroup() {
  const people: [UserId, string][] = [['alex', 'Alex'], ['sam', 'Sam'], ['maya', 'Maya'], ['jordan', 'Jordan']];
  noMutate((s, id) => {
    const now = Date.now();
    for (const m of s.members) if (m.leftAt === null && people.some(([u]) => u === m.userId)) m.leftAt = now;
    for (const x of s.sessions) if (x.status === 'active' && x.organizer === 'alex') x.status = 'ended';
    const sid = id();
    s.sessions.push({ id: sid, organizer: 'alex', name: 'Saturday night', venueHint: 'Demo venue', startsAt: now, expiresAt: now + 8 * 60 * MIN, status: 'active', checkinIntervalMinutes: 30, createdAt: now });
    for (const [u, n] of people)
      s.members.push({ id: id(), sessionId: sid, userId: u, displayName: n, role: u === 'alex' ? 'organizer' : 'participant', joinedAt: now, leftAt: null, sharingScope: 'precise' });
    s.drivers.push({ id: id(), sessionId: sid, driverId: 'sam', volunteeredAt: now, acceptedAt: now, endedAt: null, endReason: 'none' });
    for (const [subject] of people)
      for (const [recipient] of people)
        if (subject !== recipient)
          for (const scope of ['location_precise', 'checkins', 'messaging', 'concern_reports'] as const)
            s.grants.push({ id: id(), subject, recipient, sessionId: sid, scope, startsAt: now, expiresAt: now + 300 * MIN, revokedAt: null });
  });
}
