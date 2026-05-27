import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { FiLayers, FiEye, FiEyeOff, FiLoader } from 'react-icons/fi';

export default function LoginPage() {
  const { login, error, setError } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setSubmitting(true);
    const success = await login(username.trim(), password);
    setSubmitting(false);
    // Explicitly navigate — don't rely on state re-render in production
    if (success) {
      navigate('/dashboard', { replace: true });
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-indigo-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-600/30">
            <FiLayers size={24} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">SmartTask</h1>
          <p className="text-slate-400 text-sm mt-1">Sign in to your workspace</p>
        </div>

        <div className="card p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-xl px-4 py-3 text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="label">Username</label>
              <input
                type="text"
                className="input"
                placeholder="Enter your username"
                value={username}
                onChange={e => { setUsername(e.target.value); setError(null); }}
                autoFocus
                autoComplete="username"
                required
              />
            </div>

            <div>
              <label className="label">Password</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  className="input pr-10"
                  placeholder="Enter your password"
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError(null); }}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                  onClick={() => setShowPass(v => !v)}
                >
                  {showPass ? <FiEyeOff size={16} /> : <FiEye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting || !username || !password}
              className="btn btn-primary w-full justify-center py-2.5 text-sm font-semibold"
            >
              {submitting ? (
                <><FiLoader size={16} className="animate-spin" /> Signing in…</>
              ) : 'Sign In'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-600 mt-6">
          Smart Task Manager — Internal Platform
        </p>
      </div>
    </div>
  );
}
