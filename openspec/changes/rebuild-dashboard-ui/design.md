# Design

## Context

See `proposal.md` — Why.

Current state that shapes the approach:

- `DashboardPage.jsx` already fetches everything the target screen needs: `/projects/summary` gives per-project derived status, stage counts and completion percentages; `/audit?limit=N` gives the activity feed. No endpoint work is required.
- The page already uses a two-column `main + rail` grid. The reference uses the same shape, so the layout is a refinement rather than an invention.
- The design tokens were aligned to the supplied sheet in a previous change: `--primary`/`--success`/`--text-secondary` aliases exist alongside the native `--accent`/`--green`/`--text-2` names, and `--border-light`, `--gradient-primary`, `--gradient-subtle` are themed across light and dark. This change consumes that layer rather than extending it.
- **14 of 16 routed pages render no heading of their own** — they rely on `TopBar` rendering `resolvePageMeta(pathname)`. Only `ClientViewPage` and `WorkflowBoardPage` render their own `.page-head`.
- The app supports a full dark theme driven by token overrides. Every rule added here has to survive it.

## Goals / Non-Goals

**Goals:**

- A panel-by-panel contract precise enough that "does this match?" is answerable by reading, not by squinting at a screenshot.
- Row-aligned grid so the rail cards line up with the main-column cards, as in the reference.
- Keep the shell migration small: moving the page heading out of the top bar must not become a 14-file edit.

**Non-Goals:**

- Pixel-identical typography to the reference's font rendering. The reference is a static mock; we match structure, scale, spacing, and colour, not sub-pixel metrics.
- Reskinning other pages' bodies. They inherit the shell and the token layer only.

## Decisions

### D1. Rebuild `DashboardPage` against the panel contract, don't patch it

The previous attempt edited the existing markup rule by rule and drifted. The panel inventory has changed enough — two new panels, three restructured rows, every row anatomy altered — that patching costs more than rewriting.

The data layer (`useMemo` selectors for `stats`, `dueSeries`, `statusSeries`, `activeProjects`, `attention`) is correct and stays. The JSX below it is replaced.

*Alternative considered:* incremental patching again. Rejected — it is the approach that produced the current mismatch.

### D2. Row-aligned CSS grid, not two independent stacks

The reference aligns each rail card to the main card beside it: Quick Actions is exactly as tall as the chart, Needs Attention matches the Portfolio/Active row, the promo matches Recent Activity. Two independently stacked columns cannot guarantee that.

`.dash-grid` is a vertical flex stack of row wrappers, not one grid spanning the whole page. Each row is its own independent 2-column grid:

```
.dash-grid { display: flex; flex-direction: column; gap: 16px; }
.dash-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 384px;
  gap: 16px;
  align-items: stretch;
}
.dash-row > *:only-child { grid-column: 1 / -1; }
```

- KPI row is its own flex/grid of 5 tiles, not part of `.dash-row`.
- Each `.dash-row` pairs exactly two children; `align-items: stretch` (the default) makes the rail card match its row-mate's height.
- Row 2 is **not** `.dash-row` with Project Summary nested above Active Projects in a sub-grid, as first built — that stacking meant Active Projects' header could never land on the same horizontal line as Project Summary's or Needs Attention's, since it wasn't a top-level row item. Caught from the rendered page, like D3. Fixed with a dedicated `.dash-row-3` (`minmax(0, 320px) minmax(0, 1fr) 384px`) holding Project Summary, Active Projects and Needs Attention as three direct siblings, so their `.card-head.bare` rows share one baseline via the same `align-items: stretch` grid as every other row. The rail column stays 384px, matching `.dash-row`, so both rows' right edges still line up.
- The `:only-child` rule is what makes the dashboard spec's "Panel omitted for permission" scenario hold: when Recent Activity is hidden for a role without audit read, the promo card is alone in its row and `:only-child` spans it full width — no auto-placement index shift, no empty column. A single flat grid relying on implicit auto-placement across all rows was tried first and rejected for exactly this reason: removing one item mid-sequence shifts every later item's implicit column, leaving the item after the gap in the wrong track with an empty cell beside it.

Below the layout breakpoint each `.dash-row` collapses to one column and the reading order is preserved by source order.

