# SafeNight Live Activity (iOS dev build)

A real, data-driven Live Activity for the caller's most recent open incident (as subject or participant), built from `useSafety()` / `useAgent()`. Lock screen plus Dynamic Island (compact, minimal, expanded) with Check in / I'm good / Need help buttons. Cards carry a SIMULATED badge when the underlying data is simulated.

## Run in the iOS Simulator

1. Backend: Maincloud URL, or locally `spacetime start` + publish the module; the simulator can use `ws://localhost:3000` (set in the app's setup screen).
2. `cd mobile && npm install && npx expo prebuild --platform ios && npx expo run:ios --device "iPhone 17 Pro"` (scripts: `npm run prebuild:ios`, `npm run ios:sim`). Metro serves the JS.
3. Pick persona Sam in the simulator. From a laptop browser tab, as Alex, report a concern about Sam.
4. Lock the simulator (Cmd+L) and watch the card. Buttons call the real reducers.

Expo Go cannot show it; the JS wrapper is a no-op there, on web, and in tests.

## Mapping

open -> step 0 "Concern reported"; acknowledged / assistance_underway -> 2 "<helper> is on the way"; transport_arranged -> 3 "Ride booked"; awaiting_home_confirmation -> 4 "Picked up"; resolved -> 5 "<subject> is home ✓" (ended after 8 s); cancelled / handed_off -> ended. "Home" is only shown when `incident.status === 'resolved'`. Helper = latest participant (not the subject) with `acknowledgedAt`, else an acknowledged agent notification recipient. ETA = chosen (else first) ride option's `etaMinutes`. Updates are debounced 1 s.

Buttons: I'm good -> `checkIn('okay','')`; Need help -> `checkIn('need_friend','')`; Check in opens the app (`openAppWhenRun`) and also sends `checkIn('okay','')` (the app has no navigation hook for this).

## Files

New: `modules/safenight-live-activity/` (Expo module: Swift ActivityKit bridge, `index.ts` wrapper), `targets/widget/` (widget extension via `@bacons/apple-targets`; `targets/widget/Shared/` holds `IncidentAttributes` + the three `LiveActivityIntent`s, compiled into the widget AND into the module pod via the podspec `source_files`), `src/liveActivity/IncidentLiveActivity.tsx`.

Edits to existing A-owned files (additive only): `app.json` (plugins `expo-dev-client`, `@bacons/apple-targets`; `ios.infoPlist` NSSupportsLiveActivities and NSSupportsLiveActivitiesFrequentUpdates), `package.json` (deps `expo-dev-client`, `@bacons/apple-targets`; scripts `prebuild:ios`, `ios:sim`), `package-lock.json`, `src/App.tsx` (imports and mounts `<IncidentLiveActivity />` inside `LiveProviders`).

## Limitations

- Updates while the app is suspended need APNs push (not built); the card updates while the JS runtime is alive.
- Button taps run the intent in the app process and reach JS through the module's `onIntent` event; if JS is not running, the action is queued and delivered when JS starts listening.
- `ios.appleTeamId` is not set; fine for simulator builds, required for device builds.
- `mobile/ios` is git-ignored; regenerate with `prebuild`.
