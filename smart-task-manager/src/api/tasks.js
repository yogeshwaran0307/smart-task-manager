import api from './axios';

export const tasksAPI = {
  list: (params) => api.get('/api/tasks/', { params }),
  get: (id) => api.get(`/api/tasks/${id}/`),
  create: (data) => api.post('/api/tasks/', data),
  update: (id, data) => api.patch(`/api/tasks/${id}/`, data),
  delete: (id) => api.delete(`/api/tasks/${id}/`),
  myTasks: (params) => api.get('/api/tasks/my/', { params }),
  departmentTasks: (params) => api.get('/api/tasks/department/', { params }),
  updateKanban: (id, data) => api.patch(`/api/tasks/${id}/kanban/`, data),
  getSubtasks: (id) => api.get(`/api/tasks/${id}/subtasks/`),
  createSubtask: (id, data) => api.post(`/api/tasks/${id}/subtasks/`, data),
  toggleSubtask: (subtaskId) => api.post(`/api/subtasks/${subtaskId}/toggle/`),
  deleteSubtask: (subtaskId) => api.delete(`/api/subtasks/${subtaskId}/`),
  getComments: (id) => api.get(`/api/tasks/${id}/comments/`),
  addComment: (id, data) => api.post(`/api/tasks/${id}/comments/`, data),
  deleteComment: (commentId) => api.delete(`/api/comments/${commentId}/`),
  getAttachments: (id) => api.get(`/api/tasks/${id}/attachments/`),
  uploadAttachment: (id, data) => api.post(`/api/tasks/${id}/attachments/`, data),
  downloadAttachment: (attId) => api.get(`/api/attachments/${attId}/download/`),
  deleteAttachment: (attId) => api.delete(`/api/attachments/${attId}/`),
  submitForApproval: (id) => api.post(`/api/tasks/${id}/submit-approval/`),
  approveTask: (id, data) => api.post(`/api/tasks/${id}/approve/`, data || {}),
  rejectTask: (id, data) => api.post(`/api/tasks/${id}/reject/`, data),
  restore: (id) => api.post(`/api/tasks/${id}/restore/`),
  purge: (id) => api.delete(`/api/tasks/${id}/purge/`),
};

export const extensionAPI = {
  list: () => api.get('/api/extension-requests/'),
  create: (data) => api.post('/api/extension-requests/create/', data),
  get: (id) => api.get(`/api/extension-requests/${id}/`),
  approve: (id, data) => api.post(`/api/extension-requests/${id}/approve/`, data || {}),
  reject: (id, data) => api.post(`/api/extension-requests/${id}/reject/`, data || {}),
};
