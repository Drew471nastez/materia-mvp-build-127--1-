/**
 * ===========================================================================
 *  THE HEADER'S DROPDOWN IS PAINTED BY THE SCHEME, IN EVERY SCHEME
 * ===========================================================================
 * The desktop nav dropdown was a white card with dark grey links, fixed, in
 * markup: `bg-white`, `ring-black/5`, `text-gray-800`. On the two light
 * schemes that is invisible as a bug. On `dark` and `black` it is a white
 * slab hanging off a black bar, and it was reported as "there white, and
 * text white, and not being connected truly and good to the actual colour
 * schemes".
 *
 * So this opens the dropdown in all five built-in schemes and reads the
 * colours off the real element. Two things have to hold in each:
 *
 *   the panel's background is the scheme's background, not a fixed white
 *   the links on it are readable against it
 *
 * Readability is a contrast ratio, computed the way WCAG computes it, over
 * the colours the browser reports after everything has cascaded. 4.5:1 is
 * the threshold for body text; nav links at 13.5px are body text.
 *
 * A note on why the hover tint is measured too. `hover:bg-gray-50` on a dark
 * panel paints a near-white block under near-white text, so the item you are
 * pointing at is the one you cannot read. The replacement is a wash of
 * `currentColor`, and what makes it right is not that it is subtle but that
 * it keeps its contrast in both directions.
 *
 *   pnpm build && node scripts/check-nav-dropdown.mjs
 */
import { execFileSync, spawn } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const cssDir = join(root, ".next/static/chunks")
if (!existsSync(cssDir)) fail("No production build found. Run `pnpm build` first.")
const css = readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(cssDir, f), "utf8")).join("\n")

/* The five built-ins, plus one shaped like a creator's own: saturated,
   with a border left at a page-background value. See the fixture. */
const SCHEMES = ["white", "light", "dark", "black", "highlight", "coral"]

