import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';
import { useSafety, type VisibleLocation } from '../../features/safety/api';
import { BALL_DROP, jitter, SPOTS, TIMES_SQUARE } from '../../features/safety/mock/spots';
import { PERSONAS } from '../../personas';
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

type Pin = { p: VisibleLocation; isMe: boolean; name: string };

function pinIcon(pin: Pin): L.DivIcon {
  const initial = esc((pin.p.displayName.trim()[0] ?? '?').toUpperCase());
  return L.divIcon({
    className: 'map-pin-wrap',
    html: `<div class="map-pin${pin.isMe ? ' map-pin--me' : ''}${pin.p.isStale ? ' map-pin--stale' : ''}" style="background:${colorOf(pin.p.userId, pin.p.displayName)}">${initial}</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

function popupText(pin: Pin): string {
  const when = pin.p.isStale ? `Last seen ${ago(pin.p.recordedAt)}` : `${pin.p.approximate ? 'Approx' : 'Precise'} · ${ago(pin.p.recordedAt)}`;
  return `<strong>${esc(pin.name)}</strong><br/>${esc(when)}`;
}

function FriendMap({ pins, focus }: { pins: Pin[]; focus: { id: string; n: number } | null }) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const markers = useRef(new Map<string, L.Marker>());
  const fitted = useRef(false);

  useEffect(() => {
    const el = host.current;
    if (!el || typeof window === 'undefined') return;
    let m: L.Map;
    try {
      m = L.map(el, { zoomControl: false, attributionControl: true }).setView([TIMES_SQUARE.lat, TIMES_SQUARE.lng], 17);
      L.control.zoom({ position: 'topright' }).addTo(m);
      L.tileLayer(TILES, { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(m);
      L.marker([BALL_DROP.lat, BALL_DROP.lng], {
        icon: L.divIcon({ className: 'map-pin-wrap', html: '<div class="map-ball" aria-hidden="true"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }),
        keyboard: false,
      })
        .bindTooltip(BALL_DROP.label, { direction: 'right', permanent: true, className: 'map-ball-tip' })
        .addTo(m);
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
      if (pin.p.approximate)
        L.circle(ll, { radius: Math.max(30, pin.p.accuracyM), stroke: false, fillColor: colorOf(pin.p.userId, pin.p.displayName), fillOpacity: pin.p.isStale ? 0.08 : 0.2, interactive: false }).addTo(g);
      const marker = L.marker(ll, { icon: pinIcon(pin), title: pin.name, riseOnHover: true }).bindPopup(popupText(pin)).addTo(g);
      if (pin.p.isStale) marker.bindTooltip(`Last seen ${ago(pin.p.recordedAt)}`);
      markers.current.set(pin.p.userId, marker);
    }
    if (!fitted.current && pins.length > 0) {
      fitted.current = true;
      m.fitBounds(L.latLngBounds(pins.map((x) => [x.p.lat, x.p.lng] as L.LatLngTuple)).pad(0.3), { maxZoom: 18 });
    }
  }, [pins]);

  useEffect(() => {
    if (!focus) return;
    const mk = markers.current.get(focus.id);
    if (mk && map.current) {
      map.current.panTo(mk.getLatLng());
      mk.openPopup();
    }
  }, [focus]);

  return <div ref={host} className="map-canvas" role="region" aria-label="Map of Times Square with your group" />;
}

export function MapScreen() {
  const safety = useSafety();
  const [error, setError] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null);

  const post = async () => {
    setError(null);
    const me = personaOf(safety.me, safety.myLocation?.displayName ?? '');
    const base = SPOTS[me?.id ?? ''] ?? TIMES_SQUARE;
    try {
      await safety.actions.postLocation(jitter(base.lat), jitter(base.lng), 25, 'simulated');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not post location');
    }
  };

  const pins: Pin[] = [...(safety.myLocation ? [safety.myLocation] : []), ...safety.locations].map((p) => ({
    p,
    isMe: p.userId === safety.me,
    name: p.userId === safety.me ? `${p.displayName} (you)` : p.displayName,
  }));

  return (
    <section className="map-screen" aria-labelledby="map-title">
      <h1 id="map-title" className="map-title">
        Map
      </h1>
      <div className="map-badges">
        {safety.mocked && <span className="map-badge map-badge--mock">MOCK DATA</span>}
        <span className="map-badge map-badge--sim">SIMULATED LOCATIONS</span>
      </div>

      <div className="map-frame">
        <FriendMap pins={pins} focus={focus} />
      </div>

      {!safety.sessionId ? (
        <p className="map-empty">You are not in a Night Out yet. Start or join one in the Night Out tab to see your group here.</p>
      ) : (
        <div className="map-card">
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
                  <button type="button" className="map-item" onClick={() => setFocus((f) => ({ id: p.userId, n: (f?.n ?? 0) + 1 }))}>
                    <span className="map-avatar" style={{ background: colorOf(p.userId, p.displayName) }} aria-hidden="true">
                      {(p.displayName.trim()[0] ?? '?').toUpperCase()}
                    </span>
                    <span className="map-item-body">
                      <strong>{name}</strong>
                      <span>{p.isStale ? `Stale · last seen ${ago(p.recordedAt)}` : `${p.approximate ? 'Approx' : 'Precise'} · ${ago(p.recordedAt)}`}</span>
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
