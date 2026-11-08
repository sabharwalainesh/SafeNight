import { createElement, useMemo, type ReactNode } from 'react';
import { Identity, SenderError } from 'spacetimedb';
import { useReducer, useSpacetimeDB, useTable } from 'spacetimedb/react';
import { reducers, tables } from '../../../module_bindings';
import { ProfileContext, type ContactRole, type ProfileActions, type ProfileApi, type TrustedContact } from '../api';
import { planMove, privacyArgs, roleTag, sortContacts, toContact, toPrivacy, toProfile } from './convert';

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
  const [privacyRows, vReady] = useTable(tables.myPrivacySettings);

  const rSetProfile = useReducer(reducers.setProfile);
  const rSetPhone = useReducer(reducers.setPhone);
  const rAdd = useReducer(reducers.addTrustedContact);
  const rRemove = useReducer(reducers.removeTrustedContact);
  const rPrivacy = useReducer(reducers.setPrivacySettings);
  const rDelete = useReducer(reducers.deleteMyData);

  const profiles = (profileRows as Row[]).map(r => toProfile(r, me));
  const nameOf = (id: string) => profiles.find((p) => p.userId === id)?.displayName;
  const contacts = sortContacts((contactRows as Row[]).map((r) => toContact(r, nameOf)));

  const ref = useMemo(() => ({ contacts: [] as TrustedContact[] }), []);
  ref.contacts = contacts;

  const actions = useMemo<ProfileActions>(() => {
    const add = (contact: string, role: ContactRole, consent: boolean, priority: number) =>
      rAdd({ contact: Identity.fromString(contact), role: roleTag(role), messagingConsent: consent, priority: clampPriority(priority) });
    return {
      setProfile: (displayName, avatarEmoji) => wrap(() => rSetProfile({ displayName: displayName.trim(), avatarEmoji })),
      setPhone: (e164) => wrap(() => rSetPhone({ phoneE164: e164.trim() })),
      addTrustedContact: (contact, role, consent, priority) => wrap(() => add(contact, role, consent, priority)),
      removeTrustedContact: (id) => wrap(() => rRemove({ id: BigInt(id) })),
      moveContact: (id, dir) =>
        wrap(async () => {
          const m = planMove(ref.contacts, id, dir);
          if (!m) return;
          // No reorder reducer: remove both rungs, then re-add with swapped priorities.
          await rRemove({ id: BigInt(m.a.id) });
          await rRemove({ id: BigInt(m.b.id) });
          await add(m.a.contact, m.a.role, m.a.messagingConsent, m.aPriority);
          await add(m.b.contact, m.b.role, m.b.messagingConsent, m.bPriority);
        }),
      setPrivacyDefaults: (p) => wrap(() => rPrivacy(privacyArgs(p))),
      deleteMyData: () => wrap(() => rDelete()),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const api: ProfileApi = {
    me,
    ready: !!identity && pReady && cReady && vReady,
    mocked: false,
    profile: profiles.find((p) => p.userId === me) ?? null,
    contacts,
    knownPeople: profiles.map((p) => ({ userId: p.userId, displayName: p.displayName })),
    privacy: toPrivacy((privacyRows as Row[])[0]),
    privacySaved: (privacyRows as Row[]).length > 0,
    actions,
  };
  return createElement(ProfileContext.Provider, { value: api }, props.children);
}
