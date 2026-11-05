/**
 * ===========================================================================
 *  ROUND X1: LIVE WEBSITES THAT LOAD AND MOVE FASTER
 * ===========================================================================
 * The owner: every creator's live website, imported themes and Storelib
 * built ones, and the builder itself, should load fast and move between
 * pages smoothly, the way the big website builders do it. Held here:
 *
 *   SCRIPTS     an imported theme's blocking scripts deferred in the order
 *               they would have run, app widgets and pixels the theme writes
 *               async started after load, and every case that needs the old
 *               timing left exactly as written
 *               (lib/storelib-theme/compat/script-order.ts)
 *   CSS         one copy of each stylesheet: an earlier link to a file linked
 *               again later is dropped only where the cascade cannot change
 *               (lib/storelib-theme/compat/first-load.ts)
 *   PRERENDER   on a desktop, a page that runs nobody else's scripts is
 *               prerendered from a rested link; page views and speed
 *               measurements wait until it is shown; a cart changed since is
 *               caught on arrival (lib/storelib-theme/compat/prerender.ts)
 *   BFCACHE     no script Storelib adds listens for unload
 *   FONTS       a Storelib theme set to Inter uses the app's own Inter, never
 *               a second copy from Google before the first paint
 *   NO ICON     an imported theme's page with no icon says so, so the browser
 *               never fetches /favicon.ico (a not found page whose headers
 *               preload the app's stylesheets, about 140 KB)
 *   SUB PAGES   a Storelib theme's /products and /collections/<handle> held a
 *               minute for a stranger, the ones asking for a filter, a sort
 *               or a page drawn per request at a twin route
 *               (lib/website-builder/held-list.ts)
 *
 * Run with:  npx tsx tests/live-speed-x.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { CONSENT_HOSTS, LATER_HOSTS, LATER_STARTER, LATER_TYPE, STILL_LOADING, calmerScripts, runsThirdPartyScripts, scriptHost, themeKeepsScripts } from "../lib/storelib-theme/compat/script-order"
import { onceEachStylesheet, readierFirstLoad } from "../lib/storelib-theme/compat/first-load"
import { DESKTOP_PRERENDER_RULES, PRERENDER_STARTER, withDesktopPrerender } from "../lib/storelib-theme/compat/prerender"
import { SITE_PREFETCH_RULES } from "../lib/website-builder/prefetch-rules"
import { SITE_VITALS_JS } from "../lib/perf/site-vitals-inline"
import { NAVIGATION_HEAD_SCRIPT } from "../lib/website-builder/live-navigation"
import { CATALOG_KEYS, LIST_SEGMENT, asksCatalogue, heldListPath } from "../lib/website-builder/held-list"
import { SELF_HOSTED_FAMILIES, fontStylesheetHref } from "../lib/website-builder/font-link"
import { NO_ICON, withSiteIcon } from "../lib/website-builder/site-icon"

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
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `   (${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 500)})`}`)
  }
}
const section = (t: string) => console.log(`\n${t}`)
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

/*
  THE ORDER A PAGE'S SCRIPTS RUN IN, as the HTML standard has it: while the
  page is read, each inline and each blocking external classic script in
  document order; then the deferred queue (defer and module scripts) in
  document order. Async scripts and parked app scripts run whenever, and
  are left out. Each script is named by what it runs: its address, or its
  text (an inline one moved into a data: address is decoded back), so the
  order before and after can be compared name for name.
*/
function runOrder(html: string): string[] {
  const parse: string[] = []
  const queue: string[] = []
  const noInert = html.replace(/<(template|noscript)\b[\s\S]*?<\/\1>/gi, "")
  for (const m of noInert.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = m[1]
    const type = (/\stype\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] ?? "").toLowerCase()
    if (type && type !== "module" && type !== "text/javascript") continue
    const src = /\ssrc\s*=\s*"([^"]*)"/i.exec(attrs)?.[1]
    if (/\sasync\b/i.test(attrs)) continue
    /* Storelib's own "still being read" marker (STILL_LOADING): checked on its own below. */
    if (/\sdata-storelib-loading\b/.test(attrs)) continue
    let name = src ?? `inline:${m[2].trim()}`
    const data = src?.match(/^data:text\/javascript;charset=utf-8;base64,(.*)$/)
    if (data) name = `inline:${Buffer.from(data[1], "base64").toString("utf8").trim()}`
    if (type === "module" || /\sdefer\b/i.test(attrs)) queue.push(name)
    else parse.push(name)
  }
  return [...parse, ...queue]
}
/** Scripts that block the parser: external, classic, neither async nor defer. */
const blockingCount = (html: string) => [...html.matchAll(/<script\b([^>]*)>/gi)].filter((m) => /\ssrc=/i.test(m[1]) && !/\s(?:async|defer)\b/i.test(m[1]) && !/type\s*=\s*"(?:module|application\/json|text\/storelib-later)"/i.test(m[1])).length

