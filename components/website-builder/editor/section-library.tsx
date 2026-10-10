"use client"

/**
 * ===========================================================================
 *  ADD A SECTION
 * ===========================================================================
 * "In the website builder editor on mobile, when I tap between two sections,
 * it opens the add a section modal ... the previews should be optimized and
 * look good. Switching between categories and the sections should feel good.
 * The 'Made by me' category pill should be first ... It should not glitch,
 * be very optimized for performance, not lag at all."
 *
 * And then: "one section per row, not 2 per row", "it should not show at the
 * end 'after (whatever)'", "'Created by you' should be called 'Created'", and
 * "when I switch between the category pills of the sections, there should be
 * no flash and no glitch in the preview cards". And a short section (the
 * "My banner" preview) should not sit at the top of a tall fixed frame over
 * a large empty area: each card is its section's height.
 *
 * One library, in two shells:
 *
 *   A PHONE     the builder's own sheet (MobileEditorSheet, the one Publish
 *               and the sections list use), over the sheet it was opened
 *               from. A search box, the categories as a row of pills with
 *               the creator's own sections first, and the sections one under
 *               another: each a phone sized preview as wide as the sheet,
 *               with its name under it.
 *   A COMPUTER  a dialog: the categories down the side, the same single
 *               column of desktop sized previews beside them.
 *
 * NO LINE SAYING WHERE IT GOES. The title used to carry "Between Hero and
 * FAQ" or "At the end, after FAQ". The section lands where it was asked for
 * and the canvas brings it on screen, which says it better than a sentence
 * read before choosing.
 *
 * WHAT MAKES IT CHEAP
 *
 *   A PREVIEW IS MARKUP. Each section is drawn once by the real renderer,
 *   with the real theme, and from then on its card is that markup (1:1 with
 *   the section, because it IS the section's output). Drawn off screen, in
 *   idle time after the editor has settled, one section per idle slice, and
 *   measured once in the slice after, so by the time anybody opens the
 *   library every preview is ready, at its section's height, and opening it
 *   builds nothing. A card that is shown before its preview is ready holds
 *   a quiet grey box as tall as a card can be, and the preview fades in over
 *   it once, when it lands in front of somebody: nothing moves, and the card
 *   takes its section's height only where nobody can see it change.
 *
 *   A CATEGORY IS A FILTER, NOT A NEW LIST. Every card is built once and
 *   kept; choosing a category shows some and hides the rest. Nothing is
 *   parsed, rebuilt, measured or faded again: a preview that is drawn is
 *   there, at full strength and in its place, from the first frame after the
 *   press. It used to be otherwise twice over. The list faded in from a
 *   quarter of its strength on every category, and each preview carried the
 *   class that had faded it in when it first arrived; a CSS animation starts
 *   again whenever its element comes back from `display: none`, so every
 *   card a category showed again flashed up from nothing.
 *
 *   IMAGES WAIT. Every picture in a preview is `loading="lazy"`, and every
 *   card below the first few of what is showing is `content-visibility:
 *   auto`, so the thirty cards below the fold cost nothing until they are
 *   scrolled to. The first few are drawn outright: a box the browser has
 *   never drawn starts out skipped, and was grey for a few frames the first
 *   time a category showed it.
 *
 *   ADDING CLOSES FIRST. The sheet starts to close on the tap, and the
 *   section is added on the next frame, so the close is already with the
 *   compositor while the canvas does its work (see the editor's
 *   addSection, which then slides the page open where it lands, and on a
 *   phone brings the sections sheet up on the new section's settings).
 *
 * scripts/check-add-section.mjs opens it, switches categories and adds a
 * section on a phone and a computer, reads every frame of a category switch
 * and films it, and follows the add until everything has settled.
 */

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { createPortal, flushSync } from "react-dom"
import { Search, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { hapticTap } from "@/lib/native-bridge"
import { MobileEditorSheet } from "@/components/website-builder/mobile-editor-sheet"
import SectionRenderer from "@/components/website-builder/sections/SectionRenderer"
import { StorelibLiveProvider } from "@/components/website-builder/sections/storelib-live"
import { SECTION_CATEGORIES, SECTION_CATEGORY_ORDER } from "@/lib/website-builder/section-schemas"
import { CUSTOM_SECTION_CATEGORY } from "@/lib/website-builder/storelib-schemas"
import { lazyImages, previewCardHeight, previewCentered, previewKey, splitStyles } from "@/lib/website-builder/preview-markup"
import type { SectionInstance, SectionSchema, ThemeSettingsValues } from "@/lib/website-builder/types"

/* ── What a preview is drawn at ────────────────────────────────────────── */

/**
 * THE WIDTH A PREVIEW IS DRAWN AT, WHICH DECIDES WHAT IT SHOWS. Sections ask
 * about the width they are IN (container queries, see SectionRenderer), so
 * 800 asks "what do you look like on a computer" and 390 asks the same of a
 * phone. A phone gets the phone's answer.
 */
export const PREVIEW_RENDER_WIDTH = 800
export const PREVIEW_RENDER_WIDTH_MOBILE = 390
/** Box height over box width: a glimpse of the section, not all of it. */
export const PREVIEW_RATIO = 0.56
export const PREVIEW_RATIO_MOBILE = 1.22

const PREVIEW_THEME: ThemeSettingsValues = {
  primary_color: "#6366f1",
  secondary_color: "#8b5cf6",
  accent_color: "#f59e0b",
  background_color: "#ffffff",
  surface_color: "#f8fafc",
  text_color: "#0f172a",
  text_secondary_color: "#64748b",
  border_color: "#e2e8f0",
  button_style: "rounded",
  border_radius: 8,
  font_heading: "Inter",
  font_body: "Inter",
}

/**
 * WHAT A THEME LOOKS LIKE, FOR A PREVIEW. Only the settings a section is drawn
 * with: colours, schemes, type, buttons and corners. The logo, the favicon or
 * a social link changing is no reason to draw ninety cards again.
 */
const LOOK = /color|colour|scheme|font|type_|heading|body|button|radius|corner|shadow|spacing|width/i

/** A short tag for the look of a theme, so a card drawn in last week's colours is never shown in this week's. */
export function themeLookTag(theme: ThemeSettingsValues | undefined): string {
  if (!theme) return ""
  const keys = Object.keys(theme).filter((k) => LOOK.test(k)).sort()
  const text = JSON.stringify(keys.map((k) => [k, (theme as Record<string, unknown>)[k]]))
  let h = 0
  for (let i = 0; i < text.length; i++) h = (Math.imul(h, 31) + text.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

export function buildPreviewSection(type: string, presetIndex: number, schema: SectionSchema): SectionInstance {
  const preset = schema.presets?.[presetIndex] ?? schema.presets?.[0]
  return {
    id: `preview-${type}-${presetIndex}`,
    type,
    name: schema.name,
    settings: preset?.settings ?? {},
    blocks: preset?.blocks ?? [],
    hidden: false,
  }
}


/* The styles taken out of each preview (lib/website-builder/preview-markup.ts), in sheets of the library's own. */
const styleQueue: string[] = []
const addStyles = (css: string[]) => { styleQueue.push(...css) }
/**
 * ONE SMALL SHEET PER IDLE MOMENT THAT HAS STYLES TO ADD, NEVER A BIGGER ONE.
 * They used to go on the end of a single sheet, and a sheet that is written
 * to is read again from its first line and every rule in it checked against
 * the page again: by the last preview that was 22 to 37ms a write on a
 * computer at a quarter speed, and the measuring after it paid for the
 * check. A sheet added after the others costs its own rules and nothing
 * else (measured: 643ms of writes over the warm-up became 81ms).
 */
function flushStyles() {
  if (!styleQueue.length || typeof document === "undefined") return
  const sheet = document.createElement("style")
  sheet.setAttribute("data-section-preview-styles", "")
  sheet.textContent = styleQueue.splice(0).join("\n")
  document.head.appendChild(sheet)
}

/* ── The preview store ─────────────────────────────────────────────────── */

/**
 * ===========================================================================
 *  EVERY PREVIEW, DRAWN ONCE, OFF SCREEN, IN IDLE TIME
 * ===========================================================================
 * Module level on purpose: it outlives the dialog and the sheet, so a second
 * opening, a category, and a search cost nothing.
 */
const MARKUP = new Map<string, string>()
/**
 * AND HOW TALL EACH ONE IS, measured once, just after it is drawn, at the
 * width it was drawn at: so a card knows its section's height before it is
 * ever built, and is that tall from its first frame (see previewCardHeight).
 */
const HEIGHTS = new Map<string, number>()
/** Counts every batch of heights, for what has to be worked out again when they change (the eager cards). */
let heightsVersion = 0
const listeners = new Set<() => void>()
const notify = () => {
  for (const l of listeners) l()
}
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}


interface Job {
  key: string
  type: string
  presetIndex: number
  schema: SectionSchema
  width: number
  sources: Record<string, string>
  /** The site's own theme, so a card is the section as it will be added, in this site's colours and type. */
  theme: ThemeSettingsValues
}

const queue: Job[] = []
const queued = new Set<string>()
/**
 * Drawn, and waiting to be measured, in the order they were drawn. A card is
 * handed its preview and its height together, when both are known, so it
 * never shows a preview at a height it is about to lose.
 */
const unmeasured: { key: string; html: string; width: number }[] = []
const pending = new Set<string>()
let host: HTMLDivElement | null = null
let root: Root | null = null
let running = false

/** Reads its own markup the moment its children have committed, before any of them measures anything. */
function Capture({ onCapture, children }: { onCapture: (html: string) => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    onCapture(ref.current?.innerHTML ?? "")
  })
  return <div ref={ref}>{children}</div>
}

function drawOne(job: Job): string {
  if (typeof document === "undefined") return ""
  if (!host) {
    /*
      NOT IN THE DOCUMENT. The markup is read in a layout effect, before any
      section has measured anything, so nothing here needs a box; and a
      section's <style> in the document, even for a moment, is a stylesheet
      the whole editor is looked at again for.
    */
    host = document.createElement("div")
    root = createRoot(host)
  }
  let html = ""
  const section = buildPreviewSection(job.type, job.presetIndex, job.schema)
  flushSync(() => {
    root!.render(
      <StorelibLiveProvider sources={job.sources}>
        <Capture onCapture={(h) => { html = h }}>
          <SectionRenderer
            section={section}
            theme={job.theme}
            isEditing={false}
            isSelected={false}
            deviceMode={job.width <= PREVIEW_RENDER_WIDTH_MOBILE ? "mobile" : "desktop"}
          />
        </Capture>
      </StorelibLiveProvider>,
    )
  })
  const split = splitStyles(html)
  addStyles(split.css)
  return lazyImages(split.html)
}

/**
 * ===========================================================================
 *  A PREVIEW IS MEASURED WHERE IT CAN BE, ONCE
 * ===========================================================================
 * The drawing root is not in the document (see drawOne), so nothing drawn
 * there has a height. The markup is put, once, into a ruler that is: out of
 * sight far to the left, as wide as the preview is drawn, with the
 * previews' own styles already in the document, and its height read. The
 * same markup in the same width is the same height in the card, where the
 * section is laid out at that width and only scaled afterwards.
 *
 * `contain: layout paint` keeps the ruler to itself: nothing around it is
 * laid out again for it, and a section's fixed layer, a menu say, measures
 * inside it rather than against the window, as it does in a card, whose
 * scale is a transform. Fixed, so a tall section does not make the page
 * longer for the moment it is in there.
 */
let ruler: HTMLDivElement | null = null
function measureOne(html: string, width: number): number {
  if (!html || typeof document === "undefined") return 0
  if (!ruler || !ruler.isConnected) {
    ruler = document.createElement("div")
    ruler.setAttribute("aria-hidden", "true")
    ruler.setAttribute("data-section-preview-ruler", "")
    ruler.style.cssText = "position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none;contain:layout paint"
    document.body.appendChild(ruler)
  }
  ruler.style.width = `${width}px`
  ruler.innerHTML = html
  const height = ruler.getBoundingClientRect().height
  ruler.textContent = ""
  return Math.ceil(height)
}

const idle = (cb: (deadline: { timeRemaining: () => number }) => void) => {
  const w = typeof window !== "undefined" ? (window as unknown as { requestIdleCallback?: (cb: (d: { timeRemaining: () => number }) => void, o?: { timeout: number }) => number }) : undefined
  if (w?.requestIdleCallback) w.requestIdleCallback(cb, { timeout: 400 })
  else setTimeout(() => cb({ timeRemaining: () => 8 }), 16)
}

/** Another measurement only while the idle moment has at least this much of itself left. */
const MEASURE_ROOM_MS = 30

/**
 * ===========================================================================
 *  ONE KIND OF WORK PER IDLE MOMENT, AND NO MORE THAN IT HAS ROOM FOR
 * ===========================================================================
 * Drawing a preview is script; measuring one is the browser laying a whole
 * section out. Both in the one slice, with the styles written to a single
 * growing sheet (see flushStyles), made nearly every slice a long task: at
 * a quarter speed, the 5 or 6 long tasks the previews used to be drawn in
 * became 40 on a computer, and 2 or 3 became 42 on a phone, and a tap that
 * lands in a long task waits for it. So a slice either measures what the
 * slices before it drew or draws more, one at least, and stops at its
 * deadline either way. Measuring goes first, so what is drawn reaches its
 * card before more is drawn.
 *
 * Measured the same way now: 4 on the computer and 2 on the phone, fewer
 * than drawing alone took before anything was measured, since the sheets
 * are small now as well.
 */
function pump() {
  if (running) return
  running = true
  idle((deadline) => {
    running = false
    if (unmeasured.length) {
      /* After the styles are in, so each is measured as it will look. */
      flushStyles()
      do {
        const next = unmeasured.shift()!
        let height = 0
        try {
          height = measureOne(next.html, next.width)
        } catch {
          height = 0
        }
        HEIGHTS.set(next.key, height)
        MARKUP.set(next.key, next.html)
        pending.delete(next.key)
      } while (unmeasured.length && deadline.timeRemaining() > MEASURE_ROOM_MS)
      heightsVersion++
      notify()
    } else {
      do {
        const job = queue.shift()
        if (!job) break
        queued.delete(job.key)
        if (MARKUP.has(job.key) || pending.has(job.key)) continue
        let html = ""
        try {
          html = drawOne(job)
        } catch {
          html = ""
        }
        pending.add(job.key)
        unmeasured.push({ key: job.key, html, width: job.width })
      } while (queue.length && deadline.timeRemaining() > 12)
    }
    if (queue.length || unmeasured.length) pump()
  })
}

/** Ask for previews; the first in the list first. Already drawn, being drawn or already asked for: nothing. */
export function requestPreviews(jobs: Job[], front = false) {
  const fresh = jobs.filter((j) => !MARKUP.has(j.key) && !queued.has(j.key) && !pending.has(j.key))
  for (const j of fresh) queued.add(j.key)
  if (front) queue.unshift(...fresh)
  else queue.push(...fresh)
  if (queue.length) pump()
}

/** Only the card whose preview just landed renders again: the snapshot is its own string. */
function useMarkup(key: string): string | undefined {
  return useSyncExternalStore(subscribe, () => MARKUP.get(key), () => undefined)
}

/** The section's own height as drawn, in the width it was drawn at; undefined until it has been. */
function useDrawnHeight(key: string): number | undefined {
  return useSyncExternalStore(subscribe, () => HEIGHTS.get(key), () => undefined)
}

/* ── A card ────────────────────────────────────────────────────────────── */

/** A section under the floor, in the middle of its card (see previewCentered). */
const IN_THE_MIDDLE: CSSProperties = { display: "flex", flexDirection: "column", justifyContent: "center" }

/** A preview that lands in front of somebody comes in over the grey, once. */
const ARRIVE_MS = 220
const ARRIVE_EASE = "cubic-bezier(0.32, 0.72, 0, 1)"

/**
 * In front of somebody: laid out (not in a category that is hidden), not in
 * a closed sheet or dialog, and not below the fold where content-visibility
 * skips it. A preview landing anywhere else is simply there when it is seen.
 */
function inFrontOfSomebody(el: HTMLElement): boolean {
  const check = (el as HTMLElement & { checkVisibility?: (o?: Record<string, boolean>) => boolean }).checkVisibility
  if (typeof check === "function") {
    return check.call(el, { contentVisibilityAuto: true, visibilityProperty: true, opacityProperty: true })
  }
  return el.getClientRects().length > 0
}

function reducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches
  } catch {
    return false
  }
}

