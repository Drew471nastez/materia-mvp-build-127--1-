/*
 * ===========================================================================
 *  ROUND 21: THE COMMUNITY'S LEFTOVERS, MEASURED UNDER THE REAL ROUTER
 * ===========================================================================
 * Runs against this harness (build.sh, serve.sh) at 390x844, touch, 4x CPU.
 *
 *   node scripts/nav18-real-router/polish21.mjs <port> <outdir> flow=back [n=5]
 *     A post opened from the feed, closed by its X and by the browser's Back, n times each. Reported per close: the time
 *     from the press (or the popstate) to the close's move starting ([data-post-fullscreen] taking data-moving), and to
 *     the layer gone; the long tasks in between. Medians. Every compositor frame of the last Back close is saved.
 *   node scripts/nav18-real-router/polish21.mjs <port> <outdir> flow=compose
 *     Members, then the tab bar's Create post: where the address goes, which place is on screen under the composer's
 *     sheet, and once posted, the feed holding the new post when Home is tapped. Frames saved.
 */
import puppeteer from "puppeteer-core"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
const [port, out, ...rest] = process.argv.slice(2)
const opt = Object.fromEntries(rest.map((a) => a.split("=")))
const CPU = Number(opt.cpu || 4)
const N = Number(opt.n || 5)
const base = `http://localhost:${port}`
mkdirSync(out, { recursive: true })
const b = await puppeteer.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox", "--force-device-scale-factor=1"] })
const p = await b.newPage()
await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Version/18.0 Safari/604.1")
await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 })
const errors = []
p.on("pageerror", (e) => errors.push(String(e.message).slice(0, 200)))
await p.setCookie({ name: "d_account", value: "700", url: base }, { name: "d_page", value: "250", url: base }, { name: "d_community", value: "300", url: base })
await p.evaluateOnNewDocument(() => {
  try { localStorage.setItem("_sl_auth_v1", JSON.stringify({ signedIn: true, userId: "u-me", avatarUrl: null, displayName: "Sam Carter", username: "samc", isSeller: false })) } catch {}
  window.__ev = []
  const t = () => Math.round(performance.now())
  /* The very first popstate listener: the moment the browser says Back. */
  /* The first animation frame after the press: the frame that can carry the close's first moved picture. */
  const frame = () => requestAnimationFrame(() => window.__ev.push(["frame", t()]))
  addEventListener("popstate", () => { window.__ev.push(["popstate", t()]); frame() }, true)
  addEventListener("click", (e) => { if (e.target?.closest?.("[data-post-overlay-close]")) { window.__ev.push(["x", t()]); frame() } }, true)
  new MutationObserver((ms) => {
    for (const m of ms) {
      const el = m.target
      if (!(el instanceof HTMLElement) || !el.hasAttribute("data-post-fullscreen")) continue
      if (m.attributeName === "data-moving") window.__ev.push([el.hasAttribute("data-moving") ? "moving" : "still", t()])
      if (m.attributeName === "style" && el.style.visibility === "hidden") window.__ev.push(["hidden", t()])
    }
  }).observe(document, { subtree: true, attributes: true, attributeFilter: ["data-moving", "style"] })
  window.__long = []
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push([Math.round(e.startTime), Math.round(e.duration)]) }).observe({ type: "longtask" }) } catch {}
})
await p.setRequestInterception(true)
p.on("request", (r) => (r.url().startsWith(base) || r.url().startsWith("data:") ? r.continue() : r.abort()))
const cdp = await p.target().createCDPSession()
await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU })
const frames = []
cdp.on("Page.screencastFrame", async (f) => { frames.push(f); cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {}) })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const med = (a) => { const s = [...a].filter((x) => x >= 0).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : -1 }
async function tapSel(sel, dx = 0.5, dy = 0.5) {
  const box = await p.$eval(sel, (el) => { el.scrollIntoView({ block: "center" }); const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } })
  await sleep(200)
  const r = await p.$eval(sel, (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } })
  await p.touchscreen.tap(r.x + r.w * dx, r.y + r.h * dy)
  return box
}
async function film(label, act, ms) {
  frames.length = 0
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 70, everyNthFrame: 1 })
  await sleep(150)
  await act()
  await sleep(ms)
  await cdp.send("Page.stopScreencast")
  const dir = join(out, label); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true })
  const f0 = frames[0]?.metadata.timestamp ?? 0
  frames.forEach((f, i) => writeFileSync(join(dir, `f${String(i).padStart(3, "0")}-${Math.round((f.metadata.timestamp - f0) * 1000)}.jpg`), Buffer.from(f.data, "base64")))
  return frames.length
}

