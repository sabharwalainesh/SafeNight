// MOCK until C4-A bindings: in-memory ReportsApi.
import { createElement, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ReportsContext, type ReportCategory, type ReportsApi, type VenueReport } from '../api';
import { getSnapshot, mutate, subscribe } from './store';

const MODERATION_DELAY_MS = 5000;
const MERGE_WINDOW_MS = 30 * 60 * 1000;
const HOUR = 3600 * 1000;
const MAX_TEXT = 280;

export function redact(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[redacted]')
    .replace(/(^|\s)@\w+/g, '$1[redacted]')
    .replace(/\+?\d[\d\s().-]{6,}\d/g, '[redacted]');
}

export function ReportsMockProvider({ children, me }: { children: ReactNode; me: string }) {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const api = useMemo<ReportsApi>(() => {
    const reports: VenueReport[] = [];
    for (const r of state.reports) {
      if (r.moderation === 'hidden' || r.expiresAt <= now) continue;
      const published = now - r.createdAt >= MODERATION_DELAY_MS;
      if (!published && !state.submitters[r.id]?.includes(me)) continue;
      reports.push({ ...r, moderation: published ? 'published' : 'pending' });
    }
    reports.sort((a, b) => b.createdAt - a.createdAt);
    return {
      ready: true,
      mocked: true,
      venues: state.venues,
      reports,
      resources: state.resources,
      actions: {
        async submitReport(venueId: string, category: ReportCategory, text: string) {
          const clean = text.trim();
          if (clean.length > MAX_TEXT) throw new Error(`Text must be ${MAX_TEXT} characters or fewer`);
          mutate((s, nextId) => {
            if (!s.venues.some((v) => v.id === venueId)) throw new Error('Choose a venue');
            const t = Date.now();
            const existing = s.reports.find(
              (r) =>
                r.venueId === venueId &&
                r.category === category &&
                r.moderation !== 'hidden' &&
                r.expiresAt > t &&
                t - r.createdAt <= MERGE_WINDOW_MS,
            );
            if (existing) {
              const subs = (s.submitters[existing.id] ??= []);
              if (subs.includes(me)) return;
              subs.push(me);
              existing.reportCount += 1;
              if (subs.length >= 2 && existing.confidence === 'unverified') existing.confidence = 'corroborated';
              return;
            }
            const id = nextId();
            const ttl = category === 'drink_tampering' || category === 'blocked_exit' ? 6 * HOUR : 3 * HOUR;
            s.reports.push({
              id,
              venueId,
              category,
              textRedacted: redact(clean),
              confidence: 'unverified',
              moderation: 'pending',
              reportCount: 1,
              expiresAt: t + ttl,
              createdAt: t,
            });
            s.submitters[id] = [me];
          });
        },
      },
    };
  }, [state, now, me]);

  return createElement(ReportsContext.Provider, { value: api }, children);
}
