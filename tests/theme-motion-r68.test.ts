/**
 * ===========================================================================
 *  ROUND 68: POPUPS WITH NO FLASH, REVEALS ON A FINE LINE, A FOOTER THAT IS THERE
 * ===========================================================================
 *   npx tsx tests/theme-motion-r68.test.ts
 *
 * The owner, again after round 67: "when I open or close a modal, it shows a
 * black flash glitch. I don't want it in any place" (the theme preview, the
 * live website, the editor, the builder); product cards scroll in "too
 * exaggerated, keep it smooth and clean but not that exaggerated, a fine
 * line"; in Octavo "the footer comes animated and leaves white background,
 * empty space in the background as the animation arrives".
 *
 * Found (scripts/check-overlay-flash-r68.ts, every compositor frame and every
 * animation frame, 1440 and 390, CPU x1 and x4):
 *   BUILDER   picking another popup in the overlay group cut the shown one
 *             away (its shade gone in one frame) and faded the next one's
 *             shade in from nothing: dark, light, dark (10 of 28 steps on
 *             Octavo). Now the shade is taken over at the darkness the screen
 *             had, in one frame, in stacking order (the later popup on the
 *             page lies above: its shade waits until the earlier card has
 *             gone, or the earlier shade gives way at once), and the cards
 *             cross. A close that interrupts an opening fades from where it
 *             got to; a popup reopened while closing starts from what it kept.
 *             A closing shade fades on the page, not the compositor, so an
 *             opening that runs meanwhile cannot show a few light frames.
 *   PREVIEW   the marketplace previews (public/theme-previews) were drawn
 *             before round 67: their popups still faded the shade to black
 *             and jumped back (100% then 45%). They are drawn again.
 *   CODE      Promotion popup (Code), a native modal <dialog>: its ::backdrop
 *             was drawn at full in the frame showModal() ran and gone in the
 *             frame close() ran. Both now fade (transition-behavior
 *             allow-discrete, @starting-style).
 *   PHONE     a card in its shade's box faded twice (the box and itself),
 *             darker than the shade under it on the way out.
 * Reveals (scripts/check-reveal-r68.ts, every template's home page and
 * catalogue): cards up to 56px from the side, scale, blur and clip, up to
 * 1.7s, 450ms late; sections and the footer moved as one block. Now a card
 * rises 10px in 300 to 450ms, 40ms at most after the one before (four steps
 * at most); a section's box never moves (its parts rise 12 to 14px, a
 * picture that fills it is its background, not a part); the footer is not
 * revealed. Installed themes get the same through the head (theme-motion-fix.ts).
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { THEME_MOTION_FIX_HEAD } from "@/lib/storelib-theme/compat/theme-motion-fix"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 600)}`}`) }
}
const code = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const M = "theme-packages/materia/base/"
const popups = code(M + "assets/materia-popups.js")
const css = code(M + "assets/animation.css")
const js = code(M + "assets/animation.js")
const base = code(M + "assets/base.css")
const footer = code(M + "sections/footer.liquid")
const pp = code(M + "assets/section-promotion-popup.css")
const global = code(M + "assets/global.js")
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

console.log("\nPopups hand the shade over (materia-popups.js)\n")
{
  check("version 2, so the head fix for older files stands aside", /version: 2,/.test(popups) && /MateriaPopups\.version[^;]*>=\s*2/.test(THEME_MOTION_FIX_HEAD))
  check("a forced open while one shows hands over instead of cutting it away", /hide\(current, \{ reason: 'replaced', handoff: !!from\.old \}\)/.test(popups) && /moveOut\(entry, shut, \{ keepShade: !!opts\.handoff \}\)/.test(popups))
  check("a popup closing when the next opens gives its shade over too", /from\.old = leaving;/.test(popups))
  check("the builder steps away with a fade, never a cut", /hide\(current, \{ reason: 'deselect' \}\);/.test(popups) && !/hide\(current, \{ reason: 'deselect', instant: true \}\)/.test(popups))
  check("the shades change places in stacking order", /compareDocumentPosition\(entry\.root\) & 4/.test(popups) && /om\.after\.push\(/.test(popups))
  check("darkness is opacity times the colour's alpha, ::before and ::after included", /function alphaOf\(el\)/.test(popups) && /\['::before', '::after'\]/.test(popups))
  check("a closing shade fades on the page (a custom property keeps it off the compositor)", /\{ opacity: shadeFrom, '--mp-fade': '0' \}, \{ opacity: 0, '--mp-fade': '1' \}/.test(popups))
  check("a close mid-opening fades from what was reached", /var mid = !!entry\.motion;/.test(popups) && /Math\.min\(restOpacity\(p\.card\), nowCard\)/.test(popups))
  check("a card in its shade's box fades once", /var boxed = !!\(p\.shade && p\.shade\.contains\(p\.card\)\)/.test(popups))
  check("drawn open at once (a redraw in the builder) holds its own transitions for that style pass", /setAttribute\('data-mp-motion', 'still'\)/.test(popups))
  check("Promotion popup (Code): the backdrop fades in and out, the card has no keyframe holding it", /@starting-style \{\s*:is\(\.s-promotion-popup,#_\) \.pp__dialog\[open\]::backdrop \{ opacity: 0; \}/.test(pp) && /overlay \.25s allow-discrete/.test(pp) && !/\.pp__dialog\[open\] \{ animation: pc-pp-in/.test(pp))
}

console.log("\nReveals on a fine line (animation.css, animation.js)\n")
{
  const card = /@keyframes revealCard \{\s*from \{ opacity: var\(--reveal-from-opacity, 0\.2\); transform: translate3d\(0, (\d+)px, 0\); \}/.exec(css)
  check("a card rises 10px and fades from partly visible, nothing else", !!card && Number(card[1]) <= 12 && Number(card[1]) >= 8, card?.[0])
  check("every card takes it, whatever the type", /\.scroll-trigger:not\(\.shopify-section\) \{ --reveal-name: revealCard;/.test(css))
  check("300 to 450ms, 40ms at most after the one before, four steps at most", /animation-duration: clamp\(300ms, calc\(var\(--animation-duration, 700ms\) \* 0\.6\), 450ms\);/.test(css) && /min\(var\(--reveal-order, 0\), 4\) \* min\(var\(--reveal-stagger, 75ms\), 40ms\)/.test(css) && /const REVEAL_MAX_STAGGER = 4;/.test(js))
  check("a section's box never moves; the footer is not revealed", /\.shopify-section\.scroll-trigger:not\(\.reveal-parts\),\s*\[id\*="footer"\]\.scroll-trigger,/.test(css) && /if \(el\.matches\(FOOTER\) \|\| !markParts\(el, typeOf\(el\)\)\) return false;/.test(js))
  check("the footer no longer adds a reveal to itself (Changed on purpose, r68)", !/el\.classList\.add\('scroll-trigger'/.test(footer))
  check("a picture that fills its section is its background, not a part", /function backdropOf\(section, el, box\)/.test(js) && /if \(backdropOf\(section, el, box\)\) continue;/.test(js))
  check("a card's pictures never zoom", /img\.closest\(SCROLL_ANIMATION_TRIGGER_CLASSNAME\) !== section/.test(js) && !/\n    markZoom\(el\);\n/.test(js))
  const shifts = [...css.matchAll(/@keyframes (reveal\w+) \{[^}]*?translate3d\(([^)]+)\)/g)].map((m) => [m[1], m[2]])
  const far = shifts.filter(([, t]) => /\d+px/.test(t) && t.split(",").some((v) => Math.abs(parseFloat(v)) > 14))
  check("no reveal keyframe travels more than 14px", far.length === 0, far)
  check("the part steps: 12 to 14px, at most 600ms, the seventh with the sixth", /min\(var\(--part, 0\), 6\) \* min\(var\(--reveal-stagger, 75ms\), 60ms\)/.test(css) && /clamp\(350ms, calc\(var\(--animation-duration, 700ms\) \* 0\.7\), 600ms\)/.test(css))
  check("new files mark themselves so the head fix stands aside", /document\.documentElement\.setAttribute\('data-mt-reveal', '2'\);/.test(js))
  check("motion elements: 300 to 500ms, 10px", /Math\.min\(500, Math\.max\(300,/.test(global) && /'translateY\(10px\)'/.test(global))
  check("reduced motion still shows everything at once", /@media \(prefers-reduced-motion: reduce\) \{\s*\.scroll-trigger, \.scroll-trigger\.scroll-trigger--offscreen,/.test(css))
  check("base.css carries the same (rebuilt from the sources)", base.includes("revealCard") && base.includes("--reveal-shift: 12px") && !base.includes("--reveal-shift: 56px"))
}

console.log("\nFor the theme files stores already have (theme-motion-fix.ts)\n")
{
  check("old popups: picking another one closes the shown one with its own motion first", /<script data-sl-popup-handoff>/.test(THEME_MOTION_FIX_HEAD) && /P\.close\(cur\)/.test(THEME_MOTION_FIX_HEAD))
  check("old popups: a shade fading in while another closes starts as dark as that one", /data-sl-noshade/.test(THEME_MOTION_FIX_HEAD) && /carry\s*\/\s*mine/.test(THEME_MOTION_FIX_HEAD))
  check("old reveals: cards, parts, words and settles on the round 68 line, sections and footer still", /html:not\(\[data-mt-reveal="2"\]\) \.scroll-trigger\.scroll-trigger--armed:not\(\.shopify-section\):not\(\.reveal-parts\)\{animation-name:revealCardR68!important\}/.test(THEME_MOTION_FIX_HEAD) && /revealPartR68/.test(THEME_MOTION_FIX_HEAD) && /revealWordR68/.test(THEME_MOTION_FIX_HEAD) && /html:not\(\[data-mt-reveal="2"\]\) \.shopify-section\.scroll-trigger:not\(\.reveal-parts\)/.test(THEME_MOTION_FIX_HEAD))
  check("old Promotion popup (Code): the backdrop fades, the card's keyframe is overruled", /\.pp__dialog\[open\]\[open\]\{animation:none\}/.test(THEME_MOTION_FIX_HEAD))
  check("round 67's parts are kept", THEME_MOTION_FIX_HEAD.includes("<script data-sl-popup-rest>") && THEME_MOTION_FIX_HEAD.includes(".header__menu .horizontal-list[data-hs-wait]"))
}

/* ------------------------------------------------------------------------ */
/* In Chromium: Octavo (newleaf), the live website and the builder's canvas. */
/* ------------------------------------------------------------------------ */

