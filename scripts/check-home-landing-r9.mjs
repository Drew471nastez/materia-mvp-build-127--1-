/**
 * ===========================================================================
 *  THE HOME PAGE, SCROLLED AND FLUNG ON A PHONE (landing round 9, frame)
 * ===========================================================================
 * The owner, on an iPhone: "when I scroll too fast, sections appear as white
 * blank containers and stutter", "headings glitch, move and stutter", "the
 * Start now button should appear after I go past the second section".
 *
 * Against a running dev server (never a build here: heavy jobs share the
 * machine), iPhone 13 emulation, the processor slowed four times:
 *
 *   shift    a steady scroll to the foot of the page while the screen's height
 *            changes 664 <-> 750 (the toolbar): every layout shift, every
 *            heading whose place in the page changed (layout), how far each
 *            heading moved against the page as drawn (transforms included),
 *            blocks still waiting for an entrance in the middle of the
 *            screen, long tasks and frame times.
 *   fling    1.2s after load, flicks at 6000px/s to the foot: frames in which
 *            an empty lazy box or a waiting block was on screen, screenshots
 *            mid-flick.
 *   header   where Start now is hidden and shown, its fade, the bar's height.
 *   joins    every join of two grounds at 390 and 1440: radius, the colour
 *            behind the corner, a screenshot of each.
 *   profile  one pass through each section with a trace: long tasks, layout,
 *            forced layouts, style, paint, layerize, script, and the
 *            animations still running more than 200px off screen afterwards.
 *   webkit   the steady scroll in WebKit (what Safari does with the headings).
 *   hero     which poster and which film each screen asks for, and when.
 *
 * Chromium here has no H.264, so the film itself only plays in WebKit.
 * Compositor wheel gestures are used for scrolling (a synthesized touch
 * gesture does not move the page under this emulation). The sampler reads
 * layout on every frame, so its frame times are for comparing two runs on
 * the same machine, not for quoting.
 *
 *   node scripts/check-home-landing-r9.mjs [label] [modes] [url]
 *   modes: shift,fling,webkit,joins,header,hero,profile (default: all)
 * Writes out-<label>.json and shots/ under the current directory.
 */
import fs from "node:fs"
import { chromium, webkit, devices } from "playwright"

