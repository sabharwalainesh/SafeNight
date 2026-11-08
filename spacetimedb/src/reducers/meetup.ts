import { SenderError, t } from 'spacetimedb/server';
import { spacetimedb } from '../schema';
import { meetupExpiry } from '../tables/meetup';
import { audit, type Ctx, getSession, requireActiveMember, sessionIsOpen } from '../lib/auth';
import {
  addEvent,
  armCheckinTimer,
  displayNameOf,
  findOpenIncident,
  findParticipant,
  isOpenStatus,
  openIncident,
  participantsOf,
  requireNote,
  sendAlert,
} from '../lib/safety';
import { insertGrant } from '../lib/nightout';
import { countRecent, enforceLimit, LIMITS, MINUTE_MICROS } from '../lib/limits';
import { isAtOrBefore, minutesAfter } from '../lib/time';
import { clearMeetupPositions, findComingMeetup, MEETUP_TTL_MINUTES, revokeMeetupGrants } from '../lib/meetup';

/** "Come to me": ask the group for someone to physically come to the caller. */
export const requestCompany = spacetimedb.reducer({ sessionId: t.u64(), note: t.string() }, (ctx, { sessionId, note }) => {
  const session = getSession(ctx, sessionId);
  if (!sessionIsOpen(session)) throw new SenderError('Session is not active');
  requireActiveMember(ctx, sessionId);
  const clean = requireNote(note);
  enforceLimit(
    countRecent(ctx.db.checkin.bySessionUser.filter([sessionId, ctx.sender]), c => c.createdAt, ctx.timestamp, MINUTE_MICROS),
    LIMITS.checkinsPerMinute,
    'Too many check-ins in a minute; take a breath'
  );
  ctx.db.checkin.insert({ id: 0n, sessionId, userId: ctx.sender, kind: { tag: 'need_friend' }, note: clean, createdAt: ctx.timestamp });
  armCheckinTimer(ctx, sessionId, ctx.sender);

  const me = displayNameOf(ctx, ctx.sender);
  const detail = `Come to me${clean ? ` (${clean})` : ''}`;
  let inc = findOpenIncident(ctx, sessionId, ctx.sender);
  if (inc) {
    const next = inc.severity.tag === 'info' ? 'elevated' : inc.severity.tag;
    inc = { ...inc, severity: { tag: next }, meetupWanted: true };
    ctx.db.incident.id.update(inc);
  } else {
    inc = openIncident(ctx, sessionId, ctx.sender, ctx.sender, 'help_requested', 'elevated', detail);
    inc = { ...inc, meetupWanted: true };
    ctx.db.incident.id.update(inc);
  }
  addEvent(ctx, inc.id, 'company_requested', `${me} wants someone to come to them${clean ? `: ${clean}` : ''}`);
  for (const p of participantsOf(ctx, inc.id)) {
    if (!p.userId.isEqual(ctx.sender)) sendAlert(ctx, p.userId, inc.id, 'help_requested', `${me} wants someone to come to them.`);
  }
  audit(ctx, 'request_company', `incident:${inc.id}`);
});

