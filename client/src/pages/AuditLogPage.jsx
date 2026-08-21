import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchAuditLog, fetchAuditFilters, setAuditFilter,
  selectAuditItems, selectAuditPagination, selectAuditFilters,
  selectAuditFilterOptions, selectAuditStatus, selectAuditError,
} from '../features/audit/auditSlice.js';
import { Badge, ErrorNote, Spinner, EmptyState } from '../components/ui/Bits.jsx';

const ACTION_TONE = {
  CREATE: 'green', PUBLISH: 'violet', DELETE: 'red', DEACTIVATE: 'red',
  STATUS_CHANGE: 'accent', REASSIGN: 'amber', LOGIN: 'neutral', LOGOUT: 'neutral',
};

function Diff({ oldValue, newValue }) {
  if (!oldValue && !newValue) return <span className="muted">—</span>;

  const keys = [...new Set([...Object.keys(oldValue ?? {}), ...Object.keys(newValue ?? {})])];

  return (
    <div className="diff">
      {keys.slice(0, 4).map((key) => (
        <div key={key}>
          <span className="muted">{key}: </span>
          {oldValue?.[key] !== undefined && <span className="diff-old">{JSON.stringify(oldValue[key])}</span>}
          {oldValue?.[key] !== undefined && newValue?.[key] !== undefined && <span className="muted"> → </span>}
          {newValue?.[key] !== undefined && <span className="diff-new">{JSON.stringify(newValue[key])}</span>}
        </div>
      ))}
      {keys.length > 4 && <span className="muted">+{keys.length - 4} more</span>}
    </div>
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

  useEffect(() => { dispatch(fetchAuditFilters()); }, [dispatch]);

  useEffect(() => {
    const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== ''));
    dispatch(fetchAuditLog(params));
  }, [dispatch, filters]);

  const update = (patch) => dispatch(setAuditFilter(patch));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Audit Log</h1>
          <p>
            Append-only record of every state change. Entries are written inside the same transaction
            as the change they describe, and the table rejects <code>UPDATE</code> and <code>DELETE</code> at
            the database level.
          </p>
        </div>
      </div>

      <ErrorNote error={error} />

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="row">
          <select value={filters.entityType} onChange={(e) => update({ entityType: e.target.value })} style={{ width: 190 }}>
            <option value="">All entity types</option>
            {options.entityTypes.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>

          <select value={filters.action} onChange={(e) => update({ action: e.target.value })} style={{ width: 180 }}>
            <option value="">All actions</option>
            {options.actions.map((action) => <option key={action} value={action}>{action}</option>)}
          </select>

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
        {status === 'loading' && !items.length ? (
          <Spinner label="Loading audit entries…" />
        ) : items.length === 0 ? (
          <EmptyState title="No entries match these filters" hint="Try widening the date range or clearing the filters." />
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Timestamp</th><th>Actor</th><th>Action</th><th>Entity</th><th>Summary</th><th>Old → New</th></tr>
                </thead>
                <tbody>
                  {items.map((entry) => (
                    <tr key={entry.id}>
                      <td className="mono muted" style={{ whiteSpace: 'nowrap' }}>{entry.createdAt}</td>
                      <td>
                        <strong style={{ fontSize: 13 }}>{entry.actorName ?? 'System'}</strong>
                        <div className="muted" style={{ fontSize: 11.5 }}>{entry.actorRole}</div>
                      </td>
                      <td><Badge tone={ACTION_TONE[entry.action] ?? 'neutral'}>{entry.action}</Badge></td>
                      <td>
                        <span className="mono" style={{ fontSize: 11.5 }}>{entry.entityType}</span>
                        {entry.entityId && <span className="muted"> #{entry.entityId}</span>}
                      </td>
                      <td style={{ fontSize: 13 }}>{entry.summary}</td>
                      <td><Diff oldValue={entry.oldValue} newValue={entry.newValue} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

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
    </>
  );
}
