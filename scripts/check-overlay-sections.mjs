/**
 * ===========================================================================
 *  THE OVERLAY GROUP: A POPUP, A PHONE TAB BAR, BACK TO TOP
 * ===========================================================================
 * "Add an overlay group, where there can be mobile nav bar sections or back
 * to top buttons, or popups, like Shopify has."
 *
 * The real editor (scripts/editor-probe-harness.mjs) at 1280 x 800:
 *
 *   GROUP     the sidebar has an Overlay group, after Footer, with its own
 *             Add section, and that library offers exactly the three
 *             floating sections
 *   ADD       each one added from it lands in the Overlay group, after the
 *             footer in the canvas, in a box with no query container (so a
 *             `position: fixed` inside it is fixed to the screen) and above
 *             the header (z-index)
 *   CANVAS    selected, the popup's window is drawn open in the page;
 *             back to top and the tab bar are drawn in the page where they
 *             can be clicked, and none of the three is cut or empty
 *   THEME     the theme's site-wide button rules (lift on hover, shadow)
 *             do not reach the tab bar's buttons: a tab that opens the cart
 *             looks like one that opens a page
 *
 *   node scripts/check-overlay-sections.mjs
 */
import { createServer } from "node:http"
import { readFileSync } from "node:fs"
import puppeteer from "puppeteer-core"
import { bundle, css } from "./editor-probe-harness.mjs"
import { interFaces } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const js = readFileSync(bundle)
const page = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>${interFaces()}</style><style>${css}</style></head><body><div id="app"></div>
<script>window.PROBE_SHORT = true</script><script src="/editor-probe.js"></script></body></html>`
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

try {
  const p = await browser.newPage()
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e.message || e)))
  await p.setViewport({ width: 1280, height: 800 })
  await p.goto(`${origin}/editor`, { waitUntil: "load" })
    await p.waitForFunction(() => document.querySelectorAll("#wb-preview-root [data-section-box]").length >= 3, { timeout: 60_000 }).catch(async () => { console.log("did not load", errors.slice(0, 5), await p.evaluate(() => document.body.innerText.slice(0, 400))); throw new Error("editor did not load") })
  await sleep(800)

  const group = await p.evaluate(() => {
    const groups = [...document.querySelectorAll("[data-section-group]")].map((g) => g.getAttribute("data-section-group"))
    const o = document.querySelector("[data-section-group='overlay']")
    return { groups, add: !!o?.querySelector("[data-add-section]"), label: o?.textContent?.trim().slice(0, 20) }
  })
  expect(group.groups.join(",").endsWith("footer,overlay"), "the sidebar has an Overlay group after Footer", group.groups)
  expect(group.add, "the Overlay group has its own Add section")

  for (const [type, name] of [["popup", "Popup"], ["back_to_top", "Back to top"], ["mobile_bottom_bar", "Phone tab bar"]]) {
    /* Back to the list of sections, where the groups are. */
    await p.evaluate(() => document.querySelector("[data-panel-back] button")?.click())
    await p.waitForFunction(() => !!document.querySelector("[data-section-group='overlay'] [data-add-section]"), { timeout: 10_000 }).catch(() => {})
    await sleep(300)
    await p.evaluate(() => document.querySelector("[data-section-group='overlay'] [data-add-section]")?.click())
    await p.waitForFunction(() => document.querySelectorAll("[data-library-card]").length >= 1, { timeout: 20_000 })
    await sleep(500)
    const offered = await p.evaluate(() => [...new Set([...document.querySelectorAll("[data-library-card]")].filter((c) => !c.hidden).map((c) => c.getAttribute("data-library-card")))].sort())
    if (type === "popup") expect(offered.join(",") === "back_to_top,mobile_bottom_bar,popup", "its library offers the three floating sections and nothing else", offered)
    const card = await p.evaluate((type) => {
      const c = [...document.querySelectorAll("[data-library-card]")].find((x) => !x.hidden && x.getAttribute("data-library-card") === type)
      if (!c) return null
      c.scrollIntoView({ block: "center" })
      const r = c.getBoundingClientRect()
      const pv = c.querySelector("[data-preview-box]") ?? c
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + Math.min(r.height / 2, 60)), h: Math.round(pv.getBoundingClientRect().height), empty: !!c.querySelector("[data-preview-empty]"), drawn: !!c.querySelector("[data-keep-transform]") }
    }, type)
    expect(!!card, `${name}: offered in the library`, card)
    if (!card) continue
    expect(card.h >= 40 && card.drawn && !card.empty, `${name}: its card shows the section, not an empty box`, card)
    await sleep(150)
    await p.mouse.click(card.x, card.y)
    if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/overlay-${type}.png` })
    await p.waitForFunction((type) => !!document.querySelector(`#wb-preview-root [data-section-box][data-section-type='${type}']`), { timeout: 20_000 }, type).catch(() => {})
    await sleep(1200)
    const got = await p.evaluate((type) => {
      const box = document.querySelector(`#wb-preview-root [data-section-box][data-section-type='${type}']`)
      if (!box) return null
      const boxes = [...document.querySelectorAll("#wb-preview-root [data-section-box]")]
      const footer = boxes.findIndex((b) => b.getAttribute("data-section-type") === "footer")
      const cs = getComputedStyle(box)
      const r = box.getBoundingClientRect()
      const inGroup = !!document.querySelector("[data-section-group='overlay']")?.textContent?.length
      return {
        afterFooter: boxes.indexOf(box) > footer,
        container: cs.containerType,
        z: cs.zIndex,
        overlayAttr: box.hasAttribute("data-overlay"),
        chrome: box.hasAttribute("data-chrome"),
        height: Math.round(r.height),
        inGroup,
        rows: document.querySelector("[data-section-group='overlay']")?.querySelectorAll("[data-section-row], [data-tree-row], li").length ?? 0,
      }
    }, type)
    expect(!!got, `${name}: drawn in the canvas`, got)
    if (!got) continue
    expect(got.afterFooter, `${name}: after the footer`)
    expect(got.container === "normal" && got.overlayAttr && got.chrome, `${name}: in a box with no query container, marked overlay`, got)
    expect(Number(got.z) > 40, `${name}: above the sticky header`, got.z)
    expect(got.height >= 40, `${name}: not empty or cut in the canvas`, got.height)
  }

  /* The popup, selected: its window is drawn open, whole, inside the canvas. */
  await p.evaluate(() => document.querySelector("#wb-preview-root [data-section-box][data-section-type='popup'] [data-section]")?.click())
  await sleep(600)
  const pop = await p.evaluate(() => {
    const el = document.querySelector("#wb-preview-root [data-section-type='popup'] [data-storelib-popup]")
    const card = el?.querySelector(".pop__card") ?? el?.querySelector("[role='dialog']")
    const r = card?.getBoundingClientRect()
    const root = document.getElementById("wb-preview-root").getBoundingClientRect()
    return { open: el?.hasAttribute("data-open") ?? false, w: r ? Math.round(r.width) : 0, h: r ? Math.round(r.height) : 0, inside: r ? r.left >= root.left - 1 && r.right <= root.right + 1 : false, opacity: card ? getComputedStyle(card).opacity : null }
  })
  expect(pop.open && pop.w > 280 && pop.h > 120 && pop.inside, "selected, the popup's window is open and whole in the canvas", pop)

  /* The tab bar's buttons look like its links: the theme's button rules stay off them. */
  const tabs = await p.evaluate(() => {
    const items = [...document.querySelectorAll("#wb-preview-root [data-section-type='mobile_bottom_bar'] .mb__item, #wb-preview-root [data-section-type='mobile_bottom_bar'] [data-block-id]")]
    return items.map((el) => { const cs = getComputedStyle(el); return { tag: el.tagName, shadow: cs.boxShadow, radius: cs.borderTopLeftRadius, bg: cs.backgroundColor, h: Math.round(el.getBoundingClientRect().height) } })
  })
  const a = tabs.find((t) => t.tag === "A")
  const b = tabs.find((t) => t.tag === "BUTTON")
  expect(tabs.length >= 4, "the tab bar draws its four tabs", tabs.length)
  expect(!!a && !!b && a.shadow === b.shadow && a.bg === b.bg && a.h === b.h, "a tab that opens the cart looks like one that opens a page", { a, b })
  if (process.env.SHOTS) {
    await p.evaluate(() => { const r = document.getElementById("wb-preview-root"); r.scrollTop = r.scrollHeight })
    await sleep(400)
    await p.screenshot({ path: `${process.env.SHOTS}/overlay-canvas.png` })
  }
  expect(errors.length === 0, "no script error", errors.slice(0, 3))
} finally {
  await browser.close()
  server.close()
}
console.log(bad ? `\n${bad} failed` : "\nall passed")
process.exit(bad ? 1 : 0)
