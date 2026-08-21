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
import { ROLES, SOP_VERSION_STATUS, STAGE_STATUS, AUDIT_ENTITY, AUDIT_ACTION } from '../config/constants.js';

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
    expectedDurationDays: 3,
    defaultOwnerTeam: 'Applications',
  },
];

function seedSop(users) {
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

    SOP_STAGES.forEach((stage, index) =>
      sopStageModel.create({ ...stage, sopVersionId: draft.id, sequence: index + 1 }),
    );

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
      startDate: '2026-07-01',
      targetEndDate: '2026-12-15',
    },
    {
      code: 'ACM-SEC-2026',
      name: 'Acme Security Hardening',
      description: 'Zero-trust rollout and endpoint hardening for Acme Corp.',
      clientName: 'Acme Corp',
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
    { index: 0, status: STAGE_STATUS.COMPLETED,  completionDate: '2026-07-12', remarks: 'Scope signed off by the client steering group.' },
    { index: 1, status: STAGE_STATUS.IN_PROGRESS, remarks: 'Threat model drafted; pen-test window booked.' },
    { index: 2, status: STAGE_STATUS.BLOCKED,     blocker: 'Awaiting firewall change approval from NetOps (CHG-4471).' },
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
        startedAt: new Date().toISOString(),
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

// Idempotent, so npm run dev can seed on every start.
export function seed() {
  migrate({ silent: true });

  log('\n🌱 Seeding IT Workflow database…');
  const roles = seedRbac();
  const users = seedUsers(roles);
  const sop = seedSop(users);
  seedProjects(users, sop);

  const db = getDb();
  const count = (table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;

  log('\n  ┌─────────────────────────────────────────────────────────┐');
  log('  │  Sign in at http://localhost:5173                       │');
  log('  ├─────────────────────────────────────────────────────────┤');
  log('  │  Super Admin   superadmin@itwf.dev                      │');
  log('  │  Admin         admin@itwf.dev                           │');
  log('  │  IT Member     itmember@itwf.dev                        │');
  log('  │  IT Member 2   itmember2@itwf.dev                       │');
  log('  │  Client / Ops  client@itwf.dev                          │');
  log(`  │  Password      ${env.SEED_PASSWORD.padEnd(41)}│`);
  log('  └─────────────────────────────────────────────────────────┘');
  log(`\n  rows: users=${count('users')} sop_stages=${count('sop_stages')} projects=${count('projects')} workflow_stages=${count('project_workflow_stages')} audit=${count('audit_logs')}\n`);
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (invokedDirectly) {
  seed();
  closeDb();
}
