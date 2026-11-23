import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { KeyRound, Users, ShieldCheck, ShieldOff } from 'lucide-react';
import { fetchRoles, selectRoles, selectModules } from '../features/users/usersSlice.js';
import { api } from '../api/axiosClient.js';
import { endpoints } from '../api/endpoints.js';
import { ErrorNote, Spinner, KpiCard } from '../components/ui/Bits.jsx';
import { cn } from 'cn';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/card.jsx';
import { Badge } from '../components/ui/badge.jsx';
import { Separator } from '../components/ui/separator.jsx';
import { Tooltip, TooltipTrigger, TooltipContent } from '../components/ui/tooltip.jsx';

/**
 * shadcn/ui pilot module. Every class below is a Tailwind utility reading
 * this app's own tokens (see styles/shadcn.css) — nothing here is shadcn's
 * default palette. All data logic is untouched from the pre-shadcn version
 * of this page; only the render layer changed.
 */

/* One glyph per module, so a role card reads at a glance. */
const MODULE_ICON = {
  users: '☰', roles: '⚿', sop: '⛭', projects: '◫', stages: '✦',
  documents: '▤', audit: '⏱', reports: '◑', bugs: '◉', settings: '⚙',
  notifications: '◔', auth: '⛨',
};

const MODULE_LABEL = {
  users: 'Users', roles: 'Roles', sop: 'SOP templates', projects: 'Projects',
  stages: 'Workflow stages', documents: 'Documents', audit: 'Audit log',
  reports: 'Reports', bugs: 'Bugs', settings: 'Settings',
  notifications: 'Notifications', auth: 'Authentication',
};

/* A stable colour per role key — the same role is always the same colour. */
const ROLE_TONES = ['violet', 'accent', 'green', 'amber', 'red', 'neutral'];
const toneFor = (key) => {
  const sum = [...String(key)].reduce((n, ch) => n + ch.charCodeAt(0), 0);
  return ROLE_TONES[sum % ROLE_TONES.length];
};

/* Tailwind classes for the role-mark avatar tile, per tone. "red" has no
   Badge variant of its own distinct from "danger" naming — reuses --danger. */
const MARK_CLASS = {
  violet: 'bg-violet-soft text-violet',
  accent: 'bg-brand-soft text-brand',
  green: 'bg-success-soft text-success',
  amber: 'bg-warning-soft text-warning',
  red: 'bg-danger-soft text-danger',
  neutral: 'bg-neutral-soft text-neutral',
};

const READ_ACTIONS = new Set(['read', 'read_all', 'preview']);

/**
 * Two pills per card instead of one badge per permission: what the role can
 * do, and how far its reach extends. The detail panel still lists every row.
 */
function summarise(role, totalPermissions) {
  const granted = role.permissions ?? [];
  const writes = granted.filter((p) => !READ_ACTIONS.has(p.action));

  let access = 'Read only';
  if (totalPermissions && granted.length >= totalPermissions) access = 'Full';
  else if (writes.some((p) => ['create', 'update', 'delete', 'publish'].includes(p.action))) access = 'Manage';
  else if (writes.length > 0) access = 'Contribute';

  let scope = 'Assigned work';
  if (role.isClientScope) scope = 'Own company';
  else if (granted.some((p) => p.module === 'projects' && p.action === 'read_all')) scope = 'Everything';

  return { access, scope };
}

const ACCESS_VARIANT = { Full: 'green', Manage: 'accent', Contribute: 'amber', 'Read only': 'neutral' };

