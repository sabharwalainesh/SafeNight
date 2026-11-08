// "Come to me" UI: the helper's compass card, the requester's "X is coming" card, and the
// one-time tracker that posts GPS while a meetup is in progress.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useSafety, type VisibleLocation } from '../safety/api';
import { Section } from '../../ui';
import { ago } from '../../screens/incident/time';
import { isActiveMeetup, useMeetups, type Meetup, type MeetupState } from './api';
import { bearingDeg, distanceM, formatDistance, relativeBearing, type LatLng } from './geo';
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

type GeoStatus = { permission: 'prompt' | 'granted' | 'denied' | 'unavailable'; accuracyM: number | null; course: number | null; error: string | null; simulated: boolean; requestLocation: () => void };
const geoStore = {
  state: { permission: 'prompt', accuracyM: null, course: null, error: null, simulated: false, requestLocation: () => {} } as GeoStatus,
  subs: new Set<() => void>(),
  set(next: GeoStatus) {
    const p = geoStore.state;
    if (p.permission === next.permission && p.accuracyM === next.accuracyM && p.course === next.course && p.error === next.error && p.simulated === next.simulated && p.requestLocation === next.requestLocation) return;
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
function TrackerInner({ mu: { me, meetups } }: { mu: MeetupState }) {
  const safety = useSafety();
  const inTrip = meetups.some((m) => isActiveMeetup(m) && (m.helper === me || m.requester === me));
  const geo = useGeolocation(!!safety.sessionId, safety.actions.postLocation, inTrip ? 2000 : 4000, inTrip ? 4000 : 15000);
  useEffect(() => {
    geoStore.set({ permission: geo.permission, accuracyM: geo.position?.accuracyM ?? null, course: geo.course, error: geo.error, simulated: false, requestLocation: geo.requestLocation });
  }, [geo.permission, geo.position?.accuracyM, geo.course, geo.error, geo.requestLocation]);
  return null;
}

/* ------------------------------------------------------------- map helper */

/** For the Map tab: the helper→requester pair of an active meetup I can see, or null. */
export function useMeetupLine(): { from: LatLng; to: LatLng } | null {
  const mu = useMeetups();
  const safety = useSafety();
  const active = mu?.meetups.find((m) => isActiveMeetup(m));
  const h = active ? locOf(safety.locations, safety.myLocation, active.helper) : null;
  const r = active ? locOf(safety.locations, safety.myLocation, active.requester) : null;
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
  const safety = useSafety();
  const helper = locOf(safety.locations, safety.myLocation, meetup.helper);
  const requester = locOf(safety.locations, safety.myLocation, meetup.requester);
  const dist = helper && requester ? distanceM(helper, requester) : null;
  return (
    <div className="card meetup-card">
      <p className="headline">
        {meetup.helperName} is coming
        {dist !== null && ` · ${formatDistance(dist)} away`}
        {helper && ` · updated ${ago(helper.recordedAt)}`}
      </p>
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

function Compass({ meetup, busy, onArrived, onStop }: { meetup: Meetup; busy: boolean; onArrived: () => void; onStop: () => void }) {
  const safety = useSafety();
  const heading = useHeading(true);
  const geo = useGeoStatus();
  const target = locOf(safety.locations, null, meetup.requester);
  const mine = safety.myLocation;
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

  return (
    <div className="card meetup-card meetup-compass">
      <p className="headline">Go to {meetup.requesterName}</p>
      <div className="meetup-dial" aria-label={bearing === null ? 'Waiting for locations' : `Head ${Math.round(bearing)} degrees, ${formatDistance(dist ?? NaN)}`}>
        <svg viewBox="0 0 100 100" className="meetup-arrow" style={{ transform: `rotate(${rot}deg)` }} aria-hidden="true">
          <circle cx="50" cy="50" r="46" className="meetup-ring" />
          <path d="M50 10 L68 62 L50 52 L32 62 Z" className="meetup-needle" />
        </svg>
        <div className="meetup-dist">{dist === null ? '—' : formatDistance(dist)}</div>
      </div>
      <p className="muted meetup-meta">
        {!target && 'Waiting for their location…'}
        {target && `${meetup.requesterName}'s location updated ${ago(target.recordedAt)}`}
        {target?.approximate && ' (approximate)'}
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
