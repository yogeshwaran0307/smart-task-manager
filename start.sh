#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Smart Task Manager — Quick-start script (MySQL edition)
# Run from the project root:  bash start.sh
# ─────────────────────────────────────────────────────────────────────────────
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/smart-task-manager"

echo ""
echo "=========================================="
echo "  Smart Task Manager — MySQL Edition"
echo "=========================================="
echo ""

# ── 1. Check .env exists ──────────────────────────────────────────────────
if [ ! -f "$BACKEND/.env" ]; then
  echo "⚠️  No .env found in backend/. Copying .env.example → .env"
  cp "$BACKEND/.env.example" "$BACKEND/.env"
  echo "   ➜  Edit backend/.env with your MySQL credentials, then re-run this script."
  exit 1
fi

# ── 2. Python virtual environment ─────────────────────────────────────────
cd "$BACKEND"
if [ ! -d "venv" ]; then
  echo "▶  Creating Python virtual environment..."
  python3 -m venv venv
fi

echo "▶  Activating virtual environment..."
source venv/bin/activate

# ── 3. Install Python dependencies ────────────────────────────────────────
echo "▶  Installing Python dependencies..."
pip install --quiet -r requirements.txt

# ── 4. Run migrations ─────────────────────────────────────────────────────
echo "▶  Running database migrations..."
python manage.py migrate

# ── 5. Frontend dependencies ──────────────────────────────────────────────
cd "$FRONTEND"
if [ ! -d "node_modules" ]; then
  echo "▶  Installing frontend dependencies (npm install)..."
  npm install --silent
fi

# ── 6. Start servers in background ────────────────────────────────────────
echo ""
echo "▶  Starting backend on http://localhost:8000 ..."
cd "$BACKEND"
python manage.py runserver &
BACKEND_PID=$!

sleep 2

echo "▶  Starting frontend on http://localhost:3000 ..."
cd "$FRONTEND"
npm run dev &
FRONTEND_PID=$!

echo ""
echo "✅  Both servers running!"
echo "   Backend  →  http://localhost:8000"
echo "   Frontend →  http://localhost:3000"
echo "   Admin    →  http://localhost:8000/admin"
echo ""
echo "   Press Ctrl+C to stop both servers."
echo ""

# Wait and clean up on exit
trap "echo ''; echo 'Stopping servers...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM
wait
