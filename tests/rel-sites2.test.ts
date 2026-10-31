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
function failingDatabase() {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url)
    if (url.pathname.startsWith("/rest/v1/")) restCalls++
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

function runFresh(cache: string, deploy: string): { maya: { status: number; body: string }; leo: string; leoIsr: string; restCalls: number } {
  const out = execFileSync(process.execPath, [...process.execArgv, process.argv[1]], {
    env: { ...process.env, SITES2_ROLE: "fresh", SITES2_CACHE: cache, SITES2_DEPLOY: deploy },
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

  const { creatorSiteTag } = await import("@/lib/website-builder/published-site")
  const { SITE, OTHER } = await import("../scripts/speed18/fixture")
  const purged = join(dir, "purged.json")
  dumpShared(purged, { agoMs: 2 * 3600_000, expireTags: [creatorSiteTag(SITE.creatorId), creatorSiteTag(OTHER.creatorId)] })
  const after = runFresh(purged, "2")
  check("after a Publish or a take down (the site's tag expired) nothing old is served: Maya gets the 503 that tries again", after.maya.status === 503 && after.maya.body.includes("One moment"), after.maya.status)
  check("  and Leo's site read throws (the page's error, retried), never the old copy", after.leo.startsWith("threw:"), after.leo)
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
  } finally {
    globalThis.fetch = realFetch
    console.error = realError
  }
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
