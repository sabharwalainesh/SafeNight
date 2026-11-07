import { SenderError, t } from 'spacetimedb/server';
import { spacetimedb } from '../schema';
import {
  CheckinKind,
  checkinTimer,
  ConcernCategory,
  ConsumptionLevel,
  locationSweep,
  LocationSource,
} from '../tables/safety';
import { audit, deny, getSession, requireActiveMember, sessionIsOpen } from '../lib/auth';
import {
  acceptedDriverId,
  addEvent,
  armCheckinTimer,
  CANCEL_WINDOW_MICROS,
  DEDUPE_BUCKET_MICROS,
  DRIVER_WARNING,
  displayNameOf,
  ensureSweepScheduled,
  findOpenIncident,
  findParticipant,
  hasActiveGrant,
  isOpenStatus,
  LOCATION_TTL_MINUTES,
  openDriverIncident,
  openIncident,
  participantsOf,
  requireNote,
  sendAlert,
} from '../lib/safety';
import { isAtOrBefore, isBefore, minutesAfter } from '../lib/time';
import { closeJobForIncident, completeRidePlans } from '../lib/agent/jobs';
import { ensureCommunitySchedules } from '../lib/community';
import { MODULE_VERSION } from '../lib/constants';

export const postLocation = spacetimedb.reducer(
  { sessionId: t.u64(), lat: t.f64(), lng: t.f64(), accuracyM: t.f32(), source: LocationSource },
  (ctx, { sessionId, lat, lng, accuracyM, source }) => {
    const session = getSession(ctx, sessionId);
    if (!sessionIsOpen(session)) throw new SenderError('Session is not active');
    const m = requireActiveMember(ctx, sessionId);
    if (m.sharingScope.tag === 'none') throw new SenderError('Turn on location sharing first');
    if (!(lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180)) throw new SenderError('Invalid coordinates');
    const expiresAt = minutesAfter(ctx.timestamp, LOCATION_TTL_MINUTES);
    const row = ctx.db.locationUpdate.insert({
      id: 0n,
      sessionId,
      userId: ctx.sender,
      lat,
      lng,
      accuracyM,
      recordedAt: ctx.timestamp,
      expiresAt,
      source,
    });
    const latest = { locationId: row.id, sessionId, userId: ctx.sender, lat, lng, accuracyM, recordedAt: ctx.timestamp, expiresAt, source };
    let updated = false;
    for (const existing of ctx.db.latestLocation.bySessionUser.filter([sessionId, ctx.sender])) {
      ctx.db.latestLocation.id.update({ ...latest, id: existing.id });
      updated = true;
    }
    if (!updated) ctx.db.latestLocation.insert({ ...latest, id: 0n });
  }
);

export const checkIn = spacetimedb.reducer(
  { sessionId: t.u64(), kind: CheckinKind, note: t.string() },
  (ctx, { sessionId, kind, note }) => {
    const session = getSession(ctx, sessionId);
    if (!sessionIsOpen(session)) throw new SenderError('Session is not active');
    requireActiveMember(ctx, sessionId);
    const clean = requireNote(note);
    ctx.db.checkin.insert({ id: 0n, sessionId, userId: ctx.sender, kind, note: clean, createdAt: ctx.timestamp });
    armCheckinTimer(ctx, sessionId, ctx.sender);

    const me = displayNameOf(ctx, ctx.sender);
    const open = findOpenIncident(ctx, sessionId, ctx.sender);
    const tag = kind.tag;

    if (tag === 'okay') {
      if (open) addEvent(ctx, open.id, 'subject_says_fine', `${me} says they are fine. The incident stays open until a person resolves it.`);
      return;
    }

    if (tag === 'home') {
      if (open && (open.status.tag === 'awaiting_home_confirmation' || open.status.tag === 'transport_arranged')) {
        ctx.db.incident.id.update({ ...open, status: { tag: 'resolved' }, resolvedAt: ctx.timestamp, resolvedBy: ctx.sender });
        addEvent(ctx, open.id, 'resolved', `${me} confirmed they are home`);
        closeJobForIncident(ctx, open.id, 'resolved', 'home_confirmed');
        completeRidePlans(ctx, open.id);
        for (const p of participantsOf(ctx, open.id)) {
          if (!p.userId.isEqual(ctx.sender)) sendAlert(ctx, p.userId, open.id, 'incident_update', `${me} confirmed they are home.`);
        }
      } else if (open) {
        addEvent(ctx, open.id, 'home_reported', `${me} reports being home; the incident is not in a state that home confirmation resolves.`);
      }
      return;
    }

    // need_friend / need_ride / unwell / emergency: open or escalate a help_requested incident.
    const urgent = tag === 'unwell' || tag === 'emergency';
    const severity = urgent ? 'urgent' : 'elevated';
    const label = tag.replace('_', ' ');
    const detail = `Check-in: ${label}${clean ? ` (${clean})` : ''}`;
    let inc = open;
    if (inc) {
      const current = inc.severity.tag;
      const next = urgent ? 'urgent' : current === 'info' ? 'elevated' : current;
      if (next !== current) ctx.db.incident.id.update({ ...inc, severity: { tag: next } });
      addEvent(ctx, inc.id, 'elevated', detail);
    } else {
      inc = openIncident(ctx, sessionId, ctx.sender, ctx.sender, 'help_requested', severity, detail);
    }
    if (tag === 'emergency') {
      addEvent(ctx, inc.id, 'emergency_guidance', 'Direct emergency services remain the person\'s call; SafeNight does not dispatch responders.');
    }
    for (const p of participantsOf(ctx, inc.id)) {
      if (!p.userId.isEqual(ctx.sender)) sendAlert(ctx, p.userId, inc.id, 'help_requested', `${me} needs help (${label}).`);
    }
  }
);

