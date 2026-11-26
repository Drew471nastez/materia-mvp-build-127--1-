/**
 * ===========================================================================
 *  ROUND 66: THE BUILDER'S CANVAS STAYS THE PAGE BEING EDITED
 * ===========================================================================
 * The owner: "In the website builder editor I sometimes, by any
 * combinations, get 'storelib.com refused to connect'. It needs to be very
 * stable." And: "in the Night shop template, when I adjust the night sky
 * (star size, how many stars, twinkling stars, or anything), it bugs the
 * whole template and view."
 *
 *   NIGHT SKY      a section drawn again runs its own inline scripts again,
 *                  as Shopify's editor does (canvas-bridge.ts runScripts),
 *                  in a block and caught, after what their last run added
 *                  to window and document is taken off (CANVAS_SCRIPT_OWN);
 *                  the sky's copy still inside its section is never shown.
 *   REFUSED        a frame going elsewhere is hidden as it goes (unloading,
 *                  and its second load), window.open into the frame and a
 *                  detached link's click are opened as the builder opens a
 *                  link, a link written in full on the website's own host
 *                  is that page in the canvas, another website opens in a
 *                  new tab, the code pane answers a page that refused its
 *                  frame with Try again, and signed out in a frame the
 *                  builder's layout says so instead of sending the frame to
 *                  /login (which refuses to be framed).
 *   HEADERS        nothing framing-related was loosened: vercel.json's
 *                  X-Frame-Options DENY and the proxy's embedded list stand.
 *
 * Browser halves, measured in Chromium:
 *   scripts/probe-sky-r66.ts                the real editor on Night shop, the sky's settings changed
 *   scripts/probe-nav-r66.ts                every way out of the frame, with the frame's answer refused
 *   scripts/check-template-settings-r66.ts  every Materia template's sections at their settings' ends
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { externalHref, frameIsOurs, ownSitePath } from "@/lib/website-builder/canvas-links"
import { CANVAS_HEAD, CANVAS_SCRIPT_OWN } from "@/lib/storelib-theme/compat/canvas-bridge"

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
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`)
  }
}
const code = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const bridge = code("lib/storelib-theme/compat/canvas-bridge.ts")
const canvas = code("components/website-builder/compat/compat-canvas.tsx")
const editor = code("app/(storelib)/website-builder/editor/[installId]/page.tsx")
const pane = code("components/website-builder/preview-mode-switch.tsx")
const layout = code("app/(storelib)/website-builder/layout.tsx")
const sky = code("theme-packages/materia/base/sections/space-starfield.liquid")

console.log("\nNight sky: a section drawn again runs its own scripts again\n")
{
  check("a swapped section runs its inline scripts again", /el\.replaceWith\(next\);\s*runScripts\(next, true\);/.test(bridge))
  check("a section put back (undo, shown again) does too", /var id = el\.getAttribute\("data-section-id"\);\s*runScripts\(el, true\);/.test(bridge))
  check("a custom element put back fresh does too", /runScripts\(fresh, true\)/.test(bridge))
  check("only inline JavaScript is run again; a script with an address still runs once", /var rerun = !!again && !old\.src && JS_TYPE\.test\(type\)/.test(bridge))
  check("run again in a block and caught: no const declared twice, no custom element defined twice said", bridge.includes('"{try{" + key + "\\\\n}catch(e){}}"'))
  check("what its last run added to window and document is taken off first", /own\.delete\(key\);\s*mine\.forEach/.test(bridge) && /removeEventListener\(r\[1\], r\[2\], r\[3\]\)/.test(bridge))
  check("the recorder is in the canvas's head, before the switch's own window.addEventListener (which would hide window listeners from it)", CANVAS_HEAD.includes(CANVAS_SCRIPT_OWN) && CANVAS_HEAD.indexOf(CANVAS_SCRIPT_OWN) < CANVAS_HEAD.indexOf("W.addEventListener = function"))
  /* The recorder itself, run against a stand-in window and document. */
  const added: unknown[][] = []
  const fakeDoc: Record<string, unknown> = {}
  const scriptEl = { src: "", textContent: "SCRIPT TEXT", closest: (sel: string) => (sel === ".shopify-section" ? {} : null) }
  fakeDoc.currentScript = scriptEl
  class FakeTarget { addEventListener(...a: unknown[]) { added.push(a) } }
  const fakeWin: Record<string, unknown> = { setInterval: () => 7 }
  const body = CANVAS_SCRIPT_OWN.replace(/^<script>/, "").replace(/<\/script>$/, "")
  new Function("window", "document", "EventTarget", body)(fakeWin, fakeDoc, FakeTarget)
  const T = FakeTarget.prototype as unknown as { addEventListener: (this: unknown, ...a: unknown[]) => void }
  const onDoc = () => {}
  T.addEventListener.call(fakeDoc, "click", onDoc, true)
  T.addEventListener.call({}, "click", () => {})
  const own = fakeWin.__slOwn as Map<string, unknown[][]>
  check("a listener a section's script adds to document is noted under its text", own.get("SCRIPT TEXT")?.length === 1 && own.get("SCRIPT TEXT")?.[0][2] === onDoc, own.get("SCRIPT TEXT"))
  check("one on any other element is not", added.length === 2 && own.get("SCRIPT TEXT")?.length === 1)
  ;(fakeWin.setInterval as () => number)()
  check("an interval it starts is noted", own.get("SCRIPT TEXT")?.length === 2 && own.get("SCRIPT TEXT")?.[1][0] === null && own.get("SCRIPT TEXT")?.[1][1] === 7)
  fakeDoc.currentScript = null
  T.addEventListener.call(fakeDoc, "scroll", () => {})
  check("outside a section's script, nothing is noted", own.get("SCRIPT TEXT")?.length === 2)
  check("a swapped section is never held at its old height for good", /var release = function \(\) \{ next\.style\.minHeight = ""; \};\s*\/\*[^*]*\*\/\s*setTimeout\(release, 3000\);/.test(bridge))
  check("the sky's copy still inside its section is never shown over the page", /#shopify-section-\{\{ sid \}\} \.space-sky-\{\{ sid \}\} \{ display: none !important; \}/.test(sky))
  check("the sky's script still takes its layer to the back of the page", sky.includes("document.body.insertBefore(root, document.body.firstChild)"))
}

