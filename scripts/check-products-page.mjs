/**
 * ===========================================================================
 *  THE PRODUCTS PAGE, MEASURED
 * ===========================================================================
 * Shopify's products index in the Orders page's parts: the pane's bar with
 * the title, Export and New product at Orders' 32px; one card whose 48px
 * toolbar holds the views (All, Active, Draft, Archived), search and sort;
 * a dense 13px table with 52px rows and a 40px picture from 768px; a list of
 * 64px rows on a phone; a footer that counts and pages. Every press on a
 * phone is 44px however small it is drawn, and nothing scrolls sideways.
 *
 *   node scripts/check-products-page.mjs          (a build's CSS if there is one, else the source's)
 *   PROBE_CSS=source node scripts/check-products-page.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const css = await appCss(root)
const inter = interFaces(root)
if (!inter) console.log("(no build to take Inter from: text is measured in the fallback face, which is wider)")
const stubs = join(root, ".products-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-products-")), "shots")
mkdirSync(shots, { recursive: true })

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/* The numbers each width is held to, and printed in the summary at the end. */
const summary = []

try {
  writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/app/products"
export const useRouter = () => ({ push(href) { (window.__pushed ||= []).push(href) }, replace() {}, prefetch(href, o) { (window.__prefetched ||= []).push([href, o && o.kind]) }, back() {}, refresh() {} })
export const useSearchParams = () => new URLSearchParams()
`)
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { e.preventDefault(); rest.onClick && rest.onClick(e) } }, children) })
`)
  writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, style: fill ? { position: "absolute", inset: 0, width: "100%", height: "100%" } : undefined, ...rest }) }
