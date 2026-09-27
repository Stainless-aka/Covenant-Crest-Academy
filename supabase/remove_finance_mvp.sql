-- Covenant Crest Academy: remove finance / school-fee functionality
-- Run this on an existing Supabase project after the application update.
-- The current MVP no longer uses school fees, fee assignments, or payment records.

drop table if exists public.payments cascade;
drop table if exists public.fee_assignments cascade;
drop table if exists public.fee_structures cascade;
