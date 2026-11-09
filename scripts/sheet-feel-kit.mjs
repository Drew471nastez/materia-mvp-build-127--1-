/**
 * ===========================================================================
 *  ONE SHEET, EVERY CLAIM: THE FEEL OF QUICK ACCESS, AS NUMBERS
 * ===========================================================================
 * What scripts/check-onepage-sheets.mjs and
 * scripts/check-builder-phone-sheets.mjs read of every sheet they open, so
 * each new sheet is held to the same list:
 *
 *   SHARED      it is the shared sheet (`data-app-sheet`, `data-sheet-panel`)
 *               named for what it is, and no Radix dialog is drawn with it
 *   RISES       the first frame it exists it is below the screen, it only
 *               ever rises, and it comes to rest at 0
 *   FOLLOWS     every step of a drag from the grabber, the panel is where the
 *               finger put it, within two pixels (two frames is the most a
 *               finger can be ahead of what is painted)
 *   SPRINGS     a slow short pull let go springs back to rest
 *   GIVES       a pull up gives on a rubber band, never past 80px, and it
 *               comes back to rest
 *   HANDS OFF   (with `list`) a pull down on its list, at the list's top,
 *               moves the sheet rather than nothing
 *   FLICKS      a quick short flick closes it
 *   CLOSES      a close button in it (`data-sheet-close`) slides it out
 *
 * Real touch events, through the page's CDP session.
 */
import { join } from "node:path"

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* Where the panel is this frame, running animation included; null when there is no sheet. */
const panelY = (p) => p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => {
  /* The open one: a sheet that opens another (a step after a step) is still leaving under it. */
  const el = document.querySelector('[data-app-sheet="open"] [data-sheet-panel]') || document.querySelector("[data-app-sheet] [data-sheet-panel]")
  r(el ? new DOMMatrixReadOnly(getComputedStyle(el).transform).m42 : null)
}))))

/* Every frame of the panel from now for `ms`, into window.__frames. */
const record = (p, ms) => p.evaluate((ms) => {
  const frames = (window.__frames = [])
  const els = (window.__frameEls = [])
  const t0 = performance.now()
  const tick = () => {
    const el = document.querySelector('[data-app-sheet="open"] [data-sheet-panel]') || document.querySelector("[data-app-sheet] [data-sheet-panel]")
    /* Which panel each frame is of, so a sheet opened from another is read on its own. */
    if (el && !els.includes(el)) els.push(el)
    if (el) frames.push({ y: new DOMMatrixReadOnly(getComputedStyle(el).transform).m42, h: el.offsetHeight, el: els.indexOf(el) })
    if (performance.now() - t0 < ms) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}, ms)

/*
  STAMPED WHEN THE FINGER WAS THERE (round 12). A phone stamps each touch
  when the finger made it; a probe's touch was stamped when it reached the
  page, so on a CPU slowed four times the lift of a quick flick arrived a
  hundred milliseconds after the last move and read as a finger that had
  stopped (the sheet rightly sprang back). Each event now carries the time a
  finger at this pace made it: a step every `pauseMs`, 8ms for a flick.
*/
async function drag(s, from, dy, { steps = 8, pauseMs = 40, measure = false } = {}) {
  let lag = 0
  const t0 = Date.now() / 1000
  const at = (k) => t0 + (k * Math.max(pauseMs, 8)) / 1000
  await s.cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: from.x, y: from.y }], timestamp: at(0) })
  for (let k = 1; k <= steps; k++) {
    await s.cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: from.x, y: from.y + (dy * k) / steps }], timestamp: at(k) })
    if (pauseMs) await sleep(pauseMs)
    /* From the second step: Chromium keeps its own 15px touch slop to itself. */
    if (measure && k >= 2) lag = Math.max(lag, Math.abs((await panelY(s.p)) - (dy * k) / steps))
  }
  await s.cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [], timestamp: at(steps) + 0.004 })
  return lag
}
const grabber = (p) => p.evaluate(() => {
  const r = (document.querySelector('[data-app-sheet="open"] [data-sheet-handle]') || document.querySelector("[data-app-sheet] [data-sheet-handle]")).getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + 6 }
})

/**
 * One sheet, every claim, on a page already open at a phone's size with
 * touch (`s` is { p, cdp }: the page and a CDP session on it). `opener` is a
 * script that opens it in the page and says whether it found its button;
 * `label` is what the sheet is called; `list` (optional) is a selector for a
 * list in it that should hand a pull down at its top to the sheet.
 */
