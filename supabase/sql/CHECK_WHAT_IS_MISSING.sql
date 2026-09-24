/* ===========================================================================
   WHAT IS MISSING FROM THE DATABASE

   Read only: this changes nothing, it only looks. Paste it into the Supabase
   SQL editor and press Run.

   It lists every table and column the app has added since September, and
   whether your database has it. Anything that reads MISSING sorts to the
   top. If everything reads yes, every SQL file has been run.

   One statement on one line, on purpose. Let the editor wrap it.
   =========================================================================== */

select case when present then 'yes' else 'MISSING' end as in_database, kind, name from ( select 'table' as kind, t as name, exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = t) as present from unnest(array['rate_limit_hits', 'site_agent_runs', 'site_assets', 'site_chat_messages', 'site_collection_items', 'site_collections', 'site_deployments', 'site_files', 'site_form_submissions', 'site_forms', 'site_integrations', 'site_template_purchases', 'site_versions', 'site_web_vitals', 'sites', 'storelib_newsletter', 'theme_agent_activity', 'theme_agent_tokens', 'theme_github_events', 'theme_github_links']) as t union all select 'column', c.tbl || '.' || c.col, exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = c.tbl and column_name = c.col) from (values ('custom_domains','install_id'), ('custom_domains','site_id'), ('orders','source'), ('orders','source_detail'), ('site_agent_runs','cancel_requested'), ('site_assets','url'), ('site_deployments','slug'), ('sites','manifest'), ('sites','preview_revision'), ('sites','revision'), ('store_theme_installs','kind'), ('store_theme_installs','snapshot_url'), ('store_theme_pages','title'), ('theme_github_links','pull_on_push'), ('theme_github_links','push_on_save')) as c(tbl, col) ) report order by present, kind, name;
