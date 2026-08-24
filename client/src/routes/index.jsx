import { Routes, Route, Navigate } from 'react-router-dom';
import { useSelector } from 'react-redux';

import { Layout } from '../components/Layout.jsx';
import { RoleGuard, ProtectedRoute } from '../components/RoleGuard.jsx';
import { selectUser } from '../features/auth/authSlice.js';

import { LoginPage } from '../pages/LoginPage.jsx';
import { PublicTrackPage } from '../pages/PublicTrackPage.jsx';
import { DashboardPage } from '../pages/DashboardPage.jsx';
import { ProjectsPage } from '../pages/ProjectsPage.jsx';
import { CreateProjectPage } from '../pages/CreateProjectPage.jsx';
import { ProjectDetailPage } from '../pages/ProjectDetailPage.jsx';
import { ClientViewPage } from '../pages/ClientViewPage.jsx';
import { ReportsPage } from '../pages/ReportsPage.jsx';
import { SettingsPage } from '../pages/SettingsPage.jsx';
import { RolePreviewPage } from '../pages/RolePreviewPage.jsx';
import { SopBuilderPage } from '../pages/SopBuilderPage.jsx';
import { UserManagementPage } from '../pages/UserManagementPage.jsx';
import { AuditLogPage } from '../pages/AuditLogPage.jsx';
import { MyWorkPage } from '../pages/MyWorkPage.jsx';

function ProjectDetailRoute() {
  const user = useSelector(selectUser);
  return user?.role?.isClientScope ? <ClientViewPage /> : <ProjectDetailPage />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      {/* No login required: clients track a project by BRD number. */}
      <Route path="/track" element={<PublicTrackPage />} />

      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<DashboardPage />} />

        <Route
          path="projects"
          element={<RoleGuard require={['projects', 'read']}><ProjectsPage /></RoleGuard>}
        />
        <Route
          path="projects/new"
          element={<RoleGuard require={['projects', 'create']}><CreateProjectPage /></RoleGuard>}
        />
        <Route
          path="projects/:id"
          element={<RoleGuard require={['projects', 'read']}><ProjectDetailRoute /></RoleGuard>}
        />

        <Route
          path="reports"
          element={<RoleGuard require={['reports', 'read']}><ReportsPage /></RoleGuard>}
        />
        <Route path="settings" element={<SettingsPage />} />
        <Route
          path="roles"
          element={<RoleGuard require={['roles', 'read']}><RolePreviewPage /></RoleGuard>}
        />
        <Route
          path="my-work"
          element={<RoleGuard require={['stages', 'update_status']}><MyWorkPage /></RoleGuard>}
        />
        <Route
          path="sop"
          element={<RoleGuard require={['sop', 'update']}><SopBuilderPage /></RoleGuard>}
        />
        <Route
          path="users"
          element={<RoleGuard require={['users', 'read']}><UserManagementPage /></RoleGuard>}
        />
        <Route
          path="audit"
          element={<RoleGuard require={['audit', 'read']}><AuditLogPage /></RoleGuard>}
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
