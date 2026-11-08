// SafeNight demo video recorder. Run from a directory where `playwright` is installed:
//   DOCS=/path/to/docs/video OUT=/path/to/out node record.mjs
// Records one continuous 1920x1080 video: product slides -> four-phone live demo -> technical slides -> close,
// and writes captions.json + SafeNight-demo.srt with timings relative to the recording start.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const DOCS = process.env.DOCS || path.resolve('docs/video');
const OUT = process.env.OUT || path.resolve('out');
const APP = process.env.APP || 'http://localhost:5173';
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
  recordVideo: { dir: OUT, size: { width: 1920, height: 1080 } },
});
const page = await context.newPage();
const T0 = Date.now();
const now = () => (Date.now() - T0) / 1000;
const caps = [];
let cur = null;
const log = (m) => console.log(`[${now().toFixed(1)}s] ${m}`);
function cap(text) {
  if (cur) { cur.end = now(); caps.push(cur); }
  cur = { start: now(), text };
  log(`CAP ${text}`);
}
function capEnd() { if (cur) { cur.end = now(); caps.push(cur); cur = null; } }

const slides = `file://${DOCS}/slides.html`;
const stage = `file://${DOCS}/stage.html`;
const go = async (id) => page.evaluate((i) => window.go(i), id);

// ───────────────────────── PART 1: product slides ─────────────────────────
await page.goto(slides);
await go('title');
cap('SafeNight. Go out together. Get home together.'); await sleep(5500);
cap('A consent-based safety app for friends on a night out.'); await sleep(5000);

await go('problem');
cap('Nights out have a gap nobody owns.'); await sleep(4000);
cap('Friends split up. The designated driver has a drink.'); await sleep(4500);
cap('A location pin says where someone is, not that anyone is coming.'); await sleep(5500);

await go('who');
cap('Built for groups of friends, designated drivers, and safety buddies.'); await sleep(5000);
cap('Roles are accepted on purpose, never assigned silently.'); await sleep(4500);

await go('loop');
cap('Plan. Stay connected. Notice a concern. Coordinate help. Confirm home.'); await sleep(6000);
cap('A temporary group that expires. Not a tracker, not a dispatcher.'); await sleep(5500);

await go('principles');
cap('Sharing is opt-in, scoped per person, time-limited, revocable.'); await sleep(5000);
cap('No intoxication detection. Nobody is ever declared sober.'); await sleep(4500);
cap('People confirm every outcome. The agent never acts alone.'); await sleep(5000);

await go('different');
cap('Explicit driver acceptance. Instant deterministic warnings.'); await sleep(5000);
cap('And an agent that adapts when a buddy does not answer.'); await sleep(5000);
capEnd();

// ───────────────────────── PART 2: live demo ─────────────────────────
await page.goto(stage);
const f = {
  alex: page.frameLocator('#f-alex'),
  sam: page.frameLocator('#f-sam'),
  maya: page.frameLocator('#f-maya'),
  jordan: page.frameLocator('#f-jordan'),
};
const focus = (id) => page.evaluate((i) => window.focusPersona(i), id);

// Read the agent panel to see whether the current plan came from the live model or the labeled fallback.
async function planIsLive(frame) {
  const txt = await frame.locator('body').innerText().catch(() => '');
  return /model (private\/)?nvidia\//i.test(txt) && !/fallback/i.test(txt);
}
const tab = (fr, label) => fr.locator('nav.tabbar button', { hasText: label }).click();

cap('Live demo. Four phones, four identities, one SpacetimeDB database.');
for (const id of Object.keys(f)) await f[id].getByText('Connected', { exact: true }).waitFor({ timeout: 30000 });
await sleep(2500);

// Reset + set up the demo group from Alex's judge panel.
await focus('alex');
await tab(f.alex, 'Profile');
await f.alex.getByText('✓ registered').nth(3).waitFor({ timeout: 30000 });
cap('Each phone registered its identity. Alex sets up the demo group.');
await f.alex.getByRole('button', { name: 'Reset demo group' }).click();
await f.alex.getByRole('button', { name: 'Yes, reset the group' }).click();
await f.alex.getByText('Demo group reset').first().waitFor({ timeout: 30000 });
await f.alex.getByRole('button', { name: 'Set up demo group' }).click();
await f.alex.getByText('Demo group is ready').first().waitFor({ timeout: 30000 });
await sleep(1200);

