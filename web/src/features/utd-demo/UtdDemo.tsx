// UT Dallas demo mode: a self-contained, scripted walkthrough of every SafeNight feature with
// simulated people. No SpacetimeDB connection; timers drive a pure state machine (machine.ts).
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { distanceM, type LatLng } from '../meetup/geo';
import { initialState, nextAuto, nextManual, reduce, type DemoAction, type DemoState } from './machine';
import { fetchWalkingRoute, pointAlong, routeLength, type Route } from './routing';
import { ARRIVE_WITHIN_M, PEOPLE, REASONING, type PersonId } from './scenario';
import { useLivePeople, useMyGps, useNow, type LivePos, type MyGps } from './live';
import { GroupTab, HelpTab, MapTab, MessagesTab } from './tabs';
import './utd-demo.css';

export type TabId = 'group' | 'map' | 'messages' | 'help';
export type MapMode = 'map' | 'compass';

export type DemoCtx = {
  s: DemoState;
  dispatch: (a: DemoAction) => void;
  now: number;
  me: MyGps & { pos: LatLng; walking: boolean };
  people: Record<PersonId, LivePos>;
  mayaPos: LatLng;
  distToMaya: number;
  route: Route | null;
  routeState: 'idle' | 'loading' | 'ready';
  requestRoute: () => void;
  walk: { active: boolean; meters: number };
  setWalking: (on: boolean) => void;
  typed: number;
  autoplay: boolean;
  setAutoplay: (on: boolean) => void;
  triggerNext: () => void;
  restart: () => void;
  go: (tab: TabId, mode?: MapMode) => void;
  mapMode: MapMode;
  setMapMode: (m: MapMode) => void;
};

const WALK_SPEEDUP = 5; // simulated walk: 5× walking pace so a 400 m route takes about a minute
const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'group', label: 'Group', icon: '👥' },
  { id: 'map', label: 'Map', icon: '🗺️' },
  { id: 'messages', label: 'Messages', icon: '💬' },
  { id: 'help', label: 'Help', icon: '🛟' },
];

