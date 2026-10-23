/**
 * ===========================================================================
 *  THE CANVAS THAT STOPS SCROLLING
 * ===========================================================================
 * The owner, round 1023: "the canvas sometimes freezes: it stops scrolling,
 * the scrollbar on the right goes; a double click sometimes brings it back,
 * often not; selecting a section with the inspector brings it back;
 * otherwise only a reload does."
 *
 * The real editor (scripts/render-editor-probe.tsx through
 * scripts/editor-probe-harness.mjs), driven with real input, on an imported
 * theme (tests/fixtures/shopify-materia through the real converter, given
 * what store themes' scripts do: a menu drawer and a pop-up that hold the
 * page still with a class or a style on <html> or <body>, a page transition
 * that holds it still until an overlay's animation ends) and on a Storelib
 * theme. After every step of every sequence it measures, in the canvas:
 *
 *   WHEEL     a real wheel over the middle of the canvas, and how far the
 *             canvas moved (it has room: scrollHeight > clientHeight)
 *   LOCK      overflow on the canvas's <html> and <body> (imported) or on
 *             #wb-preview-root (Storelib), as computed
 *   TOP       what is under the pointer there: the canvas frame, or
 *             something of the editor's over it
 *
 * A step after which a wheel with room to scroll moves nothing is a freeze.
 *
 * Round 1023, the bundle before the round and after it (wheel moved of
 * 400px; "open" is a theme layer still open on screen, the theme's to hold):
 *
 *                                                  before          after
 *   imported  a pop-up open, its section hidden    0 (html held)   400
 *             a page transition link pressed       0 (held for     400 (the overlay plays in
 *               (inspector on, then off)             good)           1ms; the page that left the
 *                                                                    frame is drawn again or
 *                                                                    opened as the editor would)
 *             every step after that one            0               400
 *             menu drawer open, header drawn       open            open
 *             every other step                     400             400
 *   storelib  every step (its drawers counted)     400             400
 *
 *   npx tsx scripts/check-canvas-freeze.mjs
 *   THEME=storelib|imported   one theme only
 *   ONLY=<regexp>             only the sequences whose name matches
 *   EDITOR_BUNDLE=<file>      reuse a bundle (one from another commit, to compare)
 *   BUDGET=0                  report without failing
 */
import { importedTheme, openEditor, sleep } from "./canvas-probe-kit.mjs"

const BUDGET = process.env.BUDGET !== "0"
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY, "i") : null
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : BUDGET ? "FAIL" : "note"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got).slice(0, 400)})`}`)
  if (!ok && BUDGET) broken++
}

