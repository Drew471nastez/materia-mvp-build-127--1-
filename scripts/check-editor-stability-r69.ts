/**
 * ===========================================================================
 *  NOTHING IN THE CANVAS OR ON THE WEBSITE IS EVER LEFT HIDDEN (round 69)
 * ===========================================================================
 *   npx tsx scripts/check-editor-stability-r69.ts
 *     TEMPLATES=rail,newleaf   which Materia templates (default: every one)
 *     PARTS=editor,live        which halves (default both)
 *     HEADER=all               every header control in turn, not only the sticky ones
 *     OUT=<dir>                screenshots of what was found, and results.json
 *
 * The owner: "when I switch between sticky on scroll up and always sticky ...
 * it's stuck on always sticky"; "when I switch between mobile view, desktop
 * view or larger screen ... it hides the header section or other things
 * really abruptly"; "some sections get completely hidden and glitched out in
 * white background, such as the FAQ 3 section".
 *
 * EDITOR. The real editor (editor-probe-harness, scripts/check-builder-nav19
 * editorFor) on each template's home page:
 *   sticky    Sticky header through none, always, on-scroll-up and back, each
 *             followed by a scroll down and a little up: the header must do
 *             what the mode says (gone, pinned, hidden then shown).
 *   header    every select, segment and switch of the header (HEADER=all) or
 *             the ones about stickiness, transparency and the menu: after each
 *             the header is drawn, at the top, at full opacity.
 *   sizes     the device switch and full screen, back and forth, the window at
 *             1280, 1440 and 1920: a frame every 40ms during each switch, the
 *             header and every section on screen must be drawn in every one.
 *   sections  a section hidden and shown, duplicated, moved down and up,
 *             the copy deleted, sections selected in the canvas and let go,
 *             a heading's text changed.
 *   scroll    a wheel down the page a screen at a time and a fast scroll to
 *             the bottom and back.
 * LIVE. The template as a website serves it (scripts/theme-templates/site),
 * at 390, 768, 1280 and 1440 and resized between them, scrolled the same way,
 * and its header scrolled under each sticky mode.
 *
 * After every step, once the page has settled (1.2s), every section on
 * screen is read: none may be zero tall, below full opacity, hidden, moved
 * off its place, or blank (nothing in it that can be seen while it has
 * headings, text or pictures). The header at the top of the page must be
 * drawn. <html> must not keep a scroll lock. Errors in the console count.
 */
import { join } from "node:path"
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs"
import puppeteer, { type Browser, type Frame, type Page } from "puppeteer-core"
import JSZip from "jszip"
import { composeTemplateZip } from "../lib/themes/template-packages"
import { editorFor } from "./check-builder-nav19"
import { importTemplate, serve } from "./theme-templates/site"
import { auditSite } from "./theme-templates/fixtures"

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const ROOT = "theme-packages/materia/templates"
const ALL = readdirSync(ROOT).filter((d) => existsSync(join(ROOT, d, "config")))
const TEMPLATES = process.env.TEMPLATES ? process.env.TEMPLATES.split(",") : ALL
const PARTS = (process.env.PARTS ?? "editor,live").split(",")
const STEPS = (process.env.STEPS ?? "scroll,sticky,header,sizes,sections,controls").split(",")
const OUT = process.env.OUT ?? "/tmp/r69-stability"
mkdirSync(OUT, { recursive: true })

type Finding = { template: string; part: string; step: string; what: string }
const findings: Finding[] = []
const shots = new Map<string, number>()
let current = { template: "", part: "" }
const found = async (step: string, what: string[], shoot?: Page) => {
  for (const w of what) findings.push({ ...current, step, what: w })
  if (what.length) {
    console.log(`  FAIL  ${current.template} ${current.part} ${step}: ${what.slice(0, 3).join(" ; ")}${what.length > 3 ? ` (+${what.length - 3})` : ""}`)
    const k = `${current.template}-${current.part}`
    const n = shots.get(k) ?? 0
    if (shoot && n < 3) { shots.set(k, n + 1); await shoot.screenshot({ path: join(OUT, `${k}-${n}.png`) }).catch(() => {}) }
  }
}

