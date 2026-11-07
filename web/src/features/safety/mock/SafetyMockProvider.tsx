// MOCK until C2-A bindings: SafetyApi backed by localStorage + BroadcastChannel.
import { createElement, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useCurrentSessionId } from '../../night-out/currentSession';
import { useNightOut, type EpochMs, type SessionMember, type UserId } from '../../night-out/api';
import {
  SafetyContext,
  type AlertKind,
  type ConcernCategory,
  type Incident,
  type IncidentKind,
  type SafetyActions,
  type SafetyApi,
  type Severity,
  type VisibleLocation,
} from '../api';
import { getSnapshot, mutate, subscribe, type MockState } from './store';

const MIN = 60000;
const NO_SESSION = 'Join a Night Out first';
const TAB_LOADED_AT = Date.now();
const DRIVER_MESSAGE =
  "Please don't drive tonight. A friend is worried you may have been drinking. Your group will help you get home.";
const CLOSED = ['resolved', 'cancelled', 'handed_off'];

const isOpen = (i: Incident) => !CLOSED.includes(i.status);
const round3 = (n: number) => Math.round(n * 1000) / 1000;

type Ctx = {
  me: UserId;
  sessionId: string | null;
  members: SessionMember[]; // all, incl. departed
  organizer: UserId | null;
  driverId: UserId | null; // accepted, active driver
  grants: { subject: UserId; recipient: UserId; scope: string; revokedAt: EpochMs | null; expiresAt: EpochMs }[];
};

function addEvent(s: MockState, nextId: () => string, inc: Incident, actor: UserId, actorName: string, kind: string, detail: string) {
  s.events.push({ id: nextId(), incidentId: inc.id, at: Date.now(), actor, actorName, kind, detail, simulated: true });
}

function sendAlert(s: MockState, nextId: () => string, recipient: UserId, incidentId: string, kind: AlertKind, message: string) {
  s.alerts.push({ id: nextId(), recipient, incidentId, kind, message, at: Date.now() });
  if (s.alerts.length > 200) s.alerts.splice(0, s.alerts.length - 200);
}

function openIncident(
  s: MockState,
  nextId: () => string,
  c: Ctx,
  subject: UserId,
  reporter: UserId,
  kind: IncidentKind,
  severity: Severity,
  detail: string,
): Incident {
  const active = c.members.filter((m) => m.leftAt === null);
  const nameOf = (u: UserId) => c.members.find((m) => m.userId === u)?.displayName ?? u;
  const now = Date.now();
  const participants = active.map((m) => ({
    userId: m.userId,
    displayName: m.displayName,
    role: (m.userId === subject ? 'subject' : m.userId === c.organizer ? 'organizer' : m.userId === reporter ? 'reporter' : 'buddy') as
      | 'subject'
      | 'organizer'
      | 'reporter'
      | 'buddy',
    acknowledgedAt: null as EpochMs | null,
  }));
  const inc: Incident = {
    id: nextId(),
    sessionId: c.sessionId!,
    subject,
    subjectName: nameOf(subject),
    kind,
    severity,
    status: 'open',
    openedBy: reporter,
    openedAt: now,
    resolvedAt: null,
    resolvedBy: null,
    participants,
  };
  s.incidents.push(inc);
  addEvent(s, nextId, inc, reporter, nameOf(reporter), 'opened', detail);
  return inc;
}

