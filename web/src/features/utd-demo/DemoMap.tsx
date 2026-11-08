// Leaflet map of the demo group: one persistent marker per person (moved, not recreated, so the
// dots glide), an optional walking route, and a "fit" control. Same OSM tiles as the Map tab.
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';
import type { LatLng } from '../meetup/geo';

const TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

export type MapPerson = { id: string; name: string; emoji: string; color: string; pos: LatLng; isMe?: boolean; alert?: boolean; accuracyM?: number };

function icon(p: MapPerson): L.DivIcon {
  return L.divIcon({
    className: 'utd-pin-wrap',
    html: `<div class="utd-pin${p.isMe ? ' utd-pin--me' : ''}${p.alert ? ' utd-pin--alert' : ''}" style="background:${p.color}">${esc(p.isMe ? '●' : p.emoji)}</div><span class="utd-pin-name">${esc(p.isMe ? 'You' : p.name)}</span>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

export function DemoMap({ people, route, fitKey }: { people: MapPerson[]; route: LatLng[] | null; fitKey: string }) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef(new Map<string, { m: L.Marker; c: L.Circle; key: string }>());
  const line = useRef<L.Polyline | null>(null);
  const peopleRef = useRef(people);
  peopleRef.current = people;
  const routeRef = useRef(route);
  routeRef.current = route;

  const fit = () => {
    const m = map.current;
    if (!m) return;
    const pts: L.LatLngTuple[] = peopleRef.current.map((p) => [p.pos.lat, p.pos.lng]);
    for (const c of routeRef.current ?? []) pts.push([c.lat, c.lng]);
    if (pts.length) m.fitBounds(L.latLngBounds(pts).pad(0.15), { maxZoom: 18, animate: true });
  };

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let m: L.Map;
    try {
      m = L.map(el, { zoomControl: false, attributionControl: true }).setView([32.9875, -96.751], 16);
      L.tileLayer(TILES, { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m);
    } catch {
      return; // jsdom / no layout
    }
    map.current = m;
    const reg = markers.current;
    return () => {
      m.remove();
      map.current = null;
      reg.clear();
      line.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const seen = new Set<string>();
    for (const p of people) {
      seen.add(p.id);
      const ll: L.LatLngTuple = [p.pos.lat, p.pos.lng];
      const key = `${p.emoji}|${p.color}|${p.isMe ? 1 : 0}|${p.alert ? 1 : 0}`;
      const cur = markers.current.get(p.id);
      if (!cur) {
        const c = L.circle(ll, { radius: p.accuracyM ?? 6, stroke: false, fillColor: p.color, fillOpacity: 0.16, interactive: false }).addTo(m);
        const mk = L.marker(ll, { icon: icon(p), keyboard: false, interactive: false, zIndexOffset: p.isMe ? 1000 : p.alert ? 900 : 0 }).addTo(m);
        markers.current.set(p.id, { m: mk, c, key });
      } else {
        cur.m.setLatLng(ll);
        cur.c.setLatLng(ll);
        if (p.accuracyM) cur.c.setRadius(p.accuracyM);
        if (cur.key !== key) {
          cur.m.setIcon(icon(p));
          cur.m.setZIndexOffset(p.isMe ? 1000 : p.alert ? 900 : 0);
          cur.key = key;
        }
      }
    }
    for (const [id, v] of markers.current) {
      if (!seen.has(id)) {
        v.m.remove();
        v.c.remove();
        markers.current.delete(id);
      }
    }
  }, [people]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    line.current?.remove();
    line.current = route && route.length > 1
      ? L.polyline(route.map((c) => [c.lat, c.lng] as L.LatLngTuple), { color: '#0a84ff', weight: 6, opacity: 0.85, lineCap: 'round', interactive: false }).addTo(m)
      : null;
  }, [route]);

  // Re-frame when the caller says the view changed (route appeared, tab opened).
  useEffect(() => {
    const t = window.setTimeout(fit, 50);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  return (
    <div className="utd-map-wrap">
      <div ref={host} className="utd-map" role="img" aria-label="Map of UT Dallas with your friends' live positions" />
      <button type="button" className="utd-map-fit" onClick={fit} aria-label="Fit everyone on the map">
        ⤢
      </button>
    </div>
  );
}
