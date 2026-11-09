/**
 * Round N (N2): a free site is headless. The host draws none of the default
 * theme's UI on an AI built ("free") site, and the site's own code gets every
 * hook it needs to build its own cart panel, search window, language list and
 * currency list.
 *
 *   1. The rule: lib/website-builder/free-site.ts hostUi, breadcrumbs, the
 *      Overlay group from home only, and ThemePage reading the rule (source).
 *   2. The hooks' pure half: names, hooksIn, results made safe, options.
 *   3. The site search: this creator's pages and posts, matched and merged;
 *      the route limited per address before any read, scoped by creator.
 *   4. The render check: a search button with a panel of its own is not
 *      dead, links inside runtime patterns are not checked as links, a panel
 *      that cannot work is named.
 *   5. What the agent is told (runtime-contract STORELIB_HOOKS and its guide).
 *   6. In a real browser (Chromium at /opt/pw-browsers/chromium): the
 *      sections drawn by the real renderer, the real hooks and providers. The
 *      own search window opened from two sections, results as text, a bad
 *      address dropped, Escape, focus kept and given back, aria-expanded,
 *      Enter to /search; the language and currency lists; an add opening the
 *      panel of another section and never the built-in drawer; the canvas;
 *      the fallback to the built-in window and drawer.
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx tests/storefront-headless-n2.test.ts
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { hostUi, isFreeSite } from "@/lib/website-builder/free-site"
import { breadcrumbsOn, withThemeBreadcrumbs } from "@/lib/website-builder/theme-breadcrumbs"
import { chromeOf, homeOnlyChrome, withUniversalChrome, applyUniversalChrome } from "@/lib/website-builder/universal-chrome"
import {
  STOREFRONT_HOOKS,
  cleanSearchHit,
  currencyOptions,
  currentLabel,
  hooksIn,
  localeOptions,
  searchPageHref,
  searchTerm,
} from "@/lib/website-builder/storefront-hooks"
import { matchPagesAndPosts, matchScore, mergeResults, searchablePages } from "@/lib/website-builder/site-search"
import { HEADLESS_HOOK_GUIDE, STORELIB_HOOKS } from "@/lib/ai-builder/runtime-contract"
import { hookProblems, patternRanges, renderCheck } from "@/lib/ai-builder/render-check"
import { renderStorelibSection } from "@/lib/website-builder/storelib-runtime"
import { claimOwnPanel, closeOwnPanel, openOwnPanel, pageHooks } from "@/components/website-builder/sections/own-panels"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

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
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 800)}`}`)
  }
}
const section = (title: string) => console.log(`\n${title}`)
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
const sec = (id: string, type = id, extra: Partial<SectionInstance> = {}) => ({ id, type, settings: {}, blocks: [], ...extra }) as unknown as SectionInstance

/* ── the site's own sections, as the agent would write them ─────────────── */

const HEADER = `<template>
<header class="top">
  <nav aria-label="Main"><a href="/">Home</a> <a href="/about">About</a></nav>
  <button type="button" class="open-search" data-storelib-search aria-label="Search">Search</button>
  <button type="button" class="bag" data-storelib-cart aria-label="Bag"><span data-storelib-cart-count></span></button>
  <span class="lang-now" data-storelib-locale-current>Language</span>
  <div class="langs" data-storelib-locale-list>
    <button type="button" data-storelib-locale-option hidden><span data-option-label></span> <small data-option-code></small></button>
  </div>
  <span class="cur-now" data-storelib-currency-current>Currency</span>
  <div class="curs" data-storelib-currency-list>
    <button type="button" data-storelib-currency-option hidden><span data-option-label></span></button>
  </div>
  <div class="search" data-storelib-search-panel aria-label="Search the site">
    <input type="search" data-storelib-search-input placeholder="{{ settings.placeholder }}" aria-label="Search words">
    <p data-storelib-search-loading hidden>Looking</p>
    <p data-storelib-search-empty hidden>Nothing found</p>
    <ul data-storelib-search-results>
      <li data-storelib-search-result hidden><a data-result-url><img data-result-image alt=""><span data-result-title></span> <span data-result-price></span> <em data-result-kind></em></a></li>
    </ul>
    <button type="button" data-storelib-search-close>Close</button>
  </div>
</header>
</template>
<style>
.search { display: none; }
.search[data-open="true"] { display: block; }
</style>
<schema>
{ "language_version": 1, "type": "ai_top", "name": "Top", "settings": [
  { "type": "text", "id": "placeholder", "label": "Search placeholder", "default": "Search the studio" }
] }
</schema>
`

