/**
 * ===========================================================================
 *  PUBLISHED SITES WHEN THE DATABASE IS SLOW, WAVE 2 (round rel-sites2)
 * ===========================================================================
 *   EVD-1  a site keeps serving on a server that never served it (a new
 *          deploy, a scale-out) while every database read fails: the copy is
 *          in Next's data cache under names that outlive a deploy, and a
 *          publish or a take down still drops it.
 *
 * NEXT'S OWN CODE, NOT A STAND-IN. `next/cache` is answered here by Next's
 * real unstable_cache (next/dist/server/web/spec-extension/unstable-cache.js)
 * over Next's real IncrementalCache, whose shared store is a map standing in
 * for Vercel's Data Cache (installed where Vercel installs it, as the global
 * FetchCache handler, so the 2MB limit applies as in production). A request
 * runs in a work store as Next runs it, and what Next leaves pending at the
 * end of a request (the writes) is awaited, as Next does.
 *
 * A FRESH SERVER IS A FRESH PROCESS: the suite runs itself again with the
 * store written to a file, two hours on, every unlabelled cached function
 * renamed (what a new deploy's minifier does to its text) and Supabase
 * failing every read. Nothing of the first process's memory goes along.
 */
import { AsyncLocalStorage } from "node:async_hooks"
import { createRequire } from "node:module"
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, relative } from "node:path"
import JSZip from "jszip"

const require = createRequire(import.meta.url)

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  FAIL  ${label}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fixture.supabase.co"
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-fixture-key"
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-fixture-key"
process.env.NEXT_PUBLIC_MAIN_DOMAIN = "storelib.com"
process.env.NEXT_PUBLIC_SITE_URL = "https://storelib.com"

const ROLE = process.env.SITES2_ROLE ?? "main"

/* ── Next's data cache, for real ─────────────────────────────────────────── */

type Stored = { value: unknown; lastModified: number; tags: string[] }
const shared = new Map<string, Stored>()
const tagExpired = new Map<string, number>()
const sizesRefused: string[] = []

/** Vercel's shared Data Cache, as a map: an entry is kept until a tag on it is expired. */
class SharedDataCache {
  async get(key: string) {
    const e = shared.get(key)
    if (!e) return null
    if (e.tags.some((t) => (tagExpired.get(t) ?? -Infinity) >= e.lastModified)) return null
    return { value: e.value, lastModified: e.lastModified }
  }
  async set(key: string, data: unknown, ctx: { tags?: string[] }) {
    if (!data) {
      shared.delete(key)
      return
    }
    shared.set(key, { value: JSON.parse(JSON.stringify(data)), lastModified: Date.now(), tags: ctx?.tags ?? [] })
  }
  async revalidateTag(tags: string | string[]) {
    for (const t of Array.isArray(tags) ? tags : [tags]) tagExpired.set(t, Date.now())
  }
  resetRequestCache() {}
}
;(globalThis as Record<symbol, unknown>)[Symbol.for("@next/cache-handlers")] = { FetchCache: SharedDataCache }

