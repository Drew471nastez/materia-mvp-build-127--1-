/**
 * ===========================================================================
 *  THE NOTIFICATIONS PANEL'S TWO BUTTONS, MEASURED
 * ===========================================================================
 * The real panel and the real bell badge (components/app/notifications-modal.tsx)
 * with a stand-in server (scripts/render-notifications-panel.tsx), at a
 * phone's width and a computer's:
 *
 *   - the header's buttons are 32px on a computer and 44px on a phone
 *   - their names show on hover on a computer, and never on a phone
 *   - "Unread only" shows it is on, filters the list, says "Show all" once
 *     on, is remembered after a reload, and moves nothing when pressed
 *   - "Mark all as read" empties the bell and the unread marks before the
 *     server answers, sends one request, and is disabled once nothing is
 *     unread; when the server says no, everything goes back and it says so
 *   - no close button; an unread row's mark is a near black bead, and
 *     nothing in the panel is violet
 *   - no tabs over the list: one list of everything, and every row says
 *     what it is (its label) on the line above its title
 *   - turning "Unread only" on fades the rows in, and on a computer the
 *     panel keeps its height
 *
 *   node scripts/check-notifications-panel.mjs
 *   SHOTS_DIR=/some/dir node scripts/check-notifications-panel.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const fail = (m) => {
  console.error(`\n${m}\n`)
  process.exit(1)
}
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const css = await appCss(root)
const stubs = join(root, ".notifications-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-notifications-")), "shots")
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
    const header = [...document.querySelectorAll("[data-notifications-header]")].find(vis)
    const button = (sel) => {
      const b = [...document.querySelectorAll(sel)].find(vis)
      if (!b) return null
      const r = b.getBoundingClientRect()
      const tip = b.querySelector("[data-tip]")
      return {
        w: Math.round(r.width), h: Math.round(r.height), pressed: b.getAttribute("aria-pressed"), disabled: b.disabled,
        bg: getComputedStyle(b.querySelector("[data-face]")).backgroundColor,
        face: Math.round(b.querySelector("[data-face]").getBoundingClientRect().width),
        tip: tip ? { text: tip.textContent.trim(), display: getComputedStyle(tip).display, opacity: getComputedStyle(tip).opacity } : null,
      }
    }
    const list = [...document.querySelectorAll("[data-notifications-list]")].find(vis)
    /* The rows are kept between views; a view shows some of them (the others are `hidden`). */
    const items = list ? [...list.querySelectorAll("[data-notification-item]:not([hidden])")] : []
    const badge = document.querySelector("[data-bell] [data-notification-badge]")
    return {
      headerH: header ? Math.round(header.getBoundingClientRect().height) : 0,
      listTop: list ? Math.round(list.getBoundingClientRect().top) : 0,
      filter: button("[data-notifications-filter]"),
      mark: button("[data-notifications-mark-all]"),
      items: items.length,
      unread: items.filter((i) => i.hasAttribute("data-unread")).length,
      empty: list?.querySelector("[data-notifications-empty]:not([hidden]) p")?.textContent.trim() ?? null,
      emptyLook: (() => {
        const e = list?.querySelector("[data-notifications-empty]:not([hidden])")
        if (!e) return null
        const icon = e.querySelector("svg").getBoundingClientRect()
        const text = e.querySelector("p")
        return {
          icon: `${Math.round(icon.width)}x${Math.round(icon.height)}`, iconColor: getComputedStyle(e.querySelector("svg")).color,
          parts: e.children.length, lines: Math.round(text.getBoundingClientRect().height / parseFloat(getComputedStyle(text).lineHeight)),
          textSize: getComputedStyle(text).fontSize, textColor: getComputedStyle(text).color, h: Math.round(e.getBoundingClientRect().height),
        }
      })(),
      badge: badge ? badge.textContent.trim() : null,
      alert: document.querySelector("[data-notifications-list]")?.parentElement?.querySelector("[role=alert]")?.textContent.trim() ?? null,
      saved: localStorage.getItem("storelib_notifications_unread_only"),
      patches: window.__patches.length,
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
export default React.forwardRef(function Link({ href, children, prefetch, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { e.preventDefault(); rest.onClick && rest.onClick(e) } }, children) })
`,
  )
  execFileSync(
    "npx",
    [
      "esbuild", "scripts/render-notifications-panel.tsx", "--bundle", "--format=iife", "--jsx=automatic",
      '--define:process.env.NODE_ENV="production"', "--alias:@=.",
      "--banner:js=var process={env:{NODE_ENV:'production'}};",
      "--alias:next/navigation=./.notifications-probe/navigation.js", "--alias:next/link=./.notifications-probe/link.jsx",
      `--outfile=${join(stubs, "app.js")}`, "--log-level=error",
    ],
    { cwd: root, stdio: "inherit", env: { ...process.env, NODE_PATH: join(root, "node_modules") } },
  )
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  writeFileSync(
    join(stubs, "index.html"),
    `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`,
  )

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
  const viewports = [
    ["phone-390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
    ["desktop-1440", { width: 1440, height: 900 }],
  ]
  for (const [label, vp] of viewports) {
    const phone = label.startsWith("phone")
    console.log(`\n${label}`)
    const ctx = await browser.createBrowserContext()
    const p = await ctx.newPage()
    const errors = []
    p.on("pageerror", (e) => errors.push(e.message))
    await p.setViewport(vp)
    const url = `file://${join(stubs, "index.html")}`
    await p.goto(url)
    await sleep(300)
    if (errors.length) fail(`The page threw: ${errors[0]}`)

    let r = await read(p)
    expect(r.badge === "3", "the bell counts the setup to-do and the two unread rows", r.badge)
    await p.evaluate(() => window.__openPanel())
    await sleep(600)
    r = await read(p)
    const size = phone ? 44 : 32
    expect(r.filter?.w === size && r.filter?.h === size && r.mark?.w === size && r.mark?.h === size, phone ? "both buttons a 44px target on a phone" : "both buttons 32px square", { filter: r.filter && [r.filter.w, r.filter.h], mark: r.mark && [r.mark.w, r.mark.h] })
    expect(r.filter?.face === 32 && r.mark?.face === 32, "and drawn 32px either way", [r.filter?.face, r.mark?.face])
    expect(r.items === 4 && r.unread === 3, "four notifications, three of them unread", { items: r.items, unread: r.unread })
    expect(r.filter?.pressed === "false" && r.mark?.disabled === false, "Unread only is off, and Mark all as read can be pressed", { pressed: r.filter?.pressed, disabled: r.mark?.disabled })
    if (phone) {
      expect(r.filter?.tip?.display === "none" && r.mark?.tip?.display === "none", "no tooltips on a phone", [r.filter?.tip, r.mark?.tip])
    } else {
      expect(r.filter?.tip?.opacity === "0" && r.mark?.tip?.opacity === "0", "tooltips hidden until asked", [r.filter?.tip?.opacity, r.mark?.tip?.opacity])
      /*
        The hover itself cannot be driven here: this headless Chromium
        reports no hover capability and ignores the emulation for it, so
        `(hover: hover)` never matches. Keyboard focus shows the same
        tooltip through the same element, and the hover rule is read from
        the stylesheet.
      */
      const hoverRule = /\.md\\:group-hover\\:opacity-100 \{\s*@media \(width >= 48rem\) \{\s*&:is\(:where\(\.group\):hover \*\) \{\s*@media \(hover: hover\) \{\s*opacity: 100%/.test(css)
        /* The built stylesheet is minified and nests the other way round. */
        || /@media \(hover:hover\)\{\.md\\:group-hover\\:opacity-100:is\(:where\(\.group\):hover \*\)\{opacity:(1|100%)\}/.test(css)
      expect(hoverRule, "on a computer, hovering a button shows its tooltip (the stylesheet's rule)", hoverRule)
      await p.focus("[data-notifications-mark-all]")
      await sleep(200)
      const hovered = await read(p)
      expect(hovered.mark?.tip?.opacity === "1" && hovered.mark.tip.text === "Mark all as read", 'focusing the check says "Mark all as read"', hovered.mark?.tip)
      await p.focus("[data-notifications-filter]")
      await sleep(200)
      const f = await read(p)
      expect(f.filter?.tip?.opacity === "1" && f.filter.tip.text === "Show unread only" && f.mark?.tip?.opacity === "0", 'focusing the filter says "Show unread only", and the other tooltip goes', [f.filter?.tip, f.mark?.tip?.opacity])
      await p.screenshot({ path: join(shots, `${label}-notifications-tooltip.png`) })
      const tipBox = await p.evaluate(() => {
        const t = document.querySelector("[data-notifications-filter] [data-tip]").getBoundingClientRect()
        const panel = document.querySelector("[data-notifications-panel]").getBoundingClientRect()
        return { inside: t.left >= panel.left && t.right <= panel.right, left: Math.round(t.left), right: Math.round(t.right) }
      })
      expect(tipBox.inside, "and the tooltip stays inside the panel", tipBox)
    }
    /* No X: the panel closes from outside it, by Escape, or by dragging the sheet down. */
    const look = await p.evaluate(() => {
      const vis = (el) => el && el.getBoundingClientRect().width > 0 && getComputedStyle(el).visibility !== "hidden"
      const header = [...document.querySelectorAll("[data-notifications-header]")].find(vis)
      const dot = [...document.querySelectorAll("[data-notification-item][data-unread] [data-unread-dot]")].find(vis)
      const box = header.closest("[data-notifications-panel], [role=dialog]") || document.body
      const violet = [...box.querySelectorAll("*")].filter(vis).filter((el) => { const c = getComputedStyle(el); return /139, 92, 246/.test(`${c.backgroundColor} ${c.color} ${c.boxShadow} ${c.borderTopColor}`) }).length
      const d = dot ? getComputedStyle(dot) : null
      return { buttons: [...header.querySelectorAll("button")].map((b) => b.getAttribute("aria-label")), dot: d && { bg: d.backgroundColor, shadow: d.boxShadow, w: Math.round(dot.getBoundingClientRect().width) }, violet }
    })
    expect(look.buttons.join() === "Unread only,Mark all as read", "no close button in the header: Unread only and Mark all as read, nothing else", look.buttons)
    expect(look.dot && look.dot.bg === "rgb(17, 17, 19)" && /rgba\(17, 17, 19, 0\.07\) 0px 0px 0px 3px/.test(look.dot.shadow) && look.dot.w === 8, "an unread row's mark is an 8px near black bead with a soft ring, not a violet dot", look.dot)
    expect(look.violet === 0, "nothing violet in the panel", look.violet)

    /* No tabs: one list, and the kind of each row is the word above its title. */
    const shape = await p.evaluate(() => {
      const vis = (el) => el && el.getBoundingClientRect().width > 0 && getComputedStyle(el).visibility !== "hidden"
      const header = [...document.querySelectorAll("[data-notifications-header]")].find(vis)
      const box = header.closest("[data-notifications-panel], [role=dialog]") || document.body
      const rows = [...box.querySelectorAll("[data-notification-item]:not([hidden])")].filter(vis)
      return {
        tabs: box.querySelectorAll("[role=tablist], [role=tab], [data-tab], [data-tab-pill]").length,
        rows: rows.map((row) => {
          const label = row.querySelector("[data-notification-label]")
          const title = row.querySelector("[data-notification-meta] + p")
          return {
            label: label ? label.textContent.trim() : "",
            above: !!label && !!title && label.getBoundingClientRect().bottom <= title.getBoundingClientRect().top + 0.5,
            title: title ? title.textContent.trim() : "",
          }
        }),
        headerToList: (() => {
          const list = [...box.querySelectorAll("[data-notifications-list]")].find(vis)
          return list ? Math.round(list.getBoundingClientRect().top - header.getBoundingClientRect().bottom) : null
        })(),
      }
    })
    expect(shape.tabs === 0, "no tabs, no pill: nothing between the header and the list", { tabs: shape.tabs, gap: shape.headerToList })
    /* The tab row took 56px here. What is left is the sheet's own few pixels of padding on a phone. */
    expect(shape.headerToList !== null && shape.headerToList <= 8, "the list starts right under the header, where the tab row was", shape.headerToList)
    expect(shape.rows.length === 4 && shape.rows.every((x) => x.label && x.above), "every row says what it is, above its title", shape.rows.map((x) => `${x.label} | ${x.title}`))
    expect(shape.rows.map((x) => x.label).join() === "OnePage,Reviews,Reviews,Updates", "OnePage, Reviews, Reviews, Updates", shape.rows.map((x) => x.label))
    await p.screenshot({ path: join(shots, `${label}-notifications-all.png`) })

    const before = { headerH: r.headerH, listTop: r.listTop }

    /* Unread only, watched frame by frame: the rows fade in, and a computer's panel keeps its height. */
    const bodyBefore = phone ? null : await p.evaluate(() => Math.round(document.querySelector("[data-notifications-panel] .max-h-\\[420px\\]").getBoundingClientRect().height))
    await p.evaluate(() => {
      window.__frames = []
      const body = document.querySelector("[data-notifications-panel] .max-h-\\[420px\\]")
      const t0 = performance.now()
      const tick = () => {
        const view = [...document.querySelectorAll("[data-notifications-list] > [data-notifications-view]:not([hidden])")].find((v) => v.getBoundingClientRect().width > 0)
        window.__frames.push({ fade: view ? +getComputedStyle(view).opacity : null, body: body ? Math.round(body.getBoundingClientRect().height) : null })
        if (performance.now() - t0 < 400) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    if (phone) await p.tap("[data-notifications-filter]")
    else await p.click("[data-notifications-filter]")
    await sleep(450)
    const frames = await p.evaluate(() => window.__frames)
    /* The frames before the press read 1; from the press on, the list starts faded and only rises. */
    const all = frames.map((f) => f.fade).filter((x) => x != null)
    const fades = all.slice(Math.max(0, all.findIndex((x) => x < 0.9)))
    expect(fades[0] < 0.9 && fades[fades.length - 1] === 1 && fades.slice(1).every((x, i) => x >= fades[i] - 0.001), "the unread rows fade in rather than appearing in one frame", fades.slice(0, 6).map((x) => Math.round(x * 100) / 100))
    if (!phone) {
      const heights = [...new Set(frames.map((f) => f.body))]
      expect(heights.every((h) => h === bodyBefore), "on a computer the panel holds its height while the list is shorter", { before: bodyBefore, during: heights })
    }
    r = await read(p)
    expect(r.filter?.pressed === "true" && r.filter.bg !== "rgba(0, 0, 0, 0)", "pressed, and looks it", { pressed: r.filter?.pressed, bg: r.filter?.bg })
    expect(r.items === 3 && r.unread === 3, "only the unread are listed", { items: r.items, unread: r.unread })
    if (!phone) expect(r.filter?.tip?.text === "Show all", 'its tooltip now says "Show all"', r.filter?.tip?.text)
    expect(r.saved === "1", "remembered for this viewer", r.saved)
    expect(r.headerH === before.headerH && r.listTop === before.listTop, "nothing moved", { before, after: { headerH: r.headerH, listTop: r.listTop } })
    await p.screenshot({ path: join(shots, `${label}-notifications-unread-only.png`) })

    await p.reload()
    await sleep(300)
    await p.evaluate(() => window.__openPanel())
    await sleep(600)
    r = await read(p)
    expect(r.filter?.pressed === "true" && r.items === 3, "and still on after a reload", { pressed: r.filter?.pressed, items: r.items })

    /* Mark all as read. */
    if (phone) await p.tap("[data-notifications-mark-all]")
    else await p.click("[data-notifications-mark-all]")
    await sleep(60)
    r = await read(p)
    expect(r.badge === null, "the bell empties at once, before the server answers", r.badge)
    expect(r.items === 0 && r.empty === "No unread notifications", '"No unread notifications" with the filter on', { items: r.items, empty: r.empty })
    /* "Smaller and less AI": a 20px bell in the muted grey, one line of
       14px text, nothing else. */
    const empty = r.emptyLook
    expect(empty && empty.icon === "20x20" && empty.iconColor === "rgb(156, 163, 175)" && empty.parts === 2 && empty.lines === 1
      && empty.textSize === "14px" && empty.textColor === "rgb(107, 114, 128)", "  a 20px muted bell and one 14px line, nothing more", empty)
    await p.screenshot({ path: join(shots, `${label}-notifications-empty.png`) })
    expect(r.mark?.disabled === true, "Mark all as read is disabled while it works", r.mark?.disabled)
    await sleep(600)
    r = await read(p)
    expect(r.patches === 1, "one request for all of them", r.patches)
    expect(r.badge === null && r.mark?.disabled === true, "and stays done, with nothing left to mark", { badge: r.badge, disabled: r.mark?.disabled })
    await p.screenshot({ path: join(shots, `${label}-notifications-all-read.png`) })
    if (phone) await p.tap("[data-notifications-filter]")
    else await p.click("[data-notifications-filter]")
    await sleep(250)
    r = await read(p)
    expect(r.items === 4 && r.unread === 0 && r.filter?.pressed === "false", "with the filter off, all four are there, all read", { items: r.items, unread: r.unread })
    expect(r.headerH === before.headerH && r.listTop === before.listTop, "and the header has not moved", { headerH: r.headerH, listTop: r.listTop })
    if (errors.length) expect(false, "no errors in the page", errors)
    await ctx.close()

    /* The server says no. */
    const ctx2 = await browser.createBrowserContext()
    const q = await ctx2.newPage()
    await q.setViewport(vp)
    await q.goto(`${url}?fail`)
    await sleep(300)
    await q.evaluate(() => window.__openPanel())
    await sleep(600)
    if (phone) await q.tap("[data-notifications-mark-all]")
    else await q.click("[data-notifications-mark-all]")
    await sleep(60)
    const optimistic = await read(q)
    await sleep(700)
    const rolled = await read(q)
    expect(optimistic.badge === null && optimistic.unread === 0, "a failing server: done on screen at first", { badge: optimistic.badge, unread: optimistic.unread })
    expect(rolled.badge === "1" || rolled.badge === "2" || rolled.badge === "3", "then the bell counts the unread rows again", rolled.badge)
    expect(rolled.unread === 2 && rolled.items === 4, "the two rows are unread again (the setup to-do stays read here)", { unread: rolled.unread, items: rolled.items })
    expect(rolled.alert === "Could not mark them as read. Try again.", "and the panel says so", rolled.alert)
    expect(rolled.mark?.disabled === false, "and it can be pressed again", rolled.mark?.disabled)
    await q.screenshot({ path: join(shots, `${label}-notifications-failed.png`) })
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