export const reportConsumption = spacetimedb.reducer(
  { sessionId: t.u64(), level: ConsumptionLevel, shareWithBuddy: t.bool() },
  (ctx, { sessionId, level, shareWithBuddy }) => {
    const session = getSession(ctx, sessionId);
    if (!sessionIsOpen(session)) throw new SenderError('Session is not active');
    requireActiveMember(ctx, sessionId);
    ctx.db.consumptionSelfReport.insert({
      id: 0n,
      userId: ctx.sender,
      sessionId,
      level,
      shareWithBuddy,
      createdAt: ctx.timestamp,
    });
    const driver = acceptedDriverId(ctx, sessionId);
    if (!driver || !driver.isEqual(ctx.sender) || level.tag === 'none') return;
    if (findOpenIncident(ctx, sessionId, ctx.sender)?.kind.tag === 'possible_impaired_driving') return;
    if (!shareWithBuddy) {
      // The deterministic warning never waits on consent; outreach to others does.
      sendAlert(ctx, ctx.sender, 0n, 'no_driving_warning', DRIVER_WARNING);
      audit(ctx, 'driver_self_report_private', `night_session:${sessionId}`);
      return;
    }
    openDriverIncident(ctx, sessionId, ctx.sender, ctx.sender, `Driver reports: ${level.tag.replace('_', ' ')}`);
  }
);

export const reportConcern = spacetimedb.reducer(
  { sessionId: t.u64(), subject: t.identity(), category: ConcernCategory, note: t.string() },
  (ctx, { sessionId, subject, category, note }) => {
    const session = getSession(ctx, sessionId);
    if (!sessionIsOpen(session)) throw new SenderError('Session is not active');
    requireActiveMember(ctx, sessionId);
    if (subject.isEqual(ctx.sender)) throw new SenderError('Use a check-in to report about yourself');
    const subjectMember = ctx.db.sessionMember.bySessionUser.filter([sessionId, subject]);
    let subjectActive = false;
    for (const sm of subjectMember) subjectActive = sm.active;
    if (!subjectActive) throw new SenderError('Subject is not in this session');
    const clean = requireNote(note);
    const bucket = ctx.timestamp.microsSinceUnixEpoch / DEDUPE_BUCKET_MICROS;
    const dedupeKey = `${sessionId}:${subject.toHexString()}:${category.tag}:${bucket}`;
    if (ctx.db.concernReport.dedupeKey.find(dedupeKey)) throw new SenderError('Already reported');
    ctx.db.concernReport.insert({
      id: 0n,
      sessionId,
      reporter: ctx.sender,
      subject,
      category,
      note: clean,
      createdAt: ctx.timestamp,
      dedupeKey,
    });
    audit(ctx, 'report_concern', `night_session:${sessionId}:${category.tag}`);

    const driver = acceptedDriverId(ctx, sessionId);
    const existing = findOpenIncident(ctx, sessionId, subject);
    if (driver && driver.isEqual(subject) && category.tag === 'possible_consumption') {
      if (existing?.kind.tag === 'possible_impaired_driving') {
        addEvent(ctx, existing.id, 'concern_repeated', `${displayNameOf(ctx, ctx.sender)} also reported a concern`);
        return;
      }
      openDriverIncident(ctx, sessionId, subject, ctx.sender, clean || 'Possible drinking reported for the driver');
      return;
    }
    const detail = clean || `Concern reported: ${category.tag.replace('_', ' ')}`;
    let inc = existing;
    if (inc) {
      addEvent(ctx, inc.id, 'concern_added', `${displayNameOf(ctx, ctx.sender)}: ${detail}`);
    } else {
      inc = openIncident(ctx, sessionId, subject, ctx.sender, 'feeling_unsafe', 'elevated', detail);
    }
    const subjectName = displayNameOf(ctx, subject);
    for (const p of participantsOf(ctx, inc.id)) {
      if (!p.userId.isEqual(subject)) {
        sendAlert(ctx, p.userId, inc.id, 'ack_requested', `${subjectName}: ${category.tag.replace('_', ' ')} concern. Please acknowledge.`);
      }
    }
  }
);

