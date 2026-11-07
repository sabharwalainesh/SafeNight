// MOCK until C1-A bindings: in-memory NightOutApi backed by localStorage + BroadcastChannel.
import { createElement, useEffect, useMemo, useReducer, useSyncExternalStore, type ReactNode } from 'react';
import {
  NightOutContext,
  type ConsentGrant,
  type DriverEndReason,
  type NightOutActions,
  type NightOutApi,
  type NightSession,
  type SessionMember,
  type UserId,
} from '../api';
import { getSnapshot, mutate, subscribe, type MockState } from './store';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0, 1

function effective(s: NightSession, now: number): NightSession {
  return (s.status === 'active' || s.status === 'planned') && now > s.expiresAt ? { ...s, status: 'expired' } : s;
}

function genCode(taken: Set<string>): string {
  for (;;) {
    let c = '';
    for (let i = 0; i < 6; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    if (!taken.has(c)) return c;
  }
}

function requireActiveSession(s: MockState, sessionId: string): void {
  const sess = s.sessions.find((x) => x.id === sessionId);
  if (!sess) throw new Error('Session not found');
  if (effective(sess, Date.now()).status !== 'active') throw new Error('Session is not active');
}

const activeMember = (s: MockState, sessionId: string, user: UserId): SessionMember | undefined =>
  s.members.find((m) => m.sessionId === sessionId && m.userId === user && m.leftAt === null);

function need<T>(v: T | undefined | null, msg: string): T {
  if (v === undefined || v === null) throw new Error(msg);
  return v;
}

function endOpenDrivers(s: MockState, sessionId: string, reason: DriverEndReason, only?: UserId) {
  const now = Date.now();
  for (const d of s.drivers)
    if (d.sessionId === sessionId && d.endedAt === null && (!only || d.driverId === only)) {
      d.endedAt = now;
      d.endReason = reason;
    }
}

function makeActions(me: UserId, displayName: string): NightOutActions {
  const run = async <T,>(fn: (s: MockState, id: () => string) => T): Promise<T> => mutate(fn);
  return {
    createSession: (a) =>
      run((s, id) => {
        const now = Date.now();
        if (!a.name.trim()) throw new Error('Session name is required');
        if (a.expiresAt <= now) throw new Error('Expiry must be in the future');
        const sid = id();
        s.sessions.push({
          id: sid,
          organizer: me,
          name: a.name.trim(),
          venueHint: a.venueHint,
          startsAt: a.startsAt,
          expiresAt: a.expiresAt,
          status: 'active',
          checkinIntervalMinutes: a.checkinIntervalMinutes,
          createdAt: now,
        });
        s.members.push({
          id: id(),
          sessionId: sid,
          userId: me,
          displayName,
          role: 'organizer',
          joinedAt: now,
          leftAt: null,
          sharingScope: 'none',
        });
        return sid;
      }),
    createInvite: (sessionId, ttlMinutes, maxUses) =>
      run((s, id) => {
        const sess = need(
          s.sessions.find((x) => x.id === sessionId),
          'Session not found',
        );
        if (sess.organizer !== me) throw new Error('Only the organizer can create invites');
        const now = Date.now();
        if (effective(sess, now).status !== 'active') throw new Error('Session is not active');
        const inv = {
          id: id(),
          sessionId,
          code: genCode(new Set(s.invites.map((i) => i.code))),
          createdBy: me,
          expiresAt: now + ttlMinutes * 60000,
          revokedAt: null,
          maxUses,
          uses: 0,
        };
        s.invites.push(inv);
        return inv;
      }),
    revokeInvite: (inviteId) =>
      run((s) => {
        const inv = need(
          s.invites.find((i) => i.id === inviteId),
          'Invite not found',
        );
        const sess = s.sessions.find((x) => x.id === inv.sessionId);
        if (!sess || sess.organizer !== me) throw new Error('Only the organizer can revoke invites');
        inv.revokedAt ??= Date.now();
      }),
    joinSession: (code) =>
      run((s, id) => {
        const now = Date.now();
        const c = code.trim().toUpperCase();
        const inv = s.invites.find((i) => i.code === c);
        const sess = inv && s.sessions.find((x) => x.id === inv.sessionId);
        if (
          !inv ||
          !sess ||
          inv.revokedAt !== null ||
          inv.expiresAt <= now ||
          inv.uses >= inv.maxUses ||
          effective(sess, now).status !== 'active'
        )
          throw new Error('Invite code is invalid or expired');
        if (activeMember(s, inv.sessionId, me)) throw new Error('Already in this session');
        inv.uses += 1;
        s.members.push({
          id: id(),
          sessionId: inv.sessionId,
          userId: me,
          displayName,
          role: 'participant',
          joinedAt: now,
          leftAt: null,
          sharingScope: 'none',
        });
        return inv.sessionId;
      }),
    leaveSession: (sessionId) =>
      run((s) => {
        const m = need(activeMember(s, sessionId, me), 'Not a member of this session');
        const sess = need(
          s.sessions.find((x) => x.id === sessionId),
          'Session not found',
        );
        if (m.role === 'organizer' && sess.status !== 'ended') throw new Error('Organizer must end the session instead');
        const now = Date.now();
        m.leftAt = now;
        for (const g of s.grants)
          if (g.sessionId === sessionId && g.subject === me && g.revokedAt === null) g.revokedAt = now;
        endOpenDrivers(s, sessionId, 'none', me);
      }),
    endSession: (sessionId) =>
      run((s) => {
        const sess = need(
          s.sessions.find((x) => x.id === sessionId),
          'Session not found',
        );
        if (sess.organizer !== me) throw new Error('Only the organizer can end the session');
        const now = Date.now();
        sess.status = 'ended';
        for (const g of s.grants) if (g.sessionId === sessionId && g.revokedAt === null) g.revokedAt = now;
        endOpenDrivers(s, sessionId, 'session_ended');
      }),
    volunteerDriver: (sessionId) =>
      run((s, id) => {
        requireActiveSession(s, sessionId);
        need(activeMember(s, sessionId, me), 'Not a member of this session');
        if (s.drivers.some((d) => d.sessionId === sessionId && d.endedAt === null))
          throw new Error('This session already has a driver');
        s.drivers.push({
          id: id(),
          sessionId,
          driverId: me,
          volunteeredAt: Date.now(),
          acceptedAt: null,
          endedAt: null,
          endReason: 'none',
        });
      }),
    acceptDriverRole: (assignmentId) =>
      run((s) => {
        const d = need(
          s.drivers.find((x) => x.id === assignmentId),
          'Driver assignment not found',
        );
        if (d.driverId !== me) throw new Error('Only the driver can accept the driver role');
        if (d.endedAt !== null) throw new Error('Driver role has ended');
        d.acceptedAt ??= Date.now();
      }),
    endDriverRole: (assignmentId, reason) =>
      run((s) => {
        const d = need(
          s.drivers.find((x) => x.id === assignmentId),
          'Driver assignment not found',
        );
        const sess = s.sessions.find((x) => x.id === d.sessionId);
        if (d.driverId !== me && sess?.organizer !== me)
          throw new Error('Only the driver or organizer can end the driver role');
        if (d.endedAt !== null) return;
        d.endedAt = Date.now();
        d.endReason = reason;
      }),
    grantConsent: (recipient, sessionId, scope, ttlMinutes) =>
      run((s, id) => {
        requireActiveSession(s, sessionId);
        need(activeMember(s, sessionId, me), 'Not a member of this session');
        if (!activeMember(s, sessionId, recipient)) throw new Error('Recipient is not in this session');
        if (!(ttlMinutes > 0)) throw new Error('Duration must be greater than zero');
        const now = Date.now();
        s.grants.push({
          id: id(),
          subject: me,
          recipient,
          sessionId,
          scope,
          startsAt: now,
          expiresAt: now + ttlMinutes * 60000,
          revokedAt: null,
        });
      }),
    revokeConsent: (grantId) =>
      run((s) => {
        const g = need(
          s.grants.find((x) => x.id === grantId),
          'Consent grant not found',
        );
        if (g.subject !== me) throw new Error('Only the person sharing can revoke consent');
        g.revokedAt ??= Date.now();
      }),
    setSharingScope: (sessionId, scope) =>
      run((s) => {
        requireActiveSession(s, sessionId);
        const m = need(activeMember(s, sessionId, me), 'Not a member of this session');
        m.sharingScope = scope;
      }),
  };
}

export function useNightOutMock(me: UserId, displayName: string): NightOutApi {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const t = window.setInterval(tick, 15000);
    return () => window.clearInterval(t);
  }, []);
  const actions = useMemo(() => makeActions(me, displayName), [me, displayName]);

  const now = Date.now();
  return {
    me,
    ready: true,
    mocked: true,
    mySessions: state.sessions
      .filter((x) => activeMember(state, x.id, me))
      .map((x) => effective(x, now))
      .filter((x) => x.status === 'active' || x.status === 'planned'),
    roster(sessionId) {
      const sess = state.sessions.find((x) => x.id === sessionId);
      if (!sess || !activeMember(state, sessionId, me)) return null;
      return {
        session: effective(sess, Date.now()),
        members: state.members.filter((m) => m.sessionId === sessionId),
        drivers: state.drivers.filter((d) => d.sessionId === sessionId),
        invites: sess.organizer === me ? state.invites.filter((i) => i.sessionId === sessionId) : [],
      };
    },
    myConsents: state.grants.filter(
      (g: ConsentGrant) => (g.subject === me || g.recipient === me) && g.revokedAt === null && g.expiresAt > now,
    ),
    actions,
  };
}

export function NightOutMockProvider(props: { me: UserId; displayName: string; children?: ReactNode }) {
  const api = useNightOutMock(props.me, props.displayName);
  return createElement(NightOutContext.Provider, { value: api }, props.children);
}
