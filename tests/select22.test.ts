/**
 * THE CANVAS SELECTOR DRAWS FOUR SIDES ROUND WHAT IS PICKED
 *
 *   npx tsx tests/select22.test.ts
 *
 * The owner's screenshots: on an imported theme's product page (PostureX),
 * the selected benefits list and the selected title were outlined by their
 * two sides only. The block's outline is drawn 2px outside it, and the part
 * of it that can be seen was read with hit tests 1px inside that outline,
 * which is outside the block: the point over its top and the point under
 * its foot were the section around it, so both edges were taken as covered
 * and left off. The hit tests are now read inside the element and the 2px
 * added after; an edge is left off only where the element itself is cut.
 *
 * The bridge (lib/storelib-theme/compat/canvas-bridge.ts) is run for real in
 * Chromium on a page shaped like that one: a sticky header, a product
 * section that clips its overflow, a rating, a title, a price, a two column
 * benefits list and a bundle widget. The whole editor on the fixture theme
 * (tests/fixtures/shopify-posture) is driven by scripts/check-select22.ts.
 */
import { existsSync, readFileSync } from "node:fs"
import { CANVAS_BRIDGE } from "../lib/storelib-theme/compat/canvas-bridge"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const read = (p: string) => readFileSync(p, "utf8")

const PAGE = `<!doctype html><html><head><style>
  body{margin:0;font:16px/1.5 sans-serif}
  .shopify-section-group-header-group{position:sticky;top:0;z-index:20;background:#fff}
  .site-header{height:64px;display:flex;align-items:center;padding:0 16px;font-weight:800}
  .product{display:grid;grid-template-columns:1fr 1fr;gap:48px;padding:32px 16px;overflow:hidden}
  .media{height:600px;background:#222}
  .details{display:flex;flex-direction:column;gap:16px;min-width:0;overflow:hidden}
  .benefits{display:grid;grid-template-columns:1fr 1fr;gap:12px;list-style:none;margin:0;padding:0}
  .bundle{border:2px solid #6b7280;border-radius:16px;padding:20px}
  .drawer{position:fixed;inset:0;background:#fff;z-index:30;display:none}
  .drawer.open{display:block}
  .tall{height:1600px}
</style></head><body>
<div class="shopify-section shopify-section-group-header-group" id="shopify-section-header" data-section-id="header"><header class="site-header">PostureX</header></div>
<main>
<div class="shopify-section" id="shopify-section-main" data-section-id="main"><div class="product">
  <div class="media"></div>
  <div class="details">
    <div class="rating" data-block-id="rating">Rated 4.9 / 5</div>
    <div class="title" data-block-id="title"><h1 style="margin:0">Tech House Master Bundle 2025</h1></div>
    <div class="price" data-block-id="price"><b>$91.91</b></div>
    <ul class="benefits" data-block-id="benefits"><li>More tall</li><li>Instant correction</li><li>Reduces pain</li><li>Improves looks</li></ul>
    <div class="bundle" data-block-id="bundle"><p>SAVE MORE</p><label><input type="radio" name="b"> Bundle &amp; Save</label></div>
  </div>
</div></div>
<div class="shopify-section" id="shopify-section-after" data-section-id="after"><div class="tall"></div></div>
</main>
<div class="drawer"></div>
<script>
  window.__name = function (f) { return f };
  window.__picks = [];
  addEventListener("message", function (e) { if (e.data && e.data.type === "pick") window.__picks.push(e.data) });
  ${CANVAS_BRIDGE}
</script></body></html>`

