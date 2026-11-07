// MOCK until C2-A bindings: shared localStorage store with cross-tab sync.
import type { Checkin, Incident, IncidentEvent, SafetyAlert } from '../api';
import type { EpochMs, UserId } from '../../night-out/api';

export type StoredLocation = {
  sessionId: string;
  userId: UserId;
  lat: number;
  lng: number;
  accuracyM: number;
  recordedAt: EpochMs;
  expiresAt: EpochMs;
  source: 'device' | 'simulated';
};

export type MockState = {
  counter: number;
  locations: StoredLocation[];
  checkins: Checkin[];
  incidents: Incident[];
  events: IncidentEvent[];
  alerts: SafetyAlert[];
  reports: string[]; // concern dedupe keys
  dismissed: string[]; // `${recipient}:${alertId}`
  consumptions: { id: string; sessionId: string; userId: UserId; level: string; at: EpochMs }[]; // private
};

export const STORAGE_KEY = 'safenight.mock.safety.v1';
export const CHANNEL_NAME = 'safenight-safety';

const empty = (): MockState => ({ counter: 0, locations: [], checkins: [], incidents: [], events: [], alerts: [], reports: [], dismissed: [], consumptions: [] });

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