console.log("\nRefused to connect: the canvas never shows a page that left it\n")
{
  check("the page says it is going before it goes", /addEventListener\("beforeunload", function \(\) \{ post\(\{ type: "unloading" \}\); \}\);/.test(bridge))
  check("the canvas hides its frame on that word", /m\.type === "unloading" && isFront\) \{\s*hideGone\(slot\.n, false\)/.test(canvas))
  check("and on the frame's second load", /if \(slot\.loads > 1\) \{\s*slot\.ready = false\s*if \(at === 0\) hideGone\(n, true\)/.test(canvas))
  check("hidden means not seen and not pressed", /goneFrom === slot\.n \? \{ visibility: "hidden" as const \}/.test(canvas) && /pointerEvents: leavingFrom === slot\.n \|\| goneFrom === slot\.n \? "none"/.test(canvas))
  check("going nowhere after all, it is shown again", /GONE_CHECK_MS = 4_000/.test(canvas) && /\(slot\.loads \?\? 0\) === loadsAt\) setGoneFrom/.test(canvas))
  check("a kept page that went elsewhere is never brought back", /if \(away\.loads > 1\) \{ setKept\(\(prev\) => prev\.filter\(\(x\) => x\.n !== n\)\); return \}/.test(canvas))
  check("window.open into the frame opens the page as the builder does", /\(t === "_self" \|\| t === "_parent" \|\| t === "_top"\)/.test(bridge) && /window\.open = function/.test(bridge))
  check("a link a script clicks outside the page too", /HTMLAnchorElement\.prototype\.click = function/.test(bridge) && /!this\.isConnected/.test(bridge))
  check("a download or a new tab is left to the browser", /!this\.hasAttribute\("download"\)/.test(bridge) && /tg !== "_blank"/.test(bridge))
  check("a link in full on the website's own host is that page", /const rawHref = ownSitePath\(givenHref, siteUrlRef\.current\) \?\? givenHref/.test(canvas))
  check("another website opens in a new tab, said when the browser holds it back", /const out = externalHref\(href, websiteUrlRef\.current\)/.test(editor) && /if \(tab\) tab\.opener = null/.test(editor))
}

