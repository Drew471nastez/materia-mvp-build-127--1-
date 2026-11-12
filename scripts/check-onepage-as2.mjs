/**
 * ROUND AS2: THE CORNER BUTTONS AND THE LEGAL SHEETS, MEASURED.
 *
 *   corner   the editor's phone at 1440 (scripts/render-onepage-editor.tsx): the
 *            Subscribe bell and Share inside the rounded screen. Gap from each
 *            button's outer edge to the screen's curve, and how much of the bell's
 *            dot is inside the screen (sampled on a grid; 100% = never clipped).
 *            The live page at 390 with a notch and status bar (the safe area set
 *            through the DevTools protocol where the browser has it): the bell's
 *            top below the inset.
 *   legal    the live page (scripts/render-onepage-ar1.tsx) at 390 with touch and
 *            at 1440: Privacy opened from the footer (tap to first moving frame,
 *            to settled), Terms and Cookies pills pressed in turn (the panel's
 *            height every frame: largest step; frames over 25ms; the thumb's
 *            frames in between; whether the old text ever shows at a new place),
 *            Escape and Back close it (time to gone), Tab stays inside.
 *   cookies  a switch pressed: the consent cookie written; reloaded, the switch
 *            reads the same.
 *   report   sent empty: a note per field and the focus on the first; filled:
 *            the request's body, the thanks shown, the sheet's height unchanged.
 *
 *   ROOT=<checkout> CHROMIUM=... SHOTS=<dir> node scripts/check-onepage-as2.mjs
 *   REPORT=1 prints without failing.
 */
import puppeteer from "puppeteer-core"
import { existsSync, mkdirSync } from "node:fs"
import { join } from "node:path"

const root = process.env.ROOT || process.cwd()
const { serveEditorProbe } = await import(join(root, "scripts/onepage-probe-server.mjs"))
const report = !!process.env.REPORT
const shots = process.env.SHOTS || null
const only = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null
if (shots) mkdirSync(shots, { recursive: true })
const chromium = process.env.CHROMIUM || ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium"].find((p) => existsSync(p))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const failures = []
const check = (ok, message) => {
  if (!ok) failures.push(message)
  console.log(`${ok ? "ok  " : "FAIL"} ${message}`)
}
const record = (k, v) => console.log(`   ${k}: ${JSON.stringify(v)}`)
const want = (k) => !only || only.has(k)
const vp390 = { width: 390, height: 844 }
const vp1440 = { width: 1440, height: 900 }

const browser = await puppeteer.launch({ executablePath: chromium, args: ["--no-sandbox", "--disable-gpu"] })