export async function readSheet(s, { name, label, opener, list, expect }) {
  const { p } = s
  const openIt = async () => {
    await record(p, 1300)
    const found = await p.evaluate(opener)
    await sleep(750)
    return found
  }
  const found = await openIt()
  expect(found, "its button is on the page")
  if (!found) return
  if (process.env.SHOTS) await p.screenshot({ path: join(process.env.SHOTS, `${name.replace(/\W+/g, "-").toLowerCase()}.png`) })
  const seen = await p.evaluate(() => {
    const root = document.querySelector("[data-app-sheet]")
    return {
      label: root?.getAttribute("aria-label") ?? null,
      state: root?.getAttribute("data-app-sheet") ?? null,
      panel: !!root?.querySelector("[data-sheet-panel]"),
      radix: !!document.querySelector("[data-slot=dialog-content]"),
    }
  })
  expect(seen.state === "open" && seen.panel && seen.label === label && !seen.radix, `it is the shared sheet, "${label}", and no dialog is drawn with it`, seen)
  /* The frames of the sheet that is open now (a step opened from another sheet: not the one it replaced). */
  const frames = await p.evaluate(() => {
    const open = document.querySelector('[data-app-sheet="open"] [data-sheet-panel]')
    const k = window.__frameEls.indexOf(open)
    return window.__frames.filter((f) => k < 0 || f.el === k)
  })
  const first = frames[0]
  const backwards = frames.slice(1).filter((f, i) => f.y > frames[i].y + 0.5).length
  const rest = await panelY(p)
  expect(!!first && first.y >= first.h * 0.9 && backwards === 0 && Math.abs(rest) < 0.5,
    "it rises from below the screen, only ever up, and comes to rest", { first: first && Math.round(first.y), h: first?.h, backwards, rest })

  const g = await grabber(p)
  /* Round 12: a page that counts React's commits (window.__commits) shows the drag makes none: the finger moves a transform, not a render. */
  const commitsBefore = await p.evaluate(() => window.__commits ?? null)
  const dragStart = Date.now()
  /*
    SLOW MEANS SLOW (round AQ). 15px every 60ms is 0.25 px/ms, exactly the
    speed a release counts as a flick (VELOCITY_THRESHOLD in
    components/website-builder/sheet-gestures.ts), so a millisecond of jitter
    in a stamp made this "slow" pull a flick that closed the sheet, and the
    next step crashed reading a sheet that was gone. 15px every 100ms is 0.15.
  */
  const lag = await drag(s, g, 120, { steps: 8, pauseMs: 100, measure: true })
  const dragMs = Date.now() - dragStart
  let commitsDuring = commitsBefore === null ? null : (await p.evaluate(() => window.__commits)) - commitsBefore
  /* What the page commits on its own over as long, the finger still (a timer, a load): not the drag's. */
  if (commitsDuring !== null && commitsDuring > 1) {
    await sleep(700)
    const idle0 = await p.evaluate(() => window.__commits)
    await sleep(dragMs)
    commitsDuring -= (await p.evaluate(() => window.__commits)) - idle0
  }
  await sleep(700)
  expect(lag <= 2, "a drag from the grabber: the panel is where the finger put it, within 2px", Math.round(lag * 10) / 10)
  if (commitsDuring !== null) expect(commitsDuring <= 1, "the drag renders nothing in React (at most one commit, on the lift)", commitsDuring)
  /* A sheet that closed is not one at rest: panelY is null then, and Math.abs(null) is 0. */
  const settled = await panelY(p)
  expect(settled !== null && Math.abs(settled) < 0.5, "a slow short pull let go springs back to rest", settled)
  if (settled === null) return

  /* The rubber band is read off the frames: the lowest the panel went while the finger pulled it up. */
  await record(p, 900)
  await drag(s, g, -220, { steps: 8, pauseMs: 30 })
  const up = await p.evaluate(() => Math.min(...window.__frames.map((f) => f.y)))
  await sleep(700)
  const back = await panelY(p)
  expect(up < -1 && up >= -80.5 && back !== null && Math.abs(back) < 0.5, "a pull up gives, never past 80px, and comes back", Math.round(up))
  if (back === null) return

  if (list) {
    const box = await p.evaluate((sel) => {
      const el = document.querySelector(`[data-app-sheet] ${sel}`)
      if (!el) return null
      el.scrollTop = 0
      const r = el.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + 40, scrolls: el.scrollHeight > el.clientHeight + 1 }
    }, list)
    if (!box) expect(false, "its list is there")
    else {
      await record(p, 900)
      await drag(s, box, 90, { steps: 6, pauseMs: 40 })
      const moved = await p.evaluate(() => Math.max(...window.__frames.map((f) => f.y)))
      await sleep(700)
      expect(moved > 40, "a pull down on its list, at the list's top, moves the sheet", { moved: Math.round(moved), listScrolls: box.scrolls })
      if ((await panelY(p)) === null) await openIt()
    }
  }

  const g2 = await grabber(p)
  await drag(s, g2, 110, { steps: 4, pauseMs: 0 })
  /* Gone within the close and a slowed phone's frames: polled, not one fixed wait. */
  let gone = false
  for (let t = 0; t < 1600 && !gone; t += 100) {
    await sleep(100)
    gone = await p.evaluate(() => !document.querySelector("[data-app-sheet]"))
  }
  expect(gone, "a quick flick closes it")

  /* A close button in it hands the close to the sheet (data-sheet-close): it slides out, over more than five frames. */
  await openIt()
  const closer = await p.evaluate(() => {
    const b = document.querySelector("[data-app-sheet] [data-sheet-close]")
    if (!b) return null
    const r = b.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })
  if (closer) {
    await record(p, 700)
    await p.touchscreen.tap(closer.x, closer.y)
    await sleep(800)
    const slid = await p.evaluate(() => window.__frames.filter((f) => f.y > 1).length)
    const shut = await p.evaluate(() => !document.querySelector("[data-app-sheet]"))
    expect(shut && slid > 5, "its close button slides it out", { frames: slid, closed: shut })
  }
}