/* What Next's server sets up before any of its code runs (next/dist/server/node-environment). */
;(globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage = AsyncLocalStorage
const { unstable_cache: realUnstableCache } = require("next/dist/server/web/spec-extension/unstable-cache.js")
const { workAsyncStorage } = require("next/dist/server/app-render/work-async-storage.external.js")
const { IncrementalCache } = require("next/dist/server/lib/incremental-cache/index.js")

const origWarn = console.warn
console.warn = (...a: unknown[]) => {
  if (typeof a[0] === "string" && a[0].includes("items over 2MB")) sizesRefused.push(a[0])
  else origWarn(...a)
}

function incrementalCache() {
  return new IncrementalCache({
    dev: false,
    minimalMode: true,
    requestHeaders: {},
    maxMemoryCacheSize: 0,
    fetchCacheKeyPrefix: "",
    getPrerenderManifest: () => ({ version: 4, routes: {}, dynamicRoutes: {}, notFoundRoutes: [], preview: { previewModeId: "test", previewModeSigningKey: "", previewModeEncryptionKey: "" } }),
  })
}

/** One request, as Next runs it: a work store, then what it left pending awaited. `isr`: an ISR revalidation (static generation). */
async function asRequest<T>(fn: () => Promise<T>, opts: { isr?: boolean } = {}): Promise<T> {
  const store = {
    isStaticGeneration: !!opts.isr,
    fetchCache: undefined,
    isOnDemandRevalidate: false,
    isDraftMode: false,
    incrementalCache: incrementalCache(),
    route: "/test",
    nextFetchId: 1,
    pendingRevalidates: {} as Record<string, Promise<unknown>>,
    pendingRevalidatedTags: [],
  }
  try {
    return await workAsyncStorage.run(store, fn)
  } finally {
    await Promise.allSettled(Object.values(store.pendingRevalidates))
  }
}

/* A new deploy: every cached function's text is new, except one named by a fixed label (lib/website-builder/last-good.ts keyedAs). */
const DEPLOY = process.env.SITES2_DEPLOY ?? "1"
function asDeployed<F extends (...a: never[]) => unknown>(cb: F): F {
  if (DEPLOY === "1" || cb.toString().startsWith("storelib-held:")) return cb
  const renamed = ((...a: never[]) => cb(...a)) as F
  Object.defineProperty(renamed, "toString", { value: () => `deploy-${DEPLOY}:${cb.toString()}` })
  return renamed
}
;(globalThis as { __PUSH_TEST_NEXT_CACHE__?: unknown }).__PUSH_TEST_NEXT_CACHE__ = {
  unstable_cache: (cb: (...a: never[]) => unknown, keys?: string[], opts?: unknown) => realUnstableCache(asDeployed(cb), keys, opts),
  revalidateTag: (tag: string) => tagExpired.set(tag, Date.now()),
  updateTag: (tag: string) => tagExpired.set(tag, Date.now()),
  revalidatePath: () => {},
}
;(globalThis as { __PUSH_TEST_NEXT_HEADERS__?: unknown }).__PUSH_TEST_NEXT_HEADERS__ = { cookies: () => ({ get: () => undefined, getAll: () => [], has: () => false }), headers: () => new Headers() }

function dumpShared(file: string, opts: { agoMs: number; expireTags?: string[] }) {
  const now = Date.now()
  const entries = [...shared.entries()].map(([k, e]) => [k, { ...e, lastModified: e.lastModified - opts.agoMs }])
  const tags = [...tagExpired.entries()].map(([t, at]) => [t, at - opts.agoMs])
  for (const t of opts.expireTags ?? []) tags.push([t, now - 1])
  writeFileSync(file, JSON.stringify({ entries, tags }))
}
function loadShared(file: string) {
  const { entries, tags } = JSON.parse(readFileSync(file, "utf8")) as { entries: [string, Stored][]; tags: [string, number][] }
  for (const [k, e] of entries) shared.set(k, e)
  for (const [t, at] of tags) tagExpired.set(t, at)
}

/* ── Supabase: the fixture, or a database that answers nothing ──────────── */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
let restCalls = 0
const GATEWAY_PAGE = `<!DOCTYPE html>\n<html><head><title>supabase.co | 522: Connection timed out</title></head><body><h1>Connection timed out</h1></body></html>`
const gatewayPage = (status = 522) => new Response(GATEWAY_PAGE, { status, headers: { "content-type": "text/html; charset=UTF-8" } })
function failingDatabase(mode = process.env.SITES2_FAIL ?? "timeout") {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url)
    if (url.pathname.startsWith("/rest/v1/")) restCalls++
    if (mode === "html") return gatewayPage()
    return json(500, { code: "57014", message: "canceling statement due to statement timeout", details: null, hint: null })
  }) as typeof fetch
}

