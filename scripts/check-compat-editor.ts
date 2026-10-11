/**
 * ===========================================================================
 *  AN IMPORTED SHOPIFY THEME IN THE REAL BUILDER
 * ===========================================================================
 *   npx tsx scripts/check-compat-editor.ts <theme.zip>
 *
 * The theme goes through the import's converter; the real editor
 * (scripts/render-editor-probe.tsx, bundled by scripts/editor-probe-harness.mjs)
 * is opened on it with the network answered locally, and the theme's own
 * files served the way /api/site-theme/assets serves them. Then, at 1440x900:
 *
 *   the canvas draws the theme's page in its sandboxed frame, with the
 *   theme's own stylesheets applied and no script error in the frame
 *   a click on a section in the frame selects it in the sidebar
 *   typing a new heading in the sidebar changes that section in the frame,
 *   and only that section (the frame is not reloaded: its scroll holds)
 *   Theme settings lists the theme's own groups
 *
 * Prints what it measured. Exits 1 on any failure.
 */
import { createServer } from "node:http"
import { readFileSync } from "node:fs"
import JSZip from "jszip"
import puppeteer, { type Frame } from "puppeteer-core"
import { convertShopifyTheme } from "../lib/storelib-theme/shopify/convert"

let failed = 0
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`)
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const zipPath = process.argv[2]
  if (!zipPath) { console.log("usage: npx tsx scripts/check-compat-editor.ts <theme.zip>"); process.exit(2) }
  /* The harness bundles the editor when it is loaded; it is an ES module, and this file is run as CommonJS. */
  const { bundle, css } = (await import("./editor-probe-harness.mjs")) as { bundle: string; css: string }
  const r = await convertShopifyTheme(await JSZip.loadAsync(readFileSync(zipPath)))
  if (!r.ok) throw new Error(r.error)
  const sources = Object.fromEntries(Object.entries(r.theme.files).filter(([p]) => p.endsWith(".storelib")))
  const files = Object.fromEntries(Object.entries(r.theme.files).filter(([p, t]) => p.startsWith("shopify/") && !t.startsWith("base64:") && !/^shopify\/locales\/(?!.*\.default(\.schema)?\.json$)/.test(p)))
  const pages = Object.fromEntries(r.theme.pages.map((p) => [p.page_key, p.sections]))
  const compat = { settings: r.theme.settings, pages, sources, files }
  console.log(`${r.theme.name} in the builder`)

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1")
    if (url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html" })
      res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body><div id="app"></div><script>window.PROBE_SHORT=false;window.PROBE_COMPAT=${JSON.stringify(compat).replace(/</g, "\\u003c")}</script><script src="/editor-probe.js"></script></body></html>`)
      return
    }
    if (url.pathname === "/editor-probe.js") {
      res.writeHead(200, { "Content-Type": "text/javascript" })
      res.end(readFileSync(bundle))
      return
    }
    const asset = url.pathname.match(/^\/api\/site-theme\/assets\/[^/]+\/[^/]+\/(.+)$/)
    if (asset) {
      const name = decodeURIComponent(asset[1])
      const text = r.theme.files[`shopify/assets/${name}`]
      if (text === undefined) { res.writeHead(404, { "Access-Control-Allow-Origin": "*" }); res.end(); return }
      const type = name.endsWith(".css") ? "text/css" : name.endsWith(".js") ? "text/javascript" : name.endsWith(".svg") ? "image/svg+xml" : "text/plain"
      res.writeHead(200, { "Content-Type": type, "Access-Control-Allow-Origin": "*" })
      res.end(text)
      return
    }
    res.writeHead(404)
    res.end()
  })
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok))
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`

  const browser = await puppeteer.launch({ executablePath: process.env.CHROME ?? "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] })
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 1440, height: 900 })
    /* tsx names the functions it compiles with a helper the page does not have. */
    await page.evaluateOnNewDocument("window.__name = (f) => f")
    const frameErrors: string[] = []
    page.on("console", (m) => { if (m.type() === "error" && /frame|shopify|theme/i.test(m.text())) frameErrors.push(m.text().slice(0, 160)) })
    page.on("console", (m) => { if (m.type() === "warn" && /\[compat\]/.test(m.text())) console.log("    warn:", m.text().slice(0, 200)) })
    page.on("pageerror", (e) => frameErrors.push(`editor: ${String(e).slice(0, 160)}`))
    const pageErrors: string[] = []
    page.on("pageerror", (e) => pageErrors.push(String((e as Error).message ?? e).slice(0, 300)))
    await page.goto(base, { waitUntil: "domcontentloaded" })

    let frame: Frame | null = null
    const t0 = Date.now()
    for (let i = 0; i < 120 && !frame; i++) {
      await sleep(250)
      frame = page.frames().find((f) => f !== page.mainFrame() && f.url() === "about:srcdoc") ?? null
    }
    check("the canvas draws the theme in its frame", !!frame, `${Date.now() - t0}ms`)
    if (!frame) {
      if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/compat-editor-noframe.png` })
      console.log("  --    the editor shows:", (await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 300))), pageErrors.slice(0, 3))
      return
    }
    await sleep(2500)
    const drawn = await frame.evaluate(() => ({
      sections: document.querySelectorAll(".shopify-section").length,
      styled: getComputedStyle(document.body).fontFamily,
      sheets: document.styleSheets.length,
      sandboxed: (() => { try { return !!window.parent.document } catch { return false } })(),
    }))
    /* A theme with no sections (Shopify's Skeleton) is its layout's blocks and its templates: its header is what must be on the page. */
    const header = await frame.evaluate(() => { const h = document.querySelector("header, [data-block-id='header'], .header, #shopify-section-header"); const r = h?.getBoundingClientRect(); return r ? { h: Math.round(r.height), text: (h as HTMLElement).innerText.replace(/\s+/g, " ").trim().slice(0, 60) } : null })
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/compat-editor-first.png` })
    check("the theme's header is on the page", !!header && header.h > 20, header)
    if (drawn.sections === 0) {
      const main = await frame.evaluate(() => (document.querySelector("main") as HTMLElement | null)?.innerText.replace(/\s+/g, " ").trim().slice(0, 80) ?? "")
      const saved = await page.evaluate(() => (window as unknown as { probeCalls?: string[] }).probeCalls?.filter((c) => /sections/.test(c)).slice(0, 3))
      console.log("  --    a theme with no sections: nothing to select section by section", JSON.stringify({ main, saved }))
      return
    }
    check("the theme's sections are on the page", drawn.sections >= 4, `${drawn.sections} sections`)
    check("the theme's stylesheets apply", drawn.sheets >= 3, `${drawn.sheets} stylesheets, body font ${drawn.styled.slice(0, 40)}`)
    check("the frame cannot reach the builder", drawn.sandboxed === false)

    /*
      A block of words selects its block, and the sidebar shows the field
      that holds those words. Tried on the page's visible text blocks in
      order until one has a field (a collection's title, say, has none: it
      draws the collection's own name).
    */
    const candidates = await frame.evaluate(() => {
      const shown = (el: Element) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight * 3 }
      return [...document.querySelectorAll<HTMLElement>(".shopify-section[data-section-id]:not([class*='shopify-section-group']) [data-block-id]")]
        .filter((b) => shown(b) && !b.querySelector("[data-block-id]") && /^[^\n]{3,80}$/.test((b.textContent ?? "").trim()))
        .slice(0, 8)
        .map((b) => ({ section: b.closest(".shopify-section")!.getAttribute("data-section-id")!, block: b.getAttribute("data-block-id")!, text: (b.textContent ?? "").trim() }))
    })
    let target: { section: string; block: string; text: string } | null = null
    const frameEl = await page.$("[data-compat-canvas] iframe")
    for (const c of candidates) {
      const at = await frame.evaluate((id) => {
        const el = document.querySelector<HTMLElement>(`[data-block-id="${id}"]`)!
        el.scrollIntoView({ block: "center" })
        const r = el.getBoundingClientRect()
        return { x: r.left + Math.min(20, r.width / 2), y: r.top + r.height / 2 }
      }, c.block)
      await sleep(300)
      const box = await frameEl!.boundingBox()
      await page.mouse.click(box!.x + at.x, box!.y + at.y)
      await sleep(700)
      const found = await page.evaluate((text) => {
        document.querySelectorAll("[data-probe-field]").forEach((el) => el.removeAttribute("data-probe-field"))
        const inputs = [...document.querySelectorAll<HTMLElement>("input[type='text'], textarea, [contenteditable='true']")]
        const value = (i: HTMLElement) => ("value" in i ? (i as HTMLInputElement).value : i.textContent ?? "").replace(/<[^>]+>/g, "").trim()
        const hit = inputs.find((i) => value(i) && text.startsWith(value(i).slice(0, 12)))
        if (!hit) return false
        hit.setAttribute("data-probe-field", "")
        return true
      }, c.text)
      if (found) { target = c; break }
    }
    check("a click on a block of words selects it and the sidebar shows its words", !!target, target ? `${target.section} › ${target.block}: "${target.text}"` : `${candidates.length} tried`)
    if (!target) {
      await page.screenshot({ path: "/tmp/compat-editor.png" })
      return
    }
    const outlined = await frame.evaluate((t) => !!document.getElementById(`shopify-section-${t.section}`)?.hasAttribute("data-sl-selected") && !!document.querySelector(`[data-block-id="${t.block}"]`)?.hasAttribute("data-sl-selected-block"), target)
    check("the section and the block are outlined in the frame", outlined)
    await sleep(200)
    const ring = await frame.evaluate((t) => {
      const box = document.querySelector<HTMLElement>("[data-sl-box=section]")
      const el = document.getElementById(`shopify-section-${t.section}`)
      if (!box || !el) return null
      const a = box.getBoundingClientRect(), b = el.getBoundingClientRect()
      const top = Math.max(b.top, 0), bottom = Math.min(b.bottom, innerHeight)
      return { off: Math.max(Math.abs(a.left - b.left), Math.abs(a.width - b.width), Math.abs(a.top - top), Math.abs(a.bottom - bottom)), last: document.body.lastElementChild === box || [...document.querySelectorAll("[data-sl-box]")].includes(document.body.lastElementChild as HTMLElement), z: getComputedStyle(box).zIndex }
    }, target)
    check("the selection is one unbroken ring over the section, above everything in it", !!ring && ring.off <= 2 && ring.z === "2147483646", JSON.stringify(ring))
    /* A mark on the page's own window: still there afterwards means the page was changed in place, not drawn again. */
    await frame.evaluate(() => { (window as unknown as { __probeMark: number }).__probeMark = 1 })
    const scrollBefore = await frame.evaluate(() => scrollY)
    /* DEBUG=1: every scroll of the frame and every message it is sent, with the page's height at the time. */
    if (process.env.DEBUG) await frame.evaluate(() => { const log: string[] = []; (window as unknown as { __scrolls: string[] }).__scrolls = log; addEventListener("scroll", () => log.push(`${Math.round(scrollY)}@${Math.round(performance.now())} h=${document.documentElement.scrollHeight}`)); addEventListener("message", (e) => log.push(`message ${(e.data as { type?: string })?.type} y=${Math.round(scrollY)}`)) })
    const el = await page.$("[data-probe-field]")
    await el!.click()
    const typedAt = Date.now()
    await page.keyboard.down("Control"); await page.keyboard.press("a"); await page.keyboard.up("Control")
    await page.keyboard.type("Linen for summer", { delay: 20 })
    /* A text field hands its words to the page as it is typed in; the last of them when it pauses. */
    await sleep(600)
    let shown = -1
    for (let i = 0; i < 40; i++) {
      await sleep(100)
      const has = await frame.evaluate((id) => (document.getElementById(`shopify-section-${id}`)?.textContent ?? "").includes("Linen for summer"), target.section)
      if (has) { shown = Date.now() - typedAt; break }
    }
    check("the new heading is drawn in the frame", shown >= 0, `${shown}ms after typing began`)
    const scrollAfter = await frame.evaluate(() => scrollY)
    if (process.env.DEBUG) console.log(await frame.evaluate(() => JSON.stringify((window as unknown as { __scrolls: string[] }).__scrolls)))
    const kept = await frame.evaluate(() => (window as unknown as { __probeMark?: number }).__probeMark === 1).catch(() => false)
    check("the section was swapped in place: the page was not drawn again", kept)
    check("the frame kept its scroll", Math.abs(scrollAfter - scrollBefore) < 4, `${scrollBefore} to ${scrollAfter}`)
    /*
      THE PAGE'S SHAPE, CHANGED IN PLACE. The section is hidden, shown,
      deleted and brought back by undo from the toolbar over the canvas: each
      time the frame on screen is the same page (its mark holds), the
      section goes and comes back, and the page is never seen empty.
    */
    const front = async () => (await (await page.$("[data-compat-frame='front']"))?.contentFrame()) ?? null
    const watch = async (label: string, act: () => Promise<void>, expect: (has: boolean) => boolean) => {
      let least = Infinity
      let done = false
      const sampling = (async () => {
        while (!done) {
          const f = await front()
          const n = f ? await f.evaluate(() => document.querySelectorAll(".shopify-section").length).catch(() => 0) : 0
          least = Math.min(least, n)
          await sleep(25)
        }
      })()
      await act()
      let ok = false
      for (let i = 0; i < 40 && !ok; i++) {
        await sleep(100)
        const f = await front()
        ok = !!f && expect(await f.evaluate((id) => !!document.getElementById(`shopify-section-${id}`), target!.section).catch(() => false))
      }
      await sleep(300)
      done = true
      await sampling
      const f = await front()
      const same = !!f && (await f.evaluate(() => (window as unknown as { __probeMark?: number }).__probeMark === 1).catch(() => false))
      check(label, ok && same && least > 0, `${ok ? "" : "not changed; "}${same ? "same page" : "the page was drawn again"}; at least ${least} sections on screen throughout`)
    }
    const press = (name: string) => async () => {
      let ok = false
      for (let i = 0; i < 30 && !ok; i++) {
        ok = await page.evaluate((n) => { const b = document.querySelector<HTMLButtonElement>(`button[aria-label="${n}"]:not([disabled])`); b?.click(); return !!b }, name)
        if (!ok) await sleep(100)
      }
      if (!ok) console.log(`    (no "${name}" button)`)
    }
    await watch("Hide takes the section off the page in place", press("Hide"), (has) => !has)
    const undo = async () => { await page.keyboard.down("Control"); await page.keyboard.press("z"); await page.keyboard.up("Control") }
    await watch("Undo shows it again in place", undo, (has) => has)
    await watch("Delete takes it off in place", press("Delete"), (has) => !has)
    await watch("Undo brings it back in place", undo, (has) => has)
    /* Moved down one: the same page, the section now after the one that followed it. */
    const orderNow = async () => (await (await front())!.evaluate(() => [...document.querySelectorAll(".shopify-section")].map((e) => e.getAttribute("data-section-id"))))
    const before = await orderNow()
    /* Deleting it let go of the selection; a click in the page picks it again. */
    {
      const f = (await front())!
      const at = await f.evaluate((id) => { const el = document.getElementById(`shopify-section-${id}`)!; el.scrollIntoView({ block: "center" }); const r = el.getBoundingClientRect(); return { x: r.left + 12, y: r.top + Math.min(40, r.height / 2) } }, target.section)
      await sleep(300)
      const box = await (await page.$("[data-compat-frame='front']"))!.boundingBox()
      await page.mouse.click(box!.x + at.x, box!.y + at.y)
      await sleep(600)
    }
    await press("Move down")()
    await sleep(1200)
    const after = await orderNow()
    const i = before.indexOf(target.section)
    const sameMark = await (await front())!.evaluate(() => (window as unknown as { __probeMark?: number }).__probeMark === 1)
    check("Move down moves it in place", i >= 0 && after.indexOf(target.section) === i + 1 && after[i] === before[i + 1] && sameMark, `${before.slice(i, i + 2).join(", ")} to ${after.slice(i, i + 2).join(", ")}`)
    await undo()
    await sleep(800)

    /*
      ADD SECTION draws the theme's own sections: each card a frame of the
      theme's engine, with the section's markup in it, and a card picked
      lands on the page in place.
    */
    {
      const sectionsBefore = await (await front())!.evaluate(() => document.querySelectorAll(".shopify-section").length)
      /* The page's list, and its own Add section. */
      for (let i = 0; i < 20; i++) {
        const opened = await page.evaluate(() => {
          const add = document.querySelector<HTMLElement>("[data-section-group='template'] [data-add-section]")
          if (add) { add.click(); return true }
          const back = document.querySelector<HTMLElement>("[data-panel-back] button")
          const tab = [...document.querySelectorAll<HTMLElement>("button, [role='tab']")].find((b) => (b.textContent ?? "").trim() === "Sections")
          ;(back ?? tab)?.click()
          return false
        })
        if (opened) break
        await sleep(250)
      }
      let drawnCards = 0
      let cards = 0
      for (let i = 0; i < 60 && drawnCards < 6; i++) {
        await sleep(250)
        /* Down the list, as somebody looking would: the cards nearest the screen are drawn first. */
        if (i % 4 === 3) await page.evaluate(() => { const c = [...document.querySelectorAll("[data-compat-preview]")].find((b) => b.getAttribute("data-compat-preview-state") === "waiting"); c?.scrollIntoView({ block: "center" }) })
        ;({ cards, drawnCards } = await page.evaluate(() => ({ cards: document.querySelectorAll("[data-library-card]").length, drawnCards: document.querySelectorAll("[data-compat-preview-state='shown']").length })))
      }
      /* Every card's section is in the one frame over the list (compat-section-preview.tsx, CompatPreviewSheet). */
      const filled = await Promise.all(page.frames().filter((f) => f.parentFrame() === page.mainFrame() && f.url() === "about:srcdoc").map((f) => f.evaluate(() => [...document.querySelectorAll("[data-sl-pv][data-on]")].map((w) => {
        const s = w.querySelector(".shopify-section") ?? w
        return (s.textContent ?? "").trim().length + s.querySelectorAll("img, svg, picture").length
      })).catch(() => [] as number[])))
      const withContent = filled.flat().filter((n) => n > 0).length
      await page.screenshot({ path: "/tmp/compat-editor-library.png" })
      check("Add section's cards are the theme's sections, drawn", cards > 0 && drawnCards >= 6 && withContent >= 5, `${cards} cards, ${drawnCards} drawn, ${withContent} with content`)
      const picked = await page.evaluate(() => { const c = document.querySelector<HTMLElement>("[data-library-card]"); c?.click(); return c?.getAttribute("data-library-card") ?? null })
      let after = sectionsBefore
      for (let i = 0; i < 30 && after <= sectionsBefore; i++) {
        await sleep(150)
        after = await (await front())!.evaluate(() => document.querySelectorAll(".shopify-section").length).catch(() => sectionsBefore)
      }
      const sameMark = await (await front())!.evaluate(() => (window as unknown as { __probeMark?: number }).__probeMark === 1).catch(() => false)
      check("a card picked lands on the page in place", after === sectionsBefore + 1 && sameMark, `${picked}: ${sectionsBefore} to ${after} sections, ${sameMark ? "same page" : "drawn again"}`)
      await undo()
      await sleep(800)
    }

    /* A link in the header opens its page in the builder, as the site's own navigation does. */
    {
      const f = (await front())!
      const link = await f.evaluate(() => {
        const a = [...document.querySelectorAll<HTMLAnchorElement>(".shopify-section-group-header-group a[href]")].find((x) => {
          const h = x.getAttribute("href") ?? ""
          const r = x.getBoundingClientRect()
          return /^\/(collections|products|search|cart|pages)/.test(h) && r.width > 0 && r.height > 0 && r.top >= 0 && r.top < innerHeight
        })
        if (!a) return null
        scrollTo(0, 0)
        const r = a.getBoundingClientRect()
        return { href: a.getAttribute("href"), x: r.left + r.width / 2, y: r.top + r.height / 2 }
      })
      if (link) {
        const box = await (await page.$("[data-compat-frame='front']"))!.boundingBox()
        await page.mouse.click(box!.x + link.x, box!.y + link.y)
        let opened = ""
        for (let i = 0; i < 40 && !opened; i++) {
          await sleep(150)
          opened = await page.evaluate(() => [...document.querySelectorAll("button")].map((b) => (b.textContent ?? "").trim()).find((t) => /^(Collection|Products|All products|Search|Cart|Collections)/i.test(t)) ?? "")
        }
        check("a link in the header opens its page", !!opened, `${link.href} to ${opened || "nothing"}`)
        /* Home again, for the checks after this. */
        await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("button")].find((b) => /^(Collection|Products|All products|Search|Cart|Collections)/i.test((b.textContent ?? "").trim()))?.click())
        await sleep(400)
        await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[role='option'], [role='menuitem'], button")].find((b) => /^Home( page)?$/i.test((b.textContent ?? "").trim()))?.click())
        await sleep(1500)
        /* A page opened is a new page: the mark goes on it again, for the in-place checks after this. */
        for (let i = 0; i < 20; i++) {
          const marked = await (await front())?.evaluate(() => { (window as unknown as { __probeMark: number }).__probeMark = 1; return document.querySelectorAll(".shopify-section").length > 0 }).catch(() => false)
          if (marked) break
          await sleep(250)
        }
      } else {
        check("a link in the header opens its page", false, `no header link to press: ${JSON.stringify(await f.evaluate(() => [...document.querySelectorAll(".shopify-section-group-header-group a[href]")].map((a) => { const r = a.getBoundingClientRect(); return `${a.getAttribute("href")}@${Math.round(r.top)}x${Math.round(r.width)}` }).slice(0, 12)))}`)
      }
    }

    /* Every save the editor made is one the routes accept: their own schema, not a copy of it. */
    await sleep(2500)
    const saves = await page.evaluate(() => (window as unknown as { probeSaves?: { url: string; body: { sections?: unknown[]; page_key?: string } }[] }).probeSaves ?? [])
    const { z } = await import("zod")
    const { BlockInstanceSchema } = await import("../lib/website-builder/block-tree")
    /* The routes' own rules (app/api/website-builder/themes/[installId]/sections/route.ts): a name may be missing, a group is one of the four. */
    const SectionSaveSchema = z.object({ id: z.string().min(1).max(128), type: z.string().min(1).max(64), name: z.string().max(256).optional(), settings: z.record(z.unknown()), blocks: z.array(BlockInstanceSchema).max(500).optional(), hidden: z.boolean().optional(), group: z.enum(["header", "footer", "overlay"]).optional(), slot: z.string().regex(/^[a-z0-9_-]{1,64}$/i).optional() })
    const pageSaves = saves.filter((x) => /\/sections$/.test(x.url))
    const refused = pageSaves.map((x) => z.array(SectionSaveSchema).safeParse(x.body.sections)).filter((r) => !r.success)
    check("every page the editor saved is one the save route accepts", pageSaves.length > 0 && refused.length === 0, `${pageSaves.length} saves${refused.length ? `; refused: ${JSON.stringify((refused[0] as { error: { issues: unknown[] } }).error.issues.slice(0, 2))}` : ""}`)

    /* Theme settings: the theme's own groups, and a change to one draws the page with it. */
    const opened = await page.evaluate(() => {
      const tab = [...document.querySelectorAll<HTMLElement>("button, [role='tab']")].find((b) => (b.textContent ?? "").trim() === "Theme")
      tab?.click()
      return !!tab
    })
    await sleep(800)
    /* The theme's own group names, from its settings_schema.json and its locale: not Storelib's. */
    const own = (JSON.parse(files["shopify/config/settings_panel.json"] ?? "[]") as { name: string }[]).map((g) => g.name)
    const groups = await page.evaluate((names) => [...document.querySelectorAll<HTMLElement>("button")].map((b) => (b.textContent ?? "").trim()).filter((t) => names.includes(t)), own)
    check("Theme settings lists the theme's own groups", opened && own.length >= 3 && groups.length === own.length, `${groups.length} of ${own.length}: ${groups.slice(0, 8).join(", ")}`)
    if (groups.length) {
      await page.evaluate((name) => [...document.querySelectorAll<HTMLElement>("button")].find((b) => (b.textContent ?? "").trim() === name)?.click(), groups[0])
      await sleep(500)
      const fields = await page.evaluate(() => document.querySelectorAll("[data-compat-theme-group] input, [data-compat-theme-group] select, [data-compat-theme-group] button[role='switch'], [data-compat-theme-group] [data-color-chip]").length)
      check(`"${groups[0]}" opens with its controls`, fields > 0, `${fields} controls`)
    }
    /* A colour scheme's colour, where the theme has schemes (Dawn): changed in the panel, drawn in the frame. */
    const schemeGroup = (JSON.parse(files["shopify/config/settings_panel.json"] ?? "[]") as { name: string; settings: { id: string; type: string }[] }[]).find((g) => g.settings.some((x) => x.id.includes("::") && x.type === "color"))
    if (schemeGroup) {
      /* The panel's own Back, not the editor's: back to the list of groups. */
      await page.evaluate(() => document.querySelector<HTMLElement>("[data-compat-theme-group] [data-panel-back] button")?.click())
      await sleep(400)
      await page.evaluate((name) => [...document.querySelectorAll<HTMLElement>("button")].find((b) => (b.textContent ?? "").trim() === name)?.click(), schemeGroup.name)
      await sleep(500)
      /* A colour is a row that opens its picker, which carries the hex box. */
      const chip = await page.$("[data-compat-theme-group] button[aria-expanded]")
      let typed = false
      if (chip) {
        await chip.click()
        await sleep(400)
        const hex = await page.evaluateHandle(() => [...document.querySelectorAll<HTMLInputElement>("[data-compat-theme-group] input[placeholder='#FFFFFF']")][0] ?? null)
        const input = hex.asElement() as import("puppeteer-core").ElementHandle<HTMLInputElement> | null
        if (input) {
          await input.click()
          await page.keyboard.down("Control"); await page.keyboard.press("a"); await page.keyboard.up("Control")
          await page.keyboard.type("#123456")
          await page.keyboard.press("Enter")
          typed = true
        }
      }
      let drawn = false
      for (let i = 0; i < 40 && typed && !drawn; i++) {
        await sleep(250)
        const f = await front()
        drawn = !!f && (await f.evaluate(() => document.documentElement.outerHTML.includes("18,52,86") || document.documentElement.outerHTML.toLowerCase().includes("#123456")).catch(() => false))
      }
      const f = await front()
      const inPlace = !!f && (await f.evaluate(() => (window as unknown as { __probeMark?: number }).__probeMark === 1).catch(() => false))
      check("  and the page took the new colour in place", inPlace)
      check(`a colour scheme's colour changed in "${schemeGroup.name}" is drawn in the frame`, typed && drawn, typed ? "" : "no colour field to type in")
    }
    /* Hover and focus: Storelib's own group after the theme's, a button hover colour drawn in place. */
    {
      await page.evaluate(() => document.querySelector<HTMLElement>("[data-compat-theme-group] [data-panel-back] button")?.click())
      await sleep(400)
      await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("button")].find((b) => (b.textContent ?? "").trim() === "Hover and focus")?.click())
      await sleep(500)
      const chip = await page.$("[data-compat-theme-group='Hover and focus'] button[aria-expanded]")
      if (chip) {
        await chip.click()
        await sleep(300)
        const hex = await page.$("[data-compat-theme-group='Hover and focus'] input[placeholder='#FFFFFF']")
        await hex?.click()
        await page.keyboard.down("Control"); await page.keyboard.press("a"); await page.keyboard.up("Control")
        await page.keyboard.type("#654321")
        await page.keyboard.press("Enter")
      }
      let rule = ""
      for (let i = 0; i < 30 && !rule.includes("#654321"); i++) {
        await sleep(200)
        rule = await (await front())!.evaluate(() => document.querySelector("style[data-storelib-overrides]")?.textContent ?? "").catch(() => "")
      }
      const kept = await (await front())!.evaluate(() => (window as unknown as { __probeMark?: number }).__probeMark === 1).catch(() => false)
      check("Hover and focus: a button hover colour reaches the page, in place", !!chip && rule.includes("background-color:#654321") && kept, rule.slice(0, 120))
      const f = (await front())!
      const btn = await f.evaluate(() => {
        for (const b of document.querySelectorAll<HTMLElement>("main .button, main button[type=submit], .button")) {
          if (b.classList.contains("button-unstyled")) continue
          b.scrollIntoView({ block: "center" })
          const r = b.getBoundingClientRect()
          if (r.width < 20 || r.height < 10) continue
          const x = r.left + r.width / 2, y = r.top + r.height / 2
          if (document.elementFromPoint(x, y)?.closest(".button, button[type=submit]") === b) return { x, y }
        }
        return null
      })
      if (btn) {
        await sleep(300)
        const box = await (await page.$("[data-compat-frame='front']"))!.boundingBox()
        await page.mouse.move(box!.x + btn.x, box!.y + btn.y)
        await sleep(400)
        const bg = await f.evaluate((p) => { const el = document.elementFromPoint(p.x, p.y)?.closest<HTMLElement>(".button, button[type=submit]"); return el ? getComputedStyle(el).backgroundColor : "none" }, btn)
        check("  and a button under the pointer wears it", bg === "rgb(101, 67, 33)", bg)
      }
    }
    await page.screenshot({ path: "/tmp/compat-editor-theme.png" })
    /* A save the route refuses: a banner in words with one thing to do, never the route's "Invalid body". */
    {
      await page.evaluate(() => { (window as unknown as { PROBE_SAVE_FAIL: number }).PROBE_SAVE_FAIL = 400 })
      /*
        AN EDIT OF A SECTION, then its save. The last change before this
        point is a theme colour, which saves through another route, and
        autosave may already have sent it, so there was sometimes nothing for
        Save to send and no refusal to show. The heading edited at the start
        is selected again and given a few more words.
      */
      const fr = await front()
      if (fr && target) {
        const at = await fr.evaluate((id) => {
          const el = document.querySelector<HTMLElement>(`[data-block-id="${id}"]`)
          if (!el) return null
          el.scrollIntoView({ block: "center" })
          const r = el.getBoundingClientRect()
          return { x: r.left + Math.min(20, r.width / 2), y: r.top + r.height / 2 }
        }, target.block)
        const box = await (await page.$("[data-compat-frame='front']"))?.boundingBox()
        if (at && box) {
          await page.mouse.click(box.x + at.x, box.y + at.y)
          await sleep(700)
          const field = await page.evaluateHandle(() => [...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input[type='text'], textarea")].find((i) => /Linen for summer/.test(i.value)) ?? null)
          const el = field.asElement() as import("puppeteer-core").ElementHandle<HTMLInputElement> | null
          if (el) {
            await el.click()
            await page.keyboard.press("End")
            await page.keyboard.type(" now", { delay: 20 })
          }
        }
      }
      await sleep(300)
      await page.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => /^save$/i.test((b.textContent ?? "").trim()))?.click())
      let banner = ""
      for (let i = 0; i < 40 && !banner; i++) {
        await sleep(150)
        banner = await page.evaluate(() => document.querySelector("[data-save-problem]")?.textContent ?? "")
      }
      await page.screenshot({ path: "/tmp/compat-editor-save-problem.png" })
      const seen = await page.evaluate(() => {
        const el = document.querySelector<HTMLElement>("[data-save-problem]")
        if (!el) return "none"
        const r = el.getBoundingClientRect()
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
        return { r: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], onTop: !!top && el.contains(top), cover: top ? `${top.tagName}.${String(top.className).slice(0, 60)}` : null }
      })
      check("  and it is on top, where it can be seen", typeof seen === "object" && seen.onTop, JSON.stringify(seen))
      check("a refused save shows a banner in words, with what to do", /couldn't be saved/.test(banner) && /Undo/.test(banner) && !/invalid body/i.test(banner), banner.slice(0, 160))
      await page.evaluate(() => { (window as unknown as { PROBE_SAVE_FAIL: number }).PROBE_SAVE_FAIL = 0 })
      await page.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => /^save$/i.test((b.textContent ?? "").trim()))?.click())
      let gone = false
      for (let i = 0; i < 40 && !gone; i++) {
        await sleep(150)
        gone = await page.evaluate(() => !document.querySelector("[data-save-problem]"))
      }
      check("  and it goes once a save lands", gone)
    }
    await page.screenshot({ path: "/tmp/compat-editor.png" })
    check("no script errors", frameErrors.length === 0, frameErrors[0] ?? "")
  } finally {
    await browser.close()
    server.close()
  }
  console.log(failed ? `\n${failed} failed` : "\nall passed")
  process.exit(failed ? 1 : 0)
}
main()
