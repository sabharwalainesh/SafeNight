// Client-side contract for the Night Out tab (C1). Shapes mirror the PLANNED
// C1 section of docs/ARCHITECTURE.md, simplified for the UI:
//   - people are `UserId` strings (persona id in the mock, identity hex once
//     C1-A bindings land),
//   - ids are strings (bindings use u64 bigint),
//   - times are epoch milliseconds (bindings use microsecond Timestamps).
// Screens depend only on this file. A mock implementation backs it until the
// C1-A bindings exist; then a bindings adapter replaces the mock and screens
// do not change.

import { createContext, useContext } from 'react';

export type UserId = string;
export type EpochMs = number;

export type SessionStatus = 'planned' | 'active' | 'ended' | 'expired';
export type MemberRole = 'organizer' | 'participant';
export type SharingScope = 'none' | 'approximate' | 'precise';
export type DriverEndReason = 'none' | 'cannot_drive' | 'replaced' | 'session_ended';
export type ConsentScope =
  | 'location_precise'
  | 'location_approximate'
  | 'checkins'
  | 'concern_reports'
  | 'messaging';

export type NightSession = {
  id: string;
  organizer: UserId;
  name: string;
  venueHint: string;
  startsAt: EpochMs;
  expiresAt: EpochMs;
  status: SessionStatus;
  checkinIntervalMinutes: number;
  createdAt: EpochMs;
};

export type Invite = {
  id: string;
  sessionId: string;
  code: string;
  createdBy: UserId;
  expiresAt: EpochMs;
  revokedAt: EpochMs | null;
  maxUses: number;
  uses: number;
};

export type SessionMember = {
  id: string;
  sessionId: string;
  userId: UserId;
  displayName: string;
  role: MemberRole;
  joinedAt: EpochMs;
  leftAt: EpochMs | null;
  sharingScope: SharingScope;
};

export type DriverAssignment = {
  id: string;
  sessionId: string;
  driverId: UserId;
  volunteeredAt: EpochMs;
  acceptedAt: EpochMs | null;
  endedAt: EpochMs | null;
  endReason: DriverEndReason;
};

export type ConsentGrant = {
  id: string;
  subject: UserId;
  recipient: UserId;
  sessionId: string;
  scope: ConsentScope;
  startsAt: EpochMs;
  expiresAt: EpochMs;
  revokedAt: EpochMs | null;
};

/** Everything the session screen needs about one session, for a member caller. */
export type SessionRoster = {
  session: NightSession;
  members: SessionMember[]; // active and departed; departed have leftAt set
  drivers: DriverAssignment[];
  invites: Invite[]; // only populated for the organizer
};

export type CreateSessionArgs = {
  name: string;
  venueHint: string;
  startsAt: EpochMs;
  expiresAt: EpochMs;
  checkinIntervalMinutes: number;
};

/**
 * Actions map 1:1 to C1 reducers. Each rejects with an Error whose message is
 * human-readable (SenderError text from the module) on authorization or
 * validation failure.
 */
export type NightOutActions = {
  createSession(args: CreateSessionArgs): Promise<string>; // resolves to session id
  createInvite(sessionId: string, ttlMinutes: number, maxUses: number): Promise<Invite>;
  revokeInvite(inviteId: string): Promise<void>;
  joinSession(code: string): Promise<string>; // resolves to session id
  leaveSession(sessionId: string): Promise<void>;
  endSession(sessionId: string): Promise<void>;
  volunteerDriver(sessionId: string): Promise<void>;
  acceptDriverRole(assignmentId: string): Promise<void>;
  endDriverRole(assignmentId: string, reason: DriverEndReason): Promise<void>;
  grantConsent(recipient: UserId, sessionId: string, scope: ConsentScope, ttlMinutes: number): Promise<void>;
  revokeConsent(grantId: string): Promise<void>;
  setSharingScope(sessionId: string, scope: SharingScope): Promise<void>;
};

export type NightOutApi = {
  /** The caller. */
  me: UserId;
  /** False until the first snapshot arrives (maps to `useTable` readiness). */
  ready: boolean;
  /** True while the data comes from the local mock, not the module. Screens show a MOCK badge. */
  mocked: boolean;
  /** Sessions where the caller is an active member (`my_sessions`). */
  mySessions: NightSession[];
  /** Roster for a session the caller belongs to (`session_roster`), else null. */
  roster(sessionId: string): SessionRoster | null;
  /** Grants where the caller is subject or recipient (`my_consents`). */
  myConsents: ConsentGrant[];
  actions: NightOutActions;
};

export const NightOutContext = createContext<NightOutApi | null>(null);

export function useNightOut(): NightOutApi {
  const api = useContext(NightOutContext);
  if (!api) throw new Error('useNightOut must be used inside a NightOutContext provider');
  return api;
}
