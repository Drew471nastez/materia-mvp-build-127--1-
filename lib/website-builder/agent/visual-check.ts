import "server-only"

/**
 * ===========================================================================
 *  THE AGENT LOOKS AT WHAT IT BUILT, AT A LAPTOP'S WIDTH AND A PHONE'S
 * ===========================================================================
 * Everything else the run checks is about values: a setting that exists, a
 * colour with enough contrast, a file that compiles. None of it can see a
 * heading that runs off a phone's screen, two lines of text drawn on top of
 * each other, a section that came out 4px tall, or a hero that is one huge
 * empty band. Those are the faults a person sees first.
 *
 * So the page the run holds is drawn (./page-document.ts) and opened in the
 * same headless Chromium that takes every site's cover (../cover-shot.ts), at
 * 1440 and 390 wide, with reduced motion asked for (every section must show
 * its content without its entrance animation). In the page, each drawn
 * section is measured:
 *
 *   OVERFLOW     something wider than the screen, so the page scrolls sideways
 *   COLLAPSED    a section drawn under 12px tall
 *   CLIPPED      text cut off by its own box
 *   COLLISION    two pieces of text drawn over each other
 *   EMPTY        a tall section with almost nothing in it
 *   TINY TEXT    body text under 12px on a phone
 *   BROKEN IMAGE a picture that did not load
 *
 * The findings go back to the model like any review finding, with the two
 * photographs attached when the run was a build, so it can also judge the
 * design: hierarchy, rhythm, whether it looks like the business it is for.
 *
 * NEVER A REASON TO FAIL A RUN. No browser, a timeout, a crash: the answer is
 * null and the run carries on without it, logged. A check that cannot be done
 * is reported as not done, never as clean.
 */

import { launch } from "../cover-shot"
import { composePageDocument } from "./page-document"
import type { ThemeState } from "./operations"
import type { SchemaMap } from "./schemas"
import type { AgentImage } from "@/lib/sites/agent/attachments"
import sharp from "sharp"
import { compareWithReference, widthForReference, type ReferenceComparison } from "./reference-diff"

export interface VisualFinding {
  sectionId: string
  width: number
  kind: "overflow" | "collapsed" | "clipped" | "collision" | "empty" | "tiny-text" | "broken-image" | "not-drawn"
  message: string
}

export interface VisualReport {
  findings: VisualFinding[]
  /** Desktop then phone, as JPEG, for the model to look at. Empty when not asked for. */
  shots: AgentImage[]
  ms: number
  /** With a reference picture: the page measured against it (./reference-diff.ts), and the shot that was measured. */
  comparison?: ReferenceComparison | null
  referenceShot?: AgentImage
}

/*
  A TABLET TOO (round 22). A layout that is right at 1440 and at 390 can still break between them: two columns that
  never stack, a grid of four at 834. Measured at the three widths; photographed at the two the model reads (`shot`).
*/
export const VIEWPORTS = [
  { width: 1440, height: 900, mobile: false, scale: 0.5, shot: true, name: "desktop" },
  { width: 834, height: 1112, mobile: true, scale: 0.75, shot: false, name: "tablet" },
  { width: 390, height: 844, mobile: true, scale: 1, shot: true, name: "phone" },
] as const

/** How tall a screenshot may be, in CSS pixels, before it is cut. */
const SHOT_MAX_HEIGHT = { desktop: 5200, phone: 4200 }

