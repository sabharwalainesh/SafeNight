import { createElement, useMemo, type ReactNode } from 'react';
import { Identity, SenderError } from 'spacetimedb';
import { useReducer, useSpacetimeDB, useTable } from 'spacetimedb/react';
import { identityStr } from '../../night-out/live/convert';
import { reducers, tables } from '../../../module_bindings';
import { ProfileContext, type ContactRole, type ProfileActions, type ProfileApi, type TrustedContact } from '../api';
import { privacyArgs, roleTag, sortContacts, toContact, toPrivacy, toProfile, toPhone, reorderIds } from './convert';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = any;

function toError(e: unknown): Error {
  if (e instanceof SenderError) return new Error(e.message);
  if (e instanceof Error) return e;
  return new Error(String(e));
}
async function wrap<T>(f: () => Promise<T>): Promise<T> {
  try {
    return await f();
  } catch (e) {
    throw toError(e);
  }
}
const clampPriority = (n: number) => Math.min(255, Math.max(1, Math.round(n)));

export function ProfileLiveProvider(props: { children?: ReactNode }) {
  const { identity } = useSpacetimeDB();
  const me = identity?.toHexString() ?? '';

  const [profileRows, pReady] = useTable(tables.userProfile);
  const [contactRows, cReady] = useTable(tables.myContacts);
  const [phoneRows, phReady] = useTable(tables.myPhone);
  const [privacyRows, vReady] = useTable(tables.myPrivacySettings);
  const [photoRows] = useTable(tables.visibleProfilePhotos);

  const rSetProfile = useReducer(reducers.setProfile);
  const rSetPhone = useReducer(reducers.setPhone);
  const rReorder = useReducer(reducers.reorderTrustedContacts);
  const rAdd = useReducer(reducers.addTrustedContact);
  const rRemove = useReducer(reducers.removeTrustedContact);
  const rPrivacy = useReducer(reducers.setPrivacySettings);
  const rDelete = useReducer(reducers.deleteMyData);
  const rPhoto = useReducer(reducers.setProfilePhoto);

  const myPhone = toPhone((phoneRows as Row[])[0]);
  const profiles = (profileRows as Row[]).map(r => toProfile(r, identityStr(r.identity) === me ? myPhone : ''));
  const nameOf = (id: string) => profiles.find((p) => p.userId === id)?.displayName;
  const contacts = sortContacts((contactRows as Row[]).map((r) => toContact(r, nameOf)));

  const ref = useMemo(() => ({ contacts: [] as TrustedContact[] }), []);
  ref.contacts = contacts;

  const actions = useMemo<ProfileActions>(() => {
    const add = (contact: string, role: ContactRole, consent: boolean, priority: number) =>
      rAdd({ contact: Identity.fromString(contact), role: roleTag(role), messagingConsent: consent, priority: clampPriority(priority) });
    return {
      setProfile: (displayName, avatarEmoji) => wrap(() => rSetProfile({ displayName: displayName.trim(), avatarEmoji })),
      setProfilePhoto: (dataUrl) => wrap(() => rPhoto({ dataUrl })),
      setPhone: (e164) => wrap(() => rSetPhone({ phoneE164: e164.trim() })),
      addTrustedContact: (contact, role, consent, priority) => wrap(() => add(contact, role, consent, priority)),
      removeTrustedContact: (id) => wrap(() => rRemove({ id: BigInt(id) })),
      moveContact: (id, dir) =>
        wrap(async () => {
          const ids = reorderIds(ref.contacts, id, dir);
          if (ids) await rReorder({ contactIds: ids });
        }),
      setPrivacyDefaults: (p) => wrap(() => rPrivacy(privacyArgs(p))),
      deleteMyData: () => wrap(() => rDelete()),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const api: ProfileApi = {
    me,
    ready: !!identity && pReady && cReady && vReady && phReady,
    mocked: false,
    profile: profiles.find((p) => p.userId === me) ?? null,
    contacts,
    knownPeople: profiles.map((p) => ({ userId: p.userId, displayName: p.displayName })),
    photos: Object.fromEntries((photoRows as Row[]).map((r) => [identityStr(r.identity), String(r.dataUrl)])),
    privacy: toPrivacy((privacyRows as Row[])[0]),
    privacySaved: (privacyRows as Row[]).length > 0,
    actions,
  };
  return createElement(ProfileContext.Provider, { value: api }, props.children);
}
