/**
 * ===========================================================================
 *  THE HEADER, THE ANNOUNCEMENT BAR, AND THE SPACE BETWEEN THEM
 * ===========================================================================
 * Reported from a published site, and visible in a screenshot next to the
 * editor showing the same page correct:
 *
 *   • The announcement bar did not appear, and a band of empty background sat
 *     under the header instead.
 *   • Scrolling back to the top slid the header down OVER the bar.
 *
 * Both came from the same thing. The live site rendered the sticky header as
 * `position: fixed; top: 0` plus an in-flow spacer, on the grounds that the
 * marketing layout's `overflow-x: clip` "kills position: sticky". That is true
 * of `overflow: hidden` and not of `clip` — not creating a scroll container is
 * the entire reason `clip` exists.
 *
 * A header fixed at top:0 covers whatever is above it, and the spacer reserves
 * its height a second time; and a fixed header has no natural position to
 * return to, so coming back to the top it animates down across the bar.
 *
 * This measures the real header component inside the real layout, in Chromium:
 *
 *   node scripts/check-sticky-header.mjs
 */
import { execFileSync } from "node:child_process"
import { mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const out = mkdtempSync(join(tmpdir(), "storelib-sticky-"))
const tsconfigPath = "tsconfig.sticky.generated.json"

const fail = (m) => {
  console.error(m)
  process.exit(1)
}
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}. Set CHROMIUM=/path/to/chromium.`)

const cssDir = join(root, ".next/static/chunks")
if (!existsSync(cssDir)) fail("No production build found. Run `pnpm build` first.")
writeFileSync(
  join(out, "app.css"),
  readdirSync(cssDir)
    .filter((f) => f.endsWith(".css"))
    .map((f) => readFileSync(join(cssDir, f), "utf8"))
    .join("\n"),
)

/**
 * Measured synchronously, reading layout back straight after `scrollTo`.
 * A `requestAnimationFrame` chain never resolved under `--dump-dom` and the
 * first version of this reported "pending" three times.
 */
const PROBE = `<script>
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
async function run() {
  const root = document.querySelector("[data-storelib-theme]")
  const bar = [...root.children].find(c => c.textContent.trim().startsWith("Walk-ins"))
  const header = document.getElementById("section-header")
  const r = { sticky: getComputedStyle(header).position === "sticky" }
  const b = bar.getBoundingClientRect(), h = header.getBoundingClientRect()
  r.barHeight = Math.round(b.height)
  r.headerStartsBelowBar = Math.abs(h.top - b.bottom) < 2
  r.transform = getComputedStyle(header).transform
  r.willChange = getComputedStyle(header).willChange
  const next = header.nextElementSibling
  r.overlapsNext = Math.round(next.getBoundingClientRect().top) < Math.round(h.bottom) - 2
  r.noEmptyBandBelow = Math.abs(next.getBoundingClientRect().top - h.bottom) < 2
  window.scrollTo(0, 700)
  r.pinnedAt = Math.round(header.getBoundingClientRect().top)
  r.barScrolledAway = Math.round(bar.getBoundingClientRect().bottom) <= 0
  window.scrollTo(0, 0)
  const h3 = header.getBoundingClientRect(), b3 = bar.getBoundingClientRect()
  r.headerBackBelowBar = Math.abs(h3.top - b3.bottom) < 2

  /**
   * THE CYCLE THE OTHER THREE CASES NEVER PERFORM.
   *
   * Scroll down far enough to hide, back up to reveal, then all the way home
   * — because "it leaves a white band once you have scrolled" is a complaint
   * about the state the header is left in AFTERWARDS, not about first paint.
   * Every measurement above is taken before anything has moved, which is
   * exactly why they all passed while the page was visibly wrong.
   */
  const headerH = Math.round(h.height)
  window.scrollTo(0, 200); await sleep(60)
  window.scrollTo(0, 900); await sleep(500)          // down → should hide
  const hAfterHide = header.getBoundingClientRect()
  r.hidTransform = getComputedStyle(header).transform
  r.wentAway = Math.round(hAfterHide.bottom) <= 2
  // Nothing may be left behind where it was: the section under the header has
  // to occupy that space, not a band of page background.
  const nAfterHide = next.getBoundingClientRect()
  r.nothingLeftBehind = Math.round(nAfterHide.top) <= 2

  window.scrollTo(0, 400); await sleep(500)          // up → should reveal
  r.revealedAt = Math.round(header.getBoundingClientRect().top)

  window.scrollTo(0, 0); await sleep(500)            // home
  const h4 = header.getBoundingClientRect(), b4 = bar.getBoundingClientRect()
  r.endsBelowBar = Math.abs(h4.top - b4.bottom) < 2
  r.endsOverBar = Math.round(h4.top) < Math.round(b4.bottom) - 2
  r.endTransform = getComputedStyle(header).transform
  r.endBandBelow = Math.round(next.getBoundingClientRect().top - h4.bottom)
  r.endNoBand = Math.abs(r.endBandBelow) < 2
  r.endHeaderH = Math.round(h4.height)
  r.heightStable = Math.abs(r.endHeaderH - headerH) < 2

  document.getElementById("out").textContent = JSON.stringify(r)
}
if (document.readyState === "complete") run(); else addEventListener("load", run)
</script>`

/** What each configuration must be true of. */
const EXPECTED = {
  sticky: (r) =>
    [
      [r.sticky, "the header is sticky, not fixed"],
      [r.headerStartsBelowBar, "it starts below the announcement bar"],
      /**
       * `none`, not identity. An identity transform is not nothing: with
       * `will-change` beside it, it promotes the header to its own compositor
       * layer permanently, for an animation this mode never runs — and a
       * promoted sticky layer inside an `overflow-x: clip` ancestor is where
       * stale tiles show up as a band under the header. The old spelling of
       * this check accepted `matrix(1, 0, 0, 1, 0, 0)` and so could not see it.
       */
      [r.transform === "none", "it carries no transform at all when it never moves"],
      [r.willChange !== "transform", "and asks for no compositor layer it will not use"],
      [r.noEmptyBandBelow, "there is no empty band under it"],
      [r.pinnedAt === 0, "it pins to the top when scrolled"],
      [r.barScrolledAway, "and the bar scrolls away"],
      [r.headerBackBelowBar, "coming back to the top it sits under the bar again, not over it"],
    ],
  "sticky-transparent": (r) => [
    [r.sticky, "the header is sticky, not fixed"],
    [r.headerStartsBelowBar, "it starts below the announcement bar"],
    [r.overlapsNext, "a transparent header overlays the section beneath it"],
    [r.pinnedAt === 0, "it still pins to the top when scrolled"],
  ],
  static: (r) => [
    [r.headerStartsBelowBar, "it starts below the announcement bar"],
    [r.noEmptyBandBelow, "there is no empty band under it"],
    [r.pinnedAt < 0, "a non-sticky header scrolls away with the page"],
  ],
  /** Reveal on, always-pinned OFF — the reported configuration. It must still
   *  stick, because a header that reveals on scroll up has to be sticky to
   *  reveal anywhere. */
  "scroll-up-only": (r) => [
    [r.sticky, "the header is sticky from the scroll-up toggle alone"],
    [r.headerStartsBelowBar, "it starts below the announcement bar"],
    [r.noEmptyBandBelow, "there is no empty band under it"],
    [r.pinnedAt === 0, "and it pins to the top when scrolled"],
  ],
  /**
   * The reveal-on-scroll-up mode, and the state it leaves behind.
   *
   * Everything before the cycle is the same contract as plain sticky. What is
   * new is everything after it: the header has to go fully away, leave nothing
   * behind where it was, come back at the top of the viewport, and finally
   * land under the bar with the next section flush against it. A band under
   * the header and a header sitting over the bar are the two reported
   * symptoms, and they are the last two lines here.
   */
  "sticky-scroll-up": (r) => [
    [r.sticky, "the header is sticky, not fixed"],
    [r.headerStartsBelowBar, "it starts below the announcement bar"],
    [r.noEmptyBandBelow, "there is no empty band under it at rest"],
    [r.pinnedAt === 0, "it pins to the top when scrolled"],
    [r.endsBelowBar, "after a full scroll cycle it sits under the bar"],
    [!r.endsOverBar, "not over it"],
    [r.endNoBand, "and there is no empty band under it afterwards"],
    [r.heightStable, "its height is unchanged by the whole cycle"],
    // The transform is owned by the scroll effect and written to the node, so
    // the SERVER markup carries none — which is the right first paint: before
    // hydration the header is simply in its place, never translated.
    [r.transform === "none", "the server markup ships it untranslated"],
    [r.willChange === "transform", "but this mode does ask for the layer it will use"],
  ],
}

try {
  writeFileSync(
    tsconfigPath,
    JSON.stringify({
      compilerOptions: {
        outDir: out,
        rootDir: ".",
        target: "es2022",
        module: "esnext",
        moduleResolution: "bundler",
        skipLibCheck: true,
        strict: false,
        jsx: "react-jsx",
        baseUrl: ".",
        paths: { "@/*": ["./*"] },
      },
      files: ["scripts/render-sticky-probe.ts"],
    }),
  )
  execFileSync("pnpm", ["exec", "tsc", "-p", tsconfigPath], { stdio: "inherit" })
  writeFileSync(join(out, "package.json"), '{"type":"module"}\n')
  try {
    symlinkSync(join(root, "node_modules"), join(out, "node_modules"), "junction")
  } catch {
    /* the loader resolves this project's own modules either way */
  }
  execFileSync(
    "node",
    [
      "--experimental-loader",
      join(root, "scripts/push-test-loader.mjs"),
      "-e",
      `await import(${JSON.stringify(join(out, "scripts/render-sticky-probe.js"))})`,
    ],
    { cwd: root, stdio: "inherit", env: { ...process.env, PUSH_TEST_OUT: out, OUT_DIR: out } },
  )

  let broken = 0
  for (const name of Object.keys(EXPECTED)) {
    const file = join(out, `sticky-${name}.html`)
    writeFileSync(file, readFileSync(file, "utf8").replace("</pre>", "</pre>" + PROBE))
    const dom = execFileSync(
      CHROMIUM,
      [
        "--headless=new",
        "--no-sandbox",
        "--disable-gpu",
        "--window-size=1280,900",
        "--virtual-time-budget=6000",
        "--dump-dom",
        `file://${file}`,
      ],
      { encoding: "utf8", maxBuffer: 128 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] },
    )
    const match = dom.match(/<pre id="out">([^<]*)</)
    if (!match || match[1] === "pending") fail(`No measurement came back for ${name}.`)
    const measured = JSON.parse(match[1])
    console.log(`\n${name}`)
    for (const [ok, what] of EXPECTED[name](measured)) {
      console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}`)
      if (!ok) broken++
    }
    if (!EXPECTED[name](measured).every(([ok]) => ok)) console.log(`        ${JSON.stringify(measured)}`)
  }
  console.log(`\n${broken === 0 ? "the header behaves in all five" : `${broken} failed`}`)
  process.exit(broken === 0 ? 0 : 1)
} finally {
  rmSync(tsconfigPath, { force: true })
  rmSync(out, { recursive: true, force: true })
}
