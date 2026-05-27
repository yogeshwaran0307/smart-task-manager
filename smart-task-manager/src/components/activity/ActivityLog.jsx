import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Navigate } from 'react-router-dom';
import { activityAPI } from '../../api/activity';
import { FiActivity, FiRefreshCw, FiLock } from 'react-icons/fi';

export function ActivityLog() {
  const { canViewActivity, loading: authLoading } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  if (authLoading) return null;
  if (!canViewActivity) return <Navigate to="/dashboard" replace />;

  const load = () => {
    setLoading(true);
    activityAPI.list()
      .then(r => setLogs(Array.isArray(r.data) ? r.data : []))
      .catch(e => setError(e.response?.data?.error || 'Failed to load activity log'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const fmt = (ts) => {
    if (!ts) return '';
    const d = new Date(ts * 1000);
    return d.toLocaleString();
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <FiActivity size={20} className="text-indigo-400" />
            Activity Log
          </h1>
          <p className="text-sm text-slate-400 mt-1">Full system activity — visible to Admins & Managers only</p>
        </div>
        <button onClick={load} className="p-2 rounded-xl hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
          <FiRefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && <div className="mb-4 p-3 bg-red-900/20 border border-red-700/40 rounded-xl text-sm text-red-300">{error}</div>}

      <div className="bg-slate-800 rounded-2xl border border-slate-700 divide-y divide-slate-700/50">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full w-7 h-7 border-2 border-slate-600 border-t-indigo-500" />
          </div>
        ) : logs.length === 0 ? (
          <div className="py-16 text-center text-slate-500 text-sm">No activity recorded yet.</div>
        ) : (
          logs.map((log, i) => (
            <div key={log.id || i} className="flex items-start gap-3 px-5 py-3.5 hover:bg-slate-700/20 transition-colors">
              <div className="w-7 h-7 rounded-full bg-indigo-900/40 border border-indigo-700/40 flex items-center justify-center shrink-0 mt-0.5">
                <FiActivity size={12} className="text-indigo-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-200">{log.action || log.description}</p>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-xs text-slate-500">by {log.user || log.user_name || 'System'}</span>
                  {log.timestamp && <span className="text-xs text-slate-600">{fmt(log.timestamp)}</span>}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default ActivityLog;
