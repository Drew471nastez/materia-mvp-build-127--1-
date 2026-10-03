/**
 * ===========================================================================
 *  THE PAGE MENU WHEN IT HAS TO SCROLL
 * ===========================================================================
 * "Looks bad when its scrollbar appears." The bar's page menu, opened with
 * every group open and more pages than fit, measured in Chromium with the
 * platform's scrollbars left ON (no --hide-scrollbars, which would hide the
 * very thing being measured):
 *
 *   the scroller reserves no width for a bar (offsetWidth - clientWidth = 0);
 *   every row, group rows and the selected one, ends the same distance from
 *   the menu's right edge as in a short menu that cannot scroll;
 *   the drawn thumb is 6px, inside the list, clear of the rounded corners,
 *   and shows while the list moves;
 *   the menu is never taller than the window allows, and its list is capped;
 *   a row focused from the keyboard draws its ring inside itself.
 *
 *   node scripts/check-page-menu-scroll.mjs      (SHOTS=dir for screenshots)
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const SHOTS = process.env.SHOTS ?? join(tmpdir(), "storelib-page-menu-scroll")
mkdirSync(SHOTS, { recursive: true })
/* A computer: the hover styles are under @media (hover: hover), which headless Chromium does not match. */
const css = (await appCss(root)).replace(/@media \(hover: ?hover\)/g, "@media all")
const out = mkdtempSync(join(tmpdir(), "storelib-pagemenu-"))
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-page-menu-scroll.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(out, "probe.js")}`,
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
  '--define:process.env.NODE_ENV="production"', `--alias:@=${root}`, "--loader:.css=empty"],
  { stdio: ["ignore", "ignore", "inherit"] })
const js = readFileSync(join(out, "probe.js"))
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${interFaces(root)}</style><style>${css}</style><style>body{margin:0;background:#0f0f0f;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="root"></div><script src="/probe.js"></script></body></html>`
const server = createServer((req, res) => {
  if (req.url.startsWith("/probe.js")) {
    res.writeHead(200, { "content-type": "text/javascript" })
    return res.end(js)
  }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}`

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const r1 = (n) => Math.round(n * 10) / 10

/** Opens the menu, opens every group, and reads its geometry. */
async function openMenu(p, { allGroups = true } = {}) {
  await p.click("[data-page-switcher]")
  await sleep(300)
  if (allGroups) {
    for (;;) {
      const closed = await p.$("[role='dialog'][aria-label='Pages'] [data-page-group-toggle][aria-expanded='false']")
      if (!closed) break
      await closed.evaluate((b) => b.click())
      await sleep(30)
    }
    await sleep(350)
  }
}

const READ = () => {
  const panel = document.querySelector("[role='dialog'][aria-label='Pages']")
  const list = panel.querySelector("[data-page-list-scroll]")
  const pr = panel.getBoundingClientRect()
  const lr = list.getBoundingClientRect()
  const cs = getComputedStyle(list)
  const edge = (el) => {
    const b = el.getBoundingClientRect()
    return { left: b.left - pr.left, right: pr.right - b.right, width: b.width }
  }
  const groups = [...list.querySelectorAll("[data-page-group-toggle]")].map(edge)
  const rows = [...list.querySelectorAll("[data-page-row]")].filter((r) => r.getBoundingClientRect().height > 0).map(edge)
  const current = list.querySelector("[aria-current='page']")
  const counts = [...list.querySelectorAll("[data-page-group-toggle] span:last-child")].map((s) => pr.right - s.getBoundingClientRect().right)
  const rail = panel.querySelector(".cp-overlay-rail")
  const thumb = rail?.querySelector(".cp-overlay-thumb")
  const tr = thumb?.getBoundingClientRect()
  return {
    vh: innerHeight,
    panel: { top: pr.top, bottom: pr.bottom, height: pr.height, radius: parseFloat(getComputedStyle(panel).borderTopRightRadius) },
    list: { top: lr.top, bottom: lr.bottom, height: lr.height, maxHeight: cs.maxHeight, scrolls: list.scrollHeight > list.clientHeight + 1, bar: list.offsetWidth - list.clientWidth },
    groups,
    rows,
    current: current ? edge(current) : null,
    counts,
    thumb: tr && tr.height > 0 ? { width: tr.width, height: tr.height, top: tr.top, bottom: tr.bottom, right: pr.right - tr.right, opacity: getComputedStyle(rail).opacity } : null,
  }
}

/* Puppeteer hides scrollbars by default; the bar is what is being measured, so it stays. */
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"], ignoreDefaultArgs: ["--hide-scrollbars"] })
try {
  /* The short menu: the rows' edges where nothing can scroll. */
  const ref = await browser.newPage()
  await ref.setViewport({ width: 1280, height: 800 })
  await ref.goto(`${origin}/?pages=short`, { waitUntil: "load" })
  await ref.waitForSelector("[data-page-switcher]")
  await openMenu(ref)
  const short = await ref.evaluate(READ)
  await ref.close()
  expect(!short.list.scrolls, "the short menu cannot scroll, so its edges are the reference", short.list)
  const refRight = short.rows[0]?.right
  const refGroupRight = short.groups[0]?.right
  console.log(`\nshort menu (cannot scroll): row ends ${r1(refRight)}px from the menu's edge, group rows ${r1(refGroupRight)}px`)

  for (const [w, h] of [[1280, 800], [1280, 600], [1280, 460]]) {
    console.log(`\n${w} x ${h}, 21 pages and 8 products, every group open`)
    const p = await browser.newPage()
    await p.setViewport({ width: w, height: h })
    await p.goto(`${origin}/?pages=long&current=terms-of-service`, { waitUntil: "load" })
    await p.waitForSelector("[data-page-switcher]")
    await openMenu(p)
    let m = await p.evaluate(READ)
    expect(m.list.scrolls, "the list has more than fits, so it scrolls", { list: r1(m.list.height), maxHeight: m.list.maxHeight })
    expect(m.list.bar === 0, "and reserves no width for a scrollbar", `${m.list.bar}px`)
    const rights = [...new Set(m.rows.map((r) => r1(r.right)))]
    const groupRights = [...new Set(m.groups.map((g) => r1(g.right)))]
    expect(rights.length === 1 && Math.abs(rights[0] - refRight) < 0.6, "every row ends where it does in a menu that cannot scroll", { rows: rights, short: r1(refRight) })
    expect(groupRights.length === 1 && Math.abs(groupRights[0] - refGroupRight) < 0.6, "and every group row", { groups: groupRights, short: r1(refGroupRight) })
    expect(m.current && Math.abs(m.current.right - refRight) < 0.6 && Math.abs(m.current.left - short.rows[0].left) < 0.6, "the page being edited keeps the same edges", m.current && { left: r1(m.current.left), right: r1(m.current.right) })
    expect(new Set(m.counts.map(r1)).size === 1, "the group counts end on one x", [...new Set(m.counts.map(r1))])
    expect(m.panel.bottom <= m.vh - 8 + 0.5, "the menu stops 8px or more above the window's foot", { bottom: r1(m.panel.bottom), window: m.vh })
    expect(m.list.height <= 440.5, "and its list is never taller than 440px", r1(m.list.height))
    console.log(`  --    menu ${r1(m.panel.height)}px tall (${Math.round((m.panel.height / m.vh) * 100)}% of the window), list ${r1(m.list.height)}px`)

    /* Move the list: the thumb shows, over the content, inside the list. */
    const box = await (await p.$("[data-page-list-scroll]")).boundingBox()
    await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await p.mouse.wheel({ deltaY: 120 })
    await sleep(320)
    m = await p.evaluate(READ)
    expect(!!m.thumb, "a thumb is drawn over the list", m.thumb)
    if (m.thumb) {
      expect(Math.abs(m.thumb.width - 6) < 0.5 && Number(m.thumb.opacity) > 0.9, "6px wide, and showing while the list moves", { width: m.thumb.width, opacity: m.thumb.opacity })
      expect(m.thumb.top >= m.list.top + 4 && m.thumb.bottom <= m.list.bottom - 4, "inside the list, clear of the search and the foot", { thumb: [r1(m.thumb.top), r1(m.thumb.bottom)], list: [r1(m.list.top), r1(m.list.bottom)] })
      expect(m.thumb.top - m.panel.top >= m.panel.radius && m.panel.bottom - m.thumb.bottom >= m.panel.radius, "and further from the menu's top and foot than its corner radius", { fromTop: r1(m.thumb.top - m.panel.top), fromFoot: r1(m.panel.bottom - m.thumb.bottom), radius: m.panel.radius })
    }
    const after = [...new Set(m.rows.map((r) => r1(r.right)))]
    expect(after.length === 1 && after[0] === rights[0], "scrolling moves no row sideways", after)
    await p.screenshot({ path: join(SHOTS, `page-menu-${h}.png`), clip: { x: w / 2 - 170, y: 0, width: 340, height: h } })

    /* From the search into the list by keyboard: the ring is inside the row. */
    await p.evaluate(() => document.querySelector("[data-page-list-scroll]").scrollTo(0, 0))
    await p.focus("[role='dialog'][aria-label='Pages'] input")
    await p.keyboard.press("ArrowDown")
    await p.keyboard.press("ArrowDown")
    const ring = await p.evaluate(() => {
      const el = document.activeElement
      const list = document.querySelector("[data-page-list-scroll]")
      const b = el.getBoundingClientRect()
      const l = list.getBoundingClientRect()
      return { row: el.getAttribute("data-page-row"), shadow: getComputedStyle(el).boxShadow, inside: b.left >= l.left && b.right <= l.left + list.clientWidth }
    })
    expect(/inset/.test(ring.shadow) && ring.inside, "a row focused from the keyboard draws its ring inside itself, inside the list", ring)
    await p.close()
  }
} finally {
  await browser.close()
  server.close()
}

console.log(broken ? `\n${broken} failed\n` : "\nall passed\n")
console.log(`screenshots: ${SHOTS}`)
process.exit(broken ? 1 : 0)