/* Runs in the page. Plain JavaScript in a string, so no bundler rewrites it. */
const MEASURE = `(() => {
  const vw = document.documentElement.clientWidth
  const out = []
  const sections = Array.from(document.querySelectorAll('[data-check-section]'))
  const clipped = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p)
      if (/(hidden|clip|auto|scroll)/.test(s.overflowX)) return true
    }
    return false
  }
  /* The part of a box that can actually be seen: cut by every ancestor that clips. A closed accordion's answer has a box and no visible part. */
  const seen = (el, r) => {
    let left = r.left, top = r.top, right = r.right, bottom = r.bottom
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p)
      if (/(hidden|clip|auto|scroll)/.test(s.overflowX + s.overflowY) || s.contentVisibility === 'hidden') {
        const pr = p.getBoundingClientRect()
        left = Math.max(left, pr.left); top = Math.max(top, pr.top); right = Math.min(right, pr.right); bottom = Math.min(bottom, pr.bottom)
      }
      if (p.tagName === 'DETAILS' && !p.open && el.closest('summary') === null) return null
    }
    if (right - left <= 1 || bottom - top <= 1) return null
    return { left, top, right, bottom, width: right - left, height: bottom - top }
  }
  const visibleText = (el) => {
    if (!el.childNodes) return false
    for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim().length > 1) return true
    return false
  }
  for (const wrap of sections) {
    const id = wrap.getAttribute('data-check-section')
    const rect = wrap.getBoundingClientRect()
    if (rect.height < 12 && !wrap.hasAttribute('data-check-skip-empty')) out.push({ id, kind: 'collapsed', message: 'drawn ' + Math.round(rect.height) + 'px tall' })
    let widest = null
    const texts = []
    let contentArea = 0
    let images = 0
    for (const el of wrap.querySelectorAll('*')) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      const st = getComputedStyle(el)
      if (st.visibility === 'hidden' || Number(st.opacity) === 0) continue
      if ((r.right > vw + 1 || r.left < -1) && !clipped(el) && st.position !== 'fixed') {
        const over = Math.round(Math.max(r.right - vw, -r.left))
        if (!widest || over > widest.over) widest = { over, tag: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(/\\s+/)[0] : '') }
      }
      if (el.tagName === 'IMG') {
        images++
        if (el.complete && el.naturalWidth === 0 && el.getAttribute('src')) out.push({ id, kind: 'broken-image', message: 'a picture did not load (' + String(el.getAttribute('src')).slice(0, 80) + ')' })
      }
      const filled = st.backgroundColor && !/^(transparent|rgba\(0, 0, 0, 0\))$/.test(st.backgroundColor) && r.width * r.height < rect.width * rect.height * 0.9
      if (el.tagName === 'IMG' || el.tagName === 'VIDEO' || el.tagName === 'svg' || el.tagName === 'PICTURE' || (st.backgroundImage && st.backgroundImage !== 'none') || filled) contentArea += r.width * r.height
      if (visibleText(el)) {
        const v = seen(el, r)
        if (!v) continue
        texts.push({ r: v, el })
        contentArea += r.width * r.height
        if (/(hidden|clip)/.test(st.overflowX) && el.scrollWidth > el.clientWidth + 2 && st.textOverflow !== 'ellipsis') out.push({ id, kind: 'clipped', message: 'text cut off inside a ' + el.tagName.toLowerCase() + ': "' + el.textContent.trim().slice(0, 50) + '"' })
        const size = parseFloat(st.fontSize)
        if (vw < 500 && size < 12 && el.textContent.trim().length > 20) out.push({ id, kind: 'tiny-text', message: 'text at ' + size + 'px: "' + el.textContent.trim().slice(0, 40) + '"' })
      }
    }
    if (widest) out.push({ id, kind: 'overflow', message: 'a ' + widest.tag + ' sticks out ' + widest.over + 'px past the screen, so the page scrolls sideways' })
    let collisions = 0
    for (let i = 0; i < texts.length && i < 80 && collisions < 2; i++) {
      for (let j = i + 1; j < texts.length && j < 80; j++) {
        const a = texts[i], b = texts[j]
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue
        const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left)
        const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top)
        if (w <= 2 || h <= 2) continue
        const smaller = Math.min(a.r.width * a.r.height, b.r.width * b.r.height)
        if (w * h > smaller * 0.25) {
          collisions++
          out.push({ id, kind: 'collision', message: 'two pieces of text drawn over each other: "' + a.el.textContent.trim().slice(0, 30) + '" and "' + b.el.textContent.trim().slice(0, 30) + '"' })
          break
        }
      }
    }
    if (!wrap.hasAttribute('data-check-skip-empty') && rect.height > 560 && contentArea < rect.width * rect.height * 0.12 && images === 0) {
      out.push({ id, kind: 'empty', message: Math.round(rect.height) + 'px tall with very little in it' })
    }
  }
  const last = Array.from(document.querySelectorAll('[data-check-section],[data-check-standin]')).pop()
  const bottom = last ? last.getBoundingClientRect().bottom + window.scrollY : document.documentElement.scrollHeight
  return { out, height: Math.ceil(bottom) }
})()`