function makeActions(getCtx: () => Ctx): SafetyActions {
  const run = async <T,>(fn: (s: MockState, id: () => string, c: Ctx) => T): Promise<T> => {
    const c = getCtx();
    if (!c.sessionId) throw new Error(NO_SESSION);
    return mutate((s, id) => fn(s, id, c));
  };
  const nameIn = (c: Ctx, u: UserId) => c.members.find((m) => m.userId === u)?.displayName ?? u;
  const isActive = (c: Ctx, u: UserId) => c.members.some((m) => m.userId === u && m.leftAt === null);

  const driverConcern = (s: MockState, id: () => string, c: Ctx, reporter: UserId, note: string) => {
    const driver = c.driverId!;
    const inc = openIncident(s, id, c, driver, reporter, 'possible_impaired_driving', 'urgent', note || 'Possible drinking reported for the driver');
    sendAlert(s, id, driver, inc.id, 'no_driving_warning', DRIVER_MESSAGE);
    const msg = `${nameIn(c, reporter)} is worried about ${nameIn(c, driver)}. The driver has been asked not to drive.`;
    if (c.organizer && c.organizer !== reporter && c.organizer !== driver && isActive(c, c.organizer))
      sendAlert(s, id, c.organizer, inc.id, 'incident_update', msg);
    for (const p of inc.participants)
      if (p.userId !== driver && p.userId !== c.organizer) sendAlert(s, id, p.userId, inc.id, 'ack_requested', msg);
  };

  const concern = (s: MockState, id: () => string, c: Ctx, subject: UserId, category: ConcernCategory, note: string) => {
    if (!isActive(c, subject)) throw new Error('Subject is not in this session');
    const key = `${c.sessionId}:${subject}:${category}:${Math.floor(Date.now() / (5 * MIN))}`;
    if (s.reports.includes(key)) throw new Error('Already reported');
    s.reports.push(key);
    if (subject === c.driverId && category === 'possible_consumption') {
      driverConcern(s, id, c, c.me, note);
      return;
    }
    const inc = openIncident(s, id, c, subject, c.me, 'feeling_unsafe', 'elevated', note || `Concern reported: ${category}`);
    for (const p of inc.participants)
      if (p.userId !== subject)
        sendAlert(s, id, p.userId, inc.id, 'ack_requested', `${inc.subjectName}: ${category.replace('_', ' ')} concern. Please acknowledge.`);
  };

  return {
    postLocation: (lat, lng, accuracyM, source) =>
      run((s, _id, c) => {
        const mine = c.members.find((m) => m.userId === c.me && m.leftAt === null);
        if (!mine || mine.sharingScope === 'none') throw new Error('Turn on sharing first');
        const now = Date.now();
        s.locations = s.locations.filter((l) => !(l.sessionId === c.sessionId && l.userId === c.me));
        s.locations.push({ sessionId: c.sessionId!, userId: c.me, lat, lng, accuracyM, recordedAt: now, expiresAt: now + 15 * MIN, source });
      }),
    checkIn: (kind, note) =>
      run((s, id, c) => {
        const now = Date.now();
        s.checkins.push({ id: id(), sessionId: c.sessionId!, userId: c.me, kind, note, createdAt: now });
        const myOpen = s.incidents.filter((i) => i.sessionId === c.sessionId && i.subject === c.me && isOpen(i));
        const me = nameIn(c, c.me);
        if (kind === 'emergency' || kind === 'need_friend' || kind === 'need_ride' || kind === 'unwell') {
          const severity: Severity = kind === 'emergency' ? 'urgent' : 'elevated';
          let inc = myOpen[0];
          const detail = `Check-in: ${kind}${note ? ` (${note})` : ''}`;
          if (inc) {
            if (severity === 'urgent') inc.severity = 'urgent';
            else if (inc.severity === 'info') inc.severity = 'elevated';
            addEvent(s, id, inc, c.me, me, 'elevated', detail);
          } else {
            inc = openIncident(s, id, c, c.me, c.me, 'help_requested', severity, detail);
          }
          for (const p of inc.participants)
            if (p.userId !== c.me) sendAlert(s, id, p.userId, inc.id, 'help_requested', `${me} needs help (${kind.replace('_', ' ')}).`);
        } else if (kind === 'okay') {
          for (const inc of myOpen) addEvent(s, id, inc, c.me, me, 'subject_says_fine', `${me} says they are fine`);
        } else if (kind === 'home') {
          for (const inc of s.incidents)
            if (inc.sessionId === c.sessionId && inc.subject === c.me && inc.status === 'awaiting_home_confirmation') {
              inc.status = 'resolved';
              inc.resolvedAt = now;
              inc.resolvedBy = c.me;
              addEvent(s, id, inc, c.me, me, 'resolved', `${me} confirmed they are home`);
            }
        }
      }),
    reportConsumption: (level, shareWithBuddy) =>
      run((s, id, c) => {
        s.consumptions.push({ id: id(), sessionId: c.sessionId!, userId: c.me, level, at: Date.now() });
        if (c.driverId !== c.me || level === 'none') return;
        if (!shareWithBuddy) {
          sendAlert(s, id, c.me, '', 'no_driving_warning', DRIVER_MESSAGE);
          return;
        }
        driverConcern(s, id, c, c.me, `Driver reports: ${level.replace('_', ' ')}`);
      }),
    reportConcern: (subject, category, note) => run((s, id, c) => concern(s, id, c, subject, category, note)),
    acknowledgeIncident: (incidentId) =>
      run((s, id, c) => {
        const inc = s.incidents.find((i) => i.id === incidentId);
        const p = inc?.participants.find((x) => x.userId === c.me);
        if (!inc || !p) throw new Error('Only participants can acknowledge');
        if (inc.subject === c.me) throw new Error("You can't acknowledge your own alert");
        if (!isOpen(inc)) throw new Error('This incident is closed');
        p.acknowledgedAt ??= Date.now();
        if (inc.status === 'open') inc.status = 'acknowledged';
        addEvent(s, id, inc, c.me, nameIn(c, c.me), 'acknowledged', `${nameIn(c, c.me)} acknowledged`);
      }),
    resolveIncident: (incidentId, note) =>
      run((s, id, c) => {
        const inc = s.incidents.find((i) => i.id === incidentId);
        const p = inc?.participants.find((x) => x.userId === c.me);
        if (!inc || !p) throw new Error('You are not allowed to resolve this incident');
        if (!isOpen(inc)) throw new Error('This incident is closed');
        const t = Date.now();
        const has = (scope: string) =>
          c.grants.some((g) => g.subject === inc.subject && g.recipient === c.me && g.scope === scope && g.revokedAt === null && g.expiresAt > t);
        const allowed = inc.subject === c.me || ((p.role === 'organizer' || p.role === 'buddy') && has('messaging') && has('checkins'));
        if (!allowed) throw new Error('You are not allowed to resolve this incident');
        inc.status = 'resolved';
        inc.resolvedAt = Date.now();
        inc.resolvedBy = c.me;
        addEvent(s, id, inc, c.me, nameIn(c, c.me), 'resolved', note || 'Resolved');
      }),
    cancelIncident: (incidentId, reason) =>
      run((s, id, c) => {
        const inc = s.incidents.find((i) => i.id === incidentId);
        if (inc && !isOpen(inc)) throw new Error('This incident is closed');
        if (!inc || inc.subject !== c.me || Date.now() - inc.openedAt > 2 * MIN)
          throw new Error('Only the person can cancel, within 2 minutes');
        inc.status = 'cancelled';
        addEvent(s, id, inc, c.me, nameIn(c, c.me), 'cancelled', reason || 'Cancelled by the person');
        for (const p of inc.participants)
          if (p.userId !== c.me) sendAlert(s, id, p.userId, inc.id, 'incident_update', `${inc.subjectName} cancelled their request.`);
      }),
  };
}

