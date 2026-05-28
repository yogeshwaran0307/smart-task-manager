import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { authAPI } from '../../api/auth';
import { PageHeader, Avatar } from '../common/ui';
import { FiSave, FiLock, FiUser } from 'react-icons/fi';

export function ProfilePage() {
  const { user, updateUser } = useAuth();
  const { addToast } = useApp();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    first_name: user?.first_name || '',
    last_name: user?.last_name || '',
    email: user?.email || '',
    phone: user?.phone || '',
    bio: user?.bio || '',
  });

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await authAPI.updateProfile(form);
      updateUser(res.data);
      addToast('Profile updated');
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to update profile', 'error');
    } finally {
      setSaving(false);
    }
  };

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const roleLabel = {
    admin: 'Administrator', manager: 'Manager', head_of_department: 'Head of Department',
    senior: 'Senior', junior: 'Junior', employee: 'Employee',
  }[user?.role] || user?.role || 'User';

  return (
    <div className="max-w-xl mx-auto">
      <PageHeader title="My Profile" />
      <div className="card p-6 mb-6">
        <div className="flex items-center gap-4 mb-6 pb-6 border-b border-slate-700">
          <div className="w-16 h-16 rounded-full bg-indigo-600 flex items-center justify-center text-2xl font-bold text-white">
            {(user?.first_name?.[0] || user?.username?.[0] || '?').toUpperCase()}
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">
              {user?.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : user?.username}
            </h2>
            <p className="text-sm text-slate-400">{roleLabel}</p>
            {user?.department_name && (
              <p className="text-xs text-slate-500 mt-0.5">{user.department_name}</p>
            )}
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">First Name</label>
              <input className="input" value={form.first_name} onChange={e => set('first_name', e.target.value)} />
            </div>
            <div>
              <label className="label">Last Name</label>
              <input className="input" value={form.last_name} onChange={e => set('last_name', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" value={form.email} onChange={e => set('email', e.target.value)} />
          </div>
          <div>
            <label className="label">Phone</label>
            <input className="input" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+1 555 000 0000" />
          </div>
          <div>
            <label className="label">Bio</label>
            <textarea className="textarea" value={form.bio} onChange={e => set('bio', e.target.value)} rows={3} placeholder="Tell your team about yourself…" />
          </div>
          <div className="pt-2">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              <FiSave size={14} /> {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function SettingsPage() {
  const { user } = useAuth();
  const { addToast } = useApp();
  const [saving, setSaving] = useState(false);
  const [pwForm, setPwForm] = useState({ old_password: '', new_password: '', confirm_password: '' }); // ✅ fixed: old_password
  const [notifSettings, setNotifSettings] = useState({
    email_on_task_assign: true,
    email_on_comment: true,
    email_on_approval: true,
  });

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (pwForm.new_password !== pwForm.confirm_password) {
      addToast('Passwords do not match', 'error');
      return;
    }
    if (pwForm.new_password.length < 4) {
      addToast('Password must be at least 4 characters', 'error');
      return;
    }
    setSaving(true);
    try {
      await authAPI.updatePassword({
        old_password: pwForm.old_password,   // ✅ fixed: was current_password, backend expects old_password
        new_password: pwForm.new_password,
      });
      addToast('Password updated successfully');
      setPwForm({ old_password: '', new_password: '', confirm_password: '' });
    } catch (err) {
      addToast(
        err.response?.data?.error ||
        err.response?.data?.detail ||
        'Failed to update password',
        'error'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <PageHeader title="Settings" />

      {/* Change Password */}
      <div className="card p-6">
        <h2 className="font-bold text-white mb-5 flex items-center gap-2">
          <FiLock size={16} className="text-indigo-400" /> Change Password
        </h2>
        <form onSubmit={handlePasswordChange} className="space-y-4">
          <div>
            <label className="label">Current Password</label>
            <input className="input" type="password" value={pwForm.old_password}
              onChange={e => setPwForm(p => ({ ...p, old_password: e.target.value }))} required />
          </div>
          <div>
            <label className="label">New Password</label>
            <input className="input" type="password" value={pwForm.new_password}
              onChange={e => setPwForm(p => ({ ...p, new_password: e.target.value }))} required minLength={4} />
          </div>
          <div>
            <label className="label">Confirm New Password</label>
            <input className="input" type="password" value={pwForm.confirm_password}
              onChange={e => setPwForm(p => ({ ...p, confirm_password: e.target.value }))} required />
          </div>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            <FiSave size={14} /> {saving ? 'Updating…' : 'Update Password'}
          </button>
        </form>
      </div>

      {/* Notifications */}
      <div className="card p-6">
        <h2 className="font-bold text-white mb-5">Notification Preferences</h2>
        <div className="space-y-3">
          {[
            { key: 'email_on_task_assign', label: 'Email when assigned to a task' },
            { key: 'email_on_comment', label: 'Email when someone comments on your task' },
            { key: 'email_on_approval', label: 'Email when approval is required' },
          ].map(item => (
            <label key={item.key} className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-700/40 cursor-pointer">
              <span className="text-sm text-slate-300">{item.label}</span>
              <div className="relative">
                <input type="checkbox" className="sr-only"
                  checked={notifSettings[item.key]}
                  onChange={e => setNotifSettings(p => ({ ...p, [item.key]: e.target.checked }))} />
                <div className={`w-10 h-5 rounded-full transition-colors ${notifSettings[item.key] ? 'bg-indigo-600' : 'bg-slate-600'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full transition-transform mt-0.5 ${notifSettings[item.key] ? 'translate-x-5' : 'translate-x-1'}`} />
                </div>
              </div>
            </label>
          ))}
        </div>
        <button className="btn btn-primary mt-4" onClick={() => addToast('Notification preferences saved')}>
          <FiSave size={14} /> Save Preferences
        </button>
      </div>

      {/* Account Info */}
      <div className="card p-6">
        <h2 className="font-bold text-white mb-4 flex items-center gap-2">
          <FiUser size={16} className="text-indigo-400" /> Account Info
        </h2>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-400">Username</span>
            <span className="text-white font-mono">{user?.username}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Role</span>
            <span className="text-white capitalize">{user?.role?.replace(/_/g, ' ')}</span>
          </div>
          {user?.department_name && (
            <div className="flex justify-between">
              <span className="text-slate-400">Department</span>
              <span className="text-white">{user.department_name}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-slate-400">Member since</span>
            <span className="text-white">{user?.date_joined ? new Date(user.date_joined).toLocaleDateString() : '—'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
