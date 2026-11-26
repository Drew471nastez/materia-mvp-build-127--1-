/**
 * ===========================================================================
 *  A LIVE PAGE NEVER WAITS 20 SECONDS FOR A READ IT CAN DO WITHOUT (round AP)
 * ===========================================================================
 * The owner: navigating a live website "takes more than 10 to 15 seconds",
 * "sometimes it blocks completely on loading infinitely", and pages "land,
 * then refresh". Production logged, on live pages of an imported theme,
 * "store_offers took longer than 20s", "theme_file_blobs took longer than
 * 20s" and then "store_theme_custom_files took longer than 20s": every read
 * had only Supabase's 20 second deadline. Held here, over the fake
 * PostgREST of scripts/speed18 with one table that never answers:
 *
 *   IN TIME   lib/net/in-time.ts: a value, the fallback when late, the
 *             fallback when it failed, a throw for what cannot be left out
 *   FILES     the live files fail within LIVE_FILES_BOUND, not 20 s
 *   OFFERS    a page whose offers never come is drawn within seconds,
 *             without them, says so, and is never held: the next visitor
 *             after the database is back gets the whole page, then the hold
 *   HOLD      a page that may not be shared is not kept as "draw it again"
 *             for five minutes
 *   SOURCES   the bounded reads, where they are decided
 *
 * Run with:  pnpm test:push
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import JSZip from "jszip"
import { fakeFetch, setRtt, useFixture } from "../scripts/speed18/fake-postgrest"
import { visit } from "../scripts/speed18/context"
import { buildFixture, SITE } from "../scripts/speed18/fixture"
import * as nextCache from "../scripts/speed18/shims/next-cache"
import * as nextHeaders from "../scripts/speed18/shims/next-misc"

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
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `   (${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 400)})`}`)
  }
}
const section = (t: string) => console.log(`\n${t}`)
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

/* Tables that never answer, as Supabase did on Nov 9: the request hangs until its signal ends it. */
const hanging = new Set<string>()
function slowFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  const table = url.match(/\/rest\/v1\/([a-z_]+)/)?.[1]
  if (table && hanging.has(table)) {
    const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined)
    return new Promise((_, reject) => {
      if (signal?.aborted) reject(signal.reason)
      signal?.addEventListener("abort", () => reject(signal.reason), { once: true })
    })
  }
  return fakeFetch(input, init)
}

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fixture.supabase.co"
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-fixture-key"
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-fixture-key"
process.env.NEXT_PUBLIC_MAIN_DOMAIN = "storelib.com"
;(globalThis as { fetch: typeof fetch }).fetch = slowFetch as typeof fetch
;(globalThis as { __PUSH_TEST_NEXT_CACHE__?: unknown }).__PUSH_TEST_NEXT_CACHE__ = nextCache
;(globalThis as { __PUSH_TEST_NEXT_HEADERS__?: unknown }).__PUSH_TEST_NEXT_HEADERS__ = nextHeaders
setRtt(0)
const settle = () => Promise.allSettled(nextCache.pending.splice(0))
type Rows = Record<string, unknown>[]

async function inTimeChecks() {
  section("IN TIME: a read waited for only so long")
  const { inTime, inTimeOrThrow } = await import("@/lib/net/in-time")
  const quick = await inTime(Promise.resolve(7), 50, 0)
  check("an answer in time is the answer", quick.value === 7 && !quick.late && !quick.failed)
  const never = new Promise<number>(() => {})
  const t0 = Date.now()
  const slow = await inTime(never, 60, -1)
  check("no answer: the fallback after the time, said to be late", slow.value === -1 && slow.late && Date.now() - t0 < 500, { ...slow, ms: Date.now() - t0 })
  const bad = await inTime(Promise.reject(new Error("x")), 50, -2)
  check("a read that failed: the fallback, said to have failed, not late", bad.value === -2 && bad.failed && !bad.late)
  let threw: unknown = null
  try {
    await inTimeOrThrow(never, 40, () => new Error("currency: no answer"))
  } catch (e) {
    threw = e
  }
  check("what a page cannot be drawn without throws when late", threw instanceof Error && threw.message === "currency: no answer")
  check("  and is its answer when in time", (await inTimeOrThrow(Promise.resolve("RON"), 40, () => new Error("late"))) === "RON")
}

