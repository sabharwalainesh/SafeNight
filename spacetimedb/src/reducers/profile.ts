import { SenderError, t } from 'spacetimedb/server';
import { spacetimedb } from '../schema';
import { audit } from '../lib/auth';
import { ContactRole } from '../tables/nightout';

export const setProfile = spacetimedb.reducer(
  { displayName: t.string(), avatarEmoji: t.string() },
  (ctx, { displayName, avatarEmoji }) => {
    const name = displayName.trim();
    if (name.length === 0) throw new SenderError('Display name cannot be empty');
    if (name.length > 40) throw new SenderError('Display name too long');
    const existing = ctx.db.userProfile.identity.find(ctx.sender);
    if (existing) {
      // Migrate a number stored on the public row before the security review into the private table.
      if (existing.phoneE164 !== '' && !ctx.db.userPhone.identity.find(ctx.sender)) {
        ctx.db.userPhone.insert({ identity: ctx.sender, phoneE164: existing.phoneE164, updatedAt: ctx.timestamp });
      }
      ctx.db.userProfile.identity.update({ ...existing, displayName: name, avatarEmoji, phoneE164: '' });
    } else {
      ctx.db.userProfile.insert({
        identity: ctx.sender,
        displayName: name,
        avatarEmoji,
        phoneVerified: false,
        createdAt: ctx.timestamp,
        phoneE164: '',
      });
    }
  }
);

// Self-only: E.164 phone number used for consented SMS when Twilio is configured. Empty clears it.
// Stored in the private `user_phone` table; the public profile row never carries it.
export const setPhone = spacetimedb.reducer({ phoneE164: t.string() }, (ctx, { phoneE164 }) => {
  const value = phoneE164.trim();
  if (value.length > 0 && !/^\+[1-9]\d{6,14}$/.test(value)) {
    throw new SenderError('Phone must be in E.164 format, like +15551234567');
  }
  const existing = ctx.db.userProfile.identity.find(ctx.sender);
  if (!existing) throw new SenderError('Set up your profile first');
  if (existing.phoneE164 !== '') ctx.db.userProfile.identity.update({ ...existing, phoneE164: '' });
  const current = ctx.db.userPhone.identity.find(ctx.sender);
  if (value.length === 0) {
    if (current) ctx.db.userPhone.identity.delete(ctx.sender);
    return;
  }
  const row = { identity: ctx.sender, phoneE164: value, updatedAt: ctx.timestamp };
  if (current) ctx.db.userPhone.identity.update(row);
  else ctx.db.userPhone.insert(row);
});

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

// Self-only, atomic: `contactIds` must be exactly the caller's current contact ids (same set, no
// duplicates). Priorities become 1..n in the given order within one transaction, so the backup
// ladder is never half-updated.
export const reorderTrustedContacts = spacetimedb.reducer({ contactIds: t.array(t.u64()) }, (ctx, { contactIds }) => {
  const mine = [...ctx.db.trustedContact.owner.filter(ctx.sender)];
  const mineIds = new Set(mine.map(c => c.id));
  const given = new Set(contactIds);
  const matches =
    contactIds.length === mine.length &&
    given.size === contactIds.length &&
    contactIds.every(id => mineIds.has(id));
  if (!matches) throw new SenderError('Contact list does not match');
  contactIds.forEach((id, index) => {
    const row = ctx.db.trustedContact.id.find(id)!;
    ctx.db.trustedContact.id.update({ ...row, priority: index + 1 });
  });
  audit(ctx, 'reorder_trusted_contacts', `count=${contactIds.length}`);
});

export const setProfilePhoto = spacetimedb.reducer({ dataUrl: t.string() }, (ctx, { dataUrl }) => {
  if (!ctx.db.userProfile.identity.find(ctx.sender)) throw new SenderError('Save your profile first');
  if (dataUrl === '') { ctx.db.profilePhoto.identity.delete(ctx.sender); return; }
  if (dataUrl.length > 100_000 || !/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]+={0,2}$/.test(dataUrl)) {
    throw new SenderError('Use a JPEG profile thumbnail smaller than 75 KB');
  }
  const row = { identity: ctx.sender, dataUrl, updatedAt: ctx.timestamp };
  if (ctx.db.profilePhoto.identity.find(ctx.sender)) ctx.db.profilePhoto.identity.update(row);
  else ctx.db.profilePhoto.insert(row);
});
