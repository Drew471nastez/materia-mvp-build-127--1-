/**
 * ===========================================================================
 *  AFTER A PUBLISH, NO REQUEST AND NO PAGE IN THE BROWSER SHOWS THE OLD THEME
 * ===========================================================================
 * The owner: "I publish a new theme to live ... I go to a product, add it to
 * checkout, then I return from the checkout and it takes me to the OLD theme
 * I had published in the past ... then I refresh the page and it's no longer
 * there."
 *
 * Every way that happened, held here through the real data path over the
 * fake PostgREST of scripts/speed18 and Next's cache kept as Next 16 keeps
 * it (scripts/speed18/shims/next-cache.ts: a tag revalidated with an
 * `expire` serves its entries stale once while they are read again):
 *
 *   DATA       Publish expired the site's tag with { expire: 3600 }: stale,
 *              not gone. The first request after a Publish on a page drawn
 *              per request (the cart a checkout returns to) read the old site
 *              and the old live release; the refresh read the new one.
 *   THEME      publishing another install (a new theme) is seen at once.
 *   RELEASE    the live release pointer, and the marker a page carries, move
 *              with the Publish.
 *   IMPORTED   an imported theme's held stranger page is drawn again by the
 *              Publish itself, and no longer kept by the CDN, which a Publish
 *              cannot reach.
 *   BROWSER    a page restored by Back (bfcache or the browser's cache),
 *              shown again in a tab, or about to open a page Next's router
 *              fetched ahead asks what is live and loads again when it
 *              changed, once.
 *   SWITCH     a switch between a Storelib theme and an imported one is sent
 *              on to the right renderer (sl_fresh), once.
 *
 * Run with:  pnpm test:push
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { runInNewContext } from "node:vm"
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
/* Code without its comments, so a sentence about a thing is never taken for the thing. */
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
const SECOND_INSTALL = "d1111111-1111-4111-8111-1111111111b2"
const RELEASE_A = "e1111111-1111-4111-8111-11111111aaaa"
const RELEASE_B = "e1111111-1111-4111-8111-11111111bbbb"

/** Maya's site with a second install, unpublished, whose theme says so in its brand name. */
function fixtureWithTwoThemes() {
  const fx = buildFixture()
  const t = fx.tables as Record<string, Rows>
  const install = t.store_theme_installs.find((r) => r.id === SITE.installId)!
  const settings = t.store_theme_settings.find((r) => r.install_id === SITE.installId)!
  t.store_theme_installs.push({ ...install, id: SECOND_INSTALL, status: "draft", sort_order: 1, preview_token: "token-b" })
  t.store_theme_settings.push({ ...settings, id: "91000000-0000-4000-8000-0000000000b2", install_id: SECOND_INSTALL, settings: { ...(settings.settings as object), brand_name: "THEME-B" } })
  for (const p of t.store_theme_pages.filter((r) => r.install_id === SITE.installId)) t.store_theme_pages.push({ ...p, id: `${String(p.id).slice(0, -2)}b2`, install_id: SECOND_INSTALL })
  return { fx, t }
}

/** Publish install `id` (and only it), as the publish route leaves the rows. */
function publishInstall(t: Record<string, Rows>, id: string) {
  for (const r of t.store_theme_installs) if (r.creator_id === SITE.creatorId) r.status = r.id === id ? "published" : "draft"
}

