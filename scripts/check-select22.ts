/**
 * ===========================================================================
 *  THE CANVAS SELECTOR ON AN IMPORTED THEME'S PRODUCT PAGE
 * ===========================================================================
 *   npx tsx scripts/check-select22.ts [1440] [1920] [phonepreview] [390]
 *
 * The real editor (scripts/render-editor-probe.tsx) on the theme built the
 * way Posturex is (tests/fixtures/shopify-posture), opened on its product
 * page: a rating, the title, the price, a two column list of benefits, the
 * bundle widget under "Save more", a stock line and the product form, each a
 * block of one section. The owner's screenshots showed the selected block
 * outlined by its two sides only, the lines above and under it gone.
 *
 * For each block a point inside it is pressed (a mouse, or a finger at
 * 390x844 with touch and the CPU slowed 4x) and read in the frame:
 *
 *   the block selected is that block, not its section or a neighbour
 *   the outline drawn is on the block, 2px out, within 2px
 *   all four of its lines are drawn (a border width above zero on each side)
 *   the builder's toolbar is on screen for its section
 *
 * With a mouse the pointer is also rested on another block: the lighter
 * hover outline is on that block, four sides, and not on the selected one.
 * Last, the page is scrolled so the selected title passes under the theme's
 * sticky header: the outline never draws over the header, and only the line
 * that is under it is left off.
 *
 * Measurements, not opinions. Exits 1 on any failure. Screenshots (and a
 * close crop of each outline) go to $OUT (default /tmp/select22).
 */
import { mkdirSync } from "node:fs"
import puppeteer, { type Browser, type Frame } from "puppeteer-core"
import sharp from "sharp"
import { editorFor } from "./check-builder-nav19"

