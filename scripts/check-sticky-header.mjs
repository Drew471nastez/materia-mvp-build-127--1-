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
function run() {
  const root = document.querySelector("[data-storelib-theme]")
  const bar = [...root.children].find(c => c.textContent.trim().startsWith("Walk-ins"))
  const header = document.getElementById("section-header")
  const r = { sticky: getComputedStyle(header).position === "sticky" }
  const b = bar.getBoundingClientRect(), h = header.getBoundingClientRect()
  r.barHeight = Math.round(b.height)
  r.headerStartsBelowBar = Math.abs(h.top - b.bottom) < 2
  r.transform = getComputedStyle(header).transform
  const next = header.nextElementSibling
  r.overlapsNext = Math.round(next.getBoundingClientRect().top) < Math.round(h.bottom) - 2
  r.noEmptyBandBelow = Math.abs(next.getBoundingClientRect().top - h.bottom) < 2
  window.scrollTo(0, 700)
  r.pinnedAt = Math.round(header.getBoundingClientRect().top)
  r.barScrolledAway = Math.round(bar.getBoundingClientRect().bottom) <= 0
  window.scrollTo(0, 0)
  const h3 = header.getBoundingClientRect(), b3 = bar.getBoundingClientRect()
  r.headerBackBelowBar = Math.abs(h3.top - b3.bottom) < 2
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
      [r.transform === "none" || r.transform === "matrix(1, 0, 0, 1, 0, 0)", "no entrance animation displaces it"],
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
  console.log(`\n${broken === 0 ? "the header behaves in all three" : `${broken} failed`}`)
  process.exit(broken === 0 ? 0 : 1)
} finally {
  rmSync(tsconfigPath, { force: true })
  rmSync(out, { recursive: true, force: true })
}
