# Supabase Database

Create tables manually in Supabase SQL Editor:

1. Run `schema.sql`
2. Optionally run `seed_demo.sql`

## Tables by App Function

| App function | Supabase table |
| --- | --- |
| Login accounts and roles | `users` |
| Employee profiles | `employees` |
| Teacher/student schedules | `schedules` |
| Gate QR codes | `gate_qrs` |
| Check-in/check-out journal | `attendance_logs` |

## Users

`users` is the app-level users table. It is separate from Supabase Auth's internal `auth.users`.

- Employee account: `users.role = 'employee'` and `users.employee_id` links to `employees.id`.
- Organization admin: `users.role = 'admin'` and `users.organization` scopes the admin.
- Owner account: `users.role = 'owner'`.

The current frontend still has local UI logic for admin/owner login, but the database table is ready and the Node API exposes `GET /api/users` for admin-protected inspection.
