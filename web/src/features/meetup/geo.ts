// Pure geometry for the "Come to me" compass. All angles in degrees, distances in meters.
export type LatLng = { lat: number; lng: number };

const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Great-circle distance in meters (haversine). */
export function distanceM(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Initial bearing from a to b, 0 = north, 90 = east, in [0, 360). */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const φ1 = rad(a.lat);
  const φ2 = rad(b.lat);
  const Δλ = rad(b.lng - a.lng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** Arrow rotation on screen: bearing to target minus the direction the phone faces. Null heading = north-up. */
export function relativeBearing(bearing: number, heading: number | null): number {
  if (heading === null || Number.isNaN(heading)) return ((bearing % 360) + 360) % 360;
  return (((bearing - heading) % 360) + 360) % 360;
}

export function formatDistance(m: number): string {
  if (!Number.isFinite(m)) return '—';
  if (m < 10) return `${Math.round(m)} m`;
  if (m < 1000) return `${Math.round(m / 5) * 5} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
}

/** Point `meters` from `from` toward `to` (clamped at `to`). Used for simulated movement on laptops. */
export function stepToward(from: LatLng, to: LatLng, meters: number): LatLng {
  const d = distanceM(from, to);
  if (d <= meters || d === 0) return { ...to };
  const f = meters / d;
  return { lat: from.lat + (to.lat - from.lat) * f, lng: from.lng + (to.lng - from.lng) * f };
}

/** Compass heading from a DeviceOrientation event: iOS exposes webkitCompassHeading; others give alpha (counter-clockwise). */
export function headingFromEvent(e: { webkitCompassHeading?: number; alpha: number | null; absolute?: boolean }, screenAngle = 0): number | null {
  if (typeof e.webkitCompassHeading === 'number' && !Number.isNaN(e.webkitCompassHeading)) {
    return (e.webkitCompassHeading + screenAngle + 360) % 360;
  }
  if (e.alpha === null || e.alpha === undefined || Number.isNaN(e.alpha)) return null;
  // alpha is the rotation around the z-axis, counter-clockwise from north when `absolute`.
  return ((360 - e.alpha + screenAngle) % 360 + 360) % 360;
}
