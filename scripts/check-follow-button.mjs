/**
 * ===========================================================================
 *  FOLLOW / FOLLOWING, MEASURED FRAME BY FRAME
 * ===========================================================================
 * The real block (scripts/render-follow-button.tsx: components/profile/
 * profile-social.tsx with components/profile/follow-button.tsx) on a plain
 * profile, a light creator scheme (Sage) and a dark one (Astrid), with a
 * mouse at 1440x900 and a finger at 390x844, the CPU slowed four times:
 *
 *   THE PRESS      pointerdown -> the first frame that shows it (the face's
 *                  pressed shade and its scale starting down)
 *   THE SWITCH     click -> the first frame of the crossfade; no frame over
 *                  20ms while it runs; the button's width and Message's
 *                  place never change; both labels end where they should
 *   NO UNFOLLOW    a pointer over Following leaves it saying Following (a
 *                  shade, nothing else); there is no Unfollow anywhere
 *   TAPS SETTLE    five quick presses are one request (follow), four are
 *                  none; a press while a request is out waits for it, never
 *                  two at once; a refusal puts the button and count back
 *   THE FINGER     touch-action manipulation (no double tap zoom), 40px
 *                  tall, the native shell's 72% press dim does not reach it
 *   REDUCED MOTION the switch lands on the next frame, the face never scales
 *
 *   PROBE_CSS=source node scripts/check-follow-button.mjs
 * Screenshots, and a slowed filmstrip of each switch, go to SHOTS_DIR.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const css = await appCss(root)
const stubs = join(root, ".follow-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-follow-")), "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const frames = (p, n = 2) => p.evaluate((n) => new Promise((r) => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f) }), n)

/* In the page: one sample per frame of everything the switch could move. */
const SAMPLER = () => {
  const btn = document.querySelector("[data-follow-button]")
  const face = btn.querySelector("[data-follow-face]")
  const fillFollow = btn.querySelector("[data-follow-fill=follow]")
  const fillFollowing = btn.querySelector("[data-follow-fill=following]")
  const lFollow = btn.querySelector("[data-follow-label=follow]")
  const lFollowing = btn.querySelector("[data-follow-label=following]")
  const msg = document.querySelector("[data-profile-message]")
  const events = []
  /* When the page's own handler ran (performance.now in a capture listener), not the event's stamp: a frame's rAF time is when the frame began, which can be before an event that frame still shows. */
  for (const type of ["pointerdown", "pointerup", "click"]) document.addEventListener(type, () => events.push({ type, t: performance.now() }), { capture: true })
  const samples = []
  let on = true
  const tick = (frame) => {
    /* The frame's own time for the gaps between frames; when this callback ran for ordering against the events. */
    const t = performance.now()
    const r = btn.getBoundingClientRect()
    const m = msg?.getBoundingClientRect()
    samples.push({
      t,
      frame,
      scale: Number(getComputedStyle(face).scale === "none" ? 1 : getComputedStyle(face).scale),
      fillFollow: Number(getComputedStyle(fillFollow).opacity),
      fillFollowing: Number(getComputedStyle(fillFollowing).opacity),
      bgFollow: getComputedStyle(fillFollow).backgroundColor,
      bgFollowing: getComputedStyle(fillFollowing).backgroundColor,
      lFollow: Number(getComputedStyle(lFollow).opacity),
      lFollowing: Number(getComputedStyle(lFollowing).opacity),
      w: Math.round(r.width * 100) / 100,
      x: Math.round(r.left * 100) / 100,
      mx: m ? Math.round(m.left * 100) / 100 : null,
      state: btn.getAttribute("data-follow-button"),
    })
    if (on) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  window.__probe = { samples, events, stop: () => { on = false } }
}

try {
  writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => location.pathname\nexport const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, back() {}, refresh() {} })\nexport const useSearchParams = () => new URLSearchParams("")\n`)
  writeFileSync(
    join(stubs, "link.jsx"),
    `import React from "react"\nexport default React.forwardRef(function Link({ href, children, prefetch, replace, scroll, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); e.preventDefault() } }, children) })\n`,
  )
  writeFileSync(join(stubs, "image.jsx"), `import React from "react"\nexport default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, ...rest }) }\n`)
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-follow-button.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.follow-probe/navigation.js", "next/link": "./.follow-probe/link.jsx", "next/image": "./.follow-probe/image.jsx" },
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    loader: { ".css": "empty" },
    outfile: join(stubs, "app.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  writeFileSync(
    join(stubs, "index.html"),
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`,
  )
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--hide-scrollbars", "--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4"] })
  const touchBrowser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--hide-scrollbars"] })

  const open = async (b, vp, which, { reduce = false, capacitor = false } = {}) => {
    const p = await b.newPage()
    await p.setViewport(vp)
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
    if (reduce) await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
    await p.goto(`file://${join(stubs, "index.html")}?${which}`, { waitUntil: "load" })
    if (capacitor) await p.evaluate(() => document.documentElement.classList.add("capacitor"))
    await frames(p, 3)
    const cdp = await p.createCDPSession()
    return { p, errors, cdp }
  }
  const centre = (p) => p.evaluate(() => { const r = document.querySelector("[data-follow-button]").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
  const touch = (cdp, type, pt) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x: pt.x, y: pt.y }] })

  /* One press and release, sampled frame by frame. */
  const pressAndSwitch = async (p, cdp, finger) => {
    const pt = await centre(p)
    if (!finger) await p.mouse.move(pt.x, pt.y)
    await frames(p, 2)
    await p.evaluate(SAMPLER)
    await frames(p, 3)
    if (finger) await touch(cdp, "touchStart", pt)
    else await p.mouse.down()
    await wait(140)
    if (finger) await touch(cdp, "touchEnd", pt)
    else await p.mouse.up()
    await wait(520)
    return p.evaluate(() => { window.__probe.stop(); return { samples: window.__probe.samples, events: window.__probe.events } })
  }
  const analyse = ({ samples, events }) => {
    const down = events.find((e) => e.type === "pointerdown")
    const click = events.find((e) => e.type === "click")
    const rest = samples.find((s) => s.t < down.t) ?? samples[0]
    const afterDown = samples.filter((s) => s.t >= down.t)
    const restBg = rest.state === "following" ? rest.bgFollowing : rest.bgFollow
    const iPress = afterDown.findIndex((s) => (s.state === "following" ? s.bgFollowing : s.bgFollow) !== restBg || s.scale < 1)
    const afterClick = click ? samples.filter((s) => s.t >= click.t) : []
    const iSwitch = afterClick.findIndex((s) => Math.abs(s.lFollow - rest.lFollow) > 0.001 || Math.abs(s.lFollowing - rest.lFollowing) > 0.001)
    const span = samples.filter((s) => s.t >= down.t - 20 && s.t <= (click ? click.t : down.t) + 360)
    const gaps = span.slice(1).map((s, i) => s.frame - span[i].frame)
    const worst = gaps.indexOf(Math.max(...gaps))
    const last = samples[samples.length - 1]
    return {
      pressFrames: iPress + 1,
      pressMs: iPress >= 0 ? Math.max(0, Math.round(afterDown[iPress].t - down.t)) : null,
      minScale: Math.min(...afterDown.map((s) => s.scale)),
      switchFrames: iSwitch + 1,
      switchMs: iSwitch >= 0 ? Math.max(0, Math.round(afterClick[iSwitch].t - click.t)) : null,
      maxGap: Math.round(Math.max(...gaps) * 10) / 10,
      /* Where the longest frame fell, from the press: after the click or before it. */
      worstAt: worst >= 0 ? Math.round(span[worst + 1].t - (click ? click.t : down.t)) : null,
      frames: gaps.length,
      widths: [...new Set(samples.map((s) => s.w))],
      xs: [...new Set(samples.map((s) => s.x))],
      mxs: [...new Set(samples.map((s) => s.mx))],
      mid: afterClick.slice(2, 8).map((s) => [Math.round(s.lFollow * 100) / 100, Math.round(s.lFollowing * 100) / 100]),
      end: { state: last.state, lFollow: last.lFollow, lFollowing: last.lFollowing, fillFollow: last.fillFollow, fillFollowing: last.fillFollowing, scale: last.scale },
      clicked: !!click,
    }
  }

  const CASES = [
    ["desktop-1440", { width: 1440, height: 900 }, browser, false],
    ["touch-390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, touchBrowser, true],
  ]
  for (const [label, vp, b, finger] of CASES) {
    for (const which of ["platform", "sage", "astrid"]) {
      console.log(`\n${label}: ${which}, CPU slowed 4x`)
      const { p, errors, cdp } = await open(b, vp, which, { capacitor: finger })
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
      const clip = await p.evaluate(() => { const r = document.querySelector("[data-profile-social]").getBoundingClientRect(); return { x: Math.max(0, r.left - 24), y: Math.max(0, r.top - 16), width: Math.min(innerWidth, r.width + 48), height: r.height + 40 } })
      await p.screenshot({ path: join(shots, `${label}-${which}-1-follow.png`), clip })
      const shape = await p.evaluate(() => {
        const b = document.querySelector("[data-follow-button]")
        const cs = getComputedStyle(b)
        const r = b.getBoundingClientRect()
        return { h: Math.round(r.height), w: Math.round(r.width), touchAction: cs.touchAction, unfollow: !!document.querySelector("[data-follow-label=unfollow]") || /Unfollow/.test(document.body.innerText) }
      })
      expect(shape.h >= 40 && shape.touchAction === "manipulation" && !shape.unfollow, "40px tall, no double tap zoom, no Unfollow anywhere", shape)

      /* Follow -> Following, then back, three times over: the first run of anything is the slowest, so every one counts. */
      const runs = []
      for (let i = 0; i < 3; i++) {
        runs.push(analyse(await pressAndSwitch(p, cdp, finger)), analyse(await pressAndSwitch(p, cdp, finger)))
        await wait(400)
      }
      console.log(`  info  six switches: press frame ${runs.map((r) => r.pressFrames).join("/")}, switch frame ${runs.map((r) => r.switchFrames).join("/")} (${runs.map((r) => r.switchMs).join("/")}ms), longest frame ${runs.map((r) => r.maxGap).join("/")}ms`)
      expect(runs.every((r) => r.pressFrames === 1 && r.switchFrames === 1 && r.maxGap <= 20 && r.widths.length === 1 && r.widths[0] === runs[0].widths[0]), "  all six: the press and the switch on the first frame, no frame over 20ms, one width", runs.map((r) => [r.pressFrames, r.switchFrames, r.maxGap, r.widths]))
      await p.evaluate(() => { window.__followLog.length = 0 })
      const a = analyse(await pressAndSwitch(p, cdp, finger))
      console.log(`  info  press: frame ${a.pressFrames} (${a.pressMs}ms), switch: frame ${a.switchFrames} (${a.switchMs}ms), longest frame ${a.maxGap}ms (${a.worstAt}ms from the click) over ${a.frames} frames, crossfade ${JSON.stringify(a.mid)}`)
      expect(a.pressFrames === 1 && a.minScale < 1 && a.minScale >= 0.955, "pointerdown shows on the first frame after it (shade, then the face sinks to 0.96)", { frames: a.pressFrames, ms: a.pressMs, minScale: a.minScale })
      expect(a.clicked && a.switchFrames === 1, "the click starts the crossfade on the first frame after it", { frames: a.switchFrames, ms: a.switchMs })
      expect(a.maxGap <= 20, "no frame over 20ms from the press to the end of the switch", a.maxGap)
      expect(a.widths.length === 1 && a.xs.length === 1 && a.mxs.length === 1, "the button's width and place, and Message's, never change", { w: a.widths, x: a.xs, m: a.mxs })
      expect(a.mid.some(([f, g]) => f > 0.02 && f < 0.98 && g > 0.02 && g < 0.98), "the labels crossfade (both part visible mid way), not a cut", a.mid)
      expect(a.end.state === "following" && a.end.lFollow === 0 && a.end.lFollowing === 1 && a.end.fillFollowing === 1 && a.end.fillFollow === 0 && a.end.scale === 1, "it lands on Following, at full size", a.end)
      await p.screenshot({ path: join(shots, `${label}-${which}-2-following.png`), clip })

      /* No Unfollow: a pointer over Following is a shade, nothing else. */
      if (!finger) {
        const look = () => p.evaluate(() => ({ text: document.querySelector("[data-follow-button]").innerText.replace(/\s+/g, " ").trim(), bg: getComputedStyle(document.querySelector("[data-follow-fill=following]")).backgroundColor, w: document.querySelector("[data-follow-button]").getBoundingClientRect().width, labelOpacity: getComputedStyle(document.querySelector("[data-follow-label=following]")).opacity }))
        await p.mouse.move(2, 2)
        await wait(250)
        const off = await look()
        const pt = await centre(p)
        await p.mouse.move(pt.x, pt.y)
        await wait(250)
        const over = await look()
        expect(over.text === "Following" && over.labelOpacity === "1" && over.w === off.w, "hovering Following still says Following, at the same width", { off, over })
        expect(over.bg !== off.bg, "  with only a slight hover shade", { off: off.bg, over: over.bg })
        await p.screenshot({ path: join(shots, `${label}-${which}-3-following-hover.png`), clip })
      }

      /* Following -> Follow: the same switch the other way. */
      const back = analyse(await pressAndSwitch(p, cdp, finger))
      console.log(`  info  back: press frame ${back.pressFrames} (${back.pressMs}ms), switch frame ${back.switchFrames} (${back.switchMs}ms), longest frame ${back.maxGap}ms`)
      expect(back.pressFrames === 1 && back.switchFrames === 1 && back.maxGap <= 20 && back.widths.length === 1 && back.end.state === "follow" && back.end.lFollow === 1 && back.end.lFollowing === 0, "pressing Following goes straight back to Follow, as smoothly", { press: back.pressFrames, sw: back.switchFrames, gap: back.maxGap, w: back.widths, end: back.end })
      if (finger) {
        const dim = await p.evaluate(() => getComputedStyle(document.querySelector("[data-follow-button]")).opacity)
        expect(dim === "1", "in the native shell the 72% press dim does not reach it", dim)
      }
      await wait(400)
      const reqs = await p.evaluate(() => window.__followLog.map((r) => r.follow))
      expect(reqs.join() === "true,false", "one request each way, after the presses", reqs)
      expect(errors.length === 0, "no errors", errors)
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })

      /* A filmstrip of the switch at a tenth of its speed, to look at. */
      if (which !== "platform" || !finger) {
        await cdp.send("Animation.enable")
        await cdp.send("Animation.setPlaybackRate", { playbackRate: 0.1 })
        const pt = await centre(p)
        if (finger) await touch(cdp, "touchStart", pt)
        else { await p.mouse.move(pt.x, pt.y); await p.mouse.down() }
        await wait(400)
        await p.screenshot({ path: join(shots, `${label}-${which}-film-0-pressed.png`), clip })
        if (finger) await touch(cdp, "touchEnd", pt)
        else await p.mouse.up()
        for (const [i, ms] of [[1, 450], [2, 500], [3, 600]]) {
          await wait(ms)
          await p.screenshot({ path: join(shots, `${label}-${which}-film-${i}.png`), clip })
        }
        await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 })
      }
      await p.close()
    }
  }

  console.log("\ndesktop-1440: taps settle to the last one")
  {
    const { p, errors } = await open(browser, CASES[0][1], "sage")
    const quick = async (n) => { for (let i = 0; i < n; i++) { await p.click("[data-follow-button]"); await wait(40) } }
    await quick(5)
    const mid = await p.evaluate(() => ({ state: document.querySelector("[data-follow-button]").getAttribute("data-follow-button"), sent: window.__followLog.length, n: document.querySelector("[data-profile-count=followers] [data-profile-count-value]").textContent }))
    await wait(700)
    const five = await p.evaluate(() => ({ state: document.querySelector("[data-follow-button]").getAttribute("data-follow-button"), log: window.__followLog.map((r) => r.follow), n: document.querySelector("[data-profile-count=followers] [data-profile-count-value]").textContent }))
    expect(mid.state === "following" && mid.sent === 0 && five.state === "following" && five.log.join() === "true", "five quick presses: Following at once, one follow request after they stop", { mid, five })
    await quick(4)
    await wait(700)
    const four = await p.evaluate(() => ({ state: document.querySelector("[data-follow-button]").getAttribute("data-follow-button"), log: window.__followLog.map((r) => r.follow) }))
    expect(four.state === "following" && four.log.join() === "true", "four more: back where it was, nothing sent", four)

    /* A press while a request is out: one at a time, the last press wins. */
    await p.evaluate(() => { window.__follow.delay = 600; window.__followLog.length = 0; window.__maxInFlight = 0 })
    await p.click("[data-follow-button]")
    await wait(420)
    await quick(3)
    await wait(1900)
    const flying = await p.evaluate(() => ({ state: document.querySelector("[data-follow-button]").getAttribute("data-follow-button"), log: window.__followLog.map((r) => r.follow), max: window.__maxInFlight }))
    expect(flying.state === "following" && flying.log.join() === "false,true" && flying.max === 1, "a press while one is out waits for it: never two at once, the last press wins", flying)

    /* Refused: the button and the count go back. */
    await p.evaluate(() => { window.__follow.delay = 80; window.__follow.fail = true })
    const n0 = await p.evaluate(() => document.querySelector("[data-profile-count=followers] [data-profile-count-value]").textContent)
    await p.click("[data-follow-button]")
    await frames(p, 2)
    const optimistic = await p.evaluate(() => ({ state: document.querySelector("[data-follow-button]").getAttribute("data-follow-button"), n: document.querySelector("[data-profile-count=followers] [data-profile-count-value]").textContent }))
    await wait(700)
    const rolled = await p.evaluate(() => ({ state: document.querySelector("[data-follow-button]").getAttribute("data-follow-button"), n: document.querySelector("[data-profile-count=followers] [data-profile-count-value]").textContent, error: document.querySelector("[data-profile-social] [role=alert]")?.textContent ?? null }))
    expect(optimistic.state === "follow" && rolled.state === "following" && rolled.n === n0 && !!rolled.error, "refused: Follow at once, then back to Following and the count it had, with a line saying so", { n0, optimistic, rolled })
    expect(errors.length === 0, "no errors", errors)
    await p.close()
  }

  console.log("\ntouch-390: reduced motion")
  {
    const { p, errors, cdp } = await open(touchBrowser, CASES[1][1], "astrid", { reduce: true })
    const a = analyse(await pressAndSwitch(p, cdp, true))
    expect(a.minScale === 1, "the face never scales", a.minScale)
    expect(a.switchFrames === 1 && a.mid.every(([f, g]) => (f === 0 || f === 1) && (g === 0 || g === 1)) && a.end.state === "following", "the switch lands on the next frame, no crossfade", { frames: a.switchFrames, mid: a.mid })
    expect(errors.length === 0, "no errors", errors)
    await p.close()
  }

  await browser.close()
  await touchBrowser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
console.log(`\nshots: ${shots}`)
if (broken) {
  console.log(`${broken} failed`)
  process.exit(1)
}
console.log("all passed")
