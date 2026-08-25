#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getDb, transaction, closeDb } from './index.js';
import { migrate } from './migrate.js';
import { PERMISSION_CATALOG, ROLE_MATRIX } from './permissions.catalog.js';
import { env } from '../config/env.js';
import { hashPasswordSync } from '../utils/password.js';
import { roleModel, permissionModel } from '../models/role.model.js';
import { userModel } from '../models/user.model.js';
import { sopTemplateModel, sopVersionModel, sopStageModel } from '../models/sop.model.js';
import { projectModel } from '../models/project.model.js';
import { stageModel, statusHistoryModel, documentModel } from '../models/stage.model.js';
import { auditModel } from '../models/audit.model.js';
import { stagePermissionModel } from '../models/stagePermission.model.js';
import { bugModel, bugEventModel } from '../models/bug.model.js';
import { signoffModel } from '../models/signoff.model.js';
import { systemSettingsModel } from '../models/settings.model.js';
import {
  ROLES, SOP_VERSION_STATUS, STAGE_STATUS, STAGE_TYPE, STAGE_ACTIONS,
  BUG_STATUS, SIGNOFF_DECISION, AUDIT_ENTITY, AUDIT_ACTION,
} from '../config/constants.js';

const log = (...args) => console.log(...args);

function seedRbac() {
  const permissionIds = new Map();

  for (const [module, action, description] of PERMISSION_CATALOG) {
    const permission = permissionModel.upsert({ module, action, description });
    permissionIds.set(`${module}:${action}`, permission.id);
  }

  const roles = {};
  for (const [key, spec] of Object.entries(ROLE_MATRIX)) {
    let role = roleModel.findByKey(key);
    if (!role) {
      role = roleModel.create({
        key,
        name: spec.name,
        description: spec.description,
        isClientScope: spec.isClientScope,
        isSystem: true,
      });
    }

    const tuples =
      spec.permissions === 'ALL'
        ? PERMISSION_CATALOG.map(([module, action]) => [module, action])
        : spec.permissions;

    roleModel.setPermissions(role.id, tuples.map(([m, a]) => permissionIds.get(`${m}:${a}`)).filter(Boolean));

    roles[key] = role;
  }

  log(`  ✓ ${permissionIds.size} permissions · ${Object.keys(roles).length} roles wired`);
  return roles;
}

function seedUsers(roles) {
  const passwordHash = hashPasswordSync(env.SEED_PASSWORD);

  const definitions = [
    { email: 'superadmin@itwf.dev', fullName: 'Sasha Rao',      roleKey: ROLES.SUPER_ADMIN, team: 'IT Governance' },
    { email: 'admin@itwf.dev',      fullName: 'Arjun Mehta',    roleKey: ROLES.ADMIN,       team: 'PMO' },
    { email: 'itmember@itwf.dev',   fullName: 'Ivy Chen',       roleKey: ROLES.IT_MEMBER,   team: 'Infrastructure' },
    { email: 'client@itwf.dev',     fullName: 'Chris Okafor',   roleKey: ROLES.CLIENT,      team: null,
      clientName: 'Northwind Logistics' },
    { email: 'itmember2@itwf.dev',  fullName: 'Marco Bianchi',  roleKey: ROLES.IT_MEMBER,   team: 'Applications' },
    { email: 'qa@itwf.dev',         fullName: 'Priya Nair',     roleKey: ROLES.IT_MEMBER,   team: 'Quality Assurance' },
  ];

  const users = {};
  for (const def of definitions) {
    const existing = userModel.findByEmail(def.email);
    users[def.email] = existing
      ? existing
      : userModel.create({
          email: def.email,
          passwordHash,
          fullName: def.fullName,
          roleId: roles[def.roleKey].id,
          team: def.team ?? null,
          clientName: def.clientName ?? null,
        });
  }

  log(`  ✓ ${definitions.length} users (password: ${env.SEED_PASSWORD})`);
  return users;
}