type Rows = { shade: number }[]
/* The darkness drawn over the whole screen on each animation frame: every fixed element and dialog listed once, read each frame. */
const RECORD = () => {
  const w = window as unknown as { __r: { on: boolean; rows: { shade: number }[] } }
  w.__r = { on: true, rows: [] }
  const list = [...document.querySelectorAll<HTMLElement>("body *")].filter((el) => el instanceof HTMLDialogElement || getComputedStyle(el).position === "fixed")
  const a = (c: string) => { const m = c.match(/rgba?\(([^)]+)\)/); const p = m ? m[1].split(/[\s,/]+/).filter(Boolean).map(Number) : [0, 0, 0, 0]; return p.length > 3 ? p[3] : 1 }
  const tick = () => {
    if (!w.__r.on) return
    let clear = 1
    for (const el of list) {
      const cs = getComputedStyle(el)
      if (cs.display === "none") continue
      /* A modal dialog's ::backdrop, and a closed one's while it is still fading out in the top layer. */
      if (el instanceof HTMLDialogElement && (el.matches(":modal") || (!el.open && cs.display !== "none" && el.hasAttribute("data-pp-dialog")))) { const b = getComputedStyle(el, "::backdrop"); clear *= 1 - Math.min(1, a(b.backgroundColor) * parseFloat(b.opacity)) }
      const r = el.getBoundingClientRect()
      if (r.width < innerWidth * 0.9 || r.height < innerHeight * 0.85 || r.left > 8 || r.top > innerHeight * 0.2) continue
      let o = 1
      for (let e: Element | null = el; e; e = e.parentElement) { const s = getComputedStyle(e); o *= parseFloat(s.opacity); if (s.visibility === "hidden") o = 0 }
      for (const pe of ["::before", "::after"]) { const p = getComputedStyle(el, pe); if (p.content !== "none" && p.content !== "normal" && p.visibility !== "hidden" && p.display !== "none" && parseFloat(p.width) >= innerWidth * 0.9) clear *= 1 - Math.min(1, a(p.backgroundColor) * parseFloat(p.opacity) * o) }
      clear *= 1 - Math.min(1, a(cs.backgroundColor) * o)
    }
    w.__r.rows.push({ shade: Math.round((1 - clear) * 1000) / 10 })
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}
/** A flash: a frame outside the range of the two ends, or a turn back of more than tol. */
function flashIn(s: number[], tol: number): string | null {
  if (s.length < 2) return null
  const a = s[0], b = s[s.length - 1], lo = Math.min(a, b) - tol, hi = Math.max(a, b) + tol, dir = Math.abs(b - a) <= tol ? 0 : Math.sign(b - a)
  let peak = a
  for (let i = 1; i < s.length; i++) {
    if (s[i] < lo || s[i] > hi) return `frame ${i}: ${s[i]} outside ${a}..${b}`
    if (dir > 0) { if (s[i] < peak - tol) return `frame ${i}: back from ${peak} to ${s[i]}`; peak = Math.max(peak, s[i]) }
    if (dir < 0) { if (s[i] > peak + tol) return `frame ${i}: back from ${peak} to ${s[i]}`; peak = Math.min(peak, s[i]) }
  }
  return null
}