*Alternative considered:* a single 12-column grid spanning the whole page with span classes and explicit `grid-row`/`grid-column` on every item. Rejected — it can express the same layout, but doing so safely under conditional rendering requires every item to carry an explicit position, which is more bookkeeping than four independent row grids need. *Alternative considered (and actually built first):* one flat grid relying on auto-placement order for implicit row pairing. Rejected per the scenario above.

### D3. The heading lives inside the top bar, not the content area (revised post-implementation)

**Originally** this decision moved the heading out of the top bar into the content area, following the reference literally (its page title sits below a separate global app bar). Implemented as written, it produced a real defect: the top bar rendered with nothing in it but the trailing controls pushed to one edge — a visually empty bar — sitting directly above a second, differently-backgrounded block holding the actual title. Two stacked "header-looking" regions with a seam between them, one of them pointlessly empty. Caught from the running app, not from re-reading the spec.

The fix keeps the mechanism but reverses the placement: the heading renders **inside** `<header className="topbar">`, on the leading edge, sharing its background (`var(--surface)`) with the trailing controls instead of sitting in the content area's `var(--bg)`. One bar, one background, title left / controls right — the layout nearly every dashboard of this kind actually uses, and the one the reference's *second* bar (page title + date range, directly adjoining the content) was already closer to than the plain two-region split first attempted.

Mechanically, little changes from the original plan: `TopBar` reads the same `selectPageMeta` override and `resolvePageMeta(pathname)` fallback it always read, so **no page needs editing** and `usePageMeta` keeps working unchanged — only `Layout`/`TopBar` are touched. The trailing `<div ref={actionsRef} className="page-head-actions" />` for page-specific controls (the date-range selector) now sits inside `TopBar`, between the heading and the global controls, exposed through the same small context provider so the portal target is available before the dashboard mounts.

Neither `ClientViewPage` nor `ProjectDetailPage` (the live `/projects/:id` component) render a local `<h1>`, so no page needed a duplicate-heading cleanup either way.

*Alternative considered (and shipped first):* heading in the content area, top bar for controls only. Rejected after seeing it rendered — the empty-bar/background-seam defect above. *Alternative considered:* each page renders its own heading. Rejected — 14 files edited to produce identical markup, and `usePageMeta` would need rethinking. *Alternative considered:* holding the actions node in Redux. Rejected — JSX does not belong in the store.

### D4. `lucide-react` for icons

The reference's icons are lucide. Unicode glyphs (`◫`, `✦`, `⛭`) render with different shapes, weights and baselines across platforms and cannot match it.

Import per icon (`import { Folder } from 'lucide-react'`) so the bundle carries only what is used. Icons take `size` and `strokeWidth` props and inherit `currentColor`, which means the existing tone classes keep working — `.kpi-icon` sets the colour, the glyph follows.

Sidebar navigation, KPI tiles, panel headers, quick-action tiles, activity rows and needs-attention rows all move to it. Roughly 25 distinct icons.

*Alternative considered:* a hand-rolled SVG sprite. Rejected — same visual result, but every future icon becomes manual work.

### D5. The date range scopes only what is genuinely time-windowed

A control that visibly changes nothing is worse than no control. Of the ten panels, only Recent Activity reports on events over time — the KPIs, portfolio ring, active list and needs-attention list are all current-state, and Delivery Pressure is forward-looking by target date, so a backward-looking window does not apply to any of them.

The selector therefore bounds the activity feed (passed as a date filter the `/audit` endpoint already accepts), and the current-state panels carry an explicit "as of now" marker so the screen never implies a filter it is not applying.

This is the weakest part of the reference design — it shows the control without showing what it governs. If a broader scope is wanted later, the natural alternative is filtering the *project set* by creation date, but that silently changes what "Total projects: 24" means, so it is not the default.

### D6. Restyle the Delivery Pressure chart, keep its data

Per the answered question: the reference's two-series "Workflow Performance" chart is not adopted. The existing urgency-weighted bucket series stays, restyled to the reference's chart treatment — dotted horizontal gridlines only, no vertical rules, axis labels in `--text-3` at 11px, a smooth `monotone` curve, soft gradient fill, and dot markers on each point.

