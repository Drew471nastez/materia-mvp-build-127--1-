/**
 * ===========================================================================
 *  THE BUILDER'S MENUS, MEASURED ACROSS
 * ===========================================================================
 * "This kind of UI misaligned should never happen." The page menu's group
 * rows and their children were each placed on their own: a child's name sat
 * to the LEFT of the group it belongs to, and the highlights stepped in and
 * out down the list. This measures every menu in the builder against one
 * rule, at 390 and 1280:
 *
 *   every label of the same level in a menu starts at one x;
 *   every row's highlight has the same left and right edges;
 *   the ticks, counts and actions on the right end at one x;
 *   a child's label is one deliberate step in from its group's.
 *
 * The components are the real ones (scripts/render-menu-align.tsx): the page
 * menu in both skins and all three branches, the link and icon pickers, the
 * sidebar's menus and link lists, the menu field, and the Publish panel with
 * a check that found more than it lists.
 *
 *   PROBE_CSS=source node scripts/check-builder-menu-align.mjs
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || process.env.CHROMIUM || "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const css = await appCss(root)
const inter = interFaces(root)
if (!inter) console.log("(no build to take Inter from: text is measured in the fallback face)")
const stubs = join(root, ".menu-align-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || process.env.SHOTS || join(mkdtempSync(join(tmpdir(), "storelib-menu-align-")), "shots")
mkdirSync(shots, { recursive: true })
const PREFIX = "menualign-"

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const note = (what, got) => console.log(`  --    ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const same = (xs) => xs.length > 0 && Math.max(...xs) - Math.min(...xs) <= 0.6
const r1 = (n) => Math.round(n * 10) / 10

/**
 * Where an element's WORDS start and end, not its box: a heading with
 * padding and a row whose text is a flex child have to be comparable.
 */
const MEASURE = `
window.__textBox = (el) => {
  if (!el) return null
  const range = document.createRange()
  let left = Infinity, right = -Infinity
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    if (!n.nodeValue.trim()) continue
    range.selectNodeContents(n)
    for (const r of range.getClientRects()) {
      if (r.width === 0) continue
      left = Math.min(left, r.left)
      right = Math.max(right, r.right)
    }
  }
  return left === Infinity ? null : { left, right }
}
/** The right edge of the last glyph on a row: a tick, a bin, a count. */
window.__rightMark = (el) => {
  let right = -Infinity
  for (const svg of el.querySelectorAll("svg")) {
    const r = svg.getBoundingClientRect()
    if (r.width) right = Math.max(right, r.right)
  }
  const t = window.__textBox(el)
  return { svg: right === -Infinity ? null : right, text: t ? t.right : null }
}
`

/* ── the page menu, in whichever skin ──────────────────────────────────── */
const READ_PAGE_LIST = `(list) => {
  const out = { groups: [], rows: [], box: null }
  const scroll = list.querySelector("[data-page-list-scroll]")
  const sb = scroll.getBoundingClientRect()
  const cs = getComputedStyle(scroll)
  out.box = { left: sb.left + parseFloat(cs.paddingLeft), right: sb.right - parseFloat(cs.paddingRight) }
  for (const section of list.querySelectorAll("[data-page-group]")) {
    const toggle = section.querySelector("[data-page-group-toggle]")
    const head = toggle || section.querySelector("h3")
    const t = window.__textBox(toggle ? toggle.querySelector("span.flex-1") : head)
    const hb = (toggle || section.querySelector("ul")).getBoundingClientRect()
    const count = toggle ? toggle.lastElementChild : null
    const action = section.querySelector("h3") ? section.querySelector("h3").parentElement.querySelector("button") : null
    out.groups.push({
      key: section.getAttribute("data-page-group"),
      label: t ? t.left : null,
      hl: toggle ? { left: hb.left, right: hb.right } : null,
      rightMark: count ? window.__textBox(count).right : action ? window.__textBox(action).right : null,
      kind: toggle ? "toggle" : action ? "heading+action" : "heading",
    })
    for (const row of section.querySelectorAll("[data-page-row]")) {
      const li = row.closest("li")
      const rb = row.getBoundingClientRect()
      const t2 = window.__textBox(row)
      const mark = li ? window.__rightMark(li) : { svg: null, text: null }
      out.rows.push({
        group: section.getAttribute("data-page-group"),
        key: row.getAttribute("data-page-row"),
        label: t2 ? t2.left : null,
        hl: { left: rb.left, right: rb.right },
        tick: mark.svg,
        current: row.getAttribute("aria-current") === "page",
      })
    }
  }
  const foot = list.querySelector("[data-page-list-scroll]").parentElement.lastElementChild
  const footBtn = foot && foot.querySelector && foot !== list.querySelector("[data-page-list-scroll]") ? foot.querySelector("button") : null
  if (footBtn) {
    const b = footBtn.getBoundingClientRect()
    out.foot = { label: window.__textBox(footBtn).left, hl: { left: b.left, right: b.right } }
  }
  const search = list.querySelector("input[aria-label='Search pages']")
  if (search) {
    const sr = search.getBoundingClientRect()
    const cs2 = getComputedStyle(search)
    const clear = list.querySelector("button[aria-label='Clear the search']")
    out.search = {
      /* The dark menu's search is a bare input in a row; the light one is a field with an icon in it. */
      text: sr.left + parseFloat(cs2.paddingLeft) + parseFloat(cs2.borderLeftWidth),
      field: { left: sr.left, right: sr.right },
      clear: clear ? [...clear.querySelectorAll("svg")].map((s) => s.getBoundingClientRect().right)[0] ?? null : null,
    }
  }
  return out
}`

