# Person B: handoff for the next agent (2026-11-08)

Read `AGENTS.md`, `WORKFLOW.md` (Person B section) and `docs/ARCHITECTURE.md` §7a first.

**Rules:**
- Never commit secrets: `bridge/.env` and `.codex/` stay local.
- No Claude or Anthropic attribution in commits.
- Don't touch `video/`: another session has uncommitted work there.
- Dispatch calls stay SIMULATED. Emergency numbers are hard-blocked.

## 1. Finish "Demo mode (UT Dallas)": in progress, branch `wip/utd-demo`

Partial code is in `web/src/features/utd-demo/` (about 920 lines). It isn't wired into the app yet and has one type error.

| File | What it is |
|---|---|
| `scenario.ts` | The people and the UTD spots |
| `machine.ts` | The pure timeline state machine |
| `live.ts` | Moving dots |
| `routing.ts` | OSRM foot routing with a straight-line fallback |
| `DemoMap.tsx` | The map |
| `UtdDemo.tsx` | The screen shell |

Start with `git checkout wip/utd-demo`, then `npm run typecheck -w web`.

**Spec (what the user asked for):** a self-contained, scripted demo the user can run on phones from the Vercel site, with no real people needed.

- **Entry:** You tab → "Demo mode (UT Dallas)", and the URL `?demo=utd`. Show a "DEMO · simulated people" pill and an Exit button.
- **People:** 5 hardcoded friends at UTD spots: ECSS, Student Union, McDermott Library, Residence Hall West and Northside. The dots drift live. "You" is real GPS when within about 3 km of UTD (32.9858, -96.7501), otherwise the Plinth.
- **Timeline:** it auto-advances, with "next event" and "restart" controls:
  1. Check-ins arrive.
  2. A **"Maya needs help"** alert appears, with toast and vibration.
  3. The Nemotron panel opens.
- **Nemotron panel:** the reasoning types out, then ranked options with policy badges:
  1. You go: closest, with distance from routing.
  2. Call Jordan.
  3. Text the group.
  4. Book a ride via Uber or Lyft deep links, never auto-booked.
  5. Dispatch: not recommended, and SIMULATED.

  Each option has an Accept button. Add a footnote saying it's scripted output for `nvidia/nemotron-3.5-lightning-30b-a3b`.
- **Map:** the walking route via `https://routing.openstreetmap.de/routed-foot/route/v1/foot/{lng},{lat};{lng},{lat}?overview=full&geometries=geojson&steps=true` (verified working), with distance, arrival time and turn-by-turn steps.
- **Compass to Maya:** use the device heading via `useHeading` in `features/meetup/useDeviceSensors.ts`. Add a **"Simulate walking"** button that moves you along the route, and detect arrival within 15 m.
- **Messages tab:** an iMessage-style thread with timed incoming texts (SafeNight agent, friends, then Maya after arrival). The user can type replies. Show an unread badge.
- **End:** Maya taps "I'm home", the incident resolves, and a summary card shows who helped and what happened.
- **Extras:** light showcase cards for the invite share, Come to me, the driver concern banner and venue reports.
- **Design:** match the iOS tokens in `web/src/index.css`, respect reduced motion, and keep phone width with no horizontal scroll.
- **Tests:** a vitest for `machine.ts` and the routing fallback. Keep `npm test -w web` green and make sure `npm run build -w web` passes.
- **Ship:** merge into `main`, then ask Sohaib to redeploy Vercel (see `docs/DEMO_DAY.md`).

## 2. Deploys needed (Sohaib owns Maincloud and Vercel)

Main contains database changes that aren't on Maincloud yet:
- profile photos: `profile_photo` and `set_profile_photo`;
- the realtime compass stream: `meetup_position`, `stream_meetup_position` and `my_meetup_positions`.

Publish the database first, then redeploy the website. The commands are in `docs/DEMO_DAY.md` under "Maintenance" and in the Vercel line.

## 3. Real text and call demo (works now, from a laptop with `bridge/.env`)

**Call the user's phone as a friend about lost Alex:**
```
cd bridge && PHONE_JORDAN="$(node --env-file=.env -e 'process.stdout.write(process.env.PHONE_ALEX)')" npx tsx --env-file-if-exists=.env scripts/lost-call.ts --to jordan --lost Alex
```
This uses the ElevenLabs agent "SafeNight Buddy".

**Call Alex directly:** use the ElevenLabs agent "SafeNight Check-in", `agent_8501m6xc1yhkfbqvjcp5ckss1tag`, created this session. Send it the dynamic variables `person_name`, `friends`, `minutes_since` and `location_text`.

**Text the user's phone:** send an iMessage through Photon, project `pho_prj_01m6wvkm66eh78gczbsptzazp7`:
- sender `pho_usr_1zj8c1fqe8g19tq8xa99n9y8my` (shared line +1 628-316-6196);
- space `pho_spc_0cvazwjjzphb0v4yyr5z6zw4nr`;
- this works today with the Photon MCP `sendMessage`.

Plain SMS stays blocked until a 10DLC campaign is assigned (`SMS_CAMPAIGN_NOT_ASSIGNED`).

**Idea:** add `npm run demo:alert` to the bridge, which texts and calls in one command. Read keys from `.env` and never print them.

## 4. Open items

- **ElevenLabs key:** the user should rotate it. It appeared in `.codex/config.toml` and in an earlier chat. Then update `bridge/.env`.
- **iPhone dev build (`mobile/`):** it needs a rebuild in Xcode for the new native modules (photos, contacts, SMS, menus). The team currently demos on the website, so this is low priority.
- **Not yet verified on two physical phones:**
  - the realtime compass stream;
  - profile photos;
  - the invite share;
  - the contact picker (Android Chrome only on the web).
