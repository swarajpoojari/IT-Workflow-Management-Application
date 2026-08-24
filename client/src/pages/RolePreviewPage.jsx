import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchRoles, selectRoles } from '../features/users/usersSlice.js';
import { api } from '../api/axiosClient.js';
import { endpoints } from '../api/endpoints.js';
import { Badge, ErrorNote, Spinner } from '../components/ui/Bits.jsx';

export function RolePreviewPage() {
  const dispatch = useDispatch();
  const roles = useSelector(selectRoles);
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

  const byModule = (preview?.permissions ?? []).reduce((acc, p) => {
    (acc[p.module] ??= []).push(p.action);
    return acc;
  }, {});

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <h1>Roles &amp; permissions</h1>
          <p className="muted small">Inspect what a role can do before changing it.</p>
        </div>
      </header>

      <section className="card">
        <h3>Choose a role to preview</h3>
        <div className="row gap-sm wrap">
          {roles.map((role) => (
            <button
              key={role.id} type="button"
              className={`btn ${selected === role.id ? 'primary' : ''}`}
              onClick={() => setSelected(role.id)}
            >
              {role.name}
            </button>
          ))}
        </div>
      </section>

      <ErrorNote error={error} />
      {loading && <Spinner label="Loading preview…" />}

      {preview && !loading && (
        <>
          {}
          <div className="callout info">{preview.note}</div>

          <div className="grid-2">
            <section className="card">
              <h3>Navigation as {preview.role.name}</h3>
              <ul className="plain-list">
                {preview.navigation.map((item) => (
                  <li key={item.path} className={item.visible ? '' : 'dimmed'}>
                    {item.visible ? '●' : '○'} {item.label}
                    {!item.visible && <span className="muted xsmall"> — hidden</span>}
                  </li>
                ))}
              </ul>
            </section>

            <section className="card">
              <h3>Capabilities</h3>
              <ul className="plain-list">
                {Object.entries(preview.capabilities).map(([key, value]) => (
                  <li key={key}>
                    <Badge tone={value ? 'success' : 'neutral'}>{value ? 'yes' : 'no'}</Badge>{' '}
                    {key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <section className="card">
            <h3>Permission rows ({preview.permissions.length})</h3>
            <div className="perm-grid">
              {Object.entries(byModule).map(([module, actions]) => (
                <div key={module}>
                  <strong>{module}</strong>
                  <div className="row gap-sm wrap">
                    {actions.map((a) => <Badge key={a} tone="info">{a}</Badge>)}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

export default RolePreviewPage;