function reportList(name, read, { collapsible }) {
  console.log(`\n  ${name}`)
  const groupLabels = read.groups.map((g) => g.label).filter((x) => x !== null)
  const rowLabels = read.rows.map((r) => r.label).filter((x) => x !== null)
  const left = read.box.left
  note("group labels, from the list's content edge", groupLabels.map((x) => r1(x - left)))
  note("row labels", [...new Set(rowLabels.map((x) => r1(x - left)))])
  note("highlights, left..right from the content edge", [
    ...new Set([...read.groups.filter((g) => g.hl).map((g) => g.hl), ...read.rows.map((r) => r.hl)].map((b) => `${r1(b.left - left)}..${r1(b.right - read.box.right)}`)),
  ])
  const marks = [...read.groups.map((g) => g.rightMark), ...read.rows.map((r) => r.tick)].filter((x) => x !== null && x !== undefined)
  note("right column, from the content's right edge", [...new Set(marks.map((x) => r1(read.box.right - x)))])
  if (read.foot) note("the foot's action: label, highlight", [r1(read.foot.label - left), `${r1(read.foot.hl.left - left)}..${r1(read.foot.hl.right - read.box.right)}`])
  if (read.search)
    note("the search: its words, its box, and its clear button's glyph", {
      words: r1(read.search.text - left),
      box: `${r1(read.search.field.left - left)}..${r1(read.search.field.right - read.box.right)}`,
      clear: read.search.clear === null ? null : r1(read.box.right - read.search.clear),
    })

  expect(same(groupLabels), `${name}: every group's label starts at one x`, groupLabels.map((x) => r1(x - left)))
  expect(same(rowLabels), `${name}: every row's label starts at one x`, [...new Set(rowLabels.map((x) => r1(x - left)))])
  const hls = [...read.groups.filter((g) => g.hl).map((g) => g.hl), ...read.rows.map((r) => r.hl)]
  expect(same(hls.map((b) => b.left)) && same(hls.map((b) => b.right)), `${name}: every highlight has the same left and right edges`, {
    left: [...new Set(hls.map((b) => r1(b.left - left)))],
    right: [...new Set(hls.map((b) => r1(b.right - read.box.right)))],
  })
  expect(same(marks), `${name}: the ticks, counts and actions end at one x`, [...new Set(marks.map((x) => r1(read.box.right - x)))])
  if (collapsible) {
    const step = r1(Math.min(...rowLabels) - Math.min(...groupLabels))
    expect(step === 12, `${name}: a child's label is one 12px step in from its group's`, step)
    if (read.foot) {
      expect(same([read.foot.label, ...groupLabels]), `${name}: Create page's words start where a group's label does`, r1(read.foot.label - left))
      expect(same([read.foot.hl.left, ...hls.map((b) => b.left)]) && same([read.foot.hl.right, ...hls.map((b) => b.right)]), `${name}: and its highlight has the rows' edges`, `${r1(read.foot.hl.left - left)}..${r1(read.foot.hl.right - read.box.right)}`)
    }
    if (read.search) {
      expect(same([read.search.text, ...groupLabels]), `${name}: what is typed in the search starts on the group labels' x`, r1(read.search.text - left))
      if (read.search.clear !== null) expect(same([read.search.clear, ...marks]), `${name}: and the clear button's glyph is on the right column`, r1(read.box.right - read.search.clear))
    }
  } else {
    if (read.search)
      expect(
        Math.abs(read.search.field.left - left) <= 0.6 && Math.abs(read.search.field.right - read.box.right) <= 0.6,
        `${name}: the search box is exactly as wide as the list under it`,
        `${r1(read.search.field.left - left)}..${r1(read.search.field.right - read.box.right)}`,
      )
    expect(same([...groupLabels, ...rowLabels]), `${name}: a heading starts where the names under it do`, {
      headings: [...new Set(groupLabels.map((x) => r1(x - left)))],
      rows: [...new Set(rowLabels.map((x) => r1(x - left)))],
    })
  }
}