/**
 * ===========================================================================
 *  A CARD NEVER GETS SHORTER WHILE SOMEBODY CAN SEE IT
 * ===========================================================================
 * A card is as tall as its section (previewCardHeight), and that is known
 * the moment the preview is drawn, which is nearly always long before the
 * card is built: so nearly every card is its own height from its first
 * frame. Until then it is as tall as a card can be, a grey box of the crop's
 * height, because most sections are at least that tall.
 *
 * A library opened before its previews were drawn has such boxes on screen,
 * and a preview landing in one used to be free to take the card down to its
 * section's height in front of whoever was reading: every card under it
 * jumping up the list. So a card that would get shorter where it can be
 * seen keeps its height, the section on white to its foot, until nobody can
 * see it change: the next time a category or a search is chosen (a new
 * list, drawn from its top), or the next time the library opens. A card
 * ABOVE what can be seen is held as well, because shortening it moves
 * everything under it, and iOS Safari has no scroll anchoring to put the
 * list back. A card below the fold, in a hidden category or in a closed
 * library takes its height at once.
 */
interface HeldCard {
  box: HTMLElement
  take: () => void
}
const heldCards = new Set<HeldCard>()

/** Where a change in this box's height would move something somebody can see. */
function inSight(box: HTMLElement): boolean {
  const check = (box as HTMLElement & { checkVisibility?: (o?: Record<string, boolean>) => boolean }).checkVisibility
  if (typeof check === "function" && !check.call(box, { visibilityProperty: true, opacityProperty: true })) return false
  if (box.getClientRects().length === 0) return false
  const list = box.closest("[data-library-scroll]")
  if (!list) return true
  return box.getBoundingClientRect().top < list.getBoundingClientRect().bottom
}

