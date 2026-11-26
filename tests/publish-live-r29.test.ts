/**
 * ===========================================================================
 *  A PUBLISHED WEBSITE IS THE ONE VISITORS GET, EVEN WHILE THE DATABASE IS SLOW
 * ===========================================================================
 * The owner (round 29): "Even though I publish the website, when I go to the
 * live website, it still shows the old website. It doesn't show the new one
 * that I published, for example a Notion sales page."
 *
 * Production, andrewrullz.storelib.com, 2026-11-26: the Notion sales page
 * install (718367b2) was published at 07:17:46 UTC. From 07:18:10 on, the
 * site's pages logged "[compat-site] served the last good copy" with
 * "theme files: no answer in 2499ms" and "published install: no answer in
 * 2999ms", and at 07:18:49 the page a visitor had was still asking for the
 * OLD install's files (/api/site-theme/assets/7003aaae.../section-links.js).
 *
 * The cause: the copy of each site a server keeps in memory for when the
 * database does not answer (lib/website-builder/last-good.ts) knew nothing
 * of Publish. A new template's theme is a thousand rows the first read after
 * a Publish must fetch; on a slow database that read missed its bound, and
 * the server answered with the site it had before the Publish. That answer
 * was then kept as THE page for every stranger (the held page, the CDN copy,
 * the server's memory under the new stamp, the stored copy), so the old
 * site stayed up long after the database was back.
 *
 * Held here through the real code: the publish route's POST (signed in, over
 * the fake PostgREST of scripts/speed18 and its publish function), then the
 * imported theme's route as a stranger opens it, with Next's cache as Next 16
 * keeps it:
 *
 *   SLOW        the read after the Publish misses its bound: the new website,
 *               read again with time to answer, never the copy from before
 *   DOWN        the database does not answer at all: the copy from before is
 *               this visitor's only, never held, shared, kept at the CDN or
 *               stored, and the visitor after it gets the new website
 *   SAME        a failure with no Publish since: the last good copy, served
 *               and shared as before (the resilience is kept)
 *   NATIVE      a Storelib theme's site: the in-memory copy from before a
 *               Publish is never served after it
 *   COLD        a server that never drew the site: the files the Publish
 *               itself read and kept, never a missed read's "One moment"
 *   SNAPSHOT    a page drawn without something is never stored as the page
 *
 * Run with:  pnpm test:push
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import JSZip from "jszip"
import { fakeFetch, setRtt, signedInCookies, useFixture, type Fixture } from "../scripts/speed18/fake-postgrest"
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
const code = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fixture.supabase.co"
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-fixture-key"
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-fixture-key"
process.env.NEXT_PUBLIC_MAIN_DOMAIN = "storelib.com"

/*
  THE DATABASE, SLOW FOR ONE TABLE: the next `n` reads of a theme's files
  (the select of their text, not the one-row column check) get no answer,
  as a read past its bound does. Everything else answers.
*/
let filesDown = 0
let filesAsked = 0
const filesRead = (url: string) => /\/rest\/v1\/store_theme_custom_files\?/.test(url) && /select=path/.test(decodeURIComponent(url))
const slowFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  if (filesRead(url)) {
    filesAsked++
    if (filesDown > 0) {
      filesDown--
      return new Response(JSON.stringify({ code: "57014", message: "canceling statement due to statement timeout", details: null, hint: null }), { status: 500, headers: { "content-type": "application/json" } })
    }
  }
  return fakeFetch(input, init)
}) as typeof fetch
;(globalThis as { fetch: typeof fetch }).fetch = slowFetch
;(globalThis as { __PUSH_TEST_NEXT_CACHE__?: unknown }).__PUSH_TEST_NEXT_CACHE__ = nextCache
;(globalThis as { __PUSH_TEST_NEXT_HEADERS__?: unknown }).__PUSH_TEST_NEXT_HEADERS__ = nextHeaders
setRtt(0)
const settle = () => Promise.allSettled(nextCache.pending.splice(0))
type Rows = Record<string, unknown>[]

