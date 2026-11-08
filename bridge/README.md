# SafeNight bridge

Standalone Node 22 service (not an npm workspace). Browser incident screens POST incident snapshots; the bridge asks Nemotron what to do, validates every action against a pure policy, then texts friends (Photon) and places calls (ElevenLabs over Photon SIP). The dispatch call is always a SIMULATED demo call to a number you control.

```
npm install --prefix bridge
cp bridge/.env.example bridge/.env   # then export the vars (the bridge reads process.env)
npm run dev --prefix bridge
npm test --prefix bridge && npm run typecheck --prefix bridge
```

Without keys everything runs SIMULATED (logged, short timers, `simulated: true`). `SIMULATE_ALL=1` forces this even when keys are set. Without `NEMOTRON_API_KEY` (or if Nemotron fails/times out at 20 s) a deterministic `simulated-planner` decides instead.

## Dispatch guardrails

- The dispatch call goes ONLY to `DEMO_DISPATCH_NUMBER`. The model never supplies a number. If it is unset, the action is recorded as blocked ("No demo dispatch number configured").
- Any dispatch or call number is hard-blocked if, after stripping non-digits (and a leading country prefix 1/00/011), it equals or starts with 911, 112, 999, 000, 110, 119, 118, 100, 101, 102, 108, 933, 988, has 6 or fewer digits, or appears in `BLOCKED_NUMBERS`.
- Dispatch needs severity `urgent` AND (latest check-in is an emergency OR nobody acknowledged), and only once per incident.
- The dispatch agent must open with: "This is a SafeNight demo. This is a simulated dispatch call, not a real emergency."
- Calls: one per person per 5 minutes, only to incident participants with a registered phone. Texts go only to people who opted in. Resolved/cancelled incidents get no actions. Incident free text is truncated to 280 chars and treated as data.
- Blocked actions are stored with the reason and never executed.

## Setup

1. Photon (Spectrum): the project is created with `npm create spectrum-project@latest safe-night -- --projectId <id> --providers imessage`. Put the project credentials in `bridge/.env` as `PHOTON_PROJECT_ID` and `PHOTON_PROJECT_SECRET`. The bridge uses the `spectrum-ts` SDK (`Spectrum({projectId, projectSecret, providers:[imessage.config()]})`), reads inbound from `app.messages`, and replies with `space.send(text)`. The shared iMessage line cannot send an unsolicited first message and only talks to phones added under Users in the Photon dashboard. Add each teammate under Users; the shared line number is shown in the dashboard. The optional webhook path (`/v1/webhooks/photon`, `PHOTON_WEBHOOK_SECRET`) is kept but not needed.
2. ElevenLabs: import a SIP trunk phone number pointing at `sip.photon.codes:5061` with TLS, and note its phone number id (`ELEVENLABS_AGENT_PHONE_NUMBER_ID`). Create two agents (`ELEVENLABS_BUDDY_AGENT_ID`, `ELEVENLABS_DISPATCH_AGENT_ID`) using dynamic variables `{{call_type}} {{person_name}} {{location_text}} {{maps_url}} {{situation}} {{reporter}} {{minutes_since}} {{callback_note}}`. Post-call webhook (transcription and call initiation failure): `https://<public-host>/v1/webhooks/elevenlabs`, HMAC secret in `ELEVENLABS_WEBHOOK_SECRET`.
3. Set `PHONE_ALEX/SAM/MAYA/JORDAN` to each teammate's phone (E.164). Each teammate texts `join <persona>` to the shared line from that phone. The bridge accepts the join only if the sender's normalized phone equals the configured one; otherwise it replies "This number isn't set up for <persona>." and records nothing. An existing registration is never overwritten by a different sender, and replies are matched by registered phone + space (never by sender id alone). The bridge can only text a person after they have messaged the line once in this run; otherwise the action is blocked with "Ask <name> to text the SafeNight line first".
4. Web client sends `x-bridge-token: $BRIDGE_TOKEN` (CORS allows localhost origins only). The browser-held `BRIDGE_TOKEN` is demo-only; the production path is the SpacetimeDB module feeding the bridge server-side.
5. The server binds `127.0.0.1` by default. `BRIDGE_HOST=0.0.0.0` exposes it to your network: do that only behind a firewall/TLS. `/v1/incidents/sync` is rate-limited to 30 requests/min per IP.

