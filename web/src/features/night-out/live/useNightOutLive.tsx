import { createElement, useEffect, useMemo, useReducer as useReducerReact, useRef, type ReactNode } from 'react';
import { Identity, SenderError, Timestamp } from 'spacetimedb';
import { useReducer, useSpacetimeDB, useTable } from 'spacetimedb/react';
import { reducers, tables } from '../../../module_bindings';
import {
  NightOutContext,
  type ConsentGrant,
  type ConsentScope,
  type DriverAssignment,
  type DriverEndReason,
  type Invite,
  type NightOutActions,
  type NightOutApi,
  type NightSession,
  type SessionMember,
  type SessionRoster,
  type SharingScope,
} from '../api';
import { idStr, identityStr, optTsMs, snakeEnum, tagToSnake, tsMs } from './convert';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = any;

const toSession = (r: Row): NightSession => ({
  id: idStr(r.id),
  organizer: identityStr(r.organizer),
  name: r.name,
  venueHint: r.venueHint,
  startsAt: tsMs(r.startsAt),
  expiresAt: tsMs(r.expiresAt),
  status: tagToSnake(r.status.tag) as NightSession['status'],
  checkinIntervalMinutes: r.checkinIntervalMinutes,
  createdAt: tsMs(r.createdAt),
});

const toInvite = (r: Row): Invite => ({
  id: idStr(r.id),
  sessionId: idStr(r.sessionId),
  code: r.code,
  createdBy: identityStr(r.createdBy),
  expiresAt: tsMs(r.expiresAt),
  revokedAt: optTsMs(r.revokedAt),
  maxUses: r.maxUses,
  uses: r.uses,
});

const toDriver = (r: Row): DriverAssignment => {
  const reason = tagToSnake(r.endReason.tag);
  return {
    id: idStr(r.id),
    sessionId: idStr(r.sessionId),
    driverId: identityStr(r.driverId),
    volunteeredAt: tsMs(r.volunteeredAt),
    acceptedAt: optTsMs(r.acceptedAt),
    endedAt: optTsMs(r.endedAt),
    // Module also has LeftSession, which the UI contract lacks; treat as 'none'.
    endReason: (reason === 'left_session' ? 'none' : reason) as DriverEndReason,
  };
};

const toMember = (r: Row): SessionMember => ({
  id: idStr(r.memberId),
  sessionId: idStr(r.sessionId),
  userId: identityStr(r.userId),
  displayName: r.displayName,
  role: tagToSnake(r.role.tag) as SessionMember['role'],
  joinedAt: tsMs(r.joinedAt),
  leftAt: r.active ? null : tsMs(r.joinedAt), // best-effort: row has no leftAt
  sharingScope: tagToSnake(r.sharingScope.tag) as SharingScope,
});

const toConsent = (r: Row): ConsentGrant => ({
  id: idStr(r.id),
  subject: identityStr(r.subject),
  recipient: identityStr(r.recipient),
  sessionId: idStr(r.sessionId),
  scope: tagToSnake(r.scope.tag) as ConsentScope,
  startsAt: tsMs(r.startsAt),
  expiresAt: tsMs(r.expiresAt),
  revokedAt: optTsMs(r.revokedAt),
});

function toError(e: unknown): Error {
  if (e instanceof SenderError) return new Error(e.message);
  if (e instanceof Error) return e;
  return new Error(String(e));
}

async function wrap<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (e) {
    throw toError(e);
  }
}

async function waitFor<T>(get: () => T | undefined, errMsg: string): Promise<T> {
  const deadline = Date.now() + 3000;
  for (;;) {
    const v = get();
    if (v !== undefined) return v;
    if (Date.now() >= deadline) throw new Error(errMsg);
    await new Promise((r) => setTimeout(r, 100));
  }
}

