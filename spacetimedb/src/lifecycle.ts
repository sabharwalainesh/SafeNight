import { spacetimedb } from './schema';
import { ensureSweepScheduled } from './lib/safety';
import { ensureCommunitySchedules, seedResources } from './lib/community';
import { ensureMeetupExpiryScheduled } from './lib/meetup';
import { MODULE_VERSION } from './lib/constants';

export const init = spacetimedb.init(ctx => {
  ctx.db.config.insert({ id: 0, owner: ctx.sender, createdAt: ctx.timestamp });
  ctx.db.auditEvent.insert({
    id: 0n,
    actor: ctx.sender,
    action: 'init',
    resource: 'system',
    decision: 'allow',
    at: ctx.timestamp,
  });
  ensureSweepScheduled(ctx);
  ensureCommunitySchedules(ctx);
  ensureMeetupExpiryScheduled(ctx);
  seedResources(ctx);
  ctx.db.moduleMeta.insert({ id: 0, moduleVersion: MODULE_VERSION, publishedAt: ctx.timestamp });
});

export const onConnect = spacetimedb.clientConnected(ctx => {
  const existing = ctx.db.clientPresence.identity.find(ctx.sender);
  if (existing) {
    ctx.db.clientPresence.identity.update({
      ...existing,
      online: true,
      lastSeenAt: ctx.timestamp,
      connectionCount: existing.connectionCount + 1,
    });
  } else {
    ctx.db.clientPresence.insert({
      identity: ctx.sender,
      online: true,
      lastSeenAt: ctx.timestamp,
      connectionCount: 1,
    });
  }
});

export const onDisconnect = spacetimedb.clientDisconnected(ctx => {
  const existing = ctx.db.clientPresence.identity.find(ctx.sender);
  if (!existing) {
    console.warn(`Disconnect for unknown identity ${ctx.sender}`);
    return;
  }
  const remaining = existing.connectionCount > 0 ? existing.connectionCount - 1 : 0;
  ctx.db.clientPresence.identity.update({
    ...existing,
    online: remaining > 0,
    lastSeenAt: ctx.timestamp,
    connectionCount: remaining,
  });
});