async function bridgeInBrowser() {
  const chrome = process.env.CHROME ?? "/opt/pw-browsers/chromium"
  if (!existsSync(chrome)) {
    console.log("  --    no Chromium here: the bridge is held to its source only")
    return
  }
  const puppeteer = (await import("puppeteer-core")).default
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--no-sandbox"] })
  try {
    for (const [width, height] of [[1440, 900], [390, 844]] as const) {
      console.log(`\nThe bridge in a browser, ${width}x${height}`)
      const page = await browser.newPage()
      await page.setViewport({ width, height })
      await page.setContent(PAGE)
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
      const send = (m: Record<string, unknown>) => page.evaluate((m) => window.postMessage({ storelib: 1, ...m }, "*"), m)
      type Box = { left: number; top: number; right: number; bottom: number; sides: number[] } | null
      const box = (kind: string): Promise<Box> => page.evaluate((k) => {
        const b = (document.querySelector("[data-sl-box=layer]")?.shadowRoot ?? document).querySelector<HTMLElement>(`[data-sl-box=${k}]`)
        if (!b) return null
        const cs = getComputedStyle(b)
        if (cs.display === "none") return null
        const r = b.getBoundingClientRect()
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, sides: [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth].map(parseFloat) }
      }, kind)
      const rect = (sel: string) => page.evaluate((s) => { const r = document.querySelector(s)!.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom } }, sel)
      const four = (b: Box) => !!b && b.sides.every((x) => x > 0)
      const around = (b: Box, r: { left: number; top: number; right: number; bottom: number }, out: number) =>
        !!b && Math.max(Math.abs(b.left - Math.max(r.left - out, 0)), Math.abs(b.top - Math.max(r.top - out, 0)), Math.abs(b.right - Math.min(r.right + out, width)), Math.abs(b.bottom - Math.min(r.bottom + out, height))) <= 1
      const scrollTo = (y: number) => page.evaluate((y) => window.scrollTo(0, y), y)

      for (const id of ["benefits", "title", "rating", "price", "bundle"]) {
        await scrollTo(0)
        await send({ type: "select", sectionId: "main", blockId: id, inspect: true, scroll: false })
        await wait(120)
        const b = await box("block")
        const r = await rect(`[data-block-id=${id}]`)
        check(`the ${id} block selected is outlined on all four sides, 2px out`, four(b) && around(b, r, 2), { b, r })
      }
      check("one selection outline: the section's own ring is not drawn round the block", (await box("section")) === null)

      /* Clicked: the block under the pointer is what is picked. */
      await page.evaluate(() => { (window as unknown as { __picks: unknown[] }).__picks = [] })
      const li = await rect(".benefits li:nth-child(3)")
      await page.mouse.click(li.left + 10, li.top + 5)
      await wait(60)
      const picks = await page.evaluate(() => (window as unknown as { __picks: { sectionId: string; blockPath: string[] }[] }).__picks)
      check("a click inside the benefits list picks the benefits block, not the section", picks.length === 1 && picks[0].sectionId === "main" && picks[0].blockPath.join() === "benefits", picks)

      /* The mouse resting on another block: a lighter outline, on that block, four sides. */
      await send({ type: "select", sectionId: "main", blockId: "title", inspect: true, scroll: false })
      const pr = await rect("[data-block-id=price] b")
      await page.mouse.move(pr.left + 5, pr.top + 5)
      await wait(120)
      const hb = await box("hover")
      check("the hover is on the block under the pointer, four sides", four(hb) && around(hb, await rect("[data-block-id=price]"), 0), { hb })
      check("  and the selected block keeps its own outline", four(await box("block")))
      const tr = await rect("[data-block-id=title] h1")
      await page.mouse.move(tr.left + 5, tr.top + 5)
      await wait(120)
      check("the selected block under the pointer has no hover outline over its own", (await box("hover")) === null)
      const md = await rect(".media")
      await page.mouse.move(md.left + 20, md.top + 20)
      await wait(120)
      check("outside any block, the hover is the section", around(await box("hover"), await rect("#shopify-section-main"), 0))

      /* Scrolled so the title is half under the sticky header: cut at the header, the line along it left off, never drawn over it. */
      await send({ type: "select", sectionId: "main", blockId: "title", inspect: true, scroll: false })
      const t0 = await page.evaluate(() => document.querySelector("[data-block-id=title]")!.getBoundingClientRect().top + scrollY)
      const th = (await rect("[data-block-id=title]")).bottom - (await rect("[data-block-id=title]")).top
      await scrollTo(t0 - 64 + th / 2)
      await wait(150)
      const cut = await box("block")
      check("half under the sticky header: no line along the header, never over it, the other three drawn", !!cut && cut.top >= 63.5 && cut.sides[0] === 0 && cut.sides[1] > 0 && cut.sides[2] > 0 && cut.sides[3] > 0, cut)

      /* Just under the header and wholly seen: its top line is drawn. */
      await scrollTo(t0 - 70)
      await wait(150)
      check("just under the header and wholly seen, all four sides", four(await box("block")), await box("block"))
      /* Its top right on the header's foot: the line on the block's own top edge, not 2px into the header. */
      await scrollTo(t0 - 64)
      await wait(150)
      const flush = await box("block")
      check("right under the header: four sides, the top line below the header, not on it", four(flush) && !!flush && flush.top >= 63.5, flush)

      /* The benefits running off the foot of the screen: the line under them is left off, the rest drawn. */
      await page.evaluate(() => { document.querySelector("main")!.style.paddingTop = "1200px" })
      const b0 = await page.evaluate(() => document.querySelector("[data-block-id=benefits]")!.getBoundingClientRect().top + scrollY)
      await send({ type: "select", sectionId: "main", blockId: "benefits", inspect: true, scroll: false })
      await scrollTo(b0 - height + 20)
      await wait(150)
      const foot = await box("block")
      check("cut by the foot of the screen: only the line under it is left off", !!foot && foot.sides[2] === 0 && foot.sides[0] > 0 && foot.sides[1] > 0 && foot.sides[3] > 0, foot)

      /* A drawer opened over it: nothing drawn across the drawer. */
      await scrollTo(b0 - 300)
      await wait(100)
      await page.evaluate(() => document.querySelector(".drawer")!.classList.add("open"))
      await wait(900)
      const under = await box("block")
      const dr = await rect(".drawer")
      check("a drawer over the block: the outline is not drawn across it", !under || under.left >= dr.right - 1 || under.right <= dr.left + 1, { under, dr })
      await page.close()
    }
  } finally {
    await browser.close()
  }
}

