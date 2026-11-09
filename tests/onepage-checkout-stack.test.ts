/**
 * ===========================================================================
 *  ROUND AK: PRODUCT SHEET, THEN CHECKOUT, AND PICTURES WITHOUT BARS
 * ===========================================================================
 * The rules behind what scripts/check-onepage-checkout-stack.mjs measures in a browser:
 *
 *   FLOW      one state for the sheet and the checkout (lib/onepage/purchase-flow): Buy closes the sheet, and the
 *             checkout opens only once the sheet is gone (or after HANDOFF_MAX_MS); Back from the checkout is the
 *             sheet; a late "sheet gone" never opens a checkout nobody asked for
 *   HISTORY   the checkout stands on its own history entry, made from the sheet's (a replace, not a Back)
 *   BARS      the product editor's 16:9 grey padding is found in the pixels (lib/images/letterbox) and cut off;
 *             a picture's own white edge on one side is kept
 *   FRAME     the gallery's frame is the first picture's own shape, the same for every slide
 *   CHECKOUT  the head shows the product's picture, the block's own first, never the avatar while one exists;
 *             the window takes focus and keeps Tab inside
 *
 *   npx tsx tests/onepage-checkout-stack.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { HANDOFF_MAX_MS, PURCHASE_CLOSED, checkoutEntryOf, purchaseStep, sheetShown, type PurchaseLayer } from "@/lib/onepage/purchase-flow"
import { contentRatio, coverBox, findLetterbox } from "@/lib/images/letterbox"
import { SHEET_FRAME_MAX, SHEET_FRAME_MIN, SHEET_GALLERY_RATIO, sheetFrameRatio } from "@/lib/onepage/product-sheet"
import { productCover, withOriginalCover } from "@/lib/products/cover"
import { coverOriginalOf } from "@/app/(storelib)/app/products/new/editor-form"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `  ${JSON.stringify(detail)}`}`)
}
const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), "utf8")
const near = (a: number, b: number, e = 0.02) => Math.abs(a - b) <= e

console.log("FLOW")
{
  let s: PurchaseLayer = PURCHASE_CLOSED
  s = purchaseStep(s, { type: "open" })
  check("open shows the sheet", sheetShown(s) && s.kind === "sheet")
  s = purchaseStep(s, { type: "buy", variantId: "v2" })
  check("buy from the sheet hands off: the sheet is no longer shown, no checkout yet", s.kind === "handoff" && !sheetShown(s))
  check("the close a sheet makes as it leaves does not cancel the handoff", purchaseStep(s, { type: "back" }).kind === "handoff")
  s = purchaseStep(s, { type: "sheet-gone" })
  check("once the sheet is gone, the checkout, with the chosen option", s.kind === "checkout" && s.variantId === "v2" && s.fromSheet === true)
  check("a second sheet-gone changes nothing", purchaseStep(s, { type: "sheet-gone" }) === s)
  const back = purchaseStep(s, { type: "back" })
  check("the checkout's Back is the sheet again", back.kind === "sheet")
  check("close from the checkout closes everything", purchaseStep(s, { type: "close" }).kind === "closed")
  check("a late sheet-gone after a plain close opens nothing", purchaseStep(PURCHASE_CLOSED, { type: "sheet-gone" }).kind === "closed")
  check("too long in the handoff opens the checkout anyway", purchaseStep({ kind: "handoff", variantId: null }, { type: "too-long" }).kind === "checkout")
  const direct = purchaseStep(PURCHASE_CLOSED, { type: "buy", variantId: null })
  check("the block's own button opens the checkout with no sheet and no Back", direct.kind === "checkout" && direct.fromSheet === false)
  check("Back from a direct checkout closes it", purchaseStep(direct, { type: "back" }).kind === "closed")
  check("the handoff is waited for at most 700ms", HANDOFF_MAX_MS > 200 && HANDOFF_MAX_MS <= 700)
  check("the checkout's history entry is read back by block id", checkoutEntryOf({ onepageCheckout: "b1", other: 1 }) === "b1" && checkoutEntryOf(null) === null && checkoutEntryOf({}) === null)
}

console.log("HISTORY AND WIRING")
{
  const block = read("components/onepage/product-block.tsx")
  check("the block keeps one purchase state, not two booleans", /useState<PurchaseLayer>/.test(block) && !/setSheetOpen|setCheckout\(/.test(block))
  check("the sheet's Buy goes through the flow, and the checkout waits for the sheet's onClosed", /onBuy=\{buy\}/.test(block) && /onClosed=\{\(\) => step\(\{ type: "sheet-gone" \}\)\}/.test(block))
  check("the sheet's entry becomes the checkout's by replaceState", /if \(pushed\.current\) window\.history\.replaceState\(st, "", plainAddress\(\)\)/.test(block))
  check("the browser's Back closes the checkout when its entry goes", /checkoutEntryOf\(window\.history\.state\) !== checkoutEntry\.current/.test(block))
  check("focus goes back to the control that started the purchase", /returnFocus=\{\(\) => trigger\.current\}/.test(block))
  const sheet = read("components/onepage/product-sheet.tsx")
  check("on a computer the sheet says it is gone only once the dialog and its dimming layer are out of the document", /dialog-overlay/.test(sheet) && /requestAnimationFrame\(watch\)/.test(sheet) && !/setTimeout\(\(\)=>\{wasOpen/.test(sheet))
  const win = read("components/checkout/checkout-window.tsx")
  check("the checkout window takes focus and holds Tab", /useFocusTrap\(panel, mounted, returnFocus\)/.test(win) && /e\.key !== "Tab"/.test(win) && /tabIndex=\{-1\}/.test(win))
  check("an Escape something inside used does not close the window", /!e\.defaultPrevented && !e\.isComposing/.test(win))
  check("its body scrolls with the compact bar, contained", /op-subtle-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain/.test(win))
  const instant = read("components/checkout/instant-checkout.tsx")
  check("the head is the product: option photo, the block's picture, the product's first, the avatar only without any", /CheckoutProductMark sources=\{\[variant\?\.imageUrl, productImage, product\?\.images\?\.\[0\], product\?\.images\?\.length \|\| productImage \? null :/.test(instant))
}

console.log("BARS")
{
  /* The product editor's padding: a 3:4 cover in the middle of 16:9, light grey around it. */
  const W = 128
  const H = 72
  const px = new Uint8ClampedArray(W * H * 4)
  const coverW = Math.round(H * 0.75)
  const left = Math.round((W - coverW) / 2)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4
      const inCover = x >= left && x < left + coverW
      const grey = 244 - Math.round(((x + y) / (W + H)) * 14)
      const stripe = inCover && y % 6 < 2
      px[o] = inCover ? (stripe ? 184 : 127) : grey
      px[o + 1] = inCover ? (stripe ? 51 : 36) : grey
      px[o + 2] = inCover ? (stripe ? 106 : 80) : grey
      px[o + 3] = 255
    }
  const box = findLetterbox(px, W, H)
  check("the grey padding is found on both sides", !!box && box.y === 0 && box.h === 1, box)
  const shown = contentRatio(W / H, box)
  check("what is left is the 3:4 cover", near(shown, 0.75, 0.06), shown)
  /* A white-backed photo with a white margin on one side only: its own, kept. */
  const one = new Uint8ClampedArray(px)
  for (let y = 0; y < H; y++)
    for (let x = left + coverW; x < W; x++) {
      const o = (y * W + x) * 4
      one[o] = 120
      one[o + 1] = 60
      one[o + 2] = 30
    }
  check("a flat edge on one side only is the picture's own", findLetterbox(one, W, H) === null)
  /* A photo with no flat edge. */
  const photo = new Uint8ClampedArray(W * H * 4)
  for (let i = 0; i < W * H; i++) {
    photo[i * 4] = (i * 37) % 255
    photo[i * 4 + 1] = (i * 91) % 255
    photo[i * 4 + 2] = (i * 13) % 255
    photo[i * 4 + 3] = 255
  }
  check("a picture without bars is left alone", findLetterbox(photo, W, H) === null)
  const blank = new Uint8ClampedArray(W * H * 4).fill(240)
  check("a blank picture is not all bars", findLetterbox(blank, W, H) === null)
  /* Black bars above and below (a wide picture padded to 16:9). */
  const tall = new Uint8ClampedArray(W * H * 4)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4
      const inside = y >= 12 && y < H - 12
      tall[o] = inside ? (x * 2) % 255 : 4
      tall[o + 1] = inside ? 120 : 4
      tall[o + 2] = inside ? 200 : 4
      tall[o + 3] = 255
    }
  const rows = findLetterbox(tall, W, H)
  check("black bars above and below are found too", !!rows && rows.x === 0 && rows.w === 1 && rows.y > 0.15, rows)

  /* Placing: the cover fills a square frame and none of the padding is inside it. */
  if (box) {
    const p = coverBox(W / H, box, 1, "cover")
    const coverLeft = p.left + box.x * p.width
    const coverRight = coverLeft + box.w * p.width
    const coverTop = p.top + box.y * p.height
    const coverBottom = coverTop + box.h * p.height
    check("cover: the picture reaches every edge of the frame", coverLeft <= 0.01 && coverRight >= 99.99 && coverTop <= 0.01 && coverBottom >= 99.99, p)
    const c = coverBox(W / H, box, shown, "contain")
    const cl = c.left + box.x * c.width
    const cr = cl + box.w * c.width
    check("a frame of the picture's own shape shows all of it, edge to edge", near(cl, 0, 1.5) && near(cr, 100, 1.5), { cl, cr })
  }
}

