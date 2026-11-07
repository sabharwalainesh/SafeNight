import { SenderError, t } from 'spacetimedb/server';
import { spacetimedb } from '../schema';

const MAX_NOTE_LENGTH = 200;

export const ping = spacetimedb.reducer({ note: t.string() }, (ctx, { note }) => {
  if (note.length > MAX_NOTE_LENGTH) {
    throw new SenderError('Note too long');
  }
  ctx.db.auditEvent.insert({
    id: 0n,
    actor: ctx.sender,
    action: 'ping',
    resource: 'system',
    decision: 'allow',
    at: ctx.timestamp,
  });
});
