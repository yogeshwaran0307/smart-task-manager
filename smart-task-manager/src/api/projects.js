import api from './axios';

export const projectsAPI = {
  list: (params) => api.get('/api/projects/', { params }),
  get: (id) => api.get(`/api/projects/${id}/`),
  create: (data) => api.post('/api/projects/', data),
  update: (id, data) => api.patch(`/api/projects/${id}/`, data),
  delete: (id) => api.delete(`/api/projects/${id}/`),
  restore: (id) => api.post(`/api/projects/${id}/restore/`),
  purge: (id) => api.delete(`/api/projects/${id}/purge/`),
  submitForApproval: (id) => api.post(`/api/projects/${id}/submit-approval/`),
  approveProject: (id, data) => api.post(`/api/projects/${id}/approve/`, data || {}),
  rejectProject: (id, data) => api.post(`/api/projects/${id}/reject/`, data),
  getKanban: (id) => api.get(`/api/projects/${id}/kanban/`),
  updateKanbanTask: (taskId, data) => api.patch(`/api/tasks/${taskId}/kanban/`, data),
  getAnalytics: () => api.get('/api/projects/analytics/'),
  getRecycleBin: () => api.get('/api/projects/recycle-bin/'),
  addMember: (id, data) => api.post(`/api/projects/${id}/members/`, data),
  removeMember: (id, userId) => api.delete(`/api/projects/${id}/members/${userId}/`),
  updateMemberRole: (id, userId, role) => api.patch(`/api/projects/${id}/members/${userId}/`, { role }),
  getDashboard: () => api.get('/api/dashboard/'),
};

export const approvalsAPI = {
  list: () => api.get('/api/approvals/'),
};
