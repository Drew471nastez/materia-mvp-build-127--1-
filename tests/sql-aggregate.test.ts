/**
 * ===========================================================================
 *  THE ONE FILE AN OPERATOR PASTES HAS TO BE THE TRUTH
 * ===========================================================================
 *
 * supabase/sql/RUN_EVERYTHING.sql is what somebody actually runs against the
 * live database. It is a concatenation of eleven other files, which makes it
 * the single most drift-prone artefact in this repository: fix a policy in
 * RUN_SHIPPING.sql, forget to rebuild, and the aggregate still runs perfectly
 * — it just silently no longer contains the fix. Nothing fails, nobody finds
 * out, and the production database is a version behind the repository that
 * claims to describe it.
 *
 * So the invariant is checked here rather than trusted: every source file's
 * body must appear VERBATIM in the aggregate, and in the declared order. A
 * source edit without `node scripts/build-run-everything-sql.mjs` fails the
 * push.
 *
 * Run with:  npm run test:push
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
const failures: string[] = []

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n${detail}` : ""}`)
  }
}

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const AGGREGATE = "supabase/sql/RUN_EVERYTHING.sql"

/**
 * The same list the generator holds, in the same order, deliberately duplicated
 * rather than imported.
 *
 * Importing it would make this test agree with the generator by construction —
 * a reordering or a dropped entry would move both sides together and assert
 * nothing. Written out here, the two have to be changed in step by a person who
 * has looked at both.
 */
const SECTIONS = [
  "supabase/migrations/20260730_marketplace_physical_attributes.sql",
  "supabase/migrations/20260801_listing_attributes.sql",
  "supabase/migrations/20260730_wishlist_and_search_indexes.sql",
  "supabase/sql/RUN_MESSAGING_ALL.sql",
  "supabase/sql/RUN_PROFILE_COVER_BIO.sql",
  "supabase/sql/RUN_MESSAGE_PUSH.sql",
  "supabase/sql/RUN_ACTIVITY_PUSH.sql",
  "supabase/sql/RUN_LISTING_IMAGE_VARIANTS.sql",
  "supabase/sql/RUN_RESERVATIONS.sql",
  "supabase/sql/RUN_SHIPPING.sql",
  "supabase/sql/RUN_BACKFILL_PROFILES.sql",
]

const aggregate = read(AGGREGATE)

console.log("\nRUN_EVERYTHING.sql is a faithful concatenation")

let previousEnd = -1
let inOrder = true

for (const path of SECTIONS) {
  const body = read(path).trimEnd()
  const at = aggregate.indexOf(body)

  check(`${path} appears verbatim`, at !== -1, at === -1 ? "      rebuild: node scripts/build-run-everything-sql.mjs" : undefined)

  if (at !== -1) {
    if (at < previousEnd) inOrder = false
    previousEnd = at + body.length
  }
}

check("the sections are in the declared dependency order", inOrder)

check(
  "every section is named in the header, so the file explains itself",
  SECTIONS.every((p) => aggregate.includes(`source: ${p}`)),
)

/**
 * The two exclusions are the point of the header, not decoration.
 *
 * RUN_CURRENCY_RON.sql multiplies every price by 4.6 and has to be sequenced
 * with an environment variable. Folded into a file whose whole promise is
 * "paste it, it is safe", it is one careless select-all away from repricing a
 * catalogue nobody meant to reprice.
 */
check(
  "the currency migration is NOT folded in",
  !aggregate.includes("currency_ron_2026"),
)

check(
  "and the header says why, and in which order to do it",
  /RUN_CURRENCY_RON\.sql/.test(aggregate) &&
    /NEXT_PUBLIC_PLATFORM_CURRENCY=ron/.test(aggregate) &&
    /SQL FIRST/.test(aggregate),
)

/**
 * The seed creates a row in auth.users. A schema script that makes an ACCOUNT
 * without being asked is a different kind of thing from one that adds a column.
 */
check(
  "the account seed is NOT folded in",
  !aggregate.includes("20260805_storelib_seed.sql\n-- ####") &&
    !/insert into auth\.users/i.test(aggregate),
)

check(
  "the file says it is generated, and how to regenerate it",
  /build-run-everything-sql\.mjs/.test(aggregate),
)

check(
  "it ends with a check row an operator can read",
  aggregate.includes("as reservation_rpc") &&
    aggregate.includes("as shipping_columns") &&
    aggregate.includes("as image_variants"),
)