export const acknowledgeIncident = spacetimedb.reducer({ incidentId: t.u64() }, (ctx, { incidentId }) => {
  const inc = ctx.db.incident.id.find(incidentId);
  const p = inc && findParticipant(ctx, incidentId, ctx.sender);
  if (!inc || !p) throw new SenderError('Only participants can acknowledge');
  if (inc.subject.isEqual(ctx.sender)) throw new SenderError("You can't acknowledge your own alert");
  if (!isOpenStatus(inc.status.tag)) throw new SenderError('This incident is closed');
  if (p.acknowledgedAt === undefined) ctx.db.incidentParticipant.id.update({ ...p, acknowledgedAt: ctx.timestamp });
  if (inc.status.tag === 'open') ctx.db.incident.id.update({ ...inc, status: { tag: 'acknowledged' } });
  const me = displayNameOf(ctx, ctx.sender);
  addEvent(ctx, incidentId, 'acknowledged', `${me} acknowledged`);
  sendAlert(ctx, inc.subject, incidentId, 'incident_update', `${me} acknowledged your alert.`);
});

export const resolveIncident = spacetimedb.reducer({ incidentId: t.u64(), note: t.string() }, (ctx, { incidentId, note }) => {
  if (ctx.senderAuth.isInternal) throw new SenderError('Only a person can resolve an incident');
  const inc = ctx.db.incident.id.find(incidentId);
  const p = inc && findParticipant(ctx, incidentId, ctx.sender);
  if (!inc || !p) deny(ctx, 'resolve_incident', `incident:${incidentId}`, 'You are not allowed to resolve this incident');
  if (!isOpenStatus(inc.status.tag)) throw new SenderError('This incident is closed');
  const clean = requireNote(note);
  const isSubject = inc.subject.isEqual(ctx.sender);
  const trusted =
    (p.role.tag === 'organizer' || p.role.tag === 'buddy') &&
    hasActiveGrant(ctx, inc.subject, ctx.sender, inc.sessionId, 'messaging') &&
    hasActiveGrant(ctx, inc.subject, ctx.sender, inc.sessionId, 'checkins');
  if (!isSubject && !trusted) {
    deny(ctx, 'resolve_incident', `incident:${incidentId}`, 'You are not allowed to resolve this incident');
  }
  ctx.db.incident.id.update({ ...inc, status: { tag: 'resolved' }, resolvedAt: ctx.timestamp, resolvedBy: ctx.sender });
  const me = displayNameOf(ctx, ctx.sender);
  addEvent(ctx, incidentId, 'resolved', clean || `Resolved by ${me}`);
  closeJobForIncident(ctx, incidentId, 'resolved', 'resolved_by_human');
  audit(ctx, 'resolve_incident', `incident:${incidentId}`);
  for (const other of participantsOf(ctx, incidentId)) {
    if (!other.userId.isEqual(ctx.sender)) sendAlert(ctx, other.userId, incidentId, 'incident_update', `${me} resolved the incident.`);
  }
});

export const cancelIncident = spacetimedb.reducer({ incidentId: t.u64(), reason: t.string() }, (ctx, { incidentId, reason }) => {
  const inc = ctx.db.incident.id.find(incidentId);
  if (!inc || !inc.subject.isEqual(ctx.sender)) {
    deny(ctx, 'cancel_incident', `incident:${incidentId}`, 'Only the person the incident is about can cancel it');
  }
  if (!isOpenStatus(inc.status.tag)) throw new SenderError('This incident is closed');
  if (ctx.timestamp.since(inc.openedAt).micros > CANCEL_WINDOW_MICROS) {
    throw new SenderError('Too late to cancel; resolve it instead');
  }
  const clean = requireNote(reason);
  ctx.db.incident.id.update({ ...inc, status: { tag: 'cancelled' }, resolvedAt: ctx.timestamp, resolvedBy: ctx.sender });
  const me = displayNameOf(ctx, ctx.sender);
  addEvent(ctx, incidentId, 'cancelled', clean || `Cancelled by ${me}`);
  closeJobForIncident(ctx, incidentId, 'cancelled', 'cancelled_by_subject');
  for (const other of participantsOf(ctx, incidentId)) {
    if (!other.userId.isEqual(ctx.sender)) sendAlert(ctx, other.userId, incidentId, 'incident_update', `${me} cancelled their request.`);
  }
});

