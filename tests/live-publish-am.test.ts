/**
 * ===========================================================================
 *  A LIVE WEBSITE STAYS FAST AFTER A PUBLISH, AND NEVER SHOWS WHAT CAME BEFORE
 * ===========================================================================
 * Round AM. The owner: published live websites sometimes take too long to
 * load, especially right after a new publish. Held here, over the fake
 * PostgREST of scripts/speed18 and Next's cache as Next 16 keeps it:
 *
 *   STAMP     one small held word per site, expired by every tag its pages
 *             are held under, and what a server keeps in memory under it
 *             (lib/website-builder/site-stamp.ts)
 *   HOLD      a held stranger's page handed out from this server's memory
 *             while the stamp is the one it was kept with, and drawn again
 *             at once after a Publish (lib/storelib-theme/compat/stranger-hold.ts)
 *   SITE      an imported theme's whole site through its route: the second
 *             visitor and a page nobody opened skip the shared cache, and
 *             the visitor after a Publish gets the new theme from every layer
 *   MARKER    the page's release marker is the live rows' count, the same
 *             for the rows and for the release written from them, so a page
 *             drawn in the seconds before the release is never reloaded
 *   POINTER   once the release is pointed at, only the pointer is let go,
 *             so servers draw from the release's shared files rather than
 *             reading every theme file from the database for an hour
 *   WARM      a Publish draws its pages as a browser opens them, for the
 *             publisher's country first, right after the caches are cleared
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

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fixture.supabase.co"
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-fixture-key"
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-fixture-key"
process.env.NEXT_PUBLIC_MAIN_DOMAIN = "storelib.com"
;(globalThis as { fetch: typeof fetch }).fetch = fakeFetch as typeof fetch
;(globalThis as { __PUSH_TEST_NEXT_CACHE__?: unknown }).__PUSH_TEST_NEXT_CACHE__ = nextCache
;(globalThis as { __PUSH_TEST_NEXT_HEADERS__?: unknown }).__PUSH_TEST_NEXT_HEADERS__ = nextHeaders
setRtt(0)
const settle = () => Promise.allSettled(nextCache.pending.splice(0))
type Rows = Record<string, unknown>[]

async function memo() {
  section("STAMP: what a server keeps in memory, only while the stamp is the same")
  const { StampedMemo } = await import("@/lib/website-builder/site-stamp")
  let now = 1_000
  const m = new StampedMemo<string>(2, 60_000, () => now)
  m.set("a", "s1", "A1")
  check("the same stamp: the value", m.get("a", "s1") === "A1")
  check("another stamp: nothing, and the value let go", m.get("a", "s2") === undefined && m.get("a", "s1") === undefined)
  m.set("b", null, "B")
  check("no stamp: nothing is kept", m.get("b", null) === undefined && m.size === 0)
  m.set("c", "s1", "C")
  now += 60_001
  check("older than its most: asked again", m.get("c", "s1") === undefined)
  m.set("x", "s", "1")
  m.set("y", "s", "2")
  m.get("x", "s")
  m.set("z", "s", "3")
  check("the most recently used are kept", m.get("x", "s") === "1" && m.get("y", "s") === undefined && m.get("z", "s") === "3")

  const { siteStamp, siteStampTags } = await import("@/lib/website-builder/site-stamp")
  const { revalidatePublishedSite, creatorShopTag, creatorSiteTag } = await import("@/lib/website-builder/published-site")
  const { siteBlogTag } = await import("@/lib/site-blog/cache")
  nextCache.resetCache()
  useFixture(buildFixture())
  check("the stamp is under the site's, the shop's and the blog's tags", siteStampTags(SITE.creatorId).join() === [creatorSiteTag(SITE.creatorId), creatorShopTag(SITE.creatorId), siteBlogTag(SITE.creatorId)].join())
  const s1 = (await visit(() => siteStamp(SITE.creatorId))).value
  const s1b = (await visit(() => siteStamp(SITE.creatorId))).value
  check("read twice, the same word, and no database read for it", !!s1 && s1 === s1b)
  await visit(() => revalidatePublishedSite(SITE.creatorId))
  await settle()
  const s2 = (await visit(() => siteStamp(SITE.creatorId))).value
  check("after a Publish: a new word on every server (the tag is expired, not marked stale)", !!s2 && s2 !== s1)
  nextCache.revalidateTag(creatorShopTag(SITE.creatorId), { expire: 0 })
  const s3 = (await visit(() => siteStamp(SITE.creatorId))).value
  check("after a product saved (the shop's tag): a new word", !!s3 && s3 !== s2)
  nextCache.revalidateTag(siteBlogTag(SITE.creatorId), { expire: 0 })
  const s4 = (await visit(() => siteStamp(SITE.creatorId))).value
  check("after a post published (the blog's tag): a new word", !!s4 && s4 !== s3)
}

async function hold() {
  section("HOLD: a stranger's page from this server's memory, drawn again by a Publish")
  const { heldStrangerPage, strangerKey } = await import("@/lib/storelib-theme/compat/stranger-hold")
  const { siteStamp, siteStampTags } = await import("@/lib/website-builder/site-stamp")
  const { revalidatePublishedSite } = await import("@/lib/website-builder/published-site")
  nextCache.resetCache()
  useFixture(buildFixture())
  let theme = "OLD-THEME"
  let draws = 0
  const draw = async () => {
    draws++
    return { status: 200, headers: [["content-type", "text/html"]] as [string, string][], body: `<html><body>${theme}</body></html>`, share: true }
  }
  const key = strangerKey(SITE.username, ["~anon~maya.storelib.com~US~_~_", "pages", "am"], "", true)
  const tags = siteStampTags(SITE.creatorId)
  const stamp1 = await siteStamp(SITE.creatorId)
  await heldStrangerPage(key, tags, draw, stamp1)
  /* The shared cache emptied: only this server's memory can answer now. */
  nextCache.resetCache()
  const fromMemory = await heldStrangerPage(key, tags, draw, stamp1)
  check("the same stamp: handed out from memory, no draw and no shared cache", fromMemory.held && draws === 1 && fromMemory.body.includes("OLD-THEME"), { held: fromMemory.held, draws })
  const noStamp = await heldStrangerPage(key, tags, draw, null)
  check("without a stamp the memory is never used", draws === 2 && !noStamp.held)

  theme = "NEW-THEME"
  await revalidatePublishedSite(SITE.creatorId)
  await settle()
  const stamp2 = await siteStamp(SITE.creatorId)
  const after = await heldStrangerPage(key, tags, draw, stamp2)
  check("after the real Publish purge: the new stamp, the new theme for the very next stranger", stamp2 !== stamp1 && after.body.includes("NEW-THEME") && !after.held, { body: after.body, held: after.held })
  const next = await heldStrangerPage(key, tags, draw, stamp2)
  check("  and the one after it from memory", next.held && next.body.includes("NEW-THEME"))
  const old = await heldStrangerPage(key, tags, draw, stamp1)
  check("a request still holding the old stamp is not given the old page from memory", !old.body.includes("OLD-THEME"))

  /* A page that may not be shared is never kept. */
  const privateKey = strangerKey(SITE.username, ["~anon~maya.storelib.com~US~_~_", "pages", "private"], "", true)
  let privateDraws = 0
  const privateDraw = async () => {
    privateDraws++
    return { status: 200, headers: [] as [string, string][], body: "mine", share: false }
  }
  await heldStrangerPage(privateKey, tags, privateDraw, stamp2)
  await heldStrangerPage(privateKey, tags, privateDraw, stamp2)
  check("a page that may not be shared is drawn for each visitor, never from memory", privateDraws >= 2)
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

