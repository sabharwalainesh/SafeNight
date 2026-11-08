// "Come to me" UI: the helper's compass card, the requester's "X is coming" card, and the
// one-time tracker that posts GPS while a meetup is in progress.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useSafety, type VisibleLocation } from '../safety/api';
import { Section } from '../../ui';
import { ago } from '../../screens/incident/time';
import { isActiveMeetup, liveKey, useMeetups, type Meetup, type MeetupState } from './api';
import { bearingDeg, distanceM, formatDistance, fusePoint, pairUncertaintyM, predictPosition, relativeBearing, smoothToward, type Fix, type LatLng } from './geo';
import { primeSensors, useGeolocation, useHeading } from './useDeviceSensors';
import './meetup.css';

function useTick(ms: number) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => set((n) => n + 1), ms);
    return () => window.clearInterval(t);
  }, [ms]);
}

function locOf(locations: VisibleLocation[], mine: VisibleLocation | null, userId: string): VisibleLocation | null {
  if (mine && mine.userId === userId) return mine;
  return locations.find((l) => l.userId === userId) ?? null;
}

/* ------------------------------------------------------------ geo status */

type GeoStatus = { position: (LatLng & { at: number }) | null; permission: 'prompt' | 'granted' | 'denied' | 'unavailable'; accuracyM: number | null; course: number | null; error: string | null; simulated: boolean; requestLocation: () => void };
const geoStore = {
  state: { position: null, permission: 'prompt', accuracyM: null, course: null, error: null, simulated: false, requestLocation: () => {} } as GeoStatus,
  subs: new Set<() => void>(),
  set(next: GeoStatus) {
    const p = geoStore.state;
    if (p.position?.at === next.position?.at && p.permission === next.permission && p.accuracyM === next.accuracyM && p.course === next.course && p.error === next.error && p.simulated === next.simulated && p.requestLocation === next.requestLocation) return;
    geoStore.state = next;
    geoStore.subs.forEach((f) => f());
  },
  subscribe(f: () => void) {
    geoStore.subs.add(f);
    return () => void geoStore.subs.delete(f);
  },
};
function useGeoStatus(): GeoStatus {
  return useSyncExternalStore(geoStore.subscribe, () => geoStore.state);
}

