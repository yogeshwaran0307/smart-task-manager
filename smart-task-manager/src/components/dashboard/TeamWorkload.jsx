import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { usersAPI, departmentsAPI } from '../../api/users';
import { PageHeader, PageLoading, Avatar } from '../common/ui';
import { FiUsers, FiSearch, FiCheckSquare, FiFolder, FiClock, FiCheckCircle, FiActivity } from 'react-icons/fi';

function WorkloadBar({ done, inProgress, pending, total }) {
  if (total === 0) return <div className="w-full h-2 rounded-full bg-slate-700" />;
  const dPct = Math.round((done / total) * 100);
  const iPct = Math.round((inProgress / total) * 100);
  const pPct = 100 - dPct - iPct;
  return (
    <div className="flex h-2 rounded-full overflow-hidden w-full bg-slate-700">
      {dPct > 0 && <div className="bg-emerald-500 transition-all" style={{ width: `${dPct}%` }} title={`Done: ${done}`} />}
      {iPct > 0 && <div className="bg-blue-500 transition-all" style={{ width: `${iPct}%` }} title={`In Progress: ${inProgress}`} />}
      {pPct > 0 && <div className="bg-amber-500/60 transition-all" style={{ width: `${pPct}%` }} title={`Pending: ${pending}`} />}
    </div>
  );
}

export default function TeamWorkload() {
  const { isAdmin, isManager, isHOD } = useAuth();
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [sortBy, setSortBy] = useState('name'); // name | tasks | projects

  const load = () => {
    setLoading(true);
    Promise.all([
      usersAPI.workload({ search, department: deptFilter, role: roleFilter }),
      departmentsAPI.list().catch(() => ({ data: [] })),
    ])
      .then(([wRes, dRes]) => {
        setUsers(wRes.data || []);
        setDepartments(dRes.data || []);
      })
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [search, deptFilter, roleFilter]);

  const sorted = [...users].sort((a, b) => {
    if (sortBy === 'tasks') return (b.task_stats?.total || 0) - (a.task_stats?.total || 0);
    if (sortBy === 'projects') return (b.project_stats?.total || 0) - (a.project_stats?.total || 0);
    const na = a.first_name ? `${a.first_name} ${a.last_name || ''}` : a.username;
    const nb = b.first_name ? `${b.first_name} ${b.last_name || ''}` : b.username;
    return na.localeCompare(nb);
  });

  const totalTasks = users.reduce((s, u) => s + (u.task_stats?.total || 0), 0);
  const totalProjects = users.reduce((s, u) => s + (u.project_stats?.total || 0), 0);
  const totalDone = users.reduce((s, u) => s + (u.task_stats?.done || 0), 0);

  const ROLES = ['admin', 'manager', 'head_of_department', 'senior', 'junior', 'employee'];

  return (
    <div>
      <PageHeader
        title="Team Workload"
        subtitle={isAdmin || isManager
          ? 'Task and project assignments across all team members'
          : 'Task and project assignments for your department'}
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Team Members', value: users.length, icon: FiUsers, color: 'text-indigo-400 bg-indigo-900/20 border-indigo-700/30' },
          { label: 'Total Tasks', value: totalTasks, icon: FiCheckSquare, color: 'text-blue-400 bg-blue-900/20 border-blue-700/30' },
          { label: 'Tasks Done', value: totalDone, icon: FiCheckCircle, color: 'text-emerald-400 bg-emerald-900/20 border-emerald-700/30' },
          { label: 'Total Projects', value: totalProjects, icon: FiFolder, color: 'text-amber-400 bg-amber-900/20 border-amber-700/30' },
        ].map(s => (
          <div key={s.label} className={`rounded-2xl border p-4 ${s.color}`}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium opacity-70 uppercase tracking-wider">{s.label}</p>
              <s.icon size={15} />
            </div>
            <p className="text-2xl font-bold">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px]">
          <FiSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-9"
            placeholder="Search members…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {(isAdmin || isManager) && (
          <select className="select w-auto" value={deptFilter} onChange={e => setDeptFilter(e.target.value)}>
            <option value="">All Departments</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        )}
        <select className="select w-auto" value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
          <option value="">All Roles</option>
          {ROLES.map(r => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
        </select>
        <select className="select w-auto" value={sortBy} onChange={e => setSortBy(e.target.value)}>
          <option value="name">Sort: Name</option>
          <option value="tasks">Sort: Most Tasks</option>
          <option value="projects">Sort: Most Projects</option>
        </select>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> Done</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" /> In Progress</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500/60 inline-block" /> Pending</span>
      </div>

      {loading ? <PageLoading /> : sorted.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <FiUsers size={32} className="mx-auto mb-3 opacity-40" />
          <p>No team members found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map(u => {
            const name = u.first_name ? `${u.first_name} ${u.last_name || ''}`.trim() : u.username;
            const ts = u.task_stats || { total: 0, pending: 0, in_progress: 0, done: 0 };
            const ps = u.project_stats || { total: 0, active: 0 };
            const completionPct = ts.total > 0 ? Math.round((ts.done / ts.total) * 100) : 0;

            return (
              <div key={u.id} className="card p-4 hover:border-slate-600 transition-colors">
                <div className="flex items-center gap-4">
                  {/* Avatar + name */}
                  <Avatar user={u} size={10} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <p className="text-sm font-semibold text-white truncate">{name}</p>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-400 capitalize">
                        {(u.role || 'employee').replace(/_/g, ' ')}
                      </span>
                      {u.department_name && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-900/30 text-indigo-400 border border-indigo-700/30">
                          {u.department_name}
                        </span>
                      )}
                      {u.is_active === false && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-red-900/30 text-red-400">Inactive</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">{u.email || u.username}</p>

                    {/* Task workload bar */}
                    <div className="mt-2">
                      <WorkloadBar
                        done={ts.done}
                        inProgress={ts.in_progress}
                        pending={ts.pending}
                        total={ts.total}
                      />
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-4 shrink-0">
                    {/* Tasks breakdown */}
                    <div className="text-center hidden sm:block">
                      <p className="text-lg font-bold text-white">{ts.total}</p>
                      <p className="text-xs text-slate-500">Tasks</p>
                      <div className="flex gap-1 mt-1 text-xs">
                        <span className="text-emerald-400">{ts.done}✓</span>
                        <span className="text-blue-400">{ts.in_progress}↻</span>
                        <span className="text-amber-400">{ts.pending}⏳</span>
                      </div>
                    </div>

                    {/* Projects */}
                    <div className="text-center hidden sm:block">
                      <p className="text-lg font-bold text-white">{ps.total}</p>
                      <p className="text-xs text-slate-500">Projects</p>
                      <p className="text-xs text-indigo-400 mt-1">{ps.active} active</p>
                    </div>

                    {/* Completion % */}
                    <div className="text-center">
                      <p className={`text-lg font-bold ${completionPct >= 75 ? 'text-emerald-400' : completionPct >= 40 ? 'text-blue-400' : 'text-amber-400'}`}>
                        {completionPct}%
                      </p>
                      <p className="text-xs text-slate-500">Done</p>
                    </div>
                  </div>
                </div>

                {/* Mobile stats row */}
                <div className="flex gap-4 mt-3 pt-3 border-t border-slate-700/50 sm:hidden text-xs text-slate-400">
                  <span className="flex items-center gap-1"><FiCheckSquare size={11} /> {ts.total} tasks</span>
                  <span className="flex items-center gap-1"><FiFolder size={11} /> {ps.total} projects</span>
                  <span className="flex items-center gap-1"><FiActivity size={11} /> {completionPct}% done</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
