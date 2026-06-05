import { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { projectsAPI } from '../../api/projects';
import { tasksAPI, extensionAPI } from '../../api/tasks';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import {
  PageLoading, StatusBadge, PageHeader, ProgressBar, Avatar, EmptyState,
} from '../common/ui';
import {
  FiEdit2, FiTrash2, FiPlus, FiLayers, FiUsers, FiCalendar,
  FiCheckSquare, FiClock, FiAlertCircle, FiThumbsUp, FiThumbsDown, FiLock, FiRefreshCw, FiX,
} from 'react-icons/fi';

function ProjectExtensionModal({ project, onClose, onSubmitted }) {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().split('T')[0];

  const [reason, setReason] = useState('');
  const [newDate, setNewDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [existingReq, setExistingReq] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    extensionAPI.list().then(r => {
      const pending = (r.data || []).find(
        er => er.content_type === 'project' && er.object_id === project.id && er.status === 'pending'
      );
      setExistingReq(pending || null);
    }).catch(() => {}).finally(() => setChecking(false));
  }, []);

  const originalDate = project.due_date;
  const daysOverdue = originalDate
    ? Math.max(0, Math.ceil((today - new Date(originalDate)) / 86400000))
    : 0;
  const daysExtension = newDate && originalDate
    ? Math.max(0, Math.ceil((new Date(newDate) - new Date(originalDate)) / 86400000))
    : 0;

  const handleSubmit = async () => {
    if (!reason.trim()) { setError('Please provide a reason.'); return; }
    if (!newDate) { setError('Please select a new due date.'); return; }
    setLoading(true); setError('');
    try {
      await extensionAPI.create({
        content_type: 'project',
        object_id: project.id,
        reason: reason.trim(),
        requested_new_date: newDate,
      });
      onSubmitted();
      onClose();
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to submit request.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <FiRefreshCw size={16} className="text-amber-400" />
            <h3 className="font-semibold text-white text-sm">Request Deadline Extension</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white">
            <FiX size={16} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="p-3 bg-red-950/40 border border-red-800/40 rounded-xl text-xs text-red-300">
            <p className="font-semibold mb-0.5">⏰ ETA Exceeded</p>
            <p>Original due date: <strong>{originalDate}</strong> ({daysOverdue} day{daysOverdue !== 1 ? 's' : ''} overdue)</p>
          </div>
          {checking ? (
            <div className="flex justify-center py-4"><div className="animate-spin w-5 h-5 rounded-full border-2 border-slate-600 border-t-amber-400" /></div>
          ) : existingReq ? (
            <div className="p-3 bg-amber-900/20 border border-amber-700/40 rounded-xl text-xs text-amber-300">
              <p className="font-semibold mb-1">⏳ Pending Request Exists</p>
              <p>You already have a pending extension request (→ {existingReq.requested_new_date}). Please wait for it to be reviewed.</p>
              <p className="mt-1 text-slate-400">Reason: {existingReq.reason}</p>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">New Proposed Due Date <span className="text-red-400">*</span></label>
                <input type="date" min={minDate} value={newDate} onChange={e => setNewDate(e.target.value)} className="input-field text-sm w-full" />
                {daysExtension > 0 && <p className="text-xs text-amber-400 mt-1">+{daysExtension} day{daysExtension !== 1 ? 's' : ''} extension from original deadline</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Reason for Extension <span className="text-red-400">*</span></label>
                <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} maxLength={500} className="input-field text-sm w-full resize-none" placeholder="Explain why additional time is needed..." />
                <p className="text-xs text-slate-600 mt-0.5 text-right">{reason.length}/500</p>
              </div>
              {error && <p className="text-xs text-red-400">{error}</p>}
              <div className="p-3 bg-slate-700/40 rounded-xl text-xs text-slate-400">
                <p>📋 This request will be sent to the project manager/admin. You will be notified of the decision.</p>
              </div>
              <div className="flex gap-2">
                <button onClick={onClose} className="flex-1 py-2 rounded-xl text-sm text-slate-400 hover:text-white hover:bg-slate-700 transition-colors">Cancel</button>
                <button onClick={handleSubmit} disabled={loading} className="flex-1 py-2 rounded-xl text-sm bg-amber-600 hover:bg-amber-500 text-white font-medium transition-colors disabled:opacity-50">
                  {loading ? 'Submitting…' : 'Submit Request'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin, isManager, isHOD, user, canCreateTasks, canApprove, role } = useAuth();
  const { addToast, confirm } = useApp();
  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('tasks');
  const [taskFilter, setTaskFilter] = useState('');
  const [showExtensionModal, setShowExtensionModal] = useState(false);
  const [extensionToast, setExtensionToast] = useState('');

  const load = () => {
    Promise.all([
      projectsAPI.get(id),
      tasksAPI.list({ project: id }),
    ]).then(([pRes, tRes]) => {
      setProject(pRes.data);
      setTasks(tRes.data?.results ?? tRes.data ?? []);
    }).catch(() => addToast('Failed to load project', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [id]);

  const handleDelete = async () => {
    const ok = await confirm({
      title: 'Delete Project',
      message: `Move "${project.name}" to recycle bin?`,
      confirmText: 'Delete',
    });
    if (!ok) return;
    try {
      await projectsAPI.delete(id);
      addToast(`"${project.name}" moved to recycle bin`);
      navigate('/projects');
    } catch {
      addToast('Failed to delete project', 'error');
    }
  };

  const handleDeleteTask = async (task) => {
    const ok = await confirm({
      title: 'Delete Task',
      message: `Move "${task.title}" to recycle bin?`,
      confirmText: 'Delete',
    });
    if (!ok) return;
    try {
      await tasksAPI.delete(task.id);
      addToast('Task moved to recycle bin');
      load();
    } catch { addToast('Failed to delete task', 'error'); }
  };

  if (loading) return <PageLoading />;
  if (!project) return <div className="text-center text-slate-400 py-20">Project not found</div>;

  const canEdit = isAdmin || isManager || isHOD || project.created_by === user?.id || (project.members && project.members.some(m => m.id === user?.id));
  const isOverdue = project?.is_overdue === true;
  const filteredTasks = taskFilter
    ? tasks.filter(t => t.status === taskFilter)
    : tasks;

  const taskStats = {
    todo: tasks.filter(t => t.status === 'todo').length,
    in_progress: tasks.filter(t => t.status === 'in_progress').length,
    in_review: tasks.filter(t => t.status === 'in_review').length,
    completed: tasks.filter(t => t.status === 'completed').length,
  };

  const statusColors = {
    todo: '#94a3b8', in_progress: '#3b82f6', in_review: '#f59e0b',
    pending: '#f97316', completed: '#22c55e',
  };
  const priorityColors = { low: '#22c55e', medium: '#f59e0b', high: '#ef4444', urgent: '#7c3aed' };

  return (
    <div>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            {project.project_code && (
              <span className="font-mono text-sm bg-indigo-900/50 text-indigo-300 border border-indigo-700/40 px-2 py-0.5 rounded">
                {project.project_code}
              </span>
            )}
            {project.name}
          </span>
        }
        subtitle={project.description}
        back={{ onClick: () => navigate('/projects') }}
        actions={
          <div className="flex items-center gap-2">
            <Link to={`/kanban/${id}`} className="btn btn-secondary text-xs">
              <FiLayers size={14} /> Kanban
            </Link>
            <Link to={`/calendar/${id}`} className="btn btn-secondary text-xs">
              <FiCalendar size={14} /> Calendar
            </Link>
            {canEdit && !isOverdue && (
              <Link to={`/projects/${id}/edit`} className="btn btn-secondary text-xs">
                <FiEdit2 size={14} /> Edit
              </Link>
            )}
            {(isAdmin || isManager) && !isOverdue && (
              <button onClick={handleDelete} className="btn btn-danger text-xs">
                <FiTrash2 size={14} /> Delete
              </button>
            )}
            {isOverdue && (
              <span className="flex items-center gap-1.5 px-3 py-1.5 bg-red-950/50 text-red-400 border border-red-700/40 rounded-lg text-xs">
                <FiLock size={12} /> Locked
              </span>
            )}
          </div>
        }
      />

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'To Do', val: taskStats.todo, color: '#94a3b8', key: 'todo' },
          { label: 'In Progress', val: taskStats.in_progress, color: '#3b82f6', key: 'in_progress' },
          { label: 'In Review', val: taskStats.in_review, color: '#f59e0b', key: 'in_review' },
          { label: 'Completed', val: taskStats.completed, color: '#22c55e', key: 'completed' },
        ].map(stat => (
          <button key={stat.key} onClick={() => setTaskFilter(taskFilter === stat.key ? '' : stat.key)}
            className={`card p-4 text-left hover:border-slate-500 transition-colors ${taskFilter === stat.key ? 'border-indigo-500' : ''}`}>
            <div className="w-2 h-2 rounded-full mb-2" style={{ background: stat.color }} />
            <p className="text-2xl font-bold font-mono text-white">{stat.val}</p>
            <p className="text-xs text-slate-400">{stat.label}</p>
          </button>
        ))}
      </div>

      {/* Overdue Lock Banner */}
      {isOverdue && (
        <div className="mb-6 p-4 bg-red-950/60 border border-red-700/50 rounded-xl flex items-start gap-3">
          <FiLock size={18} className="text-red-400 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-300">Project Locked — ETA Exceeded</p>
            <p className="text-xs text-red-400/80 mt-0.5">
              This project's due date ({project.due_date}) has passed. Editing, deleting, and adding new tasks are disabled.
            </p>
            {extensionToast && (
              <p className="text-xs text-emerald-400 mt-1">{extensionToast}</p>
            )}
          </div>
          <button
            onClick={() => setShowExtensionModal(true)}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-amber-600/20 hover:bg-amber-600/40 border border-amber-600/50 text-amber-300 rounded-lg text-xs font-medium transition-colors"
          >
            <FiRefreshCw size={12} />
            Request Extension
          </button>
        </div>
      )}

      {showExtensionModal && project && (
        <ProjectExtensionModal
          project={project}
          onClose={() => setShowExtensionModal(false)}
          onSubmitted={() => {
            setExtensionToast('✅ Extension request submitted! You will be notified when reviewed.');
            setTimeout(() => setExtensionToast(''), 6000);
          }}
        />
      )}

      {/* Progress */}
      <div className="card p-5 mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <StatusBadge status={project.status} />
            <StatusBadge status={project.priority} />
          </div>
          <span className="text-sm font-bold font-mono text-white">{project.progress_percentage ?? 0}%</span>
        </div>
        <ProgressBar value={project.progress_percentage ?? 0} max={100} />
        <div className="flex items-center gap-6 mt-3 text-xs text-slate-500">
          {project.start_date && <span>Started {new Date(project.start_date).toLocaleDateString()}</span>}
          {project.due_date && (
            <span className={new Date(project.due_date) < new Date() && project.status !== 'completed' ? 'text-red-400' : ''}>
              Due {new Date(project.due_date).toLocaleDateString()}
            </span>
          )}
          {project.eta && (
            <span className="flex items-center gap-1 text-amber-400">
              ⏱ ETA: {project.eta}
            </span>
          )}
          <span>{project.members?.length ?? 0} members</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-700 mb-6 gap-1">
        {['tasks', 'members'].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium capitalize border-b-2 transition-colors ${
              activeTab === tab ? 'text-indigo-400 border-indigo-500' : 'text-slate-400 border-transparent hover:text-white'
            }`}>
            {tab}
          </button>
        ))}
      </div>

      {/* Tasks Tab */}
      {activeTab === 'tasks' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            {taskFilter && (
              <button onClick={() => setTaskFilter('')} className="text-xs text-indigo-400 hover:text-indigo-300">
                ← Clear filter
              </button>
            )}
            <div className="ml-auto">
              {canCreateTasks && (
                !isOverdue ? (
                  <Link to={`/tasks/create/${id}`} className="btn btn-primary text-xs">
                    <FiPlus size={14} /> Add Task
                  </Link>
                ) : (
                  <span className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700/50 text-slate-500 rounded-lg text-xs cursor-not-allowed">
                    <FiLock size={12} /> Add Task Locked
                  </span>
                )
              )}
            </div>
          </div>

          {filteredTasks.length === 0 ? (
            <EmptyState
              icon={FiCheckSquare}
              title="No tasks yet"
              description="Add your first task to get started"
              action={
                canCreateTasks ? (
                  <Link to={`/tasks/create/${id}`} className="btn btn-primary">
                    <FiPlus size={15} /> Add Task
                  </Link>
                ) : null
              }
            />
          ) : (
            <div className="space-y-2">
              {filteredTasks.map(task => (
                <div key={task.id} className="card p-4 flex items-center gap-4 hover:border-slate-600 transition-colors group">
                  <div className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: statusColors[task.status] || '#94a3b8' }} />
                  <div className="flex-1 min-w-0">
                    <Link to={`/tasks/${task.id}`} className="text-sm font-medium text-white hover:text-indigo-300 transition-colors truncate block">
                      {task.title}
                    </Link>
                    <div className="flex items-center gap-3 mt-1">
                      {task.task_code && (
                        <span className="font-mono text-xs text-slate-500 bg-slate-700/60 px-1.5 py-0.5 rounded">
                          {task.task_code}
                        </span>
                      )}
                      <StatusBadge status={task.status} />
                      <StatusBadge status={task.priority} />
                      {task.due_date && (
                        <span className={`text-xs ${new Date(task.due_date) < new Date() && task.status !== 'completed' ? 'text-red-400' : 'text-slate-500'}`}>
                          <FiCalendar size={11} className="inline mr-1" />
                          {new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!isOverdue && (
                      <>
                        <Link to={`/tasks/${task.id}/edit`} className="p-1.5 rounded-lg hover:bg-slate-600 text-slate-400 hover:text-white">
                          <FiEdit2 size={13} />
                        </Link>
                        {(isAdmin || isManager) && (
                          <button onClick={() => handleDeleteTask(task)} className="p-1.5 rounded-lg hover:bg-red-900/40 text-slate-400 hover:text-red-400">
                            <FiTrash2 size={13} />
                          </button>
                        )}
                      </>
                    )}
                    {isOverdue && (
                      <span className="p-1.5 text-slate-600 cursor-not-allowed"><FiLock size={13} /></span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Members Tab */}
      {activeTab === 'members' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {(project.members || []).map(member => (
            <div key={member.id || member} className="card p-4 flex items-center gap-3">
              <Avatar user={member} size={9} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white truncate">
                  {member.first_name ? `${member.first_name} ${member.last_name || ''}`.trim() : member.username || `User ${member}`}
                </p>
                <p className="text-xs text-slate-500 capitalize">{member.role || 'Member'}</p>
              </div>
              {member.id === project.owner_id && (
                <span className="badge badge-active text-xs">Owner</span>
              )}
            </div>
          ))}
          {(!project.members || project.members.length === 0) && (
            <div className="col-span-full text-center text-slate-400 py-8 text-sm">No members assigned</div>
          )}
        </div>
      )}
    </div>
  );
}