async function main() {
  await bridgeInBrowser()

  console.log("\nThe bridge, its source")
  let reads = true
  try { new Function(CANVAS_BRIDGE) } catch { reads = false }
  check("the bridge reads as JavaScript", reads)
  check("the hit tests are read inside the element; the 2px are added after them", /var left = Math\.max\(r\.left, 0\), right = Math\.min\(r\.right, vw\);/.test(CANVAS_BRIDGE) && /var cutTop = from > r\.top \+ 0\.5, cutBottom = to < r\.bottom - 0\.5;/.test(CANVAS_BRIDGE))
  check("the hover is what a click would pick: the block, or its section", /var targetOf = function \(el\) \{ var s = sectionOf\(el\); return s \? blockOf\(el, s\) \|\| s : null; \};/.test(CANVAS_BRIDGE) && /hov !== blk && !\(hov === sec && !blk\)/.test(CANVAS_BRIDGE))

  console.log("\nThe section's toolbar")
  const editor = read("app/(storelib)/website-builder/editor/[installId]/page.tsx")
  check("it is placed against its own containing box, so in the phone preview it is on the page and not at the canvas's edge", /const host = \(barRef\.current\?\.offsetParent as HTMLElement \| null\) \?\? scroller/.test(editor) && /useLayoutEffect\(\(\) => \{ if \(mounted\) measureNow\.current\(\) \}, \[mounted\]\)/.test(editor))

  console.log("\nThe fixture theme's product page")
  const section = read("tests/fixtures/shopify-posture/sections/main-product-info.liquid")
  const template = JSON.parse(read("tests/fixtures/shopify-posture/templates/product.json")) as { sections: { main: { type: string; block_order: string[] } } }
  check("the product page is the PostureX one: rating, title, price, benefits, bundle, stock, form", template.sections.main.type === "main-product-info" && template.sections.main.block_order.join() === "rating,title,price,benefits,bundle,stock,buy")
  check("  each block carries its shopify_attributes", (section.match(/\{\{ block\.shopify_attributes \}\}/g) ?? []).length === 7)

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => { console.error(e); process.exit(1) })