export async function visualCheck(input: {
  state: ThemeState
  sources: Record<string, string>
  schemas?: SchemaMap
  /** Attach the two photographs for the model to look at. */
  shots?: boolean
  /** A picture the creator asked the page to match: the page is photographed at its width and measured against it. */
  reference?: AgentImage | null
  timeoutMs?: number
}): Promise<VisualReport | null> {
  const t0 = Date.now()
  const doc = composePageDocument(input.state, input.sources, input.schemas)
  const findings: VisualFinding[] = doc.failed.map((f) => ({ sectionId: f.id, width: 0, kind: "not-drawn" as const, message: `could not be drawn: ${f.error}` }))
  if (doc.drawn.length === 0) return { findings, shots: [], ms: Date.now() - t0 }

  const timeoutMs = input.timeoutMs ?? (input.reference ? 40_000 : 32_000)
  let browser: Awaited<ReturnType<typeof launch>> | null = null
  const work = (async () => {
    browser = await launch()
    const page = await browser.newPage()
    await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
    const shots: AgentImage[] = []
    for (const view of VIEWPORTS) {
      await page.setViewport({ width: view.width, height: view.height, deviceScaleFactor: view.scale, isMobile: view.mobile, hasTouch: view.mobile })
      /* Pictures and fonts get a moment; a slow one is not worth the run waiting for. */
      await page.setContent(doc.html, { waitUntil: "load", timeout: 12_000 }).catch(() => undefined)
      await page.evaluate(() => (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready).catch(() => undefined)
      const measured = (await page.evaluate(MEASURE)) as { out: { id: string; kind: VisualFinding["kind"]; message: string }[]; height: number }
      for (const f of measured.out) findings.push({ sectionId: f.id, width: view.width, kind: f.kind, message: f.message })
      if (input.shots && view.shot) {
        const height = Math.min(measured.height, view.mobile ? SHOT_MAX_HEIGHT.phone : SHOT_MAX_HEIGHT.desktop)
        const shot = await page.screenshot({ type: "jpeg", quality: 55, clip: { x: 0, y: 0, width: view.width, height }, captureBeyondViewport: true })
        shots.push({ mediaType: "image/jpeg", data: Buffer.from(shot).toString("base64"), name: `${view.name}.jpg` })
      }
    }
    /*
      THE PICTURE THEY SENT, MEASURED. The page at the width the picture is a screenshot of, photographed at one CSS pixel
      to one, and scored against it (./reference-diff.ts).
    */
    let comparison: ReferenceComparison | null = null
    let referenceShot: AgentImage | undefined
    if (input.reference) {
      const refBuf = Buffer.from(input.reference.data, "base64")
      const meta = await sharp(refBuf, { failOn: "none" }).metadata().catch(() => null)
      if (meta?.width && meta.height) {
        const w = widthForReference(meta.width, meta.height)
        const view = VIEWPORTS.find((v) => v.width === w) ?? VIEWPORTS[0]
        await page.setViewport({ width: view.width, height: view.height, deviceScaleFactor: 1, isMobile: view.mobile, hasTouch: view.mobile })
        await page.setContent(doc.html, { waitUntil: "load", timeout: 12_000 }).catch(() => undefined)
        await page.evaluate(() => (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready).catch(() => undefined)
        const pageHeight = (await page.evaluate("document.documentElement.scrollHeight")) as number
        const height = Math.max(200, Math.min(pageHeight || view.height, Math.round((view.width * meta.height) / meta.width), 6000))
        const shot = Buffer.from(await page.screenshot({ type: "jpeg", quality: 70, clip: { x: 0, y: 0, width: view.width, height }, captureBeyondViewport: true }))
        comparison = await compareWithReference(refBuf, shot, view.width)
        referenceShot = { mediaType: "image/jpeg", data: shot.toString("base64"), name: `yours-${view.width}.jpg` }
      }
    }
    return { shots, comparison, referenceShot }
  })()
  try {
    const done = await Promise.race([
      work,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("the visual check ran out of time")), timeoutMs)),
    ])
    return { findings: dedupe(findings), shots: done.shots, ms: Date.now() - t0, comparison: done.comparison, referenceShot: done.referenceShot }
  } catch (thrown) {
    console.warn("[storelib ai] visual check skipped:", thrown instanceof Error ? thrown.message : thrown)
    return null
  } finally {
    const open = browser as { close: () => Promise<void> } | null
    await open?.close().catch(() => undefined)
    /* The launch may still be on its way when the timeout won: close it when it lands. */
    work.then(() => (browser as { close: () => Promise<void> } | null)?.close().catch(() => undefined)).catch(() => undefined)
  }
}

/** One line per section, kind and width: the same fault at both widths is said once. */
function dedupe(findings: VisualFinding[]): VisualFinding[] {
  const seen = new Set<string>()
  return findings.filter((f) => {
    const key = `${f.sectionId}:${f.kind}:${f.message}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** The findings as the model reads them. */
export function describeVisual(report: VisualReport, names: (id: string) => string): string {
  if (!report.findings.length) return ""
  const lines = report.findings.slice(0, 14).map((f) => `- ${names(f.sectionId)}${f.width ? ` at ${f.width}px` : ""}: ${f.message}`)
  return `DRAWN IN A BROWSER AT 1440, 834 AND 390 WIDE, these are wrong:\n${lines.join("\n")}`
}
