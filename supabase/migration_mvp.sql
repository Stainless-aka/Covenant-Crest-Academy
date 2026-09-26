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