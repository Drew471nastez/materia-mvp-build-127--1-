/**
 * ===========================================================================
 *  ROUND 15: THE TAB BAR, THE LIBRARY AND THE ACCOUNT
 * ===========================================================================
 * The owner: "sometimes the mobile nav bar disappears, really weird ... it
 * hides the mobile nav bar and I have to do something so that it appears
 * again"; "inside of a community replace Library with Create post"; "from my
 * Profile I tap the Library pill, the iOS loading turns for 10 seconds and
 * then I am back on the profile"; "Edit profile and the Settings pill ... I
 * have to double click"; "the Preferences pill says Something went wrong on
 * this page".
 *
 * EVERY WAY THE BAR DISAPPEARED, each with the check that proves it gone:
 *
 *   1  A focused field taken out of the document (the composer closing with
 *      its caret still in the text, a post closed with the comment box
 *      focused). WebKit sends no focusout for that, so the bar believed a
 *      keyboard was up and stayed slid away.
 *   2  The bar slid away for a keyboard UNDER a layer that covers it (the
 *      composer, Settings), then slid back a beat after the layer had gone,
 *      or never (1).
 *   3  An html class with no count: two layers overlapping, the one leaving
 *      took the class off while the other was still up (and the other way).
 *   4  A class the server printed for a layer whose effect never ran stayed
 *      on for the rest of the visit.
 *   5  An opened post (z 130) drawn over the bar (z 50): the bar vanished on
 *      open. The bar now stays over a post.
 *   6  The ghost tap guard took the bar out of reach (pointer-events none)
 *      for over a second after Settings or a post closed: there, but dead.
 *   7  In the iPhone app, the system video player's class (`video-fullscreen`)
 *      hides the bar, and an end event nobody heard left it hidden.
 *
 * The browser half (390x844 and 1440x900, layers opened and closed in every
 * order) is scripts/check-nav-tabs15.mjs.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import * as React from "react"
import { untt } from "./i18n-source"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail === undefined ? "" : `   (${JSON.stringify(detail)})`}`) }
}
const section = (t: string) => console.log(`\n${t}`)
const read = (p: string) => untt(readFileSync(join(process.cwd(), p), "utf8"), p)
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

/* ── A document small enough to read, for the registry ── */
class ClassList {
  set = new Set<string>()
  add(n: string) { this.set.add(n) }
  remove(n: string) { this.set.delete(n) }
  contains(n: string) { return this.set.has(n) }
}
type FakeEl = { isConnected: boolean; attr: string }
const html = {
  classList: new ClassList(),
  attrs: new Set<string>(),
  toggleAttribute(n: string, on?: boolean) { if (on ?? !this.attrs.has(n)) this.attrs.add(n); else this.attrs.delete(n) },
  hasAttribute(n: string) { return this.attrs.has(n) },
}
const onPage: FakeEl[] = []
const videos: Array<{ webkitDisplayingFullscreen?: boolean }> = []
;(globalThis as unknown as { document: unknown }).document = {
  documentElement: html,
  fullscreenElement: null,
  querySelector(sel: string) {
    const m = /\[data-layer-kind="([^"]+)"\]/.exec(sel)
    return m ? onPage.find((e) => e.isConnected && e.attr === m[1]) ?? null : null
  },
  querySelectorAll(sel: string) { return sel === "video" ? videos : [] },
  addEventListener() {},
  removeEventListener() {},
}