const NOTION = "d1111111-1111-4111-8111-1111111129b2"
const OLD_MARK = "OLD-WEBSITE-BEFORE-PUBLISH"
const NEW_MARK = "NOTION-SALES-PAGE-PUBLISHED"

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

const isLayout = (path: string) => /(^|\/)layout\/theme(\.liquid|\.storelib)?$/.test(path)
const marked = (files: Record<string, string>, mark: string) => Object.fromEntries(Object.entries(files).map(([p, c]) => [p, isLayout(p) ? c.replace(/<\/body>/i, `<span hidden>${mark}</span></body>`) : c]))

/**
 * Maya's live website is an imported theme (install A). She has just added
 * the Notion sales page from the template library (install B, not live):
 * its own files, its pages, its settings, and every one of them waiting as a
 * draft is, in the live columns of a site nobody can see yet.
 */
async function twoWebsites(): Promise<{ fx: Fixture; t: Record<string, Rows> }> {
  const theme = await postureTheme()
  const fx = buildFixture()
  const t = fx.tables as Record<string, Rows>
  const install = t.store_theme_installs.find((r) => r.id === SITE.installId)!
  install.published_at = "2026-11-26T07:00:00.000Z"
  const st = t.store_theme_settings.find((r) => r.install_id === SITE.installId)!
  st.settings = { ...theme.settings }
  st.draft_settings = null
  const fileRows = (installId: string, files: Record<string, string>, prefix: string) => Object.entries(files).map(([path, content], i) => ({ id: `${prefix}${i}`, install_id: installId, path, content, draft_content: null }))
  t.store_theme_custom_files = [...fileRows(SITE.installId, marked(theme.files, OLD_MARK), "fa"), ...fileRows(NOTION, marked(theme.files, NEW_MARK), "fb")]
  const pageRows = (installId: string, prefix: string) => theme.pages.map((p, i) => ({ id: `${prefix}${i}`, install_id: installId, page_key: p.page_key, sections: p.sections, draft_sections: null }))
  t.store_theme_pages = [...t.store_theme_pages.filter((r) => r.install_id !== SITE.installId), ...pageRows(SITE.installId, "pa"), ...pageRows(NOTION, "pb")]
  t.store_theme_installs.push({ ...install, id: NOTION, name: "Notion sales page", status: "draft", sort_order: 1, published_at: null, preview_token: "token-notion" })
  t.store_theme_settings.push({ ...st, id: "91000000-0000-4000-8000-0000000029b2", install_id: NOTION, settings: { ...theme.settings }, draft_settings: { ...theme.settings } })
  t.custom_domains = t.custom_domains.filter((r) => r.creator_id !== SITE.creatorId)
  t.theme_publish_history ??= []
  t.theme_publish_jobs ??= []
  /*
    publish_theme_install (SQL part 130), as the database runs it: the
    settings and page drafts promoted, the switch of which website is live
    in the same step, and the moment written.
  */
  fx.rpc = {
    ...(fx.rpc ?? {}),
    publish_theme_install: (args) => {
      const a = args as { p_install: string; p_creator: string; p_settings: unknown; p_pages: { id: string; sections: unknown }[] }
      const s = t.store_theme_settings.find((r) => r.install_id === a.p_install)
      if (s && a.p_settings) {
        s.settings = a.p_settings
        s.draft_settings = null
      }
      for (const p of a.p_pages ?? []) {
        const row = t.store_theme_pages.find((r) => r.id === p.id)
        if (row) {
          row.sections = p.sections
          row.draft_sections = null
        }
      }
      for (const r of t.store_theme_installs) {
        if (r.creator_id !== a.p_creator) continue
        if (r.id === a.p_install) {
          r.status = "published"
          r.published_at = new Date().toISOString()
        } else if (r.status === "published") r.status = "unpublished"
      }
      return { files: [] }
    },
  }
  useFixture(fx)
  return { fx, t }
}

let current: { fx: Fixture; t: Record<string, Rows> } | null = null
async function twoWebsitesState() {
  current = await twoWebsites()
  return current
}

