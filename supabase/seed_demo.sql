insert into public.employees
  (public_id, name, role, organization, department, username, password, is_vip)
values
  ('EMP001', 'Askarov Daniyar', 'teacher', 'university', 'Information Technology Department', 'emp001', 'emp001', false),
  ('EMP002', 'Smagulova Aliya', 'teacher', 'university', 'Mathematics Department', 'emp002', 'emp002', false),
  ('EMP004', 'Nurlanova Dina', 'staff', 'university', 'Registrar office', 'emp004', 'emp004', false),
  ('EMP005', 'Kozhakhmetov Bolat', 'staff', 'university', 'Rectorate', 'emp005', 'emp005', true)
on conflict (public_id) do update
set name = excluded.name,
    role = excluded.role,
    organization = excluded.organization,
    department = excluded.department,
    username = excluded.username,
    password = excluded.password,
    is_vip = excluded.is_vip,
    updated_at = now();

insert into public.users (username, password, role, organization, employee_id, is_active)
select username, password, 'employee', organization, id, true
from public.employees
where public_id in ('EMP001', 'EMP002', 'EMP004', 'EMP005')
on conflict (username) do update
set password = excluded.password,
    role = excluded.role,
    organization = excluded.organization,
    employee_id = excluded.employee_id,
    is_active = excluded.is_active,
    updated_at = now();

insert into public.users (username, password, role, organization, employee_id, is_active)
values
  ('univer', 'univer1', 'admin', 'university', null, true),
  ('ped', 'ped1', 'admin', 'pedcollege', null, true),
  ('med', 'med1', 'admin', 'medcollege', null, true),
  ('owner', 'owner1', 'owner', null, null, true)
on conflict (username) do update
set password = excluded.password,
    role = excluded.role,
    organization = excluded.organization,
    employee_id = excluded.employee_id,
    is_active = excluded.is_active,
    updated_at = now();

delete from public.schedules
where employee_id in (
  select id from public.employees where public_id in ('EMP001', 'EMP002')
);

insert into public.schedules (employee_id, day, subject, start_time, end_time, group_name)
select id, 1, 'Databases', '09:00', '10:30', ''
from public.employees
where public_id = 'EMP001';

insert into public.schedules (employee_id, day, subject, start_time, end_time, group_name)
select id, 1, 'Algorithms', '11:00', '12:30', ''
from public.employees
where public_id = 'EMP001';

insert into public.schedules (employee_id, day, subject, start_time, end_time, group_name)
select id, 1, 'Higher Mathematics', '10:00', '11:30', ''
from public.employees
where public_id = 'EMP002';
