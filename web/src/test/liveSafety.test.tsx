import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAgent } from '../features/agent/api';
import { AgentMockProvider } from '../features/agent/mock';
import { NightOutMockProvider } from '../features/night-out/mock';
import { SafetyContext, type Incident, type SafetyApi } from '../features/safety/api';
import { getSnapshot as safeSnap } from '../features/safety/mock/store';
import { call, resetStores } from './helpers';

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  resetStores();
});
afterEach(() => {
  vi.useRealTimers();
});

const incident = (): Incident =>
  ({
    id: '77',
    sessionId: 'sess',
    subject: 'sam',
    subjectName: 'Sam',
    kind: 'help_requested',
    severity: 'elevated',
    status: 'open',
    openedBy: 'sam',
    openedAt: Date.now(),
    resolvedAt: null,
    resolvedBy: null,
    participants: [{ userId: 'sam', displayName: 'Sam', role: 'subject', acknowledgedAt: null }],
  }) as Incident;

/** Fake live SafetyContext (mocked: false); the safety mock store is never provided. */
function liveTab() {
  const checkIn = vi.fn(async () => {});
  const api = {
    me: 'sam',
    ready: true,
    mocked: false,
    sessionId: 'sess',
    locations: [],
    myLocation: null,
    myCheckins: [],
    incidents: [incident()],
    timeline: () => [],
    alerts: [],
    dismissAlert: () => {},
    actions: { checkIn },
  } as unknown as SafetyApi;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <NightOutMockProvider me="sam" displayName="Sam">
      <SafetyContext.Provider value={api}>
        <AgentMockProvider>{children}</AgentMockProvider>
      </SafetyContext.Provider>
    </NightOutMockProvider>
  );
  return { checkIn, ...renderHook(() => useAgent(), { wrapper }) };
}

describe('agent with live safety data', () => {
  it('plans from a visible incident without writing to the safety mock store', () => {
    const t = liveTab();
    const job = t.result.current.jobForIncident('77');
    expect(job).not.toBeNull();
    expect(t.result.current.latestPlan(job!.id)?.simulated).toBe(true);
    expect(safeSnap().incidents).toEqual([]);
    expect(safeSnap().events).toEqual([]);
  });

  it('turns incident status changes into receipts and confirms home via check-in', async () => {
    const t = liveTab();
    const job = t.result.current.jobForIncident('77')!;
    await call(() => t.result.current.actions.confirmHome('77'));
    expect(t.checkIn).toHaveBeenCalledWith('home', '');
    const note = t.result.current.receipts(job.id).find((r) => r.tool === 'update_incident_status');
    expect(note?.resultText).toMatch(/pending backend C3-A/);
    expect(safeSnap().incidents).toEqual([]);
    expect(safeSnap().events).toEqual([]);
  });
});