async function pageMenu(p, label) {
  console.log("\n══ THE PAGE MENU ══")
  /* The dark menu from the report: opened, one group open, the rest shut. */
  await p.click("[data-page-switcher]")
  await sleep(320)
  await p.evaluate(() => {
    /* Shop opened as well, so a shut group and an open one are both measured. */
    const shop = document.querySelector("[data-page-group-toggle='shop']")
    if (shop && shop.getAttribute("aria-expanded") === "false") shop.click()
  })
  await sleep(320)
  const dark = await p.evaluate(`(${READ_PAGE_LIST})(document.querySelector(".wb-pages-menu [data-page-list]"))`)
  reportList("dark menu, expanded", dark, { collapsible: true })
  const menu = await p.$(".wb-pages-menu")
  await menu.screenshot({ path: join(shots, `${PREFIX}${label}-dark-menu-expanded.png`) })

  /* Every group shut: the heading rows alone. */
  await p.evaluate(() => {
    for (const t of document.querySelectorAll("[data-page-group-toggle]")) if (t.getAttribute("aria-expanded") === "true") t.click()
  })
  await sleep(320)
  const shut = await p.evaluate(`(${READ_PAGE_LIST})(document.querySelector(".wb-pages-menu [data-page-list]"))`)
  reportList("dark menu, collapsed", shut, { collapsible: true })
  await menu.screenshot({ path: join(shots, `${PREFIX}${label}-dark-menu-collapsed.png`) })
  const heights = await p.$$eval(".wb-pages-menu [data-page-group-toggle]", (b) => b.map((x) => Math.round(x.getBoundingClientRect().height)))
  note("group rows are this tall", [...new Set(heights)])

  /* Something typed: the clear button appears, and the search's own right edge with it. */
  await p.click(".wb-pages-menu input[aria-label='Search pages']")
  await p.keyboard.type("po")
  await sleep(250)
  const typed = await p.evaluate(`(${READ_PAGE_LIST})(document.querySelector(".wb-pages-menu [data-page-list]"))`)
  const typedMarks = [...typed.groups.map((g) => g.rightMark), ...typed.rows.map((r) => r.tick)].filter((x) => x !== null && x !== undefined)
  note("with something typed: the clear button's glyph, and the right column", [
    r1(typed.box.right - typed.search.clear),
    ...new Set(typedMarks.map((x) => r1(typed.box.right - x))),
  ])
  expect(same([typed.search.clear, ...typedMarks]), "dark menu: the search's clear button ends on the counts' column", r1(typed.box.right - typed.search.clear))
  expect(same(typed.rows.map((r) => r.label)), "and a search's rows keep the child's x", [...new Set(typed.rows.map((r) => r1(r.label - typed.box.left)))])
  await menu.screenshot({ path: join(shots, `${PREFIX}${label}-dark-menu-searching.png`) })
  await p.evaluate(() => document.querySelector(".wb-pages-menu button[aria-label='Clear the search']").click())
  await sleep(250)

  /* Open one again and leave it open for the shot the owner sent. */
  await p.evaluate(() => {
    const home = document.querySelector("[data-page-group-toggle='home']")
    if (home && home.getAttribute("aria-expanded") === "false") home.click()
  })
  await sleep(320)
  await menu.screenshot({ path: join(shots, `${PREFIX}${label}-dark-menu-home-open.png`) })
  await p.keyboard.press("Escape")
  await sleep(200)

  for (const [id, name] of [["light-boxed", "sidebar list, boxed"], ["light-plain", "sidebar list, plain"]]) {
    const read = await p.evaluate(`(${READ_PAGE_LIST})(document.querySelector("#${id} [data-page-list]"))`)
    reportList(name, read, { collapsible: false })
    const el = await p.$(`#${id}`)
    await el.scrollIntoView()
    await sleep(120)
    await el.screenshot({ path: join(shots, `${PREFIX}${label}-${id}.png`) })
    if (label.startsWith("phone")) {
      /* The indent moved the bins and ticks about; the thumb they are drawn for has not changed size. */
      const small = await p.$$eval(`#${id} [data-page-list] button`, (bs) =>
        bs
          .map((b) => {
            const r = b.getBoundingClientRect()
            return [b.getAttribute("data-page-row") || b.getAttribute("aria-label") || b.textContent.trim().slice(0, 20), Math.round(r.width), Math.round(r.height)]
          })
          .filter(([, w, hh]) => w < 44 || hh < 44),
      )
      expect(small.length === 0, `${name}: every button in it is 44px or more on a phone`, small)
    }
  }
}

