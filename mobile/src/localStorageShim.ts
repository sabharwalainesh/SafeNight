// Synchronous in-memory `localStorage` for React Native, persisted through
// AsyncStorage. The web data layer stores the per-persona auth token and alert
// dismissals in localStorage; hydrate() must finish before the app connects.
import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'ls:';

class MemoryStorage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  key(i: number): string | null {
    return [...this.map.keys()][i] ?? null;
  }
  getItem(k: string): string | null {
    return this.map.has(k) ? (this.map.get(k) as string) : null;
  }
  setItem(k: string, v: string): void {
    const s = String(v);
    this.map.set(k, s);
    AsyncStorage.setItem(PREFIX + k, s).catch(() => {});
  }
  removeItem(k: string): void {
    this.map.delete(k);
    AsyncStorage.removeItem(PREFIX + k).catch(() => {});
  }
  clear(): void {
    const keys = [...this.map.keys()];
    this.map.clear();
    AsyncStorage.multiRemove(keys.map((k) => PREFIX + k)).catch(() => {});
  }
  /** Load persisted entries; called once at startup. */
  async hydrate(): Promise<void> {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(PREFIX));
    if (keys.length === 0) return;
    const pairs = await AsyncStorage.multiGet(keys);
    for (const [k, v] of pairs) if (v !== null) this.map.set(k.slice(PREFIX.length), v);
  }
}

export const memoryStorage = new MemoryStorage();

/** Install the shim unless a real localStorage exists (Expo web). */
export function installLocalStorage(): void {
  const g = globalThis as Record<string, unknown>;
  if (typeof g.localStorage === 'undefined') g.localStorage = memoryStorage;
}

export async function hydrateLocalStorage(): Promise<void> {
  const g = globalThis as Record<string, unknown>;
  if (g.localStorage === memoryStorage) await memoryStorage.hydrate();
}
