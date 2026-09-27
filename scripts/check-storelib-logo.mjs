/**
 * ===========================================================================
 *  THE LOGO, 7PX CORNERS AND A SHADOW YOU ALMOST CANNOT SEE, EVERYWHERE
 * ===========================================================================
 * "Everywhere it appears it must sit in a 7px border radius (no sharp
 * corners) with extremely little depth, just a tiny, almost unnoticeable
 * shadow."
 *
 * Mounts the shared component (components/brand/storelib-logo.tsx) at every
 * size the product draws it, on white and on the dark bar, and the surfaces
 * that carry it (scripts/render-storelib-logo.tsx), in the real stylesheet,
 * with the real image files from public/. For every logo on the page:
 *
 *   it is the new picture, and it loaded
 *   its box is square and the size it was asked for, before the picture
 *     arrives as well as after (no layout shift)
 *   its computed corner is 7px, or under 18px the proportional corner
 *   its shadow is the faint one and nothing else
 *
 * and it writes screenshots to look at.
 *
 *   PROBE_CSS=source node scripts/check-storelib-logo.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) { console.error(`No browser at ${CHROMIUM}.`); process.exit(1) }
const dir = join(root, ".storelib-logo-probe")
const shots = process.env.SHOTS_DIR || join(tmpdir(), "storelib-logo-shots")
mkdirSync(dir, { recursive: true })
mkdirSync(shots, { recursive: true })

writeFileSync(join(dir, "next-navigation.js"), `const r = { push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} }
export const useRouter = () => r
export const usePathname = () => "/library"
export const useSearchParams = () => new URLSearchParams()
export const useParams = () => ({})
`)
writeFileSync(join(dir, "next-link.js"), `import * as React from "react"
export default function Link({ href, children, prefetch, replace, scroll, ...rest }) { return React.createElement("a", { href: String(href), ...rest }, children) }
export const useLinkStatus = () => ({ pending: false })
`)
/* The picture from public/, as the page would get it. */
writeFileSync(join(dir, "next-image.js"), `import * as React from "react"
export default function Image({ src, alt, fill, priority, preload, unoptimized, quality, sizes, ...rest }) {
  const s = typeof src === "string" ? src : ""
  return React.createElement("img", { src: s.startsWith("/") ? ${JSON.stringify(`file://${root}/public`)} + s : s, alt, ...rest })
}
`)

const css = await appCss(root)
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-storelib-logo.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe.js")}`,
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production",NEXT_PUBLIC_SUPABASE_URL:"https://placeholder.supabase.co",NEXT_PUBLIC_SUPABASE_ANON_KEY:"placeholder"},browser:true};globalThis.process=process;',
  '--define:process.env.NODE_ENV="production"',
  `--alias:next/navigation=${join(dir, "next-navigation.js")}`,
  `--alias:next/link=${join(dir, "next-link.js")}`,
  `--alias:next/image=${join(dir, "next-image.js")}`,
  `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
  { cwd: root, stdio: "inherit" })

const IDS = ["sizes-light", "sizes-dark", "auth", "still", "dashboard", "wishlist", "cta", "tool-stack", "seller-footer", "seller-footer-phone", "marketing-footer", "offline"]
writeFileSync(join(dir, "index.html"), `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif;background:#fff}.probe{margin-bottom:24px;position:relative}
#dashboard{height:260px;overflow:hidden;transform:translateZ(0)} #offline{height:520px;overflow:hidden;transform:translateZ(0)} #wishlist{height:120px;overflow:hidden} #still{height:72px;transform:translateZ(0)}</style></head><body>
${IDS.map((id) => `<div class="probe" id="${id}" data-probe="${id}"></div>`).join("\n")}
<script src="probe.js"></script></body></html>`)

const MEASURE = `(() => {
  const out = []
  for (const img of document.querySelectorAll("[data-storelib-logo]")) {
    if (!img.getClientRects().length) continue
    const r = img.getBoundingClientRect()
    const cs = getComputedStyle(img)
    out.push({
      where: img.closest("[data-probe]")?.dataset.probe,
      asked: Number(img.getAttribute("width")),
      probeSize: img.dataset.probeSize ? Number(img.dataset.probeSize) : null,
      w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10,
      radius: cs.borderTopLeftRadius, radii: [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius],
      shadow: cs.boxShadow, fit: cs.objectFit,
      src: img.currentSrc || img.src, loaded: img.complete && img.naturalWidth > 0, natural: img.naturalWidth,
    })
  }
  return out
})()`

/* What the corner should be at a drawn size (lib/brand/logo.ts storelibLogoRadius). */
const expectRadius = (w, where = "") => (w >= 18 && !/^seller-footer/.test(where) ? 7 : Math.round(((w * 7) / 32) * 10) / 10)
/* The creator page footer's mark keeps the logo's proportion at every size: the owner found 7px on its 18px mark read as a circle. */

const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--allow-file-access-from-files"] })
let broken = 0
const fail = (m) => { broken++; console.log(`  FAIL  ${m}`) }
const ok = (m) => console.log(`  ok    ${m}`)
try {
  for (const width of [390, 1280]) {
    /* TWICE: once with the picture blocked, to see the box is reserved before it arrives. */
    for (const blocked of [true, false]) {
      const page = await browser.newPage()
      await page.setViewport({ width, height: 900, deviceScaleFactor: 2 })
      if (blocked) {
        await page.setRequestInterception(true)
        page.on("request", (req) => (/\/images\/brand\/storelib-logo/.test(req.url()) ? req.abort() : req.continue()))
      }
      await page.goto(`file://${join(dir, "index.html")}`)
      await page.waitForFunction(() => document.querySelectorAll("[data-storelib-logo]").length >= 20, { timeout: 15000 })
      /* The offline screen shows on the event, once its listener is attached. */
      await page.waitForFunction(() => { window.dispatchEvent(new Event("offline")); return !!document.querySelector("#offline [data-storelib-logo]") }, { timeout: 10000, polling: 100 })
      await page.evaluate(() => document.fonts.ready)
      if (!blocked) await page.waitForFunction(() => [...document.querySelectorAll("[data-storelib-logo]")].filter((i) => i.getClientRects().length).every((i) => i.complete), { timeout: 15000 })
      const logos = await page.evaluate(MEASURE)
      console.log(`\n${width}px${blocked ? ", picture blocked" : ""}: ${logos.length} logos on screen`)
      const where = [...new Set(logos.map((l) => l.where))]
      console.log(`  on: ${where.join(", ")}`)
      for (const l of logos) {
        const tag = `${l.where} ${l.w}x${l.h}`
        if (Math.abs(l.w - l.h) > 0.5) fail(`${tag}: not square`)
        if (l.probeSize && Math.abs(l.w - l.probeSize) > 0.5) fail(`${tag}: asked for ${l.probeSize}`)
        const want = expectRadius(l.w, l.where)
        const got = l.radii.map((r) => parseFloat(r))
        if (got.some((r) => Math.abs(r - want) > 0.15)) fail(`${tag}: corners ${l.radii.join(" ")}, want ${want}px`)
        if (!/rgba\(15, 23, 42, 0\.06\) 0px 0px 0px 0\.5px, rgba\(15, 23, 42, 0\.05\) 0px 1px 1\.5px 0px/.test(l.shadow)) fail(`${tag}: shadow is ${l.shadow}`)
        if (!blocked) {
          if (!/\/images\/brand\/storelib-logo-v2\.webp$/.test(l.src)) fail(`${tag}: draws ${l.src}`)
          if (!l.loaded || l.natural !== 512) fail(`${tag}: did not load the 512px picture (${l.natural})`)
        }
      }
      if (!broken) ok(`every logo square, at its size, ${[...new Set(logos.map((l) => l.radius))].join(" / ")} corners, the faint shadow${blocked ? ", box held with no picture" : ", the new picture loaded"}`)
      if (!blocked) {
        const shot = async (name, el) => { const b = el && (await el.boundingBox()); if (b && b.height > 0) await el.screenshot({ path: join(shots, `${width}-${name}.png`) }) }
        for (const id of IDS) await shot(id, await page.$(`#${id}`))
        /* The logos alone, close: one crop per surface around its first logo. */
        const boxes = await page.evaluate(() => [...document.querySelectorAll("[data-storelib-logo]")].filter((i) => i.getClientRects().length).map((i) => { const r = i.getBoundingClientRect(); return { where: i.closest("[data-probe]").dataset.probe, x: r.x + scrollX, y: r.y + scrollY, w: r.width } }))
        const seen = new Set()
        for (const b of boxes) {
          if (seen.has(b.where) || b.where.startsWith("sizes")) continue
          seen.add(b.where)
          await page.screenshot({ path: join(shots, `${width}-close-${b.where}.png`), clip: { x: Math.max(0, b.x - 12), y: Math.max(0, b.y - 12), width: b.w + 24, height: b.w + 24 } })
        }
      }
      await page.close()
    }
  }
} finally {
  await browser.close()
  rmSync(dir, { recursive: true, force: true })
}
console.log(broken ? `\n${broken} problem(s). Screenshots in ${shots}` : `\nall good. Screenshots in ${shots}`)
process.exit(broken ? 1 : 0)
