import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { projectsAPI } from '../../api/projects';
import api from '../../api/axios';
import { FiFolder, FiCheckSquare, FiClock, FiTrendingUp, FiPlus, FiThumbsUp, FiInfo, FiRefreshCw, FiLogIn, FiLogOut, FiBriefcase } from 'react-icons/fi';

function StatCard({ icon: Icon, label, value, color, note }) {
  const c = { indigo: 'text-indigo-400 bg-indigo-900/30 border-indigo-700/30', emerald: 'text-emerald-400 bg-emerald-900/30 border-emerald-700/30', amber: 'text-amber-400 bg-amber-900/30 border-amber-700/30', blue: 'text-blue-400 bg-blue-900/30 border-blue-700/30' }[color] || 'text-slate-400 bg-slate-700 border-slate-600';
  return (
    <div className={`rounded-2xl border p-4 ${c}`}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-medium opacity-70 uppercase tracking-wider">{label}</p>
        <Icon size={16} />
      </div>
      <p className="text-2xl font-bold">{value ?? '—'}</p>
      {note && <p className="text-xs opacity-60 mt-0.5">{note}</p>}
    </div>
  );
}

function JibbleAttendance() {
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all'); // all | in | out

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/api/jibble/live/');
      setPeople(res.data?.attendance ?? []);
    } catch {
      setError('Could not load attendance data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const formatTime = (iso) => {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleTimeString('en-IN', {
        hour: '2-digit', minute: '2-digit', hour12: true,
        timeZone: 'Asia/Kolkata',
      });
    } catch { return '—'; }
  };

  const clockedIn  = people.filter(p => p.isIn);
  const clockedOut = people.filter(p => !p.isIn);
  const displayed  = filter === 'in' ? clockedIn : filter === 'out' ? clockedOut : people;

  if (loading) return (
    <div className="bg-slate-800 rounded-2xl border border-slate-700 p-4">
      <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-emerald-500" /> Live Attendance — Jibble
      </h2>
      <div className="flex justify-center py-6">
        <div className="animate-spin rounded-full w-6 h-6 border-2 border-slate-600 border-t-emerald-500" />
      </div>
    </div>
  );

  if (error) return (
    <div className="bg-slate-800 rounded-2xl border border-red-700/40 p-4">
      <p className="text-xs text-red-400">{error}</p>
      <button onClick={load} className="mt-2 text-xs text-indigo-400 hover:text-indigo-300">Retry</button>
    </div>
  );

  return (
    <div className="bg-slate-800 rounded-2xl border border-slate-700 p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          Live Attendance — Jibble
        </h2>
        <button onClick={load} className="p-1 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
          <FiRefreshCw size={13} />
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <button onClick={() => setFilter('in')}
          className={`rounded-xl p-2.5 text-center border transition-colors ${filter === 'in' ? 'bg-emerald-900/40 border-emerald-600' : 'bg-emerald-900/20 border-emerald-700/30 hover:border-emerald-600'}`}>
          <p className="text-lg font-bold text-emerald-400">{clockedIn.length}</p>
          <p className="text-[10px] text-emerald-500">Clocked In</p>
        </button>
        <button onClick={() => setFilter('all')}
          className={`rounded-xl p-2.5 text-center border transition-colors ${filter === 'all' ? 'bg-slate-600/60 border-slate-500' : 'bg-slate-700/40 border-slate-600/40 hover:border-slate-500'}`}>
          <p className="text-lg font-bold text-slate-300">{people.length}</p>
          <p className="text-[10px] text-slate-500">Total</p>
        </button>
        <button onClick={() => setFilter('out')}
          className={`rounded-xl p-2.5 text-center border transition-colors ${filter === 'out' ? 'bg-red-900/40 border-red-600' : 'bg-red-900/20 border-red-700/30 hover:border-red-600'}`}>
          <p className="text-lg font-bold text-red-400">{clockedOut.length}</p>
          <p className="text-[10px] text-red-500">Clocked Out</p>
        </button>
      </div>

      {/* Employee list */}
      {displayed.length === 0 ? (
        <div className="text-center py-6 text-slate-500 text-xs">No attendance data</div>
      ) : (
        <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
          {displayed.map((person, i) => (
            <div key={person.id || i}
              className={`flex items-center gap-3 p-2.5 rounded-xl border ${
                person.isIn
                  ? 'bg-emerald-900/10 border-emerald-700/20'
                  : 'bg-slate-700/20 border-slate-700/30'
              }`}>
              {/* Avatar */}
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                person.isIn ? 'bg-emerald-700/40 text-emerald-300' : 'bg-slate-700 text-slate-400'
              }`}>
                {(person.name?.[0] || '?').toUpperCase()}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{person.name}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  {person.position && (
                    <span className="text-[10px] text-slate-500 flex items-center gap-0.5">
                      <FiBriefcase size={9} /> {person.position}
                    </span>
                  )}
                  {person.isIn && person.clockIn && (
                    <span className="text-[10px] text-emerald-400 flex items-center gap-0.5">
                      <FiLogIn size={9} /> {formatTime(person.clockIn)}
                    </span>
                  )}
                  {!person.isIn && person.clockOut && (
                    <span className="text-[10px] text-red-400 flex items-center gap-0.5">
                      <FiLogOut size={9} /> {formatTime(person.clockOut)}
                    </span>
                  )}
                  {person.activity && (
                    <span className="text-[10px] text-indigo-400 truncate max-w-[120px]">
                      {person.activity}
                    </span>
                  )}
                </div>
              </div>

              {/* Status */}
              <span className={`text-[10px] px-2 py-0.5 rounded-full border flex-shrink-0 ${
                person.isIn
                  ? 'text-emerald-400 bg-emerald-900/30 border-emerald-700/40'
                  : 'text-slate-500 bg-slate-700/40 border-slate-600/40'
              }`}>
                {person.isIn ? '● In' : '○ Out'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { user, isAdmin, isManager, isHOD, canCreate, canCreateProjects, canApprove } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const scopeLabel = isAdmin || isManager ? 'Company-wide' : isHOD ? 'Your Department' : 'Assigned to you';

  const load = () => {
    setLoading(true);
    projectsAPI.getDashboard()
      .then(r => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const displayName = user?.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : user?.username || 'there';

  return (
    <div className="max-w-5xl mx-auto">
      {/* Welcome */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Welcome back, {displayName} 👋</h1>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-sm text-slate-400">Here's your overview</p>
            <span className="px-2 py-0.5 bg-slate-700 text-slate-400 border border-slate-600 rounded-full text-xs capitalize">
              {scopeLabel}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 rounded-xl hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
            <FiRefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
          {canCreateProjects && (
            <Link to="/projects/create" className="btn-primary flex items-center gap-1.5 px-3 py-2 text-sm">
              <FiPlus size={15} /> New Project
            </Link>
          )}
          {canCreate && (
            <Link to="/tasks/create" className="flex items-center gap-1.5 px-3 py-2 text-sm bg-slate-700 hover:bg-slate-600 text-white rounded-xl transition-colors">
              <FiPlus size={15} /> New Task
            </Link>
          )}
        </div>
      </div>

      {!canCreate && (
        <div className="mb-4 p-3 bg-slate-700/30 border border-slate-600/40 rounded-xl flex items-start gap-2">
          <FiInfo size={14} className="text-slate-400 mt-0.5 shrink-0" />
          <p className="text-xs text-slate-400">
            Your role does not permit creating tasks or projects. Contact your Manager or Head of Department to create and assign work to you.
          </p>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full w-8 h-8 border-2 border-slate-600 border-t-indigo-500" />
        </div>
      ) : data ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard icon={FiFolder} label="Projects" value={data.stats.total_projects} color="indigo" />
            <StatCard icon={FiCheckSquare} label="Tasks Done" value={data.stats.completed_tasks} color="emerald" note={`of ${data.stats.total_tasks}`} />
            <StatCard icon={FiClock} label="In Progress" value={data.stats.in_progress_tasks} color="blue" />
            <StatCard icon={FiTrendingUp} label="Pending" value={data.stats.pending_tasks} color="amber" />
          </div>

          {canApprove && data.stats.pending_approvals > 0 && (
            <Link to="/approvals"
              className="flex items-center gap-3 p-4 bg-amber-900/20 border border-amber-700/40 rounded-2xl hover:bg-amber-900/30 transition-colors">
              <div className="w-9 h-9 rounded-xl bg-amber-900/40 flex items-center justify-center">
                <FiThumbsUp size={17} className="text-amber-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-300">
                  {data.stats.pending_approvals} item{data.stats.pending_approvals > 1 ? 's' : ''} awaiting your approval
                </p>
                <p className="text-xs text-amber-500 mt-0.5">Click to review and approve</p>
              </div>
            </Link>
          )}

          {data.projects?.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-white">Projects Overview</h2>
                <Link to="/projects" className="text-xs text-indigo-400 hover:text-indigo-300">View all →</Link>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {data.projects.slice(0, 6).map(p => (
                  <Link key={p.id} to={`/projects/${p.id}`}
                    className="bg-slate-800 rounded-2xl border border-slate-700 p-4 hover:border-slate-600 transition-colors">
                    <div className="flex items-start justify-between mb-2">
                      <p className="font-medium text-white text-sm truncate flex-1">{p.name}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full border ml-2 shrink-0 ${
                        p.status === 'active' || p.status === 'Active' ? 'bg-emerald-900/30 text-emerald-300 border-emerald-700/40' :
                        p.status === 'completed' || p.status === 'Completed' ? 'bg-indigo-900/30 text-indigo-300 border-indigo-700/40' :
                        'bg-slate-700 text-slate-400 border-slate-600'
                      }`}>{p.status}</span>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-1.5 mb-2">
                      <div className="bg-indigo-500 h-1.5 rounded-full transition-all"
                        style={{ width: `${p.progress_percentage || 0}%` }} />
                    </div>
                    <p className="text-xs text-slate-500">{p.completed_tasks}/{p.total_tasks} tasks • {p.progress_percentage || 0}%</p>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {data.recent_activity?.length > 0 && (isAdmin || isManager || isHOD) && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-white">Recent Activity</h2>
                <Link to="/activity" className="text-xs text-indigo-400 hover:text-indigo-300">View all →</Link>
              </div>
              <div className="bg-slate-800 rounded-2xl border border-slate-700 divide-y divide-slate-700/50">
                {data.recent_activity.slice(0, 5).map((a, i) => (
                  <div key={a.id || i} className="flex items-center gap-3 px-4 py-3">
                    <div className="w-6 h-6 rounded-full bg-indigo-900/40 flex items-center justify-center text-xs font-bold text-indigo-400 shrink-0">
                      {(a.user_name?.[0] || 'S').toUpperCase()}
                    </div>
                    <p className="text-sm text-slate-400 flex-1 line-clamp-1">{a.description}</p>
                    <span className="text-xs text-slate-600 shrink-0">{a.user_name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(isAdmin || isManager || isHOD) && <JibbleAttendance />}
        </div>
      ) : null}
    </div>
  );
}