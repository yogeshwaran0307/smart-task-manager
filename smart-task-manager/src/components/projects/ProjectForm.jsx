import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { projectsAPI } from '../../api/projects';
import { usersAPI } from '../../api/users';
import { departmentsAPI } from '../../api/departments';
import { FiSave, FiX, FiAlertCircle, FiInfo, FiSend } from 'react-icons/fi';

export default function ProjectForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isAdmin, isManager, isHOD, canCreateProjects, needsApproval } = useAuth();
  const isEdit = Boolean(id);

  const [form, setForm] = useState({
    name: '', description: '', status: 'active', priority: 'medium',
    due_date: '', eta: '', department_ids: [], members: [],
  });
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(isEdit);
  const [error, setError] = useState('');

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
    const hodManagedDeptIds = departments
      .filter(d => Number(d.head_user_id) === Number(user?.id))
      .map(d => String(d.id));
    const hodDeptIds = hodManagedDeptIds.length > 0
      ? hodManagedDeptIds
      : user?.department ? [String(user.department)] : [];

    let pool = isAdmin || isManager
      ? users
      : isHOD
        ? users.filter(u => {
            const deptId = getDepartmentId(u);
            const selectedDeptIds = form.department_ids.map(String);
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
    if (!isEdit && !canCreateProjects) { navigate('/dashboard'); return; }
    Promise.all([
      usersAPI.list().catch(() => ({ data: [] })),
      departmentsAPI.list().catch(() => ({ data: [] })),
    ]).then(([uRes, dRes]) => {
      setUsers(uRes.data || []);
      setDepartments(dRes.data || []);
    });
    if (isEdit) {
      projectsAPI.get(id).then(r => {
        const p = r.data;
        if (p.is_overdue) {
          navigate(`/projects/${id}`, { state: { toast: 'This project has passed its due date and is locked. Editing is not allowed.' } });
          return;
        }
        setForm({
          name: p.name || '', description: p.description || '',
          status: p.status || 'active', priority: p.priority || 'medium',
          due_date: p.due_date || '',
          eta: p.eta || '',
          department_ids: (p.department_ids || []).map(String),
          members: (p.members || []).map(m => typeof m === 'object' ? m.id : m),
        });
        setFetching(false);
      }).catch(() => { setError('Could not load project'); setFetching(false); });
    }
  }, [id, isEdit, canCreateProjects]);

  // When departments change, remove members no longer in selected depts
  useEffect(() => {
    if (form.department_ids.length === 0) {
      setForm(prev => ({ ...prev, members: [] }));
      return;
    }
    const validUserIds = availableUsers.map(u => Number(u.id));
    setForm(prev => ({
      ...prev,
      members: prev.members.filter(id => validUserIds.includes(Number(id))),
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

  const toggleMember = (uid) => {
    const nid = Number(uid);
    setForm(prev => ({
      ...prev,
      members: prev.members.includes(nid)
        ? prev.members.filter(m => m !== nid)
        : [...prev.members, nid],
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) { setError('Project name is required'); return; }
    if (!form.due_date) { setError('Due date is required for all projects'); return; }
    if (!form.eta.trim()) { setError('ETA (Estimated Time to Complete) is required for all projects'); return; }

    // Validate at least one department selected (only on create or if user can manage depts)
    if (!isEdit && availableDepts.length > 0 && form.department_ids.length === 0) {
      setError('Please select at least one department for this project'); return;
    }

    // Validate at least one member selected (only on create or if user can manage members)
    if (!isEdit && availableUsers.length > 0 && form.members.length === 0) {
      setError('Please add at least one member to this project'); return;
    }

    setLoading(true);
    try {
      // Build payload - only include dept/member fields if user can manage them
      const payload = { ...form };
      if (availableDepts.length > 0 || !isEdit) {
        payload.department_ids = form.department_ids.map(Number);
      }
      if (availableUsers.length > 0 || !isEdit) {
        payload.members = form.members.map(m => ({ id: Number(m) }));
      }
      let res;
      if (isEdit) {
        res = await projectsAPI.update(id, payload);
      } else {
        res = await projectsAPI.create(payload);
      }
      const proj = res.data;
      if (proj.approval_status === 'pending' || proj.edit_approval_status === 'pending') {
        navigate('/projects', { state: { toast: 'Project submitted for approval. It will be active once approved.' } });
      } else {
        navigate(`/projects/${proj.id}`);
      }
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.detail || 'Failed to save project');
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
          <h1 className="text-xl font-bold text-white">{isEdit ? 'Edit Project' : 'Create New Project'}</h1>
          <p className="text-sm text-slate-400 mt-1">
            {needsApproval ? 'Project will be submitted for approval' : 'Fill in the project details below'}
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
              ? 'Your changes will be submitted for approval by a Manager or Admin.'
              : 'This project requires approval from a Manager or Admin before it becomes active.'}
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
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Project Name <span className="text-red-400">*</span></label>
          <input name="name" value={form.name} onChange={handleChange} required
            className="input-field" placeholder="Enter project name..." />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Description</label>
          <textarea name="description" value={form.description} onChange={handleChange} rows={3}
            className="input-field resize-none" placeholder="Describe the project..." />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Status</label>
            <select name="status" value={form.status} onChange={handleChange} className="input-field">
              <option value="active">Active</option>
              <option value="on_hold">On Hold</option>
              <option value="completed">Completed</option>
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

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Due Date <span className="text-red-400">*</span></label>
          <input type="date" name="due_date" value={form.due_date} onChange={handleChange} required className="input-field" />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">
            ETA (Estimated Time to Complete) <span className="text-red-400">*</span>
            <span className="text-slate-500 text-xs ml-1">— strictly enforced for all members</span>
          </label>
          <input name="eta" value={form.eta} onChange={handleChange} required
            className="input-field" placeholder="e.g. 2 weeks, 5 days, 3 hours..." />
          <p className="text-xs text-amber-400 mt-1">⚠️ All team members must complete their work within this estimated time.</p>
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
            Members <span className="text-red-400">*</span>
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
                  onClick={() => toggleMember(u.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors border ${
                    form.members.includes(Number(u.id))
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
              <><FiSend size={15} /> {isEdit ? 'Submit Changes' : 'Submit for Approval'}</>
            ) : (
              <><FiSave size={15} /> {isEdit ? 'Save Changes' : 'Create Project'}</>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
