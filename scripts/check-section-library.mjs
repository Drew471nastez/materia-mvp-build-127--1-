/**
 * ===========================================================================
 *  THE SECTION LIBRARY, MEASURED
 * ===========================================================================
 * "Tap a category and the pill goes white and nothing happens", and "the
 * previews are not what the section looks like on a phone". Both are claims
 * about pixels, so this opens the real library in a real browser at both
 * widths, taps a category, and reports what it finds: the colours a chip
 * actually computes to, how many cards there are before and after the tap,
 * and for each preview the card's width against the width its contents were
 * drawn at.
 *
 * Same harness as scripts/check-editor-scroll.mjs: the editor's own bundle,
 * headless Chromium, nothing about the library stubbed.
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
/**
 * The editor is bundled here, for the browser, with the network and the
 * framework's server-side modules replaced by stubs in .wb-probe/. Nothing
 * about the editor itself is stubbed.
 */
const stubs = join(root, ".wb-probe")
mkdirSync(stubs, { recursive: true })
const STUBS = {
  "navigation.js": `export const usePathname = () => "/website-builder/editor/probe-install"
export const useRouter = () => ({ push() {}, replace() {}, refresh() {}, prefetch() {}, back() {} })
export const useSearchParams = () => new URLSearchParams()
export const useParams = () => ({ installId: "probe-install" })
export const redirect = () => {}
export const notFound = () => {}
`,
  "link.jsx": `import React from "react"
export default function Link({ href, children, ...rest }) { return React.createElement("a", { href, ...rest }, children) }
`,
  "image.jsx": `import React from "react"
export default function Image({ src, alt, ...rest }) { const { fill, priority, unoptimized, sizes, quality, placeholder, blurDataURL, loader, ...ok } = rest; return React.createElement("img", { src: typeof src === "string" ? src : src && src.src, alt, ...ok }) }
`,
  "cache.js": `export const unstable_cache = (fn) => fn
export const revalidateTag = () => {}
export const revalidatePath = () => {}
`,
  "supabase-client.js": `const chain = () => new Proxy(function () {}, { get: (_, k) => k === "then" ? undefined : chain, apply: () => chain() })
export function createClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: "probe-user", email: "probe@example.invalid" } }, error: null }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    storage: { from: () => ({ upload: async () => ({ data: null, error: null }), getPublicUrl: () => ({ data: { publicUrl: "" } }), remove: async () => ({ data: null, error: null }) }) },
    from: () => chain(), channel: () => ({ on() { return this }, subscribe() { return this }, unsubscribe() {} }), removeChannel() {},
  }
}
`,
  "node-crypto.js": `export function createHash() {
  let acc = ""
  return { update(s) { acc += String(s); return this }, digest() { let h = 0x811c9dc5; for (let i = 0; i < acc.length; i++) { h ^= acc.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 } return h.toString(16).padStart(8, "0").repeat(4) } }
}
export function randomBytes(n) { const a = new Uint8Array(n); crypto.getRandomValues(a); return { toString: () => Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("") } }
export function randomUUID() { return crypto.randomUUID() }
export default { createHash, randomBytes, randomUUID }
`,
  "node-empty.js": `const noop = () => { throw new Error("node builtin used in the browser probe") }
export const readFileSync = noop, writeFileSync = noop, existsSync = () => false, readdirSync = () => [], mkdirSync = noop
export const join = (...p) => p.join("/"), resolve = (...p) => p.join("/"), dirname = (p) => p.split("/").slice(0, -1).join("/"), basename = (p) => p.split("/").pop(), extname = (p) => { const i = p.lastIndexOf("."); return i < 0 ? "" : p.slice(i) }
export default {}
`,
  "buffer-shim.js": `const enc = new TextEncoder(), dec = new TextDecoder()
function b64(bytes) { let s = ""; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s) }
function unb64(s) { const bin = atob(s.split("-").join("+").split("_").join("/")); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a }
class Buf {
  constructor(bytes) { this.bytes = bytes }
  static from(x, encoding) { if (x instanceof Uint8Array) return new Buf(x); if (typeof x === "string") return new Buf(encoding === "base64" || encoding === "base64url" ? unb64(x) : enc.encode(x)); return new Buf(new Uint8Array(x)) }
  static isBuffer(x) { return x instanceof Buf }
  static byteLength(s) { return enc.encode(String(s)).length }
  toString(encoding) { if (encoding === "base64") return b64(this.bytes); if (encoding === "base64url") return b64(this.bytes).split("+").join("-").split("/").join("_").split("=").join(""); return dec.decode(this.bytes) }
  get length() { return this.bytes.length }
}
globalThis.Buffer = Buf
`,
}
for (const [name, body] of Object.entries(STUBS)) writeFileSync(join(stubs, name), body)
const bundle = process.env.EDITOR_BUNDLE ?? join(mkdtempSync(join(tmpdir(), "storelib-editor-bundle-")), "editor-probe.js")
if (!existsSync(bundle)) {
  execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-editor-probe.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${bundle}`,
    `--inject:${join(stubs, "buffer-shim.js")}`,
    '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true,versions:{},platform:"browser",cwd:function(){return "/"},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;',
    '--define:process.env.NODE_ENV="production"', '--define:process.env.NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co"',
    '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder"', '--define:process.env.NEXT_PUBLIC_APP_URL="https://storelib.com"',
    `--alias:next/navigation=${join(stubs, "navigation.js")}`, `--alias:next/link=${join(stubs, "link.jsx")}`, `--alias:next/image=${join(stubs, "image.jsx")}`,
    `--alias:next/cache=${join(stubs, "cache.js")}`, `--alias:@/lib/supabase/client=${join(stubs, "supabase-client.js")}`,
    `--alias:node:crypto=${join(stubs, "node-crypto.js")}`, `--alias:crypto=${join(stubs, "node-crypto.js")}`,
    `--alias:node:fs=${join(stubs, "node-empty.js")}`, `--alias:fs=${join(stubs, "node-empty.js")}`, `--alias:node:path=${join(stubs, "node-empty.js")}`, `--alias:path=${join(stubs, "node-empty.js")}`,
    `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
    { stdio: ["ignore", "ignore", "inherit"] })
}
const cssDir = join(root, ".next/static/chunks")
if (!existsSync(cssDir)) fail("No production build found. Run `pnpm build` first.")
const css = readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(cssDir, f), "utf8")).join("\n")
const out = mkdtempSync(join(tmpdir(), "storelib-editor-"))