console.log("\nThe website's own address\n")
{
  const site = "https://andrewrullz.storelib.com"
  check("its subdomain is a path", ownSitePath("https://andrewrullz.storelib.com/products/black-sleeves", site) === "/products/black-sleeves")
  check("with its query and hash", ownSitePath("https://andrewrullz.storelib.com/collections/all?page=2#top", site) === "/collections/all?page=2#top")
  check("www and a protocol relative address alike", ownSitePath("//www.andrewrullz.storelib.com/cart", site) === "/cart")
  check("the host alone is home", ownSitePath("https://andrewrullz.storelib.com", site) === "/")
  check("storelib.com itself is not the website", ownSitePath("https://storelib.com/products/x", site) === null)
  check("another store is not", ownSitePath("https://other.storelib.com/products/x", site) === null)
  check("a relative link is left to the canvas as it was", ownSitePath("/products/x", site) === null)
  check("no website address: nothing is taken", ownSitePath("https://andrewrullz.storelib.com/x", "") === null)
  check("a custom domain", ownSitePath("https://shop.example.com/pages/about", "https://www.shop.example.com") === "/pages/about")
  check("another website is external", externalHref("https://instagram.com/andrew", site) === "https://instagram.com/andrew")
  check("the website's own address is not", externalHref("https://andrewrullz.storelib.com/cart", site) === null)
  check("mailto and relative are not", externalHref("mailto:a@b.co", site) === null && externalHref("/about", site) === null)
}

console.log("\nThe code pane\n")
{
  check("no frame yet: nothing to say", frameIsOurs(null))
  check("the code page is ours", frameIsOurs({ contentDocument: { location: { pathname: "/website-builder/code/abc", href: "https://storelib.com/website-builder/code/abc?embedded=1" } } }))
  check("a refused page cannot be read: not ours", !frameIsOurs({ contentDocument: null }))
  check("the sign in page is not the code page", !frameIsOurs({ contentDocument: { location: { pathname: "/login", href: "https://storelib.com/login" } } }))
  check("a page that throws on reading is not", !frameIsOurs({ get contentDocument(): never { throw new Error("cross origin") } }))
  check("the first blank document is not a refusal", frameIsOurs({ contentDocument: { location: { pathname: "blank", href: "about:blank" } } }))
  check("the pane reads its frame on every load and offers Try again", /setRefused\(!frameIsOurs\(frameRef\.current\)\)/.test(pane) && /setFrameTry\(\(n\) => n \+ 1\)/.test(pane) && pane.includes('tt("Try again")'))
  check("signed out in a frame, the layout says so instead of sending the frame to /login", /if \(\(await headers\(\)\)\.get\("sec-fetch-dest"\) === "iframe"\) return <FramedSignedOut \/>\s*redirect\("\/login"\)/.test(layout))
  check("and signing in again opens in the whole tab", /href="\/login" target="_top"/.test(layout))
}

console.log("\nNothing framing-related was loosened\n")
{
  const vercel = code("vercel.json")
  const proxy = code("proxy.ts")
  check("vercel.json still sends X-Frame-Options DENY", /"key": "X-Frame-Options",\s*"value": "DENY"/.test(vercel))
  check("the proxy's framed list is unchanged: the builder's own frames only, with ?embedded=1", proxy.includes('const framed = framableWhenEmbedded && url.searchParams.get("embedded") === "1"') && !/framableWhenEmbedded =[\s\S]{0,900}"\/store\/"/.test(proxy) && !/framableWhenEmbedded =[\s\S]{0,900}\.storelib\.com/.test(proxy))
  check("the canvas frame keeps its sandbox: no origin, no top navigation", /sandbox=\{relay \? "allow-scripts allow-same-origin allow-forms allow-popups" : "allow-scripts allow-forms allow-popups"\}/.test(canvas))
}

console.log("\nCopy\n")
{
  const words = ["The code editor did not open", "You may have been signed out in another tab.", "You were signed out", "Sign in again to keep editing. Your unsaved code stays in this browser."]
  const banned = /\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform)\b|—/i
  check("no AI words and no em dash in what this round says", words.every((w) => !banned.test(w)))
  for (const code of ["de", "es", "fr", "it", "pl", "pt-BR"]) {
    const cat = readFileSync(join(process.cwd(), `lib/i18n/catalog/${code}.ts`), "utf8")
    check(`${code}: the pane's words are translated`, cat.includes('"The code editor did not open":') && cat.includes('"You may have been signed out in another tab.":'))
  }
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"))
  process.exit(1)
}