/** A stranger opening a page of the website, as the proxy sends one to the imported theme's route. */
async function strangerPage(path: string, host = "maya.storelib.com") {
  const { sealSite } = await import("@/lib/storelib-theme/compat/site-seal")
  const { strangerMarker } = await import("@/lib/storelib-theme/compat/anonymous-cache")
  const route = await import("@/app/api/site-theme/site/[username]/[[...path]]/route")
  const { NextRequest } = await import("next/server")
  const segs = [strangerMarker({ host, country: "US", locale: null, market: null })!, ...path.split("/").filter(Boolean)]
  const headers: Record<string, string> = { host, "x-forwarded-host": host, accept: "text/html", "sec-fetch-dest": "document", "x-storelib-site-country": "US" }
  const seal = await sealSite(SITE.username, host)
  if (seal) headers["x-storelib-theme-site"] = seal
  const r = await visit(async () => {
    const res = (await route.GET(new NextRequest(`https://${host}/api/site-theme/site/${SITE.username}/${segs.join("/")}`, { headers }), { params: Promise.resolve({ username: SITE.username, path: segs }) })) as Response
    return { status: res.status, held: res.headers.get("x-storelib-held"), partial: res.headers.get("x-storelib-partial"), cdn: res.headers.get("vercel-cdn-cache-control"), body: await res.text() }
  })
  await settle()
  const v = r.value as { status: number; held: string | null; partial: string | null; cdn: string | null; body: string }
  return { ...v, error: r.error, old: v.body.includes(OLD_MARK), fresh: v.body.includes(NEW_MARK) }
}

/** Publish, pressed in the editor: the real route, signed in as the owner. `afterToo`: the work it does after its answer runs too, as Next runs it. */
async function pressPublish(installId: string, afterToo = false) {
  const route = await import("@/app/api/website-builder/themes/[installId]/publish/route")
  const { current: visiting } = await import("../scripts/speed18/context")
  const g = globalThis as { __PUSH_TEST_AFTER__?: (task: () => unknown) => void }
  if (afterToo) g.__PUSH_TEST_AFTER__ = (task) => void visiting()?.after.push(task as () => Promise<void>)
  const r = await visit(
    async () => {
      const res = await route.POST(new Request(`https://storelib.com/api/website-builder/themes/${installId}/publish`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "publish" }) }), { params: Promise.resolve({ installId }) })
      return { status: res.status, body: await res.json().catch(() => null) }
    },
    { cookies: signedInCookies(SITE.userId) },
  )
  delete g.__PUSH_TEST_AFTER__
  await settle()
  return r.value ?? { status: 0, body: String(r.error) }
}

async function coldServer() {
  section("COLD: a server that never drew the site, the database slow right after the Publish")
  nextCache.resetCache()
  const { t } = await twoWebsites()
  const published = await pressPublish(NOTION, true)
  check("Publish answers published", published.status === 200, published)
  const live = t.store_theme_installs.find((r) => r.id === NOTION)!
  const primed = nextCache.cacheEntries().filter((e) => e.key.includes("compat-files-primed:v1") && e.key.includes(`${NOTION}:${String(live.published_at).replace(/[^0-9A-Za-z]/g, "")}`))
  check("the Publish read the new website's files once and kept them, keyed by this very publish", primed.length > 0 && primed.every((e) => e.tags.length === 0), primed.map((e) => e.key.slice(0, 120)))
  filesDown = 2
  const first = await strangerPage("/")
  filesDown = 0
  check("the first visitor on a server whose bounded read missed gets the new website from those files", first.status === 200 && first.fresh && !first.old, { status: first.status, old: first.old, fresh: first.fresh, error: String(first.error ?? "") })
  const { primeLiveFiles } = await import("@/lib/website-builder/compat-site")
  const { createAdminClient } = await import("@/lib/supabase/admin")
  check("a website that is not live is never primed", (await primeLiveFiles(SITE.installId, SITE.creatorId, createAdminClient() as never)) === false)
}