/* ── The sites: Maya's imported Shopify theme, Leo's Storelib theme ─────── */

async function postureTheme() {
  const { convertShopifyTheme } = await import("@/lib/storelib-theme/shopify/convert")
  const dir = join(process.cwd(), "tests", "fixtures", "shopify-posture")
  const zip = new JSZip()
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n)
      if (statSync(p).isDirectory()) walk(p)
      else zip.file(relative(dir, p), readFileSync(p))
    }
  }
  walk(dir)
  const r = await convertShopifyTheme(zip)
  if (!r.ok) throw new Error((r as { error: string }).error)
  return r.theme
}

async function useSites() {
  const { buildFixture, SITE } = await import("../scripts/speed18/fixture")
  const { fakeFetch, setRtt, useFixture } = await import("../scripts/speed18/fake-postgrest")
  const theme = await postureTheme()
  const f = buildFixture()
  const st = f.tables.store_theme_settings.find((r) => r.install_id === SITE.installId)!
  st.settings = { ...theme.settings }
  st.draft_settings = { ...theme.settings }
  f.tables.store_theme_custom_files = Object.entries(theme.files).map(([path, content], i) => ({ id: `f${i}`, install_id: SITE.installId, path, content, draft_content: null }))
  f.tables.store_theme_pages = [
    ...f.tables.store_theme_pages.filter((r) => r.install_id !== SITE.installId),
    ...theme.pages.map((p, i) => ({ id: `p${i}`, install_id: SITE.installId, page_key: p.page_key, sections: p.sections, draft_sections: null })),
  ]
  useFixture(f)
  setRtt(0)
  globalThis.fetch = fakeFetch as typeof fetch
}

/** Maya's front page through the imported theme's route, as the proxy sends it (sealed for her host). */
async function mayaPage(): Promise<{ status: number; body: string }> {
  const route = await import("@/app/api/site-theme/site/[username]/[[...path]]/route")
  const { sealSite, SITE_SEAL_HEADER } = await import("@/lib/storelib-theme/compat/site-seal")
  const { NextRequest } = await import("next/server")
  const host = "maya.storelib.com"
  const seal = await sealSite("maya", host)
  const req = new NextRequest("https://storelib.com/api/site-theme/site/maya", { headers: { host, accept: "text/html", [SITE_SEAL_HEADER]: seal ?? "" } })
  const res = (await route.GET(req as never, { params: Promise.resolve({ username: "maya", path: [] }) })) as Response
  return { status: res.status, body: await res.text() }
}

/** Leo's Storelib theme site, as /w/leo reads it. */
async function leoSite(): Promise<string> {
  const { publishedShopByName } = await import("@/lib/website-builder/published-site")
  try {
    const found = await publishedShopByName("leo")
    return found.kind === "site" ? `site:${found.site.displayName}:${Object.keys(found.site.pages).length}` : found.kind
  } catch (e) {
    return `threw:${e instanceof Error ? e.message : String(e)}`
  }
}

/* ── The fresh server (the child process) ─────────────────────────────────── */

async function freshServer() {
  loadShared(process.env.SITES2_CACHE!)
  failingDatabase()
  const maya = await asRequest(mayaPage)
  const leo = await asRequest(leoSite)
  /* The same page again, on a revalidation of the ISR page (/w/leo is ISR). */
  const leoIsr = await asRequest(leoSite, { isr: true })
  console.log(`RESULT ${JSON.stringify({ maya: { status: maya.status, body: maya.body.slice(0, 20000) }, leo, leoIsr, restCalls })}`)
}

function runFresh(cache: string, deploy: string, fail = "timeout"): { maya: { status: number; body: string }; leo: string; leoIsr: string; restCalls: number } {
  const out = execFileSync(process.execPath, [...process.execArgv, process.argv[1]], {
    env: { ...process.env, SITES2_ROLE: "fresh", SITES2_CACHE: cache, SITES2_DEPLOY: deploy, SITES2_FAIL: fail },
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  })
  const line = out.split("\n").find((l) => l.startsWith("RESULT "))
  if (!line) throw new Error(`the fresh server said nothing: ${out.slice(-2000)}`)
  return JSON.parse(line.slice(7))
}