function RoleCard({ role, modules, totalPermissions, selected, onSelect }) {
  const tone = toneFor(role.key);
  const { access, scope } = summarise(role, totalPermissions);
  const grantedModules = useMemo(
    () => new Set((role.permissions ?? []).map((p) => p.module)),
    [role.permissions],
  );

  return (
    <button
      type="button"
      onClick={() => onSelect(role.id)}
      aria-pressed={selected}
      className={cn(
        'flex w-full flex-col gap-3 rounded-xl border bg-card p-4 text-left text-card-foreground shadow-xs',
        'transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        selected ? 'border-primary ring-2 ring-primary/20' : 'border-border',
      )}
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold',
            MARK_CLASS[tone],
          )}
        >
          {role.name.slice(0, 1)}
        </span>
        <div className="flex min-w-0 items-center gap-2">
          <strong className="truncate text-sm font-semibold">{role.name}</strong>
          {role.isSystem && <Badge variant="outline">System</Badge>}
        </div>
      </div>

      <p className="line-clamp-2 min-h-9 text-xs leading-relaxed text-muted-foreground">
        {role.description}
      </p>

      <div className="flex flex-wrap gap-1.5">
        <Badge variant={ACCESS_VARIANT[access]}>{access}</Badge>
        <Badge variant="outline">{scope}</Badge>
      </div>

      <div className="flex flex-wrap gap-1" aria-hidden="true">
        {modules.map((module) => {
          const on = grantedModules.has(module);
          return (
            <Tooltip key={module}>
              <TooltipTrigger asChild>
                <span
                  className={cn(
                    'flex h-5 w-5 items-center justify-center rounded text-[10px]',
                    on ? 'bg-brand-soft text-brand' : 'bg-muted text-muted-foreground/50',
                  )}
                >
                  {MODULE_ICON[module] ?? '•'}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {MODULE_LABEL[module] ?? module}{!on && ' — no access'}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>

      <Separator />

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{grantedModules.size}/{modules.length} modules</span>
        <span>{role.memberCount} member{role.memberCount === 1 ? '' : 's'}</span>
      </div>
    </button>
  );
}

export function RolePreviewPage() {
  const dispatch = useDispatch();
  const roles = useSelector(selectRoles);
  const modules = useSelector(selectModules);

  const [selected, setSelected] = useState(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { dispatch(fetchRoles()); }, [dispatch]);

  useEffect(() => {
    if (!selected) return;
    setLoading(true); setError(null);
    api.get(endpoints.rolePreview(selected))
      .then((res) => setPreview(res.data))
      .catch((err) => setError(err.response?.data?.error ?? { message: 'Preview failed' }))
      .finally(() => setLoading(false));
  }, [selected]);

  // The widest permission set in the system stands in for "everything".
  const totalPermissions = useMemo(
    () => roles.reduce((max, r) => Math.max(max, r.permissions?.length ?? 0), 0),
    [roles],
  );

  const byModule = useMemo(
    () => (preview?.permissions ?? []).reduce((acc, p) => {
      (acc[p.module] ??= []).push(p.action);
      return acc;
    }, {}),
    [preview],
  );

  const stats = useMemo(() => ({
    roles: roles.length,
    members: roles.reduce((n, r) => n + (r.memberCount ?? 0), 0),
    full: roles.filter((r) => summarise(r, totalPermissions).access === 'Full').length,
    unassigned: roles.filter((r) => (r.memberCount ?? 0) === 0).length,
  }), [roles, totalPermissions]);

  return (
    <div className="stack">
      {/* Shared chrome, unconverted on purpose: the same .kpi tile is used on
          Dashboard and User Management, which haven't moved to shadcn yet —
          forking its look here would make this page inconsistent with those,
          not with itself. It converts once every page using it does. */}
      <div className="kpi-row">
        <KpiCard icon={KeyRound} label="Total roles" value={stats.roles} tone="accent" />
        <KpiCard icon={Users} label="Team members" value={stats.members} tone="violet" />
        <KpiCard icon={ShieldCheck} label="Full-access roles" value={stats.full} tone="green" />
        <KpiCard icon={ShieldOff} label="Roles with no members" value={stats.unassigned} tone="amber" />
      </div>

      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {roles.map((role) => (
          <RoleCard
            key={role.id}
            role={role}
            modules={modules}
            totalPermissions={totalPermissions}
            selected={selected === role.id}
            onSelect={setSelected}
          />
        ))}
      </div>

      <ErrorNote error={error} />
      {loading && <Spinner label="Loading preview…" />}

      {preview && !loading && (
        <>
          <div className="callout info">{preview.note}</div>

          <div className="grid grid-2">
            <Card>
              <CardHeader>
                <CardTitle>Navigation as {preview.role.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-1.5">
                  {preview.navigation.map((item) => (
                    <li
                      key={item.path}
                      className={cn(
                        'flex items-center gap-2 text-sm',
                        !item.visible && 'text-muted-foreground/60',
                      )}
                    >
                      <span aria-hidden="true">{item.visible ? '●' : '○'}</span>
                      {item.label}
                      {!item.visible && <span className="text-xs">— hidden</span>}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Capabilities</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-2">
                  {Object.entries(preview.capabilities).map(([key, value]) => (
                    <li key={key} className="flex items-center gap-2 text-sm">
                      <span
                        aria-hidden="true"
                        className={cn(
                          'flex h-[18px] w-[18px] items-center justify-center rounded-full text-[11px] font-bold',
                          value ? 'bg-success-soft text-success' : 'bg-muted text-muted-foreground',
                        )}
                      >
                        {value ? '✓' : '×'}
                      </span>
                      <span className={cn(!value && 'text-muted-foreground')}>
                        {key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Permissions — {preview.role.name}</CardTitle>
              <CardDescription>
                {preview.permissions.length} rows across {Object.keys(byModule).length} modules.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(byModule).map(([module, actions]) => (
                  <div key={module} className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="flex h-5 w-5 items-center justify-center rounded bg-brand-soft text-[10px] text-brand"
                      >
                        {MODULE_ICON[module] ?? '•'}
                      </span>
                      <strong className="text-sm">{MODULE_LABEL[module] ?? module}</strong>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {actions.map((a) => (
                        <Badge key={a} variant="neutral">{a.replace(/_/g, ' ')}</Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

export default RolePreviewPage;
