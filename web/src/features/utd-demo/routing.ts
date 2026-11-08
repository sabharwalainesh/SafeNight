// Walking route from OSRM (OpenStreetMap foot profile), with a labeled straight-line fallback.
import { bearingDeg, distanceM, type LatLng } from '../meetup/geo';

export type RouteStep = { text: string; distanceM: number };
export type Route = { coords: LatLng[]; distanceM: number; durationS: number; steps: RouteStep[]; source: 'osrm' | 'straight' };

const WALK_MPS = 1.35;
const OSRM = 'https://routing.openstreetmap.de/routed-foot/route/v1/foot';

const DIRS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
export const compassWord = (deg: number) => DIRS[Math.round((((deg % 360) + 360) % 360) / 45) % 8]!;

export function straightRoute(from: LatLng, to: LatLng): Route {
  const d = distanceM(from, to);
  return {
    coords: [from, to],
    distanceM: d,
    durationS: d / WALK_MPS,
    steps: [
      { text: `Head ${compassWord(bearingDeg(from, to))} toward Maya`, distanceM: d },
      { text: 'Arrive at Maya', distanceM: 0 },
    ],
    source: 'straight',
  };
}

type OsrmStep = { distance: number; name?: string; maneuver?: { type?: string; modifier?: string } };
export function stepText(s: OsrmStep): string {
  const type = s.maneuver?.type ?? '';
  const mod = s.maneuver?.modifier;
  const on = s.name ? ` onto ${s.name}` : '';
  const along = s.name ? ` on ${s.name}` : '';
  switch (type) {
    case 'depart':
      return `Start${along}`;
    case 'arrive':
      return 'Arrive at Maya';
    case 'turn':
    case 'end of road':
    case 'fork':
      return `${mod ? `Turn ${mod}` : 'Turn'}${on}`;
    case 'new name':
    case 'continue':
      return `Continue${mod && mod !== 'straight' ? ` ${mod}` : ''}${along}`;
    case 'roundabout':
    case 'rotary':
      return `Take the roundabout${on}`;
    default:
      return `${mod ? `Go ${mod}` : 'Continue'}${along}`;
  }
}

export async function fetchWalkingRoute(from: LatLng, to: LatLng, f: typeof fetch = fetch, signal?: AbortSignal): Promise<Route> {
  try {
    const url = `${OSRM}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&steps=true`;
    const res = await f(url, { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = (await res.json()) as {
      code?: string;
      routes?: { distance: number; duration: number; geometry?: { coordinates?: [number, number][] }; legs?: { steps?: OsrmStep[] }[] }[];
    };
    const r = j.routes?.[0];
    const coords = r?.geometry?.coordinates?.map(([lng, lat]) => ({ lat, lng })) ?? [];
    if (j.code !== 'Ok' || !r || coords.length < 2) throw new Error('no route');
    const steps = (r.legs ?? []).flatMap((l) => l.steps ?? []).map((s) => ({ text: stepText(s), distanceM: s.distance }));
    // The foot profile's duration assumes a slow pace; use a normal walking speed for the ETA.
    return { coords, distanceM: r.distance, durationS: r.distance / WALK_MPS, steps, source: 'osrm' };
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    return straightRoute(from, to);
  }
}

export function routeLength(coords: LatLng[]): number {
  let n = 0;
  for (let i = 1; i < coords.length; i++) n += distanceM(coords[i - 1]!, coords[i]!);
  return n;
}

/** Point `meters` along the polyline (clamped to its end). */
export function pointAlong(coords: LatLng[], meters: number): LatLng {
  if (coords.length === 0) return { lat: 0, lng: 0 };
  let left = Math.max(0, meters);
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1]!;
    const b = coords[i]!;
    const seg = distanceM(a, b);
    if (left <= seg) {
      const f = seg === 0 ? 0 : left / seg;
      return { lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f };
    }
    left -= seg;
  }
  return coords[coords.length - 1]!;
}

export const formatEta = (s: number) => (s < 60 ? '<1 min' : `${Math.round(s / 60)} min`);