export function UtdDemo({ onExit }: { onExit: () => void }) {
  const [s, rawDispatch] = useReducer(reduce, undefined, initialState);
  const dispatch = useCallback((a: DemoAction) => rawDispatch('now' in a ? { ...a, now: a.now || Date.now() } : a), []);
  const [tab, setTab] = useState<TabId>('group');
  const [mapMode, setMapMode] = useState<MapMode>('map');
  const [autoplay, setAutoplay] = useState(true);
  const now = useNow(1000);
  const gps = useMyGps();

  // Scripted timeline.
  useEffect(() => {
    if (!autoplay) return;
    const n = nextAuto(s);
    if (!n) return;
    const t = window.setTimeout(() => dispatch({ type: 'event', key: n.key, now: Date.now() }), n.delay);
    return () => window.clearTimeout(t);
  }, [s, autoplay, dispatch]);

  // Streamed Nemotron reasoning (≈12 ms per character), then show the options.
  const [typed, setTyped] = useState(0);
  useEffect(() => {
    if (s.phase !== 'thinking' || s.thinkAt === null) {
      setTyped(s.thinkAt === null ? 0 : REASONING.length);
      return;
    }
    const start = s.thinkAt;
    const t = window.setInterval(() => {
      const n = Math.min(REASONING.length, Math.floor((Date.now() - start) / 12));
      setTyped(n);
      if (n >= REASONING.length) {
        window.clearInterval(t);
        window.setTimeout(() => dispatch({ type: 'event', key: 'options', now: Date.now() }), 400);
      }
    }, 40);
    return () => window.clearInterval(t);
  }, [s.phase, s.thinkAt, dispatch]);

  // Live friends. Jordan walks to Maya once he says he's coming; Maya stays put until she heads home.
  const done = s.done;
  const mayaHome = PEOPLE.find((p) => p.id === 'maya')!.home;
  const goals = useMemo(() => {
    const g: Partial<Record<PersonId, LatLng>> = {};
    if (done.includes('jordan_reply') && !done.includes('maya_home')) g.jordan = { lat: mayaHome.lat + 0.00012, lng: mayaHome.lng + 0.0001 };
    if (done.includes('maya_home')) g.maya = { lat: 32.9906, lng: -96.7533 }; // into Residence Hall West
    return g;
  }, [done, mayaHome]);
  const people = useLivePeople(goals, done.includes('alert') && !done.includes('maya_home') ? ['maya'] : []);
  const mayaPos = people.maya.pos;

  // Route and simulated walk.
  const [route, setRoute] = useState<Route | null>(null);
  const [routeState, setRouteState] = useState<'idle' | 'loading' | 'ready'>('idle');
  const [walk, setWalk] = useState({ active: false, meters: 0 });
  const mePos = route && walk.meters > 0 ? pointAlong(route.coords, walk.meters) : gps.pos;
  const meRef = useRef(mePos);
  meRef.current = mePos;
  const mayaRef = useRef(mayaPos);
  mayaRef.current = mayaPos;
  const abort = useRef<AbortController | null>(null);
  const requestRoute = useCallback(() => {
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    setRouteState('loading');
    setWalk({ active: false, meters: 0 });
    fetchWalkingRoute(meRef.current, mayaRef.current, fetch, ctl.signal)
      .then((r) => {
        setRoute(r);
        setRouteState('ready');
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (s.accepted.includes('go') && routeState === 'idle') requestRoute();
  }, [s.accepted, routeState, requestRoute]);

  useEffect(() => {
    if (!walk.active || !route) return;
    const total = routeLength(route.coords);
    const t = window.setInterval(() => {
      setWalk((w) => {
        const meters = Math.min(total, w.meters + 1.4 * WALK_SPEEDUP * 0.25);
        return { active: meters < total, meters };
      });
    }, 250);
    return () => window.clearInterval(t);
  }, [walk.active, route]);

  const distToMaya = distanceM(mePos, mayaPos);
  useEffect(() => {
    if (distToMaya <= ARRIVE_WITHIN_M && (s.phase === 'responding' || (s.phase === 'options' && s.accepted.includes('go')))) {
      dispatch({ type: 'arrive', now: Date.now() });
      setWalk((w) => ({ ...w, active: false }));
    }
  }, [distToMaya, s.phase, s.accepted, dispatch]);

  // Alert toast + vibration, once per alert.
  const [toast, setToast] = useState<string | null>(null);
  const lastAlert = useRef(0);
  useEffect(() => {
    if (s.alertSeq > lastAlert.current) {
      lastAlert.current = s.alertSeq;
      setToast('Maya needs help near the Residence Hall West lot');
      try {
        navigator.vibrate?.([220, 120, 220]);
      } catch {
        /* not supported */
      }
      const t = window.setTimeout(() => setToast(null), 8000);
      return () => window.clearTimeout(t);
    }
  }, [s.alertSeq]);

  const restart = () => {
    abort.current?.abort();
    dispatch({ type: 'restart' });
    setRoute(null);
    setRouteState('idle');
    setWalk({ active: false, meters: 0 });
    setToast(null);
    lastAlert.current = 0;
    setTab('group');
    setMapMode('map');
  };
  const triggerNext = () => {
    const a = nextManual(s);
    if (a) dispatch({ ...a, now: Date.now() } as DemoAction);
  };
  const go = (t: TabId, mode?: MapMode) => {
    setTab(t);
    if (mode) setMapMode(mode);
  };

  const ctx: DemoCtx = {
    s,
    dispatch,
    now,
    me: { ...gps, pos: mePos, walking: walk.meters > 0 },
    people,
    mayaPos,
    distToMaya,
    route,
    routeState,
    requestRoute,
    walk,
    setWalking: (on) => setWalk((w) => ({ ...w, active: on })),
    typed,
    autoplay,
    setAutoplay,
    triggerNext,
    restart,
    go,
    mapMode,
    setMapMode,
  };

  const unread = s.unread.group + s.unread.maya;
  const helpDot = s.phase !== 'intro' && s.phase !== 'resolved';

  return (
    <div className="utd">
      <header className="utd-top">
        <div className="utd-top-row">
          <div>
            <p className="brand-label">SAFENIGHT</p>
            <h1 className="utd-title">{TABS.find((t) => t.id === tab)!.label}</h1>
          </div>
          <button type="button" className="btn plain small-btn" onClick={onExit}>
            Exit demo
          </button>
        </div>
        <span className="utd-pill" role="note">
          DEMO · simulated people · UT Dallas
        </span>
      </header>

      {toast && (
        <button
          type="button"
          className="utd-toast"
          role="alert"
          onClick={() => {
            setToast(null);
            setTab('help');
          }}
        >
          <span className="utd-toast-icon" aria-hidden="true">🚨</span>
          <span>
            <strong>{toast}</strong>
            <span className="utd-toast-sub">Tap to see what Nemotron suggests</span>
          </span>
        </button>
      )}

      <main className="utd-content">
        <div className="sn-screen" key={tab}>
          {tab === 'group' ? <GroupTab ctx={ctx} /> : tab === 'map' ? <MapTab ctx={ctx} /> : tab === 'messages' ? <MessagesTab ctx={ctx} /> : <HelpTab ctx={ctx} />}
        </div>
      </main>

      <nav className="utd-tabbar" aria-label="Demo sections">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={t.id === tab ? 'utd-tab active' : 'utd-tab'} aria-current={t.id === tab ? 'page' : undefined} onClick={() => setTab(t.id)}>
            <span className="utd-tab-icon" aria-hidden="true">
              {t.icon}
              {t.id === 'messages' && unread > 0 && <span className="utd-badge">{unread}</span>}
              {t.id === 'help' && helpDot && <span className="utd-badge utd-badge--dot" />}
            </span>
            <span className="utd-tab-label">
              {t.label}
              {t.id === 'messages' && unread > 0 && <span className="sr-only">, {unread} unread</span>}
            </span>
          </button>
        ))}
      </nav>
    </div>
  );
}
