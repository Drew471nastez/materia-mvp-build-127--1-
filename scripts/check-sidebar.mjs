/**
 * ===========================================================================
 *  THE /app SIDEBAR, MEASURED
 * ===========================================================================
 * The requirement was a rail whose rows are the same size in every state —
 * resting, hovered, active — so nothing moves or resizes as you navigate.
 * That is a claim about pixels, and the only way to check a claim about
 * pixels is to measure them.
 *
 *   pnpm build && node scripts/check-sidebar.mjs
 *
 * The build matters: the row geometry is written in arbitrary Tailwind values
 * — `h-[38px]`, `rounded-[12px]`, `px-[14px]` — and Tailwind only emits those
 * if it has scanned the file that uses them. Measured against a stale
 * stylesheet the rows come back with `border-radius: 0` and no padding, which
 * is what the first run of this reported.
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const out = mkdtempSync(join(tmpdir(), "storelib-sidebar-"))

const fail = (m) => {
  console.error(m)
  process.exit(1)
}
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}. Set CHROMIUM=/path/to/chromium.`)

const cssDir = join(root, ".next/static/chunks")
if (!existsSync(cssDir)) fail("No production build found. Run `pnpm build` first.")
const css = readdirSync(cssDir)
  .filter((f) => f.endsWith(".css"))
  .map((f) => readFileSync(join(cssDir, f), "utf8"))
  .join("\n")
if (!/border-radius:\s*12px/.test(css)) {
  fail("The built CSS predates the sidebar's own classes. Run `pnpm build` again.")
}
writeFileSync(join(out, "app.css"), css)

/**
 * `next/link` and `next/navigation` resolve through export conditions only a
 * bundler sets, so they are aliased to the two things the sidebar needs from
 * them: an anchor, and a pathname.
 *
 * INSIDE THE PROJECT, not in the temp directory with everything else — the
 * Link stub imports React, and esbuild resolves a bare specifier by walking up
 * from the importing FILE. From /tmp there is no node_modules to find, and the
 * bundle fails with "Could not resolve react".
 */
const stubs = join(root, ".sidebar-probe")
mkdirSync(stubs, { recursive: true })
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default function Link({ href, children, ...rest }) {
  return React.createElement("a", { href, ...rest }, children)
}
`)
writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => globalThis.__PATHNAME__ ?? "/app"
export const useRouter = () => ({ push() {}, prefetch() {} })
`)

const PROBE = `<script>
function box(el) {
  const r = el.getBoundingClientRect(), c = getComputedStyle(el)
  return { h: Math.round(r.height), w: Math.round(r.width), radius: c.borderRadius,
           pad: c.paddingLeft + "/" + c.paddingRight, gap: c.columnGap, fs: c.fontSize,
           lh: c.lineHeight, ls: c.letterSpacing, family: c.fontFamily,
           fw: c.fontWeight, color: c.color, bg: c.backgroundColor }
}
function run() {
  const rail = document.getElementById("rail")
  const rows = [...rail.querySelectorAll("a,button,span")]
    .filter((el) => String(el.className).includes("h-[38px]"))
  const nav = rail.querySelector("nav")
  const chev = rail.querySelector("[aria-expanded]")
  const sub = rail.querySelector("[aria-hidden]")
  const out = {
    railWidth: Math.round(rail.getBoundingClientRect().width),
    navPadding: getComputedStyle(nav).paddingLeft + "/" + getComputedStyle(nav).paddingRight,
    rows: rows.map((el) => ({ label: el.textContent.trim().slice(0, 18), ...box(el) })),
    icons: [...rail.querySelectorAll("span.h-5.w-5")].map((el) => {
      const svg = el.querySelector("svg")
      const b = el.getBoundingClientRect(), s = svg ? svg.getBoundingClientRect() : { width: 0, height: 0 }
      /*
        Phosphor draws a filled icon as paths that fill and do not stroke, and
        an outline one as paths that stroke and do not fill.

        EVERY Phosphor svg opens with a transparent 256×256 rect — a spacer,
        with neither fill nor stroke. Reading the FIRST shape therefore said
        "filled" for all eleven icons, and the stroke assertion beside it then
        passed over an empty set. So: look at every shape, ignore the ones
        that paint nothing, and ask what is left.
      */
      const shapes = svg ? [...svg.querySelectorAll("path, circle, rect, line, polyline, polygon")] : []
      const painted = shapes
        .map((el) => getComputedStyle(el))
        .filter((c) => c.stroke !== "none" || (c.fill !== "none" && c.fill !== "rgba(0, 0, 0, 0)"))
      return { box: Math.round(b.width) + "x" + Math.round(b.height),
               glyph: Math.round(s.width) + "x" + Math.round(s.height),
               painted: painted.length,
               outline: el.getAttribute("data-nav-icon") === "outline",
               stroke: painted.find((c) => c.stroke !== "none")?.strokeWidth ?? "none" }
    }),
    dashboardIconPath: (() => {
      const first = rail.querySelector("[data-nav-icon] svg path")
      return first ? first.getAttribute("d").slice(0, 60) : null
    })(),
    chevron: chev && { w: Math.round(chev.getBoundingClientRect().width),
                       fromRight: Math.round(rail.getBoundingClientRect().right - chev.getBoundingClientRect().right),
                       transform: getComputedStyle(chev.querySelector("svg")).transform },
    submenu: sub && { rows: getComputedStyle(sub).gridTemplateRows,
                      opacity: getComputedStyle(sub).opacity,
                      height: Math.round(sub.getBoundingClientRect().height) },
  }
  document.getElementById("out").textContent = JSON.stringify(out)
}
if (document.readyState === "complete") run(); else addEventListener("load", run)
</script>`

