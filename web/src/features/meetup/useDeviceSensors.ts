// Device sensors: GPS (Geolocation API) for everyone in a group, heading (DeviceOrientation) for the compass.
// iOS Safari needs an explicit, user-gesture permission request for orientation; Geolocation prompts on first use.
import { useCallback, useEffect, useRef, useState } from 'react';
import { distanceM, headingFromEvent, smoothHeading, type LatLng } from './geo';

export type GeoState = {
  position: (LatLng & { accuracyM: number; at: number }) | null;
  /** Direction of travel from GPS (degrees from north) while moving; a heading fallback when there is no compass. */
  course: number | null;
  error: string | null;
  /** 'granted' once a fix arrived; 'denied' when the browser refused; 'unavailable' without the API. */
  permission: 'prompt' | 'granted' | 'denied' | 'unavailable';
};

type Poster = (lat: number, lng: number, accuracyM: number, source: 'device' | 'simulated') => Promise<void>;

/**
 * While `active`, watch the real position and post it: at most every `intervalMs`, and only when we
 * moved more than a couple of metres or `maxQuietMs` passed (so a still phone stays under the server's
 * per-minute limit while a walking one updates every interval). No simulation: without a fix the
 * caller shows the permission status instead.
 */
export function useGeolocation(
  active: boolean,
  post: Poster,
  intervalMs = 2000,
  maxQuietMs = 15000,
): GeoState & { requestLocation: () => void } {
  const [state, setState] = useState<GeoState>({
    position: null,
    course: null,
    error: null,
    permission: typeof navigator !== 'undefined' && 'geolocation' in navigator ? 'prompt' : 'unavailable',
  });
  const lastPost = useRef<{ at: number; lat: number; lng: number } | null>(null);
  const postRef = useRef(post);
  postRef.current = post;
  const [attempt, setAttempt] = useState(0);
  // From a user gesture: ask for one fix (this is what makes iOS show the permission prompt in some
  // home-screen web apps) and re-arm the watch.
  const requestLocation = useCallback(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      () => setAttempt((n) => n + 1),
      (err) =>
        setState((st) => ({
          ...st,
          error: err.code === err.PERMISSION_DENIED ? 'Location permission denied' : err.message,
          permission: err.code === err.PERMISSION_DENIED ? 'denied' : st.permission,
        })),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }, []);

  useEffect(() => {
    if (!active) return;
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return;
    let cancelled = false;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (cancelled) return;
        const { latitude, longitude, accuracy, heading: course, speed } = pos.coords;
        const moving = typeof speed === 'number' && speed > 0.7 && typeof course === 'number' && !Number.isNaN(course);
        setState((st) => ({
          position: { lat: latitude, lng: longitude, accuracyM: accuracy, at: pos.timestamp },
          course: moving ? course : st.course,
          error: null,
          permission: 'granted',
        }));
        const now = Date.now();
        const last = lastPost.current;
        const movedM = last ? distanceM({ lat: last.lat, lng: last.lng }, { lat: latitude, lng: longitude }) : Infinity;
        const due = !last || now - last.at >= maxQuietMs || (now - last.at >= intervalMs && movedM >= 2);
        if (due) {
          lastPost.current = { at: now, lat: latitude, lng: longitude };
          void postRef.current(latitude, longitude, Math.round(accuracy), 'device').catch(() => {});
        }
      },
      (err) => {
        if (cancelled) return;
        setState((st) => ({
          ...st,
          error: err.code === err.PERMISSION_DENIED ? 'Location permission denied' : err.message,
          permission: err.code === err.PERMISSION_DENIED ? 'denied' : st.permission,
        }));
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 },
    );
    return () => {
      cancelled = true;
      navigator.geolocation.clearWatch(watchId);
    };
  }, [active, intervalMs, maxQuietMs, attempt]);

  return { ...state, requestLocation };
}

let primed = false;
/**
 * Call from the tap that accepts a trip: asks for orientation permission (iOS needs a gesture) and one
 * GPS fix in the same gesture, so no second prompt interrupts the compass screen.
 */
export function primeSensors(): void {
  primed = true;
  const DOE = typeof window !== 'undefined' ? (window as any).DeviceOrientationEvent : undefined; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (DOE && typeof DOE.requestPermission === 'function') void DOE.requestPermission().catch(() => {});
  if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
    navigator.geolocation.getCurrentPosition(() => {}, () => {}, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  }
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

  // Permission was requested from the accept tap: confirm it silently (no prompt when already granted).
  useEffect(() => {
    if (active && primed && !granted) void requestPermission();
  }, [active, granted, requestPermission]);

  useEffect(() => {
    if (!active || !supported || !granted) return;
    const screenAngle = () => {
      const o = (window.screen as any)?.orientation?.angle; // eslint-disable-line @typescript-eslint/no-explicit-any
      return typeof o === 'number' ? o : 0;
    };
    const onEvent = (e: DeviceOrientationEvent) => {
      const h = headingFromEvent(e as unknown as { webkitCompassHeading?: number; alpha: number | null }, screenAngle());
      if (h !== null) setHeading((prev) => smoothHeading(prev, h, 0.35));
    };
    // 'deviceorientationabsolute' gives true north on Android Chrome; iOS only fires 'deviceorientation'.
    const evName = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
    window.addEventListener(evName, onEvent as EventListener, true);
    return () => window.removeEventListener(evName, onEvent as EventListener, true);
  }, [active, supported, granted]);

  return { heading, supported, needsPermission: needsPermission && !granted, requestPermission };
}
