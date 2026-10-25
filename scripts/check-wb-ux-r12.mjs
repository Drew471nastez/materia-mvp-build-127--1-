/**
 * ===========================================================================
 *  ROUND 12, THE WEBSITE BUILDER: WHAT THE OWNER ASKED FOR, MEASURED
 * ===========================================================================
 *
 *   INSERT   the pointer brought to the line between two blocks of a section
 *            (Storelib theme and imported theme): a + shows on the line, as
 *            between two sections, and holds still while the pointer rests
 *            on the line or the button; a press adds a block right there
 *            (one kind: at once; several: the block library opens and the
 *            choice lands there); the save carries it; inspector off, none;
 *            Tab and Escape; a finger at 390 never shows it.
 *   COLLECT  the collection picker with no collections says "No collections
 *            yet" and offers Add collection; a name typed and Create makes
 *            the collection through /api/collections and picks it; with
 *            collections, New collection is under the list.
 *   NEWTAB   a menu link marked "Open in a new tab": the live header (the
 *            row, the dropdown, the phone drawer) and an imported theme's
 *            page draw it with target="_blank" rel="noopener noreferrer",
 *            and a real click opens a new page while the site stays put.
 *
 *   npx tsx scripts/check-wb-ux-r12.mjs
 *   ONLY=insert|collect|newtab   one part
 *   SHOTS=<dir>                  screenshots (default the scratchpad's r12 dir when it exists)
 */
import { existsSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { importedTheme, openEditor, sleep, STORELIB_GLOBALS } from "./canvas-probe-kit.mjs"

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got).slice(0, ok ? 300 : 1200)})`}`)
  if (!ok) broken++
}
const SHOTS = process.env.SHOTS ?? join(process.cwd(), ".wb-probe", "r12-shots")
mkdirSync(SHOTS, { recursive: true })
const only = process.env.ONLY ?? ""
const want = (part) => !only || only === part

/* A home page with sections that hold blocks: one kind (FAQ questions) and many (a Section of theme blocks). */
const GLOBALS = STORELIB_GLOBALS.replace(
  /home:\[[^\]]*\]/,
  'home:["header","hero_centered","blocks_section","faq_accordion","product_grid","promo_newsletter","cta_simple","footer"]',
)

/* ── INSERT ─────────────────────────────────────────────────────────────── */

