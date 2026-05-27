import api from './axios';

export const authAPI = {
  login: (username, password) =>
    api.post('/api/auth/login/', { username, password }),

  logout: () =>
    api.post('/api/auth/logout/'),

  getProfile: () =>
    api.get('/api/auth/me/'),

  updateProfile: (data) =>
    api.patch('/api/auth/me/', data),

  updatePassword: (data) =>
    api.post('/api/auth/change-password/', data),

  getCsrfToken: () =>
    api.get('/api/auth/csrf/'),
};
