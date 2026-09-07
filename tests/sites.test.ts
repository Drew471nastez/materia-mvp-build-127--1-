/**
 * ===========================================================================
 *  STORELIB SITES — Phase 1 foundation
 * ===========================================================================
 * Sites is the website builder opened up, not a second builder. These guards
 * exist because the failure mode is specific and this codebase has already had
 * it several times this week: a second section format, a second renderer, a
 * second registry, a second list of platform limits, each one right on the day
 * it was written and drifting from the first one by the following week.
 *
 * So the assertions are mostly about what must NOT come into existence, plus
 * the two pieces of real logic — slugs and plan gates — which are run rather
 * than pattern-matched.
 *
 * See docs/storelib-sites.md.
 */

import { readFileSync, existsSync, readdirSync } from "node:fs"
import { join } from "node:path"

import { toSiteSlug, siteSlugError, pageSlugError } from "@/lib/sites/slug"
import { siteLimits, siteGate, siteCountGate, sitePageGate } from "@/lib/sites/plan"

let passed = 0
let failed = 0
const failures: string[] = []

function check(name: string, ok: boolean) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}`)
  }
}
function section(title: string) {
  console.log(`\n${title}`)
}

const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")

// ---------------------------------------------------------------------------
section("Sites reuses the website-builder engine rather than forking it")
// ---------------------------------------------------------------------------

check(
  "there is exactly one section registry, and Sites does not add a second",
  (() => {
    const missing: string[] = []
    if (!existsSync(join(root, "components/website-builder/sections/registry.ts")))
      missing.push("the section registry is gone")

    // A second registry, renderer set or schema assembler under lib/sites or
    // components/sites is the fork this whole design exists to avoid.
    for (const dir of ["lib/sites", "components/sites"]) {
      const full = join(root, dir)
      if (!existsSync(full)) continue
      const walk = (d: string): string[] =>
        readdirSync(d, { withFileTypes: true }).flatMap((e) =>
          e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)],
        )
      for (const file of walk(full)) {
        const src = readFileSync(file, "utf8")
        if (/SECTION_REGISTRY\s*[:=]/.test(src))
          missing.push(`${file.replace(root + "/", "")} declares its own section registry`)
        if (/interface SectionInstance|type SectionInstance\s*=/.test(src))
          missing.push(`${file.replace(root + "/", "")} redefines SectionInstance`)
        if (/interface SectionSchema|type SectionSchema\s*=/.test(src))
          missing.push(`${file.replace(root + "/", "")} redefines SectionSchema`)
      }
    }

    // And the types Sites does use must be the builder's own.
    const types = read("lib/sites/types.ts")
    if (!/from "@\/lib\/website-builder\/types"/.test(types))
      missing.push("lib/sites/types does not import the builder's section types")

    if (missing.length) console.log("        " + missing.join("\n        "))
    return missing.length === 0
  })(),
)

check(
  "the schema-driven section library is still the editable-metadata system",
  (() => {
    const missing: string[] = []
    // The brief asks for "a constrained metadata system that tells the editor
    // what can be visually edited". It exists: one JSON schema per section.
    const manifest = join(root, "themes/default/manifest.json")
    const sections = join(root, "themes/default/sections")
    if (!existsSync(manifest)) missing.push("themes/default/manifest.json is gone")
    if (!existsSync(sections)) missing.push("themes/default/sections is gone")
    else if (readdirSync(sections).filter((f) => f.endsWith(".json")).length < 40)
      missing.push("the section schema set has shrunk — something is being replaced rather than reused")

    const assembler = read("lib/website-builder/section-schemas.ts")
    if (!/themes\/default\/manifest\.json/.test(assembler))
      missing.push("the schema assembler no longer reads the manifest")

    if (missing.length) console.log("        " + missing.join("\n        "))
    return missing.length === 0
  })(),
)

// ---------------------------------------------------------------------------
section("The migration is additive, because three live surfaces read these tables")
// ---------------------------------------------------------------------------

check(
  "no renames, no drops, and the storefront's guarantees survive",
  (() => {
    const raw = read("supabase/migrations/20260908_storelib_sites.sql")
    /**
     * Comments stripped first. The header of that file says "no renames, no
     * drops" — and the first version of this guard failed on its own
     * explanation, which is a rule that cannot tell a mention from a use.
     */
    const sql = raw.replace(/^\s*--.*$/gm, "")
    const missing: string[] = []

    // DROP INDEX is allowed and used once, deliberately — see below. Anything
    // that removes DATA is not.
    for (const forbidden of [/DROP TABLE/i, /DROP COLUMN/i, /RENAME/i, /DELETE FROM/i, /TRUNCATE/i]) {
      if (forbidden.test(sql)) missing.push(`the migration contains ${forbidden.source}`)
    }

    /**
     * `kind` is the whole safety mechanism: every row that exists today is a
     * storefront and keeps behaving as one. Without the default, existing rows
     * become NULL and every query that filters on kind silently drops them.
     */
    if (!/kind TEXT NOT NULL DEFAULT 'storefront'/.test(sql))
      missing.push("existing installs no longer default to kind='storefront'")

    /**
     * The one dropped index. `uniq_sti_creator_published` allows one published
     * install per creator, which is right for a storefront and wrong for
     * Sites. It must be REPLACED, not merely removed — dropping it without the
     * narrower one back would let a creator publish two storefronts, and the
     * public route takes the first by sort_order, so their live page would
     * change without them touching anything.
     */
    if (!/DROP INDEX IF EXISTS uniq_sti_creator_published/.test(sql))
      missing.push("the creator-wide published index is no longer narrowed")
    if (!/uniq_sti_creator_published_storefront[\s\S]{0,200}status = 'published' AND kind = 'storefront'/.test(sql))
      missing.push("the replacement index does not restore one-published-storefront-per-creator")

    // A page is only reachable if something knows which one is the front door.
    if (!/is_homepage BOOLEAN NOT NULL DEFAULT false/.test(sql))
      missing.push("pages have no homepage flag")
    if (!/UPDATE store_theme_pages SET is_homepage = true WHERE page_key = 'home'/.test(sql))
      missing.push("existing home pages are not backfilled as the homepage")
    if (!/uniq_stp_install_homepage/.test(sql)) missing.push("a site may have two homepages")

    // Every new table is owner-scoped through the same join the existing
    // store_theme_* tables use. A public read here is a way to read drafts.
    for (const table of ["site_versions", "site_form_submissions", "site_integrations", "site_template_purchases"]) {
      if (!new RegExp(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`).test(sql))
        missing.push(`${table} has no row-level security`)
    }
    if (/USING \(true\)/.test(sql)) missing.push("something in the migration is world-readable")

    /**
     * Template purchases have a SELECT policy and no INSERT policy, and that
     * omission is load-bearing: a client that can insert its own purchase row
     * owns every paid template for free.
     */
    if (/site_template_purchases[\s\S]{0,400}FOR INSERT/.test(sql))
      missing.push("a client can write its own template purchase")

    if (missing.length) console.log("        " + missing.join("\n        "))
    return missing.length === 0
  })(),
)