/* ── EVD-1 ───────────────────────────────────────────────────────────────── */

async function nextKeepsStaleOnError() {
  console.log("\nEVD-1 a. Next's unstable_cache keeps a stale entry when its read throws (the behaviour the fix stands on)")
  let answer: () => Promise<string> = async () => "first"
  const cached = () => realUnstableCache(() => answer(), ["evd1-probe"], { revalidate: 60, tags: ["probe-tag"] })()
  check("a read that works is kept", (await asRequest(cached)) === "first")
  for (const [k, e] of shared) shared.set(k, { ...e, lastModified: e.lastModified - 120_000 })
  answer = async () => {
    throw new Error("canceling statement due to statement timeout")
  }
  const realError = console.error
  console.error = () => {}
  try {
    check("stale, and the read throws: the stale value is served to a visitor", (await asRequest(cached)) === "first")
    check("  and to an ISR revalidation (static generation waits for the read, then takes the stale value)", (await asRequest(cached, { isr: true })) === "first")
    check("  and the entry is still there afterwards", (await asRequest(cached)) === "first")
    tagExpired.set("probe-tag", Date.now())
    await sleep(2)
    let threw = false
    try {
      await asRequest(cached)
    } catch {
      threw = true
    }
    check("an entry whose tag was expired (Publish, a take down) is not served: the failed read throws", threw)
  } finally {
    console.error = realError
  }
}

async function sharedCopies() {
  console.log("\nEVD-1 b. The copy every server can read (lib/website-builder/shared-copy.ts)")
  const { keepShared, sharedCopy, keepSharedFiles, sharedFiles, resetSharedWrites, SHARED_MAX } = await import("@/lib/website-builder/shared-copy")
  check("no copy before one is kept", (await asRequest(() => sharedCopy("probe", ["a"], ["t-a"]))) === undefined)
  check("a copy is kept", await asRequest(() => keepShared("probe", ["a"], ["t-a"], { v: 1 })))
  check("  and read back", JSON.stringify(await asRequest(() => sharedCopy("probe", ["a"], ["t-a"]))) === '{"v":1}')
  check("  kept again on this server only after the refresh time", !(await asRequest(() => keepShared("probe", ["a"], ["t-a"], { v: 2 }))))
  check("a copy too big for an entry is not attempted", !(await asRequest(() => keepShared("probe", ["big"], [], "x".repeat(SHARED_MAX + 10)))) && sizesRefused.length === 0)
  tagExpired.set("t-a", Date.now())
  await sleep(2)
  check("a copy whose tag was expired is gone", (await asRequest(() => sharedCopy("probe", ["a"], ["t-a"]))) === undefined)
  const files: Record<string, string> = {}
  for (let i = 0; i < 12; i++) files[`shopify/assets/f${i}.css`] = `/* ${i} */ ${"a\"b\\c".repeat(60_000)}`
  resetSharedWrites()
  check("a theme of several megabytes is kept in parts", await asRequest(() => keepSharedFiles("probe-files", ["i1:v1"], ["t-f"], files)))
  check("  none of them refused by Next's 2MB limit", sizesRefused.length === 0, sizesRefused)
  const back = await asRequest(() => sharedFiles("probe-files", ["i1:v1"], ["t-f"]))
  check("  and read back whole", !!back && Object.keys(back).length === 12 && back["shopify/assets/f7.css"] === files["shopify/assets/f7.css"])
  check("  parts of another version are never read for this one", (await asRequest(() => sharedFiles("probe-files", ["i1:v2"], ["t-f"]))) === undefined)
}

