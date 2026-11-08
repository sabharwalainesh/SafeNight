import { t, type Infer } from 'spacetimedb/server';
import { spacetimedb } from '../schema';
import type { Identity } from 'spacetimedb';
import { meetup, meetupPosition, MeetupStatus } from '../tables/meetup';

const meetupRow = t.row('MeetupRow', {
  id: t.u64().primaryKey(),
  incidentId: t.u64(),
  sessionId: t.u64(),
  requester: t.identity(),
  requesterName: t.string(),
  helper: t.identity(),
  helperName: t.string(),
  status: MeetupStatus,
  startedAt: t.timestamp(),
  arrivedAt: t.timestamp().optional(),
  expiresAt: t.timestamp(),
});
type MeetupValue = Infer<typeof meetupRow>;

// Per-user: meetups where the caller is requester or helper, plus every meetup on incidents the
// caller participates in (so buddies can see "Jordan is already coming" and not pile on).
export const myMeetups = spacetimedb.view({ name: 'my_meetups', public: true }, t.array(meetupRow), ctx => {
  const rows: MeetupValue[] = [];
  const seen = new Set<bigint>();
  const name = (who: Identity) => ctx.db.userProfile.identity.find(who)?.displayName ?? 'Unknown';
  const push = (mu: Infer<typeof meetup.rowType>) => {
    if (seen.has(mu.id)) return;
    seen.add(mu.id);
    rows.push({
      id: mu.id,
      incidentId: mu.incidentId,
      sessionId: mu.sessionId,
      requester: mu.requester,
      requesterName: name(mu.requester),
      helper: mu.helper,
      helperName: name(mu.helper),
      status: mu.status,
      startedAt: mu.startedAt,
      arrivedAt: mu.arrivedAt,
      expiresAt: mu.expiresAt,
    });
  };
  for (const mu of ctx.db.meetup.requester.filter(ctx.sender)) push(mu);
  for (const mu of ctx.db.meetup.helper.filter(ctx.sender)) push(mu);
  for (const p of ctx.db.incidentParticipant.userId.filter(ctx.sender)) {
    for (const mu of ctx.db.meetup.incidentId.filter(p.incidentId)) push(mu);
  }
  return rows;
});

// Per-user: the live compass position of my trip partner, for meetups in progress where I am the
// requester or helper, and only while the partner's precise-location grant to me is unrevoked.
export const myMeetupPositions = spacetimedb.view(
  { name: 'my_meetup_positions', public: true },
  t.array(meetupPosition.rowType),
  ctx => {
    const out: Infer<typeof meetupPosition.rowType>[] = [];
    const mine = [...ctx.db.meetup.requester.filter(ctx.sender), ...ctx.db.meetup.helper.filter(ctx.sender)];
    for (const mu of mine) {
      if (mu.status.tag !== 'coming') continue;
      const partner = mu.requester.isEqual(ctx.sender) ? mu.helper : mu.requester;
      const granted = [...ctx.db.consentGrant.bySubjectRecipient.filter([partner, ctx.sender])].some(
        g => g.sessionId === mu.sessionId && g.scope.tag === 'location_precise' && g.revokedAt === undefined
      );
      if (!granted) continue;
      for (const p of ctx.db.meetupPosition.meetupId.filter(mu.id)) {
        if (p.userId.isEqual(partner)) out.push(p);
      }
    }
    return out;
  }
);
