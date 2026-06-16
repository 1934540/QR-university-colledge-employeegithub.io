# BolashaqQR Django Backend

## Local setup

```powershell
cd backend
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py seed_demo
.\.venv\Scripts\python.exe manage.py createsuperuser
.\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000
```

Jazzmin admin: `http://127.0.0.1:8000/admin/`

API health: `http://127.0.0.1:8000/api/health/`

Employee demo login examples:

- `emp001` / `emp001`
- `emp002` / `emp002`
- `emp004` / `emp004`

## Frontend API URL

By default, local file/frontend mode uses `http://127.0.0.1:8000/api`.
On a deployed frontend, set the API URL in browser storage:

```js
localStorage.setItem("bolashaq_api_base", "https://YOUR_BACKEND_DOMAIN/api")
```

The current static Vercel frontend cannot host this Django server by itself; deploy the backend separately and point the frontend to its `/api` URL.

## Environment variables

Recommended production values:

```powershell
$env:DJANGO_SECRET_KEY="replace-with-a-long-secret"
$env:DJANGO_DEBUG="0"
$env:DJANGO_ALLOWED_HOSTS="api.example.com"
$env:CORS_ALLOWED_ORIGINS="https://example.com"
$env:BOLASHAQ_ADMIN_API_KEY="replace-with-admin-api-key"
$env:BOLASHAQ_REQUIRE_ADMIN_API_KEY="1"
```

When `BOLASHAQ_REQUIRE_ADMIN_API_KEY=1`, admin-style read endpoints such as `/api/employees/`, `/api/logs/`, and `/api/employees/<id>/logs/` require:

```text
X-Bolashaq-Admin-Key: replace-with-admin-api-key
```

Public endpoints intentionally remain available for the demo flow: `/api/health/`, `/api/auth/employee/`, `/api/gate-qr/`, and `/api/attendance/scan/`.
