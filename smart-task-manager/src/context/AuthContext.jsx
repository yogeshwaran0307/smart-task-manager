import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authAPI } from '../api/auth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchProfile = useCallback(async () => {
    const token = localStorage.getItem('auth_token');
    if (!token) { setLoading(false); return; }
    try {
      const res = await authAPI.getProfile();
      setUser(res.data);
    } catch {
      setUser(null);
      localStorage.removeItem('auth_token');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  const login = async (username, password) => {
    setError(null);
    try {
      const res = await authAPI.login(username, password);
      const { token, user: userData } = res.data;
      if (token) localStorage.setItem('auth_token', token);
      setUser(userData);
      return true;
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        err.response?.data?.detail ||
        err.response?.data?.non_field_errors?.[0] ||
        'Login failed. Check your credentials.';
      setError(msg);
      return false;
    }
  };

  const logout = async () => {
    try { await authAPI.logout(); } catch {}
    localStorage.removeItem('auth_token');
    setUser(null);
  };

  const updateUser = (data) => setUser(prev => ({ ...prev, ...data }));

  const role = user?.role?.toLowerCase();
  const perms = user?.permissions || [];
  const hasPerm = (p) => perms.includes(p);

  const isAdmin         = role === 'admin' || user?.is_superuser;
  const isManager       = isAdmin || role === 'manager';
  const isHOD           = role === 'head_of_department';
  const isSenior        = role === 'senior';
  const isJunior        = role === 'junior';
  const isEmployee      = role === 'employee';
  const isManagerOrAbove = isManager;
  const isHODOrAbove    = isManager || isHOD;

  // Creation: Junior and Employee CAN create if they have create_projects permission
  const canCreate       = isAdmin || isManager || isHOD || isSenior || hasPerm('create_projects');
  const canCreateProjects = isAdmin || isManager || isHOD || hasPerm('create_projects');
  const canCreateTasks  = isAdmin || isManager || isHOD || isSenior || hasPerm('create_projects');

  // Approval: Admin and Manager auto-approve; others need approval
  const needsApproval   = !isAdmin && !isManager;

  // Approving: Admin, Manager, HOD, or users with approve_tasks permission
  const canApprove      = isAdmin || isManager || isHOD || hasPerm('approve_tasks');

  // Activity log / Analytics
  const canViewActivity = isAdmin || isManager || hasPerm('view_analytics') || hasPerm('view_activity_log');
  // Analytics is available to ALL users — scoped by role on the backend
  const canViewAnalytics = !!user;

  // Files
  const canViewFiles    = isAdmin || isManager || isHOD || isSenior;
  const canUploadFiles  = true;

  // Admin panel — also allow users whose custom role grants view_all_users
  const canManageUsers  = isAdmin || isManager || hasPerm('view_all_users') || hasPerm('manage_users');
  const canManageDepartments = isAdmin || hasPerm('manage_departments');
  const canPurgeItems   = isAdmin || hasPerm('purge_items');

  // Extra permission helpers
  const canViewAllProjects  = isAdmin || isManager || hasPerm('view_all_projects');
  const canManageMembers    = isAdmin || isManager || hasPerm('manage_members');
  const canManageRecycleBin = isAdmin || isManager || hasPerm('manage_recycle_bin');
  const canViewAllUsers     = isAdmin || isManager || hasPerm('view_all_users');
  const canExportData       = isAdmin || isManager || hasPerm('export_data');
  const canManageRoles      = isAdmin || hasPerm('manage_roles');

  const hasPermission = (permission) => {
    if (isAdmin) return true;
    if (!user?.permissions) return false;
    return user.permissions.includes(permission);
  };

  return (
    <AuthContext.Provider value={{
      user, loading, error, setError,
      login, logout, updateUser, fetchProfile,
      role,
      isAdmin, isManager, isHOD, isSenior, isJunior, isEmployee,
      isManagerOrAbove, isHODOrAbove,
      canCreate, canCreateProjects, canCreateTasks,
      needsApproval, canApprove,
      canViewActivity, canViewAnalytics, canViewFiles, canUploadFiles,
      canManageUsers, canManageDepartments,
      canPurgeItems,
      canViewAllProjects, canManageMembers, canManageRecycleBin,
      canViewAllUsers, canExportData, canManageRoles,
      hasPermission,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
