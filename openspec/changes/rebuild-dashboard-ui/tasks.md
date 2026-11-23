# Tasks

Verification throughout is `npm run build` in `client/` plus an observable check in the running app — the client has no test runner (only the server carries vitest), and adding one is out of scope for this change. Where a task names a spec scenario, that scenario is the acceptance check.

## 1. Icon foundation

- [x] 1.1 Add `lucide-react` to `client/package.json` and verify `npm install` succeeds and `npm run build` still completes
- [x] 1.2 Record the bundle size before and after in the change notes, and verify the delta is under ~15 KB gzipped (per-icon imports, not a namespace import)
- [x] 1.3 Replace the sidebar's unicode nav glyphs in `Layout.jsx` with lucide icons at a single shared size/stroke, and verify every nav entry renders a drawn icon in both light and dark theme

## 2. Page heading placement

> **Revised after review.** Originally implemented as "move the heading into the content area, top bar for controls only" (tasks 2.1–2.2 as first written). Seeing it rendered showed a real defect: the top bar held nothing but the trailing controls, pushed to one edge — a visually empty bar sitting above a second, differently-backgrounded block holding the actual title. Reverted to rendering the heading inside the top bar itself, sharing its background with the controls. See design.md D3 and `specs/app-shell/spec.md`'s "Page heading renders inside the top bar" requirement, both updated to match. The entries below describe the shipped version.

- [x] 2.1 `TopBar.jsx` renders the heading (`selectPageMeta` override, falling back to `resolvePageMeta(pathname)`) on its leading edge, sharing the top bar's background with the trailing controls; `PageHeading.jsx` now holds only the actions-slot context (`PageHeadingActionsProvider` / `usePageHeadingActions`), no standalone heading component. Verified it renders the correct title on three different routes
- [x] 2.2 `Layout.jsx` wraps `TopBar` (not `Outlet`) in `PageHeadingActionsProvider` and passes the actions-slot setter to it as `actionsRef`; verified against the revised spec scenario "Heading placement" — title and description inside the top bar, left of its controls, same background
- [x] 2.3 Confirm no page renders a duplicate heading — `ClientViewPage.jsx` and `ProjectDetailPage.jsx` (the live `/projects/:id` component) both call `usePageMeta` and render no local `<h1>`; `SopBuilderPage.jsx` likewise. `WorkflowBoardPage.jsx`, which does render its own `<h1>`, is dead code imported by no route and is left untouched
- [x] 2.4 Walk all 13 routes under `Layout` confirming each resolves its correct static title via `resolvePageMeta`, and verify spec scenario "Page-supplied subject" — `/projects/:id` and `/sop/:id` both override the static fallback once their data loads, via `usePageMeta`

## 3. Dashboard grid scaffold

- [x] 3.1 Replace the dashboard's layout wrapper with the row-aligned grid from design.md D2 — revised during implementation to independent `.dash-row` grids per row (not one flat grid) plus a `:only-child` full-span rule, because flat auto-placement broke the "Panel omitted for permission" scenario when Recent Activity is conditionally hidden; see design.md D2 for the updated rationale. `align-items: stretch` (default) makes each rail card match its row-mate's height
- [x] 3.2 Add the nested `.dash-split` for the Portfolio Status + Active Projects pair and verify the two cards share one row inside the wider main column, alongside Needs Attention in the rail column
- [x] 3.3 Verify spec scenario "Narrow viewport" — `@media (max-width: 1180px)` collapses every `.dash-row` and `.dash-split` to one column; source order is unchanged so reading order is preserved

## 4. KPI row

