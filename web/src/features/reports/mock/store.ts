// MOCK until C4-A bindings: localStorage + BroadcastChannel store.
import type { ReportCategory, ReportConfidence, ReportModeration, SafetyResource, Venue } from '../api';

export type StoredReport = {
  id: string;
  venueId: string;
  category: ReportCategory;
  textRedacted: string;
  confidence: ReportConfidence;
  moderation: ReportModeration;
  reportCount: number;
  expiresAt: number;
  createdAt: number;
};

export type MockState = {
  counter: number;
  venues: Venue[];
  resources: SafetyResource[];
  reports: StoredReport[];
  /** Private submitter tracking, keyed by report id. Never exposed in client objects. */
  submitters: Record<string, string[]>;
};

export const STORAGE_KEY = 'safenight.mock.reports.v1';
export const CHANNEL_NAME = 'safenight-reports';
const SRC = 'Demo seed (fictional)';

const seed = (): MockState => ({
  counter: 0,
  venues: [
    { id: 'v1', name: 'Riverside Hall', approxLat: 30.2672, approxLng: -97.7431, source: SRC, verifiedAt: null },
    { id: 'v2', name: 'The Lantern Room', approxLat: 30.2689, approxLng: -97.7405, source: SRC, verifiedAt: null },
    { id: 'v3', name: 'Copper Kettle Pub', approxLat: 30.2655, approxLng: -97.7452, source: SRC, verifiedAt: null },
    { id: 'v4', name: 'Studio 9 Dance Club', approxLat: 30.2701, approxLng: -97.7447, source: SRC, verifiedAt: null },
  ],
  resources: [
    { id: 'r1', type: 'campus_safety', name: 'North Gate Safety Desk', lat: 30.2678, lng: -97.7419, hours: 'Daily 8pm-4am', source: SRC, verifiedAt: null },
    { id: 'r2', type: 'medical', name: 'Lakeside First Aid Post', lat: 30.2664, lng: -97.7438, hours: 'Fri-Sat 9pm-3am', source: SRC, verifiedAt: null },
    { id: 'r3', type: 'transit_stop', name: 'Main St Night Bus Stop', lat: 30.2693, lng: -97.7426, hours: 'Until 2am', source: SRC, verifiedAt: null },
    { id: 'r4', type: 'pickup_point', name: 'Plaza Pickup Zone', lat: 30.2683, lng: -97.7442, hours: 'Always open', source: SRC, verifiedAt: null },
  ],
  reports: [],
  submitters: {},
});

let memory: MockState = seed();
let snapshot: MockState = memory;
const listeners = new Set<() => void>();
let channel: BroadcastChannel | null = null;
let started = false;

function readStorage(): MockState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return { ...seed(), ...(JSON.parse(raw) as Partial<MockState>) };
  } catch {
    return null;
  }
}

function refresh() {
  const s = readStorage();
  if (s) memory = s;
  snapshot = memory;
  listeners.forEach((l) => l());
}

function start() {
  if (started) return;
  started = true;
  const s = readStorage();
  if (s) {
    memory = s;
    snapshot = s;
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

export function subscribe(l: () => void): () => void {
  start();
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function getSnapshot(): MockState {
  start();
  return snapshot;
}

export function mutate<T>(fn: (s: MockState, nextId: () => string) => T): T {
  start();
  const fresh = readStorage() ?? memory;
  const draft = JSON.parse(JSON.stringify(fresh)) as MockState;
  const result = fn(draft, () => 'rep' + ++draft.counter);
  memory = draft;
  snapshot = draft;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    /* in-memory fallback */
  }
  try {
    channel?.postMessage({ t: Date.now() });
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
  return result;
}
