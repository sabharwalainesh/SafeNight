import { t, type Infer } from 'spacetimedb/server';
import { Identity } from 'spacetimedb';
import { spacetimedb } from '../schema';
import {
  checkin,
  IncidentKind,
  IncidentStatus,
  LocationSource,
  ParticipantRole,
  Severity,
} from '../tables/safety';

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * The person an incident is about must not learn who reported them (no public accusations, no
 * retaliation). When the caller is the subject and did not open the incident themselves, the
 * reporter's identity is masked in every per-user incident view.
 */
function maskReporterFor(viewer: Identity, inc: { subject: Identity; openedBy: Identity }): boolean {
  return inc.subject.isEqual(viewer) && !inc.openedBy.isEqual(viewer);
}
const MASKED_NAME = 'A group member';

const visibleLocationRow = t.row('VisibleLocationRow', {
  id: t.u64().primaryKey(),
  sessionId: t.u64(),
  userId: t.identity(),
  displayName: t.string(),
  lat: t.f64(),
  lng: t.f64(),
  accuracyM: t.f32(),
  recordedAt: t.timestamp(),
  source: LocationSource,
  approximate: t.bool(),
});
type VisibleLocationValue = Infer<typeof visibleLocationRow>;

// Consent-scoped latest locations for every session the caller is an active member of.
// Staleness is the client's call (views have no clock). Expired grants are marked revoked by the sweep.
export const visibleLocations = spacetimedb.view(
  { name: 'visible_locations', public: true },
  t.array(visibleLocationRow),
  ctx => {
    const rows: VisibleLocationValue[] = [];
    const seenSessions = new Set<bigint>();
    for (const mine of ctx.db.sessionMember.userId.filter(ctx.sender)) {
      if (!mine.active || seenSessions.has(mine.sessionId)) continue;
      seenSessions.add(mine.sessionId);
      for (const m of ctx.db.sessionMember.sessionId.filter(mine.sessionId)) {
        if (!m.active) continue;
        const isMe = m.userId.isEqual(ctx.sender);
        let approximate = false;
        if (!isMe) {
          if (m.sharingScope.tag === 'none') continue;
          let precise = false;
          let approx = false;
          for (const g of ctx.db.consentGrant.bySubjectRecipient.filter([m.userId, ctx.sender])) {
            if (g.sessionId !== mine.sessionId || g.revokedAt !== undefined) continue;
            if (g.scope.tag === 'location_precise') precise = true;
            if (g.scope.tag === 'location_approximate') approx = true;
          }
          if (!precise && !approx) continue;
          // A member's "approximate" default still applies, except to the other party of a trip they are on:
          // accepting a "Come to me" is explicit consent to be found precisely until arrival.
          let inTrip = false;
          for (const mu of ctx.db.meetup.sessionId.filter(mine.sessionId)) {
            if (mu.status.tag !== 'coming') continue;
            const pair = (mu.requester.isEqual(m.userId) && mu.helper.isEqual(ctx.sender)) || (mu.helper.isEqual(m.userId) && mu.requester.isEqual(ctx.sender));
            if (pair) inTrip = true;
          }
          approximate = !precise || (m.sharingScope.tag === 'approximate' && !inTrip);
        }
        for (const loc of ctx.db.latestLocation.bySessionUser.filter([mine.sessionId, m.userId])) {
          rows.push({
            id: loc.locationId,
            sessionId: loc.sessionId,
            userId: loc.userId,
            displayName: ctx.db.userProfile.identity.find(loc.userId)?.displayName ?? 'Unknown',
            lat: approximate ? round3(loc.lat) : loc.lat,
            lng: approximate ? round3(loc.lng) : loc.lng,
            accuracyM: loc.accuracyM,
            recordedAt: loc.recordedAt,
            source: loc.source,
            approximate,
          });
        }
      }
    }
    return rows;
  }
);

export const myCheckins = spacetimedb.view(
  { name: 'my_checkins', public: true },
  t.array(checkin.rowType),
  ctx => Array.from(ctx.db.checkin.userId.filter(ctx.sender))
);

const incidentRow = t.row('IncidentRow', {
  id: t.u64().primaryKey(),
  sessionId: t.u64(),
  subject: t.identity(),
  subjectName: t.string(),
  kind: IncidentKind,
  severity: Severity,
  status: IncidentStatus,
  openedBy: t.identity(),
  openedAt: t.timestamp(),
  resolvedAt: t.timestamp().optional(),
  resolvedBy: t.identity().optional(),
});
type IncidentValue = Infer<typeof incidentRow>;

