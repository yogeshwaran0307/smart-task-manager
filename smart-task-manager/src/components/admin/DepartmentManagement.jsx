import { useState, useEffect } from 'react';
import { departmentsAPI, usersAPI } from '../../api/users';
import { useApp } from '../../context/AppContext';
import { PageHeader, PageLoading, EmptyState, Avatar } from '../common/ui';
import { FiFolder, FiPlus, FiEdit2, FiTrash2, FiX, FiSave, FiUsers, FiUser } from 'react-icons/fi';

export default function DepartmentManagement() {
  const { addToast, confirm } = useApp();
  const [departments, setDepartments] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [expandedDept, setExpandedDept] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', head_user_id: '' });
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      departmentsAPI.list(),
      usersAPI.list().catch(() => ({ data: [] })),
    ]).then(([dRes, uRes]) => {
      setDepartments(dRes.data?.results ?? dRes.data ?? []);
      setAllUsers(uRes.data?.results ?? uRes.data ?? []);
    }).catch(() => setDepartments([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setForm({ name: '', description: '', head_user_id: '' });
    setModal('create');
  };

  const openEdit = (dept) => {
    setForm({
      name: dept.name || '',
      description: dept.description || '',
      head_user_id: dept.head_user_id || '',
    });
    setModal(dept);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { addToast('Name is required', 'error'); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        head_user_id: form.head_user_id ? parseInt(form.head_user_id) : null,
      };
      if (modal === 'create') {
        await departmentsAPI.create(payload);
        addToast('Department created');
      } else {
        await departmentsAPI.update(modal.id, payload);
        addToast('Department updated');
      }
      setModal(null);
      load();
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (dept) => {
    const ok = await confirm({
      title: 'Delete Department',
      message: `Delete "${dept.name}"? Users in this department will become unassigned.`,
      confirmText: 'Delete',
    });
    if (!ok) return;
    try {
      await departmentsAPI.delete(dept.id);
      addToast('Department deleted');
      load();
    } catch { addToast('Failed to delete department', 'error'); }
  };

  const DEPT_COLORS = [
    'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
    'bg-violet-500/20 text-violet-400 border-violet-500/30',
    'bg-blue-500/20 text-blue-400 border-blue-500/30',
    'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    'bg-amber-500/20 text-amber-400 border-amber-500/30',
    'bg-pink-500/20 text-pink-400 border-pink-500/30',
  ];

  return (
    <div>
      <PageHeader
        title="Department Management"
        subtitle="Organize your company into departments with heads and members"
        actions={
          <button className="btn btn-primary" onClick={openCreate}>
            <FiPlus size={15} /> New Department
          </button>
        }
      />

      {loading ? <PageLoading /> : departments.length === 0 ? (
        <EmptyState
          icon={FiFolder}
          title="No departments yet"
          description="Create your first department to organize teams"
          action={<button className="btn btn-primary" onClick={openCreate}><FiPlus size={15} /> Create Department</button>}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {departments.map((dept, i) => {
            const colorClass = DEPT_COLORS[i % DEPT_COLORS.length];
            const isExpanded = expandedDept === dept.id;
            return (
              <div key={dept.id} className={`card p-5 hover:border-slate-600 transition-colors group border ${isExpanded ? 'border-slate-600' : ''}`}>
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg border ${colorClass}`}>
                    {dept.name[0]?.toUpperCase()}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openEdit(dept)} className="p-1.5 rounded-lg hover:bg-slate-600 text-slate-400 hover:text-white" title="Edit">
                      <FiEdit2 size={13} />
                    </button>
                    <button onClick={() => handleDelete(dept)} className="p-1.5 rounded-lg hover:bg-red-900/40 text-slate-400 hover:text-red-400" title="Delete">
                      <FiTrash2 size={13} />
                    </button>
                  </div>
                </div>

                <h3 className="font-semibold text-white mb-1">{dept.name}</h3>
                {dept.description && <p className="text-xs text-slate-400 mb-3 line-clamp-2">{dept.description}</p>}

                {/* Head of Department */}
                {dept.head_name && (
                  <div className="flex items-center gap-2 mb-3 px-2.5 py-1.5 rounded-lg bg-indigo-900/20 border border-indigo-500/20">
                    <FiUser size={11} className="text-indigo-400 shrink-0" />
                    <span className="text-xs text-indigo-300 truncate">Head: {dept.head_name}</span>
                  </div>
                )}

                {/* Member count + expand button */}
                <button
                  onClick={() => setExpandedDept(isExpanded ? null : dept.id)}
                  className="w-full flex items-center gap-2 text-xs text-slate-500 hover:text-slate-300 transition-colors"
                >
                  <FiUsers size={12} />
                  <span className="font-medium text-slate-400">{dept.user_count ?? 0} member{dept.user_count !== 1 ? 's' : ''}</span>
                  <span className="ml-auto">{isExpanded ? '▲ Hide' : '▼ Show'}</span>
                </button>

                {/* Expanded member list */}
                {isExpanded && (
                  <div className="mt-3 space-y-1 border-t border-slate-700 pt-3">
                    {(dept.members || []).length === 0 ? (
                      <p className="text-xs text-slate-500 italic">No members assigned</p>
                    ) : (
                      (dept.members || []).map(m => (
                        <div key={m.id} className="flex items-center gap-2 py-1">
                          <Avatar user={m} size={6} />
                          <div className="min-w-0">
                            <p className="text-xs text-white truncate">
                              {m.first_name ? `${m.first_name} ${m.last_name || ''}`.trim() : m.username}
                            </p>
                            <p className="text-xs text-slate-500 capitalize">{(m.role || '').replace(/_/g, ' ')}</p>
                          </div>
                          {dept.head_user_id === m.id && (
                            <span className="ml-auto text-xs bg-indigo-600/20 text-indigo-400 px-1.5 py-0.5 rounded">Head</span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="modal-content bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
              <h2 className="text-lg font-bold text-white">{modal === 'create' ? 'New Department' : 'Edit Department'}</h2>
              <button onClick={() => setModal(null)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400"><FiX size={16} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="label">Department Name *</label>
                <input className="input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Engineering" />
              </div>
              <div>
                <label className="label">Description</label>
                <textarea className="textarea" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={3} placeholder="What does this department do?" />
              </div>
              <div>
                <label className="label">Head of Department</label>
                <select className="select" value={form.head_user_id} onChange={e => setForm(p => ({ ...p, head_user_id: e.target.value }))}>
                  <option value="">— No Head —</option>
                  {allUsers.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.first_name ? `${u.first_name} ${u.last_name || ''}`.trim() : u.username}
                      {u.role ? ` (${u.role.replace(/_/g, ' ')})` : ''}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-500 mt-1">Head of Department can assign tasks & approve work for this department.</p>
              </div>
            </div>
            <div className="flex gap-3 justify-end px-6 py-4 border-t border-slate-700">
              <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                <FiSave size={14} /> {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