async function site() {
  section("SITE: an imported theme's route, from memory until a Publish, the new theme at once after it")
  const theme = await postureTheme()
  const f = buildFixture()
  const t = f.tables as Record<string, Rows>
  const st = t.store_theme_settings.find((r) => r.install_id === SITE.installId)!
  st.settings = { ...theme.settings }
  st.draft_settings = { ...theme.settings }
  t.store_theme_custom_files = Object.entries(theme.files).map(([path, content], i) => ({ id: `f${i}`, install_id: SITE.installId, path, content, draft_content: null }))
  t.store_theme_pages = [...t.store_theme_pages.filter((r) => r.install_id !== SITE.installId), ...theme.pages.map((p, i) => ({ id: `p${i}`, install_id: SITE.installId, page_key: p.page_key, sections: p.sections, draft_sections: null }))]
  t.custom_domains = t.custom_domains.filter((r) => r.creator_id !== SITE.creatorId)
  useFixture(f)
  nextCache.resetCache()

  const { sealSite } = await import("@/lib/storelib-theme/compat/site-seal")
  const { strangerMarker } = await import("@/lib/storelib-theme/compat/anonymous-cache")
  const route = await import("@/app/api/site-theme/site/[username]/[[...path]]/route")
  const { NextRequest } = await import("next/server")
  const { revalidatePublishedSite } = await import("@/lib/website-builder/published-site")
  const host = "maya.storelib.com"
  const page = async (path: string) => {
    const segs = [strangerMarker({ host, country: "US", locale: null, market: null })!, ...path.split("/").filter(Boolean)]
    const headers: Record<string, string> = { host, "x-forwarded-host": host, accept: "text/html", "sec-fetch-dest": "document", "x-storelib-site-country": "US" }
    const seal = await sealSite(SITE.username, host)
    if (seal) headers["x-storelib-theme-site"] = seal
    const r = await visit(async () => {
      const res = (await route.GET(new NextRequest(`https://${host}/api/site-theme/site/${SITE.username}/${segs.join("/")}`, { headers }), { params: Promise.resolve({ username: SITE.username, path: segs }) })) as Response
      return { status: res.status, held: res.headers.get("x-storelib-held"), timing: res.headers.get("server-timing") ?? "", body: await res.text() }
    })
    await settle()
    return { ...(r.value as { status: number; held: string | null; timing: string; body: string }), trips: r.trips.filter((x) => !x.background).length }
  }
  const first = await page("/")
  check("the first visitor gets the page", first.status === 200 && first.held === "miss" && !first.body.includes("PUBLISHED-AGAIN"), { status: first.status, held: first.held })
  const second = await page("/")
  check("the second from the hold, with no database read", second.held === "hit" && second.trips === 0)
  /* A page nobody opened yet: the site is not assembled again from the shared cache (about twenty answers), only the stamp and the name are asked. */
  const before = nextCache.cacheStats.hits + nextCache.cacheStats.misses + nextCache.cacheStats.stale
  const other = await page("/collections/maya-best")
  const asks = nextCache.cacheStats.hits + nextCache.cacheStats.misses + nextCache.cacheStats.stale - before
  console.log(`        (answers asked of the shared cache for that page: ${asks})`)
  check("a page nobody opened on a warm server: the site from memory, no database read, a handful of shared cache answers", other.status === 200 && other.trips === 0 && asks <= 10, { trips: other.trips, asks, timing: other.timing })

  /* Publish: the live rows change, published_at moves on, the caches are told. */
  const install = t.store_theme_installs.find((r) => r.id === SITE.installId)!
  install.published_at = new Date(Date.now() + 5_000).toISOString()
  const files = t.store_theme_custom_files as { path: string; content: string }[]
  const layout = files.find((r) => /(^|\/)layout\/theme(\.liquid|\.storelib)?$/.test(r.path))
  check("the fixture has the theme's layout", !!layout, files.slice(0, 8).map((r) => r.path))
  if (layout) layout.content = layout.content.replace(/<\/body>/i, "<span hidden>PUBLISHED-AGAIN</span></body>")
  await visit(() => revalidatePublishedSite(SITE.creatorId))
  await settle()
  const afterHome = await page("/")
  check("after Publish: the very next visitor gets the new theme", afterHome.status === 200 && afterHome.body.includes("PUBLISHED-AGAIN") && afterHome.held === "miss", { held: afterHome.held })
  const afterOther = await page("/collections/maya-best")
  check("  and a page held before the Publish is drawn again with it, never from memory", afterOther.body.includes("PUBLISHED-AGAIN"))
  const afterAgain = await page("/")
  check("  and the visitor after that from the hold, the new theme", afterAgain.held === "hit" && afterAgain.body.includes("PUBLISHED-AGAIN"))
}

