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
section("Sites is a code project, and the website builder is not involved")
// ---------------------------------------------------------------------------

check(
  "files are the source of truth — no second section model",
  (() => {
    /**
     * THIS REPLACED AN EARLIER DESIGN. Sites was first proposed as an
     * extension of the website builder's section-JSON engine; the brief that
     * followed ruled that out in as many words — "the website's REAL CODE is
     * the source of truth", "do NOT create a second giant visual-builder JSON
     * architecture" — so the data model is files.
     *
     * The failure mode this guards is the one that makes visual builders rot:
     * two representations of what a page says, and whichever one the user did
     * not just edit becoming silently stale. There is one, and it is the
     * files.
     */
    const missing: string[] = []
    const types = read("lib/sites/types.ts")

    if (/SectionInstance|SectionSchema|website-builder/.test(types))
      missing.push("Sites types reach into the website builder again — they are different products")
    if (!/ProjectFiles/.test(types)) missing.push("a project is no longer a set of files")

    // The starter is a real Vite project, so Export and GitHub sync have
    // something a developer can run without a translation step.
    const starter = read("lib/sites/starter.ts")
    for (const path of ["package.json", "vite.config.ts", "index.html", "src/main.tsx", "src/App.tsx"]) {
      if (!starter.includes(`"${path}"`)) missing.push(`the starter has no ${path}`)
    }

    /**
     * THE DEPENDENCY SET IS FIXED. The editor bundles in the browser with
     * esbuild-wasm — no install step, no container, no cost per keystroke —
     * and that only works while the imports are ones we pre-bundle. A starter
     * that quietly grows a dependency is a starter that cannot be previewed.
     */
    const pkg = starter.slice(starter.indexOf('"package.json"'), starter.indexOf('"vite.config.ts"'))
    for (const dep of ["react", "react-dom"]) {
      if (!pkg.includes(dep)) missing.push(`the starter no longer depends on ${dep}`)
    }
    if (/tailwind|styled-components|@emotion|framer-motion/.test(pkg))
      missing.push("the starter grew a dependency the in-browser bundler cannot resolve")

    if (missing.length) console.log("        " + missing.join("\n        "))
    return missing.length === 0
  })(),
)

check(
  "a project cannot be created broken, and the plan gate is not only in the UI",
  (() => {
    /**
     * A site row with no files is not a site — it renders an empty editor and
     * confuses whoever opens it next. There is no transaction across the two
     * inserts, so the compensation is explicit and must stay.
     *
     * And the count gate lives in createSite rather than the route, so it
     * applies to every caller: this route, a future agent action, an import.
     * A check written in a route handler is a check the next entry point
     * forgets — which is exactly how the sales badge ended up with two flags.
     */
    const projects = read("lib/sites/projects.ts")
    const api = read("app/api/sites/route.ts")
    const missing: string[] = []

    if (!/if \(filesError\)/.test(projects) || !/from\("sites"\)\.delete\(\)/.test(projects))
      missing.push("a failed file insert can leave a site row with no project")
    if (!/siteCountGate\(plan, count \?\? 0\)/.test(projects))
      missing.push("the plan gate is no longer enforced where sites are created")
    if (/siteCountGate/.test(api))
      missing.push("the route re-implements the gate instead of relying on createSite")

    /**
     * The slug is claimed at creation, not at publish. It is the address, and
     * people say it out loud long before they publish — discovering at the
     * last step that it is taken is the worst possible moment.
     */
    if (!/availableSlug/.test(projects)) missing.push("a site no longer gets an address until publish")

    // Only the admin client can read another creator's rows; this module must
    // never reach for it, or RLS stops being the access control.
    if (/createAdminClient/.test(projects))
      missing.push("the project layer uses the admin client — RLS is no longer what protects a project")

    if (missing.length) console.log("        " + missing.join("\n        "))
    return missing.length === 0
  })(),
)

