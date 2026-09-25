/**
 * ===========================================================================
 *  A DRAWN SECTION RUNS NOTHING, IN A REAL BROWSER
 * ===========================================================================
 * lib/storelib-theme/storelib/raw-html.ts guardSectionMarkup reads a drawn
 * section the way a browser's tokenizer does and takes out what can run
 * something. Reading it the way a browser does is the claim, so this puts it
 * in front of one: each case below is loaded into Chromium as a page, first
 * as written and then as the guard leaves it, and whatever the page can be
 * made to do (load, error, focus, toggle, a click on every link, button and
 * area) is done. A case "fires" when it calls __x().
 *
 *   as written   most cases fire, which shows the case is a real one
 *   guarded      none fires, and the page has no on… attribute, no <script>,
 *                no srcdoc and no javascript: address left in it
 *
 *   node scripts/check-section-guard.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) {
  console.error(`No browser at ${CHROMIUM}.`)
  process.exit(1)
}

/* The guard, as the engine ships it: raw-html.ts has no imports, so it bundles to one file. */
const out = mkdtempSync(join(tmpdir(), "section-guard-"))
const bundle = join(out, "raw-html.mjs")
execFileSync("npx", ["--no-install", "esbuild", join(root, "lib/storelib-theme/storelib/raw-html.ts"), "--format=esm", "--platform=neutral", `--outfile=${bundle}`, "--log-level=warning"], { stdio: "inherit" })
const { guardSectionMarkup } = await import(`data:text/javascript;base64,${Buffer.from(readFileSync(bundle)).toString("base64")}`)
rmSync(out, { recursive: true, force: true })

const X = "__x()"
const CASES = [
  ["an error handler", `<img src=x onerror=${X}>`],
  ["a handler after a slash", `<img/onerror=${X} src=x>`],
  ["a handler after a quote", `<img src="x"onerror="${X}">`],
  ["an svg load handler", `<svg onload=${X}></svg>`],
  ["an svg animation handler", `<svg><animate onbegin=${X} attributeName=x dur=1s /></svg>`],
  ["a script", `<script>${X}</script>`],
  ["a script in capitals", `<SCRIPT>${X}</SCRIPT>`],
  ["a script with a quote in it", `<script title="<img src=x onerror=${X}>">${X}</script>`],
  ["a page in srcdoc", `<iframe srcdoc="<script>parent.${X}</script>"></iframe>`],
  ["a javascript: frame", `<iframe src="javascript:parent.${X}"></iframe>`],
  ["a javascript: link", `<a href="javascript:${X}">x</a>`],
  ["a javascript: link spelled with a reference", `<a href="jav&#x61;script:${X}">x</a>`],
  ["a javascript: link split by a tab", `<a href=" java&#x09;script:${X}">x</a>`],
  ["a javascript: link unquoted", `<a href=javascript:${X}>x</a>`],
  ["a javascript: form", `<form action="javascript:${X}"><button>go</button></form>`],
  ["a javascript: button", `<form><button formaction="javascript:${X}">go</button></form>`],
  ["an svg javascript: link", `<svg width=60 height=30><a xlink:href="javascript:${X}"><rect width=60 height=30 /></a></svg>`],
  ["an svg animation that sets a javascript: link", `<svg width=60 height=30><a><animate attributeName=href values="javascript:${X}" /><rect width=60 height=30 /></a></svg>`],
  ["an svg set that sets a javascript: link", `<svg width=60 height=30><a><set attributeName=href to="javascript:${X}" /><rect width=60 height=30 /></a></svg>`],
  ["markup hidden in noscript", `<noscript><p title="</noscript><img src=x onerror=${X}>"></p></noscript>`],
  ["markup in a textarea", `<textarea><img src=x onerror=${X}></textarea>`],
  ["markup in an svg style", `<svg><style><img src=x onerror=${X}></style></svg>`],
  ["the mathml style trick", `<math><mtext><table><mglyph><style><img src=x onerror=${X}>`],
  ["a CDATA section in svg", `<svg><![CDATA[</svg><img src=x onerror=${X}>]]></svg>`],
  ["an empty comment", `<!--><img src=x onerror=${X}>-->`],
  ["a comment left open", `<!-- <img src=x onerror=${X}>`],
  ["an object", `<object data="javascript:${X}"></object>`],
  ["an embed", `<embed src="javascript:${X}">`],
  ["a toggle handler", `<details open ontoggle=${X}><summary>x</summary></details>`],
  ["a focus handler", `<input autofocus onfocus=${X}>`],
  ["a media source handler", `<video><source onerror=${X}></video>`],
  ["a base address", `<base href="javascript:${X}//"><a href="x">x</a>`],
  ["markup in xmp", `<xmp><img src=x onerror=${X}></xmp>`],
  ["markup in a title", `<title><img src=x onerror=${X}></title>`],
  ["markup inside a frame", `<iframe><img src=x onerror=${X}></iframe>`],
  ["a tag left open", `<img src=x onerror=${X} `],
  ["a quote left open", `<img src="x onerror=${X}>`],
  ["a doctype hiding a tag", `<!DOCTYPE x="><img src=x onerror=${X}>">`],
  ["a bogus end tag", `</ x="><img src=x onerror=${X}>">`],
]

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}

