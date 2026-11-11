/**
 * ===========================================================================
 *  A SECTION OR BLOCK REORDERED IN THE SIDEBAR MOVES ON THE CANVAS (rel2)
 * ===========================================================================
 *   npx tsx tests/section-drag-canvas.test.ts
 *
 * The owner: dragging sections (and blocks) to reorder them in the sidebar
 * reordered the sidebar, and the canvas stayed as it was until a reload.
 *
 * Measured on the real editor by scripts/check-section-drag-canvas.mjs, on an
 * imported theme (the compat canvas and its frame) and on Storelib's own
 * canvas, with a mouse and a finger. Held here, so it cannot come back:
 *
 *   PATHS     every way to reorder (the grip's drop, the row menu's Move up
 *             and down, the canvas toolbar's, a block's drag and its toolbar)
 *             changes the editor's one list of sections, which both canvases
 *             draw from: none of them keeps an order of its own
 *   FRAME     in Chromium, the imported theme's frame (canvas-bridge.ts):
 *             the drag's order shown while held, the drop kept on screen
 *             until the patch puts the sections in that order in the page,
 *             no transform left after it, whichever of the drop and the patch
 *             arrives first, and even when the drop's message never comes;
 *             a cancelled drag slides home; two drags in a row; a block's
 *             new order drawn in place
 *   STORELIB  in Chromium, Storelib's own canvas (live-order.ts): the same
 *             drop held until React has the boxes in order, then let go in
 *             that moment
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { build } from "esbuild"
import { CANVAS_BRIDGE, CANVAS_HEAD } from "../lib/storelib-theme/compat/canvas-bridge"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

console.log("\nEvery reorder goes through the editor's one list of sections\n")
{
  const editor = read("app/(storelib)/website-builder/editor/[installId]/page.tsx")
  const body = (name: string) => {
    const at = editor.indexOf(`const ${name} = `)
    return at < 0 ? "" : editor.slice(at, at + 2400)
  }
  check("a drop in the sidebar is reorderSection, which sets the sections", /dnd=\{\{ onReorder: reorderSection \}\}/.test(editor) && /setSections\(/.test(body("reorderSection")))
  check("Move up and Move down, in the row's menu and on the canvas toolbar, are moveSectionBy, which sets the sections", /onMove=\{moveSectionBy\}/.test(editor) && /onMoveUp=\{\(\) => shownSectionId && moveSectionBy\(shownSectionId, -1\)\}/.test(editor) && /setSections\(/.test(body("moveSectionBy")))
  check("a block's drag and its toolbar steps set the sections too", /reorder: \(next, parentKey\) => reorderBlocks\(s\.id, next, parentKey\)/.test(editor) && /onMoveUp=\{\(\) => moveBlockBy\(sid, blockKey, -1\)\}/.test(editor))
  check("both canvases draw the editor's sections (the imported one through CompatCanvas, Storelib's through ThemePage)", /sections=\{sections\}/.test(editor) && /<CompatCanvas/.test(editor))
  const canvas = read("components/website-builder/compat/compat-canvas.tsx")
  check("the compat canvas draws again when the page's shape (its order) changes", /const shapeOf = \(sections: StoredSection\[\]\) => sections\.map/.test(canvas) && /\[compatTheme, page, shape, docKey/.test(canvas))
  check("  and a move is sent to the page as its order, not a reload", /if \(moved \|\| added\) message\.order = to\.order\.map/.test(canvas))
}

const chrome = process.env.CHROME ?? "/opt/pw-browsers/chromium"

async function frameInBrowser() {
  console.log("\nThe imported theme's frame, in Chromium\n")
  if (!existsSync(chrome)) {
    console.log("  --    no Chromium here: held to its source only")
    check("the frame lets go of the drag's slides once its sections are in the order patched", /orderSettled\(\)/.test(CANVAS_BRIDGE))
    return
  }
  const puppeteer = (await import("puppeteer-core")).default
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--no-sandbox"] })
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 800, height: 900 })
    const heights: Record<string, number> = { a: 120, b: 200, c: 90, d: 160 }
    const section = (id: string) => `<div class="shopify-section" id="shopify-section-${id}" data-section-id="${id}"><div style="height:${heights[id]}px;margin-bottom:10px;background:#eee">${id}${id === "c" ? `<ul class="list">${["q1", "q2", "q3"].map((q) => `<li data-block-id="${q}">${q}</li>`).join("")}</ul>` : ""}</div></div>`
    const fresh = async () => {
      await page.setContent(`<!doctype html><html><head>${CANVAS_HEAD}<style>body{margin:0}</style></head><body><main>${["a", "b", "c", "d"].map(section).join("")}</main>
        <script>window.__name = function (f) { return f }; window.__slInspect = true; ${CANVAS_BRIDGE}</script></body></html>`)
      await wait(400)
    }
    const send = (m: Record<string, unknown>) => page.evaluate((m) => window.postMessage({ storelib: 1, ...m }, "*"), m)
    const state = () => page.evaluate(() => {
      const secs = [...document.querySelectorAll("main > .shopify-section")] as HTMLElement[]
      const id = (s: Element) => s.id.replace("shopify-section-", "")
      return {
        dom: secs.map(id).join(""),
        seen: secs.map((s) => ({ id: id(s), top: s.getBoundingClientRect().top })).sort((x, y) => x.top - y.top).map((x) => x.id).join(""),
        /* Laid out as that order lays them out: each box right after the one above it, from where the first stands, no overlap, no hole. */
        laid: (() => { const r = secs.map((s) => ({ top: s.getBoundingClientRect().top, h: s.offsetHeight })).sort((x, y) => x.top - y.top); const start = secs[0].parentElement!.getBoundingClientRect().top; return Math.abs(r[0].top - start) < 1.5 && r.every((x, i) => i === 0 || Math.abs(x.top - (r[i - 1].top + r[i - 1].h + 10)) < 1.5) })(),
        held: secs.filter((s) => s.style.transform && !/translate3d\(0px, 0px, 0px\)/.test(s.style.transform)).length,
        /* A style left on a section by the drag (an empty attribute is no style). */
        styled: secs.filter((s) => !!s.getAttribute("style")).length,
      }
    })
    const order = (ids: string) => ({ type: "patch", order: ids.split("").map((id) => ({ id, group: "" })) })

    /* b dragged two places down: a c d b. */
    await fresh()
    await send({ type: "preview-order", ids: ["a", "c", "b"], lifted: "b" })
    await send({ type: "preview-order", ids: ["a", "c", "d", "b"], lifted: "b" })
    await wait(300)
    let s = await state()
    check("held: the frame shows where the section would go, nothing moved in the page", s.seen === "acdb" && s.dom === "abcd" && s.held > 0 && s.laid, s)
    await send({ type: "preview-order", ids: null, end: "commit" })
    await wait(50)
    s = await state()
    check("let go: it stays where it was shown until the page has the new order", s.seen === "acdb" && s.dom === "abcd" && s.laid, s)
    await send(order("acdb"))
    await wait(50)
    s = await state()
    check("the patch moves the sections in the page, and the slides are let go in that moment", s.dom === "acdb" && s.seen === "acdb" && s.held === 0 && s.styled === 0 && s.laid, s)

    /* The patch first, then the drop's message (the order the two can arrive in). */
    await fresh()
    await send({ type: "preview-order", ids: ["b", "a", "c", "d"], lifted: "b" })
    await wait(300)
    await send(order("bacd"))
    await wait(50)
    s = await state()
    check("a patch before the drop's message: the page in order and no slide left over it", s.dom === "bacd" && s.seen === "bacd" && s.held === 0 && s.laid, s)
    await send({ type: "preview-order", ids: null, end: "commit" })
    await wait(50)
    s = await state()
    check("  and the drop's message after it changes nothing", s.dom === "bacd" && s.seen === "bacd" && s.held === 0 && s.styled === 0 && s.laid, s)

    /* The drop's message lost (the frame between its refs as the canvas drew again): the patch alone puts it right. */
    await fresh()
    await send({ type: "preview-order", ids: ["a", "b", "d", "c"], lifted: "c" })
    await wait(300)
    await send(order("abdc"))
    await wait(50)
    s = await state()
    check("the drop's message never heard: the patch alone leaves the page in order, nothing held", s.dom === "abdc" && s.seen === "abdc" && s.held === 0 && s.styled === 0 && s.laid, s)

    /* Put back. */
    await fresh()
    await send({ type: "preview-order", ids: ["b", "a", "c", "d"], lifted: "b" })
    await wait(300)
    await send({ type: "preview-order", ids: null, end: "cancel" })
    await wait(400)
    s = await state()
    check("a drag put back slides home and leaves no style behind", s.dom === "abcd" && s.seen === "abcd" && s.held === 0 && s.styled === 0 && s.laid, s)

    /* Two drags, the second before the first is patched. */
    await fresh()
    await send({ type: "preview-order", ids: ["b", "a", "c", "d"], lifted: "b" })
    await wait(250)
    await send({ type: "preview-order", ids: null, end: "commit" })
    await send({ type: "preview-order", ids: ["b", "a", "d", "c"], lifted: "d" })
    await wait(50)
    await send(order("bacd"))
    await wait(250)
    s = await state()
    check("a second drag held while the first is patched: the page in the first order, shown in the second", s.dom === "bacd" && s.seen === "badc" && s.laid, s)
    await send({ type: "preview-order", ids: null, end: "commit" })
    await send(order("badc"))
    await wait(100)
    s = await state()
    check("  and the second patched: in order, nothing held", s.dom === "badc" && s.seen === "badc" && s.held === 0 && s.styled === 0 && s.laid, s)

    /* A block reordered: its section drawn again, changed in place. */
    await fresh()
    const prev = await page.evaluate(() => document.getElementById("shopify-section-c")!.outerHTML)
    const next = prev.replace(/<li data-block-id="q1">q1<\/li><li data-block-id="q2">q2<\/li>/, '<li data-block-id="q2">q2</li><li data-block-id="q1">q1</li>')
    await send({ type: "section", id: "c", html: next, prev, now: true })
    await wait(300)
    const blocks = await page.evaluate(() => [...document.querySelectorAll("#shopify-section-c [data-block-id]")].map((b) => b.getAttribute("data-block-id")).join(","))
    check("a block reordered is drawn in its new place", blocks === "q2,q1,q3", blocks)
  } finally {
    await browser.close()
  }
}

