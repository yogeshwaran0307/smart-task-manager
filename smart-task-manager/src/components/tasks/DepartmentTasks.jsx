import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { tasksAPI } from '../../api/tasks';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { PageHeader, PageLoading, Avatar } from '../common/ui';
import { FiCheckCircle, FiXCircle, FiClock, FiInbox, FiSearch } from 'react-icons/fi';

const PRIORITY_COLORS = {
  low: 'text-slate-400 bg-slate-700',
  medium: 'text-amber-400 bg-amber-900/30',
  high: 'text-orange-400 bg-orange-900/30',
  urgent: 'text-red-400 bg-red-900/30',
};
const STATUS_COLORS = {
  todo: 'bg-slate-600/40 text-slate-300',
  pending: 'bg-amber-900/30 text-amber-400',
  in_progress: 'bg-blue-900/30 text-blue-400',
  in_review: 'bg-violet-900/30 text-violet-400',
  completed: 'bg-emerald-900/30 text-emerald-400',
  done: 'bg-emerald-900/30 text-emerald-400',
};

export default function DepartmentTasks() {
  const { canApprove, isAdmin } = useAuth();
  const { addToast, confirm } = useApp();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [approvalFilter, setApprovalFilter] = useState('all');

  const load = () => {
    setLoading(true);
    tasksAPI.departmentTasks({ search, status: statusFilter, priority: priorityFilter })
      .then(r => setTasks(r.data || []))
      .catch(() => setTasks([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [search, statusFilter, priorityFilter]);

  const handleApprove = async (task) => {
    const ok = await confirm({
      title: 'Approve Task',
      message: `Approve "${task.title}"? This will mark it as done.`,
      confirmText: 'Approve',
    });
    if (!ok) return;
    try {
      await tasksAPI.approveTask(task.id);
      addToast('Task approved and marked done');
      load();
    } catch { addToast('Failed to approve task', 'error'); }
  };

  const handleReject = async (task) => {
    const reason = prompt('Rejection reason (optional):') || '';
    try {
      await tasksAPI.rejectTask(task.id, { reason });
      addToast('Task rejected');
      load();
    } catch { addToast('Failed to reject task', 'error'); }
  };

  const pendingApproval = tasks.filter(t => t.approval_status === 'pending');
  const filtered = approvalFilter === 'pending_approval' ? pendingApproval
    : approvalFilter === 'in_progress' ? tasks.filter(t => t.status === 'in_progress')
    : tasks;

  return (
    <div>
      <PageHeader
        title="Department Tasks"
        subtitle="Tasks assigned to your department — you can assign, review and approve"
      />

      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total', value: tasks.length, color: 'text-white', bg: 'bg-slate-700' },
          { label: 'Pending Approval', value: pendingApproval.length, color: 'text-amber-400', bg: 'bg-amber-900/20' },
          { label: 'In Progress', value: tasks.filter(t => t.status === 'in_progress').length, color: 'text-blue-400', bg: 'bg-blue-900/20' },
          { label: 'Done', value: tasks.filter(t => t.status === 'done' || t.status === 'completed').length, color: 'text-emerald-400', bg: 'bg-emerald-900/20' },
        ].map(s => (
          <div key={s.label} className={`card p-4 ${s.bg}`}>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-slate-400 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Search + Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <FiSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Search tasks…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="select w-auto" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="in_progress">In Progress</option>
          <option value="in_review">In Review</option>
          <option value="done">Done</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select className="select w-auto" value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}>
          <option value="">All Priority</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </select>
      </div>

      {/* Approval tabs */}
      <div className="flex gap-2 mb-4">
        {[['all', 'All Tasks'], ['pending_approval', 'Needs Approval'], ['in_progress', 'In Progress']].map(([k, l]) => (
          <button
            key={k}
            onClick={() => setApprovalFilter(k)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${approvalFilter === k ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
          >
            {l}
            {k === 'pending_approval' && pendingApproval.length > 0 && (
              <span className="ml-1.5 bg-amber-500 text-white text-xs px-1.5 py-0.5 rounded-full">{pendingApproval.length}</span>
            )}
          </button>
        ))}
      </div>

      {loading ? <PageLoading /> : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <FiInbox size={32} className="mx-auto mb-3 opacity-40" />
          <p>No tasks found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(task => (
            <div key={task.id} className="card p-4">
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <Link to={`/tasks/${task.id}`} className="text-sm font-semibold text-white hover:text-indigo-400 transition-colors">
                      {task.title}
                    </Link>
                    <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${STATUS_COLORS[task.status] || 'bg-slate-600 text-slate-300'}`}>
                      {(task.status || '').replace(/_/g, ' ')}
                    </span>
                    {task.priority && (
                      <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${PRIORITY_COLORS[task.priority] || ''}`}>
                        {task.priority}
                      </span>
                    )}
                    {task.approval_status === 'pending' && (
                      <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-900/30 text-amber-400">
                        <FiClock size={10} /> Awaiting Approval
                      </span>
                    )}
                    {task.approval_status === 'approved' && (
                      <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-900/30 text-emerald-400">
                        <FiCheckCircle size={10} /> Approved
                      </span>
                    )}
                    {task.approval_status === 'rejected' && (
                      <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-900/30 text-red-400">
                        <FiXCircle size={10} /> Rejected
                      </span>
                    )}
                  </div>
                  {task.description && (
                    <p className="text-xs text-slate-500 mb-2 line-clamp-1">{task.description}</p>
                  )}
                  <div className="flex items-center gap-3 flex-wrap">
                    {(task.assignees || []).length > 0 && (
                      <div className="flex items-center gap-1">
                        {task.assignees.slice(0, 3).map(a => (
                          <Avatar key={a.id} user={a} size={5} />
                        ))}
                        <span className="text-xs text-slate-500 ml-1">
                          {task.assignees.map(a => a.first_name || a.username).join(', ')}
                        </span>
                      </div>
                    )}
                    {task.due_date && (
                      <span className="text-xs text-slate-500">Due: {new Date(task.due_date).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>

                {/* Approval actions */}
                {task.approval_status === 'pending' && (
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => handleApprove(task)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors"
                    >
                      <FiCheckCircle size={13} /> Approve
                    </button>
                    <button
                      onClick={() => handleReject(task)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-600/80 hover:bg-red-600 text-white text-xs font-medium transition-colors"
                    >
                      <FiXCircle size={13} /> Reject
                    </button>
                  </div>
                )}

                {task.approval_status !== 'pending' && (
                  <Link to={`/tasks/${task.id}`}
                    className="shrink-0 text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
                    View →
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
