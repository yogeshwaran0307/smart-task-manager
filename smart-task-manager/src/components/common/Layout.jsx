import { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { notificationsAPI } from '../../api/notifications';
import {
  FiGrid, FiFolder, FiCheckSquare, FiUsers, FiActivity,
  FiMessageSquare, FiSettings, FiLogOut, FiMenu, FiX,
  FiTrash2, FiBarChart2, FiShield, FiBell, FiSearch,
  FiChevronDown, FiUser, FiLayers, FiInbox, FiThumbsUp, FiTrendingUp,
} from 'react-icons/fi';

function NavLink({ to, icon: Icon, label, end }) {
  const location = useLocation();
  const isActive = end ? location.pathname === to : location.pathname.startsWith(to);
  return (
    <Link to={to} className={`sidebar-link ${isActive ? 'active' : ''}`}>
      <Icon size={17} />
      <span>{label}</span>
    </Link>
  );
}

function NotificationBell() {
  const [notifs, setNotifs] = useState([]);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const load = () => {
    notificationsAPI.list().then(r => setNotifs(r.data || [])).catch(() => {});
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const unread = notifs.filter(n => !n.read).length;

  const markAllRead = async () => {
    await notificationsAPI.markAllRead().catch(() => {});
    setNotifs(prev => prev.map(n => ({ ...n, read: true })));
  };

  const markRead = async (n) => {
    if (!n.read) {
      await notificationsAPI.markRead(n.id).catch(() => {});
      setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
    }
  };

  const typeIcon = { task: '📋', project: '📁', approval: '✅', info: '💬', reminder: '⏰' };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => { setOpen(o => !o); if (!open) load(); }}
        className="relative p-2 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
      >
        <FiBell size={18} />
        {unread > 0 && (
          <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center font-bold">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="fixed right-4 top-14 mt-1 w-80 max-w-[calc(100vw-2rem)] bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl z-[200]">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
            <span className="font-semibold text-white text-sm">Notifications</span>
            {unread > 0 && (
              <button onClick={markAllRead} className="text-xs text-indigo-400 hover:text-indigo-300">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-64 overflow-y-auto">
            {notifs.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-sm">No notifications</div>
            ) : (
              notifs.map(n => (
                <div
                  key={n.id}
                  onClick={() => markRead(n)}
                  className={`px-4 py-3 border-b border-slate-700/50 cursor-pointer hover:bg-slate-700/40 transition-colors ${!n.read ? 'bg-indigo-900/10' : ''}`}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-sm mt-0.5">{typeIcon[n.type] || '💬'}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs leading-relaxed ${n.read ? 'text-slate-400' : 'text-white'}`}>
                        {n.message}
                      </p>
                    </div>
                    {!n.read && <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0 mt-1" />}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Layout({ children }) {
  const { user, logout, isAdmin, isManager, isHOD, canViewActivity, canViewAnalytics, canApprove, canCreate, canManageUsers, canManageRecycleBin, canViewAllProjects, canManageDepartments, canManageRoles } = useAuth();
  const { addToast, confirm } = useApp();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  const handleLogout = async () => {
    const ok = await confirm({ title: 'Sign Out', message: 'Are you sure you want to sign out?', confirmText: 'Sign Out', danger: false });
    if (ok) { await logout(); navigate('/login'); }
  };

  const initials = user
    ? (user.first_name?.[0] || user.name?.[0] || user.username?.[0] || '?').toUpperCase()
    : '?';

  const systemRoleLabel = {
    admin: 'Administrator', manager: 'Manager', head_of_department: 'Head of Dept.',
    senior: 'Senior', junior: 'Junior', employee: 'Employee',
  };
  const roleLabel = systemRoleLabel[user?.role] || (user?.role ? user.role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'User');

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-5 border-b border-slate-700/50">
        <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
          <FiLayers size={18} className="text-white" />
        </div>
        <div>
          <p className="text-sm font-bold text-white">SmartTask</p>
          <p className="text-xs text-slate-500">Project Manager</p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <p className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Main</p>
        <NavLink to="/dashboard" icon={FiGrid} label="Dashboard" end />
        <NavLink to="/projects" icon={FiFolder} label="Projects" />
        <NavLink to="/my-tasks" icon={FiCheckSquare} label="My Tasks" />

        {canApprove && (
          <>
            <p className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 mt-4">Management</p>
            <NavLink to="/department-tasks" icon={FiInbox} label="Dept. Tasks" />
            <NavLink to="/approvals" icon={FiThumbsUp} label="Approvals" />
            <NavLink to="/team-workload" icon={FiTrendingUp} label="Team Workload" />
          </>
        )}

        <p className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 mt-4">Workspace</p>
        <NavLink to="/messages" icon={FiMessageSquare} label="Messages" />
        {canViewAnalytics && (
          <NavLink to="/analytics" icon={FiBarChart2} label="Analytics" />
        )}
        {canManageRecycleBin && (
          <NavLink to="/recycle-bin" icon={FiTrash2} label="Recycle Bin" />
        )}

        {/* Activity log — admin and manager only */}
        {canViewActivity && (
          <NavLink to="/activity" icon={FiActivity} label="Activity Log" />
        )}

        {(canManageUsers || canManageDepartments || canManageRoles) && (
          <>
            <p className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 mt-4">Admin</p>
            {canManageUsers && <NavLink to="/admin/users" icon={FiUsers} label="Users" />}
            {canManageDepartments && <NavLink to="/admin/departments" icon={FiLayers} label="Departments" />}
            {canManageRoles && <NavLink to="/admin/roles" icon={FiShield} label="Roles" />}
          </>
        )}
      </nav>

      <div className="px-3 py-3 border-t border-slate-700/50">
        <Link to="/profile" className="flex items-center gap-3 p-2 rounded-xl hover:bg-slate-700/50 transition-colors">
          <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-sm font-bold text-white shrink-0">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-white truncate">
              {user?.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : user?.username}
            </p>
            <p className="text-xs text-slate-500 capitalize">{roleLabel}</p>
          </div>
        </Link>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-slate-900 overflow-hidden">
      <aside className="hidden lg:flex flex-col w-56 bg-slate-800 border-r border-slate-700/50 shrink-0">
        <SidebarContent />
      </aside>

      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSidebarOpen(false)} />
          <div className="relative w-64 bg-slate-800 border-r border-slate-700/50 flex flex-col z-10">
            <button onClick={() => setSidebarOpen(false)} className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-slate-700 text-slate-400">
              <FiX size={16} />
            </button>
            <SidebarContent />
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-14 bg-slate-800/80 border-b border-slate-700/50 flex items-center px-4 gap-3 shrink-0 backdrop-blur relative z-30">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-1.5 rounded-lg hover:bg-slate-700 text-slate-400">
            <FiMenu size={18} />
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-1">
            <NotificationBell />
            <div className="relative">
              <button
                onClick={() => setProfileMenuOpen(o => !o)}
                className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-slate-700 transition-colors"
              >
                <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold text-white">
                  {initials}
                </div>
                <FiChevronDown size={13} className="text-slate-400" />
              </button>
              {profileMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-slate-800 border border-slate-700 rounded-xl shadow-xl z-[100]">
                  <div className="px-3 py-2 border-b border-slate-700">
                    <p className="text-sm font-medium text-white truncate">
                      {user?.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : user?.username}
                    </p>
                    <p className="text-xs text-slate-500 capitalize">{roleLabel}</p>
                  </div>
                  <div className="py-1">
                    <Link to="/profile" onClick={() => setProfileMenuOpen(false)}
                      className="flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors">
                      <FiUser size={14} /> Profile
                    </Link>
                    <button
                      onClick={() => { setProfileMenuOpen(false); handleLogout(); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-slate-700 hover:text-red-300 transition-colors">
                      <FiLogOut size={14} /> Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}