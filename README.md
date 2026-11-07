# SafeNight

Go out together. Get home together.

Read the [Nemotron incident coordination design](docs/NEMOTRON_INCIDENT_COORDINATION.md) for the proposed SOS-to-resolution workflow, friend and mutual assistance reports, and AI/backend responsibilities.

SafeNight is a planned consent-based nightlife safety app with temporary friend groups, help requests, transportation coordination, and explicit home check-ins.

## Required hackathon tracks

- **NVIDIA Nemotron:** Event-triggered agents that go beyond chat, plan and execute multi-step workflows, intelligently use external APIs, and solve real safety-coordination problems.
- **Spacetime:** The majority of the backend must be built on SpacetimeDB. Qualification requires submission of a public GitHub repository.

See [the track requirements and demo plan](docs/HACKATHON_TRACK_REQUIREMENTS.md) for architecture ownership, evidence, and the submission checklist. These are required build targets; the app and qualification have not yet been verified.

The SpacetimeDB-primary architecture supersedes the original blueprint's FastAPI/Supabase backend proposal. Read [project memory](PROJECT_MEMORY.md) and the [original blueprint](docs/SafeNight_Complete_App_Blueprint_v2.md) for product context.

## Backend and local development

The backend is a SpacetimeDB 2.14 TypeScript module in `spacetimedb/`; the client is a React app in `web/`. There is no separate API server. See [WORKFLOW.md](WORKFLOW.md) for the chunk plan and who owns what, and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the table, reducer, view, and tool contract.

Prerequisites: Node 22 or newer, and the [SpacetimeDB CLI](https://spacetimedb.com/install) 2.14 (`curl -sSf https://install.spacetimedb.com | sh`).

```bash
npm install                 # once, from the repo root (npm workspaces)
spacetime start             # local server on 127.0.0.1:3000, keep it running in its own terminal
npm run publish:local       # build and publish the module to the local server as `safenight`
npm run generate            # regenerate web/src/module_bindings from the module
npm run dev -w web          # Vite dev server for the client
npm test                    # module unit tests (in-memory SpacetimeDB datastore, no server needed)
```

Nemotron and messaging run in **simulated mode** until their env vars are supplied; every simulated plan, message, and receipt is labeled as such in the data and the UI. See [.env.example](.env.example) for the variables and the `spacetime publish --env-only` command that sets them.
