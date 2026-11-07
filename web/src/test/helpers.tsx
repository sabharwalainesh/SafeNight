import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { expect, vi } from 'vitest';
import { useAgent } from '../features/agent/api';
import { AgentMockProvider } from '../features/agent/mock';
import { mutate as agentMutate } from '../features/agent/mock/store';
import { useNightOut } from '../features/night-out/api';
import { NightOutMockProvider } from '../features/night-out/mock';
import { mutate as noMutate } from '../features/night-out/mock/store';
import { useSafety } from '../features/safety/api';
import { SafetyMockProvider } from '../features/safety/mock';
import { mutate as safeMutate } from '../features/safety/mock/store';

type Clearable = Record<string, unknown>;

/** The stores keep an in-memory copy that outlives localStorage.clear(); wipe it between tests. */
export function resetStores() {
  const wipe = (s: Clearable) => {
    for (const k of Object.keys(s)) s[k] = Array.isArray(s[k]) ? [] : 0;
  };
  noMutate((s) => wipe(s as unknown as Clearable));
  safeMutate((s) => wipe(s as unknown as Clearable));
  agentMutate((s) => wipe(s as unknown as Clearable));
}

export const NAMES: Record<string, string> = { alex: 'Alex', sam: 'Sam', maya: 'Maya', jordan: 'Jordan' };

/** One "tab": the same provider stack as App, for one persona. */
export function tab(persona: string) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <NightOutMockProvider me={persona} displayName={NAMES[persona] ?? persona}>
      <SafetyMockProvider>
        <AgentMockProvider>{children}</AgentMockProvider>
      </SafetyMockProvider>
    </NightOutMockProvider>
  );
  return renderHook(() => ({ no: useNightOut(), safety: useSafety(), agent: useAgent() }), { wrapper });
}

export type Tab = ReturnType<typeof tab>;

export async function call(fn: () => Promise<unknown>) {
  await act(async () => {
    await fn();
  });
}

export async function fails(fn: () => Promise<unknown>, message: RegExp | string) {
  await act(async () => {
    await expect(fn()).rejects.toThrow(message);
  });
}

/** Advance fake time (needs vi.useFakeTimers) and flush the providers' 1s ticks. */
export async function elapse(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

export async function demoTabs() {
  const t = { alex: tab('alex'), sam: tab('sam'), maya: tab('maya'), jordan: tab('jordan') };
  await call(() => t.alex.result.current.agent.demo.setupGroup());
  return t;
}
