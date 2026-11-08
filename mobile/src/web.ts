// Single import point for the web client's data layer (contracts + live adapters + bindings).
// Nothing here renders DOM; see ../metro.config.js for how these resolve.
export { useNightOut } from '../../web/src/features/night-out/api';
export type { ConsentGrant, ConsentScope, DriverEndReason, Invite, NightSession, SessionMember, SharingScope } from '../../web/src/features/night-out/api';
export { useSafety, CHECKIN_LABELS, INCIDENT_STATUS_LABELS } from '../../web/src/features/safety/api';
export type { AlertKind, CheckinKind, ConcernCategory, ConsumptionLevel, Incident, IncidentEvent, VisibleLocation } from '../../web/src/features/safety/api';
export { useAgent, DELIVERY_LABELS, JOB_STATUS_LABELS, RIDE_STATUS_LABELS } from '../../web/src/features/agent/api';
export type { ActionStatus, RideStatus } from '../../web/src/features/agent/api';
export { useProfile } from '../../web/src/features/profile/api';
export type { ContactRole, DefaultSharing } from '../../web/src/features/profile/api';
export { NightOutLiveProvider } from '../../web/src/features/night-out/live';
export { SafetyLiveProvider } from '../../web/src/features/safety/live';
export { AgentLiveProvider } from '../../web/src/features/agent/live';
export { ProfileLiveProvider } from '../../web/src/features/profile/live';
export { CurrentSessionProvider, useCurrentSessionId, useSetCurrentSessionId } from '../../web/src/features/night-out/currentSession';
export { useDemoLive, AVATARS } from '../../web/src/features/demo-live/useDemoLive';
export { DbConnection, reducers, tables } from '../../web/src/module_bindings';
export type { ErrorContext } from '../../web/src/module_bindings';
