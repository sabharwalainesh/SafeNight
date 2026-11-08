import { act, fireEvent, render, waitFor, within } from '@testing-library/react';
import { useEffect, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAgent, type AgentApi } from '../features/agent/api';
import { AgentMockProvider } from '../features/agent/mock';
import { NightOutMockProvider } from '../features/night-out/mock';
import { SafetyMockProvider } from '../features/safety/mock';
import { SPOTS } from '../features/safety/mock/spots';
import { useSafety, type SafetyApi } from '../features/safety/api';
import { StatusBar } from '../features/status';
import { MapScreen } from '../screens/map';
import { resetStores } from './helpers';

const live: { safety: SafetyApi | null; agent: AgentApi | null } = { safety: null, agent: null };

function Probe() {
  const safety = useSafety();
  const agent = useAgent();
  useEffect(() => {
    live.safety = safety;
    live.agent = agent;
  });
  return null;
}

function renderAlex(ui: ReactNode) {
  return render(
    <NightOutMockProvider me="alex" displayName="Alex">
      <SafetyMockProvider>
        <AgentMockProvider>
          <Probe />
          {ui}
        </AgentMockProvider>
      </SafetyMockProvider>
    </NightOutMockProvider>,
  );
}

describe('Times Square map', () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetStores();
  });

  it('demo setup seeds all four friends at their Times Square spots', async () => {
    const r = renderAlex(<MapScreen />);
    await act(async () => {
      await live.agent!.demo.setupGroup();
    });
    await waitFor(() => expect(live.safety!.locations.length).toBe(3));
    const all = [live.safety!.myLocation!, ...live.safety!.locations];
    for (const l of all) {
      const spot = SPOTS[l.userId];
      expect(spot).toBeDefined();
      expect(l.source).toBe('simulated');
    }
    expect(r.getByRole('list', { name: 'Locations' }).querySelectorAll('li').length).toBe(4);
    expect(r.getByText('SIMULATED LOCATIONS')).toBeTruthy();
  });

  it('focus and group scan use existing shared locations without publishing a new point', async () => {
    const r = renderAlex(<MapScreen />);
    await act(async () => { await live.agent!.demo.setupGroup(); });
    await waitFor(() => expect(live.safety!.locations.length).toBe(3));
    const post = vi.spyOn(live.safety!.actions, 'postLocation');
    const maya = within(r.getByRole('list', { name: 'Locations' })).getByRole('button', { name: /Maya/ });
    fireEvent.click(maya);
    expect(maya.getAttribute('aria-pressed')).toBe('true');
    expect(maya.textContent).toContain('Accuracy');
    fireEvent.click(r.getByRole('button', { name: 'Find my group' }));
    expect(post).not.toHaveBeenCalled();
    expect(r.getByRole('list', { name: 'Locations' }).querySelectorAll('li')).toHaveLength(4);
    post.mockRestore();
  });

  it('share my spot posts a point within jitter of the preset', async () => {
    const r = renderAlex(<MapScreen />);
    await act(async () => {
      await live.agent!.demo.setupGroup();
    });
    await waitFor(() => expect(live.safety!.sessionId).not.toBeNull());
    fireEvent.click(r.getByRole('button', { name: 'Share my spot' }));
    await waitFor(() => {
      const me = live.safety!.myLocation!;
      expect(Math.abs(me.lat - SPOTS.alex.lat)).toBeLessThanOrEqual(0.0003);
      expect(Math.abs(me.lng - SPOTS.alex.lng)).toBeLessThanOrEqual(0.0003);
    });
  });
});

describe('minimal status bar', () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetStores();
  });

  it('okay is primary; Need help opens the sheet with the options', async () => {
    const r = renderAlex(<StatusBar />);
    await act(async () => {
      await live.agent!.demo.setupGroup();
    });
    await waitFor(() => expect(live.safety!.sessionId).not.toBeNull());
    expect(r.getByRole('button', { name: "I'm okay" })).toBeTruthy();
    expect(r.queryByRole('button', { name: "I'm home" })).toBeNull();
    fireEvent.click(r.getByRole('button', { name: 'Need help' }));
    for (const n of ['Need a friend', 'Need a ride', 'Feeling unwell', 'Report a concern about someone', /hold for emergency/i])
      expect(r.getByRole('button', { name: n })).toBeTruthy();
  });
});