const page = (head: string, body: string) => `<!doctype html><html><head><meta charset="utf-8"><title>T</title>${head}</head><body>${body}</body></html>`

function deferral() {
  section("An older theme's blocking scripts are deferred in the order they would have run")
  /* The shape of a Brooklyn or Supply era theme: jQuery blocking in the head, inline settings and plugin calls in the body, the theme's own script blocking at the end. */
  const old = page(
    `<script data-storelib-head>window.Shopify={shop:"x"}</script><script src="/assets/jquery.min.js"></script><script>window.theme={strings:{addToCart:"Add"}};</script><link rel="stylesheet" href="/assets/theme.css">`,
    `<header>H</header><script>$(function(){document.body.className+=" ready"})</script><div id="shopify-section-a">A<script>(function(){var el=document.getElementById("shopify-section-a");el&&el.classList.add("on")})()</script></div><script src="/assets/vendor.js"></script><script src="/assets/theme.js" type="text/javascript"></script><script type="application/json" id="ProductJson">{"id":1}</script><script data-storelib-track>window.__slT=1</script>`,
  )
  const r = calmerScripts(old)
  check("every blocking script is deferred", r.deferred === 3 && blockingCount(r.html) === 0, { deferred: r.deferred, left: blockingCount(r.html) })
  check("the inline scripts after the first one join the same queue", r.queued === 3, r.queued)
  const before = runOrder(old).filter((n) => !n.includes("__slT") && !n.includes("window.Shopify"))
  const after = runOrder(r.html).filter((n) => !n.includes("__slT") && !n.includes("window.Shopify"))
  check("they run in exactly the order they ran before, jQuery before the inline $(…) that calls it", JSON.stringify(before) === JSON.stringify(after), { before, after })
  check("Storelib's window.Shopify, which depends on nothing, still runs first, while the page is read", runOrder(r.html)[0].includes("window.Shopify"))
  check("the page says it is still being read until DOMContentLoaded, once, just before the first script that moved, so $(fn) and readyState checks wait as they did", (r.html.match(/<script data-storelib-loading>/g) ?? []).length === 1 && r.html.includes(`<script data-storelib-loading>${STILL_LOADING}</script><script src="/assets/jquery.min.js" defer>`))
  let stillCompiles = true
  try {
    new Function(STILL_LOADING)
  } catch {
    stillCompiles = false
  }
  check("  it is valid script, gives the browser's own value back at DOMContentLoaded, and is never itself moved", stillCompiles && /DOMContentLoaded",function\(\)\{try\{delete d\.readyState\}/.test(STILL_LOADING) && /capture:true/.test(STILL_LOADING) && calmerScripts(r.html).html === r.html)
  check("  and a page where nothing moves gets none of it", !calmerScripts(page(`<script src="/a.js" defer></script>`, "")).html.includes("data-storelib-loading"))
  check("an inline script keeps its place in the page (so document.currentScript and its parent are the same)", /<div id="shopify-section-a">A<script defer src="data:text\/javascript;charset=utf-8;base64,[^"]+"><\/script><\/div>/.test(r.html), r.html.slice(r.html.indexOf("shopify-section-a"), r.html.indexOf("shopify-section-a") + 200))
  check("its attributes are kept (type stays)", /<script src="\/assets\/theme\.js" type="text\/javascript" defer><\/script>/.test(r.html))
  check("JSON a script reads is not a script and is left as it was", r.html.includes(`<script type="application/json" id="ProductJson">{"id":1}</script>`))
  check("the page's markup between the scripts is untouched", r.html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "") === old.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ""))
  check("done twice, nothing more changes", calmerScripts(r.html).html === r.html)

  /* Dawn writes every script defer: nothing to do. */
  const dawn = page(`<script src="/assets/constants.js" defer="defer"></script><script src="/assets/pubsub.js" defer="defer"></script><script src="/assets/global.js" defer="defer"></script><script>document.documentElement.className = document.documentElement.className.replace('no-js', 'js');</script>`, `<script src="/assets/details-disclosure.js" defer="defer"></script><script type="module" src="/assets/x.js"></script>`)
  const d = calmerScripts(dawn)
  check("a theme already written defer (Dawn) comes back exactly as it came", d.html === dawn && d.deferred === 0 && d.queued === 0 && d.asWritten === null)

  /* Inline scripts before the first blocking one ran first and still do. */
  const early = page(`<script>window.early=1</script><script src="/a.js"></script>`, `<script>window.late=1</script>`)
  const e = calmerScripts(early)
  check("an inline script before the first blocking one stays inline", e.html.includes("<script>window.early=1</script>") && e.queued === 1 && e.deferred === 1)
  check("async scripts are left as they are", calmerScripts(page(`<script async src="/a.js"></script>`, "")).html === page(`<script async src="/a.js"></script>`, ""))
  check("module scripts are left as they are", calmerScripts(page(`<script type="module" src="/m.js"></script>`, "")).deferred === 0)
  check("a script inside a template is not a script that runs, and is not touched", calmerScripts(page(`<script src="/a.js"></script>`, `<template><script>window.tpl=1</script></template>`)).html.includes(`<template><script>window.tpl=1</script></template>`))
  const utf = calmerScripts(page(`<script src="/a.js"></script>`, `<script>window.word="Café, ½, 漢字"</script>`))
  check("an inline script's text is carried whole, letters outside ASCII too", runOrder(utf.html).includes(`inline:window.word="Café, ½, 漢字"`), runOrder(utf.html))
}

