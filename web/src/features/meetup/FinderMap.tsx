// Live finder map for "Come to me": the two people, their accuracy circles and a dashed line,
// re-framed as they move. Leaflet + OpenStreetMap, same tiles as the Map tab.
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';
import type { Fix } from './geo';

const TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

export type FinderPoint = { id: string; name: string; fix: Fix; isMe: boolean; color: string };

export function FinderMap({ points }: { points: FinderPoint[] }) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const lastFit = useRef<string>('');

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let m: L.Map;
    try {
      m = L.map(el, { zoomControl: false, attributionControl: false }).setView([20, 0], 2);
      L.tileLayer(TILES, { maxZoom: 19 }).addTo(m);
      layer.current = L.layerGroup().addTo(m);
    } catch {
      return;
    }
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      layer.current = null;
      lastFit.current = '';
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    for (const p of points) {
      const ll: L.LatLngTuple = [p.fix.lat, p.fix.lng];
      L.circle(ll, { radius: Math.max(4, p.fix.accuracyM), stroke: false, fillColor: p.color, fillOpacity: 0.18, interactive: false }).addTo(g);
      L.marker(ll, {
        icon: L.divIcon({
          className: 'finder-pin-wrap',
          html: `<div class="finder-pin${p.isMe ? ' finder-pin--me' : ''}" style="background:${p.color}">${esc((p.name.trim()[0] ?? '?').toUpperCase())}</div><span class="finder-pin-name">${esc(p.isMe ? 'You' : p.name)}</span>`,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        }),
        keyboard: false,
        interactive: false,
      }).addTo(g);
    }
    if (points.length === 2) {
      L.polyline(points.map((p) => [p.fix.lat, p.fix.lng] as L.LatLngTuple), { color: '#7c5cff', weight: 3, dashArray: '6 8', interactive: false }).addTo(g);
    }
    if (points.length > 0) {
      // Re-frame only when someone moved more than a few metres (coarse key), so the map does not twitch.
      const key = points.map((p) => `${p.id}:${p.fix.lat.toFixed(4)}:${p.fix.lng.toFixed(4)}`).join('|');
      if (key !== lastFit.current) {
        lastFit.current = key;
        const b = L.latLngBounds(points.map((p) => [p.fix.lat, p.fix.lng] as L.LatLngTuple)).pad(0.5);
        m.fitBounds(b, { maxZoom: 19, animate: true });
      }
    }
  }, [points]);

  return <div ref={host} className="finder-map" aria-label="Map of you and the person you are meeting" />;
}

/** Walking directions in the phone's maps app. iOS → Apple Maps, otherwise Google Maps (both open in-browser on a laptop). */
export function directionsUrl(to: { lat: number; lng: number }, label: string): string {
  const ios = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent);
  if (ios) return `https://maps.apple.com/?daddr=${to.lat},${to.lng}&dirflg=w&q=${encodeURIComponent(label)}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${to.lat},${to.lng}&travelmode=walking`;
}