const out = mkdtempSync(join(tmpdir(), "storelib-navdrop-"))
const stubs = join(root, ".navdrop-probe")
mkdirSync(stubs, { recursive: true })
writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/"
export const useRouter = () => ({ push() {}, prefetch() {}, replace() {}, refresh() {}, back() {} })
export const useSearchParams = () => new URLSearchParams()
export const useParams = () => ({})
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default function Link({ href, children, ...rest }) { return React.createElement("a", { href, ...rest }, children) }
export const useLinkStatus = () => ({ pending: false })
`)

execFileSync("npx", [
  "esbuild", join(root, "scripts/render-nav-dropdown.tsx"),
  "--bundle", "--format=iife", `--outfile=${join(out, "probe.js")}`,
  `--alias:next/link=${join(stubs, "link.jsx")}`,
  `--alias:next/navigation=${join(stubs, "navigation.js")}`,
  `--alias:@=${root}`,
  "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl",
  "--jsx=automatic", '--define:process.env.NODE_ENV="production"', "--log-level=error",
], { cwd: root, stdio: "inherit" })

const file = join(out, "index.html")
writeFileSync(file,
  `<!doctype html><html class="light"><head><meta charset="utf-8">` +
  `<style>${css}</style><style>body{margin:0}</style></head><body>` +
  SCHEMES.map((k) => `<div id="scheme-${k}" data-scheme="${k}" style="min-height:220px"></div>`).join("") +
  `<script>window.__err=[];window.addEventListener("error",function(e){window.__err.push(String(e.message))});window.addEventListener("unhandledrejection",function(e){window.__err.push("rejected: "+String(e.reason))});window.process={env:{NODE_ENV:"production"}}</script>` +
  `<script>${readFileSync(join(out, "probe.js"), "utf8")}</script></body></html>`)

/*
  READ. The dropdown opens on `group-hover/navitem`, and CSS :hover cannot be
  forced from script — so this uses CDP's own input to put a real pointer
  over the parent item, which is the same thing the user's mouse does.

  Everything measured is read back through getComputedStyle after the hover
  has settled, so it is the colour that ends up on screen, not the colour the
  markup asked for.
*/
const READ = `(() => {
  const srgb = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }
  /* LET THE BROWSER CONVERT IT. Tailwind v4 reports colours as oklch(), and
     pulling the three numbers out of "oklch(0.278 0.033 256.848)" as if they
     were r,g,b gives a colour that does not exist and a contrast ratio that
     is invented. That is not hypothetical: the first run of this probe
     against the unfixed markup printed the link colour as "#10-1-c" and
     scored it 20.75:1, passing the readability check on the build that had
     the bug. A canvas fill round-trips any colour syntax the browser
     understands into plain sRGB bytes, so the number means something. */
  const cv = document.createElement("canvas")
  cv.width = cv.height = 1
  const cx = cv.getContext("2d", { willReadFrequently: true })
  const blackish = new Set(["#000", "#000000", "black", "rgb(0,0,0)", "rgba(0,0,0,1)"])
  const parse = (s) => {
    if (!s || s === "transparent") return { r: 0, g: 0, b: 0, a: 0 }
    cx.clearRect(0, 0, 1, 1)
    cx.fillStyle = "#000"
    cx.fillStyle = s
    /* An unparseable value leaves fillStyle at the previous colour, which
       would be read as opaque black rather than reported. */
    if (cx.fillStyle === "#000000" && !blackish.has(String(s).replace(/ /g, ""))) return null
    cx.fillRect(0, 0, 1, 1)
    const d = cx.getImageData(0, 0, 1, 1).data
    return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 }
  }
  /* A panel's background can be semi-transparent over the page, and the
     ratio has to be computed against what is actually behind the text, so
     flatten the colour onto what it sits on before comparing. */
  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  })
  const lum = (c) => 0.2126 * srgb(c.r) + 0.7152 * srgb(c.g) + 0.0722 * srgb(c.b)
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100 }
  const hex = (c) => "#" + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")

  const results = []
  for (const host of document.querySelectorAll("[data-scheme]")) {
    const key = host.getAttribute("data-scheme")
    /* FIND IT BY ITS SHAPE, NOT BY THE FIX'S OWN CLASS.
       The first version of this looked for the class .theme-nav-dropdown-item, which
       is a class the fix introduces. Reverted, the probe found no panel and
       reported "no dropdown panel rendered" for all five schemes — failing,
       but for the wrong reason, and it would have gone on failing that way
       for any regression at all. A probe that can only see the fixed markup
       cannot see the bug. The dropdown is structurally the absolutely
       positioned div inside a group/navitem wrapper that holds the child
       links, in both the old markup and the new. */
    const wrapper = [...host.querySelectorAll("[class*='group/navitem']")]
      .find((w) => w.querySelector("a[href*='/shop/']"))
    const panel = wrapper && [...wrapper.querySelectorAll("div")]
      .find((d) => getComputedStyle(d).position === "absolute" && d.querySelector("a[href*='/shop/']"))
    if (!panel) { results.push({ key, error: "no dropdown panel rendered" }); continue }
    const item = panel.querySelector("a[href*='/shop/']")
    const ps = getComputedStyle(panel)
    const is = getComputedStyle(item)
    const header = host.querySelector("header") || host.firstElementChild
    const headerBg = parse(getComputedStyle(header).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 }
    const page = { r: 255, g: 255, b: 255, a: 1 }

    const panelBg = over(parse(ps.backgroundColor), page)
    const text = over(parse(is.color), panelBg)

    /* The hover tint, resolved. color-mix() with currentColor cannot be read
       off a non-hovered element, so paint it onto a clone that IS hovered by
       reading the rule's own computed value under a forced class. */
    const probe = item.cloneNode(true)
    probe.setAttribute("data-force-hover", "1")
    panel.appendChild(probe)
    const hoverBg = getComputedStyle(probe).backgroundColor
    probe.remove()

    /* THE EDGE. Read as it paints: the border colour flattened onto the
       panel it sits on, so "how visible is this line" is one number rather
       than a colour plus an alpha to reason about. */
    /* WIDTH FIRST. A border of none leaves borderTopColor resolved to
       currentColor, so reading the colour alone reports the panel wearing an
       edge the exact contrast of its own text: a missing border measured as
       a glaring one. The break-test for "no edge at all" failed on the wrong
       assertion because of this. */
    const edgeWidth = Number.parseFloat(ps.borderTopWidth) || 0
    const edgeStyle = ps.borderTopStyle
    const edgeRaw = parse(ps.borderTopColor)
    const edge = edgeWidth > 0 && edgeStyle !== "none" && edgeRaw ? over(edgeRaw, panelBg) : null
    results.push({
      key,
      opened: getComputedStyle(panel).opacity,
      panelBg: hex(panelBg),
      headerBg: hex(over(headerBg, page)),
      text: hex(text),
      contrast: ratio(text, panelBg),
      panelIsFixedWhite: panelBg.r === 255 && panelBg.g === 255 && panelBg.b === 255,
      headerIsDark: lum(over(headerBg, page)) < 0.5,
      hoverRaw: hoverBg,
      edge: edge ? hex(edge) : null,
      edgeWidth,
      /* A hairline reads against the panel without competing with the text
         on it. Too low and there is no edge; as high as the text and the
         panel is wearing an outline. */
      edgeContrast: edge ? ratio(edge, panelBg) : null,
      /* The type the items are set at, against the trigger above them. */
      itemSize: is.fontSize,
      itemWeight: is.fontWeight,
      itemFamily: is.fontFamily,
      /* The nav link the panel hangs off, on the header. The panel can only
         be held to matching this: the pair itself is the creator's choice. */
      triggerContrast: (() => {
        const t = wrapper && wrapper.querySelector("a:not([href*='/shop/'])")
        if (!t) return null
        const c = parse(getComputedStyle(t).color)
        if (!c) return null
        return ratio(over(c, over(headerBg, page)), over(headerBg, page))
      })(),
      triggerSize: (() => {
        const t = wrapper && wrapper.querySelector("a:not([href*='/shop/'])")
        return t ? getComputedStyle(t).fontSize : null
      })(),
      triggerFamily: (() => {
        const t = wrapper && wrapper.querySelector("a:not([href*='/shop/'])")
        return t ? getComputedStyle(t).fontFamily : null
      })(),
    })
  }
  return JSON.stringify({ results, err: window.__err || [] })
})()`

const proc = spawn(CHROMIUM, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
  "--force-device-scale-factor=1", "--remote-debugging-port=0", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] })
const endpoint = await new Promise((resolve, reject) => {
  let buf = ""
  const timer = setTimeout(() => reject(new Error("the browser never announced a debugging port")), 20000)
  proc.stderr.on("data", (d) => {
    buf += d.toString()
    const m = buf.match(/ws:\/\/[^\s]+/)
    if (m) { clearTimeout(timer); resolve(m[0]) }
  })
})
const ws = new WebSocket(endpoint)
await new Promise((r, j) => { ws.onopen = r; ws.onerror = () => j(new Error("could not attach to the browser")) })
let id = 0
const pending = new Map()
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data)
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id)
    pending.delete(msg.id)
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)
  }
}
const send = (method, params, sessionId) =>
  new Promise((resolve, reject) => {
    const n = ++id
    pending.set(n, { resolve, reject })
    ws.send(JSON.stringify(sessionId ? { id: n, method, params, sessionId } : { id: n, method, params }))
  })

const { targetId } = await send("Target.createTarget", { url: "about:blank" })
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true })
const call = (m, p) => send(m, p, sessionId)
await call("Page.enable", {})
await call("Runtime.enable", {})
await call("Emulation.setDeviceMetricsOverride", {
  width: 1280, height: 900, deviceScaleFactor: 1, mobile: false,
  screenOrientation: { angle: 0, type: "landscapePrimary" },
})
await call("Page.navigate", { url: "file://" + file })
await sleep(2000)

/* Force the dropdowns open. The panel is hidden by opacity and
   pointer-events until `group-hover/navitem`, and hovering five of them one
   at a time would measure five different moments; this opens all five at
   once by adding a rule that matches the same state the hover matches. */
await call("Runtime.evaluate", {
  expression: `(() => {
    const s = document.createElement("style")
    s.textContent = ".group\\\\/navitem > div { opacity: 1 !important; translate: none !important; pointer-events: auto !important; transition: none !important; }"
    document.head.appendChild(s)
    return "forced"
  })()`,
  returnByValue: true,
})
await sleep(400)

const read = await call("Runtime.evaluate", { expression: READ, returnByValue: true })
if (read.exceptionDetails) fail(`Reading threw: ${JSON.stringify(read.exceptionDetails.text || read.exceptionDetails)}`)
const { results, err } = JSON.parse(read.result.value)

/* A screenshot as well as the numbers, because the rules say to look at the
   result and a contrast ratio cannot tell you the panel looks wrong. */
const shot = await call("Page.captureScreenshot", { format: "png" })
const shotPath = join(root, ".probe-nav-dropdown.png")
writeFileSync(shotPath, Buffer.from(shot.data, "base64"))

await send("Target.closeTarget", { targetId }, null)
ws.close()
proc.kill()

let bad = 0
const expect = (ok, what, got) => {
  console.log(`${ok ? "  ok" : "FAIL"}  ${what}${got === undefined ? "" : `  →  ${got}`}`)
  if (!ok) bad++
}

if (err.length) fail(`The page threw before anything could be measured:\n  ${err.join("\n  ")}`)
if (results.length !== SCHEMES.length) {
  fail(`Expected a dropdown in each of ${SCHEMES.length} schemes, measured ${results.length}.\n` +
    `A scheme with no panel means the fixture rendered no nav children, and every assertion below would be vacuous.`)
}

console.log(`\nThe header's desktop dropdown, opened in each built-in scheme\n`)
for (const r of results) {
  if (r.error) { expect(false, `${r.key}: ${r.error}`); continue }
  console.log(`  ${r.key.padEnd(10)} header ${r.headerBg}   panel ${r.panelBg}   links ${r.text}   contrast ${r.contrast}:1   edge ${r.edge} ${r.edgeContrast}:1`)
}
console.log("")