`)
  execFileSync("npx", [
    "esbuild", "scripts/render-products-probe.tsx", "--bundle", "--format=iife", "--jsx=automatic",
    '--define:process.env.NODE_ENV="production"', "--alias:@=.",
    // The page reads public env values at module level; a browser has none.
    "--banner:js=var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};",
    "--alias:next/navigation=./.products-probe/navigation.js", "--alias:next/link=./.products-probe/link.jsx", "--alias:next/image=./.products-probe/image.jsx",
    `--outfile=${join(stubs, "app.js")}`, "--log-level=error",
  ], { cwd: root, stdio: "inherit", env: { ...process.env, NODE_PATH: join(root, "node_modules") } })
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  writeFileSync(join(stubs, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${inter}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`)

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
  const phone = (width) => ({ width, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  const open = async (vp, hash = "") => {
    const p = await browser.newPage()
    const errors = []
    p.on("pageerror", (e) => errors.push(e.message))
    await p.setViewport(vp)
    await p.goto(`file://${join(stubs, "index.html")}${hash}`)
    await p.evaluate(() => document.fonts.ready)
    await wait(400)
    if (errors.length) fail(`The page threw: ${errors[0]}`)
    await p.waitForSelector("[role=tablist]")
    return p
  }
  /* The one of two elements (phone list, computer table) that is drawn at this width. */
  const shown = `(sel) => [...document.querySelectorAll(sel)].find((el) => el.getBoundingClientRect().width > 0)`

  for (const [label, vp, hash] of [
    ["phone-360", phone(360)],
    ["phone-390", phone(390)],
    ["phone-430", phone(430)],
    ["tablet-768", { width: 768, height: 1024 }, "#sidebar"],
    ["desktop-1280", { width: 1280, height: 800 }],
    ["desktop-1440", { width: 1440, height: 900 }],
  ]) {
    const isPhone = label.startsWith("phone")
    console.log(`\n${label}${hash ? ` (${hash.slice(1)}: the page 240px in, beside the sidebar)` : ""}`)
    const p = await open(vp, hash)
    await p.evaluate(`window.__shown = ${shown}`)
    const pageLeft = hash ? 240 : 0
    const row = { label }

    /* The bar: Orders' LIST_BAR, the title, Export and New product at Orders' 32px. */
    const bar = await p.evaluate((pageLeft) => {
      const el = document.querySelector("[data-orders-bar]")
      const h = el.querySelector("h1")
      const add = el.querySelector("a[href='/app/products/new']").getBoundingClientRect()
      /* Export is a Press: the span inside it is what is drawn, the button what a finger gets. */
      const exp = el.querySelector("button[aria-label='Export products'] > span").getBoundingClientRect()
      const expPress = el.querySelector("button[aria-label='Export products']").getBoundingClientRect()
      /* A finger 5px above and below the drawn button still lands on it. */
      const hitAbove = document.elementFromPoint(add.left + add.width / 2, add.top - 5)?.closest("a[href='/app/products/new']") != null
      const hitBelow = document.elementFromPoint(exp.left + exp.width / 2, exp.bottom + 5)?.closest("button[aria-label='Export products']") != null
      return {
        barH: Math.round(el.getBoundingClientRect().height), titleSize: getComputedStyle(h).fontSize,
        add: [Math.round(add.width), Math.round(add.height)], exp: [Math.round(exp.width), Math.round(exp.height)], expText: el.querySelector("button[aria-label='Export products']").innerText.trim(),
        titleLeft: Math.round(h.getBoundingClientRect().left - pageLeft), addRight: Math.round(window.innerWidth - add.right), hitAbove, hitBelow, press: [Math.round(expPress.width), Math.round(expPress.height)], gap: Math.round(add.left - exp.right),
      }
    }, pageLeft)
    row.header = bar.barH
    expect(bar.barH === 66, "the bar is Orders' 66px", bar.barH)
    expect(bar.titleSize === (isPhone ? "24px" : "28px"), `the title is Orders' ${isPhone ? 24 : 28}px`, bar.titleSize)
    expect(bar.add[1] === 32 && bar.exp[1] === 32, "New product and Export are drawn at Orders' 32px", { add: bar.add, exp: bar.exp })
    expect(isPhone ? bar.expText === "" && bar.exp[0] === 32 : bar.expText === "Export", isPhone ? "Export is a 32px icon on a phone" : "Export says Export", bar.expText)
    if (isPhone) {
      expect(bar.hitAbove && bar.hitBelow && bar.press.join() === "44,44", "and a finger 5px outside either still presses it: a 44px target", bar)
      expect(bar.gap === 12, "12px between the two drawn buttons", bar.gap)
      expect(bar.titleLeft === 16 && bar.addRight === 16, "16px in from both edges", bar)
    }

    /* The toolbar: views, search and sort. */
    const tools = await p.evaluate(() => {
      const bar = document.querySelector("section[aria-label=Products] [data-toolbar]")
      const list = bar.querySelector("[role=tablist]")
      const tabs = [...list.querySelectorAll("[role=tab]")].map((x) => {
        const r = x.getBoundingClientRect()
        const pill = x.querySelector("span").getBoundingClientRect()
        return { t: x.textContent.trim(), h: Math.round(r.height), pill: Math.round(pill.height), right: Math.round(r.right), size: getComputedStyle(x.querySelector("span")).fontSize }
      })
      /* Search and sort are Presses: [press width, press height, drawn width, drawn height]. */
      const btn = (name) => { const b = bar.querySelector(`button[aria-label='${name}']`); const r = b.getBoundingClientRect(); const d = b.firstElementChild.getBoundingClientRect(); return [r.width, r.height, d.width, d.height].map(Math.round) }
      return { h: Math.round(bar.getBoundingClientRect().height), tabs, listRight: Math.round(list.getBoundingClientRect().right), overflow: list.scrollWidth - list.clientWidth, search: btn("Search products"), sort: btn("Sort") }
    })
    row.toolbar = tools.h
    expect(tools.h === (isPhone ? 52 : 48), `the toolbar is ${isPhone ? 52 : 48}px`, tools.h)
    expect(tools.tabs.map((t) => t.t).join(",") === "All,Active,Draft,Archived", "the views in Polaris's order, All first and open", tools.tabs.map((t) => t.t))
    expect(tools.tabs.every((t) => t.pill === 32 && t.size === "13px"), "each view drawn as a 32px pill with 13px text", tools.tabs.map((t) => [t.pill, t.size]))
    expect(tools.tabs.every((t) => t.h === (isPhone ? 44 : 32)), `each view a ${isPhone ? "44px press" : "32px button"}`, tools.tabs.map((t) => t.h))
    expect(tools.overflow <= 0 && tools.tabs.every((t) => t.right <= tools.listRight), "every view fits: none is cut off at the edge", { overflow: tools.overflow, rights: tools.tabs.map((t) => t.right), edge: tools.listRight })
    const press = isPhone ? 44 : 32
    expect(tools.search.join() === `${press},${press},32,32` && tools.sort.join() === `${press},${press},32,32`, `search and sort are drawn at 32px${isPhone ? ", a 44px press each" : ""}`, { search: tools.search, sort: tools.sort })

    /* No sideways scroll anywhere. */
    const sideways = await p.evaluate(() => {
      const pane = document.querySelector(".orders-pane")
      const inner = [...document.querySelectorAll("section[aria-label=Products] *")].filter((el) => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== "visible" && !el.matches("[role=tablist]") && getComputedStyle(el).textOverflow !== "ellipsis" && !el.matches("[data-meta]")).length
      return { pane: pane.scrollWidth - pane.clientWidth, doc: document.documentElement.scrollWidth - window.innerWidth, inner }
    })
    row.sideways = sideways.pane + sideways.doc
    expect(sideways.pane === 0 && sideways.doc <= 0 && sideways.inner === 0, "nothing scrolls sideways: the page, the pane or the card", sideways)

    if (isPhone) {
      const table = await p.$eval("section[aria-label=Products] table", (t) => getComputedStyle(t).display)
      expect(table === "none", "the table is not drawn on a phone", table)
      const rows = await p.$$eval("section[aria-label=Products] ul > li", (r) => r.map((li) => {
        const box = li.getBoundingClientRect()
        const pic = li.querySelector("[data-thumb]")
        const pr = pic.getBoundingClientRect()
        const link = li.querySelector("a").getBoundingClientRect()
        const menu = li.querySelector("button").getBoundingClientRect()
        const name = li.querySelector("[data-name]")
        const meta = li.querySelector("[data-meta]")
        const metaRight = Math.max(...[...meta.children].map((c) => c.getBoundingClientRect().right))
        const price = [...meta.children].find((c) => /^\$/.test(c.textContent))
        return {
          h: Math.round(box.height), pic: [Math.round(pr.width), Math.round(pr.height)], radius: getComputedStyle(pic).borderTopLeftRadius, border: getComputedStyle(pic).borderTopWidth,
          link: [Math.round(link.width), Math.round(link.height)], rowW: Math.round(box.width), menu: [Math.round(menu.width), Math.round(menu.height)],
          nameSize: getComputedStyle(name).fontSize, nameH: Math.round(name.getBoundingClientRect().height), metaSize: getComputedStyle(meta).fontSize,
          priceNums: getComputedStyle(price).fontVariantNumeric, status: (meta.textContent.match(/Active|Draft/) || [""])[0], metaText: meta.textContent,
          clear: Math.round(menu.left - metaRight), nameClear: Math.round(menu.left - name.getBoundingClientRect().right), meta1line: Math.round(meta.getBoundingClientRect().height),
        }
      }))
      row.row = rows[0].h
      row.thumb = rows[0].pic.join("x")
      row.text = `${rows[0].nameSize} name, ${rows[0].metaSize} meta`
      expect(rows.length === 13, "one row per product in All (not archived)", rows.length)
      expect(rows.every((r) => r.h === 64), "every row is 64px, a long name included", [...new Set(rows.map((r) => r.h))])
      expect(rows.every((r) => r.pic[0] === 40 && r.pic[1] === 40 && r.radius === "8px" && r.border === "1px"), "a 40px picture, 8px round, one hairline", [...new Set(rows.map((r) => `${r.pic.join("x")} r${r.radius} b${r.border}`))])
      expect(rows.every((r) => r.nameSize === "15px" && r.nameH === 20 && r.metaSize === "13px"), "the name at 15px on one line, the rest at 13px", rows[2])
      expect(rows.every((r) => r.meta1line === 22), "status, price and sales on one 22px line", [...new Set(rows.map((r) => r.meta1line))])
      expect(rows.every((r) => /tabular-nums/.test(r.priceNums)), "prices in figures of one width", rows[0].priceNums)
      expect(rows.every((r) => r.status) && rows.filter((r) => r.status === "Draft").length === 2, "All says Active or Draft on every row", rows.map((r) => r.status))
      expect(rows.every((r) => r.link[0] === r.rowW && r.link[1] >= r.h - 1), "the whole row is the link", rows[0].link)
      expect(rows.every((r) => r.menu[0] >= 44 && r.menu[1] >= 44), "the actions button is a 44px target", rows[0].menu)
      expect(rows.every((r) => r.clear >= 0 && r.nameClear >= 0), "the name and the line under it never run under the actions button", rows.map((r) => Math.min(r.clear, r.nameClear)))
      const rules = await p.$$eval("section[aria-label=Products] ul > li", (r) => r.map((li) => {
        const b = getComputedStyle(li, "::before")
        return b.content === "none" ? null : Math.round(parseFloat(b.left))
      }))
      expect(rules[0] === null && rules.slice(1).every((x) => x === 64), "a hairline between rows, starting where the text does", rules.slice(0, 3))
      const hit = await p.$eval("section[aria-label=Products] ul > li:nth-child(2)", (li) => {
        const r = li.getBoundingClientRect()
        return document.elementFromPoint(r.left + r.width * 0.45, r.top + r.height / 2)?.tagName
      })
      expect(hit === "A", "a press in the middle of a row lands on its link", hit)
      await p.$eval("section[aria-label=Products] ul > li:nth-child(1) a", (a) => a.dispatchEvent(new TouchEvent("touchstart", { bubbles: true })))
      const pre = await p.evaluate(() => window.__prefetched || [])
      expect(pre.length === 1 && pre[0][0] === "/app/products/p0" && pre[0][1] === "full", "the finger going down prefetches that product's editor in full", pre)
    } else {
      const list = await p.$eval("section[aria-label=Products] ul", (u) => getComputedStyle(u).display)
      expect(list === "none", "the phone list is not drawn", list)
      const t = await p.evaluate(() => {
        const table = document.querySelector("section[aria-label=Products] table")
        const head = table.querySelector("thead tr")
        const cols = [...head.children].filter((c) => c.getBoundingClientRect().width > 0).map((c) => ({ t: c.textContent.trim(), align: getComputedStyle(c).textAlign }))
        const rows = [...table.querySelectorAll("tbody tr")].map((tr) => {
          const pic = tr.querySelector("[data-thumb]")
          const pr = pic.getBoundingClientRect()
          const name = tr.querySelector("td a")
          const cells = [...tr.children].filter((c) => c.getBoundingClientRect().width > 0)
          return {
            h: Math.round(tr.getBoundingClientRect().height), pic: [Math.round(pr.width), Math.round(pr.height)], radius: getComputedStyle(pic).borderTopLeftRadius, border: getComputedStyle(pic).borderTopWidth,
            size: getComputedStyle(tr).fontSize, nameSize: getComputedStyle(name).fontSize, nameWeight: getComputedStyle(name).fontWeight, cut: name.scrollWidth > name.clientWidth,
            inside: Math.round(cells[0].getBoundingClientRect().right - name.getBoundingClientRect().right), ellipsis: getComputedStyle(name).textOverflow,
            nums: cells.filter((c) => /^\$|^\d/.test(c.textContent.trim())).map((c) => [getComputedStyle(c).textAlign, getComputedStyle(c).fontVariantNumeric]),
            divider: getComputedStyle(cells[0]).borderTopWidth + " " + getComputedStyle(cells[0]).borderTopColor,
          }
        })
        const headH = Math.round(head.getBoundingClientRect().height)
        const nameCol = Math.round(head.children[0].getBoundingClientRect().width)
        return { cols, rows, headH, nameCol }
      })
      row.row = t.rows[0].h
      row.thumb = t.rows[0].pic.join("x")
      row.text = `${t.rows[0].size} rows, ${t.rows[0].nameSize} name`
      const wantCols = label.startsWith("tablet") ? "Product,Status,Price," : "Product,Status,Sales,Price,"
      expect(t.cols.map((c) => c.t).join() === wantCols, `the columns: ${wantCols.replace(/,$/, "")}${label.startsWith("tablet") ? " (Sales from 1024px)" : ""}`, t.cols.map((c) => c.t))
      expect(t.cols.filter((c) => /Sales|Price/.test(c.t)).every((c) => c.align === "right"), "numbers' headings right aligned", t.cols)
      expect(t.headH === 36, "a 36px heading row", t.headH)
      expect(t.rows.length === 13 && t.rows.every((r) => r.h === 52), "one 52px row per product in All", { count: t.rows.length, heights: [...new Set(t.rows.map((r) => r.h))] })
      expect(t.rows.every((r) => r.pic[0] === 40 && r.pic[1] === 40 && r.radius === "8px" && r.border === "1px"), "a 40px picture, 8px round, one hairline", [...new Set(t.rows.map((r) => `${r.pic.join("x")} r${r.radius} b${r.border}`))])
      expect(t.rows.every((r) => r.size === "13px" && r.nameSize === "13px" && r.nameWeight === "600"), "13px throughout, the name semibold", t.rows[0])
      expect(t.rows.every((r) => r.nums.length >= 1 && r.nums.every(([a, n]) => a === "right" && /tabular-nums/.test(n))), "numbers right aligned in figures of one width", t.rows[0].nums)
      expect(/^1px rgb\(240, 241, 243\)$/.test(t.rows[1].divider), "a hairline between rows", t.rows[1].divider)
      expect(t.rows.every((r) => r.inside >= 12 && r.ellipsis === "ellipsis") && t.nameCol > 150, `a long name stays in its column${t.rows[2].cut ? " and stops with an ellipsis" : ", whole at this width"}`, { inside: t.rows[2].inside, cut: t.rows[2].cut, nameCol: t.nameCol })

      /* Headless Chromium reports (hover: none), so the tint is read from the rule itself. */
      const tint = await p.evaluate(() => {
        const rules = []
        /* Tailwind 4 nests: the class, then `&:is(:where(.group):hover *)`, then `@media (hover: hover)`. */
        const walk = (list, media, sel) => {
          for (const r of list) {
            const s = r.selectorText ? `${sel} ${r.selectorText}` : sel
            const m = r.media ? `${media} ${r.media.mediaText}` : media
            if (r.style && r.style.backgroundColor && s.includes("group-hover\\:bg-\\[\\#fafafb\\]")) rules.push([m, r.style.backgroundColor])
            if (r.cssRules) walk(r.cssRules, m, s)
          }
        }
        for (const s of document.styleSheets) walk(s.cssRules, "", "")
        const td = document.querySelector("section[aria-label=Products] tbody tr td")
        return { rules, onRow: td.className.includes("group-hover:bg-[#fafafb]") && td.parentElement.classList.contains("group") }
      })
      expect(tint.onRow && tint.rules.some(([m, c]) => /hover/.test(m) && /250, 250, 251|#fafafb/i.test(c)), "a row under a pointer is tinted #fafafb, as Orders' are", tint)
      await p.hover("section[aria-label=Products] tbody tr:nth-child(4)")
      await p.hover("section[aria-label=Products] tbody tr:nth-child(2) td:nth-child(2)")
      await wait(150)
      const pre = await p.evaluate(() => window.__prefetched || [])
      expect(pre.length === 1 && pre[0][0] === "/app/products/p1" && pre[0][1] === "full", "a pointer resting on a row prefetches that product's editor in full, one passing over does not", pre)
      await p.click("section[aria-label=Products] tbody tr:nth-child(2) td:nth-child(2)")
      const pushed = await p.evaluate(() => window.__pushed || [])
      expect(pushed.length === 1 && pushed[0] === "/app/products/p1", "a click anywhere on a row opens the product", pushed)
    }
    await p.screenshot({ path: join(shots, `${label}-products.png`) })

    /* Views: Draft holds the two drafts. */
    await p.evaluate(() => [...document.querySelectorAll("[role=tab]")].find((t) => t.textContent.trim() === "Draft").click())
    await wait(80)
    const drafts = await p.evaluate(() => window.__shown("section[aria-label=Products] ul, section[aria-label=Products] table").querySelectorAll("li, tbody tr").length)
    expect(drafts === 2, "the Draft view holds the two drafts", drafts)
    await p.evaluate(() => [...document.querySelectorAll("[role=tab]")].find((t) => t.textContent.trim() === "All").click())
    await wait(80)

    /* Sort: price high to low puts the dearest first. */
    await p.click("[data-toolbar] button[aria-label='Sort']")
    await wait(isPhone ? 600 : 250)
    const sorted = await p.evaluate(() => {
      const option = [...document.querySelectorAll("[role=menuitem], [data-action-sheet] button")].find((b) => b.textContent.trim() === "Price high to low")
      if (!option) return null
      option.click()
      return true
    })
    await wait(isPhone ? 500 : 150)
    const prices = await p.evaluate(() => [...window.__shown("section[aria-label=Products] ul, section[aria-label=Products] table").querySelectorAll("li, tbody tr")].slice(0, 3).map((r) => (r.textContent.match(/\$\d+\.\d{2}/) || [""])[0]))
    expect(sorted && prices.join() === "$54.00,$50.50,$47.00", "Sort, Price high to low, puts the dearest first", prices)
    const sortOn = await p.$eval("[data-toolbar] button[aria-label='Sort']", (b) => getComputedStyle(b.firstElementChild).backgroundColor)
    expect(sortOn === "rgb(236, 238, 241)", "and the sort button shows an order other than Newest is on", sortOn)

    /* Search: the button opens a field in the same toolbar; typing narrows. */
    await p.click("[data-toolbar] button[aria-label='Search products']")
    await wait(80)
    const field = await p.evaluate(() => {
      const input = document.querySelector("[data-toolbar] input[type=search]")
      const box = input.closest("span").getBoundingClientRect()
      const label = input.closest("label").getBoundingClientRect()
      return { focused: document.activeElement === input, font: getComputedStyle(input).fontSize, h: Math.round(box.height), press: Math.round(label.height), toolbar: Math.round(document.querySelector("[data-toolbar]").getBoundingClientRect().height) }
    })
    expect(field.focused && field.font === (isPhone ? "16px" : "13px"), `the field opens focused, ${isPhone ? "16px text so iOS does not zoom" : "13px text"}`, field)
    expect(field.toolbar === (isPhone ? 52 : 48) && field.press >= (isPhone ? 44 : 32), "in the same toolbar at the same height", field)
    await p.type("[data-toolbar] input[type=search]", "portrait")
    await wait(80)
    const found = await p.evaluate(() => [...window.__shown("section[aria-label=Products] ul, section[aria-label=Products] table").querySelectorAll("li, tbody tr")].map((r) => r.textContent))
    expect(found.length === 1 && /portrait/.test(found[0]), "typing narrows the list", found.length)
    await p.screenshot({ path: join(shots, `${label}-products-search.png`) })
    await p.type("[data-toolbar] input[type=search]", "zzz")
    await wait(80)
    const empty = await p.evaluate(() => document.querySelector("section[aria-label=Products]").textContent)
    expect(/No products match/.test(empty) && /Clear search/.test(empty), "a search with nothing found says so and offers to clear it", /No products match/.test(empty))
    await p.evaluate(() => [...document.querySelectorAll("section[aria-label=Products] button")].find((b) => b.textContent.trim() === "Cancel").click())
    await wait(80)

    /* A row's actions: a dropdown on a computer, a sheet on a phone. */
    const btn = await p.$(isPhone ? "section[aria-label=Products] ul > li:first-child button[aria-label^='Actions for']" : "section[aria-label=Products] tbody tr:first-child button[aria-label^='Actions for']")
    await btn.click()
    await wait(450)
    const menu = await p.evaluate(() => ({
      dropdown: /Duplicate/.test(document.querySelector("[role=menu]")?.textContent ?? ""),
      sheet: [...document.querySelectorAll("[role=dialog]")].some((d) => /Duplicate/.test(d.textContent)),
      pushed: (window.__pushed || []).length,
    }))
    expect(isPhone ? menu.sheet : menu.dropdown, `a row's actions are a ${isPhone ? "sheet" : "dropdown"}`, menu)
    if (!isPhone) expect(menu.pushed === 1, "and opening them does not open the product", menu.pushed)
    await p.screenshot({ path: join(shots, `${label}-product-actions.png`) })
    await p.close()

    /* Sixty products: fifty on a page, then the footer's arrows. */
    const q = await open(vp, `${hash || "#"}many`)
    await q.evaluate(`window.__shown = ${shown}`)
    const count = () => q.evaluate(() => ({ rows: window.__shown("section[aria-label=Products] ul, section[aria-label=Products] table").querySelectorAll("li, tbody tr").length, footer: document.querySelector("[data-footer]").textContent.trim(), h: Math.round(document.querySelector("[data-footer]").getBoundingClientRect().height) }))
    const first = await count()
    expect(first.rows === 50 && /^1–50 of 59/.test(first.footer), "sixty products (59 not archived): fifty on the first page, and the footer says so", first)
    const next = await q.evaluate(() => {
      const press = document.querySelector("button[aria-label='Next page']")
      press.scrollIntoView({ block: "center" })
      const b = press.firstElementChild.getBoundingClientRect()
      const hit = document.elementFromPoint(b.left + b.width / 2, b.top - 5)?.closest("button[aria-label='Next page']") != null
      return { drawn: [Math.round(b.width), Math.round(b.height)], press: [Math.round(press.getBoundingClientRect().width), Math.round(press.getBoundingClientRect().height)], hit }
    })
    expect(next.drawn.join() === "32,28", "the page arrows are drawn at Orders' 32 by 28", next.drawn)
    if (isPhone) expect(next.hit && next.press.join() === "44,44", "and are a 44px press on a phone", next)
    await q.click("button[aria-label='Next page']")
    await wait(80)
    const second = await count()
    expect(second.rows === 9 && /^51–59 of 59/.test(second.footer), "Next shows the other nine", second)
    row.footer = first.h
    const qSide = await q.evaluate(() => { const pane = document.querySelector(".orders-pane"); return pane.scrollWidth - pane.clientWidth })
    expect(qSide === 0, "and still nothing scrolls sideways", qSide)
    await q.close()
    summary.push(row)
  }

  /* An empty shop: one line, one way forward. */
  {
    console.log("\nno products yet (390)")
    const p = await browser.newPage()
    await p.setViewport(phone(390))
    await p.goto(`file://${join(stubs, "index.html")}#none`)
    await p.evaluate(() => document.fonts.ready)
    await wait(300)
    const e = await p.evaluate(() => {
      const card = document.querySelector("section[aria-label=Products]")
      return { text: card.textContent, tabs: [...card.querySelectorAll("[role=tab]")].map((t) => t.textContent.trim()), create: !!card.querySelector("a[href='/app/products/new']"), footer: !!card.querySelector("[data-footer]"), h: Math.round(card.getBoundingClientRect().height) }
    })
    expect(/No products yet/.test(e.text) && e.create && !e.footer, "No products yet, with Create product, and no footer counting nothing", e)
    expect(e.tabs.join() === "All", "and only the All view, as Orders shows only views with something in them", e.tabs)
    await p.screenshot({ path: join(shots, "phone-390-empty.png") })
    await p.close()
  }
  /*
    ARCHIVE AND RESTORE, AGAINST A FAKE DATABASE. The page's requests to the
    database are answered here, as the REST API would, from a table kept in
    this script, so what is measured is the request the page sends and what
    the list does with the answer. `#legacy` saves the last product with
    status "archived" and the flag off: the row Restore used to leave
    archived however often it was pressed.
  */
  {
    console.log("\narchive and restore (1280)")
    const table = new Map([["p13", { status: "archived", archived: false }], ["p0", { status: "published", archived: false }]])
    const sent = []
    const p = await browser.newPage()
    await p.setViewport({ width: 1280, height: 800 })
    await p.setRequestInterception(true)
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS" }
    p.on("request", (req) => {
      const url = req.url()
      if (!url.startsWith("https://placeholder.supabase.co")) return req.continue()
      if (req.method() === "OPTIONS") return req.respond({ status: 204, headers: cors })
      const u = new URL(url)
      if (req.method() !== "PATCH" || !u.pathname.endsWith("/rest/v1/products")) return req.respond({ status: 200, headers: { ...cors, "content-type": "application/json" }, body: "[]" })
      const patch = JSON.parse(req.postData() || "{}")
      const id = (u.searchParams.get("id") || "").replace(/^eq\./, "")
      const onlyStatus = u.searchParams.get("status")?.replace(/^eq\./, "")
      sent.push({ id, patch, where: onlyStatus ? `status=${onlyStatus}` : "" })
      const row = table.get(id)
      const hit = row && (!onlyStatus || row.status === onlyStatus) ? [row] : []
      for (const r of hit) Object.assign(r, patch)
      const body = u.searchParams.has("select") ? JSON.stringify(hit.map((r) => ({ status: r.status, archived: r.archived }))) : ""
      return req.respond({ status: body ? 200 : 204, headers: { ...cors, "content-type": "application/json" }, body })
    })
    await p.goto(`file://${join(stubs, "index.html")}#legacy`)
    await p.evaluate(() => document.fonts.ready)
    await wait(300)
    const tabs = () => p.$$eval("[role=tab]", (t) => t.map((x) => x.textContent.trim()))
    const view = async (name) => { await p.evaluate((name) => [...document.querySelectorAll("[role=tab]")].find((t) => t.textContent.trim() === name).click(), name); await wait(80) }
    const names = () => p.$$eval("section[aria-label=Products] table tbody tr", (r) => r.map((tr) => tr.querySelector("td a").textContent.trim()))
    const act = async (title, label) => {
      await p.click(`table button[aria-label='Actions for ${title}']`)
      await wait(250)
      await p.evaluate((label) => [...document.querySelectorAll("[role=menuitem]")].find((m) => m.textContent.trim() === label).click(), label)
      await wait(400)
    }
    await view("Archived")
    const before = await names()
    expect(before.includes("Product 14"), "a product saved as archived is in Archived", before)
    await act("Product 14", "Restore")
    const afterRestore = await names()
    expect(!afterRestore.includes("Product 14"), "Restore takes it out of Archived", afterRestore)
    expect(sent.length === 2 && sent[0].where === "status=archived" && sent[0].patch.status === "draft" && sent[1].patch.archived === false,
      "  by setting an archived status back to draft, then clearing the flag", sent)
    await view("Draft")
    const drafts = await names()
    expect(drafts.includes("Product 14") && table.get("p13").status === "draft", "  and it is a draft again, in the list and in the table", { drafts, row: table.get("p13") })
    await view("All")
    await act("Product 1", "Archive")
    const all = await names()
    expect(!all.includes("Product 1") && table.get("p0").status === "archived" && table.get("p0").archived === true,
      "Archive takes a live product off: its status is archived, and it leaves All", { row: table.get("p0"), sent: sent.slice(2) })
    await view("Archived")
    expect((await names()).includes("Product 1"), "  and it is in Archived", await tabs())
    await p.close()
  }
  await browser.close()
} finally {
  if (!process.env.KEEP) rmSync(stubs, { recursive: true, force: true })
}
console.log("\nsummary (px)")
console.table(summary)
console.log(`\nscreenshots in ${shots}`)
if (broken) { console.error(`\n${broken} check(s) failed\n`); process.exit(1) }
console.log("\nall checks passed\n")