async function postureTheme() {
  const { convertShopifyTheme } = await import("@/lib/storelib-theme/shopify/convert")
  const dir = join(process.cwd(), "tests", "fixtures", "shopify-posture")
  const zip = new JSZip()
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      if (n.startsWith(".")) continue
      const p = join(d, n)
      if (statSync(p).isDirectory()) walk(p)
      else zip.file(relative(dir, p), readFileSync(p))
    }
  }
  walk(dir)
  const r = await convertShopifyTheme(zip)
  if (!r.ok) throw new Error((r as { error: string }).error)
  return (r as { theme: { settings: Record<string, unknown>; files: Record<string, string>; pages: { page_key: string; sections: unknown }[] } }).theme
}

async function files() {
  section("FILES: the live files fail within seconds, not Supabase's 20")
  const { installFiles, LIVE_FILES_BOUND } = await import("@/lib/website-builder/compat-site")
  const { isSiteReadError } = await import("@/lib/website-builder/site-read")
  const { createAdminClient } = await import("@/lib/supabase/admin")
  const fx = buildFixture()
  ;(fx.tables as Record<string, Rows>).store_theme_custom_files = [{ id: "f1", install_id: SITE.installId, path: "layout/theme.liquid", content: "<html><body>{{ content_for_layout }}</body></html>", draft_content: null }]
  useFixture(fx)
  hanging.add("store_theme_custom_files")
  const t0 = Date.now()
  const err = (await visit(() => installFiles(createAdminClient(), SITE.installId, false, LIVE_FILES_BOUND))).error
  const ms = Date.now() - t0
  hanging.delete("store_theme_custom_files")
  console.log(`        (a theme's files that never answer: refused after ${ms} ms)`)
  check("a read of the files that never answers is refused as the database's, within the bound", isSiteReadError(err) && ms <= LIVE_FILES_BOUND.budgetMs + 1500, { ms, err: String(err) })
  const ok = await visit(() => installFiles(createAdminClient(), SITE.installId, false, LIVE_FILES_BOUND))
  check("  and read as before when the database answers", !ok.error && Object.keys(ok.value ?? {}).length > 0, { error: String(ok.error), n: Object.keys(ok.value ?? {}).length })
}