async function dataAfterPublish() {
  section("DATA: the first request after a Publish draws the new site (the cart a checkout returns to is drawn per request)")
  const { publishedShopByName, revalidatePublishedSite } = await import("@/lib/website-builder/published-site")
  nextCache.resetCache()
  const { fx, t } = fixtureWithTwoThemes()
  useFixture(fx)
  const brand = (r: Awaited<ReturnType<typeof publishedShopByName>>) => (r.kind === "site" ? String(r.site.themeSettings.brand_name ?? "") : r.kind)

  const before = await visit(() => publishedShopByName(SITE.username))
  await settle()
  check("before: the published theme", before.value?.kind === "site" && brand(before.value) === `${SITE.username} studio`, before.value && brand(before.value))
  const held = await visit(() => publishedShopByName(SITE.username))
  check("and held: the next visitor costs no read", held.foreground === 0, held.foreground)

  /* THE MECHANISM, shown: a tag revalidated with an `expire` serves what it held once more. */
  const settings = t.store_theme_settings.find((r) => r.install_id === SITE.installId)!
  settings.settings = { ...(settings.settings as object), brand_name: "EDITED-ONCE" }
  nextCache.revalidateTag(`published-site:${SITE.creatorId}`, { expire: 3600 })
  const staleOne = await visit(() => publishedShopByName(SITE.username))
  await settle()
  check("(how it went wrong: a tag expired in an hour serves the old site to the first request)", staleOne.value?.kind === "site" && brand(staleOne.value) === `${SITE.username} studio`, staleOne.value && brand(staleOne.value))

  /* THE FIX: Publish itself. */
  settings.settings = { ...(settings.settings as object), brand_name: "PUBLISHED-AGAIN" }
  await revalidatePublishedSite(SITE.creatorId)
  const after = await visit(() => publishedShopByName(SITE.username))
  await settle()
  check("after Publish: the very next request draws what was published", after.value?.kind === "site" && brand(after.value) === "PUBLISHED-AGAIN", after.value && brand(after.value))
  check("read before it was served, never behind the visitor", after.foreground > 0, { foreground: after.foreground, background: after.background })
  const site = code("lib/website-builder/published-site.ts")
  check("Publish expires the site's tag at once", /revalidateTag\(creatorSiteTag\(creatorId\), \{ expire: 0 \}\)/.test(site) && !/expire: SITE_TTL/.test(site))

  section("THEME: publishing another install shows it on the next request")
  publishInstall(t, SECOND_INSTALL)
  await revalidatePublishedSite(SITE.creatorId)
  const switched = await visit(() => publishedShopByName(SITE.username))
  await settle()
  check("the new install's theme, at once", switched.value?.kind === "site" && switched.value.site.installId === SECOND_INSTALL && brand(switched.value) === "THEME-B", switched.value?.kind === "site" ? { install: switched.value.site.installId, brand: brand(switched.value) } : switched.value)
  publishInstall(t, SITE.installId)
  await revalidatePublishedSite(SITE.creatorId)
  const back = await visit(() => publishedShopByName(SITE.username))
  check("and back to the first, at once", back.value?.kind === "site" && back.value.site.installId === SITE.installId, back.value?.kind === "site" ? back.value.site.installId : back.value)
}

