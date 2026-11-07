import { createElement, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Identity, SenderError } from 'spacetimedb';
import { useReducer, useSpacetimeDB, useTable } from 'spacetimedb/react';
import { reducers, tables } from '../../../module_bindings';
import { useNightOut } from '../../night-out/api';
import { useOptionalCurrentSessionId } from '../../night-out/currentSession';
import { identityStr, snakeEnum, tsMs } from '../../night-out/live/convert';
import { SafetyContext, type SafetyActions, type SafetyAlert, type SafetyApi } from '../api';
import { toAlert, toCheckin, toEvent, toIncident, toLocation } from './convert';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = any;

function toError(e: unknown): Error {
  if (e instanceof SenderError) return new Error(e.message);
  if (e instanceof Error) return e;
  return new Error(String(e));
}
async function wrap<T>(f: () => Promise<T>): Promise<T> {
  try {
    return await f();
  } catch (e) {
    throw toError(e);
  }
}

const dismissKey = (me: string) => `safenight.safety.dismissed.${me}`;
function loadDismissed(me: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(dismissKey(me));
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}
function saveDismissed(me: string, s: Set<string>) {
  try {
    window.localStorage.setItem(dismissKey(me), JSON.stringify([...s].slice(-200)));
  } catch {
    /* ignore */
  }
}
/** Stable id from alert content so dismissals survive reloads (event rows have no key). */
const alertId = (a: { incidentId: bigint; kind: { tag: string }; at: { toDate(): Date }; message: string }) =>
  `${a.incidentId}:${a.kind.tag}:${a.at.toDate().getTime()}:${a.message.length}`;

export function SafetyLiveProvider(props: { children?: ReactNode }) {
  const { identity, getConnection } = useSpacetimeDB();
  const me = identity?.toHexString() ?? '';
  const { mySessions } = useNightOut();
  const current = useOptionalCurrentSessionId();
  const sessionId = current ?? mySessions[0]?.id ?? null;

  const [locRows, locReady] = useTable(tables.visibleLocations);
  const [ckRows, ckReady] = useTable(tables.myCheckins);
  const [incRows, incReady] = useTable(tables.myIncidents);
  const [partRows, partReady] = useTable(tables.myIncidentParticipants);
  const [evRows, evReady] = useTable(tables.myIncidentEvents);
  // Subscribes to the event table; rows themselves arrive through onInsert below.
  useTable(tables.safetyAlert);

  const [, setTick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), 30000);
    return () => window.clearInterval(t);
  }, []);

  const [received, setReceived] = useState<SafetyAlert[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(() => loadDismissed(me));
  useEffect(() => setDismissed(loadDismissed(me)), [me]);
  const seen = useRef(new Set<string>());

  const conn = getConnection();
  useEffect(() => {
    if (!conn || !me) return;
    const table = (conn.db as any).safetyAlert;
    if (!table) return;
    const cb = (_ctx: unknown, row: Row) => {
      if (identityStr(row.recipient) !== me) return;
      let id = alertId(row);
      if (seen.current.has(id)) id = `${id}:${seen.current.size}`;
      seen.current.add(id);
      setReceived((prev) => [toAlert(row, id), ...prev]);
    };
    table.onInsert(cb);
    return () => table.removeOnInsert(cb);
  }, [conn, me]);

  const rPost = useReducer(reducers.postLocation);
  const rCheckIn = useReducer(reducers.checkIn);
  const rConsumption = useReducer(reducers.reportConsumption);
  const rConcern = useReducer(reducers.reportConcern);
  const rAck = useReducer(reducers.acknowledgeIncident);
  const rResolve = useReducer(reducers.resolveIncident);
  const rCancel = useReducer(reducers.cancelIncident);

  const sessionRef = useRef(sessionId);
  sessionRef.current = sessionId;

  const actions = useMemo<SafetyActions>(() => {
    const sid = (): bigint => {
      if (!sessionRef.current) throw new Error('Join a Night Out first');
      return BigInt(sessionRef.current);
    };
    return {
      postLocation: (lat, lng, accuracyM, source) =>
        wrap(() => rPost({ sessionId: sid(), lat, lng, accuracyM, source: snakeEnum(source) as any })),
      checkIn: (kind, note) => wrap(() => rCheckIn({ sessionId: sid(), kind: snakeEnum(kind) as any, note })),
      reportConsumption: (level, shareWithBuddy) =>
        wrap(() => rConsumption({ sessionId: sid(), level: snakeEnum(level) as any, shareWithBuddy })),
      reportConcern: (subject, category, note) =>
        wrap(() =>
          rConcern({ sessionId: sid(), subject: Identity.fromString(subject), category: snakeEnum(category) as any, note }),
        ),
      acknowledgeIncident: (id) => wrap(() => rAck({ incidentId: BigInt(id) })),
      resolveIncident: (id, note) => wrap(() => rResolve({ incidentId: BigInt(id), note })),
      cancelIncident: (id, reason) => wrap(() => rCancel({ incidentId: BigInt(id), reason })),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismissAlert = useCallback(
    (id: string) => {
      setDismissed((prev) => {
        const next = new Set(prev).add(id);
        saveDismissed(me, next);
        return next;
      });
    },
    [me],
  );

  const now = Date.now();
  const parts = partRows as Row[];
  const inSession = (r: Row) => sessionId !== null && String(r.sessionId) === sessionId;
  const api: SafetyApi = {
    me,
    ready: !!identity && locReady && ckReady && incReady && partReady && evReady,
    mocked: false,
    sessionId,
    locations: (locRows as Row[])
      .filter((r) => inSession(r) && identityStr(r.userId) !== me)
      .map((r) => toLocation(r, now)),
    myLocation:
      (locRows as Row[])
        .filter((r) => inSession(r) && identityStr(r.userId) === me)
        .sort((a, b) => tsMs(b.recordedAt) - tsMs(a.recordedAt))
        .map((r) => toLocation(r, now))[0] ?? null,
    myCheckins: (ckRows as Row[])
      .filter(inSession)
      .map(toCheckin)
      .sort((a, b) => b.createdAt - a.createdAt),
    incidents: (incRows as Row[]).map((r) => toIncident(r, parts)).sort((a, b) => b.openedAt - a.openedAt),
    timeline: (incidentId) =>
      (evRows as Row[])
        .filter((r) => String(r.incidentId) === incidentId)
        .map((r) => toEvent(r, parts))
        .sort((a, b) => a.at - b.at),
    alerts: received.filter((a) => !dismissed.has(a.id)),
    dismissAlert,
    actions,
  };
  return createElement(SafetyContext.Provider, { value: api }, props.children);
}
