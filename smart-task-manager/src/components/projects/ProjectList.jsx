import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { projectsAPI } from '../../api/projects';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { PageLoading, EmptyState, StatusBadge, PageHeader, ProgressBar } from '../common/ui';
import { FiFolder, FiPlus, FiSearch, FiEdit2, FiTrash2, FiEye, FiClock, FiXCircle } from 'react-icons/fi';

function ApprovalBadge({ status }) {
  if (!status || status === 'approved') return null;
  if (status === 'pending') return (
    <span className="px-2 py-0.5 rounded-full text-xs border bg-amber-900/40 text-amber-300 border-amber-700/40 flex items-center gap-1">
      <FiClock size={10} /> Pending Approval
    </span>
  );
  if (status === 'rejected') return (
    <span className="px-2 py-0.5 rounded-full text-xs border bg-red-900/40 text-red-300 border-red-700/40 flex items-center gap-1">
      <FiXCircle size={10} /> Rejected
    </span>
  );
  return null;
}

export default function ProjectList() {
  const { user, isManager, isAdmin, isHOD, canCreateProjects, canApprove } = useAuth();
  const { addToast, confirm } = useApp();
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');

  const load = () => {
    setLoading(true);
    projectsAPI.list({ search, status: statusFilter, priority: priorityFilter })
      .then(r => setProjects(r.data?.results ?? r.data ?? []))
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [search, statusFilter, priorityFilter]);

  const handleDelete = async (project) => {
    const ok = await confirm({
      title: 'Delete Project',
      message: `Move "${project.name}" to recycle bin? You can restore it later from the Recycle Bin.`,
      confirmText: 'Delete',
    });
    if (!ok) return;
    try {
      await projectsAPI.delete(project.id);
      addToast(`"${project.name}" moved to recycle bin`);
      load();
    } catch {
      addToast('Failed to delete project', 'error');
    }
  };

  const priorityDot = { low: '#22c55e', medium: '#f59e0b', high: '#ef4444', urgent: '#7c3aed' };

  // Separate approved from pending/rejected (only shown to creator/admin/manager)
  const approvedProjects = projects.filter(p => p.approval_status === 'approved' || !p.approval_status);
  const pendingOrRejected = projects.filter(p => p.approval_status === 'pending' || p.approval_status === 'rejected');

  return (
    <div>
      <PageHeader
        title="Projects"
        subtitle={`${approvedProjects.length} active project${approvedProjects.length !== 1 ? 's' : ''}`}
        actions={canCreateProjects && (
          <Link to="/projects/create" className="btn btn-primary">
            <FiPlus size={15} /> New Project
          </Link>
        )}
      />

      {/* Pending/Rejected items visible only to creator or approvers */}
      {pendingOrRejected.length > 0 && (
        <div className="mb-6 space-y-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Awaiting Approval / Rejected</p>
          {pendingOrRejected.map(project => (
            <div key={project.id} className={`card p-4 flex items-center gap-4 border ${
              project.approval_status === 'rejected' ? 'border-red-800/40 bg-red-950/10' : 'border-amber-800/40 bg-amber-950/10'
            }`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium text-white text-sm truncate">{project.name}</p>
                  <ApprovalBadge status={project.approval_status} />
                </div>
                {project.description && <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{project.description}</p>}
                {project.rejection_reason && (
                  <p className="text-xs text-red-400 mt-1">Reason: {project.rejection_reason}</p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Link to={`/projects/${project.id}`} className="p-1.5 rounded-lg hover:bg-slate-600 text-slate-400 hover:text-white" title="View">
                  <FiEye size={14} />
                </Link>
                {canApprove && project.approval_status === 'pending' && (
                  <Link to="/approvals" className="text-xs px-2 py-1 bg-amber-700/30 hover:bg-amber-700/50 text-amber-300 rounded-lg border border-amber-700/40">
                    Review
                  </Link>
                )}
                {(isAdmin || isManager) && (
                  <button onClick={() => handleDelete(project)} className="p-1.5 rounded-lg hover:bg-red-900/40 text-slate-400 hover:text-red-400" title="Delete">
                    <FiTrash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px]">
          <FiSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-9"
            placeholder="Search projects…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select className="select w-auto" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="on_hold">On Hold</option>
          <option value="in_review">In Review</option>
          <option value="completed">Completed</option>
          <option value="archived">Archived</option>
        </select>
        <select className="select w-auto" value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}>
          <option value="">All Priority</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </div>

      {loading ? <PageLoading /> : approvedProjects.length === 0 ? (
        <EmptyState
          icon={FiFolder}
          title="No projects found"
          description={search || statusFilter ? 'Try adjusting your filters' : 'Create your first project to get started'}
          action={canCreateProjects && !search && !statusFilter && (
            <Link to="/projects/create" className="btn btn-primary">
              <FiPlus size={15} /> Create Project
            </Link>
          )}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {approvedProjects.map((project, i) => (
            <div key={project.id} className="card p-5 flex flex-col hover:border-slate-600 transition-colors group">
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                    style={{ background: `hsl(${(i * 47 + 200) % 360}deg 60% 35%)` }}
                  >
                    {project.name[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-white truncate text-sm">{project.name}</h3>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {project.project_code && (
                        <span className="font-mono text-xs bg-indigo-900/50 text-indigo-300 border border-indigo-700/40 px-1.5 py-0.5 rounded">
                          {project.project_code}
                        </span>
                      )}
                      <div className="w-1.5 h-1.5 rounded-full" style={{ background: priorityDot[project.priority] }} />
                      <span className="text-xs text-slate-500 capitalize">{project.priority || 'no priority'}</span>
                    </div>
                  </div>
                </div>
                <StatusBadge status={project.status} />
              </div>

              {/* Description */}
              {project.description && (
                <p className="text-xs text-slate-400 line-clamp-2 mb-4">{project.description}</p>
              )}

              {/* Progress */}
              <div className="mb-4">
                <div className="flex justify-between text-xs text-slate-500 mb-1.5">
                  <span>Progress</span>
                  <span className="font-mono font-semibold text-white">{project.progress_percentage ?? 0}%</span>
                </div>
                <ProgressBar value={project.progress_percentage ?? 0} max={100} />
                <div className="flex justify-between text-xs text-slate-600 mt-1">
                  <span>{project.completed_tasks ?? 0} done</span>
                  <span>{project.total_tasks ?? 0} total</span>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between mt-auto pt-3 border-t border-slate-700/50">
                <div className="text-xs text-slate-500">
                  {project.due_date ? (
                    <span className={new Date(project.due_date) < new Date() && project.status !== 'completed' ? 'text-red-400' : ''}>
                      Due {new Date(project.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  ) : 'No due date'}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Link to={`/projects/${project.id}`} className="p-1.5 rounded-lg hover:bg-slate-600 text-slate-400 hover:text-white transition-colors" title="View">
                    <FiEye size={14} />
                  </Link>
                  {(isManager || isAdmin || isHOD) && (
                    <Link to={`/projects/${project.id}/edit`} className="p-1.5 rounded-lg hover:bg-slate-600 text-slate-400 hover:text-white transition-colors" title="Edit">
                      <FiEdit2 size={14} />
                    </Link>
                  )}
                  {(isAdmin || isManager) && (
                    <button onClick={() => handleDelete(project)} className="p-1.5 rounded-lg hover:bg-red-900/40 text-slate-400 hover:text-red-400 transition-colors" title="Delete">
                      <FiTrash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
