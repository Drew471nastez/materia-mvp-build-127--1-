-- EVERY ROW, AS ONE LINE PER TABLE: its row count and an md5 of its rows in
-- a stable order. run.sh compares this before and after the second run.
-- storelib_applied_parts is left out: its applied_at moves on every run by
-- design (part 67).
select format('%s.%s=%s', n.nspname, c.relname,
  (xpath('/row/h/text()', query_to_xml(format(
    $q$select count(*) || ' ' || coalesce(md5(string_agg(t::text, '' order by t::text)), '') as h from %I.%I t$q$,
    n.nspname, c.relname), false, true, '')))[1]::text)
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('r', 'p') and n.nspname in ('public', 'storage', 'auth')
  and c.relname <> 'storelib_applied_parts' and not c.relispartition
order by n.nspname, c.relname;
