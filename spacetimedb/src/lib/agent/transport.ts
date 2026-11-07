import { TimeDuration } from 'spacetimedb';
import type { ProcedureCtx, InferSchema } from 'spacetimedb/server';
import type { spacetimedb } from '../../schema';
import { sanitizeOptions } from './links';

type PCtx = ProcedureCtx<InferSchema<typeof spacetimedb>>;

export type TransportOption = {
  kind: string;
  label: string;
  url: string;
  source: string;
  /** Epoch milliseconds when this option was produced. */
  fetchedAt?: number;
  durationMinutes?: number;
  distanceKm?: number;
};

export type TransportResult = {
  status: 'ok' | 'provider_links_only' | 'failed';
  fetchedAt: string;
  pickup: { lat: number; lng: number; approximate: boolean } | null;
  options: TransportOption[];
  error?: string;
  simulated: false;
};

export const PROVIDER_LINKS: TransportOption[] = [
  { kind: 'rideshare', label: 'Uber', url: 'https://m.uber.com/ul/?action=setPickup&pickup=my_location', source: 'provider_link' },
  { kind: 'rideshare', label: 'Lyft', url: 'https://lyft.com/ride?id=lyft', source: 'provider_link' },
  { kind: 'transit', label: 'Transit directions', url: 'https://www.google.com/maps/dir/?api=1&travelmode=transit', source: 'provider_link' },
];

export type TransportInput = {
  pickup: { lat: number; lng: number } | null;
  venueHint: string;
  nowIso: string;
};

const UA = 'SafeNight-hackathon/0.1 (https://github.com/sabharwalainesh/SafeNight)';

/**
 * External lookups run outside any transaction: Nominatim geocodes the venue hint, OSRM estimates
 * the drive from the venue to the subject's consented (rounded) pickup. Nothing is invented: any
 * failure is reported as `failed`/`provider_links_only` with the provider links only.
 */
export function fetchTransportOptions(ctx: PCtx, input: TransportInput): TransportResult {
  const fetchedAt = Date.parse(input.nowIso) || 0;
  const stamp = (o: TransportOption): TransportOption => ({ ...o, fetchedAt });
  // Provider links are constants, but they pass through the same allowlist as model output.
  const links = sanitizeOptions(PROVIDER_LINKS).kept.map(stamp);
  const base: TransportResult = {
    status: 'provider_links_only',
    fetchedAt: input.nowIso,
    pickup: input.pickup ? { lat: round3(input.pickup.lat), lng: round3(input.pickup.lng), approximate: true } : null,
    options: links,
    simulated: false,
  };
  if (!input.pickup || input.venueHint.trim().length === 0) return base;
  try {
    const q = encodeURIComponent(input.venueHint.trim());
    const geo = ctx.http.fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`, {
      method: 'GET',
      headers: { 'user-agent': UA, accept: 'application/json' },
      timeout: TimeDuration.fromMillis(8_000),
    });
    if (geo.status !== 200) return { ...base, status: 'failed', error: `nominatim_http_${geo.status}` };
    const hits = geo.json();
    const hit = Array.isArray(hits) ? hits[0] : undefined;
    const vLat = Number(hit?.lat);
    const vLng = Number(hit?.lon);
    if (!Number.isFinite(vLat) || !Number.isFinite(vLng)) return { ...base, status: 'failed', error: 'venue_not_geocoded' };
    const p = base.pickup!;
    const route = ctx.http.fetch(
      `https://router.project-osrm.org/route/v1/driving/${vLng},${vLat};${p.lng},${p.lat}?overview=false`,
      { method: 'GET', headers: { 'user-agent': UA, accept: 'application/json' }, timeout: TimeDuration.fromMillis(8_000) }
    );
    if (route.status !== 200) return { ...base, status: 'failed', error: `osrm_http_${route.status}` };
    const r = route.json()?.routes?.[0];
    if (typeof r?.duration !== 'number' || typeof r?.distance !== 'number') return { ...base, status: 'failed', error: 'osrm_no_route' };
    return {
      ...base,
      status: 'ok',
      options: [
        {
          kind: 'route',
          label: `Drive from ${input.venueHint.trim()} to the pickup`,
          url: '',
          source: 'osrm',
          fetchedAt,
          durationMinutes: Math.round(r.duration / 60),
          distanceKm: Math.round(r.distance / 100) / 10,
        },
        ...links,
      ],
    };
  } catch (e) {
    return { ...base, status: 'failed', error: e instanceof Error ? e.message : String(e) };
  }
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;