async function insertStorelib({ bundle, css }) {
  console.log("\nINSERT, STORELIB THEME (1440)")
  const { page, js, close, errors } = await openEditor({ kind: "storelib", bundle, css, globals: GLOBALS })
  try {
    /* The places between the top-level blocks of a section, as the page draws them. */
    const gapsOf = (type) => js((type) => {
      const sec = document.querySelector(`#wb-preview-root [data-section-key][data-section-type='${type}']`)
      if (!sec) return null
      const top = [...sec.querySelectorAll("[data-block-id]")].filter((b) => !b.parentElement.closest("[data-block-id]") || !sec.contains(b.parentElement.closest("[data-block-id]")))
      return { ids: top.map((b) => b.getAttribute("data-block-id")), rects: top.map((b) => { const r = b.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right } }) }
    }, type)
    /* Scrolled to, and held until the page has stopped moving (an add glides the canvas to what it added). */
    const bring = async (type, n) => {
      await sleep(900)
      await js((type, n) => {
        const sec = document.querySelector(`#wb-preview-root [data-section-key][data-section-type='${type}']`)
        const b = sec.querySelectorAll("[data-block-id]")[n]
        b.scrollIntoView({ block: "center" })
      }, type, n)
      let last = null
      for (let i = 0; i < 30; i++) {
        await sleep(120)
        const now = JSON.stringify((await gapsOf(type))?.rects.map((r) => Math.round(r.top)))
        if (now === last) break
        last = now
      }
    }
    const strip = () => js(() => {
      const s = document.querySelector("[data-wb-block-insert]")
      if (!s) return null
      const b = s.querySelector("button")
      const r = s.getBoundingClientRect()
      const line = s.querySelector("span")
      return { on: s.hasAttribute("data-on"), mid: r.top + r.height / 2, height: r.height, left: r.left, width: r.width, button: +getComputedStyle(b).opacity, line: +getComputedStyle(line).opacity, label: b.getAttribute("aria-label"), transition: getComputedStyle(b).transitionProperty }
    })

    /* FAQ: one kind of block. */
    await bring("faq_accordion", 1)
    await sleep(400)
    let g = await gapsOf("faq_accordion")
    expect(!!g && g.ids.length >= 2, "the FAQ draws its questions as blocks", g?.ids)
    const y = (g.rects[0].bottom + g.rects[1].top) / 2
    const x = (g.rects[0].left + g.rects[0].right) / 2
    await page.mouse.move(x, y - 40)
    await sleep(120)
    await page.mouse.move(x, y, { steps: 4 })
    await sleep(60)
    const early = await strip()
    await sleep(300)
    const late = await strip()
    expect(!!late && late.on && late.button > 0.99 && late.line > 0.99, "between two questions: the + shows on the line", late)
    expect(!!early && early.button < 0.95, "it grows in, it does not appear (60ms in)", early?.button)
    expect(!!late && Math.abs(late.mid - y) <= 2, "on the line itself", { mid: late?.mid, y })
    expect(!!late && /opacity/.test(late.transition) && /rotate/.test(late.transition) && /scale/.test(late.transition), "the transition names opacity, rotate and scale", late?.transition)
    expect(!!late && late.label === "Add a block here", "a button that says what it does", late?.label)
    await page.screenshot({ path: join(SHOTS, "insert-faq-1440.png"), captureBeyondViewport: false, clip: { x: Math.max(0, late.left - 40), y: Math.max(0, y - 140), width: Math.min(1000, late.width + 80), height: 280 } })

    /* Resting on the line, moving along it, and onto the button: it never goes. */
    let lost = 0
    const steps = [[x - 120, y + 2], [x + 80, y - 3], [x + 140, y + 4], [x, y], [x + 2, y + 1]]
    for (const [px, py] of steps) {
      await page.mouse.move(px, py, { steps: 3 })
      for (let i = 0; i < 4; i++) {
        await sleep(25)
        const s = await strip()
        if (!s || !s.on) lost++
      }
    }
    expect(lost === 0, "the pointer along the line and onto the button: no blink", { lost })

    /* Off the line, into the block: it goes. */
    await page.mouse.move(x, y - 40, { steps: 3 })
    await sleep(500)
    expect(!(await strip()), "into a block: it fades and goes", await strip())

    /* A press adds a question right there. */
    const before = (await gapsOf("faq_accordion")).ids
    const saves0 = await js(() => (window.probeSaves ?? []).length)
    await page.mouse.move(x, y, { steps: 3 })
    await sleep(300)
    await page.mouse.click(x, y)
    await sleep(700)
    const after = (await gapsOf("faq_accordion")).ids
    const added = after.find((id) => !before.includes(id))
    expect(after.length === before.length + 1 && after[1] === added && after[0] === before[0] && after[2] === before[1], "pressed: a question lands between the two", { before, after })
    let saved = null
    for (let i = 0; i < 40 && !saved; i++) {
      await sleep(250)
      saved = await js((added, n) => {
        const all = (window.probeSaves ?? []).slice(n)
        for (const s of all.reverse()) {
          const secs = s.body?.sections
          const faq = Array.isArray(secs) ? secs.find((x) => x.type === "faq_accordion") : null
          if (faq && (faq.blocks ?? []).some((b) => b.id === added)) return (faq.blocks ?? []).map((b) => b.id)
        }
        return null
      }, added, saves0)
    }
    expect(!!saved && saved[1] === added, "and the save carries it, in its place", saved)

    /* A Section of theme blocks: several kinds, so the library opens, and the choice lands at the place. */
    await bring("blocks_section", 1)
    await sleep(400)
    g = await gapsOf("blocks_section")
    if (g && g.ids.length >= 2 && g.rects[1].top >= g.rects[0].bottom - 4) {
      const by = (g.rects[0].bottom + g.rects[1].top) / 2
      const bx = (Math.max(g.rects[0].left, g.rects[1].left) + Math.min(g.rects[0].right, g.rects[1].right)) / 2
      await page.mouse.move(bx, by - 30)
      await sleep(100)
      await page.mouse.move(bx, by, { steps: 3 })
      await sleep(320)
      const s = await strip()
      expect(!!s && s.on, "between two blocks of a Section: the + shows", s ?? await js((x, y) => { const e = document.elementFromPoint(x, y); return { at: e?.outerHTML.slice(0, 60), path: (() => { const o = []; for (let n = e; n && o.length < 8; n = n.parentElement) o.push(n.tagName + (n.id ? "#" + n.id : "") + (n.getAttribute("data-section-key") ? "[key]" : "")); return o })() } }, bx, by))
      await page.mouse.click(bx, by)
      await sleep(600)
      const picker = await js(() => {
        const p = document.querySelector("[data-block-picker='desktop']")
        const layer = p?.closest("[data-block-picker-layer]")
        return p ? { open: layer?.getAttribute("data-state"), choices: [...p.querySelectorAll("[data-block-choice]")].map((c) => c.getAttribute("data-block-choice")) } : null
      })
      expect(!!picker && picker.open === "open" && picker.choices.length > 1, "the block library opens with the blocks this section takes", picker)
      await page.screenshot({ path: join(SHOTS, "insert-library-1440.png"), captureBeyondViewport: false })
      const pick = picker?.choices.includes("text") ? "text" : picker?.choices[0]
      const before2 = g.ids
      await js((pick) => document.querySelector(`[data-block-picker='desktop'] [data-block-choice='${pick}']`)?.click(), pick)
      await sleep(700)
      const after2 = (await gapsOf("blocks_section")).ids
      const added2 = after2.find((id) => !before2.includes(id))
      expect(after2.length === before2.length + 1 && after2[1] === added2, "the block chosen lands at that place", { pick, before2, after2 })
    } else expect(false, "a Section with two blocks stacked", g)

    /* Keyboard: the button takes the focus, stays while it has it, Escape puts it away. */
    await bring("faq_accordion", 1)
    await sleep(400)
    g = await gapsOf("faq_accordion")
    const ky = (g.rects[1].bottom + g.rects[2].top) / 2
    const kx = (g.rects[1].left + g.rects[1].right) / 2
    await page.mouse.move(kx, ky - 30)
    await page.mouse.move(kx, ky, { steps: 3 })
    await sleep(300)
    await js(() => document.querySelector("[data-wb-block-insert] button")?.focus())
    await page.mouse.move(5, 450, { steps: 3 })
    await sleep(350)
    const kept = await strip()
    expect(!!kept && kept.on, "focused, it stays when the pointer leaves", kept)
    const n0 = (await gapsOf("faq_accordion")).ids.length
    await page.keyboard.press("Enter")
    await sleep(600)
    const n1 = (await gapsOf("faq_accordion")).ids.length
    expect(n1 === n0 + 1, "Enter on it adds the block", { n0, n1 })
    await page.mouse.move(kx, ky - 30)
    await page.mouse.move(kx, ky, { steps: 3 })
    await sleep(300)
    await js(() => document.querySelector("[data-wb-block-insert] button")?.focus())
    await page.keyboard.press("Escape")
    await page.mouse.move(5, 450, { steps: 3 })
    await sleep(350)
    expect(!(await strip()), "Escape puts it away", await strip())

    /* Inspector off: the canvas is the website, and nothing in it is a control. */
    await js(() => document.querySelector("[aria-label='Disable section inspector']")?.click())
    await sleep(600)
    await page.mouse.move(kx, ky - 30)
    await page.mouse.move(kx, ky, { steps: 3 })
    await sleep(320)
    expect(!(await strip()), "inspector off: no +", await strip())
    if (errors.length) console.log(`  note  page errors ${JSON.stringify(errors.slice(0, 3))}`)
  } finally {
    await close()
  }
}

