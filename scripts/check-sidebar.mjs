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

export const useLinkStatus = () => ({ pending: false })
`)
/* useSearchParams came with the shell's own record of the address (lib/ui/app-navigation); without it the bundle stopped and this probe could not run at all. */
writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => globalThis.__PATHNAME__ ?? "/app"
export const useSearchParams = () => new URLSearchParams(globalThis.__SEARCH__ ?? "")
export const useRouter = () => ({ push() {}, replace() {}, prefetch() {} })
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
    /* Whether the nav has more than it can show, and how wide the rows are drawn in either case. */
    navScrolls: nav.scrollHeight > nav.clientHeight + 1,
    navInner: Math.round(nav.clientWidth),
    rowLeft: rows.length ? Math.round(rows[0].getBoundingClientRect().left) : null,
    rowRight: rows.length ? Math.round(rows[0].getBoundingClientRect().right) : null,
    gutter: getComputedStyle(nav).scrollbarGutter,
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
      /*
        THE ONE THING NONE OF THE ABOVE CAN TELL US: whether Home's door is
        actually a HOLE.

        "fill: solid" only means some shape somewhere in the layer has a real
        fill — a house with the door painted OVER (fill-rule left at its
        nonzero default) reports exactly the same "solid" as a house with the
        door genuinely cut out. The two look different and this field is the
        only thing here that can tell them apart: isPointInFill asks the path
        itself, in its own coordinate space, whether a given point is inside
        the painted region — which is precisely what fill-rule governs.
      */
      const homeDoorHole = (() => {
        const svg = el.querySelector('svg[data-variant="filled"]')
        const path = svg?.querySelector("path")
        if (!path || !path.isPointInFill) return null
        const pt = (x, y) => {
          const p = svg.createSVGPoint()
          p.x = x
          p.y = y
          return p
        }
        return {
          doorIsHollow: !path.isPointInFill(pt(12, 17)), // inside the door
          wallIsSolid: path.isPointInFill(pt(4.5, 17)), // inside the left wall
          roofIsSolid: path.isPointInFill(pt(12, 6)), // inside the roof
        }
      })()

      return {
        box: Math.round(b.width) + "x" + Math.round(b.height),
        active: el.getAttribute("data-nav-icon") === "filled",
        outline: layer("outline"),
        filled: layer("filled"),
        homeDoorHole,
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

  const seen = {}
  for (const name of ["closed", "open", "elsewhere", "short"]) {
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

    seen[name] = m
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
    /* A row whose icon is not a stacked pair has nothing to measure; the check above is what says so, and this one reads the rest rather than stopping. */
    const pairs = m.icons.filter((i) => i.outline && i.filled)
    const layers = pairs.flatMap((i) => [i.outline, i.filled])
    expect(layers.every((l) => l.glyph === "20x20"), "both are 20×20", JSON.stringify(layers.map((l) => l.glyph)))
    expect(
      pairs.every((i) => i.outline.offset === i.filled.offset),
      "and sit in exactly the same place, so the fade cannot shift the glyph",
      JSON.stringify(pairs.map((i) => [i.outline.offset, i.filled.offset])),
    )
    expect(layers.every((l) => l.painted > 0), "every layer paints something", JSON.stringify(layers.map((l) => l.painted)))
    expect(
      /*
        DIFFERENT PATHS, OR — Home's case — the SAME path painted two ways.

        Every Solar-derived icon has a genuinely different `d` between its
        line and bold weights, which this checked directly. Home is drawn by
        hand rather than pulled from a library (see the note above
        NAV_ICONS): its outline already traces the door as a notch cut to
        the base, so stroking that one path draws the identical outline with
        an open arch, and filling it draws the same outline solid — one `d`,
        two paint modes, and still two visually different states. What has
        to be true either way is that outline and filled are not IDENTICAL
        renderings: either the geometry differs, or the paint does (a real
        stroke with no fill vs. a real fill with no stroke).
      */
      pairs.every(
        (i) =>
          i.outline.d !== i.filled.d ||
          (i.outline.stroke !== "none" && i.outline.fill === "none" && i.filled.fill !== "none" && i.filled.stroke === "none"),
      ),
      "the two weights are genuinely different, in shape or in paint",
      JSON.stringify(pairs.find((i) => i.outline.d === i.filled.d)),
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
      pairs.every((i) =>
        i.active ? i.filled.opacity === "1" && i.outline.opacity === "0"
                 : i.filled.opacity === "0" && i.outline.opacity === "1"),
      "with the layer that matches the route the visible one",
      JSON.stringify(pairs.map((i) => [i.active, i.outline.opacity, i.filled.opacity])),
    )
    expect(
      m.icons.filter((i) => i.active).length === 1,
      "exactly one icon is filled and the rest outline",
      JSON.stringify(m.icons.map((i) => (i.active ? "filled" : "outline"))),
    )
    expect(
      /*
        A REAL STROKE, not a painted-on one, and no exemption needed.

        Earlier libraries drew a "line" icon as a filled path shaped like a
        stroke, so weight had to be faked by painting a stroke of the icon's
        own colour over the fill — 2.4 units for Phosphor, 0.3 for Remix, a
        magic number per library, and Home (drawn from a third library for
        its shape) needed its own carve-out from the rule entirely.

        Solar's linear icons and Tabler's IconHome are both genuinely
        stroked, on the same 24-unit box, so every icon in the rail — Home
        included — reads the same drawing weight with nothing excepted.
      */
      pairs.every((i) => i.outline.stroke === "1.5px"),
      "every resting layer is stroked at 1.5, the weight it is drawn at",
      JSON.stringify(pairs.map((i) => i.outline.stroke)),
    )
    expect(
      pairs.every((i) => i.outline.fill === "none"),
      "and is a stroke rather than a fill shaped like one",
      JSON.stringify(pairs.map((i) => i.outline.fill)),
    )
    expect(
      pairs.every((i) => i.filled.fill !== "none"),
      "while the active layer is a genuine solid",
      JSON.stringify(pairs.map((i) => i.filled.fill)),
    )

    /*
      HOME'S DOOR IS A HOLE, NOT A PAINTED-OVER RECTANGLE.

      Dashboard is always the first row, so m.icons[0] is Home. Every other
      check above would pass identically whether fill-rule="evenodd" was
      there or not — "some shape has a real fill" is true either way. Only
      isPointInFill can tell a hole from a solid house with the door filled
      in over it, which is exactly what dropping evenodd silently produces.
    */
    const home = m.icons[0]?.homeDoorHole
    expect(
      !!home?.doorIsHollow && !!home?.wallIsSolid && !!home?.roofIsSolid,
      "Home's door is a hole cut into the solid roof, not painted over",
      JSON.stringify(home),
    )

    /* The gutter the scrollbar keeps is part of how far the chevron sits from the rail's edge, so the number is read against it. */
    expect(m.chevron.w === 20 && m.chevron.fromRight >= 18 && m.chevron.fromRight <= 36, "the chevron is a fixed box pinned right", JSON.stringify(m.chevron))
    /* "short" is the open group again, in a rail too small for it: the chevron and the submenu are the open case's. */
    const isOpen = name === "open" || name === "short"
    const turned = m.chevron.transform.startsWith("matrix(-1")
    expect(isOpen ? turned : !turned, `and is ${isOpen ? "turned over" : "upright"}`, m.chevron.transform)
    expect(
      isOpen ? m.submenu.height > 0 && m.submenu.opacity === "1" : m.submenu.height === 0 && m.submenu.opacity === "0",
      `the submenu is ${isOpen ? "open" : "closed"}`,
      JSON.stringify(m.submenu),
    )
  }


  /*
    THE SCROLLBAR DOES NOT MOVE THE ROWS. A nav with more rows than room shows
    one; without a reserved gutter it takes its width out of the rows, so every
    label in the sidebar shifted sideways the moment a group opened. The short
    rail scrolls, the tall one does not, and the rows have to be drawn in the
    same place in both.
  */
  console.log("\nthe scrollbar takes nothing from the rows")
  expect(seen.short.navScrolls === true, "the short rail has more than it can show", seen.short.navScrolls)
  expect(seen.open.navScrolls === false, "and the tall one does not", seen.open.navScrolls)
  expect(seen.short.gutter === "stable" && seen.open.gutter === "stable", "both keep the scrollbar's room", `${seen.open.gutter} / ${seen.short.gutter}`)
  expect(seen.short.navInner === seen.open.navInner, "so the nav is the same width scrolling or not", `${seen.open.navInner} vs ${seen.short.navInner}`)
  expect(seen.short.rowLeft === seen.open.rowLeft && seen.short.rowRight === seen.open.rowRight, "and a row is drawn in the same place", `${seen.open.rowLeft}-${seen.open.rowRight} vs ${seen.short.rowLeft}-${seen.short.rowRight}`)
  expect(seen.open.rowLeft === seen.closed.rowLeft && seen.open.rowRight === seen.closed.rowRight, "opening a group moves no row sideways", `${seen.closed.rowLeft}-${seen.closed.rowRight} vs ${seen.open.rowLeft}-${seen.open.rowRight}`)

  console.log(`\n${broken === 0 ? "the rail holds its shape" : `${broken} failed`}`)
  process.exit(broken === 0 ? 0 : 1)
} finally {
  rmSync(out, { recursive: true, force: true })
  rmSync(join(root, ".sidebar-probe"), { recursive: true, force: true })
}
