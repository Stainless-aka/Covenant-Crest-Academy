-- Covenant Crest Academy
-- Supabase PostgreSQL schema for the MVP.
-- Run this in the Supabase SQL Editor.

create extension if not exists pgcrypto;

create type public.user_role as enum ('admin', 'teacher', 'parent');

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text,
  role public.user_role not null default 'parent',
  created_at timestamptz not null default now()
);

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.academic_sessions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_current boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.terms (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  admission_number text unique,
  date_of_birth date,
  gender text,
  class_id uuid references public.classes(id) on delete set null,
  parent_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.parent_students (
  parent_id uuid not null references public.profiles(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (parent_id, student_id)
);

create table if not exists public.result_records (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  session_id uuid not null references public.academic_sessions(id) on delete cascade,
  term_id uuid not null references public.terms(id) on delete cascade,
  teacher_id uuid references public.profiles(id) on delete set null,
  ca_score numeric(5,2) not null default 0 check (ca_score between 0 and 40),
  exam_score numeric(5,2) not null default 0 check (exam_score between 0 and 60),
  total_score numeric(5,2) not null default 0 check (total_score between 0 and 100),
  grade text not null default 'F',
  remark text,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(student_id, subject_id, session_id, term_id)
);

-- Useful starter data
insert into public.classes (name) values
('Creche'), ('Nursery 1'), ('Nursery 2'), ('Primary 1'), ('Primary 2'),
('Primary 3'), ('Primary 4'), ('Primary 5'), ('Primary 6'),
('JSS 1'), ('JSS 2'), ('JSS 3'), ('SS 1'), ('SS 2'), ('SS 3')
on conflict (name) do nothing;

insert into public.subjects (name) values
('English Language'), ('Mathematics'), ('Basic Science'),
('Social Studies'), ('Computer Studies'), ('Christian Religious Studies')
on conflict (name) do nothing;

insert into public.terms (name) values
('First Term'), ('Second Term'), ('Third Term')
on conflict (name) do nothing;

-- Example session; change/extend this from the admin UI later.
insert into public.academic_sessions (name, is_current)
values ('2026/2027', true)
on conflict (name) do nothing;

-- RLS
alter table public.profiles enable row level security;
alter table public.classes enable row level security;
alter table public.subjects enable row level security;
alter table public.academic_sessions enable row level security;
alter table public.terms enable row level security;
alter table public.students enable row level security;
alter table public.parent_students enable row level security;
alter table public.fee_structures enable row level security;
alter table public.fee_assignments enable row level security;
alter table public.payments enable row level security;
alter table public.result_records enable row level security;

create or replace function public.current_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create policy "users read own profile"
on public.profiles for select
using (id = auth.uid());

create policy "admins manage profiles"
on public.profiles for all
using (public.current_role() = 'admin')
with check (public.current_role() = 'admin');

create policy "authenticated read classes"
on public.classes for select to authenticated using (true);
create policy "admins manage classes"
on public.classes for all to authenticated
using (public.current_role() = 'admin')
with check (public.current_role() = 'admin');

create policy "authenticated read subjects"
on public.subjects for select to authenticated using (true);
create policy "admins manage subjects"
on public.subjects for all to authenticated
using (public.current_role() = 'admin')
with check (public.current_role() = 'admin');

create policy "authenticated read sessions"
on public.academic_sessions for select to authenticated using (true);
create policy "admins manage sessions"
on public.academic_sessions for all to authenticated
using (public.current_role() = 'admin')
with check (public.current_role() = 'admin');

create policy "authenticated read terms"
on public.terms for select to authenticated using (true);
create policy "admins manage terms"
on public.terms for all to authenticated
using (public.current_role() = 'admin')
with check (public.current_role() = 'admin');

create policy "admin teacher read students"
on public.students for select to authenticated
using (public.current_role() in ('admin','teacher'));

create policy "parent read own students"
on public.students for select to authenticated
using (
  public.current_role() = 'parent'
  and (
    parent_id = auth.uid()
    or exists (
      select 1 from public.parent_students ps
      where ps.student_id = students.id and ps.parent_id = auth.uid()
    )
  )
);

create policy "admin insert students"
on public.students for insert to authenticated
with check (public.current_role() = 'admin');

create policy "admin update students"
on public.students for update to authenticated
using (public.current_role() = 'admin')
with check (public.current_role() = 'admin');

create policy "admin delete students"
on public.students for delete to authenticated
using (public.current_role() = 'admin');

create policy "parents read own links"
on public.parent_students for select to authenticated
using (parent_id = auth.uid() or public.current_role() = 'admin');

create policy "admins manage parent links"
on public.parent_students for all to authenticated
using (public.current_role() = 'admin')
with check (public.current_role() = 'admin');

create policy "parents read published results for their students"
on public.result_records for select to authenticated
using (
  published = true
  and exists (
    select 1 from public.parent_students ps
    where ps.student_id = result_records.student_id
      and ps.parent_id = auth.uid()
  )
);

create policy "teachers read results"
on public.result_records for select to authenticated
using (public.current_role() in ('teacher','admin'));

create policy "teachers insert results"
on public.result_records for insert to authenticated
with check (public.current_role() in ('teacher','admin'));

create policy "teachers update results"
on public.result_records for update to authenticated
using (public.current_role() in ('teacher','admin'))
with check (public.current_role() in ('teacher','admin'));

create policy "admins delete results"
on public.result_records for delete to authenticated
using (public.current_role() = 'admin');


-- Covenant Crest Academy MVP migration
-- Run after supabase/schema.sql if the original schema is already installed.

create table if not exists public.teacher_classes (
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (teacher_id,class_id)
);

alter table public.teacher_classes enable row level security;

drop policy if exists teacher_classes_teacher on public.teacher_classes;
drop policy if exists teacher_classes_admin on public.teacher_classes;
create policy teacher_classes_teacher on public.teacher_classes for select to authenticated
using (teacher_id=auth.uid());
create policy teacher_classes_admin on public.teacher_classes for all to authenticated
using (public.current_role()='admin') with check (public.current_role()='admin');

-- Parent self-signup creates a parent profile automatically.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  insert into public.profiles(id,full_name,email,role)
  values(new.id,coalesce(new.raw_user_meta_data->>'full_name',split_part(new.email,'@',1)),new.email,'parent')
  on conflict(id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Keep the trigger function inaccessible through the Data API.
revoke execute on function public.handle_new_user() from public,anon,authenticated;

-- Replace the original broad teacher student policy with class-scoped access.
drop policy if exists "admin teacher read students" on public.students;
drop policy if exists "students_teacher" on public.students;
create policy students_teacher on public.students for select to authenticated
using (
  public.current_role()='teacher'
  and exists (
    select 1 from public.teacher_classes tc
    where tc.teacher_id=auth.uid() and tc.class_id=students.class_id
  )
);

-- Teacher result access is limited to assigned classes.
drop policy if exists "teachers read results" on public.result_records;
drop policy if exists "teachers insert results" on public.result_records;
drop policy if exists "teachers update results" on public.result_records;

create policy teachers_read_assigned_results on public.result_records
for select to authenticated
using (
  public.current_role()='teacher'
  and exists (
    select 1 from public.teacher_classes tc
    join public.students s on s.class_id=tc.class_id
    where tc.teacher_id=auth.uid() and s.id=result_records.student_id
  )
);

create policy teachers_insert_assigned_results on public.result_records
for insert to authenticated
with check (
  public.current_role()='teacher'
  and exists (
    select 1 from public.teacher_classes tc
    join public.students s on s.class_id=tc.class_id
    where tc.teacher_id=auth.uid() and s.id=student_id
  )
);

create policy teachers_update_assigned_results on public.result_records
for update to authenticated
using (
  public.current_role()='teacher'
  and exists (
    select 1 from public.teacher_classes tc
    join public.students s on s.class_id=tc.class_id
    where tc.teacher_id=auth.uid() and s.id=result_records.student_id
  )
)
with check (public.current_role()='teacher');

-- Useful indexes for RLS lookups.
create index if not exists idx_teacher_classes_teacher on public.teacher_classes(teacher_id);
create index if not exists idx_teacher_classes_class on public.teacher_classes(class_id);
create index if not exists idx_students_class on public.students(class_id);
create index if not exists idx_parent_students_parent on public.parent_students(parent_id);
create index if not exists idx_result_records_student on public.result_records(student_id);

-- Covenant Crest Academy MVP migration
-- Run after supabase/schema.sql if the original schema is already installed.

create table if not exists public.teacher_classes (
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (teacher_id,class_id)
);

alter table public.teacher_classes enable row level security;

drop policy if exists teacher_classes_teacher on public.teacher_classes;
drop policy if exists teacher_classes_admin on public.teacher_classes;
create policy teacher_classes_teacher on public.teacher_classes for select to authenticated
using (teacher_id=auth.uid());
create policy teacher_classes_admin on public.teacher_classes for all to authenticated
using (public.current_role()='admin') with check (public.current_role()='admin');

-- Role helper is security-definer so RLS policies can safely inspect profiles.
create or replace function public.current_role()
returns public.user_role
language sql
stable
security definer
set search_path=''
as $
  select p.role from public.profiles p where p.id=(select auth.uid());
$;
revoke execute on function public.current_role() from public,anon;
grant execute on function public.current_role() to authenticated;

-- Parent self-signup creates a parent profile automatically.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  insert into public.profiles(id,full_name,email,role)
  values(new.id,coalesce(new.raw_user_meta_data->>'full_name',split_part(new.email,'@',1)),new.email,'parent')
  on conflict(id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Keep the trigger function inaccessible through the Data API.
revoke execute on function public.handle_new_user() from public,anon,authenticated;

-- Replace the original broad teacher student policy with class-scoped access.
drop policy if exists "admin teacher read students" on public.students;
drop policy if exists "students_teacher" on public.students;
create policy students_teacher on public.students for select to authenticated
using (
  public.current_role()='teacher'
  and exists (
    select 1 from public.teacher_classes tc
    where tc.teacher_id=auth.uid() and tc.class_id=students.class_id
  )
);

-- Teacher result access is limited to assigned classes.
drop policy if exists "teachers read results" on public.result_records;
drop policy if exists "teachers insert results" on public.result_records;
drop policy if exists "teachers update results" on public.result_records;

create policy teachers_read_assigned_results on public.result_records
for select to authenticated
using (
  public.current_role()='teacher'
  and exists (
    select 1 from public.teacher_classes tc
    join public.students s on s.class_id=tc.class_id
    where tc.teacher_id=auth.uid() and s.id=result_records.student_id
  )
);

create policy teachers_insert_assigned_results on public.result_records
for insert to authenticated
with check (
  public.current_role()='teacher'
  and exists (
    select 1 from public.teacher_classes tc
    join public.students s on s.class_id=tc.class_id
    where tc.teacher_id=auth.uid() and s.id=student_id
  )
);

create policy teachers_update_assigned_results on public.result_records
for update to authenticated
using (
  public.current_role()='teacher'
  and exists (
    select 1 from public.teacher_classes tc
    join public.students s on s.class_id=tc.class_id
    where tc.teacher_id=auth.uid() and s.id=result_records.student_id
  )
)
with check (public.current_role()='teacher');

-- Useful indexes for RLS lookups.
create index if not exists idx_teacher_classes_teacher on public.teacher_classes(teacher_id);
create index if not exists idx_teacher_classes_class on public.teacher_classes(class_id);
create index if not exists idx_students_class on public.students(class_id);
create index if not exists idx_parent_students_parent on public.parent_students(parent_id);
create index if not exists idx_result_records_student on public.result_records(student_id);