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

1. Photon: create a Photon 2.0 beta project, add an iMessage line, an SMS number, and a Voice profile. Set `PHOTON_PROJECT_ID`, `PHOTON_API_KEY`. Webhook URL: `https://<public-host>/v1/webhooks/photon` (Standard Webhooks; secret in `PHOTON_WEBHOOK_SECRET`). The messages path lives in one constant in `src/photon.ts` (verify against the beta API reference).
2. ElevenLabs: import a SIP trunk phone number pointing at `sip.photon.codes:5061` with TLS, and note its phone number id (`ELEVENLABS_AGENT_PHONE_NUMBER_ID`). Create two agents (`ELEVENLABS_BUDDY_AGENT_ID`, `ELEVENLABS_DISPATCH_AGENT_ID`) using dynamic variables `{{call_type}} {{person_name}} {{location_text}} {{maps_url}} {{situation}} {{reporter}} {{minutes_since}} {{callback_note}}`. Post-call webhook (transcription and call initiation failure): `https://<public-host>/v1/webhooks/elevenlabs`, HMAC secret in `ELEVENLABS_WEBHOOK_SECRET`.
3. Friends text `join alex|sam|maya|jordan` to the Photon line to opt in; the bridge registers their space/sender (and phone, when Photon provides it, else `PHONE_<NAME>`).
4. Web client sends `x-bridge-token: $BRIDGE_TOKEN` (CORS allows localhost origins only).

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
| PHOTON_API_KEY, PHOTON_PROJECT_ID, PHOTON_WEBHOOK_SECRET | texting + inbound | simulated |
| ELEVENLABS_API_KEY, ELEVENLABS_WEBHOOK_SECRET | calls + post-call webhook | simulated |
| ELEVENLABS_BUDDY_AGENT_ID, ELEVENLABS_DISPATCH_AGENT_ID, ELEVENLABS_AGENT_PHONE_NUMBER_ID | call agents | simulated |
| DEMO_DISPATCH_NUMBER | only target of dispatch calls | required for dispatch |
| BLOCKED_NUMBERS | extra never-dial list | empty |
| PHONE_ALEX/SAM/MAYA/JORDAN | fallback persona phones | none |
| DEBOUNCE_MS, CALL_DELAY_MS, SIM_DELAY_MS, BRIDGE_STATE_FILE | tuning | 1500, 45000, 3000, .data/state.json |
