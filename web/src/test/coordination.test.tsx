import { render, screen, waitFor } from '@testing-library/react';
import axe from 'axe-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CoordinationPanel } from '../features/coordination';
import { buildSnapshot } from '../features/coordination/snapshot';
import { useCoordination } from '../features/coordination/useCoordination';
import type { Incident, IncidentEvent } from '../features/safety/api';

const incident: Incident = {
  id: 'i1',
  sessionId: 's1',
  subject: 'u-maya',
  subjectName: 'Maya',
  kind: 'help_requested',
  severity: 'urgent',
  status: 'open',
  openedBy: 'u-maya',
  openedAt: 1000,
  resolvedAt: null,
  resolvedBy: null,
  participants: [
    { userId: 'u-maya', displayName: 'Maya', role: 'subject', acknowledgedAt: null },
    { userId: 'u-x', displayName: 'Pat', role: 'buddy', acknowledgedAt: 2000 },
  ],
};
const ev = (detail: string): IncidentEvent => ({
  id: 'e', incidentId: 'i1', at: 5000, actor: 'u-maya', actorName: 'Maya', kind: 'opened', detail, simulated: false,
});

describe('buildSnapshot', () => {
  const base = { incident, roster: null, locations: [], myCheckins: [], me: 'u-maya' };
  it('maps personas, truncates details, uses myLocation for the subject', () => {
    const s = buildSnapshot({
      ...base,
      timeline: [ev('x'.repeat(500))],
      myLocation: { userId: 'u-maya', displayName: 'Maya', lat: 1, lng: 2, accuracyM: 5, recordedAt: 3000, source: 'device', approximate: true, isStale: false },
    }).incident;
    expect(s.subjectPersonaId).toBe('maya');
    expect(s.participants.map(p => p.personaId)).toEqual(['maya', 'u-x']);
    expect(s.participants[1].acknowledged).toBe(true);
    expect(s.events[0].detail).toHaveLength(280);
    expect(s.lastLocation).toMatchObject({ lat: 1, lng: 2, approximate: true });
  });
  it('has no location when none is visible', () => {
    expect(buildSnapshot({ ...base, timeline: [], myLocation: null, me: 'u-other' }).incident.lastLocation).toBeNull();
  });
});

function Probe() {
  const c = useCoordination('i1');
  return <p>{c.enabled ? 'on' : 'off'}</p>;
}

describe('coordination', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('is disabled without VITE_BRIDGE_URL', () => {
    vi.stubEnv('VITE_BRIDGE_URL', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { container } = render(<><Probe /><CoordinationPanel incidentId="i1" /></>);
    expect(screen.getByText('off')).toBeTruthy();
    expect(container.querySelector('.coord-panel')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('renders decisions and the simulated dispatch label; no axe violations', async () => {
    vi.stubEnv('VITE_BRIDGE_URL', 'http://bridge.test');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      decisions: [{
        id: 'd1', at: '2026-01-01T00:00:00Z', model: 'sim', simulated: true, reasoning: 'Maya asked for help.',
        actions: [
          { id: 'a1', type: 'text_group', target: 'group', status: 'sent', detail: '', simulated: true },
          { id: 'a2', type: 'call_person', target: 'Sam', status: 'blocked', detail: 'no consent', simulated: true },
          { id: 'a3', type: 'dispatch_call', target: 'demo', status: 'in_progress', detail: '', simulated: true },
        ],
      }],
      dispatch: { status: 'in_progress', summary: 'Help requested', transcriptSummary: 'Line answered', simulated: true },
    }), { status: 200 })));
    const { container } = render(<CoordinationPanel incidentId="i1" />);
    await waitFor(() => expect(screen.getByText('Text to friends')).toBeTruthy());
    expect(screen.getByText('Call Sam')).toBeTruthy();
    expect(screen.getByText('Blocked: no consent')).toBeTruthy();
    expect(screen.getByText('Calling…')).toBeTruthy();
    expect(screen.getByText('SIMULATED planner')).toBeTruthy();
    expect(screen.getByText('SIMULATED DISPATCH — demo number, not emergency services')).toBeTruthy();
    expect(screen.getByText(/Why: Maya asked for help/)).toBeTruthy();
    const r = await axe.run(container);
    expect(r.violations).toEqual([]);
  });
});