async function insertPhone({ bundle, css }) {
  console.log("\nINSERT, A FINGER (390, touch)")
  const { page, js, close } = await openEditor({ kind: "storelib", bundle, css, globals: GLOBALS, width: 390, height: 844, cpu: 4, beforeOpen: (p) => p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }) })
  try {
    await sleep(800)
    const at = await js(() => {
      const sec = document.querySelector("#wb-preview-root [data-section-key][data-section-type='faq_accordion']")
      if (!sec) return null
      const b = sec.querySelectorAll("[data-block-id]")
      b[1].scrollIntoView({ block: "center" })
      const r0 = b[0].getBoundingClientRect(), r1 = b[1].getBoundingClientRect()
      return { x: (r0.left + r0.right) / 2, y: (r0.bottom + r1.top) / 2 }
    })
    await sleep(400)
    if (at) {
      await page.touchscreen.tap(at.x, at.y)
      await sleep(350)
    }
    const s = await js(() => !!document.querySelector("[data-wb-block-insert]"))
    expect(!!at && !s, "a tap between two blocks shows no +", { at, s })
    await page.screenshot({ path: join(SHOTS, "insert-phone-390.png") })
  } finally {
    await close()
  }
}

async function insertImported({ bundle, css, compat }) {
  console.log("\nINSERT, IMPORTED THEME (1024)")
  /* 1024 wide: the product grid wraps to two rows, so two of its cards are one above the other. */
  const { page, front, js, close, errors } = await openEditor({ kind: "imported", bundle, css, compat, width: 1024, height: 900 })
  try {
    const f = await front()
    /* Every place between two stacked blocks of one level in the page, as the frame draws them. */
    const places = await f.evaluate(() => {
      const out = []
      document.querySelectorAll(".shopify-section").forEach((sec) => {
        const blocks = [...sec.querySelectorAll("[data-block-id]")].filter((b) => { const up = b.parentElement.closest("[data-block-id]"); return !up || !sec.contains(up) })
        for (let i = 1; i < blocks.length; i++) {
          const a = blocks[i - 1].getBoundingClientRect(), b = blocks[i].getBoundingClientRect()
          if (a.height < 1 || b.height < 1 || b.top < a.bottom - 4) continue
          out.push({ section: sec.id, before: blocks[i].getAttribute("data-block-id"), after: blocks[i - 1].getAttribute("data-block-id"), n: i })
        }
      })
      return out
    })
    expect(places.length > 0, "the imported page has blocks stacked in a section", places.length)
    let tried = null
    const box = await (await page.$("[data-compat-frame='front']")).boundingBox()
    for (const p of places.slice(0, 6)) {
      await f.evaluate((p) => document.getElementById(p.section).querySelectorAll("[data-block-id]")[p.n].scrollIntoView({ block: "center" }), p)
      await sleep(1200)
      const at = await f.evaluate((p) => {
        const sec = document.getElementById(p.section)
        const blocks = [...sec.querySelectorAll("[data-block-id]")].filter((b) => { const up = b.parentElement.closest("[data-block-id]"); return !up || !sec.contains(up) })
        const a = blocks[p.n - 1].getBoundingClientRect(), b = blocks[p.n].getBoundingClientRect()
        return { x: (Math.max(a.left, b.left) + Math.min(a.right, b.right)) / 2, y: (a.bottom + b.top) / 2 }
      }, p)
      await page.mouse.move(box.x + at.x, box.y + at.y - 30)
      await sleep(100)
      await page.mouse.move(box.x + at.x, box.y + at.y, { steps: 3 })
      await sleep(320)
      const s = await f.evaluate(() => { const a = (document.querySelector("[data-sl-box=layer]")?.shadowRoot ?? document).querySelector("[data-sl-add]"); return a ? { shown: a.style.display, on: a.hasAttribute("data-on"), label: a.getAttribute("aria-label") } : null })
      if (s && s.on && s.label === "Add a block here") { tried = { p, at, s }; break }
      console.log("  note  tried", JSON.stringify({ p, at, box, s, under: await f.evaluate((x, y) => document.elementFromPoint(x, y)?.outerHTML.slice(0, 100), at.x, at.y) }))
    }
    expect(!!tried, "between two blocks of an imported section: the + shows, as between two sections", tried ?? await f.evaluate(() => ({ adder: (document.querySelector("[data-sl-box=layer]")?.shadowRoot ?? document).querySelector("[data-sl-add]")?.outerHTML.slice(0, 160) ?? "none" })))
    if (tried) {
      await page.screenshot({ path: join(SHOTS, "insert-imported-1440.png"), captureBeyondViewport: false })
      const count = () => f.evaluate((id) => document.getElementById(id).querySelectorAll("[data-block-id]").length, tried.p.section)
      const n0 = await count()
      await page.mouse.click(box.x + tried.at.x, box.y + tried.at.y)
      await sleep(800)
      const picker = await js(() => { const p = document.querySelector("[data-block-picker='desktop']"); return p ? { open: p.closest("[data-block-picker-layer]")?.getAttribute("data-state"), choices: [...p.querySelectorAll("[data-block-choice]")].map((c) => c.getAttribute("data-block-choice")) } : null })
      if (picker?.open === "open") {
        await js((c) => document.querySelector(`[data-block-picker='desktop'] [data-block-choice='${c}']`)?.click(), picker.choices[0])
      }
      let n1 = n0
      for (let i = 0; i < 20 && n1 === n0; i++) { await sleep(300); n1 = await count().catch(() => n0) }
      const order = await f.evaluate((id) => [...document.getElementById(id).querySelectorAll("[data-block-id]")].map((b) => b.getAttribute("data-block-id")), tried.p.section)
      const at2 = order.indexOf(tried.p.before)
      expect(n1 > n0 && order[at2 - 2] === tried.p.after && !["p1", "p2", "p3", "p4"].includes(order[at2 - 1]), "pressed: a block is added in that section, between the two", { n0, n1, order, picker })
    }
    if (errors.length) console.log(`  note  page errors ${JSON.stringify(errors.slice(0, 3))}`)
  } finally {
    await close()
  }
}