fs.mkdirSync("shots", { recursive: true })
const label = process.argv[2] || "run"
const modes = (process.argv[3] || "shift,fling,webkit,joins,header,hero,profile").split(",")
const URL = process.argv[4] || "http://localhost:3000/"
const out = {}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const save = () => fs.writeFileSync(`out-${label}.json`, JSON.stringify(out, null, 1))
const INIT = () => {
  window.__ls = []; window.__lt = []
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__ls.push({ v: +e.value.toFixed(5), t: Math.round(e.startTime), y: Math.round(scrollY), src: (e.sources || []).slice(0, 3).map((s) => { const n = s.node; if (!n || !n.closest) return '?'; const sec = n.closest('[data-lazy-section]'); return (sec ? sec.getAttribute('data-lazy-section') + ':' : '') + (n.tagName || '') + '.' + String(n.className && n.className.baseVal !== undefined ? n.className.baseVal : n.className).slice(0, 40) + ' ' + Math.round(s.previousRect.y) + '->' + Math.round(s.currentRect.y) + ' h' + Math.round(s.previousRect.height) + '->' + Math.round(s.currentRect.height) }) }) }).observe({ type: 'layout-shift', buffered: true }) } catch {}
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push({ d: Math.round(e.duration), t: Math.round(e.startTime), y: Math.round(scrollY) }) }).observe({ type: 'longtask', buffered: true }) } catch {}
}
const SAMPLER = () => {
  const docTop = (el) => { let y = 0; for (let e = el; e; e = e.offsetParent) y += e.offsetTop; return y }
  window.__s = { frames: [], jumps: [], blank: {}, prev: new Map(), last: performance.now(), on: true, vis: {}, vprev: new Map() }
  const tick = () => {
    if (!window.__s.on) return
    const now = performance.now(); window.__s.frames.push(Math.round((now - window.__s.last) * 10) / 10); window.__s.last = now
    const vh = innerHeight, y = scrollY
    for (const h of document.querySelectorAll('.story-heading,.ev-h,.cmh-h,.fcta-title')) {
      const r = h.getBoundingClientRect(); if (r.bottom < 0 || r.top > vh || !r.width) continue
      const key = (h.textContent || '').slice(0, 24)
      const top = docTop(h), p = window.__s.prev.get(h)
      if (p !== undefined && Math.abs(p - top) > 0.5) window.__s.jumps.push({ key, from: p, to: top, y: Math.round(y), vh })
      window.__s.prev.set(h, top)
      // what the eye sees: the heading's place on the page, transforms included
      if (!h.hasAttribute('data-story-showcase')) {
        const abs = Math.round((r.top + y) * 10) / 10, vp = window.__s.vprev.get(h)
        if (vp !== undefined && Math.abs(vp - abs) > 0.3) { const m = (window.__s.vis[key] = window.__s.vis[key] || { n: 0, sum: 0, max: 0 }); m.n++; m.sum = +(m.sum + Math.abs(abs - vp)).toFixed(1); m.max = Math.max(m.max, +Math.abs(abs - vp).toFixed(1)) }
        window.__s.vprev.set(h, abs)
      }
    }
    for (const b of document.querySelectorAll('[data-lazy-section]')) {
      const r = b.getBoundingClientRect(); if (r.bottom < 40 || r.top > vh - 40) continue
      const n = b.getAttribute('data-lazy-section')
      if (!b.hasAttribute('data-lazy-mounted') && !b.firstElementChild) window.__s.blank[n + ':unmounted'] = (window.__s.blank[n + ':unmounted'] || 0) + 1
    }
    for (const w of document.querySelectorAll('[data-reveal="wait"]')) {
      const r = w.getBoundingClientRect(); if (!r.width || r.bottom < 0.15 * vh || r.top > vh * 0.7) continue
      const k = 'wait:' + String(w.className).slice(0, 30); window.__s.blank[k] = (window.__s.blank[k] || 0) + 1
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}
const summary = async (page) => page.evaluate(() => {
  const f = window.__s.frames.slice(2); const s = [...f].sort((a, b) => a - b)
  return { cls: +window.__ls.reduce((a, e) => a + e.v, 0).toFixed(4), shifts: window.__ls.filter((e) => e.v > 0.0005).slice(0, 25), nshift: window.__ls.length, longtasks: window.__lt.length, ltTotal: window.__lt.reduce((a, e) => a + e.d, 0), ltWorst: window.__lt.slice().sort((a, b) => b.d - a.d).slice(0, 8), frames: f.length, over25: f.filter((x) => x > 25).length, over50: f.filter((x) => x > 50).length, p95: s[Math.floor(s.length * 0.95)], max: s[s.length - 1], jumps: window.__s.jumps.slice(0, 30), njumps: window.__s.jumps.length, blank: window.__s.blank, visualMoves: window.__s.vis, docH: document.documentElement.scrollHeight }
})
const calm = async (page) => { try { const b = page.getByRole('button', { name: 'Reject all' }); if (await b.count()) { await b.first().click({ timeout: 2000 }); await sleep(300) } } catch {} }
const step = async (name, fn) => { const t = Date.now(); try { await fn() } catch (e) { out[name + 'Error'] = String(e && e.stack || e).slice(0, 600) } console.log(`[${label}] ${name} ${((Date.now() - t) / 1000).toFixed(0)}s`); save() }

async function run() {
  const browser = await chromium.launch()
  // warm every chunk once (dev compiles on demand), so timings are of the page, not of the compiler
  await step('warm', async () => {
    const ctx = await browser.newContext({ ...devices['iPhone 13'] }); const page = await ctx.newPage()
    await page.goto(URL, { waitUntil: 'load' }); await sleep(3000); await calm(page)
    for (let i = 0; i < 40; i++) { await page.mouse.wheel(0, 900); await sleep(250) }
    await sleep(3000)
    out.warm = await page.evaluate(() => [...document.querySelectorAll('[data-lazy-section]')].map((b) => b.getAttribute('data-lazy-section') + (b.hasAttribute('data-lazy-mounted') || b.firstElementChild ? '' : ':EMPTY')))
    await ctx.close()
  })
  if (modes.includes('shift')) await step('shift', async () => {
    const ctx = await browser.newContext({ ...devices['iPhone 13'] }); const page = await ctx.newPage(); const cdp = await ctx.newCDPSession(page)
    await page.addInitScript(INIT)
    await page.goto(URL, { waitUntil: 'load' }); await sleep(4500); await calm(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    await page.evaluate(() => { window.__ls.length = 0; window.__lt.length = 0 })
    await page.evaluate(SAMPLER)
    let big = false
    for (let i = 1; i <= 90; i++) {
      await cdp.send('Input.synthesizeScrollGesture', { x: 195, y: 300, yDistance: -600, speed: 1400, gestureSourceType: 'mouse' })
      if (i % 4 === 0) { big = !big; await page.setViewportSize({ width: 390, height: big ? 750 : 664 }) }
      if (await page.evaluate(() => scrollY + innerHeight >= document.documentElement.scrollHeight - 4)) break
    }
    await sleep(600)
    out.shift = await summary(page); out.shift.endY = await page.evaluate(() => Math.round(scrollY))
    // real heights against the placeholders, for the lead
    out.heights = await page.evaluate(() => [...document.querySelectorAll('[data-lazy-section]')].map((b) => { const inner = b.firstElementChild; return { n: b.getAttribute('data-lazy-section'), box: Math.round(b.getBoundingClientRect().height), cis: b.style.containIntrinsicSize.slice(0, 40) } }))
    await ctx.close()
  })
  if (modes.includes('fling')) await step('fling', async () => {
    const ctx = await browser.newContext({ ...devices['iPhone 13'] }); const page = await ctx.newPage(); const cdp = await ctx.newCDPSession(page)
    await page.addInitScript(INIT)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    await page.goto(URL, { waitUntil: 'load' }); await sleep(1200); await calm(page)
    await page.evaluate(() => { window.__ls.length = 0; window.__lt.length = 0 })
    await page.evaluate(SAMPLER)
    const shots = []
    for (let i = 0; i < 10; i++) {
      const g = cdp.send('Input.synthesizeScrollGesture', { x: 195, y: 300, yDistance: -3200, speed: 6000, gestureSourceType: 'mouse' })
      await sleep(330)
      const p = `shots/${label}-fling-${i}.png`; await page.screenshot({ path: p }).catch(() => {}); shots.push(p)
      await g
    }
    await sleep(500)
    out.fling = await summary(page); out.fling.shots = shots; out.fling.endY = await page.evaluate(() => Math.round(scrollY))
    out.fling.stuck = await page.evaluate(() => [...document.querySelectorAll('[data-reveal="wait"]')].filter((e) => { const r = e.getBoundingClientRect(); return r.height > 0 && r.bottom < 0 }).map((e) => String(e.className).slice(0, 30)))
    await ctx.close()
  })
  if (modes.includes('header')) await step('header', async () => {
    const res = {}
    for (const [name, opts] of [['phone', devices['iPhone 13']], ['desktop', { viewport: { width: 1440, height: 900 } }]]) {
      const ctx = await browser.newContext(opts); const page = await ctx.newPage()
      await page.goto(URL, { waitUntil: 'load' }); await sleep(2500); await calm(page)
      const read = () => page.evaluate(() => { const h = document.querySelector('#platform-header-root'); const b = [...h.querySelectorAll('[data-home-phone-start],[data-guest-signup]')].find((e) => e.getBoundingClientRect().width > 0); const cs = b ? getComputedStyle(b) : null; return { cta: h.getAttribute('data-home-cta'), h: +h.getBoundingClientRect().height.toFixed(2), op: cs ? cs.opacity : null, vis: cs ? cs.visibility : null, y: Math.round(scrollY), w: b ? Math.round(b.getBoundingClientRect().width) : 0 } })
      const marks = await page.evaluate(() => { const c = document.querySelector('[data-home-hero] .cinematic-actions').getBoundingClientRect(); const s = document.querySelector('[data-build-showcase]').getBoundingClientRect(); return { ctaBottom: Math.round(c.bottom + scrollY), showcaseBottom: Math.round(s.bottom + scrollY) } })
      const seq = { marks, top: await read() }
      await page.evaluate((y) => window.scrollTo(0, y), marks.ctaBottom + 40); await sleep(900); seq.pastHeroButtons = await read()
      await page.evaluate((y) => window.scrollTo(0, y), marks.showcaseBottom - 140); await sleep(900); seq.showcaseFootStillOnScreen = await read()
      await page.evaluate((y) => window.scrollTo(0, y), marks.showcaseBottom + 10); await sleep(120)
      const mid = []; for (let i = 0; i < 8; i++) { mid.push(await read()); await sleep(80) }
      seq.fade = mid.map((m) => m.op + '@' + m.h); await sleep(700); seq.pastShowcase = await read()
      await page.screenshot({ path: `shots/${label}-header-${name}-shown.png`, clip: { x: 0, y: 0, width: opts.viewport.width, height: 110 } })
      await page.evaluate((y) => window.scrollTo(0, y), marks.showcaseBottom - 300); await sleep(900); seq.backUp = await read()
      res[name] = seq
      await ctx.close()
    }
    out.header = res
  })
  if (modes.includes('joins')) await step('joins', async () => {
    const res = {}
    for (const [name, opts] of [['390', devices['iPhone 13']], ['1440', { viewport: { width: 1440, height: 900 } }]]) {
      const ctx = await browser.newContext({ ...opts, reducedMotion: 'no-preference' }); const page = await ctx.newPage()
      await page.goto(URL, { waitUntil: 'load' }); await sleep(2000); await calm(page)
      // mount everything
      const H = await page.evaluate(() => document.documentElement.scrollHeight)
      for (let y = 0; y < H + 3000; y += 700) { await page.evaluate((yy) => window.scrollTo(0, yy), y); await sleep(140) }
      await sleep(2500)
      const order = await page.evaluate(() => [...document.querySelectorAll('[data-sheet],[data-sheet-backdrop]')].map((b) => ({ kind: b.hasAttribute('data-sheet') ? b.getAttribute('data-sheet') : 'dark', rise: b.hasAttribute('data-sheet-rise'), top: Math.round(b.getBoundingClientRect().top + scrollY), h: Math.round(b.getBoundingClientRect().height), sections: [...b.querySelectorAll('[data-lazy-section],[data-home-hero],[data-build-showcase],.fcta')].map((s) => s.getAttribute('data-lazy-section') || (s.hasAttribute('data-home-hero') ? 'hero' : s.hasAttribute('data-build-showcase') ? 'showcase' : 'final-cta')) })))
      res[name] = { order: order.map((o) => `${o.kind}${o.rise ? '(rise)' : ''}: ${o.sections.join(', ')} [${o.h}px]`), joins: [] }
      const vh = opts.viewport.height
      for (let i = 1; i < order.length; i++) {
        // put the join where the lower block has settled: its top a third down the screen (past the purple's rise)
        const blockTop = await page.evaluate((i) => { const b = document.querySelectorAll('[data-sheet],[data-sheet-backdrop]')[i]; return b.getBoundingClientRect().top + scrollY }, i)
        await page.evaluate((y) => window.scrollTo(0, y), Math.max(0, blockTop - vh * 0.3)); await sleep(700)
        const j = await page.evaluate((i) => {
          const b = document.querySelectorAll('[data-sheet],[data-sheet-backdrop]')[i]; const r = b.getBoundingClientRect(); const cs = getComputedStyle(b); const prev = b.previousElementSibling; const before = getComputedStyle(b, '::before')
          // colours at the corner: just outside the rounded corner (the fillet) and inside the block
          return { top: Math.round(r.top), radius: cs.borderTopLeftRadius, above: cs.getPropertyValue('--srp-above').trim(), prevBg: getComputedStyle(prev).backgroundColor, filletH: before.height, prevBottom: Math.round(prev.getBoundingClientRect().bottom - r.top) }
        }, i)
        const p = `shots/${label}-join-${name}-${i}-${order[i - 1].kind}-to-${order[i].kind}.png`
        const y0 = Math.max(0, Math.round(vh * 0.3) - 130)
        await page.screenshot({ path: p, clip: { x: 0, y: y0, width: opts.viewport.width, height: 260 } })
        res[name].joins.push({ ...j, shot: p, from: order[i - 1].kind, to: order[i].kind })
      }
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await sleep(800)
      await page.screenshot({ path: `shots/${label}-end-${name}.png` })
      // the whole page, small, to see the order
      await page.evaluate(() => window.scrollTo(0, 0)); await sleep(300)
      await ctx.close()
    }
    out.joins = res
  })
  if (modes.includes('profile')) await step('profile', async () => {
    const ctx = await browser.newContext({ ...devices['iPhone 13'] }); const page = await ctx.newPage(); const cdp = await ctx.newCDPSession(page)
    await page.addInitScript(INIT)
    await page.goto(URL, { waitUntil: 'load' }); await sleep(2500); await calm(page)
    const H = await page.evaluate(() => document.documentElement.scrollHeight)
    for (let y = 0; y < H + 3000; y += 600) { await page.evaluate((yy) => window.scrollTo(0, yy), y); await sleep(160) }
    await sleep(3000)
    await page.evaluate(() => window.scrollTo(0, 0)); await sleep(800)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    const secs = await page.evaluate(() => [...document.querySelectorAll('[data-home-hero],[data-build-showcase],[data-lazy-section],.fcta')].map((s) => ({ n: s.getAttribute('data-lazy-section') || (s.hasAttribute('data-home-hero') ? 'hero' : s.hasAttribute('data-build-showcase') ? 'showcase' : 'final-cta'), top: Math.round(s.getBoundingClientRect().top + scrollY), h: Math.round(s.getBoundingClientRect().height) })))
    const prof = []
    for (const s of secs) {
      await page.evaluate((y) => window.scrollTo(0, y), Math.max(0, s.top - 844)); await sleep(500)
      await page.evaluate(() => { window.__s = { frames: [], on: true, last: performance.now() }; const tick = () => { if (!window.__s.on) return; const n = performance.now(); window.__s.frames.push(n - window.__s.last); window.__s.last = n; requestAnimationFrame(tick) }; requestAnimationFrame(tick); window.__lt.length = 0 })
      const events = []
      const onData = (d) => { for (const e of d.value) if (e.ph === 'X' && e.dur > 300) events.push(e) }
      cdp.on('Tracing.dataCollected', onData)
      await cdp.send('Tracing.start', { transferMode: 'ReportEvents', traceConfig: { includedCategories: ['devtools.timeline', 'disabled-by-default-devtools.timeline'] } })
      const dist = Math.min(s.h + 844, 6000)
      await cdp.send('Input.synthesizeScrollGesture', { x: 195, y: 300, yDistance: -dist, speed: 1600, gestureSourceType: 'mouse' })
      const endY = await page.evaluate(() => { window.__s.on = false; return Math.round(scrollY) })
      const done = new Promise((r) => cdp.once('Tracing.tracingComplete', r))
      await cdp.send('Tracing.end'); await done; await sleep(400)
      cdp.off('Tracing.dataCollected', onData)
      const by = {}
      let forced = 0, forcedMs = 0
      for (const e of events) {
        const k = e.name; const m = (by[k] = by[k] || { ms: 0, n: 0, max: 0 }); m.ms += e.dur / 1000; m.n++; m.max = Math.max(m.max, e.dur / 1000)
        if (k === 'Layout' && e.args && e.args.beginData && e.args.beginData.stackTrace && e.args.beginData.stackTrace.length) { forced++; forcedMs += e.dur / 1000 }
      }
      const pick = (k) => by[k] ? `${by[k].ms.toFixed(0)}ms/${by[k].n} max ${by[k].max.toFixed(0)}` : '0'
      const st = await page.evaluate(() => { const f = window.__s.frames.slice(2); window.__s.on = false; const vh = innerHeight; const an = document.getAnimations().filter((a) => a.playState === 'running'); let off = 0; const offNames = {}; for (const a of an) { const t = a.effect && a.effect.target; if (!t || !t.getBoundingClientRect) continue; const r = t.getBoundingClientRect(); if (r.bottom < -200 || r.top > vh + 200 || (!r.width && !r.height)) { off++; const sec = t.closest('[data-lazy-section],[data-home-hero],[data-build-showcase]'); const k = (sec ? sec.getAttribute('data-lazy-section') || 'hero/showcase' : '?') + ' ' + (a.animationName || a.transitionProperty || 'waapi'); offNames[k] = (offNames[k] || 0) + 1 } } return { frames: f.length, over25: f.filter((x) => x > 25).length, over50: f.filter((x) => x > 50).length, max: Math.max(0, ...f), lt: window.__lt.length, ltMs: window.__lt.reduce((a, e) => a + e.d, 0), running: an.length, runningOff: off, offNames } })
      prof.push({ n: s.n, h: s.h, scrolled: endY - Math.max(0, s.top - 844), frames: st.frames, over25: st.over25, over50: st.over50, maxFrame: Math.round(st.max), longtasks: st.lt, longtaskMs: st.ltMs, layout: pick('Layout'), forcedLayouts: `${forced} (${forcedMs.toFixed(0)}ms)`, style: pick('UpdateLayoutTree'), paint: pick('Paint'), prePaint: pick('PrePaint'), layerize: pick('Layerize'), commit: pick('Commit'), script: pick('FunctionCall'), raf: pick('FireAnimationFrame'), timers: pick('TimerFire'), events: pick('EventDispatch'), animationsRunning: st.running, runningOffScreen: st.runningOff, offNames: st.offNames })
    }
    // layers with everything mounted, at the top of the page (what sits composited while off screen)
    out.profile = prof
    await ctx.close()
  })
  await browser.close()
  if (modes.includes('webkit')) await step('webkit', async () => {
    const wb = await webkit.launch()
    const ctx = await wb.newContext({ ...devices['iPhone 13'] }); const page = await ctx.newPage()
    await page.addInitScript(INIT)
    await page.goto(URL, { waitUntil: 'load' }); await sleep(5000); await calm(page)
    const res = { supportsTimeline: await page.evaluate(() => CSS.supports('animation-timeline: view()')), canPlayMp4: await page.evaluate(() => document.createElement('video').canPlayType('video/mp4; codecs="avc1.640028"')) }
    await page.evaluate(SAMPLER)
    const total = await page.evaluate(() => document.documentElement.scrollHeight)
    let big = false
    for (let y = 0, i = 0; y < total; y += 110, i++) {
      await page.evaluate((yy) => window.scrollTo(0, yy), y); await sleep(70)
      if (i % 30 === 29) { big = !big; await page.setViewportSize({ width: 390, height: big ? 750 : 664 }) }
      if (i === 60) await page.screenshot({ path: `shots/${label}-webkit-mid.png` })
    }
    await sleep(2500)
    const s = await summary(page)
    res.headings = await page.evaluate(() => [...document.querySelectorAll('.story-heading')].map((h) => ({ k: (h.textContent || '').slice(0, 18), js: h.hasAttribute('data-story-js'), inked: h.hasAttribute('data-story-inked'), tf: getComputedStyle(h).transform, lastWord: getComputedStyle(h.querySelector('[data-story-word]:last-of-type') || h).color })).slice(0, 30))
    out.webkit = { ...res, jumps: s.jumps, njumps: s.njumps, blank: s.blank, over25: s.over25, frames: s.frames, visualMoves: s.visualMoves }
    await wb.close()
  })
  if (modes.includes('hero')) await step('hero', async () => {
    const res = {}
    for (const [engine, launcher] of [['chromium', chromium], ['webkit', webkit]]) {
      const b = await launcher.launch()
      for (const [name, opts] of [['phone', devices['iPhone 13']], ['desktop', { viewport: { width: 1440, height: 900 } }]]) {
        const ctx = await b.newContext(opts); const page = await ctx.newPage()
        const reqs = []
        page.on('request', (r) => { if (/marketing\/hero\/cinematic|supabase\.co/.test(r.url())) reqs.push(r.url().replace(/^https?:\/\/[^/]+/, '').slice(0, 60)) })
        const t0 = Date.now()
        await page.goto(URL, { waitUntil: 'commit' })
        const film = []
        for (let i = 0; i < 14; i++) {
          const st = await page.evaluate(() => { const img = document.querySelector('.cinematic-poster'); const v = document.querySelector('.cinematic-video'); return img ? { poster: (img.currentSrc || '').split('/').pop(), posterDone: img.complete && img.naturalWidth > 0, vsrc: (v.currentSrc || '').split('/').pop().slice(0, 28), ready: v.dataset.ready, rs: v.readyState, t: +v.currentTime.toFixed(2), paused: v.paused, err: v.error ? v.error.code : 0 } : null }).catch(() => null)
          film.push({ ms: Date.now() - t0, ...(st || {}) })
          if (i === 1 || i === 4 || i === 13) await page.screenshot({ path: `shots/${label}-hero-${engine}-${name}-${i}.png` }).catch(() => {})
          await sleep(i < 6 ? 150 : 500)
        }
        res[`${engine}-${name}`] = { firstPosterDoneMs: (film.find((f) => f.posterDone) || {}).ms, firstReadyMs: (film.find((f) => f.ready === 'true') || {}).ms, last: film[film.length - 1], requests: [...new Set(reqs)], preload: await page.evaluate(() => [...document.querySelectorAll('head link[rel=preload][as=image]')].map((l) => l.getAttribute('href') + ' | ' + l.media + ' | ' + l.getAttribute('fetchpriority'))) }
        await ctx.close()
      }
      await b.close()
    }
    out.hero = res
  })
  save()
}
run().then(() => { console.log(JSON.stringify(out, null, 1).slice(0, 30000)) }).catch((e) => { console.error(e); save(); process.exit(1) })
