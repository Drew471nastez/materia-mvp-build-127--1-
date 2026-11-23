/**
 * ===========================================================================
 *  THE THEME MARKETPLACE'S PICTURES, CUT FROM THE TEMPLATES' COVERS (round 58)
 * ===========================================================================
 *   node scripts/build-theme-seo-images.mjs [template ...]
 *
 * The covers (public/themes/materia/<template>.webp, 1200 wide, and
 * <template>-phone.webp, 390 wide, scripts/build-theme-template-covers.ts)
 * are whole home pages, up to fourteen thousand pixels tall and 330 KB. A
 * card on /themes shows the top of one at about 300 by 375, so each card
 * downloaded a whole page to show its first screen. This cuts, for each
 * template in CODE_TEMPLATES, into public/themes/materia/seo/:
 *
 *   <t>-card-480.webp, <t>-card-800.webp   the top of the page at 4:5
 *   <t>-scroll.webp                        the whole page at 640 wide (6400 tall at
 *                                          most), the card's hover slides through it
 *   <t>-hero.webp                          the top at 1200 by 750, the gallery's first picture
 *   <t>-phone.webp                         the phone page's first screen, 390 by 844
 *   <t>-og.jpg                             the 1200 by 630 share card: the
 *                                          template's H1 in Inter beside its
 *                                          home page, drawn in Chromium
 *
 * The sizes are lib/themes/theme-seo.ts's, read from it, so the page's
 * width and height attributes and the files cannot disagree.
 *
 * RUN IT AGAIN AFTER THE COVERS ARE REBUILT. A template whose cover changed
 * keeps its old card until this has run.
 */
import { mkdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { build } from "esbuild"
import sharp from "sharp"
import puppeteer from "puppeteer-core"

const root = process.cwd()
const tmp = mkdtempSync(join(tmpdir(), "theme-seo-images-"))
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"

/* lib/themes/theme-seo.ts and the template list, compiled, for the sizes and the words. */
const bundle = join(tmp, "theme-seo.mjs")
await build({
  stdin: { contents: `export * from "./lib/themes/theme-seo"; export { CODE_TEMPLATES, CODE_THEME_PACKAGE } from "./lib/themes/marketplace-shared"`, resolveDir: root, loader: "ts" },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: bundle,
  alias: { "@": root },
  logLevel: "error",
})
const seo = await import(pathToFileURL(bundle).href)
const { CODE_TEMPLATES, CODE_THEME_PACKAGE } = seo

const only = process.argv.slice(2)
const coverDir = join(root, "public/themes", CODE_THEME_PACKAGE)
const outDir = join(root, "public", seo.SEO_IMAGE_DIR)
mkdirSync(outDir, { recursive: true })

const fontDir = join(root, "lib/checkout/fonts")
const font = (f) => `data:font/woff;base64,${readFileSync(join(fontDir, f)).toString("base64")}`
const mark = (() => {
  const src = readFileSync(join(root, "components/storelib-mark.tsx"), "utf8")
  const path = src.match(/STORELIB_S_PATH = "([^"]+)"/)[1]
  const transform = src.match(/STORELIB_S_TRANSFORM = "([^"]+)"/)[1]
  return `<svg viewBox="0 0 200 200" width="44" height="44"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a2a30"/><stop offset=".55" stop-color="#141418"/><stop offset="1" stop-color="#08080a"/></linearGradient></defs><rect width="200" height="200" rx="44" fill="url(#g)"/><svg x="49" y="38.4" width="102" height="123" viewBox="54 43 94.5 114"><path d="${path}" transform="${transform}" fill="#fff"/></svg></svg>`
})()

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--font-render-hinting=none"] })
const page = await browser.newPage()
await page.setViewport({ width: seo.OG_SIZE.w, height: seo.OG_SIZE.h, deviceScaleFactor: 1 })

