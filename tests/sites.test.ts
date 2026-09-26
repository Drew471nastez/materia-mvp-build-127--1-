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
import { entryPoint, reachableFiles, resolveSpecifier, unavailableDependencies } from "@/lib/sites/module-graph"
import { filePathError, projectError } from "@/lib/sites/file-path"
import { bodyFromHtml, previewDocument, previewPayload, previewShell } from "@/lib/sites/preview-document"
import { MODEL_RATES, chooseModel, costOf, rateFor, DEFAULT_MODEL, STRONG_MODEL } from "@/lib/sites/agent/models"
import { ZERO_USAGE, addUsage } from "@/lib/sites/agent/types"
import { blankProject } from "@/lib/sites/starter"
import { allocateSiteSlug, SLUG_FALLBACK } from "@/lib/sites/slug"
import { contentTypeFor } from "@/lib/sites/content-type"
import { createZip } from "@/lib/sites/zip"
import { scanForSecrets } from "@/lib/sites/preflight"
import {
  DEFAULT_THEME,
  emptyDocument,
  isSiteDocument,
  type PropSpec,
  type PropValue,
  type SiteDocument,
} from "@/lib/sites/document/schema"
import { isGenerated, renderDocument } from "@/lib/sites/document/render"
import { SECTIONS, sectionSpec } from "@/lib/sites/document/sections"
import {
  type AgentQuestion,
  answerNote,
  MAX_ASKS_PER_RUN,
  parseQuestion,
} from "@/lib/sites/agent/questions"
import { classifyComplexity } from "@/lib/sites/agent/complexity"
import {
  type CompletionState,
  MAX_REFUSALS,
  MIN_PAGES,
  MIN_SECTIONS,
  refuseToFinish,
} from "@/lib/sites/agent/plan"
import { formatRenderFailure, renderCheck } from "@/lib/sites/render-check"
import {
  addSection,
  duplicateSection,
  moveSection,
  removeSection,
  updateSectionProps,
  updateTheme,
} from "@/lib/sites/document/operations"
import { buildRepoMap, describeRepoMap, findUsages } from "@/lib/sites/agent/repo-map"
import { describeProject } from "@/lib/sites/agent/context"

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
    // The detail is what turns "FAIL: the graph runs both ways" into something
    // fixable without adding a print statement and running it again.
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`)
  }
}
function section(title: string) {
  console.log(`\n${title}`)
}

const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")

/**
 * Source with its comments removed.
 *
 * Guards here have matched their own explanations four separate times. A file
 * that documents what it must not do reads, to a regex, exactly like a file
 * doing it.
 */
const strip = (src: string) => src.replace(/^\s*(\/\/|\*|\/\*).*$/gm, "")

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
  "the AI code builder is out of the menu but still there",
  (() => {
    /**
     * THIS ASSERTED THE OPPOSITE, and it was right until the decision changed.
     *
     * The AI moved into the theme editor, where it edits the sections somebody
     * is already looking at. Two menu entries for "build my website with AI",
     * each leading somewhere different, is a choice nobody can make correctly
     * on their first visit — so the older door is closed.
     *
     * Closed, not bricked up. Everything under /app/sites still works and
     * still answers: the projects, the transcripts, the versions, the
     * published sites. Deleting the routes would have taken somebody's work
     * with them, and that is not what "take it out of the menu" means. This
     * asserts BOTH halves, because either one alone is a different decision.
     */
    const sidebar = read("components/app/sidebar.tsx")
    const missing: string[] = []

    if (/href: "\/app\/sites"/.test(sidebar) || /href="\/app\/sites"/.test(sidebar))
      missing.push("the code builder is still linked from the dashboard nav")

    if (!existsSync(join(root, "app/app/sites/page.tsx")))
      missing.push("the code builder's route was deleted, not hidden")

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

    /**
     * site_versions, site_form_submissions and site_integrations USED to be
     * created here, keyed off `install_id`. 20260910_sites_projects creates
     * the same three names keyed off `site_id`, and CREATE TABLE IF NOT EXISTS
     * skips rather than reconciles — so a database that ran this file first
     * got the wrong three tables and 20260910 then died on a missing
     * `site_id`. They belong to exactly one migration now, and this asserts it
     * is not this one. (tests/sql-aggregate.test.ts checks the other half.)
     */
    for (const table of ["site_versions", "site_form_submissions", "site_integrations"]) {
      if (new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`).test(sql))
        missing.push(`${table} is created here as well as in 20260910`)
    }

    // What this migration does still own is owner-scoped through the same
    // join every store_theme_* table uses.
    if (!/ALTER TABLE site_template_purchases ENABLE ROW LEVEL SECURITY/.test(sql))
      missing.push("site_template_purchases has no row-level security")
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
    if (siteLimits("free").maxSites !== 2) missing.push("the Free plan no longer includes exactly two sites")
    if (!siteLimits("pro").customDomain) missing.push("Pro cannot connect a domain")
    if (siteLimits("free").customDomain) missing.push("Free can connect a domain")
    if (siteLimits("free").customCode) missing.push("Free can inject custom code")
    if (siteLimits("free").shopify) missing.push("Free can connect Shopify")
    if (siteLimits("pro").maxSites <= siteLimits("free").maxSites)
      missing.push("Pro does not allow more sites than Free")

    /**
     * THE AI EDIT LADDER HAS TO KEEP CLIMBING.
     *
     * Free was raised from 20 to 200, which is what Growth used to offer — and
     * for a moment the two were identical. A paid tier whose headline feature
     * gives exactly what the free one does is not a tier, and nothing here
     * would have said so: every other assertion in this block is about
     * booleans and site counts.
     *
     * Written as a comparison rather than against literals, so the numbers can
     * be tuned without touching this.
     */
    if (siteLimits("growth").aiEditsPerMonth <= siteLimits("free").aiEditsPerMonth)
      missing.push("Growth offers no more AI edits than Free")
    if (siteLimits("pro").aiEditsPerMonth <= siteLimits("growth").aiEditsPerMonth)
      missing.push("Pro offers no more AI edits than Growth")

    /**
     * And the floor is high enough to finish a site. An "AI edit" now means a
     * whole first generation — four pages, fourteen sections — and a creator
     * iterates a dozen times before it looks like theirs. Twenty ran out
     * mid-build, which is the worst place for a quota to stop somebody.
     */
    if (siteLimits("free").aiEditsPerMonth < 200)
      missing.push("Free has too few AI edits to finish a site")

    // The gates return the reason, not a boolean, so five components cannot
    // write five slightly different upgrade prompts.
    if (siteGate("free", "customDomain") === null) missing.push("Free is not gated on custom domains")
    if (siteGate("pro", "customDomain") !== null) missing.push("Pro is gated on custom domains")
    // Gated AT the limit, allowed below it — written against the limit
    // rather than a literal, so raising it does not need three edits.
    const freeMax = siteLimits("free").maxSites
    if (siteCountGate("free", freeMax) === null) missing.push("Free may exceed its site limit")
    if (siteCountGate("free", freeMax - 1) !== null)
      missing.push("Free may not create a site while under its limit")
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
    /**
     * Anchored past the RLS heading, not on the file's FIRST FOREACH. The
     * legacy-cleanup block at the top of that migration is also a
     * `FOREACH t IN ARRAY ARRAY[...]`, over the three tables it drops — so an
     * unanchored slice read the DROP list and reported six protected tables as
     * unprotected. Which is the correct answer to the wrong question.
     */
    const rlsAt = sql.indexOf("ALTER TABLE sites ENABLE ROW LEVEL SECURITY")
    const loopAt = sql.indexOf("FOREACH t IN ARRAY ARRAY[", rlsAt)
    const rlsArray = rlsAt === -1 || loopAt === -1 ? "" : sql.slice(loopAt, sql.indexOf("]", loopAt))
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

// ---------------------------------------------------------------------------
section("The bundler resolves imports the way a Vite project expects")
// ---------------------------------------------------------------------------

const project = blankProject("Test Site")

check(
  "the entry point comes from index.html",
  entryPoint(project) === "src/main.tsx" &&
    entryPoint({ "src/main.tsx": "" }) === "src/main.tsx" &&
    entryPoint({ "package.json": "{}" }) === null,
)

check(
  "relative imports resolve, with and without an extension",
  (() => {
    const files = {
      "src/main.tsx": "",
      "src/App.tsx": "",
      "src/components/Hero.tsx": "",
      "src/lib/index.ts": "",
      "src/styles.css": "",
    }
    const cases: Array<[string, string, string | null]> = [
      ["./App", "src/main.tsx", "src/App.tsx"],
      ["./App.tsx", "src/main.tsx", "src/App.tsx"],
      ["./components/Hero", "src/App.tsx", "src/components/Hero.tsx"],
      ["../App", "src/components/Hero.tsx", "src/App.tsx"],
      ["./lib", "src/main.tsx", "src/lib/index.ts"],
      ["/src/App", "src/components/Hero.tsx", "src/App.tsx"],
      ["./styles.css", "src/main.tsx", "src/styles.css"],
      // An explicit extension is taken at its word.
      ["./styles.css", "src/App.tsx", "src/styles.css"],
      ["./nope", "src/main.tsx", null],
      ["react", "src/main.tsx", null],
    ]
    return cases.every(([spec, from, want]) => resolveSpecifier(spec, from, files) === want)
  })(),
)

/**
 * ===========================================================================
 *  THE STARTER PROJECT MUST BUILD
 * ===========================================================================
 *
 * It did not. A project is a real Vite project on disk — which means it
 * contains `vite.config.ts`, which imports `vite` and `@vitejs/plugin-react`.
 * The unavailable-dependency check scanned EVERY file, so the starter reported
 * two missing packages and refused to build before the author had typed
 * anything.
 *
 * Config files are not part of the bundle. The check follows the module graph
 * from the entry point instead, and this is the regression test for it —
 * caught by running the editor in a browser, not by reading it.
 */
check(
  "the starter project has no unavailable dependencies",
  unavailableDependencies(project).length === 0,
)

check(
  "vite.config.ts is not reachable from the entry point",
  (() => {
    const reached = reachableFiles(project)
    return (
      !reached.includes("vite.config.ts") &&
      !reached.includes("package.json") &&
      reached.includes("src/App.tsx") &&
      reached.includes("src/components/Hero.tsx") &&
      reached.includes("src/styles.css")
    )
  })(),
)

check(
  "a package the preview cannot supply is still reported",
  (() => {
    const withRouter = { ...project, "src/App.tsx": 'import { Link } from "react-router-dom"\nexport default function App() { return null }' }
    return unavailableDependencies(withRouter).join() === "react-router-dom"
  })(),
)

// ---------------------------------------------------------------------------
section("A path in a project is checked in one place")
// ---------------------------------------------------------------------------

check(
  "traversal, absolute paths and separators are refused",
  (() => {
    const refused = [
      "../secrets.ts",
      "src/../../etc/passwd.ts",
      "/etc/passwd.ts",
      "src\\App.tsx",
      "https://example.com/x.ts",
      "src//App.tsx",
      "src/ App.tsx",
      "",
    ]
    return refused.every((p) => filePathError(p) !== null)
  })(),
)

check(
  "ordinary project paths are allowed",
  ["src/App.tsx", "index.html", "src/styles.css", "package.json", "src/components/Hero.tsx"].every(
    (p) => filePathError(p) === null,
  ),
)

check(
  "an extension outside the list is refused",
  filePathError("run.sh") !== null && filePathError("Dockerfile") !== null && filePathError("x.wasm") !== null,
)

check(
  "the whole starter passes as a project",
  projectError(project) === null && projectError({}) !== null,
)

// ---------------------------------------------------------------------------
section("The preview frame is the security boundary")
// ---------------------------------------------------------------------------

/**
 * `allow-scripts` together with `allow-same-origin` is the documented way to
 * give framed code the embedder's origin — with both, code the AI wrote could
 * read the editor's Supabase session out of storage and act as the signed-in
 * creator. This is the check that stops the pair ever appearing together, in
 * the component or in anything that renders a preview.
 */
check(
  "no preview iframe is allow-same-origin",
  (() => {
    // Comments stripped: both files EXPLAIN why allow-same-origin is absent,
    // and a rule that reads its own explanation as a violation is not a rule.
    const suspects = ["components/sites/editor/preview-pane.tsx", "lib/sites/preview-document.ts"]
    return suspects.every((f) => !read(f).replace(/^\s*(\/\/|\*|\/\*).*$/gm, "").includes("allow-same-origin"))
  })(),
)

check(
  "the preview frame is sandboxed at all",
  /sandbox="allow-scripts"/.test(read("components/sites/editor/preview-pane.tsx")),
)

/**
 * The frame is on an opaque origin, so `event.origin` is the string "null" and
 * proves nothing about the sender. `event.source` is a window reference only
 * this frame has, and comparing it is the actual check.
 */
check(
  "messages from the frame are authenticated by source, not by origin string",
  (() => {
    const pane = read("components/sites/editor/preview-pane.tsx")
    return /event\.source !== .*contentWindow/.test(pane) && !/event\.origin ===/.test(pane)
  })(),
)

/**
 * An opaque origin also makes the frame's imports of OUR OWN React a
 * cross-origin fetch, which Chrome blocks with no ACAO header — a preview that
 * builds perfectly and renders nothing. The header is the fix; relaxing the
 * sandbox would have been the other one.
 */
check(
  "the preview's React is served with the CORS header a null origin needs",
  (() => {
    const config = read("next.config.mjs")
    const at = config.indexOf("/sites/vendor/:path*")
    return at !== -1 && config.slice(at, at + 400).includes("Access-Control-Allow-Origin")
  })(),
)

check(
  "the import map points at our own origin, not a CDN",
  (() => {
    const doc = read("lib/sites/preview-document.ts").replace(/^\s*\*.*$/gm, "")
    return !/esm\.sh|unpkg|jsdelivr|cdnjs/.test(doc) && doc.includes('"/sites/vendor/react.js"')
  })(),
)

check(
  "the bundler and the code editor are self-hosted too",
  (() => {
    const worker = read("components/sites/editor/bundler.worker.ts")
    const pane = read("components/sites/editor/code-pane.tsx")
    return (
      worker.includes('wasmURL: "/sites/esbuild.wasm"') &&
      pane.includes('paths: { vs: "/sites/monaco/vs" }') &&
      !/unpkg|jsdelivr/.test(worker + pane)
    )
  })(),
)

/**
 * `new Worker(new URL("./x.worker.ts", import.meta.url))` is the documented
 * pattern; it compiles and then throws "Failed to construct 'URL': Invalid URL"
 * in the browser, because import.meta.url is empty in the production client
 * chunk. The worker is compiled to a static file instead.
 */
check(
  "the worker is loaded from a static path, not import.meta.url",
  (() => {
    const hook = read("components/sites/editor/use-bundler.ts").replace(/^\s*(\/\/|\*|\/\*).*$/gm, "")
    return hook.includes('new Worker("/sites/bundler-worker.js")') && !/new URL\(.*import\.meta\.url/.test(hook)
  })(),
)

check(
  "the preview document drops the project's own script tags",
  (() => {
    const body = bodyFromHtml('<html><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>')
    return body.includes('id="root"') && !body.includes("<script")
  })(),
)

check(
  "and it still renders a root when index.html is missing",
  bodyFromHtml(undefined).includes('id="root"'),
)

check(
  "errors are forwarded out of the frame, or a broken site is a white rectangle",
  (() => {
    const doc = previewDocument({ code: "", html: undefined })
    return doc.includes("storelib-preview") && doc.includes("unhandledrejection")
  })(),
)

// ---------------------------------------------------------------------------
section("Saving cannot lose an edit, and cannot write someone else's site")
// ---------------------------------------------------------------------------

check(
  "ownership is proved inside the write, not before it",
  (() => {
    /**
     * This used to be an ORDERING check — prove ownership with one query, then
     * upsert with another. That shape is gone: both now happen inside
     * `site_commit_files`, in one transaction, under an advisory lock.
     *
     * The proof is SECURITY INVOKER plus a plain SELECT on `sites`: RLS makes
     * that return no row for a site the caller does not own, and the function
     * returns NULL — the same answer a stale revision gets, so nothing about
     * the response tells a stranger whether the site exists.
     */
    const migration = read("supabase/migrations/20260912_site_publishing.sql")
    const fn = migration.slice(migration.indexOf("CREATE OR REPLACE FUNCTION site_commit_files"))
    const projects = read("lib/sites/projects.ts")
    return (
      /SECURITY INVOKER/.test(fn) &&
      /SELECT revision INTO v_current FROM sites WHERE id = p_site_id/.test(fn) &&
      /IF v_current IS NULL THEN RETURN NULL/.test(fn) &&
      /**
       * And nothing bypasses it — with ONE allowed exception, which the guard
       * names rather than waves through: `createSite` writes the starter
       * files directly. That write has nothing to race with (the site was
       * created microseconds earlier, by the same call, and no other client
       * knows its id yet) and no revision to compare against. Every write
       * after that one goes through the function.
       */
      (projects.match(/from\("site_files"\)[\s\S]{0,120}(upsert|insert|update)/g) ?? []).length === 1 &&
      projects
        .slice(projects.indexOf("export async function createSite"))
        .includes('from("site_files").insert')
    )
  })(),
)

check(
  "a failed save puts the changes back to be retried",
  (() => {
    const shell = read("components/sites/editor/editor-shell.tsx")
    // Cleared before the request so an edit made during it lands in the next
    // save; re-added on failure so a file never looks saved when it is not.
    const save = shell.slice(shell.indexOf("const save = React.useCallback"))
    return (
      save.indexOf("dirtyPaths.current.clear()") < save.indexOf("await fetch") &&
      (save.match(/dirtyPaths\.current\.add\(path\)/g) ?? []).length >= 2
    )
  })(),
)

check(
  "a superseded build cannot overwrite a newer preview",
  read("components/sites/editor/use-bundler.ts").includes("result.id !== latestId.current"),
)

// ---------------------------------------------------------------------------
section("The editor is a tool, and it says what it cannot do yet")
// ---------------------------------------------------------------------------

const shell = read("components/sites/editor/editor-shell.tsx")
const chat = read("components/sites/editor/chat-pane.tsx")

/**
 * The dark class is on the shell's own root, not on <html>. Reaching for the
 * document would make opening the editor change the theme of every other tab
 * and every page behind it — and leave it changed on the way out.
 */
check(
  "the editor is dark on its own, without touching the app's theme",
  shell.includes('"dark flex h-dvh') && !/documentElement\.classList/.test(shell),
)

/**
 * ===========================================================================
 *  THE COMPOSER SENDS, AND AN UNCONFIGURED DEPLOYMENT SAYS SO
 * ===========================================================================
 *
 * It used to be a greyed arrow, and the first question anyone asked about this
 * editor was why the send button did nothing. It works now — but the same
 * failure is one missing environment variable away, so the route answers a
 * missing key with 503 and a sentence, and the pane renders that sentence
 * rather than a spinner that never resolves.
 */
check(
  "the composer sends when idle and stops when running",
  (() => {
    /**
     * The busy state is no longer a disabled send button — it is a Stop
     * button. The loop always took an AbortSignal and nothing ever gave it
     * one, so a run that went wrong could only be waited out: up to twelve
     * turns of a model doing the wrong thing, billed.
     */
    const sends = /onClick=\{\(\) => void send\(draft\)\}/.test(chat)
    const stops = /onClick=\{stop\}/.test(chat) && /abortRef\.current\?\.abort\(\)/.test(chat)
    const wired = /signal: controller\.signal/.test(chat)
    // Disabled only when there is nothing to send — never unconditionally.
    const conditional = /disabled=\{draft\.trim\(\)\.length === 0\}/.test(chat)
    return sends && stops && wired && conditional
  })(),
)

/**
 * A stop is the person deciding, not a fault. Reporting "lost the connection"
 * when they pressed the button blames the network for something they did on
 * purpose — and implies their work might be in an unknown state, when in fact
 * the agent writes once at the end, so a stopped run has written nothing.
 */
check(
  "stopping says it was stopped, and that nothing changed",
  /thrown instanceof DOMException && thrown\.name === "AbortError"/.test(chat) &&
    /Stopped\. Nothing was changed\./.test(chat),
)

check(
  "history is reachable after a reload, not only from the run that made it",
  (() => {
    const panel = read("components/sites/editor/history-panel.tsx")
    const versions = read("app/api/sites/[siteId]/versions/route.ts")
    return (
      /\/api\/sites\/\$\{siteId\}\/versions/.test(panel) &&
      /\/restore/.test(panel) &&
      // The list must not carry the snapshots — a version is a whole project
      // and a busy site has fifty of them.
      /select\("id, label, created_at"\)/.test(versions) &&
      // Comments stripped — the file explains that snapshots are withheld,
      // and an unstripped check reads its own explanation as the thing it
      // forbids. Sixth time this pattern has bitten in this suite.
      !/snapshot/.test(strip(versions))
    )
  })(),
)

/**
 * The zip is written by hand — ~70 lines of the plainest STORED format there
 * is, rather than a dependency for something that has not changed since 1993.
 * Hand-rolled binary needs RUNNING, not asserting: these are the properties a
 * real unzip cared about when this was checked against one.
 */
{
  const project = {
    "index.html": "<!doctype html><html></html>",
    "src/App.tsx": "export default function App() { return <h1>Héllo — ünicode ✅</h1> }\n",
    "src/styles.css": ":root { --bg: #fff }\n",
  }
  const zip = createZip(project)

  check(
    "the archive has the signatures a zip reader looks for",
    (() => {
      const local = zip[0] === 0x50 && zip[1] === 0x4b && zip[2] === 0x03 && zip[3] === 0x04
      // End-of-central-directory, the last 22 bytes when there is no comment.
      const endAt = zip.length - 22
      const end =
        zip[endAt] === 0x50 && zip[endAt + 1] === 0x4b && zip[endAt + 2] === 0x05 && zip[endAt + 3] === 0x06
      return local && end
    })(),
  )

  check(
    "it declares exactly the files it was given",
    (() => {
      const endAt = zip.length - 22
      const count = zip[endAt + 10] | (zip[endAt + 11] << 8)
      return count === 3
    })(),
  )

  check(
    "nested paths and unicode survive the round trip",
    (() => {
      const text = new TextDecoder().decode(zip)
      return (
        text.includes("src/App.tsx") &&
        text.includes("src/styles.css") &&
        // Stored, not deflated, so the content is literally in there.
        text.includes("Héllo — ünicode ✅")
      )
    })(),
  )

  check(
    "the same project always produces the same bytes",
    (() => {
      const again = createZip(project)
      if (again.length !== zip.length) return false
      for (let i = 0; i < zip.length; i++) if (zip[i] !== again[i]) return false
      return true
    })(),
  )
}

check(
  "the project can be downloaded as a real Vite project",
  (() => {
    const route = read("app/api/sites/[siteId]/export/route.ts")
    const zip = read("lib/sites/zip.ts")
    return (
      /application\/zip/.test(route) &&
      // Slugified and quoted, so a site called `"; rm -rf /` cannot break out
      // of the header.
      /filename="\$\{name\}\.zip"/.test(route) &&
      /toSiteSlug\(site\.name\)/.test(route) &&
      /export function createZip/.test(zip)
    )
  })(),
)

check(
  "a deployment with no model key says so instead of failing",
  (() => {
    const route = read("app/api/sites/[siteId]/agent/route.ts")
    // 503, not 500: nothing is broken, it is not configured.
    return /status: 503/.test(route) && /no model key is set/.test(route) && /event\.message/.test(chat)
  })(),
)

check(
  "the pane shows the steps, so a long run is not an unexplained spinner",
  /TOOL_LABELS/.test(chat) && /Working…/.test(chat),
)

check(
  "the cookie banner cannot cover the editor's bottom bar",
  (() => {
    const banner = read("components/cookie-consent-banner.tsx")
    return /pathname\?\.startsWith\("\/sites\/"\)/.test(banner) && /!inSitesEditor/.test(banner)
  })(),
)

check(
  "the mark is our own file, not a hotlinked storage URL",
  (() => {
    /**
     * Scoped to the image's own src. The shell now legitimately builds the
     * published site's https:// address, and a blanket "no https anywhere in
     * this file" rule reads that as a hotlinked asset.
     */
    const src = shell.match(/<img\s+src="([^"]+)"/)?.[1]
    return src === "/storelib-mark.svg" && existsSync(join(root, "public/storelib-mark.svg"))
  })(),
)

/**
 * Below md there is no honest way to show a 360px chat beside a 320px preview,
 * so the panes go full-screen and a bottom bar switches between them. The
 * guard is that the switcher exists AND is hidden once the columns fit —
 * two bars at once is the failure this replaced.
 */
check(
  "mobile gets one pane at a time, and the switcher disappears when it is not needed",
  (() => {
    const nav = shell.slice(shell.indexOf('aria-label="Editor panes"') - 400)
    return (
      shell.includes('aria-label="Editor panes"') &&
      /md:hidden/.test(nav) &&
      ["chat", "preview", "code"].every((pane) => nav.includes(`"${pane}"`))
    )
  })(),
)

check(
  "the preview frame stays white — it is the site, not the chrome",
  read("components/sites/editor/preview-pane.tsx").includes("bg-white"),
)

/**
 * A flat list of full paths cannot fit a phone: `truncate` cut
 * "src/components/Hero.tsx" to "src/component…", removing the only part that
 * identifies the file. `dir="rtl"` fixed the ellipsis and flipped the whole
 * row. A tree does not have the problem — the directory is said once.
 */
check(
  "the file tree groups by directory instead of truncating paths",
  (() => {
    // Comments stripped — the file explains why dir="rtl" was wrong, and a
    // guard that reads its own explanation as a violation is not a guard.
    const pane = read("components/sites/editor/code-pane.tsx").replace(/^\s*(\/\/|\*|\/\*).*$/gm, "")
    return /function groupByDirectory/.test(pane) && !/dir="rtl"/.test(pane)
  })(),
)

// ---------------------------------------------------------------------------
section("The agent is a provider behind an interface, and the key never leaves the server")
// ---------------------------------------------------------------------------

/**
 * ===========================================================================
 *  THE KEY IS KEPT OUT BY A BUILD FAILURE, NOT BY REMEMBERING
 * ===========================================================================
 *
 * `OPENAI_API_KEY` is read in exactly one module, and that module imports
 * `server-only` — so a client component pulling it in fails the build rather
 * than shipping the key to every visitor in a JavaScript bundle. Every module
 * that can touch the key must carry that import; this is the check that says
 * so.
 */
check(
  "every module that can reach the key is server-only",
  (() => {
    const guarded = [
      "lib/sites/agent/openai-provider.ts",
      "lib/sites/agent/run.ts",
      "lib/sites/agent/tools.ts",
    ]
    return guarded.every((f) => read(f).startsWith('import "server-only"'))
  })(),
)

check(
  "the key is read in one place, and no client component imports it",
  (() => {
    const readers = ["lib/sites/agent/openai-provider.ts", "app/api/sites/[siteId]/agent/route.ts"]
    // The route only checks whether it is SET, to give a 503 instead of a 500.
    const provider = read("lib/sites/agent/openai-provider.ts")
    if (!provider.includes("process.env.OPENAI_API_KEY")) return false

    const clientFiles = readdirSync(join(root, "components/sites/editor"))
      .filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"))
      .map((f) => read(join("components/sites/editor", f)))
    const leaks = clientFiles.some(
      (src) => /OPENAI_API_KEY/.test(src) || /openai-provider/.test(src) || /agent\/run/.test(src),
    )
    return !leaks && readers.length === 2
  })(),
)

check(
  "the agent's key is not a NEXT_PUBLIC_ variable anywhere",
  (() => {
    const suspects = [
      "lib/sites/agent/openai-provider.ts",
      "lib/sites/agent/run.ts",
      "app/api/sites/[siteId]/agent/route.ts",
      "components/sites/editor/chat-pane.tsx",
    ]
    return suspects.every((f) => !/NEXT_PUBLIC_[A-Z_]*(OPENAI|API_KEY)/.test(read(f)))
  })(),
)

/**
 * The whole point of the provider layer. If the loop, the tools or the route
 * name a vendor, then "swap the provider" is a search-and-replace through the
 * feature rather than one new file — which is what this repository was asked
 * to avoid on the day the provider changed before a single request was sent.
 */
check(
  "the loop and the tools name no vendor",
  (() => {
    // Comments stripped: these files EXPLAIN the abstraction, and naming the
    // launch model in a doc comment is useful. What must not name a vendor is
    // the code.
    const vendorless = ["lib/sites/agent/run.ts", "lib/sites/agent/tools.ts", "lib/sites/agent/types.ts"]
    return vendorless.every(
      (f) => !/openai|OpenAI|anthropic|Anthropic|gpt-|claude-/.test(strip(read(f))),
    )
  })(),
)

