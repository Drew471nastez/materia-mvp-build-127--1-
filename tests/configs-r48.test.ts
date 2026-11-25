/**
 * ===========================================================================
 *  ROUND 48, R48-6: CREATOR PAGE CONFIGS ARE NOT READ WITH THE ANON KEY
 * ===========================================================================
 * store_builder_configs and product_page_configs hold drafts and the
 * creator's typed contact address. The public pages read them with the anon
 * key, which needs a policy opening the tables to that key, and the key is
 * in every page: anybody could read every row through the REST API.
 *
 * Now the public reads go through lib/store-builder/public-config.ts (the
 * service role, published_config only, the contact address taken out), the
 * owner's screens keep the owner's own session or the ownership checked
 * service role, and run-now part 354 closes the tables to anon.
 *
 * This pins:
 *   1. every read of the two tables in app, components, lib and hooks, by
 *      file, as public (service role, narrow) or owner; a new reader fails
 *      here until it is put in one list or the other;
 *   2. no public loader reaches the tables with the anon or session client;
 *   3. the columns a public read selects exclude draft_config;
 *   4. the contact address is taken out, by running the real reader against
 *      a stubbed PostgREST;
 *   5. the creator page and /api/creator-contact still get the typed address,
 *      on the server only;
 *   6. SQL part 354's shape.
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { readCode } from "./_source"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail)?.slice(0, 600)}`}`)
  }
}
const read = (p: string) => readFileSync(p, "utf8")

const TABLE_READ = /\.from\(\s*["'](store_builder_configs|product_page_configs)["']\s*\)/g

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue
    const p = join(dir, name)
    const s = statSync(p)
    if (s.isDirectory()) walk(p, out)
    else if (/\.(ts|tsx|js|mjs)$/.test(name)) out.push(p)
  }
  return out
}

/* ── 1. every reader, by kind ────────────────────────────────────────────── */

/** Public: anybody may cause the read. Each must use the service role and select published config paths only. */
const PUBLIC_READERS = [
  "lib/store-builder/public-config.ts",
  "app/api/store-builder/published/route.ts",
  "app/api/onepage/seller-avatar/route.ts",
]
/**
 * Owner: the creator's own screens and saves. Each reads its own store, with
 * the owner's session (owner policies) or the service role after an
 * ownership check (lib/team/creator-page.ts, onboarding, account deletion).
 * The two onboarding modals are browser code on the owner's own session:
 * they read and write their own row under the owner policies part 354 keeps.
 */
const OWNER_READERS = [
  "app/api/creator-profile/route.ts",
  "app/api/store-builder/apply-theme-globally/route.ts",
  "app/api/store-builder/preview/route.ts",
  "app/api/store-builder/route.ts",
  "app/(storelib)/app/onepage/page.tsx",
  "app/(storelib)/app/settings/_server.ts",
  "components/app/creator-onboarding-modal.tsx",
  "components/onepage/onboarding-modal.tsx",
  "lib/account/avatar-save.ts",
  "lib/account/profile-follow.ts",
  "lib/files/usage-server.ts",
  "lib/profile/page-look.ts",
  "lib/store-builder/ensure-store-published.ts",
  /* r51: the creator page's and the OnePage's social links kept as one, called only from the owner's own saves (creator-profile, onepage/publish) with their client. */
  "lib/social/onepage-sync.ts",
  /* Round 51: Contacts › Forms' "used on", the signed in owner's own creator page configs searched for their forms' ids (service role, creator id from the session, app/api/forms?overview=1). */
  "lib/forms/overview-server.ts",
  /* Round 63: admin Build website reads one creator's published shop config (service role, behind the admin check in app/api/admin/creators/site) to fill the Storelib Default with their own hero and text. */
  "lib/admin/creator-site/build.ts",
]

function readersInRepo(): string[] {
  const files = ["app", "components", "lib", "hooks"].flatMap((d) => {
    try {
      return walk(d)
    } catch {
      return []
    }
  })
  return files.filter((f) => new RegExp(TABLE_READ.source).test(readCode(f))).sort()
}

function inventory() {
  console.log("\n1. Every read of the two tables is a known public or owner reader\n")
  const found = readersInRepo()
  const known = new Set([...PUBLIC_READERS, ...OWNER_READERS])
  const unknown = found.filter((f) => !known.has(f))
  check("no reader outside the two lists (a new one is classed here first)", unknown.length === 0, unknown)
  const gone = [...known].filter((f) => !found.includes(f))
  check("every listed reader still reads the tables (the lists are current)", gone.length === 0, gone)
}

/* ── 2. public loaders do not reach the tables with anon or the session ──── */

