/**
 * Screenshots of the block sheet for a visual review (scripts/render-onepage-block-sheet.tsx):
 * SHOTS=<dir> node scripts/shot-onepage-block-sheet.mjs
 */
import puppeteer from "puppeteer-core"
import { existsSync, mkdirSync } from "node:fs"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const dir = process.env.SHOTS || "/tmp/block-sheet-shots"
mkdirSync(dir, { recursive: true })
const chromium = process.env.CHROMIUM || ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/tmp/chromium"].find((p) => existsSync(p))
const { base, server } = await serveEditorProbe({ entry: "scripts/render-onepage-block-sheet.tsx" })
const browser = await puppeteer.launch({ executablePath: chromium, args: ["--no-sandbox"] })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const calendly = `<!doctype html><body style="margin:0;font:15px sans-serif;background:#fff;color:#1a2b4a"><h2 style="text-align:center;margin:28px 0">Select a Day</h2><div style="display:grid;grid-template-columns:repeat(7,1fr);gap:10px;padding:0 18px">${Array.from({ length: 30 }, (_, i) => `<span style="text-align:center;padding:10px 0;border-radius:50%;background:${i % 7 < 5 ? "#eef4ff" : "transparent"};color:${i % 7 < 5 ? "#0060e6" : "#1a2b4a"}">${i + 1}</span>`).join("")}</div></body>`
const ig = (h) => `<!doctype html><body style="margin:0;font:14px sans-serif;background:#fff"><div style="height:60px;display:flex;align-items:center;gap:10px;padding:0 12px;border-bottom:1px solid #eee"><span style="width:32px;height:32px;border-radius:50%;background:#ddd"></span><b>creator</b></div><div style="aspect-ratio:4/5;background:linear-gradient(135deg,#f09433,#bc1888)"></div><p style="padding:12px">View more on Instagram</p><div style="height:${h - 60}px"></div><script>parent.postMessage(JSON.stringify({type:"MEASURE",details:{height:${h}}}),"*")</script></body>`
try {
  for (const [label, w, h] of [["phone", 390, 844], ["computer", 1440, 900]]) {
    const page = await browser.newPage()
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 })
    await page.setRequestInterception(true)
    page.on("request", (r) => {
      const u = new URL(r.url())
      if (u.hostname === "www.instagram.com") return void r.respond({ status: 200, contentType: "text/html", body: ig(u.pathname.includes("SHORT1") ? 420 : 1100) })
      if (u.hostname === "calendly.com") return void r.respond({ status: 200, contentType: "text/html", body: calendly })
      if (u.hostname !== "127.0.0.1" && u.hostname !== "localhost") return void r.respond({ status: 200, contentType: "text/html", body: "<body style='margin:0;background:#e8eaed'></body>" })
      void r.continue()
    })
    await page.goto(base + "/app/onepage", { waitUntil: "domcontentloaded" })
    await page.waitForSelector("[data-probe-calendly]")
    await sleep(1500)
    await page.screenshot({ path: `${dir}/${label}-page.png` })
    await page.$eval('[data-probe="inline-post"]', (el) => el.scrollIntoView({ block: "start" }))
    await sleep(1500)
    await page.screenshot({ path: `${dir}/${label}-instagram.png` })
    await page.evaluate(() => scrollTo(0, 0))
    await page.$eval("[data-probe-calendly]", (el) => el.click())
    await sleep(120)
    await page.screenshot({ path: `${dir}/${label}-opening.png` })
    await sleep(900)
    await page.screenshot({ path: `${dir}/${label}-sheet.png` })
    await page.keyboard.press("Escape")
    await sleep(600)
    await page.$eval('[data-probe="post"] [data-block-sheet-trigger]', (el) => el.click())
    await sleep(1800)
    await page.screenshot({ path: `${dir}/${label}-post-sheet.png` })
    await page.close()
  }
} finally {
  await browser.close()
  await new Promise((r) => server.close(r))
}
console.log("shots in", dir)
