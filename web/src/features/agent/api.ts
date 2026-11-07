// Client-side contract for C3: the Nemotron agent workflow as the UI sees it.
// Shapes mirror the PLANNED C3 section of docs/ARCHITECTURE.md with the same
// simplifications as features/night-out/api.ts (string ids, `UserId` people,
// epoch-ms times, JSON columns parsed into objects).
// A mock (deterministic simulated planner) backs it until C3-A bindings land.
//
// Safety rules the UI must keep visible:
//   - sent, delivered, acknowledged, booked and completed are different states;
//   - every simulated plan, receipt, and notification carries a SIMULATED label;
//   - only the person can confirm they are home; the agent never resolves.

import { createContext, useContext } from 'react';
import type { EpochMs, UserId } from '../night-out/api';

export type AgentJobStatus =
  | 'queued'
  | 'planning'
  | 'waiting_for_ack'
  | 'escalated'
  | 'transport_pending'
  | 'awaiting_home_confirmation'
  | 'resolved'
  | 'handed_off'
  | 'cancelled';
export type ActionStatus = 'proposed' | 'rejected' | 'executed' | 'failed' | 'delivered' | 'acknowledged';
export type Channel = 'in_app' | 'sms' | 'voice';
export type DeliveryStatus = 'queued' | 'sent' | 'delivered' | 'failed' | 'acknowledged';
export type RideStatus = 'proposed' | 'accepted' | 'booked_by_user' | 'pickup_confirmed' | 'completed' | 'cancelled';

export type AgentJob = {
  id: string;
  incidentId: string;
  status: AgentJobStatus;
  planVersion: number;
  /** 0 = primary buddy, 1 = backup buddy, 2 = handed off to organizer. */
  escalationTier: number;
  lastEvent: string;
  wakeCount: number;
  createdAt: EpochMs;
  updatedAt: EpochMs;
  /** Next follow-up deadline, if a timer is open. */
  followupDueAt: EpochMs | null;
  /** Who the open follow-up waits on. */
  followupExpectedFrom: UserId | null;
};

export type PlanStep = { title: string; detail: string };

export type AgentPlan = {
  id: string;
  jobId: string;
  version: number;
  summary: string;
  steps: PlanStep[];
  model: string;
  simulated: boolean;
  createdAt: EpochMs;
};

/** `agent_action` receipt. */
export type AgentAction = {
  id: string;
  jobId: string;
  planVersion: number;
  tool: string;
  args: Record<string, unknown>;
  status: ActionStatus;
  /** Short human-readable result, e.g. "Message delivered to Maya". */
  resultText: string;
  rejectReason: string;
  simulated: boolean;
  at: EpochMs;
};

export type AgentNotification = {
  id: string;
  incidentId: string;
  recipient: UserId;
  recipientName: string;
  channel: Channel;
  template: string;
  body: string;
  status: DeliveryStatus;
  simulated: boolean;
  createdAt: EpochMs;
  acknowledgedAt: EpochMs | null;
};

export type RideOption = {
  id: string;
  kind: 'rideshare' | 'transit' | 'walk_with_buddy' | 'friend_driver';
  label: string;
  /** Deep link the human opens to book; never booked by the app. */
  url: string | null;
  etaMinutes: number | null;
  /** External data is labeled with where it came from and when. */
  source: string;
  fetchedAt: EpochMs;
  simulated: boolean;
};

export type RidePlan = {
  id: string;
  incidentId: string;
  riderId: UserId;
  riderName: string;
  options: RideOption[];
  chosenOption: string | null;
  status: RideStatus;
  confirmedBy: UserId | null;
  updatedAt: EpochMs;
};

/** Human reducers from ARCHITECTURE §8. Reject with a human-readable Error. */
export type AgentActions = {
  acknowledgeAssistance(jobId: string): Promise<void>;
  declineAssistance(jobId: string, reason: string): Promise<void>;
  acceptRideOption(ridePlanId: string, optionId: string): Promise<void>;
  confirmRideBooked(ridePlanId: string): Promise<void>;
  confirmPickup(ridePlanId: string): Promise<void>;
  /** Subject only; resolves the incident. */
  confirmHome(incidentId: string): Promise<void>;
};

/** Demo-only controls for the judge panel (refused in production). */
export type DemoActions = {
  /** Fire the job's open follow-up timer now, as if it expired. */
  fireFollowup(jobId: string): Promise<void>;
  /** Clear all demo data for every persona. */
  reset(): Promise<void>;
  /** Create a session with all four personas, Sam as accepted driver, and the consents the demo needs. */
  setupGroup(): Promise<void>;
};

export type AgentApi = {
  me: UserId;
  ready: boolean;
  mocked: boolean;
  /** Planner mode shown to users: 'simulated' unless live Nemotron produced the plan. */
  plannerMode: 'live' | 'simulated';
  jobForIncident(incidentId: string): AgentJob | null;
  /** Latest plan version for a job, or null. */
  latestPlan(jobId: string): AgentPlan | null;
  /** Receipts for a job, oldest first (participants only). */
  receipts(jobId: string): AgentAction[];
  /** Notifications for an incident (participants only), oldest first. */
  notifications(incidentId: string): AgentNotification[];
  ridePlan(incidentId: string): RidePlan | null;
  actions: AgentActions;
  demo: DemoActions;
};

export const AgentContext = createContext<AgentApi | null>(null);

export function useAgent(): AgentApi {
  const api = useContext(AgentContext);
  if (!api) throw new Error('useAgent must be used inside an AgentContext provider');
  return api;
}

export const DELIVERY_LABELS: Record<DeliveryStatus, string> = {
  queued: 'Queued',
  sent: 'Sent',
  delivered: 'Delivered',
  failed: 'Failed',
  acknowledged: 'Acknowledged',
};

export const RIDE_STATUS_LABELS: Record<RideStatus, string> = {
  proposed: 'Options proposed',
  accepted: 'Option chosen',
  booked_by_user: 'Booked by a person',
  pickup_confirmed: 'Pickup confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const JOB_STATUS_LABELS: Record<AgentJobStatus, string> = {
  queued: 'Queued',
  planning: 'Planning',
  waiting_for_ack: 'Waiting for a buddy',
  escalated: 'Escalated to backup',
  transport_pending: 'Arranging transport',
  awaiting_home_confirmation: 'Waiting for "I\'m home"',
  resolved: 'Resolved',
  handed_off: 'Handed off to organizer',
  cancelled: 'Cancelled',
};