async function freshServerServes() {
  console.log("\nEVD-1 c. A server that never served the site, a new deploy, every database read failing: the page is served")
  shared.clear()
  tagExpired.clear()
  await useSites()
  const { resetSharedWrites } = await import("@/lib/website-builder/shared-copy")
  resetSharedWrites()
  const first = await asRequest(mayaPage)
  check("Maya's imported theme is served while the database works", first.status === 200 && first.body.length > 1000, first.status)
  const leo = await asRequest(leoSite)
  check("Leo's Storelib theme site is read while the database works", leo.startsWith("site:"), leo)

  const dir = mkdtempSync(join(tmpdir(), "sites2-"))
  const cache = join(dir, "cache.json")
  /* Two hours on: every entry stale (the site's own hold is an hour). */
  dumpShared(cache, { agoMs: 2 * 3600_000 })
  const fresh = runFresh(cache, "2")
  check("the database answered nothing on the fresh server (every read was asked and failed)", fresh.restCalls > 0, fresh.restCalls)
  check("Maya's imported theme: 200, not the 503 'One moment' page", fresh.maya.status === 200 && !fresh.maya.body.includes("<title>One moment</title>"), fresh.maya.status)
  const titleOf = (b: string) => b.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim()
  check("  and it is her page as it was drawn before", fresh.maya.body.length > 1000 && titleOf(fresh.maya.body) === titleOf(first.body), [titleOf(fresh.maya.body), titleOf(first.body)])
  check("Leo's Storelib theme site is read from the copy every server kept", fresh.leo === leo, fresh.leo)
  check("  on an ISR revalidation of /w/leo too", fresh.leoIsr === leo, fresh.leoIsr)

  const viaGateway = runFresh(cache, "2", "html")
  check("the same with Supabase's gateway answering its HTML error page to every read (EVD-2): Maya 200, Leo from the copy", viaGateway.maya.status === 200 && viaGateway.leo === leo, [viaGateway.maya.status, viaGateway.leo])

  const { creatorSiteTag } = await import("@/lib/website-builder/published-site")
  const { SITE, OTHER } = await import("../scripts/speed18/fixture")
  const purged = join(dir, "purged.json")
  dumpShared(purged, { agoMs: 2 * 3600_000, expireTags: [creatorSiteTag(SITE.creatorId), creatorSiteTag(OTHER.creatorId)] })
  const after = runFresh(purged, "2")
  check("after a Publish or a take down (the site's tag expired) nothing old is served: Maya gets the 503 that tries again", after.maya.status === 503 && after.maya.body.includes("One moment"), after.maya.status)
  check("  and Leo's site read throws (the page's error, retried), never the old copy", after.leo.startsWith("threw:"), after.leo)
}

/* ── EVD-2 ───────────────────────────────────────────────────────────────── */

