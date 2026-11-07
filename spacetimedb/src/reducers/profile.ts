import { SenderError, t } from 'spacetimedb/server';
import { spacetimedb } from '../schema';
import { ContactRole } from '../tables/nightout';

export const setProfile = spacetimedb.reducer(
  { displayName: t.string(), avatarEmoji: t.string() },
  (ctx, { displayName, avatarEmoji }) => {
    const name = displayName.trim();
    if (name.length === 0) throw new SenderError('Display name cannot be empty');
    if (name.length > 40) throw new SenderError('Display name too long');
    const existing = ctx.db.userProfile.identity.find(ctx.sender);
    if (existing) {
      ctx.db.userProfile.identity.update({ ...existing, displayName: name, avatarEmoji });
    } else {
      ctx.db.userProfile.insert({
        identity: ctx.sender,
        displayName: name,
        avatarEmoji,
        phoneVerified: false,
        createdAt: ctx.timestamp,
      });
    }
  }
);

export const addTrustedContact = spacetimedb.reducer(
  { contact: t.identity(), role: ContactRole, messagingConsent: t.bool(), priority: t.u8() },
  (ctx, { contact, role, messagingConsent, priority }) => {
    if (contact.isEqual(ctx.sender)) throw new SenderError('Cannot add yourself as a contact');
    if (!ctx.db.userProfile.identity.find(contact)) {
      throw new SenderError('Contact has no SafeNight profile');
    }
    for (const existing of ctx.db.trustedContact.owner.filter(ctx.sender)) {
      if (existing.contact.isEqual(contact)) throw new SenderError('Contact already added');
    }
    ctx.db.trustedContact.insert({
      id: 0n,
      owner: ctx.sender,
      contact,
      role,
      messagingConsent,
      priority,
      createdAt: ctx.timestamp,
    });
  }
);

export const removeTrustedContact = spacetimedb.reducer({ id: t.u64() }, (ctx, { id }) => {
  const row = ctx.db.trustedContact.id.find(id);
  // Do not reveal whether someone else's contact row exists.
  if (!row || !row.owner.isEqual(ctx.sender)) throw new SenderError('Contact not found');
  ctx.db.trustedContact.id.delete(id);
});
