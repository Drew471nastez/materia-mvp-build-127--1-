#!/usr/bin/env node
/**
 * ===========================================================================
 *  BUILD supabase/sql/RUN_CREATOR_PAGE_AND_SITES.sql
 * ===========================================================================
 *
 * The second of this repository's paste-me files. RUN_EVERYTHING.sql is the
 * marketplace's schema; this one is the creator page, the store builder and
 * Storelib AI.
 *
 * They are separate because their dependency chains are separate and their
 * failure modes are different: RUN_EVERYTHING assumes products/profiles/orders,
 * this one assumes creators, and folding them together would mean an operator
 * who needs one paste of the other's forty tables to find out.
 *
 *     node scripts/build-creator-page-sql.mjs
 *
 * GENERATED, never hand-edited. tests/sql-aggregate.test.ts asserts every
 * source appears verbatim and in order, so an edit to a migration without a
 * rebuild fails the push — which is the failure this file exists to prevent.
 */

import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")

/**
 * ORDER MATTERS. Verified by actually running it — three times in a row, on a
 * real Postgres 16, against both a database that has none of this and one that
 * has all of it.
 *
 *  1 theme tables    store_theme_installs/_settings/_pages and `themes`.
 *                    FIRST because section 5 adds columns to them, and a
 *                    database without them fails there with
 *                    "relation store_theme_installs does not exist".
 *  2 public read     anon/authenticated SELECT on a PUBLISHED theme. Needs 1.
 *  3 config tables   store_builder_configs and product_page_configs — every
 *                    creator page on the platform. Needs `creators`.
 *  4 follows         the follow graph behind the follower count.
 *  5 sticky bar      backfills a stored flag in store_builder_configs. Needs 3,
 *                    and this is exactly where a paste used to die: it is an
 *                    UPDATE against a table nothing in this repository created.
 *  6 storefront uniq narrows uniq_sti_creator_published to storefronts. Needs 1.
 *  7 page backfill   the About section, video labels, later social platforms.
 *                    Needs 3.
 *  8 sites projects  the Storelib AI tables. Needs `creators` and
 *                    `custom_domains`, and must come after 6, which is what
 *                    clears the three legacy tables whose names it reuses.
 *  9 agent runs      the token and cost ledger. Needs 8 for `sites` and
 *                    `site_versions`, and it is what makes the per-plan
 *                    monthly edit limit countable at all.
 */
const SECTIONS = [
  ["supabase/migrations/20260317000000_website_builder.sql", "Theme tables: installs, settings, pages"],
  ["supabase/migrations/20260407_website_builder_public_read_hardened.sql", "Public read for a published theme"],
  ["supabase/migrations/20260115_store_builder_configs_baseline.sql", "Creator page configs — the schema this repo never had"],
  ["supabase/migrations/20260731_follows.sql", "Follows"],
  ["supabase/migrations/20260906_subscribe_bar_sticky_default.sql", "Subscribe bar: sticky on by default"],
  ["supabase/migrations/20260908_storelib_sites.sql", "One published storefront per creator"],
  ["supabase/migrations/20260909_creator_page_backfill.sql", "Creator pages made before the recent changes"],
  ["supabase/migrations/20260910_sites_projects.sql", "Storelib AI: sites, files, versions, deployments"],
  ["supabase/migrations/20260911_site_agent_runs.sql", "Storelib AI: what the agent did, and what it cost"],
  ["supabase/migrations/20260912_site_publishing.sql", "Publishing, chat history, and one writer per site"],
]

const HEADER = `-- ###########################################################################
--  STORELIB — CREATOR PAGE, STORE BUILDER AND STORELIB AI
-- ###########################################################################
--  ONE file. Select all, copy, paste into the Supabase SQL editor, press Run.
--
--  GENERATED, never hand-edited. Regenerate with
--
--      node scripts/build-creator-page-sql.mjs
--
--  IDEMPOTENT. Running it again changes nothing and raises nothing — every
--  statement guards itself. Verified by running the whole file three times in
--  a row against a real Postgres 16, not by reading it.
--
--  PREREQUISITE: public.creators, public.products, public.profiles and
--  public.custom_domains. Those are the base schema; this file does not
--  create them.
--
--  ORDER, and why:
${SECTIONS.map(([, title], i) => `--    ${String(i + 1).padStart(2, " ")}. ${title}`).join("\n")}
--
-- ---------------------------------------------------------------------------
--  THE ONE THING THAT CAN STOP THIS FILE
-- ---------------------------------------------------------------------------
--  Section 8 refuses to run if site_versions, site_form_submissions or
--  site_integrations already exist in the OLD install_id shape AND contain
--  rows. Nothing ever wrote to them, so this should not happen; if it does,
--  the error names the table and the row count, nothing has been changed, and
--  a person should look before anything is dropped. That refusal is
--  deliberate — it is the alternative to a migration quietly destroying data
--  it does not understand.
-- ###########################################################################

`

const parts = [HEADER]

SECTIONS.forEach(([path, title], i) => {
  const body = readFileSync(join(ROOT, path), "utf8").trimEnd()
  parts.push(
    "",
    "",
    "-- ###########################################################################",
    `--  SECTION ${String(i + 1).padStart(2, " ")}: ${title}`,
    `--  source: ${path}`,
    "-- ###########################################################################",
    "",
    body,
    "",
  )
})