/** A participant volunteers to go to the requester. Opens a 60-minute two-way precise-location window. */
export const offerToCome = spacetimedb.reducer({ incidentId: t.u64() }, (ctx, { incidentId }) => {
  const inc = ctx.db.incident.id.find(incidentId);
  const p = inc && findParticipant(ctx, incidentId, ctx.sender);
  if (!inc || !p) throw new SenderError('Only participants can offer to come');
  if (inc.subject.isEqual(ctx.sender)) throw new SenderError("You can't come to yourself");
  if (!isOpenStatus(inc.status.tag)) throw new SenderError('This incident is closed');
  if (!inc.meetupWanted) throw new SenderError('Nobody asked for company on this incident');
  const session = getSession(ctx, inc.sessionId);
  if (!sessionIsOpen(session)) throw new SenderError('Session is not active');
  requireActiveMember(ctx, inc.sessionId);
  requireActiveMember(ctx, inc.sessionId, inc.subject);
  if (findComingMeetup(ctx, incidentId, ctx.sender)) return; // idempotent

  const mu = ctx.db.meetup.insert({
    id: 0n,
    incidentId,
    sessionId: inc.sessionId,
    requester: inc.subject,
    helper: ctx.sender,
    status: { tag: 'coming' },
    startedAt: ctx.timestamp,
    arrivedAt: undefined,
    expiresAt: minutesAfter(ctx.timestamp, MEETUP_TTL_MINUTES),
  });
  insertGrant(ctx, inc.subject, ctx.sender, inc.sessionId, { tag: 'location_precise' }, MEETUP_TTL_MINUTES);
  insertGrant(ctx, ctx.sender, inc.subject, inc.sessionId, { tag: 'location_precise' }, MEETUP_TTL_MINUTES);
  if (p.acknowledgedAt === undefined) ctx.db.incidentParticipant.id.update({ ...p, acknowledgedAt: ctx.timestamp });
  if (inc.status.tag === 'open') ctx.db.incident.id.update({ ...inc, status: { tag: 'acknowledged' } });

  const helper = displayNameOf(ctx, ctx.sender);
  const requester = displayNameOf(ctx, inc.subject);
  addEvent(ctx, incidentId, 'helper_coming', `${helper} is coming to ${requester}`);
  sendAlert(ctx, inc.subject, incidentId, 'incident_update', `${helper} is coming to you.`);
  sendAlert(ctx, ctx.sender, incidentId, 'incident_update', `Head to ${requester}; the compass is live.`);
  audit(ctx, 'offer_to_come', `meetup:${mu.id}`);
});

function requireMeetupParty(ctx: Ctx, meetupId: bigint) {
  const mu = ctx.db.meetup.id.find(meetupId);
  if (!mu || !(mu.requester.isEqual(ctx.sender) || mu.helper.isEqual(ctx.sender))) {
    throw new SenderError('Only the requester or helper can do that');
  }
  return mu;
}

/** Either side confirms the helper arrived. The incident stays open; a person still resolves it. */
export const markArrived = spacetimedb.reducer({ meetupId: t.u64() }, (ctx, { meetupId }) => {
  const mu = requireMeetupParty(ctx, meetupId);
  if (mu.status.tag !== 'coming') throw new SenderError('This meetup is not in progress');
  ctx.db.meetup.id.update({ ...mu, status: { tag: 'arrived' }, arrivedAt: ctx.timestamp });
  clearMeetupPositions(ctx, mu.id);
  const helper = displayNameOf(ctx, mu.helper);
  const requester = displayNameOf(ctx, mu.requester);
  addEvent(ctx, mu.incidentId, 'helper_arrived', `${helper} reached ${requester}`);
  sendAlert(ctx, mu.requester, mu.incidentId, 'incident_update', `${helper} has arrived.`);
  sendAlert(ctx, mu.helper, mu.incidentId, 'incident_update', `You reached ${requester}.`);
  audit(ctx, 'mark_arrived', `meetup:${mu.id}`);
});

/** Either side calls it off. Only the two meetup grants are revoked. */
export const cancelMeetup = spacetimedb.reducer({ meetupId: t.u64(), reason: t.string() }, (ctx, { meetupId, reason }) => {
  const mu = requireMeetupParty(ctx, meetupId);
  if (mu.status.tag !== 'coming') throw new SenderError('This meetup is not in progress');
  const clean = requireNote(reason);
  ctx.db.meetup.id.update({ ...mu, status: { tag: 'cancelled' } });
  revokeMeetupGrants(ctx, mu);
  const me = displayNameOf(ctx, ctx.sender);
  addEvent(ctx, mu.incidentId, 'meetup_cancelled', `${me} cancelled the meetup${clean ? `: ${clean}` : ''}`);
  const other = mu.requester.isEqual(ctx.sender) ? mu.helper : mu.requester;
  sendAlert(ctx, other, mu.incidentId, 'incident_update', `${me} cancelled the meetup.`);
  sendAlert(ctx, ctx.sender, mu.incidentId, 'incident_update', 'Meetup cancelled.');
  audit(ctx, 'cancel_meetup', `meetup:${mu.id}`);
});

