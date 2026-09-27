/**
 * ===========================================================================
 *  THE HOME PAGE'S "MANAGE YOUR BUSINESS" PICTURES, SHOWN
 * ===========================================================================
 * "In the main storelib.com, the Manage your businesses images there are not
 * displaying at all, it shows just a grey."
 *
 * The section (components/marketing/manage-section.tsx) is rendered on the
 * server with React's own renderToString, put in a page as the HTML the
 * browser parses first, and hydrated later, the way the home page's dynamic
 * import hydrates it. The pictures are answered from here with a real file.
 * At 390 and 1440, three orders of events:
 *
 *   BEFORE   the pictures finish loading, THEN the page hydrates (a warm
 *            cache, a quick line: what storelib.com does today). This is the
 *            case that stayed grey: the load had happened before anyone
 *            listened for it.
 *   AFTER    the page hydrates, then the pictures arrive (a slow line).
 *   BROKEN   the first picture fails before hydration.
 *
 * In each: the current slide is drawn (opacity 1 once its fade has run), and
 * the grey pulse is gone; a screenshot of the frame is kept.
 *
 *   PROBE_CSS=source node scripts/check-manage-images.mjs
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) {
  console.error(`No browser at ${CHROMIUM}.`)
  process.exit(1)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}

const work = mkdtempSync(join(tmpdir(), "storelib-manage-images-"))
const shots = process.env.SHOTS_DIR || join(work, "shots")
mkdirSync(shots, { recursive: true })

writeFileSync(
  join(work, "server.tsx"),
  `import React from "react"
import { renderToString } from "react-dom/server"
import { ManageSection } from "${join(root, "components/marketing/manage-section")}"
export const html = () => renderToString(<ManageSection />)
`,
)
writeFileSync(
  join(work, "browser.tsx"),
  `import React from "react"
import { hydrateRoot } from "react-dom/client"
import { ManageSection } from "${join(root, "components/marketing/manage-section")}"
;(window as any).__hydrate = () => {
  hydrateRoot(document.getElementById("app")!, <ManageSection />, { onRecoverableError: (e) => ((window as any).__recoverable ||= []).push(String(e)) })
  ;(window as any).__hydrated = true
}
`,
)
const { build } = await import("esbuild")
const common = {
  bundle: true,
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  alias: { "@": root },
  loader: { ".css": "empty" },
  logLevel: "error",
  absWorkingDir: root,
  nodePaths: [join(root, "node_modules")],
}
await build({ ...common, entryPoints: [join(work, "server.tsx")], platform: "node", format: "cjs", outfile: join(work, "server.cjs") })
await build({ ...common, entryPoints: [join(work, "browser.tsx")], platform: "browser", format: "iife", outfile: join(work, "browser.js") })
const { createRequire } = await import("node:module")
const ssr = createRequire(import.meta.url)(join(work, "server.cjs")).html()
const js = readFileSync(join(work, "browser.js"), "utf8")
const css = await appCss(root)
const page = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;font-family:system-ui,sans-serif}</style></head>
<body><div id="app">${ssr}</div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
/* A real picture of the right shape (a 16:9 screenshot stands in for the dashboard ones). */
const picture = readFileSync(join(root, "public/modern-tech-product.png"))

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] })
try {
  for (const [label, vp] of [
    ["390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
    ["1440", { width: 1440, height: 900 }],
  ]) {
    for (const order of ["before", "after", "broken"]) {
      const p = await browser.newPage()
      const errors = []
      p.on("pageerror", (e) => errors.push(e.message))
      await p.setViewport(vp)
      let release = null
      const held = new Promise((r) => { release = r })
      await p.setRequestInterception(true)
      p.on("request", async (r) => {
        const u = r.url()
        if (process.env.PROBE_DEBUG) console.log("  req", u.slice(0, 140))
        if (u === "http://probe.test/") return r.respond({ status: 200, contentType: "text/html", body: page })
        if (u.startsWith("http://probe.test/_next/image")) {
          /* The first slide fails in BROKEN; in AFTER every picture waits until the page has hydrated. */
          if (order === "broken" && /Macbook-Air-storelib\.com%2520\(2\)|Macbook-Air-storelib\.com%20\(2\)|Macbook-Air-storelib.com%2520%282%29/.test(u)) return r.respond({ status: 400, contentType: "text/plain", body: "no" })
          if (order === "after") await held
          return r.respond({ status: 200, contentType: "image/png", body: picture })
        }
        if (u.startsWith("https://skgtqglupjcnfhfscink.supabase.co/")) return r.respond({ status: 200, contentType: "image/png", body: picture })
        return r.abort()
      })
      await p.goto("http://probe.test/", { waitUntil: "domcontentloaded" })
      if (order !== "after") {
        /* Every slide finished (loaded or failed) before the page hydrates. */
        await p.waitForFunction(() => [...document.querySelectorAll('img[alt^="Storelib Dashboard view"]')].every((i) => i.complete), { timeout: 10000 })
        await sleep(300)
      }
      const beforeHydrate = await p.evaluate(() => [...document.querySelectorAll('img[alt^="Storelib Dashboard view"]')].map((i) => ({ complete: i.complete, w: i.naturalWidth })))
      await p.evaluate(() => window.__hydrate())
      if (order === "after") {
        await sleep(400)
        release()
      }
      await p.evaluate(() => document.querySelector('img[alt="Storelib Dashboard view 1"]').scrollIntoView({ block: "center" }))
      await sleep(1600)
      const got = await p.evaluate(() => {
        const first = document.querySelector('img[alt="Storelib Dashboard view 1"]')
        return {
          hydrated: !!window.__hydrated,
          opacity: +getComputedStyle(first).opacity,
          naturalWidth: first.naturalWidth,
          pulse: !!document.querySelector(".animate-pulse.bg-neutral-100"),
          recoverable: window.__recoverable ?? [],
        }
      })
      await p.screenshot({ path: join(shots, `manage-images-${label}-${order}.png`) })
      const name = `${label}, ${order === "before" ? "pictures loaded before hydration" : order === "after" ? "pictures arriving after hydration" : "the first picture failed before hydration"}`
      console.log(`\n${name}  (before hydration: ${JSON.stringify(beforeHydrate)})`)
      expect(got.hydrated && errors.length === 0 && got.recoverable.length === 0, `${name}: hydrated, nothing threw, no mismatch`, { errors, recoverable: got.recoverable })
      expect(!got.pulse, `${name}: the grey pulse is gone`, got)
      if (order === "broken") expect(got.opacity === 1, `${name}: no grey left over the frame (the failed slide is let through as onError would)`, got)
      else expect(got.opacity === 1 && got.naturalWidth > 0, `${name}: the first slide is drawn`, got)
      await p.close()
    }
  }
} finally {
  await browser.close()
}
console.log(`\nScreenshots: ${shots}`)
if (broken) {
  console.error(`\n${broken} check(s) failed.\n`)
  process.exit(1)
}
console.log("\nThe Manage your business pictures show.\n")
