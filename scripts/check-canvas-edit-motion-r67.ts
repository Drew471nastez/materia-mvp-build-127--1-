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
        w.__em.starts.push(`${t.tagName.toLowerCase()}.${String(t.className).slice(0, 40)} ${name} [${[...props].join(",")}] ${Math.round(Number(timing.endTime))}ms state=${a.playState}`)
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

void (async () => {
  const browser = await puppeteer.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] })
  const zip = await JSZip.loadAsync(await composeTemplateZip(`materia/${TEMPLATE}`))
  const ed = await editorFor(browser, 1440, 900, false, undefined, zip)
  let f: Frame = await ed.frame()
  await sleep(3500)
  f = await ed.frame()
  const id = await f.evaluate((m) => [...document.querySelectorAll(".shopify-section")].find((s) => s.id.includes(m))?.id ?? null, SECTION)
  console.log(`${TEMPLATE}: section ${id}`)
  if (!id) { await browser.close(); process.exit(1) }
  const fb = (await (await ed.page.$("[data-compat-frame='front']"))!.boundingBox())!
  const heading = await f.evaluate((sid) => {
    const s = document.getElementById(sid)!
    s.scrollIntoView({ block: "start" })
    const h = s.querySelector<HTMLElement>("h1, h2, [class*='heading']")
    if (!h) return null
    const r = h.getBoundingClientRect()
    return { x: r.left + Math.min(40, r.width / 2), y: r.top + r.height / 2, text: (h.textContent ?? "").trim() }
  }, id)
  await sleep(1200)
  await f.evaluate(RECORD, SECTION)
  // 1. Select it by a click in the canvas.
  const at = await f.evaluate((sid) => { const h = document.getElementById(sid)!.querySelector<HTMLElement>("h1, h2, [class*='heading']")!; const r = h.getBoundingClientRect(); return { x: r.left + Math.min(40, r.width / 2), y: r.top + r.height / 2 } }, id)
  await ed.page.mouse.click(fb.x + at.x, fb.y + at.y)
  await sleep(1800)
  await ed.page.screenshot({ path: `${OUT}/edit-${TEMPLATE}-selected.png` })
  const sel = await f.evaluate(() => { const w = window as unknown as { __em: { starts: string[]; dips: string[] } }; const r = { starts: [...w.__em.starts], dips: [...new Set(w.__em.dips)] }; w.__em.starts = []; w.__em.dips = []; return r })
  check("selecting it starts no entrance", sel.starts.length === 0, sel.starts.slice(0, 6))
  check("selecting it dims nothing", sel.dips.length === 0, sel.dips.slice(0, 6))
  // 2. Its heading's words changed in the sidebar.
  const typed = await ed.page.evaluate((text: string) => {
    const fields = [...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea")].filter((i) => i.getClientRects().length && i.value.trim() === text)
    const editable = [...document.querySelectorAll<HTMLElement>("[contenteditable='true']")].filter((e) => e.getClientRects().length && (e.textContent ?? "").trim() === text)
    const i = fields[0]
    if (i) {
      const proto = i instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(i, text + " Now")
      i.dispatchEvent(new Event("input", { bubbles: true }))
      i.dispatchEvent(new Event("change", { bubbles: true }))
      return "input"
    }
    if (editable[0]) { editable[0].focus(); document.execCommand("insertText", false, " Now"); return "rich" }
    return null
  }, heading?.text ?? "")
  console.log("  heading field:", typed)
  await sleep(2500)
  const ed2 = await f.evaluate((sid) => { const w = window as unknown as { __em: { starts: string[]; dips: string[] } }; return { starts: [...w.__em.starts], dips: [...new Set(w.__em.dips)], text: document.getElementById(sid)?.querySelector("h1, h2, [class*='heading']")?.textContent?.trim() } }, id)
  await ed.page.screenshot({ path: `${OUT}/edit-${TEMPLATE}-typed.png` })
  check("the new heading is drawn", !!typed && !!ed2.text?.endsWith("Now"), ed2.text)
  check("changing the heading starts no entrance", ed2.starts.length === 0, ed2.starts.slice(0, 8))
  check("changing the heading dims nothing", ed2.dips.length === 0, ed2.dips.slice(0, 8))
  ed.close()
  await browser.close()
  console.log(failed ? `\n${failed} failed` : "\nall ok")
  process.exit(failed ? 1 : 0)
})()
