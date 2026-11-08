import { SenderError } from 'spacetimedb/server';
import { closeMeetupsForIncident } from './meetup';
import { ScheduleAt, type Identity } from 'spacetimedb';
import type { Ctx } from './auth';
import { openDriverAssignment, sessionIsOpen } from './auth';
import { armCheckinTimer, isOpenStatus } from './safety';
import { minutesAfter } from './time';
import { clearSessionExpiry, closeSession, insertGrant } from './nightout';
import { closeJobForIncident } from './agent/jobs';

export const PERSONA_IDS = ['alex', 'sam', 'maya', 'jordan'] as const;
export type PersonaId = (typeof PERSONA_IDS)[number];

export const DEMO_SESSION_HOURS = 6;
export const DEMO_CHECKIN_MINUTES = 60;
export const DEMO_GRANT_TTL_MINUTES = 180;

export const DEMO_VENUE_HINT = "";
export const DEMO_SESSION_NAME = "Tonight";

export function isPersonaId(value: string): value is PersonaId {
  return (PERSONA_IDS as readonly string[]).includes(value);
}

/** Registered persona identities, keyed by persona id. */
export function personaIdentities(ctx: Ctx): Partial<Record<PersonaId, Identity>> {
  const out: Partial<Record<PersonaId, Identity>> = {};
  for (const id of PERSONA_IDS) {
    const row = ctx.db.demoPersona.personaId.find(id);
    if (row) out[id] = row.identity;
  }
  return out;
}

export function requireAllPersonas(ctx: Ctx): Record<PersonaId, Identity> {
  const found = personaIdentities(ctx);
  const missing = PERSONA_IDS.filter(id => !found[id]);
  if (missing.length > 0) {
    throw new SenderError(`Register all four personas first: missing ${missing.join(', ')}`);
  }
  return found as Record<PersonaId, Identity>;
}

/** The open demo session with this name, if one exists. Stale demo_session rows (closed sessions) are dropped. */
export function findOpenDemoSession(ctx: Ctx, name: string) {
  for (const d of ctx.db.demoSession.iter()) {
    const s = ctx.db.nightSession.id.find(d.sessionId);
    if (!s || !sessionIsOpen(s)) {
      ctx.db.demoSession.sessionId.delete(d.sessionId);
      continue;
    }
    if (s.name === name) return s;
  }
  return undefined;
}

function addMember(ctx: Ctx, sessionId: bigint, userId: Identity, role: 'organizer' | 'participant') {
  ctx.db.sessionMember.insert({
    id: 0n,
    sessionId,
    userId,
    role: { tag: role },
    joinedAt: ctx.timestamp,
    leftAt: undefined,
    sharingScope: { tag: 'approximate' },
    active: true,
  });
  armCheckinTimer(ctx, sessionId, userId);
}

function ensureContact(ctx: Ctx, owner: Identity, contact: Identity, role: 'buddy' | 'backup_buddy', priority: number) {
  for (const existing of ctx.db.trustedContact.owner.filter(owner)) {
    if (existing.contact.isEqual(contact)) return;
  }
  ctx.db.trustedContact.insert({
    id: 0n,
    owner,
    contact,
    role: { tag: role },
    messagingConsent: true,
    priority,
    createdAt: ctx.timestamp,
  });
}

/**
 * Build the judge-demo group: Alex organizes, Sam is the accepted driver, Maya and Jordan are Sam's
 * buddy (1) and backup (2), everyone shares approximate location and check-ins with everyone, and
 * messaging consent runs Sam <-> Maya/Jordan. Idempotent per session name. Returns the session id.
 */
export function setupDemoGroup(ctx: Ctx, rawName: string): bigint {
  const name = rawName.trim() || DEMO_SESSION_NAME;
  const who = requireAllPersonas(ctx);
  const existing = findOpenDemoSession(ctx, name);
  if (existing) return existing.id;

  const expiresAt = minutesAfter(ctx.timestamp, DEMO_SESSION_HOURS * 60);
  const session = ctx.db.nightSession.insert({
    id: 0n,
    organizer: who.alex,
    name,
    venueHint: DEMO_VENUE_HINT,
    startsAt: ctx.timestamp,
    expiresAt,
    status: { tag: 'active' },
    checkinIntervalMinutes: DEMO_CHECKIN_MINUTES,
    createdAt: ctx.timestamp,
  });
  ctx.db.sessionExpiry.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.time(expiresAt.microsSinceUnixEpoch),
    sessionId: session.id,
  });
  ctx.db.demoSession.insert({ sessionId: session.id, createdAt: ctx.timestamp });

  addMember(ctx, session.id, who.alex, 'organizer');
  for (const id of ['sam', 'maya', 'jordan'] as const) addMember(ctx, session.id, who[id], 'participant');

  // One open driver per session is an invariant; a fresh session has none.
  if (openDriverAssignment(ctx, session.id)) throw new Error('demo session unexpectedly has a driver');
  ctx.db.driverAssignment.insert({
    id: 0n,
    sessionId: session.id,
    driverId: who.sam,
    volunteeredAt: ctx.timestamp,
    acceptedAt: ctx.timestamp,
    endedAt: undefined,
    endReason: { tag: 'none' },
  });

  ensureContact(ctx, who.sam, who.maya, 'buddy', 1);
  ensureContact(ctx, who.sam, who.jordan, 'backup_buddy', 2);

  for (const a of PERSONA_IDS) {
    for (const b of PERSONA_IDS) {
      if (a === b) continue;
      insertGrant(ctx, who[a], who[b], session.id, { tag: 'location_approximate' }, DEMO_GRANT_TTL_MINUTES);
      insertGrant(ctx, who[a], who[b], session.id, { tag: 'checkins' }, DEMO_GRANT_TTL_MINUTES);
    }
  }
  for (const buddy of ['maya', 'jordan'] as const) {
    insertGrant(ctx, who.sam, who[buddy], session.id, { tag: 'messaging' }, DEMO_GRANT_TTL_MINUTES);
    insertGrant(ctx, who[buddy], who.sam, session.id, { tag: 'messaging' }, DEMO_GRANT_TTL_MINUTES);
  }

  // No seeded positions: every device posts its real GPS once it is in the group.
  return session.id;
}

/** End every demo session: cancel its open incidents on the subject's behalf, close it, forget it. */
export function resetDemoGroup(ctx: Ctx): number {
  let ended = 0;
  for (const d of ctx.db.demoSession.iter()) {
    const session = ctx.db.nightSession.id.find(d.sessionId);
    if (session && sessionIsOpen(session)) {
      for (const inc of ctx.db.incident.sessionId.filter(session.id)) {
        if (!isOpenStatus(inc.status.tag)) continue;
        ctx.db.incident.id.update({ ...inc, status: { tag: 'cancelled' }, resolvedAt: ctx.timestamp, resolvedBy: inc.subject });
        ctx.db.incidentEvent.insert({
          id: 0n,
          incidentId: inc.id,
          at: ctx.timestamp,
          actor: inc.subject,
          kind: 'cancelled',
          detail: 'Cancelled by the demo reset',
          simulated: true,
        });
        closeJobForIncident(ctx, inc.id, 'cancelled', 'demo_reset');
        closeMeetupsForIncident(ctx, inc.id);
      }
      closeSession(ctx, session.id, 'ended');
      clearSessionExpiry(ctx, session.id);
      ended++;
    }
    ctx.db.demoSession.sessionId.delete(d.sessionId);
  }
  return ended;
}
