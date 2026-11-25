import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useSearchParams } from 'react-router-dom';
import {
  fetchAuditLog, fetchAuditFilters, setAuditFilter,
  selectAuditItems, selectAuditPagination, selectAuditFilters,
  selectAuditFilterOptions, selectAuditStatus, selectAuditError,
} from '../features/audit/auditSlice.js';
import { api } from '../api/axiosClient.js';
import { endpoints } from '../api/endpoints.js';
import { downloadCsv } from '../lib/csv.js';
import { ErrorNote, Spinner, EmptyState } from '../components/ui/Bits.jsx';
import { Badge } from '../components/ui/badge.jsx';
import { Avatar, AvatarFallback } from '../components/ui/avatar.jsx';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '../components/ui/table.jsx';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '../components/ui/dialog.jsx';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.jsx';
import { cn } from 'cn';
import { History } from 'lucide-react';

const ACTION_VARIANT = {
  CREATE: 'green', ACTIVATE: 'green', SIGNOFF: 'green',
  UPDATE: 'accent', STATUS_CHANGE: 'accent', ASSIGN: 'accent', VIEW: 'neutral',
  REASSIGN: 'amber', REORDER: 'amber', UPLOAD: 'amber', BUG_RAISED: 'amber', BUG_STATUS: 'amber',
  DELETE: 'red', DEACTIVATE: 'red',
  PUBLISH: 'violet',
  LOGIN: 'neutral', LOGOUT: 'neutral',
};

const ACTION_LABEL = {
  CREATE: 'Created', UPDATE: 'Updated', DELETE: 'Deleted', PUBLISH: 'Published',
  REORDER: 'Reordered', STATUS_CHANGE: 'Status changed', ASSIGN: 'Assigned',
  DEACTIVATE: 'Deactivated', ACTIVATE: 'Activated', REASSIGN: 'Reassigned',
  LOGIN: 'Signed in', LOGOUT: 'Signed out', UPLOAD: 'Uploaded', SIGNOFF: 'Signed off',
  BUG_RAISED: 'Bug raised', BUG_STATUS: 'Bug updated', VIEW: 'Viewed',
};

const ENTITY_LABEL = {
  USER: 'Users', ROLE: 'Roles', SOP_TEMPLATE: 'SOP', SOP_VERSION: 'SOP',
  SOP_STAGE: 'SOP', PROJECT: 'Projects', PROJECT_STAGE: 'Workflow',
  DOCUMENT: 'Documents', AUTH: 'Auth', BUG: 'Bugs', SIGNOFF: 'Sign-off',
  SETTINGS: 'Settings', BRD_LOOKUP: 'Public tracking', TEAM: 'Teams',
};

function initialsOf(name) {
  if (!name) return '•';
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '');
}

