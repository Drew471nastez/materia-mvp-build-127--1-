/**
 * ===========================================================================
 *  THE PANEL WITH WHAT THE RULES ENGINE WRITES, MEASURED
 * ===========================================================================
 * The real panel and bell (components/app/notifications-modal.tsx) with a
 * mix of kinds from a stand-in server (scripts/render-notification-kinds.tsx),
 * on three phones and three computers:
 *
 *   - critical rows first, then the problem, then the next step, then the
 *     rest newest first
 *   - critical is a red word and a 6px red dot, a problem an amber dot, and
 *     nothing in the panel has a red ground bigger than a dot
 *   - the digest has a line per opportunity, each a link
 *   - one list, no tabs: every row, whatever its kind, and each says what
 *     it is on the line above its title (Payouts, Products, Milestone)
 *   - a tap on a critical row marks it read and keeps it; a tap on a launch
 *     puts it away
 *   - the "Set up payments" to-do steps aside for the Stripe row, and the
 *     bell does not count it
 *   - nothing is wider than the screen; no long task while it opens
 *   - ?legacy (the server before the SQL): every row still listed, no tones
 *
 *   node scripts/check-notification-kinds.mjs
 *   SHOTS_DIR=/some/dir node scripts/check-notification-kinds.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const fail = (m) => {
  console.error(`\n${m}\n`)
  process.exit(1)
}
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const css = await appCss(root)
const fonts = interFaces(root)
const stubs = join(root, ".notification-kinds-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-notification-kinds-")), "shots")
mkdirSync(shots, { recursive: true })

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const read = (p) =>
  p.evaluate(() => {
    const vis = (el) => el && el.getBoundingClientRect().width > 0 && getComputedStyle(el).visibility !== "hidden"
    const list = [...document.querySelectorAll("[data-notifications-list]")].find(vis)
    /* The rows that are showing: a view hides the rest (`hidden`), it does not remove them. */
    const items = list ? [...list.querySelectorAll("[data-notification-item]")].filter((i) => !i.hidden && i.getBoundingClientRect().height > 0) : []
    const box = list?.closest("[data-notifications-panel], [role=dialog]") ?? null
    const red = box
      ? [...box.querySelectorAll("*")].filter(vis).filter((el) => {
          const m = /rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/.exec(getComputedStyle(el).backgroundColor)
          if (!m || (m[4] !== undefined && +m[4] < 0.2)) return false
          const [r, g, b] = [+m[1], +m[2], +m[3]]
          const rect = el.getBoundingClientRect()
          return r > 170 && g < 120 && b < 120 && rect.width * rect.height > 64
        }).length
      : null
    return {
      badge: document.querySelector("[data-bell] [data-notification-badge]")?.textContent.trim() ?? null,
      rows: items.map((i) => {
        const meta = i.querySelector("[data-notification-meta]")
        const dot = meta?.querySelector("[data-tone-dot]")
        const word = meta?.querySelector("span.truncate")
        const r = i.getBoundingClientRect()
        return {
          title: i.querySelector("p.mt-1")?.textContent.trim() ?? "",
          tone: meta?.getAttribute("data-tone") ?? null,
          dot: dot ? { bg: getComputedStyle(dot).backgroundColor, w: Math.round(dot.getBoundingClientRect().width), h: Math.round(dot.getBoundingClientRect().height) } : null,
          word: word ? { text: word.textContent.trim(), color: getComputedStyle(word).color } : null,
          unread: i.hasAttribute("data-unread"),
          digest: [...i.querySelectorAll("[data-notification-digest] a")].map((a) => ({ text: a.textContent.trim(), href: a.getAttribute("href"), h: Math.round(a.getBoundingClientRect().height) })),
          w: Math.round(r.width),
          h: Math.round(r.height),
        }
      }),
      empty: list?.querySelector("[data-notifications-empty] p")?.textContent.trim() ?? null,
      redGrounds: red,
      overflow: {
        page: document.scrollingElement.scrollWidth - innerWidth,
        list: list ? list.scrollWidth - list.clientWidth : null,
        rows: items.filter((i) => i.scrollWidth > i.clientWidth + 1).length,
      },
      patches: window.__patches.slice(),
    }
  })

