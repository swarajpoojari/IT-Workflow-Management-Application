import { createApp } from './app.js';
import { env, assertProductionSecrets } from './config/env.js';
import { getDb } from './db/index.js';
import { migrate } from './db/migrate.js';

assertProductionSecrets();

migrate({ silent: true });
getDb();

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`\n  IT Workflow API`);
  console.log(`  ├─ env      ${env.NODE_ENV}`);
  console.log(`  ├─ url      http://localhost:${env.PORT}/api`);
  console.log(`  ├─ health   http://localhost:${env.PORT}/api/health`);
  console.log(`  ├─ database ${env.DATABASE_URL}`);
  console.log(`  └─ cors     ${env.CORS_ORIGIN.join(', ')}\n`);
});

const shutdown = (signal) => {
  console.log(`\n${signal} received — closing server`);
  server.close(() => process.exit(0));
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
