import { Router } from 'express';
import { getDb } from '../../db/index.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission, resolveScope } from '../../middleware/authorize.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { projectModel } from '../../models/project.model.js';
import { projectProgress } from '../../services/projectStatus.service.js';
import { MODULES, ACTIONS } from '../../config/constants.js';

const router = Router();
router.use(authenticate);

router.get(
  '/',
  requirePermission(MODULES.REPORTS, ACTIONS.READ),
  asyncHandler((req, res) => {
    const db = getDb();
    const scope = resolveScope(req.user);
    const { items: projects } = projectModel.list({ scope, limit: 500, offset: 0 });
    const ids = projects.map((p) => p.id);
    const inClause = ids.length ? `(${ids.map(() => '?').join(',')})` : '(NULL)';

    const withProgress = projects.map((p) => ({ ...p, progress: projectProgress(p) }));

    const byStatus = withProgress.reduce((acc, p) => {
      acc[p.progress.derivedStatus] = (acc[p.progress.derivedStatus] || 0) + 1;
      return acc;
    }, {});

    const stageBreakdown = ids.length
      ? db.prepare(
          `SELECT status, COUNT(*) AS total FROM project_workflow_stages
            WHERE project_id IN ${inClause} GROUP BY status`,
        ).all(...ids)
      : [];

    const overdue = ids.length
      ? db.prepare(
          `SELECT s.id, s.name, s.due_date, s.status, p.code AS project_code, u.full_name AS assignee
             FROM project_workflow_stages s
             JOIN projects p ON p.id = s.project_id
             LEFT JOIN users u ON u.id = s.assigned_to
            WHERE s.project_id IN ${inClause}
              AND s.due_date IS NOT NULL AND s.due_date < date('now') AND s.status <> 'COMPLETED'
            ORDER BY s.due_date LIMIT 25`,
        ).all(...ids)
      : [];

    const workload = ids.length
      ? db.prepare(
          `SELECT u.id, u.full_name, u.team,
                  COUNT(*) AS open_stages,
                  SUM(CASE WHEN s.status = 'BLOCKED' THEN 1 ELSE 0 END) AS blocked
             FROM project_workflow_stages s
             JOIN users u ON u.id = s.assigned_to
            WHERE s.project_id IN ${inClause} AND s.status <> 'COMPLETED'
            GROUP BY u.id ORDER BY open_stages DESC LIMIT 20`,
        ).all(...ids)
      : [];

    const bugs = ids.length
      ? db.prepare(
          `SELECT status, severity, COUNT(*) AS total FROM bugs
            WHERE project_id IN ${inClause} GROUP BY status, severity`,
        ).all(...ids)
      : [];

    const cycleTime = ids.length
      ? db.prepare(
          `SELECT s.name,
                  ROUND(AVG(julianday(s.completion_date) - julianday(date(s.started_at))), 1) AS avg_days,
                  COUNT(*) AS samples
             FROM project_workflow_stages s
            WHERE s.project_id IN ${inClause}
              AND s.status = 'COMPLETED' AND s.started_at IS NOT NULL AND s.completion_date IS NOT NULL
              AND julianday(s.completion_date) >= julianday(date(s.started_at))
            GROUP BY s.name ORDER BY avg_days DESC`,
        ).all(...ids)
      : [];

    res.json({
      totals: {
        projects: projects.length,
        stages: stageBreakdown.reduce((n, r) => n + r.total, 0),
        overdue: overdue.length,
        openBugs: bugs.filter((b) => b.status !== 'CLOSED').reduce((n, b) => n + b.total, 0),
      },
      projectsByStatus: byStatus,
      stageBreakdown,
      overdueStages: overdue,
      workload,
      bugs,
      cycleTime,
      projects: withProgress.map((p) => ({
        id: p.id, code: p.code, name: p.name, clientName: p.clientName,
        brdNumber: p.brdNumber, targetEndDate: p.targetEndDate, progress: p.progress,
      })),
    });
  }),
);

export default router;