try {
  writeFileSync(
    join(stubs, "navigation.js"),
    `export const usePathname = () => "/app"
export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, back() {}, refresh() {} })
export const useSearchParams = () => new URLSearchParams()
`,
  )
  writeFileSync(
    join(stubs, "link.jsx"),
    `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { e.preventDefault(); window.__navigated = href; rest.onClick && rest.onClick(e) } }, children) })
`,
  )
  execFileSync(
    "npx",
    [
      "esbuild", "scripts/render-notification-kinds.tsx", "--bundle", "--format=iife", "--jsx=automatic",
      '--define:process.env.NODE_ENV="production"', "--alias:@=.",
      "--banner:js=var process={env:{NODE_ENV:'production'}};",
      "--alias:next/navigation=./.notification-kinds-probe/navigation.js", "--alias:next/link=./.notification-kinds-probe/link.jsx",
      `--outfile=${join(stubs, "app.js")}`, "--log-level=error",
    ],
    { cwd: root, stdio: "inherit", env: { ...process.env, NODE_PATH: join(root, "node_modules") } },
  )
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  writeFileSync(
    join(stubs, "index.html"),
    `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${fonts}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`,
  )
  if (!fonts) console.log("  (no production build here: text is measured in the fallback face, not Inter)")

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
  const viewports = [
    ["phone-360", { width: 360, height: 780, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
    ["phone-390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
    ["phone-430", { width: 430, height: 932, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
    ["desktop-1280", { width: 1280, height: 800 }],
    ["desktop-1440", { width: 1440, height: 900 }],
    ["desktop-1920", { width: 1920, height: 1080 }],
  ]
  const shoot = (label) => ["phone-390", "desktop-1440"].includes(label)
  const EXPECTED_ORDER = [
    "Stripe paused your payouts",
    "A payout of $184.20 failed",
    "Lightroom presets has no file to deliver",
    "Have you tried out OnePage?",
    "Your 10th sale",
    "3 opportunities this week",
    "Sell products together as a bundle",
    "New 5 star review on Portrait retouching course",
  ]
  /* The label over each of those, in the same order. */
  const EXPECTED_LABELS = ["Payouts", "Payouts", "Products", "OnePage", "Milestone", "Opportunities", "New in Storelib", "Reviews"]
  for (const [label, vp] of viewports) {
    const phone = label.startsWith("phone")
    console.log(`\n${label}`)
    const ctx = await browser.createBrowserContext()
    const p = await ctx.newPage()
    const errors = []
    p.on("pageerror", (e) => errors.push(e.message))
    await p.setViewport(vp)
    await p.evaluateOnNewDocument(() => {
      window.__longTasks = []
      try {
        new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__longTasks.push(Math.round(e.duration)))).observe({ type: "longtask", buffered: true })
      } catch {}
    })
    await p.goto(`file://${join(stubs, "index.html")}`)
    await sleep(2200)
    if (errors.length) fail(`The page threw: ${errors[0]}`)
    let r = await read(p)
    expect(r.badge === "5", "the bell: four unread rows and the OnePage to-do; Set up payments steps aside for the Stripe row", r.badge)

    /* Three opens: this machine is shared, so one slow frame is noise and two are not. */
    const opens = []
    for (let i = 0; i < 3; i++) {
      await p.evaluate(() => (window.__longTasks = []))
      await p.evaluate(() => window.__openPanel())
      await sleep(700)
      opens.push(await p.evaluate(() => window.__longTasks.slice()))
      if (i < 2) {
        await p.evaluate(() => window.__closePanel())
        await sleep(500)
      }
    }
    const longTasks = opens.filter((t) => t.length > 0).length >= 2 ? opens.flat() : []
    r = await read(p)
    expect(JSON.stringify(r.rows.map((x) => x.title)) === JSON.stringify(EXPECTED_ORDER), "critical first, then the problem, the next step, then the rest newest first", r.rows.map((x) => x.title))
    expect(longTasks.every((t) => t < 50), "no long task while it opens (three opens, two slow ones would fail)", opens)
    const [c1, c2, pr] = r.rows
    expect(c1?.tone === "critical" && c2?.tone === "critical" && c1.dot?.bg === "rgb(217, 45, 32)" && c1.dot.w === 6 && c1.dot.h === 6 && c1.word?.color === "rgb(180, 35, 24)" && c1.word.text === "Payouts",
      "critical: the word red and a 6px red dot", { tone: c1?.tone, dot: c1?.dot, word: c1?.word })
    expect(pr?.tone === "problem" && pr.dot?.bg === "rgb(220, 104, 3)" && pr.word?.color === "rgb(107, 114, 128)" && pr.word.text === "Products", "a problem: an amber dot, the word as any other", { dot: pr?.dot, word: pr?.word })
    expect(r.rows.slice(3).every((x) => x.tone === null && x.dot === null), "everything else untoned", r.rows.slice(3).map((x) => x.tone))
    expect(r.redGrounds === 0, "no red ground anywhere in the panel bigger than a dot", r.redGrounds)
    /* No tabs: "get rid of those category pills". What each row is, is the word above its title. */
    const tabs = await p.evaluate(() => document.querySelectorAll("[role=tablist], [role=tab], [data-tab], [data-tab-pill]").length)
    expect(tabs === 0, "no tabs and no pill anywhere in the panel", tabs)
    expect(JSON.stringify(r.rows.map((x) => x.word?.text ?? "")) === JSON.stringify(EXPECTED_LABELS), "every kind in the one list says what it is, above its title", r.rows.map((x) => x.word?.text ?? ""))
    const digest = r.rows.find((x) => x.title === "3 opportunities this week")
    expect(digest?.digest.length === 3 && digest.digest[0].href === "/app/emails/flow/new" && digest.digest.every((l) => l.h >= 16 && l.h <= 38), "the digest: three lines, each its own link, two lines at most", digest?.digest)
    expect(r.overflow.page <= 0 && (r.overflow.list ?? 0) <= 0 && r.overflow.rows === 0, "nothing wider than the screen", r.overflow)
    expect(r.rows.every((x) => x.w >= Math.min(vp.width, 380) - 2), "every row the panel's full width", r.rows.map((x) => x.w))
    if (shoot(label)) await p.screenshot({ path: join(shots, `${label}-all.png`) })
    const cut = await p.evaluate(() =>
      [...document.querySelectorAll("[data-notification-digest] a")].filter((a) => a.getBoundingClientRect().width > 0 && (a.scrollWidth > a.clientWidth + 1 || a.scrollHeight > a.clientHeight + 1)).map((a) => a.textContent.trim()),
    )
    expect(cut.length === 0, "the digest's lines are read whole, not cut", cut)
    /* The rest of the list, scrolled into view. */
    await p.evaluate(() => {
      const list = [...document.querySelectorAll("[data-notifications-list]")].find((l) => l.getBoundingClientRect().width > 0)
      if (list) list.scrollTop = list.scrollHeight
    })
    await sleep(250)
    if (shoot(label)) await p.screenshot({ path: join(shots, `${label}-all-scrolled.png`) })
    await p.evaluate(() => {
      const list = [...document.querySelectorAll("[data-notifications-list]")].find((l) => l.getBoundingClientRect().width > 0)
      if (list) list.scrollTop = 0
    })

    /* A tap on a critical row: opened, read, kept. A tap on the launch: opened, put away. */
    const tapRow = async (title) => {
      await p.evaluate((t) => {
        const row = [...document.querySelectorAll("[data-notification-item]")].find((i) => i.querySelector("p.mt-1")?.textContent.trim() === t && i.getBoundingClientRect().width > 0)
        row?.querySelector(":scope > a, :scope > button").click()
      }, title)
      await sleep(300)
      await p.evaluate(() => window.__openPanel())
      await sleep(700)
      return read(p)
    }
    let after = await tapRow("Stripe paused your payouts")
    const nav = await p.evaluate(() => window.__navigated)
    expect(nav === "/app/settings/payments", "the tap goes where it says, with the app's own link", nav)
    expect(after.patches.at(-1)?.action === "read" && after.patches.at(-1)?.ids?.[0] === "k1", "a critical row is marked read, not put away", after.patches.at(-1))
    expect(after.rows[0]?.title === "Stripe paused your payouts" && after.rows[0].unread === false, "and stays first until it is fixed", after.rows[0])
    after = await tapRow("Sell products together as a bundle")
    expect(after.patches.at(-1)?.action === "dismiss" && !after.rows.some((x) => x.title === "Sell products together as a bundle"), "a launch, once opened, is put away", after.patches.at(-1))
    if (errors.length) expect(false, "no errors in the page", errors)
    await ctx.close()

    /* Before the SQL: the route answers as it always did. */
    const ctx2 = await browser.createBrowserContext()
    const q = await ctx2.newPage()
    await q.setViewport(vp)
    await q.goto(`file://${join(stubs, "index.html")}?legacy`)
    await sleep(2200)
    await q.evaluate(() => window.__openPanel())
    await sleep(700)
    const old = await read(q)
    expect(old.badge === "6", "before the SQL: the bell counts the rows and both to-dos, as today", old.badge)
    expect(old.rows.length === 9 && old.rows.every((x) => x.tone === null), "every row listed, with no tones", { rows: old.rows.length, tones: old.rows.map((x) => x.tone) })
    if (shoot(label)) await q.screenshot({ path: join(shots, `${label}-before-sql.png`) })
    await ctx2.close()
  }
  await browser.close()
} finally {
  if (!process.env.KEEP) rmSync(stubs, { recursive: true, force: true })
}
console.log(`\nscreenshots in ${shots}`)
if (broken) {
  console.error(`\n${broken} check(s) failed\n`)
  process.exit(1)
}
console.log("\nall checks passed\n")