async function offers() {
  section("OFFERS: a page whose offers never come, drawn without them, never held")
  const theme = await postureTheme()
  const f = buildFixture()
  const t = f.tables as Record<string, Rows>
  const st = t.store_theme_settings.find((r) => r.install_id === SITE.installId)!
  st.settings = { ...theme.settings }
  st.draft_settings = { ...theme.settings }
  t.store_theme_custom_files = Object.entries(theme.files).map(([path, content], i) => ({ id: `f${i}`, install_id: SITE.installId, path, content, draft_content: null }))
  t.store_theme_pages = [...t.store_theme_pages.filter((r) => r.install_id !== SITE.installId), ...theme.pages.map((p, i) => ({ id: `p${i}`, install_id: SITE.installId, page_key: p.page_key, sections: p.sections, draft_sections: null }))]
  t.custom_domains = t.custom_domains.filter((r) => r.creator_id !== SITE.creatorId)
  /* A new publish, so nothing this process kept for the site before is its copy now. */
  const install = t.store_theme_installs.find((r) => r.id === SITE.installId)!
  install.published_at = new Date(Date.now() + 60_000).toISOString()
  useFixture(f)
  nextCache.resetCache()

  const { sealSite } = await import("@/lib/storelib-theme/compat/site-seal")
  const { strangerMarker } = await import("@/lib/storelib-theme/compat/anonymous-cache")
  const route = await import("@/app/api/site-theme/site/[username]/[[...path]]/route")
  const { NextRequest } = await import("next/server")
  const { SITE_PART_MS } = await import("@/lib/website-builder/compat-site")
  const host = "maya.storelib.com"
  const page = async (path: string) => {
    const segs = [strangerMarker({ host, country: "US", locale: null, market: null })!, ...path.split("/").filter(Boolean)]
    const headers: Record<string, string> = { host, "x-forwarded-host": host, accept: "text/html", "sec-fetch-dest": "document", "x-storelib-site-country": "US" }
    const seal = await sealSite(SITE.username, host)
    if (seal) headers["x-storelib-theme-site"] = seal
    const t0 = Date.now()
    const r = await visit(async () => {
      const res = (await route.GET(new NextRequest(`https://${host}/api/site-theme/site/${SITE.username}/${segs.join("/")}`, { headers }), { params: Promise.resolve({ username: SITE.username, path: segs }) })) as Response
      return { status: res.status, held: res.headers.get("x-storelib-held"), partial: res.headers.get("x-storelib-partial"), body: await res.text() }
    })
    const ms = Date.now() - t0
    await settle()
    return { ...(r.value as { status: number; held: string | null; partial: string | null; body: string }), ms }
  }

  hanging.add("store_offers")
  const slow = await page(`/products/${SITE.productSlug}`)
  console.log(`        (a product page whose offers never answer: ${slow.ms} ms, left out: ${slow.partial})`)
  check("the page is drawn within seconds, not after Supabase's 20", slow.status === 200 && slow.ms < SITE_PART_MS + 2000, { status: slow.status, ms: slow.ms })
  check("  it says what it was drawn without", /offers/.test(slow.partial ?? ""), slow.partial)
  const again = await page(`/products/${SITE.productSlug}`)
  check("  and is never held: the next visitor, offers still away, is drawn again, not given the short page from the hold", again.held === "miss" && /offers/.test(again.partial ?? ""), { held: again.held, partial: again.partial })
  hanging.delete("store_offers")
  const back = await page(`/products/${SITE.productSlug}`)
  check("the database back: the next visitor gets the whole page", back.status === 200 && back.partial === null && back.held === "miss", { held: back.held, partial: back.partial })
  const held = await page(`/products/${SITE.productSlug}`)
  check("  and the visitor after that the held whole page, as before", held.held === "hit" && held.partial === null, { held: held.held })
}

async function hold() {
  section("HOLD: a page that may not be shared is not kept as 'draw it again'")
  const { heldStrangerPage, strangerKey } = await import("@/lib/storelib-theme/compat/stranger-hold")
  nextCache.resetCache()
  const key = strangerKey(SITE.username, ["~anon~maya.storelib.com~US~_~_", "pages", "blip"], "", true)
  let share = false
  let draws = 0
  const draw = async () => {
    draws++
    return { status: 200, headers: [] as [string, string][], body: share ? "whole" : "short", share }
  }
  const a = await heldStrangerPage(key, ["t"], draw, null)
  await settle()
  check("drawn without a part: given to this visitor, not held", a.body === "short" && !a.held && draws === 1)
  share = true
  const b = await heldStrangerPage(key, ["t"], draw, null)
  await settle()
  check("the next visitor, the part back: drawn once and held", b.body === "whole" && draws === 2, { draws })
  const c = await heldStrangerPage(key, ["t"], draw, null)
  check("  and the visitor after that from the hold, no draw", c.held && c.body === "whole" && draws === 2, { draws, held: c.held })

  /* Strangers arriving together while the database is slow: one draw between them, nothing kept. */
  const slowKey = strangerKey(SITE.username, ["~anon~maya.storelib.com~US~_~_", "pages", "slow"], "", true)
  let slowDraws = 0
  const slowDraw = async () => {
    slowDraws++
    await new Promise((r) => setTimeout(r, 50))
    return { status: 200, headers: [] as [string, string][], body: "short", share: false, brief: true }
  }
  const together = await Promise.all([1, 2, 3, 4].map(() => heldStrangerPage(slowKey, ["t"], slowDraw, null)))
  await settle()
  check("strangers arriving together on a page drawn without a part share its one draw", slowDraws === 1 && together.every((p) => p.body === "short" && !p.held), { slowDraws })
  await heldStrangerPage(slowKey, ["t"], slowDraw, null)
  check("  and it is never kept: the next visitor draws again", slowDraws === 2, { slowDraws })
}

