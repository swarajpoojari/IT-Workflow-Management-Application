# Spec Delta

## Purpose

The persistent chrome wrapped around every signed-in page: the sidebar that carries navigation and identity, the top bar that carries notifications and account actions, and the rule for where a page's heading appears.

## ADDED Requirements

### Requirement: Sidebar navigation

The sidebar SHALL present a brand lockup, the navigation list, and the signed-in viewer's identity. Each navigation entry SHALL carry a drawn icon and its label, and entries the viewer lacks permission for SHALL be absent.

#### Scenario: Entries filtered by permission

- **WHEN** a viewer lacks the permission a navigation entry requires
- **THEN** that entry is absent from the sidebar

#### Scenario: Identity and sign-out

- **WHEN** the sidebar renders for a signed-in viewer
- **THEN** it shows their initial, full name, and role name
- **AND** offers a sign-out action that ends the session and returns them to the login screen

### Requirement: Active navigation state

The sidebar SHALL mark exactly one navigation entry as active: the one matching the current route. The active entry SHALL be distinguished by a tinted background and accent-coloured label and icon, not by colour alone.

#### Scenario: Active entry matches route

- **WHEN** the viewer is on a route owned by a navigation entry
- **THEN** that entry alone is marked active

#### Scenario: Dashboard is exact-match only

- **WHEN** the viewer is on any route other than the dashboard root
- **THEN** the dashboard entry is not marked active

### Requirement: Top bar contents

The top bar's trailing edge SHALL carry, from the trailing edge inward: the profile menu, the notification bell, and a link to the public tracking page — the page heading occupies the leading edge, per the heading requirement below. The top bar SHALL NOT carry a theme toggle or a global search field.

#### Scenario: Control order

- **WHEN** the top bar renders
- **THEN** the profile control is outermost at the trailing edge, with the notification bell inside it, and the tracking link inside that

#### Scenario: No search field

- **WHEN** the top bar renders
- **THEN** no global search input is present

### Requirement: Notification bell

The notification bell SHALL indicate the count of unread notifications and open a tray listing recent notifications. Opening a notification SHALL mark it read and navigate to its linked target when it has one.

#### Scenario: Unread count

- **WHEN** the viewer has unread notifications
- **THEN** the bell shows the count, displayed as "9+" when it exceeds nine

#### Scenario: Opening a notification

- **WHEN** the viewer opens an unread notification with a link
- **THEN** it is marked read, the tray closes, and they navigate to its target

#### Scenario: Nothing to show

- **WHEN** the viewer has no notifications
- **THEN** the tray states that there are none

### Requirement: Profile menu

The profile menu SHALL be opened from an avatar showing the viewer's initials, and SHALL present their name and email address, a link to their profile settings, and a sign-out action.

#### Scenario: Menu contents

- **WHEN** the viewer opens the profile menu
- **THEN** it shows their full name and email address, a profile settings link, and a sign-out action

#### Scenario: Signing out

- **WHEN** the viewer chooses sign out
- **THEN** their session ends and they are returned to the login screen

### Requirement: Page heading renders inside the top bar

A page's heading and description SHALL render inside the top bar itself, sharing the top bar's background, on the leading edge opposite the controls from the previous requirement. The top bar SHALL NOT be left empty of a title: heading and controls share one bar with one background, not two visually separate bars.

#### Scenario: Heading placement

- **WHEN** any routed page renders
- **THEN** its title and description appear inside the top bar, left of its controls
- **AND** the heading area shares the top bar's background rather than the content area's

#### Scenario: Page-supplied subject

- **WHEN** a page names its own subject, such as a project detail page naming that project
- **THEN** that subject is used as the heading in place of the route's default

#### Scenario: Page-specific actions sit beside the heading

- **WHEN** a page needs a control tied to its heading, such as the dashboard's date-range selector
- **THEN** that control renders inside the top bar, between the heading and the global controls
