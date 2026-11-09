/**
 * ===========================================================================
 *  ROUND AO: A BLOCK'S MORE MENU IN ITS ROW, NOTHING OVER ITS TABS
 * ===========================================================================
 * The real editor (scripts/onepage-probe-server.mjs) in headless Chromium, at
 * 390x844 (a phone: touch) and 1440x900 (a mouse), deviceScaleFactor 1:
 *
 *   row        every block's row, closed and open, has the more button; no
 *              control in the row overlaps another or the title, nothing
 *              leaves the card, and a long title is cut with an ellipsis
 *   menu       the button opens a menu (a computer) or the shared sheet (a
 *              phone): Move up, Move down, then Remove in red; Move up is
 *              disabled on the first block; Move down moves the block
 *   remove     Remove opens the Archive / Delete question under the row;
 *              Escape cancels it; Delete takes the block off
 *   tabs       an open block's settings start with Settings | Layout: no
 *              move pair and no Remove above them
 *   group      a group's block has its own more button in its row, with Move
 *              out of group, and its Remove asks Move out or Delete
 *   keys       the button has a name; Enter opens the menu and the arrows
 *              walk it (a computer)
 *
 *   SHOTS=<dir> node scripts/check-onepage-editor-ao.mjs
 *   REPORT=1   numbers only, nothing fails
 */
import { mkdirSync } from "node:fs"
import puppeteer from "puppeteer-core"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const REPORT = process.env.REPORT === "1"
const SHOTS = process.env.SHOTS || null
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failures = 0
const expect = (ok, label, detail) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail !== undefined ? `  ${JSON.stringify(detail)}` : ""}`)
  if (!ok) failures++
}
const fail = (m) => { throw new Error(m) }

const blocks = [
  { id: "hdr", type: "header", enabled: true, sort_order: 0, data: { show_avatar: true, show_name: true, show_bio: true } },
  { id: "lnk", type: "link_button", enabled: true, sort_order: 1, data: { label: "Shop the prints and the new spring collection", url: "https://example.com/shop" } },
  { id: "sig", type: "email_capture", enabled: true, sort_order: 2, data: { headline: "Join my newsletter", description: "Updates", button_preset: "subscribe" } },
  { id: "hed", type: "heading", enabled: true, sort_order: 3, data: { text: "Work with me", size: "medium", alignment: "center" } },
  {
    id: "grp", type: "group", enabled: true, sort_order: 4,
    data: {
      title: "Favourites", layout: "stack",
      children: [
        { id: "c1", type: "link_button", enabled: true, sort_order: 0, data: { label: "First favourite with a long name", url: "https://example.com/1" } },
        { id: "c2", type: "link_button", enabled: true, sort_order: 1, data: { label: "Second", url: "https://example.com/2" } },
      ],
    },
  },
  { id: "lk2", type: "link_button", enabled: false, sort_order: 5, data: { label: "Old link", url: "https://example.com/old" } },
]
const { base, server } = await serveEditorProbe({ blocks, fail })
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"], protocolTimeout: 600000 })
const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }
const DESK = { width: 1440, height: 900, deviceScaleFactor: 1 }

async function open(vp) {
  const p = await browser.newPage()
  await p.setViewport(vp)
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 240)))
  p.on("console", (m) => {
    if (m.type() !== "error") return
    const t = m.text()
    if (/Failed to load resource|net::ERR_|favicon/.test(t)) return
    errors.push(t.slice(0, 240))
  })
  await p.goto(`${base}/app/onepage#links`)
  await p.waitForSelector("[data-add-block]", { timeout: 30000 })
  await sleep(2000)
  return { p, errors }
}

async function press(p, vp, sel, { scroll = true } = {}) {
  const box = await p.evaluate((sel, scroll) => {
    const el = document.querySelector(sel)
    if (!el) return null
    if (scroll) el.scrollIntoView({ block: "center" })
    const r = el.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  }, sel, scroll)
  if (!box) return false
  await sleep(150)
  if (vp.hasTouch) await p.touchscreen.tap(box.x, box.y)
  else await p.mouse.click(box.x, box.y)
  return true
}

