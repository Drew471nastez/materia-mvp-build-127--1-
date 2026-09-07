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
  "ownership is proved before any file is written",
  (() => {
    const src = read("lib/sites/projects.ts")
    const save = src.slice(src.indexOf("export async function saveFiles"))
    // The ownership-proving update must come BEFORE the upsert, not after.
    return save.indexOf('.from("sites")') < save.indexOf('.from("site_files")') &&
      save.includes("not yours to edit")
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
  "the send button actually sends",
  (() => {
    const sends = /onClick=\{\(\) => void send\(draft\)\}/.test(chat)
    // Disabled only while a run is in flight or there is nothing to send —
    // never unconditionally.
    const conditional = /disabled=\{busy \|\| draft\.trim\(\)\.length === 0\}/.test(chat)
    return sends && conditional
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
    const usesLocal = shell.includes('src="/storelib-mark.svg"')
    const noRemote = !/supabase\.co|https?:\/\//.test(shell.replace(/^\s*\*.*$/gm, ""))
    return usesLocal && noRemote && existsSync(join(root, "public/storelib-mark.svg"))
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
  runSource.includes("saveFiles(siteId, changed)") &&
    !/from\("site_files"\)/.test(runSource) &&
    !/from\("site_files"\)/.test(toolSource),
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

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failed:")
  for (const f of failures) console.log(`  · ${f}`)
  process.exit(1)
}
