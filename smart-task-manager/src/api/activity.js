import api from './axios';

export const activityAPI = {
  list: (params) => api.get('/api/activity/', { params }),
};

export const messagesAPI = {
  inbox: () => api.get('/api/messages/'),
  conversation: (userId, params) => api.get(`/api/messages/dm/${userId}/`, { params }),
  sendDM: (userId, content) => api.post(`/api/messages/dm/${userId}/`, { content }),
  editDM: (msgId, content) => api.patch(`/api/messages/dm/msg/${msgId}/`, { content }),
  deleteDM: (msgId) => api.delete(`/api/messages/dm/msg/${msgId}/`),
  channels: () => api.get('/api/messages/channels/'),
  getChannel: (id) => api.get(`/api/messages/channels/${id}/`),
  sendChannelMsg: (id, content) => api.post(`/api/messages/channels/${id}/`, { content }),
  editChannelMsg: (msgId, content) => api.patch(`/api/messages/channels/msg/${msgId}/`, { content }),
  deleteChannelMsg: (msgId) => api.delete(`/api/messages/channels/msg/${msgId}/`),
  createChannel: (data) => api.post('/api/messages/channels/', data),
  deleteChannel: (channelId) => api.delete(`/api/messages/channels/${channelId}/`),
  addChannelMember: (channelId, userId) => api.post(`/api/messages/channels/${channelId}/members/`, { user_id: userId }),
  removeChannelMember: (channelId, userId) => api.delete(`/api/messages/channels/${channelId}/members/${userId}/`),
};