/**
 * The reload has to come AFTER the last section, and the verification select
 * after that. PostgREST answers from a cached schema, so a run that adds
 * columns and never reloads leaves the API insisting a column that is
 * demonstrably there does not exist — over a column you can see in the editor.
 *
 * Anchored on positions rather than on a slice of the tail, because the length
 * of the final block is nobody's business and a test that knows it breaks every
 * time a line is added to the check row.
 */
check(
  "PostgREST is told the schema changed, after everything else has run",
  (() => {
    const reload = aggregate.lastIndexOf("notify pgrst, 'reload schema';")
    return reload > previousEnd && aggregate.lastIndexOf("as reservation_rpc") > reload
  })(),
)

/**
 * ===========================================================================
 *  A RE-RUN MUST NOT ABORT ON A ROW THAT PREDATES THE RULE
 * ===========================================================================
 *
 * The aggregate promises it can be run again. That promise died on a real
 * database with
 *
 *   ERROR: 23514: check constraint "messages_shape" of relation "messages"
 *          is violated by some row
 *
 * because ADD CONSTRAINT validates every existing row, and a soft-deleted
 * message is `kind = 'text'` with a NULL body — which the constraint being
 * added did not allow, because the column that excuses it (`deleted_at`) was
 * created eighty lines further down the same file. So the first run worked, the
 * second run died at section 4, and the seven sections after it never ran.
 *
 * Two properties fix it, and both are checked here because both are easy to
 * lose in an edit that only looks at one of them.
 */
const messaging = read("supabase/sql/RUN_MESSAGING_ALL.sql")

check(
  "deleted_at exists before anything constrains around it",
  messaging.indexOf("add column if not exists deleted_at") <
    messaging.indexOf("add constraint messages_shape"),
)

check(
  "every re-added messages_shape excuses a deleted row",
  (() => {
    // The one inside CREATE TABLE is exempt: a table being created has no rows
    // to validate, and deleted_at does not exist yet at that point.
    const adds = messaging.split("add constraint messages_shape").slice(1)
    return adds.length >= 1 && adds.every((tail) => tail.slice(0, 400).includes("deleted_at is not null"))
  })(),
)

check(
  "and none of them re-validates history",
  (() => {
    const adds = messaging.split("add constraint messages_shape").slice(1)
    return adds.every((tail) => /\)\s*not valid;/.test(tail.slice(0, 500)))
  })(),
)

check(
  "a non-conforming row is reported rather than swallowed",
  /do not match the shape constraint/.test(messaging),
)

/**
 * The same class of abort, in the file that adds the tag caps. Nothing has hit
 * it yet; the cost of the guard is one keyword and the cost of not having it is
 * every section after it.
 */
const listingAttrs = read("supabase/migrations/20260801_listing_attributes.sql")

check(
  "the tag caps do not re-validate history either",
  (() => {
    const adds = listingAttrs.split(/add constraint products_(?:source|style)_tags_max/).slice(1)
    return adds.length === 2 && adds.every((tail) => /not valid;/.test(tail.slice(0, 400)))
  })(),
)

/**
 * ===========================================================================
 *  THE SECOND PASTE FILE: CREATOR PAGE, STORE BUILDER, STORELIB AI
 * ===========================================================================
 *
 * Same contract as RUN_EVERYTHING, and it exists because a paste of the five
 * "pending" migrations died on its second statement with
 *
 *   ERROR: 42P01: relation "public.store_builder_configs" does not exist
 *
 * — a table roughly thirty call sites read and write, and that NOTHING IN THIS
 * REPOSITORY CREATED. It had been made by hand in the Supabase dashboard, so
 * migrations that indexed it and back-filled it ran fine against the one
 * database that happened to have it and failed everywhere else.
 *
 * The checks below are the invariants that were actually violated, not a
 * restatement of the file's shape.
 */
const SITES_AGGREGATE = "supabase/sql/RUN_CREATOR_PAGE_AND_SITES.sql"

/** Duplicated from the generator, deliberately — see the note on SECTIONS. */
const SITES_SECTIONS = [
  "supabase/migrations/20260317000000_website_builder.sql",
  "supabase/migrations/20260407_website_builder_public_read_hardened.sql",
  "supabase/migrations/20260115_store_builder_configs_baseline.sql",
  "supabase/migrations/20260731_follows.sql",
  "supabase/migrations/20260906_subscribe_bar_sticky_default.sql",
  "supabase/migrations/20260908_storelib_sites.sql",
  "supabase/migrations/20260909_creator_page_backfill.sql",
  "supabase/migrations/20260910_sites_projects.sql",
  "supabase/migrations/20260911_site_agent_runs.sql",
]

