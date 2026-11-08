// Three SafeNight decks from one generator: nvidia (doubles as the general deck), spacetimedb, photon.
// node deck3.js <track> <out.pptx>
const pptxgen = require('pptxgenjs');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const sharp = require('sharp');
const { applyTheme } = require('/Users/sohaibqurashi/Library/Application Support/Claude/local-agent-mode-sessions/skills-plugin/ac027167-7200-447c-b370-e9f25a35df10/cc57bda8-e61f-4a54-a820-31865150db85/skills/pptx/scripts/apply_theme.js');
const Fi = require('react-icons/fi');
const [TRACK, OUT] = process.argv.slice(2);

const THEME = {
  name: 'SafeNight Midnight',
  headFontFace: 'Cambria',
  bodyFontFace: 'Calibri',
  colors: { dk1: '0B0F1A', lt1: 'FFFFFF', dk2: '1B2140', lt2: 'E8E6FF', accent1: '9B7BFF', accent2: '5FB3FF', accent3: 'F6C445', accent4: 'FF6B6B', accent5: '30D158', accent6: 'A3ABBD', hlink: '9B7BFF', folHlink: '5FB3FF' },
};
const H = THEME.colors;
const ACCENT = { nvidia: '76B900', spacetimedb: H.accent1, photon: H.accent2 }[TRACK] || H.accent1;

async function icon(Comp, hex, px = 256) {
  const svg = renderToStaticMarkup(React.createElement(Comp, { color: '#' + hex, size: px }));
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return 'image/png;base64,' + buf.toString('base64');
}

