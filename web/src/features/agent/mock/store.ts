// MOCK until C3-A bindings: agent jobs, plans, receipts, notifications, localStorage store with cross-tab sync.
import type { AgentAction, AgentJob, AgentNotification, AgentPlan, RidePlan } from '../api';
import type { UserId } from '../../night-out/api';

export type StoredJob = AgentJob & {
  sessionId: string;
  subject: UserId;
  subjectName: string;
  /** [primary buddy, backup buddy, organizer] */
  tiers: UserId[];
  tierNames: string[];
  ackedBy: UserId | null;
};
export type StoredNotification = AgentNotification & { sentAt: number; deliveredAt: number };

export type MockState = {
  counter: number;
  jobs: StoredJob[];
  plans: AgentPlan[];
  actions: AgentAction[];
  notifications: StoredNotification[];
  rides: RidePlan[];
};

export const STORAGE_KEY = 'safenight.mock.agent.v1';
export const CHANNEL_NAME = 'safenight-agent';

export const empty = (): MockState => ({ counter: 0, jobs: [], plans: [], actions: [], notifications: [], rides: [] });

let memory: MockState = empty();
let snapshot: MockState = memory;
const listeners = new Set<() => void>();
let channel: BroadcastChannel | null = null;
let started = false;

function readStorage(): MockState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return { ...empty(), ...(JSON.parse(raw) as Partial<MockState>) };
  } catch {
    return null;
  }
}

function refresh() {
  const fromStorage = readStorage();
  if (fromStorage) memory = fromStorage;
  snapshot = memory;
  listeners.forEach((l) => l());
}

function start() {
  if (started) return;
  started = true;
  const fromStorage = readStorage();
  if (fromStorage) {
    memory = fromStorage;
    snapshot = memory;
  }
  try {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = () => refresh();
  } catch {
    channel = null;
  }
  try {
    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEY || e.key === null) refresh();
    });
  } catch {
    /* ignore */
  }
}

export function subscribe(listener: () => void): () => void {
  start();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSnapshot(): MockState {
  start();
  return snapshot;
}

/** Apply a mutation on the freshest state; throws propagate without saving. */
export function mutate<T>(fn: (s: MockState, nextId: () => string) => T): T {
  start();
  const fresh = readStorage() ?? memory;
  const draft: MockState = JSON.parse(JSON.stringify(fresh)) as MockState;
  const nextId = () => String(++draft.counter);
  const result = fn(draft, nextId);
  memory = draft;
  snapshot = draft;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    /* fall back to in-memory */
  }
  try {
    channel?.postMessage({ t: Date.now() });
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
  return result;
}