/** The held cards take their own height: all of them, or the ones nobody can see any more. */
function releaseHeld(all: boolean) {
  for (const held of [...heldCards]) {
    if (all || !held.box.isConnected || !inSight(held.box)) {
      heldCards.delete(held)
      held.take()
    }
  }
}

/**
 * The height a card is drawn at: `wanted` (see previewCardHeight), except
 * that it is never made shorter where somebody can see it (above). A card
 * whose section is not measured yet keeps what it has, so a creator's
 * section drawn again does not grow its card to the crop and back.
 */
function useSteadyHeight(boxRef: React.RefObject<HTMLDivElement | null>, wanted: number, width: number, known: boolean): number {
  const [kept, setKept] = useState(() => ({ height: wanted, width }))
  useLayoutEffect(() => {
    /* A new width is a new layout: everything is its new size at once. */
    if (kept.width !== width) {
      setKept({ height: wanted, width })
      return
    }
    if (kept.height === wanted || !known) return
    const take = () => setKept({ height: wanted, width })
    const box = boxRef.current
    if (wanted > kept.height || !box || !inSight(box)) {
      take()
      return
    }
    const held: HeldCard = { box, take }
    heldCards.add(held)
    return () => {
      heldCards.delete(held)
    }
  }, [boxRef, wanted, width, known, kept])
  return kept.width === width ? kept.height : wanted
}

