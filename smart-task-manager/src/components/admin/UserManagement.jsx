import { useState, useEffect, useCallback, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { usersAPI, departmentsAPI, rolesAPI } from '../../api/users';
import { PageLoading, PageHeader, Avatar } from '../common/ui';
import {
  FiUsers, FiPlus, FiSearch, FiEdit2, FiTrash2,
  FiToggleLeft, FiToggleRight, FiX, FiSave, FiShield,
  FiChevronDown, FiCheck, FiLock,  // ✅ added FiLock
} from 'react-icons/fi';

const SYSTEM_ROLES = ['admin', 'manager', 'head_of_department', 'senior', 'junior', 'employee'];

const ALL_PERMISSIONS = [
  { key: 'view_all_projects',   label: 'View All Projects',   desc: 'See all projects regardless of assignment' },
  { key: 'create_projects',     label: 'Create Projects',     desc: 'Create new projects' },
  { key: 'manage_members',      label: 'Manage Members',      desc: 'Add / remove project members' },
  { key: 'view_analytics',      label: 'View Analytics',      desc: 'Access analytics dashboards' },
  { key: 'approve_tasks',       label: 'Approve Tasks',       desc: 'Approve or reject task submissions' },
  { key: 'manage_recycle_bin',  label: 'Manage Recycle Bin',  desc: 'Restore or permanently delete items' },
  { key: 'view_all_users',      label: 'View All Users',      desc: 'See the full user directory' },
  { key: 'export_data',         label: 'Export Data',         desc: 'Export reports and data' },
];

/* ── helpers ── */
function getRolePerms(roleName, rolesList) {
  if (!roleName || SYSTEM_ROLES.includes(roleName.toLowerCase())) return [];
  const r = rolesList.find(x => x.name.toLowerCase() === roleName.toLowerCase());
  return r ? (r.permissions || []) : [];
}

/* ── Custom Role Select — properly positioned via getBoundingClientRect ── */
function RoleSelect({ value, onChange, rolesList }) {
  const [open, setOpen] = useState(false);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 220 });
  const btnRef = useRef(null);
  const dropRef = useRef(null);

  const systemOptions = SYSTEM_ROLES.map(r => ({ value: r, label: r.replace(/_/g, ' '), group: 'System Roles' }));
  const customOptions = rolesList.map(r => ({ value: r.name, label: r.name, group: 'Custom Roles' }));
  const allOptions = [...systemOptions, ...customOptions];
  const selectedLabel = allOptions.find(o => o.value === value)?.label || value || 'employee';

  const openDropdown = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setDropPos({
        top: rect.bottom + 4,
        left: rect.left,
        width: Math.max(rect.width, 220),
      });
    }
    setOpen(o => !o);
  };

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e) => {
      if (
        dropRef.current && !dropRef.current.contains(e.target) &&
        btnRef.current && !btnRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={openDropdown}
        className="w-full flex items-center justify-between bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white hover:border-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all capitalize"
      >
        <span>{selectedLabel.replace(/_/g, ' ')}</span>
        <FiChevronDown size={14} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          ref={dropRef}
          className="bg-slate-800 border border-slate-600 rounded-xl shadow-2xl overflow-hidden"
          style={{
            position: 'fixed',
            top: dropPos.top,
            left: dropPos.left,
            width: dropPos.width,
            zIndex: 99999,
            maxHeight: '260px',
            overflowY: 'auto',
          }}
        >
          {['System Roles', ...(rolesList.length ? ['Custom Roles'] : [])].map(group => {
            const opts = allOptions.filter(o => o.group === group);
            if (!opts.length) return null;
            return (
              <div key={group}>
                <p className="px-3 pt-2 pb-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider sticky top-0 bg-slate-800">
                  {group}
                </p>
                {opts.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onMouseDown={e => { e.preventDefault(); onChange(opt.value); setOpen(false); }}
                    className={`w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-slate-700 transition-colors capitalize ${value === opt.value ? 'text-indigo-300 bg-slate-700/60' : 'text-slate-200'}`}
                  >
                    <span>{opt.label.replace(/_/g, ' ')}</span>
                    {value === opt.value && <FiCheck size={12} className="text-indigo-400" />}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Department Select — properly positioned via getBoundingClientRect ── */
function DeptSelect({ value, onChange, departments }) {
  const [open, setOpen] = useState(false);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 220 });
  const btnRef = useRef(null);
  const dropRef = useRef(null);

  const label = departments.find(d => d.id === value)?.name || '— None —';

  const openDropdown = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setDropPos({
        top: rect.bottom + 4,
        left: rect.left,
        width: Math.max(rect.width, 220),
      });
    }
    setOpen(o => !o);
  };

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e) => {
      if (
        dropRef.current && !dropRef.current.contains(e.target) &&
        btnRef.current && !btnRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={openDropdown}
        className="w-full flex items-center justify-between bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white hover:border-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
      >
        <span>{label}</span>
        <FiChevronDown size={14} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          ref={dropRef}
          className="bg-slate-800 border border-slate-600 rounded-xl shadow-2xl overflow-hidden"
          style={{
            position: 'fixed',
            top: dropPos.top,
            left: dropPos.left,
            width: dropPos.width,
            zIndex: 99999,
            maxHeight: '260px',
            overflowY: 'auto',
          }}
        >
          <button
            type="button"
            onMouseDown={e => { e.preventDefault(); onChange(''); setOpen(false); }}
            className={`w-full px-3 py-2 text-sm text-left hover:bg-slate-700 transition-colors ${!value ? 'text-indigo-300 bg-slate-700/60' : 'text-slate-400'}`}
          >
            — None —
          </button>
          {departments.map(d => (
            <button
              key={d.id}
              type="button"
              onMouseDown={e => { e.preventDefault(); onChange(d.id); setOpen(false); }}
              className={`w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-slate-700 transition-colors ${value === d.id ? 'text-indigo-300 bg-slate-700/60' : 'text-slate-200'}`}
            >
              <span>{d.name}</span>
              {value === d.id && <FiCheck size={12} className="text-indigo-400" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── UserModal — defined outside to prevent re-mount ── */
function UserModal({ title, editForm, setEditForm, departments, rolesList, isEdit, saving, onClose, onSave }) {
  const rolePerms = getRolePerms(editForm.role, rolesList);
  const isCustomRole = editForm.role && !SYSTEM_ROLES.includes(editForm.role.toLowerCase());

  const togglePerm = (key) => {
    if (rolePerms.includes(key)) return;
    setEditForm(prev => ({
      ...prev,
      permissions: prev.permissions.includes(key)
        ? prev.permissions.filter(x => x !== key)
        : [...prev.permissions, key],
    }));
  };

  const handleRoleChange = (newRole) => {
    const newRolePerms = getRolePerms(newRole, rolesList);
    setEditForm(prev => {
      const filteredPerms = newRolePerms.length
        ? prev.permissions.filter(p => !newRolePerms.includes(p))
        : prev.permissions;
      return { ...prev, role: newRole, permissions: filteredPerms };
    });
  };

  const setField = (k, v) => setEditForm(prev => ({ ...prev, [k]: v }));

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)', zIndex: 200 }}>
      <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col" style={{ maxHeight: '90vh' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 shrink-0">
          <h2 className="text-base font-bold text-white">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 transition-colors">
            <FiX size={16} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Username {!isEdit && '*'}</label>
              <input
                className="input"
                value={editForm.username}
                onChange={e => setField('username', e.target.value)}
                placeholder="username"
                autoComplete="off"
                
              />
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" value={editForm.email}
                onChange={e => setField('email', e.target.value)} placeholder="email@company.com" />
            </div>
            <div>
              <label className="label">First Name</label>
              <input className="input" value={editForm.first_name}
                onChange={e => setField('first_name', e.target.value)} />
            </div>
            <div>
              <label className="label">Last Name</label>
              <input className="input" value={editForm.last_name}
                onChange={e => setField('last_name', e.target.value)} />
            </div>
            {!isEdit && (
              <div className="col-span-2">
                <label className="label">Password *</label>
                <input className="input" type="password" value={editForm.password}
                  onChange={e => setField('password', e.target.value)} autoComplete="new-password" />
              </div>
            )}

            <div>
              <label className="label">Role</label>
              <RoleSelect
                value={editForm.role}
                onChange={handleRoleChange}
                rolesList={rolesList}
              />
            </div>

            <div>
              <label className="label">Department</label>
              <DeptSelect
                value={editForm.department}
                onChange={v => setField('department', v)}
                departments={departments}
              />
            </div>

            <div>
              <label className="label">Phone</label>
              <input className="input" value={editForm.phone}
                onChange={e => setField('phone', e.target.value)} placeholder="+1 555 000 0000" />
            </div>
            <div className="flex items-center gap-3 pt-5">
              <input type="checkbox" id="active_chk" className="w-4 h-4 rounded accent-indigo-600"
                checked={editForm.is_active} onChange={e => setField('is_active', e.target.checked)} />
              <label htmlFor="active_chk" className="text-sm text-slate-300 cursor-pointer select-none">Active account</label>
            </div>
          </div>

          <div>
            <label className="label">Bio / Notes</label>
            <textarea className="textarea" value={editForm.bio}
              onChange={e => setField('bio', e.target.value)} rows={2} />
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <FiShield size={14} className="text-indigo-400" />
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Access Permissions</span>
            </div>

            {isCustomRole && rolePerms.length > 0 && (
              <div className="mb-3 p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/25">
                <p className="text-xs font-semibold text-indigo-300 mb-2">
                  Already included in role &quot;{editForm.role}&quot;:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {rolePerms.map(p => {
                    const info = ALL_PERMISSIONS.find(x => x.key === p);
                    return (
                      <span key={p} className="text-[11px] bg-indigo-700/40 text-indigo-300 rounded-full px-2 py-0.5">
                        {info ? info.label : p.replace(/_/g, ' ')}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {isCustomRole && rolePerms.length === 0 && (
              <p className="text-xs text-amber-400/80 mb-3 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                This custom role has no permissions assigned. You can grant extra permissions below, or{' '}
                <span className="underline">edit the role</span> in Role Management.
              </p>
            )}

            <p className="text-xs text-slate-500 mb-3">
              {isCustomRole
                ? 'Extra permissions on top of the role (role permissions above are auto-applied):'
                : "Grant extra permissions beyond this role's defaults:"}
            </p>

            <div className="grid grid-cols-2 gap-2">
              {ALL_PERMISSIONS.map(({ key, label, desc }) => {
                const fromRole = rolePerms.includes(key);
                const checked = editForm.permissions.includes(key) || fromRole;
                return (
                  <label
                    key={key}
                    className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition-colors select-none ${
                      fromRole
                        ? 'border-indigo-500/20 opacity-50 cursor-not-allowed bg-indigo-600/5'
                        : checked
                          ? 'border-indigo-500/40 bg-indigo-600/10 hover:bg-indigo-600/15 cursor-pointer'
                          : 'border-transparent hover:bg-slate-700/50 cursor-pointer'
                    }`}
                  >
                    <input type="checkbox"
                      className="w-4 h-4 rounded accent-indigo-600 mt-0.5 shrink-0"
                      checked={checked}
                      disabled={fromRole}
                      onChange={() => togglePerm(key)}
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-200 leading-tight">
                        {label}
                        {fromRole && <span className="text-indigo-400 font-normal ml-1">(via role)</span>}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-tight">{desc}</p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex gap-3 justify-end px-6 py-4 border-t border-slate-700 shrink-0">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={onSave} disabled={saving}>
            <FiSave size={14} /> {saving ? 'Saving…' : 'Save User'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ✅ NEW: Change Password Modal (admin only)
function ChangePasswordModal({ user, onClose, onSuccess, addToast }) {
  const [form, setForm] = useState({ new_password: '', confirm_password: '' });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.new_password) { addToast('Password is required', 'error'); return; }
    if (form.new_password !== form.confirm_password) { addToast('Passwords do not match', 'error'); return; }
    if (form.new_password.length < 4) { addToast('Password must be at least 4 characters', 'error'); return; }
    setSaving(true);
    try {
      await usersAPI.changePassword(user.id, { new_password: form.new_password });
      addToast(`Password updated for ${user.username}`);
      onSuccess();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to update password', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)', zIndex: 300 }}>
      <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <FiLock size={15} className="text-indigo-400" />
            Change Password
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400">
            <FiX size={16} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="px-3 py-2 rounded-lg bg-slate-700/50 text-sm text-slate-300">
            Setting new password for <span className="text-white font-semibold">{user.username}</span>
          </div>
          <div>
            <label className="label">New Password</label>
            <input
              className="input"
              type="password"
              value={form.new_password}
              onChange={e => setForm(p => ({ ...p, new_password: e.target.value }))}
              placeholder="Min. 4 characters"
              autoFocus
            />
          </div>
          <div>
            <label className="label">Confirm Password</label>
            <input
              className="input"
              type="password"
              value={form.confirm_password}
              onChange={e => setForm(p => ({ ...p, confirm_password: e.target.value }))}
              placeholder="Repeat new password"
            />
          </div>
        </div>

        <div className="flex gap-3 justify-end px-6 py-4 border-t border-slate-700">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            <FiSave size={14} /> {saving ? 'Updating…' : 'Update Password'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Main ── */
export default function UserManagement() {
  const { addToast, confirm } = useApp();
  const { isManager } = useAuth();
  const [users, setUsers]         = useState([]);
  const [departments, setDepts]   = useState([]);
  const [rolesList, setRolesList] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [modalUser, setModalUser] = useState(null);
  const [editForm, setEditForm]   = useState({});
  const [saving, setSaving]       = useState(false);
  const [pwUser, setPwUser]       = useState(null); // ✅ NEW: tracks which user's password to change

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      usersAPI.list({ search, role: roleFilter }),
      departmentsAPI.list().catch(() => ({ data: [] })),
      rolesAPI.list().catch(() => ({ data: [] })),
    ]).then(([uRes, dRes, rRes]) => {
      setUsers(uRes.data?.results ?? uRes.data ?? []);
      setDepts(dRes.data?.results ?? dRes.data ?? []);
      setRolesList(rRes.data?.results ?? rRes.data ?? []);
    }).catch(() => setUsers([]))
      .finally(() => setLoading(false));
  }, [search, roleFilter]);

  useEffect(() => { load(); }, [load]);

  const openEdit = (user) => {
    const rolePerms = getRolePerms(user.role, rolesList);
    let directPerms = [];
    if (Array.isArray(user.direct_permissions)) {
      directPerms = user.direct_permissions;
    } else if (Array.isArray(user.permissions)) {
      directPerms = user.permissions.filter(p => !rolePerms.includes(p));
    }
    setEditForm({
      username: user.username || '',
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      email: user.email || '',
      role: user.role || 'employee',
      department: user.department || '',
      phone: user.phone || '',
      bio: user.bio || '',
      is_active: user.is_active !== false,
      permissions: directPerms,
    });
    setModalUser(user);
  };

  const openCreate = () => {
    setEditForm({
      username: '', first_name: '', last_name: '', email: '',
      password: '', role: 'employee', department: '', phone: '', bio: '',
      is_active: true, permissions: [],
    });
    setModalUser('new');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const rolePerms = getRolePerms(editForm.role, rolesList);
      const directOnly = (editForm.permissions || []).filter(p => !rolePerms.includes(p));
      const payload = { ...editForm, permissions: directOnly };

      if (modalUser !== 'new') {
        await usersAPI.update(modalUser.id, payload);
        addToast('User updated');
      } else {
        if (!editForm.username?.trim()) { addToast('Username required', 'error'); setSaving(false); return; }
        if (!editForm.password?.trim()) { addToast('Password required', 'error'); setSaving(false); return; }
        await usersAPI.create(payload);
        addToast('User created');
      }
      setModalUser(null);
      load();
    } catch (err) {
      addToast(
        err.response?.data?.detail ||
        Object.values(err.response?.data || {})[0]?.[0] ||
        'Failed to save',
        'error'
      );
    } finally { setSaving(false); }
  };

  const handleToggleActive = async (user) => {
    const ok = await confirm({
      title: user.is_active ? 'Deactivate User' : 'Activate User',
      message: `${user.is_active ? 'Deactivate' : 'Activate'} "${user.username}"?`,
      confirmText: user.is_active ? 'Deactivate' : 'Activate',
      danger: user.is_active,
    });
    if (!ok) return;
    try { await usersAPI.toggleActive(user.id); addToast('Updated'); load(); }
    catch { addToast('Failed', 'error'); }
  };

  const handleDelete = async (user) => {
    const ok = await confirm({
      title: 'Delete User',
      message: `Permanently delete "${user.username}"?`,
      confirmText: 'Delete',
    });
    if (!ok) return;
    try { await usersAPI.delete(user.id); addToast('Deleted'); load(); }
    catch { addToast('Failed', 'error'); }
  };

  const allRoleOptions = [
    ...SYSTEM_ROLES,
    ...rolesList.map(r => r.name).filter(n => !SYSTEM_ROLES.includes(n.toLowerCase())),
  ];
  const isEdit = modalUser && modalUser !== 'new';

  return (
    <div>
      <PageHeader
        title="User Management"
        subtitle="Manage accounts, roles, departments and permissions"
        actions={isManager && (
          <button className="btn btn-primary" onClick={openCreate}>
            <FiPlus size={15} />New User
          </button>
        )}
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px]">
          <FiSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            className="input pl-9"
            placeholder="Search users…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          className="select w-auto min-w-[150px]"
          value={roleFilter}
          onChange={e => setRoleFilter(e.target.value)}
        >
          <option value="">All Roles</option>
          {allRoleOptions.map(r => (
            <option key={r} value={r} className="capitalize">{r.replace(/_/g, ' ')}</option>
          ))}
        </select>
      </div>

      {loading ? <PageLoading /> : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Department</th>
                <th>Permissions</th>
                <th>Status</th>
                <th>Joined</th>
                {isManager && <th className="text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <Avatar user={u} size={8} />
                      <div>
                        <p className="text-sm font-medium text-white">
                          {u.first_name ? `${u.first_name} ${u.last_name || ''}`.trim() : u.username}
                        </p>
                        <p className="text-xs text-slate-500">{u.email || u.username}</p>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="badge badge-in_progress capitalize">
                      {(u.role || 'employee').replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td><span className="text-sm text-slate-400">{u.department_name || '—'}</span></td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {(u.permissions || []).slice(0, 2).map(p => (
                        <span key={p} className="text-[11px] bg-slate-700 text-slate-400 rounded-full px-2 py-0.5 whitespace-nowrap">
                          {ALL_PERMISSIONS.find(x => x.key === p)?.label || p.replace(/_/g, ' ')}
                        </span>
                      ))}
                      {(u.permissions || []).length > 2 && (
                        <span className="text-[11px] text-slate-500">+{u.permissions.length - 2} more</span>
                      )}
                      {(u.permissions || []).length === 0 && <span className="text-xs text-slate-600">—</span>}
                    </div>
                  </td>
                  <td>
                    <span className={`badge ${u.is_active !== false ? 'badge-active' : 'badge-archived'}`}>
                      {u.is_active !== false ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <span className="text-xs text-slate-500">
                      {u.date_joined ? new Date(u.date_joined).toLocaleDateString() : '—'}
                    </span>
                  </td>
                  {isManager && (
                    <td>
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => openEdit(u)}
                          className="p-1.5 rounded-lg hover:bg-slate-600 text-slate-400 hover:text-white"
                          title="Edit"
                        >
                          <FiEdit2 size={14} />
                        </button>
                        {/* ✅ NEW: Change Password button */}
                        <button
                          onClick={() => setPwUser(u)}
                          className="p-1.5 rounded-lg hover:bg-indigo-900/40 text-slate-400 hover:text-indigo-400"
                          title="Change Password"
                        >
                          <FiLock size={14} />
                        </button>
                        <button
                          onClick={() => handleToggleActive(u)}
                          className={`p-1.5 rounded-lg transition-colors ${
                            u.is_active !== false
                              ? 'hover:bg-amber-900/30 text-slate-400 hover:text-amber-400'
                              : 'hover:bg-emerald-900/30 text-slate-400 hover:text-emerald-400'
                          }`}
                          title={u.is_active !== false ? 'Deactivate' : 'Activate'}
                        >
                          {u.is_active !== false ? <FiToggleRight size={15} /> : <FiToggleLeft size={15} />}
                        </button>
                        <button
                          onClick={() => handleDelete(u)}
                          className="p-1.5 rounded-lg hover:bg-red-900/40 text-slate-400 hover:text-red-400"
                          title="Delete"
                        >
                          <FiTrash2 size={14} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {users.length === 0 && (
            <div className="text-center py-12 text-slate-500">No users found</div>
          )}
        </div>
      )}

      {modalUser !== null && (
        <UserModal
          title={isEdit ? `Edit — ${modalUser.username}` : 'Create New User'}
          editForm={editForm}
          setEditForm={setEditForm}
          departments={departments}
          rolesList={rolesList}
          isEdit={!!isEdit}
          saving={saving}
          onClose={() => setModalUser(null)}
          onSave={handleSave}
        />
      )}

      {/* ✅ NEW: Change Password Modal */}
      {pwUser && (
        <ChangePasswordModal
          user={pwUser}
          onClose={() => setPwUser(null)}
          onSuccess={() => setPwUser(null)}
          addToast={addToast}
        />
      )}
    </div>
  );
}