/* ── the link picker ───────────────────────────────────────────────────── */
async function linkPicker(p, label) {
  console.log("\n══ THE LINK PICKER ══")
  await p.evaluate(() => document.querySelector("#link-picker").scrollIntoView({ block: "center" }))
  await p.click("#link-picker button[aria-label='Pages and products']")
  await sleep(200)
  /**
   * The first list of kinds (Home, Shop, Products...), Shopify's way. At a
   * computer it hangs from the field in the body, not inside #link-picker,
   * so it is found by the id the field points at.
   */
  const read = await p.evaluate(() => {
    const input = document.querySelector("#link-picker input[role='combobox']")
    const listbox = document.getElementById(input.getAttribute("aria-controls"))
    const list = listbox.querySelector("[data-float-scroll]")
    const cs = getComputedStyle(list)
    const lb = list.getBoundingClientRect()
    const box = { left: lb.left + parseFloat(cs.paddingLeft), right: lb.right - parseFloat(cs.paddingRight) }
    const rows = [...list.querySelectorAll("[role='option']")].map((r) => {
      const b = r.getBoundingClientRect()
      const mark = r.firstElementChild.getBoundingClientRect()
      const svg = [...r.querySelectorAll("svg")].map((s) => s.getBoundingClientRect().right)
      return { label: window.__textBox(r.querySelector("span.truncate")).left, mark: mark.left, left: b.left, right: b.right, tick: r.children.length > 2 && svg.length ? Math.max(...svg) : null }
    })
    const field = input.closest("[data-link-picker]").getBoundingClientRect()
    const pr = listbox.closest(".wb-field-panel").getBoundingClientRect()
    return { box, rows, clip: { x: Math.min(field.left, pr.left) - 8, y: Math.min(field.top, pr.top) - 8, width: Math.max(field.right, pr.right) - Math.min(field.left, pr.left) + 16, height: Math.max(field.bottom, pr.bottom) - Math.min(field.top, pr.top) + 16 } }
  })
  const { box } = read
  note("row marks", [...new Set(read.rows.map((r) => r1(r.mark - box.left)))])
  note("row labels", [...new Set(read.rows.map((r) => r1(r.label - box.left)))])
  note("highlights", [...new Set(read.rows.map((r) => `${r1(r.left - box.left)}..${r1(r.right - box.right)}`))])
  note("chevrons", read.rows.filter((r) => r.tick).map((r) => r1(box.right - r.tick)))
  expect(same(read.rows.map((r) => r.mark)) && same(read.rows.map((r) => r.label)), "link picker: every row's mark, and every row's name, start at one x", {
    marks: [...new Set(read.rows.map((r) => r1(r.mark - box.left)))],
    labels: [...new Set(read.rows.map((r) => r1(r.label - box.left)))],
  })
  expect(same(read.rows.map((r) => r.left)) && same(read.rows.map((r) => r.right)), "link picker: every row's highlight has the same edges")
  expect(same(read.rows.filter((r) => r.tick).map((r) => r.tick)), "link picker: the chevrons of the kinds that open end on one x")
  await p.screenshot({ path: join(shots, `${PREFIX}${label}-link-picker.png`), clip: read.clip, captureBeyondViewport: false })
  await p.keyboard.press("Escape")
  await sleep(150)
}