async function compatAfterPublish() {
  section("SLOW: the read right after a Publish misses its bound, and the new website is what the visitor gets")
  nextCache.resetCache()
  const { t } = await twoWebsites()
  const home = await strangerPage("/")
  check("before: the website that is live (and this server now keeps it in memory)", home.status === 200 && home.old && !home.fresh, { status: home.status, error: String(home.error ?? ""), body: home.body.slice(0, 200) })
  const about = await strangerPage("/collections/all")
  check("  and a second page of it", about.status === 200 && about.old)

  const published = await pressPublish(NOTION)
  check("Publish on the Notion sales page answers published", published.status === 200 && (published.body as { status?: string } | null)?.status === "published", published)
  check("  and the database says it is the live one now", t.store_theme_installs.find((r) => r.id === NOTION)?.status === "published" && t.store_theme_installs.find((r) => r.id === SITE.installId)?.status !== "published")

  /* The database is slow: the first read of the new website's files misses its bound (both of its tries). */
  filesDown = 2
  filesAsked = 0
  const after = await strangerPage("/")
  check("the very next visitor gets the Notion sales page, not the website from before", after.status === 200 && after.fresh && !after.old, { status: after.status, old: after.old, fresh: after.fresh, partial: after.partial, asked: filesAsked })
  check("  read again with time to answer after the bounded read missed", filesAsked >= 3, filesAsked)
  const again = await strangerPage("/")
  check("  and the visitor after that from the hold, still the new one", again.fresh && !again.old && again.held === "hit", { held: again.held })
  const other = await strangerPage("/collections/all")
  check("  a page held before the Publish is the new website too", other.fresh && !other.old)
  filesDown = 0
}

async function compatDown() {
  section("DOWN: the database does not answer at all after a Publish")
  nextCache.resetCache()
  await twoWebsites()
  /* A fresh module state is not available, so the copy kept in memory is the one from the section above, or this one's own first visit. */
  const before = await strangerPage("/pages/am")
  check("before: the live website", before.status === 200)
  const published = await pressPublish(NOTION)
  check("Publish answers published", published.status === 200, published)
  filesDown = 1000
  const down = await strangerPage("/pages/am")
  check("a page is still answered (nothing breaks for the visitor)", down.status === 200 || down.status === 503, down.status)
  if (down.status === 200 && down.old) {
    check("  the copy from before the Publish is this visitor's only: said, never shareable", !!down.partial && /superseded/.test(down.partial), down.partial)
    check("  never kept at the CDN", down.cdn === null, down.cdn)
    check("  never held for the next stranger", down.held !== "hit")
  } else {
    check("  (not the copy from before the Publish)", !down.old)
  }
  filesDown = 0
  const back = await strangerPage("/pages/am")
  check("the database back: the next visitor gets the new website, nothing from before held in its place", back.status === 200 && back.fresh && !back.old, { status: back.status, old: back.old, held: back.held, partial: back.partial })
  const next = await strangerPage("/pages/am")
  check("  and it is the one held now", next.fresh && next.held === "hit", { held: next.held })
}

async function sameEpoch() {
  section("SAME: no Publish since, the database away: the last good copy, as before")
  nextCache.resetCache()
  const { fx } = await twoWebsitesState()
  const first = await strangerPage("/collections/maya-best")
  check("the website, drawn", first.status === 200 && first.old)
  /* What the site's pages were held under is gone (evicted), no Publish since, and the database does not answer: only this server's memory has the site. */
  const dropped = nextCache.forgetCacheWhere((k) => !k.includes("site-epoch") && !k.includes("site-name"))
  fx.fail = ["store_theme_installs"]
  const down = await strangerPage("/collections/maya-best")
  fx.fail = []
  check("(the held entries were dropped)", dropped > 0)
  check("served from this server's last good copy, the same website", down.status === 200 && down.old, { status: down.status, partial: down.partial, error: String(down.error ?? "") })
  check("  whole and shareable as before, not marked as superseded", !/superseded/.test(down.partial ?? ""), down.partial)
}

