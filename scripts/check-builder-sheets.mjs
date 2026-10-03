/**
 * ===========================================================================
 *  THE BUILDER'S SHEETS AND SWITCHES, ON THE REAL EDITOR, MEASURED
 * ===========================================================================
 * This round's claims about the website builder, each a number from the real
 * StoreEditorPage mounted in Chromium with its network answered locally
 * (scripts/render-editor-probe.tsx), at 390 and 1280 wide:
 *
 *   ACTIONS    opening the phone's Actions sheet renders nothing of the
 *              editor (React's own commit hook is asked), the sheet's first
 *              moving frame already holds its rows, it rises in one motion,
 *              and a row's action (Theme settings) starts only once the
 *              sheet has gone
 *   INSPECTOR  the switch presses on `scale`, ticks, and the selected
 *              section's ring fades out and back in over several frames
 *              rather than popping; with it off, the rings are gone
 *   PUBLISH    on a phone the sheet ends with what is connected: Connect
 *              your own AI with nothing, each tool's mark and Connected with
 *              Claude and GitHub; the row does not change the sheet's height
 *              while it opens; a tap opens Website Settings on Connections.
 *              On a desktop there is no such row
 *   BACK       a section's settings open with a Back that is 44px, whose
 *              press area takes in the section's name, and it goes back
 *
 *   node scripts/check-builder-sheets.mjs     (PROBE_CSS=source without a build)
 *
 * The editor bundle is built by scripts/check-editor-scroll.mjs, which owns
 * the stubs; set EDITOR_BUNDLE to reuse one. Screenshots go to SHOTS_DIR with
 * the prefix builder-.
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const out = mkdtempSync(join(tmpdir(), "storelib-builder-sheets-"))
const shots = process.env.SHOTS_DIR || join(out, "shots")
mkdirSync(shots, { recursive: true })
const bundlePath = process.env.EDITOR_BUNDLE ?? join(out, "editor-probe.js")
if (!existsSync(bundlePath)) {
  execFileSync(process.execPath, [join(root, "scripts/check-editor-scroll.mjs")], {
    cwd: root, stdio: ["ignore", "inherit", "inherit"],
    env: { ...process.env, EDITOR_BUNDLE: bundlePath, EDITOR_BUNDLE_ONLY: "1" },
  })
}
if (!existsSync(bundlePath)) fail("The editor bundle was not built.")
const bundle = readFileSync(bundlePath)
const css = (await appCss(root)) + "\n" + interFaces(root)

/**
 * React's own commit hook, the one its devtools use, installed before the
 * editor loads. For each commit it records whether StoreEditorPage itself
 * rendered in it (the PerformedWork flag on its fiber, which is how the
 * devtools decide "did this render").
 */
const HOOK = `
window.__commits = []
window.__vibrations = 0
navigator.vibrate = function () { window.__vibrations++; return true }
window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
  isDisabled: false, supportsFiber: true, renderers: new Map(),
  inject: function (r) { this.renderers.set(1, r); return 1 },
  onScheduleFiberRoot: function () {}, onCommitFiberUnmount: function () {}, onPostCommitFiberRoot: function () {}, checkDCE: function () {},
  onCommitFiberRoot: function (id, root) {
    var queue = [root.current], editor = null, seen = 0
    while (queue.length && !editor && seen < 400) {
      var f = queue.shift(); seen++
      if (f && f.type && f.type.name === "StoreEditorPage") { editor = f; break }
      for (var c = f && f.child; c; c = c.sibling) queue.push(c)
    }
    window.__commits.push({ t: performance.now(), editor: !!editor && (editor.flags & 1) === 1 })
  },
}
`

function page(opts) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>${css}</style></head><body><div id="app"></div>` +
    `<script>${HOOK}</script>` +
    `<script>window.PROBE_LIVE=${opts.live ? "true" : "false"};window.PROBE_CONNECTIONS=${JSON.stringify(opts.connections ?? null)};window.PROBE_SECURITY=${JSON.stringify(opts.security ?? null)};</script>` +
    `<script src="/editor-probe.js"></script></body></html>`
}
let current = { live: true, connections: null, security: null }
const server = createServer((req, res) => {
  if (req.url.startsWith("/editor-probe.js")) { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(bundle) }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(page(current))
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}`

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })

async function open(width, opts) {
  current = { live: true, connections: null, security: null, ...opts }
  const p = await browser.newPage()
  const phone = width < 768
  await p.setViewport({ width, height: phone ? 844 : 900, deviceScaleFactor: 1, isMobile: phone, hasTouch: phone })
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e.message || e)))
  await p.goto(origin, { waitUntil: "load" })
  await p.waitForFunction(() => {
    const sc = document.getElementById("wb-preview-root")
    return !!sc && sc.querySelectorAll("[id^=wb-section-]").length >= 3
  }, { timeout: 30000 })
  await sleep(900)
  return { p, errors, phone }
}

/** Frames of `sel`'s transform (translateY) and a count of `rowsSel` inside it, for `ms`. */
const watchFrames = (p, sel, rowsSel, ms) => p.evaluate((sel, rowsSel, ms) => {
  window.__frames = []
  const t0 = performance.now()
  const tick = () => {
    const el = document.querySelector(sel)
    if (el) {
      const m = getComputedStyle(el).transform
      window.__frames.push({ t: Math.round(performance.now() - t0), y: m === "none" ? 0 : Math.round(new DOMMatrixReadOnly(m).m42), rows: rowsSel ? el.querySelectorAll(rowsSel).length : 0, h: Math.round(el.getBoundingClientRect().height) })
    }
    if (performance.now() - t0 < ms) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}, sel, rowsSel, ms)

/* ── Phone ───────────────────────────────────────────────────────────── */
console.log("\nphone, 390 wide: the Actions sheet")
{
  const { p, errors } = await open(390, {})
  const trigger = await p.$("header button[aria-label='Actions']")
  const tb = trigger ? await trigger.boundingBox() : null
  const reach = await p.evaluate(() => {
    const b = document.querySelector("header button[aria-label='Actions']")
    const r = b.getBoundingClientRect()
    const a = getComputedStyle(b, "::after")
    return a.content !== "none" && a.position === "absolute" && a.display !== "none" ? Math.round(r.height - (parseFloat(a.top) || 0) - (parseFloat(a.bottom) || 0)) : Math.round(r.height)
  })
  expect(!!tb && reach >= 44, "the three dots are pressed over 44px on a phone", { drawn: tb && Math.round(tb.height), pressed: reach })
  await p.evaluate(() => { window.__commits.length = 0; window.__vibrations = 0 })
  await watchFrames(p, "[data-app-sheet] [data-sheet-panel]", "[data-action-sheet] button, [data-action-sheet] a", 700)
  await p.evaluate(() => document.querySelector("header button[aria-label='Actions']").click())
  await sleep(760)
  const commits = await p.evaluate(() => window.__commits)
  const frames = await p.evaluate(() => window.__frames)
  expect(commits.length > 0 && commits.every((c) => !c.editor), "opening it renders nothing of the editor", `${commits.filter((c) => c.editor).length} of ${commits.length} commits rendered the editor`)
  expect(frames.length > 0 && frames[0].rows > 0, "its first frame already holds its rows", frames[0] ? `${frames[0].rows} rows at y=${frames[0].y}` : "no frames")
  const ys = frames.map((f) => f.y)
  expect(ys.every((y, i) => i === 0 || y <= ys[i - 1] + 0.5) && ys[ys.length - 1] === 0, "it rises in one motion to rest", `${ys.slice(0, 6).join(", ")} … ${ys[ys.length - 1]} over ${frames.length} frames`)
  expect((await p.evaluate(() => window.__vibrations)) >= 1, "with a tick under the finger", await p.evaluate(() => window.__vibrations))
  await p.screenshot({ path: join(shots, "builder-390-actions.png") })

  /* A row's action waits for the sheet to have gone: Theme settings opens the builder's own sheet. */
  const handoff = await p.evaluate(async () => {
    const base = [...document.querySelectorAll("[data-mobile-bottom-sheet]")]
    const y0 = base.map((b) => getComputedStyle(b).transform)
    const res = { sheetGone: null, baseMoved: null }
    const t0 = performance.now()
    ;[...document.querySelectorAll("[data-action-sheet] button")].find((b) => b.textContent.trim() === "Theme settings").click()
    await new Promise((done) => {
      const tick = () => {
        const now = Math.round(performance.now() - t0)
        if (res.sheetGone === null && !document.querySelector("[data-app-sheet]")) res.sheetGone = now
        if (res.baseMoved === null && base.some((b, i) => getComputedStyle(b).transform !== y0[i])) res.baseMoved = now
        if (now < 1400) requestAnimationFrame(tick)
        else done()
      }
      requestAnimationFrame(tick)
    })
    return res
  })
  expect(handoff.sheetGone !== null && handoff.baseMoved !== null && handoff.baseMoved >= handoff.sheetGone,
    "a row's action starts once the sheet has gone, so two sheets never move at once", handoff)
  await sleep(500)
  await p.screenshot({ path: join(shots, "builder-390-theme-settings.png") })
  expect(errors.length === 0, "no errors", errors.slice(0, 2).join(" | "))
  await p.close()
}

console.log("\nphone, 390 wide: a section's Back")
{
  const { p, errors } = await open(390, {})
  /* Tap a body section on the canvas: its settings open in the sheet. */
  await p.evaluate(() => {
    const s = [...document.querySelectorAll("#wb-preview-root [id^=wb-section-]")].find((el) => !/header|footer/.test(el.id))
    s.scrollIntoView({ block: "center" })
    const r = s.getBoundingClientRect()
    const target = document.elementFromPoint(r.left + r.width / 2, Math.max(r.top + 20, 120)) || s
    target.click()
  })
  await sleep(500)
  /* Selected; the Sections tab brings the sheet up on it. */
  await p.evaluate(() => {
    const tab = [...document.querySelectorAll("[data-mobile-bottom-sheet] button, [data-mobile-bottom-sheet] [role=tab]")].find((b) => b.textContent.trim() === "Sections")
    tab?.click()
  })
  await sleep(700)
  /* The list, then the section in it: the way a thumb opens its settings. */
  await p.evaluate(() => {
    const row = [...document.querySelectorAll("[data-mobile-bottom-sheet] *")].find((el) => el.children.length === 0 && el.textContent.trim() === "Centered Hero")
    ;(row?.closest("button, [role=button]") || row)?.click()
  })
  await sleep(900)
  const b = await p.evaluate(() => {
    const row = [...document.querySelectorAll("[data-panel-back]")].find((r) => { const b = r.getBoundingClientRect(); return b.width > 0 && b.top >= 0 && b.bottom <= window.innerHeight })
    window.__backRow = row || null
    if (!row) return { debug: [...document.querySelectorAll("[data-panel-back]")].map((r) => JSON.stringify(r.getBoundingClientRect())), vh: window.innerHeight }
    const btn = row.querySelector("button[aria-label='Back']")
    const rr = row.getBoundingClientRect()
    const br = btn.getBoundingClientRect()
    const icon = btn.querySelector("svg").getBoundingClientRect()
    const title = row.querySelector("p, span:not([aria-hidden])")
    const tr = title.getBoundingClientRect()
    const hit = document.elementFromPoint(tr.left + tr.width / 2, tr.top + tr.height / 2)
    return {
      row: Math.round(rr.height), button: { w: Math.round(br.width), h: Math.round(br.height) }, icon: Math.round(icon.width),
      title: title.textContent.trim(), titleGoesBack: hit === btn || btn.contains(hit),
    }
  })
  expect(!!b && !b.debug, "a section's settings open with Back at the top", b && b.debug ? b : undefined)
  if (b && b.debug) { await p.screenshot({ path: join(shots, "builder-390-section-debug.png") }); fail("no Back row on screen") }
  if (b) {
    expect(b.button.w >= 44 && b.button.h >= 44 && b.row >= 52, "Back is 44px in a 52px row", b)
    expect(b.icon >= 20, "the arrow is 20px on a phone", b.icon)
    expect(b.titleGoesBack, `a press on the name (${b.title}) is a press on Back`)
  }
  await p.screenshot({ path: join(shots, "builder-390-section-back.png") })
  await p.evaluate(() => {
    const row = window.__backRow
    const t = row.querySelector("p, span:not([aria-hidden])").getBoundingClientRect()
    const hit = document.elementFromPoint(t.left + t.width / 2, t.top + t.height / 2)
    hit.click()
  })
  await sleep(500)
  expect(await p.evaluate(() => ![...document.querySelectorAll("[data-panel-back]")].some((r) => r.getBoundingClientRect().width > 0)), "and pressing it there goes back to the list")
  expect(errors.length === 0, "no errors", errors.slice(0, 2).join(" | "))
  await p.close()
}

console.log("\nphone, 390 wide: Publish says what is connected")
for (const [name, connections, want] of [
  ["nothing connected", { agents: [], github: null, latest: null }, { state: "none", title: "Connect your own AI", sub: "GitHub not connected", marks: 1 }],
  ["Claude and GitHub", { agents: [{ name: "Claude Code", lastUsedAt: null }], github: { repo: "astrid/site" }, latest: null }, { state: "connected", title: "Claude and GitHub", sub: "Connected", marks: 2 }],
  ["Codex", { agents: [{ name: "Codex", lastUsedAt: null }], github: null, latest: null }, { state: "connected", title: "Codex", sub: "Connected", marks: 1 }],
]) {
  const { p, errors } = await open(390, { connections })
  await watchFrames(p, "[data-mobile-bottom-sheet][aria-modal=true]", "[data-publish-connections]", 700)
  await p.evaluate(() => [...document.querySelectorAll("header button")].find((b) => b.textContent.trim() === "Publish").click())
  await sleep(760)
  const frames = await p.evaluate(() => window.__frames)
  const row = await p.evaluate(() => {
    const r = document.querySelector("[data-publish-connections]")
    if (!r) return null
    const content = r.closest("[data-sheet-content]")
    const card = content && content.firstElementChild
    const box = r.getBoundingClientRect()
    return {
      state: r.getAttribute("data-publish-connections"),
      title: r.querySelector("span span:nth-child(2) > span")?.textContent.trim(),
      sub: r.querySelector("span span:nth-child(2) > span:last-child")?.textContent.trim(),
      marks: r.querySelectorAll("svg").length - 1,
      /* Right above the security line, which is the last thing in the card. */
      last: !!card && r.nextElementSibling === card.lastElementChild && card.lastElementChild.hasAttribute("data-publish-security"),
      h: Math.round(box.height),
      onScreen: box.bottom <= window.innerHeight && box.top >= 0,
    }
  })
  expect(!!row, `${name}: the sheet has a connections row`)
  if (row) {
    expect(row.state === want.state && row.title === want.title && row.sub === want.sub && row.marks === want.marks,
      `  it reads "${row.title}", "${row.sub}", with ${row.marks} mark${row.marks === 1 ? "" : "s"}`, row.state)
    expect(row.last, "  and it sits right above the security line, the last thing in the sheet's card")
    expect(row.h >= 44, `  a thumb's height (${row.h}px)`)
  }
  const heights = [...new Set(frames.map((f) => f.h))]
  expect(heights.length === 1, "  the sheet keeps one height while it opens", heights)
  if (name === "Claude and GitHub") await p.screenshot({ path: join(shots, "builder-390-publish-connected.png") })
  if (name === "nothing connected") {
    await p.screenshot({ path: join(shots, "builder-390-publish-none.png") })
    await p.evaluate(() => document.querySelector("[data-publish-connections]").click())
    await sleep(700)
    const s = await p.evaluate(() => ({ open: !!document.querySelector("[role=dialog][aria-label='Website settings']"), heading: document.querySelector("[role=dialog][aria-label='Website settings'] main h1")?.textContent }))
    expect(s.open && s.heading === "Connections", "  a tap opens Website Settings on Connections", s)
  }
  expect(errors.length === 0, "  no errors", errors.slice(0, 2).join(" | "))
  await p.close()
}

console.log("\nphone, 390 wide: Publish says what the security check says")
{
  const found = {
    issues: [
      { kind: "custom-script", page: "home", sectionId: "s1", message: "Custom code here includes a script. Scripts are removed, so it will not run on your site." },
      { kind: "insecure-media", page: null, sectionId: null, message: "A picture or video here loads over http, so browsers may block it. Use an https address." },
    ],
    truncated: false,
    checked_at: new Date().toISOString(),
  }
  for (const [name, security, want] of [
    ["a clean site", null, { state: "clear", text: "No security issues found" }],
    ["two things found", found, { state: "found", text: "2 things to check" }],
    ["a check that could not run", "fail", { state: "unknown", text: "Could not check for security issues" }],
  ]) {
    const { p, errors } = await open(390, { connections: { agents: [], github: null, latest: null }, security })
    await watchFrames(p, "[data-mobile-bottom-sheet][aria-modal=true]", "[data-publish-security]", 700)
    await p.evaluate(() => [...document.querySelectorAll("header button")].find((b) => b.textContent.trim() === "Publish").click())
    await sleep(760)
    const frames = await p.evaluate(() => window.__frames)
    const line = await p.evaluate(() => {
      const el = document.querySelector("[data-publish-security]")
      if (!el) return null
      const card = el.closest("[data-sheet-content]")?.firstElementChild
      const box = el.getBoundingClientRect()
      return { state: el.getAttribute("data-publish-security"), text: el.textContent.replace(/Try again$/, "").trim(), h: Math.round(box.height), last: !!card && card.lastElementChild === el }
    })
    expect(!!line && line.state === want.state && line.text === want.text, `${name}: it reads "${want.text}"`, line)
    expect(!!line && line.last, "  still the last thing in the card")
    expect(!!line && line.h <= 26, `  one line tall (${line?.h}px)`)
    const heights = [...new Set(frames.map((f) => f.h))]
    expect(heights.length === 1, "  the sheet keeps one height while it opens and the answer comes back", heights)
    if (want.state === "found") {
      await p.evaluate(() => document.querySelector("[data-publish-security] button[aria-expanded]").click())
      await sleep(450)
      const list = await p.evaluate(() => {
        const items = [...document.querySelectorAll("[data-publish-security-issues] li")]
        return { n: items.length, places: items.map((li) => li.querySelector("p")?.textContent), expanded: document.querySelector("[data-publish-security] button[aria-expanded]").getAttribute("aria-expanded") }
      })
      expect(list.n === 2 && list.places[0] === "Home page" && list.places[1] === "Theme settings" && list.expanded === "true", "  a press lists each one and where it is", list)
      await p.screenshot({ path: join(shots, "builder-390-publish-security-found.png") })
    }
    if (want.state === "unknown") {
      const retried = await p.evaluate(async () => {
        const before = window.probeCalls.filter((c) => c.includes("/security")).length
        ;[...document.querySelectorAll("[data-publish-security] button")].find((b) => b.textContent.trim() === "Try again").click()
        await new Promise((r) => setTimeout(r, 300))
        return window.probeCalls.filter((c) => c.includes("/security")).length - before
      })
      expect(retried === 1, "  Try again asks once more", retried)
    }
    expect(errors.length === 0, "  no errors", errors.slice(0, 2).join(" | "))
    await p.close()
  }
}

console.log("\nphone, 390 wide: the inspector")
{
  const { p, errors } = await open(390, {})
  const btn = "header button[aria-pressed][aria-label$='section inspector']"
  const look = await p.evaluate((sel) => {
    const b = document.querySelector(sel)
    return { transition: getComputedStyle(b).transitionProperty, toggled: b.hasAttribute("data-toggled") }
  }, btn)
  expect(/(^|, )scale(,|$)/.test(look.transition), "the switch presses on scale, which its transition names", look.transition)
  await p.evaluate(() => { window.__vibrations = 0 })
  await p.evaluate((sel) => document.querySelector(sel).click(), btn)
  await sleep(450)
  const after = await p.evaluate((sel) => ({ pressed: document.querySelector(sel).getAttribute("aria-pressed"), toggled: document.querySelector(sel).hasAttribute("data-toggled"), buzz: window.__vibrations, anim: getComputedStyle(document.querySelector(sel).querySelector("svg")).animationName }), btn)
  expect(after.pressed === "false" && after.toggled && after.buzz >= 1, "a press turns it off, with a tick", after)
  expect(after.anim === "wb-inspector-off", "and the icon answers the change", after.anim)
  expect(errors.length === 0, "no errors", errors.slice(0, 2).join(" | "))
  await p.close()
}

/* ── Desktop ─────────────────────────────────────────────────────────── */
console.log("\ndesktop, 1280 wide: the inspector's rings fade")
{
  const { p, errors } = await open(1280, {})
  await p.evaluate(() => {
    const s = [...document.querySelectorAll("#wb-preview-root [id^=wb-section-]")].find((el) => !/header|footer/.test(el.id))
    s.scrollIntoView({ block: "center" })
    const r = s.getBoundingClientRect()
    ;(document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(40, r.height / 2)) || s).click()
  })
  await sleep(600)
  const sample = (ms) => p.evaluate((ms) => new Promise((done) => {
    const out = []
    const t0 = performance.now()
    const tick = () => {
      const ring = [...document.querySelectorAll("#wb-preview-root .wb-ring")].find((r) => r.style.boxShadow.includes("#8b5cf6") || r.style.boxShadow.includes("139, 92, 246)"))
      out.push({ t: Math.round(performance.now() - t0), ring: !!ring, o: ring ? Math.round(Number(getComputedStyle(ring).opacity) * 100) / 100 : null })
      if (performance.now() - t0 < ms) requestAnimationFrame(tick)
      else done(out)
    }
    requestAnimationFrame(tick)
  }), ms)
  const before = await p.evaluate(() => document.querySelectorAll("#wb-preview-root .wb-ring").length)
  expect(before > 0, "with a section selected there are rings on the canvas", before)
  const offP = sample(520)
  await p.evaluate(() => document.querySelector("header button[aria-label$='section inspector']").click())
  const off = await offP
  const mid = off.filter((f) => f.o !== null && f.o > 0.05 && f.o < 0.95)
  expect(mid.length >= 3, "switched off, the selected ring fades out over several frames", off.filter((f) => f.o !== null).slice(0, 10).map((f) => `${f.t}ms ${f.o}`).join(", "))
  const gone = await p.evaluate(() => document.querySelectorAll("#wb-preview-root .wb-ring").length)
  expect(gone === 0, "and then the canvas is drawn without them", gone)
  const onP = sample(520)
  await p.evaluate(() => document.querySelector("header button[aria-label$='section inspector']").click())
  const on = await onP
  const rising = on.filter((f) => f.o !== null && f.o > 0.05 && f.o < 0.95)
  expect(rising.length >= 3 && on[on.length - 1].o === 1, "switched on, it fades back up to full", on.filter((f) => f.o !== null).slice(0, 10).map((f) => `${f.t}ms ${f.o}`).join(", "))
  await p.screenshot({ path: join(shots, "builder-1280-inspector.png") })
  expect(errors.length === 0, "no errors", errors.slice(0, 2).join(" | "))
  await p.close()
}

console.log("\ndesktop, 1280 wide: Publish has no connections row")
{
  const { p, errors } = await open(1280, { connections: { agents: [{ name: "Claude Code", lastUsedAt: null }], github: null, latest: null } })
  await p.evaluate(() => [...document.querySelectorAll("header button")].find((b) => b.textContent.trim() === "Publish").click())
  await sleep(500)
  const d = await p.evaluate(() => ({ panel: !!document.querySelector("[role=dialog][aria-label='Publish']"), row: !!document.querySelector("[data-publish-connections]"), mark: document.querySelector("header [data-connection]")?.getAttribute("data-connection") }))
  expect(d.panel && !d.row, "the desktop panel opens without it", d)
  expect(d.mark === "claude", "the bar's own mark says Claude", d.mark)
  await p.screenshot({ path: join(shots, "builder-1280-publish.png") })
  expect(errors.length === 0, "no errors", errors.slice(0, 2).join(" | "))
  await p.close()
}

await browser.close()
server.close()
console.log(`\nscreenshots: ${shots}\n`)
if (broken) fail(`${broken} check${broken === 1 ? "" : "s"} failed.`)
console.log("The builder's sheets and switches measured as asked.\n")