async function gatewayAnswers() {
  console.log("\nEVD-2. A gateway's HTML error page or a body cut short is a failed read (asked again), never data")
  const { isCutShort, isGatewayPage, GATEWAY_PAGE_CODE, CUT_SHORT_CODE } = await import("@/lib/storage/media-url")
  check("a 522 HTML page is a gateway page; PostgREST's own JSON error is not; a 404 page is handed back as it came", isGatewayPage(522, "text/html", GATEWAY_PAGE) && isGatewayPage(503, "", "  <!doctype html>") && !isGatewayPage(500, "application/json", '{"code":"57014"}') && !isGatewayPage(404, "text/html", GATEWAY_PAGE) && !isGatewayPage(200, "text/html", GATEWAY_PAGE))
  check("JSON that stops part way is cut short; whole JSON is not", isCutShort('[{"path":"a","content":"x') && isCutShort('[{"a":1},{"b":2}') && isCutShort('{"a":[1,2]') && !isCutShort('[{"a":1}]\n') && !isCutShort('{"a":1}') && !isCutShort("") && !isCutShort("null"))

  const { installFiles } = await import("@/lib/website-builder/compat-site")
  const { siteRead, isSiteReadError } = await import("@/lib/website-builder/site-read")
  const { createAdminClient } = await import("@/lib/supabase/admin")
  const rows = [{ path: "shopify/layout/theme.liquid", content: "<html>{{ content_for_layout }}</html>" }]
  const whole = JSON.stringify(rows)
  const script = (answers: (() => Response)[]) => {
    let n = 0
    globalThis.fetch = (async () => answers[Math.min(n++, answers.length - 1)]()) as typeof fetch
    return () => n
  }
  const ok = () => json(200, rows)

  let calls = script([() => gatewayPage(522), () => gatewayPage(503), ok])
  const files = await installFiles(createAdminClient(), "i-1", false)
  check("theme files: a 522 page, then a 503 page, then the rows: the rows (asked again, like a 502)", files["shopify/layout/theme.liquid"] === rows[0].content && calls() === 3, calls())

  calls = script([() => gatewayPage(522)])
  let thrown: unknown = null
  try {
    await installFiles(createAdminClient(), "i-1", false)
  } catch (e) {
    thrown = e
  }
  const message = thrown instanceof Error ? thrown.message : String(thrown)
  check("theme files: the gateway's page every time is a SiteReadError (last good copy, else One moment), asked three times", isSiteReadError(thrown) && calls() === 3, [message, calls()])
  check("  its message is short and says what happened, not the page", !message.includes("<!DOCTYPE") && /error page \(HTTP 522\)/.test(message), message)

  calls = script([() => new Response(whole.slice(0, whole.length - 12), { status: 200, headers: { "content-type": "application/json" } }), ok])
  const again = await installFiles(createAdminClient(), "i-1", false)
  check("theme files: a body cut short, then the whole one: the rows", again["shopify/layout/theme.liquid"] === rows[0].content && calls() === 2, calls())

  calls = script([() => new Response(whole.slice(0, 30), { status: 200, headers: { "content-type": "application/json" } })])
  thrown = null
  try {
    await installFiles(createAdminClient(), "i-1", false)
  } catch (e) {
    thrown = e
  }
  check("theme files: cut short every time is a SiteReadError, never a parse error or a half theme", isSiteReadError(thrown) && /cut short/.test(thrown instanceof Error ? thrown.message : "") && calls() === 3, thrown instanceof Error ? thrown.message : thrown)

  calls = script([() => gatewayPage(524)])
  thrown = null
  try {
    await siteRead("pages", (signal) => createAdminClient().from("store_theme_pages").select("page_key").eq("install_id", "i-1").abortSignal(signal))
  } catch (e) {
    thrown = e
  }
  check("a site read (pages) answered by the gateway's page throws SiteReadError", isSiteReadError(thrown), thrown instanceof Error ? thrown.message : thrown)

  calls = script([() => gatewayPage(522)])
  const write = await createAdminClient().from("store_theme_pages").update({ sections: [] }).eq("id", "p-1")
  check("a write answered by the gateway's page is never asked again", calls() === 1 && !!write.error, calls())

  let reads = 0
  globalThis.fetch = (async () => {
    reads++
    return json(200, { a: 1 })
  }) as typeof fetch
  const { data } = await createAdminClient().from("profiles").select("id").eq("id", "x").maybeSingle()
  check("an ordinary answer is read once and handed over as it was", reads === 1 && (data as { a?: number } | null)?.a === 1)
  void GATEWAY_PAGE_CODE
  void CUT_SHORT_CODE
}

/* ── EVD-3 ───────────────────────────────────────────────────────────────── */