const SHOP = `<template>
<section class="shop">
  <h1>Shop</h1>
  <button type="button" class="find" data-storelib-search>Find something</button>
  <ul>
    {% for block in products %}
    <li><a href="{{ block.settings.url | url }}">{{ block.settings.title }}</a>
      <button type="button" data-storelib-add-to-cart="{{ block.id }}" data-title="{{ block.settings.title }}" data-price="{{ block.settings.price }}" data-url="{{ block.settings.url }}" data-kind="{{ block.settings.kind }}">Add</button></li>
    {% endfor %}
  </ul>
</section>
</template>
<schema>
{ "language_version": 1, "type": "ai_shop", "name": "Shop", "settings": [] }
</schema>
`

const BAG = `<template>
<aside class="panel" data-storelib-cart-panel aria-label="Bag">
  <button type="button" data-storelib-cart-close>Close</button>
  <p data-storelib-cart-empty>Empty</p>
  <ul data-storelib-cart-lines><li data-storelib-cart-line hidden><a data-line-url><span data-line-title></span></a> <span data-line-qty></span></li></ul>
  <div data-storelib-cart-filled><span data-storelib-cart-subtotal></span><button type="button" data-storelib-checkout>Check out</button></div>
</aside>
</template>
<style>
.panel { display: none; }
.panel[data-open="true"] { display: block; }
</style>
<schema>
{ "language_version": 1, "type": "ai_bag", "name": "Bag", "settings": [] }
</schema>
`

const PLAIN = `<template>
<header class="plain">
  <button type="button" data-storelib-search="Search the shop">Search</button>
  <button type="button" data-storelib-cart aria-label="Bag">Bag</button>
  <button type="button" data-storelib-add-to-cart="linen-shirt" data-title="Linen shirt" data-price="$48.00" data-kind="physical">Add</button>
</header>
</template>
<schema>
{ "language_version": 1, "type": "ai_plain", "name": "Plain", "settings": [] }
</schema>
`

const SOURCES: Record<string, string> = {
  "sections/ai_top.storelib": HEADER,
  "sections/ai_shop.storelib": SHOP,
  "sections/ai_bag.storelib": BAG,
  "sections/ai_plain.storelib": PLAIN,
}
const card = (id: string, title: string, price: string, kind: string) => ({
  id,
  type: "product" as const,
  settings: { title, price, compare_price: "", currency: "USD", free: false, pay_what_you_want: false, image: `/img/${id}.jpg`, images: [], url: `/products/${id}`, slug: id, kind, available: true, tag: "", checkout_url: `/checkout/${id}`, variants: [] },
})
const PRODUCTS = [card("linen-shirt", "Linen shirt", "$48.00", "physical"), card("lookbook-pdf", "Lookbook PDF", "$12.00", "digital")]
const THEME = { site_chrome: "home" } as unknown as ThemeSettingsValues

function draw(type: string): { id: string; html: string; css: string } {
  const out = renderStorelibSection(sec(type), THEME, { template: "index" }, SOURCES, PRODUCTS as never)
  if (out.ok === false) throw new Error(`${type} did not draw: ${JSON.stringify(out.errors)}`)
  return { id: type, html: out.html, css: out.css }
}

