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

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failing:", failures.join(", "))
  process.exit(1)
}
