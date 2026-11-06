/**
 * ===========================================================================
 *  ROUND 12: LIVE WEBSITES (SITEPERF)
 * ===========================================================================
 *   npx tsx tests/site-perf-r12.test.ts
 *
 * 1. A made up server action posted at a website's page is refused by the
 *    proxy (production: "Invariant: Expected RSC response, got text/plain"
 *    and "Failed to load static file for page: /500" on /w/[username].rsc,
 *    from scanners posting Next-Action "cachefn" / "r2s").
 * 2. A Publish is followed by its own pages being drawn (warmAfterPublish),
 *    so the first visitor after it is not the one who waits.
 * scripts/check-site-perf-r12.mjs measures load and navigation in a browser.
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { refusesSiteAction } from "../lib/website-builder/site-action-guard"
import { Suspense, createElement } from "react"
import { renderToReadableStream } from "react-dom/server"
import { lazySection } from "../components/website-builder/sections/lazy-section"
import { STREAMED_SECTIONS_CSS } from "../lib/website-builder/streamed-sections"
import { publishWarmList, warmAfterPublish, warmListOf, PUBLISH_WARM_PAGES } from "../lib/website-builder/warm-sites"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail)}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

function filesUnder(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(process.cwd(), dir))) {
    const p = join(dir, name)
    if (statSync(join(process.cwd(), p)).isDirectory()) filesUnder(p, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}

;(async () => {
  console.log("\nA server action posted at a website\n")
  const h = (o: Record<string, string>) => new Headers(o)
  check("a POST with Next-Action is refused", refusesSiteAction("POST", h({ "next-action": "cachefn" })))
  check("  whatever the case of the method", refusesSiteAction("post", h({ "Next-Action": "r2s" })))
  check("a GET with the header is a page", !refusesSiteAction("GET", h({ "next-action": "x" })))
  check("a plain POST (a form to /cart, an imported theme's /cart/add) is not refused", !refusesSiteAction("POST", h({ "content-type": "application/x-www-form-urlencoded" })))

  const proxy = read("proxy.ts")
  const guards = proxy.match(/if \((?:builtSite && )?refusesSiteAction\(request\.method, request\.headers\)\) return new NextResponse\(null, \{ status: 404/g) ?? []
  check("the proxy refuses it on a subdomain and on a connected domain", guards.length === 2, guards.length)
  const sub = proxy.indexOf("if (refusesSiteAction(")
  check("  on the subdomain before any of the site's questions are asked", sub > proxy.indexOf("if (bareHost.endsWith(`.${SITES_DOMAIN}`)) {") && sub < proxy.indexOf("const gateAsked = startSiteQuestions("))
  const dom = proxy.indexOf("if (builtSite && refusesSiteAction(")
  check("  on a connected domain, once it is known to be a built website", dom > proxy.indexOf("const builtSite = !looksLikeFile") && dom < proxy.indexOf("} else if (builtSite) {"))

  /* The guard is only right while no page of a website takes a server action. */
  const siteFiles = [...filesUnder("app/(site)"), ...filesUnder("components/website-builder/theme"), ...filesUnder("components/website-builder/sections")]
  const withActions = siteFiles.filter((f) => /^\s*["']use server["']/m.test(read(f)))
  check("no file of a website's pages says \"use server\"", siteFiles.length > 20 && withActions.length === 0, withActions)

  console.log("\nA lazily fetched section is written in place on the server\n")
  /* A renderer whose file takes a moment to load, as on a server's first page after it starts. */
  const Slow = lazySection(() => new Promise((r) => setTimeout(() => r(((p: { section: { id: string } }) => createElement("section", { id: p.section.id }, "Why choose us")) as never), 30)))
  const page = createElement("main", null, createElement("h1", null, "Hero"), createElement(Slow as never, { section: { id: "s2" } } as never), createElement("footer", null, "Footer"))
  const html = await new Response(await renderToReadableStream(page)).text()
  check("the section is in the page, before the footer", html.indexOf('<section id="s2">') > 0 && html.indexOf('<section id="s2">') < html.indexOf("<footer>"), html.slice(0, 300))
  check("  not sent after it to be moved in by a script (the 0.5 layout shift)", !/hidden id="S:/.test(html) && !/\$RC/.test(html), html.slice(0, 600))
  check("  inside its own boundary, so the browser can still wait for the file", /<!--\$-->\s*<section id="s2">/.test(html), html.slice(0, 300))
  const lazySrc = read("components/website-builder/sections/lazy-section.tsx")
  check("only the server waits; the browser keeps fetching the file when a page draws it", /if \(typeof window === "undefined" && !loaded\) use\(settled\(\)\)/.test(lazySrc))

  console.log("\nA finished section React writes out of place does not move the page\n")
  /* React 19.2 outlines a finished boundary once the shell passes ~12KB (progressiveChunkSize). */
  const longShell = createElement("main", null, createElement("style", null, "x".repeat(14000)), createElement(Suspense, { fallback: null }, createElement("section", null, "y".repeat(800))), createElement("footer", null, "F"))
  const outlined = await new Response(await renderToReadableStream(longShell)).text()
  check("React does write it out of place after a long shell (why the rule exists)", /hidden id="S:/.test(outlined) && /<template id="B:0">/.test(outlined))
  /* With a 3 second safety net (added after review): a section that never arrives cannot keep the rest of the page hidden. */
  check("while its place is an empty template, what follows it is not shown, for at most 3 seconds", STREAMED_SECTIONS_CSS === '@keyframes sl-streamed-reveal{to{visibility:visible}}@media (scripting: enabled){[id^="section-"]:has(> template[id^="B:"]) ~ *{visibility:hidden;animation:sl-streamed-reveal 0s 3s forwards}}')
  const siteLayout = read("app/(site)/layout.tsx")
  check("  on every page of a website, before its sections", /<style data-storelib-streamed dangerouslySetInnerHTML=\{\{ __html: STREAMED_SECTIONS_CSS \}\} \/>/.test(siteLayout) && siteLayout.indexOf("data-storelib-streamed") < siteLayout.indexOf("{children}"))
  check("  each section's place has the id the rule reads", /wrapperId=\{`section-\$\{section\.id\}`\}/.test(read("components/website-builder/theme/ThemePage.tsx")))

  console.log("\nA Publish draws its own pages\n")
  const site = "https://shop.storelib.com"
  const addresses = [`${site}/`, `${site}/about`, ...Array.from({ length: 40 }, (_, i) => `${site}/products/p${i}`), `${site}/contact`, `${site}/collections/all`]
  const list = publishWarmList(addresses)
  check("the front page first", list[0] === `${site}/`)
  check("the shop next, though the sitemap does not list it", list[1] === `${site}/products`)
  check("every page of the site before any product", list.indexOf(`${site}/contact`) < list.indexOf(`${site}/products/p0`) && list.includes(`${site}/collections/all`))
  check("a few products, never the whole catalogue", list.filter((u) => /\/products\/p/.test(u)).length === 8)
  check(`never more than ${PUBLISH_WARM_PAGES} addresses`, publishWarmList(Array.from({ length: 80 }, (_, i) => `${site}/page-${i}`)).length === PUBLISH_WARM_PAGES)
  check("a shop already listed is not asked twice", publishWarmList([`${site}/`, `${site}/products`]).filter((u) => u.endsWith("/products")).length === 1)
  check("nothing to draw for a site with no addresses", publishWarmList([]).length === 0)

  const asked: string[] = []
  const fetcher = (async (url: string) => {
    asked.push(url)
    return new Response("<html></html>", { headers: { "x-vercel-cache": url.endsWith("/") ? "HIT" : "MISS" } })
  }) as unknown as typeof fetch
  const done = await warmAfterPublish("creator-1", { fetcher, addresses: async () => [`${site}/`, `${site}/about`] })
  check("each address is asked for as a visitor would", asked.length === 3 && asked.includes(`${site}/about`), asked)
  check("  and counted", done.held === 1 && done.drawn === 2 && done.failed === 0, done)
  const broken = await warmAfterPublish("creator-1", { fetcher, addresses: async () => { throw new Error("database") } })
  check("a failed read of the addresses is only a page left for the next visitor", broken.drawn === 0 && broken.failed === 0)

  /* Changed on purpose (r55): the warm after a deploy no longer reads a site's sitemap or its other pages; only the front page of a site visited this week, and /products where it is used (tests/realtime-warm-r55.test.ts counts it). A Publish still draws every page of its site, above. */
  console.log("\nAfter a deploy, the front page, and the shop where it is used\n")
  check("the front page alone, or with /products", warmListOf({ origin: site, products: false }).join() === `${site}/` && warmListOf({ origin: site, products: true }).join() === `${site}/,${site}/products`)

  const publish = read("app/api/website-builder/themes/[installId]/publish/route.ts")
  const release = publish.indexOf("const kept = await recordRelease(admin, { installId, creatorId })")
  const warm = publish.indexOf("await warmAfterPublish(creatorId)")
  check("the publish route draws the pages after the release is recorded, after the answer", release > 0 && warm > release && publish.lastIndexOf("after(async () => {", warm) < warm && publish.lastIndexOf("after(async () => {", warm) > publish.indexOf("await revalidatePublishedSite(creator.id)"))

  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed) process.exit(1)
})()