async function packed() {
  section("PACKED: a release's entries fit the data cache")
  const { packHeld, unpackHeld } = await import("@/lib/website-builder/site-releases-server")
  const theme = await postureTheme()
  /* A theme's text about the size production could not keep (2.6 MB as the cache writes it): the fixture's files many times over, each copy numbered. */
  const files: Record<string, string> = {}
  let i = 0
  while (JSON.stringify(files).length < 2_700_000) {
    for (const [path, text] of Object.entries(theme.files)) files[`${i}/${path}`] = `${text}\n/* copy ${i} */`
    i++
  }
  const raw = JSON.stringify(files).length
  const held = packHeld(files)
  const kept = JSON.stringify(held).length
  console.log(`        (theme text: ${raw} characters as JSON, ${kept} packed)`)
  check("over 2 MB as it was written, well under it packed", raw > 2_000_000 && kept < 1_000_000, { raw, kept })
  check("  and read back exactly", JSON.stringify(unpackHeld<Record<string, string>>(held)) === JSON.stringify(files))
  check("nothing packed reads as nothing", unpackHeld(null) === null)
}

function sources() {
  section("SOURCES: the bounded reads, where they are decided")
  const compat = code("lib/website-builder/compat-site.ts")
  check("the live files are read with a bound", /* Changed on purpose (round 29): unbounded only for the read again after a Publish. */ /installFiles\(admin, installId, false, patient \? undefined : LIVE_FILES_BOUND\)/.test(compat))
  check("a release's files are waited for only so long, then the rows", /* Changed on purpose (round 29). */ /inTime\(releaseFiles\(release\.manifest\), patient \? PATIENT_MS : RELEASE_FILES_MS, null\)/.test(compat))
  check("the shop's lists, menus, offers, sold counts and size charts each have a time", ["products", "catalog", "collections", "menus", "sold", "size charts", "store"].every((n) => new RegExp(`part\\(\\s*"${n}"`).test(compat)))
  check("the currency is never guessed: late is an error", /* Changed on purpose (round 29). */ /const currencyMs = patient \? PATIENT_MS : SITE_SHOP_MS/.test(compat) && /inTimeOrThrow\(cachedStoreCurrency\(creator\.creatorId\), currencyMs/.test(compat))
  check("a short site is never kept as the site", /found\.site\.partial\?\.length/.test(compat) && /* Changed on purpose (round 29): kept with its epoch. */ compat.indexOf("found.site.partial?.length") < compat.indexOf("lastGoodSite.remember(key, { site: found.site"))
  check("a product page's own reads are bounded and say so", /PARTIAL_PRODUCTS\.add\(product\)/.test(compat))
  const route = code("app/api/site-theme/site/[username]/[[...path]]/route.ts")
  check("the page's tags and release marker are waited for only TAGS_MS", /late\("release", liveSiteFor\(shopOf\)/.test(route) && /late\("tracking"/.test(route) && /late\("analytics product"/.test(route))
  check("a page drawn without something is never shared, held or kept at the CDN", /if \(leftOut\.size\) \{[\s\S]*?headers\.delete\("Vercel-CDN-Cache-Control"\)[\s\S]*?headers\.delete\(SHAREABLE_HEADER\)/.test(route))
  const hold = code("lib/storelib-theme/compat/stranger-hold.ts")
  check("the hold does not keep 'draw it again'", /if \(!page\.share\) throw NOT_SHARED/.test(hold) && !/return \{ share: false \}/.test(hold))
}

async function main() {
  await inTimeChecks()
  await files()
  await offers()
  await hold()
  await packed()
  sources()
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
  process.exit(0)
}
void main()
