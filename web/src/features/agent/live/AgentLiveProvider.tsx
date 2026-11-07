import { createElement, useMemo, type ReactNode } from 'react';
import { SenderError } from 'spacetimedb';
import { useReducer, useSpacetimeDB, useTable } from 'spacetimedb/react';
import { reducers, tables } from '../../../module_bindings';
import { useSafety } from '../../safety/api';
import { tsMs } from '../../night-out/live/convert';
import { AgentContext, type AgentActions, type AgentApi, type DemoActions } from '../api';
import { toAction, toJob, toNotification, toPlan, toRidePlan } from './convert';

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
const unavailable = () => Promise.reject(new Error('Not available on the live backend yet'));

export function AgentLiveProvider(props: { children?: ReactNode }) {
  const { identity } = useSpacetimeDB();
  const me = identity?.toHexString() ?? '';
  const safety = useSafety();

  const [jobRows, jobReady] = useTable(tables.myAgentJobs);
  const [planRows, planReady] = useTable(tables.myAgentPlans);
  const [actRows, actReady] = useTable(tables.myAgentActions);
  const [noteRows, noteReady] = useTable(tables.myNotifications);
  const [rideRows, rideReady] = useTable(tables.myRidePlans);

  const rAck = useReducer(reducers.acknowledgeAssistance);
  const rDecline = useReducer(reducers.declineAssistance);
  const rAccept = useReducer(reducers.acceptRideOption);
  const rBooked = useReducer(reducers.confirmRideBooked);
  const rPickup = useReducer(reducers.confirmPickup);
  const rHome = useReducer(reducers.confirmHome);
  const rFire = useReducer(reducers.demoFireFollowup);

  const actions = useMemo<AgentActions>(
    () => ({
      acknowledgeAssistance: (id) => wrap(() => rAck({ jobId: BigInt(id) })),
      declineAssistance: (id, reason) => wrap(() => rDecline({ jobId: BigInt(id), reason })),
      acceptRideOption: (id, option) => wrap(() => rAccept({ ridePlanId: BigInt(id), option })),
      confirmRideBooked: (id) => wrap(() => rBooked({ ridePlanId: BigInt(id) })),
      confirmPickup: (id) => wrap(() => rPickup({ ridePlanId: BigInt(id) })),
      confirmHome: (id) => wrap(() => rHome({ incidentId: BigInt(id) })),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const demo = useMemo<DemoActions>(
    () => ({
      fireFollowup: (id) => wrap(() => rFire({ jobId: BigInt(id) })),
      reset: unavailable,
      setupGroup: unavailable,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const names = new Map<string, string>();
  for (const i of safety.incidents) for (const p of i.participants) names.set(p.userId, p.displayName);
  const nameOf = (id: string) => names.get(id);

  const plans = (planRows as Row[]).map(toPlan);
  const latest = new Map<string, ReturnType<typeof toPlan>>();
  for (const p of plans) {
    const cur = latest.get(p.jobId);
    if (!cur || p.version > cur.version) latest.set(p.jobId, p);
  }
  const plannerMode: AgentApi['plannerMode'] = plans.some((p) => !p.simulated) ? 'live' : 'simulated';

  const api: AgentApi = {
    me,
    ready: !!identity && jobReady && planReady && actReady && noteReady && rideReady,
    mocked: false,
    plannerMode,
    jobForIncident: (incidentId) => {
      const r = (jobRows as Row[]).find((j) => String(j.incidentId) === incidentId);
      return r ? toJob(r) : null;
    },
    latestPlan: (jobId) => latest.get(jobId) ?? null,
    receipts: (jobId) =>
      (actRows as Row[])
        .filter((a) => String(a.jobId) === jobId)
        .map(toAction)
        .sort((a, b) => a.at - b.at),
    notifications: (incidentId) =>
      (noteRows as Row[])
        .filter((n) => String(n.incidentId) === incidentId)
        .map((n) => toNotification(n, nameOf))
        .sort((a, b) => a.createdAt - b.createdAt),
    ridePlan: (incidentId) => {
      const r = (rideRows as Row[])
        .filter((x) => String(x.incidentId) === incidentId)
        .sort((a, b) => tsMs(b.updatedAt) - tsMs(a.updatedAt))[0];
      return r ? toRidePlan(r, nameOf) : null;
    },
    actions,
    demo,
  };
  return createElement(AgentContext.Provider, { value: api }, props.children);
}