async function releaseAfterPublish() {
  section("RELEASE: the live release pointer and the page's marker move with the Publish")
  const { revalidatePublishedSite, creatorSiteTag } = await import("@/lib/website-builder/published-site")
  const { livePointer, resetReleasesMissing } = await import("@/lib/website-builder/site-releases-server")
  const { liveSiteFor, liveMarker } = await import("@/lib/website-builder/live-release")
  nextCache.resetCache()
  resetReleasesMissing()
  const { fx, t } = fixtureWithTwoThemes()
  t.site_live_releases = [{ install_id: SITE.installId, release_id: RELEASE_A }]
  t.site_releases = []
  ;(fx.relations as Record<string, unknown>)["store_theme_installs>site_live_releases"] = { local: "id", foreign: "install_id", many: false }
  useFixture(fx)
  const tags = [creatorSiteTag(SITE.creatorId)]
  const a = await visit(() => livePointer(SITE.creatorId, tags))
  const markA = await visit(() => liveSiteFor(SITE.creatorId))
  await settle()
  check("release A is live", a.value?.releaseId === RELEASE_A, a.value)
  check("the marker names it, and neither id", markA.value?.marker === liveMarker(SITE.installId, RELEASE_A) && /^[0-9a-f]{16}$/.test(markA.value?.marker ?? "") && markA.value?.compat === false, markA.value)

  t.site_live_releases[0].release_id = RELEASE_B
  await revalidatePublishedSite(SITE.creatorId)
  const b = await visit(() => livePointer(SITE.creatorId, tags))
  const markB = await visit(() => liveSiteFor(SITE.creatorId))
  await settle()
  check("Publish B: the next read is release B, never A once more", b.value?.releaseId === RELEASE_B && b.foreground > 0, { pointer: b.value, foreground: b.foreground })
  check("and the marker changed", !!markB.value && markB.value.marker !== markA.value?.marker && markB.value.marker === liveMarker(SITE.installId, RELEASE_B), markB.value)

  /* A new theme with its own release. */
  publishInstall(t, SECOND_INSTALL)
  t.site_live_releases.push({ install_id: SECOND_INSTALL, release_id: RELEASE_A })
  const settings = t.store_theme_settings.find((r) => r.install_id === SECOND_INSTALL)!
  settings.settings = { ...(settings.settings as object), compat: { kind: "shopify" } }
  await revalidatePublishedSite(SITE.creatorId)
  const markC = await visit(() => liveSiteFor(SITE.creatorId))
  check("another install published: its own marker, and its kind said", markC.value?.marker === liveMarker(SECOND_INSTALL, RELEASE_A) && markC.value?.compat === true, markC.value)

  section("The address a page asks (app/api/public/site-release)")
  const { GET } = await import("@/app/api/public/site-release/route")
  const res = await visit(() => GET(new Request(`https://maya.storelib.com/api/public/site-release?name=${SITE.username}~fr`)))
  const body = res.value ? await res.value.json() : null
  check("answers what is live now, for the name a localized page carries", body?.marker === markC.value?.marker, body)
  check("never held by anybody", res.value?.headers.get("cache-control") === "no-store")
  const odd = await visit(() => GET(new Request(`https://maya.storelib.com/api/public/site-release?name=${encodeURIComponent("<script>")}`)))
  check("a name that is not one is refused", odd.value?.status === 404)
  const nobody = await visit(() => GET(new Request("https://x.storelib.com/api/public/site-release?name=nobody-here")))
  check("a name with no site: nothing is live", (await nobody.value?.json())?.marker === null)
  check("needs no session (under /api/public/)", (await import("@/lib/auth/no-session-paths")).skipsSessionRefresh("/api/public/site-release", ["sb-x-auth-token"]))
}

async function importedHold() {
  section("IMPORTED: a stranger's held page of an imported theme is drawn again by Publish, and kept by no CDN")
  const { heldStrangerPage, strangerKey } = await import("@/lib/storelib-theme/compat/stranger-hold")
  const { revalidatePublishedSite, creatorSiteTag, creatorShopTag } = await import("@/lib/website-builder/published-site")
  nextCache.resetCache()
  useFixture(buildFixture())
  let theme = "OLD-THEME"
  let draws = 0
  const draw = async () => {
    draws++
    /* A draw takes a while, as a theme's does: a stale copy is answered before it is done. */
    const drawing = theme
    await new Promise((r) => setTimeout(r, 15))
    return { status: 200, headers: [["content-type", "text/html"]] as [string, string][], body: `<html><body>${drawing}</body></html>`, share: true }
  }
  const key = strangerKey(SITE.username, ["~anon~maya.storelib.com~US~_~_", "products", "a"], "")
  const tags = [creatorSiteTag(SITE.creatorId), creatorShopTag(SITE.creatorId)]
  await heldStrangerPage(key, tags, draw)
  const again = await heldStrangerPage(key, tags, draw)
  check("held for the next stranger", again.held && draws === 1)
  theme = "NEW-THEME"
  await revalidatePublishedSite(SITE.creatorId)
  const after = await heldStrangerPage(key, tags, draw)
  await settle()
  check("after the real Publish purge: the new theme for the very next stranger", after.body.includes("NEW-THEME") && !after.held, { body: after.body, held: after.held })

  const { PUBLIC_PAGE_CACHE, SHAREABLE_HEADER } = await import("@/lib/storelib-theme/compat/anonymous-cache")
  /* Changed on purpose (r53): the CDN keeps it through its own header, under the site's tags, which revalidatePublishedSite expires (tests/site-speed-r53.test.ts); what the browser is told is unchanged. */
  check("what the browser is told of a stranger's page says no s-maxage, not public", !/s-maxage|public/.test(PUBLIC_PAGE_CACHE) && PUBLIC_PAGE_CACHE === "private, no-cache", PUBLIC_PAGE_CACHE)
  const route = code("app/api/site-theme/site/[username]/[[...path]]/route.ts")
  check("the handler marks what may be shared for its hold, and never sends that on", /headers\.set\(SHAREABLE_HEADER, "1"\)/.test(route) && /res\.headers\.get\(SHAREABLE_HEADER\) === "1"/.test(route) && /headers\.delete\(SHAREABLE_HEADER\)/.test(route) && SHAREABLE_HEADER.startsWith("x-storelib-"))
  const proxy = code("proxy.ts")
  check("the proxy's front page says no s-maxage for an imported theme either", /if \(asked === "\/" && page === "\/"\) r\.headers\.set\("Cache-Control", marker \? PUBLIC_PAGE_CACHE : "private, no-cache"\)/.test(proxy))
  check("an imported theme's page carries the release watch, drawn from what is live", /releaseTag\(username, marker\)/.test(route) && /liveSiteFor\(found\.site\.creatorId\)/.test(route))
  check("and the watch is left where it is by the script reordering", /\|release\)\\b\/i/.test(read("lib/storelib-theme/compat/script-order.ts")))
}

