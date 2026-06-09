import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { FiClock, FiCalendar, FiRefreshCw, FiDownload, FiUser } from 'react-icons/fi';

const API = import.meta.env.VITE_API_URL || '';

function getAuthHeader() {
  const token = localStorage.getItem('auth_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchTimesheets(dateFrom, dateTo) {
  const res = await fetch(`${API}/api/jibble/timesheets/?from=${dateFrom}&to=${dateTo}`, {
    headers: getAuthHeader(),
  });
  const data = await res.json();
  return data.timesheets || [];
}

async function fetchAttendance(dateFrom, dateTo) {
  const today = new Date().toISOString().split('T')[0];
  const isToday = dateFrom === today && dateTo === today;
  const url = isToday
    ? `${API}/api/jibble/live/`
    : `${API}/api/jibble/attendance/?from=${dateFrom}&to=${dateTo}`;
  const res = await fetch(url, { headers: getAuthHeader() });
  const data = await res.json();
  return data.attendance || [];
}

function formatHours(seconds) {
  if (!seconds) return '0h 0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function formatTime(isoString) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

function formatDate(isoString) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function getDateRange(period) {
  const today = new Date();
  const fmt = (d) => d.toISOString().split('T')[0];

  if (period === 'today') {
    return { from: fmt(today), to: fmt(today) };
  }
  if (period === 'week') {
    const start = new Date(today);
    const day = today.getDay();
    const daysFromMonday = day === 0 ? 6 : day - 1;
    start.setDate(today.getDate() - daysFromMonday);
    return { from: fmt(start), to: fmt(today) };
  }
  if (period === 'month') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: fmt(start), to: fmt(today) };
  }
  return { from: fmt(today), to: fmt(today) };
}

