/**
 * ===========================================================================
 *  THE PAGE SWITCHER, MEASURED ON A COMPUTER AND A PHONE
 * ===========================================================================
 * "In the Pages pill-shaped modal, make sure the pages are organized into
 * categories ... like Shopify has done it. It has sub-levels with sub scroll
 * bars, it's weird and bad. Fix it fully: modern, good, clean, smooth."
 *
 * The real editor (scripts/editor-probe-harness.mjs) with a site that has
 * every page a site can have: the theme's ten (the 404 page among them),
 * three policies and three of the creator's own, and eight products. Then,
 * in a browser:
 *
 *   1280 × 800   the pill's menu. Its groups and their order; the headings'
 *                size and case; every row's height; which elements in it can
 *                scroll (one, the list); the page being edited ticked; the
 *                search narrowing it to one group; the products' "Show all"
 *                growing the same list; and every frame of it opening and
 *                closing: opacity and transform only, one way, no jump, and
 *                taken out of the page only once it has faded.
 *   390 × 844    the Pages tab of the phone's sheet: the same list, rows 48px,
 *                one scroller, and a page chosen from it opened.
 *
 * Screenshots go to SHOTS, named pages-*.
 *
 *   node scripts/check-page-switcher.mjs
 */
import { createServer } from "node:http"
import { mkdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import puppeteer from "puppeteer-core"
import { bundle, css } from "./editor-probe-harness.mjs"
import { interFaces } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const SHOTS = process.env.SHOTS ?? join(tmpdir(), "storelib-page-switcher")
mkdirSync(SHOTS, { recursive: true })
const shot = (name) => join(SHOTS, `pages-${name}.png`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const PAGES = ["refund-policy", "privacy-policy", "terms-of-service", "lookbook", "size-guide", "stockists"]
const PRODUCTS = Array.from({ length: 8 }, (_, i) => ({ id: `prod-${i + 1}`, title: ["Linen shirt", "Field notebook", "Wool scarf", "Canvas tote", "Brass pen", "Desk lamp", "Clay mug", "Rope basket"][i], slug: `item-${i + 1}` }))

const js = readFileSync(bundle)
const page = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>${interFaces()}</style><style>${css}</style></head><body><div id="app"></div>
<script>
  window.PROBE_SHORT = true
  /* Each saved page with sections of its own, which is also what lists it (render-editor-probe.tsx). */
  window.PROBE_PAGES = ${JSON.stringify(Object.fromEntries(PAGES.map((k) => [k, ["header", "text_rich", "footer"]])))}
  window.PROBE_PRODUCTS = ${JSON.stringify(PRODUCTS)}
</script>
<script src="/editor-probe.js"></script></body></html>`
/* The editor, and nothing else: the code editor it frames over the canvas is an empty page here, not two more editors (see check-add-section.mjs). */
const server = createServer((req, res) => {
  if (req.url.startsWith("/editor-probe.js")) {
    res.writeHead(200, { "content-type": "text/javascript" })
    return res.end(js)
  }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(req.url.startsWith("/editor") ? page : "<!doctype html><title>blank</title>")
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}`
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-dev-shm-usage"] })

let bad = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) bad++
}
const note = (what) => console.log(`  --    ${what}`)