try {
  /* ── corner: the editor's phone ─────────────────────────────────────────── */
  if (want("corner")) {
    console.log("\n── corner")
    const { base, server } = await serveEditorProbe({ root, statics: { "/images/": join(root, "public/images") } })
    try {
      const p = await browser.newPage()
      p.on("pageerror", (e) => console.log("   pageerror", String(e).slice(0, 200)))
      await p.setViewport({ ...vp1440, deviceScaleFactor: 2 })
      /*
        The harness's editor reads no profile, so the page it posts has no seller and the bell is not drawn. A real
        editor's page has one (image 140). Every page posted to the frame gets one here, as the editor's would.
      */
      await p.evaluateOnNewDocument(() => {
        if (window === top) return
        const add = window.addEventListener.bind(window)
        window.addEventListener = function (type, fn, opts) {
          if (type !== "message" || typeof fn !== "function") return add(type, fn, opts)
          return add(type, (e) => {
            const d = e.data
            if (d && d.channel === "storelib-onepage-preview" && d.kind === "page" && d.page && !d.page.seller_id) return fn({ data: { ...d, page: { ...d.page, seller_id: "seller_probe" } }, origin: e.origin, source: e.source })
            return fn(e)
          }, opts)
        }
      })
      await p.goto(`${base}/app/onepage#links`, { waitUntil: "domcontentloaded" })
      await p.waitForSelector("[data-onepage-phone] iframe", { timeout: 20000 })
      const f = await (await p.$("[data-onepage-phone] iframe")).contentFrame()
      await f.waitForSelector("[data-op-block]", { timeout: 20000 })
      await f.waitForSelector("[data-onepage-bell]", { timeout: 8000 }).catch(() => null)
      await sleep(900)
      const m = await p.evaluate(() => {
        const fr = document.querySelector("[data-onepage-phone] iframe")
        const screen = [...fr.closest("[data-onepage-phone]").children].find((c) => c.querySelector("iframe"))
        const sr = screen.getBoundingClientRect()
        const R = parseFloat(getComputedStyle(screen).borderTopRightRadius)
        const fb = fr.getBoundingClientRect()
        const z = parseFloat(getComputedStyle(fr).zoom) || 1
        const doc = fr.contentDocument
        const toOuter = (r) => ({ left: fb.left + r.left * z, top: fb.top + r.top * z, right: fb.left + r.right * z, bottom: fb.top + r.bottom * z })
        const bell = doc.querySelector("[data-onepage-bell]")
        const share = doc.querySelector("[data-onepage-share-button]")
        const dot = bell?.querySelector("span.rounded-full")
        /* Inside the screen's rounded rect? */
        const inside = (x, y) => {
          if (x < sr.left || x > sr.right || y < sr.top || y > sr.bottom) return false
          const cx = x < sr.left + R ? sr.left + R : x > sr.right - R ? sr.right - R : x
          const cy = y < sr.top + R ? sr.top + R : y > sr.bottom - R ? sr.bottom - R : y
          return Math.hypot(x - cx, y - cy) <= R
        }
        /* The shortest distance from a circle (centre, radius) to the screen's top corner curve, in screen px. */
        const gapToCurve = (r, corner) => {
          const c = { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }
          const rad = (r.right - r.left) / 2
          const k = corner === "right" ? { x: sr.right - R, y: sr.top + R } : { x: sr.left + R, y: sr.top + R }
          return R - (Math.hypot(c.x - k.x, c.y - k.y) + rad)
        }
        const covered = (r) => {
          let n = 0, ins = 0
          for (let i = 0; i <= 20; i++) for (let j = 0; j <= 20; j++) {
            const x = r.left + ((r.right - r.left) * i) / 20, y = r.top + ((r.bottom - r.top) * j) / 20
            const cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2
            if (Math.hypot(x - cx, y - cy) > (r.right - r.left) / 2) continue
            n++
            if (inside(x, y)) ins++
          }
          return Math.round((ins / Math.max(1, n)) * 1000) / 10
        }
        const b = bell ? toOuter(bell.getBoundingClientRect()) : null
        const s = share ? toOuter(share.getBoundingClientRect()) : null
        const d = dot ? toOuter(dot.getBoundingClientRect()) : null
        return {
          screenRadius: R,
          zoom: z,
          bellPagePx: bell ? { top: Math.round(bell.getBoundingClientRect().top * 10) / 10, right: Math.round((doc.documentElement.clientWidth - bell.getBoundingClientRect().right) * 10) / 10 } : null,
          bellGapToCurve: b ? Math.round(gapToCurve(b, "right") * 10) / 10 : null,
          shareGapToCurve: s ? Math.round(gapToCurve(s, "left") * 10) / 10 : null,
          dotGapToCurve: d ? Math.round(gapToCurve(d, "right") * 10) / 10 : null,
          dotInside: d ? covered(d) : null,
          bellInside: b ? covered(b) : null,
          shareInside: s ? covered(s) : null,
          concentric: b ? Math.round(Math.hypot((b.left + b.right) / 2 - (sr.right - R), (b.top + b.bottom) / 2 - (sr.top + R)) * 10) / 10 : null,
        }
      })
      record("1440 editor phone", m)
      check(m.dotInside === 100 && m.bellInside === 100 && m.shareInside === 100, `1440: the bell, its dot and Share are wholly inside the rounded screen (${m.bellInside}%, ${m.dotInside}%, ${m.shareInside}%)`)
      check(m.dotGapToCurve >= 6 && m.bellGapToCurve >= 6 && m.shareGapToCurve >= 6, `1440: at least 6px from the curve (bell ${m.bellGapToCurve}, dot ${m.dotGapToCurve}, share ${m.shareGapToCurve})`)
      if (shots) {
        const r = await p.$eval("[data-onepage-phone]", (el) => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: 190 } })
        await p.screenshot({ path: join(shots, "corner-phone-1440.png"), clip: r })
      }
      await p.close()

      /* The live page at 390, as a phone with a status bar and rounded corners would draw it. */
      const q = await browser.newPage()
      await q.setViewport({ ...vp390, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
      const cdp = await q.createCDPSession()
      let insetSet = false
      try {
        await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 47, topMax: 47, left: 0, leftMax: 0, bottom: 34, bottomMax: 34, right: 0, rightMax: 0 } })
        insetSet = true
      } catch {
        insetSet = false
      }
      await q.goto(`${base}/app/onepage?live`, { waitUntil: "domcontentloaded" })
      await q.waitForSelector("[data-onepage-bell]", { timeout: 15000 }).catch(() => null)
      await sleep(900)
      const live = await q.evaluate(() => {
        const bell = document.querySelector("[data-onepage-bell]")?.getBoundingClientRect()
        const share = document.querySelector("[data-onepage-share-button]")?.getBoundingClientRect()
        const probe = document.createElement("div")
        probe.style.cssText = "position:fixed;top:env(safe-area-inset-top,0px)"
        document.body.appendChild(probe)
        const inset = parseFloat(getComputedStyle(probe).top)
        probe.remove()
        return { inset, bellTop: bell ? Math.round(bell.top) : null, bellRight: bell ? Math.round(innerWidth - bell.right) : null, shareTop: share ? Math.round(share.top) : null, shareLeft: share ? Math.round(share.left) : null }
      })
      record(`390 live page (safe area emulated: ${insetSet})`, live)
      if (live.inset > 0) check(live.bellTop >= live.inset + 8 && live.shareTop >= live.inset + 8, `390: with a ${live.inset}px status bar both buttons start 8px under it (bell ${live.bellTop}, share ${live.shareTop})`)
      else check(live.bellTop === 16 && live.bellRight === 16 && live.shareTop === 16 && live.shareLeft === 16, `390 in a browser (no inset): the buttons keep 16px (${JSON.stringify(live)})`)
      if (shots) await q.screenshot({ path: join(shots, "corner-live-390.png"), clip: { x: 0, y: 0, width: 390, height: 160 } })
      await q.close()
    } finally {
      server.close()
    }
  }

  /* ── legal, cookies, report: the live page ──────────────────────────────── */
  if (want("legal") || want("cookies") || want("report")) {
    const { base, server } = await serveEditorProbe({ root, entry: "scripts/render-onepage-ar1.tsx", statics: { "/images/": join(root, "public/images") } })
    const live = async (vp, touch) => {
      const page = await browser.newPage()
      page.on("pageerror", (e) => console.log("   pageerror", String(e).slice(0, 200)))
      await page.setViewport({ ...vp, deviceScaleFactor: 1, isMobile: touch, hasTouch: touch })
      await page.setRequestInterception(true)
      page.__sent = []
      page.on("request", (r) => {
        const u = new URL(r.url())
        if (u.pathname === "/api/help/contact") {
          page.__sent.push(JSON.parse(r.postData() || "{}"))
          return void setTimeout(() => r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) }).catch(() => {}), 150)
        }
        if (u.hostname !== "127.0.0.1") return void r.respond({ status: 200, contentType: "text/html", body: "<!doctype html><body></body>" })
        void r.continue()
      })
      await page.goto(`${base}/app?live`, { waitUntil: "domcontentloaded" })
      await page.waitForSelector("[data-onepage-legal]")
      await sleep(2200)
      await page.$eval("[data-onepage-legal]", (el) => el.scrollIntoView({ block: "center" }))
      await sleep(300)
      return page
    }
    const press = async (page, sel, touch) => {
      const box = await page.$eval(sel, (el) => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
      if (touch) await page.touchscreen.tap(box.x, box.y)
      else await page.mouse.click(box.x, box.y)
    }
    /* Samples every frame from now: the panel's box, the thumb, the body's opacity and where its first heading is. */
    const startSampling = (page) =>
      page.evaluate(() => {
        window.__frames = []
        window.__sampling = true
        const tick = () => {
          const panel = document.querySelector("[data-sheet-panel], [data-onepage-dialog-panel]")
          const text = document.querySelector("[data-legal-reader], [data-cookie-choices-panel]")
          /* Before round AS there was no fading wrapper: the text itself is what shows. */
          const body = document.querySelector("[data-legal-body]") ?? text
          const thumb = document.querySelector("[data-legal-thumb]") ?? document.querySelector("[role=tablist] [aria-selected=true]")
          const scroller = text?.closest("[data-onepage-dialog-scroll], [data-sheet-scroll]")
          const r = panel?.getBoundingClientRect()
          window.__frames.push({
            t: performance.now(),
            top: r ? r.top : null,
            h: r ? r.height : null,
            op: body ? parseFloat(getComputedStyle(body).opacity) : null,
            shown: text ? text.getAttribute("data-legal-reader") || "cookies" : null,
            scroll: scroller ? scroller.scrollTop : null,
            thumb: thumb ? (thumb.hasAttribute("data-legal-thumb") ? getComputedStyle(thumb).translate : `${thumb.textContent}:${getComputedStyle(thumb).backgroundColor}`) : null,
            panelOp: panel ? parseFloat(getComputedStyle(panel).opacity) : null,
          })
          if (window.__sampling) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      })
    const stopSampling = (page) => page.evaluate(() => { window.__sampling = false; return window.__frames })
    const long = (fr) => fr.slice(1).filter((f, i) => f.t - fr[i].t > 25).length
    const worst = (fr) => Math.round(Math.max(0, ...fr.slice(1).map((f, i) => f.t - fr[i].t)))
    const settledAt = (fr, key) => {
      const last = fr[fr.length - 1][key]
      for (let i = fr.length - 1; i >= 0; i--) if (fr[i][key] === null || Math.abs(fr[i][key] - last) > 0.5) return fr[Math.min(fr.length - 1, i + 1)].t - fr[0].t
      return 0
    }

    for (const [label, vp, touch] of [["390", vp390, true], ["1440", vp1440, false]]) {
      if (want("legal")) {
        console.log(`\n── legal ${label}`)
        const page = await live(vp, touch)
        await startSampling(page)
        await press(page, "[data-onepage-legal] button:nth-child(2)", touch)
        await sleep(900)
        const open = await stopSampling(page)
        const firstMove = open.findIndex((f) => f.top !== null && (f.panelOp ?? 1) > 0.01)
        const openMs = Math.round(settledAt(open, "top"))
        record(`${label} open`, { worstFrameMs: worst(open), firstFrameMs: firstMove >= 0 ? Math.round(open[firstMove].t - open[0].t) : null, settledMs: openMs, longFrames: long(open), frames: open.length })
        check(firstMove >= 0 && open[firstMove].t - open[0].t <= 90, `${label}: Privacy moves within 90ms of the press`)
        check(long(open) === 0, `${label}: opening drops no frame (${long(open)} over 25ms)`)
        if (shots) await page.screenshot({ path: join(shots, `legal-privacy-${label}.png`) })

        /* Scroll the text a way down, so a switch that drew the new text before going back to the top would show. */
        await page.evaluate(() => { const s = document.querySelector("[data-legal-reader]").closest("[data-onepage-dialog-scroll], [data-sheet-scroll]"); s.scrollTop = 1400 })
        await sleep(200)
        for (const to of ["terms", "cookies", "privacy"]) {
          await startSampling(page)
          const tabSel = (await page.$(`[data-legal-tab=${to}]`)) ? `[data-legal-tab=${to}]` : to === "cookies" ? null : `[role=tablist] [role=tab]:nth-child(${to === "terms" ? 1 : 2})`
          if (!tabSel) continue
          await press(page, tabSel, touch)
          await sleep(700)
          const fr = await stopSampling(page)
          const steps = fr.slice(1).map((f, i) => Math.abs((f.h ?? 0) - (fr[i].h ?? 0)))
          const tops = fr.slice(1).map((f, i) => Math.abs((f.top ?? 0) - (fr[i].top ?? 0)))
          const thumbs = new Set(fr.map((f) => f.thumb)).size
          /* A frame of the new text, visible, before it went back to its top. */
          /* A frame of the new text, visible, before it went back to its top. */
          const flash = fr.some((f) => f.shown === to && (f.op ?? 0) > 0.05 && (f.scroll ?? 0) > 1)
          const swapAt = fr.findIndex((f) => f.shown === to)
          const oldOpacityAtSwap = swapAt > 0 ? Math.round((fr[swapAt - 1].op ?? 1) * 100) / 100 : null
          const r = { heightSnapPx: Math.round(Math.max(0, ...steps) * 10) / 10, topMovePx: Math.round(Math.max(0, ...tops) * 10) / 10, longFrames: long(fr), worstFrameMs: worst(fr), thumbFrames: thumbs, flashAtOldScroll: flash, oldTextOpacityLastFrame: oldOpacityAtSwap, fadeMs: Math.round((fr.find((f) => f.shown === to && f.op >= 0.99)?.t ?? fr[fr.length - 1].t) - fr[0].t) }
          record(`${label} pill to ${to}`, r)
          check(r.heightSnapPx === 0 && r.topMovePx === 0, `${label} → ${to}: 0px height snap and 0px edge move (${r.heightSnapPx}, ${r.topMovePx})`)
          check(r.longFrames === 0, `${label} → ${to}: no frame over 25ms (${r.longFrames})`)
          check(r.thumbFrames >= 4, `${label} → ${to}: the thumb slides through ${r.thumbFrames} positions`)
          check(!r.flashAtOldScroll && (r.oldTextOpacityLastFrame ?? 1) <= 0.1, `${label} → ${to}: the old text has faded (${r.oldTextOpacityLastFrame}) before the new one shows, and the new one shows at its top`)
          if (shots && to === "cookies") await page.screenshot({ path: join(shots, `legal-cookies-${label}.png`) })
          if (shots && to === "terms") await page.screenshot({ path: join(shots, `legal-terms-${label}.png`) })
        }

        /* Scrolling the text: a wheel at 1440, a finger at 390. */
        await startSampling(page)
        if (touch) {
          const box = await page.$eval("[data-legal-reader]", (el) => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: Math.min(innerHeight - 120, r.y + 300) } })
          for (let k = 0; k < 3; k++) {
            await page.touchscreen.touchStart(box.x, box.y)
            for (let i = 1; i <= 10; i++) { await page.touchscreen.touchMove(box.x, box.y - i * 30); await sleep(16) }
            await page.touchscreen.touchEnd()
            await sleep(120)
          }
        } else {
          await page.mouse.move(720, 450)
          for (let i = 0; i < 24; i++) { await page.mouse.wheel({ deltaY: 120 }); await sleep(16) }
        }
        await sleep(300)
        const sc = await stopSampling(page)
        const scrolled = (sc[sc.length - 1].scroll ?? 0) - (sc[0].scroll ?? 0)
        record(`${label} scroll`, { scrolledPx: Math.round(scrolled), longFrames: long(sc), worstFrameMs: worst(sc), frames: sc.length, sheetMovedPx: Math.round(Math.max(0, ...sc.slice(1).map((f, i) => Math.abs((f.top ?? 0) - (sc[i].top ?? 0)))) * 10) / 10 })
        check(scrolled > 200 && long(sc) === 0, `${label}: the text scrolls (${Math.round(scrolled)}px) with no frame over 25ms (${long(sc)})`)

        /* Tab goes round inside. */
        const tabs = []
        for (let i = 0; i < 14; i++) {
          await page.keyboard.press("Tab")
          tabs.push(await page.evaluate(() => !!document.activeElement?.closest("[data-sheet-panel], [data-onepage-dialog-panel]")))
        }
        check(tabs.every(Boolean), `${label}: Tab stays inside the sheet (${tabs.filter(Boolean).length}/14)`)

        /* Escape closes. */
        await startSampling(page)
        await page.keyboard.press("Escape")
        await sleep(700)
        const esc = await stopSampling(page)
        const goneAt = esc.findIndex((f) => f.top === null)
        record(`${label} Escape`, { goneMs: goneAt >= 0 ? Math.round(esc[goneAt].t - esc[0].t) : null, longFrames: long(esc) })
        check(goneAt >= 0 && long(esc) === 0, `${label}: Escape closes it smoothly (${goneAt >= 0 ? Math.round(esc[goneAt].t - esc[0].t) : "never"}ms, ${long(esc)} long frames)`)
        const histAfterEsc = await page.evaluate(() => history.state && history.state.onepageLegal)
        check(!histAfterEsc, `${label}: closed by Escape, it leaves no entry of its own behind`)

        /* Back closes. */
        await press(page, "[data-onepage-legal] button:nth-child(3)", touch)
        await sleep(700)
        await startSampling(page)
        await page.evaluate(() => history.back())
        await sleep(800)
        const back = await stopSampling(page)
        const backGone = back.findIndex((f) => f.top === null)
        const url = await page.evaluate(() => location.pathname + location.search)
        record(`${label} Back`, { goneMs: backGone >= 0 ? Math.round(back[backGone].t - back[0].t) : null, longFrames: long(back), url })
        check(backGone >= 0 && url === "/app?live", `${label}: Back closes it and stays on the page`)
        await page.close()
      }

      if (want("cookies")) {
        console.log(`\n── cookies ${label}`)
        const page = await live(vp, touch)
        await press(page, "[data-onepage-legal] button:nth-child(1)", touch)
        await page.waitForSelector("[data-cookie-category=analytics] [role=switch]", { timeout: 4000 })
        await sleep(600)
        const before = await page.$eval("[data-cookie-category=analytics] [role=switch]", (el) => el.getAttribute("aria-checked"))
        await startSampling(page)
        await press(page, "[data-cookie-category=analytics] [role=switch]", touch)
        await sleep(400)
        const fr = await stopSampling(page)
        const cookie = await page.evaluate(() => document.cookie)
        const after = await page.$eval("[data-cookie-category=analytics] [role=switch]", (el) => el.getAttribute("aria-checked"))
        await page.reload({ waitUntil: "domcontentloaded" })
        await page.waitForSelector("[data-onepage-legal]")
        await sleep(2200)
        await page.$eval("[data-onepage-legal]", (el) => el.scrollIntoView({ block: "center" }))
        await sleep(200)
        await press(page, "[data-onepage-legal] button:nth-child(1)", touch)
        await page.waitForSelector("[data-cookie-category=analytics] [role=switch]", { timeout: 4000 })
        await sleep(500)
        const reloaded = await page.$eval("[data-cookie-category=analytics] [role=switch]", (el) => el.getAttribute("aria-checked"))
        record(`${label} analytics switch`, { before, after, reloaded, cookieWritten: /storelib_consent=/.test(cookie), longFrames: long(fr) })
        check(after !== before && reloaded === after && /storelib_consent=/.test(cookie), `${label}: a switch saves as pressed and reads the same after a reload`)
        await page.close()
      }

      if (want("report")) {
        console.log(`\n── report ${label}`)
        const page = await live(vp, touch)
        await press(page, "[data-onepage-report-link]", touch)
        await page.waitForSelector("[data-onepage-report] button[type=submit]", { timeout: 4000 })
        await sleep(600)
        const h0 = await page.$eval("[data-sheet-panel], [data-onepage-dialog-panel]", (el) => el.getBoundingClientRect().height)
        await press(page, "[data-onepage-report] button[type=submit]", touch)
        await sleep(200)
        const empty = await page.evaluate(() => ({ notes: document.querySelectorAll("[data-onepage-report] [id$=-note]").length, focus: document.activeElement?.getAttribute("role") || document.activeElement?.tagName }))
        if (shots) await page.screenshot({ path: join(shots, `report-errors-${label}.png`) })
        await press(page, "[data-report-kind=copied]", touch)
        await page.type("[data-onepage-report] input[type=email]", "ana@example.com")
        await page.type("[data-onepage-report] textarea", "These prints are mine, taken from my shop.")
        const h1 = await page.$eval("[data-sheet-panel], [data-onepage-dialog-panel]", (el) => el.getBoundingClientRect().height)
        await startSampling(page)
        await press(page, "[data-onepage-report] button[type=submit]", touch)
        await page.waitForSelector("[data-onepage-report][data-sent]", { timeout: 4000 }).catch(() => null)
        await sleep(700)
        const fr = await stopSampling(page)
        const h2 = await page.$eval("[data-sheet-panel], [data-onepage-dialog-panel]", (el) => el.getBoundingClientRect().height)
        const thanks = await page.evaluate(() => { const s = document.querySelector("[data-onepage-report] [role=status]"); return s ? { text: s.textContent.slice(0, 60), op: getComputedStyle(s).opacity } : null })
        const sent = page.__sent[0] || null
        record(`${label} report`, { emptyNotes: empty.notes, firstFocus: empty.focus, heights: [Math.round(h0), Math.round(h1), Math.round(h2)], sent, thanks, longFrames: long(fr) })
        check(empty.notes === 3 && empty.focus === "radiogroup", `${label}: sent empty, three notes and the focus on what is wrong`)
        check(!!sent && sent.reason === "report" && /Stolen or copied work/.test(sent.message) && /\/app\?live/.test(sent.link), `${label}: the report goes to the team with the page's address`)
        check(thanks && thanks.op === "1" && Math.abs(h2 - h1) < 0.5, `${label}: the thanks shows in the same place, the sheet ${Math.round(h1)} → ${Math.round(h2)}px`)
        if (shots) await page.screenshot({ path: join(shots, `report-sent-${label}.png`) })
        await page.close()
      }
    }
    server.close()
  }
} finally {
  await browser.close()
}

console.log(`\n${failures.length ? `${failures.length} failed` : "all passed"}`)
if (failures.length && !report) process.exit(1)
