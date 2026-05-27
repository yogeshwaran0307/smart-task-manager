# Smart Task Manager — How to Run (MySQL Edition)

## Prerequisites

| Tool | Version | Download |
|------|---------|---------|
| Python | 3.10+ | https://python.org |
| Node.js | 18+ | https://nodejs.org |
| MySQL | 8.0+ | https://dev.mysql.com/downloads/ |
| pip | latest | bundled with Python |

> **MySQL must be installed and running before you start the backend.**

---

## Step 1 — Create the MySQL Database

Open your MySQL shell (or MySQL Workbench) and run:

```sql
CREATE DATABASE smart_task_manager CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

If you want a dedicated user instead of root (recommended):

```sql
CREATE USER 'taskuser'@'localhost' IDENTIFIED BY 'YourPassword123';
GRANT ALL PRIVILEGES ON smart_task_manager.* TO 'taskuser'@'localhost';
FLUSH PRIVILEGES;
```

---

## Step 2 — Configure the Backend Environment

```bash
cd backend
cp .env.example .env
```

Open `.env` in any text editor and fill in your MySQL credentials:

```
DB_NAME=smart_task_manager
DB_USER=root            # or taskuser if you created a dedicated user
DB_PASSWORD=your_mysql_password
DB_HOST=127.0.0.1
DB_PORT=3306
```

Leave everything else as-is for local development.

---

## Step 3 — Set Up the Python Virtual Environment

```bash
# From the backend/ folder:
python -m venv venv

# Activate it:
# macOS / Linux:
source venv/bin/activate
# Windows (CMD):
venv\Scripts\activate.bat
# Windows (PowerShell):
venv\Scripts\Activate.ps1
```

---

## Step 4 — Install Python Dependencies

```bash
pip install -r requirements.txt
```

> This installs Django, Django REST Framework, CORS headers, `mysqlclient` (MySQL adapter), and `dj-database-url`.

**If mysqlclient fails to install on your system:**

- **macOS**: `brew install mysql-client pkg-config` then retry.
- **Ubuntu/Debian**: `sudo apt-get install python3-dev default-libmysqlclient-dev build-essential pkg-config` then retry.
- **Windows**: Download the prebuilt wheel from https://www.lfd.uci.edu/~gohlke/pythonlibs/#mysqlclient and install with `pip install <wheel-file>`.

---

## Step 5 — Run Database Migrations

```bash
python manage.py migrate
```

This creates all tables in MySQL. You should see output like:

```
Applying api.0001_initial... OK
Applying api.0002_extensionrequest... OK
Applying api.0003_add_eta_fields... OK
Applying api.0004_project_task_codes... OK
```

---

## Step 6 — (Optional) Seed Demo Data

```bash
python manage.py seed_data
```

This creates sample users, departments, projects, and tasks so you can explore the app immediately.

---

## Step 7 — Create a Superuser (Admin)

```bash
python manage.py createsuperuser
```

Follow the prompts to set a username and password. You can then log in at `http://localhost:8000/admin/`.

---

## Step 8 — Start the Backend Server

```bash
python manage.py runserver
```

The API is now live at **http://localhost:8000**.

---

## Step 9 — Set Up and Start the Frontend

Open a **new terminal window** (keep the backend running):

```bash
cd smart-task-manager
cp .env.example .env     # already has VITE_API_URL=http://localhost:8000
npm install
npm run dev
```

The frontend is now live at **http://localhost:3000**.

---

## Quick-Start Summary

```bash
# Terminal 1 — Backend
cd backend
cp .env.example .env        # edit with your MySQL credentials
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py seed_data  # optional demo data
python manage.py runserver

# Terminal 2 — Frontend
cd smart-task-manager
npm install
npm run dev
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `django.db.utils.OperationalError: (2002)` | MySQL isn't running — start it first |
| `django.db.utils.OperationalError: (1045) Access denied` | Wrong DB_USER/DB_PASSWORD in `.env` |
| `django.db.utils.OperationalError: (1049) Unknown database` | Run the `CREATE DATABASE` command in Step 1 |
| `mysqlclient` install fails | See platform-specific tips in Step 4 |
| CORS errors in browser | Make sure backend is on port 8000 and frontend on 3000 |
| Port 8000 already in use | `python manage.py runserver 8001` and update frontend `.env` |