/** One line about this device's own position, with an explicit button when the phone has not granted location yet. */
function MyLocationStatus() {
  const g = useGeoStatus();
  if (g.permission === 'granted' && !g.simulated) {
    return <p className="footnote">Your location: GPS{g.accuracyM !== null ? ` · ±${Math.round(g.accuracyM)} m` : ''}</p>;
  }
  return (
    <div className="meetup-geo-warn">
      <p className="footnote">
        {g.permission === 'denied'
          ? 'Location is blocked for this site. iPhone: Settings › Privacy & Security › Location Services › Safari Websites › While Using. Then tap Enable location.'
          : g.permission === 'unavailable'
            ? 'This device has no location service.'
            : 'Waiting for your location. Allow location access when the phone asks.'}
      </p>
      {g.permission !== 'unavailable' && (
        <button type="button" className="btn secondary block" onClick={() => g.requestLocation()}>
          Enable location
        </button>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- tracker */

/**
 * Mount once. While I am in a Night Out, stream my real position: every 2 s while walking during a
 * meetup, otherwise when I move (and at least every 15 s). Posting fails quietly when my sharing is off.
 */
export function MeetupTracker() {
  const mu = useMeetups();
  return mu ? <TrackerInner mu={mu} /> : null;
}
function TrackerInner({ mu: { me, meetups, actions } }: { mu: MeetupState }) {
  const safety = useSafety();
  const trips = meetups.filter((m) => isActiveMeetup(m) && (m.helper === me || m.requester === me));
  const inTrip = trips.length > 0;
  const tripIds = useRef<string[]>([]);
  tripIds.current = trips.map((m) => m.id);
  const lastSent = useRef<{ at: number; lat: number; lng: number } | null>(null);
  // Live compass stream: every fix during a trip, at most ~4/s, at least once a second while moving
  // or still (so the partner sees "live"). The regular, slower postLocation keeps feeding the map.
  const onFix = (pos: GeolocationPosition) => {
    if (!tripIds.current.length) return;
    const { latitude: lat, longitude: lng, accuracy, heading, speed } = pos.coords;
    const now = Date.now();
    const last = lastSent.current;
    if (last && now - last.at < 250) return;
    if (last && now - last.at < 1000 && distanceM(last, { lat, lng }) < 0.5) return;
    lastSent.current = { at: now, lat, lng };
    const moving = typeof speed === 'number' && speed > 0.5 && typeof heading === 'number' && !Number.isNaN(heading);
    for (const id of tripIds.current) {
      void actions
        .streamPosition(id, { lat, lng, accuracyM: Math.round(accuracy), headingDeg: moving ? heading : null, speedMps: typeof speed === 'number' && !Number.isNaN(speed) ? speed : null })
        .catch(() => {});
    }
  };
  const geo = useGeolocation(!!safety.sessionId, safety.actions.postLocation, inTrip ? 2000 : 4000, inTrip ? 4000 : 15000, onFix, inTrip ? 0 : 1000);
  useEffect(() => {
    geoStore.set({ position: geo.position ? { lat: geo.position.lat, lng: geo.position.lng, at: geo.position.at } : null, permission: geo.permission, accuracyM: geo.position?.accuracyM ?? null, course: geo.course, error: geo.error, simulated: false, requestLocation: geo.requestLocation });
  }, [geo.position, geo.permission, geo.course, geo.error, geo.requestLocation]);
  return null;
}

/* ------------------------------------------------------------ live partner */

type PartnerFix = { pos: LatLng; ageMs: number; live: boolean; approximate: boolean; accuracyM: number | null };

/**
 * Where my trip partner is right now: their streamed fix (dead-reckoned along their course between
 * updates) when the live stream has one, else their regular shared location. Re-renders every frame
 * while the smoothed position is still moving, so the arrow and distance glide instead of jumping.
 */
function useLivePartner(meetup: Meetup, partnerId: string): PartnerFix | null {
  const mu = useMeetups();
  const safety = useSafety();
  const rawFix = mu?.live[liveKey(meetup.id, partnerId)] ?? null;
  const fused = useFusedFix(rawFix ? { id: partnerId, lat: rawFix.lat, lng: rawFix.lng, accuracyM: rawFix.accuracyM, at: rawFix.recordedAt } : null);
  const fix = useMemo(
    () => (rawFix && fused ? { ...rawFix, lat: fused.lat, lng: fused.lng, accuracyM: fused.accuracyM } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rawFix?.recordedAt, rawFix?.receivedAt, fused?.lat, fused?.lng],
  );
  const shared = locOf(safety.locations, null, partnerId);
  const shown = useRef<LatLng | null>(null);
  const [, setFrame] = useState(0);
  useEffect(() => {
    if (!fix) return;
    let raf = 0;
    let prev = performance.now();
    const loop = (t: number) => {
      const target = predictPosition(fix, Date.now() - fix.receivedAt);
      const cur = shown.current ?? target;
      const next = smoothToward(cur, target, t - prev);
      prev = t;
      const moved = distanceM(cur, next);
      shown.current = next;
      if (moved > 0.01) setFrame((n) => (n + 1) % 1e6);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [fix]);
  if (fix) {
    return { pos: shown.current ?? fix, ageMs: Date.now() - fix.receivedAt, live: true, approximate: false, accuracyM: fix.accuracyM };
  }
  if (shared) return { pos: shared, ageMs: Date.now() - shared.recordedAt, live: false, approximate: shared.approximate, accuracyM: shared.accuracyM ?? null };
  return null;
}

/** "Live · 0.4 s ago" while the stream is fresh, otherwise when the location was last updated. */
function freshness(p: PartnerFix): { text: string; tone: 'live' | 'lag' | 'stale' } {
  const s = p.ageMs / 1000;
  if (p.live && s < 3) return { text: `Live · ${s < 1 ? '<1' : s.toFixed(0)} s ago`, tone: 'live' };
  if (s < 15) return { text: `Updated ${Math.round(s)} s ago`, tone: 'lag' };
  return { text: `Last seen ${ago(Date.now() - p.ageMs)}`, tone: 'stale' };
}

/** My own position for the compass: this device's latest GPS fix (not the server echo), noise-filtered. */
function useMyPosition(): Fix | null {
  const g = useGeoStatus();
  const safety = useSafety();
  const me = safety.myLocation;
  const raw = g.position
    ? { id: 'me', lat: g.position.lat, lng: g.position.lng, accuracyM: g.accuracyM ?? 20, at: g.position.at }
    : me
      ? { id: 'me', lat: me.lat, lng: me.lng, accuracyM: me.accuracyM, at: me.recordedAt }
      : null;
  return useFusedFix(raw);
}

/* ------------------------------------------------------------- map helper */

/** For the Map tab: the helper→requester pair of an active meetup I can see, or null. */
export function useMeetupLine(): { from: LatLng; to: LatLng } | null {
  const mu = useMeetups();
  const safety = useSafety();
  const g = useGeoStatus();
  const active = mu?.meetups.find((m) => isActiveMeetup(m));
  // Prefer the fast streams: my own GPS fix and the partner's live compass position.
  const pick = (userId: string): LatLng | null => {
    if (!active || !mu) return null;
    if (userId === mu.me && g.position) return g.position;
    const live = mu.live[liveKey(active.id, userId)];
    return live ?? locOf(safety.locations, safety.myLocation, userId);
  };
  const h = pick(active?.helper ?? '');
  const r = pick(active?.requester ?? '');
  const key = h && r ? `${h.lat},${h.lng},${r.lat},${r.lng}` : '';
  // Stable object identity while the coordinates are unchanged (the map effect depends on it).
  return useMemo(() => (h && r ? { from: { lat: h.lat, lng: h.lng }, to: { lat: r.lat, lng: r.lng } } : null), [key]); // eslint-disable-line react-hooks/exhaustive-deps
}

/* ---------------------------------------------------------------- panel */

/** `focused`: render the cards alone (no section chrome) for the dedicated Come-to-me screen. */
export function MeetupPanel({ incidentId, focused = false }: { incidentId: string; focused?: boolean }) {
  const mu = useMeetups();
  return mu ? <PanelInner incidentId={incidentId} mu={mu} focused={focused} /> : null;
}

/** True when this incident is a "Come to me" request (public timeline signal). */
export function useIsMeetupIncident(incidentId: string): boolean {
  const safety = useSafety();
  const incident = safety.incidents.find((i) => i.id === incidentId);
  return !!incident?.meetupWanted || safety.timeline(incidentId).some((e) => e.kind === 'company_requested');
}

function PanelInner({ incidentId, mu: { me, meetups, actions }, focused }: { incidentId: string; mu: MeetupState; focused: boolean }) {
  const safety = useSafety();
  const incident = safety.incidents.find((i) => i.id === incidentId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useTick(1000);
  if (!incident) return null;

  const mine = meetups.filter((m) => m.incidentId === incidentId);
  const active = mine.find(isActiveMeetup);
  const isRequester = incident.subject === me;
  const otherTrip = meetups.find((m) => isActiveMeetup(m) && m.helper === me && m.incidentId !== incidentId);
  const anyActiveOfMine = !!otherTrip;
  const closed = ['resolved', 'cancelled', 'handed_off'].includes(incident.status);

  const run = async (f: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await f();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  // The view row keeps `meetupWanted` private; the timeline's `company_requested` event is the public signal.
  const wanted = !!incident.meetupWanted || safety.timeline(incidentId).some((e) => e.kind === 'company_requested');
  const alreadyArrived = mine.some((m) => m.helper === me && m.status === 'arrived');
  const canOffer = !isRequester && !closed && wanted && !active && !anyActiveOfMine && !alreadyArrived;
  const recent = mine.filter((m) => !isActiveMeetup(m)).slice(0, 3);
  const blockedByOtherTrip = !isRequester && !closed && wanted && !active && !!otherTrip;
  if (!canOffer && !active && recent.length === 0 && !blockedByOtherTrip) return null;

  const body = (
    <>
      {canOffer && (
        <div className={`card meetup-card ${focused ? 'meetup-offer' : ''}`}>
          <p className="headline">{incident.subjectName} wants someone to come to them</p>
          <p className="muted">Your precise location is shared with {incident.subjectName} only until you arrive.</p>
          <button
            type="button"
            className="btn block meetup-accept"
            disabled={busy}
            onClick={() => {
              primeSensors();
              void run(() => actions.offerToCome(incidentId));
            }}
          >
            Accept &amp; navigate
          </button>
        </div>
      )}
      {blockedByOtherTrip && otherTrip && (
        <div className={`card meetup-card ${focused ? 'meetup-offer' : ''}`}>
          <p className="headline">{incident.subjectName} wants someone to come to them</p>
          <p className="muted">You are still on your way to {otherTrip.requesterName}. Finish or stop that trip first.</p>
          <button type="button" className="btn block meetup-accept" disabled={busy} onClick={() => run(() => actions.cancelMeetup(otherTrip.id, 'switched to another request'))}>
            Stop that trip
          </button>
        </div>
      )}
      {active && active.helper === me && (
        <Compass meetup={active} busy={busy} onArrived={() => run(() => actions.markArrived(active.id))} onStop={() => run(() => actions.cancelMeetup(active.id, 'helper stopped'))} />
      )}
      {active && active.helper !== me && (
        <ComingCard meetup={active} canCancel={isRequester} busy={busy} onCancel={() => run(() => actions.cancelMeetup(active.id, 'requester cancelled'))} />
      )}
      {recent.map((m) => (
        <div key={m.id} className={`card meetup-card meetup-${m.status}`}>
          {m.status === 'arrived' ? (
            <p className="headline">
              <span className="meetup-check" aria-hidden="true">✓</span> {m.helperName} arrived{m.arrivedAt ? ` · ${ago(m.arrivedAt)}` : ''}
            </p>
          ) : (
            <p className="muted">{m.helperName}&apos;s trip {m.status === 'cancelled' ? 'was cancelled' : 'expired'}</p>
          )}
        </div>
      ))}
      {error && <p role="alert" className="footnote meetup-error">{error}</p>}
    </>
  );
  if (focused) return <div className="meetup-focused">{body}</div>;
  return <Section title="Come to me">{body}</Section>;
}

function ComingCard({ meetup, canCancel, busy, onCancel }: { meetup: Meetup; canCancel: boolean; busy: boolean; onCancel: () => void }) {
  const mu = useMeetups();
  const safety = useSafety();
  const helper = useLivePartner(meetup, meetup.helper);
  const mine = useMyPosition();
  useTick(1000);
  // Requester: my own live fix. A buddy watching: the requester's shared location.
  const requesterPos = mu?.me === meetup.requester ? mine : locOf(safety.locations, null, meetup.requester);
  const dist = helper && requesterPos ? distanceM(helper.pos, requesterPos) : null;
  const f = helper ? freshness(helper) : null;
  return (
    <div className="card meetup-card">
      <p className="headline">
        {meetup.helperName} is coming
        {dist !== null && ` · ${formatDistance(dist)} away`}
      </p>
      {f && (
        <p className={`footnote meetup-live meetup-live--${f.tone}`}>
          <span className="meetup-live-dot" aria-hidden="true" /> {f.text}
        </p>
      )}
      {!helper && <p className="muted">Waiting for {meetup.helperName}&apos;s location…</p>}
      {canCancel && <MyLocationStatus />}
      {canCancel && (
        <button type="button" className="btn plain small-btn" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      )}
    </div>
  );
}

/** Smooth a person's position stream (accuracy-weighted) so the arrow does not chase GPS noise. */
function useFusedFix(raw: (Fix & { id: string }) | null): Fix | null {
  const ref = useRef<{ key: string; fix: Fix | null }>({ key: '', fix: null });
  if (!raw) {
    ref.current = { key: '', fix: null };
    return null;
  }
  const key = `${raw.id}:${raw.at}:${raw.lat}:${raw.lng}`;
  if (ref.current.key !== key) {
    const prev = ref.current.fix && ref.current.key.startsWith(raw.id + ':') ? ref.current.fix : null;
    ref.current = { key, fix: fusePoint(prev, { lat: raw.lat, lng: raw.lng, accuracyM: Math.max(1, raw.accuracyM), at: raw.at }) };
  }
  return ref.current.fix;
}

function Compass({ meetup, busy, onArrived, onStop }: { meetup: Meetup; busy: boolean; onArrived: () => void; onStop: () => void }) {
  const heading = useHeading(true);
  const geo = useGeoStatus();
  const partner = useLivePartner(meetup, meetup.requester);
  const target = partner?.pos ?? null;
  const mine = useMyPosition();
  useTick(1000);
  const f = partner ? freshness(partner) : null;
  const bearing = mine && target ? bearingDeg(mine, target) : null;
  // Compass heading when the device gives one; otherwise GPS direction of travel while walking.
  const usedHeading = heading.heading ?? geo.course;
  const rel = bearing === null ? 0 : relativeBearing(bearing, usedHeading);
  // Accumulate turns so 359° → 1° animates as +2°, not −358°.
  const rotRef = useRef(0);
  const prev = rotRef.current;
  let delta = ((rel - (((prev % 360) + 360) % 360)) + 540) % 360 - 180;
  if (Number.isNaN(delta)) delta = 0;
  const rot = prev + delta;
  rotRef.current = rot;
  const dist = mine && target ? distanceM(mine, target) : null;
  const unc = mine && partner ? pairUncertaintyM(mine, { accuracyM: partner.accuracyM ?? 25 }) : null;
  // Closer than the GPS error can resolve: a direction would be noise, so say "you're here" instead.
  const near = dist !== null && unc !== null && dist < Math.max(8, unc);

  return (
    <div className="card meetup-card meetup-compass">
      <p className="headline">Go to {meetup.requesterName}</p>
      <div className={`meetup-dial${near ? ' is-near' : ''}`} aria-label={bearing === null ? 'Waiting for locations' : near ? `Within ${formatDistance(dist ?? NaN)}, look around` : `Head ${Math.round(bearing)} degrees, ${formatDistance(dist ?? NaN)}`}>
        <svg viewBox="0 0 100 100" className="meetup-arrow" style={{ transform: `rotate(${rot}deg)` }} aria-hidden="true">
          <circle cx="50" cy="50" r="46" className="meetup-ring" />
          {near ? <circle cx="50" cy="50" r="14" className="meetup-here" /> : <path d="M50 10 L68 62 L50 52 L32 62 Z" className="meetup-needle" />}
        </svg>
        <div className="meetup-dist">{dist === null ? '—' : near ? `~${formatDistance(dist)}` : formatDistance(dist)}</div>
      </div>
      <p className="muted meetup-meta">
        {!partner && 'Waiting for their location…'}
        {target && near && `You are within GPS range of each other (±${Math.round(unc ?? 0)} m). Look around. `}
        {f && (
          <span className={`meetup-live meetup-live--${f.tone}`}>
            <span className="meetup-live-dot" aria-hidden="true" /> {meetup.requesterName}: {f.text}
            {!near && unc !== null && ` · ±${Math.round(unc)} m`}
          </span>
        )}
        {partner?.approximate && ' (approximate)'}
      </p>
      <p className="footnote">
        {heading.heading !== null
          ? `Compass on · facing ${Math.round(heading.heading)}°`
          : geo.course !== null
            ? 'No compass sensor: arrow follows your walking direction'
            : 'Compass off: arrow points with north up. Walk a few steps and it follows your direction.'}
      </p>
      {heading.heading === null && heading.supported && (
        <button type="button" className="btn secondary block" onClick={() => void heading.requestPermission()}>
          Enable compass
        </button>
      )}
      <MyLocationStatus />
      <div className="meetup-actions">
        <button type="button" className="btn block" disabled={busy || !target} onClick={onArrived}>
          I&apos;ve arrived
        </button>
        <button type="button" className="btn plain small-btn" disabled={busy} onClick={onStop}>
          Stop
        </button>
      </div>
    </div>
  );
}