console.log("FRAME")
{
  check("the first picture's own shape is the frame", sheetFrameRatio(0.75, 0.8) === 0.75)
  check("kept between 9:16 and 1.91:1", sheetFrameRatio(0.2, 0.8) === SHEET_FRAME_MIN && sheetFrameRatio(5, 0.8) === SHEET_FRAME_MAX)
  check("unknown until read: the box it always had", sheetFrameRatio(null, 0.8) === 0.8)
  const sheet = read("components/onepage/product-sheet.tsx")
  /* Changed on purpose (round W8): one square frame for every slide (SHEET_GALLERY_RATIO), so nothing waits on a shape read late. */
  check("one frame for every slide: no ratio set from the slide being shown", !/setNaturalRatio/.test(sheet) && /const ratio = SHEET_GALLERY_RATIO/.test(sheet))
  check("the frame never changes while the sheet is up: it is the square, whatever shape is read late", !/setHeld\(wanted\)/.test(sheet) && SHEET_GALLERY_RATIO === 1)
  check("the block reads its picture's shape as it warms, before the tap", /if \(picture\) void readPictureShape\(picture\)/.test(read("components/onepage/product-block.tsx")))
  check("each picture goes through the padding-aware frame", /<SlidePicture/.test(sheet) && /<FramedPicture/.test(sheet))
  check("the sheet scrolls with the compact bar, contained", /overflow-y-auto overscroll-contain op-subtle-scroll/.test(sheet))
}