/** Scheduled: stale `coming` meetups become cancelled and lose their grants. */
export const expireMeetups = spacetimedb.reducer(
  { onSchedule: meetupExpiry },
  { arg: meetupExpiry.rowType },
  ctx => {
    // Sweep live positions left behind by any meetup that is no longer in progress.
    for (const p of [...ctx.db.meetupPosition.iter()]) {
      const owner = ctx.db.meetup.id.find(p.meetupId);
      if (!owner || owner.status.tag !== 'coming') ctx.db.meetupPosition.id.delete(p.id);
    }
    for (const mu of ctx.db.meetup.iter()) {
      if (mu.status.tag !== 'coming') continue;
      // Also sweep trips whose incident closed before this rule existed (or by any path that missed it).
      const inc = ctx.db.incident.id.find(mu.incidentId);
      const orphaned = !inc || !isOpenStatus(inc.status.tag);
      if (!orphaned && !isAtOrBefore(mu.expiresAt, ctx.timestamp)) continue;
      ctx.db.meetup.id.update({ ...mu, status: { tag: 'cancelled' } });
      revokeMeetupGrants(ctx, mu);
      if (orphaned) continue;
      addEvent(ctx, mu.incidentId, 'meetup_cancelled', 'expired');
      for (const who of [mu.requester, mu.helper]) {
        sendAlert(ctx, who, mu.incidentId, 'incident_update', 'The meetup timed out after an hour.');
      }
    }
  }
);

/**
 * Live compass stream for the two parties of a `coming` meetup. Called on every GPS fix (throttled
 * client-side to a few per second); upserts one row so the partner's subscription gets a single row
 * update within milliseconds. Fixes faster than ~4 Hz are dropped silently instead of erroring.
 */
export const streamMeetupPosition = spacetimedb.reducer(
  {
    meetupId: t.u64(),
    lat: t.f64(),
    lng: t.f64(),
    accuracyM: t.f32(),
    headingDeg: t.f32().optional(),
    speedMps: t.f32().optional(),
  },
  (ctx, { meetupId, lat, lng, accuracyM, headingDeg, speedMps }) => {
    const mu = requireMeetupParty(ctx, meetupId);
    if (mu.status.tag !== 'coming' || isAtOrBefore(mu.expiresAt, ctx.timestamp)) throw new SenderError('This meetup is not in progress');
    // Same gates as post_location: open session, active membership, sharing not turned off.
    if (!sessionIsOpen(getSession(ctx, mu.sessionId))) throw new SenderError('Session is not active');
    const member = requireActiveMember(ctx, mu.sessionId);
    if (member.sharingScope.tag === 'none') {
      for (const p of [...ctx.db.meetupPosition.meetupId.filter(meetupId)]) {
        if (p.userId.isEqual(ctx.sender)) ctx.db.meetupPosition.id.delete(p.id);
      }
      return; // dropped (not thrown, so the stale row deletion commits); the view hides it anyway

    }
    if (!(lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180)) throw new SenderError('Invalid coordinates');
    if (!(accuracyM >= 0 && accuracyM <= 10_000)) throw new SenderError('Invalid accuracy');
    const heading = headingDeg !== undefined && headingDeg >= 0 && headingDeg < 360 ? headingDeg : undefined;
    const speed = speedMps !== undefined && speedMps >= 0 && speedMps <= 100 ? speedMps : undefined;
    let existing;
    for (const p of ctx.db.meetupPosition.meetupId.filter(meetupId)) {
      if (p.userId.isEqual(ctx.sender)) existing = p;
    }
    if (existing && ctx.timestamp.microsSinceUnixEpoch - existing.recordedAt.microsSinceUnixEpoch < LIMITS.meetupStreamMinIntervalMicros) return;
    const row = { meetupId, userId: ctx.sender, lat, lng, accuracyM, headingDeg: heading, speedMps: speed, recordedAt: ctx.timestamp };
    if (existing) ctx.db.meetupPosition.id.update({ ...row, id: existing.id });
    else ctx.db.meetupPosition.insert({ ...row, id: 0n });
  }
);