async function inChromium() {
  const chrome = process.env.CHROME ?? "/opt/pw-browsers/chromium"
  if (!existsSync(chrome)) { console.log("  --    no Chromium here: held to its source only"); return }
  const puppeteer = (await import("puppeteer-core")).default
  const { importTemplate, serve } = await import("../scripts/theme-templates/site")
  const { auditSite } = await import("../scripts/theme-templates/fixtures")
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--no-sandbox"] })
  try {
    for (const design of [false, true]) {
      console.log(`\nOctavo's overlay group, ${design ? "the builder's canvas" : "the live website"}, every animation frame\n`)
      const imported = await importTemplate("materia/newleaf")
      for (const pg of imported.theme.pages) for (const sec of pg.sections as unknown as { type: string; group?: string; hidden?: boolean }[]) {
        if (sec.group === "overlay" && /popup|promobanner/i.test(sec.type) && !/size-chart|login|quickview/i.test(sec.type)) sec.hidden = false
      }
      const home = imported.theme.pages.find((p) => (p as { page_key?: string }).page_key === "home")!
      const like = (home.sections as unknown as Record<string, unknown>[]).find((x) => x.group === "overlay")!
      if (!design) (home.sections as unknown as Record<string, unknown>[]).push({ ...like, id: "promotion_popup_code", type: "promotion-popup", name: "Promotion popup", hidden: false, settings: { show_promotion_select: "show_promotion_homepage", promotion_code: "SAVE10", editor_preview: false }, blocks: [] })
      const built = auditSite(imported, "newleaf", false, { own: true })
      if (design) (built.site as { designMode?: boolean }).designMode = true
      const { base: url, server } = await serve(built, join("scripts", "theme-templates", "products", "newleaf"))
      const page = await browser.newPage()
      await page.setViewport({ width: 1440, height: 900 })
      await page.evaluateOnNewDocument("window.__name = (f) => f")
      await page.evaluateOnNewDocument(() => {
        let real: { register: (c: { trigger?: unknown }) => unknown } | undefined
        Object.defineProperty(window, "MateriaPopups", { configurable: true, get: () => real, set: (v) => { if (v && v.register) { const r = v.register; v.register = (c: { trigger?: unknown }) => r({ ...c, trigger: { mode: "manual" } }) } real = v } })
      })
      await page.goto(url + "/", { waitUntil: "networkidle0", timeout: 90000 }).catch(() => {})
      await sleep(1200)
      const ids: string[] = await page.evaluate(() => [...document.querySelectorAll("[data-popup-id]")].map((e) => e.getAttribute("data-popup-id")!))
      check(`${design ? "canvas" : "live"}: the overlay group's popups are drawn`, ids.length >= 6, ids)
      const film = async (act: () => Promise<unknown>, ms = 900): Promise<number[]> => {
        await page.evaluate(RECORD)
        await sleep(60)
        await act()
        await sleep(ms)
        return ((await page.evaluate(() => { const w = window as unknown as { __r: { on: boolean; rows: Rows } }; w.__r.on = false; return w.__r.rows })) as Rows).map((r) => r.shade)
      }
      const bad: string[] = []
      if (!design) {
        for (const id of ids) {
          for (const [what, act] of [["opens", () => page.evaluate((x) => (window as unknown as { MateriaPopups: { open(i: string): void } }).MateriaPopups.open(x), id)], ["closes", () => page.evaluate(() => (window as unknown as { MateriaPopups: { close(): void } }).MateriaPopups.close())]] as const) {
            const s = await film(act, what === "closes" ? 650 : 900)
            const f = flashIn(s, 3)
            if (f) bad.push(`${id} ${what}: ${f}`)
          }
          await sleep(300)
        }
        check("every popup opens and closes with its shade moving one way only", bad.length === 0, bad)
        const code = [await film(() => page.evaluate(() => { const d = document.querySelector<HTMLDialogElement>("[data-pp-dialog]")!; d.showModal() })), await film(() => page.evaluate(() => document.querySelector<HTMLDialogElement>("[data-pp-dialog]")!.close()), 650)]
        check("Promotion popup (Code): its backdrop fades in over frames and out over frames", code.every((s) => !flashIn(s, 3) && s.filter((v) => v > 2 && v < 48).length >= 3), code.map((s) => s.join(" ")))
      } else {
        const fire = (list: [string, string][]) => page.evaluate((l) => { for (const [n, x] of l) document.getElementById("shopify-section-" + x)!.dispatchEvent(new CustomEvent(n, { bubbles: true, detail: { sectionId: x, load: false } })) }, list)
        await fire([["shopify:section:select", ids[0]]])
        await sleep(900)
        for (let i = 0; i < ids.length; i++) {
          const a = ids[i], b = ids[(i + 1) % ids.length]
          const s = await film(() => fire([["shopify:section:deselect", a], ["shopify:section:select", b]]), 1000)
          const f = flashIn(s, 3)
          if (f) bad.push(`${a} -> ${b}: ${f}  [${s.join(" ")}]`)
          await sleep(200)
        }
        check("picking one popup after another in the overlay group: the shade never goes light and dark again", bad.length === 0, bad)
      }
      await page.close()
      server.close()
    }

    console.log("\nA card's reveal, measured as it starts (Kurb Club Redline, Outward)\n")
    for (const template of ["rail", "outerwear"]) {
      const imported = await importTemplate(`materia/${template}`)
      const built = auditSite(imported, template, false, { own: true })
      const { base: url, server } = await serve(built, join("scripts", "theme-templates", "products", template))
      const page = await browser.newPage()
      await page.setViewport({ width: 1440, height: 900 })
      await page.evaluateOnNewDocument("window.__name = (f) => f")
      await page.evaluateOnNewDocument(() => {
        const w = window as unknown as { __rv: { card: boolean; shift: number; scale: number; ms: number; delay: number; section: boolean }[] }
        w.__rv = []
        document.addEventListener("animationstart", (e) => {
          const t = e.target as HTMLElement
          const cs = getComputedStyle(t)
          if (!/^reveal/i.test(e.animationName) || !/running/.test(cs.animationPlayState)) return
          const v = cs.transform === "none" ? [1, 0, 0, 1, 0, 0] : cs.transform.match(/-?[\d.e]+/g)!.map(Number)
          const a = t.getAnimations().find((x) => (x as CSSAnimation).animationName === e.animationName)
          const tm = a?.effect?.getComputedTiming()
          const card = !t.matches(".shopify-section") && !t.closest("[data-reveal-part]") && !!t.closest(".scroll-trigger:not(.shopify-section)")
          w.__rv.push({ card, section: t.matches(".shopify-section"), shift: Math.hypot(v[4] ?? 0, v[5] ?? 0), scale: Math.hypot(v[0], v[1]), ms: Number(tm?.duration) || 0, delay: Number(tm?.delay) || 0 })
        }, true)
      })
      await page.goto(url + "/", { waitUntil: "networkidle0", timeout: 90000 }).catch(() => {})
      await sleep(600)
      await page.mouse.move(700, 450)
      const h: number = await page.evaluate(() => document.documentElement.scrollHeight)
      for (let y = 0; y < h; y += 540) { await page.mouse.wheel({ deltaY: 540 }); await sleep(320) }
      await sleep(1200)
      const rv = (await page.evaluate(() => (window as unknown as { __rv: { card: boolean; shift: number; scale: number; ms: number; delay: number; section: boolean }[] }).__rv)) as { card: boolean; shift: number; scale: number; ms: number; delay: number; section: boolean }[]
      const cards = rv.filter((r) => r.card)
      const worst = { cards: cards.length, shift: Math.max(0, ...cards.map((c) => c.shift)), scale: cards.some((c) => Math.abs(c.scale - 1) > 0.001), ms: [Math.min(...cards.map((c) => c.ms)), Math.max(...cards.map((c) => c.ms))], delay: Math.max(0, ...cards.map((c) => c.delay)), sections: rv.filter((r) => r.section).length }
      check(`${template}: cards rise at most 12px, no scale, 300 to 450ms, at most 160ms late; no section moves as one`, cards.length > 0 && worst.shift <= 12 && !worst.scale && worst.ms[0] >= 299 && worst.ms[1] <= 451 && worst.delay <= 160 && worst.sections === 0, worst)
      /* A jump to the bottom: nothing that can be seen is left waiting. */
      await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight))
      await sleep(1200)
      const left: string[] = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".scroll-trigger, [data-reveal-part]")].filter((el) => {
        const r = el.getBoundingClientRect()
        if (r.width < 2 || r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) return false
        const at = document.elementFromPoint(r.left + r.width / 2, Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2)))
        return !!at && (el.contains(at) || at.contains(el)) && parseFloat(getComputedStyle(el).opacity) < 0.99
      }).map((el) => el.className.slice(0, 60)))
      check(`${template}: after a jump to the bottom nothing in view is left faint`, left.length === 0, left)
      await page.close()
      server.close()
    }
  } finally {
    await browser.close()
  }
}

void (async () => {
  await inChromium()
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
})()