/** What a list looks like, read off the DOM: its groups, headings, rows, and every element in it that can scroll. */
const READ = (root) => {
  const list = root.querySelector("[data-page-list]")
  if (!list) return null
  const groups = [...list.querySelectorAll("[data-page-group]")].map((g) => {
    /* A heading, or in the bar's menu a heading row that opens and closes the group. */
    const toggle = g.querySelector("[data-page-group-toggle]")
    const h = g.querySelector("h3") || toggle?.querySelector("span.flex-1")
    const hs = getComputedStyle(h)
    return {
      key: g.getAttribute("data-page-group"),
      label: h.textContent.trim(),
      size: hs.fontSize,
      weight: hs.fontWeight,
      transform: hs.textTransform,
      expanded: toggle ? toggle.getAttribute("aria-expanded") === "true" : true,
      boxed: !!g.querySelector("ul.border"),
      rows: [...g.querySelectorAll("[data-page-row]")].map((r) => ({
        key: r.getAttribute("data-page-row"),
        text: r.textContent.trim(),
        h: Math.round(r.getBoundingClientRect().height),
        current: r.getAttribute("aria-current") === "page",
      })),
    }
  })
  /* Every element inside that is set to scroll, and those that actually can. */
  const all = [list, ...list.querySelectorAll("*")]
  const scrollers = all.filter((el) => /(auto|scroll)/.test(getComputedStyle(el).overflowY))
  const scrolling = scrollers.filter((el) => el.scrollHeight > el.clientHeight + 1)
  const ticked = [...list.querySelectorAll("[aria-current='page']")].map((r) => {
    const li = r.closest("li")
    return { key: r.getAttribute("data-page-row"), check: !!li?.querySelector("svg.lucide-check") }
  })
  const search = list.querySelector("input[aria-label='Search pages']")
  const lr = list.getBoundingClientRect()
  return { groups, scrollers: scrollers.length, scrolling: scrolling.length, ticked, search: !!search, box: [Math.round(lr.left), Math.round(lr.top), Math.round(lr.width), Math.round(lr.height)] }
}