/* ── COLLECT ────────────────────────────────────────────────────────────── */

const CARDS = [
  { id: "11111111-1111-4111-8111-111111111111", type: "product", settings: { title: "Linen apron", price: "$48.00", compare_price: "", image: "", url: "/products/linen-apron", slug: "linen-apron", available: true, variants: [] } },
  { id: "22222222-2222-4222-8222-222222222222", type: "product", settings: { title: "Waxed tote", price: "$64.00", compare_price: "", image: "", url: "/products/waxed-tote", slug: "waxed-tote", available: true, variants: [] } },
]
const collectGlobals = (collections) => `${STORELIB_GLOBALS.replace(/home:\[[^\]]*\]/, 'home:["header","hero_centered","collection_featured","faq_accordion","product_grid","promo_newsletter","cta_simple","footer"]')}window.PROBE_CARDS=${JSON.stringify(CARDS)};window.PROBE_COLLECTIONS=${JSON.stringify(collections)};`

async function openCollectionPanel(page, js) {
  const at = await js(() => {
    const sec = document.querySelector("#wb-preview-root [data-section-key][data-section-type='collection_featured']")
    sec.scrollIntoView({ block: "center" })
    const r = sec.getBoundingClientRect()
    return { x: r.left + 40, y: r.top + 30 }
  })
  await sleep(600)
  await page.mouse.click(at.x, at.y)
  for (let i = 0; i < 30; i++) {
    await sleep(200)
    if (await js(() => !!document.querySelector("[data-collection-picker]"))) return true
  }
  return false
}