console.log("THE COVER AS UPLOADED (SQL part 377)")
{
  const thumb = "https://x.supabase.co/storage/v1/object/public/product-images/a/1_cover_processed.jpg"
  const orig = "https://x.supabase.co/storage/v1/object/public/product-images/a/1_original_cover.jpg"
  check("the original is the product's picture when there is one", productCover({ thumbnail_url: thumb, cover_original_url: orig }) === orig)
  check("before part 377 (no column), the card copy", productCover({ thumbnail_url: thumb }) === thumb && productCover({ thumbnail_url: thumb, cover_original_url: "  " }) === thumb)
  check("in a gallery the original takes the card copy's place, once", JSON.stringify(withOriginalCover([thumb, "b", thumb, orig], { thumbnail_url: thumb, cover_original_url: orig })) === JSON.stringify([orig, "b"]))
  check("a gallery without the card copy is left as it is", JSON.stringify(withOriginalCover(["b", null, ""], { thumbnail_url: thumb, cover_original_url: orig })) === JSON.stringify(["b"]))
  check("the editor saves the first item's original only", coverOriginalOf([{ id: "1", type: "image", url: thumb, original: orig }, { id: "2", type: "image", url: "b" }]) === orig && coverOriginalOf([{ id: "2", type: "image", url: "b" }, { id: "1", type: "image", url: thumb, original: orig }]) === null && coverOriginalOf([]) === null)
  const editor = read("app/(storelib)/app/products/new/product-editor.tsx")
  check("a padded upload sends the file as chosen up beside the copy", /if \(padded\) \{[\s\S]{0,200}_original_/.test(editor) && /\.\.\.\(original \? \{ original \} : \{\}\)/.test(editor))
  check("the original is saved in a request of its own, only when it changed (a database without part 377 still saves)", /cover !== savedCover\.current/.test(editor) && /update\(\{ cover_original_url: cover \}\)/.test(editor))
  check("the editor reads it back with the product", /thumbnail_url, cover_original_url, gallery_urls/.test(read("app/(storelib)/app/products/load-editor.ts")))
  const live = read("lib/onepage/live-products.ts")
  check("the OnePage asks for it first and falls back to the lists without it", /for \(const cols of \[COLUMNS_WITH_COVER, COLUMNS_WITH_PRICES/.test(live) && /product_cover: product\.cover_original_url \?\? null/.test(live))
  check("the block, its sheet and the checkout use it before the card copy", /data\.custom_thumbnail \|\| data\.product_cover \|\| data\.product_thumbnail/.test(read("components/onepage/product-block.tsx")))
  check("the sheet's facts, the product page and the checkout page use it", /withOriginalCover\(/.test(read("app/api/onepage/product/route.ts")) && /withOriginalCover\(/.test(read("app/(storelib)/(marketing)/p/[slug]/page.tsx")) && /thumbnail_url: productCover\(product\)/.test(read("app/(storelib)/checkout/page.tsx")))
  check("the full screen viewer, the checkout summary and the seller mark cut padding off", /function LightboxPicture/.test(read("components/onepage/product-lightbox.tsx")) && /<FramedPicture/.test(read("app/(storelib)/checkout/parts/order-summary.tsx")) && /<FramedPicture src=\{image\.src\} frame=\{1\}/.test(read("components/checkout/checkout-window.tsx")))
  const sql = read("supabase/migrations/20271135_product_original_cover.sql")
  check("the SQL is one additive, idempotent column, mirrored as run-now part 377", /add column if not exists cover_original_url text/.test(sql) && !/\bdrop\b|\bupdate\b/i.test(sql.replace(/\/\*[\s\S]*?\*\//g, "")) && read("supabase/sql/run-now/377_product_original_cover.sql") === sql)
  check("the check after reads it", /* Changed on purpose (round 51): parts 378 and 379 follow it in the check. */ /as p377_product_original_cover[;,]/.test(read("supabase/sql/run-now/99_check_after.sql")))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
