export interface Participant {
  personaId: string;
  displayName: string;
  role: string;
  acknowledged: boolean;
}

export interface IncidentSnapshot {
  id: string;
  kind: string;
  severity: string;
  status: string;
  subjectName: string;
  subjectPersonaId: string;
  sessionName: string;
  venue: string;
  lastLocation: { lat: number; lng: number; approximate: boolean; recordedAt: string } | null;
  participants: Participant[];
  recentCheckins: { kind: string; at: string }[];
  events: { kind: string; detail: string; at: string }[];
}

export type ActionType = 'text_group' | 'call_person' | 'dispatch_call';
export type ActionStatus =
  | 'planned'
  | 'blocked'
  | 'sent'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'no_answer';

export interface Reply {
  personaId: string;
  text: string;
  at: string;
}

export interface Action {
  id: string;
  type: ActionType;
  target: string;
  status: ActionStatus;
  detail: string;
  simulated: boolean;
  createdAt: number;
  conversationId?: string;
  transcriptSummary?: string;
  latestReply?: Reply | null;
}

export interface Decision {
  id: string;
  at: string;
  model: string;
  simulated: boolean;
  reasoning: string;
  actions: Action[];
}

export interface ProposedAction {
  type: ActionType;
  personaId?: string;
  message?: string;
  reason?: string;
  summary?: string;
}

export interface Registration {
  personaId: string;
  spaceId: string;
  senderId: string;
  phone?: string;
  registeredAt: string;
}

export const PERSONAS = ['alex', 'sam', 'maya', 'jordan'] as const;
