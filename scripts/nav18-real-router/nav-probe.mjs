/*
 * ===========================================================================
 *  ROUND 18: THE COMMUNITY, THE ACCOUNT AND THE TAB BAR UNDER THE REAL ROUTER
 * ===========================================================================
 * A small Next 16 app (this directory: app/, fix/) that mounts this repo's
 * real community shell (ShellFrame, the place host, the feed and its pills),
 * the real account page (AccountHub, ProfileHero, the owner pills, the nav
 * fade, the community bar over it, Settings' layer) and the real tab bar, with
 * fixture data and server time per piece (cookies d_account, d_page,
 * d_community, d_post). The stub harnesses (scripts/render-*.tsx) cannot show
 * what happens between two layouts, and that is where items 1, 2 and 3 were.
 *
 *   scripts/nav18-real-router/build.sh "$PWD" .next-after
 *   scripts/nav18-real-router/serve.sh .next-after 3923
 *   node scripts/nav18-real-router/nav-probe.mjs 3923 <outdir> [flow=...] [app=1] [cpu=4] [prof=1] [trace=1] [htmlwatch=1]
 *
 * Flows (390x844, touch, 4x CPU): both (community to Profile, Home back, and
 * Profile again), pills (the account's pills), settings (Back from Settings'
 * layer), more (Show more on the account's posts), tabs (the row of places:
 * hit areas and real taps), hover (a finger that rests on a pill and
 * scrolls). Every compositor frame is saved (CDP screencast) with what was on
 * screen at each animation frame; sheet.mjs and crop-sheet.mjs lay frames out
 * to be looked at. timing.mjs repeats tap to seen whole (mode=post for a post
 * opened from the account's Posts).
 */
