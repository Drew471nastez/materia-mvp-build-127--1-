/**
 * ===========================================================================
 *  THE /sell PAGES' SCREENSHOTS, TAKEN FROM THE REAL PRODUCT EDITOR
 * ===========================================================================
 * The product editor (app/app/products/new/product-editor.tsx), mounted by
 * scripts/render-product-editor.tsx from the demo product it holds (a preset
 * pack by a made up photographer), bundled the way
 * scripts/check-product-editor.mjs bundles it, with every network request
 * refused. Each picture is one card of the editor, photographed at 2x in a
 * 1440px window and saved as WebP in public/marketing/sell/. Then
 * lib/marketing/sell-shots.ts is written with each picture's size.
 *
 *   node scripts/marketing-sell-shots.mjs
 *
 * Run it again when the editor's cards change.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import sharp from "sharp"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const stubs = join(root, ".sell-shots-probe")
const dest = join(root, "public/marketing/sell")
mkdirSync(stubs, { recursive: true })
mkdirSync(dest, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* The cards, by their heading, and the file each becomes. */
const CARDS = [
  ["Digital Files", "editor-files"],
  ["Pricing", "editor-pricing"],
  ["Photos and video", "editor-media"],
]

try {
  writeFileSync(join(stubs, "navigation.js"), `const router = { push() {}, replace() {}, prefetch() {}, back() {}, refresh() {} }
export const usePathname = () => "/app/products/x"
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams()
export const redirect = () => {}
`)
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest }, children) })
`)
  writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, style: fill ? { position: "absolute", inset: 0, width: "100%", height: "100%" } : undefined, ...rest }) }
`)
  writeFileSync(join(stubs, "description-action.js"), `export async function cleanDescription(html) { return { ok: true, html: String(html ?? "") } }
`)
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-product-editor.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: {
      "@": ".",
      react: join(root, "node_modules/next/dist/compiled/react"),
      "react-dom": join(root, "node_modules/next/dist/compiled/react-dom"),
      "next/navigation": "./.sell-shots-probe/navigation.js",
      "next/link": "./.sell-shots-probe/link.jsx",
      "next/image": "./.sell-shots-probe/image.jsx",
    },
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    loader: { ".css": "empty" },
    outfile: join(stubs, "app.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
    plugins: [{ name: "server-action-stub", setup(b) { b.onResolve({ filter: /description-action$/ }, () => ({ path: join(stubs, "description-action.js") })) } }],
  })
  const css = await appCss(root)
  const inter = interFaces(root)
  if (!inter) console.log("(no build to take Inter from: the pictures use the fallback face)")
  const js = readFileSync(join(stubs, "app.js"), "utf8").replace(/<\/script/gi, "<\\/script")
  writeFileSync(join(stubs, "index.html"), `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${inter}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased}</style></head><body><div id="app"></div><script>${js}</script></body></html>`)

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
  const p = await browser.newPage()
  await p.setRequestInterception(true)
  p.on("request", (r) => (r.url().startsWith("file:") || r.url().startsWith("data:") ? r.continue() : r.abort()))
  await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 })
  await p.goto(`file://${join(stubs, "index.html")}`)
  await sleep(1200)
  const sizes = {}
  for (const [heading, name] of CARDS) {
    const box = await p.evaluate((heading) => {
      const h = [...document.querySelectorAll("h2")].find((x) => x.textContent.trim() === heading)
      const card = h?.closest("section, [class*='rounded-2xl']")
      if (!card) return null
      card.scrollIntoView({ block: "center" })
      const r = card.getBoundingClientRect()
      return { x: r.left, y: r.top, width: r.width, height: r.height }
    }, heading)
    if (!box) throw new Error(`No card called ${heading}`)
    await sleep(300)
    const again = await p.evaluate((heading) => {
      const h = [...document.querySelectorAll("h2")].find((x) => x.textContent.trim() === heading)
      const r = h.closest("section, [class*='rounded-2xl']").getBoundingClientRect()
      return { x: r.left - 12, y: r.top - 12, width: r.width + 24, height: r.height + 24 }
    }, heading)
    const png = await p.screenshot({ clip: again, type: "png", captureBeyondViewport: false })
    await sharp(png).webp({ quality: 86 }).toFile(join(dest, `${name}.webp`))
    sizes[name] = [Math.round(again.width), Math.round(again.height)]
    console.log(`  ${name}.webp  ${sizes[name].join(" x ")}`)
  }
  await browser.close()
  writeFileSync(
    join(root, "lib/marketing/sell-shots.ts"),
    `/**
 * The /sell pages' screenshots of the real product editor, and their sizes in
 * CSS pixels (the files are 2x). Written by scripts/marketing-sell-shots.mjs;
 * run it again when the editor changes. The product in them is the demo preset
 * pack scripts/render-product-editor.tsx holds: made up, not a real store.
 */
export const SELL_SHOTS = ${JSON.stringify(sizes, null, 2).replace(/"(\w[\w-]*)": \[\s*(\d+),\s*(\d+)\s*\]/g, '"$1": [$2, $3]')} as const satisfies Record<string, readonly [number, number]>
`,
  )
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
