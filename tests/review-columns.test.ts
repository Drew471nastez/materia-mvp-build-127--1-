/**
 * A select names columns that exist, or the whole query is refused.
 *
 * The creator page asked reviews for `comment`. There is no such column, and
 * PostgREST does not quietly skip one it does not recognise:
 *
 *     HTTP 400
 *     42703 column reviews.comment does not exist
 *     hint: Perhaps you meant to reference the column "reviews.content".
 *
 * The caller destructured `{ data }` and dropped the error, so a refused
 * query became an empty list, and a creator page with a review on it said
 * "No reviews yet" while the product page two clicks away showed the review.
 * A build cannot see this: the string is a string.
 *
 * The column list below was read off the live table.
 *
 * Run with:  npm run test:push
 */

import { readdirSync, readFileSync, statSync } from "node:fs"
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
    console.log(`  FAIL  ${name}${detail ? `\n          ${detail}` : ""}`)
  }
}

/** public.reviews, as it actually is. */
const REVIEW_COLUMNS = new Set([
  "buyer_id",
  "content",
  "created_at",
  "creator_id",
  "id",
  "order_id",
  "product_id",
  "rating",
  "updated_at",
  /*
    Added by run-now part 52 (reviews complete), on purpose: the guest's
    name, published or hidden, the edit date and the seller's one reply.
    Every read that names one of these asks again without them when the
    part has not run (lib/reviews/store missingColumn).
  */
  "reviewer_name",
  "status",
  "hidden_at",
  "hidden_reason",
  "edited_at",
  "seller_reply",
  "seller_reply_at",
  /*
    Added by run-now part 134 (Storelib Reviews): a title, photos, featured,
    verified, where it came from, who hid it, when it was published, and
    site_status (the store's say over its own website only). The
    app's reads ask again without them when the part has not run
    (lib/reviews/storefront-server, lib/reviews/manage-server), and its
    writes answer that the part is needed.
  */
  "title",
  "photos",
  "featured",
  "site_status",
  "verified",
  "source",
  "hidden_by",
  "published_at",
])

const SKIP = new Set(["node_modules", ".next", ".git", "ios", "android", "public", "tests"])

function sources(dir: string, out: string[] = []): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const entry of entries) {
    if (SKIP.has(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) sources(full, out)
    else if (/\.tsx?$/.test(full)) out.push(full)
  }
  return out
}

const FILES = ["app", "lib", "components"].flatMap((d) => sources(d))

/**
 * Every `.from("reviews")` followed by a `.select("…")`, with the selected
 * list pulled out. Embedded resources — `product:products(title, slug)` — are
 * a different table's columns and are skipped; what is checked is the names
 * belonging to reviews itself.
 */
const offenders: string[] = []
let selectsFound = 0

for (const file of FILES) {
  const src = readFileSync(file, "utf8")
  let at = src.indexOf('.from("reviews")')
  while (at !== -1) {
    const after = src.slice(at, at + 900)
    const select = after.match(/\.select\(\s*[`"']([\s\S]*?)[`"']/)
    if (select) {
      selectsFound++
      /*
        Drop embedded resources whole. `product:products(title, slug)` is
        another table's columns, and stripping only what is INSIDE the
        parentheses leaves `products` and `profiles!buyer_id` behind as if
        they were columns of reviews — which is how the first version of this
        check reported five failures that were all correct code.

        So on the way into a parenthesis, the name that opened it is removed
        as well, by winding back to the comma that started it.
      */
      const list = select[1]
      let depth = 0
      let flat = ""
      for (const ch of list) {
        if (ch === "(") {
          if (depth === 0) {
            const lastComma = flat.lastIndexOf(",")
            flat = lastComma === -1 ? "" : flat.slice(0, lastComma + 1)
          }
          depth++
        } else if (ch === ")") {
          depth--
        } else if (depth === 0) {
          flat += ch
        }
      }
      for (const raw of flat.split(",")) {
        const name = raw.trim().replace(/[\s\S]*:/, "").trim()
        if (!name || name === "*") continue
        /* `alias:table` embeds leave their alias behind; those end at the
           parenthesis that was stripped, so what is left is a bare column. */
        if (!REVIEW_COLUMNS.has(name)) {
          offenders.push(`${file}: "${name}"`)
        }
      }
    }
    at = src.indexOf('.from("reviews")', at + 1)
  }
}

console.log("\nEvery reviews select names a column that exists\n")

check("some selects were found, so this checked something", selectsFound > 0, `${selectsFound} found`)
check(
  "and none names a column reviews does not have",
  offenders.length === 0,
  offenders.join("\n          ") || undefined,
)

/* The specific one that caused it, named so the regression is unmistakable. */
const creatorPage = readFileSync("app/(marketing)/u/[username]/page.tsx", "utf8")
check("the creator page asks for content", /\.select\("id, rating, content, created_at/.test(creatorPage))
/*
  CHANGED ON PURPOSE: it now asks for `reviewer_name` too, and falls back to
  the old list when run-now part 52 has not run. A guest's review has no
  buyer_id and carries the name they bought with in that column, so without
  it the creator page had nothing to write under a guest review and drew a
  "?" for the face.
*/
check("and for the name a guest bought with, with the old list when part 52 has not run",
  /\.select\("id, rating, content, created_at, reviewer_name, product:products/.test(creatorPage)
    && /missingColumn\(res\.error\)/.test(creatorPage))
check("and not for comment", !/rating, comment/.test(creatorPage))
check(
  "and it no longer drops the error that would tell it",
  /\{ data: creatorReviews, error: creatorReviewsError \}/.test(creatorPage),
  "`{ data }` alone turns a refused query into an empty list",
)

console.log(`\n  ${passed} passed, ${failed} failed`)
if (failed) {
  console.log(`  failing: ${failures.join(", ")}`)
  process.exit(1)
}
