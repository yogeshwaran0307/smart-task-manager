import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { approvalsAPI, projectsAPI } from '../../api/projects';
import { tasksAPI, extensionAPI } from '../../api/tasks';
import {
  FiThumbsUp, FiThumbsDown, FiCheckCircle, FiFolder, FiCheckSquare,
  FiRefreshCw, FiAlertCircle, FiClock, FiX, FiEdit2, FiArrowRight, FiUser, FiList,
} from 'react-icons/fi';

// Human-readable field labels
const FIELD_LABELS = {
  title: 'Title',
  name: 'Name',
  description: 'Description',
  status: 'Status',
  priority: 'Priority',
  due_date: 'Due Date',
  eta: 'ETA',
  assignee_ids: 'Assignees',
  department_ids: 'Departments',
  project: 'Project',
};

// Format a raw value for display
function formatValue(key, value) {
  if (value === null || value === undefined || value === '') return '(empty)';
  if (Array.isArray(value)) {
    if (value.length === 0) return '(none)';
    return value.map(v => (typeof v === 'object' ? v.id ?? JSON.stringify(v) : v)).join(', ');
  }
  return String(value);
}

// Show old → new diff for pending_changes
function ChangesDiff({ item }) {
  const changes = item.pending_changes;
  if (!changes || Object.keys(changes).length === 0) return null;

  const rows = Object.entries(changes)
    .filter(([key]) => FIELD_LABELS[key]) // only show known fields
    .map(([key, newVal]) => ({
      label: FIELD_LABELS[key],
      oldVal: formatValue(key, item[key] ?? item[key.replace('_ids', '')]),
      newVal: formatValue(key, newVal),
    }))
    .filter(r => r.oldVal !== r.newVal); // skip unchanged

  if (rows.length === 0) return null;

  return (
    <div className="mb-4 rounded-xl border border-blue-700/30 bg-blue-900/10 overflow-hidden">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-blue-700/20">
        <FiEdit2 size={12} className="text-blue-400" />
        <span className="text-xs font-semibold text-blue-300">Requested Changes</span>
      </div>
      <div className="divide-y divide-slate-700/40">
        {rows.map(({ label, oldVal, newVal }) => (
          <div key={label} className="px-3 py-2 grid grid-cols-[80px_1fr_16px_1fr] items-start gap-1.5 text-xs">
            <span className="text-slate-500 font-medium pt-0.5">{label}</span>
            <span className="text-red-300/80 bg-red-900/20 rounded px-1.5 py-0.5 line-through break-words">{oldVal}</span>
            <FiArrowRight size={12} className="text-slate-500 mt-0.5 mx-auto" />
            <span className="text-emerald-300 bg-emerald-900/20 rounded px-1.5 py-0.5 break-words">{newVal}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ApprovalCard({ item, onApprove, onReject }) {
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [loading, setLoading] = useState(false);
  const isTask = item.item_type === 'task';
  const hasPendingEdit = item.edit_approval_status === 'pending';

  const handleApprove = async () => { setLoading(true); await onApprove(item); setLoading(false); };
  const handleReject = async () => {
    if (!showReject) { setShowReject(true); return; }
    setLoading(true); await onReject(item, rejectReason); setLoading(false); setShowReject(false);
  };

  return (
    <div className="bg-slate-800 rounded-2xl border border-slate-700 p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isTask ? 'bg-blue-900/40' : 'bg-purple-900/40'}`}>
            {isTask ? <FiCheckSquare size={15} className="text-blue-400" /> : <FiFolder size={15} className="text-purple-400" />}
          </div>
          <div>
            <p className="font-semibold text-white text-sm">{item.title || item.name}</p>
            <p className="text-xs text-slate-500 capitalize">{isTask ? 'Task' : 'Project'}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={`px-2 py-0.5 rounded-full text-xs border ${hasPendingEdit ? 'bg-blue-900/40 text-blue-300 border-blue-700/40' : 'bg-amber-900/40 text-amber-300 border-amber-700/40'}`}>
            {hasPendingEdit ? 'Edit Pending' : 'Awaiting Approval'}
          </span>
          {item.total_change_requests > 1 && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-indigo-900/40 text-indigo-300 border border-indigo-700/40">
              <FiList size={10} /> {item.change_queue_position} of {item.total_change_requests}
            </span>
          )}
        </div>
      </div>

      {/* Show diff for edit requests, basic info for new item requests */}
      {hasPendingEdit ? (
        <>
          {item.change_submitted_by_name && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-2">
              <FiUser size={11} />
              <span>Submitted by <span className="text-slate-300">{item.change_submitted_by_name}</span></span>
            </div>
          )}
          <ChangesDiff item={item} />
        </>
      ) : (
        <>
          {item.description && <p className="text-sm text-slate-400 mb-3 line-clamp-2">{item.description}</p>}
          <div className="flex flex-wrap gap-3 text-xs text-slate-500 mb-4">
            {item.due_date && <span>📅 {item.due_date}</span>}
            {item.eta && <span className="text-amber-400">⏱ ETA: {item.eta}</span>}
            {item.priority && <span>⚡ {item.priority}</span>}
          </div>
        </>
      )}

      {showReject && (
        <input value={rejectReason} onChange={e => setRejectReason(e.target.value)}
          className="input-field text-sm mb-3" placeholder="Rejection reason (optional)..." autoFocus />
      )}
      <div className="flex gap-2">
        <button onClick={handleApprove} disabled={loading}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-emerald-700/30 hover:bg-emerald-700/50 text-emerald-300 rounded-xl text-sm border border-emerald-700/40 transition-colors">
          <FiThumbsUp size={13} /> Approve
        </button>
        <button onClick={handleReject} disabled={loading}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-red-900/20 hover:bg-red-900/40 text-red-400 rounded-xl text-sm border border-red-800/40 transition-colors">
          <FiThumbsDown size={13} /> {showReject ? 'Confirm' : 'Reject'}
        </button>
        {showReject && (
          <button onClick={() => setShowReject(false)} className="px-3 py-2 rounded-xl text-sm text-slate-400 hover:text-white hover:bg-slate-700">
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

function ExtensionCard({ req, onApprove, onReject }) {
  const [reviewNote, setReviewNote] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleApprove = async () => {
    setLoading(true);
    await onApprove(req, reviewNote);
    setLoading(false);
  };
  const handleReject = async () => {
    if (!showReject) { setShowReject(true); return; }
    setLoading(true);
    await onReject(req, reviewNote);
    setLoading(false);
    setShowReject(false);
  };

  const daysOverdue = req.original_due_date
    ? Math.max(0, Math.ceil((new Date() - new Date(req.original_due_date)) / 86400000))
    : 0;

  return (
    <div className="bg-slate-800 rounded-2xl border border-amber-700/40 p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-amber-900/30">
            <FiClock size={15} className="text-amber-400" />
          </div>
          <div>
            <p className="font-semibold text-white text-sm">{req.item_name}</p>
            <p className="text-xs text-slate-500 capitalize">{req.content_type} · Extension Request</p>
          </div>
        </div>
        <span className="px-2 py-0.5 rounded-full text-xs border bg-amber-900/40 text-amber-300 border-amber-700/40">
          Pending Review
        </span>
      </div>

      <div className="mb-3 p-3 bg-slate-700/30 rounded-xl grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="text-slate-500 mb-0.5">Original Due Date</p>
          <p className="text-red-400 font-medium">{req.original_due_date} <span className="text-slate-500">({daysOverdue}d overdue)</span></p>
        </div>
        <div>
          <p className="text-slate-500 mb-0.5">Requested New Date</p>
          <p className="text-emerald-400 font-medium">{req.requested_new_date} <span className="text-slate-500">(+{req.days_requested}d)</span></p>
        </div>
        <div className="col-span-2">
          <p className="text-slate-500 mb-0.5">Requested by</p>
          <p className="text-slate-300">{req.requested_by?.name || req.requested_by?.username}</p>
        </div>
      </div>

      <div className="mb-3">
        <p className="text-xs text-slate-500 mb-1">Reason provided:</p>
        <p className="text-sm text-slate-300 bg-slate-700/30 rounded-lg p-2.5">{req.reason}</p>
      </div>

      {showReject && (
        <textarea
          value={reviewNote} onChange={e => setReviewNote(e.target.value)}
          rows={2} className="input-field text-sm mb-3 w-full resize-none"
          placeholder="Rejection reason (optional)..." autoFocus
        />
      )}
      {!showReject && (
        <input
          value={reviewNote} onChange={e => setReviewNote(e.target.value)}
          className="input-field text-sm mb-3 w-full" placeholder="Review note (optional)..."
        />
      )}

      <div className="flex gap-2">
        <button onClick={handleApprove} disabled={loading}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-emerald-700/30 hover:bg-emerald-700/50 text-emerald-300 rounded-xl text-sm border border-emerald-700/40 transition-colors">
          <FiThumbsUp size={13} /> Approve & Extend
        </button>
        <button onClick={handleReject} disabled={loading}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-red-900/20 hover:bg-red-900/40 text-red-400 rounded-xl text-sm border border-red-800/40 transition-colors">
          <FiThumbsDown size={13} /> {showReject ? 'Confirm Reject' : 'Reject'}
        </button>
        {showReject && (
          <button onClick={() => setShowReject(false)} className="px-3 py-2 rounded-xl text-sm text-slate-400 hover:text-white hover:bg-slate-700">
            <FiX size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

export default function ApprovalsPage() {
  const { canApprove } = useAuth();
  const [items, setItems] = useState([]);
  const [extensions, setExtensions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeTab, setActiveTab] = useState('approvals');

  const load = () => {
    setLoading(true);
    const promises = [
      approvalsAPI.list().catch(() => ({ data: [] })),
    ];
    if (canApprove) {
      promises.push(extensionAPI.list().catch(() => ({ data: [] })));
    }
    Promise.all(promises).then(([aRes, eRes]) => {
      setItems(aRes.data || []);
      if (eRes) {
        setExtensions((eRes.data || []).filter(e => e.status === 'pending'));
      }
    }).catch(e => setError(e.response?.data?.error || 'Failed to load')).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const flash = (msg, isErr = false) => {
    if (isErr) { setError(msg); setTimeout(() => setError(''), 4000); }
    else { setSuccess(msg); setTimeout(() => setSuccess(''), 4000); }
  };

  const handleApprove = async (item) => {
    try {
      const payload = item.change_request_id ? { change_request_id: item.change_request_id } : {};
      if (item.item_type === 'task') await tasksAPI.approveTask(item.id, payload);
      else await projectsAPI.approveProject(item.id, payload);
      flash(`✅ "${item.title || item.name}" approved!`);
      load();
    } catch (e) { flash(e.response?.data?.error || 'Failed', true); }
  };

  const handleReject = async (item, reason) => {
    try {
      const payload = { reason, ...(item.change_request_id ? { change_request_id: item.change_request_id } : {}) };
      if (item.item_type === 'task') await tasksAPI.rejectTask(item.id, payload);
      else await projectsAPI.rejectProject(item.id, payload);
      flash('Item rejected.');
      load();
    } catch (e) { flash(e.response?.data?.error || 'Failed', true); }
  };

  const handleExtensionApprove = async (req, reviewNote) => {
    try {
      await extensionAPI.approve(req.id, { review_note: reviewNote });
      flash(`✅ Extension approved for "${req.item_name}" — deadline extended to ${req.requested_new_date}.`);
      load();
    } catch (e) { flash(e.response?.data?.error || 'Failed to approve extension', true); }
  };

  const handleExtensionReject = async (req, reviewNote) => {
    try {
      await extensionAPI.reject(req.id, { review_note: reviewNote });
      flash('Extension request rejected.');
      load();
    } catch (e) { flash(e.response?.data?.error || 'Failed to reject extension', true); }
  };

  const totalPending = items.length + extensions.length;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Approvals</h1>
          <p className="text-sm text-slate-400 mt-1">Review pending tasks, projects & deadline extensions</p>
        </div>
        <button onClick={load} className="p-2 rounded-xl hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
          <FiRefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {success && (
        <div className="mb-4 p-3 bg-emerald-900/20 border border-emerald-700/40 rounded-xl flex items-center gap-2">
          <FiCheckCircle size={15} className="text-emerald-400" />
          <p className="text-sm text-emerald-300">{success}</p>
        </div>
      )}
      {error && (
        <div className="mb-4 p-3 bg-red-900/20 border border-red-700/40 rounded-xl flex items-center gap-2">
          <FiAlertCircle size={15} className="text-red-400" />
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      {canApprove && extensions.length > 0 && (
        <div className="flex gap-1 mb-5 bg-slate-800/50 rounded-xl p-1 border border-slate-700/50">
          <button
            onClick={() => setActiveTab('approvals')}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${activeTab === 'approvals' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            Item Approvals {items.length > 0 && <span className="ml-1.5 px-1.5 py-0.5 bg-amber-700/50 text-amber-300 rounded-full text-xs">{items.length}</span>}
          </button>
          <button
            onClick={() => setActiveTab('extensions')}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${activeTab === 'extensions' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            Extension Requests {extensions.length > 0 && <span className="ml-1.5 px-1.5 py-0.5 bg-amber-700/50 text-amber-300 rounded-full text-xs">{extensions.length}</span>}
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20"><div className="animate-spin rounded-full w-8 h-8 border-2 border-slate-600 border-t-indigo-500" /></div>
      ) : totalPending === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-emerald-900/20 flex items-center justify-center mx-auto mb-4">
            <FiCheckCircle size={28} className="text-emerald-400" />
          </div>
          <p className="text-slate-300 font-medium">All caught up!</p>
          <p className="text-slate-500 text-sm mt-1">No pending approvals at this time.</p>
        </div>
      ) : (
        <>
          {(activeTab === 'approvals' || !canApprove || extensions.length === 0) && (
            items.length === 0 ? (
              activeTab === 'approvals' && extensions.length > 0 ? (
                <div className="text-center py-10 text-slate-500 text-sm">No pending item approvals.</div>
              ) : null
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {items.map((item, idx) => (
                  <ApprovalCard
                    key={`${item.item_type}-${item.id}-${item.change_request_id || idx}`}
                    item={item}
                    onApprove={handleApprove}
                    onReject={handleReject}
                  />
                ))}
              </div>
            )
          )}

          {activeTab === 'extensions' && canApprove && (
            extensions.length === 0 ? (
              <div className="text-center py-10 text-slate-500 text-sm">No pending extension requests.</div>
            ) : (
              <div className="space-y-4">
                <div className="p-3 bg-amber-900/10 border border-amber-700/30 rounded-xl text-xs text-amber-400">
                  ⚠️ Approving an extension will immediately update the due date and unlock the item for editing.
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {extensions.map(req => (
                    <ExtensionCard
                      key={req.id}
                      req={req}
                      onApprove={handleExtensionApprove}
                      onReject={handleExtensionReject}
                    />
                  ))}
                </div>
              </div>
            )
          )}
        </>
      )}
    </div>
  );
}
