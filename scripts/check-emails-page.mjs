/**
 * ===========================================================================
 *  THE EMAILS PAGE, MEASURED
 * ===========================================================================
 * The Emails screen was rebuilt in the Orders page's language. What that
 * claims, checked in Chromium with the built stylesheet:
 *
 *   - the views are tabs in the card's toolbar, one row, 48px tall;
 *   - each view has its own metrics strip, and Sent has the period picker;
 *   - tables are dense (48px rows) and the first column stays put when a
 *     phone scrolls the table sideways, while the page itself never does;
 *   - fifty rows to a page, with Previous and Next;
 *   - a row's actions are a dropdown on a desktop and a sheet on a phone;
 *   - a long address or subject is cut with an ellipsis, not wrapped;
 *   - a contact opens on the shared sheet on a phone with everything in it
 *     laid out on its first frame, rising once and going down once, and in
 *     the side panel on a desktop, also already filled.
 *
 * The contact's automation runs are read from a stand-in for the Supabase
 * client that answers after RUNS_DELAY_MS, as a network would.
 *
 *   node scripts/check-emails-page.mjs                  (built CSS, or the source's)
 *   PROBE_CSS=source node scripts/check-emails-page.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
/* Inter from a build when there is one, so text is measured in the face that ships. */
const css = (await appCss(root)) + "\n" + interFaces(root)
const RUNS_DELAY_MS = 120

const stubs = join(root, ".emails-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-emails-")), "shots")
mkdirSync(shots, { recursive: true })

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}