// ---------------------------------------------------------------------------
section("Cost is computed from what the provider reported, not estimated")
// ---------------------------------------------------------------------------

check(
  "both launch models are priced",
  rateFor("gpt-5.6-luna") !== null && rateFor("gpt-5.6-terra") !== null,
)

check(
  "the cheap model is the default and the dear one is the escalation",
  (() => {
    const cheap = MODEL_RATES[DEFAULT_MODEL]
    const strong = MODEL_RATES[STRONG_MODEL]
    return Boolean(cheap && strong) && cheap.inputPerMTok < strong.inputPerMTok
  })(),
)

check(
  "cost arithmetic, including the cache discount",
  (() => {
    // 1M input of which 500k cached and 100k cache-written, 100k output.
    // luna: uncached 400k x $0.20 = $0.08
    //       cached   500k x $0.20 x 0.1  = $0.01
    //       written  100k x $0.20 x 1.25 = $0.025
    //       output   100k x $1.20 = $0.12
    //                                    = $0.235
    const cost = costOf("gpt-5.6-luna", {
      inputTokens: 1_000_000,
      cachedInputTokens: 500_000,
      cacheWriteTokens: 100_000,
      outputTokens: 100_000,
    })
    return cost.priced && Math.abs(cost.usd - 0.235) < 1e-6
  })(),
)

/**
 * An unknown model must read as UNPRICED, not as free. A zero that means
 * "nobody has priced this" and a zero that means "this was free" are the same
 * number, and only one of them should let a run be recorded silently.
 */
check(
  "an unpriced model says so instead of reporting zero",
  (() => {
    const cost = costOf("some-model-nobody-priced", { ...ZERO_USAGE, inputTokens: 1_000_000 })
    return cost.usd === 0 && cost.priced === false
  })(),
)

check(
  "a realistic edit on the default model costs about a cent",
  (() => {
    // ~38k input (30k of it cached), ~3k output — the shape measured earlier.
    const cost = costOf(DEFAULT_MODEL, {
      inputTokens: 38_000,
      cachedInputTokens: 30_000,
      cacheWriteTokens: 0,
      outputTokens: 3_000,
    })
    return cost.usd > 0 && cost.usd < 0.02
  })(),
)

check(
  "usage adds up across the turns of one run",
  (() => {
    const total = addUsage(
      { inputTokens: 100, cachedInputTokens: 10, cacheWriteTokens: 5, outputTokens: 20 },
      { inputTokens: 200, cachedInputTokens: 20, cacheWriteTokens: 0, outputTokens: 30 },
    )
    return (
      total.inputTokens === 300 &&
      total.cachedInputTokens === 30 &&
      total.cacheWriteTokens === 5 &&
      total.outputTokens === 50
    )
  })(),
)

/**
 * Escalation is decided from the REQUEST. A model that can ask to be promoted
 * to the ten-times-dearer tier eventually will, and the bill is the user's.
 */
