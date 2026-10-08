-- =============================================================================
--  CHECK_STORELIB_AI_BUILDER.sql
--  Read only. Says whether this database has everything the Storelib AI
--  website builder and the physical store read and write.
-- =============================================================================
--
--  Changes nothing. Run it after RUN_STORELIB_AI_BUILDER.sql. Every row is
--  one thing the code needs, whether it is there, and which file needs it.
--  Anything with ok = false lists the file that creates it in "fix".
-- =============================================================================

with
tables(name, needed_by, fix) as (
  values
    ('store_theme_installs',      'the website builder',                                   'supabase/migrations/20260317000000_website_builder.sql'),
    ('store_theme_pages',         'every page, and build_page drafts',                     'supabase/migrations/20260317000000_website_builder.sql'),
    ('store_theme_settings',      'theme settings and the AI''s notes on a site',          'supabase/migrations/20260317000000_website_builder.sql'),
    ('store_theme_custom_files',  'sections the AI writes',                                'supabase/migrations/20260317000000_website_builder.sql'),
    ('store_theme_file_versions', 'the version kept before every section save',            'supabase/sql (theme file versions)'),
    ('store_theme_backups',       'the restore point taken before build_page writes',      'supabase/sql/RUN_THEME_BACKUPS.sql'),
    ('theme_chat_conversations',  'the AI chat history',                                   'supabase/sql (theme chat)'),
    ('theme_chat_messages',       'the AI chat history, and memory of the last messages',  'supabase/sql (theme chat)'),
    ('theme_chat_attachments',    'pictures sent to the AI',                               'supabase/sql (theme chat)'),
    ('theme_agent_activity',      'connected agents (MCP) writing pages',                  'supabase/sql/RUN_AGENT_CONNECTIONS.sql, RUN_AGENT_MCP.sql'),
    ('ai_memories',               'what the AI keeps about the creator on every site',     'supabase/sql (ai memories)'),
    ('storelib_ai_runs',          'the AI run log',                                        'supabase/sql/RUN_STORELIB_AI_BUILDER.sql'),
    ('products',                  'the catalogue the AI and every section read',           'core schema'),
    ('product_variants',          'options and their prices',                              'core schema'),
    ('product_options',           'Size, Colour and the like on shipped products',         'physical commerce SQL'),
    ('product_collections',       'collections',                                           'physical commerce SQL'),
    ('product_collection_items',  'what is in each collection',                            'physical commerce SQL'),
    ('commerce_settings',         'whether the store ships, and from where',               'physical commerce SQL'),
    ('shipping_profiles',         'shipping profiles',                                     'supabase/sql/RUN_SHIPPING.sql'),
    ('shipping_zones',            'shipping zones',                                        'supabase/sql/RUN_SHIPPING.sql'),
    ('shipping_rates',            'shipping rates',                                        'supabase/sql/RUN_SHIPPING.sql'),
    ('shipping_packages',         'package sizes for carrier rates',                       'supabase/sql/RUN_SHIPPING.sql'),
    ('inventory_locations',       'where stock is kept',                                   'physical commerce SQL'),
    ('inventory_levels',          'stock per location',                                    'physical commerce SQL'),
    ('inventory_movements',       'the stock history',                                     'physical commerce SQL'),
    ('commerce_tax_rates',        'tax rates',                                             'physical commerce SQL'),
    ('commerce_checkouts',        'physical checkouts',                                    'physical commerce SQL'),
    ('orders',                    'orders',                                                'core schema'),
    ('commerce_order_events',     'the order timeline',                                    'physical commerce SQL'),
    ('fulfillments',              'shipments',                                             'physical commerce SQL'),
    ('fulfillment_items',         'what each shipment holds',                              'physical commerce SQL'),
    ('commerce_returns',          'returns',                                               'physical commerce SQL'),
    ('entitlements',              'digital access after a purchase',                       'core schema')
),
columns(tbl, col, needed_by, fix) as (
  values
    ('store_theme_pages',        'draft_sections', 'pages saved as drafts (the editor and build_page)', 'supabase/migrations/20260317000000_website_builder.sql'),
    ('store_theme_settings',     'draft_settings', 'theme settings saved as drafts',                    'supabase/migrations/20260317000000_website_builder.sql'),
    ('store_theme_custom_files', 'draft_content',  'section files saved as drafts',                     'the theme file drafts SQL (lib/website-builder/theme-file-drafts.ts)'),
    ('theme_agent_activity',     'detail',         'page changes from connected agents',                'supabase/sql/RUN_AGENT_MCP.sql')
),
policies(tbl, cmd, needed_by) as (
  values
    ('store_theme_pages',   'SELECT', 'the owner reads every page'),
    ('store_theme_pages',   'INSERT', 'build_page makes a page'),
    ('store_theme_pages',   'UPDATE', 'build_page rebuilds a page'),
    ('store_theme_backups', 'INSERT', 'the restore point before a page write'),
    ('storelib_ai_runs',    'SELECT', 'the owner reads their runs'),
    ('storelib_ai_runs',    'INSERT', 'the builder records a run')
),
report as (
  select
    1 as part,
    'table' as kind,
    t.name as item,
    to_regclass('public.' || t.name) is not null as ok,
    t.needed_by,
    case when to_regclass('public.' || t.name) is null then t.fix else '' end as fix
  from tables t

  union all

  select
    2,
    'column',
    c.tbl || '.' || c.col,
    exists (
      select 1 from information_schema.columns ic
      where ic.table_schema = 'public' and ic.table_name = c.tbl and ic.column_name = c.col
    ),
    c.needed_by,
    case when exists (
      select 1 from information_schema.columns ic
      where ic.table_schema = 'public' and ic.table_name = c.tbl and ic.column_name = c.col
    ) then '' else c.fix end
  from columns c

  union all

  select
    3,
    'row level security',
    t.name,
    coalesce((select cl.relrowsecurity from pg_class cl join pg_namespace n on n.oid = cl.relnamespace
              where n.nspname = 'public' and cl.relname = t.name), false),
    'every row is the owner''s alone',
    case when coalesce((select cl.relrowsecurity from pg_class cl join pg_namespace n on n.oid = cl.relnamespace
                        where n.nspname = 'public' and cl.relname = t.name), false)
         then '' else 'alter table public.' || t.name || ' enable row level security' end
  from (values ('store_theme_pages'), ('store_theme_backups'), ('storelib_ai_runs'), ('theme_chat_messages'), ('ai_memories')) as t(name)
  where to_regclass('public.' || t.name) is not null

  union all

  select
    4,
    'policy',
    p.tbl || ' ' || p.cmd,
    exists (
      select 1 from pg_policies pp
      where pp.schemaname = 'public' and pp.tablename = p.tbl and (pp.cmd = p.cmd or pp.cmd = 'ALL')
    ),
    p.needed_by,
    case when exists (
      select 1 from pg_policies pp
      where pp.schemaname = 'public' and pp.tablename = p.tbl and (pp.cmd = p.cmd or pp.cmd = 'ALL')
    ) then '' else 'supabase/sql/RUN_STORELIB_AI_BUILDER.sql' end
  from policies p
)
select kind, item, ok, needed_by, fix
from report
order by ok asc, part, item;

-- And how the builder has been doing, once storelib_ai_runs exists (comment the
-- block above out, or run this on its own):
--
-- select
--   intent_kind,
--   count(*)                                             as runs,
--   round(100.0 * avg((status = 'succeeded')::int), 1)  as succeeded_pct,
--   round(avg(array_length(pages_built, 1)), 1)         as pages_per_run,
--   round(avg(coalesce(array_length(unresolved, 1), 0)), 2) as checks_left_open,
--   round(avg(duration_ms) / 1000.0, 1)                 as seconds
-- from public.storelib_ai_runs
-- where created_at > now() - interval '14 days'
-- group by intent_kind
-- order by runs desc;
