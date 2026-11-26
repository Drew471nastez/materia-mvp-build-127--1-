import JSZip from "jszip"
import puppeteer from "puppeteer-core"
import { composeTemplateZip } from "../lib/themes/template-packages"
import { editorFor } from "./check-builder-nav19"
const OUT = process.env.OUT ?? "/tmp"
void (async () => {
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] })
const zip = await JSZip.loadAsync(await composeTemplateZip("materia/space"))
if (process.env.SKYSET) {
  const hg = JSON.parse(await zip.file("sections/header-group.json")!.async("string"))
  Object.assign(hg.sections.sky.settings, JSON.parse(process.env.SKYSET))
  zip.file("sections/header-group.json", JSON.stringify(hg))
}
const ed = await editorFor(browser, 1440, 900, false, undefined, zip)
const measure = async () => {
  const f = await ed.frame()
  return f.evaluate(() => {
    const secs = [...document.querySelectorAll(".shopify-section")].map((s) => { const r = s.getBoundingClientRect(); return `${s.id.replace("shopify-section-", "")}:${Math.round(r.height)}` })
    const top = document.elementFromPoint(innerWidth / 2, innerHeight / 2)
    const skies = [...document.querySelectorAll<HTMLElement>("[data-space-sky]")].map((d) => `${d.parentElement?.tagName}#${d.parentElement?.id} ready=${d.hasAttribute("data-ready")} kids=${d.children.length} ${JSON.stringify(d.dataset)}`)
    return { secs: secs.join(" "), center: top ? `${top.tagName}.${String(top.className).slice(0, 60)}` : null, skies }
  })
}
await ed.frame(); await sleep(4000)
console.log("start", await measure())
await ed.page.screenshot({ path: `${OUT}/sky-0.png` })
// pick the Night sky row in the sidebar
const pt = await ed.page.evaluate(() => {
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let n = w.nextNode(); n; n = w.nextNode()) if (n.textContent?.trim() === "Night sky") { const r = (n.parentElement as HTMLElement).getBoundingClientRect(); if (r.width) return { x: r.left + r.width / 2, y: r.top + r.height / 2 } }
  return null
})
if (pt) await ed.page.mouse.click(pt.x, pt.y)
const ok = !!pt
console.log("row", ok)
await sleep(1500)
await ed.page.screenshot({ path: `${OUT}/sky-1.png` })
const setRange = async (label: RegExp, value: number) => {
  const done = await ed.page.evaluate((src: string, v: number) => {
    const re = new RegExp(src)
    const inputs = [...document.querySelectorAll<HTMLInputElement>("input")].filter((i) => i.getClientRects().length)
    for (const i of inputs) {
      let at: HTMLElement | null = i
      for (let k = 0; k < 6 && at; k++) { at = at.parentElement; if (at && re.test(at.textContent ?? "") ) break }
      if (!at || !(i.type === "number" || i.inputMode === "numeric" || i.type === "text")) continue
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!
      i.focus(); setter.call(i, String(v)); i.dispatchEvent(new Event("input", { bubbles: true })); i.dispatchEvent(new Event("change", { bubbles: true })); i.blur()
      return i.outerHTML.slice(0, 120)
    }
    return null
  }, label.source, value)
  return done
}
for (const [l, v] of [["Star size", 200], ["How many stars", 150], ["Twinkling stars", 30]] as const) {
  console.log(l, await setRange(new RegExp(`^${l}`), v))
  await sleep(2500)
  console.log(" after", await measure())
  await ed.page.screenshot({ path: `${OUT}/sky-${l.replace(/\W/g, "")}.png` })
}
ed.close(); await browser.close()

})()
