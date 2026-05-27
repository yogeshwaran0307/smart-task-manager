export function LoadingSpinner({ size = 'md', className = '' }) {
  const sizes = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-10 h-10' };
  return (
    <div className={`${sizes[size]} ${className} animate-spin rounded-full border-2 border-slate-600 border-t-indigo-500`} />
  );
}

export function PageLoading() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <LoadingSpinner size="lg" className="mx-auto mb-3" />
        <p className="text-slate-500 text-sm">Loading…</p>
      </div>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-14 h-14 rounded-2xl bg-slate-700/50 flex items-center justify-center mb-4">
        {Icon && <Icon size={24} className="text-slate-500" />}
      </div>
      <h3 className="text-base font-semibold text-slate-300 mb-1">{title}</h3>
      {description && <p className="text-sm text-slate-500 mb-4 max-w-xs">{description}</p>}
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, back }) {
  return (
    <div className="flex items-start justify-between mb-6 gap-4">
      <div className="flex items-start gap-3">
        {back && (
          <button
            onClick={back.onClick}
            className="mt-0.5 p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
          >
            ←
          </button>
        )}
        <div>
          <h1 className="text-xl font-bold text-white">{title}</h1>
          {subtitle && <p className="text-sm text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
  );
}

export function StatusBadge({ status }) {
  const map = {
    active: 'badge-active', on_hold: 'badge-on_hold', in_review: 'badge-in_review',
    completed: 'badge-completed', archived: 'badge-archived',
    todo: 'badge-todo', in_progress: 'badge-in_progress', pending: 'badge-pending',
    low: 'badge-low', medium: 'badge-medium', high: 'badge-high', urgent: 'badge-urgent',
  };
  const labels = {
    active: 'Active', on_hold: 'On Hold', in_review: 'In Review', completed: 'Completed',
    archived: 'Archived', todo: 'To Do', in_progress: 'In Progress', pending: 'Pending',
    low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent',
  };
  return (
    <span className={`badge ${map[status] || 'badge-todo'}`}>
      {labels[status] || status}
    </span>
  );
}

export function Avatar({ user, size = 8 }) {
  const initials = user
    ? (user.first_name?.[0] || user.username?.[0] || '?').toUpperCase()
    : '?';
  const colors = ['bg-indigo-600', 'bg-violet-600', 'bg-blue-600', 'bg-emerald-600', 'bg-pink-600', 'bg-amber-600'];
  const color = colors[(user?.id || 0) % colors.length];
  return (
    <div className={`w-${size} h-${size} rounded-full ${color} flex items-center justify-center text-xs font-bold text-white flex-shrink-0`}
      title={user?.username}>
      {initials}
    </div>
  );
}

export function StatCard({ icon: Icon, label, value, sub, color = 'indigo' }) {
  const bg = { indigo: 'bg-indigo-500/20', blue: 'bg-blue-500/20', emerald: 'bg-emerald-500/20', red: 'bg-red-500/20', amber: 'bg-amber-500/20' };
  const text = { indigo: 'text-indigo-400', blue: 'text-blue-400', emerald: 'text-emerald-400', red: 'text-red-400', amber: 'text-amber-400' };
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 ${bg[color]} rounded-xl flex items-center justify-center`}>
          {Icon && <Icon size={18} className={text[color]} />}
        </div>
      </div>
      <p className="text-3xl font-bold text-white font-mono">{value ?? '—'}</p>
      <p className="text-sm text-slate-400 mt-1">{label}</p>
      {sub && <div className={`mt-1.5 text-xs ${text[color]}`}>{sub}</div>}
    </div>
  );
}

export function ProgressBar({ value, max, className = '' }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className={`progress-bar ${className}`}>
      <div className="progress-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}