// Incidents where the caller is a participant.
export const myIncidents = spacetimedb.view(
  { name: 'my_incidents', public: true },
  t.array(incidentRow),
  ctx => {
    const rows: IncidentValue[] = [];
    const seen = new Set<bigint>();
    for (const p of ctx.db.incidentParticipant.userId.filter(ctx.sender)) {
      if (seen.has(p.incidentId)) continue;
      seen.add(p.incidentId);
      const inc = ctx.db.incident.id.find(p.incidentId);
      if (!inc) continue;
      rows.push({
        id: inc.id,
        sessionId: inc.sessionId,
        subject: inc.subject,
        subjectName: ctx.db.userProfile.identity.find(inc.subject)?.displayName ?? 'Unknown',
        kind: inc.kind,
        severity: inc.severity,
        status: inc.status,
        openedBy: maskReporterFor(ctx.sender, inc) ? Identity.zero() : inc.openedBy,
        openedAt: inc.openedAt,
        resolvedAt: inc.resolvedAt,
        resolvedBy: inc.resolvedBy,
      });
    }
    return rows;
  }
);

const incidentParticipantRow = t.row('IncidentParticipantRow', {
  id: t.u64().primaryKey(),
  incidentId: t.u64(),
  userId: t.identity(),
  displayName: t.string(),
  role: ParticipantRole,
  acknowledgedAt: t.timestamp().optional(),
});
type IncidentParticipantValue = Infer<typeof incidentParticipantRow>;

// Participants (with display names) of every incident the caller is a participant in.
export const myIncidentParticipants = spacetimedb.view(
  { name: 'my_incident_participants', public: true },
  t.array(incidentParticipantRow),
  ctx => {
    const rows: IncidentParticipantValue[] = [];
    const seen = new Set<bigint>();
    for (const mine of ctx.db.incidentParticipant.userId.filter(ctx.sender)) {
      if (seen.has(mine.incidentId)) continue;
      seen.add(mine.incidentId);
      const inc = ctx.db.incident.id.find(mine.incidentId);
      const mask = inc ? maskReporterFor(ctx.sender, inc) : false;
      for (const p of ctx.db.incidentParticipant.incidentId.filter(mine.incidentId)) {
        rows.push({
          id: p.id,
          incidentId: p.incidentId,
          userId: p.userId,
          displayName: ctx.db.userProfile.identity.find(p.userId)?.displayName ?? 'Unknown',
          // The subject sees the reporter as an ordinary buddy.
          role: mask && p.role.tag === 'reporter' ? { tag: 'buddy' } : p.role,
          acknowledgedAt: p.acknowledgedAt,
        });
      }
    }
    return rows;
  }
);

const incidentEventRow = t.row('IncidentEventRow', {
  id: t.u64().primaryKey(),
  incidentId: t.u64(),
  at: t.timestamp(),
  actor: t.identity(),
  actorName: t.string(),
  kind: t.string(),
  detail: t.string(),
  simulated: t.bool(),
});
type IncidentEventValue = Infer<typeof incidentEventRow>;

// Timeline events of every incident the caller is a participant in. Filter by incidentId on the client.
export const myIncidentEvents = spacetimedb.view(
  { name: 'my_incident_events', public: true },
  t.array(incidentEventRow),
  ctx => {
    const rows: IncidentEventValue[] = [];
    const seen = new Set<bigint>();
    for (const mine of ctx.db.incidentParticipant.userId.filter(ctx.sender)) {
      if (seen.has(mine.incidentId)) continue;
      seen.add(mine.incidentId);
      const inc = ctx.db.incident.id.find(mine.incidentId);
      const mask = inc ? maskReporterFor(ctx.sender, inc) : false;
      for (const e of ctx.db.incidentEvent.incidentId.filter(mine.incidentId)) {
        // Events written by the reporter (opening, repeated concerns) are attributed to "a group member" for the subject.
        const hideActor = mask && inc != null && e.actor.isEqual(inc.openedBy);
        rows.push({
          id: e.id,
          incidentId: e.incidentId,
          at: e.at,
          actor: hideActor ? Identity.zero() : e.actor,
          actorName: hideActor
            ? MASKED_NAME
            : e.actor.isEqual(ctx.sender)
              ? (ctx.db.userProfile.identity.find(e.actor)?.displayName ?? 'You')
              : (ctx.db.userProfile.identity.find(e.actor)?.displayName ?? 'SafeNight'),
          kind: e.kind,
          detail: e.detail,
          simulated: e.simulated,
        });
      }
    }
    return rows;
  }
);