function fallbacks() {
  section("Anything that needs the old timing is left as written")
  const base = (head: string, body = "") => page(`<script src="/assets/jquery.js"></script>${head}`, `${body}<script>$(".x")</script>`)
  const flag = calmerScripts(base("").replace("<html>", `<html data-storelib-scripts="as-written">`))
  check("the theme's own flag on <html>", flag.asWritten === "flag" && flag.deferred === 0 && blockingCount(flag.html) === 1)
  check("or as a meta tag", calmerScripts(base(`<meta name="storelib-scripts" content="as-written">`)).asWritten === "flag")
  check("themeKeepsScripts reads only the theme's head", themeKeepsScripts(`<html data-storelib-scripts="as-written"><head></head><body></body></html>`) && !themeKeepsScripts(`<html><head></head><body><p>data-storelib-scripts="as-written"</p></body></html>`))
  const written = calmerScripts(base("", `<script>document.write('<p>ad</p>')</script>`))
  check("a page that writes into itself while it is read (document.write)", written.asWritten === "document.write" && written.html === base("", `<script>document.write('<p>ad</p>')</script>`))
  check("an onload handler that calls a function a deferred script may define", calmerScripts(base("", `<img src="/a.jpg" onload="initZoom(this)">`)).asWritten === "handler")
  check("but not one that only touches the picture itself", calmerScripts(base("", `<img src="/a.jpg" onload="this.classList.add('loaded')">`)).asWritten === null)
  check("a script inside an SVG", calmerScripts(base("", `<svg><script>window.s=1</script></svg>`)).asWritten === "svg")
  const order = calmerScripts(page(`<script src="/assets/global.js" defer></script><script src="/assets/jquery.js"></script>`, `<script>$(".x")</script>`))
  check("a script already defer before one that would move: in one queue it would run first, so nothing moves", order.asWritten === "order" && order.deferred === 0 && blockingCount(order.html) === 1)
  const after = calmerScripts(page(`<script src="/assets/jquery.js"></script>`, `<script>$(".x")</script><script src="/assets/late.js" defer></script>`))
  check("one after the last that moves keeps its turn: deferring goes ahead", after.asWritten === null && after.deferred === 1 && JSON.stringify(runOrder(after.html)) === JSON.stringify(runOrder(page(`<script src="/assets/jquery.js"></script>`, `<script>$(".x")</script><script src="/assets/late.js" defer></script>`))))
  const consent = calmerScripts(page(`<script src="/assets/jquery.js"></script><script src="https://consent.cookiebot.com/uc.js" data-cbid="x"></script>`, `<script>$(".x")</script>`))
  check("a consent tool after the first blocking script: it must run before what it guards, so nothing up to it moves", consent.asWritten === "consent" && blockingCount(consent.html) === 2)
  const consentFirst = calmerScripts(page(`<script src="https://cdn.cookielaw.org/scripttemplates/otSDKStub.js"></script><script src="/assets/jquery.js"></script>`, `<script>$(".x")</script>`))
  check("a consent tool before it stays blocking and first; what follows is deferred", consentFirst.deferred === 1 && /<script src="https:\/\/cdn\.cookielaw\.org\/scripttemplates\/otSDKStub\.js"><\/script>/.test(consentFirst.html))
  check("a page without a body (a section's answer) comes back as it came", calmerScripts(`<div><script src="/a.js"></script></div>`).html === `<div><script src="/a.js"></script></div>`)
}