async function marker() {
  section("MARKER: the rows and the release written from them carry the same marker")
  const { liveSiteFor, liveMarker, liveMarkerAt } = await import("@/lib/website-builder/live-release")
  const { revalidatePublishedSite } = await import("@/lib/website-builder/published-site")
  const { resetReleasesMissing } = await import("@/lib/website-builder/site-releases-server")
  nextCache.resetCache()
  resetReleasesMissing()
  const fx = buildFixture()
  const t = fx.tables as Record<string, Rows>
  ;(fx.relations as Record<string, unknown>)["store_theme_installs>site_live_releases"] = { local: "id", foreign: "install_id", many: false }
  /* Just after a Publish: the trigger let go of the pointer and counted the rows up; the release is not written yet. */
  t.site_live_releases = [{ install_id: SITE.installId, release_id: null, rev: 7 }]
  useFixture(fx)
  const rows = (await visit(() => liveSiteFor(SITE.creatorId))).value
  check("drawn from the rows: the marker of the rows' count", rows?.marker === liveMarkerAt(SITE.installId, 7), rows)
  /* The release written from those rows and pointed at, the count unchanged (recordRelease points only then). */
  t.site_live_releases[0].release_id = "e1111111-1111-4111-8111-11111111aaaa"
  await revalidatePublishedSite(SITE.creatorId)
  const released = (await visit(() => liveSiteFor(SITE.creatorId))).value
  check("drawn from the release written from them: the same marker, so no page is reloaded for it", released?.marker === rows?.marker, released)
  t.site_live_releases[0].rev = 8
  await revalidatePublishedSite(SITE.creatorId)
  const edited = (await visit(() => liveSiteFor(SITE.creatorId))).value
  check("the live rows changed again (a Publish, a live setting, a release put back): a new marker", !!edited && edited.marker !== rows?.marker && edited.marker === liveMarkerAt(SITE.installId, 8), edited)
  delete t.site_live_releases[0].rev
  await revalidatePublishedSite(SITE.creatorId)
  const counted = (await visit(() => liveSiteFor(SITE.creatorId))).value
  check("without a count (part 180's row as an older database has it): the release's marker, as before", counted?.marker === liveMarker(SITE.installId, "e1111111-1111-4111-8111-11111111aaaa"), counted)
  check("never either id, and the shape the page's script accepts", /^[0-9a-f]{16}$/.test(edited?.marker ?? "") && !String(edited?.marker).includes(SITE.installId.slice(0, 8)))

  section("POINTER: the release, once pointed at, is drawn from on every server without a second cold start")
  const { livePointer, releasePointed, releasePointerTag } = await import("@/lib/website-builder/site-releases-server")
  const { creatorSiteTag } = await import("@/lib/website-builder/published-site")
  const { siteStamp } = await import("@/lib/website-builder/site-stamp")
  nextCache.resetCache()
  resetReleasesMissing()
  t.site_live_releases = [{ install_id: SITE.installId, release_id: null, rev: 9 }]
  const tags = [creatorSiteTag(SITE.creatorId)]
  /* Read in the seconds between the Publish and its release: no release yet. */
  const early = (await visit(() => livePointer(SITE.creatorId, tags))).value
  const markEarly = (await visit(() => liveSiteFor(SITE.creatorId))).value
  const stampEarly = await siteStamp(SITE.creatorId)
  check("between the Publish and its release: drawn from the rows", early === null)
  t.site_live_releases[0].release_id = "e1111111-1111-4111-8111-11111111cccc"
  const stillHeld = (await visit(() => livePointer(SITE.creatorId, tags))).value
  check("  which every server would have kept for the pointer's hour", stillHeld === null)
  releasePointed(SITE.creatorId)
  const pointed = (await visit(() => livePointer(SITE.creatorId, tags))).value
  await settle()
  check("the release pointed at: the next draw reads it", pointed?.releaseId === "e1111111-1111-4111-8111-11111111cccc", pointed)
  check("  under its own tag beside the site's", nextCache.revalidatedTags.some((r) => r.tag === releasePointerTag(SITE.creatorId)))
  const markAfter = (await visit(() => liveSiteFor(SITE.creatorId))).value
  check("  the page's marker is unchanged, so no page in a browser reloads for it", markAfter?.marker === markEarly?.marker, { markEarly, markAfter })
  check("  and the held pages are kept: the site's stamp did not move", (await siteStamp(SITE.creatorId)) === stampEarly)
}