async function collectEmpty({ bundle, css, width = 1440, height = 900, tag = "1440" }) {
  console.log(`\nCOLLECT, NO COLLECTIONS (${tag})`)
  const { page, js, close } = await openEditor({ kind: "storelib", bundle, css, globals: collectGlobals({ choices: [], cards: {} }), width, height, ...(width < 600 ? { beforeOpen: (p) => p.setViewport({ width, height, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }) } : {}) })
  try {
    const opened = await openCollectionPanel(page, js)
    expect(opened, "the section's panel has its collection picker", opened)
    await sleep(500)
    const empty = await js(() => {
      const p = document.querySelector("[data-collection-picker]")
      return p ? { text: p.innerText, add: !!p.querySelector("[data-collection-add]") } : null
    })
    expect(!!empty && /No collections yet/.test(empty.text) && empty.add, "it says No collections yet, and offers Add collection", empty)
    await js(() => document.querySelector("[data-collection-picker] [data-collection-add]").scrollIntoView({ block: "center" }))
    await sleep(300)
    await page.screenshot({ path: join(SHOTS, `collect-empty-${tag}.png`), captureBeyondViewport: false })
    /* Laid out for the narrow sidebar: the title on one line, nothing cut, the button on a row of its own. */
    const fit = await js(() => {
      const card = document.querySelector("[data-collection-picker] [data-empty-picker]")
      const title = [...card.querySelectorAll("span")].find((x) => x.textContent === "No collections yet")
      const lineH = parseFloat(getComputedStyle(title).lineHeight) || 18
      const cut = [...card.querySelectorAll("span, p")].filter((x) => x.scrollWidth > x.clientWidth + 1 || getComputedStyle(x).textOverflow === "ellipsis").map((x) => x.textContent)
      const btn = card.querySelector("[data-collection-add]").getBoundingClientRect()
      const r = card.getBoundingClientRect()
      return { titleLines: Math.round(title.getBoundingClientRect().height / lineH), cut, buttonFull: btn.width >= r.width - 30, buttonBelow: btn.top >= title.getBoundingClientRect().bottom, width: Math.round(r.width) }
    })
    expect(fit.titleLines === 1 && fit.cut.length === 0 && fit.buttonFull && fit.buttonBelow, "the empty state fits the sidebar: one line of title, nothing cut, the button full width below", fit)
    await (await page.$("[data-collection-picker] [data-empty-picker]")).screenshot({ path: join(SHOTS, `collect-empty-card-${tag}.png`) })
    await js(() => document.querySelector("[data-collection-picker] [data-collection-add]").click())
    await sleep(400)
    const form = await js(() => ({ name: !!document.querySelector("[data-collection-create-name]"), products: document.querySelectorAll("[data-collection-create-product]").length }))
    expect(form.name && form.products === 2, "Add collection opens a name and the shop's products to tick", form)
    /* Create with no name: it says what is missing, and makes nothing. */
    await js(() => document.querySelector("[data-collection-create-submit]").click())
    await sleep(300)
    const said = await js(() => document.querySelector("[data-collection-create] [role='alert']")?.textContent ?? null)
    expect(said === "Give the collection a name." && !(await js(() => (window.probeCollectionsMade ?? []).length)), "no name: it says so, nothing is made", said)
    await page.focus("[data-collection-create-name]")
    await page.keyboard.type("Summer edit")
    await js(() => document.querySelector("[data-collection-create-product='22222222-2222-4222-8222-222222222222']").click())
    await sleep(200)
    await page.screenshot({ path: join(SHOTS, `collect-create-${tag}.png`), captureBeyondViewport: false })
    await js(() => document.querySelector("[data-collection-create-submit]").click())
    await sleep(900)
    const made = await js(() => window.probeCollectionsMade ?? [])
    expect(made.length === 1 && made[0].title === "Summer edit" && made[0].productIds?.[0] === "22222222-2222-4222-8222-222222222222", "Create saves it, with the product ticked", made)
    const picked = await js(() => document.querySelector("[data-collection-picker]")?.innerText ?? "")
    expect(/Summer edit/.test(picked) && /Change/.test(picked), "and it is picked in the section", picked)
    let saved = null
    for (let i = 0; i < 30 && !saved; i++) {
      await sleep(250)
      saved = await js(() => {
        for (const s of [...(window.probeSaves ?? [])].reverse()) {
          const sec = Array.isArray(s.body?.sections) ? s.body.sections.find((x) => x.type === "collection_featured") : null
          if (sec && typeof sec.settings?.collection === "string" && sec.settings.collection.startsWith("00000000-")) return sec.settings.collection
        }
        return null
      })
    }
    expect(!!saved, "the section saves the new collection", saved)
    await page.screenshot({ path: join(SHOTS, `collect-picked-${tag}.png`), captureBeyondViewport: false })
  } finally {
    await close()
  }
}

async function collectSome({ bundle, css }) {
  console.log("\nCOLLECT, WITH COLLECTIONS (1440)")
  const one = { id: "33333333-3333-4333-8333-333333333333", title: "Best sellers", image: "", published: true, products_count: 2 }
  const { page, js, close } = await openEditor({ kind: "storelib", bundle, css, globals: collectGlobals({ choices: [one], cards: { [one.id]: { ...one, handle: "best-sellers", description: "", url: "/collections/best-sellers", products: [] } } }) })
  try {
    await openCollectionPanel(page, js)
    await sleep(400)
    await js(() => [...document.querySelectorAll("[data-collection-picker] button")].find((b) => /Choose collection|Change/.test(b.textContent))?.click())
    await sleep(500)
    const menu = await js(() => ({ rows: [...document.querySelectorAll("[role='listbox'] [role='option']")].map((o) => o.textContent), add: !!document.querySelector("[data-collection-new]") }))
    expect(menu.rows.some((r) => /Best sellers/.test(r)) && menu.add, "the list, and New collection under it", menu)
    await page.screenshot({ path: join(SHOTS, "collect-menu-1440.png"), captureBeyondViewport: false })
    await js(() => document.querySelector("[data-collection-new]").click())
    await sleep(300)
    await page.focus("[data-collection-create-name]")
    await page.keyboard.type("New arrivals")
    await page.keyboard.press("Enter")
    await sleep(900)
    const picked = await js(() => document.querySelector("[data-collection-picker]")?.innerText ?? "")
    expect(/New arrivals/.test(picked), "Enter makes it, and it is picked", picked)
  } finally {
    await close()
  }
}

/* ── NEWTAB ─────────────────────────────────────────────────────────────── */