// ---------------------------------------------------------------------------
section("A site slug becomes a hostname, so it obeys hostname rules")
// ---------------------------------------------------------------------------

check(
  "slugs are DNS-legal, and the reserved list is the one usernames already use",
  (() => {
    const missing: string[] = []

    // What a human types, turned into something that can be a hostname.
    const conversions: Array<[string, string]> = [
      ["Café Münchén Studio", "cafe-munchen-studio"],
      ["Andrew's  Agency!!", "andrew-s-agency"],
      ["hello---", "hello"],
      ["  Spaced  Out  ", "spaced-out"],
    ]
    for (const [input, want] of conversions) {
      const got = toSiteSlug(input)
      if (got !== want) missing.push(`"${input}" becomes "${got}", expected "${want}"`)
    }

    for (const bad of ["ab", "-abc", "abc-", "Abc", "a_b", "a b", "x".repeat(64), ""]) {
      if (siteSlugError(bad) === null) missing.push(`"${bad}" was accepted as a subdomain`)
    }

    /**
     * `xn--` is the punycode prefix. A slug starting with it renders as an
     * internationalised domain in some address bars, which is a way to look
     * like a name you are not.
     */
    if (siteSlugError("xn--evil") === null) missing.push("a punycode-prefixed slug was accepted")

    /**
     * A subdomain called `www`, `api`, `admin` or `mail` is not a cosmetic
     * problem — it is a routing collision, and `mail` can receive somebody's
     * email. The list already exists for usernames; Sites reuses it rather
     * than starting a second one that will fall behind.
     */
    const slugSrc = read("lib/sites/slug.ts")
    if (!/from "@\/lib\/reserved-words"/.test(slugSrc))
      missing.push("site slugs no longer use the shared reserved-word list")
    for (const reserved of ["www", "admin", "sitemap", "robots"]) {
      if (siteSlugError(reserved) === null) missing.push(`"${reserved}" was accepted as a subdomain`)
    }

    for (const good of ["abc", "my-agency", "a1b2c3", "andrew-rullz"]) {
      if (siteSlugError(good) !== null) missing.push(`"${good}" was refused: ${siteSlugError(good)}`)
    }

    // Page slugs are path segments: freer than a hostname, still bounded.
    if (pageSlugError("about") !== null) missing.push("a normal page slug was refused")
    if (pageSlugError("") === null) missing.push("an empty page slug was accepted")
    if (pageSlugError("About Us") === null) missing.push("a page slug with a space was accepted")

    if (missing.length) console.log("        " + missing.join("\n        "))
    return missing.length === 0
  })(),
)

