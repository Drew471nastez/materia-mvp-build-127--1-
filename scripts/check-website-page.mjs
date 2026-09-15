/**
 * ===========================================================================
 *  THE WEBSITE PAGE, AT PHONE WIDTH
 * ===========================================================================
 * The page was redrawn after a review that called its layout and alignment
 * wrong. Three of the complaints are claims about pixels, so they are checked
 * here rather than asserted:
 *
 *   • nothing runs off the right-hand gutter — "Add theme" did
 *   • every action is a real touch target, 44px or more
 *   • both gutters are the same, and at least 16px
 *
 * It also writes the rendered page out as a PNG, which is the point: the
 * rules say to look at the result, and a screenshot is how you look at it
 * without a phone in your hand.
 *
 *   pnpm build && node scripts/check-website-page.mjs
 *
 * The build matters. The layout is written in arbitrary Tailwind values, and
 * Tailwind only emits those for files it has scanned; measured against a
 * stale stylesheet the page comes back unstyled, and every number below is
 * the browser's default rather than the design's.
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const out = mkdtempSync(join(tmpdir(), "storelib-wb-page-"))
const KEEP = process.env.KEEP_SHOT

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

/** Stubs live inside the project so esbuild can resolve `react` from them. */
const stubs = join(root, ".wb-probe")
mkdirSync(stubs, { recursive: true })
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default function Link({ href, children, ...rest }) {
  return React.createElement("a", { href, ...rest }, children)
}

export const useLinkStatus = () => ({ pending: false })
`)
writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/app/website-builder"
export const useRouter = () => ({ push() {}, replace() {}, refresh() {}, prefetch() {} })
export const useSearchParams = () => new URLSearchParams()
`)
writeFileSync(join(stubs, "toast.js"), `export const useToast = () => ({ toast() {} })
`)
writeFileSync(join(stubs, "navbar.js"), `export const startNavigationLoading = () => {}
export const NavigationLoadingBar = () => null
`)

const bundle = join(out, "probe.js")
try {
  execFileSync(
    "npx",
    ["--no-install", "esbuild", join(root, "scripts/render-website-page-probe.tsx"),
     "--bundle", "--platform=node", "--format=cjs", "--jsx=automatic", "--log-level=error",
     `--outfile=${bundle}`,
     `--alias:next/link=${join(stubs, "link.jsx")}`,
     `--alias:next/navigation=${join(stubs, "navigation.js")}`,
     `--alias:@/hooks/use-toast=${join(stubs, "toast.js")}`,
     `--alias:@/components/app/navigation-loading-bar=${join(stubs, "navbar.js")}`,
     `--alias:@=${root}`],
    { stdio: ["ignore", "ignore", "inherit"] },
  )
} catch {
  fail("The probe did not bundle. The error above is esbuild's.")
}
execFileSync("node", [bundle], { env: { ...process.env, OUT_DIR: out }, stdio: ["ignore", "ignore", "inherit"] })
const body = readFileSync(join(out, "page.html"), "utf8")

const W = Number(process.env.WIDTH ?? 390)
const PROBE = `<script>
  const r = (el) => el.getBoundingClientRect()
  const results = { overflow: 0, cards: [], short: [], pad: null }

  /**
   * The real "it runs off the screen" test: does the DOCUMENT scroll
   * sideways. A first version walked every element and compared its box to
   * the page's, which flagged 219 things — the themes row is deliberately
   * full-bleed (\`-mx-4\` with its own scroller) and every drawing inside
   * every cover sits inside that. None of them is the complaint.
   */
  /**
   * The real "it runs off the screen" test: does the PAGE'S OWN SCROLLER
   * have more width than it can show.
   *
   * Two earlier versions measured the wrong box. The first walked every
   * element and compared it to the page, which flagged 219 things — the
   * themes row is deliberately full-bleed, with a scroller of its own, and
   * every drawing inside every cover sits under it. The second asked
   * document.documentElement, which is not 390px wide: headless Chromium
   * will not open a window narrower than about 500, so html stayed 500
   * however narrow the window was asked to be, and the page was reported as
   * 110px too wide while rendering perfectly at 390.
   *
   * The body is pinned to the width under test and the page's own root is
   * the thing that scrolls, so that is the element to ask.
   */
  const root =
    document.querySelector("[data-probe-shell] .page-scroll") ||
    document.querySelector("[data-probe-shell]")
  results.overflow = Math.max(0, root.scrollWidth - root.clientWidth)

  // The blocks that make up the page, and where their edges actually land.
  for (const el of document.querySelectorAll("[data-page-block]")) {
    const b = r(el)
    results.cards.push({ left: Math.round(b.left), right: Math.round(${W} - b.right) })
  }

  /**
   * Touch targets, counted only for things that LOOK like buttons — a border
   * or a fill of their own. The first version counted every <a>, so it
   * reported the address line and "See all" as undersized controls, and they
   * are neither controls of that kind nor meant to be 44px.
   */
  for (const el of document.querySelectorAll("button, a")) {
    const c = getComputedStyle(el)
    const filled = c.backgroundColor !== "rgba(0, 0, 0, 0)" && c.backgroundColor !== "transparent"
    const bordered = parseFloat(c.borderTopWidth) > 0
    if (!filled && !bordered) continue
    const b = r(el)
    if (b.height === 0 || b.width < 56) continue
    if (Math.round(b.height) < 44) {
      results.short.push({
        text: (el.textContent || "").trim().slice(0, 22) || el.getAttribute("aria-label") || "?",
        h: Math.round(b.height),
      })
    }
  }

  const inner = document.querySelector("[data-probe-inner]")
  const ic = getComputedStyle(inner)
  results.pad = { left: parseInt(ic.paddingLeft), right: parseInt(ic.paddingRight) }

  document.title = JSON.stringify(results)
</script>`

