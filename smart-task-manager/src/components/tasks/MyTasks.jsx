import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { tasksAPI } from '../../api/tasks';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { PageLoading, EmptyState, StatusBadge, PageHeader } from '../common/ui';
import { FiCheckSquare, FiSearch, FiCalendar, FiEdit2, FiTrash2, FiPlus, FiAlertCircle } from 'react-icons/fi';

export default function MyTasks() {
  const { addToast, confirm } = useApp();
  const { canCreateTasks, user, isAdmin, isManager } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');

  const load = () => {
    setLoading(true);
    tasksAPI.myTasks({ search, status: statusFilter, priority: priorityFilter })
      .then(r => setTasks(r.data?.results ?? r.data ?? []))
      .catch(() => setTasks([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [search, statusFilter, priorityFilter]);

  const handleDelete = async (task) => {
    const ok = await confirm({ title: 'Delete Task', message: `Move "${task.title}" to recycle bin?`, confirmText: 'Delete' });
    if (!ok) return;
    try {
      await tasksAPI.delete(task.id);
      addToast('Task moved to recycle bin');
      load();
    } catch { addToast('Failed to delete task', 'error'); }
  };

  const priorityColors = { low: '#22c55e', medium: '#f59e0b', high: '#ef4444', urgent: '#7c3aed' };

  return (
    <div>
      <PageHeader title="My Tasks" subtitle={`${tasks.length} task${tasks.length !== 1 ? 's' : ''} assigned to you`}
        actions={canCreateTasks && (
          <Link to="/tasks/create" className="btn btn-primary">
            <FiPlus size={15} /> New Task
          </Link>
        )}
      />

      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px]">
          <FiSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Search tasks…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="select w-auto" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All Status</option>
          <option value="todo">To Do</option>
          <option value="in_progress">In Progress</option>
          <option value="pending">Pending</option>
          <option value="in_review">In Review</option>
          <option value="completed">Completed</option>
        </select>
        <select className="select w-auto" value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}>
          <option value="">All Priority</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </select>
      </div>

      {loading ? <PageLoading /> : tasks.length === 0 ? (
        <EmptyState icon={FiCheckSquare} title="No tasks found" description="You have no tasks assigned to you" />
      ) : (
        <div className="space-y-2">
          {tasks.map(task => {
            const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'completed';
            return (
              <div key={task.id} className="card p-4 flex items-center gap-4 hover:border-slate-600 group transition-colors">
                <div className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: priorityColors[task.priority] || '#94a3b8' }} />
                <div className="flex-1 min-w-0">
                  <Link to={`/tasks/${task.id}`}
                    className="text-sm font-medium text-white hover:text-indigo-300 transition-colors truncate block">
                    {task.title}
                  </Link>
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    {task.task_code && (
                      <span className="font-mono text-xs text-slate-500 bg-slate-700/60 px-1.5 py-0.5 rounded">
                        {task.task_code}
                      </span>
                    )}
                    <StatusBadge status={task.status} />
                    <StatusBadge status={task.priority} />
                    {task.project_name && (
                      <Link to={`/projects/${task.project}`}
                        className="text-xs text-slate-500 hover:text-indigo-400">
                        {task.project_name}
                      </Link>
                    )}
                    {task.due_date && (
                      <span className={`text-xs flex items-center gap-1 ${isOverdue ? 'text-red-400' : 'text-slate-500'}`}>
                        <FiCalendar size={11} />
                        {new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        {isOverdue && ' · Overdue'}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Link to={`/tasks/${task.id}/edit`} className="p-1.5 rounded-lg hover:bg-slate-600 text-slate-400 hover:text-white">
                    <FiEdit2 size={13} />
                  </Link>
                  {(isAdmin || isManager) && (
                    <button onClick={() => handleDelete(task)} className="p-1.5 rounded-lg hover:bg-red-900/40 text-slate-400 hover:text-red-400">
                      <FiTrash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
