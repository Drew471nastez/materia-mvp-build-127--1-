/**
 * ===========================================================================
 *  AN OFFER, A SIZE CHART AND A COUPON ON PAGES OF THEIR OWN, MEASURED
 * ===========================================================================
 *   node scripts/check-subpages.mjs        (SHOTS=dir to keep screenshots)
 *
 * The pages scripts/render-subpages.tsx draws, against a stubbed API, in
 * headless Chromium at a phone's width (390) and a computer's (1280). It
 * reports the numbers:
 *
 *   the frame     no dialog and no sheet; the top bar on a phone, the header
 *                 and the foot bar on a computer; nothing runs off the side
 *   the buttons   Save and the secondaries carry a shadow (depth), the
 *                 secondaries a border
 *   offers        Save with nothing chosen says how many things to fix and
 *                 brings the first into view; a good bundle sends POST
 *   size charts   Enter in a cell goes one row down; Enter on the last row
 *                 adds a size; a pasted block fills the cells; Save sends PUT
 *   collections   the page of its own, the same frame as the others, no
 *                 sheet, picked by hand and matched by rules: Save with no
 *                 title says so under the field, a picked collection is sent once
 *   the motion    nothing on any page moves after it is drawn (Chromium's
 *                 own layout shift count, from the first paint); the
 *                 discount's white slides through the frames between two
 *                 choices; a choice's name is never cut
 *   the pickers   no platform scrollbar column inside a picker's box, a 4px
 *                 thumb over its edge that shows on hover and while it
 *                 scrolls, against the platform's own bar measured beside it
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
if (!existsSync(CHROMIUM)) { console.error("No browser"); process.exit(1) }
const css = await appCss(root)
const out = mkdtempSync(join(tmpdir(), "storelib-subpages-"))
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-subpages.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error",
  `--outfile=${join(out, "probe.js")}`,
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
  '--define:process.env.NODE_ENV="production"', `--alias:@=${root}`, `--alias:next/navigation=${join(root, "scripts/probe-next-navigation.ts")}`, "--loader:.css=empty"],
  { stdio: ["ignore", "ignore", "inherit"] })
writeFileSync(join(out, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style><style>body{margin:0;background:#f8f9fa}</style></head><body><div id="app"></div><script src="probe.js"></script></body></html>`)

/* With the platform's scrollbars drawn, as a desktop browser draws them (headless hides them by default), so a bar's column is measured. */
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--force-device-scale-factor=1"], ignoreDefaultArgs: ["--hide-scrollbars"] })
const page = await browser.newPage()
let bad = 0
const say = (ok, line) => { if (!ok) bad++; console.log(`  ${ok ? "ok   " : "FAIL "} ${line}`) }
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
async function open(panel, vp) {
  await page.setViewport(vp)
  await page.evaluateOnNewDocument((p) => {
    window.__panel = p
    /* Every layout shift from the first paint on, as Chromium counts them for CLS. */
    window.__shifts = []
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) window.__shifts.push({ value: e.value, at: Math.round(e.startTime), nodes: (e.sources || []).map((x) => (x.node && x.node.nodeType === 1 ? `${x.node.tagName.toLowerCase()}${x.node.dataset ? Object.keys(x.node.dataset).map((k) => `[${k}]`).join("") : ""}` : "?")) })
      }).observe({ type: "layout-shift", buffered: true })
    } catch {}
  }, panel)
  await page.goto(`file://${join(out, "index.html")}`)
  await wait(300)
}
const shot = async (name) => { if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png`, fullPage: false }) }
const frame = () => page.evaluate(() => {
  const visible = (sel) => [...document.querySelectorAll(sel)].some((el) => el.getClientRects().length > 0 && getComputedStyle(el).display !== "none")
  const over = document.documentElement.scrollWidth - innerWidth
  const cut = [...document.querySelectorAll("button, label, h1, h2")].filter((el) => el.getClientRects().length && el.getBoundingClientRect().right > innerWidth + 1 && !el.closest("[data-size-chart-grid]")).map((el) => (el.textContent || "").trim().slice(0, 30))
  const save = document.querySelector("[data-save-button]")
  const leave = document.querySelector("[data-leave-button]")
  const s = (el) => (el ? getComputedStyle(el) : null)
  return {
    /* A question's sheet is in the page, closed, until it is asked: only one that is shown counts. */
    /* The question sheet a phone builds ahead (app/(storelib)/app/products/new/confirm-sheet.tsx, keepMounted) is not an editor in a sheet: left out. */
    dialog: [...document.querySelectorAll('[role="dialog"]')].some((el) => !el.querySelector("[data-confirm-sheet]") && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden" && Number(getComputedStyle(el).opacity) > 0),
    dialogs: [...document.querySelectorAll('[role="dialog"]')].map((el) => `${String(el.className).slice(0, 60)} ${el.getClientRects().length} ${getComputedStyle(el).visibility} ${getComputedStyle(el).opacity} ${Math.round(el.getBoundingClientRect().top)}`),
    bar: visible("[data-editor-bar]"),
    head: visible("[data-editor-head]"),
    foot: visible("[data-editor-foot]"),
    over,
    cut,
    saveShadow: s(save)?.boxShadow ?? "none",
    leaveShadow: s(leave)?.boxShadow ?? "none",
    leaveBorder: s(leave)?.borderTopWidth ?? "0px",
    cards: [...document.querySelectorAll("section")].filter((el) => getComputedStyle(el).borderRadius === "16px").length,
    /* A choice whose name does not fit its box (drawn with an ellipsis). */
    clipped: [...document.querySelectorAll('[role="radio"], [role="tab"]')].filter((el) => el.getClientRects().length && !el.closest("[inert]") && el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent.trim()),
  }
})

for (const [label, vp] of [["a phone (390)", { width: 390, height: 844, isMobile: true, hasTouch: true }], ["a computer (1280)", { width: 1280, height: 900 }]]) {
  const phone = vp.width < 768
  for (const panel of ["offer-new", "offer-edit", "break-new", "chart-new", "chart-edit", "coupon-edit", "collection-new", "collection-edit", "collection-rules"]) {
    console.log(`\n${panel} on ${label}`)
    await open(panel, vp)
    const f = await frame()
    say(!f.dialog, `a page, not a dialog or a sheet${f.dialog ? ` (${f.dialogs.join(" / ")})` : ""}`)
    say(phone ? f.bar && !f.foot : f.head && f.foot && !f.bar, phone ? "Cancel or Back and Save in the bar at the top" : "a header with the way back, Cancel and Save along the foot")
    say(f.over <= 0 && f.cut.length === 0, `nothing runs off the side (${f.over}px${f.cut.length ? `, cut: ${f.cut.join(" | ")}` : ""})`)
    say(f.saveShadow !== "none" && f.leaveShadow !== "none" && f.leaveBorder !== "0px", `the buttons have depth (Save ${f.saveShadow.slice(0, 40)}…, Cancel ${f.leaveBorder} border)`)
    say(f.cards >= 2, `the parts are /app cards (${f.cards})`)
    say(f.clipped.length === 0, `no choice's name is cut${f.clipped.length ? ` (${f.clipped.join(", ")})` : ""}`)
    await wait(900)
    const shifts = await page.evaluate(() => window.__shifts)
    const total = shifts.reduce((n, x) => n + x.value, 0)
    say(total === 0, `nothing moves once drawn: layout shift ${total.toFixed(4)}${shifts.length ? ` (${shifts.map((x) => `${x.value.toFixed(3)}@${x.at}ms ${x.nodes.join(",")}`).join("; ")})` : ""}`)
    await shot(`${panel}-${vp.width}`)
  }

  console.log(`\nThe pickers' scrollbar on ${label}`)
  for (const [panel, prep] of [["offer-new", null], ["offer-edit", "products"], ["collection-edit", null]]) {
    await open(panel, vp)
    if (prep) await page.evaluate(() => [...document.querySelectorAll('[role="radio"]')].find((b) => b.textContent.trim() === "Certain products")?.click())
    await wait(300)
    const read = () => page.evaluate(() => {
      const box = [...document.querySelectorAll("[data-thumb-scroll]")].find((el) => el.getClientRects().length && !el.closest("[inert]"))
      if (!box) return null
      const cs = getComputedStyle(box)
      const thumb = box.parentElement.querySelector(":scope > [data-nav-thumb]")
      const line = thumb ? getComputedStyle(thumb, "::before") : null
      /* The platform's own bar, for the numbers beside it: the same box without the rule. */
      const plain = document.createElement("div")
      plain.style.cssText = `position:absolute;left:-9999px;width:300px;height:100px;overflow-y:scroll;border:${cs.borderTopWidth} solid #000`
      plain.innerHTML = '<div style="height:400px"></div>'
      document.body.appendChild(plain)
      const platform = plain.offsetWidth - plain.clientWidth - 2 * parseFloat(cs.borderTopWidth)
      plain.remove()
      return {
        gutter: box.offsetWidth - box.clientWidth - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth),
        scrolls: box.scrollHeight > box.clientHeight,
        platform,
        thumb: thumb ? { width: thumb.getBoundingClientRect().width - parseFloat(line.left) - parseFloat(line.right), height: Math.round(thumb.getBoundingClientRect().height), opacity: Number(getComputedStyle(thumb).opacity), colour: line.backgroundColor, radius: line.borderRadius } : null,
        rect: (() => { const r = box.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })(),
      }
    })
    const rest = await read()
    if (!rest) { say(false, `${panel}: a picker on the page`); continue }
    say(rest.scrolls && rest.gutter === 0, `${panel}: the picker scrolls and keeps no column for a bar (${rest.gutter}px; the platform's own bar here is ${rest.platform}px)`)
    say(!!rest.thumb && rest.thumb.width === 4 && rest.thumb.height >= 28 && rest.thumb.height <= 72, `  a 4px thumb, ${rest.thumb?.height}px long, ${rest.thumb?.colour}, rounded ${rest.thumb?.radius}`)
    say(rest.thumb?.opacity === 0 || phone, `  out of the way at rest (opacity ${rest.thumb?.opacity})`)
    if (!phone) {
      await page.mouse.move(rest.rect.x, rest.rect.y)
      await wait(400)
      const over = await read()
      say(over.thumb?.opacity === 1, `  shown while the pointer is over the list (opacity ${over.thumb?.opacity})`)
    }
    await page.evaluate(() => { const b = [...document.querySelectorAll("[data-thumb-scroll]")].find((el) => el.getClientRects().length && !el.closest("[inert]")); b.scrollTop = 80; b.dispatchEvent(new Event("scroll")) })
    await wait(250)
    const scrolled = await read()
    say(scrolled.thumb?.opacity === 1, `  shown while it scrolls (opacity ${scrolled.thumb?.opacity})`)
    if (panel === "offer-new") await shot(`picker-scrolled-${vp.width}`)
    await page.mouse.move(2, 2)
  }

  console.log(`\nThe discount's choices on ${label}`)
  await open("offer-new", vp)
  await page.evaluate(() => {
    window.__thumb = []
    const thumb = document.querySelector("[data-choice-thumb]")
    const tick = () => { window.__thumb.push(new DOMMatrixReadOnly(getComputedStyle(thumb).transform).e + "," + new DOMMatrixReadOnly(getComputedStyle(thumb).transform).f); if (window.__thumb.length < 30) requestAnimationFrame(tick) }
    requestAnimationFrame(tick)
    ;[...document.querySelectorAll('[data-choice-grid] [role="radio"]')].find((b) => b.textContent.trim() === "Free shipping").click()
  })
  await wait(700)
  const slide = await page.evaluate(() => {
    const target = [...document.querySelectorAll('[data-choice-grid] [role="radio"]')].find((b) => b.textContent.trim() === "Free shipping")
    return { frames: window.__thumb, end: `${target.offsetLeft},${target.offsetTop}` }
  })
  const distinct = [...new Set(slide.frames)]
  say(distinct.length >= 3 && slide.frames.at(-1) === slide.end, `the white slides to the new choice over ${distinct.length - 1} steps, ending on it (${distinct[0]} to ${slide.frames.at(-1)}; the choice at ${slide.end})`)

  console.log(`\nA collection on ${label}`)
  await open("collection-new", vp)
  await page.evaluate(() => document.querySelectorAll("[data-save-button]").forEach((b) => b.getClientRects().length && b.click()))
  await wait(300)
  const noTitle = await page.evaluate(() => ({ invalid: document.querySelector("#collection-title")?.getAttribute("aria-invalid"), focused: document.activeElement?.id, sent: window.__sent.length }))
  say(noTitle.invalid === "true" && noTitle.focused === "collection-title" && noTitle.sent === 0, `Save with no title says so under the field and sends nothing (${JSON.stringify(noTitle)})`)
  await page.type("#collection-title", "Breakfast")
  await page.click(`[data-pick="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"]`)
  await page.evaluate(() => document.querySelectorAll("[data-save-button]").forEach((b) => b.getClientRects().length && b.click()))
  await wait(300)
  const colSent = await page.evaluate(() => window.__sent)
  say(colSent.length === 1 && colSent[0].method === "POST" && colSent[0].path === "/api/collections" && colSent[0].body.title === "Breakfast" && colSent[0].body.productIds.length === 1, `a new collection is sent once: ${JSON.stringify(colSent.map((x) => `${x.method} ${x.path} ${x.body?.title} ${x.body?.productIds?.length}`))}`)

  console.log(`\nOffers on ${label}: Save with nothing picked`)
  await open("offer-new", vp)
  await page.evaluate(() => document.querySelectorAll("[data-save-button]").forEach((b) => b.getClientRects().length && b.click()))
  await wait(400)
  const problems = await page.evaluate(() => ({ count: document.querySelector("[data-problem-count]")?.getAttribute("data-problem-count") ?? null, first: (() => { const el = document.querySelector("[data-problem]"); if (!el) return null; const r = el.getBoundingClientRect(); return Math.round(r.top) })() }))
  say(problems.count === "1" && problems.first !== null && problems.first >= 0 && problems.first < vp.height, `one thing to fix, said at the top, the field in view (top ${problems.first}px)`)
  await page.click(`[data-pick="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"]`)
  await page.click(`[data-pick="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"]`)
  await page.evaluate(() => document.querySelectorAll("[data-save-button]").forEach((b) => b.getClientRects().length && b.click()))
  await wait(300)
  const sent = await page.evaluate(() => window.__sent)
  say(sent.length === 1 && sent[0].method === "POST" && sent[0].body.kind === "bundle" && sent[0].body.productIds.length === 2 && sent[0].body.formCurrency === "USD", `a good bundle is sent once: ${JSON.stringify(sent.map((s) => `${s.method} ${s.body?.kind} ${s.body?.productIds?.length}`))}`)

  console.log(`\nSize chart on ${label}: the keyboard and the paste`)
  await open("chart-edit", vp)
  await page.focus('[data-cell="0:1"]')
  await page.keyboard.press("Enter")
  await wait(80)
  const afterEnter = await page.evaluate(() => document.activeElement?.getAttribute("data-cell"))
  say(afterEnter === "1:1", `Enter goes one row down in the same column (${afterEnter})`)
  await page.focus('[data-cell="3:2"]')
  await page.keyboard.press("Enter")
  await wait(120)
  const added = await page.evaluate(() => ({ rows: document.querySelectorAll("[data-row-size]").length, at: document.activeElement?.getAttribute("data-cell") }))
  say(added.rows === 5 && added.at === "4:2", `Enter on the last row adds a size and lands in it (${added.rows} rows, at ${added.at})`)
  await page.evaluate(() => {
    const el = document.querySelector('[data-cell="4:0"]')
    const data = new DataTransfer()
    data.setData("text/plain", "XXL\t116\t78\t24\n3XL\t122\t80\t25")
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }))
  })
  await wait(120)
  const pasted = await page.evaluate(() => ({ rows: document.querySelectorAll("[data-row-size]").length, a: document.querySelector('[data-cell="4:0"]').value, b: document.querySelector('[data-cell="5:3"]').value, note: document.querySelector("[data-size-chart-paste-note]").textContent }))
  say(pasted.rows === 6 && pasted.a === "XXL" && pasted.b === "25", `a pasted block fills the cells and adds what it needs (${pasted.rows} rows, ${pasted.a}, ${pasted.b}; "${pasted.note}")`)
  await page.evaluate(() => document.querySelectorAll("[data-save-button]").forEach((b) => b.getClientRects().length && b.click()))
  await wait(300)
  const chartSent = await page.evaluate(() => window.__sent)
  say(chartSent.length === 1 && chartSent[0].method === "PUT" && chartSent[0].path === "/api/size-charts/s1" && chartSent[0].body.rows.length === 6, `Save sends the chart once: ${JSON.stringify(chartSent.map((s) => `${s.method} ${s.path} ${s.body?.rows?.length}`))}`)
  await shot(`chart-typed-${vp.width}`)
}

await browser.close()
console.log(bad ? `\n${bad} failed` : "\nall measured")
process.exit(bad ? 1 : 0)
