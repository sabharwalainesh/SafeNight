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
  /** ok: route + links; partial: a lookup failed but pickup-aware links exist; provider_links_only: no pickup or venue to look up; failed: nothing usable. */
  status: 'ok' | 'partial' | 'provider_links_only' | 'failed';
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

/** Provider links that open with the pickup preset when a consented (rounded) pickup is known. */
export function pickupLinks(pickup: { lat: number; lng: number } | null): TransportOption[] {
  if (!pickup) return PROVIDER_LINKS;
  const lat = round3(pickup.lat);
  const lng = round3(pickup.lng);
  return [
    { kind: 'rideshare', label: 'Uber', url: `https://m.uber.com/ul/?action=setPickup&pickup[latitude]=${lat}&pickup[longitude]=${lng}`, source: 'provider_link' },
    { kind: 'rideshare', label: 'Lyft', url: `https://lyft.com/ride?id=lyft&pickup[latitude]=${lat}&pickup[longitude]=${lng}`, source: 'provider_link' },
    { kind: 'transit', label: 'Transit directions', url: `https://www.google.com/maps/dir/?api=1&travelmode=transit&origin=${lat},${lng}`, source: 'provider_link' },
  ];
}

/** The no-HTTP fallback the policy safety net uses when no lookup ran in the step. */
export function providerLinksOnly(nowIso: string, pickup: { lat: number; lng: number } | null): TransportResult {
  const fetchedAt = Date.parse(nowIso) || 0;
  return {
    status: 'provider_links_only',
    fetchedAt: nowIso,
    pickup: pickup ? { lat: round3(pickup.lat), lng: round3(pickup.lng), approximate: true } : null,
    options: sanitizeOptions(pickupLinks(pickup)).kept.map(o => ({ ...o, fetchedAt })),
    simulated: false,
  };
}

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
  const links = sanitizeOptions(pickupLinks(input.pickup)).kept.map(stamp);
  const base: TransportResult = {
    status: 'provider_links_only',
    fetchedAt: input.nowIso,
    pickup: input.pickup ? { lat: round3(input.pickup.lat), lng: round3(input.pickup.lng), approximate: true } : null,
    options: links,
    simulated: false,
  };
  if (!input.pickup || input.venueHint.trim().length === 0) return base;
  // A failed lookup still leaves pickup-aware links, so it is `partial`, never `failed`, unless nothing survived.
  const fail = (error: string): TransportResult => ({ ...base, status: links.length > 0 ? 'partial' : 'failed', error });
  try {
    const q = encodeURIComponent(input.venueHint.trim());
    const geo = ctx.http.fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`, {
      method: 'GET',
      headers: { 'user-agent': UA, accept: 'application/json' },
      timeout: TimeDuration.fromMillis(8_000),
    });
    if (geo.status !== 200) return fail(`nominatim_http_${geo.status}`);
    const hits = geo.json();
    const hit = Array.isArray(hits) ? hits[0] : undefined;
    const vLat = Number(hit?.lat);
    const vLng = Number(hit?.lon);
    if (!Number.isFinite(vLat) || !Number.isFinite(vLng)) return fail('venue_not_geocoded');
    const p = base.pickup!;
    const route = ctx.http.fetch(
      `https://router.project-osrm.org/route/v1/driving/${vLng},${vLat};${p.lng},${p.lat}?overview=false`,
      { method: 'GET', headers: { 'user-agent': UA, accept: 'application/json' }, timeout: TimeDuration.fromMillis(8_000) }
    );
    if (route.status !== 200) return fail(`osrm_http_${route.status}`);
    const r = route.json()?.routes?.[0];
    if (typeof r?.duration !== 'number' || typeof r?.distance !== 'number') return fail('osrm_no_route');
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
    // Only a code reaches receipts: a raw error would echo the request URL, which carries the pickup coordinates.
    const msg = e instanceof Error ? e.message : String(e);
    return fail(msg.includes('nominatim') ? 'nominatim_request_failed' : msg.includes('osrm') ? 'osrm_request_failed' : 'transport_request_failed');
  }
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;
