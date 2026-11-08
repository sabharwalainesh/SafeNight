import { describe, expect, it, vi } from 'vitest';

vi.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    default: {
      getAllKeys: async () => [...store.keys()],
      multiGet: async (keys: string[]) => keys.map((k) => [k, store.get(k) ?? null] as [string, string | null]),
      setItem: async (k: string, v: string) => void store.set(k, v),
      removeItem: async (k: string) => void store.delete(k),
      multiRemove: async (keys: string[]) => keys.forEach((k) => store.delete(k)),
    },
  };
});

describe('localStorage shim', () => {
  it('behaves like Storage and persists through AsyncStorage with a prefix', async () => {
    const { memoryStorage } = await import('../localStorageShim');
    memoryStorage.setItem('ws://x:3000/safenight/sam/auth_token', 'tok');
    expect(memoryStorage.getItem('ws://x:3000/safenight/sam/auth_token')).toBe('tok');
    expect(memoryStorage.getItem('missing')).toBeNull();
    expect(memoryStorage.length).toBe(1);
    await new Promise((r) => setTimeout(r, 0));
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    expect(await AsyncStorage.getAllKeys()).toEqual(['ls:ws://x:3000/safenight/sam/auth_token']);
    memoryStorage.removeItem('ws://x:3000/safenight/sam/auth_token');
    expect(memoryStorage.length).toBe(0);
  });
});
