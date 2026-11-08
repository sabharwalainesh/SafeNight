import { SenderError, t } from 'spacetimedb/server';
import { spacetimedb } from '../schema';
import { SharingScope } from '../tables/nightout';
import {
  AppRole,
  ModerationState,
  retentionSweep,
  VenueReportCategory,
  venueReportExpiry,
  VoteKind,
} from '../tables/community';
import { audit, deny, openDriverAssignment, requireProfile, sessionIsOpen, type Ctx } from '../lib/auth';
import {
  CORROBORATED_AT,
  ensureCommunitySchedules,
  isModerator,
  REPORT_MERGE_WINDOW_MICROS,
  REPORT_TTL_MINUTES,
  requireDemoAllowed,
  requireOwner,
  requireReportText,
  round3,
  runRetention,
  seedResources as seedResourceRows,
  SENSITIVE_CATEGORIES,
} from '../lib/community';
import { isAtOrBefore, minutesAfter } from '../lib/time';
import { countRecent, enforceLimit, HOUR_MICROS, LIMITS } from '../lib/limits';
import { addEvent, clearCheckinTimers, isOpenStatus, participantsOf, sendAlert } from '../lib/safety';
import { closeJobForIncident } from '../lib/agent/jobs';

// ── Venues ──────────────────────────────────────────────────────────────────

/** Find-or-create: reuses a venue with the same name (case-insensitive) within ~0.002° of the point. */
export const createVenue = spacetimedb.reducer(
  { name: t.string(), approxLat: t.f64(), approxLng: t.f64() },
  (ctx, { name, approxLat, approxLng }) => {
    requireProfile(ctx);
    const clean = name.trim();
    if (clean.length < 2 || clean.length > 80) throw new SenderError('Venue name must be 2 to 80 characters');
    if (!(approxLat >= -90 && approxLat <= 90 && approxLng >= -180 && approxLng <= 180)) throw new SenderError('Invalid coordinates');
    const lat = round3(approxLat);
    const lng = round3(approxLng);
    // Venues carry no author column (public table), so the audit trail is the per-caller counter.
    let created = 0;
    for (const a of ctx.db.auditEvent.actor.filter(ctx.sender)) {
      if (a.action === 'create_venue' && ctx.timestamp.microsSinceUnixEpoch - a.at.microsSinceUnixEpoch <= HOUR_MICROS) created++;
    }
    enforceLimit(created, LIMITS.venuesPerHour, 'You created several venues this hour; try again later');
    for (const v of ctx.db.venue.iter()) {
      if (v.name.toLowerCase() === clean.toLowerCase() && Math.abs(v.approxLat - lat) <= 0.002 && Math.abs(v.approxLng - lng) <= 0.002) {
        return; // idempotent: the venue exists
      }
    }
    ctx.db.venue.insert({ id: 0n, name: clean, approxLat: lat, approxLng: lng, source: 'community', verifiedAt: undefined, createdAt: ctx.timestamp });
    audit(ctx, 'create_venue', `venue:${clean}`);
  }
);

function recentOpenReport(ctx: Ctx, venueId: bigint, category: string) {
  for (const r of ctx.db.venueReport.venueId.filter(venueId)) {
    if (r.category.tag !== category || r.moderation.tag === 'hidden') continue;
    if (ctx.timestamp.microsSinceUnixEpoch - r.createdAt.microsSinceUnixEpoch <= REPORT_MERGE_WINDOW_MICROS) return r;
  }
  return undefined;
}

function confidenceFor(reportCount: number, disputeCount: number): 'unverified' | 'corroborated' | 'disputed' {
  if (disputeCount > 0 && disputeCount >= reportCount) return 'disputed';
  return reportCount >= CORROBORATED_AT ? 'corroborated' : 'unverified';
}

