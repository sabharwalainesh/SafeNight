// MOCK until C4-A bindings: shared localStorage store with cross-tab sync.
import { PERSONAS } from '../../../personas';
import type { PrivacyDefaults, TrustedContact, UserProfile } from '../api';

export type MockState = {
  counter: number;
  profiles: UserProfile[];
  contacts: TrustedContact[];
  privacy: Record<string, PrivacyDefaults>;
};

export const STORAGE_KEY = 'safenight.mock.profile.v1';
export const CHANNEL_NAME = 'safenight-profile';
const EMOJI: Record<string, string> = { sam: '🚗', alex: '🧭', maya: '🛡️', jordan: '🌙' };

const seed = (): MockState => ({
  counter: 0,
  profiles: PERSONAS.map((p) => ({
    userId: p.id,
    displayName: p.name,
    avatarEmoji: EMOJI[p.id] ?? '🙂',
    phoneVerified: false,
  })),
  contacts: [],
  privacy: {},
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
  const draft = JSON.parse(JSON.stringify(readStorage() ?? memory)) as MockState;
  const result = fn(draft, () => String(++draft.counter));
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