The reference's two-colour legend does not apply to a single series; the existing "far out → overdue" caption stays in its place.

### D7. Panel anatomy

The contract the implementation is checked against. Every panel is a `.card`; every header is an icon tile + title + optional trailing action.

| Panel | Header | Body anatomy |
|---|---|---|
| KPI ×5 | none | `40px` tinted rounded-square icon tile, then value (`25px/700`) over label (`11.5px`, `--text-secondary`). Card 5 adds a `42px` conic-gradient ring at the trailing edge. Grid `repeat(4, 1fr) 1.4fr`. |
| Delivery Pressure | chart icon + title + caption; trailing "far out → overdue" | Area chart per D6, height `240px`. |
| Quick Actions | lightning icon + title + "Get things done faster" | 2×2 tile grid. Tile = `32px` icon tile, two-line label, trailing chevron, `1px` border, hover lift. |
| Portfolio Status | chart icon + title | Ring `innerRadius 58 / outerRadius 82` with centre label (percentage `22px/700` over status name `11px`), then legend rows: dot, name, trailing percentage. |
| Active Projects | check icon + title; trailing "View All →" | Row: status dot, name over `code · n/m stages`, progress bar, trailing percentage. Max 6 rows, `--border-light` separators. |
| Needs Attention | bell icon + title; trailing "View All →" | Row: `32px` tinted document tile, name over `code · n overdue` (overdue segment in `--danger`), trailing pill `Nd left` / `Nd over`. |
| Recent Activity | activity icon + title; trailing "View All →" | Timeline: `24px` action-tinted circular icon joined by a `1px` rail, summary with entity names emphasised, actor beneath, trailing relative time. |
| Stay on Track | none | `--gradient-subtle` panel, heading, two-line body, solid CTA button to `/reports`, decorative illustration at the trailing edge. |

### D8. Relative time must be parsed as UTC

The `/audit` endpoint returns `"YYYY-MM-DD HH:MM:SS"` with no zone marker, and the values are UTC. Parsed naively, JavaScript reads them as local time — an event from ten seconds ago displayed as "6 hours ago" at UTC+5:30. The feed must normalise to an explicit UTC instant before computing elapsed time. This was found and fixed during the previous attempt; the rebuild must not reintroduce it.

## Risks / Trade-offs

- **Moving the heading affects every page at once** → The change is confined to `Layout` and `TopBar` (D3), so the blast radius is two files plus the two pages with duplicate headings. Verify by loading each route once; the heading is the only thing that moved.
- **`lucide-react` increases bundle size** → Per-icon imports are tree-shaken; ~25 icons is a few KB. The bundle already warns at >500 KB, so this change should not be the one that makes it materially worse — check the delta after adding it.
  - *Measured (task 1.2, 9 sidebar icons):* 322.99 KB → 324.31 KB gzip JS (+1.32 KB). CSS unchanged. Well within the ~15 KB budget for the full icon set.
- **Row-aligned grid stretches short rail cards** → Quick Actions beside a 240px chart may leave slack. Accepted: the reference has the same slack. If it reads badly, the tile grid absorbs it with `align-content: space-between`.
- **A restyled-but-different chart is the one panel that will not match the reference** → Deliberate, per D6 and the answered question. Flagged here so it is not later mistaken for drift.
- **Dark theme regressions** → Every new rule uses tokens, never literals. The promo card's gradient and the activity timeline rail are the two most likely to need a dark-specific value; both use themed tokens from the existing alias layer.

## Migration Plan

1. Add `lucide-react`; confirm the bundle delta.
2. Ship `PageHeading` + `Layout`/`TopBar` change, and de-duplicate the two pages. The app is coherent at this point even though the dashboard is untouched.
3. Rebuild the dashboard grid and panels.
4. Remove the now-unused `.searchbox` / `.search-results` rules.

Rollback is per-step; no data or API changes, so reverting is a code revert with no migration.

## Open Questions

- The reference's apps-grid icon in the top bar has no destination in this app. Omitted for now; if it is meant to be a launcher, that is its own change.
- `searchSlice.js` stays registered but unrendered. Out of scope here (per the proposal); worth removing in a cleanup change if search is not planned.
