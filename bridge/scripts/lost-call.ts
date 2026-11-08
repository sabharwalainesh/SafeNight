// One-shot demo call: "a friend got separated from the group and is alone on the street."
// Rings ONE persona's phone (from PHONE_* in .env) with the SafeNight Buddy agent.
// Never dials anything else; emergency numbers are refused.
//
//   npm run call:lost -- --name Jordan        # ring PHONE_ALEX, greet as Jordan, about lost Alex
//   npm run call:lost -- --to sam --lost Alex
//   npm run call:lost -- --dry              # print what would be said, no call
import { loadConfig } from '../src/config.js';
import { placeCall } from '../src/elevenlabs.js';
import { emergencyNumberReason } from '../src/policy.js';

const NAMES: Record<string, string> = { alex: 'Alex', sam: 'Sam', maya: 'Maya', jordan: 'Jordan' };

const argv = process.argv.slice(2);
const flag = (name: string, d: string): string => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1]! : d;
};
const dry = argv.includes('--dry');
const to = flag('to', 'alex').toLowerCase();
const lost = flag('lost', 'Alex');
const nameFlag = flag('name', '');
const where = flag('where', 'West 44th Street near 8th Avenue, a block west of Times Square');

const c = loadConfig();
const number = c.personaPhones[to];
if (!NAMES[to]) throw new Error(`--to must be one of: ${Object.keys(NAMES).join(', ')}`);
if (!number) throw new Error(`PHONE_${to.toUpperCase()} is not set in bridge/.env`);
const blocked = emergencyNumberReason(number, c.blockedNumbers);
if (blocked) throw new Error(`Refusing to call: ${blocked}`);

const vars = {
  call_type: 'buddy',
  person_name: nameFlag || NAMES[to]!,
  reporter: lost,
  situation: `${lost} got separated from the group and is alone on the street. They are not answering texts`,
  location_text: where,
  minutes_since: 12,
  callback_note: 'Open the SafeNight app to see their last location, or call them directly',
};

console.log(`Calling ${nameFlag || NAMES[to]} (…${number.slice(-4)}) about ${lost}, last seen at ${where}.`);
if (dry) {
  console.log('[dry run] no call placed. Variables:', vars);
  process.exit(0);
}
// This script is the explicit "place one real call" action, so ignore SIMULATE_ALL here.
const r = await placeCall({ ...c, simulateAll: false }, fetch, { callType: 'buddy', to: number, vars });
console.log(r.ok ? `Call placed${r.conversationId ? ` (conversation ${r.conversationId})` : ''}.` : `Call failed: ${r.detail}`);
process.exit(r.ok ? 0 : 1);