const PreviewBox = memo(function PreviewBox({
  markupKey,
  width,
  renderWidth,
  ratio,
  live,
  eager,
}: {
  markupKey: string
  width: number
  renderWidth: number
  ratio: number
  /** Its turn has come to be put in (see `live` in the library). */
  live: boolean
  /** Among the first few of what is shown, so drawn the moment it is shown (see `eager` in the library). */
  eager: boolean
}) {
  const stored = useMarkup(markupKey)
  const markup = live ? stored : undefined
  /* The same object for the same markup, or React rewrites it on every render. */
  const html = useMemo(() => (markup ? { __html: markup } : null), [markup])
  /**
   * ===========================================================================
   *  A PREVIEW FADES IN ONCE, WHEN IT ARRIVES, AND NEVER AGAIN
   * ===========================================================================
   * The fade used to be a class, and a CSS animation on a class plays again
   * every time its element comes back from `display: none`. A category hides
   * the cards it does not want with exactly that, so every card a category
   * showed again replayed its entrance from nothing, over a preview that had
   * been drawn all along: the flash over the covers on every pill.
   *
   * So the fade is played by hand, by the Web Animations API, in the commit
   * the preview lands in, and only if the box is in front of somebody right
   * then. An animation played by hand runs on its own clock and is gone when
   * it ends, holding nothing (no fill, so no layer of its own afterwards);
   * hiding and showing the card afterwards has nothing to replay. A box that
   * had its preview from the start fades nothing, and neither does a preview
   * drawn ahead into the CLOSED library, whose sheet or dialog is hidden:
   * dozens of fades nobody saw were what an idle editor paid for on every
   * frame the AI ring turned (scripts/check-ai-ring-cost.mjs).
   */
  const innerRef = useRef<HTMLDivElement | null>(null)
  const held = useRef(html !== null)
  useLayoutEffect(() => {
    const el = innerRef.current
    if (!html || !el) {
      held.current = false
      return
    }
    if (held.current) return
    held.current = true
    if (reducedMotion() || typeof el.animate !== "function" || !inFrontOfSomebody(el)) return
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ARRIVE_MS, easing: ARRIVE_EASE })
  }, [html])
  /* As tall as its section, between a floor and the crop, and never shorter in front of somebody. */
  const boxRef = useRef<HTMLDivElement | null>(null)
  const drawn = useDrawnHeight(markupKey)
  const height = useSteadyHeight(boxRef, previewCardHeight(drawn, width, renderWidth, ratio), width, drawn !== undefined)
  const scale = width > 0 ? width / renderWidth : 0.3
  const centered = previewCentered(drawn, width, renderWidth, height)
  const inner: CSSProperties = {
    width: renderWidth,
    /* A section shorter than its card sits on white to the card's foot: in the middle of it under the floor, at the top of it otherwise. */
    minHeight: height ? Math.ceil(height / scale) : undefined,
    ...(centered ? IN_THE_MIDDLE : null),
    transform: `scale(${scale})`,
    pointerEvents: "none",
    userSelect: "none",
  }
  return (
    <div
      ref={boxRef}
      data-preview-box=""
      className="relative w-full overflow-hidden bg-[#f3f4f6]"
      style={{
        /* The box is its section's height before anything is drawn in it, so the list never moves. */
        height: height || undefined,
        aspectRatio: height ? undefined : `1 / ${ratio}`,
        contentVisibility: eager ? "visible" : "auto",
        containIntrinsicSize: `${width || 200}px ${height || 200}px`,
      }}
    >
      {html && (
        <div
          ref={innerRef}
          className="absolute left-0 top-0 origin-top-left bg-white"
          data-keep-transform
          style={inner}
          aria-hidden
          dangerouslySetInnerHTML={html}
        />
      )}
    </div>
  )
})

/* ── An imported theme's card: its own engine, in a frame of its own ─────── */

/** Frames drawn one at a time, a moment apart, so opening the library never stalls the editor. */
const compatQueue: (() => void)[] = []
let compatPumping = false
function queueCompatDraw(job: () => void) {
  compatQueue.push(job)
  if (compatPumping) return
  compatPumping = true
  const next = () => {
    const run = compatQueue.shift()
    if (!run) { compatPumping = false; return }
    run()
    setTimeout(next, 60)
  }
  setTimeout(next, 0)
}

const CompatPreviewBox = memo(function CompatPreviewBox({
  draw,
  width,
  renderWidth,
  ratio,
}: {
  draw: () => string | null
  width: number
  renderWidth: number
  ratio: number
}) {
  const boxRef = useRef<HTMLDivElement | null>(null)
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const [html, setHtml] = useState<string | null>(null)
  const [arrived, setArrived] = useState(false)
  const [drawnHeight, setDrawnHeight] = useState<number | null>(null)
  /* Drawn when it comes near the screen, and kept. */
  useEffect(() => {
    const el = boxRef.current
    if (!el || html !== null) return
    const io = new IntersectionObserver((seen) => {
      if (!seen.some((e) => e.isIntersecting)) return
      io.disconnect()
      queueCompatDraw(() => setHtml(draw() ?? ""))
    }, { rootMargin: "400px 0px" })
    io.observe(el)
    return () => io.disconnect()
  }, [draw, html])
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (!frameRef.current || e.source !== frameRef.current.contentWindow) return
      const h = (e.data as { storelibPreview?: number; h?: number })?.h
      if (typeof h === "number" && h > 0) { setDrawnHeight(h); setArrived(true) }
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [])
  const scale = width > 0 ? width / renderWidth : 0.3
  const crop = width * ratio
  /* As tall as its section, between a floor and the crop. */
  const height = width > 0 ? Math.round(drawnHeight ? Math.max(width * 0.22, Math.min(crop, drawnHeight * scale)) : crop) : 0
  return (
    <div
      ref={boxRef}
      data-preview-box=""
      data-compat-preview={html === null ? "waiting" : arrived ? "drawn" : "drawing"}
      className="relative w-full overflow-hidden bg-[#f3f4f6]"
      style={{ height: height || undefined, aspectRatio: height ? undefined : `1 / ${ratio}` }}
    >
      {html ? (
        <iframe
          ref={frameRef}
          srcDoc={html}
          sandbox="allow-scripts"
          tabIndex={-1}
          aria-hidden
          title=""
          onLoad={() => setTimeout(() => setArrived(true), 300)}
          /* The card's hover rule takes transforms off what is inside it; this one is the preview's size. */
          data-keep-transform
          className="absolute left-0 top-0 origin-top-left border-0 bg-white"
          style={{
            width: renderWidth,
            height: Math.max(1, Math.ceil((height || crop) / scale)),
            transform: `scale(${scale})`,
            pointerEvents: "none",
            opacity: arrived ? 1 : 0,
            transition: "opacity 220ms ease-out",
          }}
        />
      ) : null}
    </div>
  )
})