// Everyone opens the session; Alex shows the roster.
for (const id of ['alex', 'sam', 'maya', 'jordan']) {
  await tab(f[id], 'Night Out');
  await f[id].getByRole('button', { name: /Open Saturday night/ }).first().click();
}
await page.evaluate(() => { for (const id of ['f-sam','f-maya','f-jordan']) { try { document.getElementById(id).contentWindow.scrollTo(0, 0); } catch {} } });
await focus('alex');
await f.alex.getByText('Roster').first().waitFor();
cap('The roster: Alex organizes, Sam explicitly accepted the driver role.'); await sleep(5000);
await f.alex.getByText('Consent', { exact: true }).first().scrollIntoViewIfNeeded().catch(() => {});
cap('Each person grants each friend specific scopes, for a limited time.'); await sleep(5000);
await f.alex.getByText('Roster').first().scrollIntoViewIfNeeded().catch(() => {});

// Alex reports a concern about the driver.
await tab(f.alex, 'Map');
await f.alex.getByText('SIMULATED LOCATIONS').first().waitFor();
cap('The map shows only consented, approximate locations. Simulated tonight.'); await sleep(4500);
await f.alex.getByRole('button', { name: 'Report a concern' }).scrollIntoViewIfNeeded();
await f.alex.getByRole('button', { name: 'Report a concern' }).click();
const sheet = f.alex.locator('dialog.status-sheet');
await sheet.waitFor({ timeout: 15000 });
await sheet.locator('select').first().selectOption({ label: 'Sam' });
await sheet.locator('textarea').first().fill('Sam has had a few drinks');
cap('Alex reports a concern: Sam, the driver, may have been drinking.'); await sleep(3000);
await sheet.getByRole('button', { name: 'Send concern' }).click();
await f.alex.getByText('Concern sent').first().waitFor({ timeout: 20000 });

await f.alex.getByRole('button', { name: 'Close' }).click().catch(() => {});
await focus('sam');
await f.sam.getByText('Do not drive').first().waitFor({ timeout: 20000 });
await f.sam.getByText('Do not drive').first().scrollIntoViewIfNeeded();
await page.evaluate(() => { const w = document.getElementById('f-sam').contentWindow; try { w.scrollTo(0, 0); } catch {} });
cap('Sam sees "Do not drive" instantly. A deterministic rule, no AI in the loop.'); await sleep(6500);

