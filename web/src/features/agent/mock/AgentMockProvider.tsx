// MOCK until C3-A bindings: AgentApi backed by a deterministic simulated planner.
// Place inside the NightOut and Safety providers.
import { createElement, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useNightOut } from '../../night-out/api';
import { useSafety } from '../../safety/api';
import { getSnapshot as safeSnap, subscribe as safeSubscribe } from '../../safety/mock/store';
import { AgentContext, type AgentApi, type AgentNotification } from '../api';
import { checkFollowups, makeActions, makeDemo, runPlanner } from './engine';
import { getSnapshot, subscribe, type StoredNotification } from './store';

function liveStatus(n: StoredNotification, now: number): AgentNotification['status'] {
  if (n.acknowledgedAt !== null) return 'acknowledged';
  if (n.status === 'failed') return 'failed';
  if (now >= n.deliveredAt) return 'delivered';
  if (now >= n.sentAt) return 'sent';
  return 'queued';
}

export function AgentMockProvider(props: { children?: ReactNode }) {
  const no = useNightOut();
  useSafety(); // re-render when incidents change
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const [, setTick] = useState(0);
  const meRef = useRef(no.me);
  meRef.current = no.me;

  useEffect(() => {
    let n = 0;
    runPlanner();
    const off = safeSubscribe(() => runPlanner());
    const t = window.setInterval(() => {
      n++;
      runPlanner();
      if (n % 5 === 0) checkFollowups();
      setTick((x) => x + 1);
    }, 1000);
    return () => {
      off();
      window.clearInterval(t);
    };
  }, []);

  const actions = useMemo(() => makeActions(() => meRef.current), []);
  const demo = useMemo(() => makeDemo(), []);

  const me = no.me;
  const now = Date.now();
  const incidents = safeSnap().incidents;
  const visible = (incidentId: string) => !!incidents.find((i) => i.id === incidentId)?.participants.some((p) => p.userId === me);
  const jobOf = (jobId: string) => state.jobs.find((j) => j.id === jobId);
  const num = (a: { id: string }, b: { id: string }) => Number(a.id) - Number(b.id);

  const api: AgentApi = {
    me,
    ready: true,
    mocked: true,
    plannerMode: 'simulated',
    jobForIncident: (incidentId) => (visible(incidentId) ? state.jobs.find((j) => j.incidentId === incidentId) ?? null : null),
    latestPlan: (jobId) => {
      const j = jobOf(jobId);
      if (!j || !visible(j.incidentId)) return null;
      return state.plans.filter((p) => p.jobId === jobId).sort((a, b) => b.version - a.version)[0] ?? null;
    },
    receipts: (jobId) => {
      const j = jobOf(jobId);
      if (!j || !visible(j.incidentId)) return [];
      return state.actions.filter((a) => a.jobId === jobId).sort(num);
    },
    notifications: (incidentId) =>
      visible(incidentId)
        ? state.notifications
            .filter((n) => n.incidentId === incidentId)
            .sort(num)
            .map((n) => ({ ...n, status: liveStatus(n, now) }))
        : [],
    ridePlan: (incidentId) => (visible(incidentId) ? state.rides.find((r) => r.incidentId === incidentId) ?? null : null),
    actions,
    demo,
  };
  return createElement(AgentContext.Provider, { value: api }, props.children);
}
