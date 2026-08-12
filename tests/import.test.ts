/**
 * ===========================================================================
 *  IMPORTING A SHOP FROM ANOTHER MARKETPLACE
 * ===========================================================================
 *
 * The faults this guards against are all of the same kind: the importer
 * SUCCEEDS and the data is wrong. There is no crash to notice, no error to
 * read, just a shop full of plausible listings that are somebody else's, or
 * priced at a twentieth of their value, or filed under the wrong department.
 * Every check below is a place where that already nearly happened.
 *
 * Run with:  npm run test:push
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"

import { stripComments } from "./_source"
import { LISTING_CATEGORIES } from "../lib/marketplace/listing-taxonomy"
import { mapCategory, mapCondition, mapSize, convertPriceCents, FX_TO_RON } from "../lib/import/mapping"
// The pure half only. lib/import/vinted.ts is `server-only` and throws the
// moment a plain Node process requires it — which is correct, and is why the
// URL parsing lives in its own module rather than being reached around.
import { parseVintedUrl, VintedError } from "../lib/import/vinted-url"

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
/** The adapter's doc comment quotes the exact endpoint it exists to avoid, so
 *  a guard that reads comments fails on the prose explaining the fix. */
const code = (p: string) => stripComments(read(p))

const vinted = code("lib/import/vinted.ts")
const vurl = code("lib/import/vinted-url.ts")
const mapping = code("lib/import/mapping.ts")
const scan = code("app/api/import/scan/route.ts")
const run = code("app/api/import/run/route.ts")
const page = code("app/import/page.tsx")
const client = code("app/import/import-client.tsx")
const sql = read("supabase/sql/RUN_IMPORT_SOURCE.sql")

console.log("\nThe endpoint that lies, and the one that tells the truth")

check(
  "the wardrobe endpoint is the only one asked for a member's items",
  (() => {
    /**
     * `/api/v2/catalog/items?user_id=<id>` accepts the parameter, ignores it,
     * and returns the general catalogue. Asked for member 164822283 it came
     * back with items belonging to user 3146573973 — a successful response,
     * correctly shaped, entirely the wrong person's stock. It is the
     * obvious-looking endpoint and it is the one fault here that would put a
     * stranger's listings in a seller's shop with nothing looking broken.
     */
    return /wardrobe\/\$\{profile\.memberId\}\/items/.test(vinted) && !/catalog\/items/.test(vinted)
  })(),
  "        lib/import/vinted.ts",
)