async function publicFilesAskNoAuth() {
  console.log("\nEVD-3. A website's public files read no session, so they never wait on Supabase Auth")
  const { skipsSessionRefresh } = await import("@/lib/auth/no-session-paths")
  const signedIn = ["sb-fixture-auth-token"]
  const open = ["/robots.txt", "/sitemap.xml", "/sitemap/products-1.xml", "/w/maya/robots.txt", "/w/maya/sitemap.xml", "/site.webmanifest", "/favicon.ico", "/api/site-theme/assets/i-1/h-abc/theme.css", "/api/site-theme/cover/i-1.x.y"]
  check("robots.txt, sitemaps, the manifest, the icon, theme assets and the cover read no session, signed in or not", open.every((p) => skipsSessionRefresh(p, signedIn) && skipsSessionRefresh(p, [])))
  const kept = ["/", "/products/hat", "/app", "/app/settings", "/sell", "/w/maya", "/w/maya/preview", "/api/site-theme/site/maya", "/api/website-builder/themes/i-1/sections", "/api/website-builder/themes/i-1/agent-activity", "/api/analytics/own/token", "/robots.txt.bak", "/x/robots.txt"]
  check("  pages, /app, the builder, previews, the imported theme's own pages and the owner's analytics still do", kept.every((p) => !skipsSessionRefresh(p, signedIn)), kept.filter((p) => skipsSessionRefresh(p, signedIn)))

  /* Through the real proxy: a signed in visitor whose access token has run out (so a session read would renew it with Supabase Auth). */
  await useSites()
  const sitesFetch = globalThis.fetch
  const auth: string[] = []
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url)
    if (url.pathname.startsWith("/auth/v1/")) {
      auth.push(url.pathname)
      /* Auth having a bad moment: the session is kept (nothing written), and the call is counted. */
      return json(503, { code: 503, msg: "upstream unavailable" })
    }
    return sitesFetch(input, init)
  }) as typeof fetch
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split(".")[0]
  const past = Math.floor(Date.now() / 1000) - 3600
  const session = { access_token: "expired.access.token", refresh_token: "r-1", token_type: "bearer", expires_in: 3600, expires_at: past, user: { id: "u-1", aud: "authenticated", role: "authenticated" } }
  const cookie = `sb-${ref}-auth-token=base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`
  const { proxy } = await import("@/proxy")
  const { NextRequest } = await import("next/server")
  const ask = async (url: string) => {
    auth.length = 0
    const res = (await proxy(new NextRequest(url, { headers: { host: new URL(url).host, cookie, accept: "*/*" } }) as never)) as Response
    return { status: res.status, auth: [...auth] }
  }
  for (const url of ["https://maya.storelib.com/robots.txt", "https://maya.storelib.com/sitemap.xml", "https://maya.storelib.com/api/site-theme/assets/i-1/h-abc/theme.css", "https://storelib.com/api/site-theme/assets/i-1/edit/navigation.css", "https://storelib.com/robots.txt", "https://storelib.com/api/site-theme/cover/i-1.x.y"]) {
    const r = await ask(url)
    check(`  ${new URL(url).host}${new URL(url).pathname}: no request to Supabase Auth`, r.auth.length === 0, r)
  }
  const page = await ask("https://storelib.com/app")
  check("  /app with the same expired session still renews it with Supabase Auth (auth for the app unchanged)", page.auth.length > 0, page)
  /* The renewal /app started goes on retrying behind the answer: it keeps meeting the outage, never the network. */
}

/* ── EVD-5 ───────────────────────────────────────────────────────────────── */

