# IT Workflow API

Node.js · Express 4 · JWT · SQLite. See
[`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) for the full design.

```bash
npm install
cp .env.example .env      # optional — every value has a working default
npm run dev               # migrate + seed + start on :4000
```

| Script | Does |
| --- | --- |
| `npm run dev` | migrate, seed, then start with hot reload |
| `npm start` | production start (no seeding) |
| `npm run db:migrate` | apply `src/db/schema.sql` (idempotent) |
| `npm run db:seed` | seed roles, permissions, users, SOP, projects (idempotent) |
| `npm run db:reset` | drop, recreate, reseed |
| `npm test` | 55 tests across 7 suites |

## Layout

```
src/
├── index.js            entrypoint — migrate on boot, then listen
├── app.js              middleware order + route mounting
├── config/
│   ├── env.js          validated config; refuses default secrets in production
│   └── constants.js    roles, statuses, modules, actions, restricted fields
├── db/
│   ├── schema.sql      14 tables + 6 triggers enforcing the invariants
│   ├── migrate.js      idempotent DDL, `--fresh` to drop first
│   ├── seed.js         4 role users + published SOP (5 stages, 3 visible)
│   ├── permissions.catalog.js   the RBAC matrix — SEED DATA, never imported at runtime
│   └── index.js        connection, transaction helper, row casting
├── models/             ALL SQL lives here, one module per aggregate
├── middleware/
│   ├── authenticate.js     JWT → req.user, permissions re-read from the DB
│   ├── authorize.js        requirePermission(module, action) + row-level scope
│   ├── filterClientData.js Business Rule 4 — wraps res.json globally
│   ├── validate.js         zod for body / query / params
│   └── errorHandler.js     single exit point; opaque 500s
├── modules/            feature-first: auth users roles sop projects stages audit
├── services/           token rotation, audit helper
└── utils/              ApiError, asyncHandler, password, pagination
```

## Layering rule

`routes` → `services` → `models` → SQL. Routes hold no business logic; services
write no SQL. That confinement is what makes "only one code path writes
`stage.status`" a `grep`-checkable claim rather than an assertion:

```bash
grep -rn "SET status" src/models/     # stage status + project status. Nothing else.
```

## Database

SQLite, reached through one of two drivers picked at startup by `db/index.js`:

1. **`better-sqlite3`** — the default. Fast and mature, but a *native addon*: it
   needs a prebuilt binary for your platform and Node ABI. v12 ships those for
   Node 22 and 24 on Windows, macOS and Linux (x64 and arm64).
2. **`node:sqlite`** — the fallback, built into Node since 22.5. No install, no
   binary, no compiler.

The fallback exists because when no prebuild matches, npm quietly tries to
compile from source and `npm install` fails with a node-gyp error on any machine
without a C++ toolchain. With the fallback, that costs a little speed instead of
stopping the app. `GET /api/health` reports which driver loaded.

Force the fallback to test it: `DB_DRIVER=node-sqlite npm test`.

Both drivers are synchronous, so `db.transaction(fn)` is atomic with real
rollback and the service layer has no async plumbing.

**One binding style per statement.** Never mix positional `?` with named `@name`
in the same SQL — the two drivers bind mixed statements differently, and
`node:sqlite` rejects them outright.

The schema is portable SQL; moving to PostgreSQL means swapping the driver in
`db/index.js` and the model files, nothing above them.

Six triggers make the core invariants structural: `audit_logs` and
`stage_status_history` reject `UPDATE`/`DELETE`, and the stages of a published
SOP version reject `INSERT`/`UPDATE`/`DELETE`.

## Testing

```bash
npm test                       # everything
npm test -- rule4              # one suite
npm run test:watch
```

Each suite rebuilds its own database (`data/test.sqlite`) and reseeds it in
`beforeAll`, so suites never interfere. `fileParallelism` is off for that reason.