import puppeteer from "puppeteer-core"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
const [port, out, ...rest] = process.argv.slice(2)
const opt = Object.fromEntries(rest.map((a) => a.split("=")))
const APP = opt.app === "1"
const CPU = Number(opt.cpu || 4)
const base = `http://localhost:${port}`
mkdirSync(out, { recursive: true })
const b = await puppeteer.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox", "--force-device-scale-factor=1", ...(opt.noadjust === "1" ? ["--disable-touch-adjustment"] : [])] })
const p = await b.newPage()
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148" + (APP ? " StorelibApp" : " Version/18.0 Safari/604.1")
await p.setUserAgent(UA)
await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 })
const errors = []
p.on("pageerror", (e) => errors.push(String(e.message).slice(0, 200)))
p.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text().slice(0, 200)) })
await p.setCookie({ name: "d_account", value: String(opt.account ?? 700), url: base }, { name: "d_page", value: String(opt.page ?? 250), url: base }, { name: "d_community", value: String(opt.community ?? 300), url: base })
if (opt.htmlwatch === "1") await p.evaluateOnNewDocument(() => {
  /* Every write to <html> and <body> (attributes, classes, inline style), with who made it: a write there can restyle the whole page. */
  window.__htmlLog = null
  const log = (what) => { if (!window.__htmlLog) return; const st = (new Error().stack || "").split("\n").slice(2, 6).map((l) => l.trim().replace(/^at /, "").replace(/\(?http:\/\/localhost:\d+\/_next\/static\/chunks\//, "").replace(/\)$/, "")).join(" < "); window.__htmlLog.push([Math.round(performance.now() - window.__htmlLog.t0), what, st]) }
  const root = (el) => el === document.documentElement || el === document.body
  const sa = Element.prototype.setAttribute, ra = Element.prototype.removeAttribute, ta = Element.prototype.toggleAttribute
  Element.prototype.setAttribute = function (k, v) { if (root(this) && this.getAttribute(k) !== String(v)) log(`${this.tagName} set ${k}=${String(v).slice(0, 40)}`); return sa.call(this, k, v) }
  Element.prototype.removeAttribute = function (k) { if (root(this) && this.hasAttribute(k)) log(`${this.tagName} remove ${k}`); return ra.call(this, k) }
  Element.prototype.toggleAttribute = function (k, f) { if (root(this)) log(`${this.tagName} toggle ${k}`); return ta.call(this, k, f) }
  const add = DOMTokenList.prototype.add, rem = DOMTokenList.prototype.remove, tog = DOMTokenList.prototype.toggle
  const owner = new WeakMap()
  const cl = Object.getOwnPropertyDescriptor(Element.prototype, "classList").get
  Object.defineProperty(Element.prototype, "classList", { get() { const l = cl.call(this); owner.set(l, this); return l }, configurable: true })
  DOMTokenList.prototype.add = function (...c) { const el = owner.get(this); if (el && root(el) && c.some((x) => !this.contains(x))) log(`${el.tagName} class+ ${c.join(" ")}`); return add.apply(this, c) }
  DOMTokenList.prototype.remove = function (...c) { const el = owner.get(this); if (el && root(el) && c.some((x) => this.contains(x))) log(`${el.tagName} class- ${c.join(" ")}`); return rem.apply(this, c) }
  DOMTokenList.prototype.toggle = function (c, f) { const el = owner.get(this); if (el && root(el)) log(`${el.tagName} class~ ${c}`); return tog.call(this, c, f) }
  const sp = CSSStyleDeclaration.prototype.setProperty
  CSSStyleDeclaration.prototype.setProperty = function (k, v, pr) { if ((this === document.documentElement.style || this === document.body.style) && this.getPropertyValue(k) !== String(v)) log(`style ${k}=${String(v).slice(0, 30)}`); return sp.call(this, k, v, pr) }
})
await p.evaluateOnNewDocument(() => {
  try { localStorage.setItem("_sl_auth_v1", JSON.stringify({ signedIn: true, userId: "u-me", avatarUrl: null, displayName: "Sam Carter", username: "samc", isSeller: false })) } catch {}
  /* What is on screen, every animation frame, while recording. */
  window.__rec = null
  const sample = () => {
    const r = window.__rec
    if (r) {
      const q = (s) => document.querySelector(s)
      const vis = (el) => { if (!el) return 0; const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0 && b.bottom > 0 && b.top < innerHeight ? 1 : 0 }
      const chips = q("[data-space-chips]")
      const fills = chips ? Array.from(chips.querySelectorAll("[data-chip-fill=on]")).length : -1
      const cover = q("[data-profile-cover-image]")
      const fade = q("[data-account-nav-fade]")
      const host = q("[data-place-host]")
      const shownScreens = host ? Array.from(host.querySelectorAll(":scope > [data-place-routed], :scope > [data-place-screen]")).filter((e) => vis(e)).map((e) => e.getAttribute("data-place-screen") || "routed").join(",") : "-"
      r.push({
        t: Math.round(performance.now() - r.t0),
        path: location.pathname + location.search,
        shell: q("[data-community-shell]") ? 1 : 0,
        chips: vis(chips), fills,
        feedPosts: document.querySelectorAll("[data-feed-list] > [data-post]").length,
        screens: shownScreens,
        account: q("[data-page=account]") ? 1 : 0,
        cover: cover ? cover.getAttribute("data-profile-cover-image") + ":" + getComputedStyle(cover).opacity.slice(0, 4) + ":" + (cover.complete ? "c" : "-") : "-",
        fade: fade ? getComputedStyle(fade).opacity.slice(0, 4) : "-",
        panel: (() => { const r = document.querySelector("[data-fix-rows]"); if (!r) return "-"; let o = 1; for (let e = r; e && e !== document.body; e = e.parentElement) o *= Number(getComputedStyle(e).opacity); return r.getAttribute("data-fix-rows") + ":" + o.toFixed(2) })(),
        swap: document.documentElement.hasAttribute("data-tab-swap") ? 1 : 0,
        pend: document.documentElement.hasAttribute("data-account-community-pending") ? 1 : 0,
      })
    }
    requestAnimationFrame(sample)
  }
  requestAnimationFrame(sample)
})
await p.setRequestInterception(true)
const reqs = []
p.on("request", (r) => { const u = r.url(); if (!u.startsWith(base) && !u.startsWith("data:")) return r.abort(); if (window_rec_on) reqs.push(u.replace(base, "")); r.continue() })
const cdp = await p.target().createCDPSession()
await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU })
const frames = []
cdp.on("Page.screencastFrame", async (f) => { frames.push(f); cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {}) })
let window_rec_on = false
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function tapTab(key) {
  const box = await p.$eval(`[data-buyer-tab=${key}]`, (el) => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
  await p.touchscreen.tap(box.x, box.y)
}
async function record(label, act, ms) {
  frames.length = 0
  reqs.length = 0
  window_rec_on = true
  if (opt.htmlwatch === "1") await p.evaluate(() => { window.__htmlLog = []; window.__htmlLog.t0 = performance.now() })
  if (opt.sample !== "0") await p.evaluate(() => { window.__rec = []; window.__rec.t0 = performance.now() })
  const t0 = Date.now()
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 70, everyNthFrame: 1 })
  await sleep(120)
  if (opt.prof === "1") { await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: Number(opt.interval || 1000) }); await cdp.send("Profiler.start") }
  await p.evaluate(() => { window.__long = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push([Math.round(e.startTime), Math.round(e.duration)]) }).observe({ type: "longtask" }) } catch {} })
  const tapAt = Date.now() - t0
  if (opt.trace === "1") await p.tracing.start({ categories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "disabled-by-default-devtools.timeline.stack", "v8.execute", "blink.user_timing"] })
  await act()
  await sleep(ms)
  await cdp.send("Page.stopScreencast")
  if (opt.trace === "1") {
    const buf = await p.tracing.stop()
    const ev = JSON.parse(Buffer.from(buf).toString("utf8")).traceEvents
    const mains = ev.filter((e) => e.name === "thread_name" && e.args?.name === "CrRendererMain")
    const weight = (m) => ev.reduce((a, e) => (e.ph === "X" && e.pid === m.pid && e.tid === m.tid ? a + (e.dur || 0) : a), 0)
    const main = mains.sort((a, b) => weight(b) - weight(a))[0]
    const mine = ev.filter((e) => e.ph === "X" && main && e.pid === main.pid && e.tid === main.tid)
    const sum = {}
    for (const e of mine) sum[e.name] = (sum[e.name] || 0) + (e.dur || 0) / 1000
    const t0e = Math.min(...mine.map((e) => e.ts))
    console.log("  trace totals: " + Object.entries(sum).filter(([k, v]) => v > 8 && /Layout|UpdateLayoutTree|Paint|FunctionCall|EvaluateScript|RunTask|ParseHTML|Decode|Composite|TimerFire|FireAnimationFrame|EventDispatch|RunMicrotasks|v8.run|HitTest|ScrollLayer|PrePaint|Layerize/.test(k)).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${Math.round(v)}`).join(" "))
    const lays = mine.filter((e) => (e.name === "Layout" || e.name === "UpdateLayoutTree") && e.dur > 8000)
    for (const e of lays.slice(0, 30)) {
      const st = e.args?.beginData?.stackTrace || e.args?.data?.stackTrace || []
      const top = st.slice(0, 3).map((f) => `${f.functionName || "(anon)"}@${(f.url || "").split("/").pop()}:${f.lineNumber}:${f.columnNumber}`).join(" < ")
      console.log(`    ${e.name.padEnd(16)} at ${Math.round((e.ts - t0e) / 1000)}ms ${Math.round(e.dur / 1000)}ms nodes=${e.args?.beginData?.dirtyObjects ?? e.args?.elementCount ?? "?"} ${top ? "forced by " + top : ""}`)
    }
  }
  if (opt.prof === "1") {
    const { profile } = await cdp.send("Profiler.stop")
    const byId = new Map(profile.nodes.map((n) => [n.id, n]))
    for (const n of profile.nodes) for (const c of n.children || []) { const ch = byId.get(c); if (ch) ch.__parent = n.id }
    const self = new Map()
    const dt = profile.timeDeltas; let i = 0
    for (const id of profile.samples) { const n = byId.get(id); const cf = n.callFrame; const file = (cf.url.split("/").pop() || "(native)"); let k = (cf.functionName || "(anon)") + " @ " + file + ":" + cf.lineNumber; if (file === "(native)" && n.__parent) { const pc = byId.get(n.__parent).callFrame; k += "  <- " + (pc.functionName || "(anon)") + " @ " + (pc.url.split("/").pop()) + ":" + pc.lineNumber + ":" + pc.columnNumber }; self.set(k, (self.get(k) || 0) + (dt[i++] || 0) / 1000) }
    const top = [...self.entries()].filter(([k]) => !/^\(idle\)|^\(program\)|^\(garbage/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 40)
    writeFileSync(join(out, label + "-profile.txt"), top.map(([k, v]) => v.toFixed(1).padStart(8) + "  " + k).join("\n") + "\n")
    /* Busy time per 100ms of the recording, from the samples' own clock: where the main thread waited and where it worked. */
    { let t = profile.startTime; const buckets = []; let j = 0
      for (const id of profile.samples) { t += dt[j++] || 0; const n = byId.get(id); const idle = n.callFrame.functionName === "(idle)"; const b = Math.floor((t - profile.startTime) / 100000); buckets[b] = (buckets[b] || 0) + (idle ? 0 : (dt[j - 1] || 0) / 1000) }
      console.log("  busy per 100ms: " + buckets.map((v) => Math.round(v || 0)).join(" ")) }
    /* Inclusive time by function (self plus everything it called), each function counted once per sample. */
    { const incl = new Map(); let j = 0
      for (const id of profile.samples) { const d = (dt[j++] || 0) / 1000; let n = byId.get(id); if (n.callFrame.functionName === "(idle)") continue; const seen = new Set(); while (n) { const cf = n.callFrame; const k = (cf.functionName || "(anon)") + " @ " + (cf.url.split("/").pop() || "") + ":" + cf.lineNumber + ":" + cf.columnNumber; if (!seen.has(k)) { seen.add(k); incl.set(k, (incl.get(k) || 0) + d) } n = n.__parent ? byId.get(n.__parent) : null } }
      const topI = [...incl.entries()].filter(([k]) => !/^\((root|program|idle)\)/.test(k) && !/451429b6|8618-/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 45)
      writeFileSync(join(out, label + "-inclusive.txt"), topI.map(([k, v]) => v.toFixed(1).padStart(8) + "  " + k).join("\n") + "\n") }
    const tot = [...self.entries()].reduce((a, [k, v]) => (/^\(idle\)/.test(k) ? a : a + v), 0)
    console.log(`  profile: ${tot.toFixed(0)}ms busy; top:\n` + top.slice(0, 15).map(([k, v]) => "    " + v.toFixed(1).padStart(7) + "  " + k).join("\n"))
  }
  if (opt.htmlwatch === "1") { const hl = await p.evaluate(() => { const l = window.__htmlLog; window.__htmlLog = null; return l }); console.log("  html writes:\n" + hl.map(([t, w, st]) => `    ${String(t).padStart(5)} ${w}   [${st}]`).join("\n")) }
  const longs = await p.evaluate(() => window.__long || [])
  console.log("  long tasks:", JSON.stringify(longs))
  window_rec_on = false
  const rec = (await p.evaluate(() => { const r = window.__rec; window.__rec = null; return r })) || []
  const dir = join(out, label); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true })
  const f0 = frames[0]?.metadata.timestamp ?? 0
  frames.forEach((f, i) => writeFileSync(join(dir, `f${String(i).padStart(3, "0")}-${Math.round((f.metadata.timestamp - f0) * 1000)}.jpg`), Buffer.from(f.data, "base64")))
  /* Changes only, so the log reads as a story. */
  let last = ""; const lines = []
  for (const s of rec) { const { t, ...rest } = s; const k = JSON.stringify(rest); if (k !== last) { lines.push(`${String(t).padStart(5)}  ${k}`); last = k } }
  writeFileSync(join(dir, "dom.txt"), lines.join("\n") + "\n")
  writeFileSync(join(dir, "requests.txt"), reqs.join("\n") + "\n")
  console.log(`\n== ${label}: ${frames.length} frames, tap at ~${tapAt}ms\n` + lines.join("\n") + "\n  requests: " + reqs.join(" | "))
  return rec
}
/* A visit as the owner makes it: the profile once (its cover in the cache), then the community, settled. */
await p.goto(base + "/account", { waitUntil: "load" })
await sleep(800)
await p.goto(base + "/community/clay-studio", { waitUntil: "load" })
await sleep(2500)
const flow = opt.flow || "both"
async function tapSel(sel) {
  const box = await p.$eval(sel, (el) => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
  await p.touchscreen.tap(box.x, box.y)
}
if (flow === "settings") {
  /* Settings over the profile on a phone, then Back: how the layer leaves, frame by frame. */
  await p.goto(base + "/account", { waitUntil: "load" })
  await sleep(3000)
  await p.click("[data-profile-owner-pill=settings]")
  await sleep(2000)
  await p.evaluate(() => { window.__sh = []; const t0 = performance.now(); addEventListener("touchend", () => { window.__shTap = Math.round(performance.now() - t0) }, { capture: true, once: true }); const tick = () => { const el = document.querySelector("[data-settings-subpage]"); const r = el?.getBoundingClientRect(); const under = document.querySelector("[data-account-hub]")?.getBoundingClientRect(); window.__sh.push([Math.round(performance.now() - t0), r ? Math.round(r.left) : "gone", under ? Math.round(under.left) : "-", document.querySelector("[data-settings-under-dim]") ? Number(getComputedStyle(document.querySelector("[data-settings-under-dim]")).opacity).toFixed(2) : "-"]); if (performance.now() - t0 < 1500) requestAnimationFrame(tick) }; requestAnimationFrame(tick) })
  const back = (await p.$("[data-settings-subpage] [aria-label='Back to profile']")) ? "[data-settings-subpage] [aria-label='Back to profile']" : "[data-settings-subpage] button"
  await record("settings-back", () => tapSel(back), 1300)
  const sh = await p.evaluate(() => window.__sh)
  const tapAtPage = await p.evaluate(() => window.__shTap)
  const firstMove = sh.find(([, l]) => typeof l === "number" && l > 0)?.[0]
  const settled = sh.find(([, l]) => l === "gone" || l >= 389)?.[0]
  console.log(`  touchend at ${tapAtPage}ms (page clock), first movement ${firstMove}ms: ${firstMove - tapAtPage}ms after; within 1px of gone ${settled}ms: ${settled - tapAtPage}ms after`)
  for (const [t, l, u, d] of sh) console.log(String(t).padStart(5), "sheet left", l, "profile left", u, "dim", d)
  await b.close()
  process.exit(0)
}
if (flow === "more") {
  await p.goto(base + "/account/posts", { waitUntil: "load" })
  await sleep(2500)
  await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await sleep(600)
  await p.evaluate(() => { window.__sc = []; const t0 = performance.now(); const tick = () => { const q = document.querySelector("[data-account-post=q0]"); window.__sc.push([Math.round(performance.now() - t0), Math.round(scrollY), q ? Number(getComputedStyle(q).opacity).toFixed(2) : "-", q ? Math.round(q.getBoundingClientRect().top) : "-"]); if (performance.now() - t0 < 2200) requestAnimationFrame(tick) }; requestAnimationFrame(tick) })
  await record("more", () => tapSel("[data-account-posts-more]"), 1800)
  const sc = await p.evaluate(() => window.__sc)
  let last = ""; for (const [t, y, o, top] of sc) { const k = `${y} ${o} ${top}`; if (k !== last) { console.log(String(t).padStart(5), "scrollY", y, "first new opacity", o, "top", top); last = k } }
  await b.close()
  process.exit(0)
}
if (flow === "tabs") {
  /* The row of places: where a tap lands on a tab, and whether a real phone's tap (a gap, a roll, a tap that stops a scroll) is taken. */
  await p.goto(base + "/community/clay-studio", { waitUntil: "load" })
  await sleep(3000)
  const geo = await p.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll("[data-community-tabs] [data-community-nav]")).filter((t) => t.getBoundingClientRect().width > 0)
    const rects = tabs.map((t) => { const r = t.getBoundingClientRect(); return { name: t.getAttribute("data-community-nav"), l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom) } })
    const first = rects[0], last = rects[rects.length - 1]
    const mid = (first.t + first.b) / 2
    let hit = 0, all = 0
    const rows = {}
    for (const dy of [-22, -20, -18, 0, 18, 20, 22]) { let h = 0, n = 0; for (let x = Math.max(0, first.l); x <= Math.min(last.r, innerWidth - 1); x++) { n++; const el = document.elementFromPoint(x, mid + dy); if (el?.closest?.("[data-community-nav]")) h++ } rows[dy] = Math.round((100 * h) / n); if (dy === 0) { hit = h; all = n } }
    return { rects, coverageAtMiddle: Math.round((100 * hit) / all), coverageByOffset: rows }
  })
  console.log(JSON.stringify(geo))
  const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] })
  const tryTap = async (label, x, y, roll = 0) => {
    const before = await p.evaluate(() => location.pathname)
    await touch("touchStart", x, y); await sleep(40)
    if (roll) { for (let i = 1; i <= 3; i++) { await touch("touchMove", x + (roll * i) / 3, y + (roll * i) / 6); await sleep(16) } }
    await sleep(40); await touch("touchEnd"); await sleep(900)
    const after = await p.evaluate(() => location.pathname)
    console.log(`  ${label}: ${before} -> ${after} ${before !== after ? "TAKEN" : "missed"}`)
    if (before !== after) { await p.goto(base + "/community/clay-studio", { waitUntil: "load" }); await sleep(2500) }
  }
  const r = geo.rects
  const m = (r[0].t + r[0].b) / 2
  await tryTap("centre of Learn", (r[1].l + r[1].r) / 2, m)
  await tryTap("gap between Learn and Calendar, 4px from Calendar", r[2].l - 4, m)
  await tryTap("gap between Learn and Calendar, 4px past Learn", r[1].r + 4, m)
  await tryTap("Calendar, 2px below its box", (r[2].l + r[2].r) / 2, r[2].b + 1)
  await tryTap("Members with an 8px roll", (r[3].l + r[3].r) / 2, m, 8)
  await b.close()
  process.exit(0)
}
if (flow === "hover") {
  /* A finger that rests on a pill and then scrolls the page: no tap. Nothing on the pill may change. */
  await p.goto(base + "/community/clay-studio", { waitUntil: "load" })
  await sleep(3000)
  const sel = opt.sel || "[data-space-chip=general]"
  const box = await p.$eval(sel, (el) => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
  await p.evaluate((sel) => {
    window.__press = []
    const el = document.querySelector(sel)
    const layer = el.querySelector("[data-chip-press], [data-pill-press]")
    const t0 = performance.now()
    const tick = () => { window.__press.push([Math.round(performance.now() - t0), Number(getComputedStyle(layer).opacity).toFixed(2), getComputedStyle(el).backgroundColor]); if (performance.now() - t0 < 1200) requestAnimationFrame(tick) }
    requestAnimationFrame(tick)
  }, sel)
  const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] })
  await touch("touchStart", box.x, box.y)
  await sleep(Number(opt.rest || 250))
  for (let i = 1; i <= 8; i++) { await touch("touchMove", box.x, box.y - i * 6); await sleep(16) }
  await touch("touchEnd")
  await sleep(900)
  const pr = await p.evaluate(() => window.__press)
  let last = ""; for (const [t, o, bg] of pr) { const k = o + " " + bg; if (k !== last) { console.log(String(t).padStart(5), "press", o, "bg", bg); last = k } }
  await b.close()
  process.exit(0)
}
if (flow === "pills") {
  await p.goto(base + "/account", { waitUntil: "load" })
  await sleep(3000)
  await record("pill-posts", () => tapSel("[data-profile-owner-pill=posts]"), 1500)
  await sleep(800)
  await record("pill-communities", () => tapSel("[data-profile-owner-pill=communities]"), 1500)
  await sleep(800)
  await record("pill-activity", () => tapSel("[data-profile-owner-pill=activity]"), 1500)
  console.log("\nerrors:", errors.length ? errors.slice(0, 8).join("\n  ") : "none")
  await b.close()
  process.exit(0)
}
if (flow !== "a2c") await record("c2a", () => tapTab("profile"), Number(opt.wait || 2200))
if (flow !== "c2a") {
  await sleep(1500)
  await record("a2c", () => tapTab("home"), Number(opt.wait || 2200))
  if (opt.again === "1") { await sleep(1500); await record("c2a-2", () => tapTab("profile"), Number(opt.wait || 2200)) }
}
console.log("\nerrors:", errors.length ? errors.slice(0, 8).join("\n  ") : "none")
await b.close()