await p.goto(base + "/community/clay-studio", { waitUntil: "load" })
await sleep(3000)
const flow = opt.flow || "back"

if (flow === "back") {
  const res = { x: [], back: [] }
  for (let i = 0; i < N * 2; i++) {
    const how = i % 2 ? "back" : "x"
    const last = i >= N * 2 - 2
    const card = `[data-feed-list] > [data-post]:nth-of-type(${1 + (i % 3)})`
    await p.evaluate(() => window.scrollTo(0, 0))
    await sleep(300)
    await tapSel(`${card} [data-post-body], ${card} p, ${card}`, 0.5, 0.6).catch(() => tapSel(card))
    await sleep(2200)
    const opened = await p.evaluate(() => !!document.querySelector("[data-post-fullscreen]") && location.pathname.includes("/post/"))
    if (!opened) { console.log(`  ${how}: the post did not open`); continue }
    await p.evaluate(() => { window.__ev = []; window.__long = [] })
    const act = async () => {
      if (how === "x") await tapSel("[data-post-overlay-close]")
      else await p.evaluate(() => history.back())
    }
    const prof = opt.prof === "1" && last
    if (prof) { await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: 200 }); await cdp.send("Profiler.start") }
    if (last) await film(`close-${how}`, act, 1200)
    else { await act(); await sleep(1200) }
    if (prof) {
      const { profile } = await cdp.send("Profiler.stop")
      const byId = new Map(profile.nodes.map((n) => [n.id, n]))
      for (const n of profile.nodes) for (const c of n.children || []) { const ch = byId.get(c); if (ch) ch.__parent = n.id }
      const incl = new Map(); let j = 0
      for (const id of profile.samples) { const d = (profile.timeDeltas[j++] || 0) / 1000; let n = byId.get(id); if (n.callFrame.functionName === "(idle)") continue; const seen = new Set(); while (n) { const cf = n.callFrame; const k = (cf.functionName || "(anon)") + " @ " + (cf.url.split("/").pop() || "") + ":" + cf.lineNumber + ":" + cf.columnNumber; if (!seen.has(k)) { seen.add(k); incl.set(k, (incl.get(k) || 0) + d) } n = n.__parent ? byId.get(n.__parent) : null } }
      /* The samples in time order, as stacks: what ran, in what order, after the press. */
      { let tt = profile.startTime; const lines = []; let j2 = 0; let lastK = ""
        for (const id of profile.samples) { tt += profile.timeDeltas[j2++] || 0; let n = byId.get(id); const st = []; while (n) { const fn = n.callFrame.functionName; if (fn && !/^\((root|program)\)$/.test(fn)) st.push(fn); n = n.__parent ? byId.get(n.__parent) : null } const k = st.reverse().filter((x) => !/^(performWorkUntilDeadline|workLoop|flushWork|beginWork|renderWithHooks|updateFunctionComponent|performUnitOfWork|workLoopSync|renderRootSync|recursivelyTraverse\w+|commit\w+OnFiber|updateForwardRef|updateMemoComponent|updateSimpleMemoComponent)$/.test(x)).slice(0, 14).join(" > "); if (k !== lastK) { lines.push(`${((tt - profile.startTime) / 1000).toFixed(1).padStart(8)}  ${k}`); lastK = k } }
        writeFileSync(join(out, `close-${how}-timeline.txt`), lines.join("\n") + "\n") }
      writeFileSync(join(out, `close-${how}-inclusive.txt`), [...incl.entries()].sort((a, b) => b[1] - a[1]).slice(0, 80).map(([k, v]) => v.toFixed(1).padStart(8) + "  " + k).join("\n") + "\n")
    }
    const ev = await p.evaluate(() => ({ ev: window.__ev, long: window.__long }))
    const start = ev.ev.find(([k]) => k === (how === "x" ? "x" : "popstate"))?.[1]
    const moving = ev.ev.find(([k]) => k === "moving")?.[1]
    const hidden = ev.ev.find(([k]) => k === "hidden")?.[1]
    const fr = ev.ev.find(([k]) => k === "frame")?.[1]
    /* The move is on screen at the first frame after it started: the later of the two. */
    const toMove = start !== undefined && moving !== undefined && fr !== undefined ? Math.max(moving, fr) - start : -1
    const toGone = start !== undefined && hidden !== undefined ? hidden - start : -1
    const longs = ev.long.filter(([s, d]) => start !== undefined && s + d >= start && s <= (hidden ?? start + 1000))
    res[how].push({ toMove, toGone, longs })
    console.log(`  ${how.padEnd(4)} press to first moved frame ${toMove}ms, to gone ${toGone}ms, long tasks ${JSON.stringify(longs.map(([s, d]) => [s - start, d]))}`)
    await sleep(600)
  }
  const sum = Object.fromEntries(Object.entries(res).map(([k, v]) => [k, { toMoveMedian: med(v.map((r) => r.toMove)), toGoneMedian: med(v.map((r) => r.toGone)), runs: v.map((r) => r.toMove) }]))
  console.log(JSON.stringify(sum))
  writeFileSync(join(out, "back.json"), JSON.stringify(sum, null, 1))
}