export function NightOutLiveProvider(props: { displayName: string; avatarEmoji: string; children?: ReactNode }) {
  const { displayName, avatarEmoji } = props;
  const { identity } = useSpacetimeDB();
  const me = identity?.toHexString() ?? '';

  const [sessionRows, sessionsReady] = useTable(tables.mySessions);
  const [consentRows, consentsReady] = useTable(tables.myConsents);
  const [rosterRows, rostersReady] = useTable(tables.myRosters);
  const [inviteRows, invitesReady] = useTable(tables.myInvites);
  const [driverRows, driversReady] = useTable(tables.driverAssignment);
  const [profileRows, profilesReady] = useTable(tables.userProfile);
  const [nightRows, nightReady] = useTable(tables.nightSession);

  const [, tick] = useReducerReact((n: number) => n + 1, 0);
  useEffect(() => {
    const t = window.setInterval(tick, 15000);
    return () => window.clearInterval(t);
  }, []);

  const latest = useRef({ sessions: sessionRows as Row[], invites: inviteRows as Row[], profiles: profileRows as Row[] });
  latest.current = { sessions: sessionRows as Row[], invites: inviteRows as Row[], profiles: profileRows as Row[] };

  const rCreateSession = useReducer(reducers.createSession);
  const rCreateInvite = useReducer(reducers.createInvite);
  const rRevokeInvite = useReducer(reducers.revokeInvite);
  const rJoinSession = useReducer(reducers.joinSession);
  const rLeaveSession = useReducer(reducers.leaveSession);
  const rEndSession = useReducer(reducers.endSession);
  const rVolunteer = useReducer(reducers.volunteerDriver);
  const rAccept = useReducer(reducers.acceptDriverRole);
  const rEndDriver = useReducer(reducers.endDriverRole);
  const rGrant = useReducer(reducers.grantConsent);
  const rRevokeConsent = useReducer(reducers.revokeConsent);
  const rSharing = useReducer(reducers.setSharingScope);
  const rSetProfile = useReducer(reducers.setProfile);

  const actions = useMemo<NightOutActions>(() => {
    const ensureProfile = async () => {
      const has = latest.current.profiles.some((p) => identityStr(p.identity) === me);
      if (!has) await wrap(rSetProfile({ displayName, avatarEmoji }));
    };
    const sessionIds = () => new Set(latest.current.sessions.map((s) => idStr(s.id)));
    const newSession = async (before: Set<string>): Promise<string> =>
      waitFor(() => {
        const fresh = latest.current.sessions.filter((s) => !before.has(idStr(s.id)));
        if (!fresh.length) return undefined;
        const mine = fresh.filter((s) => identityStr(s.organizer) === me);
        const pool = mine.length ? mine : fresh;
        pool.sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt));
        return idStr(pool[0].id);
      }, 'Session created but not visible yet');
    const id = (s: string) => BigInt(s);
    return {
      createSession: async (a) => {
        await ensureProfile();
        const before = sessionIds();
        await wrap(
          rCreateSession({
            name: a.name,
            venueHint: a.venueHint,
            startsAt: Timestamp.fromDate(new Date(a.startsAt)),
            expiresAt: Timestamp.fromDate(new Date(a.expiresAt)),
            checkinIntervalMinutes: a.checkinIntervalMinutes,
          }),
        );
        return newSession(before);
      },
      createInvite: async (sessionId, ttlMinutes, maxUses) => {
        const before = new Set(latest.current.invites.map((i) => idStr(i.id)));
        await wrap(rCreateInvite({ sessionId: id(sessionId), ttlMinutes, maxUses }));
        const row = await waitFor(
          () => latest.current.invites.find((i) => idStr(i.sessionId) === sessionId && !before.has(idStr(i.id))),
          'Invite created but not visible yet',
        );
        return toInvite(row);
      },
      revokeInvite: (inviteId) => wrap(rRevokeInvite({ inviteId: id(inviteId) })),
      joinSession: async (code) => {
        await ensureProfile();
        const before = sessionIds();
        await wrap(rJoinSession({ code }));
        return newSession(before);
      },
      leaveSession: (sessionId) => wrap(rLeaveSession({ sessionId: id(sessionId) })),
      endSession: (sessionId) => wrap(rEndSession({ sessionId: id(sessionId) })),
      volunteerDriver: (sessionId) => wrap(rVolunteer({ sessionId: id(sessionId) })),
      acceptDriverRole: (assignmentId) => wrap(rAccept({ assignmentId: id(assignmentId) })),
      endDriverRole: (assignmentId, reason) =>
        wrap(rEndDriver({ assignmentId: id(assignmentId), reason: snakeEnum(reason) as any })),
      grantConsent: (recipient, sessionId, scope, ttlMinutes) =>
        wrap(
          rGrant({
            recipient: Identity.fromString(recipient),
            sessionId: id(sessionId),
            scope: snakeEnum(scope) as any,
            ttlMinutes,
          }),
        ),
      revokeConsent: (grantId) => wrap(rRevokeConsent({ grantId: id(grantId) })),
      setSharingScope: (sessionId, scope) =>
        wrap(rSharing({ sessionId: id(sessionId), scope: snakeEnum(scope) as any })),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, displayName, avatarEmoji]);

  const ready =
    !!identity &&
    sessionsReady &&
    consentsReady &&
    rostersReady &&
    invitesReady &&
    driversReady &&
    profilesReady &&
    nightReady;

  const api: NightOutApi = {
    me,
    ready,
    mocked: false,
    mySessions: (sessionRows as Row[]).map(toSession),
    myConsents: (consentRows as Row[])
      .filter((c) => !c.revokedAt && tsMs(c.expiresAt) > Date.now())
      .map(toConsent),
    roster(sessionId) {
      const members = (rosterRows as Row[]).filter((r) => idStr(r.sessionId) === sessionId);
      if (!members.some((r) => r.active && identityStr(r.userId) === me)) return null;
      const row =
        (sessionRows as Row[]).find((s) => idStr(s.id) === sessionId) ??
        (nightRows as Row[]).find((s) => idStr(s.id) === sessionId);
      if (!row) return null;
      const session = toSession(row);
      const roster: SessionRoster = {
        session,
        members: members.map(toMember),
        drivers: (driverRows as Row[]).filter((d) => idStr(d.sessionId) === sessionId).map(toDriver),
        invites:
          session.organizer === me
            ? (inviteRows as Row[]).filter((i) => idStr(i.sessionId) === sessionId).map(toInvite)
            : [],
      };
      return roster;
    },
    actions,
  };

  return createElement(NightOutContext.Provider, { value: api }, props.children);
}
