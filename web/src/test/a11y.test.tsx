import { act, fireEvent, render, waitFor, type RenderResult } from '@testing-library/react';
import axe from 'axe-core';
import { useEffect, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentMockProvider } from '../features/agent/mock';
import { useAgent, type AgentApi } from '../features/agent/api';
import { DemoPanel } from '../features/demo-panel';
import { NightOutMockProvider } from '../features/night-out/mock';
import { useNightOut, type NightOutApi } from '../features/night-out/api';
import { ProfileMockProvider } from '../features/profile/mock';
import { ReportsMockProvider } from '../features/reports/mock';
import { SafetyMockProvider } from '../features/safety/mock';
import { useSafety, type SafetyApi } from '../features/safety/api';
import { NoDrivingBanner, StatusBar } from '../features/status';
import { InboxScreen } from '../screens/inbox';
import { IncidentScreen } from '../screens/incident';
import { MapScreen } from '../screens/map';
import { NightOutTab } from '../screens/night-out';
import { ProfileScreen } from '../screens/profile';
import { ReportsScreen } from '../screens/reports';

type Apis = { no: NightOutApi; safety: SafetyApi; agent: AgentApi };
const live: { apis: Apis | null } = { apis: null };

function Probe() {
  const no = useNightOut();
  const safety = useSafety();
  const agent = useAgent();
  useEffect(() => {
    live.apis = { no, safety, agent };
  });
  return null;
}

function Stack({ me, name, children }: { me: string; name: string; children?: ReactNode }) {
  return (
    <NightOutMockProvider me={me} displayName={name}>
      <SafetyMockProvider>
        <AgentMockProvider>
          <ReportsMockProvider me={me}>
            <ProfileMockProvider me={me} displayName={name}>
              <Probe />
              {children}
            </ProfileMockProvider>
          </ReportsMockProvider>
        </AgentMockProvider>
      </SafetyMockProvider>
    </NightOutMockProvider>
  );
}

const renderAs = (me: string, name: string, ui: ReactNode): RenderResult =>
  render(
    <Stack me={me} name={name}>
      <main>{ui}</main>
    </Stack>,
  );

async function audit(label: string, r: RenderResult) {
  expect(r.container.textContent?.length, `${label} rendered nothing`).toBeGreaterThan(20);
  const res = await axe.run(r.container, { rules: { 'color-contrast': { enabled: false } } });
  const fmt = (v: axe.Result) =>
    `${label}: [${v.impact}] ${v.id} - ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(' | ')})`;
  for (const v of res.violations.filter((x) => x.impact !== 'serious' && x.impact !== 'critical')) {
    console.log('a11y (non-blocking)', fmt(v));
  }
  expect(res.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map(fmt)).toEqual([]);
}

/** Alex sets up the demo group and raises a concern about Sam; the mock store is shared across personas. */
async function seedIncident(): Promise<string> {
  const r = renderAs('alex', 'Alex', null);
  await act(async () => {
    await live.apis!.agent.demo.setupGroup();
  });
  await waitFor(() => expect(live.apis!.safety.sessionId).not.toBeNull());
  await act(async () => {
    await live.apis!.safety.actions.reportConcern('sam', 'possible_consumption', 'seems unsteady');
  });
  await waitFor(() => expect(live.apis!.safety.incidents.length).toBeGreaterThan(0));
  const id = live.apis!.safety.incidents[0].id;
  r.unmount();
  return id;
}

beforeEach(() => {
  live.apis = null;
});