async function newTabServer(html) {
  const { createServer } = await import("node:http")
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1")
    if (url.pathname === "/probe.js") { res.writeHead(200, { "Content-Type": "text/javascript" }); res.end(html.js ?? ""); return }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
    res.end(url.pathname === "/" ? html.page : `<!doctype html><title>${url.pathname}</title><p id="landed">${url.pathname}</p>`)
  })
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok))
  return { server, base: `http://127.0.0.1:${server.address().port}` }
}

/** A real press on `selector` (in `frame`): the page it opens, and where this page is afterwards. */
async function pressAndWatch(browser, page, base, press) {
  const before = page.url()
  const opened = new Promise((ok) => {
    const on = async (t) => { if (t.type() === "page") { browser.off("targetcreated", on); const p = await t.page(); await p.waitForSelector("#landed", { timeout: 8000 }).catch(() => {}); ok({ url: p.url(), opener: !!(await p.evaluate(() => !!window.opener).catch(() => true)) }); await p.close().catch(() => {}) } }
    browser.on("targetcreated", on)
    setTimeout(() => { browser.off("targetcreated", on); ok(null) }, 6000)
  })
  await press()
  const tab = await opened
  await sleep(900)
  return { tab, stayed: page.url() === before, at: page.url().replace(base, "") }
}

