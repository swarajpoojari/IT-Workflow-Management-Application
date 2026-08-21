import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Each suite gets its own SQLite file and rebuilds it in beforeAll, so the
    // files must not be shared across parallel workers.
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: './data/test.sqlite',
      JWT_ACCESS_SECRET: 'test-access-secret',
      JWT_REFRESH_SECRET: 'test-refresh-secret',
      SEED_PASSWORD: 'Passw0rd!',
    },
    include: ['tests/**/*.test.js'],
    testTimeout: 20000,
  },
});
