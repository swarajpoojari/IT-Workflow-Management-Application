import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useParams, Link } from 'react-router-dom';
import {
  fetchProject, selectCurrentProject, selectProjectsStatus,
  selectProjectsError, selectProgressStats,
} from '../features/projects/projectsSlice.js';
import {
  updateStageStatus, fetchStatusHistory, addDocument, fetchDocuments,
  selectUpdatingStageId,
} from '../features/stages/stagesSlice.js';
import { usePermission } from '../hooks/usePermission.js';
import { StatusModal } from '../components/StatusModal.jsx';
import { Modal } from '../components/ui/Modal.jsx';
import { Badge, ErrorNote, Field, ProgressBar, Spinner, StatusBadge } from '../components/ui/Bits.jsx';

function HistoryModal({ projectId, stage, onClose }) {
  const dispatch = useDispatch();
  const history = useSelector((state) => state.stages.history[stage.id] ?? []);

  useEffect(() => {
    dispatch(fetchStatusHistory({ projectId, stageId: stage.id }));
  }, [dispatch, projectId, stage.id]);

  return (
    <Modal title="Status history" subtitle={stage.name} onClose={onClose} wide>
      {history.length === 0 ? (
        <p className="muted">No status changes recorded yet.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>When</th><th>Change</th><th>By</th><th>Detail</th></tr>
            </thead>
            <tbody>
              {history.map((entry) => (
                <tr key={entry.id}>
                  <td className="muted mono">{entry.changedAt}</td>
                  <td>
                    <div className="row" style={{ gap: 6 }}>
                      {entry.fromStatus && <StatusBadge status={entry.fromStatus} />}
                      <span className="muted">→</span>
                      <StatusBadge status={entry.toStatus} />
                    </div>
                  </td>
                  <td>{entry.changedByName}</td>
                  <td className="muted" style={{ fontSize: 12.5 }}>
                    {entry.blocker && <div><strong>Blocker:</strong> {entry.blocker}</div>}
                    {entry.holdReason && <div><strong>Hold:</strong> {entry.holdReason}</div>}
                    {entry.completionDate && <div><strong>Completed:</strong> {entry.completionDate}</div>}
                    {entry.remarks && <div>{entry.remarks}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
        This log is append-only. Every row was written in the same transaction as the status change it describes.
      </p>
    </Modal>
  );
}

function DocumentModal({ projectId, stage, onClose }) {
  const dispatch = useDispatch();
  const documents = useSelector((state) => state.stages.documents[stage.id] ?? []);
  const canUpload = usePermission('documents', 'create');
  const [form, setForm] = useState({ fileName: '', fileUrl: '', docType: 'LINK', notes: '' });

  useEffect(() => {
    dispatch(fetchDocuments({ projectId, stageId: stage.id }));
  }, [dispatch, projectId, stage.id]);

  const submit = (event) => {
    event.preventDefault();
    dispatch(addDocument({
      projectId, stageId: stage.id,
      payload: { ...form, notes: form.notes.trim() || null },
    })).then((result) => {
      if (!result.error) setForm({ fileName: '', fileUrl: '', docType: 'LINK', notes: '' });
    });
  };

  return (
    <Modal title="Documents & links" subtitle={stage.name} onClose={onClose} wide>
      <div className="info-note">
        <strong>Attaching a document does not change the stage status.</strong> Status moves only when
        someone explicitly updates it — the API returns <code>statusUnchanged: true</code> on every upload.
      </div>

      {documents.length > 0 ? (
        <div className="table-wrap card" style={{ marginBottom: 16 }}>
          <table>
            <thead><tr><th>Name</th><th>Type</th><th>v</th><th>Uploaded by</th><th>When</th></tr></thead>
            <tbody>
              {documents.map((doc) => (
                <tr key={doc.id}>
                  <td><a href={doc.fileUrl} target="_blank" rel="noreferrer">{doc.fileName}</a></td>
                  <td><Badge tone="neutral">{doc.docType}</Badge></td>
                  <td className="mono">{doc.version}</td>
                  <td className="muted">{doc.uploadedByName}</td>
                  <td className="muted mono">{doc.uploadedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted" style={{ marginBottom: 16 }}>Nothing attached to this stage yet.</p>
      )}

      {canUpload && (
        <form onSubmit={submit} className="card card-pad">
          <h3 style={{ marginBottom: 12 }}>Attach a document or link</h3>
          <div className="grid grid-2" style={{ gap: '0 14px' }}>
            <Field label="Name" required>
              <input type="text" required value={form.fileName} onChange={(e) => setForm({ ...form, fileName: e.target.value })} placeholder="Runbook v2" />
            </Field>
            <Field label="Type">
              <select value={form.docType} onChange={(e) => setForm({ ...form, docType: e.target.value })}>
                <option value="LINK">Link</option>
                <option value="FILE">File</option>
              </select>
            </Field>
          </div>
          <Field label="URL" required>
            <input type="text" required value={form.fileUrl} onChange={(e) => setForm({ ...form, fileUrl: e.target.value })} placeholder="https://…" />
          </Field>
          <Field label="Notes">
            <input type="text" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
          <div className="row row-end">
            <button type="submit" className="btn btn-sm" disabled={!form.fileName || !form.fileUrl}>Attach</button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function StageCard({ stage, projectId, onStatusClick, onHistoryClick, onDocumentsClick, canUpdate, canSeeInternal }) {
  const updatingId = useSelector(selectUpdatingStageId);
  const isUpdating = updatingId === stage.id;

  return (
    <div
      className={`stage-card is-${stage.status.toLowerCase().replace('_', '-')} ${stage._optimistic ? 'is-optimistic' : ''}`}
    >
      <div className="stage-top">
        <div className="stage-title">
          <span className="stage-seq">{stage.sequence}</span>
          <div>
            <strong>{stage.name}</strong>
            {stage.description && <div className="muted" style={{ fontSize: 12.5 }}>{stage.description}</div>}
          </div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <StatusBadge status={stage.status} />
          {!stage.clientVisible && canSeeInternal && <Badge tone="neutral">Internal</Badge>}
        </div>
      </div>

      <div className="stage-meta">
        {canSeeInternal && <span>Owner: <b>{stage.assigneeName ?? 'Unassigned'}</b></span>}
        <span>Due: <b>{stage.dueDate ?? '—'}</b></span>
        {stage.completionDate && <span>Completed: <b>{stage.completionDate}</b></span>}
        {canSeeInternal && stage.documentCount > 0 && <span>Documents: <b>{stage.documentCount}</b></span>}
      </div>

      {stage.blocker && <div className="stage-note is-blocker"><strong>Blocked:</strong> {stage.blocker}</div>}
      {stage.holdReason && <div className="stage-note is-hold"><strong>On hold:</strong> {stage.holdReason}</div>}
      {stage.remarks && <div className="stage-note">{stage.remarks}</div>}

      {canSeeInternal && (
        <div className="row" style={{ gap: 6 }}>
          {canUpdate && (
            <button type="button" className="btn btn-sm" onClick={() => onStatusClick(stage)} disabled={isUpdating}>
              {isUpdating ? 'Saving…' : 'Update status'}
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onHistoryClick(stage)}>History</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onDocumentsClick(stage)}>Documents</button>
        </div>
      )}
    </div>
  );
}

export function WorkflowBoardPage() {
  const { id } = useParams();
  const projectId = Number(id);
  const dispatch = useDispatch();

  const project = useSelector(selectCurrentProject);
  const status = useSelector(selectProjectsStatus);
  const error = useSelector(selectProjectsError);
  const stats = useSelector(selectProgressStats);      // createSelector, memoised
  const updatingId = useSelector(selectUpdatingStageId);

  const canUpdateStatus = usePermission('stages', 'update_status');
  const canSeeInternal = usePermission('documents', 'read');

  const [statusStage, setStatusStage] = useState(null);
  const [historyStage, setHistoryStage] = useState(null);
  const [documentStage, setDocumentStage] = useState(null);

  useEffect(() => { dispatch(fetchProject(projectId)); }, [dispatch, projectId]);

  const submitStatus = (payload) => {
    dispatch(updateStageStatus({
      projectId,
      stageId: statusStage.id,
      payload,
      snapshot: statusStage,
    })).then((result) => {
      if (!result.error) setStatusStage(null);
    });
  };

  if (status === 'loading' && !project) return <Spinner label="Loading board…" />;
  if (error) return <ErrorNote error={error} />;
  if (!project) return null;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="row" style={{ gap: 8, marginBottom: 4 }}>
            <Link to="/projects" className="muted" style={{ fontSize: 13 }}>← Projects</Link>
            <span className="mono muted">{project.code}</span>
          </div>
          <h1>{project.name}</h1>
          <p>
            {project.clientName} · Generated from <strong>{project.sopTemplateName}</strong>{' '}
            <Badge tone="violet">v{project.sopVersionNumber}</Badge>
            {' '}— this project stays on v{project.sopVersionNumber} even after newer versions are published.
          </p>
        </div>
        <div style={{ minWidth: 220 }}>
          <ProgressBar value={stats.percentComplete} label={`${stats.completed}/${stats.total} done`} />
          <div className="row" style={{ gap: 6, marginTop: 8, justifyContent: 'flex-end' }}>
            {stats.inProgress > 0 && <Badge tone="accent">{stats.inProgress} in progress</Badge>}
            {stats.blocked > 0 && <Badge tone="red">{stats.blocked} blocked</Badge>}
            {stats.onHold > 0 && <Badge tone="amber">{stats.onHold} on hold</Badge>}
          </div>
        </div>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 18 }}>
        <div className="stat"><div className="stat-value">{stats.total}</div><div className="stat-label">Stages</div></div>
        <div className="stat"><div className="stat-value" style={{ color: 'var(--green)' }}>{stats.completed}</div><div className="stat-label">Completed</div></div>
        <div className="stat"><div className="stat-value" style={{ color: 'var(--accent)' }}>{stats.inProgress}</div><div className="stat-label">In progress</div></div>
        <div className="stat">
          <div className="stat-value" style={{ color: stats.atRisk ? 'var(--red)' : undefined }}>{stats.atRisk}</div>
          <div className="stat-label">Needs attention</div>
          <div className="stat-sub">{stats.blocked} blocked · {stats.onHold} on hold</div>
        </div>
      </div>

      <div className="stack">
        {project.stages.map((stage) => (
          <StageCard
            key={stage.id}
            stage={stage}
            projectId={projectId}
            canUpdate={canUpdateStatus}
            canSeeInternal={canSeeInternal}
            onStatusClick={setStatusStage}
            onHistoryClick={setHistoryStage}
            onDocumentsClick={setDocumentStage}
          />
        ))}
      </div>

      {statusStage && (
        <StatusModal
          stage={statusStage}
          onSubmit={submitStatus}
          onClose={() => setStatusStage(null)}
          busy={updatingId === statusStage.id}
        />
      )}
      {historyStage && (
        <HistoryModal projectId={projectId} stage={historyStage} onClose={() => setHistoryStage(null)} />
      )}
      {documentStage && (
        <DocumentModal projectId={projectId} stage={documentStage} onClose={() => setDocumentStage(null)} />
      )}
    </>
  );
}
