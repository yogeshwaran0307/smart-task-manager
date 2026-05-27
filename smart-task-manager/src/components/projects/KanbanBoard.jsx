import { useState, useEffect, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { projectsAPI } from '../../api/projects';
import { tasksAPI } from '../../api/tasks';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { PageLoading, StatusBadge, Avatar } from '../common/ui';
import { FiPlus, FiCalendar } from 'react-icons/fi';

const COLUMNS = [
  { key: 'todo', label: 'To Do', color: '#94a3b8' },
  { key: 'in_progress', label: 'In Progress', color: '#3b82f6' },
  { key: 'pending', label: 'Pending', color: '#f97316' },
  { key: 'in_review', label: 'In Review', color: '#f59e0b' },
  { key: 'completed', label: 'Completed', color: '#22c55e' },
];

const PRIORITY_COLORS = {
  low: '#22c55e', medium: '#f59e0b', high: '#ef4444', urgent: '#7c3aed',
};

export default function KanbanBoard() {
  const { id: projectId } = useParams();
  const { addToast } = useApp();
  const [project, setProject] = useState(null);
  const [tasksByStatus, setTasksByStatus] = useState({});
  const [loading, setLoading] = useState(true);
  const dragTaskRef = useRef(null);
  const dragFromColRef = useRef(null);

  const load = async () => {
    try {
      const [pRes, tRes] = await Promise.all([
        projectsAPI.get(projectId),
        tasksAPI.list({ project: projectId }),
      ]);
      setProject(pRes.data);
      const allTasks = tRes.data?.results ?? tRes.data ?? [];
      const grouped = {};
      COLUMNS.forEach(c => { grouped[c.key] = []; });
      allTasks.forEach(t => {
        if (grouped[t.status]) grouped[t.status].push(t);
        else grouped['todo'].push(t);
      });
      setTasksByStatus(grouped);
    } catch {
      addToast('Failed to load kanban', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [projectId]);

  // HTML5 DnD handlers
  const onDragStart = (e, task, fromStatus) => {
    dragTaskRef.current = task;
    dragFromColRef.current = fromStatus;
    e.dataTransfer.effectAllowed = 'move';
    e.currentTarget.classList.add('kanban-card-dragging');
  };

  const onDragEnd = (e) => {
    e.currentTarget.classList.remove('kanban-card-dragging');
    dragTaskRef.current = null;
    dragFromColRef.current = null;
  };

  const onDragOver = (e) => {
    e.preventDefault();
    e.currentTarget.classList.add('kanban-col-over');
  };

  const onDragLeave = (e) => {
    e.currentTarget.classList.remove('kanban-col-over');
  };

  const onDrop = async (e, toStatus) => {
    e.preventDefault();
    e.currentTarget.classList.remove('kanban-col-over');
    const task = dragTaskRef.current;
    const fromStatus = dragFromColRef.current;
    if (!task || fromStatus === toStatus) return;

    // Optimistic UI update
    setTasksByStatus(prev => {
      const next = { ...prev };
      next[fromStatus] = next[fromStatus].filter(t => t.id !== task.id);
      next[toStatus] = [{ ...task, status: toStatus }, ...(next[toStatus] || [])];
      return next;
    });

    try {
      await tasksAPI.update(task.id, { status: toStatus });
    } catch {
      addToast('Failed to move task', 'error');
      load(); // Revert
    }
  };

  const { canCreateTasks } = useAuth();
  if (loading) return <PageLoading />;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">{project?.name} — Kanban</h1>
          <p className="text-sm text-slate-400 mt-0.5">Drag tasks between columns to update status</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to={`/projects/${projectId}`} className="btn btn-secondary text-xs">← List View</Link>
          {canCreateTasks && (
            <Link to={`/tasks/create/${projectId}`} className="btn btn-primary text-xs">
              <FiPlus size={14} /> Add Task
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 items-start">
        {COLUMNS.map(col => {
          const colTasks = tasksByStatus[col.key] || [];
          return (
            <div
              key={col.key}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={(e) => onDrop(e, col.key)}
              className="bg-slate-800/60 border border-slate-700 rounded-2xl p-3 min-h-[200px] transition-all"
            >
              {/* Column Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: col.color }} />
                  <span className="text-sm font-bold text-white">{col.label}</span>
                  <span className="text-xs font-mono bg-slate-700 text-slate-400 rounded-full px-2 py-0.5">
                    {colTasks.length}
                  </span>
                </div>
                <Link to={`/tasks/create/${projectId}?status=${col.key}`}
                  className="text-slate-500 hover:text-indigo-400 transition-colors p-1">
                  <FiPlus size={14} />
                </Link>
              </div>

              {/* Cards */}
              <div className="space-y-2">
                {colTasks.map(task => (
                  <KanbanCard key={task.id} task={task} projectId={projectId}
                    onDragStart={onDragStart} onDragEnd={onDragEnd} colKey={col.key} />
                ))}
                {colTasks.length === 0 && (
                  <div className="text-center py-8 border-2 border-dashed border-slate-700 rounded-xl text-slate-600 text-xs">
                    Drop here
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function KanbanCard({ task, projectId, onDragStart, onDragEnd, colKey }) {
  const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'completed';
  const completed = task.subtask_completed ?? 0;
  const total = task.subtask_total ?? 0;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, task, colKey)}
      onDragEnd={onDragEnd}
      className="bg-slate-800 border border-slate-700 hover:border-indigo-500/50 rounded-xl p-3 cursor-grab active:cursor-grabbing transition-all hover:shadow-lg hover:shadow-indigo-500/10"
    >
      {/* Priority + overdue */}
      <div className="flex items-center gap-2 mb-2">
        <div className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ background: PRIORITY_COLORS[task.priority] || '#94a3b8' }} />
        <span className="text-xs text-slate-500 capitalize">{task.priority}</span>
        {isOverdue && <span className="ml-auto text-xs text-red-400 font-semibold">Overdue</span>}
      </div>

      {/* Title */}
      <Link to={`/tasks/${task.id}`}
        className="block text-sm font-semibold text-white hover:text-indigo-300 transition-colors mb-2 leading-snug"
        onClick={e => e.stopPropagation()}>
        {task.title.length > 60 ? task.title.slice(0, 60) + '…' : task.title}
      </Link>

      {/* Subtask progress */}
      {total > 0 && (
        <div className="mb-2">
          <div className="flex justify-between text-xs text-slate-500 mb-1">
            <span>Subtasks</span><span>{completed}/{total}</span>
          </div>
          <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-2">
        {task.due_date ? (
          <span className={`text-xs flex items-center gap-1 ${isOverdue ? 'text-red-400' : 'text-slate-500'}`}>
            <FiCalendar size={10} />
            {new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        ) : <span />}
        <div className="flex -space-x-1.5">
          {(task.assignees || []).slice(0, 3).map(a => (
            <Avatar key={a.id || a} user={typeof a === 'object' ? a : { id: a, username: `U${a}` }} size={5} />
          ))}
        </div>
      </div>
    </div>
  );
}