try {
  execFileSync(
    "npx",
    [
      "esbuild",
      join(root, "scripts/render-sidebar-probe.tsx"),
      "--bundle",
      "--platform=node",
      "--format=cjs",
      `--outfile=${join(out, "probe.cjs")}`,
      `--alias:next/link=${join(stubs, "link.jsx")}`,
      `--alias:next/navigation=${join(stubs, "navigation.js")}`,
      `--alias:@=${root}`,
      "--loader:.jsx=jsx",
      "--jsx=automatic",
      "--log-level=error",
    ],
    { cwd: root, stdio: "inherit" },
  )
  execFileSync("node", [join(out, "probe.cjs")], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, OUT_DIR: out },
  })

  let broken = 0
  const expect = (ok, what, got) => {
    console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok ? "" : `   ${got}`}`)
    if (!ok) broken++
  }

  const pathData = {}
  for (const name of ["closed", "open", "elsewhere"]) {
    const file = join(out, `sidebar-${name}.html`)
    writeFileSync(file, readFileSync(file, "utf8").replace("</pre>", "</pre>" + PROBE))
    const dom = execFileSync(
      CHROMIUM,
      ["--headless=new", "--no-sandbox", "--disable-gpu", "--window-size=900,1000",
       "--virtual-time-budget=4000", "--dump-dom", `file://${file}`],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] },
    )
    const match = dom.match(/<pre id="out">([^<]*)</)
    if (!match || match[1] === "pending") fail(`No measurement came back for ${name}.`)
    const m = JSON.parse(match[1])

    console.log(`\nproducts ${name}`)
    expect(m.railWidth === 240, "the rail is 240px", m.railWidth)
    expect(m.navPadding === "7px/7px", "with 7px of gutter", m.navPadding)

    const rows = m.rows
    expect(rows.length >= 10, "every row measured", rows.length)
    expect(rows.every((r) => r.h === 38), "every row is 38px tall", JSON.stringify(rows.map((r) => r.h)))
    expect(new Set(rows.map((r) => r.w)).size === 1, "and exactly as wide as every other", JSON.stringify([...new Set(rows.map((r) => r.w))]))
    expect(rows.every((r) => r.radius === "12px"), "with a 12px radius", rows.find((r) => r.radius !== "12px")?.radius)
    expect(rows.every((r) => r.gap === "8px"), "an 8px gap", rows.find((r) => r.gap !== "8px")?.gap)
    expect(rows.every((r) => r.fs === "16px" || r.fs === "14px"), "and 16px type", rows.find((r) => r.fs !== "16px" && r.fs !== "14px")?.fs)
    expect(rows.every((r) => r.lh === "24px"), "on a 24px line", rows.find((r) => r.lh !== "24px")?.lh)
    expect(rows.every((r) => r.ls === "-0.16px"), "tracked in a hair", rows.find((r) => r.ls !== "-0.16px")?.ls)
    expect(rows.every((r) => /Inter/.test(r.family)), "in Inter", rows[0]?.family)

    const active = rows.filter((r) => r.bg === "rgb(232, 232, 232)")
    expect(active.length === 1, "one row is active", active.length)
    expect(active[0]?.color === "rgb(32, 32, 32)" && active[0]?.fw === "600", "and it is #202020 at weight 600", JSON.stringify(active[0]))
    const resting = rows.filter((r) => r.bg === "rgba(0, 0, 0, 0)" && r.color === "rgb(102, 102, 102)")
    expect(resting.length >= 6, "the rest are #666666 on nothing", resting.length)
    expect(resting.every((r) => r.fw === "450"), "at weight 450, not a rounded 400 or 500", JSON.stringify([...new Set(resting.map((r) => r.fw))]))

    expect(m.icons.every((i) => i.box === "20x20"), "every icon box is 20×20", JSON.stringify(m.icons.map((i) => i.box)))
    expect(m.icons.every((i) => i.glyph === "20x20"), "every glyph is 20×20 in every state", JSON.stringify(m.icons.map((i) => i.glyph)))
    expect(
      m.icons.every((i) => i.painted > 0),
      "every icon paints something",
      JSON.stringify(m.icons.map((i) => i.painted)),
    )
    pathData[name] = m.dashboardIconPath
    expect(
      m.icons.filter((i) => i.outline).length === m.icons.length - 1,
      "exactly one icon is marked filled and the rest outline",
      JSON.stringify(m.icons.map((i) => (i.outline ? "outline" : "filled"))),
    )
    expect(
      m.icons.filter((i) => i.outline).every((i) => i.stroke === "2.4px"),
      "and every outline one carries the ~15% thickening stroke",
      JSON.stringify(m.icons.map((i) => i.stroke)),
    )
    expect(
      m.icons.filter((i) => !i.outline).every((i) => i.stroke === "none" || i.stroke === "0px"),
      "which the filled one does not need",
      JSON.stringify(m.icons.filter((i) => !i.outline).map((i) => i.stroke)),
    )

    expect(m.chevron.w === 20 && m.chevron.fromRight === 18, "the chevron is a fixed box pinned right", JSON.stringify(m.chevron))
    const turned = m.chevron.transform.startsWith("matrix(-1")
    expect(name === "open" ? turned : !turned, `and is ${name === "open" ? "turned over" : "upright"}`, m.chevron.transform)
    expect(
      name === "open" ? m.submenu.height > 0 && m.submenu.opacity === "1" : m.submenu.height === 0 && m.submenu.opacity === "0",
      `the submenu is ${name === "open" ? "open" : "closed"}`,
      JSON.stringify(m.submenu),
    )
  }

  /**
   * THE ONE THING THE ATTRIBUTES CANNOT TELL US.
   *
   * `data-nav-icon="filled"` is something this code sets, so checking it only
   * proves the code agrees with itself. What matters is whether Phosphor
   * actually hands back a different SHAPE — so the same icon is rendered on
   * the route it belongs to and on another one, and its path data has to
   * differ. It is a house and a solid house, and they are not the same
   * outline.
   */
  console.log("\nthe filled variant is a different glyph, not the same one restyled")
  const changed = pathData.closed && pathData.elsewhere && pathData.closed !== pathData.elsewhere
  console.log(`  ${changed ? "ok  " : "FAIL"}  the dashboard icon differs between active and resting`)
  if (!changed) {
    broken++
    console.log(`        ${pathData.closed}\n        ${pathData.elsewhere}`)
  }

  console.log(`\n${broken === 0 ? "the rail holds its shape" : `${broken} failed`}`)
  process.exit(broken === 0 ? 0 : 1)
} finally {
  rmSync(out, { recursive: true, force: true })
  rmSync(join(root, ".sidebar-probe"), { recursive: true, force: true })
}