/* ── the icon picker ───────────────────────────────────────────────────── */
async function iconPicker(p, label) {
  console.log("\n══ THE ICON PICKER ══")
  await p.evaluate(() => document.querySelector("#icon-picker").scrollIntoView({ block: "center" }))
  await p.click("#icon-picker button[aria-expanded]")
  await sleep(200)
  const read = await p.evaluate(() => {
    const list = document.querySelector("#icon-picker [data-sheet-scroll]")
    const cs = getComputedStyle(list)
    const lb = list.getBoundingClientRect()
    const box = { left: lb.left + parseFloat(cs.paddingLeft), right: lb.right - parseFloat(cs.paddingRight) }
    const none = [...list.querySelectorAll("button")].find((b) => b.textContent.trim() === "No icon")
    const heads = [...list.querySelectorAll("p")].map((h) => window.__textBox(h).left)
    const cells = [...list.querySelectorAll(".grid button")].slice(0, 6).map((b) => b.getBoundingClientRect().left)
    return {
      box,
      heads,
      none: none ? { label: window.__textBox(none).left, left: none.getBoundingClientRect().left, right: none.getBoundingClientRect().right } : null,
      firstCell: cells[0] ?? null,
    }
  })
  const { box } = read
  note("group headings", read.heads.map((x) => r1(x - box.left)))
  note("the No icon row: its words, its highlight", read.none ? [r1(read.none.label - box.left), `${r1(read.none.left - box.left)}..${r1(read.none.right - box.right)}`] : null)
  note("the grid's first cell", read.firstCell === null ? null : r1(read.firstCell - box.left))
  if (read.none) expect(same([...read.heads, read.none.label]), "icon picker: a group's heading starts where the row above it does", {
    heads: [...new Set(read.heads.map((x) => r1(x - box.left)))],
    row: r1(read.none.label - box.left),
  })
  expect(read.firstCell !== null && same([read.firstCell, read.none ? read.none.left : read.firstCell]), "icon picker: the grid and the row share a left edge", {
    grid: r1(read.firstCell - box.left),
    row: read.none ? r1(read.none.left - box.left) : null,
  })
  const el = await p.$("#icon-picker")
  await el.screenshot({ path: join(shots, `${PREFIX}${label}-icon-picker.png`) })
  await p.keyboard.press("Escape")
  await sleep(150)
}

/* ── the sidebar's fields: the menu picker, the link list, the menus ───── */
async function sidebarFields(p, label) {
  console.log("\n══ THE SIDEBAR'S MENU FIELDS ══")
  /* The menu setting is one card: the menu's name over its first links, and Edit menu across the card's foot. */
  const menuField = await p.evaluate(() => {
    const root = document.querySelector("#menu-picker")
    const select = root.querySelector("[data-menu-select]")
    const card = select?.parentElement?.parentElement
    const name = select?.parentElement?.querySelector("span span")
    const edit = root.querySelector("[data-menu-edit]")
    if (!select || !card || !name || !edit) return null
    const c = card.getBoundingClientRect()
    const e = edit.getBoundingClientRect()
    const iconLeft = edit.querySelector("svg").getBoundingClientRect().left
    return { selectCovers: Math.abs(select.getBoundingClientRect().width - c.width) <= 2, nameLeft: window.__textBox(name).left, iconLeft, edit: { left: e.left - c.left, right: c.right - e.right } }
  })
  note("the menu card: the name's words and Edit menu's icon from the card's left", menuField ? [r1(menuField.nameLeft), r1(menuField.iconLeft)] : null)
  expect(
    !!menuField && menuField.selectCovers && Math.abs(menuField.nameLeft - menuField.iconLeft) <= 0.6 && Math.abs(menuField.edit.left) <= 1.5 && Math.abs(menuField.edit.right) <= 1.5,
    "the menu card: picking is the whole top of the card, Edit menu spans its foot, and both start on one line",
    menuField,
  )

  /* A link opened: its two fields, and the actions under them. */
  await p.evaluate(() => document.querySelector("#link-list").scrollIntoView({ block: "center" }))
  await p.click("#link-list [data-link-row='home'] button[aria-expanded]")
  await sleep(320)
  const links = await p.evaluate(() => {
    const panel = document.querySelector("#link-list [data-link-panel]")
    const cs = getComputedStyle(panel)
    const pb = panel.getBoundingClientRect()
    const box = { left: pb.left + parseFloat(cs.paddingLeft), right: pb.right - parseFloat(cs.paddingRight) }
    const fields = [...panel.querySelectorAll("input, [data-link-picker] > div > div")].map((f) => f.getBoundingClientRect())
    const buttons = [...panel.querySelectorAll(":scope > div:last-child button")].map((b) => window.__textBox(b))
    return { box, fields: fields.map((f) => ({ left: f.left, right: f.right })), buttons }
  })
  note("an opened link: its fields' edges, and its actions' words", {
    fields: [...new Set(links.fields.map((f) => `${r1(f.left - links.box.left)}..${r1(f.right - links.box.right)}`))],
    actions: links.buttons.map((b) => [r1(b.left - links.box.left), r1(links.box.right - b.right)]),
  })
  expect(
    links.buttons.length > 0 && links.buttons.every((b) => Math.abs(links.box.right - b.right) <= 0.6 || Math.abs(b.left - links.box.left) <= 0.6),
    "an opened link: its actions' words sit on the edges its fields do",
    links.buttons.map((b) => [r1(b.left - links.box.left), r1(links.box.right - b.right)]),
  )
  const el = await p.$("#link-list")
  await el.screenshot({ path: join(shots, `${PREFIX}${label}-link-list.png`) })

  await p.evaluate(() => document.querySelector("#menus").scrollIntoView({ block: "center" }))
  await p.click("#menus [aria-expanded]")
  /* Past the 200ms a menu takes to open by its height. */
  await sleep(320)
  const menus = await p.evaluate(() => {
    const open = [...document.querySelectorAll("#menus [aria-expanded='true']")][0]
    /* The opened part is a Reveal (components/ui/reveal.tsx); its padded content is marked. */
    const body = open.parentElement.querySelector("[data-menu-panel]") ?? open.nextElementSibling
    const cs = getComputedStyle(body)
    const bb = body.getBoundingClientRect()
    const box = { left: bb.left + parseFloat(cs.paddingLeft), right: bb.right - parseFloat(cs.paddingRight) }
    const head = window.__textBox(open.querySelector("span"))
    const input = body.querySelector("input").getBoundingClientRect()
    const actions = [...body.querySelectorAll(":scope > div:last-child button")].map((b) => window.__textBox(b))
    return { box, head: head.left, headRow: open.getBoundingClientRect(), input: { left: input.left, right: input.right }, actions }
  })
  note("a menu opened: its name in the head, its field, its actions", {
    head: r1(menus.head - menus.box.left),
    field: `${r1(menus.input.left - menus.box.left)}..${r1(menus.input.right - menus.box.right)}`,
    actions: menus.actions.map((b) => r1(menus.box.right - b.right)),
  })
  expect(Math.abs(menus.head - menus.input.left) <= 0.6, "a menu: its name in the head starts where its field does", {
    head: r1(menus.head - menus.box.left),
    field: r1(menus.input.left - menus.box.left),
  })
  expect(menus.actions.length > 0 && Math.abs(menus.box.right - menus.actions[menus.actions.length - 1].right) <= 0.6, "and its last action's words end on the field's right edge",
    menus.actions.map((b) => r1(menus.box.right - b.right)))
  const el2 = await p.$("#menus")
  await el2.screenshot({ path: join(shots, `${PREFIX}${label}-menus.png`) })
}