// Every row should read true. A false is a feature that is silently off, and
// the point of printing it is that "it ran without an error" and "it worked"
// are not the same claim.
parts.push(
  "",
  "",
  `-- ###########################################################################
--  DONE — the check. Every column should read true.
-- ###########################################################################
notify pgrst, 'reload schema';

select
  to_regclass('public.store_builder_configs')  is not null as creator_page_configs,
  to_regclass('public.product_page_configs')   is not null as product_page_configs,
  to_regclass('public.store_theme_installs')   is not null as theme_installs,
  to_regclass('public.follows')                is not null as follows,
  to_regclass('public.sites')                  is not null as storelib_ai_sites,
  to_regclass('public.site_files')             is not null as storelib_ai_files,
  to_regclass('public.site_agent_runs')        is not null as agent_cost_ledger,
  to_regclass('public.site_chat_messages')     is not null as chat_history,
  exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='sites'
             and column_name='revision')                      as write_revisions,
  (select count(*) from pg_proc where proname='site_commit_files') = 1 as commit_function,
  exists (select 1 from pg_indexes where schemaname='public'
           and indexname='uniq_sti_creator_published_storefront') as one_published_storefront,
  exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='site_versions'
             and column_name='site_id')                          as site_versions_reconciled,
  not exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='site_versions'
             and column_name='install_id')                       as legacy_shape_gone;
`,
)

export function buildCreatorPageSql() {
  return parts.join("\n")
}

/**
 * ===========================================================================
 *  THE SECOND FILE: supabase/sql/RUN_SITES_PUBLISHING.sql
 * ===========================================================================
 *
 * The same three sources as sections 8-10 above, on their own.
 *
 * WHY A SECOND FILE. The big one is 2,400 lines, and all but the last three
 * sections are theme and creator-page schema that a database running this
 * platform already has. When publishing is the thing that is broken, asking
 * somebody to re-paste the whole history to fix it is asking them to re-run
 * forty statements to reach three — and every one of those is another chance
 * for the paste to stop somewhere and take the part they actually needed
 * with it. That is the exact failure this whole thing came from.
 *
 * It is GENERATED FROM THE SAME FILES, so the two can never disagree:
 * tests/sql-aggregate.test.ts asserts both contain their sources verbatim.
 */
const SITES_SECTIONS = SECTIONS.slice(-3)

const SITES_HEADER = `-- ###########################################################################
--  STORELIB AI — SITES, THE AGENT LEDGER, AND PUBLISHING
-- ###########################################################################
--  Select all, copy, paste into the Supabase SQL editor, press Run.
--
--  This is the part that makes the Publish button work. If publishing says
--  "Publishing is not set up on this deployment yet", this is the file.
--
--  GENERATED, never hand-edited. Regenerate with
--
--      node scripts/build-creator-page-sql.mjs
--
--  IDEMPOTENT. Run it as many times as you like — every statement guards
--  itself, and running it on a database that already has all of this changes
--  nothing. Verified by running it twice in a row on a real Postgres 16.
--
--  PREREQUISITE: public.creators must exist. Nothing else is required —
--  custom_domains is linked only if it happens to be there.
--
--  WHAT IT CREATES:
${SITES_SECTIONS.map(([, title], i) => `--    ${i + 1}. ${title}`).join("\n")}
--
--  It is safe to run this even if you have already run
--  RUN_CREATOR_PAGE_AND_SITES.sql. They share these three sections.
-- ###########################################################################

`

const sitesParts = [SITES_HEADER]

SITES_SECTIONS.forEach(([path, title], i) => {
  const body = readFileSync(join(ROOT, path), "utf8").trimEnd()
  sitesParts.push(
    "",
    "",
    "-- ###########################################################################",
    `--  SECTION ${i + 1}: ${title}`,
    `--  source: ${path}`,
    "-- ###########################################################################",
    "",
    body,
    "",
  )
})

/**
 * The check, and it checks the STORAGE BUCKET too.
 *
 * The tables can all be present and publishing still fail, because uploads go
 * to a bucket that a separate statement creates. A check that reads only
 * to_regclass would report success on a database that cannot publish.
 */
sitesParts.push(
  "",
  "",
  `-- ###########################################################################
--  DONE — every column below should read true.
--  A false is the piece that is still missing.
-- ###########################################################################
notify pgrst, 'reload schema';

select
  to_regclass('public.sites')              is not null as sites,
  to_regclass('public.site_files')         is not null as files,
  to_regclass('public.site_versions')      is not null as versions,
  to_regclass('public.site_deployments')   is not null as deployments,
  to_regclass('public.site_agent_runs')    is not null as cost_ledger,
  to_regclass('public.site_chat_messages') is not null as chat_history,
  exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='site_deployments'
             and column_name in ('slug','is_live','storage_prefix','version_label')
           having count(*) = 4)                          as publish_columns,
  exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='sites'
             and column_name in ('revision','published_revision')
           having count(*) = 2)                          as revision_columns,
  exists (select 1 from storage.buckets
           where id = 'site-deployments')                as storage_bucket,
  (select count(*) from pg_proc
    where proname='site_commit_files') = 1               as commit_function,
  exists (select 1 from pg_indexes where schemaname='public'
           and indexname='uniq_site_deployments_live')   as one_live_per_site;
`,
)

export function buildSitesPublishingSql() {
  return sitesParts.join("\n")
}

const OUT = join(ROOT, "supabase/sql/RUN_CREATOR_PAGE_AND_SITES.sql")
const SITES_OUT = join(ROOT, "supabase/sql/RUN_SITES_PUBLISHING.sql")

if (process.argv[1] && process.argv[1].endsWith("build-creator-page-sql.mjs")) {
  writeFileSync(OUT, buildCreatorPageSql(), "utf8")
  console.log(`wrote supabase/sql/RUN_CREATOR_PAGE_AND_SITES.sql (${SECTIONS.length} sections)`)
  writeFileSync(SITES_OUT, buildSitesPublishingSql(), "utf8")
  console.log(`wrote supabase/sql/RUN_SITES_PUBLISHING.sql (${SITES_SECTIONS.length} sections)`)
}
