// Live-feeling motion for the demo: simulated friends walk around their spots once a second,
// and "You" use real GPS when this device is on campus.
import { useEffect, useRef, useState } from 'react';
import { distanceM, stepToward, type LatLng } from '../meetup/geo';
import { NEAR_CAMPUS_M, PEOPLE, PLINTH, UTD_CENTER, type PersonId } from './scenario';

export type LivePos = { pos: LatLng; at: number };

const jitter = (p: LatLng, m: number): LatLng => {
  const a = Math.random() * Math.PI * 2;
  const r = Math.random() * m;
  return { lat: p.lat + (Math.sin(a) * r) / 111_320, lng: p.lng + (Math.cos(a) * r) / (111_320 * Math.cos((p.lat * Math.PI) / 180)) };
};

/**
 * Friends' positions, updated every second. Each friend wanders between random points near their
 * spot at walking pace; `goals` override that (e.g. Jordan heading to Maya). Maya barely moves.
 */
export function useLivePeople(goals: Partial<Record<PersonId, LatLng>>, still: PersonId[] = []): Record<PersonId, LivePos> {
  const init = () =>
    Object.fromEntries(PEOPLE.map((p) => [p.id, { pos: jitter(p.home, 10), at: Date.now() }])) as Record<PersonId, LivePos>;
  const [pos, setPos] = useState<Record<PersonId, LivePos>>(init);
  const targets = useRef<Partial<Record<PersonId, LatLng>>>({});
  const goalsRef = useRef(goals);
  goalsRef.current = goals;
  const stillRef = useRef(still);
  stillRef.current = still;

  useEffect(() => {
    const t = window.setInterval(() => {
      const now = Date.now();
      setPos((prev) => {
        const next = { ...prev };
        for (const p of PEOPLE) {
          const cur = prev[p.id].pos;
          const goal = goalsRef.current[p.id];
          if (goal) {
            next[p.id] = { pos: stepToward(cur, goal, 1.4), at: now };
            continue;
          }
          if (stillRef.current.includes(p.id)) {
            // Standing still: GPS noise of a metre or so, not a walk.
            next[p.id] = { pos: distanceM(cur, p.home) > 6 ? stepToward(cur, p.home, 1) : jitter(cur, 0.6), at: now };
            continue;
          }
          let target = targets.current[p.id];
          if (!target || distanceM(cur, target) < 2) {
            target = jitter(p.home, 28);
            targets.current[p.id] = target;
          }
          next[p.id] = { pos: stepToward(cur, target, 0.5 + Math.random() * 0.8), at: now };
        }
        return next;
      });
    }, 1000);
    return () => window.clearInterval(t);
  }, []);
  return pos;
}

export type MyGps = { pos: LatLng; accuracyM: number; source: 'gps' | 'simulated'; note: string };

/** This device's real position when it is on campus, otherwise the Plinth. */
export function useMyGps(): MyGps {
  const [fix, setFix] = useState<{ pos: LatLng; accuracyM: number } | null>(null);
  const [status, setStatus] = useState<'waiting' | 'far' | 'denied' | 'unavailable' | 'ok'>('waiting');
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setStatus('unavailable');
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const pos = { lat: p.coords.latitude, lng: p.coords.longitude };
        if (distanceM(pos, UTD_CENTER) <= NEAR_CAMPUS_M) {
          setFix({ pos, accuracyM: p.coords.accuracy });
          setStatus('ok');
        } else {
          setFix(null);
          setStatus('far');
        }
      },
      (e) => setStatus(e.code === e.PERMISSION_DENIED ? 'denied' : 'unavailable'),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);
  if (fix) return { pos: fix.pos, accuracyM: fix.accuracyM, source: 'gps', note: `Your real GPS · ±${Math.round(fix.accuracyM)} m` };
  const why =
    status === 'far'
      ? 'you are not near UT Dallas'
      : status === 'denied'
        ? 'location is blocked'
        : status === 'unavailable'
          ? 'no location service'
          : 'waiting for GPS';
  return { pos: PLINTH, accuracyM: 8, source: 'simulated', note: `Simulated at the Plinth (${why})` };
}

/** Re-render every `ms` (freshness labels). */
export function useNow(ms: number): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}

export const freshness = (at: number, now: number) => {
  const s = Math.max(0, Math.round((now - at) / 1000));
  return s <= 1 ? 'live' : s < 60 ? `${s} s ago` : `${Math.round(s / 60)} min ago`;
};
