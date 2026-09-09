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
  const sub = rail.querySelector("[data-nav-submenu]")
  const out = {
    railWidth: Math.round(rail.getBoundingClientRect().width),
    navPadding: getComputedStyle(nav).paddingLeft + "/" + getComputedStyle(nav).paddingRight,
    rows: rows.map((el) => ({ label: el.textContent.trim().slice(0, 18), ...box(el) })),
    icons: [...rail.querySelectorAll("span[data-nav-icon]")].map((el) => {
      const b = el.getBoundingClientRect()
      /*
        TWO SVGS PER BOX NOW — the outline weight and the fill weight, stacked
        and cross-faded, because a Phosphor weight is a different path and no
        CSS can transition one path into another.

        So every reading below is per LAYER. Asking the box for "its" svg, as
        this probe used to, now silently reads whichever one comes first in
        the DOM and reports the resting glyph for a row that is filled.
      */
      const layer = (variant) => {
        const svg = el.querySelector('svg[data-variant="' + variant + '"]')
        if (!svg) return null
        const cs = getComputedStyle(svg)
        const s = svg.getBoundingClientRect()
        /*
          EVERY Phosphor svg opens with a transparent 256×256 rect — a spacer,
          with neither fill nor stroke. Reading the FIRST shape therefore said
          "filled" for all eleven icons, and the stroke assertion beside it
          then passed over an empty set. So: look at every shape, ignore the
          ones that paint nothing, and ask what is left.
        */
        const painted = [...svg.querySelectorAll("path, circle, rect, line, polyline, polygon")]
          .map((n) => getComputedStyle(n))
          .filter((n) => n.stroke !== "none" || (n.fill !== "none" && n.fill !== "rgba(0, 0, 0, 0)"))
        return {
          glyph: Math.round(s.width) + "x" + Math.round(s.height),
          // Where the glyph sits inside its box, so a cross-fade cannot shift it.
          offset: Math.round(s.left - b.left) + "," + Math.round(s.top - b.top),
          opacity: cs.opacity,
          transition: cs.transitionProperty + " " + cs.transitionDuration,
          painted: painted.length,
          stroke: painted.find((n) => n.stroke !== "none")?.strokeWidth ?? "none",
          fill: painted.find((n) => n.fill !== "none" && n.fill !== "rgba(0, 0, 0, 0)") ? "solid" : "none",
          /*
            EVERY path, joined — not the first one.

            Phosphor's fill weight often keeps the outermost path and replaces
            only the inner ones: Package, Globe, Envelope and Wallet all open
            with identical path data. Reading path #1 said the two weights were
            the same glyph for four of the eight icons.
          */
          d: [...svg.querySelectorAll("path[d]")].map((n) => n.getAttribute("d")).join("|"),
        }
      }
      return {
        box: Math.round(b.width) + "x" + Math.round(b.height),
        active: el.getAttribute("data-nav-icon") === "filled",
        drawn: el.getAttribute("data-icon-drawn"),
        outline: layer("outline"),
        filled: layer("filled"),
      }
    }),
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
    expect(rows.every((r) => r.fs === "15px" || r.fs === "13px"), "and 15px type (13px for a sub-item)", rows.find((r) => r.fs !== "15px" && r.fs !== "13px")?.fs)
    expect(rows.every((r) => r.lh === "24px"), "on a 24px line", rows.find((r) => r.lh !== "24px")?.lh)
    const tracked = (r) => Math.abs(parseFloat(r.ls) / parseFloat(r.fs) + 0.01) < 0.0005
    expect(rows.every(tracked), "tracked -0.01em, whatever the size", JSON.stringify(rows.find((r) => !tracked(r)))) 
    expect(rows.every((r) => /Inter/.test(r.family)), "in Inter", rows[0]?.family)

    const active = rows.filter((r) => r.bg === "rgb(232, 232, 232)")
    expect(active.length === 1, "one row is active", active.length)
    expect(active[0]?.color === "rgb(32, 32, 32)" && active[0]?.fw === "575", "and it is #202020 at weight 575", JSON.stringify(active[0]))
    const resting = rows.filter((r) => r.bg === "rgba(0, 0, 0, 0)" && r.color === "rgb(102, 102, 102)")
    expect(resting.length >= 6, "the rest are #666666 on nothing", resting.length)
    expect(resting.every((r) => r.fw === "470"), "at weight 470, not a rounded 500", JSON.stringify([...new Set(resting.map((r) => r.fw))]))

    expect(m.icons.every((i) => i.box === "20x20"), "every icon box is 20×20", JSON.stringify(m.icons.map((i) => i.box)))
    expect(
      m.icons.every((i) => i.outline && i.filled),
      "every icon carries both weights at once",
      JSON.stringify(m.icons.map((i) => [!!i.outline, !!i.filled])),
    )
    const layers = m.icons.flatMap((i) => [i.outline, i.filled])
    expect(layers.every((l) => l.glyph === "20x20"), "both are 20×20", JSON.stringify(layers.map((l) => l.glyph)))
    expect(
      m.icons.every((i) => i.outline.offset === i.filled.offset),
      "and sit in exactly the same place, so the fade cannot shift the glyph",
      JSON.stringify(m.icons.map((i) => [i.outline.offset, i.filled.offset])),
    )
    expect(layers.every((l) => l.painted > 0), "every layer paints something", JSON.stringify(layers.map((l) => l.painted)))
    expect(
      m.icons.every((i) => i.outline.d !== i.filled.d),
      "the two weights are genuinely different glyphs",
      JSON.stringify(m.icons.find((i) => i.outline.d === i.filled.d)?.outline.d.slice(0, 80)),
    )
    /*
      THE SMOOTHNESS, WHICH IS THE WHOLE POINT.

      Not "does it end up filled" — a hard swap ends up filled too. What has to
      be true is that the change is an OPACITY animation with a real duration
      on both layers, because that is the only part a snap does not have.
    */
    expect(
      layers.every((l) => /opacity/.test(l.transition) && !/ 0s$/.test(l.transition)),
      "and cross-fade rather than snap",
      JSON.stringify([...new Set(layers.map((l) => l.transition))]),
    )
    expect(
      m.icons.every((i) =>
        i.active ? i.filled.opacity === "1" && i.outline.opacity === "0"
                 : i.filled.opacity === "0" && i.outline.opacity === "1"),
      "with the layer that matches the route the visible one",
      JSON.stringify(m.icons.map((i) => [i.active, i.outline.opacity, i.filled.opacity])),
    )
    expect(
      m.icons.filter((i) => i.active).length === 1,
      "exactly one icon is filled and the rest outline",
      JSON.stringify(m.icons.map((i) => (i.active ? "filled" : "outline"))),
    )
    expect(
      /*
        A REAL STROKE NOW, not a painted-on one.

        Both previous libraries drew a "line" icon as a filled path shaped
        like a stroke, so weight had to be faked by painting a stroke of the
        icon's own colour over the fill — 2.4 units for Phosphor, 0.3 for
        Remix, a magic number per library. Solar's linear icons are stroked
        for real, so this now reads the drawing weight itself.
      */
      m.icons.filter((i) => i.drawn === "stroke").every((i) => i.outline.stroke === "1.5px"),
      "every stroked resting layer is stroked at 1.5, the weight it is drawn at",
      JSON.stringify(m.icons.filter((i) => i.drawn === "stroke").map((i) => i.outline.stroke)),
    )
    expect(
      m.icons.filter((i) => i.drawn === "stroke").every((i) => i.outline.fill === "none"),
      "and is a stroke rather than a fill shaped like one",
      JSON.stringify(m.icons.filter((i) => i.drawn === "stroke").map((i) => i.outline.fill)),
    )
    /*
      THE ONE EXCEPTION, PINNED DOWN RATHER THAN WAVED THROUGH.

      Home is Phosphor's House, which is a FILLED PATH shaped like a stroke —
      it has no stroke-width to assert. Rather than loosen the rule for every
      icon, the element says how it is drawn, and this checks that exactly one
      claims the exemption and that it really is fill-drawn.
    */
    const filledOutline = m.icons.filter((i) => i.drawn === "fill")
    expect(
      filledOutline.length === 1,
      "exactly one icon is drawn as a filled outline rather than a stroke",
      JSON.stringify(m.icons.map((i) => i.drawn)),
    )
    expect(
      filledOutline.every((i) => i.outline.stroke === "none" && i.outline.fill !== "none"),
      "and it really is one, so the exemption cannot be claimed by a stroked icon",
      JSON.stringify(filledOutline.map((i) => [i.outline.stroke, i.outline.fill])),
    )
    expect(
      m.icons.every((i) => i.filled.fill !== "none"),
      "while the active layer is a genuine solid",
      JSON.stringify(m.icons.map((i) => i.filled.fill)),
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


  console.log(`\n${broken === 0 ? "the rail holds its shape" : `${broken} failed`}`)
  process.exit(broken === 0 ? 0 : 1)
} finally {
  rmSync(out, { recursive: true, force: true })
  rmSync(join(root, ".sidebar-probe"), { recursive: true, force: true })
}
