// Client-side contract for the Reports tab. Mirrors the PLANNED backend; ids
// are strings, times are epoch ms. Reports carry NO reporter identity.
import { createContext, useContext } from 'react';

export type EpochMs = number;

export type Venue = {
  id: string;
  name: string;
  approxLat: number;
  approxLng: number;
  source: string;
  verifiedAt: EpochMs | null;
};

export type ReportCategory =
  | 'crowding'
  | 'blocked_exit'
  | 'aggressive_behavior'
  | 'drink_tampering'
  | 'water_available'
  | 'medical_staff'
  | 'lighting'
  | 'unsafe_pickup'
  | 'other';

export type ReportConfidence = 'unverified' | 'corroborated' | 'verified' | 'disputed';
export type ReportModeration = 'pending' | 'published' | 'hidden';

export type VenueReport = {
  id: string;
  venueId: string;
  category: ReportCategory;
  textRedacted: string;
  confidence: ReportConfidence;
  moderation: ReportModeration;
  reportCount: number;
  disputeCount: number;
  updatedAt: EpochMs;
  expiresAt: EpochMs;
  createdAt: EpochMs;
};

export type SafetyResourceType = 'campus_safety' | 'staffed_venue' | 'medical' | 'transit_stop' | 'pickup_point';

export type SafetyResource = {
  id: string;
  type: SafetyResourceType;
  name: string;
  lat: number;
  lng: number;
  hours: string;
  source: string;
  verifiedAt: EpochMs | null;
};

export type ReportsApi = {
  ready: boolean;
  mocked: boolean;
  venues: Venue[];
  /** Published plus the caller's own pending; never hidden, never expired. */
  reports: VenueReport[];
  resources: SafetyResource[];
  actions: {
    submitReport(venueId: string, category: ReportCategory, text: string): Promise<void>;
    vote(reportId: string, kind: 'corroborate' | 'dispute'): Promise<void>;
    /** Creates a venue (coordinates already rounded by the caller) and resolves its id. */
    createVenue(name: string, approxLat: number, approxLng: number): Promise<string>;
  };
};

export const ReportsContext = createContext<ReportsApi | null>(null);

export function useReports(): ReportsApi {
  const v = useContext(ReportsContext);
  if (!v) throw new Error('useReports must be used inside a ReportsContext provider');
  return v;
}
