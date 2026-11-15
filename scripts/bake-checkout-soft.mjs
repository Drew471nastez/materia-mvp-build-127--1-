/**
 * ===========================================================================
 *  THE CHECKOUT SCENE'S BLURRED COPIES (home, landing rounds 10 and 11)
 * ===========================================================================
 * When the four dark cards come up over the checkout scene, the products
 * going round the phone (and the phone) go soft behind them. Blurring them in
 * the browser would cost a blur on every frame the ring turns, so each one has
 * a blurred copy baked here and the page only cross fades to it (opacity).
 *
 * The copies are taken from the scene itself, so the drawn digital products
 * (the LUT pack's box, the e-book, the course, the Notion page) and the phone
 * match what the page draws. Round 11 (the owner: the products "should be
 * more blurred as they disappear, go behind"): the same copies also take over
 * from the sharp objects as they go round the back of the ring, so they are
 * blurred harder (SIGMA.object 0.055 to 0.085 of the object's width).
 * Against a running dev server, at 1440 x 1200,
 * each object is drawn flat and alone on a transparent ground, cut out with a
 * fifth of its width spare on every side (SOFT_PAD in checkout-scene.tsx),
 * blurred (sharp premultiplies the colour by its alpha, so no fringe),
 * and saved small as webp with alpha in public/home/commerce/soft-<id>.webp.
 *
 *   node scripts/bake-checkout-soft.mjs [url]   (default http://localhost:3000/)
 *
 * It prints the sizes for SOFT in checkout-scene.tsx.
 */
import { chromium } from "playwright"
import sharp from "sharp"

const URL = process.argv[2] || "http://localhost:3000/"
const PAD = 0.2
/* Output widths, and the blur as a share of the object's own width. */
const OUT = { object: 112, phone: 168 }
const SIGMA = { object: 0.085, phone: 0.032 }
const IDS = ["tee", "luts", "cap", "course", "tote", "ebook", "notion"]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 }, deviceScaleFactor: 2 })
await page.goto(URL, { waitUntil: "load", timeout: 240000 })
for (let i = 0; i < 80 && !(await page.$(".cmc .cmc-o .cmc-sharp")); i++) {
  await page.evaluate(() => scrollBy(0, 900))
  await sleep(300)
}
await page.addStyleTag({
  content: `
html,body,.cmc,.cmc-stage{background:transparent!important}
body *{visibility:hidden!important;animation:none!important;transition:none!important}
.cmc-o,.cmc-face,.cmc-orbit,.cmc-ring,.cmc-world,.cmc-rise,.cmt,.cmc-pic,.cmc-sharp,.cmc-near,.cmc-phone,.cmc-phone-wrap{transform:none!important;opacity:1!important}
.cmc-soft,.cmc-far{display:none!important}
/* Round 11: the phone starts bigger than a screen; drawn here at a set size, clear of the top, so the whole of it is taken. */
.cmc-stage{--pe:200px!important}
.cmc-phone-wrap{top:160px!important}
.bake-on,.bake-on *{visibility:visible!important}`,
})
await page.evaluate(() => document.querySelector(".cmc-stage").scrollIntoView())
await sleep(1500)

async function bake(sel, name, kind) {
  const el = await page.$(sel)
  await el.evaluate((n) => n.classList.add("bake-on"))
  await el.evaluate((n) => Promise.all([...n.querySelectorAll("img")].map((i) => i.decode().catch(() => {}))))
  await sleep(300)
  const r = await el.evaluate((n) => {
    const b = n.getBoundingClientRect()
    return { x: b.x, y: b.y, w: b.width, h: b.height }
  })
  const p = r.w * PAD
  const png = await page.screenshot({ clip: { x: r.x - p, y: r.y - p, width: r.w + 2 * p, height: r.h + 2 * p }, omitBackground: true })
  await el.evaluate((n) => n.classList.remove("bake-on"))
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  for (let i = 3; i < data.length; i += 4) {
    /* The photographs' cut edges keep a light rim of their old ground; a blur would spread it into a glow. Edge pixels go: the blur makes a soft edge anyway. */
    if (data[i] < 200) data[i] = 0
  }
  /* sharp blurs with the colour premultiplied by its alpha, so a transparent ground adds no dark or light fringe. */
  const sigma = SIGMA[kind] * r.w * 2
  const blurred = await sharp(data, { raw: info }).blur(sigma).raw().toBuffer({ resolveWithObject: true })
  const w = OUT[kind]
  const h = Math.round((w * info.height) / info.width)
  await sharp(blurred.data, { raw: blurred.info }).resize(w, h).webp({ quality: 70, alphaQuality: 70, effort: 6 }).toFile(`public/home/commerce/soft-${name}.webp`)
  return [name, { w, h }]
}

const sizes = []
for (const id of IDS) sizes.push(await bake(`.cmc-o[data-f="${id}"] .cmc-sharp`, id, "object"))
sizes.push(await bake(".cmc-rise > .cmc-phone", "phone", "phone"))
await browser.close()
console.log(sizes.map(([n, s]) => `  ${n}: { w: ${s.w}, h: ${s.h} },`).join("\n"))