describe('axe: screens in mock provider stack', () => {
  it('Night Out start', async () => {
    await audit('night-out-start', renderAs('alex', 'Alex', <NightOutTab />));
  });

  it('Night Out session', async () => {
    const r = renderAs('alex', 'Alex', <NightOutTab />);
    const now = Date.now();
    await act(async () => {
      await live.apis!.no.actions.createSession({
        name: 'Test night',
        venueHint: 'Downtown',
        startsAt: now,
        expiresAt: now + 4 * 3600_000,
        checkinIntervalMinutes: 30,
      });
    });
    await waitFor(() => expect(live.apis!.no.mySessions.length).toBe(1));
    const open = r.getAllByRole('button').find((b) => /test night/i.test(b.textContent ?? ''));
    if (open) fireEvent.click(open);
    await audit('night-out-session', r);
  });

  it('Map + StatusBar', async () => {
    await seedIncident();
    await audit(
      'map',
      renderAs(
        'alex',
        'Alex',
        <>
          <StatusBar />
          <MapScreen />
        </>,
      ),
    );
  });

  it('Inbox and Incident as sam and alex', async () => {
    const id = await seedIncident();
    for (const [me, name] of [
      ['sam', 'Sam'],
      ['alex', 'Alex'],
    ] as const) {
      const a = renderAs(me, name, <InboxScreen />);
      await audit(`inbox-${me}`, a);
      a.unmount();
      const b = renderAs(me, name, <IncidentScreen incidentId={id} onBack={() => {}} />);
      await audit(`incident-${me}`, b);
      b.unmount();
    }
  });

  it('Reports', async () => {
    await audit('reports', renderAs('alex', 'Alex', <ReportsScreen />));
  });

  it('Profile + DemoPanel', async () => {
    await audit(
      'profile',
      renderAs(
        'alex',
        'Alex',
        <>
          <ProfileScreen />
          <DemoPanel />
        </>,
      ),
    );
  });

  it('NoDrivingBanner with an alert', async () => {
    await seedIncident();
    const r = renderAs('sam', 'Sam', <NoDrivingBanner onViewIncident={() => {}} />);
    await waitFor(() => expect(r.container.querySelector('[role="alert"]')).not.toBeNull());
    await audit('banner', r);
  });
});

describe('accessible names', () => {
  it('every button, input, select, textarea, link has a name', async () => {
    await seedIncident();
    const r = renderAs(
      'sam',
      'Sam',
      <>
        <NoDrivingBanner onViewIncident={() => {}} />
        <StatusBar />
        <MapScreen />
        <InboxScreen />
        <ReportsScreen />
        <ProfileScreen />
        <DemoPanel />
        <NightOutTab />
      </>,
    );
    const unnamed: string[] = [];
    r.container.querySelectorAll('button, input, select, textarea, a[href]').forEach((el) => {
      const labels = (el as HTMLInputElement).labels
        ? Array.from((el as HTMLInputElement).labels!).map((l) => l.textContent).join('')
        : '';
      const name =
        (el.getAttribute('aria-label') ?? '') +
        (el.textContent ?? '') +
        labels +
        (el.getAttribute('aria-labelledby') ?? '') +
        (el.getAttribute('title') ?? '');
      if (!name.trim()) unnamed.push(el.outerHTML.slice(0, 120));
    });
    expect(unnamed).toEqual([]);
  });
});

describe('hold-to-confirm keyboard', () => {
  async function setup() {
    const r = renderAs('alex', 'Alex', <StatusBar />);
    await act(async () => {
      await live.apis!.agent.demo.setupGroup();
    });
    await waitFor(() => expect(live.apis!.safety.sessionId).not.toBeNull());
    const spy = vi.spyOn(live.apis!.safety.actions, 'checkIn');
    const btn = r.getByRole('button', { name: /hold for emergency/i });
    vi.useFakeTimers();
    return { spy, btn };
  }
  afterEach(() => {
    vi.useRealTimers();
  });

  it('Space held 1.5s triggers emergency check-in', async () => {
    const { spy, btn } = await setup();
    fireEvent.keyDown(btn, { key: ' ' });
    await act(async () => {
      vi.advanceTimersByTime(1700);
    });
    fireEvent.keyUp(btn, { key: ' ' });
    expect(spy).toHaveBeenCalledWith('emergency', '');
  });

  it('early keyup cancels', async () => {
    const { spy, btn } = await setup();
    fireEvent.keyDown(btn, { key: ' ' });
    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    fireEvent.keyUp(btn, { key: ' ' });
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(spy).not.toHaveBeenCalled();
  });
});