/* ── the publish panel's list of what it found ─────────────────────────── */
async function publish(p, label) {
  console.log("\n══ PUBLISH: WHAT THE CHECK FOUND ══")
  await p.evaluate(() => document.querySelector("#publish").scrollIntoView({ block: "center" }))
  const opened = await p.evaluate(() => {
    const line = document.querySelector("[data-publish-security='found'] button[aria-expanded]")
    if (!line) return false
    line.click()
    return true
  })
  if (!opened) return expect(false, "publish: the security line found something to list")
  await sleep(200)
  const read = await p.evaluate(() => {
    const ul = document.querySelector("[data-publish-security-issues]")
    const ub = ul.getBoundingClientRect()
    const items = [...ul.children].map((li) => {
      const b = li.getBoundingClientRect()
      return { left: b.left, right: b.right, text: window.__textBox(li).left, more: /And more/.test(li.textContent) }
    })
    return { box: { left: ub.left, right: ub.right }, items }
  })
  note("every line in the list, from the list's edge", read.items.map((i) => r1(i.text - read.box.left)))
  expect(same(read.items.map((i) => i.text)), "publish: every line in what it found starts at one x, the last one included",
    read.items.map((i) => `${i.more ? "more" : "issue"}:${r1(i.text - read.box.left)}`))
  const el = await p.$("[data-publish-security-issues]")
  await el.screenshot({ path: join(shots, `${PREFIX}${label}-publish-issues.png`) })
}

