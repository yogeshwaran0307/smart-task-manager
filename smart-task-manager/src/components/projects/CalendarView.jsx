import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { projectsAPI } from '../../api/projects';
import { tasksAPI } from '../../api/tasks';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { PageLoading, Avatar } from '../common/ui';
import { FiPlus, FiCalendar, FiChevronLeft, FiChevronRight, FiClock } from 'react-icons/fi';

const PRIORITY_COLORS = {
  low: '#22c55e', medium: '#f59e0b', high: '#ef4444', urgent: '#7c3aed',
};

const STATUS_COLORS = {
  todo: '#94a3b8', in_progress: '#3b82f6', pending: '#f97316',
  in_review: '#f59e0b', completed: '#22c55e',
};

const STATUS_BG = {
  todo: 'bg-slate-700/60 border-slate-600',
  in_progress: 'bg-blue-900/30 border-blue-700/50',
  pending: 'bg-orange-900/30 border-orange-700/50',
  in_review: 'bg-amber-900/30 border-amber-700/50',
  completed: 'bg-emerald-900/30 border-emerald-700/50',
};

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function CalendarView() {
  const { id: projectId } = useParams();
  const { addToast } = useApp();
  const { canCreateTasks } = useAuth();

  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [today] = useState(new Date());
  const [current, setCurrent] = useState({
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
  });
  const [selectedDay, setSelectedDay] = useState(null);
  const [hoveredDay, setHoveredDay] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [pRes, tRes] = await Promise.all([
          projectsAPI.get(projectId),
          tasksAPI.list({ project: projectId }),
        ]);
        setProject(pRes.data);
        setTasks(tRes.data?.results ?? tRes.data ?? []);
      } catch {
        addToast('Failed to load calendar', 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, [projectId]);

  // Build calendar grid
  const firstDay = new Date(current.year, current.month, 1).getDay();
  const daysInMonth = new Date(current.year, current.month + 1, 0).getDate();
  const daysInPrevMonth = new Date(current.year, current.month, 0).getDate();

  // Map tasks to their due dates
  const tasksByDate = {};
  tasks.forEach(task => {
    if (!task.due_date) return;
    const d = new Date(task.due_date);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (!tasksByDate[key]) tasksByDate[key] = [];
    tasksByDate[key].push(task);
  });

  const getTasksForDay = (year, month, day) => {
    const key = `${year}-${month}-${day}`;
    return tasksByDate[key] || [];
  };

  const prevMonth = () => {
    setCurrent(c => {
      if (c.month === 0) return { year: c.year - 1, month: 11 };
      return { ...c, month: c.month - 1 };
    });
    setSelectedDay(null);
  };

  const nextMonth = () => {
    setCurrent(c => {
      if (c.month === 11) return { year: c.year + 1, month: 0 };
      return { ...c, month: c.month + 1 };
    });
    setSelectedDay(null);
  };

  const goToToday = () => {
    setCurrent({ year: today.getFullYear(), month: today.getMonth() });
    setSelectedDay({ year: today.getFullYear(), month: today.getMonth(), day: today.getDate() });
  };

  const isToday = (year, month, day) =>
    year === today.getFullYear() && month === today.getMonth() && day === today.getDate();

  const isSelected = (year, month, day) =>
    selectedDay?.year === year && selectedDay?.month === month && selectedDay?.day === day;

  // Tasks for selected day panel
  const selectedTasks = selectedDay
    ? getTasksForDay(selectedDay.year, selectedDay.month, selectedDay.day)
    : [];

  // Summary counts
  const monthTasks = tasks.filter(t => {
    if (!t.due_date) return false;
    const d = new Date(t.due_date);
    return d.getFullYear() === current.year && d.getMonth() === current.month;
  });
  const overdueTasks = tasks.filter(t => {
    if (!t.due_date || t.status === 'completed') return false;
    return new Date(t.due_date) < today;
  });

  if (loading) return <PageLoading />;

  // Build grid cells
  const cells = [];
  // Prev month trailing days
  for (let i = firstDay - 1; i >= 0; i--) {
    cells.push({ day: daysInPrevMonth - i, currentMonth: false, type: 'prev' });
  }
  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, currentMonth: true, type: 'current' });
  }
  // Next month leading days
  const remaining = 42 - cells.length;
  for (let d = 1; d <= remaining; d++) {
    cells.push({ day: d, currentMonth: false, type: 'next' });
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">{project?.name} — Calendar</h1>
          <p className="text-sm text-slate-400 mt-0.5">Tasks by due date</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to={`/projects/${projectId}`} className="btn btn-secondary text-xs">← List View</Link>
          <Link to={`/kanban/${projectId}`} className="btn btn-secondary text-xs">⬛ Kanban</Link>
          {canCreateTasks && (
            <Link to={`/tasks/create/${projectId}`} className="btn btn-primary text-xs">
              <FiPlus size={14} /> Add Task
            </Link>
          )}
        </div>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="card p-3">
          <p className="text-xs text-slate-400 mb-1">This Month</p>
          <p className="text-2xl font-bold font-mono text-white">{monthTasks.length}</p>
          <p className="text-xs text-slate-500">tasks due</p>
        </div>
        <div className="card p-3">
          <p className="text-xs text-slate-400 mb-1">Completed</p>
          <p className="text-2xl font-bold font-mono text-emerald-400">
            {monthTasks.filter(t => t.status === 'completed').length}
          </p>
          <p className="text-xs text-slate-500">this month</p>
        </div>
        <div className="card p-3">
          <p className="text-xs text-slate-400 mb-1">Overdue</p>
          <p className="text-2xl font-bold font-mono text-red-400">{overdueTasks.length}</p>
          <p className="text-xs text-slate-500">need attention</p>
        </div>
      </div>

      <div className="flex gap-4">
        {/* Calendar */}
        <div className="flex-1 card p-4">
          {/* Month nav */}
          <div className="flex items-center justify-between mb-4">
            <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
              <FiChevronLeft size={18} />
            </button>
            <div className="flex items-center gap-3">
              <h2 className="text-base font-bold text-white">
                {MONTHS[current.month]} {current.year}
              </h2>
              <button onClick={goToToday}
                className="text-xs px-2.5 py-1 rounded-lg bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/40 transition-colors">
                Today
              </button>
            </div>
            <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
              <FiChevronRight size={18} />
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAYS.map(d => (
              <div key={d} className="text-center text-xs font-semibold text-slate-500 py-2">{d}</div>
            ))}
          </div>

          {/* Grid */}
          <div className="grid grid-cols-7 gap-1">
            {cells.map((cell, idx) => {
              if (!cell.currentMonth) {
                return (
                  <div key={idx} className="min-h-[80px] rounded-xl p-1.5 opacity-20">
                    <span className="text-xs text-slate-600">{cell.day}</span>
                  </div>
                );
              }
              const dayTasks = getTasksForDay(current.year, current.month, cell.day);
              const todayCell = isToday(current.year, current.month, cell.day);
              const selectedCell = isSelected(current.year, current.month, cell.day);
              const hasOverdue = dayTasks.some(t =>
                t.status !== 'completed' && new Date(t.due_date) < today
              );

              return (
                <div
                  key={idx}
                  onClick={() => setSelectedDay(
                    selectedCell ? null : { year: current.year, month: current.month, day: cell.day }
                  )}
                  onMouseEnter={() => setHoveredDay(`${current.year}-${current.month}-${cell.day}`)}
                  onMouseLeave={() => setHoveredDay(null)}
                  className={`min-h-[80px] rounded-xl p-1.5 cursor-pointer transition-all border ${
                    selectedCell
                      ? 'bg-indigo-600/20 border-indigo-500'
                      : todayCell
                      ? 'bg-slate-700/60 border-slate-500'
                      : 'border-transparent hover:bg-slate-700/40 hover:border-slate-600'
                  }`}
                >
                  {/* Day number */}
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full ${
                      todayCell ? 'bg-indigo-600 text-white' : 'text-slate-300'
                    }`}>
                      {cell.day}
                    </span>
                    {hasOverdue && (
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500" title="Has overdue tasks" />
                    )}
                  </div>

                  {/* Task dots/pills */}
                  <div className="space-y-0.5">
                    {dayTasks.slice(0, 3).map(task => (
                      <div
                        key={task.id}
                        className={`text-[10px] px-1.5 py-0.5 rounded-md border truncate leading-tight ${STATUS_BG[task.status] || 'bg-slate-700/60 border-slate-600'}`}
                        style={{ borderLeftColor: STATUS_COLORS[task.status], borderLeftWidth: 2 }}
                        title={task.title}
                      >
                        <span className="text-white/80">{task.title}</span>
                      </div>
                    ))}
                    {dayTasks.length > 3 && (
                      <div className="text-[10px] text-indigo-400 px-1.5">
                        +{dayTasks.length - 3} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Side panel — selected day tasks */}
        <div className="w-72 flex-shrink-0">
          {selectedDay ? (
            <div className="card p-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm font-bold text-white">
                    {MONTHS[selectedDay.month]} {selectedDay.day}, {selectedDay.year}
                  </p>
                  <p className="text-xs text-slate-500">
                    {selectedTasks.length} task{selectedTasks.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <button onClick={() => setSelectedDay(null)} className="text-slate-500 hover:text-white text-xs">✕</button>
              </div>

              {selectedTasks.length === 0 ? (
                <div className="text-center py-8">
                  <FiCalendar size={24} className="text-slate-600 mx-auto mb-2" />
                  <p className="text-xs text-slate-500">No tasks due this day</p>
                  {canCreateTasks && (
                    <Link
                      to={`/tasks/create/${projectId}`}
                      className="mt-3 inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300">
                      <FiPlus size={12} /> Add a task
                    </Link>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedTasks.map(task => {
                    const isOverdue = task.due_date && new Date(task.due_date) < today && task.status !== 'completed';
                    return (
                      <Link
                        key={task.id}
                        to={`/tasks/${task.id}`}
                        className="block p-3 rounded-xl bg-slate-700/50 hover:bg-slate-700 border border-slate-600/50 hover:border-indigo-500/40 transition-all"
                      >
                        <div className="flex items-start gap-2 mb-2">
                          <div className="w-2 h-2 rounded-full flex-shrink-0 mt-1"
                            style={{ background: PRIORITY_COLORS[task.priority] || '#94a3b8' }} />
                          <p className="text-xs font-semibold text-white leading-snug flex-1">
                            {task.title}
                          </p>
                        </div>
                        <div className="flex items-center justify-between">
                          <span
                            className="text-[10px] px-2 py-0.5 rounded-full border"
                            style={{
                              color: STATUS_COLORS[task.status],
                              borderColor: STATUS_COLORS[task.status] + '40',
                              background: STATUS_COLORS[task.status] + '15',
                            }}
                          >
                            {task.status?.replace('_', ' ')}
                          </span>
                          {isOverdue && (
                            <span className="text-[10px] text-red-400 flex items-center gap-0.5">
                              <FiClock size={9} /> Overdue
                            </span>
                          )}
                        </div>
                        {task.assignees?.length > 0 && (
                          <div className="flex -space-x-1.5 mt-2">
                            {task.assignees.slice(0, 4).map(a => (
                              <Avatar key={a.id || a}
                                user={typeof a === 'object' ? a : { id: a, username: `U${a}` }}
                                size={5} />
                            ))}
                          </div>
                        )}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="card p-4">
              <p className="text-xs font-semibold text-slate-400 mb-3">Upcoming Tasks</p>
              <div className="space-y-2">
                {tasks
                  .filter(t => t.due_date && t.status !== 'completed')
                  .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
                  .slice(0, 8)
                  .map(task => {
                    const d = new Date(task.due_date);
                    const isOverdue = d < today;
                    return (
                      <Link key={task.id} to={`/tasks/${task.id}`}
                        className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-slate-700/50 transition-colors group">
                        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ background: STATUS_COLORS[task.status] }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-white truncate group-hover:text-indigo-300 transition-colors">
                            {task.title}
                          </p>
                          <p className={`text-[10px] mt-0.5 ${isOverdue ? 'text-red-400' : 'text-slate-500'}`}>
                            {isOverdue ? '⚠ ' : ''}
                            {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </p>
                        </div>
                      </Link>
                    );
                  })}
                {tasks.filter(t => t.due_date && t.status !== 'completed').length === 0 && (
                  <p className="text-xs text-slate-600 text-center py-4">No upcoming tasks</p>
                )}
              </div>
            </div>
          )}

          {/* Legend */}
          <div className="card p-4 mt-3">
            <p className="text-xs font-semibold text-slate-400 mb-3">Status Legend</p>
            <div className="space-y-1.5">
              {Object.entries(STATUS_COLORS).map(([status, color]) => (
                <div key={status} className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                  <span className="text-xs text-slate-400 capitalize">{status.replace('_', ' ')}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
