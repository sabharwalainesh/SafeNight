/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SPACETIMEDB_HOST?: string;
  readonly VITE_SPACETIMEDB_DB_NAME?: string;
  /** Set to `production` to disable demo-only controls. */
  readonly VITE_APP_ENV?: string;
  /** `live` runs the Night Out tab against the SpacetimeDB module; default `mock`. */
  /** `mock` runs every tab on local mock data; default is live. Per-tab VITE_*_SOURCE flags override it. */
  readonly VITE_DATA_SOURCE?: string;
  readonly VITE_NIGHTOUT_SOURCE?: string;
  /** `live` runs Map/Inbox/status against the SpacetimeDB module; default `mock`. */
  readonly VITE_SAFETY_SOURCE?: string;
  /** `live` runs the agent panel, rides and demo timer against the SpacetimeDB module; default `mock`. */
  readonly VITE_AGENT_SOURCE?: string;
  /** `live` runs the Reports tab against the SpacetimeDB module; default `mock`. */
  readonly VITE_REPORTS_SOURCE?: string;
  /** `live` runs the Profile tab against the SpacetimeDB module; default `mock`. */
  readonly VITE_PROFILE_SOURCE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
