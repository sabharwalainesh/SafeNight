// Every data provider is live (SpacetimeDB module) unless told otherwise.
// VITE_DATA_SOURCE=mock switches all tabs to the local mocks (no server needed);
// a per-tab flag such as VITE_SAFETY_SOURCE=mock|live overrides it for one tab.
export function dataSource(tabFlag: string): 'live' | 'mock' {
  const env = import.meta.env as Record<string, string | undefined>;
  const value = env[tabFlag] ?? env.VITE_DATA_SOURCE ?? 'live';
  return value === 'mock' ? 'mock' : 'live';
}