async function storelibInBrowser() {
  console.log("\nStorelib's own canvas, in Chromium\n")
  if (!existsSync(chrome)) {
    console.log("  --    no Chromium here: held to its source only")
    return
  }
  /* live-order.ts as the editor bundles it, for the browser. */
  const bundled = await build({
    stdin: { contents: `import { previewOrder } from "./lib/website-builder/live-order"\n;(window as unknown as { previewOrder: typeof previewOrder }).previewOrder = previewOrder\n`, resolveDir: process.cwd(), loader: "ts" },
    bundle: true, format: "iife", write: false, logLevel: "error",
  })
  const js = bundled.outputFiles[0].text
  {
    const puppeteer = (await import("puppeteer-core")).default
    const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--no-sandbox"] })
    try {
      const page = await browser.newPage()
      await page.setViewport({ width: 800, height: 900 })
      const heights: Record<string, number> = { a: 120, b: 200, c: 90, d: 160 }
      await page.setContent(`<!doctype html><html><body style="margin:0"><script>window.__name = function (f) { return f }</script><div id="wb-preview-root" style="height:900px;overflow:auto"><div id="page">${["a", "b", "c", "d"].map((id) => `<div id="wb-section-${id}" data-section-box style="height:${heights[id]}px;background:#eee">${id}</div>`).join("")}</div></div><script>${js}</script></body></html>`)
      const state = () => page.evaluate(() => {
        const secs = [...document.querySelectorAll("#page > [data-section-box]")] as HTMLElement[]
        const id = (s: Element) => s.id.replace("wb-section-", "")
        return {
          dom: secs.map(id).join(""),
          seen: secs.map((s) => ({ id: id(s), top: s.getBoundingClientRect().top })).sort((x, y) => x.top - y.top).map((x) => x.id).join(""),
          /* Laid out as that order lays them out: each box right after the one above it, from where the first stands, no overlap, no hole. */
          laid: (() => { const r = secs.map((s) => ({ top: s.getBoundingClientRect().top, h: s.offsetHeight })).sort((x, y) => x.top - y.top); const start = secs[0].parentElement!.getBoundingClientRect().top; return Math.abs(r[0].top - start) < 1.5 && r.every((x, i) => i === 0 || Math.abs(x.top - (r[i - 1].top + r[i - 1].h + 0)) < 1.5) })(),
          styled: secs.filter((s) => s.hasAttribute("style") && /transform/.test(s.getAttribute("style") ?? "")).length,
        }
      })
      type W = { previewOrder: (p: unknown) => void }
      await page.evaluate(() => (window as unknown as W).previewOrder({ ids: ["a", "c", "d", "b"], lifted: "b" }))
      await wait(300)
      let s = await state()
      check("held: the boxes slide to the drag's order, nothing moved in the page", s.seen === "acdb" && s.dom === "abcd" && s.laid, s)
      /* The drop: told in the commit that saves the order; React moves the boxes in a later one (the canvas is a deferred copy). */
      await page.evaluate(() => (window as unknown as W).previewOrder({ ids: null, end: "commit" }))
      await wait(30)
      s = await state()
      check("let go: kept where it was shown until the boxes are in the page in that order", s.seen === "acdb" && s.dom === "abcd" && s.laid, s)
      await page.evaluate(() => { const p = document.getElementById("page")!; const b = document.getElementById("wb-section-b")!; p.appendChild(b) })
      await wait(30)
      s = await state()
      check("the boxes moved as React moves them: in order, and let go in that moment", s.dom === "acdb" && s.seen === "acdb" && s.styled === 0 && s.laid, s)

      /* Two drags, the second picked up before React has drawn the first: c d swapped, then b after a. */
      await page.evaluate(() => (window as unknown as W).previewOrder({ ids: ["a", "d", "c", "b"], lifted: "d" }))
      await wait(250)
      await page.evaluate(() => (window as unknown as W).previewOrder({ ids: null, end: "commit" }))
      await page.evaluate(() => (window as unknown as W).previewOrder({ ids: ["a", "b", "d", "c"], lifted: "b" }))
      await wait(250)
      s = await state()
      check("a second drag over the first, not drawn yet: shown in the second's order", s.dom === "acdb" && s.seen === "abdc" && s.laid, s)
      /* React draws the first drop now, under the finger still holding the second. */
      await page.evaluate(() => { const p = document.getElementById("page")!; p.insertBefore(document.getElementById("wb-section-d")!, document.getElementById("wb-section-c")) })
      await wait(250)
      s = await state()
      check("  the first drawn under it: still shown in the second's order", s.dom === "adcb" && s.seen === "abdc" && s.laid, s)
      await page.evaluate(() => (window as unknown as W).previewOrder({ ids: null, end: "commit" }))
      await page.evaluate(() => { const p = document.getElementById("page")!; p.insertBefore(document.getElementById("wb-section-b")!, document.getElementById("wb-section-d")) })
      await wait(60)
      s = await state()
      check("  and the second drawn: in order, nothing held", s.dom === "abdc" && s.seen === "abdc" && s.styled === 0 && s.laid, s)
    } finally {
      await browser.close()
    }
  }
}

async function main() {
  await frameInBrowser()
  await storelibInBrowser()
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
}

void main()
