// "Come to me" UI: the helper's compass card, the requester's "X is coming" card, and the
// one-time tracker that posts GPS while a meetup is in progress.
import { useEffect, useMemo, useState } from 'react';
import { useSafety, type VisibleLocation } from '../safety/api';
import { TIMES_SQUARE, jitter } from '../safety/mock/spots';
import { Pill, Section } from '../../ui';
import { ago } from '../../screens/incident/time';
import { isActiveMeetup, useMeetups, type Meetup, type MeetupState } from './api';
import { bearingDeg, distanceM, formatDistance, relativeBearing, type LatLng } from './geo';
import { useGeolocation, useHeading } from './useDeviceSensors';
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

/* ---------------------------------------------------------------- tracker */

/** Mount once. While I am part of an active meetup, post my position every 2 s (real GPS, or simulated on laptops). */
export function MeetupTracker() {
  const mu = useMeetups();
  return mu ? <TrackerInner mu={mu} /> : null;
}
function TrackerInner({ mu: { me, meetups } }: { mu: MeetupState }) {
  const safety = useSafety();
  const active = meetups.find((m) => isActiveMeetup(m) && (m.helper === me || m.requester === me));
  const other = active ? (active.helper === me ? active.requester : active.helper) : null;
  const otherLoc = other ? locOf(safety.locations, null, other) : null;
  const from: LatLng | null = safety.myLocation ?? { lat: jitter(TIMES_SQUARE.lat), lng: jitter(TIMES_SQUARE.lng) };
  // Only the helper walks; the requester's simulated position stays put (target = itself).
  const target: LatLng | null = active?.helper === me ? otherLoc : from;
  useGeolocation(!!active, safety.actions.postLocation, 2000, { from, target });
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

export function MeetupPanel({ incidentId }: { incidentId: string }) {
  const mu = useMeetups();
  return mu ? <PanelInner incidentId={incidentId} mu={mu} /> : null;
}

function PanelInner({ incidentId, mu: { me, meetups, actions } }: { incidentId: string; mu: MeetupState }) {
  const safety = useSafety();
  const incident = safety.incidents.find((i) => i.id === incidentId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useTick(1000);
  if (!incident) return null;

  const mine = meetups.filter((m) => m.incidentId === incidentId);
  const active = mine.find(isActiveMeetup);
  const isRequester = incident.subject === me;
  const anyActiveOfMine = meetups.some((m) => isActiveMeetup(m) && m.helper === me);
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
  if (!canOffer && !active && recent.length === 0) return null;

  return (
    <Section title="Come to me" footer={error ?? undefined}>
      {canOffer && (
        <div className="card meetup-card">
          <p className="headline">{incident.subjectName} wants someone to come to them</p>
          <p className="muted">Accepting shares your precise location with {incident.subjectName} until you arrive.</p>
          <button type="button" className="btn block" disabled={busy} onClick={() => run(() => actions.offerToCome(incidentId))}>
            I&apos;m coming
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
    </Section>
  );
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
  const target = locOf(safety.locations, null, meetup.requester);
  const mine = safety.myLocation;
  const bearing = mine && target ? bearingDeg(mine, target) : null;
  const rot = bearing === null ? 0 : relativeBearing(bearing, heading.heading);
  const dist = mine && target ? distanceM(mine, target) : null;
  const northUp = heading.heading === null;

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
      {heading.needsPermission && (
        <button type="button" className="btn secondary block" onClick={() => void heading.requestPermission()}>
          Enable compass
        </button>
      )}
      {!heading.needsPermission && northUp && <p className="footnote">No compass on this device: arrow points with north up.</p>}
      {safety.myLocation?.source === 'simulated' && <Pill tone="warn">Simulated movement</Pill>}
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
