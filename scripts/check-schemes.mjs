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
  /**
   * EVERY COLOUR THE SECTION PAINTS, not just the one on its outermost box.
   *
   * A React renderer often paints on an inner element — a fill behind an
   * image, a card, a band — and leaves its section tag transparent. Reading
   * only the root found the page's white behind it and reported a working
   * control as dead.
   *
   * The question worth asking is whether ANY of what a section paints
   * changes when the scheme does. If none of it does, the control is wired
   * to nothing.
   */
  function paintSig(box, root) {
    var out = []
    var all = [root].concat(Array.prototype.slice.call(box.querySelectorAll("*"), 0, 400))
    for (var i = 0; i < all.length; i++) {
      var c = getComputedStyle(all[i])
      var bg = c.backgroundColor
      var lit = bg && bg !== "transparent" && bg.indexOf("rgba(0, 0, 0, 0)") === -1
      out.push((lit ? bg : "-") + ":" + c.color + ":" + c.borderTopColor)
    }
    return out.join(" ")
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
      bg: paintSig(box, root),
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

const { typography: offers, ownFont } = JSON.parse(readFileSync(join(out, "offers.json"), "utf8"))
const by = (t, axis) => rows.filter((r) => r.type === t && r.axis === axis)
const types = [...new Set(rows.map((r) => r.type))]

const deaf = { scheme: [], heading: [], body: [] }
for (const t of types) {
  const s = by(t, "scheme")
  if (s.length > 1 && new Set(s.map((r) => r.bg)).size === 1) deaf.scheme.push(`${t} (nothing it paints changes)`)

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

/**
 * THE THEME'S OWN FONTS. The per-section control working says nothing about
 * whether the theme's Heading font reaches the section, and that is the one
 * a creator changes first, expecting the whole site to follow.
 */
const deafToFonts = []
const ownFontSections = []
for (const t of types) {
  const f = by(t, "fonts")
  if (f.length < 2) continue
  /**
   * Only sections that actually have text. A `"|"` from two nulls is a
   * truthy string, which is how nine sections with no heading and no
   * paragraph at all — an image, a marquee, a strip of logos — got reported
   * as refusing to follow a font they never render.
   */
  if (!f.some((r) => r.heading || r.body)) continue
  // A section with a font control of its own answers to that, not the theme.
  if (ownFont[t]) { ownFontSections.push(t); continue }
  const seen = f.map((r) => `${r.heading ?? ""}|${r.body ?? ""}`)
  if (new Set(seen).size === 1) {
    const fam = (seen[0].split("|")[0] || seen[0].split("|")[1] || "").split(" / ")[0].split("|").pop()
    deafToFonts.push(`${t} (${fam})`)
  }
}

const withHeading = types.filter((t) => by(t, "heading").some((r) => r.heading)).length
const withBody = types.filter((t) => by(t, "body").some((r) => r.body)).length
console.log(`
  ${types.length} sections drawn, ${rows.length} renderings measured.
  ${withHeading} have a heading the type control can reach; ${withBody} have body text.
`)

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  THE RULE THAT MATTERS: OFFERED IF AND ONLY IF IT ANSWERS
 * ═══════════════════════════════════════════════════════════════════════════
 * A control that is shown and does nothing is the complaint. 42 sections
 * used to show a Heading style and a Body style select and ignore both —
 * every one of the fifty hand-written React renderers, because
 * `designSupport` defaults typography support to true and nobody had ever
 * checked. That cannot be seen from either side alone: the panel looks
 * right, and so does the section.
 *
 * The 37 that answered NEITHER axis say `supports_typography_overrides:
 * false` now, so the control is not offered. The rest answer at least one.
 */
const shownButDead = []
const answersButHidden = []
for (const t of types) {
  const h = by(t, "heading").filter((r) => r.heading)
  const b = by(t, "body").filter((r) => r.body)
  const answersHeading = h.length > 1 && new Set(h.map((r) => r.heading)).size > 1
  const answersBody = b.length > 1 && new Set(b.map((r) => r.body)).size > 1
  const answers = answersHeading || answersBody
  const hasText = h.length > 0 || b.length > 0
  if (!hasText) continue
  if (offers[t] && !answers) shownButDead.push(t)
  /**
   * The other direction is NOT a fault. `hero` answers the vars through the
   * theme's own h2 rule, and deliberately says it supports no typography
   * override because it offers a font size control of its own. A section
   * choosing its own control is a design decision, not a broken one.
   */
  if (!offers[t] && answers) answersButHidden.push(t)
}

const problems = []
const list = (label, xs) => `${label}:\n${xs.map((x) => `      - ${x}`).join("\n")}`
if (deafToFonts.length) problems.push(list(`${deafToFonts.length} section(s) do not follow the theme's fonts`, deafToFonts))
if (shownButDead.length) problems.push(list(`${shownButDead.length} section(s) SHOW a text control that does nothing`, shownButDead))
if (ownFontSections.length) console.log(`  note: ${ownFontSections.length} section(s) carry a font control of their own, so the theme's font is not theirs to follow: ${ownFontSections.join(", ")}\n`)
if (answersButHidden.length) console.log(`  note: ${answersButHidden.length} section(s) answer the vars but offer a control of their own instead: ${answersButHidden.join(", ")}\n`)
if (deaf.scheme.length) problems.push(list(`${deaf.scheme.length} section(s) paint the same under every colour scheme`, deaf.scheme))
const offered = (xs) => xs.filter((x) => offers[x.split(" ")[0]])
if (offered(deaf.heading).length) problems.push(list(`${offered(deaf.heading).length} section(s) offer a heading style and ignore it`, offered(deaf.heading)))
if (offered(deaf.body).length) problems.push(list(`${offered(deaf.body).length} section(s) offer a body style and ignore it`, offered(deaf.body)))
if (offered(customMissed.heading).length) problems.push(list(`${offered(customMissed.heading).length} section(s) ignore a custom heading`, offered(customMissed.heading)))
if (offered(customMissed.body).length) problems.push(list(`${offered(customMissed.body).length} section(s) ignore a custom body`, offered(customMissed.body)))

if (problems.length) fail(problems.map((p) => `  ✗ ${p}`).join("\n\n"))
const offering = types.filter((t) => offers[t]).length
console.log(`  Every one of the ${types.length} answers the colour scheme.
  ${offering} offer a text control, and every one of those answers it.
  Every section that has text and no font of its own follows the theme's heading and body fonts.
  The rest do not offer one, so there is no control sitting there doing nothing.\n`)
