/**
 * ROUND 28: "storelib.com refused to connect" in a preview, and a slow next page.
 *
 * The browser shows that error in a frame whose response carries
 * X-Frame-Options (vercel.json: DENY on every path) and no CSP
 * frame-ancestors. So every page Storelib frames must carry frame-ancestors
 * naming Storelib's own origin, and only that; everything else keeps DENY.
 *
 *   headers      /theme-previews (the templates' websites) is framed by
 *                storelib.com only, sandboxed, its pages checked each time
 *                and its a/ files kept a year; vercel.json still denies
 *                framing everywhere else; the proxy leaves the folder alone
 *   framed 404s  the Website page's live miniature (/api/site-theme/cover/
 *                <pass>?embedded=1) answers a run out pass, a missing draft
 *                and a failed draw with the same frame rule as its page
 *                (measured live before the fix: a 404 with only DENY)
 *   staying in   the preview's copies of the theme's scripts send every page
 *                they open through the shim (scripts/theme-templates/
 *                preview-navigation.ts): /checkout, /cart, /pages/wishlist
 *                and the language picker never navigate the frame to
 *                storelib.com
 *   built files  a template built with the round 28 shim has no script that
 *                navigates the frame by itself, and its shim parses
 *   next page    the marketplace's Preview parks the page a pointer rests on
 *                (storelib:template-preview-intent) and shows it on the press
 *
 *   scripts/check-template-preview-speed.mjs measures the speed in Chromium.
 *
 *   npx tsx tests/theme-preview-framing-r28.test.ts
 */
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import vm from "node:vm"

import { CODE_TEMPLATES, templatePreviewFrame } from "../lib/themes/marketplace-shared"
import { CONTENT_SECURITY_POLICY, ENFORCED_CONTENT_SECURITY_POLICY, NATIVE_FRAME_POLICY } from "../lib/security/csp"
import { previewFilesOf } from "../lib/themes/warm-template-preview"
import { keepNavigationInPreview, keepPageNavigationInPreview, PREVIEW_INTENT_SHIM, PREVIEW_NAVIGATION_SHIM } from "../scripts/theme-templates/preview-navigation"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail).slice(0, 700)}` : ""}`)
  }
}
const read = (p: string) => readFileSync(p, "utf8")

