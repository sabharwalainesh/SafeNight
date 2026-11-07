import type { AgentContext } from './context';
import { eligibleContacts } from './context';
import type { ToolCall } from './tools';
import { DEFAULT_FOLLOWUP_MINUTES } from './tools';

export const SIMULATED_MODEL = 'simulated-planner';

export type PlanProposal = { summary: string; calls: ToolCall[] };

/**
 * Deterministic planner used when no Nemotron key is configured or the live call fails.
 * It emits the same tool-call shape as the model so one executor serves both.
 */
export function simulatedPlan(context: AgentContext): PlanProposal {
  const subjectName = context.subject.displayName;
  const subjectId = context.subject.userId;
  const contacts = eligibleContacts(context);
  const fresh = contacts.filter(c => !c.alreadyContacted);
  const contacted = contacts.filter(c => c.alreadyContacted);

  switch (context.event) {
    case 'incident_opened': {
      const first = fresh[0];
      if (!first) {
        return {
          summary: `No participant with messaging consent from ${subjectName}; handing off to the organizer.`,
          calls: [{ name: 'get_group_context', args: {} }, { name: 'hand_off', args: { reason: 'no eligible contacts' } }],
        };
      }
      return {
        summary: `Ask ${first.displayName} (${first.contactRole ?? first.role}) to check on ${subjectName}, request acknowledgment, follow up in ${DEFAULT_FOLLOWUP_MINUTES} min.`,
        calls: [
          { name: 'get_group_context', args: {} },
          { name: 'send_approved_message', args: { recipient: first.userId, template: 'buddy_alert', vars: { subjectName } } },
          { name: 'request_human_confirmation', args: { userId: first.userId, question: `Can you check on ${subjectName}?` } },
          { name: 'update_incident_state', args: { state: 'assistance_underway' } },
          { name: 'schedule_followup', args: { delayMinutes: DEFAULT_FOLLOWUP_MINUTES } },
        ],
      };
    }
    case 'buddy_nonresponse':
    case 'buddy_declined': {
      const next = fresh[0];
      if (!next) {
        return {
          summary: `Nobody else can be contacted for ${subjectName}; handing off to the organizer.`,
          calls: [{ name: 'hand_off', args: { reason: context.event === 'buddy_declined' ? 'last contact declined' : 'no response from any eligible contact' } }],
        };
      }
      const primaryName = contacted[contacted.length - 1]?.displayName ?? 'The first contact';
      return {
        summary: `${primaryName} did not respond; escalate to ${next.displayName} and follow up in ${DEFAULT_FOLLOWUP_MINUTES} min.`,
        calls: [
          { name: 'send_approved_message', args: { recipient: next.userId, template: 'backup_alert', vars: { subjectName, primaryName } } },
          { name: 'request_human_confirmation', args: { userId: next.userId, question: `Can you step in for ${subjectName}?` } },
          { name: 'schedule_followup', args: { delayMinutes: DEFAULT_FOLLOWUP_MINUTES } },
        ],
      };
    }
    case 'buddy_acknowledged':
      return {
        summary: `A helper acknowledged. Look up transport options and propose a ride plan for ${subjectName}; a person books.`,
        calls: [
          { name: 'get_transport_options', args: { pickupArea: 'subject_last_location' } },
          { name: 'propose_ride_plan', args: { riderId: subjectId, options: 'from_transport_lookup' } },
          { name: 'update_incident_state', args: { state: 'transport_pending' } },
        ],
      };
    case 'ride_booked': {
      const helper = contacts.find(c => c.acknowledged) ?? contacted[0];
      const calls: ToolCall[] = [{ name: 'schedule_followup', args: { delayMinutes: 5 } }];
      if (helper) calls.unshift({ name: 'send_approved_message', args: { recipient: helper.userId, template: 'ride_booked', vars: { subjectName } } });
      return { summary: `Ride booked for ${subjectName}; keep the helper informed and wait for the home confirmation.`, calls };
    }
    case 'pickup_confirmed':
      return { summary: `${subjectName} confirmed pickup. Waiting for the home confirmation; no action needed.`, calls: [] };
    default:
      return { summary: `No automated action for event "${context.event}".`, calls: [] };
  }
}