export const submitVenueReport = spacetimedb.reducer(
  { venueId: t.u64(), category: VenueReportCategory, text: t.string() },
  (ctx, { venueId, category, text }) => {
    requireProfile(ctx);
    if (!ctx.db.venue.id.find(venueId)) throw new SenderError('Venue not found');
    const textRedacted = requireReportText(text);
    enforceLimit(
      countRecent(ctx.db.venueReportAuthor.author.filter(ctx.sender), a => a.createdAt, ctx.timestamp, HOUR_MICROS),
      LIMITS.venueReportsPerHour,
      'You filed several reports this hour; please wait before filing more'
    );
    const existing = recentOpenReport(ctx, venueId, category.tag);
    if (existing) {
      for (const a of ctx.db.venueReportAuthor.byReportAuthor.filter([existing.id, ctx.sender])) {
        void a;
        throw new SenderError('You already reported this');
      }
      const reportCount = existing.reportCount + 1;
      ctx.db.venueReport.id.update({
        ...existing,
        reportCount,
        confidence: existing.confidence.tag === 'verified' ? existing.confidence : { tag: confidenceFor(reportCount, existing.disputeCount) },
        updatedAt: ctx.timestamp,
      });
      ctx.db.venueReportAuthor.insert({ id: 0n, reportId: existing.id, author: ctx.sender, createdAt: ctx.timestamp });
      audit(ctx, 'submit_venue_report', `venue_report:${existing.id}:merged`);
      return;
    }
    const moderation = SENSITIVE_CATEGORIES.has(category.tag) ? 'pending' : 'published';
    const report = ctx.db.venueReport.insert({
      id: 0n,
      venueId,
      category,
      textRedacted,
      confidence: { tag: 'unverified' },
      moderation: { tag: moderation },
      reportCount: 1,
      disputeCount: 0,
      expiresAt: minutesAfter(ctx.timestamp, REPORT_TTL_MINUTES),
      createdAt: ctx.timestamp,
      updatedAt: ctx.timestamp,
    });
    ctx.db.venueReportAuthor.insert({ id: 0n, reportId: report.id, author: ctx.sender, createdAt: ctx.timestamp });
    audit(ctx, 'submit_venue_report', `venue_report:${report.id}:${moderation}`);
  }
);

export const voteVenueReport = spacetimedb.reducer({ reportId: t.u64(), kind: VoteKind }, (ctx, { reportId, kind }) => {
  requireProfile(ctx);
  const report = ctx.db.venueReport.id.find(reportId);
  if (!report || report.moderation.tag === 'hidden') throw new SenderError('Report not found');
  for (const a of ctx.db.venueReportAuthor.byReportAuthor.filter([reportId, ctx.sender])) {
    void a;
    throw new SenderError("You can't vote on your own report");
  }
  for (const v of ctx.db.venueReportVote.byReportVoter.filter([reportId, ctx.sender])) {
    void v;
    throw new SenderError('You already voted on this report');
  }
  ctx.db.venueReportVote.insert({ id: 0n, reportId, voter: ctx.sender, kind });
  const reportCount = kind.tag === 'corroborate' ? report.reportCount + 1 : report.reportCount;
  const disputeCount = kind.tag === 'dispute' ? report.disputeCount + 1 : report.disputeCount;
  ctx.db.venueReport.id.update({
    ...report,
    reportCount,
    disputeCount,
    confidence: report.confidence.tag === 'verified' && kind.tag === 'corroborate' ? report.confidence : { tag: confidenceFor(reportCount, disputeCount) },
    updatedAt: ctx.timestamp,
  });
});

export const moderateVenueReport = spacetimedb.reducer({ reportId: t.u64(), state: ModerationState }, (ctx, { reportId, state }) => {
  if (!isModerator(ctx)) deny(ctx, 'moderate_venue_report', `venue_report:${reportId}`, 'Only moderators can do that');
  const report = ctx.db.venueReport.id.find(reportId);
  if (!report) throw new SenderError('Report not found');
  ctx.db.venueReport.id.update({ ...report, moderation: state, updatedAt: ctx.timestamp });
  audit(ctx, 'moderate_venue_report', `venue_report:${reportId}:${state.tag}`);
});

export const setAppRole = spacetimedb.reducer({ identity: t.identity(), role: AppRole, enabled: t.bool() }, (ctx, { identity, role, enabled }) => {
  requireOwner(ctx);
  const existing = ctx.db.appRole.identity.find(identity);
  if (!enabled) {
    if (existing) ctx.db.appRole.identity.delete(identity);
  } else if (existing) {
    ctx.db.appRole.identity.update({ ...existing, role, grantedAt: ctx.timestamp });
  } else {
    ctx.db.appRole.insert({ identity, role, grantedAt: ctx.timestamp });
  }
  audit(ctx, 'set_app_role', `${identity.toHexString().slice(0, 8)}:${role.tag}:${enabled}`);
});

// Scheduler-only: hide expired reports (keep them for moderation history).
export const expireVenueReports = spacetimedb.reducer(
  { onSchedule: venueReportExpiry },
  { arg: venueReportExpiry.rowType },
  ctx => {
    for (const r of ctx.db.venueReport.iter()) {
      if (r.moderation.tag !== 'hidden' && isAtOrBefore(r.expiresAt, ctx.timestamp)) {
        ctx.db.venueReport.id.update({ ...r, moderation: { tag: 'hidden' }, updatedAt: ctx.timestamp });
      }
    }
  }
);