// Scheduler-only: a member's agreed check-in came due.
export const onCheckinDue = spacetimedb.reducer(
  { onSchedule: checkinTimer },
  { arg: checkinTimer.rowType },
  (ctx, { arg }) => {
    const session = ctx.db.nightSession.id.find(arg.sessionId);
    if (!session || !sessionIsOpen(session)) return;
    let active = false;
    for (const m of ctx.db.sessionMember.bySessionUser.filter([arg.sessionId, arg.userId])) active = m.active;
    if (!active) return;
    let checkedIn = false;
    for (const c of ctx.db.checkin.bySessionUser.filter([arg.sessionId, arg.userId])) {
      if (!isBefore(c.createdAt, arg.armedAt)) checkedIn = true;
    }
    if (!checkedIn) {
      const name = displayNameOf(ctx, arg.userId);
      const open = findOpenIncident(ctx, arg.sessionId, arg.userId);
      if (open) {
        addEvent(ctx, open.id, 'missed_checkin', `${name} missed an agreed check-in`);
      } else {
        const inc = openIncident(
          ctx,
          arg.sessionId,
          arg.userId,
          arg.userId,
          'missed_checkin',
          'elevated',
          `${name} has not checked in for ${session.checkinIntervalMinutes} minutes`
        );
        for (const p of participantsOf(ctx, inc.id)) {
          if (!p.userId.isEqual(arg.userId)) {
            sendAlert(ctx, p.userId, inc.id, 'ack_requested', `${name} missed a check-in. Can you reach them?`);
          }
        }
        sendAlert(ctx, arg.userId, inc.id, 'incident_update', 'You missed a check-in. Tap "I\'m okay" if all is well.');
      }
    }
    // Scheduled reducers see their own one-shot row until commit; re-arm for the next interval.
    armCheckinTimer(ctx, arg.sessionId, arg.userId);
  }
);

// Scheduler-only maintenance: expired locations are deleted; expired consent grants are marked revoked
// so views (which have no clock) can rely on `revokedAt` alone.
export const sweepLocations = spacetimedb.reducer(
  { onSchedule: locationSweep },
  { arg: locationSweep.rowType },
  ctx => {
    for (const row of ctx.db.locationUpdate.iter()) {
      if (isAtOrBefore(row.expiresAt, ctx.timestamp)) ctx.db.locationUpdate.id.delete(row.id);
    }
    for (const row of ctx.db.latestLocation.iter()) {
      if (isAtOrBefore(row.expiresAt, ctx.timestamp)) ctx.db.latestLocation.id.delete(row.id);
    }
    for (const g of ctx.db.consentGrant.iter()) {
      if (g.revokedAt === undefined && isAtOrBefore(g.expiresAt, ctx.timestamp)) {
        ctx.db.consentGrant.id.update({ ...g, revokedAt: g.expiresAt });
      }
    }
  }
);

// Owner-only: `init` does not re-run on republish, so this re-creates the maintenance schedule.
export const ensureSchedules = spacetimedb.reducer(ctx => {
  const owner = ctx.db.config.id.find(0)?.owner;
  if (!owner || !owner.isEqual(ctx.sender)) throw new SenderError('Only the database owner can do that');
  const created = [...(ensureSweepScheduled(ctx) ? ['location_sweep'] : []), ...ensureCommunitySchedules(ctx)];
  // Record the published version so `runtime_status` (whose read set includes this row) refreshes.
  const meta = ctx.db.moduleMeta.id.find(0);
  if (meta) ctx.db.moduleMeta.id.update({ ...meta, moduleVersion: MODULE_VERSION, publishedAt: ctx.timestamp });
  else ctx.db.moduleMeta.insert({ id: 0, moduleVersion: MODULE_VERSION, publishedAt: ctx.timestamp });
  audit(ctx, 'ensure_schedules', created.length ? `created:${created.join(',')}` : 'all_present');
});
