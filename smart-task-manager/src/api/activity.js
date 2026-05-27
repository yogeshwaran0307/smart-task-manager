import api from './axios';

export const activityAPI = {
  list: (params) => api.get('/api/activity/', { params }),
};

export const messagesAPI = {
  inbox: () => api.get('/api/messages/'),
  conversation: (userId, params) => api.get(`/api/messages/dm/${userId}/`, { params }),
  sendDM: (userId, content) => api.post(`/api/messages/dm/${userId}/`, { content }),
  channels: () => api.get('/api/messages/channels/'),
  getChannel: (id) => api.get(`/api/messages/channels/${id}/`),
  sendChannelMsg: (id, content) => api.post(`/api/messages/channels/${id}/`, { content }),
  createChannel: (data) => api.post('/api/messages/channels/', data),
};
