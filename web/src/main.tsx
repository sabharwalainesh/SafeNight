import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Identity } from 'spacetimedb';
import { SpacetimeDBProvider } from 'spacetimedb/react';
import { DbConnection, type ErrorContext } from './module_bindings';
import { readChosenPersona, type Persona } from './personas';
import { PersonaPicker, registerServiceWorker } from './features/install';
import App from './App';
import './index.css';

const HOST = import.meta.env.VITE_SPACETIMEDB_HOST ?? 'ws://localhost:3000';
const DB_NAME = import.meta.env.VITE_SPACETIMEDB_DB_NAME ?? 'safenight';

const root = createRoot(document.getElementById('root')!);
const chosen = readChosenPersona();

if (!chosen) {
  // Nothing chosen yet: ask before connecting, so no identity is created for the wrong persona.
  root.render(
    <StrictMode>
      <PersonaPicker />
    </StrictMode>
  );
} else {
  boot(chosen);
}

registerServiceWorker();

function boot(persona: Persona) {
  // Each persona keeps its own identity on this device: the token is stored
  // under a per-persona key, so four tabs with ?as=... behave like four users.
  const TOKEN_KEY = `${HOST}/${DB_NAME}/${persona.id}/auth_token`;

  const readToken = (): string | undefined => {
    try {
      return localStorage.getItem(TOKEN_KEY) ?? undefined;
    } catch {
      return undefined;
    }
  };

  const storeToken = (token: string): void => {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      // Private mode: the identity will be fresh on the next load.
    }
  };

  const connectionBuilder = DbConnection.builder()
    .withUri(HOST)
    .withDatabaseName(DB_NAME)
    .withToken(readToken())
    .onConnect((_conn: DbConnection, identity: Identity, token: string) => {
      storeToken(token);
      console.info(`[safenight] connected as ${persona.id} (${identity.toHexString().slice(0, 8)})`);
    })
    .onDisconnect(() => {
      console.info('[safenight] disconnected');
    })
    .onConnectError((_ctx: ErrorContext, err: Error) => {
      console.error('[safenight] connection error', err);
    });

  root.render(
    <StrictMode>
      <SpacetimeDBProvider connectionBuilder={connectionBuilder}>
        <App persona={persona} host={HOST} dbName={DB_NAME} />
      </SpacetimeDBProvider>
    </StrictMode>
  );
}