console.log("\nRUN_CREATOR_PAGE_AND_SITES.sql is a faithful concatenation")

const sitesAggregate = read(SITES_AGGREGATE)
let sitesPreviousEnd = -1
let sitesInOrder = true

for (const path of SITES_SECTIONS) {
  const body = read(path).trimEnd()
  const at = sitesAggregate.indexOf(body)
  check(`${path} appears verbatim`, at !== -1, at === -1 ? "      rebuild: node scripts/build-creator-page-sql.mjs" : undefined)
  if (at !== -1) {
    if (at < sitesPreviousEnd) sitesInOrder = false
    sitesPreviousEnd = at + body.length
  }
}

check("the sites sections are in the declared dependency order", sitesInOrder)

/**
 * The ordering rule that the original failure was made of. The baseline
 * CREATES store_builder_configs; two later migrations UPDATE it. Reversed,
 * the paste dies on its first UPDATE and every section after it is skipped.
 */
const baseline = "supabase/migrations/20260115_store_builder_configs_baseline.sql"
check(
  "the config tables are created before anything back-fills them",
  (() => {
    const created = sitesAggregate.indexOf(read(baseline).trimEnd())
    const sticky = sitesAggregate.indexOf(read("supabase/migrations/20260906_subscribe_bar_sticky_default.sql").trimEnd())
    const page = sitesAggregate.indexOf(read("supabase/migrations/20260909_creator_page_backfill.sql").trimEnd())
    return created !== -1 && created < sticky && created < page
  })(),
)

/**
 * And the same rule one level up: 20260908 ALTERs store_theme_installs, which
 * only the website_builder migration creates.
 */
check(
  "the theme tables are created before anything alters them",
  sitesAggregate.indexOf(read("supabase/migrations/20260317000000_website_builder.sql").trimEnd()) <
    sitesAggregate.indexOf(read("supabase/migrations/20260908_storelib_sites.sql").trimEnd()),
)

/**
 * ===========================================================================
 *  THE BASELINE MUST NOT TOUCH A LIVE DATABASE'S SECURITY
 * ===========================================================================
 *
 * Production configured RLS on these tables by hand, months ago, and this
 * repository cannot see what those policies say. An unconditional
 * ENABLE ROW LEVEL SECURITY would take every creator page offline in one
 * statement. So the security block runs only where there are no policies at
 * all — which is the signature of a table this migration just created.
 */
// Comments stripped: this file EXPLAINS what it must not do, and a guard
// that reads its own explanation as a violation is not a guard.
const baselineSql = read(baseline).replace(/^\s*--.*$/gm, "")

check(
  "the baseline never enables RLS outside the guarded block",
  (() => {
    const guarded = baselineSql.slice(baselineSql.indexOf("$baseline_rls$"))
    const all = baselineSql.match(/ENABLE ROW LEVEL SECURITY/g) ?? []
    const inside = guarded.match(/ENABLE ROW LEVEL SECURITY/g) ?? []
    return all.length > 0 && all.length === inside.length
  })(),
)

