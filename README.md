# BolashaqQR

BolashaqQR - QR attendance system for an educational organization. The project is now a static frontend plus Node.js Vercel Functions API. The only production database is Supabase.

There is no Django backend and no Django migrations. Tables are created manually in Supabase SQL Editor using the SQL files in `supabase/`.

## Stack

- Frontend: static HTML/CSS/JavaScript
- API: Node.js Vercel Functions in `api/`
- Database: Supabase tables in the public schema
- Deployment: Vercel

## Attendance Settings

The admin settings panel includes an optional geofence for QR attendance scans:

- When `Allow scanning only near the entrance point` is enabled, employees can check in only inside the configured latitude/longitude radius.
- When the checkbox is disabled, QR scans and the scan simulator are allowed from any location.
- Latitude, longitude, and radius fields are disabled in the UI while the geofence is off.

## Terminal Live Feed

The terminal QR page refreshes the attendance feed from `/api/logs` every second while the terminal view is open. New check-ins and check-outs from another device appear in the right-side feed without a manual page refresh.

## Project Structure

```text
BolashaqQR/
├── api/                    # Node.js API routes for Vercel Functions
│   ├── _lib/               # Supabase client, mappers, attendance logic
│   ├── attendance/scan.js
│   ├── auth/employee.js
│   ├── employees/
│   ├── gate-qr.js
│   ├── health.js
│   └── logs/
├── supabase/
│   ├── schema.sql          # Create tables manually in Supabase
│   └── seed_demo.sql       # Optional demo data
├── index.html
├── terminal.html
├── employee.html
├── admin.html
├── owner.html
├── app.js
├── style.css
├── vercel.json
└── package.json
```

## Supabase Setup

Open Supabase SQL Editor and run:

1. `supabase/schema.sql`
2. Optional demo data: `supabase/seed_demo.sql`

The Node API expects these tables:

- `users`
- `employees`
- `schedules`
- `attendance_logs`
- `gate_qrs`

`users` stores login accounts and roles. `employees` stores employee profiles. Employee accounts link to profiles through `users.employee_id`.

For the current demo backend, keep RLS disabled on these tables or add your own policies that allow the publishable key to read/write the needed rows.

## Environment Variables

Set these in Vercel Project Settings -> Environment Variables:

```text
SUPABASE_URL=https://pjjcsagviayhioqajzhv.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_Pme5rr6mOQWArrrgHT5ovQ_W46DaBLC
```

Optional admin API protection:

```text
BOLASHAQ_REQUIRE_ADMIN_API_KEY=1
BOLASHAQ_ADMIN_API_KEY=change-this-key
```

If admin API protection is enabled, set the same key in the browser:

```js
localStorage.setItem("bolashaq_admin_api_key", "change-this-key");
```

Organization admins are scoped by design:

- `univer` sees university employees
- `ped` sees pedagogical college employees
- `med` sees medical college employees
- `owner` sees all organizations

## API

The frontend uses these endpoints:

- `GET /api/health`
- `GET /api/users`
- `GET /api/employees`
- `GET /api/logs`
- `POST /api/auth/employee`
- `GET /api/gate-qr`
- `POST /api/attendance/scan`
- `GET /api/employees/:public_id/logs`

## Local Development

Static-only frontend:

```powershell
npm run dev
```

Frontend plus Vercel API functions:

```powershell
npm install
npm run dev:vercel
```

Then open:

```text
http://localhost:5173
```

## Vercel URLs

Clean URLs are configured:

- `/terminal`
- `/employee`
- `/admin`
- `/owner`

Old `.html` links redirect to clean URLs.
