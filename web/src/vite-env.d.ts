/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SPACETIMEDB_HOST?: string;
  readonly VITE_SPACETIMEDB_DB_NAME?: string;
  /** Set to `production` to disable demo-only controls. */
  readonly VITE_APP_ENV?: string;
  /** `live` runs the Night Out tab against the SpacetimeDB module; default `mock`. */
  readonly VITE_NIGHTOUT_SOURCE?: string;
  /** `live` runs Map/Inbox/status against the SpacetimeDB module; default `mock`. */
  readonly VITE_SAFETY_SOURCE?: string;
  /** `live` runs the agent panel, rides and demo timer against the SpacetimeDB module; default `mock`. */
  readonly VITE_AGENT_SOURCE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