- [x] 4.1 Rebuild the KPI card as icon tile + value + label per design.md D7, keeping the existing `kpi-*` tone classes, and verify all five cards render with correct tinted tiles — icons are lucide components (`FolderKanban`, `Clock`, `PauseCircle`, `AlertTriangle`, `Gauge`) rendered via `<Icon>`, not unicode
- [x] 4.2 Apply the `repeat(4, 1fr) 1.4fr` column template via a dashboard-scoped `.dash-kpi-row` modifier (the shared `.kpi-row` stays an even auto-fit grid for the five other pages reusing it with different tile counts) and verify the average-progress card is visibly wider than the other four
- [x] 4.3 Conic-gradient completion ring already existed on the average-progress card from prior work and is unchanged; verified spec scenario "Average progress ring" — fill width tracks `stats.averageProgress` via `--kpi-pct`, colour tracks tone via `--kpi-tone`, both are CSS custom properties so dark theme's token values apply automatically
- [x] 4.4 Verified spec scenarios "Figures reflect current portfolio" (unchanged `useMemo` derivation), "Total projects card links through" (`to="/projects"`), and "No trend shown" — no percentage-change indicator exists anywhere in the KPI markup, only the real derived `sub` line

## 5. Delivery pressure and quick actions row

- [x] 5.1 The existing chart already met design.md D6 unchanged: `strokeDasharray="3 3"` with `vertical={false}` gives dotted horizontal-only gridlines, axis already uses `theme['text-3']` at `fontSize: 11`, curve is already `type="monotone"` with a gradient fill and dot markers. No JSX change was needed. Dark-theme correctness verified by inspection of `chartTheme.js`, which reads CSS custom properties live via `getComputedStyle(document.documentElement)` and re-reads on theme change, so it already tracks whichever theme is active
- [x] 5.2 Verified spec scenarios "Buckets ordered by urgency", "Bucket detail on inspection" and "Completed projects excluded" — `buildDueSeries`/`DUE_BUCKETS`/`DueTooltip` are byte-for-byte unchanged from before this change
- [x] 5.3 Rebuilt `.quick-grid` from a vertical flex stack (not spec-compliant — was a single column) to an actual `grid-template-columns: repeat(2, 1fr)` two-column tile grid, each tile with an icon tile, two-line label, and a trailing chevron positioned in the tile's corner. Verified spec scenario "Tiles filtered by permission" by checking the permissions catalog: CLIENT role holds only `projects:read`/`stages:read`, so all five gated tiles (SOP, Users, Roles, New Project, Audit Log) are correctly absent for it. Scenario "No permitted destinations" is written into the code (`if (!visible.length) return null`) but is **unreachable with current role data** — the Settings tile carries no `require` and is therefore visible to every role, so the panel can never actually render empty. Noting this rather than claiming a live role produces it: it is a defensive branch, not a tested-reachable one

## 6. Portfolio, active projects and needs-attention row

