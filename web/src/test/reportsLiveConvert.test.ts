import { describe, expect, it } from 'vitest';
import { Timestamp } from 'spacetimedb';
import { mergeReports, toReport, toResource, toVenue } from '../features/reports/live/convert';

const ts = (ms: number) => Timestamp.fromDate(new Date(ms));
const row = (id: bigint, over: Record<string, unknown> = {}) => ({
  id, venueId: 2n, category: { tag: 'BlockedExit' }, textRedacted: 't', confidence: { tag: 'Corroborated' },
  moderation: { tag: 'Published' }, reportCount: 3, disputeCount: 1,
  expiresAt: ts(10_000), createdAt: ts(100 + Number(id)), updatedAt: ts(500), ...over,
});

describe('reports live converters', () => {
  it('maps enums, ids and times', () => {
    expect(toReport(row(7n))).toEqual({
      id: '7', venueId: '2', category: 'blocked_exit', textRedacted: 't', confidence: 'corroborated',
      moderation: 'published', reportCount: 3, disputeCount: 1, updatedAt: 500, expiresAt: 10_000, createdAt: 107,
    });
    expect(toResource({ id: 1n, type: { tag: 'TransitStop' }, name: 'n', lat: 1, lng: 2, hours: 'h', source: 's', verifiedAt: ts(9) }))
      .toMatchObject({ id: '1', type: 'transit_stop', verifiedAt: 9 });
    expect(toVenue({ id: 3n, name: 'V', approxLat: 1, approxLng: 2, source: 's', verifiedAt: undefined }).verifiedAt).toBeNull();
  });

  it('dedupes by id, own row wins, drops expired, newest first', () => {
    const pub = [row(1n), row(2n), row(4n, { expiresAt: ts(50) })];
    const own = [row(2n, { moderation: { tag: 'Pending' } }), row(3n, { moderation: { tag: 'Hidden' } })];
    const out = mergeReports(pub, own, 1000);
    expect(out.map((r) => r.id)).toEqual(['3', '2', '1']);
    expect(out.find((r) => r.id === '2')?.moderation).toBe('pending');
    expect(out.find((r) => r.id === '3')?.moderation).toBe('hidden');
  });

  it('never leaks reporter fields', () => {
    const leaky = { ...row(1n), reporter: 'abc', submitter: 'abc', owner: 'abc' };
    const out = mergeReports([leaky], [leaky], 0);
    expect(Object.keys(out[0]).sort()).toEqual(
      ['category', 'confidence', 'createdAt', 'disputeCount', 'expiresAt', 'id', 'moderation', 'reportCount', 'textRedacted', 'updatedAt', 'venueId'],
    );
  });
});
