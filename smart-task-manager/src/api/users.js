import api from './axios';

export const usersAPI = {
  workload: (params) => api.get('/api/users/workload/', { params }),
  list: (params) => api.get('/api/users/', { params }),
  get: (id) => api.get(`/api/users/${id}/`),
  create: (data) => api.post('/api/users/', data),
  update: (id, data) => api.patch(`/api/users/${id}/`, data),
  delete: (id) => api.delete(`/api/users/${id}/`),
  toggleActive: (id) => api.post(`/api/users/${id}/toggle-active/`),
  assignDepartment: (id, departmentId) =>
    api.patch(`/api/users/${id}/`, { department: departmentId }),
  assignRole: (id, role) =>
    api.patch(`/api/users/${id}/`, { role }),
  updatePermissions: (id, permissions) =>
    api.patch(`/api/users/${id}/`, { permissions }),
  changePassword: (id, data) =>
    api.post(`/api/users/${id}/change-password/`, data),  // ✅ NEW
};

export const rolesAPI = {
  list: () => api.get('/api/roles/'),
  create: (data) => api.post('/api/roles/', data),
  update: (id, data) => api.patch(`/api/roles/${id}/`, data),
  delete: (id) => api.delete(`/api/roles/${id}/`),
};

export const departmentsAPI = {
  list: () => api.get('/api/departments/'),
  get: (id) => api.get(`/api/departments/${id}/`),
  create: (data) => api.post('/api/departments/', data),
  update: (id, data) => api.patch(`/api/departments/${id}/`, data),
  delete: (id) => api.delete(`/api/departments/${id}/`),
};