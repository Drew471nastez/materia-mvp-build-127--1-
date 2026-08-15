#!/usr/bin/env node
/**
 * ===========================================================================
 *  BUILD supabase/sql/RUN_EVERYTHING.sql
 * ===========================================================================
 *
 * RUN_EVERYTHING.sql is the one file an operator pastes into the Supabase SQL
 * editor. It is every migration and RUN_*.sql this marketplace still needs,
 * concatenated in the only order they are safe in.
 *
 * It is GENERATED rather than maintained, and that is the whole point: a
 * hand-kept copy of six other files drifts the first time one of them changes,
 * and the drift is invisible — the aggregate still runs, it just quietly stops
 * containing the fix you made last week. Everything below is read from disk at
 * build time, so the aggregate cannot say something its sources do not.
 *
 *   node scripts/build-run-everything-sql.mjs
 *
 * tests/sql-aggregate.test.ts re-runs this in memory and fails if the checked-in
 * file differs, so a source edit without a rebuild cannot be pushed.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS DELIBERATELY NOT IN IT
 * ---------------------------------------------------------------------------
 *   supabase/sql/RUN_CURRENCY_RON.sql
 *     It rewrites every price in the catalogue and has to be sequenced with an
 *     environment variable (the migration FIRST, then
 *     NEXT_PUBLIC_PLATFORM_CURRENCY=ron). Folding a destructive, order-coupled
 *     step into a file whose whole promise is "paste it, it is safe" is how
 *     somebody runs it by accident.
 *
 *   supabase/migrations/20260805_storelib_seed.sql
 *     It creates a row in auth.users. Making an ACCOUNT is not something a
 *     schema script should do behind the operator's back, so it stays a
 *     deliberate, separate paste.
 */

import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")

/**
 * ORDER MATTERS, and every entry here earns its position:
 *
 *  1 attributes      products.size/condition/brand/color, type 'physical', and
 *                    the search trigger. Everything else about a listing
 *                    assumes these columns exist.
 *  2 listing attrs   subcategory/colour/era/tags/draft_saved_at, the brand
 *                    directory, and the `listings` storage bucket. Needs 1 (it
 *                    indexes `brand`).
 *  3 search indexes  trigram indexes over title/description/brand and the
 *                    wishlist lookups. Needs 1 for `brand`.
 *  4 messaging       conversations, messages, notifications, offers, blocks,
 *                    reports, follows, presence, abuse triggers.
 *  5 profile         profiles.bio and profiles.cover_url.
 *  6 message push    chat push idempotency + preference columns.
 *  7 activity push   likes/follows/trending queue. Needs 4 (it widens a CHECK
 *                    that file creates) and 6 (it reuses push_preview_enabled).
 *  8 image variants  products.image_variants for the 4:5 thumbnail system.
 *  9 reservations    one buyer at a time; closes the double-charge race.
 * 10 shipping        the AWB columns on orders and buyer_shipping_prefs.
 * 11 backfill        a profiles row for every account that lacks one. Last,
 *                    because 5/6/7 add the columns it should be filling.
 */
const SECTIONS = [
  ["supabase/migrations/20260730_marketplace_physical_attributes.sql", "Listing attributes: size, condition, brand, colour"],
  ["supabase/migrations/20260801_listing_attributes.sql", "Subcategory, era, tags, drafts, the brand directory, the photo bucket"],
  ["supabase/migrations/20260730_wishlist_and_search_indexes.sql", "Search and wishlist indexes"],
  ["supabase/sql/RUN_MESSAGING_ALL.sql", "Messaging, notifications, follows, safety"],
  ["supabase/sql/RUN_PROFILE_COVER_BIO.sql", "Profile bio and cover"],
  ["supabase/sql/RUN_MESSAGE_PUSH.sql", "Chat push"],
  ["supabase/sql/RUN_ACTIVITY_PUSH.sql", "Likes, follows and trending push"],
  ["supabase/sql/RUN_LISTING_IMAGE_VARIANTS.sql", "Optimised image variants"],
  ["supabase/sql/RUN_RESERVATIONS.sql", "One buyer at a time"],
  ["supabase/sql/RUN_SHIPPING.sql", "Shipping and AWB"],
  ["supabase/sql/RUN_BACKFILL_PROFILES.sql", "A profiles row for every account"],
  // After the profiles backfill, because it adds columns to public.profiles and
  // reads public.products and public.creators. Nothing later depends on it.
  ["supabase/migrations/20260815_signup_abuse.sql", "Signup abuse: attempt ledger and spam flags"],
  // Last, and it only builds indexes. It names columns every section above it
  // adds — category, price_cents, brand, size, colour, condition — so it cannot
  // run before them; and nothing after it depends on an index existing, so it
  // has nowhere earlier to go.
  ["supabase/sql/RUN_SHOP_INDEXES.sql", "Indexes for the results page"],
]