async function run({ kind, bundle, css, compat }) {
  const frozen = []
  const { page, front, errors, js, close } = await openEditor({ kind, bundle, css, compat })
  try {
    console.log(`\n${kind === "imported" ? "IMPORTED THEME (Materia fixture, with a menu drawer, a pop-up and a page transition)" : "STORELIB THEME"}`)

    /* The middle of the canvas, in the editor's window. */
    const centre = async () => js(() => {
      const el = document.getElementById("wb-preview-root")
      const r = el.getBoundingClientRect()
      return { x: Math.round(r.left + r.width * 0.6), y: Math.round(r.top + r.height * 0.55) }
    })
    const where = async () => {
      if (kind === "imported") {
        const f = await front()
        if (!f) return null
        return f.evaluate(() => {
          const se = document.scrollingElement || document.documentElement
          return { top: scrollY, room: se.scrollHeight - se.clientHeight, html: getComputedStyle(document.documentElement).overflowY, body: getComputedStyle(document.body).overflowY, bodyClass: document.body.className, htmlStyle: document.documentElement.getAttribute("style") || "" }
        }).catch(() => null)
      }
      return js(() => {
        const el = document.getElementById("wb-preview-root")
        return { top: el.scrollTop, room: el.scrollHeight - el.clientHeight, html: getComputedStyle(el).overflowY, body: getComputedStyle(document.body).overflowY, bodyClass: "", htmlStyle: el.getAttribute("style") || "" }
      })
    }
    /* What is under the pointer in the editor's own document. */
    const topAt = async (p) => js((p) => {
      const el = document.elementFromPoint(p.x, p.y)
      if (!el) return "nothing"
      if (el.tagName === "IFRAME") return `iframe[${el.getAttribute("data-compat-frame")}] pe=${getComputedStyle(el).pointerEvents}`
      const box = el.closest("#wb-preview-root")
      const id = el.id ? `#${el.id}` : ""
      return `${box ? "canvas:" : "OVER:"}${el.tagName.toLowerCase()}${id}.${String(el.className || "").split(" ").slice(0, 3).join(".")} bodyPE=${getComputedStyle(document.body).pointerEvents}`
    }, p)
    /*
      A wheel over the canvas: 400px down, measured, and the same back up so
      every sequence starts where the last one did. Moved less than 40px with
      room for it is a freeze.
    */
    const measure = async (step) => {
      const p = await centre()
      await page.mouse.move(p.x, p.y)
      const a = await where()
      if (!a) { console.log(`    ${step.padEnd(58)} (no canvas)`); return }
      const startAt = a.top
      /* Not at the very bottom: leave room for the wheel down. */
      if (a.room > 0 && a.top > a.room - 420) {
        if (kind === "imported") await (await front()).evaluate(() => scrollTo(0, Math.max(0, scrollY - 500)))
        else await js(() => { const el = document.getElementById("wb-preview-root"); el.scrollTop = Math.max(0, el.scrollTop - 500) })
        await sleep(150)
      }
      const b0 = await where()
      await page.mouse.wheel({ deltaY: 400 })
      await sleep(450)
      const b = await where()
      const moved = Math.round((b?.top ?? 0) - (b0?.top ?? 0))
      const top = await topAt(p)
      /* Held by something the theme has open on screen is the theme's, and not a freeze. */
      const open = kind === "imported" ? await (await front()).evaluate(() => !!document.querySelector("[data-md].is-open, [data-np].is-open")).catch(() => false) : false
      const stuck = b0.room > 60 && Math.abs(moved) < 40 && !open
      if (stuck) frozen.push({ step, top, lock: b0 })
      console.log(`    ${stuck ? "FROZEN" : open ? "open  " : "ok    "} ${step.padEnd(52)} wheel ${String(moved).padStart(4)}px of 400 (room ${b0.room})  overflow html/root ${b0.html} body ${b0.body}${b0.bodyClass && /overflow|leaving/.test(b0.bodyClass) ? ` class="${b0.bodyClass}"` : ""}${b0.htmlStyle && /overflow/.test(b0.htmlStyle) ? ` style="${b0.htmlStyle}"` : ""}  top ${top}`)
      if (!stuck) {
        await page.mouse.wheel({ deltaY: -400 })
        await sleep(350)
      }
      void startAt
      return !stuck
    }
    /* A press inside the canvas, at a point the theme's element is at. */
    const pressIn = async (selector, opts = {}) => {
      if (kind === "imported") {
        const f = await front()
        const at = await f.evaluate((sel, reveal) => {
          const el = document.querySelector(sel)
          if (!el) return null
          if (reveal) el.scrollIntoView({ block: "center" })
          const r = el.getBoundingClientRect()
          return { x: r.left + Math.min(r.width / 2, 30), y: r.top + Math.min(r.height / 2, 20) }
        }, selector, opts.reveal !== false)
        if (!at) return false
        await sleep(200)
        const box = await (await page.$("[data-compat-frame='front']")).boundingBox()
        await page.mouse.click(box.x + at.x, box.y + at.y, { clickCount: opts.double ? 2 : 1 })
      } else {
        const at = await js((sel, reveal) => {
          const el = document.querySelector(`#wb-preview-root ${sel}`)
          if (!el) return null
          if (reveal) el.scrollIntoView({ block: "center" })
          const r = el.getBoundingClientRect()
          return { x: r.left + Math.min(r.width / 2, 30), y: r.top + Math.min(r.height / 2, 20) }
        }, selector, opts.reveal !== false)
        if (!at) return false
        await sleep(200)
        await page.mouse.click(at.x, at.y, { clickCount: opts.double ? 2 : 1 })
      }
      await sleep(600)
      return true
    }
    const button = async (re) => js((src) => {
      const re = new RegExp(src, "i")
      const all = document.querySelectorAll("button, [role=button], [role=tab], [role=menuitem], [role=option]")
      for (const b of all) {
        if (b.closest("#wb-preview-root")) continue
        const t = ((b.getAttribute("aria-label") || "") + " " + (b.textContent || "")).replace(/\s+/g, " ").trim()
        if (re.test(t) && b.getClientRects().length) { b.click(); return t.slice(0, 60) }
      }
      return null
    }, re.source)
    const inspector = async (on) => js((on) => {
      const b = document.querySelector("[aria-label*='nspect' i][aria-pressed], button[aria-label*='nspect' i]")
      if (!b) return null
      const pressed = b.getAttribute("aria-pressed") === "true"
      if (pressed !== on) b.click()
      return true
    }, on)
    /* A section's settings: a text field in the sidebar, typed into (a live edit drawing the section again). */
    const typeInSidebar = async (text) => {
      const ok = await js(() => {
        const side = document.querySelector("[data-wb-sidebar-scroll]") || document
        const f = [...side.querySelectorAll("input[type=text], input:not([type]), textarea")].find((x) => x.getClientRects().length && !x.closest("#wb-preview-root"))
        if (!f) return false
        f.focus(); f.select?.()
        return true
      })
      if (!ok) return false
      await page.keyboard.type(text, { delay: 30 })
      await sleep(900)
      return true
    }
    /* What holds the canvas at this moment, said in the log: a step that meant to open something shows it did. */
    const peek = async (label) => {
      const w = await where()
      const open = kind === "imported"
        ? await (await front())?.evaluate(() => { const o = [...document.querySelectorAll("[data-md].is-open, [data-np].is-open")].map((e) => e.className); return o.join(",") }).catch(() => "")
        : await js(() => [...document.querySelectorAll("#wb-preview-root [role=dialog]")].filter((e) => e.getClientRects().length).length + " dialogs")
      console.log(`           ${label}: overflow ${w?.html}/${w?.body} ${w?.bodyClass || ""} ${w?.htmlStyle || ""} open=[${open}]`)
    }
    const escape = async () => { await page.keyboard.press("Escape"); await sleep(400) }
    const sidebarSelect = async (re) => {
      await button(/^Sections$/)
      await sleep(400)
      const ok = await js((src) => {
        const re = new RegExp(src, "i")
        const rows = document.querySelectorAll("[data-wb-sidebar-scroll] [role=button], [data-wb-sidebar-scroll] button")
        for (const r of rows) if (re.test((r.textContent || "").trim()) && r.getClientRects().length) { r.click(); return true }
        return false
      }, re.source)
      await sleep(700)
      return ok
    }
    const pageSwitch = async (key) => {
      const opened = await js(() => { const b = document.querySelector("[data-page-switcher]"); if (b) { b.click(); return true } return false })
      await sleep(500)
      const picked = opened ? await js((key) => { const r = document.querySelector(`[data-page-row="${key}"]`); if (!r) return null; r.click(); return key }, key) : null
      await sleep(2500)
      return picked
    }
    /* A press the theme's own script hears, on an element the desktop layout may hide (the phone menu's button). */
    const clickInFrame = async (selector) => {
      const ok = await (await front()).evaluate((sel) => { const el = document.querySelector(sel); if (!el) return false; el.click(); return true }, selector)
      await sleep(500)
      return ok
    }
    const device = async (want) => { await js((want) => { const b = document.querySelector("[data-wb-device-switch]"); if (b && b.getAttribute("data-wb-device") !== want) b.click() }, want); await sleep(1500) }

    const sequences = kind === "imported"
      ? [
          ["load", async () => {}],
          ["select a section in the canvas", async () => pressIn(".rt h2")],
          ["select a block in the canvas", async () => pressIn(".pg__card")],
          ["select from the sidebar", async () => sidebarSelect(/Rich text|Testo/)],
          ["open the menu drawer and close it", async () => { await inspector(false); await clickInFrame(".hd__burger"); await peek("opened"); await pressIn("[data-md] .md__close", { reveal: false }); await inspector(true) }],
          ["menu drawer open, header drawn again", async () => {
            await inspector(false)
            await clickInFrame(".hd__burger")
            await peek("opened")
            await inspector(true)
            await sidebarSelect(/^Header/)
            const f = await front()
            /* The header drawn again, as an edit that changes its shape does (a swap). */
            await f.evaluate(() => {
              const el = document.querySelector(".section-header, [id^='shopify-section-'][class*='header']") || document.querySelector(".shopify-section")
              const id = el.getAttribute("data-section-id") || el.id.replace(/^shopify-section-/, "")
              /* A new element in it: the shape changed, so it is swapped, the drawer's markup with it (as Dawn's header drawn again). */
              const html = el.outerHTML.replace(/<div class="hd__inner"[^>]*>/, (m) => m + '<span class="hd__new"></span>').replace("md is-open", "md")
              window.postMessage({ storelib: 1, type: "section", id, html: html.replace("Chiudi", "Chiudi menu"), prev: el.outerHTML }, "*")
            })
            await sleep(900)
            await peek("drawn again")
            if (process.env.DEBUG) console.log("           dbg swapped:", await (await front()).evaluate(() => !!document.querySelector(".hd__new") + " " + document.querySelectorAll("[data-md]").length + " " + (document.querySelector(".section-header") ? "has .section-header" : "no .section-header")))
          }],
          ["pop-up open, then another page and back", async () => {
            await inspector(false)
            await clickInFrame("[data-pop-open]")
            await inspector(true)
            await peek("opened")
            console.log("           to: " + await pageSwitch("page"))
            console.log("           back: " + await pageSwitch("home"))
            await peek("back")
          }],
          ["pop-up open, its section hidden", async () => {
            await inspector(false)
            await clickInFrame("[data-pop-open]")
            await inspector(true)
            const f = await front()
            await f.evaluate(() => { const el = document.querySelector("[data-np]"); const s = el.closest(".shopify-section"); window.postMessage({ storelib: 1, type: "patch", remove: [s.getAttribute("data-section-id")] }, "*") })
            await sleep(800)
          }],
          ["a page transition link pressed (inspector on)", async () => {
            if (process.env.DEBUG) await js(() => { window.__msgs = []; new MutationObserver((l) => { for (const r of l) { for (const a of r.addedNodes) if (a.tagName === "IFRAME") window.__msgs.push("+iframe"); for (const a of r.removedNodes) if (a.tagName === "IFRAME") window.__msgs.push("-iframe:" + a.getAttribute("data-compat-frame")); if (r.type === "attributes" && r.target.tagName === "IFRAME") window.__msgs.push("~" + r.target.getAttribute("data-compat-frame")) } }).observe(document.getElementById("wb-preview-root"), { childList: true, subtree: true, attributes: true, attributeFilter: ["data-compat-frame"] }); window.addEventListener("message", (e) => { if (e.data && e.data.storelib) window.__msgs.push(e.data.type + (e.data.href ? ":" + e.data.href : "") + ([...document.querySelectorAll("iframe[data-compat-frame]")].find((f) => f.contentWindow === e.source)?.getAttribute("data-compat-frame") || "@?")) }) })
            await pressIn("[data-transition]")
            await sleep(1500)
            if (process.env.DEBUG) {
              await sleep(4000)
              for (let i = 0; i < 3; i++) { const p = await centre(); await page.mouse.move(p.x, p.y); const y0 = await (await front()).evaluate(() => scrollY); await page.mouse.wheel({ deltaY: 300 }); await sleep(600); console.log("           dbg wheel try", i, y0, "->", await (await front()).evaluate(() => scrollY + " " + document.documentElement.getAttribute("data-sl-unlock") + " " + getComputedStyle(document.documentElement).overflowY + " " + document.body.className)) } console.log("           dbg msgs", await js(() => window.__msgs.filter((m) => !/scrolled|box|intent|storage/.test(m)).join(" ")))
              for (const h of await page.$$("iframe[data-compat-frame]")) { const f = await h.contentFrame(); console.log("           frame", await h.evaluate((e) => e.getAttribute("data-compat-frame") + " " + e.style.cssText), f ? f.url() : "-", f ? await f.evaluate(() => document.querySelectorAll(".shopify-section").length + " sections").catch((e) => String(e).slice(0, 60)) : "") } }
          }],
          ["a page transition link pressed (inspector off)", async () => {
            await inspector(false)
            await pressIn("[data-transition]")
            await sleep(2500)
            await inspector(true)
            if (process.env.DEBUG) console.log("           dbg", await js(() => [...document.querySelectorAll("iframe[data-compat-frame]")].map((f) => f.getAttribute("data-compat-frame")).join(",")), await (await front())?.evaluate(() => location.href + " | " + document.title + " | " + (document.body?.textContent || "").slice(0, 80)).catch((e) => String(e)), await js(() => window.probePushes))
          }],
          ["the size switched to a phone and back", async () => { await device("mobile"); await device("desktop") }],
          ["full screen and back", async () => { await js(() => document.querySelector("[data-wb-full-toggle]")?.click()); await sleep(1200); await js(() => document.querySelector("[data-wb-full-toggle]")?.click()); await sleep(1200) }],
          ["the page drawn again behind and brought forward, a wheel at once", async () => { await (await front()).evaluate(() => parent.postMessage({ storelib: 1, type: "reload" }, "*")); await sleep(1400) }],
          ["double click in the canvas", async () => pressIn(".rt h2", { double: true })],
          ["live edit typed in a section", async () => { await pressIn(".rt h2"); await typeInSidebar(" ciao") }],
          ["window blur and focus", async () => { await js(() => { window.dispatchEvent(new Event("blur")); document.dispatchEvent(new Event("visibilitychange")); window.dispatchEvent(new Event("focus")) }); await sleep(300) }],
          ["deselect with Escape", async () => escape()],
        ]
      : [
          ["load", async () => {}],
          ["select a section in the canvas", async () => pressIn("[data-section-type='text_rich']")],
          ["select a block in the canvas", async () => pressIn("[data-section-type='faq_accordion'] [data-block-id]")],
          ["select from the sidebar", async () => sidebarSelect(/FAQ/)],
          ["open the site menu (inspector off) and close it", async () => { await device("mobile"); await inspector(false); if (process.env.DEBUG) console.log("           dbg", await js(() => [document.querySelector("[data-wb-device-switch]")?.getAttribute("data-wb-device"), [...document.querySelectorAll("#wb-preview-root button")].filter((b) => /menu/i.test(b.getAttribute("aria-label") || "")).map((b) => (b.getAttribute("aria-label") || b.textContent).slice(0, 30) + ":" + b.getClientRects().length).join("|")])); await pressIn("button[aria-label='Open menu']", { reveal: false }); await peek("opened"); await escape(); await inspector(true); await device("desktop") }],
          ["site menu open, then another page", async () => {
            await device("mobile")
            await inspector(false)
            await pressIn("button[aria-label='Open menu']", { reveal: false })
            await peek("opened")
            await pageSwitch("about")
            await inspector(true)
            await pageSwitch("home")
            await device("desktop")
          }],
          ["site menu open, header edited", async () => {
            await device("mobile")
            await inspector(false)
            await pressIn("button[aria-label='Open menu']", { reveal: false })
            await sidebarSelect(/^Header/)
            await peek("opened")
            await typeInSidebar("x")
            await inspector(true)
            await device("desktop")
          }],
          ["the size switched to a phone and back", async () => { await device("mobile"); await device("desktop") }],
          ["full screen and back", async () => { await js(() => document.querySelector("[data-wb-full-toggle]")?.click()); await sleep(1200); await js(() => document.querySelector("[data-wb-full-toggle]")?.click()); await sleep(1200) }],
          ["double click in the canvas", async () => pressIn("[data-section-type='text_rich']", { double: true })],
          ["live edit typed in a section", async () => { await pressIn("[data-section-type='text_rich']"); await typeInSidebar(" hello") }],
          ["another page and back", async () => { await pageSwitch("about"); await pageSwitch("home") }],
          ["window blur and focus", async () => { await js(() => { window.dispatchEvent(new Event("blur")); document.dispatchEvent(new Event("visibilitychange")); window.dispatchEvent(new Event("focus")) }); await sleep(300) }],
          ["deselect with Escape", async () => escape()],
        ]
    for (const [name, act] of sequences) {
      if (ONLY && !ONLY.test(name) && name !== "load") continue
      try { await act() } catch (e) { console.log(`    (${name}: ${String(e).slice(0, 160)})`) }
      await sleep(400)
      await measure(name)
      /* Whatever the step left open is closed by the theme's own buttons, so the next starts from a page at rest. */
      if (kind === "imported") await (await front())?.evaluate(() => { document.querySelectorAll("[data-md].is-open [data-md-close], [data-np].is-open [data-np-close]").forEach((b) => b.click()) }).catch(() => {})
      else await escape()
    }
  } finally {
    await close()
  }
  return { frozen, errors }
}

async function main() {
  const { bundle, css } = await import("./editor-probe-harness.mjs")
  const kinds = process.env.THEME ? [process.env.THEME] : ["imported", "storelib"]
  const compat = kinds.includes("imported") ? await importedTheme() : null
  const all = {}
  for (const kind of kinds) all[kind] = await run({ kind, bundle, css, compat })
  console.log("\nBUDGETS")
  for (const [kind, r] of Object.entries(all)) {
    expect(r.frozen.length === 0, `${kind}: the canvas scrolls after every step`, r.frozen.map((f) => f.step))
    if (r.errors.length) console.log(`  note  ${kind}: page errors ${JSON.stringify(r.errors.slice(0, 3))}`)
  }
  console.log(`\n${broken ? `${broken} over budget` : "all within budget"}`)
  process.exit(broken ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(1) })