check(
  "and it skips a table that already has policies",
  /CONTINUE WHEN EXISTS \(\s*SELECT 1 FROM pg_policies/.test(baselineSql),
)

check(
  "the baseline drops nothing",
  !/\bDROP\s+(TABLE|COLUMN|POLICY|CONSTRAINT)\b/i.test(baselineSql.replace(/--[^\n]*/g, "")),
)

/**
 * A unique index on a table that already holds duplicates fails, and this
 * migration must never be the thing that stops a deployment. It checks first
 * and reports instead — picking which of two configs is real is a judgement
 * call, not a migration.
 */
check(
  "the unique indexes are only created when the data already satisfies them",
  /RAISE WARNING/.test(baselineSql) && /HAVING count\(\*\) > 1/.test(baselineSql),
)

/**
 * ===========================================================================
 *  THE THREE TABLE NAMES THE TWO SITES MIGRATIONS BOTH WANTED
 * ===========================================================================
 *
 * 20260908 was written under the section-JSON design and created
 * site_versions / site_form_submissions / site_integrations keyed off
 * `install_id`. 20260910 creates the same three names keyed off `site_id`.
 * CREATE TABLE IF NOT EXISTS does not reconcile a shape — it SKIPS — so on any
 * database that ran the first, the second silently got the wrong tables and
 * then died building an index on a column that was never there.
 */
const older = read("supabase/migrations/20260908_storelib_sites.sql").replace(/^\s*--.*$/gm, "")
const newer = read("supabase/migrations/20260910_sites_projects.sql").replace(/^\s*--.*$/gm, "")
const COLLIDING = ["site_versions", "site_form_submissions", "site_integrations"]

check(
  "only one of the two sites migrations creates the colliding tables",
  COLLIDING.every((t) => !new RegExp(String.raw`CREATE TABLE IF NOT EXISTS ${t}\b`, "i").test(older)),
)

check(
  "and the survivor keys them off site_id",
  COLLIDING.every((t) => new RegExp(String.raw`CREATE TABLE IF NOT EXISTS ${t}\s*\(`, "i").test(newer)) &&
    // `install_id` appears in the reconcile block by necessity — that block
    // exists to FIND the old shape. What must not carry it is anything the
    // migration creates, so the check starts after the reconcile block ends.
    !newer.slice(newer.indexOf("$reconcile$;")).includes("install_id"),
)

/**
 * A DROP TABLE in a migration earns its guards. All three, because any one of
 * them alone would let it destroy a table it does not understand.
 */
check(
  "the legacy drop refuses a table that is not empty",
  /RAISE EXCEPTION/.test(newer) && /row\(s\) in it/.test(newer),
)

check(
  "the legacy drop requires the old shape and the absence of the new one",
  /column_name = 'install_id'/.test(newer) && /column_name = 'site_id'/.test(newer),
)

/**
 * ===========================================================================
 *  A FILTER THAT MATCHES NOTHING IS WORSE THAN NO FILTER
 * ===========================================================================
 *
 * The video relabel was gated on `config::text LIKE '%"type":"youtube"%'`.
 * Postgres renders jsonb back to text with a SPACE after every colon, so the
 * stored form is `"type": "youtube"` and the pattern never matched — the
 * section had been a no-op on every database it ever ran against, and looked
 * completely fine.
 */
const backfill = read("supabase/migrations/20260909_creator_page_backfill.sql").replace(/^\s*--.*$/gm, "")

check(
  "the backfill does not filter jsonb by matching its text rendering",
  !/::text\s+LIKE/i.test(backfill),
)

check(
  "it tests the document instead",
  /jsonb_array_elements\([^)]*mediaItems/.test(backfill) && /m ->> 'type' = 'youtube'/.test(backfill),
)

/**
 * jsonb_array_elements() ERRORS on a value that is not an array, and
 * `config ? 'sections'` says only that the key exists. One config with
 * `"sections": {}` would abort the whole migration.
 */
check(
  "every array walk checks it is walking an array",
  (() => {
    const walks = backfill.split("jsonb_array_elements(").length - 1
    const typed = (backfill.match(/jsonb_typeof\([^)]*-> 'sections'\) = 'array'/g) ?? []).length
    return walks > 0 && typed === 4
  })(),
)

/**
 * jsonb_agg over an empty set returns NULL, and jsonb_set(col, path, NULL)
 * returns NULL for the WHOLE COLUMN — a creator's page wiped rather than
 * updated.
 */
check(
  "no jsonb_agg reaches jsonb_set without a COALESCE",
  (() => {
    const aggs = backfill.split("jsonb_agg(").length - 1
    const coalesced = (backfill.match(/COALESCE\(jsonb_agg\(/g) ?? []).length
    return aggs > 0 && aggs === coalesced
  })(),
)

check(
  "the sites paste file says it is generated, and how to regenerate it",
  /build-creator-page-sql\.mjs/.test(sitesAggregate),
)

check(
  "it ends with a check row an operator can read, after the schema reload",
  (() => {
    const reload = sitesAggregate.lastIndexOf("notify pgrst, 'reload schema';")
    return (
      reload > sitesPreviousEnd &&
      sitesAggregate.lastIndexOf("as creator_page_configs") > reload &&
      sitesAggregate.includes("as legacy_shape_gone") &&
      sitesAggregate.includes("as agent_cost_ledger")
    )
  })(),
)

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failing:", failures.join(", "))
  process.exit(1)
}
