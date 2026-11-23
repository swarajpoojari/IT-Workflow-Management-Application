# Spec Delta

## Purpose

The landing screen for signed-in staff: a single view that reports portfolio health, surfaces work that needs attention, and offers shortcuts into the modules the viewer is permitted to reach.

## ADDED Requirements

### Requirement: Panel composition and order

The dashboard SHALL present its panels in a fixed reading order: a KPI row, then the delivery pressure chart beside quick actions, then portfolio status beside active projects beside needs-attention, then recent activity beside the promo card. Panels the viewer lacks permission for SHALL be omitted without leaving a gap.

#### Scenario: Full-permission viewer

- **WHEN** a viewer with all module permissions opens the dashboard
- **THEN** all ten panels render in the specified order

#### Scenario: Panel omitted for permission

- **WHEN** a viewer without audit read permission opens the dashboard
- **THEN** the recent activity panel is absent
- **AND** the remaining panels reflow to leave no empty column

#### Scenario: Narrow viewport

- **WHEN** the viewport is below the layout's breakpoint
- **THEN** panels stack into a single column preserving the same reading order

### Requirement: KPI summary cards

The dashboard SHALL present five KPI cards reporting, in order: total projects, pending, on hold, at risk, and average progress. Each card SHALL show a tinted icon tile, the figure, a label, and a supporting line derived from live data.

#### Scenario: Figures reflect current portfolio

- **WHEN** the project summary loads
- **THEN** each card's figure equals the count derived from current stage rows for that status
- **AND** the average progress card shows the mean completion percentage across projects

#### Scenario: Total projects card links through

- **WHEN** the viewer activates the total projects card
- **THEN** they navigate to the projects list

#### Scenario: Average progress ring

- **WHEN** the average progress card renders
- **THEN** a ring indicator is filled in proportion to that percentage

### Requirement: KPI cards omit trend deltas

The dashboard SHALL NOT display period-over-period trend indicators on KPI cards. No historical record of portfolio state exists, so such a figure could only be fabricated.

#### Scenario: No trend shown

- **WHEN** any KPI card renders
- **THEN** no percentage-change indicator appears on it
- **AND** the supporting line shows a figure derived from current data instead

### Requirement: Delivery pressure chart

The dashboard SHALL present open projects bucketed by proximity to their target date, ordered from furthest out to overdue, with bucket height weighted by urgency so the series rises as deadlines approach.

#### Scenario: Buckets ordered by urgency

- **WHEN** the chart renders
- **THEN** buckets appear in order from the furthest-out horizon through to overdue

#### Scenario: Bucket detail on inspection

- **WHEN** the viewer inspects a bucket
- **THEN** the count of open projects in it is shown
- **AND** up to five of those projects are named, with a count of any remainder

#### Scenario: Completed projects excluded

- **WHEN** a project has every stage complete
- **THEN** it is absent from all buckets

### Requirement: Quick actions

The dashboard SHALL present shortcuts to other modules as a two-column tile grid, each tile naming its destination and a short description. The grid SHALL list only destinations the viewer holds permission for, and SHALL be absent entirely when none qualify.

#### Scenario: Tiles filtered by permission

- **WHEN** a viewer lacks permission for a destination
- **THEN** that tile is absent from the grid

#### Scenario: No permitted destinations

- **WHEN** a viewer holds none of the required permissions
- **THEN** the quick actions panel does not render

### Requirement: Portfolio status breakdown

The dashboard SHALL present the distribution of projects across derived statuses as a ring chart with a centre label naming the largest share, and a legend listing each status with its share as a percentage.

#### Scenario: Centre label

- **WHEN** the ring renders
- **THEN** its centre shows the percentage and name of the largest status group

#### Scenario: Legend shows percentages

- **WHEN** the legend renders
- **THEN** each row shows a colour marker, the status name, and that status's share as a percentage of all projects

### Requirement: Active projects list

The dashboard SHALL list open projects ordered least-complete first, each row showing a status marker, the project name, its code, its completed-of-total stage count, a progress bar, and its completion percentage. Rows SHALL link to the project. The list SHALL be capped at six rows with a link to the full list.

#### Scenario: Ordering and cap

- **WHEN** more than six projects are open
- **THEN** the six least-complete are listed in ascending completion order

#### Scenario: All work complete

- **WHEN** every project in scope is complete
- **THEN** the panel states that rather than rendering an empty list

### Requirement: Needs-attention list

The dashboard SHALL list open projects that are due within a fortnight, blocked, or on hold, ordered most-urgent first. Each row SHALL carry an icon tile, the project name, its code and client, and a pill stating days remaining or days overdue, styled distinctly when overdue.

#### Scenario: Overdue styling

- **WHEN** a listed project's target date has passed
- **THEN** its pill states the days overdue and is styled distinctly from one stating days remaining

#### Scenario: Nothing pressing

- **WHEN** no project is due within a fortnight, blocked, or on hold
- **THEN** the panel states that no project is pressing

### Requirement: Recent activity feed

The dashboard SHALL present the most recent audit entries as a timeline, each row showing an action-typed icon, the entry summary, the actor, and the elapsed time since the event. The feed SHALL be restricted to viewers holding audit read permission, and no audit request SHALL be issued for viewers without it.

#### Scenario: Feed restricted by permission

- **WHEN** a viewer without audit read permission opens the dashboard
- **THEN** no request for audit entries is issued
- **AND** the panel does not render

#### Scenario: Elapsed time is correct across time zones

- **GIVEN** the API returns event timestamps in UTC without a zone marker
- **WHEN** an event recorded moments ago is displayed to a viewer in a non-UTC zone
- **THEN** it reads as having just occurred, not offset by that zone

#### Scenario: Unattributed events

- **WHEN** an entry has no actor recorded
- **THEN** the row attributes it to the system rather than showing a blank

### Requirement: Date range selector scopes only time-windowed panels

The dashboard SHALL offer a date-range control in its page header that bounds panels reporting on events over time. Panels reporting current state SHALL be unaffected and SHALL be marked as current, so no panel appears filtered when it is not.

#### Scenario: Range bounds the activity feed

- **WHEN** the viewer selects a narrower range
- **THEN** the recent activity feed shows only events within it

#### Scenario: Current-state panels unaffected

- **WHEN** the viewer selects any range
- **THEN** the KPI, portfolio status, active projects, needs-attention, and delivery pressure panels report unchanged figures
- **AND** each is marked as reporting current state

### Requirement: Promo card

The dashboard SHALL present a promotional card linking to the reports module. It is presentational and SHALL NOT display or imply any project figure.

#### Scenario: Links to reports

- **WHEN** the viewer activates the card's call to action
- **THEN** they navigate to the reports module

#### Scenario: Carries no data

- **WHEN** the card renders
- **THEN** it shows no count, percentage, or other portfolio figure

### Requirement: Empty portfolio

When the viewer has no projects in scope, the dashboard SHALL replace its data panels with a single empty state explaining that projects appear once an administrator creates one and assigns them.

#### Scenario: No projects in scope

- **WHEN** the project summary returns no projects
- **THEN** an empty state with that explanation is shown in place of the data panels
