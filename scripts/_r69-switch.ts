import puppeteer from "puppeteer-core"
import JSZip from "jszip"
import { composeTemplateZip } from "../lib/themes/template-packages"
import { editorFor } from "./check-builder-nav19"
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
void (async () => {
  const browser = await puppeteer.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] })
  const zip = await JSZip.loadAsync(await composeTemplateZip(`materia/${process.env.TEMPLATE ?? "fitness"}`))
  if (process.env.STICKY) for (const name of Object.keys(zip.files)) { if (!/\.json$/.test(name)) continue; const t = await zip.file(name)!.async("string"); if (t.includes("sticky_header_type")) zip.file(name, t.replace(/"sticky_header_type":\s*"[^"]*"/g, `"sticky_header_type": "${process.env.STICKY}"`)) }
  const ed = await editorFor(browser, 1440, 900, false, undefined, zip)
  let f = await ed.frame(); await sleep(3000); f = await ed.frame()
  const page = ed.page
  const box = async () => (await (await page.$("[data-compat-frame='front']"))!.boundingBox())!
  const wheel = async (dy: number) => { const b = await box(); await page.mouse.move(b.x + b.width / 2, b.y + 300); for (let i = 0; i < 8; i++) { await page.mouse.wheel({ deltaY: dy / 8 }); await sleep(35) } await sleep(800) }
  const H = () => { const h = document.querySelector("header.header")!; const s = h.closest(".shopify-section")!; const b = h.getBoundingClientRect(); return `${(h as HTMLElement).dataset.sticky} y=${Math.round(scrollY)} w=${innerWidth} top=${Math.round(b.top)} bot=${Math.round(b.bottom)} hidden=${s.classList.contains("shopify-section-header-hidden")}` }
  const FILM = (ms: number) => new Promise<string[]>((done) => { const out: string[] = []; const t0 = performance.now(); let last = ""; const tick = () => { const h = document.querySelector("header.header")!; const s = h.closest(".shopify-section")!; const b = h.getBoundingClientRect(); const v = `${Math.round(b.top)}..${Math.round(b.bottom)} h=${s.classList.contains("shopify-section-header-hidden")} y=${Math.round(scrollY)} w=${innerWidth}`; if (v !== last) { out.push(`${Math.round(performance.now() - t0)} ${v}`); last = v } if (performance.now() - t0 < ms) requestAnimationFrame(tick); else done(out) }; requestAnimationFrame(tick) })
  const press = async (sel: string) => { const at = await page.evaluate((sel) => { const r = document.querySelector(sel)!.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } }, sel); await page.mouse.click(at.x, at.y) }
  await wheel(2000); await wheel(-300)
  console.log("before", await f.evaluate(H))
  for (const sel of ["[data-wb-device-switch]", "[data-wb-device-switch]", "[data-wb-full-toggle]", "[data-wb-full-toggle]"]) {
    f = await ed.frame()
    const film = f.evaluate(FILM, 1500)
    await press(sel)
    console.log(sel, (await film).join(" | "))
    await sleep(500)
    f = await ed.frame()
    console.log("  after", await f.evaluate(H))
    await wheel(-40)
    console.log("  after a small scroll up", await f.evaluate(H))
    await wheel(80)
    console.log("  after a small scroll down", await f.evaluate(H))
    await wheel(-300)
  }
  ed.close(); await browser.close(); process.exit(0)
})()
