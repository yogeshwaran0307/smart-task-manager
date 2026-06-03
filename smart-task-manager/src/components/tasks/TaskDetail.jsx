import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { tasksAPI, extensionAPI } from '../../api/tasks';
import {
  FiEdit2, FiTrash2, FiCheckCircle, FiClock, FiAlertCircle,
  FiUpload, FiFile, FiDownload, FiX, FiPlus, FiSend,
  FiThumbsUp, FiThumbsDown, FiUsers, FiCalendar, FiTag,
  FiMessageSquare, FiPaperclip, FiShield, FiInfo, FiLock, FiRefreshCw,
} from 'react-icons/fi';
import { usersAPI } from '../../api/users';

const STATUS_CONFIG = {
  pending:     { label: 'Pending',     color: 'bg-amber-900/30 text-amber-300 border-amber-700/40' },
  in_progress: { label: 'In Progress', color: 'bg-blue-900/30 text-blue-300 border-blue-700/40' },
  done:        { label: 'Done',        color: 'bg-emerald-900/30 text-emerald-300 border-emerald-700/40' },
  completed:   { label: 'Completed',   color: 'bg-emerald-900/30 text-emerald-300 border-emerald-700/40' },
  cancelled:   { label: 'Cancelled',   color: 'bg-slate-700 text-slate-400 border-slate-600' },
};
const PRIORITY_CONFIG = {
  low:    { label: 'Low',    color: 'bg-slate-700 text-slate-300 border-slate-600' },
  medium: { label: 'Medium', color: 'bg-blue-900/30 text-blue-300 border-blue-700/40' },
  high:   { label: 'High',   color: 'bg-orange-900/30 text-orange-300 border-orange-700/40' },
  urgent: { label: 'Urgent', color: 'bg-red-900/30 text-red-300 border-red-700/40' },
};

