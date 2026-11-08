import type { PersonaId } from './settings';

export type Persona = { id: PersonaId; name: string; roleHint: string; accent: string };

// Same names, roles and colors as web/src/personas.ts.
export const PERSONAS: readonly Persona[] = [
  { id: 'alex', name: 'Alex', roleHint: 'Organizer', accent: '#5fb3ff' },
  { id: 'sam', name: 'Sam', roleHint: 'Designated driver', accent: '#f6c445' },
  { id: 'maya', name: 'Maya', roleHint: 'Primary safety buddy', accent: '#7ee2a8' },
  { id: 'jordan', name: 'Jordan', roleHint: 'Backup buddy', accent: '#d59bff' },
];

export const personaById = (id: PersonaId): Persona => PERSONAS.find((p) => p.id === id) ?? PERSONAS[0];