const LibraryCard = memo(function LibraryCard({
  entry,
  width,
  renderWidth,
  ratio,
  hidden,
  live,
  eager,
  phone,
  onAdd,
  compatDraw,
}: {
  entry: LibraryEntry
  width: number
  renderWidth: number
  ratio: number
  hidden: boolean
  live: boolean
  eager: boolean
  phone: boolean
  onAdd: (type: string, presetIndex: number) => void
  /** An imported theme's card: drawn by the theme's own engine (CompatPreviewBox). */
  compatDraw?: () => string | null
}) {
  return (
    <button
      type="button"
      hidden={hidden}
      onClick={() => onAdd(entry.type, entry.presetIndex)}
      /* A stable hook so the library can be counted from outside. */
      data-library-card={entry.type}
      data-preset={entry.presetIndex}
      className={cn(
        "group flex min-w-0 flex-col gap-2 text-left outline-none [-webkit-touch-callout:none] select-none",
        "focus-visible:[&>div]:shadow-[0_0_0_2px_#fff,0_0_0_4px_#1a1a2e]",
      )}
    >
      <div
        className={cn(
          "w-full overflow-hidden rounded-xl border border-[#e5e7eb] bg-white",
          /* A pointer gets a lift; a thumb gets the shell's own dim, and nothing of the card's. */
          "transition-[border-color,box-shadow,translate] duration-200 ease-out",
          !phone && "group-hover:border-[#d1d5db] group-hover:shadow-[0_6px_18px_-10px_rgba(15,23,42,0.35)] group-hover:-translate-y-px",
        )}
      >
        {compatDraw ? (
          <CompatPreviewBox draw={compatDraw} width={width} renderWidth={phone ? renderWidth : COMPAT_RENDER_WIDTH} ratio={ratio} />
        ) : (
          <PreviewBox markupKey={entry.keyFor(renderWidth)} width={width} renderWidth={renderWidth} ratio={ratio} live={live} eager={eager} />
        )}
      </div>
      {/* The name under the picture; a size up on a phone, where the card is the width of the sheet. */}
      <span className="truncate px-0.5 text-[14px] font-medium leading-tight text-[#1a1a2e] sm:text-[13px]">{entry.title}</span>
    </button>
  )
})

/* ── The library ───────────────────────────────────────────────────────── */

/** An imported theme is drawn at a laptop's width, where its sections were designed to be seen. */
const COMPAT_RENDER_WIDTH = 1280

interface LibraryEntry {
  type: string
  presetIndex: number
  title: string
  schema: SectionSchema
  category: string
  /** Everything somebody might type to find this, lower-cased once. */
  haystack: string
  keyFor: (width: number) => string
}

/** A card's own name: its React key, and what the set of filled previews holds. */
const cardKey = (e: { type: string; presetIndex: number }) => `${e.type}-${e.presetIndex}`

/** The shells swap here, as the rest of the builder's sheets do. */
const PHONE_QUERY = "(max-width: 639px)"
/** How many previews are put in per frame (or per idle moment) once they are drawn. */
const FILL_PER_FRAME = 4
/** How many at the top of what is showing are drawn outright rather than when the browser gets to them. */
const EAGER_CARDS = 3
/** How long after the editor has settled the previews start being drawn. */
const WARM_AFTER_MS = 1800

