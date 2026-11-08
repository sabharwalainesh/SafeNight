# SafeNight judge demo script (~5 minutes)

Personas: **Alex** (organizer), **Sam** (designated driver), **Maya** (primary buddy), **Jordan** (backup).

## What is real vs simulated

- All client features currently run on **local mock data** (localStorage + BroadcastChannel keeps tabs in one browser in sync), marked with MOCK DATA badges. The SpacetimeDB C1-C4 tables are still being built (Person A).
- The agent in this demo is a **deterministic simulated planner**, not Nemotron. Real Nemotron runs in a SpacetimeDB scheduled procedure only once C3-A lands and `NEMOTRON_API_KEY` is set.
- Messaging is **simulated**. No SMS is sent. Ride options are deep links; the app never books or pays.
- Locations are simulated coordinates. Report/resource seed data is fictional.

## Setup

1. `npm install` at the repo root, then `npm run dev:mock -w web` for mock data (or see the live section below).
2. Open four tabs in one browser: `?as=alex`, `?as=sam`, `?as=maya`, `?as=jordan`. Arrange them side by side.
3. In any tab, go to **Profile** and tap **Set up demo group** (creates a session with all four, Sam as accepted driver, consents granted). Check the **Night Out** tab: roster shows four people and Sam's accepted driver role.

## Walkthrough

1. **Alex, Night Out/Map**: show the roster, Sam's explicit driver acceptance, and per-person consent. Map shows consented locations only (simulated, with a stale state).
2. **Alex, Map, concern sheet**: report "May have been drinking" about Sam.
3. **Sam tab**: the no-driving warning banner appears immediately on whichever tab Sam is on. Point out: this is a deterministic rule and does not wait for any AI.
4. **Alex or Sam, Inbox**: open the new incident. The **SafeNight agent** panel shows **plan v1** (SIMULATED) and tool receipts, and the timeline logs each step. The message to Maya shows **sent**, then **delivered** (simulated).
5. **Maya tab, Inbox**: she sees the alert but does nothing. Note that "sent/delivered" is not "acknowledged".
6. **Profile (any tab), Advance timer (simulate no reply)**: the timeout fires and the workflow escalates to Jordan. The agent panel shows **plan v2** and a new message to Jordan. (The demo panel lists jobs only in tabs whose persona is part of the incident.)
7. **Jordan tab, Inbox**: tap **I'm on it**. Status becomes **acknowledged**.
8. **Ride options** appear in the incident. **Sam** chooses an option and taps **I booked this** (the app only opens a deep link; booking happens outside it).
9. **Sam or Jordan** taps **Confirm pickup** (only the rider or the buddy who acknowledged can). The incident moves to waiting for Sam's confirmation.
10. **Sam, Inbox**: open the incident and tap **I'm home safe**, then confirm. The incident resolves, attributed to Sam.

**Optional, with the bridge running (live calls):** after step 2, show the **Emergency coordination** panel on the incident. Nemotron's reasoning appears, then a **call to the buddy's real phone** (ElevenLabs voice over the Photon line). If nobody presses "I'm on it", it calls the backup, and for an urgent, unacknowledged incident it places the **SIMULATED DISPATCH** call to the teammate playing the dispatcher. The agent opens with "This is a SafeNight demo. This is a simulated dispatch call, not a real emergency." Point out that Nemotron proposes and the policy decides: calling the person in trouble is blocked, dispatch only goes to the demo number, and real emergency numbers are hard-blocked.

## Safety rules to call out

- The no-driving warning is deterministic and fires on the report, independent of the agent.
- The agent cannot resolve an incident. Only a human confirmation ("I'm home", resolved by Sam) can.
- Sent is not delivered is not acknowledged is not booked is not completed. The UI keeps these states distinct.
- Consent revocation blocks messaging: optionally, before step 2, have Maya turn off her **Messaging** toggles for everyone (Night Out, Consent). The agent records a **Blocked** receipt for Maya and goes straight to Jordan.
- Hold-to-confirm emergency prevents accidental triggers (Map).

## Running the same script on live SpacetimeDB data

1. Start the server and publish the module (README, "Backend and local development"), then `npm run dev -w web` (live is the default; `npm run dev:mock -w web` runs on local mocks).
2. Open the four persona tabs. Each tab registers its persona with the server; the Profile demo panel shows a check mark for each.
3. When all four show ✓, tap **Set up demo group** in Profile. The server creates the session with Alex as organizer, Sam as accepted driver, Maya and Jordan as buddies, and the demo consents.
4. Continue from walkthrough step 1. "Advance timer" fires the server's follow-up timer. "Reset demo group" ends the demo session and cancels its incidents; "Wipe all demo data" clears every demo row. Plans show SIMULATED unless the module has `NEMOTRON_API_KEY` set.
5. Phone entry is hidden on live data until the module stores phone numbers privately.

## Backup if something breaks

- Profile, **Reset demo**, then **Set up demo group** again and restart from step 2.
- If tabs stop syncing, confirm all four are in the same browser profile (not private windows) and reload.
- If a screen misbehaves, say plainly that the client is running on mock data and walk the timeline with the remaining tabs.

## Four-device demo (2 laptop tabs, 2 phones)

**Casting**: Alex and Jordan in two tabs on the laptop; Sam and Maya on the two phones.

**Must be live data.** Mock mode syncs only within one browser, so phones cannot share it.

1. **Backend reachable from the phones.** Either Maincloud (`spacetime login`, then `spacetime publish`) and use its `wss://` URL, or a laptop server reachable on the same Wi-Fi (`ws://<laptop-ip>:3000`). Never `localhost`.
2. **Serve the app on the LAN**: `VITE_SPACETIMEDB_HOST=<url> npm run dev:phone -w web`. It prints LAN URLs with `?as=sam` and `?as=maya`. (`npm run preview:phone -w web` after a build works too.)
3. **Phones**: open the printed URL, then Add to Home Screen (iOS: Share, Add to Home Screen; Android: the Install app button). Launch from the icon and pick the persona once ("Who is this phone?"); it is remembered on that device.
4. **Laptop**: open `?as=alex` and `?as=jordan` in two tabs. Run **Set up demo group** from Profile once all four personas show a check mark.
5. **Bridge (optional, real messages)**: run the bridge on the laptop, fed by Alex's tab, with `VITE_BRIDGE_URL=http://127.0.0.1:8787` set only for the laptop's dev server (not the phone one). Real iMessage and calls then land on the phones.
6. Follow the walkthrough above.

**Troubleshooting**
- Phone cannot connect: the SpacetimeDB host is not reachable from the phone. Check the URL, firewall, and that phone and laptop share Wi-Fi.
- Service worker needs https. On a plain-http LAN the app still works but will not cache or work offline.
- Wrong persona on a phone: use the persona chip menu, or open the URL with `?as=<name>`.
