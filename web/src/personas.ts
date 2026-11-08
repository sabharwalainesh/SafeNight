// The four demo personas. Each one gets its own SpacetimeDB identity on this
// device because the auth token is stored under a per-persona key (see main.tsx).

export type PersonaId = 'sam' | 'alex' | 'maya' | 'jordan';

export type Persona = {
  id: PersonaId;
  name: string;
  roleHint: string;
  accent: string;
};

export const PERSONAS: readonly Persona[] = [
  { id: 'sam', name: 'Sam', roleHint: 'Designated driver', accent: '#f6c445' },
  { id: 'alex', name: 'Alex', roleHint: 'Organizer', accent: '#5fb3ff' },
  { id: 'maya', name: 'Maya', roleHint: 'Primary safety buddy', accent: '#7ee2a8' },
  { id: 'jordan', name: 'Jordan', roleHint: 'Backup buddy', accent: '#d59bff' },
];

export const DEFAULT_PERSONA: PersonaId = 'sam';
const STORAGE_KEY = 'safenight.persona';

export function isPersonaId(value: string | null | undefined): value is PersonaId {
  return PERSONAS.some(p => p.id === value);
}

export function personaById(id: PersonaId): Persona {
  return PERSONAS.find(p => p.id === id) ?? PERSONAS[0];
}

/** Like readChosenPersona, but falls back to the default persona (Sam). For code that runs after startup. */
export function readCurrentPersona(): Persona {
  return readChosenPersona() ?? personaById(DEFAULT_PERSONA);
}

/** Persona from `?as=`, else the last one chosen on this device, else null (show the picker). */
export function readChosenPersona(): Persona | null {
  const fromUrl = new URLSearchParams(window.location.search).get('as');
  if (isPersonaId(fromUrl)) {
    writeCurrentPersona(fromUrl);
    return personaById(fromUrl);
  }
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    stored = null;
  }
  return isPersonaId(stored) ? personaById(stored) : null;
}

export function writeCurrentPersona(id: PersonaId): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Storage may be unavailable (private mode); the URL still carries the choice.
  }
}

/** URL for switching to another persona, keeping the current path. */
export function personaHref(id: PersonaId): string {
  const url = new URL(window.location.href);
  url.searchParams.set('as', id);
  return url.pathname + url.search;
}
