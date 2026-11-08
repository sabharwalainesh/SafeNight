import { t } from 'spacetimedb/server';
import { spacetimedb } from '../schema';
import { demoPersona } from '../tables/demo';

// Shared: which personas are registered, so the judge panel can show readiness. Demo-only data.
export const demoPersonas = spacetimedb.anonymousView(
  { name: 'demo_personas', public: true },
  t.array(demoPersona.rowType),
  ctx => ctx.from.demoPersona
);