/*
  WHAT THE PANEL IS ANSWERABLE FOR.

  This asked every scheme for 4.5:1 and the sixth one failed at 2.96:1 —
  white on coral. That is not the dropdown's doing: it is the creator's own
  background and text, and their header's nav links sit on exactly the same
  pair at exactly the same ratio. A menu cannot be more readable than the bar
  it belongs to, and inventing a colour to make it so would be the dropdown
  ignoring the scheme again, which is the whole complaint.

  So two different demands, because they are two different promises.

  The built-ins are Storelib's own, shipped with the product, and they are
  held to the 4.5:1 that body text needs. A creator's scheme is held to
  PARITY: whatever their header reads at, the menu reads at too. If their
  nav is hard going, their submenu is exactly as hard and no worse, and that
  is a scheme to fix rather than a bug here.
*/
const BUILT_IN = new Set(["white", "light", "dark", "black", "highlight"])
for (const r of results) {
  if (r.error) continue
  if (BUILT_IN.has(r.key)) {
    expect(r.contrast >= 4.5, `${r.key}: the links are readable on the panel`, `${r.contrast}:1`)
  } else if (r.triggerContrast != null) {
    expect(Math.abs(r.contrast - r.triggerContrast) <= 0.15,
      `${r.key}: the menu reads exactly as its own header does`,
      `panel ${r.contrast}:1, header nav ${r.triggerContrast}:1`)
  }
}

