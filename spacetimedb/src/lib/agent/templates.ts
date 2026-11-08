// Outward message templates. Only these can leave the host; the model may pick a template and
// supply variables, never free text. Variables are clipped and interpolated server-side.

export const TEMPLATES = {
  buddy_alert:
    '{subjectName} may need a hand getting home tonight. SafeNight is asking you first. Can you check on them?',
  backup_alert:
    "{primaryName} hasn't responded. {subjectName} may need a hand getting home. Can you step in?",
  ack_request: "Please tap Acknowledge in SafeNight so {subjectName}'s group knows someone is on it.",
  ride_booked: "{subjectName}'s ride is booked. Please keep an eye out until they confirm they're home.",
  ride_options_ready: 'Ride options for {subjectName} are ready in SafeNight. Please help them pick one and book it.',
  organizer_handoff: 'No safety buddy responded for {subjectName}. Please take over coordination.',
  incident_update: 'Update about {subjectName}: {detail}',
} as const;

export type TemplateName = keyof typeof TEMPLATES;
export const TEMPLATE_NAMES = Object.keys(TEMPLATES) as TemplateName[];
const MAX_VAR_LENGTH = 120;

export function isTemplateName(name: string): name is TemplateName {
  return Object.prototype.hasOwnProperty.call(TEMPLATES, name);
}

export function renderTemplate(name: TemplateName, vars: Record<string, string>): string {
  return TEMPLATES[name].replace(/\{(\w+)\}/g, (_m, key: string) => {
    const v = vars[key];
    if (v === undefined) return '…';
    return v.length > MAX_VAR_LENGTH ? v.slice(0, MAX_VAR_LENGTH) + '…' : v;
  });
}
