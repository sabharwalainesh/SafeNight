// "Come to me" meetups: a requester asks a friend to physically come to them; a helper accepts and
// follows a live compass. Rows come from the module's `my_meetups` view (participants only).
import { createContext, useContext, useMemo, useRef, type ReactNode } from 'react';
import { dataSource } from '../../lib/dataSource';
import { SenderError } from 'spacetimedb';
import { useReducer, useSpacetimeDB, useTable } from 'spacetimedb/react';
import { reducers, tables } from '../../module_bindings';
import type { EpochMs, UserId } from '../night-out/api';
import { idStr, identityStr, optTsMs, tagToSnake, tsMs } from '../night-out/live/convert';
import { useSafety } from '../safety/api';

export type MeetupStatus = 'coming' | 'arrived' | 'cancelled';
export type Meetup = {
  id: string;
  incidentId: string;
  sessionId: string;
  requester: UserId;
  requesterName: string;
  helper: UserId;
  helperName: string;
  status: MeetupStatus;
  startedAt: EpochMs;
  arrivedAt: EpochMs | null;
  expiresAt: EpochMs;
};

export type MeetupActions = {
  /** "Need a friend" plus "come to me": opens/elevates the help incident and allows precise sharing with whoever comes. */
  requestCompany(note: string): Promise<void>;
  offerToCome(incidentId: string): Promise<void>;
  markArrived(meetupId: string): Promise<void>;
  cancelMeetup(meetupId: string, reason: string): Promise<void>;
  /** Live compass stream (party of a `coming` meetup only). Fire-and-forget; the server drops >4 Hz. */
  streamPosition(meetupId: string, fix: { lat: number; lng: number; accuracyM: number; headingDeg: number | null; speedMps: number | null }): Promise<void>;
};

/** My trip partner's latest streamed fix. `receivedAt` is this device's clock (immune to server/phone clock skew). */
export type LivePosition = {
  meetupId: string;
  userId: UserId;
  lat: number;
  lng: number;
  accuracyM: number;
  headingDeg: number | null;
  speedMps: number | null;
  recordedAt: EpochMs;
  receivedAt: EpochMs;
};

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

export type MeetupState = { me: UserId; meetups: Meetup[]; ready: boolean; actions: MeetupActions; /** Partner fixes keyed by `${meetupId}:${userId}`. */ live: Record<string, LivePosition> };

export const liveKey = (meetupId: string, userId: UserId) => `${meetupId}:${userId}`;

const Ctx = createContext<MeetupState | null>(null);

/**
 * Mount once inside SafetyProvider. Live data only: on mocks (and in tests, which render the mock
 * providers directly) nothing is provided and every meetup UI renders nothing.
 */
export function MeetupProvider({ children }: { children: ReactNode }) {
  if (dataSource('VITE_SAFETY_SOURCE') !== 'live') return <>{children}</>;
  return <MeetupLiveProvider>{children}</MeetupLiveProvider>;
}
function MeetupLiveProvider({ children }: { children: ReactNode }) {
  const value = useMeetupsLive();
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Null when the meetup feature is unavailable (mock data / tests). */
export const useMeetups = (): MeetupState | null => useContext(Ctx);

function useMeetupsLive(): MeetupState {
  const { identity } = useSpacetimeDB();
  const me = identity?.toHexString() ?? '';
  const { sessionId } = useSafety();
  const [rows, ready] = useTable(tables.myMeetups);
  const rRequest = useReducer(reducers.requestCompany);
  const rOffer = useReducer(reducers.offerToCome);
  const rArrived = useReducer(reducers.markArrived);
  const rCancel = useReducer(reducers.cancelMeetup);
  const rStream = useReducer(reducers.streamMeetupPosition);
  const [posRows] = useTable(tables.myMeetupPositions);
  const received = useRef(new Map<string, { recordedAt: number; receivedAt: number }>());
  const live = useMemo<Record<string, LivePosition>>(() => {
    const out: Record<string, LivePosition> = {};
    const now = Date.now();
    for (const r of posRows) {
      const meetupId = idStr(r.meetupId);
      const userId = identityStr(r.userId);
      const key = liveKey(meetupId, userId);
      const recordedAt = tsMs(r.recordedAt);
      const prev = received.current.get(key);
      const receivedAt = prev && prev.recordedAt === recordedAt ? prev.receivedAt : now;
      received.current.set(key, { recordedAt, receivedAt });
      out[key] = {
        meetupId,
        userId,
        lat: r.lat,
        lng: r.lng,
        accuracyM: r.accuracyM,
        headingDeg: r.headingDeg ?? null,
        speedMps: r.speedMps ?? null,
        recordedAt,
        receivedAt,
      };
    }
    return out;
  }, [posRows]);

  const meetups = useMemo<Meetup[]>(
    () =>
      rows
        .map((r) => ({
          id: idStr(r.id),
          incidentId: idStr(r.incidentId),
          sessionId: idStr(r.sessionId),
          requester: identityStr(r.requester),
          requesterName: r.requesterName,
          helper: identityStr(r.helper),
          helperName: r.helperName,
          status: tagToSnake(r.status.tag) as MeetupStatus,
          startedAt: tsMs(r.startedAt),
          arrivedAt: optTsMs(r.arrivedAt),
          expiresAt: tsMs(r.expiresAt),
        }))
        .sort((a, b) => b.startedAt - a.startedAt),
    [rows],
  );

  const actions = useMemo<MeetupActions>(
    () => ({
      requestCompany: (note) =>
        wrap(() => {
          if (!sessionId) throw new Error('Join a Night Out first');
          return rRequest({ sessionId: BigInt(sessionId), note });
        }),
      offerToCome: (incidentId) => wrap(() => rOffer({ incidentId: BigInt(incidentId) })),
      markArrived: (meetupId) => wrap(() => rArrived({ meetupId: BigInt(meetupId) })),
      cancelMeetup: (meetupId, reason) => wrap(() => rCancel({ meetupId: BigInt(meetupId), reason })),
      streamPosition: (meetupId, f) =>
        wrap(() =>
          rStream({
            meetupId: BigInt(meetupId),
            lat: f.lat,
            lng: f.lng,
            accuracyM: f.accuracyM,
            headingDeg: f.headingDeg ?? undefined,
            speedMps: f.speedMps ?? undefined,
          }),
        ),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessionId],
  );

  return { me, meetups, ready, actions, live };
}

export const isActiveMeetup = (m: Meetup, now = Date.now()) => m.status === 'coming' && m.expiresAt > now;
