# SmartTask Manager — React Frontend

Production-ready React SPA for the SmartTask Manager platform. Integrates with the Django backend via REST API.

## Tech Stack
- React 18 + Vite
- React Router v6
- Tailwind CSS v3
- Axios (CSRF-aware for Django sessions)
- Recharts (analytics/dashboards)
- React Icons (Feather set)

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env: set VITE_API_URL=http://your-django-server:8000

# 3. Start dev server (localhost:3000)
npm run dev

# 4. Production build → dist/
npm run build
```

---

## Django Backend Requirements

### 1. CORS (install django-cors-headers)
```python
INSTALLED_APPS += ['corsheaders']
MIDDLEWARE = ['corsheaders.middleware.CorsMiddleware', ...rest]
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOWED_ORIGINS = ['http://localhost:3000']  # or your frontend URL
```

### 2. CSRF + Session cookies
```python
CSRF_COOKIE_HTTPONLY = False   # Must be False so JS can read it
SESSION_COOKIE_SAMESITE = 'Lax'
CSRF_COOKIE_SAMESITE = 'Lax'
CSRF_TRUSTED_ORIGINS = ['http://localhost:3000']
```

### 3. Required API Endpoints
See full list in README — covers auth, projects, tasks, users, departments, roles, activity, messages.

---

## Features

| Feature | Details |
|---|---|
| RBAC | Admin / Head of Dept / Manager / Senior / Junior / Employee + custom roles |
| Projects | CRUD, member assignment, progress tracking, status/priority |
| Tasks | Full lifecycle, subtasks, comments, file attachments, approval workflow |
| Kanban | Drag-and-drop board per project |
| Admin Panel | User/dept/role management, per-user permissions |
| Recycle Bin | Soft-delete with restore + admin purge |
| Analytics | Charts: weekly activity, status pie, team performance, monthly trend |
| Messaging | Direct messages + channels (polling) |
| Activity Log | Full audit log with filtering |
| Responsive | Mobile + desktop |

---

## Nginx Production Config

```nginx
server {
    listen 80;
    server_name yourapp.com;
    root /var/www/smart-task-manager/dist;
    index index.html;

    location / { try_files $uri $uri/ /index.html; }

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

---

## Structure

```
src/
  api/          # API service layer
  context/      # AuthContext, AppContext (toasts + confirm dialogs)
  components/
    auth/       # Login, Profile, Settings
    common/     # Layout, Sidebar, shared UI
    dashboard/  # Dashboard, Analytics
    projects/   # Projects, Kanban, RecycleBin
    tasks/      # Task detail/form/list
    admin/      # Users, Departments, Roles
    activity/   # Activity log
    messages/   # DM + channels
  App.jsx       # Routes + guards
  main.jsx
```