export function SafetyMockProvider(props: { children?: ReactNode }) {
  const no = useNightOut();
  const state = useSyncExternalStore(subscribe, getSnapshot);
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), 15000);
    return () => window.clearInterval(t);
  }, []);

  const sessionId = useCurrentSessionId(); // falls back to first of mySessions without a CurrentSessionProvider
  const roster = sessionId ? no.roster(sessionId) : null;

  const ctxRef = useRef<Ctx>({ me: no.me, sessionId, members: [], organizer: null, driverId: null, grants: [] });
  const driver = roster?.drivers.find((d) => d.acceptedAt !== null && d.endedAt === null);
  ctxRef.current = {
    me: no.me,
    sessionId,
    members: roster?.members ?? [],
    organizer: roster?.session.organizer ?? null,
    driverId: driver?.driverId ?? null,
    grants: no.myConsents.filter((g) => g.sessionId === sessionId),
  };
  const actions = useMemo(() => makeActions(() => ctxRef.current), []);
  const dismiss = useCallback(
    (alertId: string) =>
      void mutate((s) => {
        const k = `${ctxRef.current.me}:${alertId}`;
        if (!s.dismissed.includes(k)) s.dismissed.push(k);
      }),
    [],
  );

  const now = Date.now();
  const me = no.me;
  const toVisible = (l: MockState['locations'][number], approximate: boolean): VisibleLocation => ({
    userId: l.userId,
    displayName: roster?.members.find((m) => m.userId === l.userId)?.displayName ?? l.userId,
    lat: approximate ? round3(l.lat) : l.lat,
    lng: approximate ? round3(l.lng) : l.lng,
    accuracyM: l.accuracyM,
    recordedAt: l.recordedAt,
    source: l.source,
    approximate,
    isStale: now - l.recordedAt > 5 * MIN,
  });

  const locations: VisibleLocation[] = [];
  let myLocation: VisibleLocation | null = null;
  if (sessionId && roster) {
    for (const l of state.locations) {
      if (l.sessionId !== sessionId || l.expiresAt <= now) continue;
      if (l.userId === me) {
        myLocation = toVisible(l, false);
        continue;
      }
      if (!roster.members.some((m) => m.userId === l.userId && m.leftAt === null)) continue;
      const scopes = no.myConsents
        .filter((g) => g.sessionId === sessionId && g.subject === l.userId && g.recipient === me && g.revokedAt === null && g.expiresAt > now)
        .map((g) => g.scope);
      const precise = scopes.includes('location_precise');
      if (precise || scopes.includes('location_approximate')) locations.push(toVisible(l, !precise));
    }
  }

  const mine = (i: Incident) => i.participants.some((p) => p.userId === me);
  const api: SafetyApi = {
    me,
    ready: true,
    mocked: true,
    sessionId,
    locations,
    myLocation,
    myCheckins: state.checkins.filter((c) => c.sessionId === sessionId && c.userId === me).sort((a, b) => b.createdAt - a.createdAt),
    incidents: state.incidents.filter((i) => i.sessionId === sessionId && mine(i)).sort((a, b) => b.openedAt - a.openedAt),
    timeline: (incidentId) => {
      const inc = state.incidents.find((i) => i.id === incidentId);
      if (!inc || !mine(inc)) return [];
      return state.events.filter((e) => e.incidentId === incidentId).sort((a, b) => a.at - b.at);
    },
    alerts: state.alerts
      .filter((a) => a.recipient === me && (a.kind === 'no_driving_warning' || a.at >= TAB_LOADED_AT) && !state.dismissed.includes(`${me}:${a.id}`))
      .sort((a, b) => b.at - a.at),
    dismissAlert: dismiss,
    actions,
  };
  return createElement(SafetyContext.Provider, { value: api }, props.children);
}
