import { t } from 'spacetimedb/server';
import { spacetimedb } from '../schema';
import { userPrivacySettings, venueReport } from '../tables/community';

// Shared by every subscriber: published, unexpired-by-sweep venue reports. Reporter identity is not in the row.
export const publishedVenueReports = spacetimedb.anonymousView(
  { name: 'published_venue_reports', public: true },
  t.array(venueReport.rowType),
  // Index lookup on the enum column (the query builder cannot compare enum literals).
  ctx => Array.from(ctx.db.venueReport.moderation.filter({ tag: 'published' }))
);

// The caller's own reports in every moderation state (so they can see "pending review").
export const myVenueReports = spacetimedb.view(
  { name: 'my_venue_reports', public: true },
  t.array(venueReport.rowType),
  ctx => {
    const rows = [];
    const seen = new Set<bigint>();
    for (const a of ctx.db.venueReportAuthor.author.filter(ctx.sender)) {
      if (seen.has(a.reportId)) continue;
      seen.add(a.reportId);
      const r = ctx.db.venueReport.id.find(a.reportId);
      if (r) rows.push(r);
    }
    return rows;
  }
);

// The caller's privacy defaults (at most one row).
export const myPrivacySettings = spacetimedb.view(
  { name: 'my_privacy_settings', public: true },
  t.option(userPrivacySettings.rowType),
  ctx => ctx.db.userPrivacySettings.identity.find(ctx.sender) ?? undefined
);
