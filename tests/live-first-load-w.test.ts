/**
 * ===========================================================================
 *  ROUND W1: AN IMPORTED THEME'S LIVE PAGE ON A FIRST VISIT
 * ===========================================================================
 * The owner: "when I go to a live website, it takes too much to load
 * initially, and too much time loading in between pages". Measured on the
 * live sites with a throttled phone (scripts/check-live-first-load.mjs), an
 * imported theme's page was answered in 0.4s and then kept the main thread
 * busy for six to fourteen seconds. Held here:
 *
 *   CDN        a stranger's page was stored by Vercel's CDN; now only by the
 *              hold, which a Publish clears: no Set-Cookie on a shared
 *              answer, the page opened as a document held apart from a
 *              script's fetch of the same address
 *   FIRST DRAW the body's CSS gathered at the end of the head in its own
 *              order (lib/storelib-theme/compat/first-load.ts), never what
 *              is inside a script, a template, a noscript or an SVG; nothing
 *              moved past a style a script may look up by id
 *   FLAGS      the country selector's 250 flag pictures load when seen
 *   NO REACT   the imported theme's page is a route handler's plain HTML, not
 *              a React page hydrated in the browser
 *   LINKS      the next page is fetched ahead, never prerendered
 *
 * Run with:  npx tsx tests/live-first-load-w.test.ts
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { FLAG_SRC_PREFIX, openedAsDocument, readierFirstLoad } from "../lib/storelib-theme/compat/first-load"
import { flagImage } from "../lib/storelib-theme/compat/objects"
import { PUBLIC_PAGE_CACHE, SHAREABLE_HEADER, publicAnswer } from "../lib/storelib-theme/compat/anonymous-cache"
import { SITE_PREFETCH_RULES } from "../lib/website-builder/prefetch-rules"

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

/** Every style block and stylesheet link outside scripts, in document order: the cascade's own order. */
function cssInOrder(html: string): string[] {
  const noScripts = html.replace(/<script\b[\s\S]*?<\/script>/gi, "")
  return [...noScripts.matchAll(/<style\b[\s\S]*?<\/style>|<link\b[^>]*rel="stylesheet"[^>]*>/gi)].map((m) => m[0]).filter((c) => c !== "<style></style>")
}
const headOf = (html: string) => html.slice(0, html.search(/<body\b/i))
const bodyOf = (html: string) => html.slice(html.search(/<body\b/i))

function cdn() {
  section("A stranger's page is drawn once for every stranger, and kept by no CDN (a Publish cannot reach a CDN copy: tests/publish-shows-new-release.test.ts)")
  check("the browser is told what any page of the theme says, and no shared cache keeps it", PUBLIC_PAGE_CACHE === "private, no-cache" && !/s-maxage|public/.test(PUBLIC_PAGE_CACHE), PUBLIC_PAGE_CACHE)
  check("an answer that sets a cookie is never shared", !publicAnswer({ method: "GET", status: 200, type: "text/html", cacheControl: "private, no-cache", setsCookie: true, changesCart: false }))
  check("nor one that changed the cart", !publicAnswer({ method: "GET", status: 200, type: "text/html", cacheControl: "private, no-cache", setsCookie: false, changesCart: true }))
  check("a plain page is", publicAnswer({ method: "GET", status: 200, type: "text/html; charset=utf-8", cacheControl: "private, no-cache", setsCookie: false, changesCart: false }))

  const route = code("app/api/site-theme/site/[username]/[[...path]]/route.ts")
  check("the shared answer is marked for the hold, with the theme's own header", /headers\.set\("Cache-Control", PUBLIC_PAGE_CACHE\)/.test(route) && /headers\.set\(SHAREABLE_HEADER, "1"\)/.test(route))
  check("and only shared without a Set-Cookie", /share: res\.status === 200 && res\.headers\.get\(SHAREABLE_HEADER\) === "1" && res\.headers\.get\("Cache-Control"\) === PUBLIC_PAGE_CACHE && !res\.headers\.has\("Set-Cookie"\)/.test(route))
  check("the page opened as a document is held apart from a script's fetch of it", /strangerKey\(username, path, url\.search, openedAsDocument\(req\.headers\)\)/.test(route))
  const hold = code("lib/storelib-theme/compat/stranger-hold.ts")
  check("by its own key", /asDocument \? \["document"\] : \[\]/.test(hold))
  const proxy = code("proxy.ts")
  check("the proxy's front page says the same header, private for a stranger too", /r\.headers\.set\("Cache-Control", marker \? PUBLIC_PAGE_CACHE : "private, no-cache"\)/.test(proxy))
}

