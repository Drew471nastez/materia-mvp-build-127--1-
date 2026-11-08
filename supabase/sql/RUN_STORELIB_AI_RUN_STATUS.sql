-- =============================================================================
--  STORELIB AI: a run that was partly done, or stopped by the creator, says so
-- =============================================================================
--  storelib_ai_runs.status took only 'succeeded', 'failed' and 'refused', so a
--  run that changed the page but ended with checks still failing was recorded
--  as 'succeeded', and a run the creator stopped (Stop, or the tab closed) as
--  'failed'. This adds 'partial' and 'stopped'.
--
--  Safe to run more than once. Until it runs, the builder records those runs
--  as before ('succeeded' / 'failed'): lib/website-builder/agent/run-ledger.ts
--  falls back when the database refuses the new value.
-- =============================================================================
begin;

alter table public.storelib_ai_runs drop constraint if exists storelib_ai_runs_status_check;
alter table public.storelib_ai_runs
  add constraint storelib_ai_runs_status_check
  check (status in ('succeeded', 'partial', 'stopped', 'failed', 'refused'));

commit;
