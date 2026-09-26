-- Covenant Crest Academy: end-of-term results module
-- Run this migration after supabase/schema.sql and supabase/migration_mvp.sql.

create table if not exists public.result_summaries (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  session_id uuid not null references public.academic_sessions(id) on delete cascade,
  term_id uuid not null references public.terms(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  average numeric(5,2) not null default 0 check (average between 0 and 100),
  position integer check (position is null or position > 0),
  teacher_remark text,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(student_id, session_id, term_id)
);

alter table public.result_summaries enable row level security;

drop policy if exists result_summaries_parent_read on public.result_summaries;
drop policy if exists result_summaries_teacher_read on public.result_summaries;
drop policy if exists result_summaries_teacher_write on public.result_summaries;
drop policy if exists result_summaries_admin on public.result_summaries;

create policy result_summaries_parent_read
on public.result_summaries for select to authenticated
using (
  published = true
  and exists (
    select 1 from public.parent_students ps
    where ps.student_id = result_summaries.student_id
      and ps.parent_id = auth.uid()
  )
);

create policy result_summaries_teacher_read
on public.result_summaries for select to authenticated
using (
  public.current_role() = 'teacher'
  and exists (
    select 1 from public.teacher_classes tc
    where tc.teacher_id = auth.uid()
      and tc.class_id = result_summaries.class_id
  )
);

create policy result_summaries_teacher_write
on public.result_summaries for insert to authenticated
with check (
  public.current_role() = 'teacher'
  and exists (
    select 1 from public.teacher_classes tc
    where tc.teacher_id = auth.uid()
      and tc.class_id = result_summaries.class_id
  )
);

create policy result_summaries_teacher_update
on public.result_summaries for update to authenticated
using (
  public.current_role() = 'teacher'
  and exists (
    select 1 from public.teacher_classes tc
    where tc.teacher_id = auth.uid()
      and tc.class_id = result_summaries.class_id
  )
)
with check (
  public.current_role() = 'teacher'
  and exists (
    select 1 from public.teacher_classes tc
    where tc.teacher_id = auth.uid()
      and tc.class_id = result_summaries.class_id
  )
);

create policy result_summaries_admin
on public.result_summaries for all to authenticated
using (public.current_role() = 'admin')
with check (public.current_role() = 'admin');

create index if not exists idx_result_summaries_student on public.result_summaries(student_id);
create index if not exists idx_result_summaries_class_term on public.result_summaries(class_id, session_id, term_id);

-- Tighten result record writes: teachers can only edit their assigned classes;
-- admins can manage/publish all result records.
drop policy if exists teachers_read_assigned_results on public.result_records;
drop policy if exists teachers_insert_assigned_results on public.result_records;
drop policy if exists teachers_update_assigned_results on public.result_records;
drop policy if exists result_records_admin_manage on public.result_records;

create policy teachers_read_assigned_results on public.result_records
for select to authenticated
using (
  public.current_role() = 'teacher'
  and exists (
    select 1
    from public.teacher_classes tc
    join public.students s on s.class_id = tc.class_id
    where tc.teacher_id = auth.uid()
      and s.id = result_records.student_id
  )
);

create policy teachers_insert_assigned_results on public.result_records
for insert to authenticated
with check (
  public.current_role() = 'teacher'
  and teacher_id = auth.uid()
  and exists (
    select 1
    from public.teacher_classes tc
    join public.students s on s.class_id = tc.class_id
    where tc.teacher_id = auth.uid()
      and s.id = result_records.student_id
  )
);

create policy teachers_update_assigned_results on public.result_records
for update to authenticated
using (
  public.current_role() = 'teacher'
  and teacher_id = auth.uid()
  and exists (
    select 1
    from public.teacher_classes tc
    join public.students s on s.class_id = tc.class_id
    where tc.teacher_id = auth.uid()
      and s.id = result_records.student_id
  )
)
with check (
  public.current_role() = 'teacher'
  and teacher_id = auth.uid()
);

create policy result_records_admin_manage on public.result_records
for all to authenticated
using (public.current_role() = 'admin')
with check (public.current_role() = 'admin');

create index if not exists idx_result_records_session_term on public.result_records(session_id, term_id);