function later() {
  section("App widgets and pixels the theme writes start after the page")
  const p = page(
    `<script async src="https://cdn.judge.me/widget_preloader.js"></script><script async src="https://static.klaviyo.com/onsite/js/klaviyo.js?company_id=AB"></script>`,
    `<script type="text/plain" data-cookieconsent="marketing" src="https://connect.facebook.net/en_US/fbevents.js"></script><script async src="https://www.googletagmanager.com/gtag/js?id=G-1" data-storelib-tag="gtag-src"></script><script src="https://code.tidio.co/abc.js"></script><script>window.after=1</script>`,
  )
  const r = calmerScripts(p)
  check("an async reviews widget and an async popup are parked", r.later === 2 && r.html.includes(`<script async type="${LATER_TYPE}" data-storelib-later-src="https://cdn.judge.me/widget_preloader.js"></script>`), r.html.slice(0, 600))
  check("an address with a query string is carried as written", r.html.includes(`data-storelib-later-src="https://static.klaviyo.com/onsite/js/klaviyo.js?company_id=AB"`))
  check("a script a consent tool holds back (type text/plain) is never touched", r.html.includes(`<script type="text/plain" data-cookieconsent="marketing" src="https://connect.facebook.net/en_US/fbevents.js"></script>`))
  check("nor the store's own analytics Storelib adds, so page views count as before", r.html.includes(`<script async src="https://www.googletagmanager.com/gtag/js?id=G-1" data-storelib-tag="gtag-src"></script>`))
  check("a blocking app script keeps its turn (the script under it may call it) and is deferred with the rest", /<script src="https:\/\/code\.tidio\.co\/abc\.js" defer><\/script>/.test(r.html) && r.queued === 1)
  check("the starter is put once, at the end of the body", (r.html.match(/<script data-storelib-later>/g) ?? []).length === 1 && /<script data-storelib-later>[\s\S]*<\/script><\/body>/.test(r.html))
  let compiles = true
  try {
    new Function(LATER_STARTER)
  } catch {
    compiles = false
  }
  check("the starter is valid script", compiles)
  check("it starts them after load and an idle moment, or at the first tap or key", /addEventListener\("load",idle/.test(LATER_STARTER) && /requestIdleCallback/.test(LATER_STARTER) && /"pointerdown","keydown","touchstart"/.test(LATER_STARTER))
  check("never while the page is drawn ahead of a click (prerendered): only once shown", /if\(d\.prerendering\)\{d\.addEventListener\("prerenderingchange",idle/.test(LATER_STARTER))
  check("the lists name what they should", LATER_HOSTS.includes("judge.me") && LATER_HOSTS.includes("tidio.co") && LATER_HOSTS.includes("connect.facebook.net") && CONSENT_HOSTS.includes("cookiebot.com") && !LATER_HOSTS.some((h) => (CONSENT_HOSTS as readonly string[]).includes(h)))
  check("a host is read from the address, the page's own being none", scriptHost("https://cdn.judge.me/x.js") === "cdn.judge.me" && scriptHost("//code.tidio.co/a.js") === "code.tidio.co" && scriptHost("/assets/theme.js") === "")

  /* The parked script, run in a page by the starter: the same element comes back, real. */
  const parked = r.html.match(/<script\b[^>]*type="text\/storelib-later"[^>]*><\/script>/)?.[0] ?? ""
  check("parked, it is not a script the browser runs (a type it does not know)", parked.includes(`type="${LATER_TYPE}"`) && !/\ssrc=/.test(parked))
}

function thirdParty() {
  section("Which pages run anybody else's scripts")
  check("a theme's own scripts and Storelib's are not", !runsThirdPartyScripts(page(`<script data-storelib-head>(function(){var s=document.createElement("script")})()</script><script src="/assets/theme.js" defer></script>`, `<script>window.routes={cart:"/cart"}</script><script data-storelib-track>var u="https://storelib.com/x"</script>`)))
  check("an external script on another host is", runsThirdPartyScripts(page(`<script src="https://code.jquery.com/jquery.js"></script>`, "")))
  check("the store's own pixels Storelib adds are", runsThirdPartyScripts(page("", `<script data-storelib-tag="meta-pixel">!function(f){}(window)</script>`)))
  check("a parked app script is", runsThirdPartyScripts(page("", `<script type="${LATER_TYPE}" data-storelib-later-src="https://cdn.judge.me/x.js"></script>`)))
  check("an inline loader that writes a script from another host is", runsThirdPartyScripts(page("", `<script>(function(d){var s=d.createElement('script');s.src='https://widget.example.com/w.js';d.head.appendChild(s)})(document)</script>`)))
  check("a JSON block naming addresses is not", !runsThirdPartyScripts(page("", `<script type="application/ld+json">{"url":"https://instagram.com/x"}</script>`)))
}

function stylesheets() {
  section("One copy of each stylesheet")
  const twice = `<html><head><link rel="stylesheet" href="/theme.css"><link rel="stylesheet" href="/other.css"><link rel="stylesheet" href="/theme.css"></head><body></body></html>`
  const a = onceEachStylesheet(twice)
  check("the earlier of two identical links is dropped, the later kept where it is", a.dropped === 1 && a.html === `<html><head><link data-sl-moved><link rel="stylesheet" href="/other.css"><link rel="stylesheet" href="/theme.css"></head><body></body></html>`, a.html)
  const lateThenNow = `<html><head><link rel="stylesheet" href="/t.css" media="print" onload="this.media='all'"><link rel="stylesheet" href="/t.css"></head><body></body></html>`
  check("a late copy (media print, onload) before one that applies at once is dropped", onceEachStylesheet(lateThenNow).dropped === 1)
  const nowThenLate = `<html><head><link rel="stylesheet" href="/t.css"><link rel="stylesheet" href="/t.css" media="print" onload="this.media='all'"></head><body></body></html>`
  check("one that applies at once is never dropped for a later late copy (it would apply later than it did)", onceEachStylesheet(nowThenLate).dropped === 0)
  check("different media are different stylesheets", onceEachStylesheet(`<html><head><link rel="stylesheet" href="/t.css" media="(min-width: 750px)"><link rel="stylesheet" href="/t.css"></head><body></body></html>`).dropped === 0)
  check("a link with an id (a script may look it up) is kept", onceEachStylesheet(`<html><head><link rel="stylesheet" id="main" href="/t.css"><link rel="stylesheet" href="/t.css"></head><body></body></html>`).dropped === 0)
  check("a link written inside a script's string is not a link", onceEachStylesheet(`<html><head><script>var a='<link rel="stylesheet" href="/t.css">'</script><link rel="stylesheet" href="/t.css"></head><body></body></html>`).dropped === 0)
  check("nothing in the body is touched", onceEachStylesheet(`<html><head><link rel="stylesheet" href="/t.css"></head><body><link rel="stylesheet" href="/t.css"></body></html>`).dropped === 0)
  const sectionTwice = `<html><head><link rel="stylesheet" href="/base.css"></head><body><div><link rel="stylesheet" href="/banner.css"><p>1</p></div><div><link rel="stylesheet" href="/banner.css"><p>2</p></div></body></html>`
  const g = readierFirstLoad(sectionTwice)
  check("a section's stylesheet linked once for each time the section is used: gathered in the head, then once", g.moved === 2 && g.duplicates === 1 && (g.html.match(/href="\/banner\.css"/g) ?? []).length === 1, g.html)
  check("and the body's element count is what it was (each moved link left a placeholder)", (g.html.match(/<link data-sl-moved>/g) ?? []).length === 3)
}

function prerender() {
  section("On a desktop, a page that runs nobody else's scripts is prerendered")
  const rules = DESKTOP_PRERENDER_RULES as unknown as { prerender: { where: unknown; eagerness: string }[] }
  check("prerender rules, moderate: the pointer rested a moment, or a press", Array.isArray(rules.prerender) && rules.prerender.every((r) => r.eagerness === "moderate"))
  check("the same links as the prefetch: never the cart, checkout, account or the API", JSON.stringify(rules.prerender.map((r) => r.where)) === JSON.stringify(SITE_PREFETCH_RULES.prefetch.map((r) => r.where)))
  check("only on a desktop pointer, never with Data Saver or on 2G", /\(hover: hover\) and \(pointer: fine\)/.test(PRERENDER_STARTER) && /saveData/.test(PRERENDER_STARTER) && /2g/.test(PRERENDER_STARTER))
  let compiles = true
  try {
    new Function(PRERENDER_STARTER)
  } catch {
    compiles = false
  }
  check("the starter is valid script", compiles)
  check("added once, just before the body ends", /<script data-storelib-prerender>[\s\S]*<\/script><\/body><\/html>$/.test(withDesktopPrerender(page("", "<p>x</p>"))))
  const route = code("app/api/site-theme/site/[username]/[[...path]]/route.ts")
  const block = route.slice(route.indexOf("if (openedAsDocument(req.headers)) {"), route.indexOf("const body = html ??"))
  check("the live route defers scripts and adds prerender only on a page opened as a document", /calmerScripts\(html\)/.test(block) && /const ownScriptsOnly = !runsThirdPartyScripts\(html\)\n\s+if \(ownScriptsOnly\) html = withDesktopPrerender\(html\)/.test(block) /* Changed on purpose (r52): the same answer also tells the phone's starter (tests/site-root-r52.test.ts). */, block.slice(0, 300))
  check("after the store's analytics and pixels are on the page, so they count", route.indexOf("compatPageTags(") < route.indexOf("runsThirdPartyScripts(html)"))
  check("Storelib's page view waits until a prerendered page is shown", /d\.prerendering/.test(read("lib/storelib-theme/compat/track-script.ts")))
  check("its speed measurements too: a prerendered page is not a hidden one, and one never shown sends nothing", /hid=D\.visibilityState==="hidden"&&!D\.prerendering\?0:1\/0/.test(SITE_VITALS_JS) && /function send\(\)\{if\(D\.prerendering\)return;/.test(SITE_VITALS_JS))
  const shims = read("lib/storelib-theme/compat/shims.ts")
  check("a prerendered page shown after the cart changed loads itself again, as one brought back by Back does", /if\(document\.prerendering\)document\.addEventListener\("prerenderingchange",cartNow,\{once:true\}\)/.test(shims) && /if\(e\.persisted\)cartNow\(\)/.test(shims))
}

function bfcache() {
  section("Back and Forward stay instant: no script Storelib adds listens for unload")
  const sources = [LATER_STARTER, PRERENDER_STARTER, SITE_VITALS_JS, NAVIGATION_HEAD_SCRIPT, read("lib/storelib-theme/compat/shims.ts"), read("lib/storelib-theme/compat/track-script.ts"), read("lib/markets/suggest-script.ts")]
  check("none of them names unload or beforeunload", sources.every((s) => !/["'](?:before)?unload["']|onunload|onbeforeunload/.test(s)))
}

function heldSubPages() {
  section("A Storelib theme's shop and collections are held for a stranger")
  const q = (s: string) => new URLSearchParams(s)
  check("the shop with no query is the held page", heldListPath("/w/luca/products", q("")) === "/w/luca/products")
  check("a campaign tag or a click id does not change the page, so it is held too", heldListPath("/w/luca/products", q("utm_source=ig&fbclid=x")) === "/w/luca/products")
  check("a sort, a filter, a price, a search or a page goes to the twin drawn per request", ["sort=price-asc", "type=course", "opt.colour=red", "price_min=5", "available=1", "q=hat", "page=2"].every((x) => heldListPath("/w/luca/products", q(x)) === `/w/luca/products/${LIST_SEGMENT}`))
  check("a collection the same", heldListPath("/w/luca/collections/summer", q("sort=newest")) === `/w/luca/collections/summer/${LIST_SEGMENT}` && heldListPath("/w/luca/collections/summer", q("")) === "/w/luca/collections/summer")
  check("in another language too", heldListPath("/w/luca~fr/products", q("page=2")) === `/w/luca~fr/products/${LIST_SEGMENT}`)
  check("never a product, the cart, the search page or any other page", ["/w/luca/products/hat", "/w/luca/cart", "/w/luca/search", "/w/luca/about", "/w/luca"].every((p) => heldListPath(p, q("sort=x&page=2")) === p))
  check("the keys are what the catalogue reads", CATALOG_KEYS.every((k) => read("lib/products/catalog-filters.ts").includes(`"${k}"`)) && asksCatalogue(q("opt.size=m")) && !asksCatalogue(q("ref=abc")))
  const base = "app/(site)/w/[username]"
  const routes: [string, string, string][] = [
    ["products/page.tsx", "products/~list/page.tsx", "shop-page"],
    ["collections/[handle]/page.tsx", "collections/[handle]/~list/page.tsx", "collection-page"],
  ]
  for (const [held, twin, mod] of routes) {
    const h = code(`${base}/${held}`)
    const t = code(`${base}/${twin}`)
    check(`${held} is held an hour and kept per name (revalidate 3600, generateStaticParams; Changed on purpose (r54))`, /export const revalidate = 3600/.test(h) && /export function generateStaticParams\(\) \{\s*return \[\]\s*\}/.test(h) && !/searchParams|force-dynamic/.test(h), h.slice(0, 300))
    check("  and asks for nothing from the address", /asked: \{\} \}\)/.test(h))
    check(`${twin} is drawn per request with the address's filters`, /export const dynamic = "force-dynamic"/.test(t) && /searchParams/.test(t))
    check(`  both draw the one page in ${mod}.tsx`, h.includes(`from "./${mod}"`) && t.includes(`from "../${mod}"`))
    const page = code(`${base}/${held.replace("page.tsx", `${mod}.tsx`)}`)
    check("  which reads no cookie or header", !/from "next\/headers"|cookies\(\)|headers\(\)/.test(page))
  }
  const proxy = code("proxy.ts")
  check("the proxy sends both a subdomain's and a connected domain's addresses through it", (proxy.match(/heldListPath\(/g) ?? []).length === 2 && /heldListPath\([^\n]*url\.searchParams\)/.test(proxy) && /heldListPath\([^\n]*request\.nextUrl\.searchParams\)/.test(proxy))
  check("a publish or a product saved purges them with the rest of the site", /revalidatePath\(`\/w\/\$\{name\}`, "layout"\)/.test(read("lib/website-builder/published-site.ts")))
}

function noFaviconFetch() {
  section("A page with no icon asks the host for nothing")
  const bare = "<html><head><title>x</title></head><body></body></html>"
  check("an imported theme's page with no icon anywhere says so, so the browser never asks for /favicon.ico", withSiteIcon(bare, null) === `<html><head><title>x</title>${NO_ICON}</head><body></body></html>` && NO_ICON === `<link rel="icon" href="data:,">`)
  check("the site's own icon still wins", /<link rel="icon" href="\/f\.png" type="image\/png">/.test(withSiteIcon(bare, "/f.png")) && !withSiteIcon(bare, "/f.png").includes("data:,"))
  check("and a theme that draws its own keeps it", withSiteIcon(`<html><head><link rel="shortcut icon" href="/t.png"></head></html>`, null) === `<html><head><link rel="shortcut icon" href="/t.png"></head></html>`)
}

function fonts() {
  section("A Storelib theme's fonts: Inter is not asked of Google again")
  check("a theme set to Inter asks Google for nothing", fontStylesheetHref({ font_heading: "Inter", font_body: "Inter" }) === null)
  check("one with Lora and Inter asks for Lora alone", fontStylesheetHref({ font_heading: "Lora", font_body: "Inter" }) === "https://fonts.googleapis.com/css2?family=Lora:wght@400;500;600;700&display=swap")
  check("a section that picks Inter adds nothing either", fontStylesheetHref({}, ["Inter"]) === null)
  const layout = code("app/(storelib)/layout.tsx")
  check("because the app's own Inter is on every page: next/font, preloaded, swap", /const inter = Inter\(\{[^}]*subsets: \["latin"\][^}]*display: "swap"[^}]*preload: true/.test(layout) && SELF_HOSTED_FAMILIES.has("Inter"))
  check("every other offered family is still loaded from Google with swap", (fontStylesheetHref({ font_body: "Playfair Display" }) ?? "").endsWith("&display=swap"))
}

deferral()
fallbacks()
fonts()
noFaviconFetch()
later()
thirdParty()
stylesheets()
prerender()
bfcache()
heldSubPages()
console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"))
  process.exit(1)
}
