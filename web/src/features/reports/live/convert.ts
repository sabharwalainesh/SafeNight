// Pure row -> ReportsApi converters. Rows are structurally typed so tests can pass fakes.
// Report rows carry no reporter field; converters copy only whitelisted columns.
import type { Timestamp } from 'spacetimedb';
import { idStr, optTsMs, tagToSnake, tsMs } from '../../night-out/live/convert';
import type {
  ReportCategory,
  ReportConfidence,
  ReportModeration,
  SafetyResource,
  SafetyResourceType,
  Venue,
  VenueReport,
} from '../api';

type Tag = { tag: string };
export type VenueRowLike = {
  id: bigint;
  name: string;
  approxLat: number;
  approxLng: number;
  source: string;
  verifiedAt?: Timestamp | null;
};
export type ReportRowLike = {
  id: bigint;
  venueId: bigint;
  category: Tag;
  textRedacted: string;
  confidence: Tag;
  moderation: Tag;
  reportCount: number;
  disputeCount: number;
  expiresAt: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};
export type ResourceRowLike = {
  id: bigint;
  type: Tag;
  name: string;
  lat: number;
  lng: number;
  hours: string;
  source: string;
  verifiedAt?: Timestamp | null;
};

export const toVenue = (r: VenueRowLike): Venue => ({
  id: idStr(r.id),
  name: r.name,
  approxLat: r.approxLat,
  approxLng: r.approxLng,
  source: r.source,
  verifiedAt: optTsMs(r.verifiedAt),
});

export const toReport = (r: ReportRowLike): VenueReport => ({
  id: idStr(r.id),
  venueId: idStr(r.venueId),
  category: tagToSnake(r.category.tag) as ReportCategory,
  textRedacted: r.textRedacted,
  confidence: tagToSnake(r.confidence.tag) as ReportConfidence,
  moderation: tagToSnake(r.moderation.tag) as ReportModeration,
  reportCount: r.reportCount,
  disputeCount: r.disputeCount,
  updatedAt: tsMs(r.updatedAt),
  expiresAt: tsMs(r.expiresAt),
  createdAt: tsMs(r.createdAt),
});

export const toResource = (r: ResourceRowLike): SafetyResource => ({
  id: idStr(r.id),
  type: tagToSnake(r.type.tag) as SafetyResourceType,
  name: r.name,
  lat: r.lat,
  lng: r.lng,
  hours: r.hours,
  source: r.source,
  verifiedAt: optTsMs(r.verifiedAt),
});

/**
 * Union of public and own rows, deduped by id (own row wins so the author sees
 * their Pending/Hidden state). Expired rows are dropped. Newest first.
 */
export function mergeReports(published: ReportRowLike[], own: ReportRowLike[], now: number): VenueReport[] {
  const byId = new Map<string, VenueReport>();
  for (const r of published) byId.set(idStr(r.id), toReport(r));
  for (const r of own) byId.set(idStr(r.id), toReport(r));
  return [...byId.values()]
    .filter((r) => r.expiresAt > now)
    .sort((a, b) => b.createdAt - a.createdAt);
}
