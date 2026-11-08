// MOCK until C4-A bindings: ProfileApi backed by localStorage + BroadcastChannel.
import { createElement, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { DEFAULT_PRIVACY, ProfileContext, type ProfileActions, type ProfileApi, type UserId } from '../api';
import { getSnapshot, mutate, subscribe, type MockState } from './store';

export { DEFAULT_PRIVACY };

function normalize(s: MockState, me: UserId) {
  const mine = s.contacts.filter((c) => c.owner === me).sort((a, b) => a.priority - b.priority || a.createdAt - b.createdAt);
  mine.forEach((c, i) => {
    c.priority = i + 1;
  });
}

function makeActions(me: UserId): ProfileActions {
  const run = async <T,>(fn: (s: MockState, id: () => string) => T): Promise<T> => mutate(fn);
  return {
    setProfile: (name, emoji) =>
      run((s) => {
        const n = name.trim();
        if (!n) throw new Error('Name is required');
        const p = s.profiles.find((x) => x.userId === me);
        if (p) {
          p.displayName = n;
          p.avatarEmoji = emoji;
        } else s.profiles.push({ userId: me, displayName: n, avatarEmoji: emoji, phoneVerified: false, phone: '' });
      }),
    setProfilePhoto: (dataUrl) =>
      run((s) => {
        if (!s.profiles.some((x) => x.userId === me)) throw new Error('Save your profile first');
        s.photos = { ...(s.photos ?? {}) };
        if (dataUrl) s.photos[me] = dataUrl;
        else delete s.photos[me];
      }),
    addTrustedContact: (contact, role, messagingConsent, priority) =>
      run((s, id) => {
        if (contact === me) throw new Error("You can't add yourself");
        const person = s.profiles.find((x) => x.userId === contact);
        if (!person) throw new Error('That person has no SafeNight profile');
        if (s.contacts.some((c) => c.owner === me && c.contact === contact)) throw new Error('Already a trusted contact');
        s.contacts.push({
          id: id(),
          owner: me,
          contact,
          contactName: person.displayName,
          role,
          messagingConsent,
          priority: priority - 0.5,
          createdAt: Date.now(),
        });
        normalize(s, me);
      }),
    removeTrustedContact: (cid) =>
      run((s) => {
        const c = s.contacts.find((x) => x.id === cid);
        if (!c || c.owner !== me) throw new Error('Not your contact');
        s.contacts = s.contacts.filter((x) => x.id !== cid);
        normalize(s, me);
      }),
    moveContact: (cid, dir) =>
      run((s) => {
        const c = s.contacts.find((x) => x.id === cid);
        if (!c || c.owner !== me) throw new Error('Not your contact');
        normalize(s, me);
        const mine = s.contacts.filter((x) => x.owner === me).sort((a, b) => a.priority - b.priority);
        const i = mine.findIndex((x) => x.id === cid);
        const j = dir === 'up' ? i - 1 : i + 1;
        if (j < 0 || j >= mine.length) return;
        const t = mine[i].priority;
        mine[i].priority = mine[j].priority;
        mine[j].priority = t;
      }),
    setPhone: (e164) =>
      run((s) => {
        const v = e164.trim();
        if (v && !/^\+[1-9]\d{6,14}$/.test(v)) throw new Error('Phone must be E.164, like +15551234567');
        const p = s.profiles.find((x) => x.userId === me);
        if (!p) throw new Error('Save a profile first');
        p.phone = v;
      }),
    setPrivacyDefaults: (p) =>
      run((s) => {
        s.privacy[me] = { ...p };
      }),
    deleteMyData: () =>
      run((s) => {
        if (s.photos?.[me]) {
          s.photos = { ...s.photos };
          delete s.photos[me];
        }
        s.profiles = s.profiles.filter((x) => x.userId !== me);
        const affected = new Set(s.contacts.filter((x) => x.contact === me && x.owner !== me).map((x) => x.owner));
        s.contacts = s.contacts.filter((x) => x.owner !== me && x.contact !== me);
        affected.forEach((o) => normalize(s, o));
        delete s.privacy[me];
      }),
  };
}

export function useProfileMock(me: UserId, _displayName: string): ProfileApi {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const actions = useMemo(() => makeActions(me), [me]);
  return {
    me,
    ready: true,
    mocked: true,
    profile: state.profiles.find((p) => p.userId === me) ?? null,
    contacts: state.contacts.filter((c) => c.owner === me).sort((a, b) => a.priority - b.priority),
    photos: state.photos ?? {},
    knownPeople: state.profiles.map((p) => ({ userId: p.userId, displayName: p.displayName })),
    privacy: { ...DEFAULT_PRIVACY, ...(state.privacy[me] ?? {}) },
    privacySaved: !!state.privacy[me],
    actions,
  };
}

export function ProfileMockProvider(props: { me: UserId; displayName: string; children?: ReactNode }) {
  const api = useProfileMock(props.me, props.displayName);
  return createElement(ProfileContext.Provider, { value: api }, props.children);
}