export const SectionLibrary = memo(function SectionLibrary({
  open,
  onOpenChange,
  onAddSection,
  schemas,
  addable,
  ownTypes,
  sources,
  theme,
  drawCompat,
  ownLabel,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAddSection: (type: string, presetIndex?: number) => void
  /** Every section this install can add: the theme's, and this creator's own. */
  schemas: Record<string, SectionSchema>
  addable: string[]
  /** The ones this creator wrote, which get their own category, first. */
  ownTypes: string[]
  /** Every .storelib file this install has saved, so the cards can draw them. */
  sources: Record<string, string>
  /**
   * The site's theme settings. A card used to be drawn in a stock indigo
   * theme, so what was picked never looked like what arrived on the page;
   * now it is drawn with the colours, schemes and fonts the section will
   * actually get.
   */
  theme?: ThemeSettingsValues
  /**
   * For a theme imported from Shopify: a section, drawn alone by the theme's
   * own engine as a whole page (compat-canvas.tsx, useCompatPreviewDrawer).
   * Its cards are frames of their own instead of Storelib's previews.
   */
  drawCompat?: ((section: SectionInstance) => string | null) | null
  /** What the creator's own sections are called here: the imported theme's name, rather than Created. */
  ownLabel?: string
}) {
  const [phone, setPhone] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(PHONE_QUERY)
    const read = () => setPhone(mq.matches)
    read()
    mq.addEventListener("change", read)
    return () => mq.removeEventListener("change", read)
  }, [])

  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  /**
   * A fresh open starts at everything, with nothing typed, from its first
   * frame. Before paint: as an effect it ran after the library had been drawn
   * once on the category it was left on, which then changed under the eye.
   */
  useLayoutEffect(() => {
    if (open) {
      setActiveCategory(null)
      setQuery("")
      /* Before its first frame: a card held at the crop last time opens at its own height. */
      releaseHeld(true)
    }
  }, [open])

  const own = useMemo(() => new Set(ownTypes), [ownTypes])
  /* The creator's own files are part of what a preview is drawn from, so a change to them is a new preview. */
  const sourcesTag = useMemo(() => {
    let h = 0
    for (const [k, v] of Object.entries(sources)) {
      const s = k + v.length + v.slice(0, 64) + v.slice(-64)
      for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0
    }
    return (h >>> 0).toString(36)
  }, [sources])

  const lookTag = useMemo(() => themeLookTag(theme), [theme])
  /* The look, not the object: a new settings object with the same colours draws nothing again. */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const previewTheme = useMemo<ThemeSettingsValues>(() => ({ ...PREVIEW_THEME, ...(theme ?? {}) }), [lookTag])

  /**
   * ONE CARD PER PRESET. A section's presets are the different things it can
   * first appear as, and each is its own card with its own preview.
   */
  const entries = useMemo<LibraryEntry[]>(() => {
    const out: LibraryEntry[] = []
    for (const type of addable) {
      const schema = schemas[type]
      if (!schema) continue
      const sectionCategory = own.has(type) ? CUSTOM_SECTION_CATEGORY : schema.category ?? "content"
      const presets = schema.presets ?? []
      const list = presets.length > 1 ? presets.map((p, i) => ({ i, name: p.name || schema.name })) : [{ i: 0, name: schema.name }]
      for (const { i, name } of list) {
        /* A preset may file itself under another category, the way a Shopify preset does: "Image with text" under Media. Never out of the creator's own group. */
        const own_ = sectionCategory === CUSTOM_SECTION_CATEGORY
        const category = !own_ && presets[i]?.category ? presets[i].category! : sectionCategory
        const label = SECTION_CATEGORIES[category] ?? category
        out.push({
          type,
          presetIndex: i,
          title: name,
          schema,
          category,
          haystack: `${name} ${schema.name} ${label} ${schema.description ?? ""} ${type}`.toLowerCase(),
          keyFor: (w) => previewKey(type, i, w, `${own.has(type) ? sourcesTag : ""}${lookTag}`),
        })
      }
    }
    return out
  }, [addable, schemas, own, sourcesTag, lookTag])

  /**
   * The creator's own sections FIRST, then everything, then the theme's own
   * order. What somebody made themselves is what they come back for.
   */
  const categories = useMemo(() => {
    const counts = new Map<string, number>()
    for (const e of entries) counts.set(e.category, (counts.get(e.category) ?? 0) + 1)
    const themeOrder = SECTION_CATEGORY_ORDER.map((c) => c.id).filter((id) => counts.has(id))
    const rest = [...counts.keys()].filter((id) => !themeOrder.includes(id) && id !== CUSTOM_SECTION_CATEGORY)
    const mine = counts.has(CUSTOM_SECTION_CATEGORY)
      ? [{ key: CUSTOM_SECTION_CATEGORY, label: ownLabel || (SECTION_CATEGORIES[CUSTOM_SECTION_CATEGORY] ?? "Yours"), count: counts.get(CUSTOM_SECTION_CATEGORY) ?? 0 }]
      : []
    return [
      ...mine,
      { key: "all", label: "All", count: entries.length },
      ...[...themeOrder, ...rest].map((id) => ({ key: id, label: SECTION_CATEGORIES[id] ?? id, count: counts.get(id) ?? 0 })),
    ]
  }, [entries, ownLabel])

  /**
   * Typing searches the whole library rather than the category in front of
   * you: somebody looking for "countdown" should not have to know it is
   * filed under Marketing first.
   */
  const needle = query.trim().toLowerCase()
  const searching = needle.length > 0
  const shown = useMemo(() => {
    const words = needle.split(/\s+/).filter(Boolean)
    const set = new Set<LibraryEntry>()
    for (const e of entries) {
      const ok = words.length ? words.every((w) => e.haystack.includes(w)) : !activeCategory || e.category === activeCategory
      if (ok) set.add(e)
    }
    return set
  }, [entries, needle, activeCategory])

  const renderWidth = phone ? PREVIEW_RENDER_WIDTH_MOBILE : PREVIEW_RENDER_WIDTH
  const ratio = phone ? PREVIEW_RATIO_MOBILE : PREVIEW_RATIO

  /* ── The previews, drawn ahead ── */
  /* An imported theme's cards are drawn by its own engine, in frames, and not here. */
  const jobs = useMemo(
    () => (drawCompat ? [] : entries.map((e) => ({ key: e.keyFor(renderWidth), type: e.type, presetIndex: e.presetIndex, schema: e.schema, width: renderWidth, sources, theme: previewTheme }))),
    [entries, renderWidth, sources, previewTheme, drawCompat],
  )
  /* One drawing function per card, the same one each render, so a card draws once. */
  const compatDraws = useMemo(() => {
    if (!drawCompat) return null
    const out = new Map<string, () => string | null>()
    for (const e of entries) out.set(cardKey(e), () => drawCompat(buildPreviewSection(e.type, e.presetIndex, e.schema)))
    return out
  }, [entries, drawCompat])
  /**
   * The cards are built the first time the library is opened, or once the
   * previews have been drawn in idle time, whichever is first. Until then
   * the closed library costs the editor nothing at all.
   */
  const [built, setBuilt] = useState(false)
  useEffect(() => {
    if (open) {
      /* Whatever is still missing, in the order it will be seen. */
      requestPreviews(jobs, true)
      setBuilt(true)
      return
    }
    const t = window.setTimeout(() => {
      requestPreviews(jobs)
      idle(() => setBuilt(true))
    }, WARM_AFTER_MS)
    return () => window.clearTimeout(t)
  }, [open, jobs])

  /**
   * ===========================================================================
   *  THE PREVIEWS GO IN A FEW AT A TIME, AND ONCE IN, THEY STAY IN
   * ===========================================================================
   * A preview is markup, and markup has to be parsed: thirty-eight of them in
   * the one frame the library opens in was 539ms on a computer at a quarter
   * speed, a stall the dialog's own entrance was stuck behind. So the cards
   * are all there at once, at their final size, and their previews are put
   * in four at a time, in the order they are seen. Both shells keep their
   * content while closed (the phone's sheet, and the dialog below), so this
   * happens in idle time long before the library is opened; a library
   * opened sooner than that fills in a frame at a time, behind its entrance.
   *
   * WHICH CARDS HAVE THEIRS IS A SET THAT ONLY GROWS. It was a count, checked
   * against each card's place in the order of the category on screen, and
   * that order changes with every pill: a card near the top of one category
   * could be twentieth in the next, past the count, and hand its preview
   * back until the count caught up. A preview that is in stays in, whatever
   * is chosen after it.
   */
  const [live, setLive] = useState<ReadonlySet<string>>(() => new Set())
  const liveRef = useRef(live)
  /** The order the rest go in: what the current filter shows, top to bottom, then everything else. */
  const order = useMemo(() => {
    const out: string[] = []
    for (const e of entries) if (shown.has(e)) out.push(cardKey(e))
    for (const e of entries) if (!shown.has(e)) out.push(cardKey(e))
    return out
  }, [entries, shown])
  const orderRef = useRef(order)
  useEffect(() => {
    orderRef.current = order
  }, [order])
  useEffect(() => {
    if (!built) return
    let cancelled = false
    let raf = 0
    const step = () => {
      if (cancelled) return
      const next = new Set(liveRef.current)
      let added = 0
      for (const k of orderRef.current) {
        if (next.has(k)) continue
        next.add(k)
        if (++added === FILL_PER_FRAME) break
      }
      if (!added) return
      liveRef.current = next
      setLive(next)
      if (open) raf = requestAnimationFrame(step)
      else idle(step)
    }
    step()
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
    }
  }, [built, open, phone, entries])

  /* ── The column, measured once by the grid ── */
  const [gridWidth, setGridWidth] = useState(0)
  const gridObserver = useRef<ResizeObserver | null>(null)
  const gridRef = useCallback((el: HTMLDivElement | null) => {
    gridObserver.current?.disconnect()
    gridObserver.current = null
    if (!el) return
    /* `clientWidth`, not the box on screen: a closed dialog is drawn scaled
       down a touch, and a preview scaled to that would stop short of its card. */
    setGridWidth(el.clientWidth)
    if (typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(() => setGridWidth(el.clientWidth))
    ro.observe(el)
    gridObserver.current = ro
  }, [])
  useEffect(() => () => gridObserver.current?.disconnect(), [])
  /**
   * ONE CARD PER ROW, AS WIDE AS THE LIST. Two to a row made each preview
   * a thumbnail a phone could not read. The card's 1px border on each side
   * is not the preview's.
   */
  const cardWidth = gridWidth > 0 ? gridWidth - 2 : 0

  /**
   * ===========================================================================
   *  THE TOP OF A CATEGORY IS DRAWN THE MOMENT IT IS SHOWN
   * ===========================================================================
   * Every preview box is `content-visibility: auto`, which is what lets forty
   * cards cost nothing below the fold. But a box the browser has never drawn
   * starts out skipped, and it is only drawn once the browser has worked out
   * that it is on screen, a frame or more later. A category shows cards that
   * have been hidden since they were built, so the first time one was shown
   * its previews came up as empty grey boxes for that long: filmed at a
   * quarter speed, three to seven frames of grey before the picture.
   *
   * So the first few of whatever is showing are drawn outright, whatever the
   * browser thinks of them yet. A switch starts the list at its top, so they
   * are exactly the cards on screen; everything under them keeps its saving.
   *
   * AS MANY AS FILL THE WINDOW. Three were enough while every card was the
   * crop's height; a category of short cards has more than three on screen.
   * So they are counted down the list at the heights they will be drawn at,
   * pictures only, until they would fill the window, which the list is
   * always shorter than, and never fewer than three.
   */
  /*
    Read from HEIGHTS below; this is what says HEIGHTS has something new in
    it. Listened to only while the library is open: closed, the previews
    are measured forty times over, and redrawing the whole library (and its
    sheet) for each was most of what the warm-up cost. Every render reads
    the latest anyway, the one that opens it included.
  */
  const subscribeWhileOpen = useCallback((l: () => void) => (open ? subscribe(l) : () => {}), [open])
  const heightsSeen = useSyncExternalStore(subscribeWhileOpen, () => heightsVersion, () => 0)
  const eager = useMemo(() => {
    const out = new Set<string>()
    const reach = cardWidth > 0 && typeof window !== "undefined" ? window.innerHeight : 0
    let y = 0
    for (const e of entries) {
      if (!shown.has(e)) continue
      if (out.size >= EAGER_CARDS && y >= reach) break
      out.add(cardKey(e))
      y += previewCardHeight(HEIGHTS.get(e.keyFor(renderWidth)), cardWidth, renderWidth, ratio)
    }
    return out
  }, [entries, shown, heightsSeen, cardWidth, renderWidth, ratio])

  /**
   * THE PILLS START AT THE START. The row snaps to its pills, and the browser
   * keeps a snapped row on the pill it was snapped to when pills are added in
   * front of it: the creator's own sections arrive a moment after the editor
   * loads, so the row opened scrolled to All with Created cut off.
   */
  const pillRow = useRef<HTMLDivElement | null>(null)
  useLayoutEffect(() => {
    if (open && pillRow.current) pillRow.current.scrollLeft = 0
  }, [open])

  /* ── A category or a search: the same cards, some hidden, nothing faded ── */
  const scroller = useRef<HTMLDivElement | null>(null)
  const filterKey = `${activeCategory ?? "all"}:${needle}`
  const lastFilter = useRef(filterKey)
  /**
   * THE LIST STARTS AT ITS TOP, IN THE SAME FRAME, AND THAT IS ALL. Before
   * paint, so a category is never drawn at the scroll of the one before it.
   * The list used to ease in from a quarter of its strength on every
   * category as well, which over a column of pictures is a flash; what
   * changed is already plain from the pill that was pressed.
   */
  useLayoutEffect(() => {
    if (lastFilter.current === filterKey) return
    lastFilter.current = filterKey
    if (scroller.current) scroller.current.scrollTop = 0
    /* A new list: a held card that is not in it, or is under the fold of it, takes its own height. */
    releaseHeld(false)
  }, [filterKey])

  /**
   * CLOSE FIRST, ADD ON THE NEXT FRAME. Adding a section mounts a section's
   * worth of DOM in the canvas; doing it in the same tick as the close can
   * keep the browser from ever committing the close's first frame, and a
   * transition whose start is never committed does not run.
   */
  const handleAdd = useCallback((type: string, presetIndex = 0) => {
    hapticTap("light")
    onOpenChange(false)
    requestAnimationFrame(() => onAddSection(type, presetIndex))
  }, [onAddSection, onOpenChange])

  const empty = searching
    ? `Nothing matches “${query.trim()}”`
    : activeCategory === CUSTOM_SECTION_CATEGORY
      ? "Write a section in the code editor and it appears here"
      : "No sections in this category"

  const searchRef = useRef<HTMLInputElement | null>(null)
  const search = (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
      <input
        ref={searchRef}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search sections"
        aria-label="Search sections"
        /* 16px on a phone, or iOS zooms the page and does not zoom back. */
        className="h-10 w-full rounded-lg border border-[#e5e7eb] bg-white pl-9 pr-9 text-[16px] text-[#1a1a2e] placeholder:text-[#9ca3af] focus:border-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-black/5 md:h-9 md:text-sm [&::-webkit-search-cancel-button]:hidden"
      />
      {searching && (
        <button
          type="button"
          onClick={() => setQuery("")}
          aria-label="Clear the search"
          className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#1a1a2e]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )

  const grid = built ? (
    <>
      <div ref={gridRef} data-library-grid="" className="flex flex-col" style={{ rowGap: phone ? 20 : 24 }}>
        {entries.map((e) => {
          const k = cardKey(e)
          return (
            <LibraryCard
              key={k}
              entry={e}
              width={cardWidth}
              renderWidth={renderWidth}
              ratio={ratio}
              hidden={!shown.has(e)}
              live={live.has(k)}
              eager={eager.has(k)}
              phone={phone}
              onAdd={handleAdd}
              compatDraw={compatDraws?.get(k)}
            />
          )
        })}
      </div>
      {shown.size === 0 && (
        <p className="py-16 text-center text-[14px] text-[#6b7280]">{empty}</p>
      )}
    </>
  ) : null

  const chip = (cat: { key: string; label: string; count: number }) => {
    const on = !searching && ((cat.key === "all" && !activeCategory) || activeCategory === cat.key)
    return (
      <button
        key={cat.key}
        type="button"
        onClick={() => {
          setQuery("")
          setActiveCategory(cat.key === "all" ? null : cat.key)
        }}
        /* The selected pill says so in an attribute a stylesheet, a test and a screen reader can all read. */
        data-on={on ? "true" : "false"}
        aria-pressed={on}
        className={cn(
          "wb-chip shrink-0 rounded-full px-4 py-2 text-sm font-medium whitespace-nowrap",
          "transition-[background-color,color] duration-150 ease-out",
          on ? "bg-[#1a1a2e] text-white" : "bg-[#f3f4f6] text-[#4b5563]",
        )}
      >
        {cat.label}
        {cat.key === CUSTOM_SECTION_CATEGORY && <span className={cn("ml-1.5 tabular-nums", on ? "text-white/70" : "text-[#9ca3af]")}>{cat.count}</span>}
      </button>
    )
  }

  // ── A phone: the builder's sheet ──
  if (phone) {
    return (
      <MobileEditorSheet
        open={open}
        onOpenChange={onOpenChange}
        /* A library is a thing you browse: it opens to its full height. */
        openFull
        detents={[0.92]}
        /* Over the sections sheet it was opened from, not under it. */
        layer="raised"
        peekHeight={0}
      >
        <div className="flex min-h-0 flex-1 flex-col" data-section-library="phone">
          <div className="shrink-0 px-4 pb-3 pt-0.5">
            <h2 className="text-[17px] font-semibold tracking-tight text-[#1a1a2e]">Add a section</h2>
          </div>
          <div className="shrink-0 px-4 pb-3">{search}</div>
          <div ref={pillRow} className="wb-chip-row shrink-0 overflow-x-auto px-4 pb-3" role="toolbar" aria-label="Categories">
            <div className="flex w-max gap-2">{categories.map(chip)}</div>
          </div>
          <div className="h-px w-full shrink-0 bg-[#f0f1f3]" />
          <div
            ref={scroller}
            data-sheet-scroll
            data-library-scroll=""
            className="wb-slim-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-10 pt-4 [scrollbar-gutter:stable]"
          >
            {grid}
          </div>
        </div>
      </MobileEditorSheet>
    )
  }

  // ── A computer: a dialog of its own, kept ──
  return (
    <LibraryDialog open={open} onClose={() => onOpenChange(false)} labelledBy="section-library-title" searchRef={searchRef}>
      <div className="flex shrink-0 items-center gap-4 border-b border-[#f0f1f3] px-5 py-3.5">
        <h2 id="section-library-title" className="min-w-0 shrink truncate text-[16px] font-semibold text-[#1a1a2e]">Add a section</h2>
        <div className="ml-auto w-[260px] max-w-full shrink-0">{search}</div>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label="Close"
          className="-mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#6b7280] transition-colors hover:bg-[#f3f4f6] hover:text-[#1a1a2e]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1">
        <nav className="wb-slim-scroll w-[184px] shrink-0 overflow-y-auto border-r border-[#f0f1f3] px-2 py-3" aria-label="Categories">
          {categories.map((cat) => {
            const on = !searching && ((cat.key === "all" && !activeCategory) || activeCategory === cat.key)
            return (
              <button
                key={cat.key}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setQuery("")
                  setActiveCategory(cat.key === "all" ? null : cat.key)
                }}
                className={cn(
                  "flex h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-[14px] transition-colors duration-150",
                  on ? "bg-[#f3f4f6] font-medium text-[#1a1a2e]" : "text-[#4b5563] hover:bg-[#f8f9fa] hover:text-[#1a1a2e]",
                )}
              >
                <span className="truncate">{cat.label}</span>
                {cat.key === CUSTOM_SECTION_CATEGORY && <span className="ml-auto text-[12px] tabular-nums text-[#9ca3af]">{cat.count}</span>}
              </button>
            )
          })}
        </nav>
        {/* The gutter is kept whether the list overflows or not, so a short
            category cannot widen the column and redraw every card a size
            bigger: nothing moves sideways between one pill and the next. */}
        <div
          ref={scroller}
          data-library-scroll=""
          className="wb-slim-scroll min-w-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 [scrollbar-gutter:stable]"
        >
          {searching && (
            <p className="mb-3 text-[12.5px] text-[#6b7280]">
              {shown.size === 1 ? "1 section" : `${shown.size} sections`} matching “{query.trim()}”
            </p>
          )}
          {grid}
        </div>
      </div>
    </LibraryDialog>
  )
})

