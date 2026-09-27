-- Covenant Crest Academy: parent-child relationship source of truth
-- Run after schema.sql, migration_mvp.sql and results_mvp.sql.
-- parent_students is the authoritative relationship between parent accounts and students.

-- Parent fee access is derived from parent_students, not students.parent_id or fee_assignments.parent_id.
drop policy if exists "parents read own fee assignments" on public.fee_assignments;
create policy "parents read linked student fee assignments"
on public.fee_assignments for select to authenticated
using (
  public.current_role() = 'parent'
  and exists (
    select 1 from public.parent_students ps
    where ps.parent_id = auth.uid()
      and ps.student_id = fee_assignments.student_id
  )
);

-- Parent payment access is derived from parent_students.
drop policy if exists "parents read own payments" on public.payments;
create policy "parents read linked student payments"
on public.payments for select to authenticated
using (
  public.current_role() = 'parent'
  and exists (
    select 1 from public.parent_students ps
    where ps.parent_id = auth.uid()
      and ps.student_id = payments.student_id
  )
);

-- Helpful index for parent-scoped payment/fee lookups.
create index if not exists idx_parent_students_student_parent
on public.parent_students(student_id, parent_id);