const report = []
for (const t of CODE_TEMPLATES) {
  if (only.length && !only.includes(t.template) && !only.includes(t.slug)) continue
  const desktop = join(coverDir, `${t.template}.webp`)
  const phone = join(coverDir, `${t.template}-phone.webp`)
  const meta = await sharp(desktop).metadata()
  const W = meta.width
  const out = (name) => join(outDir, `${t.template}-${name}`)

  /* The card: the top of the page at 4:5. */
  const cardH = Math.round((W * seo.CARD_RATIO.h) / seo.CARD_RATIO.w)
  for (const w of seo.CARD_WIDTHS) {
    await sharp(desktop).extract({ left: 0, top: 0, width: W, height: Math.min(cardH, meta.height) }).resize(w, Math.round((w * seo.CARD_RATIO.h) / seo.CARD_RATIO.w), { fit: "cover", position: "top" }).webp({ quality: 74, effort: 6 }).toFile(out(`card-${w}.webp`))
  }
  /* The card's hover (round 23): the whole home page at 640 wide, so the card can slide through it. Its top is the card's picture. */
  const scrollW = seo.SCROLL_WIDTH ?? 640
  const scrollMax = seo.SCROLL_MAX_HEIGHT ?? 6400
  const scrollTop = Math.min(meta.height, Math.round((scrollMax * W) / scrollW))
  await sharp(desktop).extract({ left: 0, top: 0, width: W, height: scrollTop }).resize(scrollW).webp({ quality: 70, effort: 6 }).toFile(out("scroll.webp"))
  /* The hero: the first screen at 8:5. */
  const heroH = Math.round((W * seo.HERO_SIZE.h) / seo.HERO_SIZE.w)
  await sharp(desktop).extract({ left: 0, top: 0, width: W, height: Math.min(heroH, meta.height) }).resize(seo.HERO_SIZE.w, seo.HERO_SIZE.h, { fit: "cover", position: "top" }).webp({ quality: 78, effort: 6 }).toFile(out("hero.webp"))
  /* The phone's first screen. */
  const pm = await sharp(phone).metadata()
  const phoneH = Math.round((pm.width * seo.PHONE_SIZE.h) / seo.PHONE_SIZE.w)
  await sharp(phone).extract({ left: 0, top: 0, width: pm.width, height: Math.min(phoneH, pm.height) }).resize(seo.PHONE_SIZE.w, seo.PHONE_SIZE.h, { fit: "cover", position: "top" }).webp({ quality: 78, effort: 6 }).toFile(out("phone.webp"))

  /* The share card, in Chromium, with the real face. */
  const copy = seo.themeSeoFor(t.slug)
  const heroData = `data:image/webp;base64,${readFileSync(out("hero.webp")).toString("base64")}`
  const phoneData = `data:image/webp;base64,${readFileSync(out("phone.webp")).toString("base64")}`
  const h1 = copy?.h1 ?? `${t.name} website template`
  await page.setContent(`<!doctype html><html><head><style>
    @font-face { font-family: Inter; font-weight: 400; src: url(${font("Inter-Regular.woff")}) format("woff"); }
    @font-face { font-family: Inter; font-weight: 600; src: url(${font("Inter-SemiBold.woff")}) format("woff"); }
    html, body { margin: 0; }
    body { width: 1200px; height: 630px; overflow: hidden; background: #f8f9fa; font-family: Inter; color: #1a1a2e; position: relative; }
    .text { position: absolute; left: 64px; top: 64px; width: 470px; height: 502px; display: flex; flex-direction: column; }
    .brand { display: flex; align-items: center; gap: 14px; font-size: 24px; font-weight: 600; }
    h1 { margin: auto 0 0; font-size: 52px; line-height: 1.08; font-weight: 600; letter-spacing: -0.02em; }
    .sub { margin-top: 22px; font-size: 24px; color: #6b7280; }
    .desk { position: absolute; left: 590px; top: 64px; width: 760px; height: 475px; border-radius: 16px; overflow: hidden; background: #fff; box-shadow: 0 0 0 1px rgba(17,24,39,.08), 0 24px 48px -24px rgba(17,24,39,.35); }
    .desk img { width: 100%; display: block; }
    .phone { position: absolute; left: 540px; top: 250px; width: 170px; height: 368px; border-radius: 22px; overflow: hidden; background: #fff; box-shadow: 0 0 0 1px rgba(17,24,39,.1), 0 20px 40px -18px rgba(17,24,39,.45); }
    .phone img { width: 100%; display: block; }
  </style></head><body>
    <div class="text"><div class="brand">${mark}<span>Storelib</span></div><h1>${h1.replace(/&/g, "&amp;")}</h1><div class="sub">${t.name}. Free to use.</div></div>
    <div class="desk"><img src="${heroData}"></div>
    <div class="phone"><img src="${phoneData}"></div>
  </body></html>`, { waitUntil: "load" })
  await page.evaluate(() => document.fonts.ready)
  const png = await page.screenshot({ type: "png" })
  await sharp(png).jpeg({ quality: 82, mozjpeg: true }).toFile(out("og.jpg"))

  const kb = (f) => Math.round(statSync(out(f)).size / 1024)
  report.push(`${t.template.padEnd(14)} card ${kb("card-480.webp")}/${kb("card-800.webp")} KB, scroll ${kb("scroll.webp")} KB, hero ${kb("hero.webp")} KB, phone ${kb("phone.webp")} KB, og ${kb("og.jpg")} KB (cover was ${Math.round(statSync(desktop).size / 1024)} KB)`)
}
await browser.close()
rmSync(tmp, { recursive: true, force: true })
console.log(report.join("\n"))
writeFileSync(join(outDir, "README.txt"), "Cut from ../<template>.webp by scripts/build-theme-seo-images.mjs. Run it again after the covers change.\n")