const PUBLIC_LOADERS = [
  "lib/commerce/product-page-cache.ts",
  "lib/commerce/product-page-data.ts",
  "lib/commerce/creator-page-data.ts",
  "lib/store-builder/get-published-config.ts",
  "app/(storelib)/(marketing)/u/[username]/page.tsx",
  "app/(storelib)/(marketing)/u/[username]/layout.tsx",
  "app/(storelib)/(marketing)/p/[slug]/page.tsx",
  "app/api/creator-contact/route.ts",
]

function publicReadsAreServer() {
  console.log("\n2. Public pages read the configs through the server's narrow reader\n")
  for (const f of PUBLIC_LOADERS) {
    check(`${f} has no direct read of the two tables`, !new RegExp(TABLE_READ.source).test(readCode(f)))
  }
  const cache = readCode("lib/commerce/product-page-cache.ts")
  const storeFn = cache.slice(cache.indexOf("export const cachedStoreConfig"), cache.indexOf("export const cachedProductPageConfig"))
  const productFn = cache.slice(cache.indexOf("export const cachedProductPageConfig"), cache.indexOf("export const cachedProductPageConfig") + 600)
  check("the shared shop config cache reads through readPublishedStoreConfig", /readPublishedStoreConfig\(creatorId, pageType\)/.test(storeFn) && !/createPublicReadClient/.test(storeFn), storeFn)
  check("the shared product override cache reads through readPublishedProductPageConfig", /readPublishedProductPageConfig\(creatorId, productId\)/.test(productFn) && !/createPublicReadClient/.test(productFn))
  check(
    "the cache keys, tags and minute are unchanged",
    /\["store-config", creatorId, pageType\],\s*\{ revalidate: PRODUCT_CACHE_TTL, tags: \[creatorTag\(creatorId\)\] \}/.test(storeFn) &&
      /\["product-page-config", creatorId, productId\],\s*\{ revalidate: PRODUCT_CACHE_TTL, tags: \[creatorTag\(creatorId\), productTag\(productId\)\] \}/.test(productFn),
  )
  check("the product cache itself still never imports the service role", !/SERVICE_ROLE|supabase\/admin/.test(cache))

  const gp = readCode("lib/store-builder/get-published-config.ts")
  check("getPublishedConfig no longer takes the cookie client", !/lib\/supabase\/server/.test(gp) && /readPublishedStoreConfig\(creatorId, pageType\)/.test(gp))
  /* Round 49: for everybody (the page is one HTML for all, a save expires the copy: lib/storefront/creator-page-purge). */
  check("getPublishedConfig keeps the shared copy for every visitor", /const shared = await cachedStoreConfig\(creatorId, pageType\)\.catch\(\(\) => undefined\)\s*if \(shared !== undefined\) return publishedOf\(shared\)/.test(gp) && !/requestMayHaveSession/.test(gp))
  const pd = readCode("lib/commerce/product-page-data.ts")
  check("loadStoreConfig and loadProductPageConfig fall back to the narrow reader", /return readPublishedStoreConfig\(creatorId, pageType\)/.test(pd) && /return readPublishedProductPageConfig\(creatorId, productId\)/.test(pd))
  const cd = readCode("lib/commerce/creator-page-data.ts")
  check("loadShopConfig falls back to the narrow reader", /return readPublishedStoreConfig\(creatorId, "shop"\)/.test(cd))

  const pc = readCode("lib/store-builder/public-config.ts")
  check("public-config is server only", /^import "server-only"/m.test(read("lib/store-builder/public-config.ts")))
  const reads = pc.match(/createAdminClient\(\)\s*\.from\(/g) ?? []
  const all = pc.match(new RegExp(TABLE_READ.source, "g")) ?? []
  check("every read in public-config is the service role", reads.length === all.length && all.length === 3, { reads: reads.length, all: all.length })
  for (const f of ["app/api/store-builder/published/route.ts", "app/api/onepage/seller-avatar/route.ts"]) {
    const src = readCode(f)
    check(`${f} reads the config with the service role`, /createAdminClient\(\)\s*\.from\("store_builder_configs"\)/.test(src))
  }
  check("public-read.ts is still the anon key alone", !/SERVICE_ROLE/.test(readCode("lib/supabase/public-read.ts")))
}

/* ── 3. columns ──────────────────────────────────────────────────────────── */

function selectsOf(src: string): string[] {
  const out: string[] = []
  const re = /\.from\(\s*["'](?:store_builder_configs|product_page_configs)["']\s*\)\s*\.select\(\s*([^)]*)\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) out.push(m[1])
  return out
}

function columns() {
  console.log("\n3. A public read selects the published config, never the draft\n")
  const pc = readCode("lib/store-builder/public-config.ts")
  check("PUBLIC_CONFIG_COLUMNS is published_config alone", /export const PUBLIC_CONFIG_COLUMNS = "published_config" as const/.test(pc))
  for (const f of PUBLIC_READERS) {
    const sels = selectsOf(readCode(f))
    check(`${f}: every select names no draft and no *`, sels.length > 0 && sels.every((s) => !/draft|\*/.test(s)), sels)
    check(`${f}: every select reads published_config (or the shared column constant)`, sels.every((s) => /published_config|PUBLIC_CONFIG_COLUMNS/.test(s)), sels)
  }
}

/* ── 4. the contact address is taken out (the real reader, stubbed REST) ── */

async function stripping() {
  console.log("\n4. The contact address never leaves the server with the config\n")
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://configs-r48.stub"
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key-r48"
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key-r48"
  const mod = await import("@/lib/store-builder/public-config")

  const input = {
    headerSettings: { contactEmail: "me@private.test", bio: "Hello", avatarUrl: "https://x/a.png" },
    sections: [{ id: "header-1", type: "header", settings: { contactEmail: "me@private.test", title: "T" } }, { id: "a", type: "about" }],
    globalSettings: { themePreset: "maya" },
  }
  const copy = JSON.parse(JSON.stringify(input))
  const out = mod.withoutPrivateConfig(input) as typeof input
  const outHeader = out.headerSettings as Record<string, unknown>
  check("withoutPrivateConfig takes contactEmail out of headerSettings", !("contactEmail" in outHeader) && outHeader.bio === "Hello")
  check("and out of a section's settings", !("contactEmail" in (out.sections[0].settings as object)) && (out.sections[0].settings as { title?: string }).title === "T")
  check("and keeps everything else", out.globalSettings.themePreset === "maya" && out.sections.length === 2 && outHeader.avatarUrl === "https://x/a.png")
  check("and leaves the value it was given as it was", JSON.stringify(input) === JSON.stringify(copy))
  check("nothing else is changed by it", JSON.stringify(mod.withoutPrivateConfig(null)) === "null" && mod.withoutPrivateConfig("x" as never) === "x")

  const seen: { url: string; key: string | null }[] = []
  let answer: unknown = null
  const realFetch = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    const h = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    seen.push({ url: decodeURIComponent(url), key: h.get("apikey") })
    const accept = h.get("accept") || ""
    const body = accept.includes("vnd.pgrst.object") ? answer : answer === null ? [] : [answer]
    if (accept.includes("vnd.pgrst.object") && answer === null) return new Response(JSON.stringify({ code: "PGRST116", message: "0 rows" }), { status: 406, headers: { "content-type": "application/json" } })
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json; charset=utf-8" } })
  }) as typeof fetch
  try {
    answer = { published_config: input }
    const row = await mod.readPublishedStoreConfig("c-1", "shop")
    const last = seen[seen.length - 1]
    check("readPublishedStoreConfig asks with the service role key", last?.key === "service-key-r48", last)
    check("for published_config only, by creator and page type", /\/rest\/v1\/store_builder_configs\?select=published_config&creator_id=eq\.c-1&page_type=eq\.shop/.test(last?.url ?? ""), last?.url)
    const hs = (row as { published_config?: { headerSettings?: Record<string, unknown> } } | null)?.published_config?.headerSettings
    check("and hands back the config without the contact address", !!hs && !("contactEmail" in hs) && hs.bio === "Hello", row)

    const p = await mod.readPublishedProductPageConfig("c-1", "p-9")
    const lastP = seen[seen.length - 1]
    check("readPublishedProductPageConfig: the same, by creator and product", /\/rest\/v1\/product_page_configs\?select=published_config&creator_id=eq\.c-1&product_id=eq\.p-9/.test(lastP?.url ?? "") && lastP?.key === "service-key-r48" && !JSON.stringify(p).includes("private.test"), lastP)

    answer = { published_config: {} }
    check("an empty published config reads as nothing published, as the anon policy answered", (await mod.readPublishedStoreConfig("c-2", "shop")) === null)
    answer = null
    check("no row is nothing published", (await mod.readPublishedStoreConfig("c-3", "shop")) === null)

    answer = { contact: "typed@private.test" }
    check("loadTypedContactEmail reads the one path, for the server's own use", (await mod.loadTypedContactEmail("c-4")) === "typed@private.test")
    const lastT = seen[seen.length - 1]
    check("  and only that path, never the config", /select=contact:published_config->headerSettings->>contactEmail&creator_id=eq\.c-4&page_type=eq\.shop/.test(lastT?.url ?? "") && lastT?.key === "service-key-r48", lastT?.url)
  } finally {
    globalThis.fetch = realFetch
  }
}

/* ── 5. the two places that may use the typed address ─────────────────── */

function typedAddress() {
  console.log("\n5. The creator page and /api/creator-contact still get the typed address, on the server\n")
  const page = readCode("app/(storelib)/(marketing)/u/[username]/page.tsx")
  /* Round 49: the page is one HTML for everybody and never holds the typed address; it is read for the owner's own form by /api/creator-page/viewer, and for a buyer's Contact by /api/creator-contact. */
  const viewerRoute = readCode("app/api/creator-page/viewer/route.ts")
  check("the creator page never reads it; the owner's form asks its own route", !/loadTypedContactEmail/.test(page) && /const contactEmail = owner \? await loadTypedContactEmail\(row\.id\) : null/.test(viewerRoute))
  check("and a buyer's Contact is answered by /api/creator-contact alone", /typedEmail: \(creatorId\) => loadTypedContactEmail\(creatorId\)/.test(readCode("app/api/creator-contact/route.ts")))
  check("the header's client component still gets the settings without it", /settings=\{withoutContactEmail\(headerSettings\)\}/.test(page))
  const route = readCode("app/api/creator-contact/route.ts")
  check("/api/creator-contact asks loadTypedContactEmail", /typedEmail: \(creatorId\) => loadTypedContactEmail\(creatorId\)/.test(route))
  const pub = readCode("app/api/store-builder/published/route.ts")
  check("/api/store-builder/published answers the config without the address", /withoutPrivateConfig\(config\.published_config\)/.test(pub))
}

/* ── 6. SQL part 354 ─────────────────────────────────────────────────────── */

function sql() {
  console.log("\n6. SQL part 354\n")
  const part = read("supabase/sql/run-now/354_builder_configs_private.sql")
  const copy = read("supabase/migrations/20271108_builder_configs_private.sql")
  const lines = part.trimEnd().split("\n")
  check("the migrations copy is byte identical", part === copy)
  check("line 1 is the header, and says to run it only after the round 48 deploy", /^\/\*.*Run only after the deploy that moved public reads to the server \(round 48\).*\*\/$/.test(lines[0]))
  check("one statement per line, then the schema reload", lines.length === 4 && lines[3] === "notify pgrst, 'reload schema';")
  const drop = lines[1]
  check("drops permissive SELECT or ALL policies that are not owner policies, on both tables", /ARRAY\['store_builder_configs', 'product_page_configs'\]/.test(drop) && /p\.permissive = 'PERMISSIVE' AND p\.cmd IN \('SELECT', 'ALL'\)/.test(drop) && /DROP POLICY %I ON public\.%I/.test(drop))
  check("  an owner policy reads auth.uid() and creator_id and no config column", drop.includes("NOT (coalesce(p.qual, '') ~ 'auth\\.uid\\(\\)' AND coalesce(p.qual, '') ~ 'creator_id' AND coalesce(p.qual, '') !~ '(published_config|draft_config|published_at)')"))
  check("  and names each policy it drops", /RAISE NOTICE 'part 354: dropped policy/.test(drop))
  check("  and skips a table that is not there", /IF to_regclass\('public\.' \|\| t\) IS NULL THEN/.test(drop))
  const own = lines[2]
  const owner = "creator_id IN (SELECT c.id FROM public.creators c WHERE c.user_id = (SELECT auth.uid()))"
  for (const cmd of ["select", "insert", "update", "delete"]) {
    check(`  the owner ${cmd} policy, made only when missing, for authenticated`, own.includes(`policyname = t || '_owner_${cmd}') THEN EXECUTE format('CREATE POLICY %I ON public.%I FOR ${cmd.toUpperCase()} TO authenticated`))
  }
  check("  every owner policy uses (select auth.uid()), never a bare call", own.split(owner).length - 1 === 5 && !/[^(]auth\.uid\(\)\)\)/.test(own.split(owner).join("")))
  check("  row level security on and nothing granted to anon", /ENABLE ROW LEVEL SECURITY/.test(own) && /REVOKE ALL ON public\.%I FROM anon/.test(own))
  check("no policy is created for anon or public", !/TO (anon|public)\b/i.test(own))

  const after = read("supabase/sql/run-now/99_check_after.sql")
  check("99_check_after has the p354 column", /as p354_builder_configs_private[,;]/.test(after))
  const col = after.slice(after.indexOf("as p353_rls_initplan_and_product_counters, ") + 43)
  check(
    "  true only when anon cannot select and no anon-readable policy remains",
    /not has_table_privilege\('anon', 'public\.store_builder_configs', 'SELECT'\)/.test(col) &&
      /not has_table_privilege\('anon', 'public\.product_page_configs', 'SELECT'\)/.test(col) &&
      /not exists \(select 1 from pg_policies p where .*p\.cmd in \('SELECT', 'ALL'\)/.test(col),
  )
  check("the README has its row", read("supabase/sql/run-now/README.md").includes("| `354_builder_configs_private.sql` |"))
  check("the bundles carry it", read("supabase/sql/all-in-two/1_of_2_everything.sql").includes(lines[1]))
}

async function main() {
  inventory()
  publicReadsAreServer()
  columns()
  await stripping()
  typedAddress()
  sql()
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
