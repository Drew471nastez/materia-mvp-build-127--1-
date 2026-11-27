/**
 * ===========================================================================
 *  AN EDIT IN THE CANVAS NEVER PLAYS AN ENTRANCE AGAIN (round 67)
 * ===========================================================================
 *   npx tsx scripts/check-canvas-edit-motion-r67.ts
 *     TEMPLATE=fitness   which Materia template's home page
 *     SECTION=hero       a substring of the section id to edit (first match)
 *
 * The real editor (editor-probe-harness) on a Materia template. In the
 * canvas frame every animation that starts inside the edited section is
 * recorded, and the lowest opacity of every element of it that was showing.
 * Then: the section is clicked (selected) and its heading's text is changed
 * in the sidebar. Neither may start an entrance (an animation that moves
 * opacity, transform, filter or clip-path and is not infinite), and nothing
 * that showed may dip below opacity 0.98.
 */
import puppeteer, { type Frame } from "puppeteer-core"
import JSZip from "jszip"
import { composeTemplateZip } from "../lib/themes/template-packages"
import { editorFor } from "./check-builder-nav19"

const TEMPLATE = process.env.TEMPLATE ?? "fitness"
const SECTION = process.env.SECTION ?? "hero"
const OUT = process.env.OUT ?? "/tmp"
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
let failed = 0
const check = (label: string, ok: boolean, detail: unknown = "") => {
  if (!ok) failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? `  (${typeof detail === "string" ? detail : JSON.stringify(detail)})` : ""}`)
}

const RECORD = (match: string) => {
  const w = window as unknown as { __em: { starts: string[]; dips: string[]; on: boolean } }
  const sec = () => [...document.querySelectorAll<HTMLElement>(".shopify-section")].find((s) => s.id.includes(match)) ?? null
  w.__em = { starts: [], dips: [], on: true }
  const anyW = window as unknown as { __emAnimate?: boolean }
  if (!anyW.__emAnimate) {
    anyW.__emAnimate = true
    const orig = Element.prototype.animate
    Element.prototype.animate = function (this: Element, ...args: Parameters<Element["animate"]>) {
      const a = orig.apply(this, args)
      try { (a as unknown as { __stack: string }).__stack = (new Error().stack ?? "").split("\n").slice(2, 4).map((l) => l.trim().slice(0, 90)).join(" < ") } catch {}
      return a
    }
  }
  const seen = new WeakSet<Animation>()
  const tick = () => {
    if (!w.__em.on) return
    const s = sec()
    if (s) {
      for (const a of document.getAnimations()) {
        if (seen.has(a)) continue
        seen.add(a)
        const eff = a.effect as KeyframeEffect | null
        const t = eff?.target as Element | null
        if (!t || !s.contains(t)) continue
        const timing = eff!.getComputedTiming()
        if (!isFinite(Number(timing.endTime))) continue
        const props = new Set<string>()
        try { for (const k of eff!.getKeyframes()) for (const p of Object.keys(k)) if (!["offset", "easing", "composite", "computedOffset"].includes(p)) props.add(p) } catch {}
        if (![...props].some((p) => /opacity|transform|translate|scale|filter|clip/i.test(p))) continue
        const name = (a as CSSAnimation).animationName ?? (a.constructor.name)
        w.__em.starts.push(`${t.tagName.toLowerCase()}.${String(t.className).slice(0, 40)} ${name} [${[...props].join(",")}] ${Math.round(Number(timing.endTime))}ms state=${a.playState}${(a as unknown as { __stack?: string }).__stack ? " @ " + (a as unknown as { __stack: string }).__stack : ""}`)
      }
      const r = s.getBoundingClientRect()
      if (r.bottom > 0 && r.top < innerHeight) {
        for (const el of s.querySelectorAll<HTMLElement>("h1,h2,h3,p,a,img,.hi1__content,[class*='__heading'],[class*='__text']")) {
          const b = el.getBoundingClientRect()
          if (b.width < 2 || b.bottom <= 0 || b.top >= innerHeight) continue
          let o = 1
          for (let e: HTMLElement | null = el; e && e !== document.body; e = e.parentElement) o *= parseFloat(getComputedStyle(e).opacity)
          if (o < 0.98 && o > 0) w.__em.dips.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 30)} ${o.toFixed(2)}`)
        }
      }
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