/** Every section on screen that cannot be seen, and the header at the top when it is not drawn. Runs in the page. */
const AUDIT = () => {
  const out: string[] = []
  const name = (s: Element) => s.id.replace(/^shopify-section-(template--\d+__|sections--\d+__)?/, "")
  const opacityOf = (el: Element | null) => { let o = 1; for (let e = el; e && e.nodeType === 1; e = e.parentElement) { o *= parseFloat(getComputedStyle(e).opacity) } return o }
  const hiddenBy = (el: Element) => getComputedStyle(el).visibility === "hidden"
  const SKIP = /popup|drawer|overlay|modal|cookie|before-you-leave|back-to-top|notification|sticky-add|mobile-nav|newsletter-popup|spin|age-verif|cart|search|quick-view|custom-colors|announcement/i
  for (const s of document.querySelectorAll<HTMLElement>(".shopify-section")) {
    const id = name(s)
    if (SKIP.test(s.id) || SKIP.test(s.className)) continue
    const cs = getComputedStyle(s)
    if (cs.display === "none" || s.hidden) continue
    /* A section that is shown on one size only (its own setting) is display: none inside, not a fault. */
    const content = [...s.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,h6,p,img,video,a,button,li,blockquote,summary")].filter((e) => {
      for (let x: HTMLElement | null = e; x && x !== s; x = x.parentElement) if (getComputedStyle(x).display === "none") return false
      return true
    })
    if (!content.length) continue
    const r = s.getBoundingClientRect()
    /* The canvas rests a section far off screen (canvas-bridge.ts, data-sl-far): zero tall there is by design; on screen it is not. */
    if (r.height < 2) { if (r.top > 40 && r.top < innerHeight - 40) out.push(`${id}: zero tall on screen${s.hasAttribute("data-sl-far") ? " (rested)" : ""}${s.hasAttribute("data-wb-held") ? " (held)" : ""}`); continue }
    if (r.bottom <= 40 || r.top >= innerHeight - 40) continue
    if (/header/.test(s.id) || s.querySelector("header.header")) continue
    const so = opacityOf(s)
    if (so < 0.98) { out.push(`${id}: the section at opacity ${so.toFixed(2)}`); continue }
    if (hiddenBy(s)) { out.push(`${id}: the section hidden`); continue }
    const m = cs.transform
    if (m && m !== "none") {
      const v = m.match(/-?[\d.e]+/g)!.map(Number)
      const dx = v.length === 6 ? v[4] : v[12], dy = v.length === 6 ? v[5] : v[13]
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) out.push(`${id}: the section moved ${Math.round(dx)},${Math.round(dy)}`)
    }
    /* Blank: on screen with content and nothing in it seen. */
    let seen = 0, onScreen = 0
    const faint: string[] = []
    for (const e of content.slice(0, 120)) {
      const b = e.getBoundingClientRect()
      /* The bottom tenth of the screen is where a reveal is still waiting to start (6 to 8% in): not counted. */
      if (b.width < 3 || b.height < 3 || b.bottom <= 0 || b.top >= innerHeight * 0.9 || b.right <= 0 || b.left >= innerWidth) continue
      if (b.bottom < r.top || b.top > r.bottom) continue
      onScreen++
      const o = opacityOf(e)
      /* What lies on top at its middle: a clip-path or a cover hides it as surely as opacity (a fixed bar over it does not count). */
      const cx = Math.min(innerWidth - 1, Math.max(0, b.left + b.width / 2)), cy = Math.min(innerHeight - 1, Math.max(0, b.top + b.height / 2))
      const hit = document.elementFromPoint(cx, cy)
      const onTop = !hit || s.contains(hit) || !!hit.closest("header, .shopify-section-group-header-group, [data-sl], [data-sl-ui]") || (() => { for (let x: Element | null = hit; x; x = x.parentElement) { const p = getComputedStyle(x).position; if (p === "fixed" || p === "sticky") return true } return false })()
      /* Faint on purpose (a picture at 20% behind the text, a caption at 85%): drawn faint with nothing waiting to bring it up. */
      const waiting = !!e.closest(".scroll-trigger--armed, .scroll-trigger--offscreen, [data-faq-armed], [data-xp-armed], [data-r98-armed], [data-vsl-armed], [data-faq7-armed]")
      if ((o > 0.5 || (o >= 0.1 && !waiting)) && !hiddenBy(e) && onTop) seen++
      else if (faint.length < 2) faint.push(`${e.tagName.toLowerCase()}.${String(e.className).split(" ")[0]} ${o.toFixed(2)}`)
    }
    const visibleArea = Math.min(r.bottom, innerHeight) - Math.max(r.top, 0)
    if (onScreen && !seen && visibleArea > 120) out.push(`${id}: blank (${onScreen} on screen, none seen: ${faint.join(", ")})`)
  }
  const h = document.querySelector<HTMLElement>("header.header")
  if (h && scrollY < 2) {
    const b = h.getBoundingClientRect(), sec = h.closest(".shopify-section") as HTMLElement | null
    if (sec && getComputedStyle(sec).display !== "none") {
      if (b.height < 20) out.push(`header: ${Math.round(b.height)}px tall at the top`)
      else if (b.bottom <= 0 || b.top > 260) out.push(`header: away at the top (${Math.round(b.top)})`)
      else if (opacityOf(h) < 0.95) out.push(`header: opacity ${opacityOf(h).toFixed(2)} at the top`)
      else if (hiddenBy(h)) out.push("header: hidden at the top")
      if (sec.classList.contains("shopify-section-header-hidden")) out.push("header: still marked hidden at the top")
    }
  }
  const locks = [...document.documentElement.classList].filter((c) => /^(open-drawer|open-minicart|open-search|nav-open|mt-lock|no-scroll|open-popup|overlay-closing)$/.test(c))
  if (locks.length && !document.querySelector(".popup-open, [open].popup, dialog[open]")) out.push(`html keeps ${locks.join(" ")}`)
  return out
}

/** The header's state, read in the page. */
const HEADER = () => {
  const h = document.querySelector<HTMLElement>("header.header")
  if (!h) return null
  const s = h.closest(".shopify-section") as HTMLElement
  const b = h.getBoundingClientRect()
  let o = 1
  for (let e: Element | null = h; e; e = e.parentElement) o *= parseFloat(getComputedStyle(e).opacity)
  return { mode: h.dataset.sticky ?? "", mobile: h.dataset.stickyMobile ?? "", wide: matchMedia("(min-width: 1025px)").matches, top: Math.round(b.top), bottom: Math.round(b.bottom), height: Math.round(b.height), o, hidden: s.classList.contains("shopify-section-header-hidden"), y: Math.round(scrollY), applied: s.dataset.storelibSticky ?? "" }
}
type HeaderState = NonNullable<ReturnType<typeof HEADER>>