function firstDraw() {
  section("The body's CSS, gathered in the head in its own order")
  const page = [
    `<!doctype html><html><head><meta charset="utf-8"><title>T</title>`,
    `<link rel="stylesheet" href="/base.css"><style>.head{color:red}</style>`,
    `<script>var s = "<style>.in-a-string{}</style>"; var l = '<link rel="stylesheet" href="/js.css">'</script>`,
    `</head><body class="b">`,
    `<div id="shopify-section-a"><style>.a{color:blue}</style><link rel="stylesheet" href="/a.css"><p class="a">A</p></div>`,
    `<template><style>.tpl{}</style></template>`,
    `<noscript><link rel="stylesheet" href="/noscript.css"></noscript>`,
    `<svg viewBox="0 0 1 1"><style>.svg-own{fill:red}</style><rect/></svg>`,
    `<script>document.write("<style>.written{}</style>")</script>`,
    `<div id="shopify-section-b"><style media="(min-width: 750px)">.b{margin:0}</style><link rel="preload" href="/f.woff2" as="font"><p class="b">B</p></div>`,
    `</body></html>`,
  ].join("")
  const r = readierFirstLoad(page)
  check("three pieces of page CSS moved", r.moved === 3, r.moved)
  check("the cascade's order is the same, piece for piece", JSON.stringify(cssInOrder(r.html).filter((c) => !/tpl|noscript|svg-own/.test(c))) === JSON.stringify(cssInOrder(page).filter((c) => !/tpl|noscript|svg-own/.test(c))), cssInOrder(r.html))
  check("all of it after the head's own CSS, before </head>", /\.head\{color:red\}<\/style>[\s\S]*<\/script><style>\.a\{color:blue\}<\/style><link rel="stylesheet" href="\/a\.css"><style media="\(min-width: 750px\)">\.b\{margin:0\}<\/style><\/head>/.test(headOf(r.html)), headOf(r.html).slice(-260))
  check("their attributes kept (a media query)", /<style media="\(min-width: 750px\)">/.test(headOf(r.html)))
  check("each moved one leaves an element that draws nothing, so a rule that counts elements (:first-child, :nth-child) matches as before", /<div id="shopify-section-a"><template data-sl-moved><\/template><link data-sl-moved><p class="a">A<\/p><\/div>/.test(r.html) && /<div id="shopify-section-b"><template data-sl-moved><\/template><link rel="preload" href="\/f\.woff2" as="font"><p class="b">B<\/p><\/div>/.test(r.html), bodyOf(r.html))
  check("and the sections' markup is otherwise untouched", bodyOf(r.html).replace(/<template data-sl-moved><\/template>|<link data-sl-moved>/g, "") === bodyOf(page).replace(/<style\b[^>]*>\.(a|b)\{[^}]*\}<\/style>|<link rel="stylesheet" href="\/a\.css">/g, ""))
  check("what a script writes is left in the script", r.html.includes(`var s = "<style>.in-a-string{}</style>"`) && r.html.includes(`document.write("<style>.written{}</style>")`) && r.html.includes(`'<link rel="stylesheet" href="/js.css">'`))
  check("a template, a noscript and an SVG keep their own", /<template><style>\.tpl\{\}<\/style><\/template>/.test(bodyOf(r.html)) && /<noscript><link rel="stylesheet" href="\/noscript\.css"><\/noscript>/.test(bodyOf(r.html)) && /<svg viewBox="0 0 1 1"><style>\.svg-own\{fill:red\}<\/style>/.test(bodyOf(r.html)))
  check("the body tag and the document's end are where they were", /<\/head><body class="b">/.test(r.html) && r.html.endsWith("</body></html>"))
  check("done twice, nothing more moves", readierFirstLoad(r.html).moved === 0 && readierFirstLoad(r.html).html === r.html)

  const withId = `<html><head></head><body><style>.one{}</style><style id="countdown-style">.two{}</style><style>.three{}</style><link rel="stylesheet" href="/four.css"></body></html>`
  const s = readierFirstLoad(withId)
  check("a style a script may find by its id stays, and nothing after it moves, so no two rules swap", s.moved === 1 && /<head><style>\.one\{\}<\/style><\/head>/.test(s.html) && /<body><template data-sl-moved><\/template><style id="countdown-style">\.two\{\}<\/style><style>\.three\{\}<\/style><link rel="stylesheet" href="\/four\.css"><\/body>/.test(s.html), s.html)
  check("a fragment with no body (a section's answer) comes back as it was", readierFirstLoad(`<div><style>.x{}</style></div>`).html === `<div><style>.x{}</style></div>`)
  check("no </head> written: gathered just before the body", /^<html><head><title>x<\/title><style>\.y\{\}<\/style><body>/.test(readierFirstLoad(`<html><head><title>x</title><body><style>.y{}</style></body></html>`).html))
  check("a > inside a quoted attribute does not end the tag", readierFirstLoad(`<html><head></head><body><div data-x="a>b"><style>.q{}</style></div></body></html>`).html === `<html><head><style>.q{}</style></head><body><div data-x="a>b"><template data-sl-moved></template></div></body></html>`)
}

