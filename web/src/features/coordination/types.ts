export type SyncParticipant = { personaId: string; displayName: string; role: string; acknowledged: boolean };
export type SyncIncident = {
  id: string;
  kind: string;
  severity: string;
  status: string;
  subjectName: string;
  subjectPersonaId: string;
  sessionName: string;
  venue: string;
  lastLocation: { lat: number; lng: number; approximate: boolean; recordedAt: string } | null;
  participants: SyncParticipant[];
  recentCheckins: { kind: string; at: string }[];
  events: { kind: string; detail: string; at: string }[];
};
export type SyncBody = { incident: SyncIncident };

export type ActionType = 'text_group' | 'call_person' | 'dispatch_call';
export type ActionStatus = 'planned' | 'blocked' | 'sent' | 'in_progress' | 'completed' | 'failed' | 'no_answer';
export type CoordAction = {
  id: string;
  type: ActionType;
  target: string;
  status: ActionStatus;
  detail: string;
  simulated: boolean;
};
export type Decision = { id: string; at: string | number; model: string; simulated: boolean; reasoning: string; actions: CoordAction[] };
export type Dispatch = { status: string; summary: string; transcriptSummary: string; simulated: true };
export type IncidentPlan = { decisions: Decision[]; dispatch: Dispatch | null };