const SOP_STAGES = [
  {
    name: 'Requirement Gathering',
    description: 'Collect and sign off the scope with the client stakeholders.',
    clientVisible: true,
    requiresDocument: true,
    expectedDurationDays: 5,
    defaultOwnerTeam: 'PMO',
  },
  {
    name: 'Internal Security Review',
    description: 'Threat model, penetration-test scoping and internal risk sign-off.',
    clientVisible: false,
    requiresDocument: true,
    expectedDurationDays: 4,
    defaultOwnerTeam: 'IT Governance',
  },
  {
    name: 'Environment Provisioning',
    description: 'Stand up the infrastructure, networking and access controls.',
    clientVisible: true,
    requiresDocument: false,
    expectedDurationDays: 7,
    defaultOwnerTeam: 'Infrastructure',
  },
  {
    name: 'Vendor Cost Negotiation',
    description: 'Commercial negotiation and internal margin approval.',
    clientVisible: false,
    requiresDocument: true,
    expectedDurationDays: 6,
    defaultOwnerTeam: 'PMO',
  },
  {
    name: 'Go-Live & Handover',
    description: 'Cutover, smoke tests and handover of runbooks to operations.',
    clientVisible: true,
    requiresDocument: true,
    requiresSignoff: true,
    expectedDurationDays: 3,
    defaultOwnerTeam: 'Applications',
  },
];

const DELIVERY_SOP_STAGES = [
  {
    name: 'Solution Design',
    description: 'Technical design, integration contracts and estimation.',
    clientVisible: true, requiresDocument: true, requiresSignoff: true,
    stageType: STAGE_TYPE.GENERIC, expectedDurationDays: 6, defaultOwnerTeam: 'Architecture',
  },
  {
    name: 'Internal Risk & Compliance',
    description: 'Data-protection review and internal compliance approval.',
    clientVisible: false, requiresDocument: true,
    stageType: STAGE_TYPE.GENERIC, expectedDurationDays: 3, defaultOwnerTeam: 'IT Governance',
  },
  {
    name: 'Development',
    description: 'Build the solution against the signed-off design.',
    clientVisible: true, requiresDocument: false,
    stageType: STAGE_TYPE.DEVELOPMENT, expectedDurationDays: 20, defaultOwnerTeam: 'Applications',
  },
  {
    name: 'System Testing',
    description: 'QA test cycles and defect resolution.',
    clientVisible: true, requiresDocument: true, requiresSignoff: true,
    stageType: STAGE_TYPE.TESTING, expectedDurationDays: 10, defaultOwnerTeam: 'Quality Assurance',
  },
  {
    name: 'Commercial Reconciliation',
    description: 'Change-request costing and internal margin sign-off.',
    clientVisible: false, requiresDocument: true,
    stageType: STAGE_TYPE.GENERIC, expectedDurationDays: 4, defaultOwnerTeam: 'PMO',
  },
  {
    name: 'UAT & Go-Live',
    description: 'User acceptance testing, cutover and handover.',
    clientVisible: true, requiresDocument: true, requiresSignoff: true,
    stageType: STAGE_TYPE.UAT, expectedDurationDays: 8, defaultOwnerTeam: 'Applications',
  },
];

const A = STAGE_ACTIONS;
const EVERYDAY = [A.VIEW, A.UPDATE_STATUS, A.UPLOAD_EVIDENCE];
const STAGE_GRANTS = {
  'Requirement Gathering':      { ADMIN: [A.VIEW, A.SIGNOFF], IT_MEMBER: EVERYDAY },
  'Internal Security Review':   { ADMIN: [A.VIEW, A.SIGNOFF], IT_MEMBER: EVERYDAY },
  'Environment Provisioning':   { ADMIN: [A.VIEW],            IT_MEMBER: EVERYDAY },
  'Vendor Cost Negotiation':    { ADMIN: [A.VIEW, A.UPDATE_STATUS, A.SIGNOFF] },
  'Go-Live & Handover':         { ADMIN: [A.VIEW, A.SIGNOFF], IT_MEMBER: EVERYDAY },

  'Solution Design':            { ADMIN: [A.VIEW, A.SIGNOFF], IT_MEMBER: EVERYDAY },
  'Internal Risk & Compliance': { ADMIN: [A.VIEW, A.UPDATE_STATUS, A.SIGNOFF] },
  'Development':                { ADMIN: [A.VIEW],            IT_MEMBER: EVERYDAY },
  'System Testing': {
    ADMIN:     [A.VIEW, A.SIGNOFF, A.RAISE_BUG, A.CLOSE_BUG],
    IT_MEMBER: [...EVERYDAY, A.RAISE_BUG, A.RESOLVE_BUG, A.CLOSE_BUG],
  },
  'Commercial Reconciliation':  { ADMIN: [A.VIEW, A.UPDATE_STATUS, A.SIGNOFF] },
  'UAT & Go-Live':              { ADMIN: [A.VIEW, A.SIGNOFF], IT_MEMBER: EVERYDAY },
};

