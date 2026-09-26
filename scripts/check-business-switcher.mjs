/**
 * ===========================================================================
 *  THE BUSINESS SWITCHER AND THE NEW BUSINESS SCREEN, MEASURED
 * ===========================================================================
 * The real components (scripts/render-business-switcher.tsx):
 *
 *   MENU     the business you are in is one row with its @handle and an up
 *            and down chevron, and nothing else shows until it is tapped: no
 *            "Businesses" label, no second row. A tap opens the list in
 *            place. Three businesses: the other two and New business under
 *            them, the same slim line as at one or at two, and not a word
 *            about the limit anywhere in the menu; two: the other one and New
 *            business under it; one business: New business alone. The same
 *            signed in to a business that is not the first (member-two,
 *            member-three). A second tap folds it away, and what is folded
 *            cannot be reached by Tab. Rows are 44px in the dropdown and 52px
 *            in the phone sheet, New business 36px and 44px, and nothing
 *            overflows
 *   LIMIT    with three already, a press on New business says so then and
 *            there, on the menu's one alert line (lib/businesses/rules
 *            LIMIT_REACHED), and asks the server nothing. The owner: "I don't
 *            want to show that text ... when I click create, it should show
 *            that, just only"
 *   PLUS     on every business, whatever the count: a "+" square on the row
 *            just left of the chevron, 28px in the dropdown, 30px in the
 *            sheet, centred on the row, clear of the name and the chevron,
 *            and part of the row's press. A press on it opens the list and
 *            makes nothing: "the plus should NOT redirect me to a new
 *            business directly"
 *   CREATE   a press on New business in the open list puts the plain white
 *            screen up at once, "Setting up
 *            your new business" under the spinner, fading in on opacity;
 *            the rows under it keep their size and their words, with no
 *            spinner of their own. The server's yes moves the line to
 *            "Opening your new business"; a refusal takes the screen away
 *            and the menu says why, and the menu can be pressed again
 *   SETUP    the setup page's screen (NewBusinessScreen) puts that spinner
 *            and that line at the very same pixels, so the reload between
 *            them shows nothing, and when the setup opens they fade out
 *            while the white stays
 *
 *   PROBE_CSS=source node scripts/check-business-switcher.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const css = await appCss(root)
const work = join(root, ".business-probe")
mkdirSync(work, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-business-")), "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => { console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`); if (!ok) broken++ }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

try {
  /*
    Creating a business is a request and a reload; here it is recorded and
    answers only when the probe says: window.__opening() is the server's yes
    (the session held, the setup about to be asked for), window.__refuse(m)
    a refusal with the server's sentence.
  */
  writeFileSync(join(work, "switch-client.js"), `export const SWITCH_FAILED = "That business could not be opened. Try again."\nexport const switchBusiness = () => new Promise(() => {})\nexport const createBusiness = (steps = {}) => { window.__created = (window.__created || 0) + 1; return new Promise((_, reject) => { window.__opening = () => steps.onOpening && steps.onOpening(); window.__refuse = (m) => reject(new Error(m)) }) }\n`)
  writeFileSync(join(work, "navigation.js"), `export const useRouter = () => ({ push: (h) => (window.__pushed = h), replace() {}, refresh() {}, prefetch() {}, back() {} })\nexport const usePathname = () => "/app"\nexport const useSearchParams = () => new URLSearchParams()\n`)
  execFileSync("npx", ["esbuild", "scripts/render-business-switcher.tsx", "--bundle", "--format=iife", "--jsx=automatic", '--define:process.env.NODE_ENV="production"', "--alias:@=.", "--banner:js=var process={env:{NODE_ENV:'production'}};", `--alias:next/navigation=./.business-probe/navigation.js`, `--alias:@/lib/businesses/switch-client=./.business-probe/switch-client.js`, `--outfile=${join(work, "app.js")}`, "--log-level=error"], { cwd: root, stdio: "inherit" })
  const js = readFileSync(join(work, "app.js"), "utf8")
  writeFileSync(join(work, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`)
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })

  console.log("\nthe menus")
  const p = await browser.newPage()
  const errors = []
  p.on("pageerror", (e) => errors.push(e.message))
  await p.setViewport({ width: 1440, height: 900 })
  await p.goto(`file://${join(work, "index.html")}?view=menus`)
  await sleep(300)
  /* What a person can see of each menu: rows with a height, inside a list that is open. */
  const read = (sel) => p.$eval(sel, (el) => {
    const seen = (r) => { const b = r.getBoundingClientRect(); return b.height > 1 && !r.closest("[inert]") }
    const add = el.querySelector("[data-business-new]")
    return {
      rows: [...el.querySelectorAll("[data-business-row]")].filter(seen).map((r) => ({ kind: r.getAttribute("data-business-row"), text: r.textContent.trim(), h: Math.round(r.getBoundingClientRect().height), current: r.getAttribute("aria-current") === "true", chevron: !!r.querySelector("[aria-label='Switch business'], [aria-label='Hide businesses']"), expanded: r.getAttribute("aria-expanded") })),
      add: !!add && seen(add) && add.textContent.trim() === "New business",
      addH: add ? Math.round(add.getBoundingClientRect().height) : 0,
      h: Math.round(el.getBoundingClientRect().height),
      label: el.textContent.includes("Businesses"),
      text: el.textContent,
      over: el.scrollWidth - el.clientWidth,
    }
  })
  const toggle = async (sel) => { await p.evaluate((s) => document.querySelector(`${s} [data-business-row=current]`).click(), sel); await sleep(400) }

  await p.screenshot({ path: join(shots, "business-menus-folded-1440.png") })
  /* The folded rows up close, at twice the pixels, to look at the plus itself. */
  await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 })
  await sleep(150)
  await p.screenshot({ path: join(shots, "business-rows-folded-closeup.png"), clip: { x: 0, y: 0, width: 1440, height: 140 } })
  await p.setViewport({ width: 1440, height: 900 })
  await sleep(150)
  /* Each fixture: how many businesses the login has, and whose handle the row you are in shows. */
  const CASES = { one: [1, "@andrewrullz"], two: [2, "@andrewrullz"], three: [3, "@andrewrullz"], "member-three": [3, "@lindstudio"], "member-two": [2, "@lindstudio"] }
  const LIMIT = "You already have three businesses, the most one login can have."
  for (const [sel, rowH, addH] of ["dropdown", "sheet"].flatMap((v) => Object.keys(CASES).map((n) => [`[data-probe=${v}-${n}]`, v === "sheet" ? 52 : 44, v === "sheet" ? 44 : 36]))) {
    const [count, handle] = CASES[/-([a-z-]+)\]$/.exec(sel)[1].replace(/^(dropdown|sheet)-/, "")]
    const room = count < 3
    const folded = await read(sel)
    expect(folded.rows.length === 1 && folded.rows[0].current && folded.rows[0].text.includes(handle) && folded.rows[0].chevron && folded.rows[0].expanded === "false" && !folded.add && !folded.label,
      `${sel}: one row, the business you are in with its handle and a chevron, and no label`, folded)
    expect(folded.rows[0].h >= rowH && folded.over <= 0, `${sel}: a ${rowH}px row, nothing overflows`, folded.rows[0].h)
    const tabbable = await p.evaluate((s) => [...document.querySelectorAll(`${s} button`)].filter((b) => !b.closest("[inert]")).map((b) => b.getAttribute("aria-label") || b.getAttribute("data-business-row")), sel)
    expect(tabbable.join() === "current", `${sel}: folded, Tab reaches the row only: the plus is part of it`, tabbable)
    /* The plus: on every business, whatever the count; where it sits, how big it is, and what a press on it is. */
    const plus = await p.evaluate((s) => {
      const el = document.querySelector(`${s} [data-business-add]`)
      if (!el) return null
      const rowEl = document.querySelector(`${s} [data-business-row=current]`)
      const row = rowEl.getBoundingClientRect()
      const chev = document.querySelector(`${s} [data-business-row=current] svg[aria-label]`).getBoundingClientRect()
      const name = document.querySelector(`${s} [data-business-row=current] .truncate`)
      const range = document.createRange(); range.selectNodeContents(name)
      const text = range.getBoundingClientRect()
      const b = el.getBoundingClientRect()
      const cx = b.left + b.width / 2, cy = b.top + b.height / 2
      const cs = getComputedStyle(el)
      return { w: Math.round(b.width), h: Math.round(b.height), centred: Math.abs(cy - (row.top + row.height / 2)) <= 0.5, gapToChevron: Math.round(chev.left - b.right), gapToName: Math.round(b.left - text.right), inRow: rowEl.contains(el), hit: document.elementFromPoint(cx, cy)?.closest("[data-business-row]") === rowEl, hidden: el.getAttribute("aria-hidden"), shadow: cs.boxShadow, border: cs.borderTopWidth }
    }, sel)
    const size = sel.includes("sheet") ? 30 : 28
    expect(!!plus && plus.w === size && plus.h === size && plus.centred && plus.inRow && plus.hit && plus.hidden === "true",
      `${sel}: a ${size}px plus on the row, centred, part of the row's press${room ? "" : ", with three businesses too"}`, plus)
    expect(!!plus && plus.gapToChevron >= 8 && plus.gapToName >= 8 && plus.border === "1px" && /inset/.test(plus.shadow),
      `${sel}: left of the chevron, clear of the name, with a hairline and the icon buttons' depth`, plus && { gapToChevron: plus.gapToChevron, gapToName: plus.gapToName, border: plus.border })
    /* A press on the plus opens the list, and makes nothing. */
    const createdBefore = await p.evaluate(() => window.__created ?? 0)
    await p.evaluate((s) => document.querySelector(`${s} [data-business-add]`).click(), sel)
    await sleep(400)
    const open = await read(sel)
    const createdAfter = await p.evaluate(() => window.__created ?? 0)
    const limit = await p.evaluate((s) => { const el = document.querySelector(`${s} [data-business-limit]`); return el && !el.closest("[inert]") ? { text: el.textContent.trim(), button: el.tagName === "BUTTON" || !!el.querySelector("button"), h: Math.round(el.getBoundingClientRect().height) } : null }, sel)
    expect(open.rows[0].expanded === "true" && createdAfter === createdBefore, `${sel}: the plus opens the list and makes no business`, { expanded: open.rows[0].expanded, created: createdAfter - createdBefore })
    const others = open.rows.filter((r) => !r.current)
    if (count === 3) {
      expect(open.rows.length === 3 && others.length === 2 && open.add && !limit && !open.text.includes(LIMIT) && open.addH >= addH && open.addH < rowH,
        `${sel}: open, the other two businesses and New business under them, with nothing about the limit anywhere in the menu`,
        { rows: open.rows.map((r) => r.text), add: open.add, limit })
    } else if (count === 2) {
      expect(open.rows.length === 2 && others.length === 1 && open.add && !limit && open.addH >= addH && open.addH < rowH,
        `${sel}: open, the other business, and New business under it`, { rows: open.rows.map((r) => r.text), add: open.add })
    } else {
      expect(open.rows.length === 1 && open.add && !limit && open.addH >= addH && open.addH < rowH, `${sel}: open, New business under it, a slim ${addH}px line`, { rows: open.rows.length, add: open.add, addH: open.addH })
    }
    expect(open.rows.every((r) => r.h >= rowH) && open.over <= 0 && !open.label, `${sel}: open, ${rowH}px rows and still no label`, open.rows.map((r) => r.h))
  }
  await p.screenshot({ path: join(shots, "business-menus-open-1440.png") })
  await p.setViewport({ width: 390, height: 900, deviceScaleFactor: 2 })
  await sleep(200)
  await p.evaluate(() => document.querySelector("[data-probe=sheet-three]").scrollIntoView())
  await p.screenshot({ path: join(shots, "business-sheet-three-open-390.png") })
  await p.evaluate(() => document.querySelector("[data-probe=sheet-member-two]").scrollIntoView())
  await p.screenshot({ path: join(shots, "business-sheet-member-two-open-390.png") })
  await p.evaluate(() => document.querySelector("[data-probe=sheet-one]").scrollIntoView())
  await p.screenshot({ path: join(shots, "business-sheet-open-390.png") })

  /*
    THE LIMIT, SAID ON THE PRESS. Every list is open above and not one of
    them has said a word about three being the most. Press New business on a
    login that has three and the sentence arrives, on the menu's one alert
    line, with no screen and no request: the count is read in the menu
    (lib/businesses/rules canAddBusiness). The phone first, so its shot is
    taken at 390 where the sheet lives.
  */
  console.log("\nthe limit, on the press")
  for (const [sel, width] of [["[data-probe=sheet-three]", 390], ["[data-probe=sheet-member-three]", 390], ["[data-probe=dropdown-three]", 1440], ["[data-probe=dropdown-member-three]", 1440]]) {
    if (width !== (await p.viewport()).width) {
      await p.setViewport(width === 390 ? { width: 390, height: 900, deviceScaleFactor: 2 } : { width: 1440, height: 900 })
      await sleep(200)
    }
    const before = await p.evaluate(() => window.__created ?? 0)
    const quiet = await p.evaluate((s2) => document.querySelector(`${s2} [role=alert]`) === null, sel)
    await p.evaluate((s2) => {
      const el = document.querySelector(`${s2} [data-business-new]`)
      el.scrollIntoView({ block: "center" })
      el.click()
    }, sel)
    await sleep(250)
    const said = await p.evaluate((s2) => {
      const add = document.querySelector(`${s2} [data-business-new]`)
      return {
        alerts: document.querySelectorAll(`${s2} [role=alert]`).length,
        text: document.querySelector(`${s2} [role=alert]`)?.textContent?.trim() ?? null,
        screen: !!document.querySelector("[data-business-switch-screen]"),
        pressable: !!add && !add.disabled && add.textContent.trim() === "New business",
        created: window.__created ?? 0,
      }
    }, sel)
    expect(quiet && said.text === LIMIT && said.alerts === 1 && !said.screen && said.pressable && said.created === before,
      `${sel}: nothing said until New business is pressed, then the limit on the menu's one alert line, with no request`, { quiet, ...said })
    await p.screenshot({ path: join(shots, `business-limit-said-${sel.replace(/\[data-probe=|\]/g, "")}-${width}.png`) })
  }
  await p.setViewport({ width: 1440, height: 900 })
  await sleep(150)
  await toggle("[data-probe=dropdown-two]")
  const shut = await read("[data-probe=dropdown-two]")
  expect(shut.rows.length === 1 && shut.rows[0].expanded === "false", "a second tap folds it away again", shut.rows.length)

  console.log("\nNew business")
  /* A real mouse press on the sheet's New business line, with its list open (it was left open above). */
  const plusAt = await p.evaluate(() => {
    const el = document.querySelector("[data-probe=sheet-one] [data-business-new]")
    el.scrollIntoView({ block: "center" })
    const b = el.getBoundingClientRect()
    window.__plusBefore = { w: b.width, h: b.height, html: el.innerHTML }
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 }
  })
  /* The screen's opacity on each of the first frames after the press. */
  await p.evaluate(() => {
    window.__frames = []
    const t0 = performance.now()
    const tick = () => {
      const el = document.querySelector("[data-business-switch-screen]")
      window.__frames.push({ t: Math.round(performance.now() - t0), o: el ? Number(getComputedStyle(el).opacity) : null })
      if (performance.now() - t0 < 400) requestAnimationFrame(tick)
    }
    addEventListener("pointerdown", () => requestAnimationFrame(tick), { once: true, capture: true })
  })
  await p.mouse.click(plusAt.x, plusAt.y)
  await sleep(450)
  const pressed = await p.evaluate(() => {
    const el = document.querySelector("[data-probe=sheet-one] [data-business-new]")
    const b = el.getBoundingClientRect()
    const scr = document.querySelector("[data-business-switch-screen]")
    return {
      created: window.__created ?? 0,
      pushed: window.__pushed ?? null,
      expanded: document.querySelector("[data-probe=sheet-one] [data-business-row=current]").getAttribute("aria-expanded"),
      rowSpinner: !!document.querySelector("[data-business-switcher] .animate-spin"),
      busy: el.getAttribute("aria-busy"),
      sameBox: Math.abs(b.width - window.__plusBefore.w) < 0.5 && Math.abs(b.height - window.__plusBefore.h) < 0.5 && el.innerHTML === window.__plusBefore.html,
      screen: scr && { surface: scr.getAttribute("data-surface"), step: scr.getAttribute("data-step"), line: scr.querySelector("[data-switch-line]:not([aria-hidden])")?.textContent, bg: getComputedStyle(scr.querySelector("[data-switch-middle]").parentElement).backgroundColor },
      frames: window.__frames,
    }
  })
  expect(pressed.created === 1 && pressed.pushed === null && pressed.expanded === "true" && pressed.busy === "true",
    "New business, in the open list, starts the new business right there", pressed)
  expect(!!pressed.screen && pressed.screen.surface === "plain" && pressed.screen.step === "creating" && pressed.screen.line === "Setting up your new business" && pressed.screen.bg === "rgb(255, 255, 255)",
    "the plain white screen is up, saying it is setting up your new business", pressed.screen)
  expect(!pressed.rowSpinner && pressed.sameBox, "  the rows under it keep their size and their icon: no spinner of their own", { rowSpinner: pressed.rowSpinner, sameBox: pressed.sameBox })
  const seen = pressed.frames.filter((f) => f.o !== null)
  expect(seen.length > 0 && seen[0].o > 0 && seen[0].o < 1 && seen.every((f, i) => i === 0 || f.o >= seen[i - 1].o) && seen[seen.length - 1].o === 1,
    "  it comes up in a short fade that is already moving on its first frame, and never dips", seen.slice(0, 6))
  await p.screenshot({ path: join(shots, "business-new-creating.png") })
  /* Where its spinner and line are, to hold the setup page's screen to. */
  const geometry = () => p.evaluate(() => {
    const scr = document.querySelector("[data-business-switch-screen]")
    /* The box the spinner turns in, not the turning drawing: a turned box's bounds change with its angle. */
    const sp = scr.querySelector("[data-switch-middle] > div > span").getBoundingClientRect()
    const line = scr.querySelector("[data-switch-line]:not([aria-hidden])")
    const lr = line.getBoundingClientRect()
    return { spinner: [sp.left, sp.top, sp.width].map(Math.round), line: [lr.left, lr.top, lr.width, lr.height].map(Math.round), text: line.textContent, font: getComputedStyle(line).font, color: getComputedStyle(line).color }
  })
  await p.evaluate(() => window.__opening())
  await sleep(700)
  const opening = await geometry()
  expect(opening.text === "Opening your new business", "the server's yes moves the line on: opening your new business", opening.text)
  await p.screenshot({ path: join(shots, "business-new-opening.png") })
  await p.evaluate(() => window.__refuse("You already have three businesses, the most one login can have."))
  await sleep(500)
  const refused = await p.evaluate(() => ({
    screen: !!document.querySelector("[data-business-switch-screen]"),
    error: document.querySelector("[data-probe=sheet-one] [role=alert]")?.textContent ?? null,
    plusFree: !document.querySelector("[data-probe=sheet-one] [data-business-new]").disabled,
  }))
  expect(!refused.screen && refused.error === "You already have three businesses, the most one login can have." && refused.plusFree,
    "a refusal takes the screen away, the menu says why in the server's words, and it can be pressed again", refused)
  await p.evaluate(() => document.querySelector("[data-probe=sheet-one]").scrollIntoView())
  await p.screenshot({ path: join(shots, "business-new-refused.png") })

  console.log("\nThe setup page opens on the same screen")
  const s = await browser.newPage()
  s.on("pageerror", (e) => errors.push(e.message))
  await s.setViewport({ width: 1440, height: 900 })
  await s.goto(`file://${join(work, "index.html")}?view=setup`)
  await sleep(300)
  const setup = await s.evaluate(() => {
    const scr = document.querySelector("[data-business-switch-screen]")
    /* The box the spinner turns in, not the turning drawing: a turned box's bounds change with its angle. */
    const sp = scr.querySelector("[data-switch-middle] > div > span").getBoundingClientRect()
    const line = scr.querySelector("[data-switch-line]:not([aria-hidden])")
    const lr = line.getBoundingClientRect()
    return { spinner: [sp.left, sp.top, sp.width].map(Math.round), line: [lr.left, lr.top, lr.width, lr.height].map(Math.round), text: line.textContent, font: getComputedStyle(line).font, color: getComputedStyle(line).color }
  })
  expect(JSON.stringify(setup) === JSON.stringify(opening), "the spinner and the line at the very same pixels, in the same type, as the menu's last frame", { menu: opening, setup })
  await s.screenshot({ path: join(shots, "business-setup-first-frame.png") })
  await s.evaluate(() => {
    window.__fade = []
    const t0 = performance.now()
    const mid = document.querySelector("[data-switch-middle]")
    const surface = mid.parentElement
    const tick = () => {
      window.__fade.push({ t: Math.round(performance.now() - t0), mid: Number(getComputedStyle(mid).opacity), bg: getComputedStyle(surface).backgroundColor, surface: Number(getComputedStyle(surface).opacity) })
      if (performance.now() - t0 < 450) requestAnimationFrame(tick)
    }
    window.__leave()
    requestAnimationFrame(tick)
  })
  await sleep(600)
  const fade = await s.evaluate(() => window.__fade)
  expect(fade.length > 4 && fade.some((f) => f.mid > 0 && f.mid < 1) && fade[fade.length - 1].mid === 0 && fade.every((f, i) => i === 0 || f.mid <= fade[i - 1].mid),
    "when the setup opens, the spinner and the line fade out on opacity, never back up", fade.filter((_, i) => i % 3 === 0).map((f) => [f.t, Math.round(f.mid * 100) / 100]))
  expect(fade.every((f) => f.bg === "rgb(255, 255, 255)" && f.surface === 1), "  and the white under them stays, so nothing behind it shows", fade[fade.length - 1])
  for (const [w, h] of [[390, 844], [1280, 800]]) {
    await s.setViewport({ width: w, height: h, deviceScaleFactor: 2 })
    await s.reload()
    await sleep(300)
    const box = await s.evaluate(() => ({ over: document.documentElement.scrollWidth - innerWidth, sp: document.querySelector(".activity-spinner").getBoundingClientRect().top + 13, h: innerHeight }))
    expect(box.over <= 0 && Math.abs(box.sp / box.h - 0.4) < 0.02, `  at ${w}: no sideways scroll, the spinner 40% down as every slow page has it`, { over: box.over, at: Math.round((box.sp / box.h) * 1000) / 10 })
    await s.screenshot({ path: join(shots, `business-setup-${w}.png`) })
  }
  if (errors.length) expect(false, "no errors on the page", errors)
  await browser.close()
  console.log(`\nshots: ${shots}`)
} finally {
  rmSync(work, { recursive: true, force: true })
}
if (broken) fail(`${broken} check(s) failed`)
console.log("\nall checks passed")