async function nativeAfterPublish() {
  section("NATIVE: a Storelib theme's site never serves the copy from before a Publish")
  const { publishedShopByName, revalidatePublishedSite } = await import("@/lib/website-builder/published-site")
  nextCache.resetCache()
  const fx = buildFixture()
  const t = fx.tables as Record<string, Rows>
  const install = t.store_theme_installs.find((r) => r.id === SITE.installId)!
  const settings = t.store_theme_settings.find((r) => r.install_id === SITE.installId)!
  const B = "d1111111-1111-4111-8111-1111111139b3"
  t.store_theme_installs.push({ ...install, id: B, status: "draft", sort_order: 1 })
  t.store_theme_settings.push({ ...settings, id: "91000000-0000-4000-8000-0000000039b3", install_id: B, settings: { ...(settings.settings as object), brand_name: "NOTION-NATIVE" } })
  for (const p of t.store_theme_pages.filter((r) => r.install_id === SITE.installId)) t.store_theme_pages.push({ ...p, id: `${String(p.id).slice(0, -2)}b3`, install_id: B })
  useFixture(fx)
  const brand = (r: Awaited<ReturnType<typeof publishedShopByName>> | undefined) => (r?.kind === "site" ? String(r.site.themeSettings.brand_name ?? "") : r?.kind ?? "error")
  const before = await visit(() => publishedShopByName(SITE.username))
  await settle()
  check("before: the live website", brand(before.value) === `${SITE.username} studio`, brand(before.value))

  /* Without a Publish: a product saved (the shop's tag), then the database away for the shop's read: the copy kept serves, as before. */
  nextCache.revalidateTag(`shop-products:${SITE.creatorId}`, { expire: 0 })
  fx.fail = ["products"]
  const same = await visit(() => publishedShopByName(SITE.username))
  fx.fail = []
  check("no Publish since: the last good copy, as before", brand(same.value) === `${SITE.username} studio`, { got: brand(same.value), error: String(same.error ?? "") })

  for (const r of t.store_theme_installs) if (r.creator_id === SITE.creatorId) r.status = r.id === B ? "published" : "unpublished"
  await visit(() => revalidatePublishedSite(SITE.creatorId))
  await settle()
  fx.fail = ["store_theme_installs"]
  const down = await visit(() => publishedShopByName(SITE.username))
  fx.fail = []
  check("after a Publish, the database away: never the website from before", brand(down.value) !== `${SITE.username} studio`, { got: brand(down.value), error: String(down.error ?? "") })
  const back = await visit(() => publishedShopByName(SITE.username))
  await settle()
  check("the database back: the new website", brand(back.value) === "NOTION-NATIVE", brand(back.value))
}

async function snapshots() {
  section("SNAPSHOT: a page drawn without something, or from before a Publish, is never stored as the page")
  const { capturable } = await import("@/lib/edge/public-snapshot")
  const page = (h: Record<string, string>) => ({ status: 200, headers: new Headers({ "content-type": "text/html; charset=utf-8", ...h }) })
  check("a whole page is stored", capturable(page({}), false))
  check("a page said to be partial is not", !capturable(page({ "x-storelib-partial": "superseded" }), false))
  check("  nor one drawn without its menus", !capturable(page({ "x-storelib-partial": "menus" }), false))
}

async function wiring() {
  section("The pieces, where they are")
  const compat = code("lib/website-builder/compat-site.ts")
  check("an imported theme's last good copy carries the publish it was read under", /lastGoodSite\.remember\(key, \{ site: found\.site, epoch/.test(compat))
  check("  and is served whole only under that same publish", /sameEpoch\(held\.epoch, now\)/.test(compat) && /sameEpoch\(whole\.epoch/.test(compat))
  const native = code("lib/website-builder/published-site.ts")
  check("a Storelib theme's too", /lastGood\.remember\(lower, \{ found, epoch/.test(native))
  const epoch = code("lib/website-builder/site-epoch.ts")
  check("the publish epoch is held under the site's tag alone, which Publish expires", /tags: \[siteTag\]/.test(epoch) && /revalidate: false/.test(epoch))
}

async function main() {
  /* First: this process has drawn nothing yet, as a server that never served the site. */
  await coldServer()
  await compatAfterPublish()
  await compatDown()
  await sameEpoch()
  await nativeAfterPublish()
  await snapshots()
  await wiring()
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}

void main()
