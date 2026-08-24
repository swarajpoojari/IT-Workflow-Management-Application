# IT Workflow Management System

A centralised replacement for an Excel-based SOP process.

**Super Admins** configure dynamic SOP templates with stages. **Admins** create
projects from those templates — the workflow board is auto-generated. **IT Team
Members** manually update stage statuses with full history tracking.
**Client/Operations** users get a filtered read-only view, with restricted data
stripped **at the API**, not merely hidden in the UI.

The Project screen is a working area, not a dashboard: **Overview · Assign ·
Workflow · Team · Documents**. Stages open into a drawer where you update
status, attach evidence, record sign-off, and run the QA↔Development bug loop.

Clients need no account — they enter a **BRD number** and see only their own
stages, progress, owner and dates.

React · Redux Toolkit · Node.js · Express · JWT.

---

## Requirements

**Node.js 22 LTS or newer** (`node -v`). Node 24 is fine.

That is the only prerequisite — no database server, and no C++ build tools.
The API stores data in a local SQLite file created on first run.

> **Why Node 22+:** the fast SQLite driver (`better-sqlite3`) is a native addon
> that ships prebuilt binaries for Node 22 and 24 on Windows, macOS and Linux.
> On older Node versions npm falls back to compiling it from source, which needs
> Visual Studio Build Tools. If a prebuilt binary is ever unavailable, the app
> automatically falls back to `node:sqlite`, built into Node itself — so it
> still runs, with no compiler involved. `GET /api/health` reports which driver
> is active.

---

## Quick start

Two terminals, two commands. No database server to install — the API uses a
file-backed SQLite database that is created and seeded automatically.

```bash
# ── Terminal 1 — API on http://localhost:4000
cd server
cp .env.example .env      # optional: every value has a working default
npm install && npm run dev

# ── Terminal 2 — web app on http://localhost:5173
cd client
npm install && npm run dev
```

`npm run dev` in `server/` applies the schema, seeds the demo data and starts
the API with hot reload. Open <http://localhost:5173> and sign in.

### Demo accounts — password `Passw0rd!`

| Role | Email | Lands on |
| --- | --- | --- |
| Super Admin | `superadmin@itwf.dev` | SOP Builder |
| Admin | `admin@itwf.dev` | User Management |
| IT Team Member | `itmember@itwf.dev` | My Work |
| IT Team Member (2) | `itmember2@itwf.dev` | My Work — plays the *development* side of the bug loop |
| QA (IT Team Member) | `qa@itwf.dev` | My Work — plays the *QA* side of the bug loop |
| Client / Operations | `client@itwf.dev` | Projects (read-only) |

The seed creates all four roles, six users, and two **published** SOPs:

- **Standard IT Onboarding SOP** — 5 stages, 3 client-visible, 2 hidden, exactly
  as the Phase 1 brief specifies. Used by two demo projects.
- **Software Delivery SOP** — 6 stages including a `TESTING` stage that carries
  the bug loop and stages that require sign-off. Used by `NWL-PORTAL-2026`,
  which is seeded mid-flight with open bugs so the Testing-close rule is
  visible on first load.