/** What the sticky mode says the header does after a scroll down and a little up. */
function stickyFaults(down: HeaderState | null, up: HeaderState | null): string[] {
  if (!down || !up) return []
  /* The page did not move (a popup holding the scroll): nothing to read. */
  if (down.y < 300 || up.y > down.y - 50) return []
  const out: string[] = []
  let mode = down.mode
  if (!down.wide && down.mobile === "false") mode = "none"
  if (down.applied && down.applied !== mode) out.push(`asked ${mode}, the page runs ${down.applied}`)
  const shown = (s: HeaderState) => s.bottom > 10 && s.top < 260 && s.o > 0.9
  if (mode === "none") { if (down.bottom > 5) out.push(`none: still on screen scrolled down (${down.top}..${down.bottom})`) }
  else if (mode === "always") { if (!shown(down)) out.push(`always: not pinned scrolled down (${down.top}..${down.bottom} o=${down.o.toFixed(2)})`); if (!shown(up)) out.push("always: not pinned scrolled back up") }
  else if (mode === "on-scroll-up") {
    if (shown(down) && !down.hidden) out.push(`on-scroll-up: never hid on the way down (${down.top}..${down.bottom})`)
    if (!shown(up)) out.push(`on-scroll-up: not back on the way up (${up.top}..${up.bottom} hidden=${up.hidden})`)
  }
  return out
}

/* ------------------------------------------------------------------ editor */

