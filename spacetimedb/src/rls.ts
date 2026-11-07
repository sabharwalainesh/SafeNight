import { spacetimedb } from './schema';

// Row-level security (experimental): clients only receive safety alerts addressed to them.
// Module owners bypass RLS. If this filter ever blocks publishing, drop it and let clients
// filter `safety_alert` rows by `recipient` (the contract already requires it).
export const safetyAlertFilter = spacetimedb.clientVisibilityFilter.sql(
  'SELECT * FROM safety_alert WHERE safety_alert.recipient = :sender'
);