/* ── the section library: its categories, its header and its cards ─────── */
async function library(p, label, phone) {
  console.log("\n══ THE SECTION LIBRARY ══")
  await p.evaluate(() => document.querySelector("#open-library").scrollIntoView({ block: "center" }))
  await p.click("#open-library")
  await sleep(500)
  const read = await p.evaluate(() => {
    const shell = document.querySelector(".wb-library-panel") || document.querySelector("[data-section-library='phone']")
    const nav = shell.querySelector("nav[aria-label='Categories'], [role='toolbar']")
    const scroll = shell.querySelector("[data-library-scroll]")
    const cs = getComputedStyle(scroll)
    const sb = scroll.getBoundingClientRect()
    const box = { left: sb.left + parseFloat(cs.paddingLeft), right: sb.right - parseFloat(cs.paddingRight) }
    const shellBox = shell.getBoundingClientRect()
    const head = shell.querySelector("h2")
    const rows = [...nav.querySelectorAll("button")].map((b) => {
      const r = b.getBoundingClientRect()
      const count = b.lastElementChild && /^\d+$/.test(b.lastElementChild.textContent.trim()) ? window.__textBox(b.lastElementChild) : null
      return { label: window.__textBox(b).left, left: r.left, right: r.right, count: count ? count.right : null }
    })
    const cards = [...shell.querySelectorAll("[data-library-card]")].slice(0, 4).map((c) => {
      const pic = c.querySelector("[data-preview-box]").getBoundingClientRect()
      const t = window.__textBox(c.querySelector("span"))
      return { pic: pic.left, title: t ? t.left : null }
    })
    return { box, shell: shellBox.left, head: window.__textBox(head).left, rows, cards, phone: !shell.classList.contains("wb-library-panel") }
  })
  const kind = read.phone ? "the sheet's chips" : "the column of categories"
  note(`${kind}: labels, highlights, counts`, {
    labels: [...new Set(read.rows.map((r) => r1(r.label - read.rows[0].left)))],
    highlights: [...new Set(read.rows.map((r) => r1(r.right - r.left)))].length + " widths",
    counts: read.rows.filter((r) => r.count).map((r) => r1(r.right - r.count)),
  })
  note("the title, the categories and the cards, from the panel's own left edge", {
    title: r1(read.head - read.shell),
    categories: [...new Set(read.rows.map((r) => r1(r.label - read.shell)))],
    cards: read.cards.map((c) => [r1(c.pic - read.box.left), c.title === null ? null : r1(c.title - c.pic)]),
  })
  if (!phone) {
    expect(same(read.rows.map((r) => r.label - r.left)), "the library: every category's label sits at one x in its row", [...new Set(read.rows.map((r) => r1(r.label - r.left)))])
    expect(same(read.rows.map((r) => r.left)) && same(read.rows.map((r) => r.right)), "and every category's highlight has the same edges")
    expect(same([read.head, ...read.rows.map((r) => r.label)]), "its title starts where the categories under it do", {
      title: r1(read.head - read.shell),
      categories: [...new Set(read.rows.map((r) => r1(r.label - read.shell)))],
    })
  } else {
    /* A row of pills rather than a column: the row starts where the title does. */
    expect(same([read.head, read.rows[0].left]), "the library on a phone: the first pill starts where the title does", {
      title: r1(read.head - read.shell),
      pill: r1(read.rows[0].left - read.shell),
    })
  }
  expect(same(read.cards.map((c) => c.pic)) && same(read.cards.filter((c) => c.title !== null).map((c) => c.title)), "every card's picture and every card's name start at one x")
  const shell = await p.$(".wb-library-panel, [data-section-library='phone']")
  if (shell) await shell.screenshot({ path: join(shots, `${PREFIX}${label}-section-library.png`) })
  await p.keyboard.press("Escape")
  await sleep(300)
}

const SECURITY = {
  issues: [
    { page: "index", message: "A script tag in the hero's text runs on every visit." },
    { page: null, message: "A theme setting holds an inline event handler." },
    { page: "about", message: "An iframe points at a site nobody here owns." },
  ],
  truncated: true,
}

