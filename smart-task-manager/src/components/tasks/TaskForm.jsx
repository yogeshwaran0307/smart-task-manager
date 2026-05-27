import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { tasksAPI } from '../../api/tasks';
import { projectsAPI } from '../../api/projects';
import { usersAPI } from '../../api/users';
import { departmentsAPI } from '../../api/departments';
import { FiSave, FiX, FiAlertCircle, FiInfo, FiSend } from 'react-icons/fi';

export default function TaskForm() {
  const { id, projectId } = useParams();
  const navigate = useNavigate();
  const { user, isAdmin, isManager, isHOD, canCreateTasks, needsApproval, role } = useAuth();
  const isEdit = Boolean(id);

  const [form, setForm] = useState({
    title: '', description: '', status: 'pending', priority: 'medium',
    due_date: '', eta: '', project: projectId || '', department_ids: [], assignee_ids: [],
  });
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(isEdit);
  const [error, setError] = useState('');

  // Restrict available departments for HOD
  // HOD can use departments where they are set as head_user_id,
  // OR their own assigned department as fallback
  const availableDepts = isAdmin || isManager
    ? departments
    : isHOD
      ? departments.filter(d =>
          Number(d.head_user_id) === Number(user?.id) ||
          (departments.filter(dep => Number(dep.head_user_id) === Number(user?.id)).length === 0 &&
           Number(d.id) === Number(user?.department))
        )
      : [];

  
  // Robust department ID extractor
  const getDepartmentId = (userObj) => {
    if (!userObj) return null;
    if (typeof userObj.department === 'object' && userObj.department !== null) {
      return String(userObj.department.id);
    }
    if (userObj.department_id !== undefined && userObj.department_id !== null) {
      return String(userObj.department_id);
    }
    return String(userObj.department);
  };

  // Filter users based on selected departments for ALL roles
  const availableUsers = (() => {
    // Get all dept IDs that HOD manages
    const hodManagedDeptIds = departments
      .filter(d => Number(d.head_user_id) === Number(user?.id))
      .map(d => String(d.id));
    // Fallback to user's own department if no managed depts
    const hodDeptIds = hodManagedDeptIds.length > 0
      ? hodManagedDeptIds
      : user?.department ? [String(user.department)] : [];

    let pool = isAdmin || isManager
      ? users
      : isHOD
        ? users.filter(u => {
            const deptId = getDepartmentId(u);
            const selectedDeptIds = form.department_ids.map(String);
            // Show users in selected departments that HOD manages
            return selectedDeptIds.some(sid =>
              sid === deptId && (hodDeptIds.includes(sid) || hodDeptIds.length === 0)
            );
          })
        : [];

    // If departments are selected, filter users to only those departments
    if ((isAdmin || isManager) && form.department_ids.length > 0) {
      pool = pool.filter(u => {
        const deptId = getDepartmentId(u);
        return form.department_ids.map(String).includes(deptId);
      });
    }

    return pool;
  })();


  useEffect(() => {
    if (!isEdit && !canCreateTasks) { navigate('/dashboard'); return; }
    Promise.all([
      projectsAPI.list().catch(() => ({ data: [] })),
      usersAPI.list().catch(() => ({ data: [] })),
      departmentsAPI.list().catch(() => ({ data: [] })),
    ]).then(([pRes, uRes, dRes]) => {
      setProjects(pRes.data || []);
      setUsers(uRes.data || []);
      setDepartments(dRes.data || []);
    });
    if (isEdit) {
      tasksAPI.get(id).then(r => {
        const t = r.data;
        if (t.is_overdue) {
          navigate(`/tasks/${id}`, { state: { toast: 'This task has passed its due date and is locked. Editing is not allowed.' } });
          return;
        }
        setForm({
          title: t.title || '', description: t.description || '',
          status: t.status || 'pending', priority: t.priority || 'medium',
          due_date: t.due_date || '', eta: t.eta || '', project: t.project || '',
          department_ids: (t.department_ids || []).map(String),
          assignee_ids: (t.assignee_ids || (t.assigned_to ? [t.assigned_to] : [])).map(Number),
        });
        setFetching(false);
      }).catch(() => { setError('Could not load task'); setFetching(false); });
    }
  }, [id, isEdit, canCreateTasks]);

  // When departments change, remove assignees no longer in selected depts
  useEffect(() => {
    if (form.department_ids.length === 0) {
      setForm(prev => ({ ...prev, assignee_ids: [] }));
      return;
    }
    const validUserIds = availableUsers.map(u => Number(u.id));
    setForm(prev => ({
      ...prev,
      assignee_ids: prev.assignee_ids.filter(id => validUserIds.includes(id)),
    }));
  }, [form.department_ids]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const toggleDept = (deptId) => {
    const sid = String(deptId);
    setForm(prev => ({
      ...prev,
      department_ids: prev.department_ids.includes(sid)
        ? prev.department_ids.filter(d => d !== sid)
        : [...prev.department_ids, sid],
    }));
  };

  const toggleAssignee = (uid) => {
    const nid = Number(uid);
    setForm(prev => ({
      ...prev,
      assignee_ids: prev.assignee_ids.includes(nid)
        ? prev.assignee_ids.filter(a => a !== nid)
        : [...prev.assignee_ids, nid],
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.title.trim()) { setError('Title is required'); return; }
    if (!form.due_date) { setError('Due date is required for all tasks'); return; }
    if (!form.eta.trim()) { setError('ETA (Estimated Time to Complete) is required for all tasks'); return; }

    // Validate at least one department selected (only on create)
    if (!isEdit && availableDepts.length > 0 && form.department_ids.length === 0) {
      setError('Please select at least one department for this task'); return;
    }

    // Validate at least one assignee selected (only on create)
    if (!isEdit && availableUsers.length > 0 && form.assignee_ids.length === 0) {
      setError('Please assign this task to at least one member'); return;
    }

    setLoading(true);
    try {
      const payload = {
        ...form,
        project: form.project ? Number(form.project) : null,
      };
      // Only include dept/assignee arrays if user can manage them (prevents wiping data)
      if (availableDepts.length > 0 || !isEdit) {
        payload.department_ids = form.department_ids.map(Number);
      }
      if (availableUsers.length > 0 || !isEdit) {
        payload.assignee_ids = form.assignee_ids;
      }
      let res;
      if (isEdit) {
        res = await tasksAPI.update(id, payload);
      } else {
        res = await tasksAPI.create(payload);
      }
      const task = res.data;
      if (task.approval_status === 'pending' || task.edit_approval_status === 'pending') {
        navigate('/my-tasks', { state: { toast: `Task submitted for approval. An approver will review it shortly.` } });
      } else {
        navigate(`/tasks/${task.id}`);
      }
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.detail || 'Failed to save task');
    } finally {
      setLoading(false);
    }
  };

  if (fetching) return (
    <div className="flex items-center justify-center py-20">
      <div className="animate-spin rounded-full w-8 h-8 border-2 border-slate-600 border-t-indigo-500" />
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">{isEdit ? 'Edit Task' : 'Create New Task'}</h1>
          <p className="text-sm text-slate-400 mt-1">
            {needsApproval
              ? isEdit ? 'Changes will be submitted for approval' : 'Task will be submitted for approval before activation'
              : isEdit ? 'Update task details' : 'Fill in the task details below'}
          </p>
        </div>
        <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
          <FiX size={18} />
        </button>
      </div>

      {needsApproval && (
        <div className="mb-4 p-3 bg-amber-900/20 border border-amber-700/40 rounded-xl flex items-start gap-2">
          <FiInfo size={15} className="text-amber-400 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-300">
            {isEdit
              ? 'Your changes will be submitted for approval. The task will be updated once approved by a Manager or Admin.'
              : 'This task requires approval. It will be visible but inactive until approved by a Manager, Admin, or Head of Department.'}
          </p>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-900/20 border border-red-700/40 rounded-xl flex items-center gap-2">
          <FiAlertCircle size={15} className="text-red-400 shrink-0" />
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-slate-800 rounded-2xl border border-slate-700 p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Task Title <span className="text-red-400">*</span></label>
          <input name="title" value={form.title} onChange={handleChange} required
            className="input-field" placeholder="Enter task title..." />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Description</label>
          <textarea name="description" value={form.description} onChange={handleChange} rows={3}
            className="input-field resize-none" placeholder="Describe the task..." />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Status</label>
            <select name="status" value={form.status} onChange={handleChange} className="input-field">
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="done">Done</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Priority</label>
            <select name="priority" value={form.priority} onChange={handleChange} className="input-field">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Due Date <span className="text-red-400">*</span></label>
            <input type="date" name="due_date" value={form.due_date} onChange={handleChange} required className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Project</label>
            <select name="project" value={form.project} onChange={handleChange} className="input-field">
              <option value="">— No Project —</option>
              {projects.filter(p => p.approval_status === 'approved').map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">
            ETA (Estimated Time to Complete) <span className="text-red-400">*</span>
            <span className="text-slate-500 text-xs ml-1">— strictly enforced for all members</span>
          </label>
          <input name="eta" value={form.eta} onChange={handleChange} required
            className="input-field" placeholder="e.g. 4 hours, 2 days, 1 week..." />
          <p className="text-xs text-amber-400 mt-1">⚠️ All assignees must complete this task within the estimated time.</p>
        </div>

        {availableDepts.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Department <span className="text-red-400">*</span>
              {isHOD && <span className="text-amber-400 text-xs ml-1">(Your departments only)</span>}
              <span className="text-slate-500 text-xs ml-1">— select to filter members</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {availableDepts.map(d => (
                <button key={d.id} type="button"
                  onClick={() => toggleDept(d.id)}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors border ${
                    form.department_ids.includes(String(d.id))
                      ? 'bg-indigo-600 border-indigo-500 text-white'
                      : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'
                  }`}>
                  {d.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Assign To <span className="text-red-400">*</span>
            {isHOD && <span className="text-amber-400 text-xs ml-1">(Department members only)</span>}
          </label>
          {form.department_ids.length === 0 && availableDepts.length > 0 ? (
            <p className="text-xs text-slate-500 italic py-2">Select a department above to see available members</p>
          ) : availableUsers.length === 0 ? (
            <p className="text-xs text-slate-500 italic py-2">No members found in the selected department(s)</p>
          ) : (
            <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto">
              {availableUsers.map(u => (
                <button key={u.id} type="button"
                  onClick={() => toggleAssignee(u.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors border ${
                    form.assignee_ids.includes(Number(u.id))
                      ? 'bg-indigo-600 border-indigo-500 text-white'
                      : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'
                  }`}>
                  <span className="w-5 h-5 rounded-full bg-slate-500 flex items-center justify-center text-xs font-bold">
                    {(u.first_name?.[0] || u.username?.[0] || '?').toUpperCase()}
                  </span>
                  {u.first_name ? `${u.first_name} ${u.last_name || ''}`.trim() : u.username}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button type="button" onClick={() => navigate(-1)}
            className="px-4 py-2 rounded-xl text-sm text-slate-400 hover:text-white hover:bg-slate-700 transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={loading}
            className="btn-primary flex items-center gap-2 px-5 py-2 text-sm">
            {loading ? (
              <><div className="animate-spin rounded-full w-4 h-4 border-2 border-white/30 border-t-white" /> Saving...</>
            ) : needsApproval ? (
              <><FiSend size={15} /> {isEdit ? 'Submit for Approval' : 'Submit for Approval'}</>
            ) : (
              <><FiSave size={15} /> {isEdit ? 'Save Changes' : 'Create Task'}</>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
