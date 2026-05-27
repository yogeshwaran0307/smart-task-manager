FRONTEND
cd smart-task-manager
npm install
npm run dev

BACKEND
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver

LOGIN
Use any username and password.