check(
  "and the profile HTML is never parsed for listings",
  (() => {
    // The member page returns 1.5MB, HTTP 200, and ZERO item links — the grid
    // is client-rendered. An HTML scraper looks like it works and reports an
    // empty wardrobe for a seller with fifty things for sale.
    return !/\/member\/\$\{/.test(vinted.replace(/profileUrl[^\n]*/g, "")) || !/cheerio|parse5|querySelector/.test(vinted)
  })(),
  "        lib/import/vinted.ts",
)

console.log("\nVinted is partitioned by country, and that is not cosmetic")

check(
  "the wardrobe is read from the member's own country host, not the pasted one",
  (() => {
    /**
     * Member 164822283 on vinted.com reports item_count 5 and returns an EMPTY
     * wardrobe with HTTP 200 — not an error, not a redirect. The same id on
     * vinted.co.uk returns all five. Resolving the country first is the whole
     * difference between an import and a confident no-op.
     */
    return (
      /HOST_BY_COUNTRY/.test(vinted) &&
      /country_code/.test(vinted) &&
      // The session is re-opened on the resolved host: one minted against the
      // pasted host is not valid on the country domain.
      /openSession\(profile\.host\)/.test(vinted)
    )
  })(),
  "        lib/import/vinted-url.ts",
)

check(
  "UK is spelled the way Vinted spells it, not the way ISO does",
  // Their country_code is "UK", not "GB". A table written from memory gets
  // this wrong for exactly one country and fails only for British sellers.
  /UK:\s*"www\.vinted\.co\.uk"/.test(vurl) && /GB:\s*"www\.vinted\.co\.uk"/.test(vurl),
  "        lib/import/vinted.ts",
)

check(
  "an empty wardrobe with a positive item_count is reported, not shown as empty",
  // The two look identical to a caller and mean opposite things: a genuinely
  // empty shop, versus the country fault above. Conflating them makes the one
  // real bug in this file invisible.
  /itemCount\s*&&\s*profile\.itemCount\s*>\s*0/.test(vinted) && /empty_wardrobe/.test(vinted),
  "        lib/import/vinted.ts",
)

check(
  "only known Vinted hosts can be fetched",
  (() => {
    // A pasted URL is untrusted input that this module then requests
    // server-side. The reachable set is closed by construction rather than by
    // string-validating the input, which is what keeps it from being a request
    // forger.
    return /ALLOWED_HOSTS\.has\(host\)/.test(vurl) && /new Set<string>\(Object\.values\(HOST_BY_COUNTRY\)\)/.test(vurl)
  })(),
  "        lib/import/vinted.ts",
)

console.log("\nThe URL parser takes what Vinted actually produces")

check("a bare id URL parses", parseVintedUrl("https://www.vinted.com/member/164822283").memberId === "164822283")
check(
  "an id-with-handle URL parses to the id, not the handle",
  parseVintedUrl("https://www.vinted.co.uk/member/164822283-ead02ox").memberId === "164822283",
)
check(
  "a country TLD is kept",
  parseVintedUrl("https://www.vinted.fr/member/1-x").host === "www.vinted.fr",
)
check("a missing www is tolerated", parseVintedUrl("vinted.de/member/99").host === "www.vinted.de")
check(
  "a non-Vinted host is refused",
  (() => {
    try {
      parseVintedUrl("https://evil.example.com/member/1")
      return false
    } catch (e) {
      return e instanceof VintedError && e.code === "bad_url"
    }
  })(),
)
check(
  "a Vinted URL that is not a profile is refused",
  (() => {
    try {
      parseVintedUrl("https://www.vinted.com/items/123")
      return false
    } catch (e) {
      return e instanceof VintedError && e.code === "bad_url"
    }
  })(),
)

console.log("\nPrice: the same value, not the same number")

check(
  "a GBP price is converted, not copied",
  // £25 listed as 25 RON is not an exact price, it is a 95% discount. This is
  // the single most expensive thing that could go wrong silently.
  convertPriceCents(25, "GBP") === Math.round(25 * FX_TO_RON.GBP * 100),
)
check("RON passes through unchanged", convertPriceCents(30, "RON") === 3000)
check("an unknown currency converts to nothing rather than to itself", convertPriceCents(10, "XYZ") === null)
check("a zero or negative price is refused", convertPriceCents(0, "EUR") === null && convertPriceCents(-5, "EUR") === null)
check(
  "the original amount and currency are stored beside the converted one",
  // Without them the conversion cannot be checked or redone when a rate is
  // corrected — the original number is gone the moment it is converted.
  /source_price_amount/.test(run) && /source_price_currency/.test(run) && /source_price_amount/.test(sql),
)

console.log("\nSize: a UK 7 is not an EU 7")

check(
  "a compound size takes the EU number",
  // Vinted states "6 / 39 / 39" when an item carries more than one system, and
  // their slot ORDER differs by country — so the EU value is found by range,
  // not by position.
  mapSize("6 / 39 / 39", "men-shoes", true) === "shoe-39",
)
check(
  "a bare UK size on a UK profile is converted",
  // The five items this was built against are "6", "6.5" and "7". As EU
  // numbers those are toddler shoes.
  mapSize("7", "men-shoes", true) === "shoe-41" && mapSize("6", "men-shoes", true) === "shoe-39",
)
check(
  "a bare number on a NON-UK profile is not converted on a guess",
  // The same "7" is UK 7 only on a UK shop. Converting it on a German profile
  // would be inventing a fact.
  mapSize("7", "men-shoes", false) === null,
)
check("an EU size on a non-UK profile is taken directly", mapSize("42", "men-shoes", false) === "shoe-42")
check("a letter clothing size maps through", mapSize("M", "men-clothing", false) === "m")
check("a compound clothing size finds the letter", mapSize("M / 38 / 10", "men-clothing", false) === "m")
check("an unmappable size is left null rather than guessed", mapSize("Taille unique", "men-clothing", false) === null)

console.log("\nCondition: the specific rung beats the general one")

check(
  "new-with-tags is not downgraded to new-without-tags",
  // "New with tags" matches BOTH patterns. The tag rule has to be tested
  // first; reversing the two lines silently downgrades every tagged item.
  mapCondition("New with tags") === "new_with_tags",
)
check("new without tags stays where it is", mapCondition("New without tags") === "new_without_tags")
check("very good is not swallowed by good", mapCondition("Very good") === "very_good")
check("a localised condition still lands", mapCondition("Neu mit Etikett") === "new_with_tags")
check("an unknown condition is null, not a default rung", mapCondition("Whatever") === null)
check("a null status stays null", mapCondition(null) === null)

console.log("\nCategory: refuse to guess rather than guess wrong")

check(
  "a sneaker is a sneaker",
  (() => {
    const r = mapCategory("Black and red reflective Nike 97s", null)
    return r.category === "men-shoes" && r.subcategory === "sneakers"
  })(),
)
check(
  "the department the operator picked moves a neutral item",
  (() => {
    const r = mapCategory("White Jordans", "women")
    return r.category === "women-shoes" && r.subcategory === "sneakers"
  })(),
)
check(
  "but a gendered item is not moved into a category that does not exist",
  // "Rochii" exists only under women-clothing. Honouring a "men" department
  // here would emit a category the taxonomy does not have.
  mapCategory("Rochie de vara", "men").category === "women-clothing",
)
check(
  "an unrecognised title gets no category at all",
  // A null category is shown to the operator as "needs a category". A wrong
  // one is not shown to anybody until a buyer finds it.
  mapCategory("Zzzz qqqq", null).category === null,
)
check(
  "every rule emits a category that exists in the taxonomy",
  (() => {
    // The rules are hand-written and the taxonomy moves. This is the guard
    // that catches a renamed group before it becomes a listing filed nowhere.
    const groups = new Map(LISTING_CATEGORIES.map((g: any) => [g.id, g]))
    const rules = [...mapping.matchAll(/group:\s*"([a-z0-9-]+)",\s*item:\s*"([a-z0-9-]+)"/g)]
    if (rules.length < 20) return false
    return rules.every(([, g, i]) => {
      const grp: any = groups.get(g)
      return !!grp && grp.items.some((it: any) => it.id === i)
    })
  })(),
  "        lib/import/mapping.ts",
)

console.log("\nRe-running is safe, and it is the database that makes it so")

check(
  "the dedupe key is read from the database, never from memory",
  (() => {
    /**
     * Two concurrent imports of the same profile land on different Vercel
     * instances that share nothing, so a Set or a module-level cache would let
     * both through. The select against the unique key is the plan; the index
     * is the backstop.
     */
    return (
      /\.eq\("source_platform",\s*"vinted"\)/.test(run) &&
      /\.eq\("source_item_id",\s*item\.id\)/.test(run) &&
      !/new Set\(\)[\s\S]{0,200}source_item_id/.test(run) &&
      !/globalThis\./.test(run)
    )
  })(),
  "        app/api/import/run/route.ts",
)

check(
  "an item that is already here is updated, not duplicated",
  /if \(existing\?\.id\)/.test(run) && /status: "updated"/.test(run),
  "        app/api/import/run/route.ts",
)

check(
  "and its photographs are not re-fetched on the second run",
  // Re-encoding eight images to produce identical files is a minute of work
  // and a pile of orphaned objects in the bucket for no change.
  (() => {
    const branch = run.slice(run.indexOf("if (existing?.id)"), run.indexOf('status: "updated"'))
    return !/importPhoto/.test(branch)
  })(),
  "        app/api/import/run/route.ts",
)

check(
  "the unique index is partial, so the hand-made listings stay out of it",
  (() => {
    // Nulls do not conflict in Postgres, so without the WHERE clause the index
    // would be large AND would still permit every duplicate it exists to
    // prevent.
    return (
      /create unique index if not exists products_source_unique/.test(sql) &&
      /where source_platform is not null and source_item_id is not null/.test(sql)
    )
  })(),
  "        supabase/sql/RUN_IMPORT_SOURCE.sql",
)

check(
  "the platform and the id are constrained to arrive together",
  // An id without a platform cannot be deduped against anything: the id is
  // only unique WITHIN a platform.
  /products_source_pair_check/.test(sql) && /not valid/.test(sql),
  "        supabase/sql/RUN_IMPORT_SOURCE.sql",
)

check(
  "the constraint is added NOT VALID, so it does not lock the busiest table",
  // Validating rewrites products under ACCESS EXCLUSIVE to prove something
  // about rows that cannot violate it. New rows are checked either way.
  /not valid;/.test(sql),
  "        supabase/sql/RUN_IMPORT_SOURCE.sql",
)

console.log("\nPhotographs go through the same door as a real upload")

check(
  "imported photos are re-encoded, not hotlinked",
  (() => {
    /**
     * A hotlink dies when the seller deletes their old shop — which is what a
     * seller who has moved here does — leaving a live listing with a dead
     * photograph. It also sends our referrer to their CDN on every card view.
     */
    return (
      /reprocessImage\(/.test(run) &&
      /storage[\s\S]{0,80}\.from\("listings"\)/.test(run) &&
      !/thumbnail_url:\s*(mapped|item)\.photos/.test(run)
    )
  })(),
  "        app/api/import/run/route.ts",
)

check(
  "the cover is the source's cover, and the order is the source's order",
  (() => {
    // The seller chose which photograph leads. That choice is part of the
    // listing, and index 0 has to stay index 0 through the whole path.
    return (
      /thumbnail_url:\s*stored\[0\]\.large/.test(run) &&
      /gallery_urls:\s*stored\.slice\(1\)/.test(run) &&
      /photos:\s*item\.photos\.map/.test(mapping)
    )
  })(),
  "        app/api/import/run/route.ts",
)

check(
  "variants stay positionally aligned with [thumbnail_url, ...gallery_urls]",
  // The alignment is the whole contract of the column: a shifted entry renders
  // the wrong photograph on the card.
  /image_variants:\s*stored\.map/.test(run),
  "        app/api/import/run/route.ts",
)

check(
  "a listing with no usable photo is refused rather than created blank",
  /no_photos/.test(run),
  "        app/api/import/run/route.ts",
)

check(
  "one bad item does not end the batch",
  // The operator gets a row saying which one and why, and re-running is safe
  // because the successful ones are now deduped by source id.
  /status: "failed"/.test(run) && /for \(const item of chosen\)/.test(run),
  "        app/api/import/run/route.ts",
)

console.log("\nNothing about this runs in, or leaks to, the browser")

check(
  "the adapter is server-only",
  /^import "server-only"/m.test(read("lib/import/vinted.ts")),
  "        lib/import/vinted.ts",
)

check(
  "both routes require a signed-in account",
  /auth_required/.test(scan) && /auth_required/.test(run) && /supabase\.auth\.getUser\(\)/.test(run),
)

check(
  "listings are created under the importer's own creator row",
  // There is no "import into somebody else's shop": the owner is always the
  // account that ran it.
  /creator_id:\s*creatorId/.test(run) && /\.eq\("user_id",\s*userId\)/.test(run),
  "        app/api/import/run/route.ts",
)

check(
  "the page is behind a login and is not indexable",
  /redirect\("\/login\?next=\/import"\)/.test(page) && /index:\s*false/.test(page),
  "        app/import/page.tsx",
)

check(
  "the client never talks to Vinted itself",
  (() => {
    /**
     * Their CORS forbids it anyway, but the reason it matters is that the
     * outbound request should be OURS — bounded by our timeouts, capped by our
     * page limits and attributable to us — rather than something a browser can
     * be talked into making on a visitor's connection.
     *
     * This asserts the property rather than the absence of a word. The page
     * says "Vinted" several times in ordinary Romanian copy, and a guard that
     * greps for the name fails on its own on-screen warning — which is exactly
     * what it did.
     */
    const fetches = [...client.matchAll(/fetch\(\s*(["'`])([^"'`]*)\1/g)].map((m) => m[2])
    return fetches.length > 0 && fetches.every((u) => u.startsWith("/api/"))
  })(),
  "        app/import/import-client.tsx",
)

console.log("\nEvery cap and every omission is stated on screen")

check(
  "a truncated wardrobe says so",
  // A cap nobody is told about reads as "that was everything they had".
  /truncated/.test(scan) && /truncated/.test(client) && /MAX_ITEMS/.test(vinted),
)

check(
  "skipped sold and hidden items are counted, not silently dropped",
  /skipped/.test(scan) && /skipped/.test(client) && /is_closed/.test(vinted),
)

check(
  "a missing migration is reported instead of silently duplicating",
  /sourceColumnsReady/.test(scan) && /RUN_IMPORT_SOURCE/.test(client),
)

check(
  "items the mapper was unsure about are not pre-selected",
  // Opting IN to a guess is a decision. Opting out of one you never saw is a
  // trap.
  /i\.missing\.length === 0/.test(client),
  "        app/import/import-client.tsx",
)

check(
  "the page says whose listings these are",
  // The one fact about this tool that is not obvious from using it.
  /Vinted interzic/.test(read("app/import/import-client.tsx")),
  "        app/import/import-client.tsx",
)

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log("\nFailures:")
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
