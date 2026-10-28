import puppeteer from "puppeteer-core"
import { serveEditorProbe } from "./onepage-probe-server.mjs"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const { base, server } = await serveEditorProbe({ fail: (m) => { throw new Error(m) } })
const browser = await puppeteer.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox", "--disable-gpu"] })
const p = await browser.newPage()
await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
p.on("pageerror", (e) => console.log("ERR", String(e).slice(0, 300)))
await p.goto(`${base}/app/onepage#links`)
await p.waitForSelector("[data-scroll-container]", { timeout: 15000 })
await sleep(2500)
const cdp = await p.target().createCDPSession()
await cdp.send("LayerTree.enable")
let layerSets = []
const inBar = new Map()
await cdp.send("DOM.getDocument", { depth: -1 })
async function barLayers(layers) {
  let n = 0
  for (const l of layers) {
    if (!l.backendNodeId) continue
    if (!inBar.has(l.backendNodeId)) {
      try {
        const { object } = await cdp.send("DOM.resolveNode", { backendNodeId: l.backendNodeId })
        const { result } = await cdp.send("Runtime.callFunctionOn", { objectId: object.objectId, functionDeclaration: "function(){ const e = this.nodeType === 1 ? this : this.parentElement; return !!(e && e.closest('[data-onepage-tabbar]')) }", returnByValue: true })
        inBar.set(l.backendNodeId, result.value)
      } catch { inBar.set(l.backendNodeId, false) }
    }
    if (inBar.get(l.backendNodeId)) n++
  }
  return n
}
cdp.on("LayerTree.layerTreeDidChange", (e) => { if (e.layers) barLayers(e.layers).then((n) => layerSets.push(n)) })
await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
for (const id of ["design", "products", "links", "products", "design", "links"]) {
  const bb = await p.evaluate((id) => { const el = document.querySelector(`[data-onepage-tabbar] [data-tab="${id}"]`); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } }, id)
  layerSets = []
  await p.evaluate(() => { window.__fr = []; const tick = () => { const b = document.querySelector("[data-onepage-tabbar]"); window.__fr.push({ pos: [...b.querySelectorAll("[data-tab] svg, [data-tab-word]")].map((s) => { const r = s.getBoundingClientRect(); return r.x.toFixed(2) + "," + r.y.toFixed(2) }).join(" "), fills: [...b.querySelectorAll("[data-tab-fill]")].map((f) => +getComputedStyle(f).opacity) }); if (window.__fr.length < 50) requestAnimationFrame(tick) }; requestAnimationFrame(tick) })
  await p.touchscreen.tap(bb.x, bb.y)
  await sleep(1500)
  const fr = await p.evaluate(() => window.__fr)
  const positions = new Set(fr.map((f) => f.pos)).size
  /* A reversal: any fill whose opacity goes down then up, or up then down, within the switch. */
  let reversals = 0
  for (let i = 0; i < 4; i++) { let dir = 0; for (let k = 1; k < fr.length; k++) { const d = Math.sign(fr[k].fills[i] - fr[k - 1].fills[i]); if (d && dir && d !== dir) reversals++; if (d) dir = d } }
  console.log(id, { distinctPositions: positions, reversals, layersInBar: [...new Set(layerSets)] })
}
await browser.close(); server.close()