Outbound text is never model-authored. `text_group` takes only `{template}` (`help_needed`, `driver_concern`, `escalation`, `update_resolved_by_person`); the bridge renders it from incident fields (URLs, phone-like numbers and newlines stripped, 80 chars per field, maps link built from lat/lng) between the fixed prefix "SafeNight alert (demo):" and suffix "Reply ON IT or CAN'T.". Call dynamic variables are bridge-built the same way. Model reason text appears only in the receipt.

## Secrets

Put secrets only in `bridge/.env` (git-ignored). Never paste keys into chat or commits; rotate any key that was ever pasted into chat.

Buddy agent prompt (suggested): "You are SafeNight, calling {{person_name}} because {{reporter}} may need help. Situation: {{situation}}. Location: {{location_text}} ({{maps_url}}), about {{minutes_since}} minutes ago. Ask if they can check on {{reporter}} right now. Keep it under 30 seconds. If they say yes, confirm and say {{callback_note}}. Never claim to be emergency services."

Simulated dispatch agent prompt (suggested): "Open with exactly: 'This is a SafeNight demo. This is a simulated dispatch call, not a real emergency.' Then read the situation: {{situation}} for {{person_name}} at {{location_text}}, reported by {{reporter}}, {{minutes_since}} minutes ago. Offer {{callback_note}}. End the call."

## API

All `/v1/incidents*` routes need `x-bridge-token`.

- `POST /v1/incidents/sync` `{incident}` -> `202 {queued:true}` (debounced per incident, unchanged snapshots ignored by hash)
- `GET /v1/incidents/:id` -> `{decisions:[{id,at,model,simulated,reasoning,actions:[{id,type,target,status,detail,simulated,latestReply}]}], dispatch}`
- `POST /v1/webhooks/elevenlabs`, `POST /v1/webhooks/photon`, `GET /health`

State is in memory plus `bridge/.data/state.json` (gitignored).

## Environment

| Var | Purpose | Default |
| --- | --- | --- |
| BRIDGE_PORT | listen port | 8787 |
| BRIDGE_TOKEN | required header value | none (routes refuse) |
| SIMULATE_ALL | `1` forces simulation | off |
| NEMOTRON_API_KEY / _BASE_URL / _MODEL | decider | planner fallback / NIM / nvidia/nemotron-3-super-120b-a12b |
| PHOTON_PROJECT_ID, PHOTON_PROJECT_SECRET (PHOTON_WEBHOOK_SECRET optional) | texting + inbound via spectrum-ts | simulated |
| BRIDGE_HOST | bind address | 127.0.0.1 |
| ELEVENLABS_API_KEY, ELEVENLABS_WEBHOOK_SECRET | calls + post-call webhook | simulated |
| ELEVENLABS_BUDDY_AGENT_ID, ELEVENLABS_DISPATCH_AGENT_ID, ELEVENLABS_AGENT_PHONE_NUMBER_ID | call agents | simulated |
| DEMO_DISPATCH_NUMBER | only target of dispatch calls | required for dispatch |
| BLOCKED_NUMBERS | extra never-dial list | empty |
| PHONE_ALEX/SAM/MAYA/JORDAN | the only phone accepted for `join <persona>`; also the call target | none (join rejected) |
| DEBOUNCE_MS, CALL_DELAY_MS, SIM_DELAY_MS, BRIDGE_STATE_FILE | tuning | 1500, 45000, 3000, .data/state.json |