async function desktop() {
  console.log("\n══ A computer, 1280 × 800: the pill's menu ══\n")
  const p = await browser.newPage()
  await p.setViewport({ width: 1280, height: 800 })
  await p.goto(`${origin}/editor`, { waitUntil: "load" })
  await p.waitForFunction(() => document.querySelectorAll("#wb-preview-root [data-section-box]").length >= 3, { timeout: 60_000 })
  await sleep(2500)
  const trigger = await p.evaluate(() => {
    const b = document.querySelector("[data-page-switcher]")
    const r = b.getBoundingClientRect()
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), text: b.textContent.trim() }
  })
  note(`the pill says "${trigger.text}"`)

  /* Every frame of the opening. */
  const openFrames = p.evaluate(async () => {
    const out = []
    const t0 = performance.now()
    while (performance.now() - t0 < 700) {
      await new Promise((r) => requestAnimationFrame(r))
      const m = document.querySelector(".wb-pages-menu")
      if (!m) { out.push(null); continue }
      const cs = getComputedStyle(m)
      const r = m.getBoundingClientRect()
      out.push({ t: Math.round(performance.now() - t0), opacity: Math.round(parseFloat(cs.opacity) * 1000) / 1000, transform: cs.transform, visibility: cs.visibility, top: Math.round(r.top), props: m.getAnimations().map((a) => a.transitionProperty || a.animationName) })
    }
    return out
  })
  await p.mouse.click(trigger.x, trigger.y)
  const opening = (await openFrames).filter(Boolean)
  await sleep(200)
  await p.screenshot({ path: shot("desktop-open") })
  const seen = opening.map((f) => f.opacity)
  const upOnly = seen.every((o, i) => i === 0 || o >= seen[i - 1] - 0.001)
  const props = [...new Set(opening.flatMap((f) => f.props))]
  const tops = [...new Set(opening.map((f) => f.top))]
  note(`opening: ${opening.length} frames, opacity ${seen.slice(0, 8).join(" → ")}${seen.length > 8 ? " …" : ""}; transitions ${JSON.stringify(props)}`)
  expect(opening.length > 0 && seen[0] < 1 && seen[seen.length - 1] === 1, "the menu opens from nothing to full, not appearing in one frame", seen.slice(0, 4))
  expect(upOnly, "its opacity only ever rises while it opens")
  expect(props.every((x) => x === "opacity" || x === "transform" || x === "visibility"), "and nothing but opacity and transform moves", props)
  expect(Math.max(...opening.map((f) => f.top)) - Math.min(...opening.map((f) => f.top)) <= 5, "it drops a few pixels at most, from where it hangs", tops)

  const list = await p.evaluate((READ) => new Function("root", `return (${READ})(root)`)(document.querySelector(".wb-pages-menu")), READ.toString())
  const order = list.groups.map((g) => g.label)
  note(`groups: ${order.join(" / ")}`)
  expect(order.join(",") === "Home,Shop,Products,Pages,Customer accounts,Contact,Policies,Other", "every page is in the group a shop puts it in, in that order", order)
  expect(list.groups.every((g) => g.size === "13px" && g.transform === "none"), "each group is a 13px heading row, not in capitals", list.groups.map((g) => `${g.size}/${g.transform}`))
  const open = list.groups.filter((g) => g.expanded).map((g) => g.key)
  expect(open.length === 1 && open[0] === "home", "only the group of the page being edited starts open, the rest folded", open)
  const heights = [...new Set(list.groups.filter((g) => g.expanded).flatMap((g) => g.rows.map((r) => r.h)))]
  expect(heights.length === 1 && heights[0] === 40, "every open row is 40px", heights)
  expect(list.box[3] <= 440, "and the menu is short, every group but one folded", list.box[3])
  expect(list.groups.every((g) => g.rows.every((r) => !r.text.includes("/"))), "rows are names only, no addresses", list.groups.flatMap((g) => g.rows.map((r) => r.text)).filter((t) => t.includes("/")))
  expect(list.scrollers === 1 && list.scrolling <= 1, "one thing in it can scroll, the list itself", { set: list.scrollers, scrolling: list.scrolling })
  expect(list.ticked.length === 1 && list.ticked[0].key === "home" && list.ticked[0].check, "the page being edited is ticked", list.ticked)
  expect(list.search, "a search at the top")
  const shopRows = list.groups.find((g) => g.key === "shop")?.rows.map((r) => r.text) ?? []
  const accountRows = list.groups.find((g) => g.key === "accounts")?.rows.map((r) => r.text) ?? []
  const policyRows = list.groups.find((g) => g.key === "policies")?.rows.map((r) => r.text) ?? []
  const pageRows = list.groups.find((g) => g.key === "pages")?.rows.map((r) => r.text) ?? []
  const productRows = list.groups.find((g) => g.key === "products")?.rows.map((r) => r.text) ?? []
  note(`Shop: ${shopRows.join(" | ")}; Pages: ${pageRows.join(" | ")}; Customer accounts: ${accountRows.join(" | ")}; Policies: ${policyRows.join(" | ")}`)
  expect(/^Shop/.test(shopRows[0] ?? "") && /^Search/.test(shopRows[1] ?? ""), "the shop and its search under Shop", shopRows)
  expect(accountRows.length === 3 && /Account/.test(accountRows[0]) && /Sign in/.test(accountRows[1]) && /Wishlist/.test(accountRows[2]), "account, sign in and wishlist under Customer accounts", accountRows)
  expect(policyRows.length === 3, "the three policies under Policies", policyRows)
  expect(pageRows.length === 4 && /About/.test(pageRows[0]), "About and the creator's three under Pages", pageRows)
  expect(productRows.length === 6 && /Show all 8 products/.test(productRows[5]), "five products and a row to show the rest", productRows)
  const otherRows = list.groups.find((g) => g.key === "other")?.rows.map((r) => r.text) ?? []
  expect(otherRows.length === 1 && /^404 page$/.test(otherRows[0]), "and the 404 page, under Other, at the end", otherRows)
  const box = list.box
  note(`the menu: ${box[2]}px wide at x ${box[0]}, ${box[3]}px tall`)

  /* The search narrows it to what matches, under the headings it is filed under. */
  const search = async (text) => {
    await p.keyboard.type(text)
    await sleep(150)
    const read = await p.evaluate((READ) => new Function("root", `return (${READ})(root)`)(document.querySelector(".wb-pages-menu")), READ.toString())
    return read.groups.map((g) => `${g.label}: ${g.rows.map((r) => r.text.replace(/\/.*$/, "")).join(", ")}`)
  }
  const clear = async (n) => {
    for (let i = 0; i < n; i++) await p.keyboard.press("Backspace")
    await sleep(150)
  }
  const policy = await search("policy")
  await p.screenshot({ path: shot("desktop-search") })
  expect(policy.length === 1 && /^Policies: Refund Policy, Privacy Policy$/.test(policy[0]), "typing \"policy\" leaves the two policies called that, under Policies", policy)
  await clear(6)
  const account = await search("account")
  expect(account.length === 1 && /^Customer accounts: Account, Sign in$/.test(account[0]), "typing \"account\" finds the account and its sign in page by their addresses", account)
  await clear(7)
  const scarf = await search("scarf")
  expect(scarf.length === 1 && /^Products: Wool scarf$/.test(scarf[0]), "and a product by its name", scarf)
  await clear(5)

  /* A folded group opens from its heading row. */
  await p.evaluate(() => document.querySelector(".wb-pages-menu [data-page-group-toggle='products']").click())
  await sleep(300)
  const productsOpen = await p.evaluate(() => document.querySelector(".wb-pages-menu [data-page-group-toggle='products']").getAttribute("aria-expanded"))
  expect(productsOpen === "true", "Products opens from its heading", productsOpen)
  /* Show all grows the same list; nothing opens inside it. */
  await p.evaluate(() => document.querySelector(".wb-pages-menu [data-page-row='more']").click())
  await sleep(150)
  const grown = await p.evaluate((READ) => new Function("root", `return (${READ})(root)`)(document.querySelector(".wb-pages-menu")), READ.toString())
  const products = grown.groups.find((g) => g.key === "products")?.rows ?? []
  expect(products.length === 8 && grown.scrollers === 1, "Show all lists all eight in the same list, still one scroller", { rows: products.length, scrollers: grown.scrollers })
  await p.screenshot({ path: shot("desktop-all-products") })

  /* Every frame of the closing. */
  const closeFrames = p.evaluate(async () => {
    const out = []
    const t0 = performance.now()
    while (performance.now() - t0 < 500) {
      await new Promise((r) => requestAnimationFrame(r))
      const m = document.querySelector(".wb-pages-menu")
      if (!m) { out.push({ gone: true }); continue }
      const cs = getComputedStyle(m)
      out.push({ t: Math.round(performance.now() - t0), opacity: Math.round(parseFloat(cs.opacity) * 1000) / 1000, visibility: cs.visibility, state: m.getAttribute("data-state"), top: Math.round(m.getBoundingClientRect().top) })
    }
    return out
  })
  await p.keyboard.press("Escape")
  const closing = await closeFrames
  const present = closing.filter((f) => !f.gone)
  const cseen = present.map((f) => f.opacity)
  const firstGone = closing.findIndex((f) => f.gone)
  const lastPresent = present[present.length - 1]
  note(`closing: ${present.length} frames in the page, opacity ${cseen.slice(0, 9).join(" → ")}${cseen.length > 9 ? " …" : ""}; ${firstGone < 0 ? "never taken out" : `taken out after ${lastPresent?.t}ms`}`)
  expect(firstGone > 2 && closing.slice(firstGone).every((f) => f.gone), "the menu stays in the page while it closes, and goes once it has", { framesIn: present.length, firstGone })
  expect(cseen.length > 2 && cseen[0] > 0 && cseen.every((o, i) => i === 0 || o <= cseen[i - 1] + 0.001), "it fades out, one way", cseen.slice(0, 5))
  expect(!!lastPresent && (lastPresent.opacity <= 0.05 || lastPresent.visibility === "hidden"), "and has faded out before it goes", lastPresent)
  const focus = await p.evaluate(() => document.activeElement?.hasAttribute("data-page-switcher") ?? false)
  expect(focus, "the keyboard is back on the pill", focus)

  /* A page chosen from it opens. */
  await p.mouse.click(trigger.x, trigger.y)
  await sleep(400)
  await p.evaluate(() => document.querySelector(".wb-pages-menu [data-page-group-toggle='accounts']").click())
  await sleep(300)
  await p.evaluate(() => document.querySelector(".wb-pages-menu [data-page-row='wishlist']").click())
  await sleep(1500)
  const after = await p.evaluate(() => ({ pill: document.querySelector("[data-page-switcher]").textContent.trim(), menu: document.querySelector(".wb-pages-menu")?.getAttribute("data-state") ?? "gone" }))
  expect(/Wishlist/.test(after.pill) && after.menu === "gone", "choosing Wishlist opens the wishlist page and closes the menu", after)

  /* The sidebar's Pages tab on a computer: the same list, light, 40px rows, one scroller. */
  await p.evaluate(() => [...document.querySelectorAll("[data-wb-sidebar-tabs] [role='tab']")].find((t) => /Pages/.test(t.textContent || ""))?.click())
  await sleep(700)
  const side = await p.evaluate((READ) => {
    const outer = document.querySelector("[data-wb-sidebar-scroll]")
    const out = new Function("root", `return (${READ})(root)`)(outer)
    /* Everything in the whole sidebar that can scroll right now, the sidebar's own scroller included. */
    const all = [outer, ...outer.querySelectorAll("*")].filter((el) => /(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 1)
    return out ? { ...out, scrolling: all.length } : null
  }, READ.toString())
  await p.screenshot({ path: shot("desktop-sidebar") })
  if (!side?.groups) expect(false, "the sidebar's Pages tab shows the grouped list", side)
  else {
    const sheights = [...new Set(side.groups.flatMap((g) => g.rows.map((r) => r.h)))]
    expect(side.groups.length === 8 && sheights.length === 1 && sheights[0] === 40 && side.scrollers <= 2 && side.scrolling === 1, "the sidebar's Pages tab is the same list: eight groups, 40px rows, one thing scrolling", { groups: side.groups.length, heights: sheights, scrolling: side.scrolling })
    expect(side.groups.every((g) => g.boxed && g.weight === "600"), "each group a bordered box under a bold heading, the way the tab was", side.groups.map((g) => `${g.boxed}/${g.weight}`))
    expect(side.search, "with the search kept")
    expect(side.groups.every((g) => g.rows.every((r) => !r.text.includes("/"))), "and names only, no addresses", side.groups.flatMap((g) => g.rows.map((r) => r.text)).filter((t) => t.includes("/")))
    expect(side.ticked.length === 1 && side.ticked[0].key === "wishlist", "with the page now open ticked", side.ticked)
  }
  await p.close()
}

