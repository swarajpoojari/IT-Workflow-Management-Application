import { useState } from 'react';
import axios from 'axios';
import { ProgressBar, StatusBadge, Spinner } from '../components/ui/Bits.jsx';

// Bare axios: this page must work with no token, cookie or Redux session.
const publicApi = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api' });

const STATUS_LABEL = {
  NOT_STARTED: 'Not started', IN_PROGRESS: 'In progress', AT_RISK: 'At risk',
  ON_HOLD: 'On hold', COMPLETED: 'Completed', CANCELLED: 'Cancelled',
};

export function PublicTrackPage() {
  const [brd, setBrd] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setLoading(true); setError(null); setData(null);
    try {
      const res = await publicApi.get(`/public/track?brd=${encodeURIComponent(brd.trim())}`);
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.error?.message ?? 'Could not reach the tracking service.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="public-page">
      <header className="public-head">
        <h1>Track your project</h1>
        <p className="muted">Enter the BRD number from your engagement paperwork. No account needed.</p>
      </header>

      <form className="public-form" onSubmit={submit}>
        <input
          value={brd} onChange={(e) => setBrd(e.target.value)}
          placeholder="BRD-2026-0042" aria-label="BRD number" required
        />
        <button className="btn" type="submit" disabled={loading || !brd.trim()}>
          {loading ? 'Looking up…' : 'Track'}
        </button>
      </form>

      {loading && <Spinner label="Looking up your project…" />}
      {error && <div className="callout danger">{error}</div>}

      {data && (
        <div className="stack">
          <section className="card card-pad">
            <h2>{data.project.name}</h2>
            <dl className="field-grid wide">
              <div><dt>BRD number</dt><dd>{data.project.brdNumber}</dd></div>
              <div><dt>Client</dt><dd>{data.project.clientName}</dd></div>
              <div><dt>Project owner</dt><dd>{data.project.owner ?? '—'}</dd></div>
              <div><dt>Status</dt><dd>{STATUS_LABEL[data.project.status] ?? data.project.status}</dd></div>
              <div><dt>Start date</dt><dd>{data.project.startDate ?? '—'}</dd></div>
              <div><dt>Target completion</dt><dd>{data.project.targetEndDate ?? '—'}</dd></div>
            </dl>
          </section>

          <section className="card card-pad">
            <h3>Progress</h3>
            <div className="progress-hero">
              <span className="progress-figure">{data.progress.percentComplete}%</span>
              <div className="grow">
                <ProgressBar value={data.progress.percentComplete} />
                <p className="muted xsmall">{data.progress.completed} of {data.progress.total} stages complete</p>
              </div>
            </div>
          </section>

          <section className="card card-pad">
            <h3>Stages</h3>
            <ol className="journey">
              {data.stages.map((stage, index) => (
                <li key={`${stage.sequence}-${stage.name}`} className={`journey-step status-${stage.status.toLowerCase()}`}>
                  <div className="journey-marker">
                    <span className="journey-dot" />
                    {index < data.stages.length - 1 && <span className="journey-line" />}
                  </div>
                  <div className="journey-card static">
                    <div className="row between">
                      <strong>{stage.name}</strong>
                      <StatusBadge status={stage.status} />
                    </div>
                    {stage.description && <p className="muted small">{stage.description}</p>}
                    <p className="muted xsmall">
                      {stage.dueDate ? `Due ${stage.dueDate}` : 'No due date'}
                      {stage.completionDate ? ` · completed ${stage.completionDate}` : ''}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}
    </div>
  );
}

export default PublicTrackPage;
