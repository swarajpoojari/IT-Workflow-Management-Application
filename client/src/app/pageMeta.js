/**
 * The header shows which module you are in, not a search box. Each route
 * contributes a title and one line of context; a page with a dynamic subject
 * (a single project, say) overrides both with `usePageMeta`.
 */
export const PAGE_META = [
  ['/', 'Dashboard', 'Portfolio health, delivery pressure and what needs attention first.'],
  ['/projects/new', 'New Project', 'Pick a published SOP — its workflow stages are generated for you.'],
  ['/projects', 'Projects', 'Every project in your scope, filtered by the API before it reaches you.'],
  ['/my-work', 'My Work', 'The stages assigned to you across all projects.'],
  ['/sop', 'SOP Templates & Library', 'Baseline operating procedures, their live versions and the engagements running on them.'],
  ['/users', 'User Management', 'People, roles and teams. Invitations go out by email.'],
  ['/reports', 'Reports', 'Delivery metrics drawn from live stage data.'],
  ['/roles', 'Roles & Permissions', 'What each role can reach, module by module.'],
  ['/audit', 'Audit Log', 'Append-only record of every change made in the system.'],
  ['/settings', 'Settings', 'Your preferences and system-wide configuration.'],
];

/** Longest matching prefix wins, so /projects/new beats /projects. */
export function resolvePageMeta(pathname) {
  const match = PAGE_META
    .filter(([path]) => (path === '/' ? pathname === '/' : pathname.startsWith(path)))
    .sort((a, b) => b[0].length - a[0].length)[0];

  if (!match) return { title: 'IT Workflow', description: '' };
  return { title: match[1], description: match[2] };
}