async function main() {
  section("1. A free site: the host draws the default theme's UI only when someone asked")
  const free = { site_chrome: "home" }
  check("a site whose chrome is home's is free", isFreeSite(free) && !isFreeSite({}) && !isFreeSite(null))
  const any = hostUi({ breadcrumbs_enabled: undefined })
  check("any other site: every piece may be drawn, each still reading its own setting", Object.values(any).every((v) => v === true), any)
  const bare = hostUi(free)
  check("a free site: no announcement bar, free shipping bar, intro, breadcrumbs or language switch by default", !bare.announcementBar && !bare.freeShippingBar && !bare.introScreen && !bare.breadcrumbs && !bare.languageSwitch, bare)
  const asked = hostUi({ ...free, announcement_bar_enabled: true, free_shipping_bar: true, intro_enabled: true, breadcrumbs_enabled: true })
  check("a piece someone turned on in Theme settings stays on", asked.announcementBar && asked.freeShippingBar && asked.introScreen && asked.breadcrumbs, asked)
  check("the built-in language switch never, on a free site: its own list is the switch", !asked.languageSwitch)
  check("breadcrumbs: on unless off on other sites, off unless on on a free site", breadcrumbsOn({}) && !breadcrumbsOn(free) && breadcrumbsOn({ ...free, breadcrumbs_enabled: true }))
  const page = [sec("top", "ai_top", { group: "header" } as never), sec("body", "ai_shop")]
  check("no breadcrumbs bar is placed on a free site's page", withThemeBreadcrumbs(page, free, "page.about").length === 2 && withThemeBreadcrumbs(page, {}, "page.about").length === 3)
  const popup = sec("stale-popup", "popup", { group: "overlay" } as never)
  const home = [sec("h", "ai_top", { group: "header" } as never), sec("hero", "ai_shop")]
  const about = [sec("a", "ai_shop"), popup]
  check("a free site's page does not keep an Overlay section home does not have (a preset's popup)", !withUniversalChrome(about, chromeOf(home, { homeOnly: true })).some((s) => s.id === "stale-popup"))
  check("  nor in the editor's merge", !withUniversalChrome(about, homeOnlyChrome(chromeOf(home))).some((s) => s.id === "stale-popup"))
  check("  nor on the live site", !applyUniversalChrome({ home, about }, "home", undefined, { homeOnly: true }).about.some((s) => s.id === "stale-popup"))
  check("every other site keeps a page's own overlay as before", withUniversalChrome(about, chromeOf(home)).some((s) => s.id === "stale-popup"))
  const themePage = read("components/website-builder/theme/ThemePage.tsx")
  check("ThemePage reads the rule once (hostUi) for the bars, the intro and the switch",
    /const host = hostUi\(theme/.test(themePage) && /host\.announcementBar \? <AnnouncementBar/.test(themePage) && /host\.freeShippingBar \? <FreeShippingBar/.test(themePage) && /host\.introScreen && storefront\?\.creatorId/.test(themePage) && /host\.languageSwitch \?/.test(themePage))
  check("  and a free site keeps its links in the page's language without the switch (LanguageBehaviour)", /<LanguageBehaviour choice=\{storefront\.language\}/.test(themePage) && /export function LanguageBehaviour/.test(read("components/website-builder/theme/language-switch.tsx")))
  const layout = read("app/(site)/layout.tsx")
  check("the cookie card stays on every site (consent before analytics and pixels)", /<CookieConsentBanner \/>/.test(layout))

  section("2. The hooks: the shared names, exactly")
  const NAMES = [
    "data-storelib-search-panel", "data-storelib-search-input", "data-storelib-search-results", "data-storelib-search-result",
    "data-storelib-search-empty", "data-storelib-search-loading", "data-storelib-search-close",
    "data-storelib-locale-list", "data-storelib-locale-option", "data-storelib-locale-current",
    "data-storelib-currency-list", "data-storelib-currency-option", "data-storelib-currency-current",
  ]
  const values = new Set(Object.values(STOREFRONT_HOOKS) as string[])
  check("every round N name is a hook the page handles", NAMES.every((n) => values.has(n)), NAMES.filter((n) => !values.has(n)))
  check("and every one is in what the agent is told (STORELIB_HOOKS and the guide)", NAMES.every((n) => (Object.values(STORELIB_HOOKS) as string[]).includes(n) && HEADLESS_HOOK_GUIDE.includes(n)))
  check("the guide names the cart panel, search, locale, currency, menu, add to cart, wishlist and account", ["Cart panel", "Search panel", "Languages", "Currencies", "Menu", "Add to cart", "Wishlist", "Account"].every((w) => HEADLESS_HOOK_GUIDE.includes(w)))
  const contract = read("lib/ai-builder/runtime-contract.ts")
  check("the contract's comment lists them all", ["CART PANEL", "SEARCH PANEL", "LANGUAGE", "CURRENCY", "MENU", "ADD TO CART", "WISHLIST", "ACCOUNT"].every((w) => contract.includes(w)))
  const f = hooksIn(`<div data-storelib-search-panel><ul data-storelib-search-results></ul></div><div data-storelib-locale-list></div>`)
  check("hooksIn: a panel, a language list; no currency, no plain search opener", f.searchPanel && f.locale && !f.currency && !f.search, f)
  check("hooksIn: the current currency alone asks for the currency hooks", hooksIn(`<span data-storelib-currency-current></span>`).currency)
  check("searchTerm trims and caps; the search page is the site's own", searchTerm("  stone   mug  ") === "stone mug" && searchTerm("x".repeat(200)).length === 80 && searchPageHref("stone mug") === "/search?q=stone%20mug" && searchPageHref("") === "/search")
  check("a result with a script address is dropped", cleanSearchHit({ title: "x", url: "javascript:alert(1)" }) === null && cleanSearchHit({ title: "x", url: "//evil.example/x" }) === null)
  check("a result with no title is dropped", cleanSearchHit({ title: " ", url: "/about" }) === null && cleanSearchHit(null) === null && cleanSearchHit("x") === null)
  const hit = cleanSearchHit({ kind: "post", title: "  Mug   care ", url: "/blogs/news/mug-care", image: "data:image/svg+xml,<svg onload=alert(1)>", price: "$5" })
  check("a result is text and checked addresses: a picture that is not an address is dropped, a post has no price", !!hit && hit.title === "Mug care" && hit.image === "" && hit.price === "" && hit.kind === "post", hit)
  check("an unknown kind is a product", cleanSearchHit({ kind: "<b>", title: "Mug", url: "/products/mug", price: "$24.00" })?.kind === "product")
  const choice = { code: "fr", languages: [{ code: "en", name: "English" }, { code: "fr", name: "Français" }], currency: { options: [{ id: "home", label: "USD $" }, { id: "eu", label: "EUR €" }], current: "eu" } }
  const locs = localeOptions(choice)
  check("the languages, each in its own words, the page's own current", locs.length === 2 && locs[1].label === "Français" && locs[1].current && !locs[0].current && currentLabel(locs) === "Français", locs)
  check("the currencies likewise", currencyOptions(choice).map((o) => `${o.code}:${o.current}`).join() === "home:false,eu:true" && currentLabel(currencyOptions(choice)) === "EUR €")
  check("one language, or none set: no options (the list is hidden)", localeOptions({ code: "en", languages: [{ code: "en", name: "English" }] }).length === 0 && localeOptions(undefined).length === 0 && currencyOptions({ code: "en", languages: [] }).length === 0)

  section("2b. One panel per page, whichever section it is in (own-panels.ts)")
  const pageKey = {}
  const release = claimOwnPanel(pageKey, "search", "header")
  claimOwnPanel(pageKey, "cart", "overlay")
  check("the page knows which sections have panels of their own", pageHooks(pageKey).own.search.join() === "header" && pageHooks(pageKey).own.cart.join() === "overlay")
  const opener = { focus() {} } as unknown as HTMLElement
  check("a button in a section without one opens the page's first", openOwnPanel(pageKey, "search", "shop", opener) && pageHooks(pageKey).search === "header" && pageHooks(pageKey).opener === opener)
  closeOwnPanel(pageKey, "search")
  check("shut", pageHooks(pageKey).search === null)
  check("no panel of a kind: nothing to open (the built-in one is used)", !openOwnPanel({}, "cart", "x"))
  openOwnPanel(pageKey, "search", null)
  release()
  check("a section that goes takes its claim, and its open panel, with it", pageHooks(pageKey).own.search.length === 0 && pageHooks(pageKey).search === null)

  section("3. The site's own search: this creator's pages and posts")
  const pages = searchablePages(["home", "about", "product", "cart", "search", "studio-hours", "secret"], { page_seo: { secret: { hidden: true }, about: { title: "About the studio" } } })
  check("live pages only: no templates, no cart or search, nothing hidden from search", pages.map((p) => p.key).join() === "home,about,studio-hours", pages)
  check("named as the creator named them, at their own address", pages.find((p) => p.key === "about")?.title === "About the studio" && pages.find((p) => p.key === "about")?.url === "/about" && pages[0].url === "/", pages)
  check("matching: every word must be there; a title that starts with it first", matchScore("Stone mug", [], "mug") > 0 && matchScore("Stone mug", [], "mug cup") === 0 && matchScore("Mugs", [], "mug") > matchScore("Stone mug", [], "mug"))
  const rest = matchPagesAndPosts("studio", pages, [{ title: "Inside the studio", path: "/blogs/news/inside", excerpt: "" }, { title: "Glazes", path: "/blogs/news/glazes", tags: ["studio"] }])
  check("pages then posts, each with its kind, a title that starts with the word first", rest.map((r) => `${r.kind}:${r.title}`).join() === "page:Studio hours,page:About the studio,post:Inside the studio,post:Glazes", rest)
  const merged = mergeResults(Array.from({ length: 9 }, (_, i) => ({ kind: "product" as const, title: `P${i}`, price: "", image: "", url: `/products/p${i}` })), rest)
  check("products first and capped, then the rest, twelve at most", merged.length === 10 && merged[0].kind === "product" && merged.filter((m) => m.kind === "product").length === 6, merged.length)
  const route = read("app/api/website-builder/search/route.ts")
  check("the route is limited per address, memory first, before any database read", /bucket: "site-search", subjects: \[addressSubject\(req\)\], windows: LIMITS\.siteSearch, memoryFirst: true/.test(route) && route.indexOf("rateLimit(") < route.indexOf("createAdminClient()"))
  check("  products, pages and posts are read by this creator's id only", /\.eq\("creator_id", creatorId\)\s*\.eq\("status", "published"\)/.test(route) && /from\("store_theme_installs"\)[\s\S]*?\.eq\("creator_id", creatorId\)/.test(route) && /blogFor\(creatorId\)/.test(route))
  check("  without kinds=all the answer is the built-in window's, unchanged (products only)", /if \(!everything\)/.test(route) && /kinds"\) === "all"/.test(route))
  check("the window's own fetch asks for every kind", /kinds=all/.test(read("components/website-builder/sections/site-chrome-hooks.tsx")))

  section("4. The render check knows the hooks")
  const drawnTop = draw("ai_top")
  const ranges = patternRanges(drawnTop.html)
  check("the runtime patterns are found (a search result, a language, a currency)", ranges.length === 3, ranges)
  const pageSections = [sec("ai_top", "ai_top", { group: "header" } as never), sec("ai_shop"), sec("ai_bag", "ai_bag", { group: "overlay" } as never)]
  const result = await renderCheck({ page: "home", sections: pageSections, sources: SOURCES, theme: THEME, template: "index", products: PRODUCTS as never })
  const errors = result.issues.filter((i) => i.severity === "error")
  check("a header with search, cart, languages, currencies and its own panels checks clean: no dead button, no placeholder link", errors.length === 0, errors)
  check("  and nothing about the hooks", !result.issues.some((i) => i.code === "render.hook_incomplete"), result.issues)
  check("a search window with no input and no results list is named", hookProblems(`<div data-storelib-search-panel></div><button data-storelib-search>S</button>`, "").filter((p) => p.severity === "error").length === 2)
  check("a results list with no pattern is named", hookProblems(`<div data-storelib-search-panel><input data-storelib-search-input><ul data-storelib-search-results></ul><button data-storelib-search-close>x</button></div>`, `<button data-storelib-search>`).some((p) => /data-storelib-search-result/.test(p.message) && p.severity === "error"))
  check("a window nothing on the page opens is a warning", hookProblems(`<div data-storelib-search-panel><input data-storelib-search-input><ul data-storelib-search-results><li data-storelib-search-result hidden><a data-result-url></a></li></ul><button data-storelib-search-close>x</button></div>`, `<div data-storelib-search-panel>`).map((p) => p.severity).join() === "warning")
  check("a language or currency list with no option pattern is named", hookProblems(`<div data-storelib-locale-list></div><div data-storelib-currency-list></div>`, "").length === 2)
  const deadLink = await renderCheck({ page: "home", sections: [sec("ai_x")], sources: { "sections/ai_x.storelib": `<template>\n<nav><div data-storelib-locale-list><a href="#" data-storelib-locale-option hidden>FR</a></div> <a href="#">Broken</a></nav><h1>x</h1>\n</template>\n<schema>\n{ "language_version": 1, "type": "ai_x", "name": "X", "settings": [] }\n</schema>\n` }, theme: THEME, template: "index" })
  check("a placeholder link inside a pattern is left alone; one outside it is still an error", deadLink.issues.filter((i) => i.code === "render.placeholder").length === 1, deadLink.issues)

  section("5. In a real browser")
  await inBrowser()

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

const ORIGIN = "https://shop.example"

async function inBrowser() {
  const chrome = process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium"
  if (!existsSync(chrome)) {
    check("Chromium is here for the browser checks", false, `no browser at ${chrome}; set CHROMIUM_PATH`)
    return
  }
  const stubs = join(root, ".headless-n2-probe")
  mkdirSync(stubs, { recursive: true })
  try {
    writeFileSync(join(stubs, "navigation.js"), `const router = { push() {}, replace() {}, prefetch() {}, back() {}, refresh() {} }
export const usePathname = () => location.pathname
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(location.search)
export const redirect = () => {}
export const notFound = () => {}
`)
    writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest }, children) })
`)
    const { build } = await import("esbuild")
    await build({
      entryPoints: [join(root, "tests/_headless/probe.tsx")],
      bundle: true,
      format: "iife",
      jsx: "automatic",
      define: { "process.env.NODE_ENV": '"production"' },
      alias: { "@": ".", "next/navigation": "./.headless-n2-probe/navigation.js", "next/link": "./.headless-n2-probe/link.jsx" },
      banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
      loader: { ".css": "empty" },
      outfile: join(stubs, "app.js"),
      logLevel: "error",
      absWorkingDir: root,
      nodePaths: [join(root, "node_modules")],
    })
    const probe = { live: [draw("ai_top"), draw("ai_shop"), draw("ai_bag")], fallback: [draw("ai_plain")] }
    const js = readFileSync(join(stubs, "app.js"), "utf8")
    const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><button id="before">Before</button><div id="app"></div><script>window.__PROBE__=${JSON.stringify(probe).replace(/</g, "\\u003c")}</script><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

    const puppeteer = (await import("puppeteer-core")).default
    const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--no-sandbox"] })
    try {
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
      const open = async (hash: string) => {
        const p = await browser.newPage()
        const errors: string[] = []
        const went: string[] = []
        const asked: string[] = []
        p.on("pageerror", (e) => errors.push(String((e as Error).message || e)))
        await p.setRequestInterception(true)
        p.on("request", (r) => {
          const url = r.url()
          if (url.startsWith(`${ORIGIN}/api/website-builder/search`)) {
            asked.push(url)
            const q = new URL(url).searchParams.get("q") ?? ""
            const items = q === "zzz" ? [] : [
              { kind: "product", title: "Stone mug", price: "$24.00", image: "/img/mug.jpg", url: "/products/stone-mug" },
              { kind: "page", title: "About the studio", price: "", image: "", url: "/about" },
              { kind: "post", title: `<img src=x onerror="window.__xss=1">Mug care`, price: "", image: "", url: "/blogs/news/mug-care" },
              { kind: "product", title: "Evil", price: "$1", image: "", url: "javascript:window.__xss=2" },
            ]
            return void r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ items, total: items.length }) })
          }
          if (r.isNavigationRequest() && url !== `${ORIGIN}/` && !url.startsWith(`${ORIGIN}/#`)) {
            went.push(url)
            return void r.respond({ status: 200, contentType: "text/html", body: "<p>elsewhere</p>" })
          }
          if (url.startsWith(`${ORIGIN}/`) && r.isNavigationRequest()) return void r.respond({ status: 200, contentType: "text/html", body: html })
          return void r.respond({ status: 204, body: "" })
        })
        await p.goto(`${ORIGIN}/${hash}`, { waitUntil: "load" })
        await sleep(250)
        return { p, errors, went, asked }
      }
      const panelState = (p: import("puppeteer-core").Page) =>
        p.evaluate(() => {
          const panel = document.querySelector("[data-storelib-search-panel]")
          const active = document.activeElement
          return {
            open: panel?.getAttribute("data-open"),
            inert: panel?.hasAttribute("inert"),
            hidden: panel?.getAttribute("aria-hidden"),
            role: panel?.getAttribute("role"),
            state: panel?.getAttribute("data-state"),
            focusInPanel: !!(active && panel?.contains(active)),
            focusIsInput: !!active?.hasAttribute("data-storelib-search-input"),
            active: active?.className || active?.tagName,
            expanded: [...document.querySelectorAll("[data-storelib-search]")].map((b) => b.getAttribute("aria-expanded")),
            builtIn: !!document.querySelector('[role="dialog"][aria-label="Search"][data-popup]'),
            results: [...document.querySelectorAll("[data-storelib-search-result-item]")].map((li) => ({
              kind: li.getAttribute("data-kind"),
              title: li.querySelector("[data-result-title]")?.textContent,
              price: li.querySelector("[data-result-price]")?.textContent,
              href: li.querySelector("a[data-result-url]")?.getAttribute("href"),
              img: li.querySelector("img[data-result-image]")?.getAttribute("src") ?? null,
              tagsInTitle: li.querySelector("[data-result-title]")?.children.length,
            })),
            empty: (document.querySelector("[data-storelib-search-empty]") as HTMLElement | null)?.hidden,
            loading: (document.querySelector("[data-storelib-search-loading]") as HTMLElement | null)?.hidden,
            xss: (window as unknown as { __xss?: number }).__xss ?? 0,
          }
        })

      console.log("  (live page)")
      let { p, errors, went, asked } = await open("")
      let s = await panelState(p)
      check("the window starts shut and out of reach, as a dialog", s.open === "false" && s.inert === true && s.hidden === "true" && s.role === "dialog", s)
      await p.click("[data-storelib-search].open-search")
      await sleep(200)
      s = await panelState(p)
      check("SEARCH: the site's own opener opens the site's own window, never the built-in one", s.open === "true" && s.inert === false && !s.builtIn, s)
      check("focus goes to its input", s.focusIsInput, s.active)
      check("every opener on the page says it is expanded", s.expanded.every((e) => e === "true"), s.expanded)
      await p.type("[data-storelib-search-input]", "mug")
      await sleep(80)
      const mid = await panelState(p)
      check("while the answer is on its way: loading shown", mid.state === "loading" && mid.loading === false, mid)
      await sleep(450)
      s = await panelState(p)
      check("RESULTS: copied from the section's pattern, in order, each with its kind", s.state === "results" && s.results.map((r) => `${r.kind}:${r.title}`).join("|") === `product:Stone mug|page:About the studio|post:<img src=x onerror="window.__xss=1">Mug care`, s.results)
      check("  every value is text: the markup in a title stays words", s.results.every((r) => r.tagsInTitle === 0) && s.xss === 0, s.results)
      check("  a result with a script address is never drawn", !s.results.some((r) => /javascript/i.test(String(r.href))), s.results)
      check("  links and pictures are the site's own addresses; a product has its price", s.results[0].href === "/products/stone-mug" && s.results[0].img === "/img/mug.jpg" && s.results[0].price === "$24.00" && s.results[1].href === "/about" && s.results[1].price === "", s.results)
      check("  asked of this creator's search, for every kind", asked.length >= 1 && asked.every((u) => /creator=11111111-1111-4111-8111-111111111111/.test(u) && /kinds=all/.test(u)) && asked.some((u) => /q=mug/.test(u)), asked)
      for (let i = 0; i < 12; i++) await p.keyboard.press("Tab")
      s = await panelState(p)
      check("FOCUS: Tab goes round inside the open window", s.focusInPanel, s.active)
      await p.keyboard.press("Escape")
      await sleep(150)
      s = await panelState(p)
      check("ESCAPE shuts it", s.open === "false" && s.inert === true, s)
      check("  focus goes back to the button that opened it", s.active === "open-search", s.active)
      check("  and every opener says it is collapsed", s.expanded.every((e) => e === "false"), s.expanded)
      check("  its words are forgotten", (await p.$eval("[data-storelib-search-input]", (el) => (el as HTMLInputElement).value)) === "" && s.results.length === 0)

      await p.click("button.find")
      await sleep(200)
      s = await panelState(p)
      check("A BUTTON IN ANOTHER SECTION opens the same window", s.open === "true" && !s.builtIn, s)
      await p.type("[data-storelib-search-input]", "zzz")
      await sleep(500)
      s = await panelState(p)
      check("nothing found: the empty state shows", s.state === "empty" && s.empty === false && s.results.length === 0, s)
      await p.click("[data-storelib-search-close]")
      await sleep(150)
      s = await panelState(p)
      check("the close button shuts it and gives focus back", s.open === "false" && s.active === "find", s)

      const lists = await p.evaluate(() => ({
        langs: [...document.querySelectorAll('[data-storelib-option-item="locale"]')].map((b) => ({ label: b.querySelector("[data-option-label]")?.textContent, code: b.getAttribute("data-option-code"), codeText: b.querySelector("[data-option-code]")?.textContent, current: b.getAttribute("aria-current"), lang: b.getAttribute("lang") })),
        curs: [...document.querySelectorAll('[data-storelib-option-item="currency"]')].map((b) => ({ label: b.querySelector("[data-option-label]")?.textContent, current: b.getAttribute("aria-current") })),
        langNow: document.querySelector("[data-storelib-locale-current]")?.textContent,
        curNow: document.querySelector("[data-storelib-currency-current]")?.textContent,
        listHidden: (document.querySelector("[data-storelib-locale-list]") as HTMLElement).hidden,
        patternHidden: (document.querySelector("[data-storelib-locale-option]") as HTMLElement).hidden,
      }))
      check("LANGUAGES: one copy per language, in its own words, the page's own current", lists.langs.length === 2 && lists.langs[1].label === "Français" && lists.langs[1].code === "fr" && lists.langs[1].codeText === "FR" && lists.langs[1].lang === "fr" && lists.langs[0].current === "true" && lists.langs[1].current === null && lists.patternHidden && !lists.listHidden, lists)
      check("CURRENCIES likewise, and the current ones written as text", lists.curs.map((c) => `${c.label}:${c.current}`).join() === "USD $:true,EUR €:null" && lists.langNow === "English" && lists.curNow === "USD $", lists)

      await p.click('[data-storelib-add-to-cart="linen-shirt"]')
      await sleep(200)
      const bag = await p.evaluate(() => ({
        open: document.querySelector("[data-storelib-cart-panel]")?.getAttribute("data-open"),
        lines: [...document.querySelectorAll("[data-storelib-cart-line-item] [data-line-title]")].map((x) => x.textContent),
        builtIn: !!document.querySelector('[role="dialog"][aria-label="Cart"]:not([data-storelib-cart-panel])'),
        count: document.querySelector("[data-storelib-cart-count]")?.textContent,
        expanded: document.querySelector("[data-storelib-cart]")?.getAttribute("aria-expanded"),
      }))
      check("CART: an add in the shop section opens the bag panel of another section, never the built-in drawer", bag.open === "true" && bag.lines.join() === "Linen shirt" && !bag.builtIn, bag)
      check("  the header's bag says so and counts it", bag.expanded === "true" && bag.count === "1", bag)
      await p.keyboard.press("Escape")
      await sleep(100)
      await p.click("[data-storelib-cart]")
      await sleep(150)
      check("  the header's bag opens the other section's panel too", (await p.evaluate(() => document.querySelector("[data-storelib-cart-panel]")?.getAttribute("data-open"))) === "true")
      await p.click("[data-storelib-cart-close]")
      await sleep(100)

      await p.click("button.open-search")
      await sleep(150)
      await p.type("[data-storelib-search-input]", "stone mug")
      await Promise.all([p.waitForNavigation({ timeout: 4000 }).catch(() => null), p.keyboard.press("Enter")])
      await sleep(150)
      check("ENTER opens the search page for the words", went.some((u) => u === `${ORIGIN}/search?q=stone%20mug`), went)
      check("no page errors", errors.length === 0, errors)
      await p.close()

      ;({ p, errors, went } = await open(""))
      await Promise.all([p.waitForNavigation({ timeout: 4000 }).catch(() => null), p.evaluate(() => (document.querySelectorAll('[data-storelib-option-item="locale"]')[1] as HTMLElement).click())])
      await sleep(150)
      check("a language pressed opens the same page in it", went.some((u) => u === `${ORIGIN}/fr`), went)
      await p.close()
      ;({ p, errors, went } = await open(""))
      await Promise.all([p.waitForNavigation({ timeout: 4000 }).catch(() => null), p.evaluate(() => (document.querySelectorAll('[data-storelib-option-item="currency"]')[1] as HTMLElement).click())])
      await sleep(150)
      const cookies = await p.cookies(ORIGIN)
      check("a currency pressed keeps the visitor's market (the country cookie) and draws the page again", cookies.some((c) => c.name === "sl_country" && /FR/i.test(c.value)), cookies.map((c) => `${c.name}=${c.value}`))
      await p.close()

      console.log("  (the builder's canvas)")
      ;({ p, errors, asked } = await open("#canvas"))
      await p.evaluate(() => (document.querySelectorAll('[data-storelib-option-item="locale"]')[1] as HTMLElement).click())
      await p.evaluate(() => (document.querySelectorAll('[data-storelib-option-item="currency"]')[1] as HTMLElement).click())
      await p.click("button.open-search")
      await sleep(150)
      s = await panelState(p)
      check("CANVAS: the window opens and its input takes the keyboard", s.open === "true" && s.focusIsInput, s)
      await p.type("[data-storelib-search-input]", "mug")
      await sleep(500)
      s = await panelState(p)
      check("  results come from the install's search", s.results.length === 3 && asked.every((u) => /install=33333333/.test(u)), asked)
      await p.click("[data-storelib-search-result-item] a")
      await sleep(100)
      await p.click("button.open-search")
      await sleep(150)
      await p.type("[data-storelib-search-input]", "glaze")
      await p.keyboard.press("Enter")
      await sleep(100)
      const preview = await p.evaluate(() => (window as unknown as { __preview: string[] }).__preview)
      check("  a language or currency changes the preview, never the address", preview.includes("language:fr") && preview.includes("currency:eu"), preview)
      check("  a result and Enter open the page in the canvas", preview.includes("navigate:/products/stone-mug") && preview.includes("navigate:/search?q=glaze"), preview)
      check("  no page errors", errors.length === 0, errors)
      await p.close()

      console.log("  (a plain opener, no panel of its own)")
      ;({ p, errors } = await open("#fallback"))
      await p.click("[data-storelib-search]")
      await sleep(400)
      const fb = await p.evaluate(() => ({ search: !!document.querySelector('[role="dialog"][aria-label="Search"][data-popup]'), placeholder: document.querySelector('[role="dialog"][aria-label="Search"] input')?.getAttribute("placeholder") }))
      check("FALLBACK: a plain search button still opens the built-in window", fb.search && fb.placeholder === "Search the shop", fb)
      await p.keyboard.press("Escape")
      await sleep(300)
      await p.click("[data-storelib-add-to-cart]")
      await sleep(400)
      const fbCart = await p.evaluate(() => !!document.querySelector('[role="dialog"][aria-label="Cart"]'))
      check("  and a plain add or bag the built-in drawer, so nothing is dead", fbCart)
      check("  no page errors", errors.length === 0, errors)
      await p.close()
    } finally {
      await browser.close()
    }
  } finally {
    rmSync(stubs, { recursive: true, force: true })
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
