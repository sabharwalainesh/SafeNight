import type { Identity } from 'spacetimedb';
import type { Ctx } from '../auth';
import { hasActiveGrant } from '../safety';

export const MAX_NOTE_CHARS = 280;

export type ContextParticipant = {
  userId: string;
  displayName: string;
  role: string;
  acknowledged: boolean;
  /** Messaging allowed under the policy in `recipientAllowed`. */
  canMessage: boolean;
  contactRole?: string;
  contactPriority?: number;
  alreadyContacted: boolean;
};

export type AgentContext = {
  jobId: string;
  incidentId: string;
  event: string;
  escalationTier: number;
  wakeCount: number;
  incident: { kind: string; severity: string; status: string; openedMinutesAgo: number };
  subject: { userId: string; displayName: string };
  organizerId: string;
  participants: ContextParticipant[];
  recentCheckins: { kind: string; minutesAgo: number }[];
  locationAgeMinutes?: number;
  previousPlanSummary?: string;
  ridePlan?: { id: string; status: string; chosenOption: string };
  openFollowups: number;
  untrustedNotes: string[];
  /** Deterministic hints for the current event; the prompt describes the same expectations. */
  nextStepHints: string[];
};

/** What a good plan does for each wake event. Shared by the prompt and the context so the model sees one story. */
export function nextStepHintsFor(event: string): string[] {
  switch (event) {
    case 'incident_opened':
      return [
        'send_approved_message(buddy_alert) to the highest-priority participant with canMessage=true and alreadyContacted=false',
        'request_human_confirmation from that same person',
        'schedule_followup(2)',
        'update_incident_state(assistance_underway)',
        'if nobody has canMessage=true: hand_off',
      ];
    case 'buddy_nonresponse':
    case 'buddy_declined':
      return [
        'send_approved_message(backup_alert) to the next participant with canMessage=true and alreadyContacted=false',
        'request_human_confirmation from that person and schedule_followup(2)',
        'if nobody is left: hand_off',
      ];
    case 'buddy_acknowledged':
      return [
        'get_transport_options first',
        'after the tool result arrives: propose_ride_plan for the subject with options "from_transport_lookup"',
        'update_incident_state(transport_pending)',
        'send_approved_message(ride_options_ready) to the participant who acknowledged',
      ];
    case 'ride_booked':
      return ['send_approved_message(ride_booked) to the acknowledged helper', 'schedule_followup(5)'];
    case 'pickup_confirmed':
    case 'transport_options_ready':
      return ['no action unless something is missing; the person confirms home themselves'];
    default:
      return ['no automated action is expected for this event'];
  }
}

type Job = NonNullable<ReturnType<Ctx['db']['agentJob']['id']['find']>>;
type Incident = NonNullable<ReturnType<Ctx['db']['incident']['id']['find']>>;

const minutesBetween = (later: bigint, earlier: bigint) => Number((later - earlier) / 60_000_000n);

/**
 * Messaging policy. A recipient may be messaged / asked to confirm when they are a participant
 * of the incident AND (hold the subject's active `messaging` consent for the session, OR are
 * listed as the subject's trusted contact with messagingConsent, OR are the subject themselves),
 * EXCEPT that the subject of a `possible_impaired_driving` incident is never messaged (no
 * distracting a possibly driving person; the deterministic warning already reached them).
 */
export function recipientAllowed(ctx: Ctx, incident: Incident, recipient: Identity): boolean {
  let participant = false;
  for (const _p of ctx.db.incidentParticipant.byIncidentUser.filter([incident.id, recipient])) participant = true;
  if (!participant) return false;
  if (recipient.isEqual(incident.subject)) return incident.kind.tag !== 'possible_impaired_driving';
  if (hasActiveGrant(ctx, incident.subject, recipient, incident.sessionId, 'messaging')) return true;
  for (const c of ctx.db.trustedContact.owner.filter(incident.subject)) {
    if (c.contact.isEqual(recipient) && c.messagingConsent) return true;
  }
  return false;
}

