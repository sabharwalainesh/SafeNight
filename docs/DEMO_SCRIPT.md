# SafeNight judge demo script (~5 minutes)

Personas: **Alex** (organizer), **Sam** (designated driver), **Maya** (primary buddy), **Jordan** (backup).

## What is real vs simulated

- All client features currently run on **local mock data** (localStorage + BroadcastChannel keeps tabs in one browser in sync), marked with MOCK DATA badges. The SpacetimeDB C1-C4 tables are still being built (Person A).
- The agent in this demo is a **deterministic simulated planner**, not Nemotron. Real Nemotron runs in a SpacetimeDB scheduled procedure only once C3-A lands and `NEMOTRON_API_KEY` is set.
- Messaging is **simulated**. No SMS is sent. Ride options are deep links; the app never books or pays.
- Locations are simulated coordinates. Report/resource seed data is fictional.

## Setup

1. `npm install` at the repo root, then `npm run dev -w web`.
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

## Safety rules to call out

- The no-driving warning is deterministic and fires on the report, independent of the agent.
- The agent cannot resolve an incident. Only a human confirmation ("I'm home", resolved by Sam) can.
- Sent is not delivered is not acknowledged is not booked is not completed. The UI keeps these states distinct.
- Consent revocation blocks messaging: optionally, before step 2, have Maya turn off her **Messaging** toggles for everyone (Night Out, Consent). The agent records a **Blocked** receipt for Maya and goes straight to Jordan.
- Hold-to-confirm emergency prevents accidental triggers (Map).

## Running the same script on live SpacetimeDB data

1. Start the server and publish the module (README, "Backend and local development"), then `npm run dev:live -w web`.
2. Open the four persona tabs. There is no one-click group setup on live data: as **Alex**, create the session in **Night Out** and create an invite; join with the code from the Sam, Maya and Jordan tabs. As **Sam**, volunteer and accept the driver role. Each person turns on sharing and the consent toggles they want.
3. Continue from walkthrough step 1. "Advance timer" and "Reset demo" in the Profile demo panel call the module's demo reducers. Plans show SIMULATED unless the module has `NEMOTRON_API_KEY` set.
4. Phone entry is hidden on live data until the module stores phone numbers privately.

## Backup if something breaks

- Profile, **Reset demo**, then **Set up demo group** again and restart from step 2.
- If tabs stop syncing, confirm all four are in the same browser profile (not private windows) and reload.
- If a screen misbehaves, say plainly that the client is running on mock data and walk the timeline with the remaining tabs.
