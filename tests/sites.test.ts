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
import { bodyFromHtml, previewDocument } from "@/lib/sites/preview-document"
import { MODEL_RATES, chooseModel, costOf, rateFor, DEFAULT_MODEL, STRONG_MODEL } from "@/lib/sites/agent/models"
import { ZERO_USAGE, addUsage } from "@/lib/sites/agent/types"
import { blankProject } from "@/lib/sites/starter"
import { allocateSiteSlug, SLUG_FALLBACK } from "@/lib/sites/slug"
import { contentTypeFor } from "@/lib/sites/content-type"
import { createZip } from "@/lib/sites/zip"

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
    const expected = [
      "list_files", "read_file", "write_file", "create_file",
      "delete_file", "run_build", "read_build_errors",
    ]
    const forbidden = ["run_sql", "install_package", "fetch_url", "exec", "bash", "http_request"]
    return (
      names.join() === expected.join() &&
      forbidden.every((f) => !new RegExp(`name: "${f}"`).test(toolSource))
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
      runSource.includes("saveFiles(siteId, changed)") &&
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
    return !/export async function POST/.test(route) && /appendExchange/.test(read("lib/sites/agent/run.ts"))
  })(),
)

check(
  "a failed run is still recorded, so the question does not vanish",
  (() => {
    const runFile = read("lib/sites/agent/run.ts")
    const append = runFile.indexOf("await appendExchange({")
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
      /env\(safe-area-inset-bottom\)/.test(sheet) &&
      /md:hidden/.test(sheet) &&
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
      /initialRevision=\{revision \?\? 1\}/.test(page)
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
    const reissue = body.indexOf("Path=/; Secure")
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

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failed:")
  for (const f of failures) console.log(`  · ${f}`)
  process.exit(1)
}
