# scripts/

Developer and demo scripts. Owned by Person A. Run from the repository root with `npx tsx scripts/<name>.ts`.

| Script | Status | Purpose |
|---|---|---|
| `e2e.ts` | C0 smoke | Connects to the local database with the generated bindings, subscribes to `runtime_status` and `online_members`, calls `ping`, exits 0 on success. Grows into the full four-persona demo driver in C5. |
| `seed-demo.ts` | planned (C1) | Creates the four demo personas (Sam, Alex, Maya, Jordan), a Night Out, driver acceptance, and consent grants. |
| `reset-demo.ts` | planned (C3) | Calls the owner-only `reset_demo` reducer and re-seeds. |
| `fire-followup.ts` | planned (C3) | Calls `demo_fire_followup` to skip a buddy-nonresponse timer during a live demo. |

Environment:

| Variable | Default |
|---|---|
| `SPACETIMEDB_HOST` | `ws://127.0.0.1:3000` |
| `SPACETIMEDB_DB_NAME` | `safenight` |

Prerequisites: `spacetime start` running, `npm run publish:local` done, bindings generated (`npm run generate`).
