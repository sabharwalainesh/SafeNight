// Pure row -> SafetyApi contract converters. Rows are structurally typed so
// tests can pass hand-made fakes.
import type { Identity, Timestamp } from 'spacetimedb';
import { idStr, identityStr, optTsMs, tagToSnake, tsMs } from '../../night-out/live/convert';
import type {
  AlertKind,
  Checkin,
  CheckinKind,
  Incident,
  IncidentEvent,
  IncidentKind,
  IncidentParticipant,
  IncidentStatus,
  ParticipantRole,
  SafetyAlert,
  Severity,
  VisibleLocation,
} from '../api';

type Tag = { tag: string };
export const STALE_MS = 5 * 60 * 1000;

export type LocationRowLike = {
  sessionId: bigint;
  userId: Identity;
  displayName: string;
  lat: number;
  lng: number;
  accuracyM: number;
  recordedAt: Timestamp;
  source: Tag;
  approximate?: boolean;
};
export type CheckinRowLike = { id: bigint; sessionId: bigint; userId: Identity; kind: Tag; note: string; createdAt: Timestamp };
export type IncidentRowLike = {
  id: bigint;
  sessionId: bigint;
  subject: Identity;
  subjectName: string;
  kind: Tag;
  severity: Tag;
  status: Tag;
  openedBy: Identity;
  openedAt: Timestamp;
  resolvedAt?: Timestamp | null;
  resolvedBy?: Identity | null;
  meetupWanted?: boolean; // meetup feature (F1); absent on older bindings
};
export type ParticipantRowLike = {
  incidentId: bigint;
  userId: Identity;
  displayName: string;
  role: Tag;
  acknowledgedAt?: Timestamp | null;
};
export type EventRowLike = {
  id: bigint;
  incidentId: bigint;
  at: Timestamp;
  actor: Identity;
  actorName?: string;
  kind: string;
  detail: string;
  simulated?: boolean;
};
export type AlertRowLike = { recipient: Identity; incidentId: bigint; kind: Tag; message: string; at: Timestamp };

export const toLocation = (r: LocationRowLike, now: number): VisibleLocation => {
  const recordedAt = tsMs(r.recordedAt);
  return {
    userId: identityStr(r.userId),
    displayName: r.displayName,
    lat: r.lat,
    lng: r.lng,
    accuracyM: r.accuracyM,
    recordedAt,
    source: tagToSnake(r.source.tag) as VisibleLocation['source'],
    approximate: r.approximate ?? false,
    isStale: now - recordedAt > STALE_MS,
  };
};

export const toCheckin = (r: CheckinRowLike): Checkin => ({
  id: idStr(r.id),
  sessionId: idStr(r.sessionId),
  userId: identityStr(r.userId),
  kind: tagToSnake(r.kind.tag) as CheckinKind,
  note: r.note,
  createdAt: tsMs(r.createdAt),
});

export const toParticipant = (r: ParticipantRowLike): IncidentParticipant => ({
  userId: identityStr(r.userId),
  displayName: r.displayName,
  role: tagToSnake(r.role.tag) as ParticipantRole,
  acknowledgedAt: optTsMs(r.acknowledgedAt),
});

export function toIncident(r: IncidentRowLike, participantRows: ParticipantRowLike[]): Incident {
  const participants = participantRows.filter((p) => p.incidentId === r.id).map(toParticipant);
  const subject = identityStr(r.subject);
  const subjectP = participants.find((p) => p.role === 'subject' && p.userId === subject);
  return {
    id: idStr(r.id),
    sessionId: idStr(r.sessionId),
    subject,
    subjectName: subjectP?.displayName || r.subjectName,
    kind: tagToSnake(r.kind.tag) as IncidentKind,
    severity: tagToSnake(r.severity.tag) as Severity,
    status: tagToSnake(r.status.tag) as IncidentStatus,
    openedBy: identityStr(r.openedBy),
    openedAt: tsMs(r.openedAt),
    resolvedAt: optTsMs(r.resolvedAt),
    resolvedBy: r.resolvedBy ? identityStr(r.resolvedBy) : null,
    participants,
    meetupWanted: r.meetupWanted ?? false, // meetup feature
  };
}

export function toEvent(r: EventRowLike, participantRows: ParticipantRowLike[]): IncidentEvent {
  const actor = identityStr(r.actor);
  const name =
    r.actorName || participantRows.find((p) => identityStr(p.userId) === actor)?.displayName || 'SafeNight';
  return {
    id: idStr(r.id),
    incidentId: idStr(r.incidentId),
    at: tsMs(r.at),
    actor,
    actorName: name,
    kind: r.kind,
    detail: r.detail,
    simulated: r.simulated ?? false,
  };
}

/** `incidentId` 0n (private driver self-warning) maps to ''. */
export const toAlert = (r: AlertRowLike, clientId: string): SafetyAlert => ({
  id: clientId,
  recipient: identityStr(r.recipient),
  incidentId: r.incidentId === 0n ? '' : idStr(r.incidentId),
  kind: tagToSnake(r.kind.tag) as AlertKind,
  message: r.message,
  at: tsMs(r.at),
});