const shot = async (p, name) => {
  if (!SHOTS) return
  await p.screenshot({ path: `${SHOTS}/${name}.png` })
  console.log(`        shot ${SHOTS}/${name}.png`)
}

/* Every visible control in a row, and the title: none overlaps another, all inside the card. */
const rowGeometry = (p, rowSel) => p.evaluate((rowSel) => {
  const row = document.querySelector(rowSel)
  if (!row) return null
  const card = row.closest("[data-block-id]") ?? row.parentElement
  const cardBox = card.getBoundingClientRect()
  /* The row's tool cluster is measured tool by tool. */
  const parts = [...row.children].flatMap((el) => (el.hasAttribute("data-row-tools") ? [...el.children] : [el])).filter((el) => {
    const s = getComputedStyle(el)
    if (s.display === "none" || s.visibility === "hidden") return false
    const b = el.getBoundingClientRect()
    return b.width > 0 && b.height > 0
  }).map((el) => {
    /* A wrapper with display: contents has no box of its own: take what it holds. */
    const target = getComputedStyle(el).display === "contents" ? el.firstElementChild : el
    const b = target.getBoundingClientRect()
    return { name: target.getAttribute("data-block-menu") !== null ? "menu" : target.getAttribute("data-block-open") ? "title" : target.getAttribute("role") === "switch" ? "switch" : target.tagName.toLowerCase(), l: b.left, r: b.right, t: b.top, b: b.bottom }
  })
  let overlaps = []
  for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
    const a = parts[i], c = parts[j]
    const x = Math.min(a.r, c.r) - Math.max(a.l, c.l)
    const y = Math.min(a.b, c.b) - Math.max(a.t, c.t)
    if (x > 0.5 && y > 0.5) overlaps.push(`${a.name}/${c.name} ${x.toFixed(1)}px`)
  }
  const outside = parts.filter((q) => q.l < cardBox.left - 0.5 || q.r > cardBox.right + 0.5).map((q) => q.name)
  const titleEl = row.querySelector("[data-block-open] p, [data-group-child-title]") ?? row.querySelector("span.truncate")
  const title = titleEl ? { width: Math.round(titleEl.getBoundingClientRect().width), cut: titleEl.scrollWidth > titleEl.clientWidth + 1, ellipsis: getComputedStyle(titleEl).textOverflow } : null
  const menu = row.querySelector("[data-block-menu]")
  const menuBox = menu?.getBoundingClientRect()
  const lines = new Set(parts.map((q) => Math.round((q.t + q.b) / 2))).size
  return { parts: parts.length, overlaps, outside, title, menu: menuBox ? { w: Math.round(menuBox.width), h: Math.round(menuBox.height), label: menu.getAttribute("aria-label") } : null, height: Math.round(row.getBoundingClientRect().height), lines }
}, rowSel)

async function closeAny(p) {
  await p.keyboard.press("Escape")
  await sleep(600)
}

