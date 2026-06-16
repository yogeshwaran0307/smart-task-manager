// SsoCallback.jsx
// Place this file at: frontend/src/components/auth/SsoCallback.jsx

import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { authAPI } from '../../api/auth';

const BACKEND_URL = import.meta.env.VITE_API_URL || 'https://smart-task-manager-bhwe.onrender.com';

export default function SsoCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { fetchProfile } = useAuth();
  const [error, setError] = useState('');

  useEffect(() => {
    const ssoJwt = searchParams.get('sso_jwt') || searchParams.get('sso_token') || '';

    if (!ssoJwt) {
      setError('No SSO token found. Please open the app from the platform again.');
      return;
    }

    fetch(`${BACKEND_URL}/api/sso/callback/?sso_jwt=${encodeURIComponent(ssoJwt)}`)
      .then(res => res.json())
      .then(async (data) => {
        if (data.token && data.user) {
          // Store token exactly the same way AuthContext.login() does
          localStorage.setItem('auth_token', data.token);

          // Fetch full profile so AuthContext has all permissions/role info
          await fetchProfile();

          // Redirect to dashboard
          navigate('/dashboard', { replace: true });
        } else {
          setError(data.error || 'SSO login failed. Please try again.');
        }
      })
      .catch(() => {
        setError('Connection error. Please try again.');
      });
  }, []);

  if (error) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="bg-slate-800 p-8 rounded-xl text-center max-w-md">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="text-red-400 text-xl font-bold mb-2">SSO Login Failed</h2>
          <p className="text-slate-300 mb-6">{error}</p>
          <button
            onClick={() => navigate('/login')}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full w-12 h-12 border-4 border-slate-600 border-t-indigo-500 mx-auto mb-4" />
        <p className="text-slate-300 text-lg">Signing you in...</p>
      </div>
    </div>
  );
}