try {
  writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/app/emails"
export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, back() {}, refresh() {} })
export const useSearchParams = () => new URLSearchParams()
`)
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href, ...rest }, children) }
`)
  /* The creator's own read of a contact's runs, answered late. */
  writeFileSync(join(stubs, "supabase.js"), `const RUNS = {
  "person1@example.com": [
    { id: "r1", status: "active", exit_reason: null, started_at: "2026-09-20T10:00:00Z", flow_id: "f1", email_flows: { name: "Welcome" } },
    { id: "r2", status: "completed", exit_reason: null, started_at: "2026-09-02T10:00:00Z", flow_id: "f2", email_flows: { name: "Thank you for buying" } },
  ],
}
export function createClient() {
  let email = null
  const q = {
    from: () => q, select: () => q, order: () => q,
    eq: (_c, v) => { email = v; return q },
    limit: () => {
      ;(window.__runsAsked = window.__runsAsked || []).push(email)
      return new Promise((r) => setTimeout(() => r({ data: RUNS[email] || [], error: null }), ${RUNS_DELAY_MS}))
    },
  }
  return q
}
`)
  execFileSync("npx", [
    "esbuild", "scripts/render-emails-probe.tsx", "--bundle", "--format=iife", "--jsx=automatic",
    '--define:process.env.NODE_ENV="production"', "--alias:@=.",
    `--alias:next/navigation=./.emails-probe/navigation.js`, `--alias:next/link=./.emails-probe/link.jsx`,
    `--alias:@/lib/supabase/client=./.emails-probe/supabase.js`,
    `--outfile=${join(stubs, "app.js")}`, "--log-level=error",
  ], { cwd: root, stdio: "inherit", env: { ...process.env, NODE_PATH: join(root, "node_modules") } })
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
  writeFileSync(join(stubs, "index.html"), html)

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
  const open = async (viewport, tab) => {
    const p = await browser.newPage()
    await p.setViewport(viewport)
    await p.goto(`file://${join(stubs, "index.html")}?tab=${tab}`)
    await p.waitForSelector("[role=tablist]")
    return p
  }
  const sidewaysScroll = (p) => p.evaluate(() => document.querySelector(".orders-pane").scrollWidth - document.querySelector(".orders-pane").clientWidth)

  for (const [label, vp] of [["desktop", { width: 1440, height: 900 }], ["phone", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
    console.log(`\n${label}`)
    const p = await open(vp, "subscribers")
    const tabs = await p.$$eval("[role=tablist][aria-label=Views] [role=tab]", (t) => t.map((x) => x.textContent.trim()))
    expect(tabs.join("|") === "Subscribers|Automations|Sent|Scheduled|Drafts", "the views are tabs in the card", tabs)
    const toolbar = await p.$eval("[role=tablist]", (t) => Math.round(t.closest("div.flex.h-12").getBoundingClientRect().height))
    expect(toolbar === 48, "in one 48px toolbar", toolbar)
    const strip = await p.$$eval("[aria-label='Email metrics'] .border-l, [aria-label='Email metrics'] .orders-strip > div", (d) => d.length)
    expect(strip >= 4, "Subscribers has its own metrics", strip)
    const rows = await p.$$eval("section[aria-label=Emails] tbody tr", (r) => r.map((x) => Math.round(x.getBoundingClientRect().height)))
    expect(rows.length === 50 && rows.every((h) => h === 48), "fifty dense 48px rows to a page", { count: rows.length, heights: [...new Set(rows)] })
    expect((await p.$$eval("section[aria-label=Emails] button", (b) => b.map((x) => x.textContent.trim()))).includes("Next"), "and a Next page")
    const long = await p.$eval("section[aria-label=Emails] tbody tr:nth-child(4) td span", (el) => ({ w: el.scrollWidth > el.clientWidth, h: Math.round(el.closest("td").getBoundingClientRect().height), ell: getComputedStyle(el).textOverflow }))
    expect(long.h === 48 && long.ell === "ellipsis", "a long address is cut, not wrapped", long)
    expect((await sidewaysScroll(p)) === 0, "the page never scrolls sideways", await sidewaysScroll(p))
    if (label === "phone") {
      const before = await p.$eval("section[aria-label=Emails] tbody tr td", (td) => Math.round(td.getBoundingClientRect().left))
      await p.$eval("section[aria-label=Emails] .overflow-x-auto", (el) => { el.scrollLeft = 200 })
      const after = await p.$eval("section[aria-label=Emails] tbody tr td", (td) => Math.round(td.getBoundingClientRect().left))
      expect(before === after, "the email column stays put while the table scrolls", { before, after })
      const col = await p.$eval("section[aria-label=Emails] tbody td", (td) => Math.round(td.getBoundingClientRect().width))
      expect(col <= 220, "and is narrow enough to leave the scrolling columns in view", col)
      await p.$eval("section[aria-label=Emails] .overflow-x-auto", (el) => { el.scrollLeft = 0 })
    }
    await p.screenshot({ path: join(shots, `emails-${label}-subscribers.png`) })
    const btn = await p.$("section[aria-label=Emails] tbody tr:first-child td:last-child button")
    await btn.evaluate((b) => b.scrollIntoView({ block: "center", inline: "end" }))
    const hit = await btn.evaluate((b) => { const r = b.getBoundingClientRect(); return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest("button") === b })
    expect(hit, "the actions button is not covered by the pinned column", hit)
    await btn.click()
    await new Promise((r) => setTimeout(r, 450))
    const menu = await p.evaluate(() => {
      const sheet = [...document.querySelectorAll("[role=dialog]")].find((d) => /Copy email/.test(d.textContent))
      const drop = document.querySelector("[role=menu]")
      return { sheet: !!sheet, dropdown: !!drop && /Copy email/.test(drop.textContent) }
    })
    expect(label === "phone" ? menu.sheet && !menu.dropdown : menu.dropdown && !menu.sheet, `a row's actions are a ${label === "phone" ? "sheet" : "dropdown"}`, menu)
    await p.screenshot({ path: join(shots, `emails-${label}-subscriber-actions.png`) })
    await p.close()

    const sent = await open(vp, "published")
    expect(await sent.$("[aria-label='Email metrics']") !== null && (await sent.$$eval("button", (b) => b.some((x) => /Last 30 days/.test(x.textContent)))), "Sent has its metrics and the period picker")
    const heads = await sent.$$eval("section[aria-label=Emails] thead th", (t) => t.map((x) => x.textContent.trim()).filter(Boolean))
    expect(heads.join("|") === "Subject|Sent|Recipients|Opened|Clicked", "a sent email shows who got it, opened it and clicked", heads)
    const resent = await sent.$eval("section[aria-label=Emails] tbody tr:nth-child(2)", (r) => r.textContent)
    expect(/Sent again/.test(resent) && !/\(Resend\)/.test(resent), "a resend says Sent again instead of a raw (Resend) suffix")
    await sent.click("section[aria-label=Emails] tbody tr:first-child td:first-child")
    expect((await sent.evaluate(() => window.__log)).includes("open c0"), "a row opens its email")
    expect((await sidewaysScroll(sent)) === 0, "and this page never scrolls sideways either")
    await sent.screenshot({ path: join(shots, `emails-${label}-sent.png`) })
    await sent.close()

    const flows = await open(vp, "flows")
    const toggle = await flows.$("section[aria-label=Emails] tbody tr:nth-child(2) [role=switch]")
    await toggle.click()
    const log = await flows.evaluate(() => window.__log)
    expect(log.includes("toggle f2") && !log.some((l) => l.startsWith("edit flow")), "an automation is switched on from its row without opening it", log)
    await flows.screenshot({ path: join(shots, `emails-${label}-automations.png`) })
    await flows.close()
  }
  /* ── A contact, opened from its row ─────────────────────────────────── */
  const contactFrames = (p, ms) => p.evaluate((ms) => {
    window.__cf = []
    window.__tapAt = null
    const at = () => { if (window.__tapAt === null) window.__tapAt = performance.now() }
    document.addEventListener("touchend", at, { capture: true, once: true })
    document.addEventListener("click", at, { capture: true, once: true })
    const t0 = performance.now()
    const tick = () => {
      const panel = [...document.querySelectorAll("[data-sheet-panel], aside[role=dialog]")].find((x) => [...x.querySelectorAll("h3")].some((h) => h.textContent === "Automations"))
      const r = panel?.getBoundingClientRect()
      window.__cf.push({
        t: performance.now(),
        top: r ? Math.round(r.top) : null,
        left: r ? Math.round(r.left) : null,
        h: r ? Math.round(r.height) : null,
        opacity: panel ? Number(getComputedStyle(panel).opacity) : null,
        busy: panel ? panel.querySelectorAll("[aria-busy]").length : 0,
        runs: panel ? panel.querySelectorAll("li").length : 0,
      })
      if (performance.now() - t0 < ms) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, ms)
  const readContact = (p) => p.evaluate(() => ({ frames: window.__cf, tapAt: window.__tapAt, asked: window.__runsAsked || [] }))
  const rowSpot = (p, n) => p.evaluate((n) => {
    const td = document.querySelector(`section[aria-label=Emails] tbody tr:nth-child(${n}) td:nth-child(2)`)
    td.scrollIntoView({ block: "center" })
    const r = td.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  }, n)
  const opening = ({ frames, tapAt }) => {
    const after = frames.filter((f) => tapAt !== null && f.t >= tapAt)
    const seen = after.filter((f) => f.top !== null)
    const first = seen[0]
    const tops = seen.map((f) => f.top)
    let turns = 0
    for (let i = 2; i < tops.length; i++) if (Math.sign(tops[i] - tops[i - 1]) * Math.sign(tops[i - 1] - tops[i - 2]) < 0) turns++
    const rest = seen.find((f, i) => i > 0 && f.top === tops.at(-1) && seen[i - 1].top === f.top)
    return {
      ms: first ? Math.round(first.t - tapAt) : null,
      firstTop: first?.top ?? null,
      firstBusy: first?.busy ?? null,
      firstRuns: first?.runs ?? null,
      heights: [...new Set(seen.map((f) => f.h))],
      /* Sub-pixel rounding of a moving box can read a pixel either way. */
      heightSpread: seen.length ? Math.max(...seen.map((f) => f.h)) - Math.min(...seen.map((f) => f.h)) : null,
      runs: [...new Set(seen.map((f) => f.runs))],
      busyFrames: seen.filter((f) => f.busy > 0).length,
      rising: tops.every((t, i) => i === 0 || t <= tops[i - 1]),
      turns,
      restTop: tops.at(-1),
      riseMs: rest && first ? Math.round(rest.t - first.t) : null,
      frames: seen.length,
    }
  }

  console.log("\na contact, 390 wide")
  {
    const p = await open({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, "subscribers")
    await new Promise((r) => setTimeout(r, 300))
    const closedSheets = await p.evaluate(() => document.querySelectorAll("[data-sheet-panel]").length)
    expect(closedSheets === 0, "no sheet is in the page until one is opened", closedSheets)

    /* A thumb on the second row (person1, who has two automations), resting a moment, then up. */
    const spot = await rowSpot(p, 2)
    await contactFrames(p, 1100)
    await p.touchscreen.touchStart(spot.x, spot.y)
    await new Promise((r) => setTimeout(r, RUNS_DELAY_MS + 40))
    await p.touchscreen.touchEnd()
    await new Promise((r) => setTimeout(r, 1100))
    const a = await readContact(p)
    const o = opening(a)
    console.log(`  ..    tap to the sheet's first frame ${o.ms}ms, its top at ${o.firstTop}px (of 844) with ${o.firstRuns} runs laid out and ${o.firstBusy} loading blocks; rose to ${o.restTop}px in ${o.riseMs}ms over ${o.frames} frames; heights seen ${JSON.stringify(o.heights)}; turns ${o.turns}`)
    expect(a.asked[0] === "person1@example.com", "the finger on the row asked for the contact's runs before it lifted", a.asked)
    expect(o.firstTop !== null && o.firstTop >= 780, "the sheet's first frame is below the screen, not at rest", o.firstTop)
    expect(o.firstBusy === 0 && o.firstRuns === 2 && o.busyFrames === 0 && o.runs.length === 1, "with its content already laid out on that frame, and nothing popping in after", { firstRuns: o.firstRuns, busyFrames: o.busyFrames, runs: o.runs })
    expect(o.heightSpread !== null && o.heightSpread <= 1, "at one height on every frame", o.heights)
    expect(o.rising && o.turns === 0, "rising once, one way, with no second animation", { rising: o.rising, turns: o.turns })
    expect(o.riseMs !== null && o.riseMs >= 300 && o.riseMs <= 560, "in the shared sheet's time", o.riseMs)
    await p.screenshot({ path: join(shots, "emails-phone-contact.png") })

    /* Down, with a tap outside it. */
    await contactFrames(p, 700)
    await p.touchscreen.tap(195, 60)
    await new Promise((r) => setTimeout(r, 750))
    const down = (await readContact(p)).frames.filter((f) => f.top !== null)
    const downTops = down.map((f) => f.top)
    const gone = await p.evaluate(() => [...document.querySelectorAll("[data-sheet-panel]")].every((x) => x.getBoundingClientRect().top >= 843))
    console.log(`  ..    down from ${downTops[0]}px to ${downTops.at(-1)}px over ${down.length} frames; content the same on each: ${new Set(down.map((f) => f.runs)).size === 1}`)
    expect(downTops.every((t, i) => i === 0 || t >= downTops[i - 1]) && new Set(down.map((f) => f.runs)).size === 1 && gone, "a tap outside takes it down, one way, its content unchanged as it goes", downTops.slice(-3))

    /* A quick tap on a contact nobody asked about yet: it waits for the runs, a moment, then rises once. */
    const quick = await rowSpot(p, 5)
    await contactFrames(p, 1100)
    await p.touchscreen.tap(quick.x, quick.y)
    await new Promise((r) => setTimeout(r, 1100))
    const q = opening(await readContact(p))
    console.log(`  ..    a quick tap: first frame ${q.ms}ms after it, ${q.firstBusy} loading blocks, "None yet" laid out: ${q.firstRuns === 0 && q.firstBusy === 0}; heights ${JSON.stringify(q.heights)}; turns ${q.turns}`)
    expect(q.firstBusy === 0 && q.busyFrames === 0 && q.heightSpread <= 1 && q.rising && q.turns === 0, "a quick tap too: the sheet rises once, already filled, at one height", q)
    expect(q.ms !== null && q.ms <= RUNS_DELAY_MS + 120, "after waiting no longer than the answer took", q.ms)
    await p.touchscreen.tap(195, 60)
    await new Promise((r) => setTimeout(r, 600))

    /* The first contact again: known now, so it rises at once. */
    const again = await rowSpot(p, 2)
    await contactFrames(p, 900)
    await p.touchscreen.tap(again.x, again.y)
    await new Promise((r) => setTimeout(r, 900))
    const g = opening(await readContact(p))
    console.log(`  ..    the same contact again: first frame ${g.ms}ms after the tap, ${g.firstRuns} runs on it`)
    expect(g.firstRuns === 2 && g.firstBusy === 0 && g.ms !== null && g.ms <= 80, "a contact opened before opens at once, filled", g)
    await p.close()
  }

  console.log("\na contact, 1280 wide")
  {
    const p = await open({ width: 1280, height: 860 }, "subscribers")
    const spot = await rowSpot(p, 2)
    /* The pointer rests on the row, as a hand does before it clicks. */
    await p.mouse.move(spot.x, spot.y)
    await new Promise((r) => setTimeout(r, RUNS_DELAY_MS + 200))
    await contactFrames(p, 700)
    await p.mouse.click(spot.x, spot.y)
    await new Promise((r) => setTimeout(r, 700))
    const o = opening(await readContact(p))
    const panel = await p.evaluate(() => { const a = document.querySelector("aside[role=dialog]"); const r = a.getBoundingClientRect(); return { right: Math.round(r.right), width: Math.round(r.width), sheets: document.querySelectorAll("[data-sheet-panel]").length } })
    console.log(`  ..    the side panel: first frame ${o.ms}ms after the click, ${o.firstRuns} runs and ${o.firstBusy} loading blocks on it; ${panel.width} wide to ${panel.right}`)
    expect(o.firstBusy === 0 && o.firstRuns === 2 && o.busyFrames === 0 && panel.sheets === 0 && panel.width === 420, "on a computer the side panel opens, filled on its first frame, and no sheet", { o, panel })
    expect(o.ms !== null && o.ms <= 80, "at once, the pointer resting on the row having asked already", o.ms)
    await p.screenshot({ path: join(shots, "emails-desktop-contact.png") })
    await p.close()
  }

  await browser.close()
} finally {
  if (!process.env.KEEP) rmSync(stubs, { recursive: true, force: true })
}
console.log(`\nscreenshots in ${shots}`)
if (broken) { console.error(`\n${broken} check(s) failed\n`); process.exit(1) }
console.log("\nall checks passed\n")
