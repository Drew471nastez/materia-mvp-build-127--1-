/*
 * Tap to landed, Home <-> Profile, repeated: node timing.mjs <port> [cycles=6] [app=0] [cpu=4]
 * The tap's time is the touch's end as the page hears it; landed is the first animation frame with the next page's frame in
 * the document (the account's [data-page=account] with its cover shown, or the community's shell with its feed). Medians.
 */
import puppeteer from "puppeteer-core"
const [port, ...rest] = process.argv.slice(2)
const opt = Object.fromEntries(rest.map((a) => a.split("=")))
const base = `http://localhost:${port}`
const N = Number(opt.cycles || 6)
const b = await puppeteer.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] })
const p = await b.newPage()
await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148" + (opt.app === "1" ? " StorelibApp" : " Version/18.0 Safari/604.1"))
await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true })
await p.setRequestInterception(true)
p.on("request", (r) => (r.url().startsWith(base) || r.url().startsWith("data:") ? r.continue() : r.abort()))
await p.setCookie({ name: "d_account", value: String(opt.account ?? 700), url: base }, { name: "d_page", value: "250", url: base }, { name: "d_community", value: "300", url: base })
await p.evaluateOnNewDocument(() => {
  try { localStorage.setItem("_sl_auth_v1", JSON.stringify({ signedIn: true, userId: "u-me", username: "samc", displayName: "Sam Carter" })) } catch {}
  window.__tap = 0
  addEventListener("touchend", () => { window.__tap = performance.now() }, true)
})
const cdp = await p.target().createCDPSession()
await cdp.send("Emulation.setCPUThrottlingRate", { rate: Number(opt.cpu || 4) })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function go(key, sel) {
  await p.evaluate((sel) => {
    window.__landed = 0
    /* Landed: there, and seen whole (no box on the way to it still faded: the account's arrival box and its cover). */
    const whole = (el) => { for (let e = el; e && e !== document.body; e = e.parentElement) if (Number(getComputedStyle(e).opacity) < 0.99) return false; return true }
    const t = () => { const el = document.querySelector(sel); if (el && whole(el)) { window.__landed = performance.now(); return } requestAnimationFrame(t) }
    requestAnimationFrame(t)
  }, sel)
  const box = await p.$eval(`[data-buyer-tab=${key}]`, (el) => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
  await p.touchscreen.tap(box.x, box.y)
  for (let i = 0; i < 100; i++) { const d = await p.evaluate(() => window.__landed && window.__tap ? window.__landed - window.__tap : 0); if (d) return Math.round(d); await sleep(100) }
  return -1
}
if (opt.mode === "post") {
  /* A post opened from the account's Posts pill: tap to the post on screen, then Back, repeated. */
  const out = []
  for (let i = 0; i < N; i++) {
    await p.goto(base + "/account/posts", { waitUntil: "load" }); await sleep(Number(opt.settle || 3000))
    await p.evaluate(() => {
      window.__landed = 0
      const t = () => { const el = document.querySelector("[data-fix-post]"); if (el) { window.__landed = performance.now(); return } requestAnimationFrame(t) }
      requestAnimationFrame(t)
    })
    const sel = `[data-account-post=p${i % 4}] a`
    const box = await p.$eval(sel, (el) => { const r = el.getBoundingClientRect(); return { x: r.x + 60, y: r.y + r.height / 2 } })
    await p.touchscreen.tap(box.x, box.y)
    let d = -1
    for (let k = 0; k < 100; k++) { d = await p.evaluate(() => window.__landed && window.__tap ? Math.round(window.__landed - window.__tap) : 0); if (d) break; await sleep(100) }
    out.push(d)
  }
  const s2 = [...out].sort((a, b) => a - b)
  console.log(JSON.stringify({ post: out, median: s2[Math.floor(s2.length / 2)] }))
  await b.close()
  process.exit(0)
}
await p.goto(base + "/account", { waitUntil: "load" }); await sleep(1500)
await p.goto(base + "/community/clay-studio", { waitUntil: "load" }); await sleep(3500)
const c2a = [], a2c = []
for (let i = 0; i < N; i++) {
  c2a.push(await go("profile", '[data-page="account"] [data-profile-cover-image="shown"]')); await sleep(1800)
  a2c.push(await go("home", "[data-community-shell] [data-feed-list] [data-post]")); await sleep(1800)
}
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }
console.log(JSON.stringify({ c2a, a2c, c2aMedian: med(c2a), a2cMedian: med(a2c) }))
await b.close()