async function newTabStorelib() {
  const { execFileSync } = await import("node:child_process")
  const { writeFileSync, readFileSync } = await import("node:fs")
  const { appCss } = await import("./probe-css.mjs")
  const root = process.cwd()
  const dir = join(root, ".wb-probe", "newtab")
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, "next-navigation.js"), `const r = { push(h) { (window.__pushes = window.__pushes || []).push(h) }, replace(h) { (window.__pushes = window.__pushes || []).push(h) }, refresh() {}, back() {}, forward() {}, prefetch() {} }
export const useRouter = () => r
export const usePathname = () => "/"
export const useSearchParams = () => new URLSearchParams()
export const useParams = () => ({})
`)
  writeFileSync(join(dir, "next-link.js"), `import * as React from "react"
export default function Link({ href, children, prefetch, replace, scroll, ...rest }) { return React.createElement("a", { href: String(href), ...rest }, children) }
export const useLinkStatus = () => ({ pending: false })
`)
  writeFileSync(join(dir, "next-image.js"), `import * as React from "react"
export default function Image({ src, alt, fill, priority, quality, sizes, ...rest }) { return React.createElement("img", { src: typeof src === "string" ? src : "", alt, ...rest }) }
`)
  execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-header-newtab.tsx"), "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe.js")}`,
    '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;', '--define:process.env.NODE_ENV="production"',
    `--alias:next/navigation=${join(dir, "next-navigation.js")}`, `--alias:next/link=${join(dir, "next-link.js")}`, `--alias:next/image=${join(dir, "next-image.js")}`,
    `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"], { cwd: root, stdio: "inherit" })
  const css = await appCss(root)
  const page0 = `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body style="margin:0"><div id="mount" style="display:contents"></div><main style="height:2000px"></main><script src="/probe.js"></script></body></html>`
  const { server, base } = await newTabServer({ page: page0, js: readFileSync(join(dir, "probe.js"), "utf8") })
  const puppeteer = (await import("puppeteer-core")).default
  const browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] })
  try {
    console.log("\nNEWTAB, STORELIB THEME: the live header (1440)")
    let page = await browser.newPage()
    await page.setViewport({ width: 1440, height: 900 })
    await page.goto(`${base}/`)
    await page.waitForFunction(() => window.__headerProbeReady === true, { timeout: 15000 })
    await sleep(400)
    const attrs = await page.evaluate(() => {
      const a = [...document.querySelectorAll("header a, [data-site-header] a, a")].find((x) => x.textContent.trim() === "Blog")
      return { href: a?.getAttribute("href"), target: a?.getAttribute("target"), rel: a?.getAttribute("rel"), marks: document.body.innerHTML.includes("#_blank") }
    })
    expect(attrs.href === "/blog-page" && attrs.target === "_blank" && /noopener/.test(attrs.rel ?? "") && /noreferrer/.test(attrs.rel ?? "") && !attrs.marks, "a menu link marked for a new tab is drawn with target=_blank rel=noopener noreferrer, its address without the mark", attrs)
    let r = await pressAndWatch(browser, page, base, async () => {
      const box = await page.evaluate(() => { const a = [...document.querySelectorAll("a")].find((x) => x.textContent.trim() === "Blog"); const b = a.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 } })
      await page.mouse.click(box.x, box.y)
    })
    const pushes = await page.evaluate(() => window.__pushes ?? [])
    expect(!!r.tab && /\/blog-page$/.test(r.tab.url) && r.stayed && pushes.length === 0, "a real click opens it in a new tab, and the site stays where it was", { ...r, pushes })
    expect(!!r.tab && r.tab.opener === false, "the new tab has no hold on the site (noopener)", r.tab)
    await page.screenshot({ path: join(SHOTS, "newtab-header-1440.png"), clip: { x: 0, y: 0, width: 1440, height: 120 } })
    /* The dropdown's marked link. */
    /* Its dropdown open, by the keyboard's focus on More (this headless browser has no hover to open it with). */
    await page.evaluate(() => [...document.querySelectorAll("a, button")].find((x) => x.textContent.trim() === "More" && x.getClientRects().length)?.focus())
    await sleep(350)
    await page.screenshot({ path: join(SHOTS, "newtab-dropdown-1440.png"), clip: { x: 0, y: 0, width: 1440, height: 260 } })
    const help = await page.evaluate(() => { const a = [...document.querySelectorAll("a")].find((x) => x.textContent.trim() === "Help" && x.getClientRects().length); return a ? { target: a.getAttribute("target"), href: a.getAttribute("href") } : null })
    expect(help?.target === "_blank" && help?.href === "/help", "a marked link in a dropdown too", help)
    r = await pressAndWatch(browser, page, base, async () => {
      const box = await page.evaluate(() => { const a = [...document.querySelectorAll("a")].find((x) => x.textContent.trim() === "Help" && x.getClientRects().length); const b = a.getBoundingClientRect(); return { x: b.left + 12, y: b.top + b.height / 2 } })
      await page.mouse.click(box.x, box.y)
    })
    expect(!!r.tab && /\/help$/.test(r.tab.url) && r.stayed, "and a click on it opens a new tab", r)
    const cta = await page.evaluate(() => { const a = [...document.querySelectorAll("a")].find((x) => x.textContent.trim() === "Book a fitting" && x.getClientRects().length); return a ? { target: a.getAttribute("target"), href: a.getAttribute("href") } : null })
    expect(cta?.target === "_blank" && cta?.href === "/fitting", "the header's button marked for a new tab", cta)
    await page.close()

    console.log("\nNEWTAB, STORELIB THEME: the phone menu (390, touch)")
    page = await browser.newPage()
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true })
    await page.goto(`${base}/`)
    await page.waitForFunction(() => window.__headerProbeReady === true, { timeout: 15000 })
    await sleep(400)
    const burger = await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => /menu/i.test(x.getAttribute("aria-label") ?? "") && x.getClientRects().length); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
    expect(!!burger, "the phone header has its menu button", burger)
    if (burger) {
      await page.touchscreen.tap(burger.x, burger.y)
      await sleep(700)
      const link = await page.evaluate(() => { const a = [...document.querySelectorAll("[data-site-drawer='menu'] a")].find((x) => x.textContent.trim() === "Blog"); if (!a) return null; const r = a.getBoundingClientRect(); return { target: a.getAttribute("target"), href: a.getAttribute("href"), x: r.left + r.width / 2, y: r.top + r.height / 2 } })
      expect(link?.target === "_blank" && link?.href === "/blog-page", "the drawer's link has its target too", link)
      await page.screenshot({ path: join(SHOTS, "newtab-drawer-390.png") })
      if (link) {
        const t = await pressAndWatch(browser, page, base, () => page.touchscreen.tap(link.x, link.y))
        const pushes2 = await page.evaluate(() => window.__pushes ?? [])
        expect(!!t.tab && /\/blog-page$/.test(t.tab.url) && t.stayed && pushes2.length === 0, "a tap in the drawer opens a new tab; the drawer no longer opens the page here", { ...t, pushes2 })
      }
    }
    await page.close()
  } finally {
    await browser.close()
    server.close()
  }
}

async function newTabImported() {
  console.log("\nNEWTAB, IMPORTED THEME: the live page (1440)")
  const JSZip = (await import("jszip")).default
  const { readdirSync, readFileSync, statSync } = await import("node:fs")
  const { convertShopifyTheme } = await import("../lib/storelib-theme/shopify/convert.ts")
  const { themeOfInstall } = await import("../lib/storelib-theme/compat/page.ts")
  const { answer } = await import("../lib/storelib-theme/compat/site.ts")
  const dir = join(process.cwd(), "tests/fixtures/shopify-materia")
  const zip = new JSZip()
  const walk = (d, rel) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p, `${rel}${n}/`); else zip.file(`${rel}${n}`, readFileSync(p)) } }
  walk(dir, "")
  const r = await convertShopifyTheme(zip)
  if (!r.ok) throw new Error(r.error)
  const theme = themeOfInstall(r.theme.files, r.theme.settings, { assetUrl: (n) => `/assets/${encodeURIComponent(n)}`, assetText: (n) => r.theme.files[`shopify/assets/${n}`] ?? null })
  const pages = Object.fromEntries(r.theme.pages.map((p) => [p.page_key, p.sections]))
  const menus = { "main-menu": { title: "Main menu", links: [{ title: "Shop", url: "/collections/all" }, { title: "Journal", url: "/collections/all#_blank" }, { title: "Instagram", url: "https://instagram.example.invalid/atelier#_blank" }] } }
  const site = { creatorId: "c", theme, pages, products: [], collections: [], menus, shop: { name: "Atelier Nord", currency: "EUR", moneyFormat: "€{{amount}}" }, host: "127.0.0.1" }
  const out = await answer(site, { method: "GET", path: "/", query: new URLSearchParams(), body: null, cart: [] })
  /* The page as the site route sends it: the theme prints {{ link.url }} with the mark, and the drawn page turns it into a real new tab link (lib/storelib-theme/compat/page.ts, withNewTabAnchors). */
  const html = String(out.body)
  expect(!/#_blank/.test(html), "no link on the page still carries the mark", html.match(/<a[^>]*#_blank[^>]*>/)?.[0])
  const { server, base } = await newTabServer({ page: html })
  const puppeteer = (await import("puppeteer-core")).default
  const browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] })
  try {
    const page = await browser.newPage()
    await page.setRequestInterception(true)
    page.on("request", (q) => (q.url().startsWith(base) ? q.continue() : q.respond({ status: 200, contentType: "text/plain", body: "" })))
    await page.setViewport({ width: 1440, height: 900 })
    await page.goto(`${base}/`, { waitUntil: "domcontentloaded" })
    await sleep(500)
    const a = await page.evaluate(() => { const x = [...document.querySelectorAll("a")].find((y) => y.textContent.trim() === "Journal"); if (!x) return null; const r = x.getBoundingClientRect(); return { href: x.getAttribute("href"), target: x.getAttribute("target"), rel: x.getAttribute("rel"), x: r.left + r.width / 2, y: r.top + r.height / 2, shown: r.width > 0 } })
    expect(a?.href === "/collections/all" && a?.target === "_blank" && a?.rel === "noopener noreferrer", "the live page draws it as a new tab link", a)
    if (a?.shown) {
      const t = await pressAndWatch(browser, page, base, () => page.mouse.click(a.x, a.y))
      expect(!!t.tab && /\/collections\/all$/.test(t.tab.url) && t.stayed, "a real click opens a new tab, and the page stays", t)
    } else expect(false, "the header link is on screen to press", a)
    await page.screenshot({ path: join(SHOTS, "newtab-imported-1440.png"), captureBeyondViewport: false }).catch(() => {})
  } finally {
    await browser.close()
    server.close()
  }
}

/* ── DESC ───────────────────────────────────────────────────────────────── */

async function descriptionBinding({ bundle, css }) {
  console.log("\nDESC, A FEATURED PRODUCT'S DESCRIPTION (1440)")
  const id = CARDS[0].id
  const cards = CARDS.map((c, i) => ({ ...c, settings: { ...c.settings, description_html: i === 0 ? "<p>Washed <strong>linen</strong>, cut loose.</p>" : "<p>Other.</p>" } }))
  const spot = { id: "spot-1", type: "product_spotlight", name: "Product Spotlight", settings: { button_url: id, button_text: "Buy now", heading: "", subheading: "", image_side: "right", max_width: "wide", color_scheme: "white", padding_top: 64, padding_bottom: 64 }, blocks: [] }
  const globals = `${STORELIB_GLOBALS.replace(/home:\[[^\]]*\]/, `home:["header","hero_centered",${JSON.stringify(spot)},"faq_accordion","product_grid","promo_newsletter","cta_simple","footer"]`)}window.PROBE_CARDS=${JSON.stringify(cards)};`
  const { page, js, close } = await openEditor({ kind: "storelib", bundle, css, globals })
  try {
    const desc = () => js(() => { const sec = document.querySelector("#wb-preview-root [data-section-type='product_spotlight']"); const d = sec?.querySelector("[data-product-description]"); return d ? d.innerHTML : sec ? `(none) ${sec.innerText.slice(0, 200)}` : null })
    let got = null
    for (let i = 0; i < 20 && !/linen/.test(String(got)); i++) { await sleep(300); got = await desc() }
    expect(/Washed <strong>linen<\/strong>, cut loose\./.test(String(got)), "the spotlight shows its product's description from Products, as rich text", got)
    await js(() => document.querySelector("#wb-preview-root [data-section-type='product_spotlight']")?.scrollIntoView({ block: "center" }))
    await sleep(400)
    await page.screenshot({ path: join(SHOTS, "desc-spotlight-1440.png"), captureBeyondViewport: false })
    /* The product edited in Products, in another tab; the builder's tab comes back into view. */
    await js(() => { window.PROBE_CARDS = window.PROBE_CARDS.map((c, i) => (i === 0 ? { ...c, settings: { ...c.settings, description_html: "<p>Now in <em>washed sand</em>.</p>" } } : c)) })
    await sleep(15500)
    await js(() => { window.dispatchEvent(new Event("focus")); document.dispatchEvent(new Event("visibilitychange")) })
    got = null
    for (let i = 0; i < 20 && !/washed sand/.test(String(got)); i++) { await sleep(300); got = await desc() }
    expect(/Now in <em>washed sand<\/em>\./.test(String(got)), "edited in Products: the canvas shows the new words when the builder is looked at again", got)
  } finally {
    await close()
  }
}

async function main() {
  const { bundle, css } = await import("./editor-probe-harness.mjs")
  if (want("insert")) {
    await insertStorelib({ bundle, css })
    await insertPhone({ bundle, css })
    await insertImported({ bundle, css, compat: await importedTheme() })
  }
  if (want("collect")) {
    await collectEmpty({ bundle, css })
    await collectEmpty({ bundle, css, width: 390, height: 844, tag: "390" })
    await collectSome({ bundle, css })
  }
  if (want("newtab")) {
    await newTabStorelib()
    await newTabImported()
  }
  if (want("desc")) await descriptionBinding({ bundle, css })
  console.log(`\nscreenshots in ${SHOTS}`)
  console.log(`\n${broken ? `${broken} failed` : "all passed"}`)
  process.exit(broken ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(1) })