// Stages must start before they finish, or the cycle-time report goes negative.
const daysBefore = (isoDate, days) => {
  const d = new Date(`${isoDate}T09:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
};

function grantsFor(stageName, roles) {
  const grants = [];
  for (const [roleKey, actions] of Object.entries(STAGE_GRANTS[stageName] ?? {})) {
    for (const action of actions) grants.push({ roleId: roles[roleKey].id, action });
  }
  return grants;
}

function seedSop(users, roles) {
  const superAdmin = users['superadmin@itwf.dev'];
  const templateName = 'Standard IT Onboarding SOP';

  const existing = sopTemplateModel.list({ includeInactive: true }).find((t) => t.name === templateName);
  if (existing) {
    const published = sopVersionModel.findLatestPublished(existing.id);
    log('  ✓ SOP template already seeded');
    return { template: existing, publishedVersion: published };
  }

  return transaction(() => {
    const template = sopTemplateModel.create({
      name: templateName,
      description: 'The default end-to-end workflow for onboarding a new client IT engagement.',
      category: 'Onboarding',
      createdBy: superAdmin.id,
    });

    const draft = sopVersionModel.create({
      templateId: template.id,
      version: 1,
      status: SOP_VERSION_STATUS.DRAFT,
      changeNote: 'Initial published baseline.',
    });

    SOP_STAGES.forEach((stage, index) => {
      const created = sopStageModel.create({ ...stage, sopVersionId: draft.id, sequence: index + 1 });
      const grants = grantsFor(stage.name, roles);
      if (grants.length) stagePermissionModel.setForSopStage(created.id, grants);
    });

    const published = sopVersionModel.markPublished(draft.id, superAdmin.id);

    const nextDraft = sopVersionModel.create({
      templateId: template.id,
      version: 2,
      status: SOP_VERSION_STATUS.DRAFT,
    });
    sopStageModel.cloneInto(published.id, nextDraft.id);

    auditModel.append({
      actorId: superAdmin.id,
      actorEmail: superAdmin.email,
      actorRole: ROLES.SUPER_ADMIN,
      entityType: AUDIT_ENTITY.SOP_VERSION,
      entityId: published.id,
      action: AUDIT_ACTION.PUBLISH,
      summary: `SOP version 1 published (${SOP_STAGES.length} stages)`,
      newValue: { version: 1, stages: SOP_STAGES.map((s) => s.name) },
    });

    const visible = SOP_STAGES.filter((s) => s.clientVisible).length;
    log(`  ✓ SOP "${templateName}" v1 PUBLISHED — ${SOP_STAGES.length} stages (${visible} client-visible, ${SOP_STAGES.length - visible} hidden)`);
    log('  ✓ v2 DRAFT opened for further editing');

    return { template, publishedVersion: published };
  });
}

function seedProjects(users, { template, publishedVersion }) {
  const admin = users['admin@itwf.dev'];
  const itMember = users['itmember@itwf.dev'];
  const itMember2 = users['itmember2@itwf.dev'];

  const definitions = [
    {
      code: 'NWL-ERP-2026',
      name: 'Northwind ERP Rollout',
      description: 'Full ERP migration for Northwind Logistics across three regions.',
      clientName: 'Northwind Logistics',
      brdNumber: 'BRD-2026-0017',
      startDate: '2026-07-01',
      targetEndDate: '2026-12-15',
    },
    {
      code: 'ACM-SEC-2026',
      name: 'Acme Security Hardening',
      description: 'Zero-trust rollout and endpoint hardening for Acme Corp.',
      clientName: 'Acme Corp',
      brdNumber: 'BRD-2026-0031',
      startDate: '2026-08-01',
      targetEndDate: '2027-01-31',
    },
  ];

  const created = [];

  for (const def of definitions) {
    if (projectModel.findByCode(def.code)) continue;

    const project = transaction(() => {
      const row = projectModel.create({
        ...def,
        sopTemplateId: template.id,
        sopVersionId: publishedVersion.id,
        ownerId: itMember.id,
        createdBy: admin.id,
      });

      const generated = stageModel.generateFromSopVersion(row.id, publishedVersion.id);
      projectModel.addMember(row.id, itMember.id, 'OWNER');
      projectModel.addMember(row.id, itMember2.id, 'MEMBER');

      auditModel.append({
        actorId: admin.id,
        actorEmail: admin.email,
        actorRole: ROLES.ADMIN,
        entityType: AUDIT_ENTITY.PROJECT,
        entityId: row.id,
        action: AUDIT_ACTION.CREATE,
        summary: `Project ${row.code} created from "${template.name}" v${publishedVersion.version} — ${generated} stages generated`,
        newValue: { code: row.code, sopVersionId: publishedVersion.id, stagesGenerated: generated },
      });

      return row;
    });

    created.push(project);
  }

  if (!created.length) {
    log('  ✓ Projects already seeded');
    return;
  }

  const [flagship] = created;
  const stages = stageModel.listByProject(flagship.id);

  const script = [
    { index: 0, status: STAGE_STATUS.COMPLETED,  completionDate: '2026-07-12', startedOn: '2026-07-02', remarks: 'Scope signed off by the client steering group.' },
    { index: 1, status: STAGE_STATUS.IN_PROGRESS, startedOn: '2026-07-13', remarks: 'Threat model drafted; pen-test window booked.' },
    { index: 2, status: STAGE_STATUS.BLOCKED,     startedOn: '2026-07-20', blocker: 'Awaiting firewall change approval from NetOps (CHG-4471).' },
  ];

  transaction(() => {
    for (const step of script) {
      const stage = stages[step.index];
      if (!stage) continue;

      stageModel.updateAssignment(stage.id, {
        assignedTo: step.index === 2 ? itMember2.id : itMember.id,
        dueDate: null,
        updatedBy: admin.id,
      });

      stageModel.applyStatusChange(stage.id, {
        status: step.status,
        blocker: step.blocker ?? null,
        holdReason: null,
        completionDate: step.completionDate ?? null,
        remarks: step.remarks ?? null,
        updatedBy: itMember.id,
        startedAt: `${step.startedOn}T09:00:00.000Z`,
      });

      statusHistoryModel.append({
        projectStageId: stage.id,
        fromStatus: STAGE_STATUS.NOT_STARTED,
        toStatus: step.status,
        remarks: step.remarks ?? null,
        blocker: step.blocker ?? null,
        completionDate: step.completionDate ?? null,
        changedBy: itMember.id,
      });

      auditModel.append({
        actorId: itMember.id,
        actorEmail: itMember.email,
        actorRole: ROLES.IT_MEMBER,
        entityType: AUDIT_ENTITY.PROJECT_STAGE,
        entityId: stage.id,
        action: AUDIT_ACTION.STATUS_CHANGE,
        summary: `${flagship.code} · "${stage.name}": NOT_STARTED → ${step.status}`,
        oldValue: { status: STAGE_STATUS.NOT_STARTED },
        newValue: { status: step.status },
      });
    }

    for (const stage of stages.slice(3)) {
      stageModel.updateAssignment(stage.id, { assignedTo: itMember.id, dueDate: null, updatedBy: admin.id });
    }

    documentModel.create({
      projectStageId: stages[0].id,
      fileName: 'Requirements-Signoff-v1.pdf',
      fileUrl: 'https://files.internal.example/nwl/requirements-signoff-v1.pdf',
      docType: 'FILE',
      version: 1,
      notes: 'Signed by the client steering group.',
      uploadedBy: itMember.id,
    });
  });

  log(`  ✓ ${created.length} projects seeded with auto-generated boards`);
}

function seedDelivery(users, roles) {
  const superAdmin = users['superadmin@itwf.dev'];
  const admin = users['admin@itwf.dev'];
  const qa = users['qa@itwf.dev'];
  const dev = users['itmember2@itwf.dev'];
  const templateName = 'Software Delivery SOP';

  const existingTemplate = sopTemplateModel.list({ includeInactive: true }).find((t) => t.name === templateName);
  if (existingTemplate) {
    log('  ✓ Delivery SOP already seeded');
    return;
  }

  const { template, published } = transaction(() => {
    const tpl = sopTemplateModel.create({
      name: templateName,
      description: 'Design, build, test and release workflow for software change requests.',
      category: 'Delivery',
      createdBy: superAdmin.id,
    });
    const draft = sopVersionModel.create({
      templateId: tpl.id, version: 1, status: SOP_VERSION_STATUS.DRAFT,
      changeNote: 'Initial delivery baseline.',
    });
    DELIVERY_SOP_STAGES.forEach((stage, index) => {
      const created = sopStageModel.create({ ...stage, sopVersionId: draft.id, sequence: index + 1 });
      const grants = grantsFor(stage.name, roles);
      if (grants.length) stagePermissionModel.setForSopStage(created.id, grants);
    });
    const pub = sopVersionModel.markPublished(draft.id, superAdmin.id);
    const next = sopVersionModel.create({ templateId: tpl.id, version: 2, status: SOP_VERSION_STATUS.DRAFT });
    sopStageModel.cloneInto(pub.id, next.id);
    return { template: tpl, published: pub };
  });

  const visible = DELIVERY_SOP_STAGES.filter((s) => s.clientVisible).length;
  log(`  ✓ SOP "${templateName}" v1 PUBLISHED — ${DELIVERY_SOP_STAGES.length} stages (${visible} client-visible, ${DELIVERY_SOP_STAGES.length - visible} hidden)`);

  const project = transaction(() => {
    const row = projectModel.create({
      code: 'NWL-PORTAL-2026',
      name: 'Northwind Customer Portal',
      description: 'Self-service portal for Northwind Logistics customers.',
      clientName: 'Northwind Logistics',
      brdNumber: 'BRD-2026-0042',
      sopTemplateId: template.id,
      sopVersionId: published.id,
      ownerId: dev.id,
      startDate: '2026-06-15',
      targetEndDate: '2026-11-30',
      createdBy: admin.id,
    });
    const generated = stageModel.generateFromSopVersion(row.id, published.id);
    stagePermissionModel.snapshotForProject(row.id);
    projectModel.addMember(row.id, dev.id, 'OWNER');
    projectModel.addMember(row.id, qa.id, 'MEMBER');
    auditModel.append({
      actorId: admin.id, actorEmail: admin.email, actorRole: ROLES.ADMIN,
      entityType: AUDIT_ENTITY.PROJECT, entityId: row.id, action: AUDIT_ACTION.CREATE,
      summary: `Project ${row.code} created from "${templateName}" v1 — ${generated} stages generated`,
      newValue: { code: row.code, brdNumber: row.brdNumber, stagesGenerated: generated },
    });
    return row;
  });

  const stages = stageModel.listByProject(project.id);
  const testing = stages.find((s) => s.stageType === STAGE_TYPE.TESTING);

  transaction(() => {
    for (const [index, status, extra] of [
      [0, STAGE_STATUS.COMPLETED, { completionDate: '2026-07-04', ranForDays: 6 }],
      [1, STAGE_STATUS.COMPLETED, { completionDate: '2026-07-10', ranForDays: 4 }],
      [2, STAGE_STATUS.COMPLETED, { completionDate: '2026-09-19', ranForDays: 21 }],
    ]) {
      const stage = stages[index];
      stageModel.updateAssignment(stage.id, { assignedTo: dev.id, dueDate: null, updatedBy: admin.id });
      if (stage.requiresSignoff) {
        signoffModel.create({
          projectStageId: stage.id, decision: SIGNOFF_DECISION.APPROVED,
          note: 'Reviewed and approved.', signedBy: admin.id, signedRole: ROLES.ADMIN,
        });
      }
      stageModel.applyStatusChange(stage.id, {
        status, blocker: null, holdReason: null, completionDate: extra.completionDate,
        remarks: null, updatedBy: dev.id,
        startedAt: daysBefore(extra.completionDate, extra.ranForDays),
      });
      statusHistoryModel.append({
        projectStageId: stage.id, fromStatus: STAGE_STATUS.NOT_STARTED, toStatus: status,
        completionDate: extra.completionDate, changedBy: dev.id,
      });
    }

    stageModel.updateAssignment(testing.id, { assignedTo: qa.id, dueDate: null, updatedBy: admin.id });
    stageModel.applyStatusChange(testing.id, {
      status: STAGE_STATUS.IN_PROGRESS, blocker: null, holdReason: null, completionDate: null,
      remarks: 'Cycle 1 execution underway.', updatedBy: qa.id, startedAt: '2026-09-20T09:00:00.000Z',
    });
    statusHistoryModel.append({
      projectStageId: testing.id, fromStatus: STAGE_STATUS.NOT_STARTED,
      toStatus: STAGE_STATUS.IN_PROGRESS, changedBy: qa.id,
    });

    for (const spec of [
      { title: 'Invoice PDF renders totals without tax', severity: 'HIGH', status: BUG_STATUS.OPEN,
        description: 'Line totals exclude VAT on the downloadable invoice.' },
      { title: 'Session drops after password reset', severity: 'CRITICAL', status: BUG_STATUS.FIXED,
        description: 'User is logged out and cannot sign back in for ~30s.' },
      { title: 'Sort order ignored on shipment list', severity: 'LOW', status: BUG_STATUS.CLOSED,
        description: 'Column sort resets when paginating.' },
    ]) {
      const bug = bugModel.create({
        projectId: project.id, projectStageId: testing.id,
        reference: bugModel.nextReference(project.id),
        title: spec.title, description: spec.description, severity: spec.severity,
        raisedBy: qa.id, assignedTo: dev.id,
      });
      bugEventModel.append({ bugId: bug.id, fromStatus: null, toStatus: BUG_STATUS.OPEN, actorId: qa.id });
      if (spec.status !== BUG_STATUS.OPEN) {
        bugModel.applyTransition(bug.id, {
          status: spec.status,
          resolutionNote: spec.status === BUG_STATUS.CLOSED ? 'Verified in cycle 1.' : 'Patch deployed to QA.',
        });
        bugEventModel.append({
          bugId: bug.id, fromStatus: BUG_STATUS.OPEN, toStatus: spec.status,
          note: spec.status === BUG_STATUS.CLOSED ? 'Verified in cycle 1.' : 'Patch deployed to QA.',
          actorId: spec.status === BUG_STATUS.CLOSED ? qa.id : dev.id,
        });
      }
      auditModel.append({
        actorId: qa.id, actorEmail: qa.email, actorRole: ROLES.IT_MEMBER,
        entityType: AUDIT_ENTITY.BUG, entityId: bug.id, action: AUDIT_ACTION.BUG_RAISED,
        summary: `${project.code} - ${bug.reference} raised against "${testing.name}": ${bug.title}`,
      });
    }

    for (const stage of stages.slice(4)) {
      stageModel.updateAssignment(stage.id, { assignedTo: dev.id, dueDate: null, updatedBy: admin.id });
    }
  });

  const open = bugModel.openCountForStage(testing.id);
  log(`  ✓ Project ${project.code} (BRD-2026-0042) — Testing stage blocked by ${open} open bug${open === 1 ? '' : 's'}`);
}

export function seed() {
  migrate({ silent: true });

  log('\n🌱 Seeding IT Workflow database…');
  const roles = seedRbac();
  const users = seedUsers(roles);
  const sop = seedSop(users, roles);
  seedProjects(users, sop);
  seedDelivery(users, roles);
  systemSettingsModel.set('app.name', 'IT Workflow Management', users['superadmin@itwf.dev'].id);
  systemSettingsModel.set('app.defaultStageSlaDays', '5', users['superadmin@itwf.dev'].id);

  const db = getDb();
  const count = (table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;

  log('\n  ┌─────────────────────────────────────────────────────────┐');
  log('  │  Sign in at http://localhost:5173                       │');
  log('  ├─────────────────────────────────────────────────────────┤');
  log('  │  Super Admin   superadmin@itwf.dev                      │');
  log('  │  Admin         admin@itwf.dev                           │');
  log('  │  IT Member     itmember@itwf.dev                        │');
  log('  │  IT Member 2   itmember2@itwf.dev                       │');
  log('  │  QA            qa@itwf.dev                              │');
  log('  │  Client / Ops  client@itwf.dev                          │');
  log(`  │  Password      ${env.SEED_PASSWORD.padEnd(41)}│`);
  log('  └─────────────────────────────────────────────────────────┘');
  log('  Public tracking (no login): BRD-2026-0017 · BRD-2026-0031 · BRD-2026-0042');
  log(`\n  rows: users=${count('users')} sop_stages=${count('sop_stages')} projects=${count('projects')} workflow_stages=${count('project_workflow_stages')} audit=${count('audit_logs')}\n`);
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (invokedDirectly) {
  seed();
  closeDb();
}
