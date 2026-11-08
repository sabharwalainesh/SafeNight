import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_DB, DEFAULT_HOST, isPersonaId, normalizeWsHost, type PersonaId } from './settings';

export type Settings = { host: string; db: string; persona: PersonaId | null };
const KEY = 'safenight.settings.v1';

export async function loadSettings(): Promise<Settings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { host: DEFAULT_HOST, db: DEFAULT_DB, persona: null };
    const j = JSON.parse(raw) as Partial<Settings>;
    return {
      host: normalizeWsHost(typeof j.host === 'string' ? j.host : DEFAULT_HOST),
      db: typeof j.db === 'string' && j.db.trim() ? j.db.trim() : DEFAULT_DB,
      persona: isPersonaId(j.persona) ? j.persona : null,
    };
  } catch {
    return { host: DEFAULT_HOST, db: DEFAULT_DB, persona: null };
  }
}

export async function saveSettings(s: Settings): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(s));
}
