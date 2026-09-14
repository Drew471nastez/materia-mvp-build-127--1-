/**
 * ===========================================================================
 *  A BUYER CAN REACH THE SELLER
 * ===========================================================================
 * The contact address was rendered only inside the About block, and About is
 * a section a creator may never have added — so on most creator pages there
 * was no way to write to the person selling. It is on the header's meta line
 * now, which is always under the bio.
 *
 * Two things measured: that the address is really in the page with a working
 * mailto, and that a creator with no address gets no empty row rather than a
 * broken `mailto:`.
 *
 *   pnpm build && node scripts/check-contact-line.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const cssDir = join(root, ".next/static/chunks")
if (!existsSync(cssDir)) fail("No production build found. Run `pnpm build` first.")
const css = readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(cssDir, f), "utf8")).join("\n")

const stubs = join(root, ".wb-probe")
writeFileSync(join(stubs, "crypto-stub.js"), `export function createHash() { let a = ""; return { update(s) { a += String(s); return this }, digest() { let h = 0; for (let i = 0; i < a.length; i++) h = (h * 31 + a.charCodeAt(i)) | 0; return String(h >>> 0) } } }
export default { createHash }
`)

const out = mkdtempSync(join(tmpdir(), "storelib-contact-"))
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-contact-line.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(out, "probe.js")}`,
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
  '--define:process.env.NODE_ENV="production"',
  `--alias:node:crypto=${join(stubs, "crypto-stub.js")}`,
  `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
  { stdio: ["ignore", "ignore", "inherit"] })

writeFileSync(join(out, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style><style>body{margin:0}</style></head><body><div id="app"></div><script src="probe.js"></script>
<script>
setTimeout(function () {
  var read = function (sel) {
    var host = document.querySelector(sel)
    if (!host) return { mounted: false }
    var link = host.querySelector('a[href^="mailto:"]')
    var r = link ? link.getBoundingClientRect() : null
    return {
      mounted: true,
      hasLink: !!link,
      href: link ? link.getAttribute("href") : null,
      shown: link ? link.textContent.trim() : null,
      visible: r ? (r.width > 0 && r.height > 0) : false,
      emptyMailto: !!host.querySelector('a[href="mailto:"]'),
    }
  }
  var pre = document.createElement("pre"); pre.id = "result"
  pre.textContent = JSON.stringify({ with: read('[data-case="with"]'), without: read('[data-case="without"]') })
  document.body.append(pre)
}, 700)
</script></body></html>`)

const dom = execFileSync(CHROMIUM, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
  "--window-size=900,1200", "--virtual-time-budget=12000", "--dump-dom", `file://${join(out, "index.html")}`],
  { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 })
const m = dom.match(/<pre id="result">([\s\S]*?)<\/pre>/)
if (!m) fail("The header never reported.")
const r = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"))

console.log(`\n  with an address:    ${r.with.hasLink ? `${r.with.shown} → ${r.with.href}${r.with.visible ? ", visible" : ", NOT VISIBLE"}` : "no link at all"}`)
console.log(`  without an address: ${r.without.hasLink ? `a link anyway → ${r.without.href}` : "nothing, which is right"}\n`)

const problems = []
if (!r.with.mounted || !r.without.mounted) problems.push(`The header did not mount, so nothing below was measured.`)
if (!r.with.hasLink) problems.push(`A creator with a contact address has no way to be written to on the header line. That is the whole point of the change.`)
else {
  if (r.with.href !== "mailto:hello@andrewrullz.com") problems.push(`The link points at ${r.with.href}, not at the address it was given.`)
  if (!String(r.with.shown).includes("hello@andrewrullz.com")) problems.push(`The line shows "${r.with.shown}" rather than the address. A buyer should be able to read and copy it, not just click it.`)
  if (!r.with.visible) problems.push(`The link is in the markup but has no size, so nobody can see or press it.`)
}
if (r.without.hasLink) problems.push(`A creator with no address still gets a link (${r.without.href}). An empty mailto is a dead link.`)
if (r.with.emptyMailto || r.without.emptyMailto) problems.push(`There is a "mailto:" with nothing after it in the page.`)

if (problems.length) {
  console.error(`${problems.length} problem${problems.length > 1 ? "s" : ""}:\n`)
  problems.forEach((p, i) => console.error(`  ${i + 1}. ${p}`))
  console.error("")
  process.exit(1)
}
console.log("The address is on the page, readable, and a creator without one gets no dead link.\n")
