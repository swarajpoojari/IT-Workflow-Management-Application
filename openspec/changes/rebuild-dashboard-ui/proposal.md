# Proposal

## Why

The dashboard was restyled incrementally against a supplied reference design and the result does not match it. The gap is structural, not cosmetic: the reference composes a four-row grid of ten distinct panels, uses a drawn icon set, places the page heading in the content area rather than the top bar, and carries panels the current dashboard has no equivalent for. Patching the existing markup rule by rule has already been tried once and produced drift rather than convergence.

This change specifies the target screen panel by panel so the implementation has an exact, reviewable contract instead of a screenshot to eyeball against.

## What Changes

**App shell**

- Sidebar and top bar adopt the reference's chrome: drawn line icons, a tinted pill for the active nav item, and a two-line brand lockup.
- The page heading (title + subtitle) moves out of the top bar and into the content area. **BREAKING** for every routed page: `TopBar` stops rendering `resolvePageMeta` output, and each page becomes responsible for its own heading.
- Top bar keeps the notification bell and profile menu only. The reference's global search box is explicitly **out of scope** — `searchSlice.js` is registered in the store but no component renders it, so no behavior is lost by leaving it unwired.

**Dashboard panels** — ten panels across four rows:

- Five KPI cards with tinted icon tiles; the fifth carries a completion ring.
- KPI trend deltas (`+12%`, `-5%`) from the reference are **dropped** — no historical data exists to compute them, and inventing them would put fabricated numbers on the landing screen. Cards keep their real derived sub-stat.
- Delivery Pressure chart keeps its current data and meaning, restyled to the reference's chart treatment. The reference's "Workflow Performance" two-series chart is **not** adopted.
- Quick Actions becomes a 2×2 tile grid with a lightning glyph and subtitle.
- Portfolio Status donut gains a centre label and percentage-based legend rows.
- Active Projects, Needs Attention, and Recent Activity gain the reference's row anatomy (icon tiles, status pills, timeline rail).
- New "Stay on Track" promo card — static presentation, no data binding.
- New date-range selector. Its scope is limited to the panels that are genuinely time-windowed; current-state panels are documented as unaffected rather than being made to look filtered.

**Foundation**

- Adopt `lucide-react` as the icon set, replacing unicode glyphs (`◫`, `✦`, `⛭`) whose shape and weight vary by platform and do not match the reference.

## Capabilities

### New Capabilities

- `dashboard`: The delivery dashboard screen — which panels it presents, what each one derives from, their empty and permission-gated states, and how the date range scopes them.
- `app-shell`: The persistent application chrome — sidebar navigation and its active state, top bar contents, profile menu, and where page headings are rendered.

### Modified Capabilities

None — this project has no existing specs; these are the first two.

## Impact

**Affected code**

- `client/src/pages/DashboardPage.jsx` — rebuilt.
- `client/src/components/Layout.jsx`, `client/src/components/TopBar.jsx` — sidebar and top bar restructured.
- All routed pages under `client/src/pages/` — each gains its own heading once `TopBar` stops rendering one.
- `client/src/app/pageMeta.js` — consumer moves from `TopBar` to the pages.
- `client/src/styles/` — dashboard and shell rules; the unused `.searchbox` / `.search-results` blocks become removable.

**Dependencies**

- Adds `lucide-react` (tree-shakeable, per-icon import).

**Data**

- No schema changes, no new endpoints. Every panel reads from existing endpoints (`/projects/summary`, `/audit`).

**Not in scope**

- Topbar global search, KPI trend deltas, and the two-series Workflow Performance chart — each excluded above for a stated reason.
- Applying the reference treatment to pages other than the dashboard. The shell changes touch all pages by necessity; their body content is untouched beyond gaining a heading.
