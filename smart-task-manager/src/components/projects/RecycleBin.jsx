import { useState, useEffect } from 'react';
import { projectsAPI } from '../../api/projects';
import { tasksAPI } from '../../api/tasks';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { PageLoading, EmptyState, PageHeader, StatusBadge } from '../common/ui';
import { FiTrash2, FiRefreshCw, FiAlertTriangle } from 'react-icons/fi';

export default function RecycleBin() {
  const { isAdmin, isManager, canPurgeItems } = useAuth();
  const { addToast, confirm } = useApp();
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('projects');

  const load = () => {
    setLoading(true);
    projectsAPI.getRecycleBin()
      .then(res => {
        const data = res.data;
        // Backend returns { projects: [...], tasks: [...] }
        setProjects(Array.isArray(data?.projects) ? data.projects : []);
        setTasks(Array.isArray(data?.tasks) ? data.tasks : []);
      })
      .catch(() => {
        setProjects([]);
        setTasks([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleRestoreProject = async (project) => {
    const ok = await confirm({ title: 'Restore Project', message: `Restore "${project.name}"?`, confirmText: 'Restore', danger: false });
    if (!ok) return;
    try {
      await projectsAPI.restore(project.id);
      addToast(`"${project.name}" restored`);
      load();
    } catch { addToast('Failed to restore', 'error'); }
  };

  const handlePurgeProject = async (project) => {
    const ok = await confirm({
      title: 'Permanently Delete',
      message: `Permanently delete "${project.name}"? This CANNOT be undone and all data will be lost.`,
      confirmText: 'Delete Forever',
    });
    if (!ok) return;
    try {
      await projectsAPI.purge(project.id);
      addToast(`"${project.name}" permanently deleted`);
      load();
    } catch { addToast('Failed to purge', 'error'); }
  };

  const handleRestoreTask = async (task) => {
    const ok = await confirm({ title: 'Restore Task', message: `Restore "${task.title}"?`, confirmText: 'Restore', danger: false });
    if (!ok) return;
    try {
      await tasksAPI.restore(task.id);
      addToast(`"${task.title}" restored`);
      load();
    } catch { addToast('Failed to restore', 'error'); }
  };

  const handlePurgeTask = async (task) => {
    const ok = await confirm({
      title: 'Permanently Delete',
      message: `Permanently delete "${task.title}"? This CANNOT be undone.`,
      confirmText: 'Delete Forever',
    });
    if (!ok) return;
    try {
      await tasksAPI.purge(task.id);
      addToast('Task permanently deleted');
      load();
    } catch { addToast('Failed to purge', 'error'); }
  };

  const formatDate = (ts) => {
    if (!ts) return '';
    // Handle both Unix timestamps (seconds) and ISO strings
    const d = typeof ts === 'number' ? new Date(ts * 1000) : new Date(ts);
    return d.toLocaleDateString();
  };

  const currentItems = activeTab === 'projects' ? projects : tasks;

  return (
    <div>
      <PageHeader
        title="Recycle Bin"
        subtitle="Deleted items are kept here. Admins can restore or permanently delete them."
      />

      {/* Warning Banner */}
      <div className="bg-amber-900/20 border border-amber-700/50 rounded-xl p-4 mb-6 flex items-start gap-3">
        <FiAlertTriangle size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-amber-300">Items in recycle bin</p>
          <p className="text-xs text-amber-400/70 mt-0.5">
            Deleted projects and tasks are stored here.
            {canPurgeItems
              ? ' As an admin, you can restore items or purge them permanently.'
              : isManager
              ? ' You can restore items. Contact an admin to permanently delete items.'
              : ' Contact an admin or manager to restore items.'}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-700 mb-6 gap-1">
        {[
          { key: 'projects', label: `Projects (${projects.length})` },
          { key: 'tasks', label: `Tasks (${tasks.length})` },
        ].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key ? 'text-indigo-400 border-indigo-500' : 'text-slate-400 border-transparent hover:text-white'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? <PageLoading /> : currentItems.length === 0 ? (
        <EmptyState icon={FiTrash2} title="Recycle bin is empty" description={`No deleted ${activeTab} found`} />
      ) : (
        <div className="space-y-2">
          {activeTab === 'projects' && projects.map(project => (
            <div key={project.id} className="card p-4 flex items-center gap-4 hover:border-slate-600 transition-colors">
              <div className="w-9 h-9 rounded-lg bg-slate-700 flex items-center justify-center text-sm font-bold text-slate-300 flex-shrink-0">
                {project.name?.[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{project.name}</p>
                <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                  {project.deleted_at && <span>Deleted {formatDate(project.deleted_at)}</span>}
                  <StatusBadge status={project.status} />
                  {project.approval_status && project.approval_status !== 'approved' && (
                    <span className={`px-1.5 py-0.5 rounded text-xs ${
                      project.approval_status === 'rejected' ? 'bg-red-900/30 text-red-300' : 'bg-amber-900/30 text-amber-300'
                    }`}>{project.approval_status}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {(isAdmin || isManager) && (
                  <button onClick={() => handleRestoreProject(project)} className="btn btn-success text-xs px-3">
                    <FiRefreshCw size={13} /> Restore
                  </button>
                )}
                {canPurgeItems && (
                  <button onClick={() => handlePurgeProject(project)} className="btn btn-danger text-xs px-3">
                    <FiTrash2 size={13} /> Purge
                  </button>
                )}
              </div>
            </div>
          ))}
          {activeTab === 'tasks' && tasks.map(task => (
            <div key={task.id} className="card p-4 flex items-center gap-4 hover:border-slate-600 transition-colors">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{task.title}</p>
                <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                  {task.deleted_at && <span>Deleted {formatDate(task.deleted_at)}</span>}
                  <StatusBadge status={task.status} />
                  <StatusBadge status={task.priority} />
                  {task.approval_status && task.approval_status !== 'approved' && (
                    <span className={`px-1.5 py-0.5 rounded text-xs ${
                      task.approval_status === 'rejected' ? 'bg-red-900/30 text-red-300' : 'bg-amber-900/30 text-amber-300'
                    }`}>{task.approval_status}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {(isAdmin || isManager) && (
                  <button onClick={() => handleRestoreTask(task)} className="btn btn-success text-xs px-3">
                    <FiRefreshCw size={13} /> Restore
                  </button>
                )}
                {canPurgeItems && (
                  <button onClick={() => handlePurgeTask(task)} className="btn btn-danger text-xs px-3">
                    <FiTrash2 size={13} /> Purge
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