// Alex opens the incident and the agent plan.
await focus('alex');
await tab(f.alex, 'Inbox');
await f.alex.locator('.inbox-row').first().click();
await f.alex.getByRole('heading', { name: 'Plan v1' }).waitFor({ timeout: 45000 });
cap((await planIsLive(f.alex)) ? 'The incident opened the agent. Plan v1 comes from Nemotron on NVIDIA NIM.' : 'The incident opened the agent. The model call timed out, so the labeled simulated planner stepped in.');
await f.alex.getByRole('heading', { name: 'Plan v1' }).scrollIntoViewIfNeeded();
await sleep(6000);
await f.alex.getByText(/Receipts \(/).first().scrollIntoViewIfNeeded().catch(() => {});
cap('Every tool call is validated, then recorded as a receipt. Messages are SIMULATED.'); await sleep(6000);
// Screenshot of the live plan for the technical section.
const shot1 = path.join(OUT, 'shot1.png');
await page.locator('#f-alex').screenshot({ path: shot1 });

await focus('maya');
cap('Maya, the primary buddy, gets the request. She does not respond.'); await sleep(5500);

// Advance the follow-up timer from Alex's judge panel (stands in for the 2-minute wait).
await focus('alex');
await tab(f.alex, 'Profile');
await f.alex.getByRole('button', { name: 'Advance timer (simulate no reply)' }).first().waitFor({ timeout: 30000 });
cap('The follow-up timer lives in SpacetimeDB. We advance it instead of waiting two minutes.'); await sleep(3500);
await f.alex.getByRole('button', { name: 'Advance timer (simulate no reply)' }).first().click();
await f.alex.getByText('Timer advanced').first().waitFor({ timeout: 30000 });
await tab(f.alex, 'Inbox');
await f.alex.locator('.inbox-row').first().click();
await f.alex.getByRole('heading', { name: 'Plan v2' }).waitFor({ timeout: 60000 });
await f.alex.getByRole('heading', { name: 'Plan v2' }).scrollIntoViewIfNeeded();
cap((await planIsLive(f.alex)) ? 'No reply. The agent escalates: Nemotron plan v2 messages Jordan, the backup.' : 'No reply. The agent escalates: plan v2 messages Jordan, the backup (simulated planner).'); await sleep(6000);

// Jordan acknowledges.
await focus('jordan');
await tab(f.jordan, 'Inbox');
await f.jordan.locator('.inbox-row').first().click();
await f.jordan.getByRole('button', { name: "I'm on it" }).scrollIntoViewIfNeeded();
cap('Jordan acknowledges. Sent is not acknowledged: the states stay distinct.'); await sleep(2500);
await f.jordan.getByRole('button', { name: "I'm on it" }).click();
await f.jordan.getByText(/Acknowledged \d+s ago|Acknowledged just now|Acknowledged/).first().waitFor({ timeout: 30000 });
cap('Now the agent looks up transport and proposes a ride. Two tool rounds.');
await f.jordan.getByText('Ride for Sam').first().waitFor({ timeout: 90000 });
await f.jordan.getByText('Ride for Sam').first().scrollIntoViewIfNeeded();
await sleep(5500);
cap('Routing was unreachable, so it says "Provider link only". Nothing is invented.'); await sleep(5500);

// Sam books, confirms pickup, confirms home.
await focus('sam');
await tab(f.sam, 'Inbox');
await f.sam.locator('.inbox-row').first().click();
await f.sam.getByRole('button', { name: 'Choose this' }).first().scrollIntoViewIfNeeded();
cap('Sam picks a ride. The app opens a link; a person books. No autonomous purchases.'); await sleep(2500);
await f.sam.getByRole('button', { name: 'Choose this' }).first().click();
await f.sam.getByRole('button', { name: 'I booked this' }).click();
await f.sam.getByRole('button', { name: 'Confirm pickup' }).waitFor({ timeout: 60000 });
cap('Booked by a person. The agent tells Jordan and waits for pickup.'); await sleep(4500);
await f.sam.getByRole('button', { name: 'Confirm pickup' }).click();
await f.sam.getByRole('button', { name: "I'm home safe" }).waitFor({ timeout: 30000 });
cap('Pickup confirmed. Only Sam can close this: the agent never resolves an incident.'); await sleep(4500);
await f.sam.getByRole('button', { name: "I'm home safe" }).scrollIntoViewIfNeeded();
await f.sam.getByRole('button', { name: "I'm home safe" }).click();
await f.sam.getByRole('button', { name: "Yes, I'm home" }).click();
await f.sam.getByText('Resolved by Sam').first().waitFor({ timeout: 30000 });
await f.sam.getByText('Resolved by Sam').first().scrollIntoViewIfNeeded();
cap('Home, confirmed by the person. The incident resolves for everyone.'); await sleep(3000);
await focus(null);
await f.alex.getByText('Resolved by Sam').first().waitFor({ timeout: 30000 }).catch(() => {});
await f.alex.getByText('Resolved by Sam').first().scrollIntoViewIfNeeded().catch(() => {});
await sleep(4500);
capEnd();

// ───────────────────────── PART 3: technical slides ─────────────────────────
await page.goto(slides);
await page.evaluate((u) => window.setShot('shot1img', u), `file://${shot1}`);
await go('arch');
cap('Under the hood: SpacetimeDB is the whole backend. No API server.'); await sleep(5500);
cap('Sessions, consent, incidents, timers, agent state: all tables and reducers.'); await sleep(5500);
cap('An event table with row-level security delivers the warning only to Sam.'); await sleep(5000);

await go('engine');
cap('Safety rules run first, in one transaction, before any model is called.'); await sleep(5500);
cap('Consent-scoped views. "I\'m okay" never closes an incident. Humans resolve.'); await sleep(6000);

await go('agent');
cap('The agent is a scheduled procedure calling Nemotron 3.5 Super with a tool allowlist.'); await sleep(5500);
cap('Tool results are fed back for up to three rounds. Every call is validated first.'); await sleep(5500);
cap('Receipts say who proposed each step: the model, a policy rule, or a simulation.'); await sleep(5500);

await go('shot1');
cap('This is the real plan from tonight\'s run, with the model name and receipts.'); await sleep(7000);

await go('evidence');
cap('81 module tests and 93 web tests, plus a live four-identity end-to-end run.'); await sleep(5500);
cap('Revocation, unauthorized access, duplicates, escalation, injection: all covered.'); await sleep(5500);

await go('real');
cap('Nemotron and SpacetimeDB are live. SMS is simulated until Twilio keys exist.'); await sleep(5500);
cap('Adding keys changes nothing in the data model, only who writes the plan.'); await sleep(5000);

await go('close');
cap('SafeNight. NVIDIA Nemotron agentic workflow on a SpacetimeDB backend.'); await sleep(5000);
cap('github.com/sabharwalainesh/SafeNight'); await sleep(4500);
capEnd();

const total = now();
await context.close();
await browser.close();
const videoPath = await page.video().path();
fs.writeFileSync(path.join(OUT, 'captions.json'), JSON.stringify({ total, caps }, null, 2));
const ts = (s) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${sec.toFixed(3).padStart(6, '0').replace('.', ',')}`; };
const srt = caps.map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(Math.max(c.end, c.start + 1.5))}\n${c.text}\n`).join('\n');
fs.writeFileSync(path.join(OUT, 'SafeNight-demo.srt'), srt);
console.log(JSON.stringify({ videoPath, total, captions: caps.length }));