async function editor(browser: Browser, template: string) {
  current = { template, part: "editor" }
  const zip = await JSZip.loadAsync(await composeTemplateZip(`materia/${template}`))
  if (process.env.ANIM) {
    const data = JSON.parse((await zip.file("config/settings_data.json")!.async("string")).replace(/\/\*[\s\S]*?\*\//g, "")) as { current: Record<string, unknown> }
    data.current.scroll_animation = process.env.ANIM
    zip.file("config/settings_data.json", JSON.stringify(data))
  }
  /* PAGE=page.faqs: that page's sections drawn as the home page (the editor opens on the home page). */
  const tweak = process.env.PAGE ? (c: { pages: Record<string, unknown[]> }) => { const key = Object.keys(c.pages).find((k) => k === process.env.PAGE || k.endsWith(String(process.env.PAGE))); const home = Object.keys(c.pages).find((k) => /^(index|home)$/.test(k)); if (process.env.DEBUG) console.log("    pages:", Object.keys(c.pages).join(" ")); if (key && home) c.pages[home] = c.pages[key] } : undefined
  const ed = await editorFor(browser, 1440, 900, false, tweak, zip)
  const errors: string[] = []
  ed.page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|favicon|net::ERR|Blocked autofocusing/i.test(m.text())) errors.push(m.text().slice(0, 160)) })
  ed.page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)))
  const page = ed.page
  let f: Frame = await ed.frame()
  await sleep(3500)
  const box = async () => (await (await page.$("[data-compat-frame='front']"))!.boundingBox())!
  const fr = async () => (f = await ed.frame())
  const audit = async (step: string, settle = 1200) => { if (process.env.DEBUG) console.log("    " + step); await sleep(settle); await fr(); await found(step, await f.evaluate(AUDIT).catch((e) => [`the page could not be read: ${String(e).slice(0, 80)}`]), page) }
  const wheel = async (dy: number, steps = 8) => { const b = await box(); await page.mouse.move(b.x + b.width / 2, b.y + Math.min(400, b.height / 2)); for (let i = 0; i < steps; i++) { await page.mouse.wheel({ deltaY: dy / steps }); await sleep(35) } }
  const toTop = async () => { await fr(); await f.evaluate(() => scrollTo({ top: 0, behavior: "instant" as ScrollBehavior })); await sleep(500) }

  await audit("opened")

  /* scroll: a screen at a time, then fast to the bottom and back. */
  const scroll = async (label: string) => {
    await toTop()
    const h = await f.evaluate(() => document.documentElement.scrollHeight)
    const vh = await f.evaluate(() => innerHeight)
    for (let y = 0, i = 0; y < h && i < 30; y += vh * 0.8, i++) { await wheel(vh * 0.8); await audit(`${label}: wheel to ${Math.round(y + vh * 0.8)}`, 900) }
    await wheel(-h * 1.2, 6)
    await audit(`${label}: fast back to the top`)
    await wheel(h * 1.2, 6)
    await audit(`${label}: fast to the bottom`)
    await toTop()
  }
  if (STEPS.includes("scroll")) await scroll("scroll")

  /* sticky: the header's own select. */
  const clickHeader = async () => {
    await toTop()
    /* A popup the template opens on its own lies over the header. */
    await f.evaluate(() => { (window as unknown as { MateriaPopups?: { close(): void } }).MateriaPopups?.close() }).catch(() => {})
    await sleep(600)
    const b = await box()
    const y = await f.evaluate(() => { const h = document.querySelector("header.header"); if (!h) return null; const r = h.getBoundingClientRect(); return r.top + Math.min(r.height / 2, 30) })
    if (y === null) return false
    /* Not on a link: the header's middle at an empty x. */
    const x = await f.evaluate((yy) => { for (let x = innerWidth * 0.42; x < innerWidth * 0.9; x += 17) { const e = document.elementFromPoint(x, yy); if (e && !e.closest("a, button, input, summary, [role=button], details")) return x } return innerWidth / 2 }, y)
    await page.mouse.click(b.x + x, b.y + y)
    await sleep(1400)
    return page.evaluate(() => [...document.querySelectorAll("select")].some((s) => [...s.options].some((o) => o.value === "on-scroll-up")))
  }
  const setSelect = (pick: string, value: string) => page.evaluate((pick, value) => {
    const sel = [...document.querySelectorAll("select")].find((s) => pick === "sticky" ? [...s.options].some((o) => o.value === "on-scroll-up") : s.getAttribute("aria-label") === pick)
    if (!sel) return false
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(sel, value)
    sel.dispatchEvent(new Event("change", { bubbles: true }))
    return true
  }, pick, value)
  const stickyRound = async (label: string) => {
    await toTop()
    await f.evaluate(() => { (window as unknown as { MateriaPopups?: { close(): void } }).MateriaPopups?.close() }).catch(() => {})
    await wheel(1400); await sleep(900); await fr()
    const down = await f.evaluate(HEADER)
    await wheel(-260); await sleep(900); await fr()
    const up = await f.evaluate(HEADER)
    await found(`${label}: scrolled`, stickyFaults(down, up), page)
    await toTop()
    await audit(`${label}: back at the top`, 600)
  }
  /* Every select, segment and switch in the sidebar whose label matches: each value in turn, then the value it had. */
  type Control = { kind: string; label: string; values: string[]; at: number; last?: boolean }
  const controlSweep = async (prefix: string, re: RegExp, after: (step: string, c: Control) => Promise<void>) => {
    const controls: Control[] = await page.evaluate((src) => {
      const re = new RegExp(src, "i")
      const out: { kind: string; label: string; values: string[]; at: number }[] = []
      for (const c of document.querySelectorAll<HTMLElement>("select, [role=switch], [role=radiogroup]")) {
        if (c.getBoundingClientRect().left > 420 || c.getBoundingClientRect().width === 0) continue
        const label = c.getAttribute("aria-label") || (c.closest("label, div")?.querySelector("label") as HTMLElement | null)?.innerText.trim() || ""
        if (!label || !re.test(label) || /^Menu: choose|^Sticky header$|colou?r scheme|font/i.test(label)) continue
        if (c.tagName === "SELECT") { const sel = c as HTMLSelectElement; out.push({ kind: "select", label, values: [...sel.options].map((o) => o.value).slice(0, 4), at: sel.selectedIndex }) }
        else if (c.getAttribute("role") === "radiogroup") { const rs = [...c.querySelectorAll("[role=radio]")]; out.push({ kind: "radio", label, values: rs.map((r) => (r as HTMLElement).innerText.trim() || r.getAttribute("aria-label") || "").slice(0, 4), at: Math.max(0, rs.findIndex((r) => r.getAttribute("aria-checked") === "true")) }) }
        else out.push({ kind: "switch", label, values: ["flipped", "back"], at: -1 })
      }
      return out
    }, re.source)
    for (const c of controls.slice(0, Number(process.env.MAX_CONTROLS ?? 40))) {
      const order = c.kind === "switch" ? [0, 1] : [...c.values.keys()].filter((i) => i !== c.at).concat(c.at >= 0 ? [c.at] : [])
      for (const [n, i] of order.entries()) {
        const did = await page.evaluate((c, i) => {
          const els = [...document.querySelectorAll<HTMLElement>(c.kind === "select" ? "select" : c.kind === "radio" ? "[role=radiogroup]" : "[role=switch]")].filter((e) => e.getBoundingClientRect().left < 420)
          const el = els.find((e) => (e.getAttribute("aria-label") || (e.closest("label, div")?.querySelector("label") as HTMLElement | null)?.innerText.trim() || "") === c.label)
          if (!el) return null
          if (c.kind === "select") { const s = el as HTMLSelectElement; if (!c.values[i] && c.values[i] !== "") return null; Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(s, c.values[i]); s.dispatchEvent(new Event("change", { bubbles: true })); return true }
          if (c.kind === "radio") { const r = [...el.querySelectorAll<HTMLElement>("[role=radio]")][i]; r?.click(); return !!r }
          el.click(); return true
        }, c, i)
        if (did === null) break
        await sleep(1300)
        await after(`${prefix} ${c.label} = ${c.kind === "switch" ? c.values[i] : c.values[i]}`, { ...c, last: n === order.length - 1 })
      }
    }
  }
  if (!STEPS.includes("sticky")) { /* skipped */ } else if (await clickHeader()) {
    for (const v of ["on-scroll-up", "always", "on-scroll-up", "none", "always", "none", "on-scroll-up"]) {
      await setSelect("sticky", v)
      await sleep(1500)
      await stickyRound(`sticky ${v}`)
    }
    /* Every other header control: after each, the header is drawn. */
    if (STEPS.includes("header")) await controlSweep("header", process.env.HEADER === "all" ? /./ : /sticky|transparent|menu|logo position|layout|pill|glass|border|width|search|actions as text/i, async (step, c) => {
      await toTop()
      await audit(step, 300)
      if (/sticky|transparent/i.test(c.label) && c.last) await stickyRound(`after ${c.label}`)
    })
    await page.keyboard.press("Escape")
    await sleep(500)
  } else await found("sticky", ["the header's settings did not open"], page)

  /* sizes: the device switch and full screen, filmed. */
  const FILM = (ms: number) => new Promise<string[]>((done) => {
    const out: string[] = []
    const t0 = performance.now()
    let wasShown: boolean | null = null
    const tick = () => {
      const h = document.querySelector<HTMLElement>("header.header")
      /* Scrolled into the page with the bar showing: a switch never takes it away. */
      if (h && scrollY >= 2) {
        const b = h.getBoundingClientRect()
        const shown = b.bottom > 10 && b.top > -5 && b.top < 260
        if (wasShown === null) wasShown = shown
        else if (wasShown && !shown) out.push(`${Math.round(performance.now() - t0)}ms header went away mid page (${Math.round(b.top)}..${Math.round(b.bottom)}) w=${innerWidth}`)
      }
      if (h && scrollY < 2) {
        const sec = h.closest(".shopify-section") as HTMLElement
        const b = h.getBoundingClientRect()
        let o = 1
        for (let e: Element | null = h; e; e = e.parentElement) o *= parseFloat(getComputedStyle(e).opacity)
        if (getComputedStyle(sec).display !== "none" && innerWidth > 100 && (b.height < 20 || b.bottom <= 0 || o < 0.9 || getComputedStyle(h).visibility === "hidden")) out.push(`${Math.round(performance.now() - t0)}ms header ${Math.round(b.top)}..${Math.round(b.bottom)} o=${o.toFixed(2)} w=${innerWidth}`)
      }
      for (const s of document.querySelectorAll<HTMLElement>("main .shopify-section, .shopify-section")) {
        const r = s.getBoundingClientRect()
        if (r.height < 60 || r.bottom < 80 || r.top > innerHeight - 80 || /header|popup|drawer|announcement|overlay/i.test(s.id)) continue
        let o = 1
        for (let e: Element | null = s; e; e = e.parentElement) o *= parseFloat(getComputedStyle(e).opacity)
        if (o < 0.9) out.push(`${Math.round(performance.now() - t0)}ms ${s.id.slice(-28)} o=${o.toFixed(2)}`)
      }
      if (performance.now() - t0 < ms) requestAnimationFrame(tick); else done([...new Set(out)])
    }
    requestAnimationFrame(tick)
  })
  const press = async (sel: string) => {
    const at = await page.evaluate((sel) => { const e = document.querySelector<HTMLElement>(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } }, sel)
    if (!at) return false
    await page.mouse.click(at.x, at.y)
    return true
  }
  for (const [w, h] of STEPS.includes("sizes") ? ([[1440, 900], [1280, 800], [1920, 1080]] as const) : []) {
    await page.setViewport({ width: w, height: h })
    await sleep(1200)
    await audit(`window ${w}`)
    const moves = [["to phone", "[data-wb-device-switch]"], ["to desktop", "[data-wb-device-switch]"], ["full screen", "[data-wb-full-toggle]"], ["out of full screen", "[data-wb-full-toggle]"], ["to phone", "[data-wb-device-switch]"], ["full screen from phone", "[data-wb-full-toggle]"], ["back", "[data-wb-full-toggle]"]] as const
    for (const [label, sel] of w === 1440 ? moves : moves.slice(0, 4)) {
      for (const at of ["top", "middle"] as const) {
        await fr()
        await f.evaluate((at) => scrollTo({ top: at === "top" ? 0 : document.documentElement.scrollHeight * 0.4, behavior: "instant" as ScrollBehavior }), at)
        await sleep(400)
        if (at === "middle") { await wheel(-240); await sleep(700) }
        const film = f.evaluate(FILM, 1100).catch(() => ["the frame went away during the switch"])
        if (!(await press(sel))) { await found(`${w} ${label}`, [`no ${sel}`]); break }
        await found(`window ${w} ${label} (${at}), during`, await film, page)
        await audit(`window ${w} ${label} (${at}), after`)
      }
    }
    /* Back to desktop if the last switch left it on the phone. */
    if ((await page.evaluate(() => document.querySelector("[data-wb-device-switch]")?.getAttribute("data-wb-device"))) === "mobile") { await press("[data-wb-device-switch]"); await sleep(1200) }
  }
  await page.setViewport({ width: 1440, height: 900 })
  await sleep(1200)
  if ((await page.evaluate(() => document.querySelector("[data-wb-full-toggle]")?.getAttribute("aria-pressed"))) === "true") { await press("[data-wb-full-toggle]"); await sleep(1200) }

  /* sections: hide and show, duplicate, move, delete the copy, select and let go, a text changed. */
  const rows = !STEPS.includes("sections") ? [] : await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[data-section-row]")].map((r) => (r.innerText || "").trim().split("\n")[0]).filter((t) => t && !/header|footer|announcement|popup|drawer|back to top|notification|custom colors|cart/i.test(t)))
  const rowAction = async (name: string, aria: string) => page.evaluate((name, aria) => {
    const b = [...document.querySelectorAll<HTMLElement>("button")].find((x) => x.getAttribute("aria-label") === `${aria} ${name}`)
    if (!b) return false
    b.click(); return true
  }, name, aria)
  const menuAction = async (name: string, item: string) => {
    const opened = await page.evaluate((name) => { const b = [...document.querySelectorAll<HTMLElement>("[data-section-more]")].find((x) => x.getAttribute("aria-label") === `More for ${name}`); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } }, name)
    if (!opened) return false
    await page.mouse.click(opened.x, opened.y)
    await sleep(500)
    const at = await page.evaluate((item) => { const m = [...document.querySelectorAll<HTMLElement>("[role=menuitem]")].find((x) => x.innerText.trim() === item); if (!m) return null; const r = m.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } }, item)
    if (!at) { await page.keyboard.press("Escape"); return false }
    await page.mouse.click(at.x, at.y)
    return true
  }
  const scrollToSection = async (i: number) => { await fr(); await f.evaluate((i) => { const s = [...document.querySelectorAll<HTMLElement>("main .shopify-section, #MainContent .shopify-section")][i]; s?.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior }) }, i); await sleep(600) }
  for (const [n, name] of rows.slice(1, 4).entries()) {
    await scrollToSection(n + 1)
    if (await rowAction(name, "Hide")) { await audit(`hide ${name}`); if (await rowAction(name, "Show")) await audit(`show ${name}`) }
    if (n === 0 && await menuAction(name, "Duplicate")) {
      await audit(`duplicate ${name}`, 2200)
      if (await menuAction(name, "Move down")) await audit(`move ${name} down`, 1800)
      if (await menuAction(name, "Move up")) await audit(`move ${name} up`, 1800)
      if (await menuAction(name, "Delete")) {
        await sleep(400)
        /* A confirmation, when there is one. */
        await page.evaluate(() => { const b = [...document.querySelectorAll<HTMLElement>("[role=alertdialog] button, [role=dialog] button")].find((x) => /^delete/i.test(x.innerText.trim())); b?.click() })
        await audit(`delete a ${name}`, 1800)
      }
    }
  }
  /* Select and let go, and a heading's text. */
  await toTop()
  const ids = !STEPS.includes("sections") ? [] : await f.evaluate(() => [...document.querySelectorAll(".shopify-section")].filter((s) => !/header|footer|announcement|popup|drawer|overlay/i.test(s.id) && s.getBoundingClientRect().height > 60).map((s) => s.id).slice(0, 6))
  for (const id of ids) {
    await fr()
    await f.evaluate((sid) => document.getElementById(sid)?.scrollIntoView({ block: "start", behavior: "instant" as ScrollBehavior }), id)
    await sleep(900)
    const at = await f.evaluate((sid) => {
      const s = document.getElementById(sid); if (!s) return null
      const r = s.getBoundingClientRect()
      for (let y = Math.max(r.top + 12, 12); y < Math.min(r.bottom, innerHeight) - 4; y += 29) for (let x = r.left + 12; x < r.right - 4; x += 41) { const e = document.elementFromPoint(x, y); if (e && s.contains(e) && !e.closest("a, button, input, select, textarea, label, summary, [role='button'], [role='tab']")) return { x, y } }
      return null
    }, id)
    if (!at) continue
    const b = await box()
    await page.mouse.click(b.x + at.x, b.y + at.y)
    await audit(`select ${id.slice(-30)}`)
    const typed = await page.evaluate(() => {
      const fields = [...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input[type='text'], input:not([type]), textarea")].filter((i) => { const r = i.getBoundingClientRect(); return r.width > 60 && r.left < 420 && i.value.trim().length > 1 && !/^#|^https?:|^\/|^\d/.test(i.value.trim()) })
      const i = fields[0]; if (!i) return false
      const proto = i instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(i, i.value + " Now")
      i.dispatchEvent(new Event("input", { bubbles: true }))
      return true
    })
    if (typed) await audit(`edit ${id.slice(-30)}`, 2600)
    await page.keyboard.press("Escape")
    await audit(`let go of ${id.slice(-30)}`, 700)
  }
  /* visit: after each switch, every section scrolled to, by the wheel, and read. */
  if (STEPS.includes("visit")) {
    for (const [label, sel] of [["phone", "[data-wb-device-switch]"], ["desktop", "[data-wb-device-switch]"], ["full screen", "[data-wb-full-toggle]"], ["out of full screen", "[data-wb-full-toggle]"]] as const) {
      await toTop()
      if (!(await press(sel))) break
      await sleep(1500)
      await fr()
      const ids = await f.evaluate((want) => [...document.querySelectorAll(".shopify-section")].filter((s) => new RegExp(want).test(s.id) && !/header|announcement|popup|drawer|overlay|cart|notification|back-to-top|custom-colors/i.test(s.id)).map((s) => s.id), process.env.SECTIONS ?? ".")
      for (const id of ids) {
        const dy = await f.evaluate((sid) => { const el = document.getElementById(sid); return el ? el.getBoundingClientRect().top - 60 : 0 }, id)
        await wheel(dy, Math.max(4, Math.min(16, Math.round(Math.abs(dy) / 300))))
        await audit(`${label}: wheeled to ${id.replace(/^shopify-section-(template--\d+__|sections--\d+__)?/, "")}`, 1000)
      }
    }
  }
  /* add: sections put in from the library (Add section), each scrolled to and read. */
  if (STEPS.includes("add")) {
    for (const type of (process.env.ADD_TYPES ?? "faq,faq5,Faq1,faq-pro,faq-side-image,faq-floating,faq-tabs").split(",")) {
      const before = await (await fr()).evaluate(() => [...document.querySelectorAll(".shopify-section")].map((s) => s.id))
      if (process.env.DEBUG) console.log("    before:", await f.evaluate(() => [...document.querySelectorAll(".shopify-section")].map((x) => `${x.id.slice(-14)} in ${x.parentElement!.tagName}.${String(x.parentElement!.className).slice(0, 30)}#${x.parentElement!.id} h=${Math.round(x.getBoundingClientRect().height)}`).join(" | ")))
      for (let i = 0; i < 3 && !(await page.$("[data-add-section]")); i++) {
        /* The panel's own Back (under the Sections tab), not the editor's way out at the top. */
        await page.evaluate(() => { const b = [...document.querySelectorAll<HTMLElement>("button")].find((x) => x.getAttribute("aria-label") === "Back" && x.getBoundingClientRect().top > 90 && x.getBoundingClientRect().left < 300); b?.click() })
        await sleep(600)
      }
      const opened = await page.evaluate(() => { const b = document.querySelector<HTMLElement>("[data-add-section]"); b?.click(); return !!b })
      if (!opened) { await found(`add ${type}`, ["no Add section button"]); break }
      let card = false
      for (let i = 0; i < 40 && !card; i++) { await sleep(150); card = await page.evaluate((t) => { const c = document.querySelector<HTMLElement>(`[data-library-card="${t}"]`); if (!c) return false; c.scrollIntoView({ block: "center" }); c.click(); return true }, type) }
      if (!card) { await page.keyboard.press("Escape"); continue }
      await sleep(3200)
      await fr()
      const added = await f.evaluate((was) => [...document.querySelectorAll(".shopify-section")].map((s) => s.id).find((id) => !was.includes(id)) ?? null, before)
      if (!added) { await found(`add ${type}`, ["nothing was added to the canvas"], page); continue }
      if (process.env.DEBUG) console.log(await f.evaluate((sid) => { const el = document.getElementById(sid)!; const d = (x: Element) => { const c = getComputedStyle(x); const r = x.getBoundingClientRect(); return `${x.tagName}#${x.id.slice(-20)}.${String(x.className).slice(0, 50)} h=${Math.round(r.height)} top=${Math.round(r.top + scrollY)} pos=${c.position} disp=${c.display} cv=${c.contentVisibility} cis=${c.containIntrinsicSize} st=${(x as HTMLElement).style?.cssText?.slice(0, 80)}` }; return [el, el.previousElementSibling, el.nextElementSibling, el.parentElement, ...[...document.querySelectorAll(".shopify-section")]].filter(Boolean).map((x) => d(x!)).join("\n") }, added))
      for (const at of ["start", "center", "end"] as const) {
        await f.evaluate((sid, at) => document.getElementById(sid)?.scrollIntoView({ block: at, behavior: "instant" as ScrollBehavior }), added, at)
        await audit(`add ${type}, in view (${at})`, 1000)
      }
      await toTop()
      await wheel(await f.evaluate((sid) => (document.getElementById(sid)?.getBoundingClientRect().top ?? 0) - 100, added), 10)
      await audit(`add ${type}, wheeled to`, 1200)
    }
  }
  /* controls: each section's own selects, segments and switches, the section in view after each. */
  if (STEPS.includes("controls")) {
    const want = new RegExp(process.env.SECTIONS ?? ".")
    const all = await (await fr()).evaluate(() => [...document.querySelectorAll(".shopify-section")].filter((s) => !/header|footer|announcement|popup|drawer|overlay|cart|notification|back-to-top|custom-colors/i.test(s.id) && s.getBoundingClientRect().height > 60).map((s) => s.id))
    for (const id of all.filter((x) => want.test(x)).slice(0, Number(process.env.MAX_SECTIONS ?? 3))) {
      await fr()
      await f.evaluate((sid) => document.getElementById(sid)?.scrollIntoView({ block: "start", behavior: "instant" as ScrollBehavior }), id)
      await sleep(1000)
      const at = await f.evaluate((sid) => {
        const s = document.getElementById(sid); if (!s) return null
        const r = s.getBoundingClientRect()
        for (let y = Math.max(r.top + 12, 12); y < Math.min(r.bottom, innerHeight) - 4; y += 29) for (let x = r.left + 12; x < r.right - 4; x += 41) { const e = document.elementFromPoint(x, y); if (e && s.contains(e) && !e.closest("a, button, input, select, textarea, label, summary, [role='button'], [role='tab']")) return { x, y } }
        return null
      }, id)
      if (!at) continue
      const b = await box()
      await page.mouse.click(b.x + at.x, b.y + at.y)
      await sleep(1400)
      const short = id.replace(/^shopify-section-(template--\d+__)?/, "")
      await controlSweep(short, /./, async (step) => {
        await fr()
        await f.evaluate((sid) => { const el = document.getElementById(sid) ?? document.querySelector(`[id$="${sid.split("__").pop()}"]`); el?.scrollIntoView({ block: "start", behavior: "instant" as ScrollBehavior }) }, id)
        await audit(step, 900)
      })
      await page.keyboard.press("Escape")
      await sleep(600)
    }
  }
  /* The page once more, after all of it. */
  if (STEPS.includes("sections")) await scroll("scroll after the edits")
  await found("console", [...new Set(errors)].slice(0, 8))
  ed.close()
  await page.close()
}

