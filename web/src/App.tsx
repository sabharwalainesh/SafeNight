import { useEffect, useState } from 'react';
import { SenderError } from 'spacetimedb';
import { useReducer, useSpacetimeDB, useTable } from 'spacetimedb/react';
import { reducers, tables } from './module_bindings';
import { PERSONAS, personaHref, type Persona } from './personas';
import { relativeTime, shortIdentity } from './lib/format';
import { CurrentSessionProvider } from './features/night-out/currentSession';
import { NightOutProvider } from './features/night-out/NightOutProvider';
import { AgentProvider } from './features/agent/AgentProvider';
import { DemoPanel } from './features/demo-panel';
import { ProfileMockProvider } from './features/profile/mock';
import { ReportsMockProvider } from './features/reports/mock';
import { SafetyProvider } from './features/safety/SafetyProvider';
import { NoDrivingBanner, StatusBar } from './features/status';
import { InboxScreen } from './screens/inbox';
import { MapScreen } from './screens/map';
import { NightOutTab } from './screens/night-out';
import { ProfileScreen } from './screens/profile';
import { ReportsScreen } from './screens/reports';

type TabId = 'night' | 'map' | 'reports' | 'inbox' | 'profile';

const TABS: { id: TabId; label: string; icon: string; chunk: string; blurb: string }[] = [
  { id: 'night', label: 'Night Out', icon: '◐', chunk: 'C1', blurb: 'Create or join a Night Out, roster, roles, driver acceptance, consent.' },
  { id: 'map', label: 'Map', icon: '◎', chunk: 'C2', blurb: 'Consented friend locations, staleness, status actions, warnings.' },
  { id: 'reports', label: 'Reports', icon: '▤', chunk: 'C4', blurb: 'Venue-level observations with freshness and moderation labels.' },
  { id: 'inbox', label: 'Inbox', icon: '✉', chunk: 'C2', blurb: 'Alerts, acknowledgments, incident updates, agent receipts.' },
  { id: 'profile', label: 'Profile', icon: '●', chunk: 'C4', blurb: 'Trusted contacts, backup ladder, privacy defaults, data controls.' },
];

type Props = { persona: Persona; host: string; dbName: string };