try {
  writeFileSync(join(stubs, "navigation.js"), `const router = { push() {}, replace() {}, prefetch() {}, back() {}, refresh() {} }
export const usePathname = () => "/website-builder/editor/probe"
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams()
export const redirect = () => {}
`)
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest }, children) })
`)
  writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, ...rest }) }
`)
  /* The library reaches the theme compiler, which hashes; the same stand-in the editor probe uses. */
  writeFileSync(join(stubs, "node-crypto.js"), `export function createHash() {
  let acc = ""
  return { update(s) { acc += String(s); return this }, digest() { let h = 0x811c9dc5; for (let i = 0; i < acc.length; i++) { h ^= acc.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 } return h.toString(16).padStart(8, "0").repeat(4) } }
}
export function randomBytes(n) { const a = new Uint8Array(n); crypto.getRandomValues(a); return { toString: () => Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("") } }
export function randomUUID() { return crypto.randomUUID() }
export default { createHash, randomBytes, randomUUID }
`)
  writeFileSync(join(stubs, "node-empty.js"), `const noop = () => { throw new Error("node builtin used in the browser probe") }
export const readFileSync = noop, writeFileSync = noop, existsSync = () => false, readdirSync = () => [], mkdirSync = noop
export const join = (...p) => p.join("/"), resolve = (...p) => p.join("/"), dirname = (p) => p.split("/").slice(0, -1).join("/"), basename = (p) => p.split("/").pop(), extname = (p) => { const i = p.lastIndexOf("."); return i < 0 ? "" : p.slice(i) }
export default {}
`)
  writeFileSync(join(stubs, "buffer-shim.js"), `const enc = new TextEncoder(), dec = new TextDecoder()
class Buf {
  constructor(bytes) { this.bytes = bytes }
  static from(x) { if (x instanceof Uint8Array) return new Buf(x); if (typeof x === "string") return new Buf(enc.encode(x)); return new Buf(new Uint8Array(x)) }
  static isBuffer(x) { return x instanceof Buf }
  static byteLength(s) { return enc.encode(String(s)).length }
  toString() { return dec.decode(this.bytes) }
  get length() { return this.bytes.length }
}
globalThis.Buffer = Buf
`)
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-menu-align.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    platform: "browser",
    inject: [join(stubs, "buffer-shim.js")],
    alias: {
      "@": ".",
      "next/navigation": "./.menu-align-probe/navigation.js",
      "next/link": "./.menu-align-probe/link.jsx",
      "next/image": "./.menu-align-probe/image.jsx",
      "node:crypto": "./.menu-align-probe/node-crypto.js",
      crypto: "./.menu-align-probe/node-crypto.js",
      "node:fs": "./.menu-align-probe/node-empty.js",
      fs: "./.menu-align-probe/node-empty.js",
      "node:path": "./.menu-align-probe/node-empty.js",
      path: "./.menu-align-probe/node-empty.js",
    },
    banner: { js: "var process={env:{NODE_ENV:'production'}};" },
    loader: { ".css": "empty" },
    outfile: join(stubs, "app.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  /**
   * The bundle is loaded by src, not inlined. A section's markup holds
   * `<!--` in places, and inside an inline classic script that opens an
   * HTML-like comment: the rest of the bundle is swallowed and nothing
   * mounts, with no error anywhere to say so.
   */
  /* The panel asks the server two things; both are answered here. */
  const net = `<script>
    window.fetch = (url, opts) => {
      const u = String(url)
      const body = u.includes("/security") ? ${JSON.stringify(JSON.stringify(SECURITY))} : '{"token":"probe-token"}'
      if (opts && opts.method === "DELETE") return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
      return Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(body)) })
    }
  </script>`
  writeFileSync(join(stubs, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${inter}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif;background:#f8f9fa}</style>${net}<script>${MEASURE}</script></head><body><div id="app"></div><script src="app.js"></script></body></html>`)

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] })
  const runs = [
    ["phone-390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, "?touch"],
    ["desktop-1280", { width: 1280, height: 900, deviceScaleFactor: 2 }, ""],
  ]
  const only = process.env.ONLY ? process.env.ONLY.split(",") : null
  for (const [label, vp, query] of runs.filter(([l]) => !only || only.includes(l))) {
    console.log(`\n════════ ${label} ════════`)
    const p = await browser.newPage()
    const errors = []
    p.on("pageerror", (e) => errors.push(e.message))
    p.on("console", (m) => m.type() === "error" && errors.push(m.text()))
    await p.setViewport(vp)
    await p.goto(`file://${join(stubs, "index.html")}${query}`)
    await sleep(700)
    if (errors.length) fail(`The page threw: ${errors[0]}`)
    const mounted = await p.evaluate(() => document.querySelector("#app").children.length > 0)
    if (!mounted) fail("Nothing mounted: the probe's page is empty.")
    await pageMenu(p, label)
    await linkPicker(p, label)
    await iconPicker(p, label)
    await sidebarFields(p, label)
    await publish(p, label)
    /* Last: it opens over everything else. */
    await library(p, label, label.startsWith("phone"))
    if (errors.length) expect(false, "no errors on the page", errors)
    await p.close()
  }
  await browser.close()
} finally {
  if (!process.env.KEEP) rmSync(stubs, { recursive: true, force: true })
}
console.log(`\nscreenshots in ${shots}`)
if (broken) { console.error(`\n${broken} check(s) failed\n`); process.exit(1) }
console.log("\nall checks passed\n")