const HEADER = `-- ###########################################################################
--  STORELIB — RUN EVERYTHING
-- ###########################################################################
--  ONE file. Select all, copy, paste into the Supabase SQL editor, press Run.
--
--  This is every migration and RUN_*.sql this marketplace needs, concatenated
--  in the only order they are safe in. Nothing is retyped — it is the real
--  files, read at build time, so this cannot drift from them. Regenerate with
--
--      node scripts/build-run-everything-sql.mjs
--
--  IDEMPOTENT. Running it a second time changes nothing and raises nothing.
--  Every statement in it guards itself (create if not exists / drop policy if
--  exists / add column if not exists), so it is safe whether you have none of
--  this, some of it, or all of it already. Run it if you are not sure.
--
--  NO PREREQUISITES beyond the base schema (public.products, public.profiles,
--  public.orders, public.wishlist_items). Sections that reference a table this
--  database does not have degrade to a NOTICE instead of aborting the rest.
--
--  ORDER, and why:
${SECTIONS.map(([, title], i) => `--    ${String(i + 1).padStart(2, " ")}. ${title}`).join("\n")}
--
-- ---------------------------------------------------------------------------
--  TWO THINGS ARE DELIBERATELY NOT IN HERE
-- ---------------------------------------------------------------------------
--  1. supabase/sql/RUN_CURRENCY_RON.sql — switches the catalogue from USD to
--     lei. It REWRITES EVERY PRICE and must be sequenced with an environment
--     variable: run the SQL FIRST, and only then set
--     NEXT_PUBLIC_PLATFORM_CURRENCY=ron in Vercel and redeploy. Doing it the
--     other way round sells a $100 listing for 100 lei. Run it on its own,
--     deliberately, once.
--
--  2. supabase/migrations/20260805_storelib_seed.sql — creates the official
--     Storelib account (a row in auth.users) and its thread in every inbox.
--     Optional, and it makes an ACCOUNT, so it stays a separate paste.
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

// The check at the end. Every column here is one the application reads and
// falls back for; a `false` in this row is a feature that is silently off.
parts.push(
  "",
  "",
  `-- ###########################################################################
--  DONE — the check. Every column should read true.
-- ###########################################################################
notify pgrst, 'reload schema';

select
  to_regclass('public.conversations')          is not null as messaging,
  to_regclass('public.message_push_log')       is not null as chat_push,
  to_regclass('public.activity_push_queue')    is not null as activity_push,
  to_regclass('public.brands')                 is not null as brand_directory,
  to_regclass('public.product_reservations')   is not null as reservations,
  to_regclass('public.buyer_shipping_prefs')   is not null as shipping_prefs,
  (select count(*) from pg_proc
    where proname = 'claim_product_reservation')     = 1  as reservation_rpc,
  exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='products'
             and column_name='condition')                 as listing_condition,
  exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='products'
             and column_name='subcategory')               as listing_subcategory,
  exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='products'
             and column_name='draft_saved_at')            as drafts,
  exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='products'
             and column_name='image_variants')            as image_variants,
  exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='orders'
             and column_name='awb_number')                as shipping_columns,
  exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='conversations'
             and column_name='buyer_deleted_at')          as deleted_conversations_stay_deleted,
  exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='profiles'
             and column_name='bio')                       as profile_bio,
  exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='profiles'
             and column_name='cover_url')                 as profile_cover,
  exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='profiles'
             and column_name='push_messages_enabled')     as chat_push_prefs,
  exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='profiles'
             and column_name='push_activity_enabled')     as activity_push_prefs;
`,
)

export function buildRunEverything() {
  return parts.join("\n")
}

const OUT = join(ROOT, "supabase/sql/RUN_EVERYTHING.sql")

if (process.argv[1] && process.argv[1].endsWith("build-run-everything-sql.mjs")) {
  writeFileSync(OUT, buildRunEverything(), "utf8")
  console.log(`wrote supabase/sql/RUN_EVERYTHING.sql (${SECTIONS.length} sections)`)
}