if (flow === "compose") {
  const placeLink = opt.place || "Members"
  const go = await p.$(`[data-community-nav="${placeLink}"]`)
  if (!go) { console.log("  no link to", placeLink); process.exit(1) }
  await go.evaluate((el) => el.click())
  await sleep(2500)
  const before = await p.evaluate(() => location.pathname + location.search)
  await p.evaluate(() => {
    window.__seen = []
    const t0 = performance.now()
    const tick = () => {
      const host = document.querySelector("[data-place-host]")
      const vis = (el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0 }
      const shown = host ? Array.from(host.querySelectorAll(":scope > [data-place-routed], :scope > [data-place-screen]")).filter(vis).map((e) => e.getAttribute("data-place-screen") || "routed").join(",") : "-"
      const sheet = document.querySelector("[data-composer=sheet]")
      window.__seen.push([Math.round(performance.now() - t0), location.pathname, shown, sheet ? Math.round(sheet.getBoundingClientRect().top) : "-"])
      if (performance.now() - t0 < 1600) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  const n = await film("compose-open", () => tapSel("[data-buyer-tab=compose]"), 1400)
  const seen = await p.evaluate(() => window.__seen)
  let last = ""
  const story = []
  for (const s of seen) { const k = JSON.stringify(s.slice(1)); if (k !== last) { story.push(s); last = k } }
  console.log(`  from ${before}, ${n} frames`)
  for (const s of story) console.log("   ", JSON.stringify(s))
  const after = await p.evaluate(() => ({ path: location.pathname + location.search, sheet: !!document.querySelector("[data-composer=sheet]") }))
  console.log("  after the tap:", JSON.stringify(after))
  if (after.sheet && opt.post === "1") {
    await p.type("[data-composer=sheet] input", "Kiln opening on Friday")
    await p.type("[data-composer=sheet] textarea", "Bring a mug to glaze.")
    const spaceBtn = await p.$("[data-composer=sheet] button[data-composer-space]")
    if (spaceBtn) { await spaceBtn.click(); await sleep(900); const items = await p.$$("[data-action-sheet] button, [data-action-list] [role=menuitem]"); console.log("  space choices:", items.length); if (items[0]) await items[0].click(); await sleep(400) }
    await p.evaluate(() => { window.__posted = null; const f = window.fetch; window.fetch = (u, o) => { if (String(u).includes("/posts") && o?.method === "POST") window.__posted = String(u); return f(u, o) } })
    await tapSel("[data-composer=sheet] [data-composer-post]")
    await sleep(2500)
    const s2 = await p.evaluate(() => ({ path: location.pathname, sheet: !!document.querySelector("[data-composer=sheet]"), posted: window.__posted }))
    console.log("  after Post:", JSON.stringify(s2))
    await tapSel("[data-buyer-tab=home]")
    await sleep(1500)
    const top = await p.evaluate(() => Array.from(document.querySelectorAll("[data-feed-list] > [data-post]")).filter((e) => e.getBoundingClientRect().height > 0).slice(0, 3).map((e) => e.querySelector("h2, h3, [data-post-title]")?.textContent || e.textContent.slice(0, 60)))
    console.log("  the feed's first posts:", JSON.stringify(top))
    await film("compose-home", async () => {}, 300)
  }
}
if (errors.length) console.log("  page errors:", JSON.stringify(errors.slice(0, 5)))
await b.close()