/**
 * ===========================================================================
 *  THE DIALOG ON A COMPUTER, KEPT RATHER THAN BUILT EACH TIME
 * ===========================================================================
 * The shared dialog builds its content every time it opens and takes it
 * away every time it closes, and on the way in it locks the body, moves the
 * focus and asks the browser for its animation, three things that each make
 * the browser look at the whole editor again. Measured on a computer at a
 * quarter speed, the library's first frame was a 380ms task, and the
 * dialog's own entrance was stuck behind it.
 *
 * This one is built once and kept, like the phone's sheet: closed, it is
 * `visibility: hidden` and `inert`; open, it fades and rises into place by
 * opacity and transform alone, so opening it asks for no layout at all.
 * Escape and a press on the backdrop close it, Tab stays inside it, and the
 * focus goes to the search box and comes back to where it was.
 */
function LibraryDialog({
  open,
  onClose,
  labelledBy,
  searchRef,
  children,
}: {
  open: boolean
  onClose: () => void
  labelledBy: string
  searchRef: React.RefObject<HTMLInputElement | null>
  children: ReactNode
}) {
  const panel = useRef<HTMLDivElement>(null)
  const [portal, setPortal] = useState<HTMLElement | null>(null)
  useEffect(() => setPortal(document.body), [])
  const returnTo = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    returnTo.current = document.activeElement as HTMLElement | null
    /* After the first frame of the entrance, so focusing asks nothing of that frame. */
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => searchRef.current?.focus({ preventScroll: true })))
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== "Tab" || !panel.current) return
      const focusable = Array.from(panel.current.querySelectorAll<HTMLElement>("button:not([hidden]):not([disabled]), input, [tabindex]:not([tabindex='-1'])")).filter((el) => el.offsetParent !== null)
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener("keydown", onKey, true)
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener("keydown", onKey, true)
      const back = returnTo.current
      if (back && document.contains(back)) back.focus({ preventScroll: true })
    }
  }, [open, onClose, searchRef])

  if (!portal) return null
  return createPortal(
    <div
      data-section-library-layer=""
      data-state={open ? "open" : "closed"}
      /* `inert` takes a closed library out of the tab order and the accessibility tree. */
      {...(open ? {} : { inert: "" as unknown as boolean })}
      className="wb-library-layer fixed inset-0 z-[2147483638]"
    >
      <div aria-hidden className="wb-library-scrim absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        data-wb-add-section-modal=""
        data-section-library="desktop"
        className="wb-library-panel absolute left-1/2 top-1/2 flex h-[min(760px,88vh)] w-[min(900px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_24px_64px_-24px_rgba(15,23,42,0.45)]"
      >
        {children}
      </div>
    </div>,
    portal,
  )
}
