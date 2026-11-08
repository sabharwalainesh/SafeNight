// Client-side contract for C2: locations, check-ins, concern reports,
// incidents, and safety alerts. Shapes mirror the PLANNED C2 section of
// docs/ARCHITECTURE.md with the same simplifications as
// features/night-out/api.ts (string ids, `UserId` people, epoch-ms times).
// A mock backs it until C2-A bindings land; then a bindings adapter replaces
// the mock and screens do not change.
//
// Scope: everything here is about the caller's *current session*, which is
// the first entry of `useNightOut().mySessions` (null when not in one).

import { createContext, useContext } from 'react';
import type { EpochMs, UserId } from '../night-out/api';

export type LocationSource = 'device' | 'simulated';
export type CheckinKind = 'okay' | 'need_friend' | 'need_ride' | 'unwell' | 'emergency' | 'home';
export type ConsumptionLevel = 'none' | 'some' | 'impaired_feeling';
export type ConcernCategory = 'possible_consumption' | 'separated' | 'unwell' | 'unsafe';
export type IncidentKind = 'possible_impaired_driving' | 'help_requested' | 'missed_checkin' | 'feeling_unsafe';
export type Severity = 'info' | 'elevated' | 'urgent';
export type IncidentStatus =
  | 'open'
  | 'acknowledged'
  | 'assistance_underway'
  | 'transport_arranged'
  | 'awaiting_home_confirmation'
  | 'resolved'
  | 'cancelled'
  | 'handed_off';
export type ParticipantRole = 'subject' | 'reporter' | 'buddy' | 'backup' | 'organizer';
export type AlertKind = 'no_driving_warning' | 'help_requested' | 'ack_requested' | 'incident_update';

/** One row of `visible_locations`: latest location of a member who shares with the caller. */
export type VisibleLocation = {
  userId: UserId;
  displayName: string;
  lat: number;
  lng: number;
  accuracyM: number;
  recordedAt: EpochMs;
  source: LocationSource;
  /** True when the grant is approximate; coordinates are rounded to 3 decimals. */
  approximate: boolean;
  /** recordedAt older than 5 minutes. */
  isStale: boolean;
};

export type Checkin = {
  id: string;
  sessionId: string;
  userId: UserId;
  kind: CheckinKind;
  note: string;
  createdAt: EpochMs;
};

export type IncidentParticipant = {
  userId: UserId;
  displayName: string;
  role: ParticipantRole;
  acknowledgedAt: EpochMs | null;
};

export type Incident = {
  id: string;
  sessionId: string;
  subject: UserId;
  subjectName: string;
  kind: IncidentKind;
  severity: Severity;
  status: IncidentStatus;
  openedBy: UserId;
  openedAt: EpochMs;
  resolvedAt: EpochMs | null;
  resolvedBy: UserId | null;
  participants: IncidentParticipant[];
  /** Set by `request_company`: the subject wants a friend to physically come to them (meetup feature). */
  meetupWanted?: boolean;
};

export type IncidentEvent = {
  id: string;
  incidentId: string;
  at: EpochMs;
  actor: UserId;
  actorName: string;
  /** Machine kind, e.g. `opened`, `subject_says_fine`, `acknowledged`, `resolved`. */
  kind: string;
  detail: string;
  simulated: boolean;
};

/** `safety_alert` event-table row addressed to the caller. */
export type SafetyAlert = {
  id: string; // client-side id; event rows have no primary key
  recipient: UserId;
  incidentId: string;
  kind: AlertKind;
  message: string;
  at: EpochMs;
};

/** Actions map 1:1 to C2 reducers and reject with a human-readable Error. */
export type SafetyActions = {
  postLocation(lat: number, lng: number, accuracyM: number, source: LocationSource): Promise<void>;
  checkIn(kind: CheckinKind, note: string): Promise<void>;
  reportConsumption(level: ConsumptionLevel, shareWithBuddy: boolean): Promise<void>;
  reportConcern(subject: UserId, category: ConcernCategory, note: string): Promise<void>;
  acknowledgeIncident(incidentId: string): Promise<void>;
  resolveIncident(incidentId: string, note: string): Promise<void>;
  cancelIncident(incidentId: string, reason: string): Promise<void>;
};

export type SafetyApi = {
  me: UserId;
  ready: boolean;
  /** True while backed by the local mock. Screens show a MOCK badge. */
  mocked: boolean;
  /** Caller's current session id, or null. All actions reject when null. */
  sessionId: string | null;
  /** `visible_locations(sessionId)`; empty when not in a session. */
  locations: VisibleLocation[];
  /** Caller's own last posted location in the current session (not consent-filtered). */
  myLocation: VisibleLocation | null;
  /** `my_checkins(sessionId)`, newest first. */
  myCheckins: Checkin[];
  /** `my_incidents`, newest first. */
  incidents: Incident[];
  /** `incident_timeline(incidentId)`, oldest first; [] when caller is not a participant. */
  timeline(incidentId: string): IncidentEvent[];
  /** Alerts received in this tab since load, newest first (event rows are not stored server-side). */
  alerts: SafetyAlert[];
  /** Mark an alert as seen locally (no server call). */
  dismissAlert(alertId: string): void;
  actions: SafetyActions;
};

export const SafetyContext = createContext<SafetyApi | null>(null);

export function useSafety(): SafetyApi {
  const api = useContext(SafetyContext);
  if (!api) throw new Error('useSafety must be used inside a SafetyContext provider');
  return api;
}

export const CHECKIN_LABELS: Record<CheckinKind, string> = {
  okay: "I'm okay",
  need_friend: 'Need a friend',
  need_ride: 'Need a ride',
  unwell: 'Feeling unwell',
  emergency: 'Emergency',
  home: "I'm home",
};

export const INCIDENT_STATUS_LABELS: Record<IncidentStatus, string> = {
  open: 'Open',
  acknowledged: 'Acknowledged',
  assistance_underway: 'Help on the way',
  transport_arranged: 'Transport arranged',
  awaiting_home_confirmation: 'Awaiting home confirmation',
  resolved: 'Resolved',
  cancelled: 'Cancelled',
  handed_off: 'Handed off',
};
