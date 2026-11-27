import puppeteer from "puppeteer-core"
import JSZip from "jszip"
import { composeTemplateZip } from "../lib/themes/template-packages"
import { editorFor } from "./check-builder-nav19"
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
void (async () => {
  const browser = await puppeteer.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] })
  const zip = await JSZip.loadAsync(await composeTemplateZip(`materia/${process.env.TEMPLATE ?? "fitness"}`))
  const ed = await editorFor(browser, 1440, 900, false, undefined, zip)
  let f = await ed.frame()
  await sleep(3000)
  f = await ed.frame()
  const fb = (await (await ed.page.$("[data-compat-frame='front']"))!.boundingBox())!
  const at = await f.evaluate(() => { const h = document.querySelector("header.header")!; const r = h.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, sticky: h.getAttribute("data-sticky") } })
  console.log(at)
  await ed.page.mouse.click(fb.x + 700, fb.y + at.y)
  await sleep(1500)
  const side = await ed.page.evaluate(() => [...document.querySelectorAll("select")].map((s) => [...s.options].map((o) => o.value + "=" + o.text).join("|")).filter((t) => /sticky|scroll/i.test(t)))
  console.log(side)
  const setSticky = async (v: string) => {
    await ed.page.evaluate((v) => {
      const sel = [...document.querySelectorAll("select")].find((s) => [...s.options].some((o) => o.value === "on-scroll-up"))!
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(sel, v)
      sel.dispatchEvent(new Event("change", { bubbles: true }))
    }, v)
    await sleep(1800)
  }
  const state = async () => { f = await ed.frame(); return f.evaluate(() => { const h = document.querySelector("header.header")!; const s = h.closest(".shopify-section")! as HTMLElement; return { y: Math.round(scrollY), data: h.getAttribute("data-sticky"), mode: s.dataset.storelibSticky, cls: s.className, top: Math.round(h.getBoundingClientRect().top), tr: getComputedStyle(s).transform, style: s.getAttribute("style") } }) }
  const wheel = async (dy: number) => { for (let i = 0; i < 10; i++) { await ed.page.mouse.move(fb.x + 700, fb.y + 400); await ed.page.mouse.wheel({ deltaY: dy / 10 }); await sleep(40) } await sleep(700) }
  const run = async (v: string) => {
    await setSticky(v)
    console.log("set", v, JSON.stringify(await state()))
    await wheel(1200); console.log("  down", JSON.stringify(await state()))
    await wheel(-200); console.log("  up", JSON.stringify(await state()))
    await wheel(-2000)
  }
  if (process.env.PRE) await setSticky(process.env.PRE)
  f = await ed.frame()
  await f.evaluate(() => { const w = window as any; w.__sc = 0; addEventListener("scroll", () => w.__sc++, { passive: true }); const o = requestAnimationFrame; w.__raf = 0; window.requestAnimationFrame = (cb) => { w.__raf++; return o(cb) } })
  await wheel(1200)
  console.log(await f.evaluate(() => { const w = window as any; return { sc: w.__sc, raf: w.__raf, cls: document.querySelector("header.header")!.closest(".shopify-section")!.className } }))
  console.log(await f.evaluate(async () => { const w = window as any; const hs = document.querySelectorAll("header.header[data-sticky]"); w.StorelibHeaderSticky?.refresh(); await new Promise((r) => setTimeout(r, 200)); const s = document.querySelector("header.header")!.closest(".shopify-section")!; return { n: hs.length, has: !!w.StorelibHeaderSticky, cls: s.className, scripts: [...document.scripts].filter((x) => /StorelibHeaderSticky/.test(x.text)).length, se: document.scrollingElement?.scrollTop, html: getComputedStyle(document.documentElement).overflow + "/" + getComputedStyle(document.body).overflow } }))
  await wheel(-2000)
  for (const v of (process.env.SEQ ?? "on-scroll-up,always,on-scroll-up,none,on-scroll-up").split(",")) await run(v)
  await ed.page.screenshot({ path: "/tmp/claude-0/-home-user-materia-mvp-build-127--1-/147be959-918a-5d75-9be6-62597f3c7a71/scratchpad/r69/r4/p1.png" })
  ed.close(); await browser.close(); process.exit(0)
})()
