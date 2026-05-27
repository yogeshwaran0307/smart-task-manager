import api from './axios';

export const notificationsAPI = {
  list: () => api.get('/api/notifications/'),
  markRead: (id) => api.post(`/api/notifications/${id}/read/`),
  markAllRead: () => api.post('/api/notifications/read-all/'),
};