// ── Safety resources ────────────────────────────────────────────────────────

export const seedResources = spacetimedb.reducer(ctx => {
  requireOwner(ctx);
  const n = seedResourceRows(ctx);
  audit(ctx, 'seed_resources', `safety_resource:${n}`);
});

// ── Retention ───────────────────────────────────────────────────────────────

export const sweepRetention = spacetimedb.reducer(
  { onSchedule: retentionSweep },
  { arg: retentionSweep.rowType },
  ctx => {
    const r = runRetention(ctx);
    if (r.deleted || r.blanked) console.info(`retention sweep: deleted ${r.deleted}, blanked ${r.blanked}`);
  }
);

// ── Privacy settings ────────────────────────────────────────────────────────

export const setPrivacySettings = spacetimedb.reducer(
  {
    defaultSharingScope: SharingScope,
    defaultConsentTtlMinutes: t.u32(),
    allowBuddyAlerts: t.bool(),
    allowGroupAlerts: t.bool(),
    retainCheckinsDays: t.u16(),
  },
  (ctx, args) => {
    requireProfile(ctx);
    if (args.defaultConsentTtlMinutes < 1 || args.defaultConsentTtlMinutes > 1440) throw new SenderError('Default consent duration must be 1 to 1440 minutes');
    if (args.retainCheckinsDays < 1 || args.retainCheckinsDays > 30) throw new SenderError('Check-in retention must be 1 to 30 days');
    const row = { identity: ctx.sender, ...args, updatedAt: ctx.timestamp };
    if (ctx.db.userPrivacySettings.identity.find(ctx.sender)) ctx.db.userPrivacySettings.identity.update(row);
    else ctx.db.userPrivacySettings.insert(row);
  }
);

// ── Right to erasure ────────────────────────────────────────────────────────

/**
 * Self-only, idempotent. Removes the caller's personal rows and detaches them from every session
 * (same consequences as leaving). Other people's rows are never touched; venue reports stay but
 * lose the author link; incidents the caller is the subject of are cancelled if still open and
 * their event details blanked.
 */
export const deleteMyData = spacetimedb.reducer(ctx => {
  const me = ctx.sender;
  // Sessions: leave every active membership (end a driver role, revoke grants, clear timers).
  for (const m of ctx.db.sessionMember.userId.filter(me)) {
    if (!m.active) continue;
    const session = ctx.db.nightSession.id.find(m.sessionId);
    ctx.db.sessionMember.id.update({ ...m, active: false, leftAt: ctx.timestamp });
    clearCheckinTimers(ctx, m.sessionId, me);
    const a = openDriverAssignment(ctx, m.sessionId);
    if (a && a.driverId.isEqual(me)) ctx.db.driverAssignment.id.update({ ...a, endedAt: ctx.timestamp, endReason: { tag: 'left_session' } });
    if (session && session.organizer.isEqual(me) && sessionIsOpen(session)) {
      // An organizer who erases themselves ends their open sessions.
      ctx.db.nightSession.id.update({ ...session, status: { tag: 'ended' } });
      for (const other of ctx.db.sessionMember.sessionId.filter(m.sessionId)) {
        if (other.active) ctx.db.sessionMember.id.update({ ...other, active: false, leftAt: ctx.timestamp });
        clearCheckinTimers(ctx, m.sessionId, other.userId);
      }
      for (const g of ctx.db.consentGrant.sessionId.filter(m.sessionId)) {
        if (g.revokedAt === undefined) ctx.db.consentGrant.id.update({ ...g, revokedAt: ctx.timestamp });
      }
      for (const row of ctx.db.sessionExpiry.iter()) if (row.sessionId === m.sessionId) ctx.db.sessionExpiry.scheduledId.delete(row.scheduledId);
    }
  }
  // Consent: grants as subject are deleted; grants received are revoked (the other person's record stays).
  for (const g of ctx.db.consentGrant.subject.filter(me)) ctx.db.consentGrant.id.delete(g.id);
  for (const g of ctx.db.consentGrant.recipient.filter(me)) {
    if (g.revokedAt === undefined) ctx.db.consentGrant.id.update({ ...g, revokedAt: ctx.timestamp });
  }
  // Incidents about the caller: cancel if open, blank details.
  for (const inc of ctx.db.incident.subject.filter(me)) {
    if (isOpenStatus(inc.status.tag)) {
      ctx.db.incident.id.update({ ...inc, status: { tag: 'cancelled' }, resolvedAt: ctx.timestamp, resolvedBy: me });
      addEvent(ctx, inc.id, 'cancelled', '');
      closeJobForIncident(ctx, inc.id, 'cancelled', 'subject_deleted_data');
      for (const p of participantsOf(ctx, inc.id)) {
        if (!p.userId.isEqual(me)) sendAlert(ctx, p.userId, inc.id, 'incident_update', 'The person this request was about withdrew it and deleted their data.');
      }
    }
    for (const e of ctx.db.incidentEvent.incidentId.filter(inc.id)) if (e.detail !== '') ctx.db.incidentEvent.id.update({ ...e, detail: '' });
    for (const c of ctx.db.concernReport.subject.filter(me)) if (c.note !== '') ctx.db.concernReport.id.update({ ...c, note: '' });
  }
  // Personal rows.
  for (const row of ctx.db.locationUpdate.userId.filter(me)) ctx.db.locationUpdate.id.delete(row.id);
  for (const row of ctx.db.latestLocation.userId.filter(me)) ctx.db.latestLocation.id.delete(row.id);
  for (const row of ctx.db.checkin.userId.filter(me)) ctx.db.checkin.id.delete(row.id);
  for (const row of ctx.db.consumptionSelfReport.userId.filter(me)) ctx.db.consumptionSelfReport.id.delete(row.id);
  for (const row of ctx.db.notification.recipient.filter(me)) ctx.db.notification.id.delete(row.id);
  for (const row of ctx.db.trustedContact.owner.filter(me)) ctx.db.trustedContact.id.delete(row.id);
  for (const row of ctx.db.venueReportAuthor.author.filter(me)) ctx.db.venueReportAuthor.id.delete(row.id);
  for (const row of ctx.db.venueReportVote.voter.filter(me)) ctx.db.venueReportVote.id.delete(row.id);
  for (const row of ctx.db.checkinTimer.userId.filter(me)) ctx.db.checkinTimer.scheduledId.delete(row.scheduledId);
  if (ctx.db.appRole.identity.find(me)) ctx.db.appRole.identity.delete(me);
  if (ctx.db.userPrivacySettings.identity.find(me)) ctx.db.userPrivacySettings.identity.delete(me);
  if (ctx.db.userPhone.identity.find(me)) ctx.db.userPhone.identity.delete(me);
  const persona = ctx.db.demoPersona.identity.find(me);
  if (persona) ctx.db.demoPersona.personaId.delete(persona.personaId);
  if (ctx.db.userProfile.identity.find(me)) ctx.db.userProfile.identity.delete(me);
  audit(ctx, 'delete_my_data', 'self');
});

