/* Temporary: plays the samples template's audio tracks in Chromium and prints what happened. */
import puppeteer from "puppeteer-core"
import { CODE_THEME_PACKAGE } from "../../lib/themes/marketplace-shared"
import { importTemplate, serve } from "./site"
import { auditCart, auditSite } from "./fixtures"

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const imported = await importTemplate(`${CODE_THEME_PACKAGE}/samples`)
  const built = auditSite(imported, "samples", false)
  const { base, server } = await serve(built, "scripts/theme-templates/products/samples", { cart: auditCart(built) })
  const browser = await puppeteer.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"] })
  const p = await browser.newPage()
  await p.setViewport({ width: 1440, height: 900 })
  const reqs: string[] = []
  p.on("request", (r) => { if (/\.mp4/.test(r.url())) reqs.push(r.url()) })
  p.on("pageerror", (e) => console.log("pageerror", String(e)))
  await p.evaluateOnNewDocument("window.__name = (f) => f")
  await p.goto(`${base}${process.argv[3] ?? "/"}`, { waitUntil: "networkidle2" })
  console.log("audio requests before play:", reqs.length)
  const state = () => p.evaluate(() => Array.from(document.querySelectorAll("[data-sat-audio]")).map((a) => { const x = a as HTMLAudioElement; return [x.paused ? "paused" : "playing", Number(x.currentTime.toFixed(2)), Number((x.duration || 0).toFixed(2))] }))
  console.log("srcs", await p.evaluate(() => Array.from(document.querySelectorAll("[data-sat-audio]")).map((a) => (a as HTMLAudioElement).src.slice(-50))))
  if (process.env.BLOB) {
    await p.evaluate(async () => { for (const a of Array.from(document.querySelectorAll("[data-sat-audio]"))) { const b = await (await fetch((a as HTMLAudioElement).src)).blob(); (a as HTMLAudioElement).src = URL.createObjectURL(b) } })
    console.log("sources swapped to blob URLs")
  }
  const btns = await p.$$("[data-sat-play]")
  await btns[0].click()
  await sleep(1500)
  console.log("after play 1:", JSON.stringify(await state()), "requests", reqs.length)
  if (btns.length > 1) {
    await btns[1].click()
    await sleep(1200)
    console.log("after play 2:", JSON.stringify(await state()))
    console.log("seekable ranges:", await p.evaluate(() => (document.querySelectorAll("[data-sat-audio]")[1] as HTMLAudioElement).seekable.length))
    console.log("label of playing:", await p.evaluate(() => document.querySelectorAll("[data-sat-play]")[1].getAttribute("aria-label")))
    const wave = (await p.$$("[data-sat-wave]"))[1]
    await wave.focus()
    await p.keyboard.press("End")
    await sleep(200)
    await p.keyboard.press("ArrowLeft")
    await sleep(300)
    console.log("after End, ArrowLeft:", JSON.stringify((await state())[1]), await p.evaluate(() => document.querySelectorAll("[data-sat-wave]")[1].getAttribute("aria-valuetext")))
    const box = await wave.boundingBox()
    if (box) await p.mouse.click(box.x + box.width * 0.25, box.y + box.height / 2)
    await sleep(300)
    console.log("after click at 25%:", JSON.stringify((await state())[1]), await p.evaluate(() => getComputedStyle(document.querySelectorAll("[data-sat-wave]")[1]).getPropertyValue("--sat-p")))
    await p.keyboard.press("Space")
    await sleep(200)
    console.log("after Space on wave:", JSON.stringify((await state())[1]))
    await p.keyboard.press("Space")
    await sleep(900)
  }
  await p.evaluate(() => document.querySelector(".sat")?.scrollIntoView())
  await sleep(300)
  if (process.argv[2]) await p.screenshot({ path: process.argv[2] as `${string}.png` })
  await browser.close()
  server.close()
}
main().catch((e) => { console.error(e); process.exit(1) })