export default function Timesheet() {
  const { user, isAdmin, isManager } = useAuth();
  const [period, setPeriod] = useState('today');
  const [timesheets, setTimesheets] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('attendance');
  const [search, setSearch] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  const canManage = isAdmin || isManager;

  const load = async () => {
    setLoading(true);
    const { from, to } = getDateRange(period);
    try {
      const [ts, att] = await Promise.all([
        fetchTimesheets(from, to),
        fetchAttendance(from, to),
      ]);
      setTimesheets(ts);
      setAttendance(att);
    } catch {
      setTimesheets([]);
      setAttendance([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [period]);

  const handleImport = async () => {
    if (!window.confirm('Import all Jibble employees as users? Default password: Welcome@123')) return;
    setImporting(true);
    try {
      const res = await fetch(`${API}/api/jibble/import-users/`, {
        method: 'POST',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      setImportResult(data);
    } catch {
      setImportResult({ error: 'Import failed' });
    } finally {
      setImporting(false);
    }
  };

  // Filter attendance by search
  const filteredAttendance = attendance.filter(a =>
    !search || (a.name || '').toLowerCase().includes(search.toLowerCase())
  );

  // Filter timesheets by search
  const filteredTimesheets = timesheets.filter(t =>
    !search || (t.personName || t.name || '').toLowerCase().includes(search.toLowerCase())
  );

  // Summary stats
  const totalIn = attendance.filter(a => a.isIn).length;
  const totalOut = attendance.filter(a => !a.isIn).length;
  const totalHours = timesheets.reduce((sum, t) => sum + (t.totalSeconds || t.total || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Timesheet</h1>
          <p className="text-sm text-slate-400">Live attendance and work hours from Jibble</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="btn btn-secondary flex items-center gap-2" disabled={loading}>
            <FiRefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          {canManage && (
            <button onClick={handleImport} className="btn btn-primary" disabled={importing}>
              <FiUser size={14} /> {importing ? 'Importing…' : 'Import from Jibble'}
            </button>
          )}
        </div>
      </div>

      {/* Import Result */}
      {importResult && (
        <div className="card p-4 border-indigo-500/30">
          {importResult.error ? (
            <p className="text-red-400">{importResult.error}</p>
          ) : (
            <div className="space-y-2">
              <p className="text-emerald-400 font-semibold">
                ✅ Import complete — {importResult.created_count} created, {importResult.skipped_count} skipped
              </p>
              <p className="text-slate-400 text-sm">Default password: <span className="text-white font-mono">{importResult.default_password}</span></p>
              {importResult.created?.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs text-slate-500 mb-1">Created users:</p>
                  <div className="flex flex-wrap gap-2">
                    {importResult.created.map((u, i) => (
                      <span key={i} className="text-xs bg-slate-700 px-2 py-1 rounded-lg text-slate-300">
                        {u.name} → <span className="font-mono text-indigo-300">{u.username}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <button onClick={() => setImportResult(null)} className="text-xs text-slate-500 hover:text-slate-300 mt-1">Dismiss</button>
            </div>
          )}
        </div>
      )}

      {/* Period Selector */}
      <div className="flex items-center gap-2 flex-wrap">
        {['today', 'week', 'month'].map(p => (
          <button key={p} onClick={() => setPeriod(p)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              period === p ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}>
            {p === 'today' ? 'Today' : p === 'week' ? 'This Week' : 'This Month'}
          </button>
        ))}
        <div className="ml-auto">
          <input
            className="input w-48"
            placeholder="Search employee…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-4">
          <p className="text-xs text-slate-400 mb-1">Clocked In</p>
          <p className="text-2xl font-bold text-emerald-400">{totalIn}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-slate-400 mb-1">Clocked Out</p>
          <p className="text-2xl font-bold text-slate-300">{totalOut}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-slate-400 mb-1">Total Employees</p>
          <p className="text-2xl font-bold text-white">{attendance.length}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-slate-400 mb-1">Total Hours</p>
          <p className="text-2xl font-bold text-indigo-400">{formatHours(totalHours)}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-700">
        {['attendance', 'timesheets'].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? 'border-indigo-500 text-indigo-300'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}>
            {tab === 'attendance' ? '🟢 Live Attendance' : '📊 Timesheets'}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full w-8 h-8 border-2 border-slate-600 border-t-indigo-500" />
        </div>
      ) : activeTab === 'attendance' ? (
        <div className="card overflow-hidden">
          <table className="table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Position</th>
                <th>Status</th>
                <th>Clock In</th>
                <th>Clock Out</th>
                <th>Activity</th>
                <th>Project</th>
              </tr>
            </thead>
            <tbody>
              {filteredAttendance.length === 0 ? (
                <tr><td colSpan={7} className="text-center text-slate-500 py-8">No attendance data</td></tr>
              ) : filteredAttendance.map((a, i) => (
                <tr key={i}>
                  <td className="font-medium text-white">{a.name}</td>
                  <td className="text-slate-400">{a.position || '—'}</td>
                  <td>
                    <span className={`badge ${a.isIn ? 'badge-active' : 'bg-slate-600/30 text-slate-400'}`}>
                      {a.isIn ? '🟢 In' : '⚪ Out'}
                    </span>
                  </td>
                  <td className="text-slate-300">{formatTime(a.clockIn)}</td>
                  <td className="text-slate-300">{formatTime(a.clockOut)}</td>
                  <td className="text-slate-400">{a.activity || '—'}</td>
                  <td className="text-slate-400">{a.project || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Date</th>
                <th>Total Hours</th>
                <th>Clock In</th>
                <th>Clock Out</th>
                <th>Activity</th>
              </tr>
            </thead>
            <tbody>
              {filteredTimesheets.length === 0 ? (
                <tr><td colSpan={6} className="text-center text-slate-500 py-8">No timesheet data</td></tr>
              ) : filteredTimesheets.map((t, i) => (
                <tr key={i}>
                  <td className="font-medium text-white">{t.personName || t.name || '—'}</td>
                  <td className="text-slate-300">{formatDate(t.date || t.startTime)}</td>
                  <td className="text-indigo-300 font-semibold">{formatHours(t.totalSeconds || t.total || 0)}</td>
                  <td className="text-slate-300">{formatTime(t.startTime || t.clockIn)}</td>
                  <td className="text-slate-300">{formatTime(t.endTime || t.clockOut)}</td>
                  <td className="text-slate-400">{t.activityName || t.activity || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}