async function main() {
  const layers = await import("../lib/ui/layers")
  const { openLayer, sweepLayers, resetLayers, tabBarLayers, layerCount, LAYER_KINDS, clearStaleVideoFullscreen, subscribeLayers } = layers

  section("3  The class on <html> is counted, not switched")
  {
    resetLayers()
    const a = openLayer("page")
    const b = openLayer("page")
    check("two page layers up: the class is on", html.classList.contains("has-page-layer") && layerCount("page") === 2)
    a()
    check("the first one leaving while the second is up leaves it on", html.classList.contains("has-page-layer"))
    a()
    check("a release is good once: calling it again takes nothing of the other's", html.classList.contains("has-page-layer") && layerCount("page") === 1)
    b()
    check("the last one leaving takes it off", !html.classList.contains("has-page-layer") && layerCount() === 0)
    const leaving = openLayer("phone-page")
    const arriving = openLayer("phone-page")
    leaving()
    check("one closing while the next opens (an editor opened from another): still on", html.classList.contains("has-phone-page-layer"))
    arriving()
    check("and off with the last", !html.classList.contains("has-phone-page-layer"))
  }

  section("4  A class the server printed cannot outlive its layer")
  {
    resetLayers()
    html.classList.add("has-page-layer")
    const el: FakeEl = { isConnected: true, attr: "page" }
    onPage.push(el)
    sweepLayers()
    check("while the layer's element is on the page and its effect has not run yet, the printed class holds", html.classList.contains("has-page-layer"))
    el.isConnected = false
    sweepLayers()
    check("once the element has gone without its effect ever running, the sweep takes the class off", !html.classList.contains("has-page-layer"))
    onPage.length = 0
    /* An entry whose element left without its cleanup (a portal torn down with the page): let go by the sweep after its grace. */
    const node = { isConnected: true }
    openLayer("composer", () => node as unknown as Element)
    check("an open composer covers the bar", tabBarLayers().covered)
    node.isConnected = false
    sweepLayers()
    check("inside the first moments it is kept (a portal can mount a frame late)", tabBarLayers().covered)
    const realNow = Date.now
    Date.now = () => realNow() + 1000
    sweepLayers()
    Date.now = realNow
    check("after that, an entry whose element left the document is let go: the bar is not covered by nothing", !tabBarLayers().covered && layerCount() === 0)
    const page = read("components/app/page-layer.tsx")
    check("the page layer registers through the registry, sweeps first, and marks its element for the sweep",
      /sweepLayers\(\)\s*const release = openLayer\(phoneOnly \? "phone-page" : "page", \(\) => box\.current\)/.test(code("components/app/page-layer.tsx"))
        && /release\(\)/.test(code("components/app/page-layer.tsx")) && /\[LAYER_ATTR\]: phoneOnly \? "phone-page" : "page"/.test(page)
        && !/html\.classList\.(add|remove)\(name\)/.test(code("components/app/page-layer.tsx")))
    check("a still copy of a layer never stands for it", /node\.removeAttribute\(LAYER_ATTR\)/.test(page))
    const bar = code("components/nav/buyer-tab-bar.tsx")
    check("a route change sweeps (the tab bar asks on every address)", /useEffect\(\(\) => sweepLayers\(\), \[pathname\]\)/.test(bar))
    check("so does a page shown again from the back cache, and Back", /addEventListener\("pageshow", \(\) => sweepLayers\(\)\)/.test(read("lib/ui/layers.ts")) && /addEventListener\("popstate"/.test(read("lib/ui/layers.ts")))
  }

  section("Which layer covers the bar (ARCH item 8)")
  {
    check("the composer, the picture viewer, a search screen, Settings and a page layer cover it",
      (["composer", "viewer", "search", "screen", "page", "phone-page"] as const).every((k) => LAYER_KINDS[k].covers))
    /* Round 25: an opened post is the website builder's bottom sheet on a phone and covers the bar, as the composer does. */
    check("an opened post covers it too since round 25 (a bottom sheet over the whole app)", LAYER_KINDS.post.covers && !LAYER_KINDS.post.barOver)
    check("a sheet or a dialog neither covers nor lifts it", !LAYER_KINDS.sheet.covers && !LAYER_KINDS.sheet.barOver)
    resetLayers()
    let told = 0
    const off = subscribeLayers(() => told++)
    const post = openLayer("post")
    check("5  a post open: the bar is covered, on <html> for the stylesheet", tabBarLayers().covered && !tabBarLayers().over && html.hasAttribute("data-tabs-covered") && told === 1)
    const edit = openLayer("composer")
    check("   Edit post over the post: the composer covers the bar, which is no longer lifted", tabBarLayers().covered && !tabBarLayers().over && !html.hasAttribute("data-tabs-over") && html.hasAttribute("data-tabs-covered"))
    edit()
    check("   the composer closes: still covered by the post", tabBarLayers().covered && !tabBarLayers().over && html.hasAttribute("data-tabs-covered"))
    post()
    check("   the post closes: nothing over the bar, nothing on <html>", !tabBarLayers().over && !html.hasAttribute("data-tabs-over") && !html.hasAttribute("data-tabs-covered"))
    off()
    const css = read("app/globals.css")
    check("   the stylesheet lifts the bar over a post (131 over its 130) on a phone, and nothing else", /html\[data-tabs-over\] \[data-buyer-tab-bar\] \{\s*z-index: 131;/.test(css))
  }

  section("1 and 2  The keyboard: a field that left, a layer over the bar")
  {
    const bar = code("components/nav/buyer-tab-bar.tsx")
    check("1  the typing answer is asked again whenever it could change without an event: the document changing, the visible viewport resizing, a page shown again, a layer opening or closing",
      /new MutationObserver\(later\)/.test(bar) && /watching\.observe\(document\.body, \{ childList: true, subtree: true \}\)/.test(bar)
        && /vv\?\.addEventListener\("resize", later\)/.test(bar) && /addEventListener\("pageshow", later\)/.test(bar) && /subscribeLayers\(later\)/.test(bar))
    check("   and the observer is only there while the answer is typing (no cost the rest of the time)", /if \(on && !watching/.test(bar) && /else if \(!on && watching\)/.test(bar))
    check("2  under a layer that covers it the bar does not slide away for a keyboard", /const away = typing && !layers\.covered/.test(bar))
    check("   and is out of reach of a screen reader and the Tab key while covered", /aria-hidden=\{layers\.covered \|\| undefined\}/.test(bar) && /inert=\{layers\.covered \|\| undefined\}/.test(bar))
    check("   Settings over the profile is such a layer", /useLayer\("screen", true, panel\)/.test(code("components/account/settings-subpage.tsx")))
  }

  section("6  The ghost tap guard eats only the echo, where the finger was")
  {
    const g = await import("../lib/navigation/swallow-ghost-taps")
    check("an echo is a lift within a fingertip of the press", g.isGhostTap(30, 70, { x: 28, y: 72 }) && g.isGhostTap(28 + 50, 72, { x: 28, y: 72 }))
    check("Edit profile, the Settings pill and a tab are far from the back chevron: not echoes", !g.isGhostTap(330, 300, { x: 28, y: 72 }) && !g.isGhostTap(200, 260, { x: 28, y: 72 }) && !g.isGhostTap(195, 810, { x: 28, y: 72 }))
    check("with no press to remember, the whole document is guarded as before", g.isGhostTap(195, 810, null))
    const src = code("lib/navigation/swallow-ghost-taps.ts")
    check("the header and the tab bar go out of reach only while the whole document is guarded", /syncAttr\(near === null\)/.test(src))
    check("Settings hands the guard the place of the press that closed it", /const pressedAt = recentPress\(\)/.test(code("components/account/settings-subpage.tsx")) && /swallowGhostTaps\(OUT_MS \+ CLICK_ECHO_MS \+ 80, pressedAt\)/.test(code("components/account/settings-subpage.tsx")))
  }

  section("7  The system video player's class cannot outlive the player")
  {
    html.classList.add("video-fullscreen")
    videos.push({ webkitDisplayingFullscreen: true })
    clearStaleVideoFullscreen()
    check("while a video is in the system player, the class stays", html.classList.contains("video-fullscreen"))
    videos[0].webkitDisplayingFullscreen = false
    clearStaleVideoFullscreen()
    check("once none is, the next touch on the page (or route change) takes it off", !html.classList.contains("video-fullscreen"))
    check("asked on every press on the page and by the sweep", /addEventListener\("pointerdown", clearStaleVideoFullscreen/.test(read("lib/ui/layers.ts")) && /sweepLayers\(\): void \{\s*clearStaleVideoFullscreen\(\)/.test(read("lib/ui/layers.ts")))
  }

  section("The tabs, outside a community and inside one (ARCH item 7)")
  {
    const tabs = await import("../lib/nav/buyer-tabs")
    const outside = tabs.buyerTabsAt("/account/library")
    check("outside: Home, Search, Library, Profile", outside.map((t) => t.key).join() === "home,search,library,profile" && outside[2].href === "/account/library" && outside[3].href === "/account")
    const inside = tabs.buyerTabsAt("/community/clay-studio/learn")
    /* Round 16, the owner: the Profile tab inside a community is the account page again, not round 15's card (tests/account-pills16.test.ts). */
    check("inside: Home (the community), Search, Create post in Library's place, Profile (the account page, as anywhere)",
      inside.map((t) => t.key).join() === "home,search,compose,profile" && inside[0].href === "/community/clay-studio" && inside[2].label === "Create post" && inside[3].href === "/account")
    const kept = tabs.buyerTabsAt("/account", true, "clay-studio")
    /* Changed on purpose (round 26, the owner: the post icon must not turn into Library on the profile page opened from a community): your profile keeps Create post; Library's own pages are the site's. */
    const library = tabs.buyerTabsAt("/account/library", true, "clay-studio")
    check("outside with a community kept as Home: your profile keeps Create post; Library's pages are the site's", kept.map((t) => t.key).join() === "home,search,compose,profile" && kept[0].href === "/community/clay-studio" && kept[3].href === "/account" && library.map((t) => t.key).join() === "home,search,library,profile" && library[0].href === "/community/clay-studio")
    check("your own profile in the community lights Profile; every other place lights Home; Create post is never lit",
      tabs.buyerTabFor("/community/clay-studio", { profile: "me" }) === 3 && tabs.buyerTabFor("/community/clay-studio", { profile: "maria" }) === 0 && tabs.buyerTabFor("/community/clay-studio/learn") === 0)
    check("a person's profile keeps the bar (R's item 22: arriving from a community, the bar is still there), with no tab lit", tabs.buyerTabsBelongOn("/u/maria") && tabs.buyerTabFor("/u/maria") === -1 && !tabs.buyerTabsBelongOn("/u/maria/edit"))
    const bar = code("components/nav/buyer-tab-bar.tsx")
    check("Create post asks the composer on screen, and when there is none brings back the feed, whose composer takes the request",
      /if \(tab\.key === "compose" && community\) \{\s*if \(requestCompose\(\)\) return\s*if \(navHere\) navHere\.go\(\{ kind: "feed" \}, \{ scroll: "keep" \}\)/.test(bar))
    check("Home inside a community moves through the community's navigator, never a server page; Profile is the account page (round 16)",
      /if \(navHere && signedIn && tab\.key === "home"\) \{\s*navHere\.go\(\{ kind: "feed" \}\)/.test(bar) && !/kind: "profile", ref: "me"/.test(bar) && /const nav = useNavigatorOutsideCommunity\(\)/.test(bar))
    check("nothing is fetched ahead for Search, Create post, or the navigator's feed; the account page is", /tab\.key === "search" \|\| tab\.key === "compose" \|\| i === current \|\| \(navHere && tab\.key === "home"\)/.test(bar))
    /* Round 18 (the owner: "a calmer, cleaner swap"): still one slot on opacity and scale only, but one glyph after the other, never both at once (tests/nav18.test.ts). */
    check("the switch is calm: Library and Create post are one slot (one key), the two glyphs change on opacity and scale only",
      /key=\{tab\.key === "compose" \? "library" : tab\.key\}/.test(bar) && /opacity: here \? 1 : 0,/.test(bar) && !/scale: here/.test(bar))
    check("a tab between the community and the account swaps in one piece only when the address really crosses", /const crosses = !!communityOf\(href\) !== !!communityOf\(pathname\)/.test(bar))
    check("Home outside a community is Discover in the mode it was left in (no flip between products and communities)",
      tabs.discoverHomeHref("communities") === "/explore?type=communities" && tabs.discoverHomeHref(null) === "/explore"
        && tabs.discoverModeFromCookie("a=1; storelib_discover_mode=communities") === "communities" && tabs.discoverModeFromCookie("xstorelib_discover_mode=products") === null
        && /if \(tab\.key === "home" && tab\.href === "\/explore"\) return discoverHomeHref\(discoverMode\)/.test(bar))
  }

  section("The Library pill that spun for ten seconds and left you on the profile")
  {
    const { watchNavigation, arrivedAt, STUCK_MS } = await import("../lib/nav/stuck-navigation")
    /* A clock of our own: each scheduled tick runs when advanced. */
    const run = (opts: { arriveAt?: number; hiddenUntil?: number; elsewhereAt?: number }) => {
      let t = 0
      let here = "/account"
      const loads: string[] = []
      const queue: Array<{ at: number; fn: () => void; id: number }> = []
      let ids = 0
      watchNavigation("/account/library", {
        here: () => here,
        visible: () => t >= (opts.hiddenUntil ?? 0),
        load: (h) => loads.push(h),
        schedule: (fn, ms) => { const id = ++ids; queue.push({ at: t + ms, fn, id }); return id },
        unschedule: (id) => { const i = queue.findIndex((q) => q.id === id); if (i >= 0) queue.splice(i, 1) },
      })
      while (queue.length && t < 60_000) {
        queue.sort((a, b) => a.at - b.at)
        const next = queue.shift()!
        t = next.at
        if (opts.arriveAt !== undefined && t >= opts.arriveAt) here = "/account/library"
        if (opts.elsewhereAt !== undefined && t >= opts.elsewhereAt) here = "/explore"
        next.fn()
      }
      return { loads, t }
    }
    const stuck = run({})
    check(`a press that never arrives is made again as a page load of the same address after ${STUCK_MS}ms on screen, once`, stuck.loads.join() === "/account/library" && stuck.t <= STUCK_MS + 250)
    check("a press that arrives is left alone", run({ arriveAt: 1200 }).loads.length === 0)
    check("time in the background does not count (the app put away is not a stuck press)", (() => { const r = run({ hiddenUntil: 30_000 }); return r.loads.length === 1 && r.t >= 30_000 + STUCK_MS - 250 })())
    check("a move somewhere else (a redirect, another press) ends the watch", run({ elsewhereAt: 800 }).loads.length === 0)
    check("arrival is by path: a query the page adds itself is the same place", arrivedAt("/account/library", "/account/library?purchase=success") && !arrivedAt("/account/library", "/account"))
    const pills = code("components/profile/profile-owner-pills.tsx")
    check("the profile's pills decide on the lift (first tap), keep the page showing with the line only, and watch the press",
      /useFirstTap<HTMLAnchorElement>/.test(pills) && /onPointerUp=\{(tap\.onPointerUp|\(e\) => \{\s*releasePill\(e\.currentTarget\)\s*tap\.onPointerUp\(e\))/.test(pills) && /startRouteLoading\(\{ lineOnly: true \}\)\s*router\.push\(p\.href, \{ scroll: false \}\)\s*watchNavigation\(p\.href\)/.test(pills))
    check("so do the tab bar's presses and the library's own pills", /watchNavigation\(href\)/.test(code("components/nav/buyer-tab-bar.tsx")) && /watchNavigation\(tab\.href\)/.test(code("components/library/library-tabs.tsx")))
  }

  section("Settings, Preferences renders (it crashed the page)")
  {
    const layout = code("app/layout.tsx")
    const inLocale = /<LocaleProvider>[\s\S]*<SettingsSubpageHost \/>[\s\S]*<\/LocaleProvider>/.test(layout)
    check("the settings layer is mounted inside LocaleProvider, whose locale its Preferences tab reads", inLocale && (layout.match(/<SettingsSubpageHost \/>/g) ?? []).length === 1)
    ;(globalThis as unknown as { React: typeof React }).React = React
    /* The server's render, as the page's first HTML: no document. */
    delete (globalThis as unknown as { document?: unknown }).document
    const { renderToString } = await import("react-dom/server")
    const { AccountSettings } = await import("../components/account/account-settings")
    const { LocaleProvider } = await import("../components/locale-provider")
    const { AppRouterContext } = await import("next/dist/shared/lib/app-router-context.shared-runtime.js")
    const router = { push() {}, replace() {}, refresh() {}, prefetch() {}, back() {}, forward() {} }
    const props = { userId: "u1", email: "ana@example.com", name: "Ana", bio: "", bioSupported: true, avatarUrl: null, createdAt: "2026-01-01T00:00:00Z", hasPassword: true, via: "", isSeller: false, newsletter: false, personalized: true, initialSection: "preferences" as const }
    const tree = (withLocale: boolean) => {
      const settings = React.createElement(AccountSettings, props)
      return React.createElement(AppRouterContext.Provider, { value: router as never }, withLocale ? React.createElement(LocaleProvider, null, settings) : settings)
    }
    let outside = ""
    try { renderToString(tree(false)) } catch (e) { outside = (e as Error).message }
    check("outside the locale, as it was mounted, the Preferences tab throws the error that took the page down", /useLocale must be used within LocaleProvider/.test(outside), outside)
    let html2 = ""
    let threw = ""
    try { html2 = renderToString(tree(true)) } catch (e) { threw = (e as Error).message }
    check("inside it, as it is mounted now, the Preferences tab renders: language, newsletter, recommendations, sounds",
      !threw && /data-account-card="preferences"/.test(html2) && /Storelib newsletter/.test(html2) && /Recommendations for you/.test(html2) && /data-account-language-open/.test(html2), threw)
  }

  section("Copy")
  {
    /* A CSS property name the platform chose is not copy (the bar moves on one); every other use of the word, and every other word, is checked. */
    const files = ["lib/ui/layers.ts", "lib/nav/stuck-navigation.ts", "lib/nav/buyer-tabs.ts", "components/nav/buyer-tab-bar.tsx", "lib/navigation/swallow-ghost-taps.ts", "components/profile/profile-owner-pills.tsx"]
    const banned = new RegExp(`\\b(${["un" + "lock", "ele" + "vate", "seam" + "less", "power" + "ful", "effort" + "less", "super" + "charge"].join("|")})`, "i")
    for (const f of files) {
      const text = read(f)
      check(`${f}: no em dash, none of the banned words`, !text.includes("\u2014") && !banned.test(text) && !/\btransform(s|ed|ing|ation)?\b(?![:"'`,]|\s+0s|\s*\})/i.test(text.replace(/willChange: "[^"]*"/g, "")))
    }
  }

  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