async function run(vp) {
  const w = vp.width
  console.log(`\nAt ${w}${vp.hasTouch ? " (touch)" : ""}`)
  const { p, errors } = await open(vp)
  const order = () => p.evaluate(() => [...document.querySelectorAll("[data-block-id]")].map((e) => e.getAttribute("data-block-id")))

  /* 1. Every row, closed. */
  for (const id of ["lnk", "sig", "hed", "grp", "lk2"]) {
    const g = await rowGeometry(p, `[data-block-id="${id}"] [data-reorder-zone]`)
    console.log(`        ${id}: ${g?.parts} parts, title ${JSON.stringify(g?.title)}, menu ${JSON.stringify(g?.menu)}, row ${g?.height}px on ${g?.lines} line(s)`)
    expect(!!g?.menu, `${w}: ${id}: the closed row has the more button`, g?.menu?.label)
    expect(g && g.overlaps.length === 0, `${w}: ${id}: nothing in the row overlaps`, g?.overlaps)
    expect(g && g.outside.length === 0, `${w}: ${id}: nothing leaves the card`, g?.outside)
    expect(g && g.title && g.title.width >= 60, `${w}: ${id}: the title keeps room to read (>= 60px)`, g?.title)
  }
  const long = await rowGeometry(p, `[data-block-id="lnk"] [data-reorder-zone]`)
  expect(long?.title?.cut && long.title.ellipsis === "ellipsis", `${w}: a long title is cut with an ellipsis`, long?.title)
  expect(!(await p.$('[data-block-id="hdr"] [data-block-menu]')), `${w}: the profile header has no more button (it cannot move or go)`)
  await p.evaluate(() => document.querySelector('[data-block-id="lnk"]').scrollIntoView({ block: "center" }))
  await sleep(300)
  await shot(p, `ao-rows-${w}`)

  /* 2. The menu. */
  await press(p, vp, '[data-block-id="lnk"] [data-block-menu]')
  await sleep(800)
  const surface = await p.evaluate(() => (document.querySelector("[data-action-list]") ? "menu" : document.querySelector("[data-action-sheet]") ? "sheet" : null))
  expect(surface === (vp.hasTouch ? "sheet" : "menu"), `${w}: the more button opens ${vp.hasTouch ? "the shared sheet" : "a menu"}`, surface)
  const items = await p.evaluate(() => [...document.querySelectorAll("[data-action-list] [data-action-item], [data-action-sheet] [data-action-item]")].map((el) => ({ id: el.getAttribute("data-action-item"), text: el.textContent.trim(), disabled: el.hasAttribute("data-disabled") || el.disabled, color: getComputedStyle(el).color })))
  console.log(`        items ${JSON.stringify(items.map((i) => `${i.text}${i.disabled ? " (off)" : ""} ${i.color}`))}`)
  expect(items.map((i) => i.id).join() === "block-move-up,block-move-down,block-remove", `${w}: Move up, Move down, Remove`, items.map((i) => i.text))
  const removeItem = items.find((i) => i.id === "block-remove")
  expect(removeItem && /rgb\(196, 41, 12\)/.test(removeItem.color), `${w}: Remove is in the danger colour`, removeItem?.color)
  if (!vp.hasTouch) {
    const where = await p.evaluate(() => {
      const m = document.querySelector("[data-action-list]").getBoundingClientRect()
      const b = document.querySelector('[data-block-id="lnk"] [data-block-menu]').getBoundingClientRect()
      return { gap: Math.round(m.top - b.bottom), rightAligned: Math.abs(m.right - b.right) < 2, inView: m.right <= innerWidth && m.bottom <= innerHeight }
    })
    expect(where.gap >= 0 && where.gap <= 10 && where.inView, `${w}: the menu opens under its button, in view`, where)
  }
  await shot(p, `ao-menu-open-${w}`)
  /* Move down, from the menu. */
  const before = await order()
  const downSel = vp.hasTouch ? '[data-action-sheet] [data-action-item="block-move-down"]' : '[data-action-list] [data-action-item="block-move-down"]'
  await press(p, vp, downSel, { scroll: false })
  await sleep(1200)
  const after = await order()
  expect(after.indexOf("lnk") === before.indexOf("lnk") + 1, `${w}: Move down moves it one place`, { before: before.join(), after: after.join() })
  /* Move down is off on the last block (shown, never hidden). */
  await press(p, vp, '[data-block-id="lk2"] [data-block-menu]')
  await sleep(800)
  const downOff = await p.evaluate(() => {
    const el = document.querySelector('[data-action-list] [data-action-item="block-move-down"], [data-action-sheet] [data-action-item="block-move-down"]')
    return el ? el.hasAttribute("data-disabled") || el.disabled : null
  })
  expect(downOff === true, `${w}: Move down is shown and off on the last block`, downOff)
  await closeAny(p)

  /* 3. Remove: the question under the row, Escape, then Delete. */
  const ask = async () => {
    await press(p, vp, '[data-block-id="hed"] [data-block-menu]')
    await sleep(800)
    await press(p, vp, vp.hasTouch ? '[data-action-sheet] [data-action-item="block-remove"]' : '[data-action-list] [data-action-item="block-remove"]', { scroll: false })
    await sleep(900)
  }
  await ask()
  const q = await p.evaluate(() => {
    const card = document.querySelector('[data-block-id="hed"]')
    const row = card.querySelector("[data-reorder-zone]").getBoundingClientRect()
    const qq = card.querySelector("[data-delete-question]")
    if (!qq) return null
    const b = qq.getBoundingClientRect()
    return { under: b.top >= row.bottom - 0.5 && b.top - row.bottom < 16, h: Math.round(b.height), focus: document.activeElement?.hasAttribute("data-block-archive") ? "archive" : document.activeElement?.getAttribute("data-block-delete") !== null && document.activeElement?.hasAttribute("data-block-delete") ? "delete" : document.activeElement?.tagName, text: qq.textContent.trim().slice(0, 60) }
  })
  expect(q && q.under && q.h > 0, `${w}: Remove opens the question right under the row`, q)
  expect(q && q.focus === "archive", `${w}: focus lands on Archive, the first choice`, q?.focus)
  await shot(p, `ao-remove-question-${w}`)
  await p.keyboard.press("Escape")
  await sleep(700)
  const cancelled = await p.evaluate(() => {
    const qq = document.querySelector('[data-block-id="hed"] [data-delete-question]')
    return !qq || qq.getBoundingClientRect().height < 1 || !!qq.closest("[inert]")
  })
  expect(cancelled, `${w}: Escape cancels it`)
  await ask()
  await press(p, vp, '[data-block-id="hed"] [data-block-delete]')
  await sleep(1000)
  expect(!(await p.$('[data-block-id="hed"]')), `${w}: Delete takes the block off`)

  /* 4. An open block: Settings | Layout first, nothing above. */
  await press(p, vp, '[data-block-open="sig"]')
  await sleep(1000)
  const top = await p.evaluate(() => {
    const card = document.querySelector('[data-block-id="sig"]')
    const settings = card.querySelector("[data-block-settings]")
    const tabs = settings?.querySelector("[data-block-tabs]")
    if (!settings || !tabs) return null
    const rs = settings.getBoundingClientRect()
    const rt = tabs.querySelector("[role=tablist]")?.getBoundingClientRect() ?? tabs.getBoundingClientRect()
    const above = [...settings.querySelectorAll("button, a, input")].filter((el) => {
      const b = el.getBoundingClientRect()
      return b.height > 0 && b.bottom <= rt.top + 0.5
    }).map((el) => el.textContent.trim().slice(0, 20) || el.getAttribute("aria-label"))
    return { gapToTabs: Math.round(rt.top - rs.top), above, menuStillInRow: !!card.querySelector("[data-reorder-zone] [data-block-menu]"), foot: !!settings.querySelector("[data-block-foot], [data-block-bar]") }
  })
  console.log(`        open sig: ${JSON.stringify(top)}`)
  expect(top && top.above.length === 0 && !top.foot, `${w}: nothing sits above Settings | Layout`, top)
  expect(top && top.gapToTabs <= 20, `${w}: the tabs are the first thing in the open block (<= 20px from its top, the padding)`, top?.gapToTabs)
  expect(top && top.menuStillInRow, `${w}: the open block's row still has the more button`)
  const openRow = await rowGeometry(p, '[data-block-id="sig"] [data-reorder-zone]')
  expect(openRow && openRow.overlaps.length === 0, `${w}: the open row's controls do not overlap`, openRow?.overlaps)
  await p.evaluate(() => document.querySelector('[data-block-id="sig"]').scrollIntoView({ block: "start" }))
  await sleep(400)
  await shot(p, `ao-block-open-tabs-${w}`)
  await press(p, vp, '[data-block-open="sig"]')
  await sleep(800)

  /* 5. A group's blocks. */
  await press(p, vp, '[data-block-open="grp"]')
  await sleep(1000)
  const childRow = await rowGeometry(p, '[data-block-id="grp"] [data-group-child-item="c1"] > [draggable]')
  console.log(`        group child row: ${JSON.stringify(childRow)}`)
  expect(!!childRow?.menu, `${w}: a group's block has its own more button`, childRow?.menu)
  expect(childRow && childRow.overlaps.length === 0, `${w}: and its row does not overlap`, childRow?.overlaps)
  await press(p, vp, '[data-group-child-item="c1"] [data-block-menu]')
  await sleep(800)
  const childItems = await p.evaluate(() => [...document.querySelectorAll("[data-action-list] [data-action-item], [data-action-sheet] [data-action-item]")].map((el) => el.getAttribute("data-action-item")))
  expect(childItems.join() === "block-move-up,block-move-down,block-move-out,block-remove", `${w}: Move up, Move down, Move out of group, Remove`, childItems)
  await shot(p, `ao-group-menu-${w}`)
  const opened = await p.evaluate(() => !!document.querySelector('[data-group-child-settings="c1"]'))
  expect(!opened, `${w}: pressing the more button does not open the child's settings`, opened)
  await press(p, vp, vp.hasTouch ? '[data-action-sheet] [data-action-item="block-remove"]' : '[data-action-list] [data-action-item="block-remove"]', { scroll: false })
  await sleep(900)
  const childQ = await p.evaluate(() => {
    const qq = document.querySelector('[data-group-child-item="c1"] [data-delete-question]')
    return qq && qq.getBoundingClientRect().height > 0 ? { keep: !!qq.querySelector("[data-block-keep]"), del: !!qq.querySelector("[data-block-delete]") } : null
  })
  expect(childQ && childQ.keep && childQ.del, `${w}: its Remove asks Move out or Delete`, childQ)
  await press(p, vp, '[data-group-child-item="c1"] [data-block-delete]')
  await sleep(1000)
  const kids = await p.evaluate(() => [...document.querySelectorAll('[data-block-id="grp"] [data-group-child-item]')].map((e) => e.getAttribute("data-group-child-item")))
  expect(kids.join() === "c2", `${w}: Delete takes it out of the group`, kids)
  /* The child's own settings: nothing over its editor. */
  await press(p, vp, '[data-group-child-item="c2"] [data-group-child-toggle]', { scroll: true }).catch(() => {})
  await sleep(300)
  await p.evaluate(() => document.querySelector('[data-group-child-item="c2"] > [draggable]')?.click())
  await sleep(900)
  const childTop = await p.evaluate(() => {
    const s = document.querySelector('[data-group-child-settings="c2"]')
    return s ? { foot: !!s.querySelector("[data-block-foot], [data-block-bar], [data-block-remove]") } : null
  })
  expect(childTop && !childTop.foot, `${w}: a group block's settings have no move or Remove bar`, childTop)

  /* 6. Keys, on a computer. */
  if (!vp.hasTouch) {
    await p.focus('[data-block-id="sig"] [data-block-menu]')
    await p.keyboard.press("Enter")
    await sleep(500)
    const kb = await p.evaluate(() => ({ open: !!document.querySelector("[data-action-list]"), focused: document.activeElement?.getAttribute("data-action-item") }))
    await p.keyboard.press("ArrowDown")
    await sleep(150)
    const kb2 = await p.evaluate(() => document.activeElement?.getAttribute("data-action-item"))
    expect(kb.open && !!kb2, `${w}: Enter opens the menu, and the arrows walk its rows`, { ...kb, next: kb2 })
    await p.keyboard.press("Escape")
    await sleep(400)
    const back = await p.evaluate(() => document.activeElement?.hasAttribute("data-block-menu"))
    expect(back, `${w}: Escape gives focus back to the more button`)
  }
  expect(errors.length === 0, `${w}: no page errors`, errors.slice(0, 3))
  await p.close()
}

try {
  for (const vp of [PHONE, DESK]) await run(vp)
} finally {
  await browser.close()
  server.close()
}
console.log(`\n${failures ? `${failures} failed` : "all passed"}`)
if (failures && !REPORT) process.exit(1)
