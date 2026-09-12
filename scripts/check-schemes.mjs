/**
 * ===========================================================================
 *  DOES THE COLOUR SCHEME ACTUALLY REACH THE SECTION, AND DOES THE TYPE
 * ===========================================================================
 * "Ensure the typography and colour schemes and all the controls of colours
 * and type work in every section, nothing corrupted, nothing missing."
 *
 * A control that is wired to nothing looks exactly like a control that is
 * wired to something, right up until you change it. So every shipped section
 * is drawn once per colour scheme and once per type style by real Chromium
 * with the theme's own stylesheet, and the pixels are compared:
 *
 *   - the five schemes must give a section five distinct paint jobs
 *   - the four heading styles must give its headings four distinct sizes
 *   - the four body styles must do the same for its text
 *   - `custom` must land the numbers it was given, not the preset's
 *
 * A section that paints the same under `white` and `black` is a section whose
 * colour control does nothing, and it is named here rather than discovered by
 * a creator who has just spent an afternoon on it.
 *
 *   pnpm build && node scripts/check-schemes.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
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
mkdirSync(stubs, { recursive: true })
writeFileSync(join(stubs, "link.jsx"), `import React from "react"\nexport default function Link({ href, children, ...rest }) { return React.createElement("a", { href, ...rest }, children) }\n`)
writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/"\nexport const useRouter = () => ({ push() {}, replace() {}, refresh() {}, prefetch() {} })\nexport const useSearchParams = () => new URLSearchParams()\n`)

const out = mkdtempSync(join(tmpdir(), "storelib-scheme-"))
const bundle = join(out, "probe.js")
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-scheme-probe.tsx"),
  "--bundle", "--platform=node", "--format=cjs", "--jsx=automatic", "--log-level=error", `--outfile=${bundle}`,
  `--alias:next/link=${join(stubs, "link.jsx")}`, `--alias:next/navigation=${join(stubs, "navigation.js")}`, `--alias:@=${root}`],
  { stdio: ["ignore", "ignore", "inherit"] })
execFileSync("node", [bundle], { env: { ...process.env, OUT_DIR: out }, stdio: ["ignore", "ignore", "inherit"] })

const PIC = "data:image/svg+xml;base64," + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900"><rect width="1200" height="900" fill="#8b5cf6"/></svg>').toString("base64")
const body = readFileSync(join(out, "page.html"), "utf8").replace(/src="https:\/\/example\.invalid\/[^"]*"/g, `src="${PIC}"`)

const MEASURE = `
<script>
(function () {
  /** The first background you meet walking up from here that is not see-through. */
  function painted(el) {
    for (var n = el; n && n !== document.documentElement; n = n.parentElement) {
      var c = getComputedStyle(n).backgroundColor
      if (c && c !== "transparent" && !/rgba\\(0, 0, 0, 0\\)/.test(c)) return c
    }
    return "rgb(255, 255, 255)"
  }
  var rows = []
  document.querySelectorAll(".probe").forEach(function (box) {
    /**
     * THE SECTION, NOT THE WRAPPER AROUND IT. A .storelib section paints on
     * its own section.s element from a --s-bg it sets inline from the
     * scheme. The dispatcher's outer [data-section] div has no background
     * at all, so measuring that reads the white of the page behind it — and
     * reports every section as ignoring every scheme, which is what an
     * earlier version of this did.
     */
    /**
     * ONE SELECTOR AT A TIME, IN ORDER OF PREFERENCE. A comma list hands back
     * the first match in DOCUMENT ORDER, not the first selector's match — so
     * "section.s, [data-section]" returns the wrapper, which has no
     * background, and every section reads as white under every scheme. That
     * is what an earlier version of this reported, about all thirty of them.
     */
    var root = null
    var want = ["section.s", "[data-section] section", "section", "[data-section]"]
    for (var i = 0; i < want.length && !root; i++) root = box.querySelector(want[i])
    if (!root) return
    /**
     * EVERY heading and EVERY paragraph, not the first one.
     *
     * A section legitimately holds text that is not the section's body: a
     * card title, an eyebrow, a price, a badge. Those keep their own size on
     * purpose, and measuring whichever happened to come first reported a
     * working control as dead — eleven times, the first time this ran.
     *
     * The question that is actually worth asking is whether ANY of a
     * section's text answers the control. If none of it does, the control is
     * wired to nothing.
     */
    var sig = function (nodes, props) {
      return Array.prototype.map.call(nodes, function (n) {
        var c = getComputedStyle(n)
        return props.map(function (p) { return c[p] }).join("|")
      }).join(" / ")
    }
    var headings = box.querySelectorAll("h1, h2, h3, h4, [data-heading]")
    var texts = box.querySelectorAll("p, li, [data-body]")
    var hs = headings.length ? sig(headings, ["fontSize", "fontWeight", "lineHeight", "letterSpacing", "textTransform", "fontFamily"]) : null
    var ts = texts.length ? sig(texts, ["fontSize", "fontWeight", "lineHeight", "letterSpacing", "fontFamily"]) : null
    rows.push({
      type: box.getAttribute("data-type"),
      axis: box.getAttribute("data-axis"),
      value: box.getAttribute("data-value"),
      bg: painted(root),
      fg: getComputedStyle(root).color,
      heading: hs,
      body: ts,
    })
  })
  document.title = "ROWS:" + rows.length
  var el = document.createElement("script")
  el.type = "application/json"
  el.id = "out"
  el.textContent = JSON.stringify(rows)
  document.body.appendChild(el)
})()
</script>`

const file = join(out, "page.html")
writeFileSync(file, `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style>
<style>.probe{contain:layout paint;width:1200px}</style></head><body>${body}${MEASURE}</body></html>`)
const dump = execFileSync(CHROMIUM, ["--headless", "--disable-gpu", "--no-sandbox",
  "--force-device-scale-factor=1", "--window-size=1200,900", "--virtual-time-budget=15000",
  "--dump-dom", `file://${file}`], { encoding: "utf8", maxBuffer: 200 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] })
