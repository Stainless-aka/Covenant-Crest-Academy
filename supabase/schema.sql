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

create table if not exists public.fee_structures (
  id uuid primary key default gen_random_uuid(),
  class_id uuid references public.classes(id) on delete set null,
  session_id uuid references public.academic_sessions(id) on delete cascade,
  term_id uuid references public.terms(id) on delete cascade,
  description text not null,
  amount numeric(12,2) not null check (amount >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.fee_assignments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  parent_id uuid references public.profiles(id) on delete set null,
  fee_structure_id uuid references public.fee_structures(id) on delete set null,
  amount_due numeric(12,2) not null default 0 check (amount_due >= 0),
  amount_paid numeric(12,2) not null default 0 check (amount_paid >= 0),
  balance numeric(12,2) generated always as (greatest(amount_due - amount_paid, 0)) stored,
  created_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  parent_id uuid references public.profiles(id) on delete set null,
  fee_structure_id uuid references public.fee_structures(id) on delete set null,
  amount numeric(12,2) not null check (amount > 0),
  reference text unique,
  payment_method text not null default 'manual',
  status text not null default 'pending' check (status in ('pending','paid','failed','refunded')),
  paid_at timestamptz,
  created_at timestamptz not null default now()
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

create policy "authenticated read fee structures"
on public.fee_structures for select to authenticated using (true);

create policy "admins manage fee structures"
on public.fee_structures for all to authenticated
using (public.current_role() = 'admin')
with check (public.current_role() = 'admin');

create policy "parents read own fee assignments"
on public.fee_assignments for select to authenticated
using (parent_id = auth.uid());

create policy "admin teacher read fee assignments"
on public.fee_assignments for select to authenticated
using (public.current_role() in ('admin','teacher'));

create policy "admins manage fee assignments"
on public.fee_assignments for all to authenticated
using (public.current_role() = 'admin')
with check (public.current_role() = 'admin');

create policy "parents read own payments"
on public.payments for select to authenticated
using (parent_id = auth.uid());

create policy "admin read payments"
on public.payments for select to authenticated
using (public.current_role() = 'admin');

create policy "admins manage payments"
on public.payments for all to authenticated
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