// ── Admin / demo ────────────────────────────────────────────────────────────

/**
 * Judge-demo reset: clears every row except config, module_meta, app_role, safety_resource and venue,
 * and every one-shot schedule row (interval maintenance rows stay). Open to everyone outside production.
 */
export const resetDemo = spacetimedb.reducer(ctx => {
  requireDemoAllowed(ctx);
  const d = ctx.db;
  const clear = (tbl: { iter(): Iterable<{ id: bigint }>; id: { delete(id: bigint): unknown } }) => {
    for (const r of tbl.iter()) tbl.id.delete(r.id);
  };
  const clearSched = (tbl: { iter(): Iterable<{ scheduledId: bigint }>; scheduledId: { delete(id: bigint): unknown } }) => {
    for (const r of tbl.iter()) tbl.scheduledId.delete(r.scheduledId);
  };
  clear(d.agentAction); clear(d.agentPlan); clear(d.ridePlan); clear(d.notification); clear(d.agentJob);
  clearSched(d.agentWake); clearSched(d.followupTimer); clearSched(d.notificationDispatch);
  clear(d.incidentEvent); clear(d.incidentParticipant); clear(d.incident); clear(d.concernReport);
  clear(d.consumptionSelfReport); clear(d.checkin); clear(d.locationUpdate); clear(d.latestLocation);
  clearSched(d.checkinTimer); clearSched(d.sessionExpiry);
  clear(d.consentGrant); clear(d.driverAssignment); clear(d.sessionMember); clear(d.invite); clear(d.nightSession);
  clear(d.trustedContact);
  for (const r of d.demoSession.iter()) d.demoSession.sessionId.delete(r.sessionId); // personas stay registered
  clear(d.venueReportVote); clear(d.venueReportAuthor); clear(d.venueReport);
  for (const r of d.userPrivacySettings.iter()) d.userPrivacySettings.identity.delete(r.identity);
  for (const r of d.userPhone.iter()) d.userPhone.identity.delete(r.identity);
  for (const r of d.userProfile.iter()) d.userProfile.identity.delete(r.identity);
  ensureCommunitySchedules(ctx);
  audit(ctx, 'reset_demo', 'all');
});