/* -------------------------------------------------------------------- live */

async function live(browser: Browser, template: string) {
  current = { template, part: "live" }
  const imported = await importTemplate(`materia/${template}`)
  for (const mode of ["theme", "always", "on-scroll-up", "none"] as const) {
    const built = auditSite(imported, template, false, { own: true })
    if (mode !== "theme") {
      const pages = built.site.pages as unknown as Record<string, { type: string; settings?: Record<string, unknown> }[]>
      for (const p of Object.values(pages)) for (const s of p) if (/header/.test(s.type) && s.settings && "sticky_header_type" in s.settings) s.settings.sticky_header_type = mode
      const groups = (built.site as unknown as { groups?: Record<string, { sections?: Record<string, { type: string; settings?: Record<string, unknown> }> }> }).groups
      if (groups) for (const g of Object.values(groups)) for (const s of Object.values(g.sections ?? {})) if (/header/.test(s.type) && s.settings) s.settings.sticky_header_type = mode
    }
    const { base, server } = await serve(built, join("scripts", "theme-templates", "products", template))
    const page = await browser.newPage()
    const errors: string[] = []
    page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|favicon|net::ERR|Blocked autofocusing/i.test(m.text())) errors.push(m.text().slice(0, 160)) })
    page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)))
    await page.evaluateOnNewDocument("window.__name = (f) => f")
    const widths = mode === "theme" ? [390, 768, 1280, 1440] : [1440, 390]
    await page.setViewport({ width: widths[0], height: widths[0] < 700 ? 844 : 900, isMobile: widths[0] < 700, hasTouch: widths[0] < 700 })
    await page.goto(base + (process.env.PAGE ? `/pages/${process.env.PAGE}` : "/"), { waitUntil: "networkidle0", timeout: 90000 }).catch(() => {})
    await sleep(1200)
    const audit = async (step: string, settle = 1200) => { await sleep(settle); await found(step, await page.evaluate(AUDIT).catch((e) => [`unreadable ${String(e).slice(0, 60)}`]), page) }
    const wheel = async (dy: number, steps = 8) => { const v = page.viewport()!; await page.mouse.move(v.width / 2, v.height / 2); for (let i = 0; i < steps; i++) { await page.mouse.wheel({ deltaY: dy / steps }); await sleep(35) } }
    for (const w of widths) {
      const h = w < 700 ? 844 : 900
      await page.setViewport({ width: w, height: h, isMobile: w < 700, hasTouch: w < 700 })
      await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" as ScrollBehavior }))
      await audit(`${mode} ${w}: at the top`)
      if (mode === "theme" && (w === 390 || w === 1440 || process.env.FULL)) {
        const H = await page.evaluate(() => document.documentElement.scrollHeight)
        for (let y = 0, i = 0; y < H && i < 30; y += h * 0.8, i++) { await wheel(h * 0.8); await audit(`${w}: wheel to ${Math.round(y + h * 0.8)}`, 850) }
        await wheel(-H * 1.2, 6); await audit(`${w}: fast to the top`)
        await wheel(H * 0.5, 4); await audit(`${w}: fast half way`)
      }
      await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" as ScrollBehavior }))
      await sleep(500)
      await wheel(1400); await sleep(900)
      const down = await page.evaluate(HEADER)
      await wheel(-260); await sleep(900)
      const up = await page.evaluate(HEADER)
      await found(`${mode} ${w}: header scrolled`, stickyFaults(down, up), page)
    }
    if (mode === "theme") {
      /* Resized while scrolled half way, back and forth. */
      for (const w of [1440, 390, 1280, 768, 1440]) {
        await page.setViewport({ width: w, height: w < 700 ? 844 : 900, isMobile: w < 700, hasTouch: w < 700 })
        await audit(`resized to ${w}`)
        await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" as ScrollBehavior }))
        await audit(`resized to ${w}, at the top`, 700)
        await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight * 0.45, behavior: "instant" as ScrollBehavior }))
      }
    }
    await found(`${mode} console`, [...new Set(errors)].slice(0, 8))
    await page.close()
    server.close()
  }
}

void (async () => {
  const browser = await puppeteer.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] })
  for (const t of TEMPLATES) {
    console.log(`\n${t}`)
    const t0 = Date.now()
    for (const part of PARTS) {
      try { await (part === "editor" ? editor(browser, t) : live(browser, t)) } catch (e) { await found(`${part} ran`, [String(e).slice(0, 200)]) }
    }
    console.log(`  ${findings.filter((x) => x.template === t).length} found, ${Math.round((Date.now() - t0) / 1000)}s`)
  }
  await browser.close()
  writeFileSync(join(OUT, "results.json"), JSON.stringify(findings, null, 1))
  console.log(findings.length ? `\n${findings.length} found` : "\nnothing found")
  process.exit(findings.length ? 1 : 0)
})()
