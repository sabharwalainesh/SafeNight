import { SenderError, t } from 'spacetimedb/server';
import { spacetimedb } from '../schema';
import { audit } from '../lib/auth';
import { isOwner, requireDemoAllowed } from '../lib/community';
import { isPersonaId, resetDemoGroup, setupDemoGroup } from '../lib/demo';

/**
 * Judge demo: bind the caller's identity to a persona id (alex, sam, maya, jordan) so another tab can
 * build the group. Re-registering replaces the previous identity for that persona (tabs may reset
 * their tokens). Also creates the caller's profile when missing.
 */
export const demoRegisterPersona = spacetimedb.reducer(
  { personaId: t.string(), displayName: t.string(), avatarEmoji: t.string() },
  (ctx, { personaId, displayName, avatarEmoji }) => {
    requireDemoAllowed(ctx);
    const id = personaId.trim().toLowerCase();
    if (!isPersonaId(id)) throw new SenderError('Unknown persona id; use alex, sam, maya or jordan');
    const name = displayName.trim();
    if (name.length === 0 || name.length > 40) throw new SenderError('Display name must be 1 to 40 characters');

    if (!ctx.db.userProfile.identity.find(ctx.sender)) {
      ctx.db.userProfile.insert({
        identity: ctx.sender,
        displayName: name,
        avatarEmoji,
        phoneVerified: false,
        createdAt: ctx.timestamp,
        phoneE164: '',
      });
    }
    // The same identity can hold only one persona: drop any other persona row it occupied.
    const held = ctx.db.demoPersona.identity.find(ctx.sender);
    if (held && held.personaId !== id) ctx.db.demoPersona.personaId.delete(held.personaId);
    const row = { personaId: id, identity: ctx.sender, displayName: name, avatarEmoji, registeredAt: ctx.timestamp };
    if (ctx.db.demoPersona.personaId.find(id)) ctx.db.demoPersona.personaId.update(row);
    else ctx.db.demoPersona.insert(row);
    audit(ctx, 'demo_register_persona', `demo_persona:${id}`);
  }
);

/** Only someone who is themselves one of the four demo personas (or the owner) may build or reset the group. */
function requireDemoParticipant(ctx: Parameters<typeof requireDemoAllowed>[0]) {
  if (isOwner(ctx)) return;
  if (!ctx.db.demoPersona.identity.find(ctx.sender)) throw new SenderError('Register as a demo persona first');
}

/** Judge demo: create (or reuse) the four-person group with roles, consents, and simulated locations. */
export const demoSetupGroup = spacetimedb.reducer({ name: t.string() }, (ctx, { name }) => {
  requireDemoAllowed(ctx);
  requireDemoParticipant(ctx);
  const sessionId = setupDemoGroup(ctx, name);
  audit(ctx, 'demo_setup_group', `night_session:${sessionId}`);
});

/** Judge demo: end the demo group's session(s) and cancel their open incidents; personas stay registered. */
export const demoResetGroup = spacetimedb.reducer(ctx => {
  requireDemoAllowed(ctx);
  requireDemoParticipant(ctx);
  const ended = resetDemoGroup(ctx);
  audit(ctx, 'demo_reset_group', `ended:${ended}`);
});
