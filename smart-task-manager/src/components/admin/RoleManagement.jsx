import { useState, useEffect } from 'react';
import { rolesAPI } from '../../api/users';
import { useApp } from '../../context/AppContext';
import { PageHeader, PageLoading, EmptyState } from '../common/ui';
import { FiShield, FiPlus, FiEdit2, FiTrash2, FiX, FiSave, FiLock, FiUsers, FiAlertCircle } from 'react-icons/fi';

const SYSTEM_ROLES = [
  { name: 'admin',              label: 'Administrator',      description: 'Full access to all features and settings',        color: 'text-red-400 bg-red-500/10 border-red-500/20' },
  { name: 'manager',            label: 'Manager',            description: 'Create projects, manage teams, view all data',    color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20' },
  { name: 'head_of_department', label: 'Head of Department', description: 'Manage dept tasks, approve submissions',          color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
  { name: 'senior',             label: 'Senior',             description: 'Create/assign tasks, view dept data',             color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  { name: 'junior',             label: 'Junior',             description: 'Work on assigned tasks, limited visibility',      color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  { name: 'employee',           label: 'Employee',           description: 'Basic access to assigned work only',              color: 'text-slate-400 bg-slate-500/10 border-slate-500/20' },
];

const ALL_PERMISSIONS = [
  { key: 'view_all_projects',  label: 'View All Projects',   desc: 'See all projects regardless of assignment' },
  { key: 'create_projects',    label: 'Create Projects',     desc: 'Ability to create new projects' },
  { key: 'delete_projects',    label: 'Delete Projects',     desc: 'Delete projects (moves to recycle bin)' },
  { key: 'manage_members',     label: 'Manage Members',      desc: 'Add / remove members from projects' },
  { key: 'view_analytics',     label: 'View Analytics',      desc: 'Access analytics dashboards' },
  { key: 'view_all_analytics', label: 'All Analytics',       desc: 'See company-wide analytics' },
  { key: 'approve_tasks',      label: 'Approve Tasks',       desc: 'Approve or reject task submissions' },
  { key: 'manage_recycle_bin', label: 'Manage Recycle Bin',  desc: 'Restore or permanently delete items' },
  { key: 'purge_items',        label: 'Purge Items',         desc: 'Permanently delete bypassing recycle bin' },
  { key: 'view_all_users',     label: 'View All Users',      desc: 'See full user directory' },
  { key: 'manage_users',       label: 'Manage Users',        desc: 'Create, edit, deactivate users' },
  { key: 'manage_departments', label: 'Manage Departments',  desc: 'Create and edit departments' },
  { key: 'manage_roles',       label: 'Manage Roles',        desc: 'Create and edit custom roles' },
  { key: 'export_data',        label: 'Export Data',         desc: 'Export reports and data' },
  { key: 'view_activity_log',  label: 'Activity Log',        desc: 'See full system activity log' },
];

export default function RoleManagement() {
  const { addToast, confirm } = useApp();
  const [customRoles, setCustomRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', permissions: [] });
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    rolesAPI.list()
      .then(r => setCustomRoles(r.data?.results ?? r.data ?? []))
      .catch(() => setCustomRoles([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setForm({ name: '', description: '', permissions: [] });
    setModal('create');
  };

  const openEdit = (role) => {
    setForm({ name: role.name || '', description: role.description || '',
      permissions: Array.isArray(role.permissions) ? [...role.permissions] : [] });
    setModal(role);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { addToast('Role name is required', 'error'); return; }
    if (SYSTEM_ROLES.some(r => r.name === form.name.trim().toLowerCase())) {
      addToast('Cannot use a system role name', 'error'); return;
    }
    setSaving(true);
    try {
      if (modal === 'create') {
        await rolesAPI.create(form);
        addToast('Role created — assign it to users in User Management');
      } else {
        await rolesAPI.update(modal.id, form);
        const n = modal.user_count || 0;
        addToast(n > 0 ? `Role updated — ${n} user${n !== 1 ? 's' : ''} now have updated permissions` : 'Role updated');
      }
      setModal(null);
      load();
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to save role', 'error');
    } finally { setSaving(false); }
  };

  const handleDelete = async (role) => {
    const n = role.user_count || 0;
    const ok = await confirm({
      title: 'Delete Role',
      message: n > 0
        ? `Delete "${role.name}"? ${n} user${n !== 1 ? 's' : ''} will lose its permissions.`
        : `Delete custom role "${role.name}"?`,
      confirmText: 'Delete',
    });
    if (!ok) return;
    try { await rolesAPI.delete(role.id); addToast('Role deleted'); load(); }
    catch { addToast('Failed', 'error'); }
  };

  const toggle = (key) => {
    setForm(prev => ({
      ...prev,
      permissions: prev.permissions.includes(key)
        ? prev.permissions.filter(x => x !== key)
        : [...prev.permissions, key],
    }));
  };

  return (
    <div>
      <PageHeader
        title="Role Management"
        subtitle="Define custom roles and their access permissions"
        actions={<button className="btn btn-primary" onClick={openCreate}><FiPlus size={15} />New Role</button>}
      />

      {/* System roles (info only) */}
      <div className="mb-8">
        <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
          <FiLock size={12} /> System Roles — built-in, cannot be edited
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {SYSTEM_ROLES.map(role => (
            <div key={role.name} className={`border rounded-xl p-4 ${role.color}`}>
              <div className="flex items-center gap-2 mb-1">
                <FiShield size={13} />
                <span className="text-sm font-semibold">{role.label}</span>
                <span className="ml-auto text-[10px] opacity-50 uppercase tracking-wider">system</span>
              </div>
              <p className="text-xs opacity-65 leading-relaxed">{role.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Custom roles */}
      <div>
        <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
          <FiShield size={12} /> Custom Roles
        </h2>
        {loading ? <PageLoading /> : customRoles.length === 0 ? (
          <EmptyState icon={FiShield} title="No custom roles yet"
            description="Create custom roles with specific permission sets. Assign them to users via User Management."
            action={<button className="btn btn-primary" onClick={openCreate}><FiPlus size={15} />Create Role</button>}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {customRoles.map(role => (
              <div key={role.id} className="card p-4 hover:border-slate-600 transition-colors group">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <FiShield size={14} className="text-indigo-400 shrink-0" />
                    <span className="text-sm font-semibold text-white truncate">{role.name}</span>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2 shrink-0">
                    <button onClick={() => openEdit(role)} className="p-1.5 rounded-lg hover:bg-slate-600 text-slate-400 hover:text-white"><FiEdit2 size={13} /></button>
                    <button onClick={() => handleDelete(role)} className="p-1.5 rounded-lg hover:bg-red-900/40 text-slate-400 hover:text-red-400"><FiTrash2 size={13} /></button>
                  </div>
                </div>
                {role.description && <p className="text-xs text-slate-400 mb-2 leading-relaxed">{role.description}</p>}
                {role.user_count > 0 && (
                  <p className="text-xs text-slate-500 mb-2 flex items-center gap-1">
                    <FiUsers size={11} /> {role.user_count} user{role.user_count !== 1 ? 's' : ''} assigned
                  </p>
                )}
                <div className="flex flex-wrap gap-1 mt-1">
                  {(role.permissions || []).length === 0 && (
                    <span className="text-xs text-slate-600 italic">No permissions assigned</span>
                  )}
                  {(role.permissions || []).slice(0, 3).map(p => {
                    const info = ALL_PERMISSIONS.find(x => x.key === p);
                    return <span key={p} className="text-[11px] bg-indigo-700/30 text-indigo-300 rounded-full px-2 py-0.5">{info?.label || p.replace(/_/g, ' ')}</span>;
                  })}
                  {(role.permissions || []).length > 3 && (
                    <span className="text-[11px] text-slate-500">+{role.permissions.length - 3}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col" style={{ maxHeight: '90vh' }}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 shrink-0">
              <h2 className="text-base font-bold text-white">
                {modal === 'create' ? 'New Custom Role' : `Edit "${modal.name}"`}
              </h2>
              <button onClick={() => setModal(null)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400"><FiX size={16} /></button>
            </div>

            <div className="overflow-y-auto flex-1 p-6 space-y-5">
              <div>
                <label className="label">Role Name *</label>
                <input className="input" value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. team_lead"
                  disabled={modal !== 'create'}
                />
                {modal !== 'create' && (
                  <p className="text-[11px] text-slate-500 mt-1">Name cannot change after creation (users are linked by name).</p>
                )}
              </div>
              <div>
                <label className="label">Description</label>
                <textarea className="textarea" value={form.description}
                  onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  rows={2} placeholder="What can this role do?" />
              </div>

              <div>
                <div className="flex items-center gap-2 mb-3">
                  <FiShield size={13} className="text-indigo-400" />
                  <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Permissions</span>
                  <span className="ml-auto text-xs text-slate-500">{form.permissions.length} selected</span>
                </div>

                {modal !== 'create' && (modal.user_count || 0) > 0 && (
                  <div className="mb-3 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-2">
                    <FiAlertCircle size={13} className="text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-300">
                      Changes apply immediately to all {modal.user_count} user{modal.user_count !== 1 ? 's' : ''} with this role.
                    </p>
                  </div>
                )}

                <div className="space-y-1">
                  {ALL_PERMISSIONS.map(({ key, label, desc }) => (
                    <label key={key}
                      className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer select-none transition-colors ${
                        form.permissions.includes(key)
                          ? 'border-indigo-500/40 bg-indigo-600/10 hover:bg-indigo-600/15'
                          : 'border-transparent hover:bg-slate-700/50'
                      }`}
                    >
                      <input type="checkbox" className="w-4 h-4 rounded accent-indigo-600 mt-0.5 shrink-0"
                        checked={form.permissions.includes(key)} onChange={() => toggle(key)} />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-200">{label}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">{desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 justify-end px-6 py-4 border-t border-slate-700 shrink-0">
              <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                <FiSave size={14} /> {saving ? 'Saving…' : 'Save Role'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
