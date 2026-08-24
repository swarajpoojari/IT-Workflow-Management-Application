import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../../db/index.js';
import { authenticate } from '../../middleware/authenticate.js';
import { resolveScope, can } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { projectModel } from '../../models/project.model.js';
import { MODULES, ACTIONS } from '../../config/constants.js';

const router = Router();
router.use(authenticate);

// Each bucket is gated by its own permission; projects reuse the list scope.
router.get(
  '/',
  validate({ query: z.object({ q: z.string().trim().min(2).max(80) }) }),
  asyncHandler((req, res) => {
    const db = getDb();
    const term = `%${req.query.q}%`;
    const user = req.user;
    const results = { projects: [], stages: [], users: [], sop: [], bugs: [] };

    if (can(user, MODULES.PROJECTS, ACTIONS.READ)) {
      const { items } = projectModel.list({ scope: resolveScope(user), search: req.query.q, limit: 8, offset: 0 });
      results.projects = items.map((p) => ({
        id: p.id, code: p.code, name: p.name, clientName: p.clientName, brdNumber: p.brdNumber,
      }));

      const visibleIds = items.map((p) => p.id);
      if (visibleIds.length) {
        const inClause = `(${visibleIds.map(() => '?').join(',')})`;
        const clientClause = user.isClientScope ? ' AND s.client_visible = 1' : '';
        results.stages = db
          .prepare(
            `SELECT s.id, s.name, s.status, s.project_id, p.code AS project_code
               FROM project_workflow_stages s JOIN projects p ON p.id = s.project_id
              WHERE s.project_id IN ${inClause} AND s.name LIKE ?${clientClause}
              ORDER BY p.code, s.sequence LIMIT 8`,
          )
          .all(...visibleIds, term);
      }
    }

    if (can(user, MODULES.USERS, ACTIONS.READ)) {
      results.users = db
        .prepare(
          `SELECT u.id, u.full_name, u.email, u.is_active, r.name AS role_name
             FROM users u JOIN roles r ON r.id = u.role_id
            WHERE u.full_name LIKE ? OR u.email LIKE ? ORDER BY u.full_name LIMIT 6`,
        )
        .all(term, term);
    }

    if (can(user, MODULES.SOP, ACTIONS.READ)) {
      results.sop = db
        .prepare('SELECT id, name, category FROM sop_templates WHERE name LIKE ? AND is_active = 1 LIMIT 6')
        .all(term);
    }

    if (can(user, MODULES.BUGS, ACTIONS.READ)) {
      const { items } = projectModel.list({ scope: resolveScope(user), limit: 500, offset: 0 });
      const ids = items.map((p) => p.id);
      if (ids.length) {
        const inClause = `(${ids.map(() => '?').join(',')})`;
        results.bugs = db
          .prepare(
            `SELECT b.id, b.reference, b.title, b.status, b.project_id, b.project_stage_id
               FROM bugs b WHERE b.project_id IN ${inClause} AND (b.title LIKE ? OR b.reference LIKE ?)
              ORDER BY b.created_at DESC LIMIT 6`,
          )
          .all(...ids, term, term);
      }
    }

    const count = Object.values(results).reduce((n, list) => n + list.length, 0);
    res.json({ query: req.query.q, count, results });
  }),
);

export default router;
