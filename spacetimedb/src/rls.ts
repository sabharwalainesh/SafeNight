import { spacetimedb } from './schema';

// Row-level security (experimental): clients only receive safety alerts addressed to them.
// Module owners bypass RLS. If this filter ever blocks publishing, drop it and let clients
// filter `safety_alert` rows by `recipient` (the contract already requires it).
export const safetyAlertFilter = spacetimedb.clientVisibilityFilter.sql(
  'SELECT * FROM safety_alert WHERE safety_alert.recipient = :sender'
);

// Active members see rows of the sessions they belong to; someone who left stops receiving them. Owners bypass RLS.
export const sessionMemberFilter = spacetimedb.clientVisibilityFilter.sql(
  'SELECT m.* FROM session_member m JOIN session_member me ON m.session_id = me.session_id WHERE me.user_id = :sender AND me.active = true'
);
// NOTE: equivalent filters on `night_session` (JOIN session_member me ON s.id = me.session_id) and
// `driver_assignment` (JOIN session_member me ON d.session_id = me.session_id) publish fine but break
// every client subscription to those tables with
// "Subscriptions require indexes on join columns" (both columns are indexed; verified live on 2.14.1).
// Only the self-join on `session_member` is accepted by the subscription planner. Those two tables stay
// public without row filtering: clients read sessions through `my_sessions` and driver status through
// `my_rosters.driverStatus`, both caller-scoped views. Revisit when the planner supports these joins.
