import { useSelector } from 'react-redux';
import { selectPermissions } from '../features/auth/authSlice.js';

// A render hint. Every action it guards is re-checked server-side.
export function usePermission(module, action) {
  const permissions = useSelector(selectPermissions);
  return permissions.some((p) => p.module === module && p.action === action);
}

export function useAnyPermission(...tuples) {
  const permissions = useSelector(selectPermissions);
  return tuples.some(([module, action]) =>
    permissions.some((p) => p.module === module && p.action === action),
  );
}

export function usePermissionChecker() {
  const permissions = useSelector(selectPermissions);
  return (module, action) => permissions.some((p) => p.module === module && p.action === action);
}