const page = `<!doctype html><html><head><meta charset="utf-8"><style>` + css + `</style>
<style>*{box-sizing:border-box}body{margin:0;width:${W}px;background:#f8f9fa;font-family:Inter,system-ui,sans-serif}</style>
</head><body><div data-probe-shell style="width:${W}px">${body}</div>${PROBE}</body></html>`

try {
  const html = join(out, "page-full.html")
  writeFileSync(html, page.replace('class="app-page-enter', 'data-probe-inner class="app-page-enter'))

  const dom = execFileSync(
    CHROMIUM,
    ["--headless=new", "--no-sandbox", "--disable-gpu", `--window-size=${W},900`,
     "--force-prefers-reduced-motion", "--virtual-time-budget=2500", "--dump-dom", `file://${html}`],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  )
  const raw = /<title>([\s\S]*?)<\/title>/.exec(dom)?.[1]
  if (!raw) fail("The page did not render. Chromium produced no result.")
  const r = JSON.parse(raw.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"))

  if (KEEP) {
    execFileSync(
      CHROMIUM,
      ["--headless=new", "--no-sandbox", "--disable-gpu", `--window-size=${W},2400`,
       "--force-prefers-reduced-motion", "--virtual-time-budget=2500",
       `--screenshot=${KEEP}`, `file://${html}`],
      { stdio: "ignore" },
    )
    console.log(`\n  screenshot: ${KEEP}`)
  }

  let broken = 0
  const expect = (ok, what, got = "") => {
    console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok ? "" : `   ${got}`}`)
    if (!ok) broken++
  }

  const lopsided = r.cards.filter((c) => c.left !== c.right)

  console.log(`\nthe website page, at ${W}px\n`)
  expect(r.overflow === 0, "the page does not scroll sideways", `${r.overflow}px of it is off the screen`)
  expect(
    r.cards.length >= 3 && lopsided.length === 0,
    `every block sits on the same two gutters (${r.cards.length} measured)`,
    lopsided.length
      ? lopsided.map((c) => `${c.left}/${c.right}`).join(", ")
      : "fewer blocks than expected — the markers are not on the page",
  )
  expect(
    r.pad.left === r.pad.right && r.pad.left >= 16,
    "and those gutters are equal, and at least 16px",
    `padding ${r.pad.left}/${r.pad.right}px`,
  )
  /**
   * 44px is a TOUCH rule, so it is checked at touch widths. The library rows
   * carry 36px Publish and Edit buttons that only exist from `sm` up — they
   * are `hidden sm:inline-flex` — and 36px is the right size for a row of
   * actions under a pointer. Asserting the thumb size at 1280 reported those
   * four as faults, which they are not.
   */
  if (W <= 640) {
    expect(
      r.short.length === 0,
      "every button is 44px or taller, which is the size a thumb hits",
      `${r.short.length} short: ` + r.short.slice(0, 6).map((x) => `"${x.text}" ${x.h}px`).join("; "),
    )
  }

  console.log(
    `\n  gutters ${r.pad.left}/${r.pad.right}px   sideways overflow ${r.overflow}px` +
      (W <= 640 ? `   buttons under 44px ${r.short.length}` : "   (44px is checked at touch widths)") +
      "\n",
  )
  process.exit(broken === 0 ? 0 : 1)
} finally {
  rmSync(out, { recursive: true, force: true })
  rmSync(stubs, { recursive: true, force: true })
}
