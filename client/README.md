# IT Workflow — Web Client

React 19 · Redux Toolkit · Vite. See
[`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) for the full design.

```bash
npm install
npm run dev               # http://localhost:5173
```

The dev server proxies `/api` to `http://localhost:4000`, so the browser stays
on one origin and the httpOnly refresh cookie is sent with no CORS or SameSite
configuration. **Start the API first.**

| Script | Does |
| --- | --- |
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | production bundle into `dist/` |
| `npm run preview` | serve the built bundle |

## Layout

```
src/
├── main.jsx            Provider + StrictMode
├── App.jsx             one silent refresh at startup, then routes
├── api/
│   ├── axiosClient.js  attach token · single-flight refresh · retry once · logout
│   └── endpoints.js    every URL shape in one place
├── app/store.js        configureStore + the interceptor's auth-failure hook
├── features/           auth · users · sop · projects · stages · audit · ui
├── hooks/usePermission.js
├── components/         Layout · RoleGuard · StatusModal · Toasts · ui primitives
├── pages/              the seven screens + Dashboard + My Work
├── routes/             capability-guarded route table
└── styles/index.css    design tokens and component styles
```

## Conventions

**Never check a role in a component.**

```jsx
const canPublish = usePermission('sop', 'publish');   // ✅ capability
if (user.role === 'SUPER_ADMIN') { … }                 // ❌ never
```

`usePermission` reads the `permissions[]` array the API returns at login, so the
UI mirrors the server's RBAC. It is a rendering hint — every guarded action is
re-checked server-side.

**Every API call is a `createAsyncThunk`** with `pending` / `fulfilled` /
`rejected` handled in its slice. Rejections carry a normalised
`{ code, message, details }`, so components branch on a stable code
(`ACTIVE_ASSIGNMENTS` opens the reassign modal), never on an HTTP status.

**Derived data uses `createSelector`** — `selectProgressStats`,
`selectPortfolioStats`, `selectReassignCandidates`.

**Optimistic updates snapshot the whole row.** `updateStageStatus` is dispatched
with `snapshot: stage`; the reducer paints the new status immediately and
restores that exact object on failure, with a toast. Restoring only the status
would leave a phantom `completionDate` the server never accepted.

## Environment

`VITE_API_BASE_URL` defaults to `/api` (proxied). Point it at
`http://localhost:4000/api` to bypass the proxy — the API's `CORS_ORIGIN` must
then list this app's origin. See `.env.example`.