function flags() {
  section("The country selector's flags load when seen")
  const us = flagImage("US")
  check("a flag is the picture first-load.ts looks for", us.startsWith(FLAG_SRC_PREFIX), us.slice(0, 120))
  check("and still the country's own emoji, drawn with no request", decodeURIComponent(us).includes(String.fromCodePoint(0x1f1fa, 0x1f1f8)) && us.startsWith("data:image/svg+xml,"))
  const page = `<html><head></head><body><ul><li><img src="${us}" alt="United States"></li><li><img loading="eager" src="${flagImage("FR")}" alt="France"></li></ul><img src="data:image/svg+xml,%3Csvg%3E%3C%2Fsvg%3E" alt="other"><img src="/hero.jpg" fetchpriority="high"><script>var t='<img src="${us}">'</script></body></html>`
  const r = readierFirstLoad(page)
  check("one flag marked lazy", r.lazyFlags === 1 && r.html.includes(`<img loading="lazy" src="${us}" alt="United States">`), r.lazyFlags)
  check("a flag the theme said how to load is left as it said", r.html.includes(`<img loading="eager" src="${flagImage("FR")}" alt="France">`))
  check("any other picture is left alone (the hero stays eager, another SVG is not a flag)", r.html.includes(`<img src="/hero.jpg" fetchpriority="high">`) && r.html.includes(`<img src="data:image/svg+xml,%3Csvg%3E%3C%2Fsvg%3E" alt="other">`))
  check("a flag written inside a script's string is not touched", r.html.includes(`var t='<img src="${us}">'`))
}

function documentOnly() {
  section("Only a page opened as a page is prepared")
  check("Sec-Fetch-Dest: document is a page", openedAsDocument(new Headers({ "sec-fetch-dest": "document" })))
  check("a script's fetch (empty), a frame, or a browser that says nothing is not", !openedAsDocument(new Headers({ "sec-fetch-dest": "empty" })) && !openedAsDocument(new Headers({ "sec-fetch-dest": "iframe" })) && !openedAsDocument(new Headers()))
  const route = code("app/api/site-theme/site/[username]/[[...path]]/route.ts")
  const block = route.slice(route.indexOf("if (html && !token && page && out.status === 200"), route.indexOf("const body = html ??"))
  check("the route prepares a live page (not a preview, not a 404, not a script's answer), and only when opened as one", /if \(openedAsDocument\(req\.headers\)\) \{\s*html = readierFirstLoad\(html\)\.html/.test(block), block.slice(0, 200))
}

function noReact() {
  section("An imported theme's page is plain HTML, not a React page")
  check("its pages are answered by a route handler (no layout, no React runtime, nothing hydrated)", existsSync(join(process.cwd(), "app/api/site-theme/site/[username]/[[...path]]/route.ts")) && !existsSync(join(process.cwd(), "app/api/site-theme/site/[username]/[[...path]]/page.tsx")))
  const proxy = code("proxy.ts")
  check("the proxy rewrites the website's addresses to that handler", /to\.pathname = `\/api\/site-theme\/site\/\$\{name\}/.test(proxy))
  const route = code("app/api/site-theme/site/[username]/[[...path]]/route.ts")
  check("which answers with the drawn text itself", /return new NextResponse\(body, \{ status: out\.status, headers \}\)/.test(route) && !/from "react"/.test(route))
}

function links() {
  section("The next page is fetched ahead, never prerendered")
  const rules = SITE_PREFETCH_RULES as unknown as Record<string, unknown>
  check("prefetch rules only: no page's scripts, pixels or analytics run for a page nobody opened", Array.isArray(rules.prefetch) && !("prerender" in rules))
  const where = JSON.stringify(SITE_PREFETCH_RULES)
  check("never the cart, checkout, account or the API", ["/cart", "/checkout", "/account", "/api/*"].every((p) => where.includes(p)))
  check("imported themes carry the same rules", /SITE_PREFETCH_RULES/.test(code("lib/storelib-theme/compat/shims.ts")))
}

cdn()
firstDraw()
flags()
documentOnly()
noReact()
links()
console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"))
  process.exit(1)
}