type FakeWindow = {
  reloads: number
  assigned: string[]
  replaced: string[]
  fire(type: string, ev?: Record<string, unknown>): void
  fireDoc(type: string): void
  watch(): { outdated(): boolean; due(): boolean; changed(): Promise<boolean> } | undefined
  setHidden(h: boolean): void
  storage: Map<string, string>
}

/** Runs the release watch in a window of its own: its fetch answers `answer()`. */
function runWatch(script: string, opts: { navType?: string; deliveryType?: string; answer: () => { status: number; body: unknown }; href?: string; framed?: boolean; storage?: Map<string, string> }): FakeWindow {
  const winListeners = new Map<string, ((e: unknown) => void)[]>()
  const docListeners = new Map<string, ((e: unknown) => void)[]>()
  const storage = opts.storage ?? new Map<string, string>()
  let state = "visible"
  const out: FakeWindow = {
    reloads: 0,
    assigned: [],
    replaced: [],
    fire: (type, ev = {}) => (winListeners.get(type) ?? []).forEach((f) => f(ev)),
    fireDoc: (type) => (docListeners.get(type) ?? []).forEach((f) => f({})),
    watch: () => (ctx.window as { __storelibRelease?: ReturnType<FakeWindow["watch"]> }).__storelibRelease,
    setHidden: (h) => {
      state = h ? "hidden" : "visible"
    },
    storage,
  }
  const win: Record<string, unknown> = {
    addEventListener: (t: string, f: (e: unknown) => void) => winListeners.set(t, [...(winListeners.get(t) ?? []), f]),
  }
  const ctx: Record<string, unknown> = {
    window: win,
    document: {
      get visibilityState() {
        return state
      },
      prerendering: false,
      addEventListener: (t: string, f: (e: unknown) => void) => docListeners.set(t, [...(docListeners.get(t) ?? []), f]),
    },
    performance: { getEntriesByType: () => [{ type: opts.navType ?? "navigate", deliveryType: opts.deliveryType ?? "" }] },
    location: {
      href: opts.href ?? "https://maya.storelib.com/cart",
      reload: () => {
        out.reloads++
      },
      replace: (u: string) => out.replaced.push(u),
    },
    sessionStorage: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v) },
    fetch: async () => {
      const a = opts.answer()
      return { ok: a.status === 200, json: async () => a.body }
    },
    URL,
    setTimeout,
    Date,
    Promise,
    JSON,
  }
  win.top = opts.framed ? {} : win
  win.self = win
  ctx.window = win
  runInNewContext(script, { ...ctx, ...{ window: win } })
  /* The script reads window.* through the context's globals too. */
  return out
}

const tick = () => new Promise((r) => setTimeout(r, 5))