check(
  "the expensive model is chosen by the request, never by the model",
  (() => {
    const short = chooseModel("make the hero bolder", 8)
    const long = chooseModel("x".repeat(700), 8)
    const big = chooseModel("tweak it", 40)
    const runFile = read("lib/sites/agent/run.ts")
    return (
      short === DEFAULT_MODEL &&
      long === STRONG_MODEL &&
      big === STRONG_MODEL &&
      // The loop picks once, before the first request, and never re-picks.
      (runFile.match(/chooseModel\(/g) ?? []).length === 1
    )
  })(),
)

// ---------------------------------------------------------------------------
section("A run cannot spend money silently, break a site, or exceed a plan")
// ---------------------------------------------------------------------------

const runSource = read("lib/sites/agent/run.ts")

/**
 * The DECISIONS moved to lib/sites/agent/loop.ts and are covered by
 * tests/agent-loop.test.ts, which RUNS them — the turn cap, the build gate,
 * refusals and token accumulation are all driven with a scripted provider and
 * a real esbuild rather than pattern-matched here. Two of those checks caught
 * real bugs the moment they existed: a turn counter that reported 13 against a
 * cap of 12, and a live conversation array handed to the provider and then
 * mutated under it.
 *
 * What stays here is the ORDER of the things around the loop, because that
 * order is what cannot be observed from the loop's own result.
 */
check(
  "the quota is checked before the first token is spent",
  (() => {
    const quota = runSource.indexOf("monthlyQuotaError(creatorId, plan)")
    const loop = runSource.indexOf("agentLoop({")
    return quota !== -1 && loop !== -1 && quota < loop
  })(),
)

check(
  "the snapshot is taken before anything is edited",
  (() => {
    const snap = runSource.indexOf("await snapshot(")
    const loop = runSource.indexOf("agentLoop({")
    const save = runSource.indexOf("await saveFiles(")
    return snap !== -1 && snap < loop && snap < save
  })(),
)

/**
 * The loop's verdict is what decides. Anything other than an exact
 * `status === "succeeded"` — a truthy check, a "not failed" — would save the
 * output of a refused run or a capped one.
 */
check(
  "only a succeeded run is saved",
  (() => {
    const gate = runSource.indexOf('if (status === "succeeded") {')
    const save = runSource.indexOf("await saveFiles(")
    return gate !== -1 && save !== -1 && gate < save
  })(),
)

/**
 * A run that cost money and left no row is a bill nobody can explain. The
 * record is written after the loop returns, on every path out of it.
 */
check(
  "the run is recorded whatever the outcome",
  (() => {
    const record = runSource.indexOf('.from("site_agent_runs")\n    .update(')
    const errorExit = runSource.indexOf('if (status === "failed") {')
    // The failure exit comes AFTER the record, so a failed run is written too.
    return record !== -1 && errorExit !== -1 && record < errorExit
  })(),
)

check(
  "a refusal is a status the database will accept",
  read("supabase/migrations/20260911_site_agent_runs.sql").includes("'refused'"),
)

/**
 * Snapshots without a restore are a promise nobody can collect on. "The AI
 * broke my site" needs a button, not a row in a table.
 */
check(
  "a snapshot can actually be restored, through the same rules as an edit",
  (() => {
    const restore = runSource.slice(runSource.indexOf("export async function restoreVersion"))
    return (
      restore.length > 0 &&
      // The USER's client, so RLS proves ownership — the admin client would
      // happily restore somebody else's version.
      restore.includes("await createClient()") &&
      !restore.includes("createAdminClient()") &&
      restore.includes("saveFiles(siteId, files)")
    )
  })(),
)

// ---------------------------------------------------------------------------
section("The tools are the boundary")
// ---------------------------------------------------------------------------

const toolSource = read("lib/sites/agent/tools.ts")

check(
  "the tool list is exactly the closed set, with nothing that reaches outside",
  (() => {
    const names = [...toolSource.matchAll(/^\s{4}name: "([a-z_]+)",$/gm)].map((m) => m[1])
    /**
     * `update_manifest` is the only addition to this set, and it earns its
     * place by NOT being like the others: it touches no file, opens no
     * connection and runs nothing. It writes a few strings into a field on the
     * workspace, which the caller persists after a successful run. The
     * boundary this test guards — the agent cannot reach outside the project —
     * is unchanged by it.
     */
    /**
     * Five tools were added for the agent loop upgrade, and each earns its
     * place the same way `update_manifest` does — by not reaching outside the
     * project. `search_code` and `find_usages` read the in-memory workspace,
     * `replace_in_file` edits it through the same path rule every other writer
     * uses, and the two plan tools touch nothing but a list of strings.
     */
    const expected = [
      "list_files", "read_file", "write_file", "create_file",
      "delete_file", "update_manifest", "search_code", "find_usages",
      "replace_in_file", "set_plan", "complete_step", "run_build",
      "read_build_errors",
      /**
       * `ask_creator` earns its place the same way `update_manifest` does: it
       * touches no file, opens no connection and runs nothing. It parses a few
       * strings onto the workspace, which the loop turns into an event. The
       * boundary this test guards — the agent cannot reach outside the project
       * — is unchanged by it.
       */
      "ask_creator",
    ]
    const forbidden = ["run_sql", "install_package", "fetch_url", "exec", "bash", "http_request"]

    // and the recording tool really is inert: no filesystem, no network
    const at = toolSource.indexOf('case "update_manifest"')
    const handler = toolSource.slice(at, toolSource.indexOf("case \"list_files\"", at))
    const reachesOut = /fetch\(|require\(|import\(|this\.files\[|createClient/.test(handler)

    return (
      names.join() === expected.join() &&
      forbidden.every((f) => !new RegExp(`name: "${f}"`).test(toolSource)) &&
      !reachesOut
    )
  })(),
)

check(
  "every path the agent touches goes through the same rule a human edit does",
  (() => {
    // filePathError is the traversal / extension / control-character check —
    // the agent is exactly the caller that will one day propose ../../secrets.
    const writers = ["read_file", "write_file", "create_file"]
    return (
      toolSource.includes('from "../file-path"') &&
      writers.every((tool) => {
        const at = toolSource.indexOf(`case "${tool}":`)
        return at !== -1 && toolSource.slice(at, at + 400).includes("filePathError(path)")
      })
    )
  })(),
)

check(
  "the agent writes through saveFiles, not straight to the table",
  (() => {
    /**
     * The agent's EDITS go through saveFiles — that is what keeps them under
     * the same validation, the same lock and the same revision check a human
     * edit gets.
     *
     * One deliberate exception, named rather than waved through: restore
     * deletes the files the snapshot does not contain. A restore that only
     * writes is not a restore — files the agent created would survive it,
     * still imported by whatever referenced them, so "undo" would hand back a
     * project that is neither the old one nor the new one. There is no
     * `saveFiles` shape for "make these paths not exist".
     */
    const edits = runSource.slice(0, runSource.indexOf("export async function restoreVersion"))
    const restore = runSource.slice(runSource.indexOf("export async function restoreVersion"))
    const directWrites = restore.match(/from\("site_files"\)\s*\.(insert|update|upsert|delete)/g) ?? []
    return (
      /**
       * `custom` rather than `changed`: a site with a document has its
       * generated files written by writeDocument, FROM the document, so
       * writing them here as well would make the file save the thing that
       * defines the site — the exact split the document layer removes.
       */
      runSource.includes("saveFiles(siteId, custom)") &&
      runSource.includes("writeDocument(siteId, workspace.document)") &&
      // Nothing in the edit path touches the table.
      !/from\("site_files"\)/.test(edits) &&
      !/from\("site_files"\)/.test(toolSource) &&
      // And the restore's only direct write is the delete.
      directWrites.length === 1 &&
      directWrites[0].includes("delete") &&
      restore.includes("saveFiles(siteId, files)")
    )
  })(),
)

check(
  "a tool failure is a result the model can read, not an exception",
  (() => {
    // No `throw` anywhere in the executor: a thrown tool ends the run, while a
    // sentence ("that file does not exist, here are the ones that do") gets
    // the next call right.
    const executor = toolSource.slice(toolSource.indexOf("async execute("))
    return !/\bthrow\b/.test(executor) && /does not exist\. The project holds/.test(executor)
  })(),
)

/**
 * The agent's build verdict has to be the preview's verdict. Two bundlers
 * means the agent can report green for a page the creator sees broken, which
 * is worse than not checking at all.
 */
check(
  "the agent and the preview share one bundler",
  (() => {
    const worker = read("components/sites/editor/bundler.worker.ts")
    return (
      worker.includes("bundleProject") &&
      toolSource.includes("bundleProject") &&
      // The worker no longer carries its own copy of the build call.
      !/esbuild\.build\(/.test(worker)
    )
  })(),
)

// ---------------------------------------------------------------------------
section("Creating a site with a brief actually builds one")
// ---------------------------------------------------------------------------

/**
 * The New Site flow has always taken a brief and stored it on
 * `settings.brief`, where nothing read it. "Describe your site" that produces
 * an empty starter is the feature not existing.
 */
check(
  "the brief is carried into the editor, not just stored",
  (() => {
    const flow = read("components/sites/new-site-flow.tsx")
    const page = read("app/sites/[siteId]/page.tsx")
    const shell = read("components/sites/editor/editor-shell.tsx")
    return (
      /brief=\$\{encodeURIComponent\(brief\)\}/.test(flow) &&
      /searchParams: Promise<\{ brief\?: string \}>/.test(page) &&
      /openingBrief=\{brief\}/.test(page) &&
      shell.includes("openingBrief")
    )
  })(),
)

/**
 * Generation deliberately does NOT happen inside the create request. It takes
 * a minute, and a POST that hangs for a minute times out on a phone with a
 * site half-made and no way back to it.
 */
check(
  "the create request does not block on generation",
  (() => {
    const route = read("app/api/sites/route.ts")
    return !/agentLoop|runAgent|openAIProvider/.test(route)
  })(),
)

/**
 * React runs effects twice in development Strict Mode. Without the guard, the
 * second run starts a second generation: two full runs against the model, two
 * bills, and two sets of edits racing into the same files.
 */
check(
  "the opening brief cannot be sent twice",
  (() => {
    const chat = read("components/sites/editor/chat-pane.tsx")
    return /briefSent = React\.useRef\(false\)/.test(chat) && /if \(briefSent\.current \|\|/.test(chat)
  })(),
)

// ---------------------------------------------------------------------------
section("An edit can be taken back")
// ---------------------------------------------------------------------------

check(
  "the snapshot id reaches the client on the FIRST event, not the last",
  (() => {
    const types = read("lib/sites/agent/types.ts")
    const runFile = read("lib/sites/agent/run.ts")
    // On `started`, so a run that half-succeeds — the one somebody most wants
    // to take back — can still be undone.
    return (
      /\{ type: "started"; runId: string; versionId: string \| null; model: string \}/.test(types) &&
      runFile.includes('yield { type: "started", runId, versionId, model }')
    )
  })(),
)

check(
  "restoring goes through the same validation and RLS as an edit",
  (() => {
    const route = read("app/api/sites/[siteId]/restore/route.ts")
    const runFile = read("lib/sites/agent/run.ts")
    const restore = runFile.slice(runFile.indexOf("export async function restoreVersion"))
    return (
      route.includes("restoreVersion(siteId, versionId)") &&
      restore.includes("saveFiles(siteId, files)") &&
      // The USER's client — the admin one would restore anybody's version.
      !restore.includes("createAdminClient()")
    )
  })(),
)

check(
  "an empty or missing snapshot is refused rather than wiping the site",
  (() => {
    const runFile = read("lib/sites/agent/run.ts")
    const restore = runFile.slice(runFile.indexOf("export async function restoreVersion"))
    return /Object\.keys\(files\)\.length === 0/.test(restore) && /cannot be restored/.test(restore)
  })(),
)

// ---------------------------------------------------------------------------
section("The two bundlers are one bundler")
// ---------------------------------------------------------------------------

/**
 * ===========================================================================
 *  esbuild-wasm ON THE SERVER WOULD HAVE FAILED EVERY RUN
 * ===========================================================================
 *
 * The obvious choice — the same package the browser worker uses — does not
 * instantiate the wasm itself under Node. It SPAWNS A CHILD PROCESS that loads
 * `esbuild.wasm` from its own package directory, and Next does not trace that
 * file into the serverless bundle: four esbuild files were traced into the
 * agent route and the .wasm was not one of them. Every run_build would have
 * thrown ENOENT, the loop would have caught it, and every single agent run
 * would have ended in "The edit failed."
 *
 * Native esbuild on the server, esbuild-wasm in the browser. Same Go program
 * compiled two ways, same options from lib/sites/bundle.ts — but only if the
 * VERSIONS match, which nothing else would notice going out of step.
 */
check(
  "the server and browser esbuilds are pinned to the same exact version",
  (() => {
    const pkg = JSON.parse(read("package.json"))
    const native = pkg.dependencies?.esbuild
    const wasm = pkg.dependencies?.["esbuild-wasm"]
    if (!native || !wasm) return false
    // Exact pins, not ranges: a caret on either one lets them drift apart on
    // some future install, and a bundler disagreeing with itself is a build
    // the agent calls green and the preview shows red.
    return /^\d+\.\d+\.\d+$/.test(native) && native === wasm.replace(/^[\^~]/, "") && !/^[\^~]/.test(native)
  })(),
)

check(
  "the agent route uses native esbuild, and the worker uses the wasm one",
  (() => {
    const route = strip(read("app/api/sites/[siteId]/agent/route.ts"))
    const worker = strip(read("components/sites/editor/bundler.worker.ts"))
    return (
      /await import\("esbuild"\)/.test(route) &&
      !/esbuild-wasm/.test(route) &&
      /from "esbuild-wasm"/.test(worker)
    )
  })(),
)

/**
 * `esbuild` ships a per-platform native binary. Bundling it breaks the binary
 * lookup at runtime — which, like the wasm above, is a failure that only
 * appears once it is deployed.
 */
check(
  "esbuild is left external so its native binary is found",
  /serverExternalPackages:[^\]]*'esbuild'/.test(read("next.config.mjs")),
)

/**
 * The loop test must exercise the engine PRODUCTION uses. Testing against the
 * wasm build while the server runs the native one is how a difference between
 * them goes unnoticed for exactly as long as it takes a user to find it.
 */
check(
  "the loop test runs the same esbuild the server does",
  /^import \* as esbuild from "esbuild"$/m.test(read("tests/agent-loop.test.ts")),
)

// ---------------------------------------------------------------------------
section("A site's address is its name, and nobody else's")
// ---------------------------------------------------------------------------

check(
  "a free name becomes the address unchanged",
  (await allocateSiteSlug("Portfolio Website", async () => false)) === "portfolio-website",
)

/**
 * Two creators both call their site "Portfolio Website", because that is what
 * it is. The address has to differ and the second one should still be
 * something a person can say out loud — `-2`, not a hash.
 */
check(
  "a taken name gets a number a person can read",
  (await allocateSiteSlug("Portfolio Website", async (s) => s === "portfolio-website")) ===
    "portfolio-website-2",
)

check(
  "numbers are exhausted in order before anything random",
  (await allocateSiteSlug("Shop", async (s) => s === "shop" || /^shop-[2-5]$/.test(s))) === "shop-6",
)

check(
  "once the numbers are gone it falls back to a random suffix",
  (() => {
    return true // asserted below with the real call
  })(),
)

{
  const slug = await allocateSiteSlug("Shop", async (s) => s === "shop" || /^shop-[2-9]$/.test(s))
  check(
    "and the random suffix is still a legal, readable address",
    /^shop-[a-z2-9]{4}$/.test(slug),
  )
}

check(
  "a name that cannot make a slug at all still gets an address",
  /^site(-[a-z0-9]+)?$/.test(await allocateSiteSlug("!!!", async () => false)) &&
    SLUG_FALLBACK === "site",
)

check(
  "a very long name plus a suffix stays inside the 63-character limit",
  (await allocateSiteSlug("a".repeat(200), async (s) => s === "a".repeat(63))).length <= 63,
)

/**
 * Twelve random four-character collisions is a broken `isTaken`, not a full
 * namespace. Falling back to something longer would hide that; throwing
 * surfaces it while the site is still unpublished.
 */
check(
  "an isTaken that always says yes throws instead of looping",
  await allocateSiteSlug("Shop", async () => true).then(
    () => false,
    () => true,
  ),
)

// ---------------------------------------------------------------------------
section("Publishing is static, atomic, and on a domain of its own")
// ---------------------------------------------------------------------------

const publishSource = read("lib/sites/publish.ts")
const siteRoute = read("app/(sites)/site/[slug]/[[...path]]/route.ts")

/**
 * ===========================================================================
 *  NOT storelib.com — TWICE OVER
 * ===========================================================================
 *
 * `app/(marketing)/[sellername]` catches every root path, so storelib.com/x is
 * already somebody's storefront. Creator pages keep the paths and AI-built
 * sites take the SUBDOMAINS — andrewrullz.storelib.com — so the two address
 * spaces never overlap.
 *
 * The apex is not a sites host and must never become one: generated
 * JavaScript on storelib.com itself would be same-origin with the dashboard.
 */
check(
  "published sites are served from a subdomain, never the apex",
  (() => {
    const host = strip(publishSource).match(/NEXT_PUBLIC_SITES_HOST \|\| "([^"]+)"/)?.[1]
    return (
      Boolean(host) &&
      /export function publishedHost\(slug: string\): string \{\s*return `\$\{slug\}\.\$\{SITES_HOST\}`/.test(
        strip(publishSource),
      )
    )
  })(),
)

check(
  "the proxy resolves a site subdomain before it touches the session",
  (() => {
    const proxy = strip(read("proxy.ts"))
    const sitesBlock = proxy.indexOf("bareHost.endsWith(`.${SITES_DOMAIN}`)")
    const session = proxy.indexOf("createServerClient(")
    // Ahead of the Supabase client, so a stranger reading a static page never
    // costs a session lookup and the dashboard's cookie handling never runs
    // on a request from a host that serves generated code.
    return sitesBlock > -1 && session > -1 && sitesBlock < session
  })(),
)

/**
 * The pointer moves LAST. A build that fails, an upload that dies halfway, a
 * crash — none of them can touch the page that is already serving.
 */
check(
  "nothing goes live until every file is uploaded",
  (() => {
    /**
     * Scoped to publishSite's own body. Checking the whole file used text
     * order as a proxy for execution order, and that proxy broke the moment
     * `ensureVendorAssets` — which also uploads, but uploads the shared React
     * runtime, not the site — was added above it. The guard then reported the
     * upload happening before the build check, which was true of the file and
     * false of the code that runs.
     */
    const whole = strip(publishSource)
    const src = whole.slice(whole.indexOf("export async function publishSite"))
    const upload = src.indexOf(".upload(")
    const goLive = src.indexOf("is_live: true")
    const buildCheck = src.indexOf("built.ok === false")
    // Every anchor must EXIST. indexOf returns -1 when it does not, and
    // `-1 < upload` is true — an ordering check that passes because the thing
    // being ordered is gone is worse than no check.
    return (
      buildCheck !== -1 &&
      upload !== -1 &&
      goLive !== -1 &&
      buildCheck < upload &&
      upload < goLive
    )
  })(),
)

check(
  "the database refuses two live deployments even if this code races",
  (() => {
    const migration = read("supabase/migrations/20260912_site_publishing.sql")
    // The index name is anchored to a newline. Without that,
    // `uniq_site_deployments_live` also matches
    // `uniq_site_deployments_live_slug` — a different index enforcing a
    // different thing — so deleting this one changed nothing.
    return /CREATE UNIQUE INDEX IF NOT EXISTS uniq_site_deployments_live\n\s+ON site_deployments \(site_id\) WHERE is_live;/.test(
      migration,
    )
  })(),
)

check(
  "a failed build publishes nothing and says why",
  /does not build, so nothing was published/.test(publishSource) &&
    /details: built\.errors/.test(publishSource),
)

check(
  "only the live deployment is ever served",
  (() => {
    const resolver = siteRoute.slice(siteRoute.indexOf("async function livePrefix"))
    return /\.eq\("is_live", true\)/.test(resolver)
  })(),
)

check(
  "published pages carry locked-down security headers",
  (() => {
    const csp = siteRoute.match(/"Content-Security-Policy": \[([\s\S]*?)\]\.join/)?.[1] ?? ""
    return (
      /default-src 'self'/.test(csp) &&
      /frame-ancestors 'none'/.test(csp) &&
      /X-Content-Type-Options/.test(siteRoute) &&
      /Referrer-Policy/.test(siteRoute)
    )
  })(),
)

check(
  "the HTML revalidates but the immutable assets do not",
  /s-maxage=60, stale-while-revalidate/.test(siteRoute) &&
    /max-age=31536000, immutable/.test(siteRoute),
)

check(
  "content types are declared, not sniffed",
  contentTypeFor("index.html").startsWith("text/html") &&
    contentTypeFor("app.js").startsWith("text/javascript") &&
    contentTypeFor("app.css").startsWith("text/css") &&
    contentTypeFor("weird.bin") === "application/octet-stream",
)

/**
 * The published bundle gets the site's public id and nothing else. No Supabase
 * key, no model key, no cookie — the id is what the Site API uses to know
 * which site a form submission belongs to, and it is public by design.
 */
check(
  "nothing privileged reaches the published bundle",
  (() => {
    const doc = strip(read("lib/sites/preview-document.ts"))
    const published = doc.slice(doc.indexOf("export function publishedDocument"))
    return (
      /__STORELIB_SITE_ID__/.test(published) &&
      !/SERVICE_ROLE|ANON_KEY|OPENAI|SUPABASE_URL/.test(published)
    )
  })(),
)

// ---------------------------------------------------------------------------
section("One writer per site")
// ---------------------------------------------------------------------------

/**
 * The editor autosaves every 1.2 seconds and an agent run writes its whole
 * changed set at the end. Before this, typing during a run meant one write
 * silently won — a creator watching their own edit vanish with no error.
 */
check(
  "every write goes through the locking commit function",
  (() => {
    const projects = read("lib/sites/projects.ts")
    const save = projects.slice(projects.indexOf("export async function saveFiles"))
    return (
      save.includes('supabase.rpc("site_commit_files"') &&
      // No raw upsert left anywhere in the save path.
      !/from\("site_files"\)[\s\S]{0,200}upsert/.test(save)
    )
  })(),
)

check(
  "the function serialises per site and compares revisions",
  (() => {
    const migration = read("supabase/migrations/20260912_site_publishing.sql")
    return (
      /pg_advisory_xact_lock\(hashtextextended\(p_site_id/.test(migration) &&
      /v_current <> p_expected_revision/.test(migration) &&
      /SECURITY INVOKER/.test(migration)
    )
  })(),
)

check(
  "a stale write is reported as a conflict, not swallowed",
  (() => {
    const projects = read("lib/sites/projects.ts")
    return /conflict: true/.test(projects) && /Reload to see the latest version/.test(projects)
  })(),
)

// ---------------------------------------------------------------------------
section("The conversation and the live state survive a reload")
// ---------------------------------------------------------------------------

const chatPane = read("components/sites/editor/chat-pane.tsx")

check(
  "the transcript is written server-side, never posted by the browser",
  (() => {
    const route = read("app/api/sites/[siteId]/chat/route.ts")
    // GET only. A client that can write its own transcript can write one that
    // never happened.
    return !/export async function POST/.test(route) && /completeExchange/.test(read("lib/sites/agent/run.ts"))
  })(),
)

check(
  "a failed run is still recorded, so the question does not vanish",
  (() => {
    const runFile = read("lib/sites/agent/run.ts")
    const append = runFile.indexOf("await completeExchange({")
    const failExit = runFile.indexOf('if (status === "failed") {', append)
    return append !== -1 && failExit > append
  })(),
)

/**
 * The brief lives in the URL, so a refresh or a shared link still carries it.
 * Without the history check, reopening a finished site would silently start
 * the whole generation again — against a project that was already built, and
 * bill for it.
 */
check(
  "reopening a built site does not regenerate it",
  /if \(loadingHistory\) return/.test(chatPane) && /if \(exchanges\.length > 0\) return/.test(chatPane),
)

check(
  "an edit marks the live site out of date",
  (() => {
    const shell = read("components/sites/editor/editor-shell.tsx")
    // Both edit paths — typed and agent-made — or the button lies about what
    // is online.
    return (markStaleCount(shell) >= 2 && /stale: true/.test(shell))
  })(),
)

function markStaleCount(src: string): number {
  return (src.match(/markStale\(\)/g) ?? []).length
}

check(
  "mobile gets a sheet with a real tap target, desktop gets the inline control",
  (() => {
    const sheet = read("components/sites/editor/site-sheet.tsx")
    const shell = read("components/sites/editor/editor-shell.tsx")
    return (
      /h-12 w-full/.test(sheet) &&
      /* The shared sheet (components/ui/bottom-sheet.tsx) keeps clear of the
         home indicator and is not drawn from 768px. */
      /<BottomSheet[\s\S]{0,200}hideFrom="md"/.test(sheet) &&
      /<span className="md:hidden">/.test(shell) &&
      /<span className="hidden md:block">/.test(shell)
    )
  })(),
)

check(
  "the dashboard shows the real published page, not a placeholder",
  (() => {
    const dashboard = read("components/sites/sites-dashboard.tsx")
    return (
      /publishedUrl\(site\.slug\)/.test(dashboard) &&
      /sandbox="allow-scripts"/.test(dashboard) &&
      // The card is a link; the frame must not swallow the click.
      /pointer-events-none/.test(dashboard) &&
      /Not published yet/.test(dashboard)
    )
  })(),
)

// ---------------------------------------------------------------------------
section("Five bugs that were shipped, and are not any more")
// ---------------------------------------------------------------------------

/**
 * 1. The domain separation was defeated by a URL.
 *
 * The proxy rewrites <slug>.storelib.com to /site/<slug>, and a rewrite is
 * invisible to the browser — but the path is not secret. Anyone could type
 * storelib.com/site/andrew and be served a generated page ON THE DASHBOARD
 * ORIGIN, where its JavaScript can read the signed-in session.
 *
 * `host === SITES_HOST` was the right guard when sites had their own domain
 * and is a hole now that SITES_HOST is storelib.com: it matches the apex.
 */
check(
  "a published site refuses to answer on the dashboard origin",
  (() => {
    const route = strip(read("app/(sites)/site/[slug]/[[...path]]/route.ts"))
    const guard = route.indexOf("const onSiteSubdomain")
    const firstRead = route.indexOf("await context.params")
    return (
      guard > -1 &&
      firstRead > -1 &&
      /host\.endsWith\(`\.\$\{SITES_HOST\}`\)/.test(route) &&
      // a single label: andrewrullz.storelib.com yes, storelib.com no
      /split\("\."\)\.length === 1/.test(route) &&
      !/host === SITES_HOST/.test(route) &&
      /if \(!onSiteSubdomain && !isLocal\) return notFound\(\)/.test(route) &&
      // Checked before the route does anything at all.
      guard < firstRead
    )
  })(),
)

/**
 * 2. The compare-and-swap nothing opted into.
 *
 * `site_commit_files` was built to reject a write built on a stale read, and
 * then every caller omitted the revision — so the lock serialised writes while
 * two clients still overwrote each other's content, which is the exact bug the
 * mechanism exists to prevent.
 */
check(
  "the editor holds a revision and sends it on every save",
  (() => {
    const shell = read("components/sites/editor/editor-shell.tsx")
    const page = read("app/sites/[siteId]/page.tsx")
    return (
      /initialRevision: number/.test(shell) &&
      /revision: revision\.current/.test(shell) &&
      // A ref, so the save reads the current value rather than the one
      // captured when its timer was scheduled.
      /const revision = React\.useRef\(initialRevision\)/.test(shell) &&
      /initialRevision=\{revisions\.revision\}/.test(page)
    )
  })(),
)

check(
  "the files route takes a revision in and hands the new one back",
  (() => {
    const route = read("app/api/sites/[siteId]/files/route.ts")
    return (
      /saveFiles\(siteId, files, expected\)/.test(route) &&
      /revision: result\.revision/.test(route) &&
      // GET returns them together, so a client never holds a revision from
      // before the files it holds.
      /Promise\.all\(\[readProject\(siteId\), siteRevision\(siteId\)\]\)/.test(route)
    )
  })(),
)

check(
  "a conflict is a 409, is never retried, and is visible",
  (() => {
    const route = read("app/api/sites/[siteId]/files/route.ts")
    const shell = read("components/sites/editor/editor-shell.tsx")
    return (
      /result\.conflict \? 409/.test(route) &&
      /setConflict\(true\)/.test(shell) &&
      // A silent "Not saved" would be the original bug wearing a different hat.
      /This site changed somewhere else/.test(shell)
    )
  })(),
)

/**
 * 3. Undo left the files it could not undo.
 *
 * The snapshot is what the project looked like BEFORE the run. Writing it back
 * without removing what the agent added leaves those files in place, still
 * imported by whatever referenced them — so "undo" returns a project that is
 * neither the old one nor the new one, and may not even build.
 */
check(
  "restore removes files the snapshot does not contain",
  (() => {
    const runFile = read("lib/sites/agent/run.ts")
    const restore = runFile.slice(runFile.indexOf("export async function restoreVersion"))
    const orphans = restore.indexOf("const orphans")
    const del = restore.indexOf('.delete()')
    const write = restore.indexOf("saveFiles(siteId, files)")
    return (
      orphans !== -1 &&
      /files\[path\] === undefined/.test(restore) &&
      // Deleted BEFORE the write, so the write lands on a matching tree.
      del !== -1 && del < write
    )
  })(),
)

/**
 * 4. The transcript kept the wrong end of itself.
 *
 * `ascending: true` with a limit keeps the OLDEST rows, so a busy site would
 * show its first few conversations forever and never the one from five
 * minutes ago. The comment above it claimed the opposite, which is how it
 * survived being written.
 */
check(
  "the chat loads the newest messages, in reading order",
  (() => {
    const chat = read("lib/sites/chat.ts")
    return /ascending: false/.test(chat) && /\.reverse\(\)/.test(chat)
  })(),
)

/**
 * 5. A monthly quota with no rate limit is a monthly quota that can be spent
 * in one minute. Audited as critical, then left open.
 */
check(
  "the expensive routes are rate limited before they spend anything",
  (() => {
    const agent = read("app/api/sites/[siteId]/agent/route.ts")
    const publish = read("app/api/sites/[siteId]/publish/route.ts")
    const agentLimit = agent.indexOf("await agentRateLimit(")
    const agentRun = agent.indexOf("runAgent({")
    const publishLimit = publish.indexOf("await publishRateLimit(")
    const publishRun = publish.indexOf("await publishSite(")
    return (
      agentLimit !== -1 && agentRun !== -1 && agentLimit < agentRun &&
      publishLimit !== -1 && publishRun !== -1 && publishLimit < publishRun &&
      /status: 429/.test(agent) && /status: 429/.test(publish)
    )
  })(),
)

check(
  "the limit is counted in the database, not in a process that scales out",
  (() => {
    const limiter = read("lib/sites/rate-limit.ts")
    return (
      /count: "exact", head: true/.test(limiter) &&
      /**
       * An in-process Map is worthless when ten concurrent invocations each
       * see an empty one.
       *
       * `[<(]` and not `\(`: the first version of this only matched
       * `new Map()` and waved `new Map<string, number>()` straight through —
       * which is how anybody would actually write it.
       */
      !/new (Map|Set|WeakMap)\s*[<(]|globalThis\./.test(strip(limiter))
    )
  })(),
)

check(
  "publishing is limited per site, editing per creator",
  (() => {
    const limiter = read("lib/sites/rate-limit.ts")
    return (
      /export async function publishRateLimit\(siteId: string\)/.test(limiter) &&
      /export async function agentRateLimit\(creatorId: string\)/.test(limiter) &&
      /countSince\("site_deployments", "site_id"/.test(limiter)
    )
  })(),
)

// ---------------------------------------------------------------------------
section("Publishing fails loudly, and says the thing that is actually wrong")
// ---------------------------------------------------------------------------

/**
 * A REAL FAILURE, NOT A HYPOTHETICAL. Publishing returned "Could not start the
 * publish. Try again." for a schema that was missing — advice that could never
 * work, on an error the code had in its hand and threw away. The Postgres
 * message was `column "slug" of relation "site_deployments" does not exist`,
 * which names both the cause and the fix.
 */
check(
  "publishSite runs a preflight BEFORE it builds anything",
  (() => {
    const src = strip(read("lib/sites/publish.ts"))
    if (!/export async function publishPreflight\(\)/.test(src)) return false

    const body = src.slice(src.indexOf("export async function publishSite"))
    const preflight = body.indexOf("publishPreflight(")
    const build = body.indexOf("buildStatic(")
    // indexOf returns -1, and -1 < anything is true — assert both are present
    // before comparing them, or this passes on a file missing both.
    return preflight > -1 && build > -1 && preflight < build
  })(),
)

check(
  "the preflight names each missing precondition separately",
  (() => {
    const src = strip(read("lib/sites/publish.ts"))
    const fn = src.slice(src.indexOf("export async function publishPreflight"), src.indexOf("export async function publishSite"))
    return (
      /site_deployments/.test(fn) &&
      /is_live, slug, storage_prefix, version_label/.test(fn) &&
      /revision, published_revision/.test(fn) &&
      /getBucket\(DEPLOYMENT_BUCKET\)/.test(fn) &&
      /RUN_CREATOR_PAGE_AND_SITES\.sql/.test(fn)
    )
  })(),
)

check(
  "the deployment-insert error is surfaced, never discarded",
  (() => {
    const src = strip(read("lib/sites/publish.ts"))
    // The old text promised a retry would help. It could not.
    if (/Could not start the publish\. Try again\./.test(src)) return false
    const after = src.slice(src.indexOf("const deploymentId"))
    const guard = after.slice(0, after.indexOf("}\n\n"))
    return /createError\?\.message/.test(guard) && /details:/.test(guard)
  })(),
)

check(
  "an upload failure reports which file failed",
  (() => {
    const src = strip(read("lib/sites/publish.ts"))
    return (
      /throw new Error\(`\$\{path\}: \$\{error\.message\}`\)/.test(src) &&
      !/Could not upload the site\. Try again\./.test(src)
    )
  })(),
)

check(
  "the publish route and button carry details through to the screen",
  (() => {
    const route = strip(read("app/api/sites/[siteId]/publish/route.ts"))
    const shell = strip(read("components/sites/editor/editor-shell.tsx"))
    const button = strip(read("components/sites/editor/publish-button.tsx"))
    return (
      /details: result\.details/.test(route) &&
      /details: body\.details/.test(shell) &&
      /state\.details/.test(button)
    )
  })(),
)

/**
 * THE ABORT THAT HID THE SCHEMA.
 *
 * RUN_CREATOR_PAGE_AND_SITES.sql is pasted into the Supabase SQL editor, which
 * STOPS AT THE FIRST ERROR. An ALTER against custom_domains — a table an older
 * migration owns — therefore took every later section down with it, publishing
 * included, and the only symptom was a publish button that failed.
 */
check(
  "every custom_domains ALTER is guarded by an existence check",
  (() => {
    const files = ["supabase/migrations/20260908_storelib_sites.sql", "supabase/migrations/20260910_sites_projects.sql"]
    return files.every((f) => {
      const sql = read(f).replace(/^\s*--.*$/gm, "")
      const alters = sql.match(/ALTER TABLE (public\.)?custom_domains/g) ?? []
      if (alters.length === 0) return false
      const guards = sql.match(/to_regclass\('public\.custom_domains'\) IS NULL/g) ?? []
      return guards.length >= alters.length
    })
  })(),
)

check(
  "the pasted aggregate carries the whole publishing schema",
  (() => {
    const sql = readFileSync(join(root, "supabase/sql/RUN_CREATOR_PAGE_AND_SITES.sql"), "utf8")
    return [
      "site-deployments",
      "version_label",
      "storage_prefix",
      "published_revision",
      "site_chat_messages",
      "site_commit_files",
      "uniq_site_deployments_live",
    ].every((token) => sql.includes(token))
  })(),
)

check(
  "the aggregate is generated, so it cannot drift from the migrations",
  (() => {
    const script = read("scripts/build-creator-page-sql.mjs")
    return /20260912_site_publishing/.test(script) && /RUN_CREATOR_PAGE_AND_SITES\.sql/.test(script)
  })(),
)

// ---------------------------------------------------------------------------
section("A site subdomain must not be able to read the session")
// ---------------------------------------------------------------------------

/**
 * THE INVARIANT THE WHOLE ARRANGEMENT RESTS ON.
 *
 * Sites are published at <slug>.storelib.com, and those pages carry
 * JavaScript written by a model from a creator's prompt. The Supabase session
 * cookie is readable from JavaScript by design — createBrowserClient reads it
 * to restore a session, so it cannot be httpOnly.
 *
 * Scope that cookie to `.storelib.com` and every published site can read
 * `document.cookie` and take the access and refresh tokens of every signed-in
 * visitor: an account takeover shippable through the site builder. It is
 * asserted here rather than remembered.
 */
check(
  "no session cookie is scoped to the whole domain",
  (() => {
    return ["lib/supabase/server.ts", "lib/supabase/client.ts", "proxy.ts"].every((f) => {
      const src = strip(read(f))
      return (
        !/domain:\s*(isLocalhost\s*\?[^,]*:\s*)?`\.\$\{(MAIN_DOMAIN|mainDomain)\}`/.test(src) &&
        !/domain:\s*"\.[a-z]/i.test(src) &&
        !/return\s*`\.\$\{(getMainDomain\(\)|mainDomain|MAIN_DOMAIN)\}`/.test(src)
      )
    })
  })(),
)

check(
  "both Supabase clients return an undefined cookie domain",
  (() => {
    const server = strip(read("lib/supabase/server.ts"))
    const client = strip(read("lib/supabase/client.ts"))
    return (
      /function getCookieDomain\([^)]*\): undefined \{\s*return undefined/.test(server) &&
      /function getCookieDomain\(\): undefined \{\s*return undefined/.test(client)
    )
  })(),
)

/**
 * A cookie merely stopped from being written is not gone. Sessions created
 * before the change still carry Domain=.storelib.com and stay readable by
 * every published site until something expires them.
 */
check(
  "legacy domain-scoped cookies are retired without logging anyone out",
  (() => {
    const proxy = strip(read("proxy.ts"))
    const at = proxy.indexOf("function retireDomainScopedCookies")
    if (at === -1) return false
    const body = proxy.slice(at, proxy.indexOf("\n}", at))
    // Located by what each line DOES, not by an exact attribute order — the
    // re-issue grew a Max-Age and this assertion should not have to care.
    const reissue = body.indexOf("${cookie.name}=${cookie.value}")
    const expire = body.indexOf("Max-Age=0")
    // The host-only re-issue must come FIRST: expiring on its own signs
    // people out of a session that was working a second earlier.
    return (
      reissue > -1 &&
      expire > -1 &&
      reissue < expire &&
      /headers\.append\(/.test(body) &&
      proxy.includes("retireDomainScopedCookies(supabaseResponse, request)")
    )
  })(),
)

/**
 * BOTH WAYS a creator page is addressed. storelib.com/<name> resolves by
 * profiles.username OR creators.slug, so checking one 404s the old subdomain
 * of every creator addressed by the other.
 */
check(
  "old creator subdomains redirect to the path instead of dying",
  (() => {
    const route = strip(read("app/(sites)/site/[slug]/[[...path]]/route.ts"))
    return (
      /async function creatorPathFor/.test(route) &&
      /from\("profiles"\)/.test(route) &&
      /from\("creators"\)/.test(route) &&
      /eq\("username", name\.toLowerCase\(\)\)/.test(route) &&
      /eq\("slug", name\.toLowerCase\(\)\)/.test(route) &&
      /NextResponse\.redirect\([^)]*301\)/.test(route)
    )
  })(),
)

check(
  "www is redirected to the apex, so only one host holds a session",
  (() => {
    const proxy = strip(read("proxy.ts"))
    const at = proxy.indexOf("bareHost === `www.${MAIN_DOMAIN}`")
    return at > -1 && /status: 301/.test(proxy.slice(at, at + 400))
  })(),
)

check(
  "reserved and multi-level subdomains are not sites",
  (() => {
    const proxy = strip(read("proxy.ts"))
    const at = proxy.indexOf("bareHost.endsWith(`.${SITES_DOMAIN}`)")
    if (at === -1) return false
    const block = proxy.slice(at, at + 700)
    return /!subdomain\.includes\("\."\)/.test(block) && /EXCLUDED_SUBDOMAINS\.includes\(subdomain\)/.test(block)
  })(),
)

/**
 * storelib.com/andrewrullz is a creator and andrewrullz.storelib.com is a
 * site, so one word names two different people's things. Without this a
 * stranger publishes on a creator's name by titling their site after them —
 * and shadows the redirect that keeps that creator's old links working.
 */
check(
  "a site cannot take a creator's username as its address",
  (() => {
    const src = strip(read("lib/sites/publish.ts"))
    const at = src.indexOf("async function ensureSlug")
    const body = src.slice(at, src.indexOf("\n}", at))
    return (
      /eq\("username", candidate\.toLowerCase\(\)\)/.test(body) &&
      // and creators.slug, the other way storelib.com/<name> resolves
      /eq\("slug", candidate\.toLowerCase\(\)\)/.test(body) &&
      /from\("creators"\)/.test(body)
    )
  })(),
)

/**
 * ONE function builds the address.
 *
 * The editor built it by hand as `https://${SITES_HOST}/${slug}` — the path
 * shape — and kept doing so after sites moved to subdomains, so the Publish
 * panel offered a link to a creator page that was not the site. A second
 * place that formats a URL is a second place to be wrong about what the URL
 * is.
 */
check(
  "nobody hand-builds a published address",
  (() => {
    const files = [
      "components/sites/editor/editor-shell.tsx",
      "components/sites/editor/publish-button.tsx",
      "components/sites/sites-dashboard.tsx",
    ]
    return files.every((f) => !/`https:\/\/\$\{SITES_HOST\}/.test(strip(read(f))))
  })(),
)

check(
  "nothing still points at the retired sites domain",
  (() => {
    return [
      "lib/sites/public-host.ts",
      "lib/sites/publish.ts",
      "lib/sites/slug.ts",
      "lib/sites/types.ts",
      "components/sites/sites-dashboard.tsx",
      "proxy.ts",
    ].every((f) => !read(f).includes("storelib.site"))
  })(),
)

/**
 * THE BLANK-PAGE BUG.
 *
 * Every published page's import map points at `/_vendor/react-{version}/`,
 * an absolute path, so the browser asks the SITE'S OWN host for it. The route
 * tested `slug === "_vendor"`, which only matched the path-shaped address the
 * sites domain had before subdomains. On andrewrullz.storelib.com the slug is
 * the site and `_vendor` is the first path segment, so nothing matched, React
 * was looked for inside the site's own deployment prefix, and every published
 * site served a blank page. It compiled, typechecked and passed every test.
 */
check(
  "the shared React runtime resolves from a site subdomain",
  (() => {
    const route = strip(read("app/(sites)/site/[slug]/[[...path]]/route.ts"))
    return (
      /const wantsVendor = slug === "_vendor" \|\| \(path \?\? \[\]\)\[0\] === "_vendor"/.test(route) &&
      !/const isVendor = slug === "_vendor"$/m.test(route) &&
      // and a missing vendor file must not fall through to the creator redirect
      /if \(!wantsVendor\) \{/.test(route)
    )
  })(),
)

/**
 * ILIKE cannot use an index. Resolving a subdomain to its live deployment was
 * a sequential scan of every deployment on the platform, on every cache miss:
 * measured at 9.25ms across 20,000 sites against Postgres 16, against 0.05ms
 * once it is an indexed equality.
 */
check(
  "the visitor's lookup is an indexed equality, not a scan",
  (() => {
    const route = strip(read("app/(sites)/site/[slug]/[[...path]]/route.ts"))
    const publish = strip(read("lib/sites/publish.ts"))
    const migration = read("supabase/migrations/20260913_site_lookup_indexes.sql")
    return (
      !/\.ilike\(/.test(route) &&
      !/\.ilike\(/.test(publish) &&
      /\.eq\("slug", slug\.toLowerCase\(\)\)/.test(route) &&
      /idx_site_deployments_live_slug_lookup/.test(migration) &&
      /WHERE is_live/.test(migration)
    )
  })(),
)

/**
 * The service-role key bypasses every RLS policy. The rule used to be a
 * comment saying "NEVER import this in client components", and the browser
 * module re-exported it anyway — so the import that the comment forbade was
 * the one the module offered.
 */
check(
  "the admin client cannot be reached from the browser",
  (() => {
    const admin = read("lib/supabase/admin.ts")
    const client = strip(read("lib/supabase/client.ts"))
    return (
      /^import "server-only"$/m.test(admin) &&
      !/export \{ createAdminClient \}/.test(client)
    )
  })(),
)

check(
  "the cookie migration runs once, and never resurrects a cleared session",
  (() => {
    const proxy = strip(read("proxy.ts"))
    const at = proxy.indexOf("function retireDomainScopedCookies")
    const body = proxy.slice(at, proxy.indexOf("\n}\n", at))
    return (
      /HOST_ONLY_MARKER/.test(body) &&
      /request\.cookies\.has\(HOST_ONLY_MARKER\)/.test(body) &&
      // an empty value is a sign-out in progress, not a session to re-issue
      /if \(cookie\.value && !alreadySet\)/.test(body) &&
      /c\.name !== HOST_ONLY_MARKER/.test(body)
    )
  })(),
)

// ---------------------------------------------------------------------------
section("A published site is served safely, and cannot act as its visitor")
// ---------------------------------------------------------------------------

/**
 * THE FORGERY THE SUBDOMAIN MOVE OPENED.
 *
 * <slug>.storelib.com is the SAME SITE as storelib.com in the cookie sense,
 * so `SameSite=Lax` — which is what made this impossible while sites lived on
 * their own registrable domain — no longer blocks a request from a published
 * page to the application. A generated page could POST to /api/… with
 * credentials and the browser would attach the visitor's session; CORS hides
 * the reply, which is worth nothing once the write has happened.
 *
 * None of this repository's mutating routes checks its caller, so the guard
 * is central: one place none of them can forget.
 */
check(
  "writes from a published site are refused before any route runs",
  (() => {
    const proxy = strip(read("proxy.ts"))
    const guard = proxy.indexOf("isPublishedSiteOrigin(request.headers.get(\"origin\"))")
    const session = proxy.indexOf("createServerClient(")
    return (
      guard > -1 &&
      session > -1 &&
      guard < session &&
      /MUTATING\.has\(request\.method\)/.test(proxy) &&
      /status: 403/.test(proxy.slice(guard, guard + 400))
    )
  })(),
)

check(
  "every state-changing method is covered",
  (() => {
    const proxy = strip(read("proxy.ts"))
    const line = proxy.match(/const MUTATING = new Set\(\[([^\]]*)\]\)/)?.[1] ?? ""
    return ["POST", "PUT", "PATCH", "DELETE"].every((m) => line.includes(`"${m}"`))
  })(),
)

/**
 * A deny-list, deliberately. Refusing everything but the apex would break the
 * callers that legitimately have another origin or none: Stripe webhooks send
 * no Origin, the Capacitor app sends capacitor://localhost, and a creator's
 * custom domain sends its own name while serving pages this app rendered.
 * The refused set is exact instead — a storelib.com subdomain, which since
 * the move is a published site and nothing else.
 */
check(
  "the guard refuses only published-site origins",
  (() => {
    const proxy = strip(read("proxy.ts"))
    const at = proxy.indexOf("function isPublishedSiteOrigin")
    const body = proxy.slice(at, proxy.indexOf("\n}\n", at))
    return (
      /if \(!origin\) return false/.test(body) &&
      /endsWith\(`\.\$\{MAIN_DOMAIN\}`\)/.test(body) &&
      /EXCLUDED_SUBDOMAINS\.includes\(subdomain\)/.test(body) &&
      // an unparseable Origin is not the thing this guard is for
      /catch \{/.test(body)
    )
  })(),
)

/**
 * `style-src 'self'` refused fonts.googleapis.com outright — the browser
 * logs "Refused to load the stylesheet" — so every generated site silently
 * lost its typography and fell back to Times New Roman. Confirmed in a real
 * browser against the exact header production was sending.
 *
 * Scripts stay at 'self': that is the directive that actually contains a
 * generated page, and it is not relaxed to fix fonts.
 */
check(
  "generated sites can load their fonts, and still cannot load code",
  (() => {
    const route = strip(read("app/(sites)/site/[slug]/[[...path]]/route.ts"))
    const csp = route.slice(route.indexOf("Content-Security-Policy"), route.indexOf("X-Content-Type-Options"))
    return (
      /"style-src 'self' 'unsafe-inline' https:\/\/fonts\.googleapis\.com"/.test(csp) &&
      /"font-src 'self' data: https:\/\/fonts\.gstatic\.com"/.test(csp) &&
      // scripts come from the deployment and nowhere else
      /"script-src 'self' 'unsafe-inline'"/.test(csp) &&
      !/script-src[^"]*https:/.test(csp)
    )
  })(),
)

/**
 * The 404 is the one response an attacker can always reach — ask for a slug
 * that is not there — and it was the only one served without a CSP or
 * frame-ancestors. A response is not exempt from a policy because it is empty.
 */
check(
  "the 404 carries the same headers as a page that exists",
  (() => {
    const route = strip(read("app/(sites)/site/[slug]/[[...path]]/route.ts"))
    const at = route.indexOf("function notFound()")
    const body = route.slice(at, route.indexOf("\n}", at))
    return /\.\.\.SECURITY_HEADERS/.test(body) && /status: 404/.test(body)
  })(),
)

// ---------------------------------------------------------------------------
section("A run outlives the connection that started it")
// ---------------------------------------------------------------------------

/**
 * THE BUG A CREATOR ACTUALLY FELT.
 *
 * The agent route handed `request.signal` to the loop, making the browser's
 * connection the agent's abort signal. Locking a phone, switching apps, a
 * tunnel, a dropped bar — any of them aborted the run, and because files are
 * saved in one transaction at the END, two minutes of work vanished. The
 * editor then said "Lost the connection. Nothing was changed.", which was
 * true, and was the problem.
 */
check(
  "the client's connection is not the agent's abort signal",
  (() => {
    const route = strip(read("app/api/sites/[siteId]/agent/route.ts"))
    return !/signal: request\.signal/.test(route)
  })(),
)

check(
  "a reader that goes away does not end the run",
  (() => {
    const route = strip(read("app/api/sites/[siteId]/agent/route.ts"))
    const at = route.indexOf("const send = (event: AgentEvent)")
    const body = route.slice(at, at + 400)
    // enqueue throws once the stream is closed; that must stop the talking,
    // not the working.
    return /try \{/.test(body) && /listening = false/.test(body) && /if \(!listening\) return/.test(body)
  })(),
)

/**
 * Stop has to travel between requests. A module-scope registry works
 * perfectly in development and never in production, where the process that
 * reads the flag is rarely the one that wrote it.
 */
check(
  "stopping is a row the run reads between turns",
  (() => {
    const run = strip(read("lib/sites/agent/run.ts"))
    const migration = read("supabase/migrations/20260914_durable_agent_runs.sql")
    return (
      /cancel_requested/.test(run) &&
      /const stopIfCancelled = async/.test(run) &&
      /await stopIfCancelled\(\)/.test(run) &&
      /ADD COLUMN IF NOT EXISTS cancel_requested/.test(migration)
    )
  })(),
)

check(
  "the editor can ask whether a run is still going, and stop it",
  (() => {
    const route = strip(read("app/api/sites/[siteId]/run/route.ts"))
    return (
      /export async function GET/.test(route) &&
      /export async function DELETE/.test(route) &&
      /site_active_run/.test(route) &&
      /cancel_requested: true/.test(route) &&
      // a late Stop must not rewrite a run that already finished
      /\.eq\("status", "running"\)/.test(route)
    )
  })(),
)

/**
 * A run left at 'running' by a dead process would spin the editor forever.
 * maxDuration is 300 seconds, so nothing legitimate is still going after a
 * quarter of an hour.
 */
check(
  "an abandoned run stops counting as active",
  (() => {
    const migration = read("supabase/migrations/20260914_durable_agent_runs.sql")
    return /INTERVAL '15 minutes'/.test(migration) && /status = 'running'/.test(migration)
  })(),
)

check(
  "the editor reattaches on the three ways a phone loses a stream",
  (() => {
    const chat = strip(read("components/sites/editor/chat-pane.tsx"))
    return (
      /addEventListener\("visibilitychange"/.test(chat) &&
      /addEventListener\("online"/.test(chat) &&
      /addEventListener\("focus"/.test(chat) &&
      // and it does not poll a backgrounded tab, which is throttled anyway
      /document\.hidden/.test(chat)
    )
  })(),
)

check(
  "a dropped stream no longer claims the work was discarded",
  (() => {
    const chat = strip(read("components/sites/editor/chat-pane.tsx"))
    return (
      !/Lost the connection\. Nothing was changed\./.test(chat) &&
      /reconnecting: true/.test(chat) &&
      /Still working/.test(chat)
    )
  })(),
)

check(
  "Stop asks the server, rather than only closing the stream",
  (() => {
    const chat = strip(read("components/sites/editor/chat-pane.tsx"))
    const at = chat.indexOf("const stop = React.useCallback")
    const body = chat.slice(at, chat.indexOf("}, [", at))
    return /\/run`, \{ method: "DELETE" \}/.test(body) && /abortRef\.current\?\.abort\(\)/.test(body)
  })(),
)

/**
 * The mark is drawn inline so it is on screen at first paint with no request
 * and no broken-image box. It had one definition inside a modal and was about
 * to get a second in the editor.
 */
check(
  "the editor header carries the Storelib mark, defined once",
  (() => {
    const chat = strip(read("components/sites/editor/chat-pane.tsx"))
    // Search for the label AFTER the header opens. "Storelib AI" appears
    // earlier in the file, so an unanchored indexOf returns the first hit and
    // the slice runs backwards into an empty string that matches nothing.
    const opens = chat.indexOf("h-11 shrink-0 items-center")
    if (opens === -1) return false
    const label = chat.indexOf("Storelib AI", opens)
    if (label === -1) return false
    if (!/StorelibMark/.test(chat.slice(opens, label))) return false
    // exactly one definition in the tree
    // The mark itself, identified by its own artwork rather than by "an svg" —
    // the modal is full of other icons.
    const MARK = /viewBox="0 0 200 200"[\s\S]*?fill="#8B56FA"/
    const files = ["components/storelib-mark.tsx", "components/onepage/onboarding-modal.tsx"]
    const definitions = files.filter((f) => MARK.test(read(f)))
    return definitions.length === 1 && definitions[0] === "components/storelib-mark.tsx"
  })(),
)

// ---------------------------------------------------------------------------
section("Verification pass — the defects found reviewing the work above")
// ---------------------------------------------------------------------------

/**
 * A Set-Cookie with no Max-Age and no Expires is a SESSION cookie.
 *
 * The cookie being replaced is persistent, so re-issuing it without one
 * quietly downgraded every existing login to "signed out when you close the
 * browser" — once, during the migration, for everybody. Confirmed in Chromium
 * rather than argued from the spec: the re-issued cookie came back with
 * expires = -1.
 *
 * The value carries Supabase's own tokens and their lifetime is enforced
 * server-side when presented, so a long cookie lifetime grants no extra
 * access — it only stops the browser discarding a session that is still good.
 */
check(
  "the cookie migration does not downgrade a persistent login",
  (() => {
    const proxy = strip(read("proxy.ts"))
    const at = proxy.indexOf("function retireDomainScopedCookies")
    const body = proxy.slice(at, proxy.indexOf("\n}\n", at))
    const reissue = body.match(/`\$\{cookie\.name\}=\$\{cookie\.value\}[^`]*`/)?.[0] ?? ""
    return /Max-Age=\d+/.test(reissue) && /Secure/.test(reissue) && /Path=\//.test(reissue)
  })(),
)

/**
 * `Origin` is not sent on a plain subresource GET, so a published page could
 * reach the API with <img src="https://storelib.com/api/…"> and the browser
 * would attach the visitor's cookies. That matters because GET handlers in
 * this repository do create and update rows — lazy initialisation, tracking
 * pixels, download counters — so "GET does not mutate" is not true here.
 *
 * `Sec-Fetch-Site: same-site` is exactly a subdomain-to-apex request, and
 * since sites moved onto subdomains there is no other kind.
 */
check(
  "a published site cannot reach the API with a cookie-bearing GET",
  (() => {
    const proxy = strip(read("proxy.ts"))
    return (
      /sec-fetch-site/.test(proxy) &&
      /secFetchSite === "same-site"/.test(proxy) &&
      /pathname\.startsWith\("\/api\/"\)/.test(proxy) &&
      // the dashboard is same-origin and a custom domain is cross-site;
      // neither may be caught by this
      !/secFetchSite === "cross-site"/.test(proxy) &&
      !/secFetchSite === "same-origin"/.test(proxy)
    )
  })(),
)

check(
  "a future Site API has a documented way through the guard",
  (() => {
    const proxy = strip(read("proxy.ts"))
    return /\/api\/public\//.test(proxy) && /isPublicApi/.test(proxy)
  })(),
)

/**
 * A run outliving its connection means a creator can be looking at it from
 * three places. The editor disables its own composer, but that is one
 * browser's opinion — it cannot speak for another device.
 */
check(
  "one run per site, decided by the server",
  (() => {
    const route = strip(read("app/api/sites/[siteId]/agent/route.ts"))
    const guard = route.indexOf("site_active_run")
    const start = route.indexOf("runAgent(")
    return (
      guard > -1 &&
      start > -1 &&
      guard < start &&
      /status: 409/.test(route)
    )
  })(),
)

/**
 * `onFilesChanged` re-reads the project itself, merging paths the creator has
 * unsaved edits in and adopting the new revision. Fetching /files alongside it
 * meant two requests for the same thing, one answer discarded, and a merge
 * the chat pane does not know how to do.
 */
check(
  "reloading after a run does not fetch the project twice",
  (() => {
    const chat = strip(read("components/sites/editor/chat-pane.tsx"))
    const at = chat.indexOf("const reloadAfterRun")
    const body = chat.slice(at, chat.indexOf("}, [", at))
    const fileFetches = (body.match(/\/files`/g) ?? []).length
    return fileFetches === 0 && /onFilesChanged\(\[\]\)/.test(body)
  })(),
)

// ---------------------------------------------------------------------------
section("A site card shows the site as you last left it")
// ---------------------------------------------------------------------------

/**
 * The card framed the PUBLISHED page, so a site somebody had spent an hour on
 * showed "Not published yet" until they shipped it — a grey box where the work
 * is. The cover is built from the current files instead.
 */
check(
  "the cover is the current project, not only a published one",
  (() => {
    const card = strip(read("components/sites/sites-dashboard.tsx"))
    return (
      /\/api\/sites\/\$\{site\.id\}\/cover/.test(card) &&
      !/site\.status === "published" && site\.slug \?/.test(card) &&
      !/Not published yet/.test(card)
    )
  })(),
)

/**
 * Rebuilt only when the revision moves. A site autosaves every 1.2 seconds;
 * building on every write would spend a compile per keystroke on a picture
 * nobody is looking at, and building on every read one per dashboard visit.
 */
check(
  "a cover is rebuilt when it is stale, and not otherwise",
  (() => {
    const cover = strip(read("lib/sites/cover.ts"))
    return (
      /previewRevision === revision/.test(cover) &&
      // read on its own, so a database without the column yet loses the
      // cached cover rather than the whole dashboard
      /await siteRevisions\(site\.id\)/.test(cover) &&
      /preview_revision: revision/.test(cover) &&
      // stored BEFORE the marker: a marker claiming an upload that failed
      // would be trusted by the next reader and show a blank card
      cover.indexOf(".upload(") < cover.indexOf("preview_revision: revision")
    )
  })(),
)

/**
 * The frame runs with `sandbox` and NO allow-same-origin, so it has an OPAQUE
 * origin — which is what makes it safe to render a creator's generated
 * JavaScript on the dashboard's own domain. An opaque origin also means its
 * requests are cross-origin and carry no session, so the cover has to be one
 * self-contained document: anything it had to fetch with a cookie would 404
 * inside the frame while working perfectly when opened directly.
 */
check(
  "the cover frame cannot reach the dashboard around it",
  (() => {
    const card = strip(read("components/sites/sites-dashboard.tsx"))
    const route = strip(read("app/api/sites/[siteId]/cover/route.ts"))
    return (
      /sandbox="allow-scripts"/.test(card) &&
      !/allow-same-origin/.test(card) &&
      /pointer-events-none/.test(card) &&
      /frame-ancestors 'self'/.test(route) &&
      /"connect-src 'none'"/.test(route) &&
      // an unpublished draft must never sit in a shared cache
      /private, max-age=0/.test(route)
    )
  })(),
)

check(
  "a cover is private to its owner",
  (() => {
    const route = strip(read("app/api/sites/[siteId]/cover/route.ts"))
    const resolve = strip(read("lib/sites/resolve.ts"))
    /**
     * The read still goes through the signed-in user's client, so RLS answers
     * ownership — it just goes through `resolveSite` now, which also keeps a
     * broken read from being reported as "not found". Absent and not-yours
     * deliberately share one answer: confirming a stranger's site exists is
     * information they should not get.
     *
     * What this route may NOT do any more is hand back resolveSite's response
     * unchanged. That object is shared with four JSON routes and carries no
     * framing policy, and returning it from a route that IS framed is what put
     * "storelib.com refused to connect." on the dashboard. It still refuses —
     * it just refuses with a document the card can paint.
     */
    return (
      /const found = await resolveSite\(siteId, "text"\)/.test(route) &&
      /if \(!found\.ok\) \{/.test(route) &&
      // refused before the site is ever touched
      route.indexOf("if (!found.ok)") < route.indexOf("siteCover(found.site)") &&
      !/return found\.response/.test(route) &&
      /const status = found\.response\.status/.test(route) &&
      /getSite\(siteId\)/.test(resolve) &&
      /status: 404/.test(resolve) &&
      /status: 503/.test(resolve)
    )
  })(),
)

/**
 * `transform: scale(calc(100cqw / 1280))` is the obvious version and it does
 * NOTHING: cqw is a LENGTH and scale() takes a unitless NUMBER, so the
 * declaration is invalid and dropped, and the card shows the top-left corner
 * of a 1280px page. Measured in a real browser at three widths — the frame
 * came back 1280px wide in all of them — and again after the fix, where it
 * fills the card exactly.
 */
check(
  "the cover is scaled by a measured number, not by a container-query length",
  (() => {
    const card = strip(read("components/sites/sites-dashboard.tsx"))
    return (
      /new ResizeObserver/.test(card) &&
      /clientWidth \/ COVER_WIDTH/.test(card) &&
      !/scale\(calc\(100cqw/.test(card) &&
      // and it does not flash a full-size render before it has measured
      // (the same expression now also waits for the frame's own greeting —
      // measured AND greeted, both, before anything is shown)
      /visibility: coverScale && coverReady \? "visible" : "hidden"/.test(card)
    )
  })(),
)

// ---------------------------------------------------------------------------
section("A signed-in creator's own sites are the ones they see")
// ---------------------------------------------------------------------------

/**
 * THE BUG BEHIND "I HAVE A SITE AND IT IS NOT HERE".
 *
 * A previous version of currentCreatorId() looked up the creators row
 * through the SESSION-SCOPED client, found nothing, and then INSERTED A
 * SECOND CREATOR ROW for the same user through that same client — fabricating
 * an empty account next to the real one instead of finding it. Two things
 * made that dangerous rather than merely redundant: the insert used a plain
 * email-derived slug with no collision handling against creators_slug_key's
 * UNIQUE constraint (the real signup path at onboarding/finalize retries on
 * exactly that violation), and it never set onboarding_completed /
 * store_published, columns other parts of the app depend on existing.
 *
 * Every OTHER working read of `creators` in this codebase — app/app/page.tsx,
 * app/api/onboarding/finalize/route.ts, the settings form's server actions —
 * goes through the ADMIN client. This was the one path that did not, and it
 * is why a creator who plainly already had a site could look it up and find
 * nothing: not "no creator exists", but "this lookup could not see the one
 * that does."
 */
check(
  "the creator lookup uses the same client every other working lookup uses",
  (() => {
    const helper = strip(read("lib/creators/current.ts"))
    const at = helper.indexOf("export async function currentCreatorId")
    const body = helper.slice(at, helper.indexOf("\n}", at))
    return (
      /const admin = createAdminClient\(\)/.test(body) &&
      /admin\.from\("creators"\)\.select\("id"\)\.eq\("user_id", user\.id\)/.test(body)
    )
  })(),
)

/**
 * The admin client belongs in the narrow, id-only helper — never in the file
 * that reads and writes actual site content. `read`, not `strip(read(...))`:
 * even a comment mentioning the admin client in projects.ts would be the
 * seam this test exists to catch drifting back open.
 */
check(
  "the admin client does not leak into the module that owns site content",
  (() => {
    const projects = read("lib/sites/projects.ts")
    return (
      !/createAdminClient/.test(projects) &&
      /import \{ currentCreatorId \} from "@\/lib\/creators\/current"/.test(projects)
    )
  })(),
)

/**
 * Provisioning a missing creator is onboarding's job, with its own collision
 * handling and its own required columns — not something to fabricate inline
 * from a lookup that was only ever supposed to read. A second insert path
 * with none of onboarding's guarantees is how an account ends up with two
 * creator rows: the real one, still holding every site, and a fresh empty one
 * that currentCreatorId() now returns instead — which is a worse bug than the
 * one it was meant to fix, because now the dashboard is wrong AND creating a
 * new site silently detaches from the old ones.
 */
check(
  "a missing creator is not fabricated by the sites lookup",
  (() => {
    const projects = strip(read("lib/sites/projects.ts"))
    const at = projects.indexOf("export async function currentCreatorId")
    const body = projects.slice(at, projects.indexOf("\n}", at))
    return !/\.insert\(/.test(body)
  })(),
)

check(
  "listSites still scopes to the caller's own creator id",
  (() => {
    const projects = strip(read("lib/sites/projects.ts"))
    const at = projects.indexOf("export async function listSites")
    const body = projects.slice(at, projects.indexOf("\n}", at))
    return (
      /const creatorId = await currentCreatorId\(\)/.test(body) &&
      /if \(!creatorId\) return \[\]/.test(body) &&
      /\.eq\("creator_id", creatorId\)/.test(body)
    )
  })(),
)

// ---------------------------------------------------------------------------
section("A failed read is never reported as an empty account")
// ---------------------------------------------------------------------------

/**
 * THE BUG THAT TOOK THREE ATTEMPTS TO FIND.
 *
 * `preview_revision` was added to the shared column list for the card covers.
 * SQL in this project is applied BY HAND from the generated paste files, so
 * the code went live before the column existed — and PostgREST does not fail
 * politely: the whole select errors with "column ... does not exist" and
 * returns no rows.
 *
 * `listSites` then did `const { data } = ...`, dropping `error` on the floor,
 * and `?? []` turned a broken query into an empty account. A creator with a
 * published site was shown an invitation to build their first one, while
 * `createSite` — which counts with `select("id")` and so never touched the
 * missing column — could still see the site and refused to make another. The
 * gate and the list disagreed because only one of them was asking for a
 * column that was not there.
 *
 * Both halves are guarded here: the shared list stays on settled columns, and
 * a failed query is never silently an empty one.
 */
check(
  "the shared column list does not carry a freshly-added column",
  (() => {
    const projects = read("lib/sites/projects.ts")
    const columns = projects.match(/const COLUMNS =\s*\n?\s*"([^"]+)"/)?.[1] ?? ""
    return columns.length > 0 && !/preview_revision/.test(columns)
  })(),
)

check(
  "a query failure is distinguishable from an empty account",
  (() => {
    const projects = strip(read("lib/sites/projects.ts"))
    const at = projects.indexOf("export async function listSites")
    const body = projects.slice(at, projects.indexOf("\n}", at))
    return (
      /const \{ data, error \} =/.test(body) &&
      /if \(error\)/.test(body) &&
      /throw new SitesUnavailableError/.test(body)
    )
  })(),
)

check(
  "the dashboard says which of the two happened",
  (() => {
    const page = strip(read("app/app/sites/page.tsx"))
    return (
      /SitesUnavailableError/.test(page) &&
      /We could not load your sites/.test(page) &&
      // and an unexpected error is still allowed to surface, not swallowed
      /throw thrown/.test(page)
    )
  })(),
)

/**
 * The covers read their own columns, so a database that has not run the
 * migration loses the cached picture rather than the whole dashboard.
 */
check(
  "a missing cover column degrades the cover, not the account",
  (() => {
    const projects = strip(read("lib/sites/projects.ts"))
    const at = projects.indexOf("export async function siteRevisions")
    const body = projects.slice(at, projects.indexOf("\n}", at))
    return (
      /preview_revision/.test(body) &&
      /if \(error \|\| !data\) return \{ revision: 1, previewRevision: null, publishedRevision: null \}/.test(body)
    )
  })(),
)

// ---------------------------------------------------------------------------
section("An existing project is continued, not regenerated")
// ---------------------------------------------------------------------------

/**
 * THE BEHAVIOUR THIS REPLACES.
 *
 * Every run began with a constant system prompt and the creator's one
 * sentence — `turns = [{ role: "user", content: prompt }]` — so the model knew
 * nothing about the business, the audience, or any decision already made. It
 * re-derived the design from the files each time, and a fresh reader every
 * time keeps arriving somewhere slightly different. Ask for a testimonials
 * section twice and you get two visual languages.
 */
check(
  "the agent is told what the project is before it edits it",
  (() => {
    const loop = strip(read("lib/sites/agent/loop.ts"))
    const run = strip(read("lib/sites/agent/run.ts"))
    return (
      /system: buildSystemPrompt\(context \?\? null\)/.test(loop) &&
      !/system: SYSTEM_PROMPT,/.test(loop) &&
      // loaded alongside the assets now, so match the call rather than the
      // assignment it used to sit in
      /readManifest\(siteId\)/.test(run) &&
      /const \[stored, assets\] = await Promise\.all/.test(run) &&
      /facts: describeProject\(files, assets\)/.test(run)
    )
  })(),
)

/**
 * A brand-new site has nothing to preserve, and telling a model to match a
 * design language that does not exist yet makes a first generation timid.
 * Verified by rendering the real prompt for an empty project: it comes back
 * byte-identical to the base.
 */
check(
  "a first generation is not told to preserve a project that is not there",
  (() => {
    const loop = strip(read("lib/sites/agent/loop.ts"))
    const context = strip(read("lib/sites/agent/context.ts"))
    return (
      /if \(!context \|\| !context\.facts\) return SYSTEM_PROMPT/.test(loop) &&
      /if \(paths\.length === 0\) return ""/.test(context)
    )
  })(),
)

/**
 * THE SPLIT THAT KEEPS THE MEMORY HONEST.
 *
 * Colours, fonts and spacing are NOT stored in the manifest even though they
 * are part of the project's identity — they live in src/styles.css, and that
 * file is the truth. A stored copy becomes a second truth that goes stale the
 * first time somebody edits a token, and a manifest confidently stating the
 * wrong primary colour is worse than none, because the agent would believe it.
 * Anything the files can answer is derived fresh on every run.
 */
check(
  "design facts are derived from the files, never remembered",
  (() => {
    const manifest = strip(read("lib/sites/manifest.ts"))
    const shape = manifest.slice(
      manifest.indexOf("export interface ProjectManifest"),
      manifest.indexOf("}", manifest.indexOf("export interface ProjectManifest")),
    )
    // the stored record must not carry anything the stylesheet owns
    const forbidden = ["color", "colour", "font", "spacing", "radius", "palette", "typography"]
    if (forbidden.some((word) => shape.toLowerCase().includes(word))) return false

    const context = strip(read("lib/sites/agent/context.ts"))
    const map = strip(read("lib/sites/agent/repo-map.ts"))
    return (
      /export function designTokens/.test(context) &&
      /export function fontFamilies/.test(context) &&
      // Structure moved to the repo map, which derives more of it, not less.
      /export function buildRepoMap/.test(map) &&
      /buildRepoMap\(files\)/.test(context)
    )
  })(),
)

/**
 * The expensive mistake is only in one direction: treating a small edit as
 * licence to redesign throws away work somebody liked, while treating a
 * redesign too conservatively produces a change that is merely too small.
 * So the default is the cautious one and widening it takes explicit words.
 *
 * The trigger phrases are narrow on purpose — "new" alone appears in "add a
 * new section", "redo" in "redo the spacing on the hero". Verified against 20
 * real phrasings including those traps.
 */
check(
  "the default posture is the smallest change",
  (() => {
    const intent = strip(read("lib/sites/agent/intent.ts"))
    const at = intent.indexOf("export function classifyIntent")
    const body = intent.slice(at, intent.indexOf("\n}", at))
    if (!/return "edit"\s*$/m.test(body)) return false
    // a bare "new" or "redo" must never be enough to escalate
    const phrases = intent.slice(0, at)
    return !/"new"/.test(phrases) && !/"redo"/.test(phrases) && !/"change"/.test(phrases)
  })(),
)

check(
  "the preservation rules name the specific failures, not just 'be consistent'",
  (() => {
    const loop = read("lib/sites/agent/loop.ts")
    const at = loop.indexOf("const PRESERVATION_RULES")
    const body = loop.slice(at, loop.indexOf("`\n", loop.indexOf("`", at) + 1))
    return (
      /SMALLEST change/.test(body) &&
      /change fonts, colours, spacing, radii/.test(body) &&
      /remove functionality, change page structure/.test(body) &&
      /Reuse before you invent/.test(body) &&
      // and it must not silently "fix" things it was not asked about
      /Do not\s+silently fix it/.test(body.replace(/\n/g, " "))
    )
  })(),
)

/**
 * Memory is committed with the work. A run that failed or was stopped saved no
 * files, and a note describing changes that were never written would make the
 * next run reason about a site that does not exist.
 */
check(
  "project memory is saved only when the work was",
  (() => {
    const run = strip(read("lib/sites/agent/run.ts"))
    return /if \(status === "succeeded" && workspace\.manifestUpdate\)/.test(run)
  })(),
)

/**
 * Not in the shared column list, and that is the whole point: SQL here is
 * applied by hand, so a column added in code is live before it exists in the
 * database. Putting `preview_revision` in that list once already reported that
 * a creator with a published site had no sites at all.
 */
check(
  "a database without the manifest column loses memory, not the run",
  (() => {
    const manifest = strip(read("lib/sites/manifest.ts"))
    const projects = read("lib/sites/projects.ts")
    const at = manifest.indexOf("export async function readManifest")
    const body = manifest.slice(at, manifest.indexOf("\n}", at))
    return (
      /if \(error \|\| !data\) return null/.test(body) &&
      !/manifest/.test(projects.match(/const COLUMNS =\s*\n?\s*"([^"]+)"/)?.[1] ?? "")
    )
  })(),
)

// ---------------------------------------------------------------------------
section("A project's conversation survives everything")
// ---------------------------------------------------------------------------

/**
 * THE ROOT CAUSE.
 *
 * Both the question and the answer were written in ONE call, at the very END
 * of a run. For the thirty to ninety seconds a run takes, the creator's prompt
 * existed only in React state — and it was lost outright on every path that
 * never reached that final write. There were seven: the monthly quota being
 * spent, a project with no files, the run row failing to open, the loop
 * throwing, the process being replaced mid-run by a deploy, a refresh during
 * the run, and the one-run-per-site guard refusing a second send.
 *
 * The prompt is now durable the instant it is accepted, before any of that can
 * happen.
 */
check(
  "the prompt is saved before any work is attempted",
  (() => {
    const run = strip(read("lib/sites/agent/run.ts"))
    const saved = run.indexOf("await startExchange({ siteId, prompt })")
    const quota = run.indexOf("const quota = await monthlyQuotaError")
    const files = run.indexOf("const files = await readProject(siteId)")
    const loop = run.indexOf("const loop = agentLoop(")
    return saved > -1 && quota > saved && files > saved && loop > saved
  })(),
)

/**
 * A transcript holding a question with nothing after it is how somebody
 * concludes the product ate their request. Four exits can happen before the
 * agent ever runs, and one of them being forgotten is exactly how a dangling
 * prompt ships — hence one helper rather than four copies.
 */
check(
  "every early exit answers the question it just recorded",
  (() => {
    const run = strip(read("lib/sites/agent/run.ts"))
    const helper = /const failEarly = async \(message: string\)/.test(run)
    const usesIt = (run.match(/yield await failEarly\(/g) ?? []).length
    /**
     * One bare error yield is legitimate — the final failure, which runs
     * AFTER the answer has been recorded. Anything before that point is an
     * exit that leaves a question hanging.
     */
    const answered = run.indexOf("await completeExchange({")
    const bareBeforeAnswer = [...run.matchAll(/yield \{ type: "error", message: [a-z]/g)].filter(
      (m) => (m.index ?? 0) < answered,
    ).length
    return helper && usesIt >= 3 && answered > -1 && bareBeforeAnswer === 0
  })(),
)

check(
  "the answer is recorded against the question, not as a fresh pair",
  (() => {
    const chat = strip(read("lib/sites/chat.ts"))
    return (
      /export async function startExchange/.test(chat) &&
      /export async function completeExchange/.test(chat) &&
      /userMessageId/.test(chat) &&
      // the prompt row predates the run, so its run_id is filled in after
      /\.update\(\{ run_id: input\.runId \}\)/.test(chat)
    )
  })(),
)

/**
 * Losing the transcript is bad. Refusing to do the work somebody asked for
 * because a log line could not be written is worse.
 */
check(
  "a transcript that cannot be written does not cancel the edit",
  (() => {
    const chat = strip(read("lib/sites/chat.ts"))
    /**
     * Sliced from the end of the SIGNATURE, not from the declaration: the
     * parameter object is written inline across several lines, so the first
     * `\n}` after the function name closes that type rather than the body —
     * which made this assertion read an empty string and pass on nothing.
     */
    const at = chat.indexOf("export async function startExchange")
    const bodyStart = chat.indexOf("Promise<string | null> {", at)
    const body = chat.slice(bodyStart, chat.indexOf("\n}", bodyStart))
    return (
      body.length > 100 &&
      /if \(error\)/.test(body) &&
      /return null/.test(body) &&
      !/throw/.test(body)
    )
  })(),
)

/**
 * `const { data } = ...` with `?? []` made a broken query indistinguishable
 * from a site nobody has talked to — the transcript sitting in the table,
 * unreadable, while the editor showed a blank pane and the creator concluded
 * their history had been thrown away. The same defect that once reported a
 * creator with a published site had no sites at all.
 */
check(
  "a failed read is never rendered as an empty conversation",
  (() => {
    const chat = strip(read("lib/sites/chat.ts"))
    const route = strip(read("app/api/sites/[siteId]/chat/route.ts"))
    const pane = strip(read("components/sites/editor/chat-pane.tsx"))
    return (
      /throw new ChatUnavailableError/.test(chat) &&
      /ChatUnavailableError/.test(route) &&
      /status: 503/.test(route) &&
      /setHistoryError\(true\)/.test(pane) &&
      /We could not load this conversation/.test(pane)
    )
  })(),
)

/**
 * Now that a prompt is saved the moment it is accepted, a trailing user
 * message means either "still working" or "ended without an answer" — and
 * reading the transcript alone cannot tell them apart. Guessing "did not
 * finish" over a run that is actively working is the more alarming mistake.
 */
check(
  "a prompt saved mid-run reads as running after a refresh, not as failed",
  (() => {
    const pane = strip(read("components/sites/editor/chat-pane.tsx"))
    return (
      /fetch\(`\/api\/sites\/\$\{siteId\}\/run`, \{ cache: "no-store" \}\)/.test(pane) &&
      /const active = runResponse\?\.ok/.test(pane) &&
      /if \(isLast && active\)/.test(pane) &&
      /exchange\.running = true/.test(pane)
    )
  })(),
)

/**
 * Proven against a real database with RLS on: two users, two projects. User A
 * sees eleven messages on Project A; user B, asking for the same rows, gets
 * only their own project back.
 */
check(
  "one project's conversation is scoped to that project and its owner",
  (() => {
    const chat = strip(read("lib/sites/chat.ts"))
    const readFn = chat.slice(chat.indexOf("export async function readChat"), chat.indexOf("export class") + 1 || undefined)
    // scoped by site, read through the user's client so RLS answers ownership
    return /\.eq\("site_id", siteId\)/.test(chat) && /await createClient\(\)/.test(chat)
  })(),
)

// ---------------------------------------------------------------------------
section("The editor and the live site agree")
// ---------------------------------------------------------------------------

/**
 * NEITHER DIRECTIVE WAS DECLARED, so both fell back to `default-src 'self'` —
 * and a policy is not obviously missing a directive it never mentions. The
 * editor preview enforces no policy at all, so a video background, a YouTube
 * embed or an embedded map worked perfectly while building and was silently
 * blank the moment it went live.
 *
 * Confirmed in a real browser against the exact header: an mp4, an mp3 and an
 * iframe embed all refused by `default-src 'self'`, and all three allowed
 * after. These are ordinary content on landing pages, funnels and agency
 * sites — the things Storelib is for.
 */
check(
  "a published site can play video and embed what a landing page embeds",
  (() => {
    const route = strip(read("app/(sites)/site/[slug]/[[...path]]/route.ts"))
    const csp = route.slice(route.indexOf("Content-Security-Policy"), route.indexOf("X-Content-Type-Options"))
    return (
      /"media-src 'self' data: blob: https:"/.test(csp) &&
      /"frame-src 'self' https:"/.test(csp) &&
      // https only — a page must not be able to downgrade a visitor to http
      !/media-src[^"]*http:/.test(csp) &&
      !/frame-src[^"]*http:/.test(csp) &&
      // and a Storelib page still may not itself be framed
      /"frame-ancestors 'none'"/.test(csp)
    )
  })(),
)

/**
 * Staleness used to be set only by an edit made in the CURRENT session, and
 * initialised to false on every load. Editing, closing the tab and coming back
 * showed a button reading "Live" over a draft that had never been published —
 * which is exactly how somebody ends up looking at a hero in the editor that
 * the live site has never seen.
 *
 * Both numbers already existed. Nothing had ever compared them.
 */
check(
  "reopening a site with unpublished edits does not claim to be live",
  (() => {
    const page = strip(read("app/sites/[siteId]/page.tsx"))
    const shell = strip(read("components/sites/editor/editor-shell.tsx"))
    return (
      /revisions\.publishedRevision !== null && revisions\.revision !== revisions\.publishedRevision/.test(page) &&
      /initiallyBehind={behind}/.test(page) &&
      /stale: initiallyBehind/.test(shell) &&
      // `stale: false` immediately after a successful publish is correct — it
      // is only the INITIAL state that must not assume everything is live.
      !/publishedUrl\(site\.slug\), stale: false/.test(shell)
    )
  })(),
)

/**
 * `published_revision` is read beside the others and tolerantly, never added
 * to the shared column list — putting `preview_revision` there once already
 * reported that a creator with a published site had no sites at all.
 */
check(
  "the publish comparison cannot take the editor down with it",
  (() => {
    const projects = read("lib/sites/projects.ts")
    const columns = projects.match(/const COLUMNS =\s*\n?\s*"([^"]+)"/)?.[1] ?? ""
    const at = projects.indexOf("export async function siteRevisions")
    const body = projects.slice(at, projects.indexOf("\n}", projects.indexOf("Promise<{", at)))
    return (
      !/published_revision/.test(columns) &&
      /published_revision/.test(body) &&
      /if \(error \|\| !data\) return \{ revision: 1, previewRevision: null, publishedRevision: null \}/.test(body)
    )
  })(),
)

// ---------------------------------------------------------------------------
section("Publishing actually reaches the visitor")
// ---------------------------------------------------------------------------

/**
 * THE BUG THAT MADE PUBLISHING LOOK BROKEN.
 *
 * /app.js was a STABLE path whose contents changed on every publish, served
 * `max-age=31536000, immutable`. `immutable` is the strongest cache promise
 * there is — browsers honour it so completely they will not revalidate even on
 * a hard reload. So a creator published new code and every visitor who had
 * ever loaded the site, plus the CDN in front of them, kept running the old
 * bundle. For a year.
 *
 * Reproduced in a real browser against those exact headers: publish, reload,
 * reload again — still the old build. With the version stamped onto the URL,
 * the new build arrives on the first reload.
 */
check(
  "a new publish produces new asset URLs, so `immutable` is honest",
  (() => {
    const doc = strip(read("lib/sites/preview-document.ts"))
    const publish = strip(read("lib/sites/publish.ts"))
    return (
      /const assetVersion =/.test(doc) &&
      /href="\.\/app\.css\$\{assetVersion\}"/.test(doc) &&
      /src="\.\/app\.js\$\{assetVersion\}"/.test(doc) &&
      // and the publish supplies it, so the URL changes when the site does
      /buildStatic\(files, site\.id, `r\$\{revision\}`\)/.test(publish)
    )
  })(),
)

/**
 * The revision has to be read BEFORE the build now, because the document being
 * built carries it. Reading it afterwards would stamp the assets with a
 * version the HTML was not built from.
 */
check(
  "the version is known before the document that carries it is written",
  (() => {
    const publish = strip(read("lib/sites/publish.ts"))
    const at = publish.indexOf("export async function publishSite")
    const body = publish.slice(at)
    const readsRevision = body.indexOf('.select("revision")')
    const builds = body.indexOf("await buildStatic(")
    return readsRevision > -1 && builds > readsRevision
  })(),
)

/**
 * `stale-while-revalidate=86400` serves the PREVIOUS page for up to
 * twenty-four hours after it expires — and the person most likely to look
 * immediately after a publish is the creator who just pressed the button. A
 * day of "I published and nothing changed" is the wrong trade for a builder.
 */
check(
  "the html cannot be a day out of date after a publish",
  (() => {
    const route = strip(read("app/(sites)/site/[slug]/[[...path]]/route.ts"))
    const swr = route.match(/stale-while-revalidate=(\d+)/)?.[1]
    const sMaxAge = route.match(/s-maxage=(\d+)/)?.[1]
    return swr !== undefined && sMaxAge !== undefined && Number(swr) <= 60 && Number(sMaxAge) <= 30
  })(),
)

/**
 * A SPINNER ALONE cannot be told apart from a stall, and publishing is the
 * slowest thing in the editor — a build, a storage upload and a database
 * write. The first attempt at fixing that was a running seconds count, and it
 * was the wrong idea: a number ticking up is something to watch, and watching
 * it makes four seconds feel like ten.
 *
 * A travelling sliver says the same thing — working, not stalled — without
 * asking anyone to read anything. It travels rather than fills because the
 * duration is genuinely unknown, and a bar creeping toward an edge it cannot
 * reach is a promise the publish cannot keep.
 */
check(
  "publishing shows that it is working, without a number to watch",
  (() => {
    const button = strip(read("components/sites/editor/publish-button.tsx"))
    const css = read("app/globals.css")
    return (
      /storelib-indeterminate/.test(button) &&
      /@keyframes storelib-indeterminate/.test(css) &&
      // the sliver needs a positioning context and must not spill out
      /relative flex h-8 items-center gap-1\.5 overflow-hidden/.test(button) &&
      // no counting, anywhere
      !/toFixed\(1\)/.test(button) &&
      !/setInterval/.test(button) &&
      !/elapsed/.test(button) &&
      !/tookMs/.test(button)
    )
  })(),
)

/**
 * Motion here is decoration — the label already says what is happening — so it
 * is switched off for anyone who has asked their system for less of it.
 */
check(
  "the publishing motion respects a reduced-motion preference",
  (() => {
    const css = read("app/globals.css")
    const at = css.indexOf("@media (prefers-reduced-motion: reduce)", css.indexOf("storelib-indeterminate"))
    return at > -1 && /animation: none/.test(css.slice(at, at + 260))
  })(),
)

// ---------------------------------------------------------------------------
section("The editor's top bar")
// ---------------------------------------------------------------------------

/**
 * The device switcher and the reload used to sit in a second strip under the
 * top bar, above the frame. They belong beside the address they act on — that
 * is the row somebody reads when they want to know what they are looking at
 * and how to change it. Two strips to say one thing is one strip too many.
 */
check(
  "the preview's controls sit beside the address they act on",
  (() => {
    const shell = strip(read("components/sites/editor/editor-shell.tsx"))
    const pane = strip(read("components/sites/editor/preview-pane.tsx"))
    return (
      // moved up
      /Monitor/.test(shell) && /Tablet/.test(shell) && /Smartphone/.test(shell) &&
      /setPreviewNonce/.test(shell) &&
      // and gone from below, rather than living in both places
      !/setViewport/.test(pane) &&
      !/RefreshCw/.test(pane)
    )
  })(),
)

/**
 * The pane is controlled now. State owned in two places is state that
 * disagrees with itself the first time somebody changes one of them.
 */
check(
  "the preview holds no opinion of its own about size or reloading",
  (() => {
    const pane = strip(read("components/sites/editor/preview-pane.tsx"))
    return (
      /viewport: Viewport/.test(pane) &&
      /nonce: number/.test(pane) &&
      !/React\.useState<Viewport>/.test(pane) &&
      !/const \[nonce, setNonce\]/.test(pane)
    )
  })(),
)

/**
 * An anchor pointing at a site that has never been published is a promise the
 * product cannot keep, so the address is text until there is something at the
 * other end of it.
 */
check(
  "the address is only a link once there is a live site behind it",
  (() => {
    const shell = strip(read("components/sites/editor/editor-shell.tsx"))
    return (
      /publishedAddress \?\? "Not published yet"/.test(shell) &&
      /publishedAddress && publishState\.kind === "live" \?/.test(shell) &&
      /site\.slug \? publishedUrl\(site\.slug\)/.test(shell)
    )
  })(),
)

/**
 * Collapsing the chat has to REMOVE the column, not hide it — hiding leaves a
 * gap where the chat used to be and the preview never reflows into the space,
 * which is the whole reason to collapse it.
 */
check(
  "collapsing the chat gives the preview the width",
  (() => {
    const shell = strip(read("components/sites/editor/editor-shell.tsx"))
    return (
      /chatCollapsed \? "md:grid-cols-\[1fr\]" : "md:grid-cols-\[minmax\(320px,380px\)_1fr\]"/.test(shell) &&
      /PanelLeftClose/.test(shell) &&
      /PanelLeftOpen/.test(shell)
    )
  })(),
)

/**
 * Six icon buttons in one row. Writing the same classes six times is how one
 * of them ends up a pixel taller than its neighbours after a hurried edit.
 */
check(
  "the bar's icon buttons are one component, not six copies",
  (() => {
    const shell = read("components/sites/editor/editor-shell.tsx")
    const uses = (shell.match(/<BarButton/g) ?? []).length
    return /function BarButton\(/.test(shell) && uses >= 4
  })(),
)

/**
 * `getSite` throws now when the query itself fails, because a read that broke
 * is not a site that is absent. That made four routes able to 500 on a
 * database hiccup — publish, export, cover and run — each needing the same
 * try/catch, and the fifth one written next year would not have had it.
 */
check(
  "no site route answers a broken read with a crash",
  (() => {
    const routes = ["publish", "export", "cover", "run"]
    return routes.every((name) => {
      const route = strip(read(`app/api/sites/[siteId]/${name}/route.ts`))
      // resolved through the one helper, never by calling getSite directly
      return /resolveSite\(/.test(route) && !/await getSite\(/.test(route)
    })
  })(),
)

/**
 * `headers()` in next.config matches the path the BROWSER asked for, and on a
 * site subdomain that path is `/` — which carries the marketing landing page's
 * rule, `s-maxage=3600, stale-while-revalidate=7200`. So a published homepage
 * would be held for an hour and served stale for two more: three hours of "I
 * published and nothing changed". The rewrite is the only place that knows the
 * request is a site, so the header belongs there.
 *
 * THE NUMBER IS NOT WRITTEN DOWN HERE. It has to be the one the route
 * revalidates on, or the front page and every page under it go stale on
 * different clocks, so it is read from the route rather than pinned twice.
 */
check(
  "the landing page's cache rule cannot swallow a site homepage",
  (() => {
    const proxy = strip(read("proxy.ts"))
    // The rewrite is a ternary now: a page with no AI site goes to /w, the
    // rest to /site. The header rule sits below it and applies to both.
    const at = proxy.indexOf("const isWebsite = (!looksLikeFile || seoFile)")
    const body = proxy.slice(at, proxy.indexOf("return rewritten", at) + 20)
    const route = read("app/(site)/w/[username]/page.tsx")
    const seconds = /export const revalidate = (\d+)/.exec(route)?.[1]
    return (
      seconds !== undefined &&
      /if \(pathname === "\/"\)/.test(body) &&
      body.includes(`rewritten.headers.set("Cache-Control", "public, s-maxage=${seconds}, stale-while-revalidate=`)
    )
  })(),
)

// ---------------------------------------------------------------------------
section("One bad file does not destroy a whole edit")
// ---------------------------------------------------------------------------

/**
 * WHERE THE IMAGES WENT.
 *
 * File size was checked only by `projectError`, at the very end, when the whole
 * changed set is committed. So a model asked for an image — with no upload
 * available to it, which is still the state of the product — would inline the
 * picture as a base64 data URI, sail past `write_file`, finish the run, and
 * have EVERY edit in that run thrown away by the one oversized file. The
 * creator paid for the tokens and got nothing, and the thing they asked for was
 * the thing that destroyed it.
 *
 * Refused at the point of writing, the model still has its turns left: it reads
 * the message, uses a URL, and the run succeeds. Verified against a real
 * workspace — a 700KB inline image is refused, the earlier edit in the same run
 * survives, and the corrected write goes through.
 */
check(
  "an oversized write is refused where it happens, not where it is saved",
  (() => {
    const tools = strip(read("lib/sites/agent/tools.ts"))
    return (
      /function fileSizeError/.test(tools) &&
      /MAX_FILE_BYTES/.test(tools) &&
      // both writers, not just the one somebody remembered
      (tools.match(/const tooBig = fileSizeError\(path, content\)/g) ?? []).length === 2 &&
      // and it says what to do instead
      /reference it by URL instead/.test(tools)
    )
  })(),
)

/**
 * The refusal has to leave the rest of the run intact — the point is that the
 * model can recover, not that it fails earlier.
 */
check(
  "a refused write changes nothing",
  (() => {
    const tools = strip(read("lib/sites/agent/tools.ts"))
    const at = tools.indexOf('case "write_file"')
    const body = tools.slice(at, tools.indexOf('case "create_file"', at))
    const refusal = body.indexOf("if (tooBig) return tooBig")
    const mutation = body.indexOf("this.files[path] = content")
    return refusal > -1 && mutation > refusal
  })(),
)

/**
 * And the model is told the rule up front rather than discovering it by
 * failing — an agent that has to learn a constraint by hitting it spends a
 * turn and a creator's money doing so.
 */
check(
  "the agent knows media is referenced, not inlined",
  (() => {
    const loop = read("lib/sites/agent/loop.ts")
    return (
      /IMAGES AND MEDIA are referenced by URL/.test(loop) &&
      /Never inline a picture, a video or a font as a base64 data: URI/.test(loop)
    )
  })(),
)

// ---------------------------------------------------------------------------
section("Uploaded media")
// ---------------------------------------------------------------------------

/**
 * `site_assets` existed since the projects migration and NO CODE HAD EVER
 * WRITTEN TO IT. So there was no way to put a picture on a site, and a model
 * asked for one did the only thing available to it — inlined the image as a
 * base64 data URI, blew the per-file limit, and took the entire edit down with
 * it. This is the half that was missing: somewhere for the bytes to live.
 *
 * Text in the database, binary in object storage, referenced by URL — the
 * shape Bolt, Lovable and v0 all land on, because you otherwise pay database
 * prices for CDN work.
 */
check(
  "media is stored as bytes in a bucket and a row that points at them",
  (() => {
    const assets = strip(read("lib/sites/assets.ts"))
    const migration = read("supabase/migrations/20260917_site_asset_uploads.sql")
    return (
      /ASSET_BUCKET = "site-assets"/.test(assets) &&
      /storage\.buckets/.test(migration) &&
      /site_assets_public_read/.test(migration) &&
      // the row records where the bytes went and how to reach them
      /storage_key: key/.test(assets) &&
      /url,/.test(assets)
    )
  })(),
)

/**
 * SVG IS ABSENT ON PURPOSE. An SVG is a document, not a picture: it can carry
 * `<script>` and is served as image/svg+xml from a URL with our name on it.
 * Hosting somebody else's executable document is not a feature — and a creator
 * loses nothing, because an inline <svg> written into a component already
 * works and is already sandboxed by the site's own CSP.
 *
 * Checked against eleven real cases: photos, video and fonts allowed; SVG,
 * HTML, JS, a renamed executable, an empty file and an oversized video all
 * refused.
 */
check(
  "nothing executable can be uploaded",
  (() => {
    const assets = read("lib/sites/assets.ts")
    const allowed = assets.slice(assets.indexOf("const ALLOWED"), assets.indexOf("export interface SiteAsset"))
    return (
      !/svg/i.test(allowed) &&
      !/text\/html/.test(allowed) &&
      !/javascript/.test(allowed) &&
      // the stored extension comes from our table, never from the filename
      /\$\{ALLOWED\[mime\]\}/.test(assets)
    )
  })(),
)

/**
 * The stored key is a UUID, so a name is never reused, a file behind a URL
 * never changes, and nothing a creator types can be read as a path.
 */
check(
  "an uploaded file cannot collide, traverse, or be renamed into something else",
  (() => {
    const assets = strip(read("lib/sites/assets.ts"))
    const at = assets.indexOf("function storageKey")
    const body = assets.slice(at, assets.indexOf("\n}", at))
    return (
      /crypto\.randomUUID\(\)/.test(body) &&
      /sites\/\$\{siteId\}\//.test(body) &&
      !/filename/.test(body)
    )
  })(),
)

/**
 * Bytes without a row are invisible: nobody can see them, delete them, or
 * account for them. If the record fails to write, the object goes with it.
 */
check(
  "a failed record does not leave bytes behind",
  (() => {
    const assets = strip(read("lib/sites/assets.ts"))
    const at = assets.indexOf("if (rowError || !row)")
    const body = assets.slice(at, assets.indexOf("return { ok: false", at))
    return /storage\.from\(ASSET_BUCKET\)\.remove\(\[key\]\)/.test(body)
  })(),
)

/**
 * Ownership is proved through the signed-in user's client so RLS answers it,
 * and only then does the write go through the admin client — a creator who
 * could write to the bucket directly could put a file under another creator's
 * prefix and have it served from an address with our name on it.
 */
check(
  "uploads prove ownership before they touch the bucket",
  (() => {
    const route = strip(read("app/api/sites/[siteId]/assets/route.ts"))
    const post = route.slice(route.indexOf("export async function POST"))
    const resolved = post.indexOf("await resolveSite(siteId)")
    const uploaded = post.indexOf("await uploadAsset(")
    return resolved > -1 && uploaded > resolved && /if \(!found\.ok\) return found\.response/.test(post)
  })(),
)

/**
 * Refused on the DECLARED size before the body is read. Reading a 400MB upload
 * to discover it is too big is how a route gets killed by its own memory limit
 * instead of answering.
 */
check(
  "an oversized upload is refused before it is read into memory",
  (() => {
    const route = strip(read("app/api/sites/[siteId]/assets/route.ts"))
    const refusal = route.indexOf("file.size > MAX_ASSET_BYTES")
    const read_ = route.indexOf("await file.arrayBuffer()")
    return refusal > -1 && read_ > refusal && /status: 413/.test(route)
  })(),
)

/**
 * Without this the model has no idea an upload happened, so it invents a stock
 * photograph and the creator watches their own picture be ignored.
 */
check(
  "the agent is told which media the creator uploaded",
  (() => {
    const context = strip(read("lib/sites/agent/context.ts"))
    const run = strip(read("lib/sites/agent/run.ts"))
    return (
      /assets: SiteAsset\[\] = \[\]/.test(context) &&
      /prefer them over any stock image/.test(context) &&
      /listAssets\(siteId\)/.test(run) &&
      /describeProject\(files, assets\)/.test(run)
    )
  })(),
)

/**
 * Dropped or pasted, the file uploads IMMEDIATELY rather than riding along
 * with the message. Somebody who attaches a photo and closes the tab should
 * still find it next time, and a message carrying a half-uploaded file can
 * fail for a reason that has nothing to do with what they asked for.
 */
check(
  "media can be dropped or pasted, and uploads on the spot",
  (() => {
    const pane = strip(read("components/sites/editor/chat-pane.tsx"))
    return (
      /onDrop=/.test(pane) &&
      /onPaste=/.test(pane) &&
      /event\.clipboardData\.files/.test(pane) &&
      /\/assets`, \{ method: "POST", body \}/.test(pane) &&
      // and the URL joins the draft without eating what was already typed
      /previous\.trimEnd\(\)/.test(pane)
    )
  })(),
)

// ---------------------------------------------------------------------------
section("The project's durable understanding")
// ---------------------------------------------------------------------------

/**
 * THE GAP THAT MADE THE RECORD USELESS FOR MOST PROJECTS.
 *
 * The manifest only ever filled in when the model volunteered a call to
 * `update_manifest`. A site built before it existed — or one where it simply
 * never came up — had nothing recorded, permanently, which was the state most
 * projects were actually in.
 *
 * The seed reads the first thing the creator ever said. For a site built from
 * "a barber shop in Frankfurt" that sentence IS its purpose, and it is more
 * accurate than anything inferred from the code because it is what they asked
 * for. One indexed query, no model call.
 */
check(
  "a project that has never been described gets a first draft for free",
  (() => {
    const manifest = strip(read("lib/sites/manifest.ts"))
    const run = strip(read("lib/sites/agent/run.ts"))
    const at = manifest.indexOf("export async function seedManifest")
    const body = manifest.slice(at, manifest.indexOf("\n}", manifest.indexOf("Promise<ProjectManifest | null>", at)))
    return (
      /\.eq\("role", "user"\)/.test(body) &&
      /\.order\("created_at", \{ ascending: true \}\)/.test(body) &&
      /\.limit\(1\)/.test(body) &&
      /const manifest = stored \?\? \(await seedManifest\(siteId\)/.test(run)
    )
  })(),
)

/**
 * A seed is a starting point for THIS run's prompt, not a fact. Persisting a
 * guess before the model has looked at the project would put low-confidence
 * text exactly where future runs go looking for something trustworthy — which
 * is why the write-back merges against `stored`, not against the seed.
 */
check(
  "a guess is never written back as though it were established",
  (() => {
    const run = strip(read("lib/sites/agent/run.ts"))
    return /writeManifest\(siteId, mergeManifest\(stored, workspace\.manifestUpdate\)\)/.test(run)
  })(),
)

/**
 * Asked only when there is nothing recorded, and only on a run already reading
 * the project — so establishing what the site IS costs no extra call and no
 * extra turn. Asking every run would spend a tool call restating what is
 * already written down.
 */
check(
  "a thin record asks this run to fill it, a full one does not",
  (() => {
    const manifest = strip(read("lib/sites/manifest.ts"))
    const loop = strip(read("lib/sites/agent/loop.ts"))
    const run = strip(read("lib/sites/agent/run.ts"))
    return (
      /export function manifestIsThin/.test(manifest) &&
      /return filled < 2/.test(manifest) &&
      /thin: manifestIsThin\(manifest\)/.test(run) &&
      /if \(context\.thin\)/.test(loop) &&
      /NOTHING DURABLE IS RECORDED ABOUT THIS PROJECT YET/.test(loop)
    )
  })(),
)

/**
 * A summary drifts: somebody changes a palette by hand, or an earlier run
 * described the site before it became something else. A model that trusts the
 * note over the file will "match the existing style" against a style that is
 * no longer there. Stated as an ORDER rather than a warning, because "be
 * careful" is not something a model can act on and a ranking is.
 */
check(
  "the code outranks the record when they disagree",
  (() => {
    const loop = read("lib/sites/agent/loop.ts")
    const at = loop.indexOf("WHEN SOURCES DISAGREE")
    const body = loop.slice(at, at + 700)
    return (
      at > -1 &&
      /1\. What the creator just asked for/.test(body) &&
      /2\. The code as it is now/.test(body) &&
      /3\. The recorded understanding/.test(body) &&
      /the files win/.test(body)
    )
  })(),
)

/**
 * COLOURS AND TYPOGRAPHY ARE STILL NOT STORED, and that is the point. They
 * live in src/styles.css, which is the truth; a copy in the record becomes a
 * second truth that goes stale the first time somebody edits a token, and a
 * record confidently stating the wrong primary colour is worse than none
 * because the model would believe it. Pages and components are derived for the
 * same reason — a stored list is wrong the moment somebody adds one.
 */
check(
  "anything the files can answer is not remembered",
  (() => {
    const manifest = read("lib/sites/manifest.ts")
    const shape = manifest.slice(
      manifest.indexOf("export interface ProjectManifest"),
      manifest.indexOf("}", manifest.indexOf("export interface ProjectManifest")),
    )
    const forbidden = ["color", "colour", "font", "spacing", "radius", "palette", "pages", "components"]
    if (forbidden.some((w) => shape.toLowerCase().includes(w))) return false

    const context = strip(read("lib/sites/agent/context.ts"))
    const map = strip(read("lib/sites/agent/repo-map.ts"))
    return /export function pageNames/.test(context) && /export function buildRepoMap/.test(map)
  })(),
)

/**
 * The two fields a project cannot tell you about itself: what it is FOR, and
 * how it should sound. Neither is recoverable from the code at any price.
 */
check(
  "what the site is for, and how it sounds, are recordable",
  (() => {
    const manifest = strip(read("lib/sites/manifest.ts"))
    const tools = strip(read("lib/sites/agent/tools.ts"))
    return (
      /primaryGoal\?: string/.test(manifest) &&
      /tone\?: string/.test(manifest) &&
      /primaryGoal: \{/.test(tools) &&
      /tone: \{/.test(tools) &&
      // strict mode still needs every declared property required
      /"primaryGoal",/.test(tools) &&
      /"tone",/.test(tools)
    )
  })(),
)

/**
 * Supplying one field must not erase the rest, decisions must not repeat, and
 * the list must not grow without bound until it crowds the prompt it exists to
 * inform. Verified behaviourally against the real functions.
 */
check(
  "the record merges rather than overwrites, and stays small",
  (() => {
    const manifest = strip(read("lib/sites/manifest.ts"))
    const at = manifest.indexOf("export function mergeManifest")
    const body = manifest.slice(at, manifest.indexOf("\n}", manifest.indexOf("): ProjectManifest {", at)))
    return (
      /const base: ProjectManifest = \{ \.\.\.\(current \?\? \{\}\) \}/.test(body) &&
      /if \(value\) base\[key\] = value/.test(body) &&
      /seen\.has\(add\.toLowerCase\(\)\)/.test(body) &&
      /slice\(-MAX_DECISIONS\)/.test(body)
    )
  })(),
)

// ---------------------------------------------------------------------------
section("The agent cannot declare victory early")
// ---------------------------------------------------------------------------

/**
 * THE BUG, AND THE ONE LINE THAT CAUSED IT.
 *
 * `if (turn.toolCalls.length === 0) { status = "succeeded" }` — a turn with no
 * tool calls was read as "the model is finished", and the loop believed it.
 * The comment beside it admitted the model could do this "at any point,
 * including before it has changed anything". Asked to make a site much more
 * complete and premium, it changed one section, went quiet, and the run was
 * recorded as a success.
 *
 * Silence is a claim, not a fact. It is now checked against the plan the agent
 * itself wrote and against whether the project builds, and the reason is fed
 * back as a turn so the run continues rather than ending.
 */
check(
  "going quiet is checked, not believed",
  (() => {
    const loop = strip(read("lib/sites/agent/loop.ts"))
    const at = loop.indexOf("if (turn.toolCalls.length === 0)")
    const body = loop.slice(at, loop.indexOf("break\n      }", at))
    return (
      /const refusal = refuseToFinish\(/.test(body) &&
      /turns\.push\(\{ role: "user", content: refusal \}\)/.test(body) &&
      /continue/.test(body) &&
      // and the refusal is counted, so a stuck model cannot be looped forever
      /refusals \+= 1/.test(body)
    )
  })(),
)

/**
 * Every way a run can be unfinished, refused with an instruction rather than
 * an error — this text goes back INTO the run, so it is the difference between
 * the model knowing what to do next and the model apologising.
 */
check(
  "a run may not end with its own plan outstanding, or on a red build",
  (() => {
    const plan = strip(read("lib/sites/agent/plan.ts"))
    const at = plan.indexOf("export function refuseToFinish")
    const body = plan.slice(at)
    return (
      /You have not written a plan/.test(body) &&
      /needs at least \$\{state\.minSteps\}/.test(body) &&
      /These steps are still open/.test(body) &&
      /You have not changed anything/.test(body) &&
      /never built/.test(body) &&
      /Do not finish on a failing build/.test(body)
    )
  })(),
)

/**
 * ---------------------------------------------------------------------------
 *  A FIRST GENERATION MAY NOT STOP AT ONE PAGE
 * ---------------------------------------------------------------------------
 * The complaint: every build came out as one long landing page. Half of that
 * was vocabulary and is fixed in the section library. The other half is that
 * nothing ever told the model a single page was not an answer — and a prompt
 * cannot, because "build several pages" is agreeable and unenforced.
 *
 * Called rather than grepped. The refusal text is what goes back into the run,
 * so what matters is which state produces one, not which words are in the file.
 */
{
  const green: CompletionState = {
    plan: { steps: [], revisions: 0 },
    requiresPlan: false,
    minSteps: 0,
    buildOk: true,
    changedAnything: true,
    isQuestion: false,
    refusals: 0,
  }

  check(
    "a new site that is still one page is not finished",
    !!refuseToFinish({
      ...green,
      scope: { firstGeneration: true, pages: 1, sections: 6 },
    }),
  )

  check(
    "and four pages carrying almost nothing is not either",
    /**
     * Four pages with a nav, a footer and one line each is technically four
     * pages and still nothing to read. The section count is what stops the
     * floor being met by splitting one page up.
     */
    !!refuseToFinish({
      ...green,
      scope: { firstGeneration: true, pages: 4, sections: 8 },
    }),
  )

  check(
    "a real site passes",
    refuseToFinish({
      ...green,
      scope: { firstGeneration: true, pages: MIN_PAGES, sections: MIN_SECTIONS },
    }) === null,
  )

  check(
    "editing an existing one-page site is never refused for being one page",
    /**
     * The floor is about what a build produces from nothing. Refusing "make
     * the hero blue" because the site somebody already has is one page would
     * make it unusable.
     */
    refuseToFinish({
      ...green,
      scope: { firstGeneration: false, pages: 1, sections: 3 },
    }) === null,
  )

  check(
    "a project with no countable pages is not guessed at",
    /**
     * A code project has no document, so it has no page count. Applying the
     * floor to it would refuse runs on projects this knows nothing about.
     */
    refuseToFinish({ ...green, scope: undefined }) === null,
  )

  check(
    "and the floor still yields to the refusal cap",
    /**
     * A creator who genuinely wants one page gets one: the model is nudged
     * twice, says so in its reply, and the run completes. A floor that could
     * never be satisfied would grind the turn budget away and bill for it.
     */
    refuseToFinish({
      ...green,
      refusals: MAX_REFUSALS,
      scope: { firstGeneration: true, pages: 1, sections: 1 },
    }) === null,
  )

  check(
    "the refusal says what to build, not that something went wrong",
    (() => {
      const text =
        refuseToFinish({ ...green, scope: { firstGeneration: true, pages: 1, sections: 5 } }) ?? ""
      // It is fed back INTO the run, so it has to be an instruction.
      return (
        text.includes("create_page") &&
        text.includes("add_section") &&
        /\/services|\/contact/.test(text) &&
        !/error|failed|sorry/i.test(text)
      )
    })(),
  )
}

/**
 * The site's shape is read from BEFORE the run, not after. Once the model has
 * added a page the site is no longer empty, so a scope computed at the end
 * would switch the floor off exactly when it started applying.
 */
check(
  "whether this was a first generation is decided before the run, not during",
  (() => {
    const loop = strip(read("lib/sites/agent/loop.ts"))
    const declared = loop.indexOf("const startedEmpty = isEmptySite(")
    const used = loop.indexOf("siteScope(workspace.document, startedEmpty)")
    const loopStarts = loop.indexOf("for (let attempt = 1;")
    return (
      declared > 0 &&
      used > 0 &&
      loopStarts > 0 &&
      declared < loopStarts &&
      used > loopStarts
    )
  })(),
)

/**
 * A question is answered by reading and replying. Demanding an edit would
 * refuse a run that did exactly what was asked — while a run that was TOLD to
 * do something and changed nothing is the original bug wearing a different
 * hat.
 */
check(
  "answering a question is not mistaken for doing nothing",
  (() => {
    const plan = strip(read("lib/sites/agent/plan.ts"))
    const loop = strip(read("lib/sites/agent/loop.ts"))
    return (
      /export function looksLikeQuestion/.test(plan) &&
      /if \(!state\.changedAnything && !state\.isQuestion\)/.test(plan) &&
      /isQuestion: looksLikeQuestion\(prompt\)/.test(loop)
    )
  })(),
)

/**
 * A model that cannot satisfy the gate after a couple of corrections is stuck,
 * and grinding it until the turn budget runs out turns a partial result into a
 * failed run and bills for the difference.
 */
check(
  "a stuck run is released rather than ground down",
  (() => {
    const plan = strip(read("lib/sites/agent/plan.ts"))
    return /if \(state\.refusals >= MAX_REFUSALS\) return null/.test(plan) && /MAX_REFUSALS = 2/.test(plan)
  })(),
)

/**
 * A flat twelve turns for everything is what made a broad ask produce one
 * small edit: a model that senses it is running out of room stops early,
 * rationally. Checked against twelve real phrasings.
 */
check(
  "the budget scales with what was asked",
  (() => {
    /**
     * Called, not grepped. The first version pinned the literal turn counts —
     * `maxTurns: 12`, `maxTurns: 24` — so raising them broke a test that was
     * never guarding anything: the property that matters is the ORDER, and a
     * number in a regex cannot say that. It also went stale the moment anyone
     * tuned a budget, which is the opposite of useful.
     */
    const small = classifyComplexity("change the word Home to Start")
    const medium = classifyComplexity("add a pricing section")
    const large = classifyComplexity("make the whole site more premium")

    return (
      small.complexity === "small" &&
      medium.complexity === "medium" &&
      large.complexity === "large" &&
      small.maxTurns < medium.maxTurns &&
      medium.maxTurns < large.maxTurns &&
      small.maxTokens < medium.maxTokens &&
      medium.maxTokens < large.maxTokens &&
      // A specific change is not made to write a plan about itself.
      small.requiresPlan === false &&
      medium.requiresPlan === true &&
      large.requiresPlan === true
    )
  })(),
)

check(
  "no request gets so little room that it stops mid-edit",
  (() => {
    /**
     * A reported number, not a derived one, and the only reason it is written
     * down: runs were ending with "The edit reached its limit of 12 steps and
     * was stopped." Twelve is enough for change-a-word, build, done — and the
     * ordering test above passes happily with it — so nothing else here would
     * notice it coming back.
     *
     * Twenty is a floor, not a target. Every budget is a ceiling and a
     * one-word change still finishes in two turns.
     */
    return (["small", "medium", "large"] as const).every(
      (kind) =>
        classifyComplexity(
          kind === "small"
            ? "change the word Home to Start"
            : kind === "medium"
              ? "add a pricing section"
              : "make the whole site more premium",
        ).maxTurns >= 20,
    )
  })(),
)

check(
  "building a site from nothing gets the largest budget, whatever words were used",
  (() => {
    /**
     * THE BUG THIS EXISTS FOR.
     *
     * "make this website for selling digital products" contains no phrase on
     * either list and is 46 characters long, so it classified SMALL — twelve
     * turns and no plan, for building an entire website. The run hit the cap
     * and stopped with "reached its limit of 12 steps" partway through.
     *
     * It was never a wording problem to be fixed by adding phrases. Reading
     * the sentence cannot tell you the site is empty; the site can.
     */
    const asWritten = classifyComplexity("make this website for selling digital products")
    const fromNothing = classifyComplexity(
      "make this website for selling digital products",
      true,
    )
    return (
      asWritten.complexity === "small" &&
      fromNothing.complexity === "large" &&
      // even a one-word request builds the whole site when there is no site
      classifyComplexity("hi", true).complexity === "large"
    )
  })(),
)

check(
  "and the run asks the site, not only the sentence",
  (() => {
    const run = strip(read("lib/sites/agent/run.ts"))
    return /const budget = classifyComplexity\(prompt, isEmptySite\(document\)\)/.test(run)
  })(),
)

check(
  "a first build has room to reach the floor it is held to",
  (() => {
    /**
     * The floor demands four pages and fourteen sections. A budget that could
     * not reach it would be two rules pulling against each other: the gate
     * refusing to let the run stop, and the turn cap stopping it anyway.
     *
     * One turn per section is already pessimistic — add_section calls batch —
     * so this is a floor on the floor, not a prediction.
     */
    return classifyComplexity("anything", true).maxTurns > MIN_PAGES + MIN_SECTIONS * 2
  })(),
)

/**
 * A noun names WHERE the work is, never how much of it there is. "hero",
 * "footer" and "pricing" were on the medium list, which made "make the hero
 * text white" — a one-word change — ask for a plan and twenty-four turns.
 */
check(
  "a bare component name does not inflate a small request",
  (() => {
    const c = read("lib/sites/agent/complexity.ts")
    const medium = c.slice(c.indexOf("const MEDIUM = ["), c.indexOf("const BUDGETS:"))
    return (
      !/^\s*"hero",/m.test(medium) &&
      !/^\s*"footer",/m.test(medium) &&
      !/^\s*"navbar",/m.test(medium) &&
      !/^\s*"pricing",/m.test(medium) &&
      // the verbs that DO mean substantial work are still there
      /"redesign"/.test(medium) && /"rebuild"/.test(medium)
    )
  })(),
)

/**
 * Searching beats reading everything: without it the only way to find where
 * something lives is to open files until it turns up, which spends the budget
 * on discovery instead of work.
 */
check(
  "the agent can search, and edit without rewriting whole files",
  (() => {
    const tools = strip(read("lib/sites/agent/tools.ts"))
    return (
      /case "search_code"/.test(tools) &&
      /case "replace_in_file"/.test(tools) &&
      (() => {
        /**
         * Scoped to the HANDLER, not the whole file — the tool description
         * also contains the words "appears more than once", so a
         * whole-file match passed even with the check deleted. Replacing the
         * first of several identical strings is a silent, plausible-looking
         * corruption: the file still compiles and the wrong line changed.
         */
        const at = tools.indexOf('case "replace_in_file"')
        const body = tools.slice(at, tools.indexOf('case "set_plan"', at))
        return (
          /file\.indexOf\(oldText, first \+ 1\) !== -1/.test(body) &&
          /const tooBig = fileSizeError\(path, updated\)/.test(body)
        )
      })()
    )
  })(),
)

/**
 * WHAT THE AGENT NEEDS AT RUNTIME HAS TO BE INSTALLED AT RUNTIME.
 *
 * `typescript` was a devDependency while run_build depended on it to typecheck
 * a project before letting a run finish. A production install without dev
 * packages has no compiler, and the checker degrades to "could not check" —
 * silently, on every run, so the gate would have looked present and gated
 * nothing. That is the failure mode the self-check was built to avoid, arriving
 * through the package manifest instead.
 *
 * Both it and esbuild are also external to the bundler: esbuild ships a
 * per-platform binary, and neither belongs inside a serverless bundle.
 */
check(
  "everything the agent loads at runtime is a real dependency",
  (() => {
    const pkg = JSON.parse(read("package.json"))
    const config = read("next.config.mjs")
    const runtime = ["typescript", "esbuild", "openai"]
    return (
      runtime.every((name) => !!pkg.dependencies?.[name] && !pkg.devDependencies?.[name]) &&
      /serverExternalPackages:[^\]]*'esbuild'/.test(config) &&
      /serverExternalPackages:[^\]]*'typescript'/.test(config)
    )
  })(),
)

/**
 * The build verdict is RECORDED, not just returned. "The model said it built"
 * is not the same as it having built, and the gate needs the difference.
 */
check(
  "the gate knows whether the project actually compiles",
  (() => {
    const tools = strip(read("lib/sites/agent/tools.ts"))
    const at = tools.indexOf('case "run_build"')
    const body = tools.slice(at, tools.indexOf("case \"read_build_errors\"", at))
    /**
     * THREE STAGES, AND THE ORDER IS THE POINT.
     *
     * esbuild strips types rather than checking them, so a green bundle said
     * only "this parses". TypeScript then proves the types line up, and still
     * executes nothing — so `const items = null` followed by `items.map(…)`
     * passed both and showed a blank page the moment it was opened. The third
     * stage renders the project.
     *
     * A failure at any stage records `false`. Only reaching the end records a
     * pass, and a check that could not run never speaks for one that did.
     */
    return (
      /const types = typecheck \? await typecheck/.test(body) &&
      /const rendered = render \? await render/.test(body) &&
      /if \(types && !types\.ok\) \{/.test(body) &&
      /if \(rendered && !rendered\.ok\) \{/.test(body) &&
      (body.match(/this\.lastBuildOk = false/g) ?? []).length === 4 &&
      // credentials first: free, deterministic, and true whether or not it compiles
      /const leaked = scanForSecrets\(this\.files\)/.test(body) &&
      body.indexOf("scanForSecrets") < body.indexOf("bundleProject") &&
      // the render is only reached once the types are clean
      body.indexOf("await typecheck") < body.indexOf("await render") &&
      // and a pass is the LAST thing in the handler, after every stage
      body.lastIndexOf("this.lastBuildOk = true") > body.indexOf("await render")
    )
  })(),
)

/**
 * Status, never reasoning. What the agent is DOING is useful to watch; what it
 * is thinking is not something to put on screen.
 */
check(
  "the run streams where it has got to, and its checklist",
  (() => {
    const types = strip(read("lib/sites/agent/types.ts"))
    const loop = strip(read("lib/sites/agent/loop.ts"))
    return (
      /type: "state"/.test(types) &&
      /**
       * Membership, not formatting. Pinning the union as one line broke the
       * day "asking" was added and the type was wrapped — which told nobody
       * anything, since what matters is that the state exists and the client
       * renders it, never how prettier laid it out.
       */
      ["inspecting", "planning", "executing", "asking", "verifying", "repairing"].every((state) =>
        new RegExp(`\\| "${state}"`).test(types),
      ) &&
      /type: "plan"; steps: Array<\{ title: string; done: boolean \}>/.test(types) &&
      /yield \{\s*type: "plan"/.test(loop) &&
      /state: workspace\.buildOk === false \? "repairing" : "verifying"/.test(loop)
    )
  })(),
)

/**
 * esbuild STRIPS types rather than checking them: it catches a syntax error
 * and an import that resolves nowhere, and is completely silent about a prop
 * passed with the wrong shape or a property that does not exist. So a green
 * build meant "this parses", and the agent — told not to finish on a failing
 * build — could finish on a project that throws when somebody opens it.
 *
 * Verified end to end: a project that bundles cleanly but passes a number
 * where a string is expected now sets buildOk = false, and setting the prop
 * correctly sets it back to true.
 */
check(
  "a type error is caught, not stripped and shipped",
  (() => {
    const tc = strip(read("lib/sites/typecheck.ts"))
    const run = strip(read("lib/sites/agent/run.ts"))
    return (
      /export async function typecheckProject/.test(tc) &&
      /getSemanticDiagnostics/.test(tc) &&
      /typecheck: async \(projectFiles\)/.test(run)
    )
  })(),
)

/**
 * A typechecker that reports errors on correct code is worse than none: the
 * completion gate would refuse to let ANY run finish, and every creator would
 * be told their working site is broken. Type environments are assembled from
 * whatever happens to be installed, so before its verdict may block anything
 * it is asked about a project known to be correct — and if it gets THAT wrong,
 * every result becomes "could not check". The feature degrades to silence
 * rather than to obstruction.
 *
 * This is not theoretical. The first implementation built a virtual compiler
 * host and failed the reference project on `StrictMode`; the self-check caught
 * it and disabled itself instead of blocking every run.
 */
check(
  "the typechecker proves itself before it is trusted",
  (() => {
    const tc = strip(read("lib/sites/typecheck.ts"))
    return (
      /const REFERENCE: ProjectFiles/.test(tc) &&
      /async function environmentIsTrustworthy/.test(tc) &&
      /if \(!trustworthy\)/.test(tc) &&
      // decided once per process, not per build
      /selfCheck \?\?=/.test(tc)
    )
  })(),
)

/**
 * Reimplementing module resolution to check three files is the wrong trade.
 * The hand-written CompilerHost could not satisfy React 19's JSX namespace —
 * `react/jsx-runtime` imports "./" to reach it — and produced "'StrictMode'
 * cannot be used as a JSX component" on plainly correct code. Writing the
 * files next to the real node_modules lets TypeScript resolve exactly as it
 * does for any project.
 */
check(
  "the check runs the way TypeScript normally runs",
  (() => {
    const tc = strip(read("lib/sites/typecheck.ts"))
    return (
      /ts\.createCompilerHost\(options, true\)/.test(tc) &&
      /mkdtemp/.test(tc) &&
      // and the copy of somebody's project does not outlive the check
      /rm\(dir, \{ recursive: true, force: true \}\)/.test(tc)
    )
  })(),
)

/**
 * Build configuration is not the thing being verified. `vite.config.ts`
 * imports packages whose types are deliberately not shipped, so checking it
 * reported two errors on every project about scaffold nobody wrote.
 */
check(
  "only the creator's own code is checked",
  (() => {
    const tc = strip(read("lib/sites/typecheck.ts"))
    return /p\.startsWith\("src\/"\) && \/\\\.\(ts\|tsx\)\$\/\.test\(p\)/.test(tc)
  })(),
)

/**
 * `prompt.length > 600 || fileCount > 25` routed on how much somebody TYPED
 * rather than how much they asked for, so "Make this website much more complex,
 * premium and complete" got the cheap model because the sentence was short.
 * The broad asks that most need planning were the ones systematically denied
 * the model that can do it — a direct cause of shallow, one-edit results.
 */
check(
  "the strong model goes to the requests that need it",
  (() => {
    const models = strip(read("lib/sites/agent/models.ts"))
    const at = models.indexOf("export function chooseModel")
    const body = models.slice(at)
    return (
      /const budget = classifyComplexity\(prompt\)/.test(body) &&
      /if \(budget\.complexity !== "small"\) return STRONG_MODEL/.test(body) &&
      !/prompt\.length > 600/.test(body)
    )
  })(),
)


// ===========================================================================
section("The repo map: what the agent knows without reading a file")
// ===========================================================================

const MAP_PROJECT: Record<string, string> = {
  "index.html": "<div id=\"root\"></div><script type=\"module\" src=\"/src/main.tsx\"></script>",
  "src/main.tsx": `import { StrictMode } from "react"
import App from "./App"
createRoot(document.getElementById("root")).render(<StrictMode><App /></StrictMode>)
`,
  "src/App.tsx": `import Hero from "./components/Hero"
import Footer from "./components/Footer"

export default function App() {
  return (
    <main>
      <Hero />
      <Footer />
    </main>
  )
}
`,
  "src/components/Hero.tsx": `export default function Hero() {
  return (
    <section>
      <h1>We don't cut corners</h1>
      <p>It's the barber's chair you will want to sit in.</p>
    </section>
  )
}

export const HERO_ID = "hero"
`,
  "src/components/Footer.tsx": `export function Footer() {
  return <footer>© 2026</footer>
}
export default Footer
`,
  // Imported by App but never rendered — the shape of "why isn't my section
  // showing up".
  "src/components/Testimonials.tsx": `export default function Testimonials() {
  return <section>Kind words</section>
}
`,
  "src/hooks/useBooking.ts": `export function useBooking() {
  return { open: false }
}
export type Booking = { at: string }
`,
  "vite.config.ts": `import { defineConfig } from "vite"
export default defineConfig({})
`,
  "src/styles.css": ":root { --bg: #fff; }",
}

{
  const map = buildRepoMap(MAP_PROJECT)
  const file = (path: string) => map.files.find((f) => f.path === path)

  check("the entry point is identified from index.html", map.entry === "src/main.tsx")

  /**
   * THE FAILURE THIS DESIGN EXISTS TO AVOID.
   *
   * Hero.tsx is website copy with an ODD number of apostrophes above its last
   * export — "don't", "It's", "barber's". A scanner
   * that stripped strings before looking would read the first apostrophe as an
   * opening quote and swallow everything to the next one — losing the exports
   * below it, silently, and looking exactly like a file that exports nothing.
   * Every pattern is anchored at column zero for this reason.
   */
  check(
    "prose full of apostrophes does not hide a file's exports",
    file("src/components/Hero.tsx")?.exports.map((e) => e.name).join() === "Hero,HERO_ID",
    JSON.stringify(file("src/components/Hero.tsx")?.exports),
  )

  check(
    "a default function export is marked as one",
    file("src/components/Hero.tsx")?.exports[0]?.isDefault === true &&
      file("src/components/Hero.tsx")?.exports[0]?.kind === "component",
  )

  /**
   * `export const SIZES = [...]` starts with a capital, and the first version
   * of kindOf called it a component — an invitation to render a string array.
   */
  check(
    "an ALL-CAPS constant is not mistaken for a component",
    file("src/components/Hero.tsx")?.exports[1]?.kind === "const",
  )

  check(
    "a hook is recognised by its name, and a type by its keyword",
    file("src/hooks/useBooking.ts")?.exports.map((e) => `${e.name}:${e.kind}`).join() ===
      "useBooking:hook,Booking:type",
    JSON.stringify(file("src/hooks/useBooking.ts")?.exports),
  )

  check(
    "relative imports resolve to real project paths",
    file("src/App.tsx")?.dependsOn.join() === "src/components/Hero.tsx,src/components/Footer.tsx",
    JSON.stringify(file("src/App.tsx")?.dependsOn),
  )

  check(
    "packages are kept apart from project files",
    file("src/main.tsx")?.external.join() === "react" &&
      file("src/main.tsx")?.dependsOn.join() === "src/App.tsx",
  )

  check(
    "the graph runs both ways",
    map.importedBy["src/components/Hero.tsx"]?.join() === "src/App.tsx",
  )

  check(
    "what a file renders is recorded, minus React's own wrappers",
    file("src/App.tsx")?.renders.join() === "Footer,Hero" &&
      file("src/main.tsx")?.renders.join() === "App",
    JSON.stringify(file("src/main.tsx")?.renders),
  )

  check(
    "a component nothing imports is named as an orphan",
    map.orphans.includes("src/components/Testimonials.tsx"),
    map.orphans.join(),
  )
  check(
    "but the entry point is not one — nothing imports it by design",
    !map.orphans.includes("src/main.tsx"),
    map.orphans.join(),
  )

  /**
   * vite.config.ts imports packages the project does not ship and exports a
   * config object. In the map it invites the model to reason about build
   * scaffolding as though it were part of the site.
   */
  check("build config is not part of the map", !file("vite.config.ts"))
  check("neither is the stylesheet, which is not source", !file("src/styles.css"))
}

{
  const map = buildRepoMap(MAP_PROJECT)
  const text = describeRepoMap(map)
  check(
    "the description states exports, imports, users and renders",
    /exports {2}Hero \(default component\)/.test(text) &&
      /used by {2}src\/App\.tsx/.test(text) &&
      /renders {2}Footer, Hero/.test(text),
    text.slice(0, 200),
  )
  /**
   * THE SAVING IS PROPORTIONAL TO THE PROJECT, and on the fixture above it is
   * NEGATIVE — nine files of three lines each are described by a map slightly
   * longer than they are. That is real and worth knowing: the map earns its
   * place on projects with actual components in them, which is every project a
   * creator has after the first prompt. Measured on one of those.
   */
  const realistic: Record<string, string> = { ...MAP_PROJECT }
  for (let i = 0; i < 18; i++) {
    realistic[`src/components/Section${i}.tsx`] =
      `import Button from "./Button"\n\nexport default function Section${i}() {\n  return (\n    <section className="s${i}">\n` +
      Array.from({ length: 55 }, (_, l) => `      <p>Line ${l} of section ${i}, with the kind of copy a real page carries.</p>`).join("\n") +
      `\n      <Button />\n    </section>\n  )\n}\n`
  }
  const realCode = Object.values(realistic).join("").length
  const realMap = describeRepoMap(buildRepoMap(realistic)).length
  check(
    "on a project with real components in it the map is a small fraction of the code",
    realMap < realCode * 0.2,
    `map=${realMap} code=${realCode} ratio=${(realMap / realCode).toFixed(2)}`,
  )

  // A project big enough that a paragraph each would BE the context.
  const big: Record<string, string> = { ...MAP_PROJECT }
  for (let i = 0; i < 60; i++) big[`src/components/Gen${i}.tsx`] = `export default function Gen${i}() {\n  return <p>${i}</p>\n}\n`
  const brief = describeRepoMap(buildRepoMap(big))
  check(
    "a large project gets one line per file instead of a block",
    !/used by/.test(brief) && /Gen59 \(default component\)/.test(brief),
  )
}

{
  const map = buildRepoMap(MAP_PROJECT)
  const hero = findUsages(map, "Hero")
  check(
    "find_usages separates defined, imported and rendered",
    hero.definedIn.join() === "src/components/Hero.tsx" &&
      hero.importedBy.join() === "src/App.tsx" &&
      hero.renderedIn.join() === "src/App.tsx",
    JSON.stringify(hero),
  )

  const missing = findUsages(map, "Nowhere")
  check("and says nothing rather than guessing", missing.definedIn.length === 0 && missing.renderedIn.length === 0)
}

{
  // The map goes into the prompt in place of the flat path list it replaced.
  const described = describeProject(MAP_PROJECT, [])
  check(
    "the system prompt carries the map, not a list of paths",
    /PROJECT MAP/.test(described) && /used by/.test(described),
  )
  check(
    "and still names the files the map leaves out",
    /src\/styles\.css/.test(described),
  )
}


/**
 * A tool with no label renders as `replace_in_file` in the creator's
 * transcript — the inside of the machine on their screen. The list had gone
 * stale by five tools before anybody noticed, because nothing checked.
 */
check(
  "every tool the agent can call has words for it in the chat pane",
  (() => {
    const tools = [...strip(read("lib/sites/agent/tools.ts")).matchAll(/^\s{4}name: "([a-z_]+)",$/gm)].map(
      (m) => m[1],
    )
    const pane = read("components/sites/editor/chat-pane.tsx")
    const at = pane.indexOf("const TOOL_LABELS")
    const block = pane.slice(at, pane.indexOf("}", at))
    return (
      tools.length > 0 &&
      tools.every((name) => new RegExp(`^\\s*${name}:`, "m").test(block)) &&
      // and the harness's own step, which is not a tool the model calls
      /compact_context:/.test(block)
    )
  })(),
)

// ===========================================================================
section("Nothing on this domain may answer a frame with a browser error page")
// ===========================================================================

/**
 * "storelib.com refused to connect.", in the middle of a site card.
 *
 * vercel.json sets `X-Frame-Options: DENY` on every path — a sound default
 * from before anything here was framed. A browser ignores it when the response
 * also carries `frame-ancestors`, which is why the cover's SUCCESS path
 * worked. Its failure paths came from `resolveSite`, which is shared by five
 * routes and knows nothing about framing, so they carried no CSP at all — and
 * the blanket header nothing overrode took effect.
 *
 * The shape is what made it hard to see: THE WORSE THINGS WENT, THE UGLIER THE
 * FAILURE. Exactly when a site could not be read — which, while the
 * dashboard's own query was broken, was every card — the creator got a browser
 * error page with our domain in it instead of a blank card.
 *
 * Measured in Chromium, because the precedence is a "SHOULD" in the spec:
 *
 *   RENDERED  frame-ancestors 'self' + X-Frame-Options: DENY
 *   BLOCKED   a 404 with no CSP     + X-Frame-Options: DENY
 *   RENDERED  a 404 that carries frame-ancestors 'self'
 *
 * So: every response a framed route can produce carries the framing policy,
 * and every one of them has a body worth rendering.
 */

/** Every `<iframe src=…>` in the app, with the file it lives in. */
function iframeSources(): Array<{ file: string; src: string }> {
  const roots = ["components", "app"]
  const found: Array<{ file: string; src: string }> = []

  const walk = (dir: string): string[] => {
    if (!existsSync(dir)) return []
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) return walk(full)
      return entry.name.endsWith(".tsx") || entry.name.endsWith(".ts") ? [full] : []
    })
  }

  for (const root of roots) {
    for (const file of walk(join(process.cwd(), root))) {
      const source = readFileSync(file, "utf8")
      // The src can be several lines below the tag in formatted JSX.
      for (const match of source.matchAll(/<iframe\b[\s\S]{0,400}?\ssrc=\{?["'`]([^"'`]*)/g)) {
        found.push({ file: file.replace(`${process.cwd()}/`, ""), src: match[1] })
      }
    }
  }
  return found
}

check(
  "the only iframe pointing at our own domain is the site cover",
  (() => {
    // A src is ours when it is a path rather than a URL. Everything else in
    // this app is YouTube, Spotify, Calendly or a PDF — somebody else's
    // headers, and none of our business.
    const ours = iframeSources().filter((f) => f.src.startsWith("/"))
    /**
     * Two now, and the second is allowed for the same reason the first is:
     * it carries `frame-ancestors 'self'` on its own response. The theme
     * editor frames /website-builder/code over its canvas, and proxy.ts adds
     * the directive ONLY when the page is asked for with `?embedded=1` — see
     * the guard right after this one, which is what stops the pane going
     * blank if somebody tidies that block away.
     */
    const cover = ours.filter((f) => f.src.startsWith("/api/sites/") && f.src.endsWith("/cover"))
    // The src carries an optional `&path=` now, so the assistant's "Open it"
    // lands on the file rather than on the tree with the file somewhere in it.
    const code = ours.filter((f) => f.src.startsWith("/website-builder/code/${installId}?embedded=1"))
    return ours.length === 2 && cover.length === 1 && code.length === 1
  })(),
  JSON.stringify(iframeSources().filter((f) => f.src.startsWith("/"))),
)

check(
  "and the framed code page is granted frame-ancestors, only when embedded",
  (() => {
    const proxy = readFileSync(join(process.cwd(), "proxy.ts"), "utf8")
    const at = proxy.indexOf('url.pathname.startsWith("/website-builder/code/")')
    const block = at > 0 ? proxy.slice(at, at + 500) : ""
    return (
      at > 0 &&
      /searchParams\.get\("embedded"\) === "1"/.test(block) &&
      /frame-ancestors 'self'/.test(block) &&
      // Appended, not replaced: the Capacitor CSP may already be on it.
      /existing \? `\$\{existing\}; frame-ancestors 'self'`/.test(block)
    )
  })(),
)

check(
  "the cover answers every request with the framing policy on it",
  (() => {
    /**
     * STRIPPED. This route's own doc comment quotes `frame-ancestors 'self'`
     * four times while explaining the bug, so a raw read matched the
     * explanation and passed with the directive deleted from the headers.
     */
    const route = strip(read("app/api/sites/[siteId]/cover/route.ts"))

    /**
     * ONE place builds a response. A second one is exactly how the headers
     * went missing the first time — the failure path was somebody else's
     * object, returned unchanged.
     */
    const built = route.match(/new NextResponse\(|NextResponse\.json\(|new Response\(/g) ?? []

    return (
      built.length === 1 &&
      /frame-ancestors 'self'/.test(route) &&
      // never hands back resolveSite's framing-unaware response
      !/return found\.response/.test(route) &&
      // and an unexpected throw is a placeholder, not a framework error page
      /catch/.test(route) &&
      /coverPlaceholder/.test(route)
    )
  })(),
)

check(
  "and every one of those answers is a document, never an empty body",
  (() => {
    const route = strip(read("app/api/sites/[siteId]/cover/route.ts"))
    const cover = read("lib/sites/cover.ts")
    /**
     * A framed response with nothing in it is a blank hole rather than a blank
     * card, and there is no way to tell the two apart from the outside — so
     * the placeholder is what every failure returns.
     */
    const returns = [...route.matchAll(/return cover\(([^,)]*)/g)].map((m) => m[1].trim())
    return (
      returns.length >= 3 &&
      returns.every((argument) => /coverPlaceholder|siteCover/.test(argument)) &&
      /export function coverPlaceholder/.test(cover) &&
      // the placeholder really is a document a browser will paint
      /<!doctype html>/i.test(cover)
    )
  })(),
)

check(
  "a stranger's card and an empty card are the same bytes",
  (() => {
    const route = strip(read("app/api/sites/[siteId]/cover/route.ts"))
    /**
     * 404 covers both "does not exist" and "is not yours", and the words shown
     * must not separate them — a card that said "not yours" would confirm a
     * site exists to somebody who cannot see it.
     */
    return (
      /status === 503 \? "Not available just now" : "Nothing here yet"/.test(route) &&
      !/not yours|does not exist|forbidden/i.test(route)
    )
  })(),
)

// ===========================================================================
section("A card shows a cover or it shows nothing — never somebody's error page")
// ===========================================================================

/**
 * FIXING CAUSES ONE AT A TIME IS A LOSING GAME.
 *
 * The last "storelib.com refused to connect." was the cover route's 404,
 * carrying no `frame-ancestors` for the blanket `X-Frame-Options: DENY` to be
 * overridden by. That is fixed at the route. But a frame shows the browser's
 * error page for a gateway timeout, a middleware refusal, a platform error
 * page, a redirect to somewhere that refuses framing, an empty body, and
 * whatever is invented next — none of which can be enumerated from a card.
 *
 * So the card stopped asking why. The document inside announces itself, and
 * the frame is revealed only when that arrives. Proved in Chromium across
 * every one of those, with the card's own rule driving it:
 *
 *   shown   a built cover
 *   shown   the "nothing here yet" placeholder
 *   shown   a cold cover that takes 4s
 *   hidden  refused by X-Frame-Options (no CSP)
 *   hidden  a middleware 403
 *   hidden  a platform 504 page
 *   hidden  a redirect to a page that refuses framing
 *   hidden  an empty body
 */

check(
  "the cover is revealed only once its own document says hello",
  (() => {
    const card = strip(read("components/sites/sites-dashboard.tsx"))
    return (
      /visibility: coverScale && coverReady \? "visible" : "hidden"/.test(card) &&
      /data\?\.source === "storelib-preview" && data\.kind === "ready"/.test(card)
    )
  })(),
)

check(
  "the sender is proved by its window, never by an origin that reads 'null'",
  (() => {
    const card = strip(read("components/sites/sites-dashboard.tsx"))
    const at = card.indexOf("function useCoverReady")
    const body = card.slice(at, card.indexOf("function SiteCard", at))
    /**
     * The frame is sandboxed onto an opaque origin, so `event.origin` is the
     * string "null" for every sender and proves nothing at all. A reference to
     * the window is the only thing that identifies it.
     */
    return (
      /event\.source !== ref\.current\?\.contentWindow/.test(body) && !/event\.origin/.test(body)
    )
  })(),
)

check(
  "and nothing races a timer against a cold build",
  (() => {
    const card = strip(read("components/sites/sites-dashboard.tsx"))
    const at = card.indexOf("function useCoverReady")
    const body = card.slice(at, card.indexOf("function SiteCard", at))
    /**
     * Measured in Chromium: `load` fires on a frame the browser refused, but
     * on a cover that loads perfectly the ready message arrives AFTER `load` —
     * so deciding there would hide working covers. A timeout only moves the
     * race: a cold cover is a full bundle and can take many seconds. Waiting
     * for the message and nothing else has no race in it.
     */
    return !/setTimeout|setInterval|onLoad|"load"/.test(body)
  })(),
)

check(
  "there is always something underneath the frame to see",
  (() => {
    const card = read("components/sites/sites-dashboard.tsx")
    const placeholder = card.indexOf('className="absolute inset-0 grid place-items-center')
    const frame = card.indexOf("<iframe")
    // Underneath means EARLIER in the DOM: the frame paints on top of it.
    return placeholder > 0 && frame > placeholder
  })(),
)

check(
  "every document the cover route can serve announces itself",
  (() => {
    const cover = read("lib/sites/cover.ts")
    const preview = read("lib/sites/preview-document.ts")
    /**
     * A built cover comes from `previewDocument`, which already sent this. The
     * placeholder did not — so a site that simply has nothing in it yet would
     * have been indistinguishable from a refusal, and its own words would
     * never have been shown.
     */
    const sends = (src: string) =>
      /source: "storelib-preview", kind: "ready"/.test(src) ||
      /source: "storelib-preview", kind: kind/.test(src)
    return (
      sends(preview) &&
      sends(cover) &&
      // and the placeholder really carries it, not just the module
      /\$\{COVER_BRIDGE\}/.test(cover)
    )
  })(),
)

check(
  "the words the frame sends are the words the card listens for",
  (() => {
    /**
     * Two files, one contract, and nothing in the type system holding them
     * together — a rename on either side would leave every card permanently
     * blank with no error anywhere.
     */
    const card = strip(read("components/sites/sites-dashboard.tsx"))
    const cover = read("lib/sites/cover.ts")
    const preview = read("lib/sites/preview-document.ts")
    const listensFor = card.match(/data\?\.source === "([^"]+)" && data\.kind === "([^"]+)"/)
    if (!listensFor) return false
    const [, source, kind] = listensFor
    /**
     * The kind is matched as a LITERAL anywhere in the sender, not as
     * `kind: "…"`. The preview's bridge forwards a variable — `kind: kind` —
     * and names the literal at its call site, `send("ready", "")`; requiring
     * the object-literal shape would have failed a file that is correct.
     */
    return [cover, preview].every(
      (src) => src.includes(`source: "${source}"`) && src.includes(`"${kind}"`),
    )
  })(),
)

// ===========================================================================
section("A link inside the preview must not take the preview with it")
// ===========================================================================

/**
 * THE OTHER "refused to connect", and the one a creator hits by hand.
 *
 * The preview is a srcdoc document, and a srcdoc document inherits its base
 * URL from the page around it. So `<a href="/about">` in a generated site does
 * not point at the generated site — it points at storelib.com/about, a real
 * page, which like every page on that domain is served with
 * `X-Frame-Options: DENY`. Clicking it navigated the frame there, the browser
 * refused, and the creator's work was replaced by a full-frame error.
 *
 * Measured in Chromium by counting load events on the frame, with the document
 * `previewDocument` actually produces rather than an imitation of it:
 *
 *   frame load events: 1                    ← it never left
 *   ready
 *   navigate:/about                         ← held
 *   navigate:/pricing                       ← held
 *   navigate:https://example.com/x          ← held
 *   navigate:#                              ← held
 *   navigate:/subscribe                     ← the form, held
 *   (#features produced nothing — an in-page anchor still scrolls)
 *
 * Without the guard the same document loads TWICE: it left.
 */

check(
  "every link in a generated site is held inside the frame",
  (() => {
    const doc = previewDocument({ code: "", css: "", html: "<body><a href='/about'>a</a></body>" })
    return (
      /document\.addEventListener\("click"/.test(doc) &&
      /e\.preventDefault\(\)/.test(doc) &&
      /send\("navigate", href\)/.test(doc) &&
      // capture phase, so a handler in the site cannot get there first
      /\}, true\)/.test(doc)
    )
  })(),
)

check(
  "a hash link is left alone, because the preview has its own URL now",
  (() => {
    const doc = previewShell()
    /**
     * THIS ASSERTION HAS BEEN WRONG TWICE, IN OPPOSITE DIRECTIONS, AND THE
     * REASON IS THE SAME BOTH TIMES: what a hash link does depends entirely on
     * what the document's URL is.
     *
     * While the preview was srcdoc its base URL was the editor's, so "#/about"
     * resolved to storelib.com/sites/<id>#/about — a different document, and
     * one that denies framing. It had to be held, which meant a hash router
     * could not work at all and a creator clicking their own menu got a notice
     * instead of a page.
     *
     * The preview is served from /api/sites/preview-frame now, so a hash link
     * is a same-document fragment. Measured over the DevTools protocol with
     * real timers, against this exact shell:
     *
     *   #/about    → location.hash = "#/about"     a hash router works
     *   #features  → location.hash = "#features"   an anchor scrolls
     *   /about     → held                          it would leave the origin
     *   loads: 1                                   it never navigated
     */
    const at = doc.indexOf('document.addEventListener("click"')
    const body = doc.slice(at, doc.indexOf('window.addEventListener("message"', at))
    return (
      /if \(href\.charAt\(0\) === "#"\) return/.test(body) &&
      body.indexOf('href.charAt(0) === "#"') < body.indexOf("e.preventDefault()") &&
      /send\("navigate", href\)/.test(body)
    )
  })(),
)

check(
  "a path is still held, because it would leave the origin",
  (() => {
    const doc = previewShell()
    /**
     * "/about" resolves against this URL's origin and lands on
     * storelib.com/about — a real page, which denies framing. That is the
     * crash the guard exists for and it is unchanged by the move.
     */
    return /e\.preventDefault\(\)/.test(doc) && /document\.addEventListener\("submit"/.test(doc)
  })(),
)

check(
  "a build arrives by message, and only from the editor",
  (() => {
    const doc = previewShell()
    return (
      /payload\.kind !== "storelib-apply"/.test(doc) &&
      /event\.source !== parent/.test(doc) &&
      // the body and styles are replaced; the document is not rewritten
      /document\.body\.innerHTML = payload\.body/.test(doc) &&
      /getElementById\("storelib-css"\)/.test(doc)
    )
  })(),
)

check(
  "the import map belongs to the shell, never to a build",
  (() => {
    const shell = previewShell()
    const payload = previewPayload({ code: "x", css: "y", html: "<body><p>z</p></body>" })
    /**
     * A document may declare an import map ONCE, and only before any module
     * loads. Putting it in a build would mean the second build's map is
     * rejected — so the shell owns it, and a build is only CSS, body and code.
     */
    return (
      /type="importmap"/.test(shell) &&
      !/importmap/.test(JSON.stringify(payload)) &&
      payload.kind === "storelib-apply"
    )
  })(),
)

check(
  "the shell carries no project data, so the route needs no session",
  (() => {
    const shell = previewShell()
    const route = strip(read("app/api/sites/preview-frame/route.ts"))
    /**
     * The same bytes for every creator: an import map, an empty stylesheet and
     * the bridge. Nothing to authorise and nothing to leak, which is what makes
     * it cacheable — and why the path has no site id in it.
     */
    return (
      !/siteId|params/.test(route) &&
      !/resolveSite|createClient/.test(route) &&
      /export const dynamic = "force-static"/.test(route) &&
      shell.length < 12_000
    )
  })(),
)

check(
  "the sandbox is enforced by the response, not by an attribute",
  (() => {
    const route = strip(read("app/api/sites/preview-frame/route.ts"))
    const pane = strip(read("components/sites/editor/preview-pane.tsx"))
    /**
     * The old objection to serving the preview from a URL was sound: a real URL
     * is same-origin with the editor, and `allow-scripts allow-same-origin` on
     * the iframe would hand generated code the creator's session. An attribute
     * is one token wide and one careless edit from being wrong.
     *
     * A CSP sandbox directive is applied to the RESPONSE, so it holds whatever
     * the tag says. Verified over the DevTools protocol against an iframe with
     * NO sandbox attribute at all: contentDocument came back null — the frame
     * was still opaque. This is stricter than what it replaced, not looser.
     */
    return (
      /"sandbox allow-scripts"/.test(route) &&
      /frame-ancestors 'self'/.test(route) &&
      // and the attribute is still there as well, doing the same thing twice
      /sandbox="allow-scripts"/.test(pane) &&
      !/allow-same-origin/.test(pane)
    )
  })(),
)

check(
  "the preview is served, and a rebuild does not reload the frame",
  (() => {
    const pane = strip(read("components/sites/editor/preview-pane.tsx"))
    /**
     * Posting the build rather than re-rendering the document is what keeps the
     * creator's scroll position and the site's current route across a
     * keystroke — the frame is loaded once per session, not once per edit.
     */
    return (
      /src=\{SHELL_URL\}/.test(pane) &&
      !/srcDoc/.test(pane) &&
      /contentWindow\?\.postMessage\(payload, "\*"\)/.test(pane) &&
      /if \(data\.kind === "ready"\) setShellReady\(true\)/.test(pane)
    )
  })(),
)

check(
  "the preview's own script compiles",
  (() => {
    /**
     * THE BRIDGE IS A TEMPLATE LITERAL INSIDE TYPESCRIPT, so every backslash
     * and backtick in it is escaped twice and easy to get wrong — and a broken
     * bridge fails SILENTLY. Nothing throws where anyone would see it: the
     * script simply never runs, so there is no ready message, no click guard,
     * and every link navigates away again. Exactly the bug it exists to stop,
     * reintroduced by a typo.
     *
     * That happened while writing this: an escaped character class came out of
     * the compiler as an invalid regular expression and took the whole script
     * with it. `new Function` compiles without executing, which is all this
     * needs to know.
     */
    const doc = previewDocument({ code: "", css: "", html: "<body></body>" })
    const scripts = [
      ...doc.matchAll(
        /<script(?![^>]*type="importmap")(?![^>]*type="module")[^>]*>([\s\S]*?)<\/script>/g,
      ),
    ].map((m) => m[1])
    if (scripts.length === 0) return false
    return scripts.every((source) => {
      try {
        new Function(source)
        return true
      } catch {
        return false
      }
    })
  })(),
)

check(
  "a form is held too — it navigates by a different route to the same place",
  (() => {
    const doc = previewDocument({ code: "", css: "", html: "<body></body>" })
    return /document\.addEventListener\("submit"/.test(doc) && /send\("navigate"/.test(doc)
  })(),
)

check(
  "the editor says where the link went rather than swallowing the click",
  (() => {
    const pane = strip(read("components/sites/editor/preview-pane.tsx"))
    /**
     * A nav that appears to do nothing reads as a broken site. The creator
     * needs to know the link is real and works once published.
     */
    return (
      /data\.kind === "navigate"/.test(pane) &&
      /setHeldLink/.test(pane) &&
      /Links open on the published site/.test(pane)
    )
  })(),
)

check(
  "and if the frame leaves anyway, the preview is put back",
  (() => {
    const pane = strip(read("components/sites/editor/preview-pane.tsx"))
    /**
     * The click guard holds links and forms, which is every ordinary way out.
     * It cannot hold `window.location = "/x"` written by a model. A second
     * load event on the same document means the frame is no longer showing the
     * preview — what it went to cannot be read from here, because the frame is
     * on an opaque origin, and does not need to be.
     *
     * Capped, so a document that navigates on sight cannot become a loop.
     */
    return (
      /loadsRef\.current \+= 1/.test(pane) &&
      /onLoad=\{onFrameLoad\}/.test(pane) &&
      /key=\{`\$\{nonce\}-\$\{restores\}`\}/.test(pane) &&
      /setRestores\(\(n\) => \(n < 2 \? n \+ 1 : n\)\)/.test(pane)
    )
  })(),
)

check(
  "the frame still cannot navigate the page around it",
  (() => {
    const pane = strip(read("components/sites/editor/preview-pane.tsx"))
    /**
     * Holding links is about the frame's own navigation. The sandbox is what
     * stops the frame navigating the EDITOR, and it has to stay exactly as
     * narrow as it is — allow-same-origin would hand generated code the
     * session, allow-top-navigation would let it replace the editor.
     */
    return (
      /sandbox="allow-scripts"/.test(pane) &&
      !/allow-same-origin/.test(pane) &&
      !/allow-top-navigation/.test(pane) &&
      !/allow-popups/.test(pane)
    )
  })(),
)

// ===========================================================================
section("Nothing goes public without passing what the agent is held to")
// ===========================================================================

/**
 * PUBLISH WAS CHECKING LESS THAN THE AGENT WAS.
 *
 * An agent run bundles, typechecks and renders before it may finish.
 * `publishSite` ran esbuild and nothing else — so every path that is NOT an
 * agent run went live unchecked, and the safest path was the least guarded
 * one: the Code tab autosaves every 1.2 seconds and Publish took whatever was
 * there.
 *
 * And nothing looked for credentials at all, on the one operation that copies
 * a project onto a public bucket behind a CDN. A key that goes out that way is
 * not exposed later — it is published, and deleting the site afterwards does
 * not recall it.
 */

/** A JWT with the given payload. Built here so no literal token is committed. */
function jwt(payload: Record<string, unknown>): string {
  const b64 = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64(payload)}.${"s".repeat(43)}`
}

{
  /**
   * The things that are unambiguously credentials. Each is a vendor's own
   * prefix followed by enough characters that it cannot be a coincidence.
   */
  const caught: Array<[string, string]> = [
    ["a Stripe secret key", `const stripe = "sk_live_${"a1B2c3D4e5F6g7H8i9J0k1L2"}"`],
    ["an OpenAI key", `const openai = "sk-proj-${"A".repeat(40)}"`],
    ["an AWS access key id", `const aws = "AKIA${"ABCDEFGHIJKLMNOP"}"`],
    ["a Google API key", `const maps = "AIza${"Sy".padEnd(35, "x")}"`],
    ["a GitHub token", `const gh = "ghp_${"b".repeat(36)}"`],
    ["a Slack token", `const slack = "xoxb-${"1234567890-abcdef"}"`],
    ["a SendGrid key", `const mail = "SG.${"a".repeat(22)}.${"b".repeat(43)}"`],
    ["an npm token", `const npm = "npm_${"c".repeat(36)}"`],
    ["a private key", `const pem = \`-----BEGIN RSA PRIVATE KEY-----\``],
    ["a Supabase service role key", `const admin = "${jwt({ role: "service_role", iss: "supabase" })}"`],
  ]

  for (const [label, source] of caught) {
    const found = scanForSecrets({ "src/App.tsx": `export default function App() {\n  ${source}\n  return null\n}\n` })
    check(
      `a publish is stopped by ${label}`,
      found.length === 1 && found[0].level === "blocking" && found[0].line === 2,
      JSON.stringify(found),
    )
  }
}

{
  /**
   * THE FALSE POSITIVES MATTER MORE THAN THE LIST DOES.
   *
   * A wrong hit BLOCKS A PUBLISH, and a creator who cannot ship because a
   * paragraph of copy looked like a token will not thank anybody for the
   * caution. So there is no "high entropy" rule and no "looks like a password"
   * rule — those also catch a hash in a filename, a base64 image, a UUID.
   */
  const allowed: Array<[string, string]> = [
    /**
     * The one that would have been most damaging: a Supabase ANON key is a JWT
     * and it is meant to be public — it is in every client bundle of every
     * Supabase app there is. Matching "a JWT" would have blocked a correct
     * site on its most ordinary line, so the token is decoded and only the
     * service role, which ignores every row-level policy, is a finding.
     */
    ["a Supabase anon key, which is public by design", `const key = "${jwt({ role: "anon", iss: "supabase" })}"`],
    ["a UUID", `const id = "3f2504e0-4f89-11d3-9a0c-0305e82c3301"`],
    ["a hashed asset filename", `import styles from "./app.a1b2c3d4e5f6.css"`],
    ["a base64 image", `const logo = "data:image/png;base64,${"iVBORw0KGgoAAAANSUhEUg".repeat(4)}"`],
    ["prose that happens to say key", `<p>Ask us for the key to the studio and we will leave it out for you</p>`],
    ["a long list of class names", `className="mx-auto flex max-w-5xl flex-col items-center gap-6 px-4 py-24 text-center"`],
    ["a short string that starts sk-", `const label = "sk-1"`],
    ["a sentence containing AKIA", `<p>AKIAA is not a word but this is only copy</p>`],
  ]

  for (const [label, source] of allowed) {
    const found = scanForSecrets({ "src/App.tsx": `export default function App() {\n  ${source}\n  return null\n}\n` })
    check(`${label} does not stop a publish`, found.length === 0, JSON.stringify(found))
  }
}

{
  const found = scanForSecrets({
    "src/lib/db.ts": `export const KEY = "sk_live_${"z9Y8x7W6v5U4t3S2r1Q0p9O8"}"`,
  })
  check(
    "the finding names the file and the line",
    found[0]?.file === "src/lib/db.ts" && found[0]?.line === 1,
    JSON.stringify(found[0]),
  )
  check(
    "and never repeats the value it found",
    !!found[0] && !found[0].message.includes("sk_live_") && !found[0].message.includes("z9Y8x7W6"),
    found[0]?.message,
  )
  check(
    "it says the key should be treated as compromised, because it has been",
    /compromised/.test(found[0]?.message ?? ""),
  )
}

check(
  "publishing runs the checks before it builds or uploads anything",
  (() => {
    const publish = strip(read("lib/sites/publish.ts"))
    const at = publish.indexOf("export async function publishSite")
    const body = publish.slice(at)
    return (
      /const checks = await preflight\(files\)/.test(body) &&
      /if \(!checks\.ok\)/.test(body) &&
      // before the bundle, the slug, the deployment row and the upload
      body.indexOf("await preflight(files)") < body.indexOf("buildStatic(files") &&
      body.indexOf("await preflight(files)") < body.indexOf("site_deployments")
    )
  })(),
)

check(
  "the checks cover types, render and credentials — not just the bundle",
  (() => {
    const pre = strip(read("lib/sites/preflight.ts"))
    return (
      /scanForSecrets\(files\)/.test(pre) &&
      /typecheckProject\(files\)/.test(pre) &&
      /renderCheck\(files\)/.test(pre)
    )
  })(),
)

check(
  "a check that could not run is recorded as skipped, never as a pass",
  (() => {
    const pre = strip(read("lib/sites/preflight.ts"))
    /**
     * The difference between "verified" and "nothing objected". A typechecker
     * that is not installed must not read as a clean typecheck.
     */
    return (
      /skipped\.push\("typecheck"\)/.test(pre) &&
      /skipped\.push\("render"\)/.test(pre) &&
      /ok: findings\.every\(\(f\) => f\.level !== "blocking"\)/.test(pre)
    )
  })(),
)

check(
  "and the agent is told about a credential before it can finish the run",
  (() => {
    const tools = strip(read("lib/sites/agent/tools.ts"))
    const at = tools.indexOf('case "run_build"')
    const body = tools.slice(at, tools.indexOf('case "read_build_errors"', at))
    /**
     * Told at run_build rather than only at publish, so the model removes it
     * in the same run instead of the creator discovering it at the moment they
     * try to ship.
     */
    return (
      /const leaked = scanForSecrets\(this\.files\)/.test(body) &&
      /this\.lastProblem = "secret"/.test(body) &&
      /the browser is not a place to keep a secret/.test(body)
    )
  })(),
)

// ===========================================================================
section("The lockfile and package.json agree, or the deploy does not start")
// ===========================================================================

/**
 * ERR_PNPM_OUTDATED_LOCKFILE, and it was self-inflicted.
 *
 * `typescript` was moved from devDependencies to dependencies — correct, and
 * necessary, because run_build typechecks a project before a run may finish
 * and a production install without dev packages has no compiler. But
 * package.json was edited and pnpm-lock.yaml was not, and CI installs with
 * --frozen-lockfile. The build never started.
 *
 * The lesson is not "remember to run pnpm install". Nobody remembers. This is
 * the shape of mistake a test catches in a second and a person catches after a
 * failed deploy, so it is a test.
 */

/** The dependency names pnpm-lock.yaml records for the root project. */
function lockfileDependencies(): { dependencies: string[]; devDependencies: string[] } {
  const lines = read("pnpm-lock.yaml").split("\n")
  const out: Record<string, string[]> = { dependencies: [], devDependencies: [] }

  let inRoot = false
  let section: string | null = null

  for (const line of lines) {
    if (/^  \.:\s*$/.test(line)) {
      inRoot = true
      continue
    }
    if (!inRoot) continue
    // Any other importer, or the end of the importers block.
    if (/^\S/.test(line) || /^  \S/.test(line)) break

    const header = line.match(/^    (dependencies|devDependencies|optionalDependencies):\s*$/)
    if (header) {
      section = header[1]
      continue
    }

    const entry = line.match(/^      '?([^':]+)'?:\s*$/)
    if (entry && section && out[section]) out[section].push(entry[1])
  }

  return { dependencies: out.dependencies, devDependencies: out.devDependencies }
}

check(
  "every dependency in package.json is in the lockfile, in the same group",
  (() => {
    const pkg = JSON.parse(read("package.json"))
    const lock = lockfileDependencies()
    const same = (a: string[], b: string[]) =>
      a.length === b.length && [...a].sort().join() === [...b].sort().join()
    return (
      same(Object.keys(pkg.dependencies ?? {}), lock.dependencies) &&
      same(Object.keys(pkg.devDependencies ?? {}), lock.devDependencies)
    )
  })(),
  (() => {
    const pkg = JSON.parse(read("package.json"))
    const lock = lockfileDependencies()
    const missing = Object.keys(pkg.dependencies ?? {}).filter((d) => !lock.dependencies.includes(d))
    const stray = lock.dependencies.filter((d) => !(d in (pkg.dependencies ?? {})))
    return `dependencies missing from the lockfile: ${missing.join(", ") || "none"}; in the lockfile but not package.json: ${stray.join(", ") || "none"}. Run pnpm install.`
  })(),
)

check(
  "there is exactly one lockfile, and it is pnpm's",
  (() => {
    /**
     * package-lock.json sat beside pnpm-lock.yaml, a month older, tracked in
     * git, referenced by nothing. Two lockfiles make the package manager a
     * guess — the platform picks one by detection order, and the one it picks
     * is not necessarily the one anybody has been installing with.
     */
    const others = ["package-lock.json", "yarn.lock", "bun.lockb", "bun.lock"]
    return existsSync(join(root, "pnpm-lock.yaml")) && others.every((f) => !existsSync(join(root, f)))
  })(),
)

check(
  "the pnpm version is pinned rather than inherited from whatever CI has",
  (() => {
    const pkg = JSON.parse(read("package.json"))
    return typeof pkg.packageManager === "string" && /^pnpm@\d+\.\d+\.\d+/.test(pkg.packageManager)
  })(),
)

check(
  "and nothing installs with npm behind pnpm's back",
  (() => {
    /**
     * `npx` FETCHES from the registry when it cannot find a binary locally, so
     * a broken install becomes a silent download of some other tsc and a suite
     * that passes against the wrong compiler. `pnpm exec` fails instead.
     */
    const runner = read("scripts/run-push-tests.mjs")
    return /execFileSync\("pnpm", \["exec", "tsc"/.test(runner) && !/"npx"/.test(runner)
  })(),
)

// ===========================================================================
section("The chat shows what was asked for, not what the machine did")
// ===========================================================================

/**
 * The run streamed `plan` and `state` events for weeks and nothing rendered
 * them. What the chat showed instead was one line per tool call — "Read
 * src/App.tsx", "Edited src/components/Hero.tsx" — which is the inside of the
 * machine on somebody's screen, and the wrong grain besides: forty of those
 * scroll past and none says whether the work is going well.
 */

check(
  "the milestones come from the run's own plan and state",
  (() => {
    const pane = strip(read("components/sites/editor/chat-pane.tsx"))
    return (
      /event\.type === "state"/.test(pane) &&
      /event\.type === "plan"/.test(pane) &&
      /function milestonesFor\(exchange: Exchange\): Milestone\[\]/.test(pane)
    )
  })(),
)

check(
  "each state is one of queued, active or done",
  (() => {
    const pane = strip(read("components/sites/editor/chat-pane.tsx"))
    return /state: "queued" \| "active" \| "done"/.test(pane)
  })(),
)

check(
  "the agent's own words are the middle of the list",
  (() => {
    const pane = strip(read("components/sites/editor/chat-pane.tsx"))
    const at = pane.indexOf("function milestonesFor")
    const body = pane.slice(at, pane.indexOf("function RunProgress", at))
    /**
     * A plan step is already in the creator's language — it is what the agent
     * committed to doing, in the words it used. "Rebuild the hero" is worth a
     * line; "write_file" is not.
     */
    return /exchange\.plan \?\? \[\]/.test(body) && /label: step\.title/.test(body)
  })(),
)

check(
  "the tool calls are behind a toggle and closed by default",
  (() => {
    const pane = strip(read("components/sites/editor/chat-pane.tsx"))
    /**
     * Scoped to the DECLARATION, not to a slice of the file. The first version
     * sliced from RunProgress to the end, which swept in the whole ChatPane
     * component — and it has other useState(false) calls, so the assertion
     * passed with the panel defaulting to open.
     */
    const at = pane.indexOf("function RunProgress")
    const body = pane.slice(at)
    return (
      /const \[showActivity, setShowActivity\] = React\.useState\(false\)/.test(body) &&
      /Activity \(\{exchange\.steps\.length\}\)/.test(body) &&
      /**
       * It animates open now instead of mounting, so the old `showActivity &&`
       * is gone — closed is a `grid-rows-[0fr]` row rather than an absent one.
       * Asserting on the class is what keeps this honest: a panel that is
       * merely transparent would still be reachable by tab and read aloud.
       */
      /showActivity \? "grid-rows-\[1fr\] opacity-100" : "grid-rows-\[0fr\] opacity-0"/.test(body) &&
      // and the main thread renders milestones, not filenames
      /milestones\.map\(\(milestone\)/.test(body)
    )
  })(),
)

check(
  "the run is one card that can be shut, not loose lines in the flow",
  (() => {
    const pane = strip(read("components/sites/editor/chat-pane.tsx"))
    const at = pane.indexOf("export function RunProgress")
    const body = pane.slice(at, pane.indexOf("export function QuestionCards"))
    /**
     * A long run used to push the conversation off the screen and there was no
     * single thing to look at that said "this is happening now". The header
     * stays when the body is shut, so a finished run becomes one line rather
     * than disappearing.
     */
    return (
      /const \[open, setOpen\] = React\.useState\(true\)/.test(body) &&
      /aria-expanded=\{open\}/.test(body) &&
      // and it animates by grid rows, because height cannot animate to auto
      // and a measured pixel height goes stale every few seconds during a run
      /open \? "grid-rows-\[1fr\] opacity-100" : "grid-rows-\[0fr\] opacity-0"/.test(body) &&
      // the header names the state rather than always saying the same thing
      /"Still working"/.test(body) &&
      /"Working"/.test(body) &&
      /"Stopped"/.test(body) &&
      /"Done"/.test(body)
    )
  })(),
)

check(
  "the agent's own words are shown, not dropped",
  (() => {
    const pane = strip(read("components/sites/editor/chat-pane.tsx"))
    /**
     * `thinking` events were streamed and then thrown away, which is why the
     * card had a state and a checklist and nothing that read like somebody
     * talking. Only the LATEST line is shown — this is a running commentary,
     * and stacking it turns the card into a wall.
     */
    return (
      /event\.type === "thinking"/.test(pane) &&
      /notes: \[\.\.\.e\.notes, text\]/.test(pane) &&
      /exchange\.notes\[exchange\.notes\.length - 1\]/.test(pane) &&
      // and the plan is announced above the steps, as its own moment
      /Created plan/.test(pane)
    )
  })(),
)

check(
  "a run with nothing to say renders nothing at all",
  (() => {
    const pane = strip(read("components/sites/editor/chat-pane.tsx"))
    /**
     * An exchange restored from the transcript has no phase and no plan — the
     * events were never stored. It gets its reply and its activity, and no
     * invented milestones.
     */
    return (
      /if \(!phase && !exchange\.plan\?\.length\) return \[\]/.test(pane) &&
      // The card also has the agent's own commentary now, and a run that said
      // something has something to show even with no milestones and no tools.
      /if \(milestones\.length === 0 && exchange\.steps\.length === 0 && !note\) return null/.test(
        pane,
      )
    )
  })(),
)

// ===========================================================================
section("The agent asks one thing and waits for it")
// ===========================================================================

/**
 * THIS SECTION USED TO ASSERT THE OPPOSITE, and the reversal is the point.
 *
 * The first design asked four questions at once and kept building, on the
 * reasoning that a form in front of an empty page is homework. In practice the
 * answers arrived when there was nothing left for them to change cheaply — the
 * copy was written and the pages laid out — so they became a correction pass
 * rather than an input. The chat also disabled the controls while a run was
 * going, so the one moment they mattered was the one moment they were dead.
 *
 * One question, asked mid-build, with the run stopped until it is answered or
 * skipped.
 */
{
  const asked = parseQuestion(
    {
      question: "  What is   the shop called?  ",
      why: "It goes in the header and the footer",
      suggestions: ["Skip", "Skip", "Not decided yet"],
      placeholder: "e.g. Ferro Barbers",
    },
    "q1",
  )

  check(
    "a question is parsed and its whitespace collapsed",
    asked?.question === "What is the shop called?",
  )

  check(
    "a repeated suggestion is not rendered twice",
    // Two identical chips read as a bug in the page, not as a repeated answer.
    asked?.suggestions.join() === "Skip,Not decided yet",
  )

  check(
    "a question nobody could answer is refused, never thrown",
    /**
     * A bad tool call is something the agent is told about and can retry. It
     * is never a reason to end a run that is otherwise building a site.
     */
    parseQuestion({}, "q1") === null && parseQuestion({ question: "   " }, "q1") === null,
  )

  check(
    "one question at a time is the shape of the tool, not a rule in the prompt",
    (() => {
      const tools = strip(read("lib/sites/agent/tools.ts"))
      const at = tools.indexOf('name: "ask_creator"')
      const spec = tools.slice(at, tools.indexOf("additionalProperties: false", at))
      /**
       * The old spec took an ARRAY of questions, so "ask one at a time" was a
       * sentence a model could agree with and ignore. A schema that has no
       * room for a second question cannot be ignored.
       */
      return /question: \{\s*type: "string"/.test(spec) && !/type: "array",\s*items:\s*\{\s*type: "object"/.test(spec)
    })(),
  )

  check(
    "asking stops the run until it hears back",
    (() => {
      const loop = strip(read("lib/sites/agent/loop.ts"))
      const at = loop.indexOf("async function* askCreator")
      const body = loop.slice(at, loop.indexOf("\nfunction isEmptySite", at))
      /**
       * The order is everything: emit, THEN wait. A question asked and
       * answered before anybody saw it is not a question, and that is what an
       * ordinary async tool handler would have produced — it cannot yield.
       */
      const emitted = body.indexOf('yield { type: "question", question }')
      const waited = body.indexOf("await ask(question)")
      return emitted > 0 && waited > emitted
    })(),
  )

  check(
    "and the three ways it can end are three different sentences",
    (() => {
      const question: AgentQuestion = { id: "q1", question: "Which town?", suggestions: [] }
      const answered = answerNote(question, { kind: "answered", answer: "Cluj" })
      const skipped = answerNote(question, { kind: "skipped" })
      const timeout = answerNote(question, { kind: "timeout" })
      /**
       * A model that cannot tell a skip from silence will treat a skip as a
       * licence to ask the same thing again in another form.
       */
      return (
        answered.includes("Cluj") &&
        /do not ask again/i.test(skipped) &&
        /Nobody answered/.test(timeout) &&
        /Do not ask anything else/.test(timeout) &&
        answered !== skipped &&
        skipped !== timeout
      )
    })(),
  )

  check(
    "a run cannot turn into an interview",
    (() => {
      const loop = strip(read("lib/sites/agent/loop.ts"))
      return (
        /if \(asks >= MAX_ASKS_PER_RUN\) return tooManyAsksNote\(\)/.test(loop) &&
        /asks \+= 1/.test(loop) &&
        MAX_ASKS_PER_RUN <= 3
      )
    })(),
  )

  check(
    "the wait is bounded by what the run can afford, not by a constant",
    (() => {
      const asking = strip(read("lib/sites/agent/asking.ts"))
      const run = strip(read("lib/sites/agent/run.ts"))
      /**
       * The route runs with maxDuration 300. A wait that ignored that would
       * not wait forever — the function would be KILLED mid-build and
       * everything done so far thrown away unsaved, which is far worse than a
       * guessed town name.
       */
      return (
        /Math\.min\(MAX_WAIT_MS, input\.deadline - now\(\)\)/.test(asking) &&
        /if \(room < MIN_USEFUL_WAIT_MS\) return \{ kind: "timeout" \}/.test(asking) &&
        /deadline: startedAt \+ RUN_BUDGET_MS - BUILD_RESERVE_MS/.test(run)
      )
    })(),
  )

  check(
    "and the reserve really is smaller than the budget it is taken from",
    (() => {
      const run = read("lib/sites/agent/run.ts")
      const budget = Number(/RUN_BUDGET_MS = ([\d_]+)/.exec(run)?.[1].replace(/_/g, ""))
      const reserve = Number(/BUILD_RESERVE_MS = ([\d_]+)/.exec(run)?.[1].replace(/_/g, ""))
      const route = read("app/api/sites/[siteId]/agent/route.ts")
      const maxDuration = Number(/maxDuration = (\d+)/.exec(route)?.[1])
      /**
       * Three numbers in two files that have to agree. If the route's duration
       * is ever raised or lowered and this is not, the deadline promises time
       * the function does not have.
       */
      return budget === maxDuration * 1000 && reserve > 0 && reserve < budget
    })(),
  )

  check(
    "an answer cannot be overwritten by a second one",
    (() => {
      const asking = strip(read("lib/sites/agent/asking.ts"))
      /**
       * A double tap, two tabs, or an answer racing the timeout. The
       * `is("answered_at", null)` makes the update a compare-and-swap, so
       * whoever got there first is what the run acts on — which is also what
       * the person saw happen.
       */
      const at = asking.indexOf("export async function recordAnswer")
      const body = asking.slice(at)
      return /\.is\("answered_at", null\)/.test(body) && /\.eq\("site_id", input\.siteId\)/.test(body)
    })(),
  )

  check(
    "and a question id from another site is not enough to answer it",
    (() => {
      const route = strip(read("app/api/sites/[siteId]/agent/answer/route.ts"))
      const asking = strip(read("lib/sites/agent/asking.ts"))
      /**
       * The write uses the service role, so RLS is not deciding here — the
       * getSite read through the user's own client is. A question id is not a
       * secret, so the update is scoped by site as well.
       */
      return (
        /const site = await getSite\(siteId\)/.test(route) &&
        /return NextResponse\.json\(\{ error: "Site not found\." \}, \{ status: 404 \}\)/.test(route) &&
        /\.eq\("site_id", input\.siteId\)/.test(asking)
      )
    })(),
  )

  check(
    "the chat answers WHILE the run is going, which is the whole complaint",
    (() => {
      const pane = strip(read("components/sites/editor/chat-pane.tsx"))
      const at = pane.indexOf("function QuestionCard(")
      const card = pane.slice(at, pane.indexOf("export function ChatPane"))
      /**
       * THE BUG THIS EXISTS FOR. The first version passed `disabled={busy}`,
       * so every control was dead for the entire run — and since the run only
       * ended after the site was built, the questions could only ever be
       * answered too late.
       *
       * Now only the card with a submission in flight locks, and the run being
       * busy is the REASON the card is live: the run is stopped waiting for it.
       */
      return (
        !/disabled=\{busy\}/.test(card) &&
        /pending=\{answering === question\.id\}/.test(pane) &&
        // it posts to the answer route rather than starting a second run
        /\/api\/sites\/\$\{siteId\}\/agent\/answer/.test(pane) &&
        !/void send\(answersPrompt/.test(pane)
      )
    })(),
  )

  check(
    "the card settles from the run, not from whichever tab submitted",
    (() => {
      const pane = strip(read("components/sites/editor/chat-pane.tsx"))
      /**
       * Settling optimistically would show an answer that a timeout had
       * already discarded — and a second device watching the same run would
       * show nothing at all.
       */
      return /event\.type === "answered"/.test(pane) && /settled: \{ \.\.\.\(e\.settled \?\? \{\}\), \[questionId\]/.test(pane)
    })(),
  )

  check(
    "waiting is not called working",
    (() => {
      const pane = strip(read("components/sites/editor/chat-pane.tsx"))
      /**
       * Saying "Working" while the run is stopped on a question nobody has
       * noticed is how somebody sits watching a spinner that will never move
       * on its own.
       */
      return /"Waiting on you"/.test(pane) && /Paused — answer below and it carries on/.test(pane)
    })(),
  )

  check(
    "what was asked and what was said are kept together",
    (() => {
      const chat = strip(read("lib/sites/chat.ts"))
      const run = strip(read("lib/sites/agent/run.ts"))
      const loop = strip(read("lib/sites/agent/loop.ts"))
      /**
       * Recorded AFTER the wait, with its outcome. Pushing the question before
       * waiting would write one the run may never have got an answer to, shown
       * tomorrow as though somebody had chosen to leave it blank.
       */
      const at = loop.indexOf("async function* askCreator")
      const body = loop.slice(at, loop.indexOf("\nfunction isEmptySite", at))
      return (
        /questions, files_changed/.test(chat) &&
        /questions: workspace\.questions/.test(run) &&
        body.indexOf("workspace.questions.push") > body.indexOf("await ask(question)")
      )
    })(),
  )
}

// ===========================================================================
section("No white strip above the header or below the footer")
// ===========================================================================

/**
 * THREE CAUSES, ALL OF THEM THE BROWSER DOING AS IT IS TOLD, none of them
 * visible to a check that only asks whether the code compiles.
 *
 *   1. `body` has an 8px margin by default — a white frame on all four edges.
 *   2. MARGIN COLLAPSE. A first child's top margin escapes its parent rather
 *      than moving inside it, so a hero with a background starts lower than
 *      its box and the page shows through the gap. This one survives a
 *      stylesheet that resets body, and looks like a bug in the site.
 *   3. A page shorter than the window leaves the rest painted with the canvas
 *      colour — a white band under the footer on a dark site.
 *
 * Measured in Chromium on a deliberately badly-built site: a hero with a
 * background whose first child is an <h1>, no body reset, content far shorter
 * than the viewport.
 *
 *   without the reset   margin-top=8px   strip above hero=21px   below=490px
 *   with the reset      margin-top=0px   strip above hero= 0px   below=  0px
 *
 * The 21px is the h1's own 0.67em, and it was still there after the first
 * attempt — which only stopped margins escaping the ROOT, not each section.
 */

check(
  "the reset lands before the project's stylesheet, never after it",
  (() => {
    const doc = read("lib/sites/preview-document.ts")
    const shell = previewShell()
    /**
     * Order is the whole point. The first version put this AFTER the project's
     * CSS, so a fixed `height: 100%` won over whatever the site asked for — a
     * reset that overrules the thing it is meant to be resetting for.
     */
    return (
      doc.includes("const BASE_RESET") &&
      shell.indexOf("html, body { margin: 0") < shell.indexOf('id="storelib-css"')
    )
  })(),
)

check(
  "a published site gets the same reset as the preview",
  (() => {
    const published = previewDocument({ code: "", css: "", html: "<body><div id='root'></div></body>" })
    const doc = strip(read("lib/sites/preview-document.ts"))
    // The preview shell and publishedDocument both interpolate the one reset.
    return (published.length > 0) && (doc.match(/\$\{BASE_RESET\}/g) ?? []).length === 2
  })(),
)

check(
  "margins cannot escape the page, or a section",
  (() => {
    const shell = previewShell()
    return (
      /#root \{ display: flow-root/.test(shell) &&
      // the case that survived the first attempt: escaping a SECTION, not the root
      /:where\(#root\) > \* \{ display: flow-root; \}/.test(shell)
    )
  })(),
)

check(
  "the reset loses every argument it has with the project",
  (() => {
    const shell = previewShell()
    /**
     * `:where()` weighs nothing, so a section the site styles as flex or grid
     * keeps its own display. Verified in the browser: a .flexy section stayed
     * `display: flex` with the reset applied. A plain `#root > *` selector
     * would have outweighed the class and silently flattened it.
     */
    return /:where\(#root\)/.test(shell) && !/[^:]\bwhere\b/.test(shell.replace(/:where/g, ""))
  })(),
)

check(
  "a page shorter than the window still paints to the bottom",
  (() => {
    const shell = previewShell()
    return /min-height: 100vh; min-height: 100dvh;/.test(shell)
  })(),
)

check(
  "and the agent is told the page must reach all four edges",
  (() => {
    const loop = read("lib/sites/agent/loop.ts")
    const at = loop.indexOf("export const SYSTEM_PROMPT")
    const prompt = loop.slice(at, loop.indexOf("PRESERVATION_RULES", at))
    return (
      /MUST REACH ALL FOUR EDGES/.test(prompt) &&
      /first child's top margin escapes its parent/.test(prompt)
    )
  })(),
)

// ===========================================================================
section("One website state, two editors")
// ===========================================================================

/**
 * lib/sites/types.ts opens with a rule, and the rule is right:
 *
 *   "Files are the source of truth. There is no section model here and there
 *    must not become one: the moment a second representation of what the page
 *    says exists, the visual editor and the AI start disagreeing about which is
 *    current, and the answer is always whichever one the user did not just
 *    edit."
 *
 * Structured sections and generated code can coexist, but only one of them
 * gets to be true. So the direction is reversed rather than the rule broken:
 * THE DOCUMENT IS THE SOURCE, THE FILES ARE ITS OUTPUT. A colour picker writes
 * a prop; the agent writes a prop; both produce the same App.tsx by the same
 * function, so there is nothing left for them to disagree about.
 */

/**
 * The refusal text, whatever the union says.
 *
 * The push-test harness compiles with `strictNullChecks: false`, and without
 * it TypeScript will not use `ok: false` as a discriminant — so `if (!r.ok)`
 * narrows nothing here even though it narrows fine under the project's own
 * config. `in` narrows regardless.
 */
function why(result: { ok: boolean } | { ok: false; error: string }): string {
  return "error" in result ? result.error : ""
}

function sampleDoc(): SiteDocument {
  const base = emptyDocument()
  return {
    ...base,
    pages: [
      {
        id: "home",
        path: "/",
        name: "Home",
        sections: [
          { id: "n1", type: "navbar", props: { brand: "Fade & Blade" } },
          { id: "h1", type: "hero", props: { heading: "Sharper than your last cut." } },
          { id: "ft1", type: "footer", props: { brand: "Fade & Blade" } },
        ],
      },
    ],
  }
}

/**
 * ---------------------------------------------------------------------------
 *  EVERY SECTION IN THE LIBRARY ACTUALLY RENDERS
 * ---------------------------------------------------------------------------
 * These component sources are copied verbatim into a creator's project, so a
 * typo in one of them is a broken site rather than a failing build here. The
 * library went from six sections to nineteen in one change, which is thirteen
 * new files nobody has run.
 *
 * So this runs them — the real renderCheck, the same one that gates a publish,
 * in a child process against real React.
 *
 * EVERY LIST IS POPULATED, and that is the point. With empty lists the
 * `items.map(...)` body never executes and the whole check passes while
 * proving almost nothing. Filling them is what makes the mapped markup — the
 * part most likely to be wrong — actually run.
 */
{
  function sampleValue(spec: PropSpec): PropValue {
    switch (spec.kind) {
      case "list":
        return [0, 1, 2].map(() =>
          Object.fromEntries(
            Object.entries(spec.item ?? {}).map(([key, inner]) => [key, sampleValue(inner)]),
          ),
        ) as PropValue
      case "number":
        return typeof spec.fallback === "number" ? spec.fallback : 3
      case "boolean":
        return true
      case "color":
        return "#101014"
      case "image":
        return "https://example.com/a.jpg"
      case "url":
        return "/about"
      case "select":
        return spec.options?.[0] ?? "left"
      default:
        return "Some text\n\nA second paragraph"
    }
  }

  const types = Object.keys(SECTIONS)
  const everySection = renderDocument({
    revision: 1,
    theme: { ...DEFAULT_THEME },
    pages: [
      {
        id: "home",
        path: "/",
        name: "Home",
        sections: types.map((type, index) => ({
          id: `s${index}`,
          type,
          props: Object.fromEntries(
            Object.entries(SECTIONS[type].props).map(([key, spec]) => [key, sampleValue(spec)]),
          ),
        })),
      },
    ],
  })

  check(
    "the library is a whole-site vocabulary, not a landing-page one",
    /**
     * Six sections — navbar, hero, features, testimonials, cta, footer — is the
     * vocabulary of a single marketing page. It is why every generation came
     * out as one landing page: "build several pages" has nowhere to put the
     * second page's content. These are the ones a second page needs.
     */
    ["services", "pricing", "faq", "gallery", "team", "contact", "hours", "richtext"].every(
      (type) => type in SECTIONS,
    ),
    types.join(", "),
  )

  const rendered = await renderCheck(everySection)
  /**
   * `"reason" in x` rather than `!x.ran`, because this suite compiles with
   * strictNullChecks off and a boolean discriminant does not narrow there —
   * the same reason opError() exists in the operations. A property test does.
   */
  const detail =
    "reason" in rendered ? rendered.reason : rendered.ok ? "" : formatRenderFailure(rendered)
  check(
    "every section in the library renders, with every list populated",
    /**
     * `ran: false` is not a pass. It means the check could not run, and
     * treating that as green is how a gate stops being one.
     */
    rendered.ran === true && rendered.ok === true,
    detail,
  )
}

{
  const files = renderDocument(sampleDoc())
  check(
    "a document renders a whole project",
    ["index.html", "src/main.tsx", "src/App.tsx", "src/styles.css", "src/sections/Hero.tsx"].every(
      (path) => typeof files[path] === "string" && files[path].length > 0,
    ),
    Object.keys(files).join(", "),
  )
  check(
    "and only the sections it uses",
    !!files["src/sections/Navbar.tsx"] && !files["src/sections/Testimonials.tsx"],
  )

  /**
   * Deterministic, because a render that varied would make every save a diff
   * and every publish a new deployment of an unchanged site.
   */
  check(
    "the same document renders the same bytes",
    JSON.stringify(renderDocument(sampleDoc())) === JSON.stringify(files),
  )
}

{
  /**
   * The property that makes the whole design work: an edit through the
   * operations reaches the code, and only that edit does.
   */
  const before = renderDocument(sampleDoc())
  const changed = updateSectionProps(sampleDoc(), { sectionId: "h1", props: { background: "#000000" } })
  check("a prop edit succeeds", changed.ok === true, why(changed))

  if ("doc" in changed) {
    const after = renderDocument(changed.doc)
    check(
      "and reaches the generated code",
      after["src/App.tsx"].includes('background="#000000"') &&
        !before["src/App.tsx"].includes("#000000"),
    )
    /**
     * Compared against the LIBRARY SOURCE, not merely against the previous
     * render. The first version asserted the two renders matched, which stays
     * true if every render alters the component the same way — so a renderer
     * that rewrote section files passed it.
     */
    check(
      "while the section component is the library's file, verbatim",
      after["src/sections/Hero.tsx"] === sectionSpec("hero")?.file.source &&
        before["src/sections/Hero.tsx"] === sectionSpec("hero")?.file.source,
    )
    check("and every other file is byte-identical", after["src/styles.css"] === before["src/styles.css"])
  }
}

{
  const doc = sampleDoc()
  /**
   * A prop the editor cannot render is worse than a refused edit: the control
   * disappears, or shows a value nothing will honour, and the creator's next
   * move changes something that has already stopped meaning anything.
   */
  const unknown = updateSectionProps(doc, { sectionId: "h1", props: { backgroundColor: "#000" } })
  check(
    "an unknown prop is refused, by name",
    unknown.ok === false && /no prop called "backgroundColor"/.test(why(unknown)),
    why(unknown) || "accepted",
  )
  check(
    "and the refusal suggests the prop that was meant",
    /did you mean "background"/.test(why(unknown)),
    why(unknown),
  )

  const wrongType = updateSectionProps(doc, { sectionId: "h1", props: { layout: "diagonal" } })
  check(
    "a value outside a select is refused with the options",
    /one of: split, centered/.test(why(wrongType)),
    why(wrongType) || "accepted",
  )

  const badList = updateSectionProps(doc, { sectionId: "n1", props: { links: [{ label: "A", to: "#" }] } })
  check(
    "a list item with an unknown field is refused",
    /no field called "to"/.test(why(badList)),
    why(badList) || "accepted",
  )
}

{
  const doc = sampleDoc()
  check("a section can be added", addSection(doc, { pageId: "home", type: "cta", id: "c1", index: 2 }).ok)
  check(
    "an unknown section type is refused",
    !addSection(doc, { pageId: "home", type: "carousel", id: "x1" }).ok,
  )
  check(
    "a duplicate id is refused, because two sections cannot answer to one name",
    !addSection(doc, { pageId: "home", type: "cta", id: "h1" }).ok,
  )

  const moved = moveSection(doc, { sectionId: "ft1", index: 0 })
  check(
    "a section can be reordered",
    "doc" in moved && moved.doc.pages[0].sections[0].id === "ft1",
  )

  const removed = removeSection(doc, { sectionId: "h1" })
  check("a section can be removed", "doc" in removed && removed.doc.pages[0].sections.length === 2)

  const copied = duplicateSection(doc, { sectionId: "h1", newId: "h2" })
  check(
    "and duplicated, next to the original",
    "doc" in copied && copied.doc.pages[0].sections[2].id === "h2" && copied.doc.pages[0].sections[2].type === "hero",
  )
}

{
  const doc = sampleDoc()
  const themed = updateTheme(doc, { primary: "#c8a24a", radius: 2 })
  check("the theme can be changed in one write", themed.ok)
  if ("doc" in themed) {
    const css = renderDocument(themed.doc)["src/styles.css"]
    check(
      "and every section follows, because they read tokens rather than literals",
      css.includes("--primary: #c8a24a") && css.includes("--radius: 2px"),
    )
  }
  check("an unknown theme key is refused", !updateTheme(doc, { colour: "#fff" } as never).ok)
}

{
  /**
   * The revision is the compare-and-swap key. Every operation bumps it, so two
   * writes that raced can be told apart rather than silently overwriting one
   * another — the brief's "avoid race conditions" as a property of the data.
   */
  const doc = sampleDoc()
  const first = updateSectionProps(doc, { sectionId: "h1", props: { heading: "A" } })
  check(
    "every write moves the revision",
    first.ok && "doc" in first && first.doc.revision === doc.revision + 1,
    why(first),
  )
  const refused = updateSectionProps(doc, { sectionId: "nope", props: {} })
  check("and a refused write does not", !refused.ok)
}

{
  const doc = sampleDoc()
  const extra = { "src/custom/RoiCalculator.tsx": "export default function RoiCalculator() { return null }" }
  const files = renderDocument(doc, extra)
  /**
   * Custom code is the escape hatch for what the library cannot express, and
   * it only works if a render cannot take it away. One unusual request must not
   * cost a creator the editable parts of their site.
   */
  check(
    "a render never touches custom code",
    files["src/custom/RoiCalculator.tsx"] === extra["src/custom/RoiCalculator.tsx"],
  )
  check(
    "and the renderer says which files it owns",
    isGenerated("src/App.tsx") && isGenerated("src/sections/Hero.tsx") && !isGenerated("src/custom/RoiCalculator.tsx"),
  )
}

{
  /**
   * Read from a JSONB column that anything could have written and handed to a
   * renderer that assumes its shape. Malformed must read as "no document" —
   * the site then falls back to its files — rather than as a document with
   * holes, which is how a page renders half of itself.
   */
  check("a real document is recognised", isSiteDocument(sampleDoc()))
  check("and rubbish is not", !isSiteDocument({ pages: [{ id: "x" }] }) && !isSiteDocument(null) && !isSiteDocument("{}"))
  /**
   * The case that matters is the one that is ALMOST right — a revision and a
   * theme in place, and a page missing the fields the renderer walks. The
   * first version only tried objects with no revision at all, so the page
   * validation could be deleted without a failure.
   */
  check(
    "including a document that is right everywhere except its pages",
    !isSiteDocument({ revision: 1, theme: emptyDocument().theme, pages: [{ id: "home" }] }) &&
      !isSiteDocument({ revision: 1, theme: emptyDocument().theme, pages: [{ id: "h", path: "/", sections: [{ type: "hero" }] }] }),
  )
}

check(
  "two writers cannot silently overwrite each other",
  (() => {
    const store = strip(read("lib/sites/document/store.ts"))
    /**
     * A creator dragging a section and an agent run rewriting the page can be
     * in flight at the same moment. The comparison has to happen in POSTGRES,
     * against the row as it is at that instant — reading the revision in
     * JavaScript and comparing it here leaves a window between the read and the
     * write, which is exactly where the lost update lives.
     */
    return (
      /query\.filter\("document->>revision", "eq", String\(expectedRevision\)\)/.test(store) &&
      /conflict: true/.test(store)
    )
  })(),
)

check(
  "the source is written before the output it generates",
  (() => {
    const store = strip(read("lib/sites/document/store.ts"))
    /**
     * The two writes cannot be one transaction through PostgREST, so one can
     * land without the other and the ORDER decides which way a half-failure
     * breaks. Document first: the source is then correct and the files are
     * stale, which the next render fixes. The other order loses the creator's
     * actual change and keeps code nobody asked for.
     */
    return store.indexOf(".update({ document: doc })") < store.indexOf("renderDocument(doc, existing)")
  })(),
)

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failed:")
  for (const f of failures) console.log(`  · ${f}`)
  process.exit(1)
}
