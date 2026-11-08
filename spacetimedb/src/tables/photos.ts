import { table, t } from 'spacetimedb/server';
/** Private thumbnails. The view discloses only to the owner and current group members. */
export const profilePhoto = table({ name: 'profile_photo' }, {
  identity: t.identity().primaryKey(),
  dataUrl: t.string(),
  updatedAt: t.timestamp(),
});