async function editOne(ed: Awaited<ReturnType<typeof editorFor>>, id: string) {
  let f: Frame = await ed.frame()
  const fb = (await (await ed.page.$("[data-compat-frame='front']"))!.boundingBox())!
  const short = id.replace("shopify-section-", "")
  await f.evaluate((sid) => document.getElementById(sid)?.scrollIntoView({ block: "start" }), id)
  await sleep(1400)
  await f.evaluate(RECORD, short)
  // 1. Select it by a click in the canvas, on its heading or else its middle.
  const at = await f.evaluate((sid) => {
    const s = document.getElementById(sid)
    if (!s) return null
    const free = (x: number, y: number) => { const e = document.elementFromPoint(x, y); return !!e && s.contains(e) && !e.closest("a, button, input, select, textarea, label, summary, [role='button'], [role='tab']") }
    const h = s.querySelector<HTMLElement>("h1, h2, h3, [class*='heading']")
    if (h) { const r = h.getBoundingClientRect(); const p = { x: r.left + Math.min(40, r.width / 2), y: r.top + r.height / 2 }; if (r.height > 2 && p.y > 0 && p.y < innerHeight && free(p.x, p.y)) return p }
    const r = s.getBoundingClientRect()
    for (let y = Math.max(r.top + 10, 10); y < Math.min(r.bottom, innerHeight) - 4; y += 23) for (let x = r.left + 10; x < r.right - 4; x += 37) if (free(x, y)) return { x, y }
    return null
  }, id)
  if (!at) { console.log(`  --    ${short}: nothing to click`); return }
  await ed.page.mouse.click(fb.x + at.x, fb.y + at.y)
  await sleep(1600)
  const sel = await f.evaluate(() => { const w = window as unknown as { __em: { starts: string[]; dips: string[] } }; const r = { starts: [...w.__em.starts], dips: [...new Set(w.__em.dips)] }; w.__em.starts = []; w.__em.dips = []; return r })
  check(`${short}: selecting it starts no entrance`, sel.starts.length === 0, sel.starts.slice(0, 4))
  check(`${short}: selecting it dims nothing`, sel.dips.length === 0, sel.dips.slice(0, 4))
  // 2. The first text of the selected thing changed in the sidebar.
  const typed = await ed.page.evaluate(() => {
    const aside = document.querySelector("aside, [data-wb-sidebar]") ?? document.body
    const fields = [...aside.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input[type='text'], input:not([type]), textarea")].filter((i) => { const r = i.getBoundingClientRect(); return r.width > 60 && r.left < 320 && i.value.trim().length > 1 && !/^#|^https?:|^\/|^\d/.test(i.value.trim()) })
    const i = fields[0]
    if (!i) return null
    const proto = i instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(i, i.value + " Now")
    i.dispatchEvent(new Event("input", { bubbles: true }))
    i.dispatchEvent(new Event("change", { bubbles: true }))
    return i.value
  })
  await sleep(2600)
  f = await ed.frame()
  const ed2 = await f.evaluate((sid) => { const w = window as unknown as { __em?: { starts: string[]; dips: string[] } }; return w.__em ? { starts: [...w.__em.starts], dips: [...new Set(w.__em.dips)], has: (document.getElementById(sid)?.textContent ?? "").includes("Now") } : null }, id)
  if (!typed) { console.log(`  --    ${short}: no text field to change`); return }
  if (!ed2) { check(`${short}: the page stays (no reload)`, false); return }
  check(`${short}: the new text is drawn`, ed2.has, typed.slice(0, 40))
  check(`${short}: changing its text starts no entrance`, ed2.starts.length === 0, ed2.starts.slice(0, 4))
  check(`${short}: changing its text dims nothing`, ed2.dips.length === 0, ed2.dips.slice(0, 4))
  await ed.page.keyboard.press("Escape")
  await sleep(300)
}

void (async () => {
  const browser = await puppeteer.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] })
  const zip = await JSZip.loadAsync(await composeTemplateZip(`materia/${TEMPLATE}`))
  if (process.env.ANIM) {
    const data = JSON.parse(await zip.file("config/settings_data.json")!.async("string")) as { current: Record<string, unknown> }
    data.current.scroll_animation = process.env.ANIM
    zip.file("config/settings_data.json", JSON.stringify(data))
  }
  const ed = await editorFor(browser, 1440, 900, false, undefined, zip)
  let f: Frame = await ed.frame()
  await sleep(3500)
  f = await ed.frame()
  const ids = await f.evaluate((m) => [...document.querySelectorAll(".shopify-section")].filter((s) => !/header|footer|announcement|popup|drawer|overlay/i.test(s.id) && s.getBoundingClientRect().height > 40 && (m === "all" || s.id.includes(m))).map((s) => s.id), SECTION)
  console.log(`${TEMPLATE}: ${ids.length} sections`)
  for (const id of SECTION === "all" ? ids : ids.slice(0, 1)) {
    try { await editOne(ed, id) } catch (e) { check(`${id}: probe ran`, false, String(e).slice(0, 120)) }
  }
  await ed.page.screenshot({ path: `${OUT}/edit-${TEMPLATE}-last.png` })
  ed.close()
  await browser.close()
  console.log(failed ? `\n${failed} failed` : "\nall ok")
  process.exit(failed ? 1 : 0)
})()