console.log("\nheaders")
{
  const config = read("next.config.mjs")
  const block = /source: '\/theme-previews\/:path\*',\s*headers: \[([\s\S]*?)\]\s*,?\s*\}/.exec(config)?.[1] ?? ""
  check("/theme-previews: framed by storelib.com only (frame-ancestors 'self'), sandboxed with scripts only", /'Content-Security-Policy', value: "sandbox allow-scripts; frame-ancestors 'self'"/.test(block), block)
  check("  its pages are checked again each time (no stale page after a rebuild)", /'Cache-Control', value: 'public, max-age=0, must-revalidate'/.test(block))
  check("  its a/ files, named by their content, are kept a year", /source: '\/theme-previews\/:dir\/a\/:file\*',\s*headers: \[\{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' \}\]/.test(config))
  const vercel = JSON.parse(read("vercel.json")) as { headers: { source: string; has?: unknown; missing?: unknown; headers: { key: string; value: string }[] }[] }
  const deny = vercel.headers.find((h) => h.source === "/(.*)" && !h.has && !h.missing && h.headers.some((x) => x.key === "X-Frame-Options"))
  check("vercel.json: X-Frame-Options: DENY on every path still (clickjacking protection everywhere else)", deny?.headers.find((x) => x.key === "X-Frame-Options")?.value === "DENY")
  check("the proxy leaves /theme-previews to the CDN (no function per file)", /matcher: \["\/\(\(\?!_next\/static\|_next\/image\|media\/\|theme-previews\/\|/.test(read("proxy.ts")))
  const proxy = read("proxy.ts")
  const list = /const framableWhenEmbedded =([\s\S]*?)\n\s*const framed =/.exec(proxy)?.[1] ?? ""
  for (const p of ["/onepage-preview", "/checkout/preview", "/api/store/ga-check", "/cover-render/", "/theme-preview/", "/website-builder/code/", "/u/"]) check(`  the proxy lets Storelib frame ${p} when it asks (?embedded=1)`, list.includes(`"${p}"`))
  check("  and only with frame-ancestors 'self'", /const rule = url\.pathname\.startsWith\("\/cover-render\/"\) \? "sandbox allow-scripts; frame-ancestors 'self'" : "frame-ancestors 'self'"/.test(proxy))
  check("  and only when embedded=1 is asked for", /const framed = framableWhenEmbedded && url\.searchParams\.get\("embedded"\) === "1"/.test(proxy))
}

console.log("\nan origin of its own: www on storelib.com")
{
  const on = (hostname: string, port = "") => ({ hostname, host: hostname + port, protocol: "https:" })
  const www = templatePreviewFrame("/theme-previews/clothing/index.html", on("storelib.com"))
  check("on storelib.com the website is framed from www, with www's origin", www.src === "https://www.storelib.com/theme-previews/clothing/index.html" && www.sandbox === "allow-scripts allow-same-origin", www)
  for (const h of ["www.storelib.com", "localhost", "my-branch.vercel.app", "shop.example.com", "storelib.com.evil.io"]) {
    const f = templatePreviewFrame("/theme-previews/clothing/index.html", on(h))
    check(`  on ${h}: the same address, no origin (as before round 28)`, f.src === "/theme-previews/clothing/index.html" && f.sandbox === "allow-scripts", f)
  }
  check("  only the preview folder is ever given an origin", templatePreviewFrame("/app/settings", on("storelib.com")).sandbox === "allow-scripts")
  check("  and never allow-forms, popups or top navigation", !/allow-(forms|popups|top-navigation|modals)/.test(read("lib/themes/marketplace-shared.ts").slice(read("lib/themes/marketplace-shared.ts").indexOf("export function templatePreviewFrame"), read("lib/themes/marketplace-shared.ts").indexOf("export function templatePreviewFrame") + 600)))
  const config = read("next.config.mjs")
  check("next.config.mjs: on www the folder is sandboxed with www's origin and framed by storelib.com and www only", /source: '\/theme-previews\/:path\*',\s*has: \[\{ type: 'host', value: 'www\\\\\.storelib\\\\\.com' \}\],\s*headers: \[\{ key: 'Content-Security-Policy', value: "sandbox allow-scripts allow-same-origin; frame-ancestors https:\/\/storelib\.com https:\/\/www\.storelib\.com" \}\]/.test(config))
  check("  that rule comes after the general one (the last header of a key wins)", config.indexOf("has: [{ type: 'host', value: 'www\\\\.storelib\\\\.com' }]") > config.indexOf("source: '/theme-previews/:path*',"))
  for (const [name, policy] of [["the report only policy", CONTENT_SECURITY_POLICY], ["the enforced one (/app)", ENFORCED_CONTENT_SECURITY_POLICY], ["the app's frame list", NATIVE_FRAME_POLICY]] as const) check(`  ${name} lets storelib.com frame www`, /frame-src [^;]*https:\/\/www\.storelib\.com/.test(policy))
  const vercel = read("vercel.json")
  check("  vercel.json's report only copy says the same", vercel.includes(CONTENT_SECURITY_POLICY))
  check("the shim keeps storage and cookies in memory always (nothing written for www)", /\["localStorage","sessionStorage"\]\.forEach\(function\(n\)\{try\{Object\.defineProperty\(W,n,\{value:mem\(n\),configurable:true\}\)\}catch\(_\)\{\}\}\);/.test(read("scripts/build-template-previews.ts")) && /var jar="";try\{Object\.defineProperty\(D,"cookie"/.test(read("scripts/build-template-previews.ts")) && /"cookieStore",\{value:undefined/.test(read("scripts/build-template-previews.ts")))
  check("a card fetches the website's files while a pointer rests on it", /warmTemplatePreview\(listing\)/.test(read("components/website-builder/theme-template-card.tsx")) && /WARM_AFTER_MS/.test(read("components/website-builder/theme-template-card.tsx")))
  check("  the files it fetches are the page's stylesheets and scripts", JSON.stringify(previewFilesOf(`<link rel="stylesheet" href="/theme-previews/_base/a/x.1.css"><script src="/theme-previews/clothing/a/i.2.js"></script><img src="/theme-previews/clothing/a/p.webp"><a href="/theme-previews/clothing/cart.html">`)) === JSON.stringify(["/theme-previews/_base/a/x.1.css", "/theme-previews/clothing/a/i.2.js"]))
  check("  and nothing where the frame keeps no file", /if \(!frame\.sandbox\.includes\("allow-same-origin"\)\) return/.test(read("lib/themes/warm-template-preview.ts")))
}

console.log("\nframed 404s: the Website page's live miniature")
{
  const route = read("app/api/site-theme/cover/[pass]/route.ts")
  check("every answer goes through one place that adds the frame rule when embedded", /function missing\(embedded: boolean[\s\S]*?embedded \? \{ "Content-Security-Policy": FRAMED_POLICY \}/.test(route))
  check("  a pass that is not one (or ran out): framed", /if \(!installId\) return missing\(embedded\)/.test(route))
  check("  an install with no draft: framed", /if \(html === null\) return missing\(embedded\)/.test(route))
  check("  a draw that failed: framed, never a bare 500", /catch \(e\)[\s\S]{0,200}return missing\(embedded, 503\)/.test(route))
  check("  the page itself: framed by Storelib only, sandboxed", /FRAMED_POLICY = "sandbox allow-scripts; frame-ancestors 'self'"/.test(route) && /\$\{embedded \? FRAMED_POLICY : "sandbox allow-scripts"\}/.test(route))
  check("  and nothing from it is held by a shared cache", (route.match(/"Cache-Control": "private, no-store"/g) ?? []).length >= 2)
}

console.log("\nstaying in: the preview's scripts")
{
  const cases: [string, string][] = [
    [`window.location.href = "/checkout";`, `window.__slLoc.href= "/checkout";`],
    [`location.assign(url.href)`, `__slGo("assign",url.href)`],
    [`window.location.assign(root + 'checkout');`, `window.__slGo("assign",root + 'checkout');`],
    [`window.location = window.routes.cart_url;`, `window.__slLoc.href= window.routes.cart_url;`],
    [`self.location.replace("/x")`, `self.__slGo("replace","/x")`],
  ]
  for (const [i, o] of cases) check(`${i}  ->  ${o}`, keepNavigationInPreview(i) === o, keepNavigationInPreview(i))
  const same = [`if (a == location.href) x()`, `frame.contentWindow.location.assign(u)`, `location.href.replace(/a/, "b")`, `var x = location.pathname.replace(/a/,"")`, `const location = new URL(u); location.href = "x"`, `function f(location) { location.assign(1) }`]
  for (const s of same) check(`left alone: ${s}`, keepNavigationInPreview(s) === s, keepNavigationInPreview(s))
  check("a rewrite that would not parse is not made (the words in a string)", keepNavigationInPreview(`var s = "location.assign(";`) === `var s = "location.assign(";`)
  check("JSON and import maps in a page are left alone; its scripts are rewritten", keepPageNavigationInPreview(`<script type="application/json">{"a":"location.href=1"}</script><script>location.href="/cart"</script>`) === `<script type="application/json">{"a":"location.href=1"}</script><script>__slLoc.href="/cart"</script>`)

  /* The shim's half, run: a page it has opens; checkout, an account and another site stay, with the note. */
  const opened: string[] = []
  const notes: unknown[] = []
  const handed: string[] = []
  const listeners: Record<string, (e: unknown) => void> = {}
  const loc = { href: "https://storelib.com/theme-previews/clothing/index.html", host: "storelib.com", pathname: "/theme-previews/clothing/index.html", search: "", hash: "", assign: (u: string) => opened.push(u), replace: (u: string) => opened.push(`replace:${u}`) }
  const W: Record<string, unknown> = {}
  const ctx = vm.createContext({ W, D: { addEventListener: (t: string, f: (e: unknown) => void) => (listeners[t] = f) }, location: loc, URL, ROOT: "/theme-previews/", SLUG: "clothing", HAND: false, carry: (u: string) => `${u}?slc=1`, showNote: (b: unknown) => notes.push(b ?? "none"), handoff: (u: string) => (handed.push(u), true) })
  vm.runInContext(PREVIEW_NAVIGATION_SHIM(["/", "/cart", "/collections/all", "/products/boxy-tee", "/pages/wishlist"]), ctx)
  const go = W.__slGo as (how: string, u: string) => void
  const lc = W.__slLoc as { href: string }
  lc.href = "/checkout"
  check("/checkout: the frame stays, the preview note shows", opened.length === 0 && notes.length === 1, { opened, notes })
  lc.href = "/cart"
  check("/cart: the website's cart page, with what is in it", opened.at(-1) === "https://storelib.com/theme-previews/clothing/cart.html?slc=1", opened)
  go("assign", "/collections/all?sort_by=price")
  check("/collections/all?sort_by=: the collection's page, its query kept", opened.at(-1) === "https://storelib.com/theme-previews/clothing/collections/all.html?sort_by=price", opened)
  go("assign", "/collections/summer/products/boxy-tee")
  check("a product under a collection: the product's page", opened.at(-1) === "https://storelib.com/theme-previews/clothing/products/boxy-tee.html", opened)
  go("replace", "/fr/pages/about")
  check("a language the website does not have: stays, with the note", notes.length === 2 && !opened.some((o) => o.includes("/fr/")), { opened, notes })
  go("assign", "https://instagram.com/x")
  check("another site: stays (it would refuse the frame too)", notes.length === 3, notes.length)
  lc.href = "/theme-previews/other-template/index.html"
  check("another template's website: stays", notes.length === 4 && !opened.some((o) => o.includes("other-template")), opened)
  ctx.HAND = true
  go("assign", "/pages/wishlist")
  check("with the marketplace taking pages over: handed to it, not opened in place", handed.at(-1) === "/theme-previews/clothing/pages/wishlist.html", handed)
  /* A link a script made, pressed. */
  let prevented = false
  const a = { href: "https://storelib.com/checkout", getAttribute: () => "/checkout", hasAttribute: () => false }
  listeners.click({ defaultPrevented: false, button: 0, target: { closest: () => a }, preventDefault: () => (prevented = true) })
  check("a script's link to /checkout, pressed: held, with the note by it", prevented && notes.at(-1) === a)
  prevented = false
  const inSite = { href: "https://storelib.com/theme-previews/clothing/products/boxy-tee.html", getAttribute: () => "/theme-previews/clothing/products/boxy-tee.html", hasAttribute: () => false }
  listeners.click({ defaultPrevented: false, button: 0, target: { closest: () => inSite }, preventDefault: () => (prevented = true) })
  check("a link inside the website, pressed: left to the page", !prevented)
  check("the hover shim parses", (() => { try { new vm.Script(`(function(){var D,HAND,nextPage;${PREVIEW_INTENT_SHIM}})`); return true } catch { return false } })())
}

console.log("\nbuilt files")
{
  const OUT = join("public", "theme-previews")
  /* A script still holding a navigation the rewrite would change was not rewritten: the rewrite leaves nothing of its own to change. */
  const leaves = (js: string) => keepNavigationInPreview(js) !== js
  let built = 0
  const old: string[] = []
  for (const t of CODE_TEMPLATES) {
    const home = join(OUT, t.slug, "index.html")
    if (!existsSync(home)) continue
    const html = read(home)
    const shim = /<script data-template-preview>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? ""
    if (!/__slGo/.test(shim)) {
      old.push(t.slug)
      continue
    }
    built++
    check(`${t.slug}: its shim parses and holds pages a script opens`, (() => { try { new vm.Script(shim); return true } catch { return false } })() && /W\.__slLoc=/.test(shim) && /storelib:template-preview-intent/.test(shim))
    /* Every script the home page and a product page load, and their inline scripts. */
    const pages = [home, ...["products", "collections"].map((d) => join(OUT, t.slug, d)).filter(existsSync).map((d) => join(d, readdirSync(d).find((n) => n.endsWith(".html"))!))]
    const leaving: string[] = []
    for (const page of pages) {
      const markup = read(page)
      for (const m of markup.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) if (!/\bsrc=|data-template-preview/i.test(m[1]) && keepPageNavigationInPreview(m[0]) !== m[0]) leaving.push(`${page}: inline`)
      for (const m of markup.matchAll(/<script\b[^>]*\bsrc="(\/theme-previews\/[^"]+\.js)"/g)) {
        const f = join("public", m[1])
        if (existsSync(f) && leaves(read(f))) leaving.push(m[1])
      }
    }
    check(`  ${t.slug}: no script navigates the frame by itself`, leaving.length === 0, [...new Set(leaving)].slice(0, 6))
  }
  console.log(`  (${built} templates built with the round 28 shim; built before it: ${old.length ? old.join(", ") : "none"})`)
  check("at least one template is built with it", built > 0)
}

console.log("\nnext page: the marketplace's Preview")
{
  const tsx = read("app/(storelib)/app/website-builder/themes/theme-preview.tsx")
  check("a hover parks the page (drawn ahead, hidden)", /storelib:template-preview-intent/.test(tsx) && /parked: true/.test(tsx))
  check("  a parked page is never shown or counted until it is asked for", /if \(isParked\) return/.test(tsx) && /p\.key > front && !p\.parked/.test(tsx))
  check("  the press on it shows it at once when it has drawn", /if \(drawnKeys\.current\.has\(parked\.key\)\) show\(parked\.key\)/.test(tsx))
  check("  one parked at a time", /\[\.\.\.ps\.filter\(\(p\) => !p\.parked\), \{ key: k, src: href, parked: true \}\]/.test(tsx))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exit(1)