const OUT = process.env.OUT ?? "/tmp/select22"
const CHROME = process.env.CHROME ?? "/opt/pw-browsers/chromium"
mkdirSync(OUT, { recursive: true })
const parts = new Set(process.argv.slice(2))
const all = parts.size === 0
let failed = 0
const check = (label: string, ok: boolean, detail: unknown = "") => {
  if (!ok) failed++
  const d = typeof detail === "string" ? detail : JSON.stringify(detail)
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${d ? `  (${d})` : ""}`)
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const within = <T,>(p: Promise<T>, ms = 1500): Promise<T> => Promise.race([p, new Promise<T>((_, no) => setTimeout(() => no(new Error("no answer")), ms))])

/** Each block, by the part of it a person presses. */
const TARGETS = [
  { block: "rating", at: ".product-info__rating span:last-child" },
  { block: "title", at: ".product-info__title h1" },
  { block: "price", at: ".product-info__price .price" },
  { block: "benefits", at: ".product-info__benefits li:nth-child(2)" },
  { block: "bundle", at: ".bundle__option--best b" },
  { block: "stock", at: ".product-info__stock" },
  { block: "buy", at: ".product-form__qty" },
] as const

type Box = { left: number; top: number; right: number; bottom: number; bt: number; br: number; bb: number; bl: number }
const boxOf = (frame: Frame, kind: string): Promise<Box | null> =>
  within(frame.evaluate((k) => {
    const b = document.querySelector<HTMLElement>(`[data-sl-box=${k}]`)
    if (!b) return null
    const cs = getComputedStyle(b)
    if (cs.display === "none" || cs.opacity === "0") return null
    const r = b.getBoundingClientRect()
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, bt: parseFloat(cs.borderTopWidth), br: parseFloat(cs.borderRightWidth), bb: parseFloat(cs.borderBottomWidth), bl: parseFloat(cs.borderLeftWidth) }
  }, kind))
const fourSides = (b: Box | null) => !!b && b.bt > 0 && b.br > 0 && b.bb > 0 && b.bl > 0

async function pageInCanvas(frame: Frame): Promise<string> {
  return within(frame.evaluate(() => (document.querySelector(".product-info") ? "product" : "other"))).catch(() => "?")
}

async function run(browser: Browser, label: string, width: number, height: number, touch: boolean, phonePreview = false) {
  console.log(`\nselector on the product page, ${label}`)
  const ed = await editorFor(browser, width, height, touch)
  try {
    if (touch) {
      const cdp = await ed.page.createCDPSession()
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
    }
    let frame = await ed.frame()
    await sleep(900)
    if (phonePreview) {
      await ed.page.click("[data-wb-device-switch]")
      await sleep(1200)
      frame = await ed.frame()
    }
    /* To the product page: the header's link to it, pressed in the page. */
    await within(frame.evaluate(() => { const a = document.querySelector<HTMLAnchorElement>('a[href="/products/posture-corrector"]'); a?.click() }))
    for (let i = 0; i < 60; i++) {
      await sleep(150)
      const f = await ed.frame().catch(() => null)
      if (f && (await pageInCanvas(f)) === "product") { frame = f; break }
    }
    check(`${label}: the canvas opened the product page`, (await pageInCanvas(frame)) === "product")
    await sleep(1200)
    const fh = await ed.page.$("[data-compat-frame='front']")
    const fb = (await fh!.boundingBox())!
    const press = async (x: number, y: number) => (touch ? ed.page.touchscreen.tap(fb.x + x, fb.y + y) : ed.page.mouse.click(fb.x + x, fb.y + y))
    const bad: string[] = []
    let shot = 0
    for (const t of TARGETS) {
      /* In the middle of the screen, clear of the sticky header and a phone's tab bar. */
      await within(frame.evaluate((s) => { const el = document.querySelector(s)!; const r = el.getBoundingClientRect(); scrollTo(0, scrollY + r.top - innerHeight * 0.4) }, t.at))
      await sleep(350)
      const p = await within(frame.evaluate((s) => { const r = document.querySelector(s)!.getBoundingClientRect(); return { x: r.left + Math.min(r.width / 2, 60), y: r.top + r.height / 2 } }, t.at))
      await press(p.x, p.y)
      await sleep(touch ? 1300 : 800)
      const sel = await within(frame.evaluate(() => {
        const b = document.querySelector<HTMLElement>("[data-sl-selected-block]")
        const r = b?.getBoundingClientRect()
        return { block: b?.getAttribute("data-block-id") ?? null, rect: r ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : null, vw: document.documentElement.clientWidth, vh: innerHeight }
      }))
      const box = await boxOf(frame, "block")
      /* The section's toolbar, on the page it belongs to: inside the frame the page is drawn in (the phone preview's is narrower than the canvas). */
      const toolbar = await ed.page.evaluate((f) => { const b = document.querySelector<HTMLElement>(".wb-section-toolbar"); const r = b?.getBoundingClientRect(); return !!r && r.height > 0 && r.left >= f.x - 1 && r.right <= f.x + f.width + 1 && r.top >= f.y - 1 }, { x: fb.x, y: fb.y, width: fb.width })
      const blockId = sel.block ?? ""
      const right = blockId === t.block || blockId.endsWith(`-${t.block}`) || blockId.endsWith(t.block)
      let off = 99
      if (box && sel.rect) {
        const want = { left: Math.max(sel.rect.left - 2, 0), top: Math.max(sel.rect.top - 2, 0), right: Math.min(sel.rect.right + 2, sel.vw), bottom: Math.min(sel.rect.bottom + 2, sel.vh) }
        off = Math.max(Math.abs(box.left - want.left), Math.abs(box.top - want.top), Math.abs(box.right - want.right), Math.abs(box.bottom - want.bottom))
      }
      const ok = right && fourSides(box) && off <= 2 && (touch || toolbar)
      if (!ok) bad.push(`${t.block}: got ${blockId || "none"}, sides ${box ? [box.bt, box.br, box.bb, box.bl].join("/") : "no box"}, off ${off.toFixed(1)}, toolbar ${toolbar}`)
      console.log(`        ${t.block.padEnd(9)} -> ${(blockId || "none").padEnd(20)} sides ${box ? [box.bt, box.br, box.bb, box.bl].join("/") : "no box"}  off ${off.toFixed(1)}px  toolbar ${toolbar}`)
      if (t.block === "title" || t.block === "benefits" || t.block === "bundle") {
        const file = `${OUT}/${label}-${t.block}.png`
        await ed.page.screenshot({ path: file })
        if (box) {
          const pad = 40
          const L = Math.max(0, Math.floor(fb.x + box.left - pad)), T = Math.max(0, Math.floor(fb.y + box.top - pad))
          const W = Math.min(Math.ceil(box.right - box.left + pad * 2), width - L), H = Math.min(Math.ceil(box.bottom - box.top + pad * 2), height - T)
          await sharp(file).extract({ left: L, top: T, width: W, height: H }).toFile(`${OUT}/${label}-${t.block}-crop.png`).catch(() => {})
        }
        shot++
      }
    }
    check(`${label}: each block pressed is the one selected, outlined on four sides on its own box, with its toolbar inside the page's frame`, bad.length === 0, bad.length ? bad.join(" | ") : `${TARGETS.length} blocks`)
    if (!touch) {
      /* Rest the mouse on the benefits while the bundle is selected. */
      await within(frame.evaluate(() => { const el = document.querySelector(".product-info__price")!; scrollTo(0, scrollY + el.getBoundingClientRect().top - 200) }))
      await sleep(300)
      await press(...(Object.values(await within(frame.evaluate(() => { const r = document.querySelector(".product-info__title h1")!.getBoundingClientRect(); return { x: r.left + 40, y: r.top + r.height / 2 } }))) as [number, number]))
      await sleep(500)
      const hp = await within(frame.evaluate(() => { const r = document.querySelector(".product-info__benefits li:nth-child(3)")!.getBoundingClientRect(); return { x: r.left + 30, y: r.top + r.height / 2 } }))
      await ed.page.mouse.move(fb.x + hp.x, fb.y + hp.y, { steps: 4 })
      await sleep(500)
      const hov = await boxOf(frame, "hover")
      const ben = await within(frame.evaluate(() => { const r = document.querySelector(".product-info__benefits")!.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom } }))
      const hoff = hov ? Math.max(Math.abs(hov.left - ben.left), Math.abs(hov.top - ben.top), Math.abs(hov.right - ben.right), Math.abs(hov.bottom - ben.bottom)) : 99
      await ed.page.screenshot({ path: `${OUT}/${label}-hover.png` })
      check(`${label}: the mouse on another block outlines that block lightly, four sides`, fourSides(hov) && hoff <= 2, { hov, ben, off: hoff })
      const still = await boxOf(frame, "block")
      check(`${label}: the selected block keeps its outline while another is hovered`, fourSides(still))
    }
    /* The selected title scrolled up under the sticky header: cut there, never over it. The fixture's header sticks inside its own section; held at the top here as a theme's sticky header group is. */
    await within(frame.evaluate(() => { const s = document.querySelector(".site-header")!.closest<HTMLElement>(".shopify-section")!; s.style.position = "sticky"; s.style.top = "0"; s.style.zIndex = "20"; document.body.style.paddingBottom = "1600px"; const t = document.querySelector(".product-info__title")!; scrollTo(0, scrollY + t.getBoundingClientRect().top - innerHeight * 0.4) }))
    await sleep(400)
    await press(...(Object.values(await within(frame.evaluate(() => { const r = document.querySelector(".product-info__title h1")!.getBoundingClientRect(); return { x: r.left + 40, y: r.top + r.height / 2 } }))) as [number, number]))
    await sleep(touch ? 1300 : 700)
    const head = await within(frame.evaluate(() => { const h = document.querySelector(".site-header")!.getBoundingClientRect(); const el = document.querySelector(".product-info__title")!; scrollTo(0, scrollY + el.getBoundingClientRect().top - h.bottom + el.getBoundingClientRect().height / 2); return h.height }))
    await sleep(500)
    const cut = await boxOf(frame, "block")
    const hb = await within(frame.evaluate(() => document.querySelector(".site-header")!.getBoundingClientRect().bottom))
    await ed.page.screenshot({ path: `${OUT}/${label}-under-header.png` })
    check(`${label}: half under the sticky header, the outline stops at the header with no line along it, the other three drawn`, !!cut && cut.top >= hb - 1 && cut.bt === 0 && cut.bl > 0 && cut.br > 0 && cut.bb > 0, { cut, headerBottom: hb, head })
  } finally {
    ed.close()
  }
}

async function main() {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--hide-scrollbars"] })
  try {
    if (all || parts.has("1440")) await run(browser, "1440", 1440, 900, false)
    if (all || parts.has("1920")) await run(browser, "1920", 1920, 1080, false)
    if (all || parts.has("phonepreview")) await run(browser, "phonepreview", 1440, 900, false, true)
    if (all || parts.has("390")) await run(browser, "390", 390, 844, true)
  } finally {
    await browser.close()
  }
  console.log(failed ? `\n${failed} failed` : "\nall passed")
  process.exit(failed ? 1 : 0)
}

if (require.main === module) void main()
