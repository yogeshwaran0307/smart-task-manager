import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import SsoCallback from './components/auth/SsoCallback';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppProvider } from './context/AppContext';
import Layout from './components/common/Layout';
import LoginPage from './components/auth/LoginPage';
import Dashboard from './components/dashboard/Dashboard';
import Analytics from './components/dashboard/Analytics';
import ProjectList from './components/projects/ProjectList';
import ProjectForm from './components/projects/ProjectForm';
import ProjectDetail from './components/projects/ProjectDetail';
import KanbanBoard from './components/projects/KanbanBoard';
import KanbanPicker from './components/projects/KanbanPicker';
import RecycleBin from './components/projects/RecycleBin';
import TaskForm from './components/tasks/TaskForm';
import TaskDetail from './components/tasks/TaskDetail';
import MyTasks from './components/tasks/MyTasks';
import DepartmentTasks from './components/tasks/DepartmentTasks';
import { ActivityLog } from './components/activity/ActivityLog';
import ApprovalsPage from './components/approvals/ApprovalsPage';
import Messaging from './components/messages/Messaging';
import UserManagement from './components/admin/UserManagement';
import TeamWorkload from './components/dashboard/TeamWorkload';
import DepartmentManagement from './components/admin/DepartmentManagement';
import RoleManagement from './components/admin/RoleManagement';
import { ProfilePage, SettingsPage } from './components/auth/Profile';
import Timesheet from './components/timesheet/Timesheet';


function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="animate-spin rounded-full w-8 h-8 border-2 border-slate-600 border-t-indigo-500" />
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function RequireManagerOrHOD({ children }) {
  const { user, loading, isAdmin, isManager, isHOD, canViewActivity, canViewAllUsers } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin && !isManager && !isHOD && !canViewActivity && !canViewAllUsers) return <Navigate to="/dashboard" replace />;
  return children;
}

function RequireAdmin({ children }) {
  const { user, loading, isAdmin } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return children;
}

function RequireDepartmentAccess({ children }) {
  const { user, loading, isAdmin, canManageDepartments } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin && !canManageDepartments) return <Navigate to="/dashboard" replace />;
  return children;
}

function RequireRoleAccess({ children }) {
  const { user, loading, isAdmin, canManageRoles } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin && !canManageRoles) return <Navigate to="/dashboard" replace />;
  return children;
}

function RequireManagerAccess({ children }) {
  const { user, loading, canManageUsers } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!canManageUsers) return <Navigate to="/dashboard" replace />;
  return children;
}

function RequireActivityAccess({ children }) {
  const { user, loading, canViewActivity } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!canViewActivity) return <Navigate to="/dashboard" replace />;
  return children;
}

function RequireCanCreate({ children }) {
  const { user, loading, canCreate } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!canCreate) return <Navigate to="/dashboard" replace />;
  return children;
}

function RequireCanApprove({ children }) {
  const { user, loading, canApprove } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!canApprove) return <Navigate to="/dashboard" replace />;
  return children;
}

function RequireRecycleBinAccess({ children }) {
  const { user, loading, canManageRecycleBin } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!canManageRecycleBin) return <Navigate to="/dashboard" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/sso/callback" element={<SsoCallback />} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />

      <Route path="/dashboard" element={<RequireAuth><Layout><Dashboard /></Layout></RequireAuth>} />
      <Route path="/analytics" element={<RequireAuth><Layout><Analytics /></Layout></RequireAuth>} />

      <Route path="/projects" element={<RequireAuth><Layout><ProjectList /></Layout></RequireAuth>} />
      <Route path="/projects/create" element={<RequireCanCreate><Layout><ProjectForm /></Layout></RequireCanCreate>} />
      <Route path="/projects/:id" element={<RequireAuth><Layout><ProjectDetail /></Layout></RequireAuth>} />
      <Route path="/projects/:id/edit" element={<RequireAuth><Layout><ProjectForm /></Layout></RequireAuth>} />

      <Route path="/kanban" element={<RequireAuth><Layout><KanbanPicker /></Layout></RequireAuth>} />
      <Route path="/kanban/:id" element={<RequireAuth><Layout><KanbanBoard /></Layout></RequireAuth>} />
      

      <Route path="/recycle-bin" element={<RequireRecycleBinAccess><Layout><RecycleBin /></Layout></RequireRecycleBinAccess>} />

      <Route path="/tasks" element={<RequireAuth><Layout><MyTasks /></Layout></RequireAuth>} />
      <Route path="/my-tasks" element={<RequireAuth><Layout><MyTasks /></Layout></RequireAuth>} />
      <Route path="/department-tasks" element={<RequireCanApprove><Layout><DepartmentTasks /></Layout></RequireCanApprove>} />
      <Route path="/tasks/create" element={<RequireCanCreate><Layout><TaskForm /></Layout></RequireCanCreate>} />
      <Route path="/tasks/create/:projectId" element={<RequireCanCreate><Layout><TaskForm /></Layout></RequireCanCreate>} />
      <Route path="/tasks/:id/edit" element={<RequireAuth><Layout><TaskForm /></Layout></RequireAuth>} />
      <Route path="/tasks/:id" element={<RequireAuth><Layout><TaskDetail /></Layout></RequireAuth>} />

      <Route path="/approvals" element={<RequireCanApprove><Layout><ApprovalsPage /></Layout></RequireCanApprove>} />
      <Route path="/activity" element={<RequireActivityAccess><Layout><ActivityLog /></Layout></RequireActivityAccess>} />
      <Route path="/messages" element={<RequireAuth><Layout><Messaging /></Layout></RequireAuth>} />

      <Route path="/admin/users" element={<RequireManagerAccess><Layout><UserManagement /></Layout></RequireManagerAccess>} />
      <Route path="/team-workload" element={<RequireManagerOrHOD><Layout><TeamWorkload /></Layout></RequireManagerOrHOD>} />
      <Route path="/admin/departments" element={<RequireDepartmentAccess><Layout><DepartmentManagement /></Layout></RequireDepartmentAccess>} />
      <Route path="/admin/roles" element={<RequireRoleAccess><Layout><RoleManagement /></Layout></RequireRoleAccess>} />

      <Route path="/profile" element={<RequireAuth><Layout><ProfilePage /></Layout></RequireAuth>} />
      <Route path="/settings" element={<RequireAuth><Layout><SettingsPage /></Layout></RequireAuth>} />

      <Route path="/timesheet" element={<RequireAuth><Layout><Timesheet /></Layout></RequireAuth>} />
      
      <Route path="*" element={<Navigate to="/dashboard" replace />} /> 
      
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppProvider>
          <AppRoutes />
        </AppProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