async function warm() {
  section("WARM: a Publish draws its pages as a browser opens them, for the publisher's country first")
  const { warmAfterPublish, warmHeaders, publishWarmCountries, PUBLISH_WARM_COUNTRIES } = await import("@/lib/website-builder/warm-sites")
  const plain = warmHeaders(null)
  check("opened as a page (the copy browsers get, not a script's)", plain["sec-fetch-dest"] === "document" && plain["sec-fetch-mode"] === "navigate" && /text\/html/.test(plain.accept))
  check("  carrying nobody's cookie", !("cookie" in plain))
  check("a country is the visitor's choice of it, nothing more", warmHeaders("RO").cookie === "sl_country=2.RO" && !("cookie" in warmHeaders("home")) && !("cookie" in warmHeaders("XX")))
  check("the publisher's country first, then the warm's own", publishWarmCountries(["RO"]).join() === "RO," && publishWarmCountries(["us", "US"]).join() === "US," && publishWarmCountries([]).join() === "" && publishWarmCountries([null, undefined]).length === 1)
  check(`never more than ${PUBLISH_WARM_COUNTRIES} countries a page`, publishWarmCountries(["RO", "DE", "FR"]).length === PUBLISH_WARM_COUNTRIES)

  const site = "https://shop.storelib.com"
  const asked: { url: string; cookie: string | null; dest: string | null }[] = []
  const fetcher = (async (url: string, init?: RequestInit) => {
    const h = new Headers(init?.headers)
    asked.push({ url, cookie: h.get("cookie"), dest: h.get("sec-fetch-dest") })
    if (url === `${site}/about`) return new Response(null, { status: 307, headers: { location: "/fr/about" } })
    if (url === `${site}/away`) return new Response(null, { status: 307, headers: { location: "https://elsewhere.example/" } })
    return new Response("<html></html>", { headers: { "x-storelib-held": url.endsWith("/") ? "hit" : "miss" } })
  }) as unknown as typeof fetch
  const done = await warmAfterPublish("creator-1", { fetcher, addresses: async () => [`${site}/`, `${site}/about`, `${site}/away`], countries: ["RO"] })
  check("the front page first, for the publisher's country", asked[0]?.url === `${site}/` && asked[0]?.cookie === "sl_country=2.RO", asked.slice(0, 2))
  check("every ask opened as a page", asked.every((a) => a.dest === "document"))
  check("each page for both: the publisher's country and the warm's own", asked.filter((a) => a.url === `${site}/`).length === 2 && asked.some((a) => a.url === `${site}/` && a.cookie === null))
  check("a redirect on the same site is followed once (a market's language)", asked.filter((a) => a.url === `${site}/fr/about`).length === 2)
  check("  never to another host", !asked.some((a) => a.url.startsWith("https://elsewhere.example")))
  check("a page held by an imported theme's hold counts as held", done.held === 2 && done.failed === 0, done)

  const publish = code("app/api/website-builder/themes/[installId]/publish/route.ts")
  const cleared = publish.indexOf("await revalidatePublishedSite(creator.id)\n")
  /* Changed on purpose (r66): the pages are drawn once the website is pointed at its release, waiting WARM_WAITS_FOR_RELEASE_MS at most, so they read the release's files every server keeps instead of every row beside the release reading them too (lib/website-builder/after-publish.ts). Still after the caches are cleared and after the answer. */
  const warmAt = publish.indexOf("await warmAfterPublish(creatorId, { countries: [publisherCountry] })")
  const releaseAt = publish.indexOf("const kept = await recordRelease(admin, { installId, creatorId }")
  const warmAfter = publish.lastIndexOf("after(async () => {", warmAt)
  check("Publish draws its pages after the caches are cleared and the release is pointed at, for a stated time at most, after the answer", cleared > 0 && releaseAt > cleared && warmAt > releaseAt && warmAfter > releaseAt && /* Changed on purpose (r67): after the editor's first read window (quietAfterPublish), the same order. Changed on purpose (r68): it names its website (editor-open-r68.test.ts) */ /after\(async \(\) => \{\s*(await quietAfterPublish\((installId)?\)\s*)?await follow\.waitForRelease\(WARM_WAITS_FOR_RELEASE_MS\)\s*await warmAfterPublish\(creatorId, \{ countries: \[publisherCountry\] \}\)/.test(publish))
  check("  for the country the publisher is in", /const publisherCountry = seenCountry\(req\.headers\)/.test(publish))
  const restore = code("app/api/website-builder/themes/[installId]/releases/[releaseId]/restore/route.ts")
  check("putting a published version back draws its pages too", restore.indexOf("warmAfterPublish(creatorId") > restore.indexOf("await revalidatePublishedSite(creator.id)"))
}

async function backForward() {
  section("RELOADS: a shared page shown from a prerender or Back waits for the visitor's own part before it compares the cart")
  const { shopifyBootstrap } = await import("@/lib/storelib-theme/compat/shims")
  const { runInNewContext } = await import("node:vm")
  const head = shopifyBootstrap({ shopName: "Maya", currency: "USD", designMode: false, cartCount: 0 })
  const start = head.indexOf("if(!EDITING){var cartCheck=")
  const end = head.indexOf("if(!EDITING){var vt=")
  check("the check is in the page's head script", start > 0 && end > start)
  const snippet = head.slice(start, end)
  const run = (o: { filling: boolean; atDraw?: number; cart: number }) => {
    const out = { reloads: 0, asked: 0 }
    const doc: Record<string, unknown> = {}
    const docListeners = new Map<string, () => void>()
    const winListeners = new Map<string, (e: unknown) => void>()
    const timers: (() => void)[] = []
    const S: Record<string, unknown> = o.filling ? { storelibFilling: 1 } : {}
    if (o.atDraw !== undefined) S.storelibCartAtDraw = o.atDraw
    doc.prerendering = true
    doc.addEventListener = (t: string, f: () => void) => docListeners.set(t, f)
    const ctx = {
      EDITING: false,
      CART_AT_DRAW: 0,
      S,
      document: doc,
      window: { addEventListener: (t: string, f: (e: unknown) => void) => winListeners.set(t, f) },
      location: { reload: () => out.reloads++ },
      setTimeout: (f: () => void) => (timers.push(f), timers.length),
      clearTimeout: (n: number) => (timers[n - 1] = () => {}),
      fetch: async () => {
        out.asked++
        return { ok: true, json: async () => ({ item_count: o.cart }) }
      },
    }
    runInNewContext(snippet, ctx)
    return { out, S, fire: (t: string) => docListeners.get(t)?.(), back: () => winListeners.get("pageshow")?.({ persisted: true }), timers }
  }
  const tick = () => new Promise((r) => setTimeout(r, 5))
  /* A visitor with two things in the cart shows a prerendered page before its own part came. */
  const early = run({ filling: true, cart: 2 })
  early.fire("prerenderingchange")
  await tick()
  check("shown before the visitor's own part came: no reload, and the cart not compared yet", early.out.reloads === 0 && early.out.asked === 0, early.out)
  early.S.storelibCartAtDraw = 2
  early.fire("storelib:personal")
  await tick()
  check("  once it came with the same count: compared, and no reload", early.out.asked === 1 && early.out.reloads === 0, early.out)
  const changed = run({ filling: true, cart: 3 })
  changed.fire("prerenderingchange")
  changed.S.storelibCartAtDraw = 2
  changed.fire("storelib:personal")
  await tick()
  check("the cart changed after the page was drawn: it loads itself again, once", changed.out.reloads === 1, changed.out)
  const never = run({ filling: true, cart: 2 })
  never.fire("prerenderingchange")
  never.timers.forEach((f) => f())
  await tick()
  check("the visitor's part never came: compared after four seconds at most", never.out.asked === 1)
  const stranger = run({ filling: false, cart: 0 })
  stranger.back()
  await tick()
  check("a stranger brought back by Back: compared at once, nothing to reload", stranger.out.asked === 1 && stranger.out.reloads === 0)
  const owner = run({ filling: true, atDraw: 1, cart: 1 })
  owner.back()
  await tick()
  check("a page whose part already came, brought back by Back: compared at once", owner.out.asked === 1 && owner.out.reloads === 0)
  check("the fill says it is under way", /S\.storelibFilling=1;/.test(read("lib/storelib-theme/compat/personal-fill.ts")))
}

function sources() {
  section("The rest, where it is decided")
  const compat = code("lib/website-builder/compat-site.ts")
  const publish = code("app/api/website-builder/themes/[installId]/publish/route.ts")
  /* Changed on purpose (r66): the release is handed the publish's one read (follow.liveRows). */
  const recorded = publish.indexOf("const kept = await recordRelease(admin, { installId, creatorId }")
  check("once Publish's release is pointed at, only the pointer is let go", publish.indexOf("releasePointed(creatorId)") > recorded && /if \(\(kept as \{ live\?: boolean \}\)\.live\) releasePointed\(creatorId\)/.test(publish))
  check("the site from memory only for the live site, never a preview", /const known = previewToken !== null \? null :/.test(compat) && /siteMemo\.get\(memoKey, known\.stamp\)/.test(compat))
  const route = code("app/api/site-theme/site/[username]/[[...path]]/route.ts")
  check("the held page asks the stamp beside the name, and hands both to its draw", /const creator = await nameAndStamp\(username\)/.test(route) && /askedFor\.set\(req, creator\)/.test(route) && /compatSiteByName\(username, host, token, token \? undefined :/.test(route))
  check("a preview never reaches the hold", /if \(!stranger \|\| ajax/.test(route))
}

async function main() {
  await memo()
  await hold()
  await site()
  await marker()
  await warm()
  await backForward()
  sources()
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}
void main()