async function errorPagesTraced() {
  console.log("\nEVD-5. The static error pages are in every server function's trace")
  /* The build's own script, from the checkout (a plain .mjs that tsc does not compile). */
  const { pathToFileURL } = await import("node:url")
  const { traceErrorPages } = (await import(pathToFileURL(join(process.cwd(), "scripts/trace-error-pages.mjs")).href)) as { traceErrorPages: (d: string) => { pages: string[]; traces: number; changed: number } }
  const { mkdirSync } = await import("node:fs")
  const dist = mkdtempSync(join(tmpdir(), "sites2-dist-"))
  const put = (p: string, body: string) => {
    mkdirSync(join(dist, p, ".."), { recursive: true })
    writeFileSync(join(dist, p), body)
  }
  put("server/pages-manifest.json", JSON.stringify({ "/404": "pages/404.html", "/500": "pages/500.html" }))
  put("server/pages/500.html", "<!DOCTYPE html><title>500</title>")
  put("server/pages/404.html", "<!DOCTYPE html><title>404</title>")
  put("server/app/(site)/w/[username]/page.js.nft.json", JSON.stringify({ version: 1, files: ["../../../../chunks/ssr/a.js"] }))
  put("server/app/api/site-theme/site/[username]/[[...path]]/route.js.nft.json", JSON.stringify({ version: 1, files: [] }))
  put("next-minimal-server.js.nft.json", JSON.stringify({ version: 1, files: ["../node_modules/next/dist/server/next-server.js"] }))
  const first = traceErrorPages(dist)
  const page = JSON.parse(readFileSync(join(dist, "server/app/(site)/w/[username]/page.js.nft.json"), "utf8")).files as string[]
  const minimal = JSON.parse(readFileSync(join(dist, "next-minimal-server.js.nft.json"), "utf8")).files as string[]
  check("the /w page's trace names pages/500.html and 404.html by the path Next reads them from", page.includes("../../../../pages/500.html") && page.includes("../../../../pages/404.html") && page.includes("../../../../chunks/ssr/a.js"), page)
  check("  and so does the minimal server's, and every route's", minimal.includes("server/pages/500.html") && first.changed === 3 && first.traces === 3, first)
  check("  running it again changes nothing", traceErrorPages(dist).changed === 0)
  check("the build runs it after next build (traces are written before the static pages exist)", /scripts\/build-next\.mjs && node scripts\/trace-error-pages\.mjs"/.test(read("package.json")))
}

function codeChecks() {
  console.log("\nEVD-1 d. Where the copies are kept, and what may go in")
  const compat = read("lib/website-builder/compat-site.ts")
  const releases = read("lib/website-builder/site-releases-server.ts")
  const published = read("lib/website-builder/published-site.ts")
  check("the release pointer, manifests and blobs are named to outlive a deploy", /keyedAs\("site-live-release:v1"/.test(releases) && /keyedAs\("site-release:v1"/.test(releases) && /keyedAs\("theme-blobs:v1"/.test(releases))
  check("an imported theme's pages entry too", /\(v\) => v === null, "compat-pages:v1"\)/.test(compat))
  check("the files copy is only kept from the live files (a preview reads its drafts through installFiles(…, true), never here)", /const files = await installFiles\(admin, installId, false\)\n\s+await keepSharedFiles/.test(compat) && /rows \? Promise\.resolve\(\) : \(draft \? installFiles\(admin, row\.id, true\) : readFiles\(\)\)/.test(compat))
  check("a Storelib theme site's copy carries the site's and the shop's tags, and is served only for an error", /const sharedTags = \(creatorId: string\) => \[creatorSiteTag\(creatorId\), creatorShopTag\(creatorId\)\]/.test(published) && /\} catch \(e\) \{[\s\S]*?sharedCopy<ShopLookup>/.test(published))
}

async function run() {
  if (ROLE === "fresh") {
    const realError = console.error
    console.error = () => {}
    try {
      await useSites()
      await freshServer()
    } finally {
      console.error = realError
    }
    return
  }
  const realFetch = globalThis.fetch
  const realError = console.error
  console.error = (...a: unknown[]) => {
    if (typeof a[0] === "string" && /served the|revalidating cache|could not be read|drew the files/.test(a[0])) return
    realError(...a)
  }
  try {
    await nextKeepsStaleOnError()
    await sharedCopies()
    await freshServerServes()
    codeChecks()
    await gatewayAnswers()
    await publicFilesAskNoAuth()
    await errorPagesTraced()
  } finally {
    void realFetch
    console.error = realError
  }
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
  process.exit(0)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