export default function App({ persona, host, dbName }: Props) {
  const [tab, setTab] = useState<TabId>('night');
  // Incident to open when jumping to the Inbox from a warning banner; the key remounts the Inbox.
  const [inboxTarget, setInboxTarget] = useState<{ id: string; n: number } | null>(null);
  const openIncident = (id: string) => {
    setInboxTarget(prev => ({ id, n: (prev?.n ?? 0) + 1 }));
    setTab('inbox');
  };
  const { isActive, identity, connectionError } = useSpacetimeDB();

  const connState: 'connected' | 'connecting' | 'disconnected' = isActive
    ? 'connected'
    : connectionError
      ? 'disconnected'
      : 'connecting';

  return (
    <div className="app" style={{ ['--accent' as string]: persona.accent }}>
      <header className="topbar">
        <div className="wordmark" aria-label="SafeNight">
          SafeNight
        </div>
        <div className="topbar-right">
          <ConnectionBadge state={connState} error={connectionError} />
          <PersonaChip persona={persona} identityText={shortIdentity(identity)} />
        </div>
      </header>

      {/* Night Out, Safety and Agent can run live (VITE_NIGHTOUT_SOURCE / VITE_SAFETY_SOURCE / VITE_AGENT_SOURCE=live); reports and profile are mocks until their bindings land. */}
      <NightOutProvider persona={persona}>
      <CurrentSessionProvider>
      <SafetyProvider>
      <AgentProvider>
      <ReportsMockProvider me={persona.id}>
      <ProfileMockProvider me={persona.id} displayName={persona.name}>
      <main className="content">
        <NoDrivingBanner onViewIncident={openIncident} />
        <RuntimeStrip />
        <OnlineCard />
        <PingCard persona={persona} connected={isActive} />
        {tab === 'night' ? (
          <NightOutTab />
        ) : tab === 'map' ? (
          <>
            <StatusBar />
            <MapScreen />
          </>
        ) : tab === 'inbox' ? (
          <InboxScreen key={inboxTarget?.n ?? 0} initialIncidentId={inboxTarget?.id} />
        ) : tab === 'reports' ? (
          <ReportsScreen />
        ) : tab === 'profile' ? (
          <>
            <ProfileScreen />
            <DemoPanel />
          </>
        ) : (
          <TabPanel tab={tab} />
        )}
        <p className="muted small">
          Server {host} · database {dbName}
        </p>
      </main>
      </ProfileMockProvider>
      </ReportsMockProvider>
      </AgentProvider>
      </SafetyProvider>
      </CurrentSessionProvider>
      </NightOutProvider>

      <nav className="tabbar" aria-label="Primary">
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            className={t.id === tab ? 'tab active' : 'tab'}
            aria-current={t.id === tab ? 'page' : undefined}
            onClick={() => setTab(t.id)}
          >
            <span aria-hidden="true" className="tab-icon">
              {t.icon}
            </span>
            <span className="tab-label">{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

function ConnectionBadge({ state, error }: { state: 'connected' | 'connecting' | 'disconnected'; error?: Error }) {
  const label = state === 'connected' ? 'Connected' : state === 'connecting' ? 'Connecting…' : 'Disconnected';
  return (
    <span className={`conn conn-${state}`} role="status" title={error?.message ?? label}>
      <span aria-hidden="true" className="dot" />
      {label}
    </span>
  );
}

function PersonaChip({ persona, identityText }: { persona: Persona; identityText: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="persona-wrap">
      <button
        type="button"
        className="chip persona-chip"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Current persona ${persona.name}, ${persona.roleHint}. Switch persona`}
        onClick={() => setOpen(o => !o)}
      >
        <span className="swatch" aria-hidden="true" />
        <span>
          <strong>{persona.name}</strong> <span className="muted small">{identityText}</span>
        </span>
      </button>
      {open && (
        <ul className="menu" role="menu" aria-label="Switch persona">
          {PERSONAS.map(p => (
            <li key={p.id} role="none">
              <a
                role="menuitem"
                href={personaHref(p.id)}
                aria-current={p.id === persona.id ? 'true' : undefined}
                style={{ ['--accent' as string]: p.accent }}
              >
                <span className="swatch" aria-hidden="true" />
                <span>
                  <strong>{p.name}</strong>
                  <br />
                  <span className="muted small">{p.roleHint}</span>
                </span>
                {p.id === persona.id && <span className="muted small">(you)</span>}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RuntimeStrip() {
  const [rows, ready] = useTable(tables.runtimeStatus);
  const status = rows[0];
  if (!ready || !status) {
    return (
      <div className="strip" aria-busy="true">
        <span className="badge">Loading backend status…</span>
      </div>
    );
  }
  const nemotronLive = status.nemotronMode === 'live';
  const messagingLive = status.messagingMode === 'live';
  return (
    <div className="strip" role="group" aria-label="Backend status">
      <span className={nemotronLive ? 'badge live' : 'badge sim'}>
        Nemotron: {status.nemotronMode} <span className="muted">({status.nemotronModel})</span>
      </span>
      <span className={messagingLive ? 'badge live' : 'badge sim'}>Messaging: {status.messagingMode}</span>
      <span className="badge">env: {status.appEnv}</span>
      <span className="badge muted">module {status.moduleVersion}</span>
    </div>
  );
}

function OnlineCard() {
  const [members, ready] = useTable(tables.onlineMembers);
  const now = useNow(15_000);
  return (
    <section className="card" aria-labelledby="online-heading">
      <h2 id="online-heading">
        Online now <span className="count">{ready ? members.length : '…'}</span>
      </h2>
      {!ready ? (
        <p className="muted">Subscribing…</p>
      ) : members.length === 0 ? (
        <p className="muted">Nobody connected.</p>
      ) : (
        <ul className="list">
          {members.map(m => (
            <li key={m.identity.toHexString()}>
              <code>{shortIdentity(m.identity)}</code>
              <span className="muted small">
                {m.connectionCount} conn · seen {relativeTime(m.lastSeenAt, now)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PingCard({ persona, connected }: { persona: Persona; connected: boolean }) {
  const ping = useReducer(reducers.ping);
  const [result, setResult] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const onPing = async () => {
    setBusy(true);
    setResult(null);
    try {
      await ping({ note: `ping from ${persona.id}` });
      setResult({ kind: 'ok', text: `Backend acknowledged ping from ${persona.name}.` });
    } catch (err) {
      const text =
        err instanceof SenderError
          ? `Rejected: ${err.message}`
          : `Failed: ${err instanceof Error ? err.message : String(err)}`;
      setResult({ kind: 'err', text });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card" aria-labelledby="ping-heading">
      <h2 id="ping-heading">Backend check</h2>
      <p className="muted small">Calls the <code>ping</code> reducer, which writes an audit row.</p>
      <button type="button" className="btn" onClick={onPing} disabled={!connected || busy}>
        {busy ? 'Pinging…' : 'Ping backend'}
      </button>
      {result && (
        <p className={result.kind === 'ok' ? 'result ok' : 'result err'} role="status">
          {result.kind === 'ok' ? '✓ ' : '✕ '}
          {result.text}
        </p>
      )}
    </section>
  );
}

function TabPanel({ tab }: { tab: TabId }) {
  const t = TABS.find(x => x.id === tab)!;
  return (
    <section className="card placeholder" aria-live="polite">
      <h2>{t.label}</h2>
      <p>{t.blurb}</p>
      <p className="muted small">Arrives in chunk {t.chunk}.</p>
    </section>
  );
}

/** Re-render on an interval so relative times stay fresh. */
function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
