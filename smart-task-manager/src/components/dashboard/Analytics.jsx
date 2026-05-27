import { useState, useEffect } from 'react';
import { projectsAPI } from '../../api/projects';
import { useAuth } from '../../context/AuthContext';
import {
  FiBarChart2, FiRefreshCw, FiTrendingUp, FiCheckSquare,
  FiFolder, FiClock, FiInfo, FiUser, FiAlertCircle,
} from 'react-icons/fi';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';

const PIE_COLORS = ['#f59e0b', '#6366f1', '#10b981'];

function StatCard({ icon: Icon, label, value, color = 'indigo', sub }) {
  const colors = {
    indigo: 'bg-indigo-900/30 text-indigo-400 border-indigo-700/30',
    emerald: 'bg-emerald-900/30 text-emerald-400 border-emerald-700/30',
    amber:   'bg-amber-900/30 text-amber-400 border-amber-700/30',
    blue:    'bg-blue-900/30 text-blue-400 border-blue-700/30',
    rose:    'bg-rose-900/30 text-rose-400 border-rose-700/30',
  };
  return (
    <div className={`rounded-2xl border p-4 ${colors[color] || colors.indigo}`}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium opacity-70 uppercase tracking-wider">{label}</p>
        <Icon size={16} />
      </div>
      <p className="text-2xl font-bold">{value}</p>
      {sub && <p className="text-xs opacity-60 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function Analytics() {
  const { user, isAdmin, isManager, isHOD } = useAuth();
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');

  const isPrivileged = isAdmin || isManager;
  const isEmployee   = !isPrivileged && !isHOD;   // senior / junior / employee

  const load = () => {
    setLoading(true);
    setError('');
    projectsAPI.getAnalytics()
      .then(r => setData(r.data))
      .catch(e => setError(e.response?.data?.error || 'Failed to load analytics'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const scopeLabel =
    data?.scope ||
    (isPrivileged ? 'Company-wide' : isHOD ? 'Your Department' : 'Your Assignments');

  const stats = data?.stats || {};
  const completionPct =
    stats.total_tasks > 0
      ? Math.round((stats.completed_tasks / stats.total_tasks) * 100)
      : 0;

  return (
    <div className="max-w-5xl mx-auto">
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <FiBarChart2 size={20} className="text-indigo-400" />
            Analytics
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-sm text-slate-400">Performance overview</p>
            <span className="px-2 py-0.5 bg-indigo-900/40 text-indigo-300 border border-indigo-700/40 rounded-full text-xs">
              {scopeLabel}
            </span>
          </div>
        </div>
        <button
          onClick={load}
          className="p-2 rounded-xl hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
        >
          <FiRefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* ── Scope info banner ── */}
      {isEmployee && (
        <div className="mb-5 p-3 bg-indigo-900/10 border border-indigo-700/30 rounded-xl flex items-start gap-2">
          <FiUser size={14} className="text-indigo-400 mt-0.5 shrink-0" />
          <p className="text-xs text-indigo-300">
            Showing analytics for tasks and projects assigned to you.
          </p>
        </div>
      )}
      {isHOD && (
        <div className="mb-5 p-3 bg-purple-900/10 border border-purple-700/30 rounded-xl flex items-start gap-2">
          <FiInfo size={14} className="text-purple-400 mt-0.5 shrink-0" />
          <p className="text-xs text-purple-300">
            Showing data for your department only. Admins and Managers can view company-wide analytics.
          </p>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-900/20 border border-red-700/40 rounded-xl flex items-center gap-2 text-sm text-red-300">
          <FiAlertCircle size={14} className="shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full w-8 h-8 border-2 border-slate-600 border-t-indigo-500" />
        </div>
      ) : data ? (
        <div className="space-y-6">

          {/* ── Stat Cards ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard
              icon={FiFolder}
              label={isEmployee ? 'My Projects' : 'Total Projects'}
              value={stats.total_projects ?? 0}
              color="indigo"
            />
            <StatCard
              icon={FiTrendingUp}
              label="Active Projects"
              value={stats.active_projects ?? 0}
              color="blue"
            />
            <StatCard
              icon={FiCheckSquare}
              label={isEmployee ? 'My Tasks Done' : 'Tasks Done'}
              value={stats.completed_tasks ?? 0}
              color="emerald"
              sub={`of ${stats.total_tasks ?? 0} total`}
            />
            <StatCard
              icon={FiClock}
              label="In Progress"
              value={stats.in_progress_tasks ?? 0}
              color="amber"
            />
          </div>

          {/* ── Employee personal summary strip ── */}
          {isEmployee && (
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-slate-800 rounded-2xl border border-slate-700 p-4 text-center">
                <p className="text-2xl font-bold text-white">{completionPct}%</p>
                <p className="text-xs text-slate-500 mt-1">My Completion Rate</p>
              </div>
              <div className="bg-slate-800 rounded-2xl border border-slate-700 p-4 text-center">
                <p className="text-2xl font-bold text-white">{stats.pending_tasks ?? 0}</p>
                <p className="text-xs text-slate-500 mt-1">Pending Tasks</p>
              </div>
              <div className="bg-slate-800 rounded-2xl border border-slate-700 p-4 text-center">
                <p className={`text-2xl font-bold ${(stats.overdue_tasks ?? 0) > 0 ? 'text-rose-400' : 'text-white'}`}>
                  {stats.overdue_tasks ?? 0}
                </p>
                <p className="text-xs text-slate-500 mt-1">Overdue Tasks</p>
              </div>
            </div>
          )}

          {/* ── Charts ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Weekly activity bar chart */}
            <div className="bg-slate-800 rounded-2xl border border-slate-700 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-white">
                  {isEmployee ? 'My Weekly Task Activity' : 'Weekly Task Activity'}
                </h3>
                <span className="text-xs text-slate-500">Last 7 days</span>
              </div>
              <div className="flex items-center gap-4 mb-3">
                <span className="flex items-center gap-1.5 text-xs text-slate-400">
                  <span className="w-3 h-3 rounded-sm inline-block" style={{ background: '#6366f1' }} /> Created
                </span>
                <span className="flex items-center gap-1.5 text-xs text-slate-400">
                  <span className="w-3 h-3 rounded-sm inline-block" style={{ background: '#10b981' }} /> Completed
                </span>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.charts.weekly_tasks}>
                  <XAxis dataKey="day" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 12, fontSize: 12 }}
                    labelFormatter={(label, payload) => {
                      const date = payload?.[0]?.payload?.date;
                      return date ? `${label} (${date})` : label;
                    }}
                  />
                  <Bar dataKey="created"   name="Created"   fill="#6366f1" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="completed" name="Completed" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Status distribution pie chart */}
            <div className="bg-slate-800 rounded-2xl border border-slate-700 p-5">
              <h3 className="text-sm font-semibold text-white mb-4">
                {isEmployee ? 'My Task Status' : 'Task Status Distribution'}
              </h3>
              {(stats.total_tasks ?? 0) === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-slate-500 text-sm gap-2">
                  <FiCheckSquare size={28} className="opacity-30" />
                  {isEmployee ? 'No tasks assigned to you yet.' : 'No tasks found.'}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={data.charts.status_distribution}
                      cx="50%" cy="50%" outerRadius={70}
                      dataKey="value" nameKey="name"
                      label={({ name, value }) => value > 0 ? `${name}: ${value}` : ''}
                    >
                      {data.charts.status_distribution.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 12, fontSize: 12 }} />
                    <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-slate-400 text-xs">{v}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* ── Bottom summary strip (admin / manager / HOD) ── */}
          {!isEmployee && (
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-slate-800 rounded-2xl border border-slate-700 p-4 text-center">
                <p className="text-2xl font-bold text-white">{completionPct}%</p>
                <p className="text-xs text-slate-500 mt-1">Completion Rate</p>
              </div>
              <div className="bg-slate-800 rounded-2xl border border-slate-700 p-4 text-center">
                <p className="text-2xl font-bold text-white">{stats.pending_tasks ?? 0}</p>
                <p className="text-xs text-slate-500 mt-1">Pending Tasks</p>
              </div>
              <div className="bg-slate-800 rounded-2xl border border-slate-700 p-4 text-center">
                <p className="text-2xl font-bold text-white">{stats.completed_projects ?? 0}</p>
                <p className="text-xs text-slate-500 mt-1">Completed Projects</p>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