/** The full before/after, in a dialog rather than crammed, mono, into a cell. */
function DetailDialog({ entry, onClose }) {
  const keys = entry
    ? [...new Set([...Object.keys(entry.oldValue ?? {}), ...Object.keys(entry.newValue ?? {})])]
    : [];

  return (
    <Dialog open={Boolean(entry)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        {entry && (
          <>
            <DialogHeader>
              <DialogTitle>{entry.summary}</DialogTitle>
              <DialogDescription>
                {entry.actorName ?? 'System'} · {entry.createdAt}
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={ACTION_VARIANT[entry.action] ?? 'neutral'}>
                {ACTION_LABEL[entry.action] ?? entry.action}
              </Badge>
              <Badge variant="outline">
                {ENTITY_LABEL[entry.entityType] ?? entry.entityType}
                {entry.entityId && ` #${entry.entityId}`}
              </Badge>
            </div>

            {keys.length === 0 ? (
              <p className="text-sm text-muted-foreground">No field-level detail recorded for this entry.</p>
            ) : (
              <div className="flex flex-col gap-2.5 rounded-lg border bg-muted/40 p-3">
                {keys.map((key) => {
                  const before = entry.oldValue?.[key];
                  const after = entry.newValue?.[key];
                  return (
                    <div key={key} className="text-sm">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {key}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        {before !== undefined && (
                          <span className="rounded bg-danger-soft px-1.5 py-0.5 text-danger line-through">
                            {JSON.stringify(before)}
                          </span>
                        )}
                        {before !== undefined && after !== undefined && (
                          <span className="text-muted-foreground">→</span>
                        )}
                        {after !== undefined && (
                          <span className="rounded bg-success-soft px-1.5 py-0.5 text-success">
                            {JSON.stringify(after)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function AuditLogPage() {
  const dispatch = useDispatch();
  const items = useSelector(selectAuditItems);
  const pagination = useSelector(selectAuditPagination);
  const filters = useSelector(selectAuditFilters);
  const options = useSelector(selectAuditFilterOptions);
  const status = useSelector(selectAuditStatus);
  const error = useSelector(selectAuditError);

  const [detail, setDetail] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => { dispatch(fetchAuditFilters()); }, [dispatch]);

  useEffect(() => {
    const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== ''));
    dispatch(fetchAuditLog(params));
  }, [dispatch, filters]);

  const update = (patch) => dispatch(setAuditFilter(patch));

  /**
   * Exports every entry matching the current filters, not just the page on
   * screen — paging through the API itself (the server caps a single
   * request at 100 rows) up to a safety limit, so this can't run away on an
   * unexpectedly huge log.
   */
  const exportCsv = async () => {
    setExporting(true);
    try {
      const base = Object.fromEntries(Object.entries(filters).filter(([k, v]) => v !== '' && k !== 'page'));
      const rows = [];
      const MAX_PAGES = 50;
      for (let page = 1; page <= MAX_PAGES; page += 1) {
        const { data } = await api.get(endpoints.audit.root, { params: { ...base, page, limit: 100 } });
        rows.push(...data.items);
        if (!data.pagination?.hasNext) break;
      }
      downloadCsv(`audit-log-${new Date().toISOString().slice(0, 10)}.csv`, rows, [
        { label: 'Timestamp', value: (r) => r.createdAt },
        { label: 'Actor', value: (r) => r.actorName ?? 'System' },
        { label: 'Role', value: (r) => r.actorRole ?? '' },
        { label: 'Action', value: (r) => ACTION_LABEL[r.action] ?? r.action },
        { label: 'Module', value: (r) => ENTITY_LABEL[r.entityType] ?? r.entityType },
        { label: 'Entity ID', value: (r) => r.entityId ?? '' },
        { label: 'Summary', value: (r) => r.summary ?? '' },
      ]);
    } finally {
      setExporting(false);
    }
  };

  // Quick-action deep link ("/audit?action=export") triggers the CSV
  // export once, then drops the param.
  useEffect(() => {
    if (searchParams.get('action') !== 'export') return;
    exportCsv();
    setSearchParams((params) => { params.delete('action'); return params; }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {pagination ? `${pagination.total} entries match the filters below.` : 'Loading…'}
        </p>
        <button
          type="button"
          className="btn"
          onClick={exportCsv}
          disabled={exporting || !items.length}
        >
          {exporting ? 'Preparing export…' : '⭳ Export log'}
        </button>
      </div>

      <ErrorNote error={error} />

      <div className="card card-pad mb-4">
        <div className="row">
          <Select
            value={filters.entityType || 'ALL'}
            onValueChange={(v) => update({ entityType: v === 'ALL' ? '' : v })}
          >
            <SelectTrigger style={{ width: 190 }}><SelectValue placeholder="All modules" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All modules</SelectItem>
              {options.entityTypes.map((type) => (
                <SelectItem key={type} value={type}>{ENTITY_LABEL[type] ?? type}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.action || 'ALL'}
            onValueChange={(v) => update({ action: v === 'ALL' ? '' : v })}
          >
            <SelectTrigger style={{ width: 180 }}><SelectValue placeholder="All actions" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All actions</SelectItem>
              {options.actions.map((action) => (
                <SelectItem key={action} value={action}>{ACTION_LABEL[action] ?? action}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <input type="date" value={filters.dateFrom} onChange={(e) => update({ dateFrom: e.target.value })} style={{ width: 165 }} title="From date" />
          <input type="date" value={filters.dateTo} onChange={(e) => update({ dateTo: e.target.value })} style={{ width: 165 }} title="To date" />

          <span className="spacer" />
          <button
            type="button" className="btn btn-ghost btn-sm"
            onClick={() => update({ entityType: '', action: '', dateFrom: '', dateTo: '' })}
          >
            Clear filters
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-head bare">
          <div className="card-head-title">
            <span className="panel-icon is-accent" aria-hidden="true"><History size={16} /></span>
            <h3>Audit log</h3>
          </div>
        </div>
        {status === 'loading' && !items.length ? (
          <Spinner label="Loading audit entries…" />
        ) : items.length === 0 ? (
          <EmptyState title="No entries match these filters" hint="Try widening the date range or clearing the filters." />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Module</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Changed by</TableHead>
                  <TableHead>Summary</TableHead>
                  <TableHead>Date &amp; time</TableHead>
                  <TableHead className="text-right">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>
                      <span className="font-medium">{ENTITY_LABEL[entry.entityType] ?? entry.entityType}</span>
                      {entry.entityId && <span className="ml-1 text-muted-foreground">#{entry.entityId}</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={ACTION_VARIANT[entry.action] ?? 'neutral'}>
                        {ACTION_LABEL[entry.action] ?? entry.action}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar size="sm">
                          <AvatarFallback className="bg-brand-soft text-brand">
                            {initialsOf(entry.actorName) || '◦'}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="truncate font-medium">{entry.actorName ?? 'System'}</div>
                          {entry.actorRole && (
                            <div className="truncate text-xs text-muted-foreground">{entry.actorRole}</div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-foreground">{entry.summary}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{entry.createdAt}</TableCell>
                    <TableCell className="text-right">
                      <button
                        type="button"
                        className={cn(
                          'inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground',
                          'hover:bg-accent hover:text-foreground',
                        )}
                        onClick={() => setDetail(entry)}
                        aria-label={`View details for ${entry.summary}`}
                        title="View details"
                      >
                        👁
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {pagination && (
              <div className="pager">
                <button
                  type="button" className="btn btn-ghost btn-sm"
                  disabled={!pagination.hasPrev}
                  onClick={() => update({ page: pagination.page - 1 })}
                >
                  ← Previous
                </button>
                <span className="muted">
                  Page {pagination.page} of {pagination.totalPages} · {pagination.total} entries
                </span>
                <button
                  type="button" className="btn btn-ghost btn-sm"
                  disabled={!pagination.hasNext}
                  onClick={() => update({ page: pagination.page + 1 })}
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <DetailDialog entry={detail} onClose={() => setDetail(null)} />
    </>
  );
}

export default AuditLogPage;