// ---------------------------------------------------------------------------
section("Plan limits are written once")
// ---------------------------------------------------------------------------

check(
  "the gates answer with a sentence, and the plan tiers match billing's",
  (() => {
    const missing: string[] = []

    // Free is the floor and Pro is the ceiling; anything else is a mistake
    // somebody will only notice when a paying customer is refused.
    if (siteLimits("free").maxSites !== 1) missing.push("the Free plan no longer includes exactly one site")
    if (!siteLimits("pro").customDomain) missing.push("Pro cannot connect a domain")
    if (siteLimits("free").customDomain) missing.push("Free can connect a domain")
    if (siteLimits("free").customCode) missing.push("Free can inject custom code")
    if (siteLimits("free").shopify) missing.push("Free can connect Shopify")
    if (siteLimits("pro").maxSites <= siteLimits("free").maxSites)
      missing.push("Pro does not allow more sites than Free")

    // The gates return the reason, not a boolean, so five components cannot
    // write five slightly different upgrade prompts.
    if (siteGate("free", "customDomain") === null) missing.push("Free is not gated on custom domains")
    if (siteGate("pro", "customDomain") !== null) missing.push("Pro is gated on custom domains")
    if (siteCountGate("free", 1) === null) missing.push("Free may create a second site")
    if (siteCountGate("free", 0) !== null) missing.push("Free may not create its first site")
    if (sitePageGate("free", siteLimits("free").maxPages) === null)
      missing.push("the page limit is not enforced")

    /**
     * The tier names must be the ones billing already resolves. A fourth name
     * here means a customer on a real plan falls through to Free limits.
     */
    const billing = read("lib/billing/fee-calculator.ts")
    for (const tier of ["free", "growth", "pro"] as const) {
      if (!new RegExp(`${tier}:`).test(billing)) missing.push(`billing does not know the "${tier}" tier`)
      if (!siteLimits(tier)) missing.push(`Sites has no limits for the "${tier}" tier`)
    }

    if (missing.length) console.log("        " + missing.join("\n        "))
    return missing.length === 0
  })(),
)

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failed:")
  for (const f of failures) console.log(`  · ${f}`)
  process.exit(1)
}