check(
  "Storelib AI is reachable from the dashboard",
  (() => {
    const sidebar = read("components/app/sidebar.tsx")
    const missing: string[] = []
    if (!/href: "\/app\/sites", label: "Storelib AI"/.test(sidebar))
      missing.push("Storelib AI is not in the left-hand nav")
    // And findable by search, which is how half the dashboard is navigated.
    if ((sidebar.match(/Storelib AI/g) || []).length < 3)
      missing.push("Storelib AI is missing from the search lists")
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

// ---------------------------------------------------------------------------
section("A project's tables are tenant-scoped, and nothing is world-readable")
// ---------------------------------------------------------------------------

check(
  "every site table is reachable only through its owner",
  (() => {
    /**
     * A project holds a creator's unreleased work. A public read on
     * `site_files` is a way to read everybody's drafts by guessing an id, and
     * the shape that prevents it is the one every store_theme_* table already
     * uses: reach the row through its site, the site through creators,
     * creators through auth.uid().
     *
     * Published sites are served from built static output, by a route that
     * filters to published — not by opening these tables up.
     */
    const sql = read("supabase/migrations/20260910_sites_projects.sql").replace(/^\s*--.*$/gm, "")
    const missing: string[] = []

    const tables = [
      "site_files", "site_versions", "site_deployments", "site_assets",
      "site_integrations", "site_forms", "site_form_submissions",
      "site_collections", "site_collection_items",
    ]
    /**
     * Scoped to the RLS loop's own array, not the whole file. Checking the
     * file found `site_files` in the updated_at trigger list and reported it
     * as protected while its policy was gone — a break-test caught that, and
     * it is the difference between asserting a table is guarded and asserting
     * its name appears somewhere.
     */
    const rlsArray = sql.slice(sql.indexOf("FOREACH t IN ARRAY ARRAY["), sql.indexOf("]", sql.indexOf("FOREACH t IN ARRAY ARRAY[")))
    for (const t of tables) {
      if (!new RegExp(`CREATE TABLE IF NOT EXISTS ${t}\\b`).test(sql)) missing.push(`${t} is missing`)
      if (!rlsArray.includes(`'${t}'`)) missing.push(`${t} is not in the RLS loop`)
    }
    if (!/ALTER TABLE sites ENABLE ROW LEVEL SECURITY/.test(sql)) missing.push("sites has no row-level security")
    if (/USING \(true\)/.test(sql)) missing.push("something is world-readable")

    /**
     * ONE ROW PER FILE, keyed by path. read_file and write_file are then
     * single-row operations rather than fetch-blob / mutate / write-blob —
     * which is also what stops two concurrent edits clobbering each other.
     */
    if (!/UNIQUE \(site_id, path\)/.test(sql)) missing.push("files are no longer addressable by path")

    /**
     * THE AI NEVER WRITES SQL. "Create a real estate site where I can add
     * properties" becomes a collection with a JSONB schema, not CREATE TABLE.
     * If these two tables ever go, the pressure to hand the agent DDL comes
     * straight back.
     */
    if (!/site_collections/.test(sql) || !/site_collection_items/.test(sql))
      missing.push("collections are gone — custom data would need the AI to write SQL")

    // Domains are the existing system with a pointer, not a second one.
    if (!/ALTER TABLE custom_domains/.test(sql))
      missing.push("Sites has its own domain system instead of reusing custom_domains")

    if (missing.length) console.log("        " + missing.join("\n        "))
    return missing.length === 0
  })(),
)

check(
  "the editor's code never ships to a visitor's site",
  (() => {
    /**
     * The brief calls this out and it is real: the editor is a large client
     * bundle — Monaco, the bundler, the chat — and a published site is static
     * output. One import of an editor component from a public route ships all
     * of it to every visitor of every site.
     *
     * Enforced structurally rather than by care: public routes live under
     * app/(marketing), the editor under app/sites and components/sites.
     */
    const missing: string[] = []
    const publicDirs = ["app/(marketing)"]
    const walk = (d: string): string[] => {
      const full = join(root, d)
      if (!existsSync(full)) return []
      return readdirSync(full, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(d, e.name)) : d + "/" + e.name,
      )
    }
    for (const dir of publicDirs) {
      for (const file of walk(dir)) {
        if (!/\.tsx?$/.test(file)) continue
        const src = readFileSync(join(root, file), "utf8")
        if (/from "@\/components\/sites\//.test(src))
          missing.push(`${file} imports the Sites editor into a public route`)
        if (/monaco|esbuild-wasm/.test(src))
          missing.push(`${file} pulls the editor toolchain into a public route`)
      }
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
