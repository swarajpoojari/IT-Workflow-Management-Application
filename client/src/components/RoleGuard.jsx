import { Navigate, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { selectIsAuthenticated, selectBootstrapped } from '../features/auth/authSlice.js';
import { usePermissionChecker } from '../hooks/usePermission.js';

export function RoleGuard({ require: required, children, fallback = '/' }) {
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const bootstrapped = useSelector(selectBootstrapped);
  const can = usePermissionChecker();
  const location = useLocation();

  if (!bootstrapped) return <div className="page-loading">Restoring session…</div>;

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (required && !can(required[0], required[1])) {
    return <Navigate to={fallback} replace />;
  }

  return children;
}

export function ProtectedRoute({ children }) {
  return <RoleGuard>{children}</RoleGuard>;
}

// Element-level guard, for hiding a single control rather than a page.
export function Can({ module, action, children, otherwise = null }) {
  const can = usePermissionChecker();
  return can(module, action) ? children : otherwise;
}