export function buildContext(ctx: Ctx, job: Job, incident: Incident, event: string): AgentContext {
  const now = ctx.timestamp.microsSinceUnixEpoch;
  const session = ctx.db.nightSession.id.find(incident.sessionId);
  const nameOf = (who: Identity) => ctx.db.userProfile.identity.find(who)?.displayName ?? 'Unknown';

  const contacted = new Set<string>();
  for (const n of ctx.db.notification.jobId.filter(job.id)) contacted.add(n.recipient.toHexString());

  const contacts = new Map<string, { role: string; priority: number }>();
  for (const c of ctx.db.trustedContact.owner.filter(incident.subject)) {
    contacts.set(c.contact.toHexString(), { role: c.role.tag, priority: c.priority });
  }

  const participants: ContextParticipant[] = [];
  for (const p of ctx.db.incidentParticipant.incidentId.filter(incident.id)) {
    const hex = p.userId.toHexString();
    const contact = contacts.get(hex);
    participants.push({
      userId: hex,
      displayName: nameOf(p.userId),
      role: p.role.tag,
      acknowledged: p.acknowledgedAt !== undefined,
      canMessage: recipientAllowed(ctx, incident, p.userId),
      contactRole: contact?.role,
      contactPriority: contact?.priority,
      alreadyContacted: contacted.has(hex),
    });
  }

  const recentCheckins: { kind: string; minutesAgo: number }[] = [];
  for (const c of ctx.db.checkin.bySessionUser.filter([incident.sessionId, incident.subject])) {
    const ago = minutesBetween(now, c.createdAt.microsSinceUnixEpoch);
    if (ago <= 60) recentCheckins.push({ kind: c.kind.tag, minutesAgo: ago });
  }
  recentCheckins.sort((a, b) => a.minutesAgo - b.minutesAgo);

  let locationAgeMinutes: number | undefined;
  for (const loc of ctx.db.latestLocation.bySessionUser.filter([incident.sessionId, incident.subject])) {
    locationAgeMinutes = minutesBetween(now, loc.recordedAt.microsSinceUnixEpoch);
  }

  let previousPlanSummary: string | undefined;
  let bestVersion = -1;
  for (const plan of ctx.db.agentPlan.jobId.filter(job.id)) {
    if (plan.version > bestVersion) {
      bestVersion = plan.version;
      previousPlanSummary = plan.summary;
    }
  }

  let ridePlan: AgentContext['ridePlan'];
  for (const r of ctx.db.ridePlan.jobId.filter(job.id)) {
    ridePlan = { id: String(r.id), status: r.status.tag, chosenOption: r.chosenOption };
  }

  let openFollowups = 0;
  for (const _t of ctx.db.followupTimer.jobId.filter(job.id)) openFollowups++;

  const untrustedNotes: string[] = [];
  for (const e of ctx.db.incidentEvent.incidentId.filter(incident.id)) {
    if (e.kind === 'opened' || e.kind === 'concern_added' || e.kind === 'elevated') {
      untrustedNotes.push(e.detail.slice(0, MAX_NOTE_CHARS));
    }
  }

  return {
    jobId: String(job.id),
    incidentId: String(incident.id),
    event,
    escalationTier: job.escalationTier,
    wakeCount: job.wakeCount,
    incident: {
      kind: incident.kind.tag,
      severity: incident.severity.tag,
      status: incident.status.tag,
      openedMinutesAgo: minutesBetween(now, incident.openedAt.microsSinceUnixEpoch),
    },
    subject: { userId: incident.subject.toHexString(), displayName: nameOf(incident.subject) },
    organizerId: session?.organizer.toHexString() ?? '',
    participants,
    recentCheckins,
    locationAgeMinutes,
    previousPlanSummary,
    ridePlan,
    openFollowups,
    untrustedNotes: untrustedNotes.slice(0, 5),
    nextStepHints: nextStepHintsFor(event),
  };
}

/**
 * Contacts the planner may message, in escalation order: the subject's trusted contacts by
 * priority (buddy, then backup_buddy, then emergency), then other participants who hold the
 * subject's messaging consent (buddy role before organizer). The subject is never included.
 */
export function eligibleContacts(context: AgentContext): ContextParticipant[] {
  const roleRank = (r?: string) => (r === 'buddy' ? 0 : r === 'backup_buddy' ? 1 : r === 'emergency' ? 2 : 3);
  const partRank = (r: string) => (r === 'buddy' ? 0 : r === 'reporter' ? 1 : r === 'organizer' ? 2 : 3);
  return context.participants
    .filter(p => p.canMessage && p.userId !== context.subject.userId)
    .sort((a, b) => {
      const ar = roleRank(a.contactRole);
      const br = roleRank(b.contactRole);
      if (ar !== br) return ar - br;
      const ap = a.contactPriority ?? 99;
      const bp = b.contactPriority ?? 99;
      if (ap !== bp) return ap - bp;
      return partRank(a.role) - partRank(b.role);
    });
}
