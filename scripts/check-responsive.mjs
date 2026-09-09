/**
 * ===========================================================================
 *  DOES EVERY SECTION SURVIVE A PHONE?
 * ===========================================================================
 * Renders all fifty sections at three device widths in a real browser, with
 * the project's real compiled stylesheet, and reports any that push the page
 * into horizontal scroll.
 *
 * WHY A SCRIPT AND NOT A SUITE. It needs Chromium and a production build, so
 * it is minutes rather than seconds — too slow for every push. What the push
 * suite keeps is the RULE this found; this is how the finding was made and how
 * to make it again.
 *
 *   node scripts/check-responsive.mjs            # shipped demo content
 *   STRESS=1 node scripts/check-responsive.mjs   # …with unbreakable strings
 *
 * WHAT IT MEASURES. Only overflow that reaches the page: `scrollWidth -
 * clientWidth` on a probe whose own overflow is visible. An element wider than
 * its box inside `overflow-hidden` is a carousel or a marquee, not a bug, and
 * the first version of this reported nine false positives for exactly that.
 *
 * WHAT IT FOUND, at 390px with one unbreakable string in a text field — a long
 * product name, a pasted URL, an email address — THIRTY-FIVE of the fifty
 * sections pushed the page sideways, by up to 866px. One inherited
 * `overflow-wrap: anywhere` in the theme stylesheet took that to one, and the
 * last one was the announcement bar's non-wrapping row.
 */
import { execFileSync } from "node:child_process"
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const WIDTHS = [390, 834, 1280]
const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const out = mkdtempSync(join(tmpdir(), "storelib-responsive-"))
const tsconfigPath = "tsconfig.responsive.generated.json"

function fail(message) {
  console.error(message)
  process.exit(1)
}

if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}. Set CHROMIUM=/path/to/chromium.`)

// The stylesheet the app actually ships. Without it every section is unstyled
// and the measurement is meaningless — the first run of this reported every
// section as 1584px wide because the <link> pointed at nothing.
const cssDir = join(root, ".next/static/chunks")
if (!existsSync(cssDir)) fail("No production build found. Run `pnpm build` first.")
const css = readdirSync(cssDir)
  .filter((f) => f.endsWith(".css"))
  .map((f) => readFileSync(join(cssDir, f), "utf8"))
  .join("\n")
if (!css.includes("--theme-page-width")) {
  fail("The built CSS predates the theme variables. Run `pnpm build` again.")
}
writeFileSync(join(out, "app.css"), css)

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
      files: ["scripts/render-sections.ts"],
    }),
  )
  execFileSync("pnpm", ["exec", "tsc", "-p", tsconfigPath], { stdio: "inherit" })

  writeFileSync(join(out, "package.json"), '{"type":"module"}\n')
  try {
    symlinkSync(join(root, "node_modules"), join(out, "node_modules"), "junction")
  } catch {
    /* the loader below resolves this project's own modules either way */
  }

  // Rendered from the PROJECT root so the section JSON is found where it is.
  execFileSync(
    "node",
    [
      "--experimental-loader",
      join(root, "scripts/push-test-loader.mjs"),
      "-e",
      `await import(${JSON.stringify(join(out, "scripts/render-sections.js"))})`,
    ],
    {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, PUSH_TEST_OUT: out, OUT_DIR: out },
    },
  )

  const PROBE = `<script>
addEventListener("load", () => {
  const bad = []
  for (const probe of document.querySelectorAll(".probe")) {
    const spill = probe.scrollWidth - probe.clientWidth
    if (spill <= 1) continue
    let worst = null, over = 0
    const left = probe.getBoundingClientRect().left, w = probe.clientWidth
    for (const el of probe.querySelectorAll("*")) {
      // A fixed element is measured against the WINDOW, not the probe.
      if (getComputedStyle(el).position === "fixed") continue
      const o = Math.round(el.getBoundingClientRect().right - (left + w))
      if (o > over) { over = o; worst = el.tagName + " ." + String(el.className).slice(0, 70) }
    }
    bad.push({ type: probe.dataset.type, spill, worst })
  }
  document.getElementById("out").textContent = JSON.stringify(bad)
})
</script>`

  let broken = 0
  for (const width of WIDTHS) {
    const file = join(out, `sections-${width}.html`)
    writeFileSync(file, readFileSync(file, "utf8").replace("</pre>", "</pre>" + PROBE))
    const dom = execFileSync(
      CHROMIUM,
      [
        "--headless=new",
        "--no-sandbox",
        "--disable-gpu",
        `--window-size=${width + 40},900`,
        "--virtual-time-budget=8000",
        "--dump-dom",
        `file://${file}`,
      ],
      { encoding: "utf8", maxBuffer: 128 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] },
    )
    const match = dom.match(/<pre id="out">([^<]*)</)
    if (!match) fail(`No measurement came back at ${width}px.`)
    const rows = JSON.parse(match[1])
    console.log(`\n${width}px${process.env.STRESS ? " (unbreakable content)" : ""}`)
    if (rows.length === 0) console.log("  every section stays inside the page")
    for (const r of rows) {
      console.log(`  ${r.type.padEnd(22)} ${String(r.spill).padStart(5)}px  ${r.worst ?? ""}`)
    }
    broken += rows.length
  }
  console.log(`\n${broken === 0 ? "clean" : `${broken} section/width combinations push the page sideways`}`)
  process.exit(broken === 0 ? 0 : 1)
} finally {
  rmSync(tsconfigPath, { force: true })
  rmSync(out, { recursive: true, force: true })
}
