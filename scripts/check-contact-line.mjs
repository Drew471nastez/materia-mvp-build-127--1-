/**
 * ===========================================================================
 *  A BUYER CAN REACH THE SELLER
 * ===========================================================================
 * Two separate things, and both have been wrong here before.
 *
 * REACHABILITY. The address used to be rendered only inside the About block,
 * and About is a section a creator may never have added — so on most creator
 * pages there was no way to write to the person selling. It is on the
 * header's meta line now, which is always under the bio.
 *
 * AND IT IS BEHIND A BUTTON. The address is not in the page until somebody
 * asks for it: before the press there is no `mailto` and no text to harvest;
 * after it, a working link and a copy button. A creator with no address gets
 * no control at all, rather than a "Contact" that reveals nothing.
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
  var trigger = function (host) {
    var buttons = host.querySelectorAll("button")
    for (var i = 0; i < buttons.length; i++) if (buttons[i].textContent.trim() === "Contact") return buttons[i]
    return null
  }
  var linkIn = function (host) { return host.querySelector('a[href^="mailto:"]') }

  var readBefore = function (sel) {
    var host = document.querySelector(sel)
    if (!host) return { mounted: false }
    var b = trigger(host)
    var r = b ? b.getBoundingClientRect() : null
    return {
      mounted: true,
      hasButton: !!b,
      buttonVisible: r ? (r.width > 0 && r.height > 0) : false,
      /*
       * Nothing to harvest before the press. Looking for "@" found the
       * @username in the header and called a working reveal broken, so this
       * looks for the ADDRESS, which is the only thing that would be a leak.
       */
      leaksLink: !!linkIn(host),
      leaksText: host.textContent.indexOf("hello@andrewrullz.com") >= 0,
      emptyMailto: !!host.querySelector('a[href="mailto:"]'),
    }
  }

  var readAfter = function (sel) {
    var host = document.querySelector(sel)
    if (!host) return { mounted: false }
    var link = linkIn(host)
    var r = link ? link.getBoundingClientRect() : null
    return {
      mounted: true,
      hasLink: !!link,
      href: link ? link.getAttribute("href") : null,
      shown: link ? link.textContent.trim() : null,
      visible: r ? (r.width > 0 && r.height > 0) : false,
      hasCopy: !!host.querySelector('button[aria-label="Copy the address"]'),
    }
  }

  var result = { withBefore: readBefore('[data-case="with"]'), withoutBefore: readBefore('[data-case="without"]') }
  var b = trigger(document.querySelector('[data-case="with"]'))
  if (b) b.click()
  setTimeout(function () {
    result.withAfter = readAfter('[data-case="with"]')
    var pre = document.createElement("pre"); pre.id = "result"
    pre.textContent = JSON.stringify(result)
    document.body.append(pre)
  }, 200)
}, 700)
</script></body></html>`)

const dom = execFileSync(CHROMIUM, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
  "--window-size=900,1200", "--virtual-time-budget=12000", "--dump-dom", `file://${join(out, "index.html")}`],
  { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 })
const m = dom.match(/<pre id="result">([\s\S]*?)<\/pre>/)
if (!m) fail("The header never reported.")
const r = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"))

console.log(`\n  with an address, before the press: ${r.withBefore.hasButton ? "a Contact button" : "NO BUTTON"}, address in the page: ${r.withBefore.leaksText || r.withBefore.leaksLink ? "YES" : "no"}`)
console.log(`  after the press:                  ${r.withAfter.hasLink ? `${r.withAfter.shown} → ${r.withAfter.href}${r.withAfter.visible ? ", visible" : ", NOT VISIBLE"}${r.withAfter.hasCopy ? ", with copy" : ", no copy"}` : "nothing appeared"}`)
console.log(`  without an address:               ${r.withoutBefore.hasButton ? "a Contact button anyway" : "nothing, which is right"}\n`)

const problems = []
if (!r.withBefore.mounted || !r.withoutBefore.mounted) problems.push(`The header did not mount, so nothing below was measured.`)
if (!r.withBefore.hasButton) problems.push(`A creator with a contact address has no way to be written to on the header line. That is the whole point of the line.`)
if (!r.withBefore.buttonVisible) problems.push(`The Contact button is in the markup but has no size, so nobody can see or press it.`)
if (r.withBefore.leaksLink || r.withBefore.leaksText) problems.push(`The address is in the page before anybody presses Contact, so the reveal is decoration.`)
if (!r.withAfter?.hasLink) problems.push(`Pressing Contact revealed nothing.`)
else {
  if (r.withAfter.href !== "mailto:hello@andrewrullz.com") problems.push(`The revealed link points at ${r.withAfter.href}, not at the address it was given.`)
  if (!String(r.withAfter.shown).includes("hello@andrewrullz.com")) problems.push(`It revealed "${r.withAfter.shown}" rather than the address.`)
  if (!r.withAfter.visible) problems.push(`The revealed address has no size, so nobody can see it.`)
  if (!r.withAfter.hasCopy) problems.push(`There is no way to copy the revealed address.`)
}
if (r.withoutBefore.hasButton) problems.push(`A creator with no address still gets a Contact button, which would reveal nothing.`)
if (r.withBefore.emptyMailto || r.withoutBefore.emptyMailto) problems.push(`There is a "mailto:" with nothing after it in the page.`)

if (problems.length) {
  console.error(`${problems.length} problem${problems.length > 1 ? "s" : ""}:\n`)
  problems.forEach((p, i) => console.error(`  ${i + 1}. ${p}`))
  console.error("")
  process.exit(1)
}
console.log("Contact is a button, the address appears when it is pressed, and a creator without one gets no button.\n")