async function browser() {
  section("BROWSER: a page the browser kept asks what is live, and loads again when it changed")
  const { liveReleaseScript, releaseChangedBeforeLink, RELEASE_ENDPOINT, FRESH_MS, HELD_PAGE_MS, FRESH_REDIRECT_SCRIPT, freshAddress, SITE_FRESH_PARAM } = await import("@/lib/website-builder/live-release-script")
  const mine = "0123456789abcdef"
  const other = "fedcba9876543210"
  const script = liveReleaseScript("maya", mine)
  check("a script for a real name and marker", script.length > 0 && script.includes(JSON.stringify(mine)) && script.includes(`${RELEASE_ENDPOINT}?name=maya`))
  check("none for anything typed into an address", liveReleaseScript("</script><script>alert(1)", mine) === "" && liveReleaseScript("maya", "nope\"") === "")

  /* Back from Stripe: restored from the back and forward cache. */
  let w = runWatch(script, { answer: () => ({ status: 200, body: { marker: other } }) })
  w.fire("pageshow", { persisted: false })
  await tick()
  check("a page loaded from the server does not ask", w.reloads === 0)
  w.fire("pageshow", { persisted: true })
  await tick()
  check("restored by Back after a Publish: loaded again", w.reloads === 1)
  w.fire("pageshow", { persisted: true })
  await tick()
  check("once per change, never in a loop", w.reloads === 1)

  w = runWatch(script, { answer: () => ({ status: 200, body: { marker: mine } }) })
  w.fire("pageshow", { persisted: true })
  await tick()
  check("restored with nothing published since: left as it is", w.reloads === 0)

  w = runWatch(script, { answer: () => ({ status: 503, body: { error: "Unavailable" } }) })
  w.fire("pageshow", { persisted: true })
  await tick()
  check("an answer that is not known changes nothing", w.reloads === 0)

  for (const [label, o] of [["Back loading it from the browser's cache", { navType: "back_forward" }], ["a page served from the browser's cache", { deliveryType: "cache" }], ["a page fetched ahead", { deliveryType: "navigational-prefetch" }]] as const) {
    w = runWatch(script, { ...o, answer: () => ({ status: 200, body: { marker: other } }) })
    await tick()
    check(`${label}: asks at once, and loads again`, w.reloads === 1)
  }

  w = runWatch(script, { answer: () => ({ status: 200, body: { marker: other } }) })
  w.setHidden(true)
  w.fireDoc("visibilitychange")
  w.setHidden(false)
  w.fireDoc("visibilitychange")
  await tick()
  check("a tab shown again at once does not ask (no request per glance)", w.reloads === 0)

  let asked = 0
  const counting = () => {
    asked++
    return { status: 200, body: { marker: other } }
  }
  w = runWatch(liveReleaseScript("maya", mine, Date.now() - HELD_PAGE_MS - 5000), { answer: counting })
  w.fire("load")
  await tick()
  await tick()
  check("a page from a copy drawn a while ago (an edge copy a Publish did not reach): asks once it has loaded, and loads again", asked === 1 && w.reloads === 1, { asked, reloads: w.reloads })
  asked = 0
  w = runWatch(liveReleaseScript("maya", mine, Date.now()), { answer: counting })
  w.fire("load")
  await tick()
  check("a page drawn for this request: no request at all", asked === 0 && w.reloads === 0, { asked })

  section("A link opened in place, after a Publish, opens as a whole page")
  w = runWatch(script, { answer: () => ({ status: 200, body: { marker: other } }) })
  const watch = w.watch()
  check("the page offers its watch to the link handler", !!watch && typeof watch.changed === "function")
  check("a fresh answer is trusted: no wait before an in-place link", (await releaseChangedBeforeLink(watch)) === false)
  const realNow = Date.now
  Date.now = () => realNow() + FRESH_MS + 1000
  try {
    check("an old one is asked again, and the change sends the link as a whole page", (await releaseChangedBeforeLink(watch)) === true)
  } finally {
    Date.now = realNow
  }
  check("and stays known for the next link", watch!.outdated() === true && (await releaseChangedBeforeLink(watch)) === true)
  const slow = { outdated: () => false, due: () => true, changed: () => new Promise<boolean>((r) => setTimeout(() => r(true), 300)) }
  const t0 = Date.now()
  check("a slow answer never holds a link back for long", (await releaseChangedBeforeLink(slow, 30)) === false && Date.now() - t0 < 200)
  check("no watch (a page without one): in place as before", (await releaseChangedBeforeLink(undefined)) === false)

  const links = code("components/website-builder/site-links.tsx")
  check("SiteLinks asks before an in-place link and opens a changed site as a whole page", /releaseChangedBeforeLink\(releaseWatch\(\)\)/.test(links) && /if \(outdated\) window\.location\.assign\(to\)/.test(links) && /else goInPlace\(to\)/.test(links))
  check("and asks on the first sign of interest, so the press finds the answer", /if \(watch\?\.due\(\)\) void watch\.changed\(\)/.test(links))
  const layout = code("app/(site)/w/[username]/layout.tsx")
  check("every page of a Storelib theme's site carries the watch, beside the page rather than before it", /\{releaseScript\(splitSiteName\(username\)\.name\)\}/.test(layout) && /liveSiteFor\(c\.creatorId\)/.test(layout) && !/\bcookies\(\)|\bheaders\(\)/.test(layout))

  section("SWITCH: a Storelib theme and an imported one, sent on to the right renderer once")
  check("the address with the ask", freshAddress("/products/a?x=1") === `/products/a?x=1&${SITE_FRESH_PARAM}=1` && freshAddress("/") === `/?${SITE_FRESH_PARAM}=1`)
  check("never twice", freshAddress(`/cart?${SITE_FRESH_PARAM}=1`) === null)
  w = runWatch(FRESH_REDIRECT_SCRIPT, { href: "https://maya.storelib.com/about?a=1", answer: () => ({ status: 200, body: {} }) })
  check("a Storelib theme's page that finds an imported theme live sends the visitor on", w.replaced.length === 1 && w.replaced[0].includes(`${SITE_FRESH_PARAM}=1`) && w.replaced[0].includes("a=1"), w.replaced)
  w = runWatch(FRESH_REDIRECT_SCRIPT, { href: `https://maya.storelib.com/about?${SITE_FRESH_PARAM}=1`, answer: () => ({ status: 200, body: {} }) })
  check("but not a second time", w.replaced.length === 0)
  w = runWatch(FRESH_REDIRECT_SCRIPT, { href: "https://maya.storelib.com/wishlist?sl_embed=1", framed: true, answer: () => ({ status: 200, body: {} }) })
  check("nor the wishlist an imported theme frames", w.replaced.length === 0)
  w = runWatch(FRESH_REDIRECT_SCRIPT, { href: "https://maya.storelib.com/preview/abc", answer: () => ({ status: 200, body: {} }) })
  check("nor a preview", w.replaced.length === 0)
  const route = code("app/api/site-theme/site/[username]/[[...path]]/route.ts")
  check("an imported theme's handler that finds a Storelib theme live sends a page on, once", /const again = token \? null : await switchedAway\(req, username, segments\)/.test(route) && /status: 307, headers: \{ Location: again/.test(route) && /if \(!live \|\| live\.compat\) return null/.test(route))
  const proxy = code("proxy.ts")
  check("the proxy asks afresh for that address, at most once a second a name", /compatSiteFor\(subdomain, asksFresh\(request\)\)/.test(proxy) && /compatSiteFor\(username, asksFresh\(request\)\)/.test(proxy) && /FORCED_GAP_MS = 1_000/.test(proxy) && /forgetSharedSiteFacts\(lower\)/.test(proxy))
}

async function every() {
  section("Every cache that holds a theme is under the site's tag (or keyed by what never changes)")
  const files = ["lib/website-builder/published-site.ts", "lib/website-builder/compat-site.ts", "lib/website-builder/site-releases-server.ts", "lib/website-builder/product-page-theme.ts", "lib/website-builder/live-release.ts", "lib/storelib-theme/compat/stranger-hold.ts"]
  for (const f of files) {
    const src = code(f)
    const calls = src.split("unstable_cache(").slice(1).map((c) => c.slice(0, 600))
    const loose = calls.filter((c) => /"(?:published-site|compat-install|compat-pages|compat-menus|site-live-release|site-live-state|section-sources|creator-facts|product-page-theme)"/.test(c) && !/creatorSiteTag|siteTags|\btags\b/.test(c))
    check(`${f}: no theme read held without the site's tag`, loose.length === 0, loose.map((c) => c.slice(0, 120)))
  }
  check("a release's own files are held for good, keyed by the release (they never change)", /\["site-release", releaseId\], \{ revalidate: false \}/.test(code("lib/website-builder/site-releases-server.ts")))
}

async function main() {
  await dataAfterPublish()
  await releaseAfterPublish()
  await importedHold()
  await browser()
  await every()
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}

void main()
