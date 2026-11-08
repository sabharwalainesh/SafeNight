// Device sensors for the compass: GPS (Geolocation API) and heading (DeviceOrientation).
// iOS Safari needs an explicit, user-gesture permission request for orientation; Geolocation
// prompts on first use. Laptops usually have neither: callers fall back to simulated movement.
import { useCallback, useEffect, useRef, useState } from 'react';
import { headingFromEvent, stepToward, type LatLng } from './geo';

export type GeoState = {
  position: (LatLng & { accuracyM: number; at: number }) | null;
  error: string | null;
  /** 'granted' once a fix arrived; 'denied' when the browser refused; 'unavailable' without the API. */
  permission: 'prompt' | 'granted' | 'denied' | 'unavailable';
};

type Poster = (lat: number, lng: number, accuracyM: number, source: 'device' | 'simulated') => Promise<void>;

/**
 * While `active`, watch the real position and post it at most every `intervalMs`.
 * When no real fix is possible and `simulate` is given, nudge the simulated position 15 m toward
 * `simulate.target` every interval instead, so laptop demos still move.
 */
export function useGeolocation(
  active: boolean,
  post: Poster,
  intervalMs = 2000,
  simulate?: { from: LatLng | null; target: LatLng | null },
): GeoState & { simulated: boolean } {
  const [state, setState] = useState<GeoState>({
    position: null,
    error: null,
    permission: typeof navigator !== 'undefined' && 'geolocation' in navigator ? 'prompt' : 'unavailable',
  });
  const [simulated, setSimulated] = useState(false);
  const lastPost = useRef(0);
  const simPos = useRef<LatLng | null>(null);
  const simRef = useRef(simulate);
  simRef.current = simulate;
  const postRef = useRef(post);
  postRef.current = post;

  useEffect(() => {
    if (!active) return;
    let watchId: number | null = null;
    let timer: number | null = null;
    let cancelled = false;
    let gotFix = false;

    const startSimulation = () => {
      if (timer !== null) return;
      setSimulated(true);
      timer = window.setInterval(() => {
        const s = simRef.current;
        if (!s?.target) return;
        const from = simPos.current ?? s.from ?? s.target;
        const next = stepToward(from, s.target, 15);
        simPos.current = next;
        void postRef.current(next.lat, next.lng, 20, 'simulated').catch(() => {});
        setState((st) => ({ ...st, position: { ...next, accuracyM: 20, at: Date.now() } }));
      }, intervalMs);
    };

    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      startSimulation();
    } else {
      // If no fix arrives within 6 s (common on laptops), fall back to simulation; a later real fix takes over.
      const fallback = window.setTimeout(() => {
        if (!gotFix && !cancelled) startSimulation();
      }, 6000);
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          if (cancelled) return;
          gotFix = true;
          window.clearTimeout(fallback);
          if (timer !== null) {
            window.clearInterval(timer);
            timer = null;
            setSimulated(false);
          }
          const { latitude, longitude, accuracy } = pos.coords;
          setState({ position: { lat: latitude, lng: longitude, accuracyM: accuracy, at: pos.timestamp }, error: null, permission: 'granted' });
          const now = Date.now();
          if (now - lastPost.current >= intervalMs) {
            lastPost.current = now;
            void postRef.current(latitude, longitude, Math.round(accuracy), 'device').catch(() => {});
          }
        },
        (err) => {
          if (cancelled) return;
          window.clearTimeout(fallback);
          setState((st) => ({
            ...st,
            error: err.code === err.PERMISSION_DENIED ? 'Location permission denied' : err.message,
            permission: err.code === err.PERMISSION_DENIED ? 'denied' : st.permission,
          }));
          startSimulation();
        },
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 },
      );
    }
    return () => {
      cancelled = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      if (timer !== null) window.clearInterval(timer);
      setSimulated(false);
    };
  }, [active, intervalMs]);

  return { ...state, simulated };
}

export type HeadingState = {
  heading: number | null;
  supported: boolean;
  /** iOS 13+: orientation events need `requestPermission()` from a user gesture first. */
  needsPermission: boolean;
  requestPermission: () => Promise<boolean>;
};

export function useHeading(active: boolean): HeadingState {
  const [heading, setHeading] = useState<number | null>(null);
  const DOE = typeof window !== 'undefined' ? (window as any).DeviceOrientationEvent : undefined; // eslint-disable-line @typescript-eslint/no-explicit-any
  const supported = typeof DOE !== 'undefined';
  const [needsPermission, setNeedsPermission] = useState<boolean>(supported && typeof DOE?.requestPermission === 'function');
  const [granted, setGranted] = useState(!needsPermission);

  const requestPermission = useCallback(async () => {
    if (!DOE || typeof DOE.requestPermission !== 'function') {
      setGranted(true);
      return true;
    }
    try {
      const r = await DOE.requestPermission();
      const ok = r === 'granted';
      setGranted(ok);
      setNeedsPermission(!ok);
      return ok;
    } catch {
      return false;
    }
  }, [DOE]);

  useEffect(() => {
    if (!active || !supported || !granted) return;
    const screenAngle = () => {
      const o = (window.screen as any)?.orientation?.angle; // eslint-disable-line @typescript-eslint/no-explicit-any
      return typeof o === 'number' ? o : 0;
    };
    const onEvent = (e: DeviceOrientationEvent) => {
      const h = headingFromEvent(e as unknown as { webkitCompassHeading?: number; alpha: number | null }, screenAngle());
      if (h !== null) setHeading(h);
    };
    // 'deviceorientationabsolute' gives true north on Android Chrome; iOS only fires 'deviceorientation'.
    const evName = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
    window.addEventListener(evName, onEvent as EventListener, true);
    return () => window.removeEventListener(evName, onEvent as EventListener, true);
  }, [active, supported, granted]);

  return { heading, supported, needsPermission: needsPermission && !granted, requestPermission };
}