async function phone() {
  console.log("\n══ A phone, 390 × 844: the Pages tab of the sheet ══\n")
  const p = await browser.newPage()
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true })
  await p.goto(`${origin}/editor`, { waitUntil: "load" })
  await p.waitForFunction(() => document.querySelectorAll("#wb-preview-root [data-section-box]").length >= 3, { timeout: 60_000 })
  await sleep(2500)
  const tab = await p.evaluate(() => {
    const sheet = [...document.querySelectorAll("[data-mobile-bottom-sheet]")].find((s) => s.querySelector("[data-wb-sidebar-scroll]"))
    const t = [...sheet.querySelectorAll("[role='tab']")].find((x) => /Pages/.test(x.textContent || ""))
    const r = t.getBoundingClientRect()
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
  })
  await p.touchscreen.tap(tab.x, tab.y)
  await sleep(1000)
  await p.screenshot({ path: shot("phone-open") })
  const list = await p.evaluate((READ) => {
    const sheet = [...document.querySelectorAll("[data-mobile-bottom-sheet]")].find((s) => s.querySelector("[data-wb-sidebar-scroll]"))
    const read = new Function("root", `return (${READ})(root)`)
    const out = read(sheet)
    /* Every element in the whole sheet that can actually scroll right now. */
    const scrolling = [...sheet.querySelectorAll("*")].filter((el) => /(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 1)
    return { ...out, sheetTop: Math.round(sheet.getBoundingClientRect().top), sheetScrolling: scrolling.map((el) => el.getAttribute("data-page-list-scroll") !== null ? "the page list" : el.className.slice(0, 60)) }
  }, READ.toString())
  if (!list?.groups) {
    expect(false, "the Pages tab shows the grouped list", list)
    await p.close()
    return
  }
  const order = list.groups.map((g) => g.label)
  note(`sheet top at ${list.sheetTop}; groups: ${order.join(" / ")}`)
  expect(order.join(",") === "Home,Shop,Products,Pages,Customer accounts,Contact,Policies,Other", "the same groups, in the same order", order)
  expect(list.groups.every((g) => g.size === "12px" && g.transform === "none" && g.boxed), "the same bold headings over bordered boxes", list.groups.map((g) => g.size))
  const heights = [...new Set(list.groups.flatMap((g) => g.rows.map((r) => r.h)))]
  expect(heights.length === 1 && heights[0] === 48, "every row is 48px on a phone", heights)
  expect(list.sheetScrolling.length === 1 && list.sheetScrolling[0] === "the page list", "one thing in the whole sheet scrolls, the list", list.sheetScrolling)
  expect(list.ticked.length === 1 && list.ticked[0].key === "home" && list.ticked[0].check, "the page being edited is ticked", list.ticked)
  const touch = await p.evaluate(() => {
    const sheet = [...document.querySelectorAll("[data-mobile-bottom-sheet]")].find((s) => s.querySelector("[data-wb-sidebar-scroll]"))
    const bins = [...sheet.querySelectorAll("[aria-label^='Delete ']")].map((b) => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height), getComputedStyle(b).opacity] })
    const create = [...sheet.querySelectorAll("button")].find((b) => /Create page/.test(b.textContent || ""))
    const cr = create?.getBoundingClientRect()
    const input = sheet.querySelector("input[aria-label='Search pages']")
    return { bins, create: cr ? [Math.round(cr.width), Math.round(cr.height)] : null, inputFont: input ? getComputedStyle(input).fontSize : null, inputH: input ? Math.round(input.getBoundingClientRect().height) : null }
  })
  /* The three policies and the creator's three are the site's own pages, and each can be deleted. */
  expect(touch.bins.length === PAGES.length && touch.bins.every(([w, h, o]) => w >= 44 && h >= 44 && o === "1"), "a page's delete is there to tap, 44px or more", touch.bins)
  expect(!!touch.create && touch.create[1] >= 44, "Create page is there, 44px tall", touch.create)
  expect(touch.inputFont === "16px" && touch.inputH >= 44, "the search is 16px type in a 44px field, so iOS does not zoom", { font: touch.inputFont, height: touch.inputH })

  /* A page chosen from it opens. The list is scrolled by hand to put the row
     just under the list's top: at the middle stop the lower half of the
     sheet is below the screen, so "centre it" would put it out of reach. */
  const row = await p.evaluate(() => {
    const sheet = [...document.querySelectorAll("[data-mobile-bottom-sheet]")].find((s) => s.querySelector("[data-wb-sidebar-scroll]"))
    const scroller = sheet.querySelector("[data-page-list-scroll]")
    const r = sheet.querySelector("[data-page-row='contact']")
    scroller.scrollTop += r.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 40
    const b = r.getBoundingClientRect()
    return { x: Math.round(b.left + 60), y: Math.round(b.top + b.height / 2), onScreen: b.bottom < window.innerHeight }
  })
  await sleep(300)
  await p.touchscreen.tap(row.x, row.y)
  await sleep(1500)
  const after = await p.evaluate(() => ({ url: decodeURIComponent(location.search), tab: [...document.querySelectorAll("[role='tab'][aria-selected='true']")].map((t) => t.textContent.trim()) }))
  await p.screenshot({ path: shot("phone-after-choose") })
  expect(row.onScreen && /contact/.test(after.url), "choosing Contact opens the contact page, and the sheet goes back to its sections", { row, ...after })
  await p.close()
}

await desktop()
await phone()
await browser.close()
server.close()
console.log(`\nScreenshots in ${SHOTS}\n`)
if (bad) {
  console.error(`${bad} check${bad === 1 ? "" : "s"} failed.`)
  process.exit(1)
}
console.log("Every page is in its group, in one list with one scroll, on a computer and a phone.\n")