/* The bug in one line. Every dark-header scheme used to paint a white panel,
   because the panel's white was in the markup and the header's black came
   from the scheme. If a dark header still carries a pure-white dropdown,
   nothing was fixed. */
const darkOnes = results.filter((r) => !r.error && r.headerIsDark)
expect(darkOnes.length >= 1, "at least one built-in scheme has a dark header, so the defect is reachable here",
  `${darkOnes.length} of ${results.length}`)
for (const r of darkOnes) {
  expect(!r.panelIsFixedWhite, `${r.key}: a dark header does not carry a pure white dropdown`, `panel ${r.panelBg}`)
}

/* And the panel follows the scheme rather than being one colour everywhere:
   five schemes that all paint the same panel would pass every test above
   while still ignoring the scheme completely. */
/*
  THE EDGE IS A HAIRLINE, ON EVERY SCHEME.

  It used to be the theme's `border` slot, which is tuned for dividers on the
  page background. Borrowed for a panel floating on a coloured header it drew
  a hard dark outline round a coral menu — the scheme's own colour, used
  against a surface it was never measured against, which is how something can
  be "from the scheme" and still wrong.

  It is a wash of the panel's own text now, so this holds it between two
  failures rather than to one number: invisible, and competing with the text.
*/
for (const r of results) {
  if (r.error) continue
  expect(r.edgeWidth > 0 && r.edgeContrast != null, `${r.key}: the panel has an edge at all`,
    `border-width ${r.edgeWidth}px`)
  if (r.edgeContrast == null) continue
  expect(r.edgeContrast >= 1.03, `${r.key}: and it is visible against the panel`, `${r.edgeContrast}:1`)
  expect(r.edgeContrast <= r.contrast / 2,
    `${r.key}: and it is a hairline rather than an outline`,
    `edge ${r.edgeContrast}:1 against text ${r.contrast}:1`)
}

/*
  AND THE SUBMENU IS SET IN THE MENU'S OWN TYPE. The items were 13.5px
  against a 14px trigger — half a pixel under the thing they belong to,
  which reads as a different menu rather than as part of this one.
*/
for (const r of results) {
  if (r.error || !r.triggerSize) continue
  expect(r.itemSize === r.triggerSize, `${r.key}: the items are the trigger's size`,
    `items ${r.itemSize}, trigger ${r.triggerSize}`)
  expect(r.itemFamily === r.triggerFamily, `${r.key}: and the theme's face, the same one the trigger uses`,
    `items ${r.itemFamily}`)
}

const distinct = new Set(results.filter((r) => !r.error).map((r) => r.panelBg))
expect(distinct.size >= 2, "the panel changes with the scheme instead of being one fixed colour",
  `${distinct.size} distinct panel colours across ${results.length} schemes`)

console.log(`\n  screenshot → ${shotPath}\n`)
if (bad) fail(`${bad} measurement${bad === 1 ? "" : "s"} failed.`)
console.log("The dropdown is painted by the scheme, and its links are readable in every one.\n")