- [x] 6.1 Added the ring centre label (`topStatus`/`topStatusPct`, largest status group's share) and converted legend rows from raw counts to percentages; verified spec scenarios "Centre label" and "Legend shows percentages"
- [x] 6.2 Active Projects rows already matched design.md D7 with the shared `ProgressBar` from prior work (icon dot, name, code/stage-count, bar, percentage); verified spec scenarios "Ordering and cap" (unchanged `slice(0, 6)` over ascending `percent` sort) and "All work complete" (unchanged empty-state branch)
- [x] 6.3 Added an `AlertTriangle` icon tile to each Needs Attention row and inlined the overdue day count into the row's subtext in `--danger` colour; verified spec scenarios "Overdue styling" (`.attention-flag.is-overdue` plus the new inline danger text) and "Nothing pressing" (unchanged empty-state text)
- [x] 6.4 Added the missing "View All →" header action to Needs Attention (Active Projects already had one); both link to `/projects` — the only project-scoped module either panel has a destination in. Verified via build and source inspection, not a live click, per this change's test constraints

## 7. Recent activity and promo row

- [x] 7.1 Rebuilt the activity feed as an actual timeline: added an `.activity-marker`/`.activity-rail` column reusing the same marker-and-connecting-line pattern the SOP workflow journey already uses (`.journey-marker`/`.journey-line`), replacing the earlier plain border-separated rows. Icons are lucide, tinted per `ACTIVITY_TONE`, one per distinct audit action (`CirclePlus`, `CircleCheck`, `Pencil`, `Trash2`, `Clock`, `UserPlus`, `Upload`, `ArrowUpDown`)
- [x] 7.2 Verified spec scenario "Elapsed time is correct across time zones" against a freshly-created live audit row (`2026-11-23 14:13:02`, just written) on a machine at UTC+5:30 — computed as 0 minutes ago, not offset by the zone (design.md D8)
- [x] 7.3 Verified spec scenario "Feed restricted by permission" by source inspection — the fetch effect has an unconditional `if (!canReadAudit) return;` guard before the `dispatch(fetchAuditLog(...))` call, so no request is constructed for a role without it (no browser available this session to confirm via a literal network panel, but the guard is unconditional and structurally cannot fire). Verified "Unattributed events" — `entry.actorName ?? 'System'`
- [x] 7.4 Built the "Stay on Track" promo card using `--gradient-subtle` with a CTA to `/reports`; verified spec scenarios "Links to reports" (real `<Link to="/reports">`) and "Carries no data" (markup contains only static copy, no count/percentage binding) — both themed tokens, so dark mode is covered without a separate rule

## 8. Date range selector

- [x] 8.1 Added `DateRangeControl` (a `DropdownMenu` over 7/30/90-day/all-time options) and mounted it into the top bar's actions slot via `usePageHeadingActions()` + `createPortal` — the slot now lives inside `TopBar`, between the heading and the global controls (post-review revision, see section 2), so it renders inline with the page title without `TopBar` needing to know about the dashboard specifically
- [x] 8.2 Wired the selected range to `fetchAuditLog({ limit: 6, dateFrom })`; verified spec scenario "Range bounds the activity feed" directly against the live API — `dateFrom=2026-11-16` (7 days) returned the same 6 rows as unfiltered (all recent), while `dateFrom=2026-12-01` (a future date, proving the filter is load-bearing) returned 0
- [x] 8.3 Added the "as of now" marker to all five current-state panels, not three as first implemented: Delivery Pressure and Portfolio Status already had it; added it to the dashboard greeting line (covers the KPI row, which has no panel caption of its own), Active Projects, and Needs Attention. Verified spec scenario "Current-state panels unaffected" by inspection — none of their data derivations (`stats`, `statusSeries`, `activeProjects`, `attention`, all plain `useMemo` over `projects`) reference `range` at all, only the `fetchAuditLog` effect does

## 9. Integration

- [x] 9.1 Verified spec scenarios "Full-permission viewer" and "Panel omitted for permission" against real accounts rather than assumption: confirmed via the permissions catalog that `IT_MEMBER` holds no `audit:read`, then confirmed against the live API that this role gets a real `403` from `/api/audit` (matching the client-side `canReadAudit` guard) while `/api/projects/summary` returns `200` for it. With Recent Activity thus correctly omitted, it is the only item removed from its `.dash-row`, and the `:only-child` CSS rule (design.md D2) gives the promo card the full row width rather than leaving an empty column — no browser available this session to see the rendered result, but the CSS mechanism is unambiguous standard behavior, not something that varies by content
- [x] 9.2 Verified spec scenario "No projects in scope" by source inspection — the `if (!projects.length)` guard returns the `EmptyState` before any panel is constructed, unchanged from prior work
- [x] 9.3 Checked the whole diff for hardcoded colours: the only literal hex value in the touched stylesheets (`modules.css`) predates this change and is unrelated (`.btn-success:hover`); every rule added or changed in this task uses existing theme tokens. Checked all three breakpoints (1180px, 900px, 420px) use `minmax(0, 1fr)` on the shrinking grid track, which is specifically what prevents a `ResponsiveContainer` chart from forcing horizontal overflow in a grid/flex item — the classic failure mode for this kind of layout
- [x] 9.4 Removed the dead `.searchbox` / `.search-results` / `.search-group` / `.search-hit` rules from `index.css` after confirming zero JSX references anywhere in the client. Build CSS shrank from 22.48 KB to 22.36 KB gzip; grepped the full stylesheet directory afterward and confirmed no selector still references them

## Workflow follow-up

- Archive the change once the dashboard has been reviewed against the reference and accepted.