function FileUploadModal({ taskId, users, canViewFiles, onClose, onUploaded }) {
  const { user, isAdmin, isManager, isHOD } = useAuth();
  const [file, setFile] = useState(null);
  const [visibleTo, setVisibleTo] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  // Who can be selected to see the file
  const selectableUsers = users.filter(u => u.id !== user?.id);

  const toggleUser = (uid) => {
    setVisibleTo(prev => prev.includes(uid) ? prev.filter(x => x !== uid) : [...prev, uid]);
  };

  const handleUpload = async () => {
    if (!file) { setError('Please select a file'); return; }
    setUploading(true);
    setError('');
    try {
      const b64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await tasksAPI.uploadAttachment(taskId, {
        file_data: b64,
        file_name: file.name,
        mime_type: file.type || 'application/octet-stream',
        visible_to: visibleTo,
      });
      onUploaded();
      onClose();
    } catch (e) {
      setError(e.response?.data?.error || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <h3 className="font-semibold text-white">Upload File</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white">
            <FiX size={16} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Select File</label>
            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-slate-600 rounded-xl p-6 text-center cursor-pointer hover:border-indigo-500 hover:bg-indigo-900/10 transition-colors"
            >
              {file ? (
                <div>
                  <FiFile size={24} className="text-indigo-400 mx-auto mb-2" />
                  <p className="text-sm text-white font-medium">{file.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
              ) : (
                <div>
                  <FiUpload size={24} className="text-slate-500 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">Click to browse files</p>
                  <p className="text-xs text-slate-600 mt-0.5">Any file type supported</p>
                </div>
              )}
            </div>
            <input ref={fileRef} type="file" className="hidden" onChange={e => setFile(e.target.files[0])} />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Visible To <span className="text-slate-500 text-xs">(leave empty = all with file access)</span>
            </label>
            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
              {selectableUsers.map(u => (
                <button
                  key={u.id} type="button"
                  onClick={() => toggleUser(u.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-colors border ${
                    visibleTo.includes(u.id)
                      ? 'bg-indigo-600 border-indigo-500 text-white'
                      : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'
                  }`}>
                  {(u.first_name?.[0] || u.username?.[0] || '?').toUpperCase()}
                  {' '}{u.first_name ? `${u.first_name} ${u.last_name || ''}`.trim() : u.username}
                </button>
              ))}
            </div>
            {visibleTo.length > 0 && (
              <p className="text-xs text-slate-500 mt-1.5">
                Visible to: you + {visibleTo.length} selected user(s). Others cannot see this file.
              </p>
            )}
          </div>

          {error && (
            <div className="p-2.5 bg-red-900/20 border border-red-700/40 rounded-xl flex items-center gap-2">
              <FiAlertCircle size={14} className="text-red-400 shrink-0" />
              <p className="text-xs text-red-300">{error}</p>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-700">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-slate-400 hover:text-white hover:bg-slate-700 transition-colors">
            Cancel
          </button>
          <button onClick={handleUpload} disabled={uploading || !file}
            className="btn-primary flex items-center gap-2 px-4 py-2 text-sm disabled:opacity-50">
            {uploading ? <><div className="animate-spin rounded-full w-4 h-4 border-2 border-white/30 border-t-white" /> Uploading...</> : <><FiUpload size={14} /> Upload</>}
          </button>
        </div>
      </div>
    </div>
  );
}

function ExtensionRequestModal({ item, contentType, onClose, onSubmitted }) {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().split('T')[0];

  const [reason, setReason] = useState('');
  const [newDate, setNewDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [existingReq, setExistingReq] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    extensionAPI.list().then(r => {
      const pending = (r.data || []).find(
        er => er.content_type === contentType && er.object_id === item.id && er.status === 'pending'
      );
      setExistingReq(pending || null);
    }).catch(() => {}).finally(() => setChecking(false));
  }, []);

  const originalDate = item.due_date;
  const daysOverdue = originalDate
    ? Math.max(0, Math.ceil((today - new Date(originalDate)) / 86400000))
    : 0;
  const daysExtension = newDate && originalDate
    ? Math.max(0, Math.ceil((new Date(newDate) - new Date(originalDate)) / 86400000))
    : 0;

  const handleSubmit = async () => {
    if (!reason.trim()) { setError('Please provide a reason.'); return; }
    if (!newDate) { setError('Please select a new due date.'); return; }
    setLoading(true); setError('');
    try {
      await extensionAPI.create({
        content_type: contentType,
        object_id: item.id,
        reason: reason.trim(),
        requested_new_date: newDate,
      });
      onSubmitted();
      onClose();
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to submit request.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <FiRefreshCw size={16} className="text-amber-400" />
            <h3 className="font-semibold text-white text-sm">Request Deadline Extension</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white">
            <FiX size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Overdue info */}
          <div className="p-3 bg-red-950/40 border border-red-800/40 rounded-xl text-xs text-red-300">
            <p className="font-semibold mb-0.5">⏰ ETA Exceeded</p>
            <p>Original due date: <strong>{originalDate}</strong> ({daysOverdue} day{daysOverdue !== 1 ? 's' : ''} overdue)</p>
          </div>

          {checking ? (
            <div className="flex justify-center py-4"><div className="animate-spin w-5 h-5 rounded-full border-2 border-slate-600 border-t-amber-400" /></div>
          ) : existingReq ? (
            <div className="p-3 bg-amber-900/20 border border-amber-700/40 rounded-xl text-xs text-amber-300">
              <p className="font-semibold mb-1">⏳ Pending Request Exists</p>
              <p>You already have a pending extension request (→ {existingReq.requested_new_date}). Please wait for it to be reviewed.</p>
              <p className="mt-1 text-slate-400">Reason: {existingReq.reason}</p>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">New Proposed Due Date <span className="text-red-400">*</span></label>
                <input
                  type="date" min={minDate} value={newDate}
                  onChange={e => setNewDate(e.target.value)}
                  className="input-field text-sm w-full"
                />
                {daysExtension > 0 && (
                  <p className="text-xs text-amber-400 mt-1">+{daysExtension} day{daysExtension !== 1 ? 's' : ''} extension from original deadline</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Reason for Extension <span className="text-red-400">*</span></label>
                <textarea
                  value={reason} onChange={e => setReason(e.target.value)}
                  rows={3} maxLength={500}
                  className="input-field text-sm w-full resize-none"
                  placeholder="Explain why you need more time (e.g., blockers, resource constraints, scope changes)..."
                />
                <p className="text-xs text-slate-600 mt-0.5 text-right">{reason.length}/500</p>
              </div>

              {error && <p className="text-xs text-red-400">{error}</p>}

              <div className="p-3 bg-slate-700/40 rounded-xl text-xs text-slate-400">
                <p>📋 This request will be sent to your project manager/admin for approval. You will be notified of the decision.</p>
              </div>

              <div className="flex gap-2">
                <button onClick={onClose} className="flex-1 py-2 rounded-xl text-sm text-slate-400 hover:text-white hover:bg-slate-700 transition-colors">
                  Cancel
                </button>
                <button
                  onClick={handleSubmit} disabled={loading}
                  className="flex-1 py-2 rounded-xl text-sm bg-amber-600 hover:bg-amber-500 text-white font-medium transition-colors disabled:opacity-50"
                >
                  {loading ? 'Submitting…' : 'Submit Request'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function TaskDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isAdmin, isManager, isHOD, canViewFiles, canUploadFiles, canApprove, role } = useAuth();

  const [task, setTask] = useState(null);
  const [comments, setComments] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [subtasks, setSubtasks] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [newSubtask, setNewSubtask] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [showExtensionModal, setShowExtensionModal] = useState(false);
  const [extensionToast, setExtensionToast] = useState('');
  const [activeTab, setActiveTab] = useState('details');

  const canEdit = task && (
    isAdmin || isManager ||
    isHOD ||
    task.created_by === user?.id ||
    task.assignee_ids?.includes(user?.id)
  );

  const isOverdue = task?.is_overdue === true;

  const load = async () => {
    try {
      const [tRes, cRes, aRes, sRes] = await Promise.all([
        tasksAPI.get(id),
        tasksAPI.getComments(id).catch(() => ({ data: [] })),
        tasksAPI.getAttachments(id).catch(() => ({ data: [] })),
        tasksAPI.getSubtasks(id).catch(() => ({ data: [] })),
      ]);
      setTask(tRes.data);
      setComments(cRes.data || []);
      setAttachments(aRes.data || []);
      setSubtasks(sRes.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    usersAPI.list().then(r => setAllUsers(r.data || [])).catch(() => {});
  }, [id]);

  const handleDelete = async () => {
    if (!window.confirm('Delete this task?')) return;
    await tasksAPI.delete(id);
    navigate('/projects');
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    const res = await tasksAPI.addComment(id, { content: newComment });
    setComments(prev => [...prev, res.data]);
    setNewComment('');
  };

  const reloadSubtasks = async () => {
    try {
      const response = await tasksAPI.getSubtasks(id);
      setSubtasks(response.data || []);
    } catch (err) {
      console.error('Failed to reload subtasks', err);
    }
  };

  const handleAddSubtask = async (e) => {
    e.preventDefault();
    if (!newSubtask.trim()) return;

    try {
      await tasksAPI.createSubtask(id, { title: newSubtask.trim() });
      setNewSubtask('');
      await reloadSubtasks();
    } catch (err) {
      console.error('Subtask create failed', err);
    }
  };

  const handleToggleSubtask = async (subtaskId) => {
    try {
      await tasksAPI.toggleSubtask(subtaskId);
      await reloadSubtasks();
    } catch (err) {
      console.error('Subtask toggle failed', err);
    }
  };

  const handleDeleteSubtask = async (subtaskId) => {
    try {
      await tasksAPI.deleteSubtask(subtaskId);
      await reloadSubtasks();
    } catch (err) {
      console.error('Subtask delete failed', err);
    }
  };

  const handleDownload = async (att) => {
    try {
      const res = await tasksAPI.downloadAttachment(att.id);
      const { data_b64, name, mime_type } = res.data;
      const base64 = data_b64.includes(',') ? data_b64.split(',')[1] : data_b64;
      const byteChars = atob(base64);
      const byteArr = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
      const blob = new Blob([byteArr], { type: mime_type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Download failed: ' + (e.response?.data?.error || e.message));
    }
  };

  const handleDeleteAttachment = async (attId) => {
    await tasksAPI.deleteAttachment(attId);
    setAttachments(prev => prev.filter(a => a.id !== attId));
  };

  const handleApprove = async () => {
    await tasksAPI.approveTask(id);
    load();
  };

  const handleReject = async () => {
    const reason = window.prompt('Reason for rejection (optional):');
    if (reason === null) return;
    await tasksAPI.rejectTask(id, { reason });
    load();
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="animate-spin rounded-full w-8 h-8 border-2 border-slate-600 border-t-indigo-500" />
    </div>
  );
  if (!task) return <div className="text-center py-20 text-slate-400">Task not found.</div>;

  const statusCfg = STATUS_CONFIG[task.status] || STATUS_CONFIG.pending;
  const priorityCfg = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
  const isPending = task.approval_status === 'pending';
  const isRejected = task.approval_status === 'rejected';
  const hasEdit = task.edit_approval_status === 'pending';

  const formatBytes = (b) => b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${(b / 1024).toFixed(0)} KB`;

  return (
    <div className="max-w-3xl mx-auto">
      {showUpload && (
        <FileUploadModal
          taskId={id}
          users={allUsers}
          canViewFiles={canViewFiles}
          onClose={() => setShowUpload(false)}
          onUploaded={() => { tasksAPI.getAttachments(id).then(r => setAttachments(r.data || [])); }}
        />
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`px-2 py-0.5 rounded-full text-xs border ${statusCfg.color}`}>{statusCfg.label}</span>
            <span className={`px-2 py-0.5 rounded-full text-xs border ${priorityCfg.color}`}>{priorityCfg.label}</span>
            {isPending && (
              <span className="px-2 py-0.5 bg-amber-900/40 text-amber-300 border border-amber-700/40 rounded-full text-xs">
                ⏳ Awaiting Approval
              </span>
            )}
            {isRejected && (
              <span className="px-2 py-0.5 bg-red-900/40 text-red-300 border border-red-800/40 rounded-full text-xs">
                ❌ Rejected
              </span>
            )}
            {hasEdit && (
              <span className="px-2 py-0.5 bg-blue-900/40 text-blue-300 border border-blue-700/40 rounded-full text-xs">
                ✏️ Edit Pending Approval
              </span>
            )}
            {isOverdue && (
              <span className="px-2 py-0.5 bg-red-900/60 text-red-300 border border-red-700/60 rounded-full text-xs flex items-center gap-1">
                <FiLock size={10} /> Overdue & Locked
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2 flex-wrap">
            {task.task_code && (
              <span className="font-mono text-sm bg-slate-700 text-slate-300 border border-slate-600 px-2 py-0.5 rounded">
                {task.task_code}
              </span>
            )}
            {task.title}
          </h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {canApprove && isPending && (
            <>
              <button onClick={handleApprove} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700/30 text-emerald-300 hover:bg-emerald-700/50 rounded-xl text-sm border border-emerald-700/40 transition-colors">
                <FiThumbsUp size={13} /> Approve
              </button>
              <button onClick={handleReject} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-900/20 text-red-400 hover:bg-red-900/40 rounded-xl text-sm border border-red-800/40 transition-colors">
                <FiThumbsDown size={13} /> Reject
              </button>
            </>
          )}
          {canEdit && !isOverdue && (
            <Link to={`/tasks/${id}/edit`}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white rounded-xl text-sm transition-colors">
              <FiEdit2 size={13} /> Edit
            </Link>
          )}
          {(isAdmin || isManager) && !isOverdue && (
            <button onClick={handleDelete}
              className="p-1.5 rounded-xl hover:bg-red-900/30 text-slate-500 hover:text-red-400 transition-colors">
              <FiTrash2 size={15} />
            </button>
          )}
        </div>
      </div>

      {isRejected && task.rejection_reason && (
        <div className="mb-4 p-3 bg-red-900/20 border border-red-800/40 rounded-xl flex items-start gap-2">
          <FiAlertCircle size={15} className="text-red-400 mt-0.5 shrink-0" />
          <p className="text-sm text-red-300"><span className="font-medium">Rejection reason:</span> {task.rejection_reason}</p>
        </div>
      )}

      {isOverdue && (
        <div className="mb-5 p-4 bg-red-950/60 border border-red-700/50 rounded-xl flex items-start gap-3">
          <FiLock size={18} className="text-red-400 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-300">Task Locked — ETA Exceeded</p>
            <p className="text-xs text-red-400/80 mt-0.5">
              This task's due date ({task.due_date}) has passed. All editing, comments, subtasks, and file uploads are disabled.
            </p>
            {extensionToast && (
              <p className="text-xs text-emerald-400 mt-1">{extensionToast}</p>
            )}
          </div>
          <button
            onClick={() => setShowExtensionModal(true)}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-amber-600/20 hover:bg-amber-600/40 border border-amber-600/50 text-amber-300 rounded-lg text-xs font-medium transition-colors"
          >
            <FiRefreshCw size={12} />
            Request Extension
          </button>
        </div>
      )}

      {showExtensionModal && task && (
        <ExtensionRequestModal
          item={task}
          contentType="task"
          onClose={() => setShowExtensionModal(false)}
          onSubmitted={() => {
            setExtensionToast('✅ Extension request submitted! You will be notified when reviewed.');
            setTimeout(() => setExtensionToast(''), 6000);
          }}
        />
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-slate-800/50 rounded-xl p-1 border border-slate-700/50">
        {[
          { key: 'details', label: 'Details' },
          { key: 'subtasks', label: `Subtasks (${subtasks.length})` },
          { key: 'comments', label: `Comments (${comments.length})` },
          { key: 'files', label: `Files (${attachments.length})` },
        ].filter(Boolean).map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-1.5 px-3 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.key ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Details Tab */}
      {activeTab === 'details' && (
        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-5 space-y-4">
          {task.description && (
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">Description</p>
              <p className="text-sm text-slate-300 leading-relaxed">{task.description}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            {task.due_date && (
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1"><FiCalendar size={11} className="inline mr-1" />Due Date</p>
                <p className="text-sm text-slate-300">{task.due_date}</p>
              </div>
            )}
            {task.eta && (
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">⏱ ETA</p>
                <p className="text-sm text-amber-400 font-medium">{task.eta}</p>
              </div>
            )}
            {task.project && (
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1"><FiTag size={11} className="inline mr-1" />Project</p>
                <p className="text-sm text-indigo-400 flex items-center gap-1.5">
                  {task.project_info?.project_code && (
                    <span className="font-mono text-xs bg-indigo-900/40 border border-indigo-700/40 px-1.5 py-0.5 rounded">
                      {task.project_info.project_code}
                    </span>
                  )}
                  {task.project_info?.name || `Project #${task.project}`}
                </p>
              </div>
            )}
          </div>
          {task.assignees?.length > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2"><FiUsers size={11} className="inline mr-1" />Assigned To</p>
              <div className="flex flex-wrap gap-2">
                {task.assignees.map(a => (
                  <div key={a.id} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-700 rounded-lg">
                    <div className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold text-white">
                      {(a.first_name?.[0] || a.username?.[0] || '?').toUpperCase()}
                    </div>
                    <span className="text-sm text-slate-300">{a.first_name ? `${a.first_name} ${a.last_name || ''}`.trim() : a.username}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Subtasks Tab */}
      {activeTab === 'subtasks' && (
        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-5">
          {!isOverdue && (
            <form onSubmit={handleAddSubtask} className="flex gap-2 mb-4">
              <input value={newSubtask} onChange={e => setNewSubtask(e.target.value)}
                className="input-field flex-1 text-sm" placeholder="Add subtask..." />
              <button type="submit" disabled={!newSubtask.trim()}
                className="btn-primary px-3 py-2 text-sm disabled:opacity-50">
                <FiPlus size={16} />
              </button>
            </form>
          )}
          {isOverdue && (
            <div className="flex items-center gap-2 mb-4 p-2.5 bg-red-950/40 border border-red-800/30 rounded-lg text-xs text-red-400">
              <FiLock size={12} /> Subtasks are locked — due date has passed.
            </div>
          )}
          {subtasks.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">No subtasks yet.</p>
          ) : (
            <div className="space-y-2">
              {subtasks.map(s => (
                <div key={s.id} className="flex items-center gap-2 p-2.5 bg-slate-700/40 rounded-xl">
                  <button type="button" onClick={() => !isOverdue && handleToggleSubtask(s.id)}
                    disabled={isOverdue}
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                      isOverdue ? 'border-slate-600 opacity-40 cursor-not-allowed' :
                      s.is_completed ? 'bg-emerald-600 border-emerald-600' : 'border-slate-500 hover:border-emerald-500'
                    }`}>
                    {s.is_completed && <FiCheckCircle size={12} className="text-white" />}
                  </button>
                  <span className={`text-sm flex-1 ${s.is_completed ? 'line-through text-slate-500' : 'text-slate-200'}`}>{s.title}</span>
                  {!isOverdue && (
                    <button type="button" onClick={() => handleDeleteSubtask(s.id)} className="text-slate-600 hover:text-red-400 transition-colors">
                      <FiX size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Comments Tab */}
      {activeTab === 'comments' && (
        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-5">
          <div className="space-y-3 mb-4 max-h-80 overflow-y-auto">
            {comments.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-6">No comments yet.</p>
            ) : (
              comments.map(c => (
                <div key={c.id} className="flex gap-3">
                  <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
                    {(c.user_name?.[0] || '?').toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-medium text-slate-300">{c.user_name}</span>
                    </div>
                    <p className="text-sm text-slate-400 bg-slate-700/40 rounded-xl px-3 py-2">{c.content}</p>
                  </div>
                </div>
              ))
            )}
          </div>
          <form onSubmit={handleAddComment} className="flex gap-2">
            <input value={newComment} onChange={e => setNewComment(e.target.value)}
              disabled={isOverdue}
              className={`input-field flex-1 text-sm ${isOverdue ? 'opacity-40 cursor-not-allowed' : ''}`}
              placeholder={isOverdue ? 'Comments locked — due date passed' : 'Add a comment...'} />
            <button type="submit" disabled={!newComment.trim() || isOverdue} className="btn-primary px-3 py-2 disabled:opacity-50">
              <FiSend size={15} />
            </button>
          </form>
        </div>
      )}

      {/* Files Tab — only for users with canViewFiles */}
      {activeTab === 'files' && (
        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-medium text-slate-300">Attachments</p>
            {!isOverdue && (
              <button onClick={() => setShowUpload(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm transition-colors">
                <FiUpload size={13} /> Upload File
              </button>
            )}
            {isOverdue && (
              <span className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 text-slate-500 rounded-xl text-sm cursor-not-allowed">
                <FiLock size={13} /> Locked
              </span>
            )}
          </div>
          <div className="mb-3 p-2.5 bg-indigo-900/10 border border-indigo-700/30 rounded-xl flex items-center gap-2">
            <FiShield size={13} className="text-indigo-400 shrink-0" />
            <p className="text-xs text-indigo-300">
              {canViewFiles
                ? 'You can upload, view and download files. Admins, Managers, HODs and Seniors have full file access.'
                : 'You can upload files. Only Admins, Managers, HODs and Seniors can view and download files.'}
            </p>
          </div>
          {!canViewFiles && attachments.length === 0 ? (
            <div className="text-center py-8">
              <FiShield size={24} className="text-slate-600 mx-auto mb-2" />
              <p className="text-sm text-slate-500">File viewing is restricted to Admins, Managers, HODs and Seniors.</p>
              <p className="text-xs text-slate-600 mt-1">You can still upload files using the button above.</p>
            </div>
          ) : attachments.length === 0 ? (
            <div className="text-center py-8">
              <FiPaperclip size={24} className="text-slate-600 mx-auto mb-2" />
              <p className="text-sm text-slate-500">No files uploaded yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {attachments.map(a => (
                <div key={a.id} className="flex items-center gap-3 p-3 bg-slate-700/40 rounded-xl hover:bg-slate-700/60 transition-colors">
                  <div className="w-9 h-9 rounded-lg bg-indigo-900/40 flex items-center justify-center shrink-0">
                    <FiFile size={16} className="text-indigo-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{a.name}</p>
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-slate-500">{formatBytes(a.size || 0)}</p>
                      {a.visible_to?.length > 0 && (
                        <span className="text-xs text-indigo-400">• restricted visibility</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => handleDownload(a)}
                      className="p-1.5 rounded-lg hover:bg-slate-600 text-slate-400 hover:text-white transition-colors">
                      <FiDownload size={14} />
                    </button>
                    {(isAdmin || isManager || a.uploaded_by === user?.id) && (
                      <button onClick={() => handleDeleteAttachment(a.id)}
                        className="p-1.5 rounded-lg hover:bg-red-900/30 text-slate-500 hover:text-red-400 transition-colors">
                        <FiX size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
