import { useState, type ReactNode } from 'react';
import { useSpacetimeDB } from 'spacetimedb/react';
import { PERSONAS, personaHref, type Persona } from './personas';
import { LargeTitle, Row, Section } from './ui';
import { Diagnostics } from './features/diagnostics';
import { AboutPage, LegalDoc, PRIVACY_POLICY, TERMS } from './features/legal';
import { CurrentSessionProvider } from './features/night-out/currentSession';
import { NightOutProvider } from './features/night-out/NightOutProvider';
import { AgentProvider } from './features/agent/AgentProvider';
import { DemoPanel } from './features/demo-panel';
import { InstallHint } from './features/install';
import { DemoPersonaRegistrar } from './features/demo-live';
import { PersonaMapProvider } from './features/coordination';
import { ProfileProvider } from './features/profile/ProfileProvider';
import { ReportsProvider } from './features/reports';
import { SafetyProvider } from './features/safety/SafetyProvider';
import { NoDrivingBanner, StatusBar } from './features/status';
import { InboxScreen } from './screens/inbox';
import { MapScreen } from './screens/map';
import { MeetupProvider, MeetupTracker } from './features/meetup'; // meetup feature: posts GPS while a meetup is in progress
import { NightOutTab } from './screens/night-out';
import { ProfileScreen } from './screens/profile';
import { ReportsScreen } from './screens/reports';

type TabId = 'night' | 'map' | 'inbox' | 'profile';
type SubRoute = 'reports' | 'diagnostics' | 'privacy' | 'terms' | 'about' | undefined;

const icon = (d: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    {d}
  </svg>
);
const TABS: { id: TabId; label: string; icon: ReactNode }[] = [
  { id: 'night', label: 'Tonight', icon: icon(<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />) },
  {
    id: 'map',
    label: 'Map',
    icon: icon(
      <>
        <path d="M12 21s7-6.2 7-11.5a7 7 0 1 0-14 0C5 14.8 12 21 12 21z" />
        <circle cx="12" cy="9.5" r="2.5" />
      </>,
    ),
  },
  {
    id: 'inbox',
    label: 'Alerts',
    icon: icon(
      <>
        <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z" />
        <path d="M10 21h4" />
      </>,
    ),
  },
  {
    id: 'profile',
    label: 'You',
    icon: icon(
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-4 3.5-6.5 8-6.5s8 2.5 8 6.5" />
      </>,
    ),
  },
];

type Props = { persona: Persona; host: string; dbName: string };

export default function App({ persona, host, dbName }: Props) {
  const [tab, setTab] = useState<TabId>('night');
  const [sub, setSub] = useState<SubRoute>(undefined);
  /** Tab-local router: switch tab, optionally to a sub-screen (only the You tab has any). */
  const navigate = (t: TabId, s?: SubRoute) => {
    setTab(t);
    setSub(s);
  };
  // Incident to open when jumping to the Inbox from a warning banner; the key remounts the Inbox.
  const [inboxTarget, setInboxTarget] = useState<{ id: string; n: number } | null>(null);
  const openIncident = (id: string) => {
    setInboxTarget(prev => ({ id, n: (prev?.n ?? 0) + 1 }));
    navigate('inbox');
  };
  const { isActive, connectionError } = useSpacetimeDB();

  const connState: 'connected' | 'connecting' | 'disconnected' = isActive
    ? 'connected'
    : connectionError
      ? 'disconnected'
      : 'connecting';

  return (
    <div className="app">
      <header className="topbar">
        <div><p className="brand-label">SAFENIGHT</p><LargeTitle>{TABS.find(t => t.id === tab)!.label}</LargeTitle></div>
        <div className="topbar-right">
          <PersonaChip persona={persona} />
        </div>
      </header>

      {connState !== 'connected' && <ConnectionBanner state={connState} error={connectionError} />}

      <InstallHint />

      {/* Providers are live by default; `npm run dev:mock -w web` (VITE_DATA_SOURCE=mock) runs every tab on local mocks. */}
      <NightOutProvider persona={persona}>
      <CurrentSessionProvider>
      <PersonaMapProvider>
      <SafetyProvider>
      <MeetupProvider>{/* meetup feature */}
      <AgentProvider>
      <ReportsProvider me={persona.id}>
      <ProfileProvider me={persona.id} displayName={persona.name}>
      <main className="content">
        <DemoPersonaRegistrar />
        <MeetupTracker />
        <NoDrivingBanner onViewIncident={openIncident} />
        <div className="sn-screen" key={`${tab}:${sub ?? ''}`}>
        {tab === 'night' ? (
          <NightOutTab />
        ) : tab === 'map' ? (
          <>
            <MapScreen />
            <StatusBar />
          </>
        ) : tab === 'inbox' ? (
          <InboxScreen key={inboxTarget?.n ?? 0} initialIncidentId={inboxTarget?.id} />
        ) : sub === 'reports' ? (
          <>
            <BackButton onClick={() => navigate('profile')} />
            <ReportsScreen />
          </>
        ) : sub === 'diagnostics' ? (
          <>
            <BackButton onClick={() => navigate('profile')} />
            <Diagnostics persona={persona} host={host} dbName={dbName} />
          </>
        ) : sub === 'privacy' || sub === 'terms' ? (
          <>
            <BackButton onClick={() => navigate('profile')} />
            <LegalDoc doc={sub === 'privacy' ? PRIVACY_POLICY : TERMS} />
          </>
        ) : sub === 'about' ? (
          <>
            <BackButton onClick={() => navigate('profile')} />
            <AboutPage />
          </>
        ) : (
          <>
            <ProfileScreen onOpenPrivacy={() => navigate('profile', 'privacy')} />
            <Section title="More">
              <Row label="Venue reports" chevron onClick={() => navigate('profile', 'reports')} />
              <Row label="Diagnostics" chevron onClick={() => navigate('profile', 'diagnostics')} />
            </Section>
            <Section title="Legal & safety" footer="SafeNight is not an emergency service. In immediate danger, call 911.">
              <Row label="Privacy Policy" chevron onClick={() => navigate('profile', 'privacy')} />
              <Row label="Terms of Use" chevron onClick={() => navigate('profile', 'terms')} />
              <Row label="Safety & acknowledgements" chevron onClick={() => navigate('profile', 'about')} />
            </Section>
            <DemoPanel />
          </>
        )}
        </div>
      </main>
      </ProfileProvider>
      </ReportsProvider>
      </AgentProvider>
      </MeetupProvider>
      </SafetyProvider>
      </PersonaMapProvider>
      </CurrentSessionProvider>
      </NightOutProvider>

      <nav className="tabbar" aria-label="Primary">
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            className={t.id === tab ? 'tab active' : 'tab'}
            aria-current={t.id === tab ? 'page' : undefined}
            onClick={() => navigate(t.id)}
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

function ConnectionBanner({ state, error }: { state: 'connecting' | 'disconnected' | 'connected'; error?: Error }) {
  return (
    <div className={`conn-banner conn-${state}`} role="status" title={error?.message}>
      Reconnecting…
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="btn plain back-link" onClick={onClick}>
      ‹ You
    </button>
  );
}

function PersonaChip({ persona }: { persona: Persona }) {
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
        <span className="avatar" aria-hidden="true">
          {persona.name.slice(0, 1)}
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