No login needed for client tracking — see [Public tracking](#public-tracking-no-login).

### Other commands

```bash
cd server
npm test              # 55 tests across 7 suites
npm run db:reset      # drop, recreate and reseed the database
npm start             # production mode (no seeding, no hot reload)

cd client
npm run build         # production bundle
npm run preview       # serve the built bundle
```

---

## See the business rules for yourself

Each of these takes under a minute in the running app.

**Rule 1 — manual status only.** Sign in as the IT member, open a project, pick
a stage → *Documents* → attach a link. The toast reads *"stage status unchanged"*
and the card does not move. Only *Update status* moves a stage.

**Rule 4 — server-side client filter.** Sign in as the client and open the
project. You see 3 milestones, not 5. Open DevTools → Network → the
`/api/projects/1` response: *Internal Security Review* and *Vendor Cost
Negotiation* are not in the JSON at all, and neither are `documents`,
`blocker`, `remarks` or `assignedTo`. `/api/audit` returns 403.

**Rule 5 — SOP version protection.** As Super Admin, edit the draft, add a
stage, and publish v2. Then reopen the existing project: still 5 stages, still
`v1`. The version history shows v1 with *"2 projects"* still attached.

**Rule 7 — auto-generation.** As Admin, go to *New project* and pick an SOP.
The right-hand panel previews the exact stages that will be created, resolved
from the latest **published** version. Save, and the board exists immediately.

**Deactivation check.** As Admin, deactivate *Ivy Chen*. The API answers `409
ACTIVE_ASSIGNMENTS` and the reassign modal opens listing the three stages that
block it. Move them to Marco, then deactivate — it succeeds.

---

### Phase 2 rules

| Rule | Try it |
|---|---|
| **Stages never progress automatically** | Attach evidence on any stage — the response says `statusUnchanged: true` and the board does not move. |
| **Status and % are derived from stages** | Open `NWL-PORTAL-2026` → Overview. The 50% and `IN PROGRESS` are computed from the six stage rows; nothing stores them. Block a stage and the project reads `AT_RISK`. |
| **Testing cannot close with open bugs** | Open `NWL-PORTAL-2026` → Workflow → *System Testing*. The drawer says *Cannot complete yet* and lists the two open bugs. Close them all, then it still asks for sign-off. |
| **Internal stages filtered server-side** | Sign in as `client@itwf.dev`: 4 of 6 stages. Or `curl 'localhost:4000/api/public/track?brd=BRD-2026-0042'` — the internal stages are absent from the JSON, not hidden by CSS. |
| **Permissions at stage level** | As `qa@itwf.dev`, *System Testing* offers Raise bug; *Development* does not. Both stages, same project, same role. |
| **Every change audited** | Audit Log shows stage transitions, bug events, sign-offs and public BRD lookups (actor `PUBLIC`). |

### The bug loop

`OPEN → IN_PROGRESS → FIXED → RETEST → CLOSED`, with `REOPENED` sending it
back to development. Illegal jumps are rejected with the allowed set — a
`CLOSED` bug cannot be moved at all. QA raises and closes; development
resolves. Which side you are on is a stage-level permission, not a role name.

## Architecture at a glance

```
┌──────────────────────────────┐         ┌───────────────────────────────────┐
│  client/   React 19 + Vite   │         │  server/   Node 20 + Express 4    │
│                              │         │                                   │
│  Redux Toolkit slices        │  HTTPS  │  authenticate → requirePermission │
│  createAsyncThunk per call   │ ──────► │        → validate → controller    │
│  usePermission(mod, action)  │  JSON   │        → service → model → SQL    │
│  axios: attach / refresh /   │ ◄────── │  filterClientData wraps res.json  │
│         retry once / logout  │         │                                   │
└──────────────────────────────┘         └────────────────┬──────────────────┘
                                                          │
                                              ┌───────────▼───────────┐
                                              │  SQLite (14 tables)   │
                                              │  triggers enforce     │
                                              │  append-only audit +  │
                                              │  SOP immutability     │
                                              └───────────────────────┘
```

**[→ Full architecture and data-flow documentation](docs/ARCHITECTURE.md)** —
request lifecycle, the RBAC model, all five business rules traced end to end,
the complete data model, and every API contract.

---

## Key design decisions

**RBAC lives in rows, not in code.** `requirePermission('sop', 'publish')` asks
one question: does a row exist joining this user's role to that permission?
There is no `role === 'ADMIN'` branch anywhere in the request path — a test
walks the source tree and fails the build if one appears. Granting a capability
is an `INSERT`, and it takes effect on the next request.

**Permissions are re-read per request, not baked into the JWT.** The access
token carries identity only. Revoking a permission or deactivating an account
therefore takes effect immediately rather than up to 15 minutes later.

**SQLite, with a portable schema.** The brief asks that both apps start with
`npm install && npm run dev`; requiring a Postgres instance would break that.
The schema is plain SQL with foreign keys, and all SQL is confined to
`server/src/models/` — moving to Postgres means swapping the driver in
`db/index.js` and the ten model files, nothing above them.

**Presentation fields are snapshotted onto project stages.** A generated stage
copies `name`, `sequence` and `clientVisible` rather than joining back to the
SOP. That is what makes a project's board genuinely immune to later SOP edits.

**Invariants are enforced by the database too.** Triggers `RAISE(ABORT)` on any
`UPDATE`/`DELETE` against `audit_logs`, and on any write to the stages of a
published SOP version. Application bugs cannot rewrite history.

**Refresh tokens rotate, hashed at rest, with replay detection.** Presenting an
already-revoked token revokes the entire token family, because that is the
signature of a stolen cookie. The client's single-flight refresh guarantees it
never triggers this on itself.

**Errors carry stable machine-readable codes.** The client branches on
`ACTIVE_ASSIGNMENTS` to open the reassign modal and on `SOP_VERSION_IMMUTABLE`
to explain a refused edit — never on HTTP status alone.

---

## Repository layout

```
server/                     Node.js · Express · JWT · SQLite
├── src/
│   ├── config/             env + the shared vocabulary (roles, statuses, modules)
│   ├── db/                 schema.sql, migrate, seed, the RBAC matrix
│   ├── models/             ALL SQL lives here — one module per aggregate
│   ├── middleware/         authenticate · authorize · filterClientData · validate
│   ├── modules/            feature-first: auth, users, roles, sop, projects, stages, audit
│   ├── services/           token rotation, audit helper
│   └── utils/              ApiError, asyncHandler, password, pagination
└── tests/                  55 tests — one suite per business rule

client/                     React 19 · Redux Toolkit · Vite
└── src/
    ├── api/                axios instance + interceptor, endpoint map
    ├── app/                store
    ├── features/           one slice per domain
    ├── components/         Layout, RoleGuard, StatusModal, UI primitives
    ├── hooks/              usePermission
    ├── pages/              the seven screens
    └── routes/             capability-guarded route table

docs/ARCHITECTURE.md        architecture, data flows, data model, API reference
```

---

## Public tracking (no login)

Open <http://localhost:5173/track> and enter one of the seeded BRD numbers:

| BRD | Project |
|---|---|
| `BRD-2026-0042` | Northwind Customer Portal — has a live bug loop |
| `BRD-2026-0017` | Northwind ERP Rollout |
| `BRD-2026-0031` | Acme Security Hardening |

The response is built by **whitelist**, not by stripping fields: with no
authenticated principal, a blacklist that someone forgets to update is a leak.
The endpoint is rate-limited per IP, every lookup is written to the audit log,
and an unknown BRD returns the same 404 as a malformed one so the endpoint
cannot be used to enumerate valid numbers.

> **Security note.** A BRD number is a bearer secret: anyone holding it can see
> that project. That is what "no login required" means, and it is the brief's
> choice rather than an oversight. If these projects were sensitive I would add
> a second factor — an email-matched OTP, or a signed link with an expiry.

## Environment variables

Both apps ship a `.env.example` documenting every variable, and both run with
no `.env` at all in development.

| Server | Purpose |
| --- | --- |
| `PORT` | API port (default `4000`) |
| `DATABASE_URL` | SQLite file path, relative to `server/` |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | **Must be changed for deployment** — the server refuses to start in production with the defaults |
| `ACCESS_TOKEN_TTL` | Access-token lifetime (default `15m`) |
| `REFRESH_TOKEN_TTL_DAYS` | Refresh-token lifetime (default `7`) |
| `COOKIE_SECURE` / `COOKIE_SAMESITE` | Refresh-cookie flags — set `COOKIE_SECURE=true` over HTTPS |
| `CORS_ORIGIN` | Comma-separated allowed browser origins |
| `SEED_PASSWORD` | Password given to every seeded user |

| Client | Purpose |
| --- | --- |
| `VITE_API_BASE_URL` | Defaults to `/api`, proxied to the API by the Vite dev server so the browser stays on one origin |

---

## Testing

```bash
cd server && npm test
```

```
✓ tests/auth.test.js                     (11)   JWT, rotation, replay detection, audit immutability
✓ tests/rbac.test.js                      (4)   DB-driven permissions, live grant, no role-name check
✓ tests/rule1-manual-status.test.js      (11)   upload/assign never move a stage; conditional fields
✓ tests/rule4-client-filter.test.js      (10)   hidden stages and restricted fields absent from JSON
✓ tests/rule5-sop-versioning.test.js      (7)   published versions frozen; projects pinned
✓ tests/rule7-project-generation.test.js  (7)   board generated in one transaction from published SOP
✓ tests/deactivation-reassign.test.js    (10)   409 → reassign → deactivate
✓ tests/phase2-bug-loop.test.js           (8)   Testing cannot close with open bugs; legal transitions only
✓ tests/phase2-stage-permissions.test.js  (5)   per-stage grants; same role, different actions per stage
✓ tests/phase2-derived-status.test.js     (4)   status and % computed from stage rows
✓ tests/phase2-public-brd.test.js         (5)   whitelist payload; unknown BRD indistinguishable
✓ tests/phase2-platform.test.js           (7)   search scoping, role preview, reports, settings, notifications
                                          ───
                                           84 passing
```

Each suite rebuilds its own database and reseeds it, so tests never interfere.

Run the suite against the fallback database driver too:

```bash
DB_DRIVER=node-sqlite NODE_OPTIONS=--experimental-sqlite npm test
```
