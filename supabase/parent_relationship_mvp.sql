-- Covenant Crest Academy: parent-child relationship source of truth
-- Run after schema.sql, migration_mvp.sql and results_mvp.sql.
-- parent_students is the authoritative relationship between parent accounts and students.

-- Parent authorization is based only on parent_students.
-- Existing values may remain for backward compatibility, but they are no longer trusted.
drop policy if exists "parent read own students" on public.students;
drop policy if exists "parent read own students" on public.students;
drop policy if exists "parent read own students" on public.students;
create policy "parents read linked students"
on public.students for select to authenticated
using (
  public.current_role() = 'parent'
  and exists (
    select 1 from public.parent_students ps
    where ps.parent_id = auth.uid()
      and ps.student_id = students.id
  )
);