const m = /<script type="application\/json" id="out">([\s\S]*?)<\/script>/.exec(dump)
if (!m) fail("The probe never reported. Chromium rendered nothing usable.")
const rows = JSON.parse(m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"))
if (!rows.length) fail("No sections were measured.")

const by = (t, axis) => rows.filter((r) => r.type === t && r.axis === axis)
const types = [...new Set(rows.map((r) => r.type))]

const deaf = { scheme: [], heading: [], body: [] }
for (const t of types) {
  const s = by(t, "scheme")
  if (s.length > 1 && new Set(s.map((r) => `${r.bg}/${r.fg}`)).size === 1) deaf.scheme.push(`${t} (${s[0].bg} under every scheme)`)

  const h = by(t, "heading").filter((r) => r.heading)
  if (h.length > 1 && new Set(h.map((r) => r.heading)).size === 1) deaf.heading.push(`${t} (${h[0].heading.split("|")[0]} whatever is chosen)`)

  const b = by(t, "body").filter((r) => r.body)
  if (b.length > 1 && new Set(b.map((r) => r.body)).size === 1) deaf.body.push(`${t} (${b[0].body.split("|")[0]} whatever is chosen)`)
}

/** `custom` has to land the numbers it was handed, not the preset's. */
const CUSTOM_HEADING_PX = "41px"
const CUSTOM_BODY_PX = "19px"
const customMissed = { heading: [], body: [] }
for (const t of types) {
  const h = by(t, "heading").find((r) => r.value === "custom" && r.heading)
  if (h && !h.heading.split(" / ").some((n) => n.split("|")[0] === CUSTOM_HEADING_PX)) customMissed.heading.push(`${t} (${h.heading.split(" / ")[0].split("|")[0]}, asked for ${CUSTOM_HEADING_PX})`)
  const b = by(t, "body").find((r) => r.value === "custom" && r.body)
  if (b && !b.body.split(" / ").some((n) => n.split("|")[0] === CUSTOM_BODY_PX)) customMissed.body.push(`${t} (${b.body.split(" / ")[0].split("|")[0]}, asked for ${CUSTOM_BODY_PX})`)
}

const withHeading = types.filter((t) => by(t, "heading").some((r) => r.heading)).length
const withBody = types.filter((t) => by(t, "body").some((r) => r.body)).length
console.log(`
  ${types.length} sections drawn, ${rows.length} renderings measured.
  ${withHeading} have a heading the type control can reach; ${withBody} have body text.
`)

const problems = []
const list = (label, xs) => `${label}:\n${xs.map((x) => `      - ${x}`).join("\n")}`
if (deaf.scheme.length) problems.push(list(`${deaf.scheme.length} section(s) paint the same under every colour scheme`, deaf.scheme))
if (deaf.heading.length) problems.push(list(`${deaf.heading.length} section(s) ignore the heading style`, deaf.heading))
if (deaf.body.length) problems.push(list(`${deaf.body.length} section(s) ignore the body style`, deaf.body))
if (customMissed.heading.length) problems.push(list(`${customMissed.heading.length} section(s) ignore a custom heading`, customMissed.heading))
if (customMissed.body.length) problems.push(list(`${customMissed.body.length} section(s) ignore a custom body`, customMissed.body))

if (problems.length) fail(problems.map((p) => `  ✗ ${p}`).join("\n\n"))
console.log("  Every section answers the colour scheme, the heading style, the body style, and a custom one.\n")