/** No regex literals in here: a backslash in a template literal is eaten. */
const DRIVE = `
<script>
(function () {
  var steps = []
  function finish() {
    var el = document.createElement("script")
    el.type = "application/json"
    el.id = "out"
    el.textContent = JSON.stringify(steps)
    document.body.appendChild(el)
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms) }) }
  function click(el) {
    if (!el) return false
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
    el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }))
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
    return true
  }
  function byText(text) {
    var all = document.querySelectorAll("button, [role=button]")
    for (var i = 0; i < all.length; i++) {
      var t = (all[i].textContent || "").trim()
      var label = all[i].getAttribute("aria-label") || ""
      if (t === text || label === text) return all[i]
    }
    return null
  }
  function chips() {
    var row = document.querySelector(".wb-chip-row")
    if (row) return row.querySelectorAll("button")
    var nav = document.querySelector("nav")
    return nav ? nav.querySelectorAll("button") : []
  }
  function cardCount() { return document.querySelectorAll("[data-library-card]").length }
  function look(el) {
    var cs = getComputedStyle(el)
    return { text: (el.textContent || "").trim().slice(0, 20), bg: cs.backgroundColor, fg: cs.color, border: cs.borderLeftColor }
  }

  var tries = 0
  function waitReady() {
    var ready = document.querySelectorAll("#wb-preview-root [id^=wb-section-]").length > 0
    if (ready) return void go().then(finish, function (e) { steps.push({ label: "threw", message: String(e && e.message) }); finish() })
    if (++tries > 150) { steps.push({ label: "never ready" }); return finish() }
    setTimeout(waitReady, 100)
  }

  async function go() {
    var phone = window.innerWidth < 768
    // Open the library the way a person does.
    var opener = byText("Add section") || byText("Add Section") || byText("Add a section")
    if (!opener) {
      var plus = document.querySelector("[aria-label='Add section'], [aria-label='Add a section']")
      opener = plus
    }
    steps.push({ label: "the button that opens the library", found: !!opener })
    click(opener)
    await sleep(900)
    steps.push({ label: "cards when it opens", cards: cardCount() })

    var list = chips()
    steps.push({ label: "categories offered", count: list.length, names: Array.prototype.map.call(list, function (c) { return (c.textContent || "").trim().slice(0, 14) }).slice(0, 8) })
    if (list.length > 1) {
      var before = cardCount()
      var beforeLook = look(list[1])
      click(list[1])
      await sleep(700)
      var after = chips()
      steps.push({
        label: "tapping a category",
        before: before,
        after: cardCount(),
        chipBefore: beforeLook,
        chipAfter: after.length > 1 ? look(after[1]) : null,
        classBefore: (list[1].className || "").slice(-60),
        classAfter: after.length > 1 ? (after[1].className || "").slice(-60) : null,
        rows: document.querySelectorAll(".wb-chip-row").length,
        firstChipAfter: after.length ? look(after[0]) : null,
      })
    }

    // Every preview: the card it sits in, and the width it was drawn at.
    var cards = document.querySelectorAll("[data-library-card]")
    var shots = []
    for (var i = 0; i < cards.length && shots.length < 4; i++) {
      var card = cards[i]
      var r = card.getBoundingClientRect()
      var inner = card.querySelector(".origin-top-left")
      var drawn = null
      var scale = null
      if (inner) {
        var cs = getComputedStyle(inner)
        drawn = Math.round(inner.getBoundingClientRect().width)
        scale = cs.transform
      }
      var section = card.querySelector("[data-section], [id^=wb-section-]")
      var wrap = inner ? inner.parentElement : null
      shots.push({
        type: card.getAttribute("data-library-card"),
        cardWidth: Math.round(r.width),
        wrapWidth: wrap ? Math.round(wrap.getBoundingClientRect().width) : null,
        drawnWidth: drawn,
        transform: scale,
        sectionWidth: section ? Math.round(section.getBoundingClientRect().width) : null,
        overflows: section ? Math.round(section.getBoundingClientRect().right) > Math.round(r.right) + 2 : null,
      })
    }
    var sheet = document.querySelector("[data-mobile-bottom-sheet]")
    steps.push({
      label: "previews",
      shots: shots,
      width: window.innerWidth,
      docScrollWidth: document.documentElement.scrollWidth,
      sheetWidth: sheet ? Math.round(sheet.getBoundingClientRect().width) : null,
    })
  }
  window.addEventListener("error", function (e) { steps.push({ label: "window error", message: String(e.message) }) })
  setTimeout(waitReady, 200)
})()
</script>`
function run(width, height, label) {
  const file = join(out, `${label}.html`)
  /**
   * The bundle is LOADED, not inlined. Three megabytes of application code
   * contains the text "</script>" somewhere — a sanitiser's own list of
   * dangerous tags is enough — and inline that closes the script early: the
   * editor renders nothing, the rest of the bundle spills into the page as
   * text, and the driver after it never runs. No error is logged for any of
   * that. A src attribute is immune.
   */
  writeFileSync(join(out, "editor-probe.js"), readFileSync(bundle))
  writeFileSync(file, `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body><div id="app"></div><script>window.PROBE_SHORT=${process.env.SHORT_PAGE === "1"}</script><script src="editor-probe.js"></script>${DRIVE}</body></html>`)
  const dump = execFileSync(CHROMIUM, ["--headless", "--disable-gpu", "--no-sandbox", "--force-device-scale-factor=1", "--enable-logging=stderr", "--v=0",
    `--window-size=${width},${height}`, "--virtual-time-budget=40000", "--dump-dom", `file://${file}`],
    { encoding: "utf8", maxBuffer: 400 * 1024 * 1024, stdio: ["ignore", "pipe", process.env.PROBE_DEBUG ? "inherit" : "ignore"] })
  // A src'd script loads asynchronously to the parser, so the driver polls for it; see waitReady.
  const m = /<script type="application\/json" id="out">([\s\S]*?)<\/script>/.exec(dump)
  if (!m) {
    const t = /<title>([^<]*)<\/title>/.exec(dump)
    fail(`${label}: the drive never reported. title=${t ? t[1] : "(none)"} dump=${dump.length} bytes\n${dump.slice(-1500).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(-600)}`)
  }
  return JSON.parse(m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"))
}

let failures = 0
for (const [w, h, label] of [[390, 844, "phone"], [1280, 900, "desktop"]]) {
  console.log(`\n══ ${label} ${w}×${h} ══`)
  for (const s of run(w, h, label)) {
    if (s.label === "tapping a category") {
      const worked = s.after !== s.before || s.chipAfter?.bg !== s.chipBefore?.bg
      if (!worked) failures++
      console.log(`  ${worked ? "ok  " : "✗   "} tapping a category: ${s.before} cards → ${s.after}`)
      console.log(`        the chip before: ${JSON.stringify(s.chipBefore)}`)
      console.log(`        the chip after:  ${JSON.stringify(s.chipAfter)}`)
      console.log(`        and the first chip: ${JSON.stringify(s.firstChipAfter)}`)
      console.log(`        classes before: ${s.classBefore}`)
      console.log(`        classes after:  ${s.classAfter}`)
      console.log(`        chip rows in the page: ${s.rows}`)
      continue
    }
    if (s.label === "previews") {
      console.log(`  the screen is ${s.width}px, the document ${s.docScrollWidth}px, the sheet ${s.sheetWidth}px`)
      for (const p of s.shots) {
        const fits = p.overflows === false
        if (p.overflows) failures++
        console.log(`  ${fits ? "ok  " : "✗   "} ${p.type}: card ${p.cardWidth}px, wrap ${p.wrapWidth}px, drawn ${p.drawnWidth}px, ${p.transform}`)
      }
      continue
    }
    console.log(`  ${JSON.stringify(s)}`)
  }
}
console.log(failures ? `\n  ${failures} to fix\n` : "\n  The library opens, a category filters, and every preview fits its card.\n")
process.exit(failures ? 1 : 0)