(async () => {
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_16x9';
  pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
  pres.title = 'SafeNight';
  pres.author = 'SafeNight team';
  const C = pres.SchemeColor;

  pres.defineSlideMaster({
    title: 'DARK_TITLE', background: { color: H.dk1 },
    objects: [
      { placeholder: { options: { name: 'title', type: 'title', x: 0.6, y: 1.7, w: 8.8, h: 1.3, fontSize: 54, bold: true, color: C.background1, margin: 0, align: 'left' } } },
      { placeholder: { options: { name: 'body', type: 'body', x: 0.6, y: 3.05, w: 8.8, h: 1.0, fontSize: 20, color: C.background2, margin: 0 } } },
    ],
  });
  pres.defineSlideMaster({
    title: 'DARK_CONTENT', background: { color: H.dk1 },
    objects: [
      { placeholder: { options: { name: 'title', type: 'title', x: 0.6, y: 0.45, w: 8.8, h: 0.8, fontSize: 36, bold: true, color: C.background1, margin: 0, valign: 'top', align: 'left' } } },
      { text: { text: 'SafeNight', options: { x: 0.6, y: 5.15, w: 3, h: 0.3, fontSize: 10, color: C.accent6, margin: 0 } } },
    ],
    slideNumber: { x: 9.0, y: 5.15, w: 0.4, h: 0.3, fontSize: 10, color: H.accent6 },
  });

  const card = (slide, x, y, w, h, line) =>
    slide.addShape(pres.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.12, fill: { color: H.dk2 }, line: { color: line || H.dk2, width: line ? 1.25 : 0.75 }, objectName: 'card' });
  const circleIcon = async (slide, Comp, hex, x, y, d = 0.6) => {
    slide.addShape(pres.ShapeType.ellipse, { x, y, w: d, h: d, fill: { color: hex, transparency: 80 }, line: { color: hex, transparency: 80 }, objectName: 'icon-bg' });
    slide.addImage({ data: await icon(Comp, hex), x: x + d * 0.22, y: y + d * 0.22, w: d * 0.56, h: d * 0.56, objectName: 'icon' });
  };
  const T = (slide, text, o) => slide.addText(text, { isTextBox: true, margin: 0, ...o });
  const bullets = (arr) => arr.map((b, j) => ({ text: b, options: { bullet: true, breakLine: j < arr.length - 1, paraSpaceAfter: 5 } }));
  const notes = (slide, t) => slide.addNotes(t);

  /* ------------------------------------------------------------ shared: title */
  const trackLine = {
    nvidia: 'NVIDIA Nemotron agentic workflow on a SpacetimeDB backend',
    spacetimedb: 'Built on SpacetimeDB: one module is the whole backend',
    photon: 'Reaching people off the app with Photon and ElevenLabs, decided by Nemotron',
  }[TRACK];
  pres.addSection({ title: 'Opening' });
  let s = pres.addSlide({ masterName: 'DARK_TITLE', sectionTitle: 'Opening' });
  s.addText('SafeNight', { placeholder: 'title' });
  s.addText('Go out together. Get home together.', { placeholder: 'body' });
  T(s, trackLine, { x: 0.6, y: 4.0, w: 8.8, h: 0.4, fontSize: 14, color: C.accent6, objectName: 'subtitle' });
  s.addShape(pres.ShapeType.ellipse, { x: 7.3, y: 0.5, w: 2.1, h: 2.1, fill: { color: ACCENT, transparency: 85 }, line: { color: ACCENT, transparency: 85 }, objectName: 'glow' });
  s.addImage({ data: await icon(Fi.FiMoon, ACCENT), x: 7.85, y: 1.05, w: 1.0, h: 1.0, objectName: 'moon' });
  notes(s, `[0:00 – 0:15]\nHi, we're Sohaib and Ainesh, and this is SafeNight. Go out together, get home together.\n\nSafeNight is a consent-based safety app for a night out with friends. ${TRACK === 'nvidia' ? 'An NVIDIA Nemotron agent coordinates real people, and a policy layer makes sure it never takes the decision away from them.' : TRACK === 'spacetimedb' ? 'The entire backend is one SpacetimeDB module, and that choice shaped the whole product.' : 'When a friend is not in the app, SafeNight reaches them where they are: a text or a phone call, placed through Photon and decided by Nemotron.'}\n\nLet me start with the problem.`);

  /* ------------------------------------------------------- shared: problem */
  pres.addSection({ title: 'Problem' });
  s = pres.addSlide({ masterName: 'DARK_CONTENT', sectionTitle: 'Problem' });
  s.addText('A night out separates people fast', { placeholder: 'title' });
  const probs = [
    [Fi.FiUsers, H.accent2, 'Groups split up', 'Different bars, dead phones, a text nobody sees for an hour.'],
    [Fi.FiAlertTriangle, H.accent4, '"Sent" is not "seen"', 'A message in a group chat is not help. Nobody knows who is on it.'],
    [Fi.FiEyeOff, H.accent3, 'Tracking apps are all or nothing', 'Permanent location sharing feels like surveillance, so friends turn it off.'],
  ];
  for (let i = 0; i < probs.length; i++) {
    const [Ic, hex, head, body] = probs[i];
    const y = 1.45 + i * 1.2;
    card(s, 0.6, y, 5.3, 1.05);
    await circleIcon(s, Ic, hex, 0.8, y + 0.22);
    T(s, head, { x: 1.6, y: y + 0.12, w: 4.2, h: 0.35, fontSize: 18, bold: true, color: C.background1, objectName: 'p-head' });
    T(s, body, { x: 1.6, y: y + 0.5, w: 4.2, h: 0.5, fontSize: 13, color: C.background2, objectName: 'p-body' });
  }
  card(s, 6.2, 1.45, 3.2, 3.45);
  T(s, 'The scenario', { x: 6.45, y: 1.6, w: 2.8, h: 0.35, fontSize: 14, bold: true, color: C.accent1, objectName: 'sc-head' });
  s.addText([
    { text: 'Alex, Sam, Maya and Jordan', options: { bold: true, breakLine: true } },
    { text: 'are out together. Sam is the designated driver.', options: { breakLine: true } },
    { text: ' ', options: { breakLine: true } },
    { text: 'Late in the night Maya is alone and uneasy. She needs someone to come to her, now, without broadcasting her location to the world.', options: {} },
  ], { x: 6.45, y: 2.0, w: 2.8, h: 2.8, fontSize: 13, color: C.background2, isTextBox: true, margin: 0, valign: 'top', objectName: 'sc-body' });
  notes(s, `[0:15 – 0:45]\nA night out separates people fast. Someone's phone dies, someone walks off from the party, and the text you sent to check on them just sits there unread.\n\nThree things go wrong. Groups split up. A message in a group chat is not help: "sent" is not "seen", and nobody knows who's actually on it. And the apps that try to fix this are all-or-nothing trackers, so people turn them off.\n\nOur scenario: Alex, Sam, Maya and Jordan are out together. Sam is the designated driver. Late in the night Maya is alone and uneasy. She needs someone to come to her, now, without broadcasting her location to the world.`);

  /* ------------------------------------------------------ shared: solution */
  pres.addSection({ title: 'Solution' });
  s = pres.addSlide({ masterName: 'DARK_CONTENT', sectionTitle: 'Solution' });
  s.addText('One tap gets a real person moving', { placeholder: 'title' });
  const steps = [
    [Fi.FiHeart, H.accent4, '1 · Ask', 'Maya taps Need help → Come to me.'],
    [Fi.FiBell, H.accent3, '2 · Alert', TRACK === 'photon' ? 'Her group is alerted in the app, by text, or by a phone call.' : 'Her group is alerted. Nemotron plans who to reach first.'],
    [Fi.FiNavigation, H.accent2, '3 · Navigate', 'Jordan taps Accept & navigate. A live map shows both of them, plus walking directions.'],
    [Fi.FiCheckCircle, H.accent5, '4 · Arrived', 'Precise sharing ends when Jordan arrives. A human closes the loop.'],
  ];
  for (let i = 0; i < steps.length; i++) {
    const [Ic, hex, head, body] = steps[i];
    const x = 0.6 + i * 2.25;
    card(s, x, 1.55, 2.05, 2.6);
    await circleIcon(s, Ic, hex, x + 0.2, 1.75, 0.7);
    T(s, head, { x: x + 0.2, y: 2.6, w: 1.7, h: 0.4, fontSize: 16, bold: true, color: C.background1, objectName: 's-head' });
    T(s, body, { x: x + 0.2, y: 3.0, w: 1.7, h: 1.05, fontSize: 12, color: C.background2, valign: 'top', objectName: 's-body' });
  }
  T(s, 'Consent first: every share has a person, a scope and an expiry. The agent proposes, people decide.', { x: 0.6, y: 4.4, w: 8.8, h: 0.5, fontSize: 14, italic: true, color: C.accent1, objectName: 'principle' });
  notes(s, `[0:45 – 1:10]\nWith SafeNight, one tap gets a real person moving.\n\nAsk: Maya taps Need help, then Come to me. Alert: her group is alerted${TRACK === 'photon' ? ', in the app, by iMessage, or by an actual phone call if nobody answers' : ', and Nemotron works out who to reach first'}. Navigate: Jordan taps once and gets a live map with both of them and walking directions. Arrived: the moment he gets there, precise sharing between them ends.\n\nThe principle under all of it: every share has a person, a scope and an expiry. The agent proposes. People decide.`);

  /* ------------------------------------------------------- shared: product */
  pres.addSection({ title: 'Product' });
  s = pres.addSlide({ masterName: 'DARK_CONTENT', sectionTitle: 'Product' });
  s.addText('What is in the app', { placeholder: 'title' });
  const feats = [
    [Fi.FiUsers, H.accent2, 'Night Out groups', 'Start a hangout in one tap, join by code, designated driver with explicit acceptance.'],
    [Fi.FiLock, H.accent1, 'Consent per person', 'Approximate or precise location, check-ins, messaging. Each grant has an expiry and a revoke.'],
    [Fi.FiMap, H.accent5, 'Live finder map', 'Real GPS for everyone in the group; Come to me shows both people and opens walking directions.'],
    [Fi.FiCpu, H.accent3, 'Nemotron agent', 'Plans who to contact, waits for replies, escalates. Every step is a receipt: sent, delivered, acknowledged.'],
    [Fi.FiShield, H.accent4, 'Deterministic safety rules', '"May have been drinking" triggers a do-not-drive warning instantly, no AI in the path.'],
    [Fi.FiPhoneCall, H.accent2, TRACK === 'photon' ? 'Texts and calls' : 'Ride and home', TRACK === 'photon' ? 'Templated iMessage alerts and AI voice calls over Photon when a friend is not in the app.' : 'Ride deep links, pickup confirmation, "I\'m home" closes the incident. Only a human can resolve.'],
  ];
  for (let i = 0; i < feats.length; i++) {
    const [Ic, hex, head, body] = feats[i];
    const col = i % 3, row = Math.floor(i / 3);
    const x = 0.6 + col * 2.95, y = 1.45 + row * 1.8;
    card(s, x, y, 2.75, 1.6);
    await circleIcon(s, Ic, hex, x + 0.18, y + 0.18, 0.5);
    T(s, head, { x: x + 0.8, y: y + 0.2, w: 1.85, h: 0.45, fontSize: 14, bold: true, color: C.background1, objectName: 'f-head' });
    T(s, body, { x: x + 0.18, y: y + 0.75, w: 2.4, h: 0.8, fontSize: 11, color: C.background2, valign: 'top', objectName: 'f-body' });
  }
  notes(s, `[1:10 – 1:40]\nWhat's in the app. Night Out groups, where the driver has to accept the role. Consent per person: approximate or precise location, check-ins, messaging, each with an expiry. The live finder map with real GPS. The Nemotron agent, where every step is a receipt: sent, delivered, acknowledged, and we keep those distinct. Deterministic safety rules, with no AI in the path. ${TRACK === 'photon' ? 'And texts and calls: when a friend is not looking at the app, SafeNight reaches them by iMessage or an AI voice call over Photon.' : 'And ride and home: deep links, pickup confirmation, and only a human can resolve.'}`);

  /* ================================================== track-specific slides */
  pres.addSection({ title: 'Technology' });

  if (TRACK === 'nvidia') {
    // Inside the agent
    s = pres.addSlide({ masterName: 'DARK_CONTENT', sectionTitle: 'Technology' });
    s.addText('Inside the Nemotron agent', { placeholder: 'title' });
    const loop = [
      ['Context', 'Minimal, authorized: incident, participants, consent, last plan. Free text clipped and treated as data.', H.accent2],
      ['Nemotron 3.5 Super', 'nvidia/nemotron-3.5-super on NVIDIA NIM, called from a SpacetimeDB scheduled procedure. 40 s budget.', ACCENT],
      ['Tool calls', 'Allowlist: send_approved_message, request_confirmation, schedule_followup, update_incident_state, lookup_transport, propose_ride, hand_off, no_action.', H.accent3],
      ['Validator', 'Every call checked against participants, consent scopes, plan version, templates, rate limits. Invalid → blocked receipt, never executed.', H.accent4],
      ['Receipts', 'source: model | policy | simulated. Multi-round: results fed back, up to 3 rounds. Fallback planner when NIM is unreachable, always labeled.', H.accent5],
    ];
    for (let i = 0; i < loop.length; i++) {
      const [h, b, hex] = loop[i];
      const x = 0.6 + i * 1.78;
      card(s, x, 1.5, 1.62, 2.75, hex);
      T(s, h, { x: x + 0.12, y: 1.6, w: 1.4, h: 0.5, fontSize: 13, bold: true, color: hex, objectName: 'l-head' });
      T(s, b, { x: x + 0.12, y: 2.1, w: 1.4, h: 2.1, fontSize: 9.5, color: C.background2, valign: 'top', objectName: 'l-body' });
      if (i < loop.length - 1) s.addShape(pres.ShapeType.line, { x: x + 1.62, y: 2.85, w: 0.16, h: 0.001, line: { color: H.accent6, width: 1.5, endArrowType: 'triangle' }, objectName: 'l-arrow' });
    }
    T(s, 'What the model may never do: contact the person in trouble, resolve an incident, book anything, write free text to a friend, or dial a number it chose.', { x: 0.6, y: 4.45, w: 8.8, h: 0.5, fontSize: 13, italic: true, color: C.accent1, objectName: 'never' });
    notes(s, `[1:40 – 2:15]\nHere's the agent itself.\n\nIt gets a minimal, authorized context: the incident, who's in it, what each person consented to, and the previous plan. Nemotron 3.5 Super runs on NVIDIA NIM, called from inside a SpacetimeDB scheduled procedure.\n\nIt answers with tool calls from a fixed allowlist: send an approved message template, request confirmation, schedule a follow-up, update the incident state, look up transport, propose a ride, hand off, or do nothing.\n\nEvery call goes through a validator: participants, consent scopes, plan version, templates, rate limits. Anything invalid becomes a blocked receipt and never runs. Results are fed back for up to three rounds, and if NIM is unreachable a deterministic planner takes over, clearly labeled.\n\nAnd the hard rules: the model can never contact the person in trouble, never resolve an incident, never book anything, never write free text to a friend, never dial a number it picked.`);

    // Why this is agentic, with evidence
    s = pres.addSlide({ masterName: 'DARK_CONTENT', sectionTitle: 'Technology' });
    s.addText('An agent that adapts, with receipts', { placeholder: 'title' });
    const cols = [
      ['Plan v1', ['Alert Maya, the primary buddy', 'Ask her to confirm she is helping', 'Schedule a 2-minute follow-up', 'Incident → assistance_underway']],
      ['No reply → Plan v2', ['Follow-up timer fires in SpacetimeDB', 'Nemotron re-plans: alert Jordan, the backup', 'New confirmation request', 'Sent ≠ delivered ≠ acknowledged']],
      ['Jordan acks → Plan v3', ['Two tool rounds: lookup_transport, then propose_ride', 'Provider links only, nothing booked', 'Pickup confirmed by people', 'Only Sam can say "I\'m home"']],
    ];
    for (let i = 0; i < cols.length; i++) {
      const [h, b] = cols[i];
      const x = 0.6 + i * 2.95;
      card(s, x, 1.45, 2.75, 2.85);
      T(s, h, { x: x + 0.18, y: 1.58, w: 2.4, h: 0.4, fontSize: 15, bold: true, color: ACCENT, objectName: 'v-head' });
      s.addText(bullets(b), { x: x + 0.18, y: 2.05, w: 2.42, h: 2.15, fontSize: 11.5, color: C.background2, isTextBox: true, margin: 0, valign: 'top', objectName: 'v-body' });
    }
    T(s, 'Real plans from tonight\'s live run on Maincloud. Tested: 119 module tests incl. consent revocation, unauthorized access, duplicate events, escalation and prompt injection.', { x: 0.6, y: 4.45, w: 8.8, h: 0.5, fontSize: 12, color: C.accent6, objectName: 'ev' });
    notes(s, `[2:15 – 2:40]\nThis is why it's agentic and not a chatbot. Plan one: alert Maya, ask her to confirm, schedule a two-minute follow-up. She doesn't answer. The timer fires inside the database and Nemotron re-plans: plan two goes to Jordan, the backup. Jordan acknowledges, and plan three takes two tool rounds: look up transport, read the result, propose a ride. Provider links only, people book and confirm, and only Sam can say he's home.\n\nThese are the real plans from tonight's run. Behind them are 119 module tests, including consent revocation, unauthorized access and prompt injection.`);
  }

  if (TRACK === 'spacetimedb') {
    s = pres.addSlide({ masterName: 'DARK_CONTENT', sectionTitle: 'Technology' });
    s.addText('One module is the backend', { placeholder: 'title' });
    const stats = [['40+', 'tables'], ['50+', 'reducers'], ['22', 'views'], ['9', 'schedule tables'], ['119', 'in-process tests']];
    for (let i = 0; i < stats.length; i++) {
      const x = 0.6 + i * 1.78;
      card(s, x, 1.45, 1.62, 1.15);
      T(s, stats[i][0], { x, y: 1.5, w: 1.62, h: 0.65, fontSize: 32, bold: true, color: ACCENT, align: 'center', objectName: 'st-n' });
      T(s, stats[i][1], { x, y: 2.12, w: 1.62, h: 0.35, fontSize: 12, color: C.background2, align: 'center', objectName: 'st-l' });
    }
    const what = [
      ['Reducers are the API', 'Every write is one transaction with auth, rate limits and the safety rules inside it. The do-not-drive warning is written in the same transaction as the report.'],
      ['Views are the privacy model', 'Per-user views built with the query builder and semijoins. Row-level security filters on the alert table mean a phone only ever receives rows consented to it.'],
      ['Schedules are the agent', 'Scheduled reducers for check-in timers, follow-ups and sweeps. A scheduled procedure calls Nemotron over HTTPS, then writes receipts back transactionally.'],
    ];
    for (let i = 0; i < what.length; i++) {
      const x = 0.6 + i * 2.95;
      card(s, x, 2.85, 2.75, 1.95);
      T(s, what[i][0], { x: x + 0.18, y: 2.97, w: 2.4, h: 0.4, fontSize: 14, bold: true, color: C.background1, objectName: 'w-head' });
      T(s, what[i][1], { x: x + 0.18, y: 3.4, w: 2.4, h: 1.35, fontSize: 10.5, color: C.background2, valign: 'top', objectName: 'w-body' });
    }
    notes(s, `[1:40 – 2:10]\nSpacetimeDB is the backend. One TypeScript module on Maincloud: over forty tables, over fifty reducers, twenty-two views, nine schedule tables, and 119 tests that run the real database in-process.\n\nReducers are our API: every write is one transaction with auth, rate limits and the safety rules inside it. The do-not-drive warning is written in the same transaction as the report, which is why it lands on Sam's phone in under a second.\n\nViews are our privacy model: per-user views with semijoins, and row-level security on the alert table, so a phone only ever receives rows that were consented to it.\n\nAnd schedules are our agent: scheduled reducers for timers and sweeps, and a scheduled procedure that calls Nemotron over HTTPS and writes receipts back transactionally.`);

    s = pres.addSlide({ masterName: 'DARK_CONTENT', sectionTitle: 'Technology' });
    s.addText('SpacetimeDB features we lean on', { placeholder: 'title' });
    const grid = [
      ['Row-level security', 'safety_alert filtered recipient = :sender; session_member self-join'],
      ['Event table', 'Transient alerts pushed to exactly one connection'],
      ['Per-user views', 'my_incidents, my_meetups, visible_locations: consent-scoped'],
      ['Scheduled reducers', 'checkin_timer, followup_timer, expire_meetups, sweeps'],
      ['Scheduled procedures', 'agent_step → Nemotron; deliver_notification; transport lookup'],
      ['HTTP handlers', '/health and a signed webhook route, in the module'],
      ['Live position stream', 'meetup_position upserted at 4 Hz, pushed to one partner'],
      ['Env + lifecycle', 'schema(..., {env}) for keys; init/connect hooks arm schedules'],
      ['In-process tests', 'createModuleTestHarness: real DB in 119 unit tests'],
      ['Automatic migrations', 'a dozen publishes today, no data loss; module_meta refreshes cached views'],
      ['Maincloud', 'Four phones, one hosted database, no servers of our own'],
      ['Generated bindings', 'TypeScript client types from the module, React hooks for tables'],
    ];
    for (let i = 0; i < grid.length; i++) {
      const col = i % 4, row = Math.floor(i / 4);
      const x = 0.6 + col * 2.2, y = 1.45 + row * 1.15;
      card(s, x, y, 2.05, 1.0);
      T(s, grid[i][0], { x: x + 0.14, y: y + 0.1, w: 1.8, h: 0.3, fontSize: 12, bold: true, color: ACCENT, objectName: 'g-head' });
      T(s, grid[i][1], { x: x + 0.14, y: y + 0.42, w: 1.8, h: 0.55, fontSize: 9.5, color: C.background2, valign: 'top', objectName: 'g-body' });
    }
    notes(s, `[2:10 – 2:35]\nWe tried to use SpacetimeDB the way it wants to be used, not as a Postgres with a websocket.\n\nRow-level security filters and the event table deliver the warning to one connection. Per-user views carry the consent model. Scheduled reducers run every timer. Scheduled procedures call out to Nemotron and the routing provider and write results back. HTTP handlers live in the module. The Come to me stream is one row per person upserted four times a second. Environment variables, lifecycle hooks, the in-process test harness, automatic migrations across a dozen publishes today, generated TypeScript bindings, all on Maincloud with four phones on one database.`);
  }

  if (TRACK === 'photon') {
    s = pres.addSlide({ masterName: 'DARK_CONTENT', sectionTitle: 'Technology' });
    s.addText('Reaching people outside the app', { placeholder: 'title' });
    const cols = [
      [Fi.FiMessageSquare, H.accent2, 'Text: Photon Spectrum', ['Shared iMessage line via spectrum-ts', 'Friends opt in by texting "join <persona>" from their registered phone', 'Fixed templates only: "SafeNight alert (demo): …  Reply ON IT or CAN\'T."', 'Replies come back as acknowledgments']],
      [Fi.FiPhoneCall, H.accent3, 'Call: ElevenLabs over Photon SIP', ['Photon 2.0 SIP trunk (sip.photon.codes, TLS) imported into ElevenLabs', 'Buddy agent: "{{reporter}} may need help at {{location}}. Can you check on them?"', 'Verified live: Nemotron decision → real call to a teammate\'s phone', 'Post-call webhook records the outcome']],
      [Fi.FiCpu, ACCENT, 'Decided by Nemotron', ['Tools: text_group, call_person, dispatch_call', 'Escalation: primary buddy → backup → simulated dispatch', 'Model picks the template; the bridge renders it', 'Simulated planner when no key, always labeled']],
    ];
    for (let i = 0; i < cols.length; i++) {
      const [Ic, hex, head, b] = cols[i];
      const x = 0.6 + i * 2.95;
      card(s, x, 1.45, 2.75, 3.4, hex);
      await circleIcon(s, Ic, hex, x + 0.18, 1.6, 0.5);
      T(s, head, { x: x + 0.8, y: 1.6, w: 1.9, h: 0.5, fontSize: 13, bold: true, color: C.background1, objectName: 'c-head' });
      s.addText(bullets(b), { x: x + 0.18, y: 2.25, w: 2.42, h: 2.5, fontSize: 10.5, color: C.background2, isTextBox: true, margin: 0, valign: 'top', objectName: 'c-body' });
    }
    notes(s, `[1:40 – 2:15]\nThe app is only useful if it reaches the friend who isn't looking at it. That's what Photon gives us.\n\nText: a shared iMessage line through Photon Spectrum. Friends opt in by texting "join" and their name from their registered phone. Every alert is a fixed template, "SafeNight alert, reply ON IT or CAN'T", and the reply comes back as an acknowledgment.\n\nCall: we imported a Photon 2.0 SIP trunk into ElevenLabs. When nobody answers, an AI buddy agent calls the backup: "Maya may need help near Residence Hall West, can you check on her?" We verified this live: a real Nemotron decision placed a real call to a teammate's phone.\n\nNemotron decides which: text the group, call a person, or, as a last resort, a simulated dispatch call. It picks the template; the bridge renders the words.`);

    s = pres.addSlide({ masterName: 'DARK_CONTENT', sectionTitle: 'Technology' });
    s.addText('Guardrails on every text and call', { placeholder: 'title' });
    const rails = [
      ['Never the subject', 'The person in trouble is never called or texted by the agent. Policy blocked it live; Nemotron re-planned to the organizer.'],
      ['Emergency numbers blocked', '911, 112, 999, 988 and short codes rejected after normalization. Dispatch goes only to DEMO_DISPATCH_NUMBER, never a model-chosen number.'],
      ['Dispatch is a last resort', 'Only urgent + (emergency check-in or nobody acknowledged), once per incident, and the agent opens: "This is a SafeNight demo, a simulated dispatch call."'],
      ['Consent and cooldowns', 'Texts only to opted-in friends; one call per person per 5 minutes; resolved incidents get nothing. Blocked actions are stored with their reason.'],
      ['Nothing model-authored', 'Templates and dynamic variables are built by the bridge from incident fields: URLs, numbers and newlines stripped, 80 chars per field.'],
      ['Honest about what is live', 'SMS waits on 10DLC registration, so texting runs on iMessage or stays off. Everything simulated is labeled SIMULATED on screen.'],
    ];
    for (let i = 0; i < rails.length; i++) {
      const col = i % 3, row = Math.floor(i / 3);
      const x = 0.6 + col * 2.95, y = 1.45 + row * 1.75;
      card(s, x, y, 2.75, 1.55);
      T(s, rails[i][0], { x: x + 0.18, y: y + 0.12, w: 2.4, h: 0.35, fontSize: 13, bold: true, color: i === 1 ? H.accent4 : C.background1, objectName: 'r-head' });
      T(s, rails[i][1], { x: x + 0.18, y: y + 0.5, w: 2.4, h: 1.0, fontSize: 10, color: C.background2, valign: 'top', objectName: 'r-body' });
    }
    notes(s, `[2:15 – 2:40]\nTexting and calling real phones from an AI agent needs guardrails, so here they are.\n\nThe person in trouble is never the one contacted; policy blocked exactly that live and Nemotron re-planned. Emergency numbers and short codes are hard-blocked after normalization, and dispatch can only ever reach a demo number we control, opening with "this is a simulated dispatch call." Dispatch is a last resort: urgent, nobody acknowledged, once per incident. Texts only to people who opted in, one call per person per five minutes, nothing for resolved incidents, and every blocked action is stored with its reason. The model never writes the words; the bridge renders templates. And we're honest about what's live: SMS waits on 10DLC, so texting runs on iMessage, and anything simulated says so on screen.`);
  }

  /* ------------------------------------------------------ architecture */
  s = pres.addSlide({ masterName: 'DARK_CONTENT', sectionTitle: 'Technology' });
  s.addText('Architecture', { placeholder: 'title' });
  const box = (x, y, w, h, head, body, hex, name) => {
    s.addShape(pres.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.1, fill: { color: H.dk2 }, line: { color: hex, width: 1.25 }, objectName: name });
    T(s, head, { x: x + 0.15, y: y + 0.08, w: w - 0.3, h: 0.32, fontSize: 13, bold: true, color: hex, objectName: name + '-head' });
    if (body) T(s, body, { x: x + 0.15, y: y + 0.42, w: w - 0.3, h: h - 0.5, fontSize: 10, color: C.background2, valign: 'top', objectName: name + '-body' });
  };
  const arrow = (x1, y1, x2, y2, label, hex, name, both = false) => {
    s.addShape(pres.ShapeType.line, { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1) || 0.001, h: Math.abs(y2 - y1) || 0.001, flipH: x2 < x1, flipV: y2 < y1, line: { color: hex, width: 1.5, endArrowType: 'triangle', beginArrowType: both ? 'triangle' : 'none' }, objectName: name });
    if (label) T(s, label, { x: Math.min(x1, x2) - 0.05, y: (y1 + y2) / 2 - 0.5, w: Math.abs(x2 - x1) + 0.1, h: 0.42, fontSize: 8, color: C.accent6, align: 'center', valign: 'bottom', objectName: name + '-label' });
  };
  const hl = (k) => (TRACK === k ? ACCENT : null);
  box(0.6, 1.45, 2.2, 1.15, 'Phones · PWA', 'React on Vercel, added to the home screen. Geolocation + motion sensors, Leaflet map.', H.accent2, 'phones');
  box(0.6, 3.05, 2.2, 0.85, 'Apple / Google Maps', 'Walking directions hand-off (deep link).', H.accent6, 'maps');
  arrow(1.7, 2.6, 1.7, 3.05, '', H.accent6, 'a-maps');
  box(3.55, 1.45, 3.1, 3.45, 'SpacetimeDB · Maincloud', '', hl('spacetimedb') || H.accent1, 'stdb');
  const inner = [
    ['Tables (40+)', 'sessions, members, consent grants, incidents, meetups, live positions'],
    ['Reducers (50+)', 'every write is a transaction with auth + rate limits'],
    ['Views + RLS', 'per-user: you receive only what was consented to you'],
    ['Schedules + events', 'check-in timers, sweeps, agent steps; safety_alert pushed in ms'],
  ];
  for (let i = 0; i < inner.length; i++) {
    const y = 1.9 + i * 0.72;
    s.addShape(pres.ShapeType.roundRect, { x: 3.7, y, w: 2.8, h: 0.62, rectRadius: 0.08, fill: { color: H.dk1 }, line: { color: H.dk1 }, objectName: 'in-' + i });
    T(s, inner[i][0], { x: 3.82, y: y + 0.05, w: 2.6, h: 0.25, fontSize: 11, bold: true, color: C.background1, objectName: 'in-h-' + i });
    T(s, inner[i][1], { x: 3.82, y: y + 0.3, w: 2.6, h: 0.3, fontSize: 9, color: C.background2, objectName: 'in-b-' + i });
  }
  arrow(2.8, 2.15, 3.55, 2.15, 'WebSocket\nlive sync', H.accent2, 'a-ws', true);
  box(7.3, 1.45, 2.1, 1.5, 'NVIDIA NIM', 'nvidia/nemotron-3.5-super. Called from a scheduled procedure: plan → tool calls → receipts.', hl('nvidia') || H.accent3, 'nim');
  arrow(6.65, 2.25, 7.3, 2.25, 'HTTPS', H.accent3, 'a-nim', true);
  box(7.3, 3.4, 2.1, 1.5, 'Policy layer', 'Tool allowlist + validator inside the module. Never contacts the subject, never resolves. Simulated fallback, labeled.', H.accent4, 'policy');
  arrow(8.35, 2.95, 8.35, 3.4, '', H.accent4, 'a-policy');
  box(0.6, 4.05, 2.2, 0.85, TRACK === 'photon' ? 'Bridge · Photon + ElevenLabs' : 'Bridge (simulated)', TRACK === 'photon' ? 'iMessage via Spectrum; voice via SIP trunk; policy-checked.' : 'Voice and SMS service; off in the demo.', hl('photon') || H.accent6, 'bridge');
  arrow(2.8, 4.5, 3.55, 4.5, '', hl('photon') || H.accent6, 'a-bridge');
  notes(s, `[${TRACK === 'nvidia' ? '2:40 – 2:55' : '2:35 – 2:50'}]\nOne picture of the architecture. Phones run the PWA and talk to SpacetimeDB over a single WebSocket: reducers up, subscriptions down. The module in the middle holds tables, reducers, views with row-level security, schedules and events. On the right, NVIDIA NIM running Nemotron, called from a scheduled procedure, with the policy layer deciding what the agent may do. Walking directions hand off to Apple or Google Maps${TRACK === 'photon' ? ', and the bridge at the bottom left is where Photon lives: iMessage through Spectrum, voice through the SIP trunk, every action policy-checked' : ', and a small bridge handles voice and messaging, simulated in the demo'}.`);

  /* ------------------------------------------------------------- close */
  pres.addSection({ title: 'Close' });
  s = pres.addSlide({ masterName: 'DARK_TITLE', sectionTitle: 'Close' });
  s.addText('Get home together', { placeholder: 'title' });
  s.addText('safenight-liart.vercel.app  ·  github.com/sabharwalainesh/SafeNight', { placeholder: 'body' });
  T(s, TRACK === 'photon' ? 'Calls verified live over Photon. Messaging and dispatch are simulated in the demo. Location is real.' : 'Messaging and calls are simulated in the demo. Location is real.', { x: 0.6, y: 4.0, w: 8.8, h: 0.4, fontSize: 14, color: C.accent6, objectName: 'disclaimer' });
  s.addImage({ data: await icon(Fi.FiNavigation, ACCENT), x: 8.0, y: 0.7, w: 1.1, h: 1.1, objectName: 'nav' });
  notes(s, `[2:55 – 3:00]\nThat's SafeNight. Get home together. It's live at safenight-liart.vercel.app and the code is on GitHub. Thank you, happy to take questions.`);

  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log('written', OUT);
})().catch((e) => { console.error(e); process.exit(1); });