/**
 * The page's own script, before the section: the counter every case calls,
 * and a click listener that counts a javascript: link rather than letting it
 * take the page away. Written into the page, since a script added for "new
 * documents" never reaches one made with setContent.
 */
const HARNESS = `<script id="harness">
window.__fired = 0
window.__x = function () { window.__fired++ }
window.addEventListener("click", function (e) {
  var a = e.target && e.target.closest ? e.target.closest("a, area") : null
  if (!a) return
  /* As written, as an SVG animation left it, and as a <base> resolved it. */
  var seen = [a.getAttribute("href"), a.getAttributeNS("http://www.w3.org/1999/xlink", "href"), typeof a.href === "string" ? a.href : a.href && a.href.animVal]
  if (seen.some(function (h) { return h && /^\\s*javascript:/i.test(String(h).replace(/[\\t\\n\\r]/g, "")) })) window.__fired++
  e.preventDefault()
}, true)
</script>`

/** Load it as a page, do everything the page can be made to do, and count __x() calls and what is left in it. */
async function run(markup) {
  const p = await browser.newPage()
  await p.setContent(`<!doctype html><html><head>${HARNESS}</head><body><div id=section>${markup}</div><p id=after>after</p></body></html>`, { waitUntil: "load", timeout: 8000 }).catch(() => {})
  await new Promise((r) => setTimeout(r, 300))
  await p.evaluate(() => {
    for (const el of document.querySelectorAll("a, area, button, input, summary")) {
      try { el.click() } catch {}
    }
    for (const f of document.querySelectorAll("form")) {
      try { f.requestSubmit ? f.requestSubmit() : f.submit() } catch {}
    }
  }).catch(() => {})
  await new Promise((r) => setTimeout(r, 1200))
  const state = await p.evaluate(() => {
    const all = [...document.querySelectorAll("*")]
    const handlers = all.filter((el) => [...el.attributes].some((a) => a.name.toLowerCase().startsWith("on"))).length
    const scripts = document.querySelectorAll("script:not(#harness)").length
    const srcdoc = all.filter((el) => el.hasAttribute("srcdoc")).length
    const addresses = all.filter((el) => ["href", "src", "action", "formaction", "data"].some((n) => /^\s*javascript:/i.test((el.getAttribute(n) ?? "").replace(/[\t\n\r]/g, "")))
      || /^\s*javascript:/i.test((el.getAttributeNS("http://www.w3.org/1999/xlink", "href") ?? "").replace(/[\t\n\r]/g, ""))).length
    return { fired: window.__fired ?? 0, handlers, scripts, srcdoc, addresses, after: !!document.getElementById("after") }
  }).catch(() => ({ fired: -1, handlers: -1, scripts: -1, srcdoc: -1, addresses: -1, after: false }))
  await p.close()
  return state
}

console.log("\nEach case as written, then as the guard leaves it")
let firedAsWritten = 0
for (const [name, markup] of CASES) {
  const guarded = guardSectionMarkup(markup)
  const raw = await run(markup)
  const safe = await run(guarded)
  if (raw.fired > 0) firedAsWritten++
  const clean = safe.fired === 0 && safe.handlers === 0 && safe.scripts === 0 && safe.srcdoc === 0 && safe.addresses === 0
  expect(clean, `${name}: ${raw.fired > 0 ? "fires as written, " : ""}runs nothing once guarded`, clean ? undefined : { guarded, ...safe })
}
expect(firedAsWritten >= 20, `the cases are real: ${firedAsWritten} of ${CASES.length} fire as written in this browser`)

console.log("\nOrdinary markup is left exactly as it is")
const ORDINARY = [
  `<section class="hero"><h1>Hello &amp; welcome</h1><p>a &lt; b and 3 < 4, <3</p><a href="https://x.test/a?b=1&amp;c=2">Go</a> <a href="mailto:a@b.co">Mail</a> <a href="#faq">FAQ</a> <a href="/products">Shop</a></section>`,
  `<svg viewBox="0 0 24 24" aria-hidden="true"><title>Close</title><path d="M6 6l12 12M18 6L6 18" stroke="currentColor"/></svg>`,
  `<img src="https://cdn.test/a.png" alt="A > B" loading="lazy"><img src="data:image/png;base64,iVBORw0KGgo=" alt="">`,
  `<iframe src="https://www.youtube-nocookie.com/embed/x" allow="autoplay" allowfullscreen></iframe>`,
  `<form data-storelib-form="subscribe"><input type="email" name="email" required><textarea name="m">Hi there</textarea><button type="submit">Send</button></form>`,
  `<!-- a note --><ul><li>One</li><li data-x='{"a":1}'>Two</li></ul><br/><hr>`,
]
for (const markup of ORDINARY) expect(guardSectionMarkup(markup) === markup, `unchanged: ${markup.slice(0, 60)}…`)

await browser.close()
console.log(broken ? `\n${broken} check${broken === 1 ? "" : "s"} failed` : "\nNothing a section draws runs, and ordinary markup is untouched.")
process.exit(broken ? 1 : 0)
