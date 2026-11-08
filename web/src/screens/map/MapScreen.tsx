import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useSafety, type VisibleLocation } from '../../features/safety/api';
import { PERSONAS } from '../../personas';
import { useMeetupLine } from '../../features/meetup'; // meetup feature: dashed helper→requester line
import type { LatLng } from '../../features/meetup/geo';
import { Avatar } from '../../ui';
import { ProfileContext } from '../../features/profile/api';
import './map.css';

const TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

// Mock user ids are persona ids; live ids are identity hex, so also match by display name.
function personaOf(userId: string, displayName: string) {
  const name = displayName.trim().toLowerCase();
  return PERSONAS.find((p) => p.id === userId.toLowerCase() || p.name.toLowerCase() === name);
}
function colorOf(userId: string, displayName: string): string {
  return personaOf(userId, displayName)?.accent ?? '#a3abbd';
}

function ago(ms: number): string {
  const m = Math.max(0, Math.floor((Date.now() - ms) / 60000));
  return m < 1 ? 'just now' : `${m}m ago`;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

type Pin = { p: VisibleLocation; isMe: boolean; name: string; photo?: string };

const SAFE_PHOTO = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/;

function pinIcon(pin: Pin): L.DivIcon {
  const initial = pin.photo && SAFE_PHOTO.test(pin.photo)
    ? `<img src="${pin.photo}" alt="" />`
    : esc((pin.p.displayName.trim()[0] ?? '?').toUpperCase());
  return L.divIcon({
    className: 'map-pin-wrap',
    html: `<div class="map-pin${pin.isMe ? ' map-pin--me' : ''}${pin.p.isStale ? ' map-pin--stale' : ''}" style="background:${colorOf(pin.p.userId, pin.p.displayName)}">${initial}</div><span class="map-pin-name">${esc(pin.name)}</span>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

function popupText(pin: Pin): string {
  const when = pin.p.isStale ? `Last seen ${ago(pin.p.recordedAt)}` : `${pin.p.approximate ? 'Approx' : 'Precise'} · ${ago(pin.p.recordedAt)}`;
  return `<strong>${esc(pin.name)}</strong><br/>${esc(when)}<br/>Accuracy ±${Math.round(pin.p.accuracyM)} m · ${pin.p.source === 'simulated' ? 'Simulated' : 'Device'}`;
}

function FriendMap({ pins, focus, fitRequest, onSelect, line }: { pins: Pin[]; focus: { id: string; n: number } | null; fitRequest: number; onSelect: (id: string) => void; line: { from: LatLng; to: LatLng } | null }) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const markers = useRef(new Map<string, L.Marker>());
  const fitted = useRef(false);
  const lastFitRequest = useRef(0);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;

  useEffect(() => {
    const el = host.current;
    if (!el || typeof window === 'undefined') return;
    let m: L.Map;
    try {
      // World view until the first shared location arrives; then fitBounds frames the group.
      m = L.map(el, { zoomControl: false, attributionControl: true }).setView([20, 0], 2);
      L.control.zoom({ position: 'topright' }).addTo(m);
      L.tileLayer(TILES, { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(m);
      layer.current = L.layerGroup().addTo(m);
    } catch {
      return; // no usable DOM (tests / unsupported env)
    }
    map.current = m;
    const mk = markers.current;
    return () => {
      m.remove();
      map.current = null;
      layer.current = null;
      mk.clear();
      fitted.current = false;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    markers.current.clear();
    for (const pin of pins) {
      const ll: L.LatLngTuple = [pin.p.lat, pin.p.lng];
      if (pin.p.accuracyM > 0)
        L.circle(ll, { radius: Math.max(30, pin.p.accuracyM), stroke: false, fillColor: colorOf(pin.p.userId, pin.p.displayName), fillOpacity: pin.p.isStale ? 0.08 : 0.2, interactive: false }).addTo(g);
      const marker = L.marker(ll, { icon: pinIcon(pin), title: pin.name, alt: pin.name, riseOnHover: true }).bindPopup(popupText(pin)).addTo(g);
      marker.on('click', () => selectRef.current(pin.p.userId));
      if (pin.p.isStale) marker.bindTooltip(`Last seen ${ago(pin.p.recordedAt)}`);
      markers.current.set(pin.p.userId, marker);
    }
    if (!fitted.current && pins.length > 0) {
      fitted.current = true;
      m.fitBounds(L.latLngBounds(pins.map((x) => [x.p.lat, x.p.lng] as L.LatLngTuple)).pad(0.3), { maxZoom: 18 });
    }
  }, [pins]);

  // meetup feature: dashed line from the helper to the requester while someone is coming
  useEffect(() => {
    const m = map.current;
    if (!m || !line) return;
    const pl = L.polyline([[line.from.lat, line.from.lng], [line.to.lat, line.to.lng]], { color: 'var(--accent)', weight: 3, dashArray: '6 8', interactive: false }).addTo(m);
    return () => { pl.remove(); };
  }, [line]);

  useEffect(() => {
    if (!focus) return;
    const mk = markers.current.get(focus.id);
    if (mk && map.current) {
      map.current.panTo(mk.getLatLng(), { animate: false });
      mk.openPopup();
    }
  }, [focus, pins]);

  useEffect(() => {
    if (fitRequest > lastFitRequest.current && pins.length && map.current) {
      lastFitRequest.current = fitRequest;
      map.current.fitBounds(L.latLngBounds(pins.map(x => [x.p.lat, x.p.lng] as L.LatLngTuple)).pad(0.3), { maxZoom: 18, animate: false });
    }
  }, [fitRequest, pins]);

  return <div ref={host} className="map-canvas" role="region" aria-label="Map of locations shared with you" />;
}

export function MapScreen() {
  const safety = useSafety();
  const line = useMeetupLine(); // meetup feature
  const [fitRequest, setFitRequest] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
  useEffect(() => { if (!scanning) return; const t = setTimeout(() => setScanning(false), 1100); return () => clearTimeout(t); }, [scanning, fitRequest]);
  const [error, setError] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null);

  // "Share my spot": one real fix right now (also the tap that makes iOS show the location prompt).
  const post = async () => {
    setError(null);
    if (!('geolocation' in navigator)) {
      setError('This device has no location service');
      return;
    }
    await new Promise<void>((resolve) =>
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          safety.actions
            .postLocation(pos.coords.latitude, pos.coords.longitude, Math.round(pos.coords.accuracy), 'device')
            .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not post location'))
            .finally(resolve);
        },
        (err) => {
          setError(err.code === err.PERMISSION_DENIED ? 'Location is blocked for this site. Allow it in Settings › Privacy & Security › Location Services › Safari Websites.' : err.message);
          resolve();
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
      ),
    );
  };

  const photos = useContext(ProfileContext)?.photos;
  const pins: Pin[] = useMemo(() => [...(safety.myLocation ? [safety.myLocation] : []), ...safety.locations].map((p) => ({
    p: { ...p, isStale: p.isStale || now - p.recordedAt > 300000 },
    isMe: p.userId === safety.me,
    name: p.userId === safety.me ? `${p.displayName} (you)` : p.displayName,
    photo: photos?.[p.userId],
  })), [safety.myLocation, safety.locations, safety.me, now, photos]);
  const selectPerson = (id: string) => setFocus(f => ({ id, n: (f?.n ?? 0) + 1 }));

  return (
    <section className="map-screen" aria-labelledby="map-title">
      <h1 id="map-title" className="map-title">
        Your group, at a glance
      </h1>
      <div className="map-badges">
        {safety.mocked && <span className="map-badge map-badge--mock">MOCK DATA</span>}
        {pins.some((x) => x.p.source === 'simulated') && <span className="map-badge map-badge--sim">SIMULATED LOCATIONS</span>}
      </div>

      <div className="map-toolbar">
        <p className="muted small">{pins.length} shared {pins.length === 1 ? 'location' : 'locations'} · tap a person to focus</p>
        <button className="btn secondary small-btn" type="button" disabled={!pins.length} onClick={() => {
          setFitRequest(n => n + 1);
          setScanning(!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
        }}>Find my group</button>
      </div>
      <div className="map-frame">
        <FriendMap pins={pins} focus={focus} fitRequest={fitRequest} onSelect={selectPerson} line={line} />
        {scanning && <div className="map-scan" aria-hidden="true"><div className="map-scan-ring" /><span>Bringing shared locations into view</span></div>}
      </div>
      <p className="map-caption">Only locations shared with you. Accuracy circles show uncertainty; a location does not confirm someone is safe.</p>

      {!safety.sessionId ? (
        <p className="map-empty">You are not in a Night Out yet. Start or join one in the Night Out tab to see your group here.</p>
      ) : (
        <div className="map-card">
          <h2>People sharing with you</h2>
          {safety.locations.length === 0 && (
            <p className="map-empty">
              Nobody is sharing their location with you yet. People appear here only after they turn on sharing and give you
              consent in the Night Out tab.
            </p>
          )}
          {pins.length > 0 && (
            <ul className="map-list" aria-label="Locations">
              {pins.map(({ p, name }) => (
                <li key={p.userId}>
                  <button type="button" className={`map-item${focus?.id === p.userId ? ' is-selected' : ''}`} aria-pressed={focus?.id === p.userId} onClick={() => selectPerson(p.userId)}>
                    <Avatar userId={p.userId} name={p.displayName} size={44} color={colorOf(p.userId, p.displayName)} />
                    <span className="map-item-body">
                      <strong>{name}</strong>
                      <span>{p.isStale ? `Stale · last seen ${ago(p.recordedAt)}` : `${p.approximate ? 'Approximate' : 'Precise'} · ${ago(p.recordedAt)}`}</span>
                      <span>Accuracy ±{Math.round(p.accuracyM)} m · {p.source === 'simulated' ? 'Simulated' : 'Device location'}</span>
                    </span>
                    {p.isStale && <span className="map-badge map-badge--stale">Stale</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="map-post" onClick={post}>
            Share my spot
          </button>
          {error && (
            <p className="map-error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
