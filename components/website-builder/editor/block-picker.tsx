"use client"

/**
 * ===========================================================================
 *  ADD BLOCK, WITH THE BLOCK SHOWN BEFORE IT IS ADDED
 * ===========================================================================
 * The owner: "currently when I want to add block in the sidebar it opens that
 * inline modal bad, it should open a mobile bottom sheet, similar to add
 * section ... where I can see the preview of the blocks I'm adding for that
 * specific section ... and on desktop larger screens, the preview library
 * should be as a modal but with previews ... similar to Shopify."
 *
 * Add block used to open the shared action menu: a column of names. Now:
 *
 *   A COMPUTER  a panel beside the sidebar, its top level with the row it
 *               was opened from: a search and the blocks this level takes on
 *               the left, and on the right the block under the pointer (or
 *               the keys) drawn as it will be in this section. A click or
 *               Enter adds it there. Escape, a press outside, or adding puts
 *               the panel away and the focus back on the row.
 *   A PHONE     the builder's own sheet, over the sections sheet: the same
 *               search and list, the preview over them, a tap picks and the
 *               Add button under the list adds.
 *
 * WHAT THE PREVIEW IS. The section the block is being added to, drawn by the
 * real renderer with this site's theme, the section's own settings (its
 * colour scheme, its layout) and its own blocks, with the new block put in
 * at the place it will land, filled in the way Add block fills it (its
 * defaults, then its preset). Everything but the block is then left out of
 * sight, and the window is cut around the block: so what is shown is the
 * block at the width it will have, on the section's own background, in the
 * section's type and colours. It is laid out at the canvas's own width,
 * with the canvas's own theme variables, so it is the block the canvas will
 * draw a moment later (scripts/check-block-picker.mjs compares the two).
 *
 * WHAT MAKES IT INSTANT. A preview is markup. Each block is drawn once per
 * opening, off screen, and kept; the first is drawn in the press that opens
 * the picker, the one under the pointer in the move that reaches it, and the
 * rest in idle moments after the panel is up, so moving down the list only
 * puts kept markup into one box. Nothing is fetched.
 *
 * AN IMPORTED THEME's sections are drawn by the compat engine, not by
 * Storelib's renderer: its preview is one frame holding the theme's head,
 * with the section put into its <main> for each block, the way Add section
 * draws that theme's cards (compat/compat-section-preview.tsx).
 */
import { createContext, memo, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { createPortal, flushSync } from "react-dom"
import { createRoot, type Root } from "react-dom/client"
import { Search, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { hapticTap } from "@/lib/native-bridge"
import { MobileEditorSheet } from "@/components/website-builder/mobile-editor-sheet"
import SectionRenderer from "@/components/website-builder/sections/SectionRenderer"
import { StorelibLiveProvider } from "@/components/website-builder/sections/storelib-live"
import { CompatPreviewProvider, sectionMarkup, sheetDocument, useCompatPreview } from "@/components/website-builder/compat/compat-section-preview"
import type { StoredSection } from "@/lib/storelib-theme/compat/page"
import { splitStyles } from "@/lib/website-builder/preview-markup"
import { REVEAL_EVENT } from "@/lib/website-builder/canvas-scroll"
import { THEME_ROOT_ATTRIBUTE } from "@/lib/website-builder/theme-css"
import { PREVIEW_BLOCK_ID, cropFor, matchChoices, placePicker, previewBlock, sectionWith } from "@/lib/website-builder/block-picker"
import type { BlockSchema, SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"
import { tt } from "@/lib/i18n/text"
import type { BlockChoice } from "./add-block-button"

/* ── What the page hands the picker, once ──────────────────────────────── */

interface PickerEnv {
  /** The site's theme settings, as the canvas draws with them. */
  theme?: ThemeSettingsValues
  /** Every .storelib file this install has saved. */
  sources: Record<string, string>
  /** Set for a theme imported from Shopify: its sections are drawn by the compat engine. */
  compatInstallId?: string | null
}

/** One Add block press: where, what may go there, and what adding does. */
export interface BlockPickerRequest {
  /** The row that was pressed: the panel sits level with it and the focus comes back to it. */
  anchor: HTMLElement
  options: readonly BlockSchema[]
  choices: readonly BlockChoice[]
  section: SectionInstance
  /** The level inside the section (block ids), [] for the section's own. */
  parent: readonly string[]
  /** Where among that level's blocks; last when absent. */
  index?: number
  /** Why a choice cannot be added here (a limit reached), or null. */
  reasonFor?: (choice: BlockChoice) => string | null
  onAdd: (choice: BlockChoice) => void
}

const PickerContext = createContext<((request: BlockPickerRequest) => void) | null>(null)

/** Opens the picker; null outside the editor's sidebar, where Add block keeps its menu. */
export function useBlockPicker(): ((request: BlockPickerRequest) => void) | null {
  return useContext(PickerContext)
}

/* ── Drawing a preview ─────────────────────────────────────────────────── */

let host: HTMLDivElement | null = null
let drawRoot: Root | null = null

/** Reads its own markup the moment its children have committed. */
function Capture({ onCapture, children }: { onCapture: (html: string) => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    onCapture(ref.current?.innerHTML ?? "")
  })
  return <div ref={ref}>{children}</div>
}

/**
 * The section, drawn by Storelib's renderer into a root that is not in the
 * document, and read back as markup. Called from an event or an idle moment,
 * never from inside a render: flushSync is ignored there.
 */
function drawStorelib(section: SectionInstance, theme: ThemeSettingsValues, sources: Record<string, string>, deviceMode: "desktop" | "mobile"): string {
  if (typeof document === "undefined") return ""
  if (!host) {
    host = document.createElement("div")
    drawRoot = createRoot(host)
  }
  let html = ""
  try {
    flushSync(() => {
      drawRoot!.render(
        <StorelibLiveProvider sources={sources} inEditor>
          <Capture onCapture={(h) => { html = h }}>
            <SectionRenderer section={section} theme={theme} isEditing={false} isSelected={false} insideEditor deviceMode={deviceMode} />
          </Capture>
        </StorelibLiveProvider>,
      )
    })
  } catch {
    html = ""
  }
  return html
}

/* The styles taken out of the drawn markup, each once, in a sheet of the picker's own. */
const cssSeen = new Set<string>()
function addStyles(css: string[]) {
  const fresh = css.filter((c) => !cssSeen.has(c))
  if (!fresh.length || typeof document === "undefined") return
  for (const c of fresh) cssSeen.add(c)
  const sheet = document.createElement("style")
  sheet.setAttribute("data-block-picker-styles", "")
  sheet.textContent = fresh.join("\n")
  document.head.appendChild(sheet)
}

/**
 * EVERYTHING BUT THE BLOCK, OUT OF SIGHT, AND STILL IN ITS PLACE. The other
 * blocks keep their room, so the block is laid out exactly where it lands;
 * they are simply not painted. What a script would reveal on scroll is
 * shown, since a preview runs no script.
 */
const STAGE_RULES = `
[data-bp-stage][data-bp-isolate] *:not([data-bp-target]):not([data-bp-target] *){visibility:hidden}
[data-bp-stage] [data-bp-target]{visibility:visible}
[data-bp-stage] :is([data-reveal],[data-animate],[data-aos],.reveal,.fade-in,.fade-up,.scroll-trigger,.animate-on-scroll,[class*="reveal"],[class*="animate--"]){opacity:1!important;transform:none!important;clip-path:none!important}
[data-bp-stage] *,[data-bp-stage] *::before,[data-bp-stage] *::after{animation:none!important;transition:none!important}
`
let stageStyled = false
function styleStage() {
  if (stageStyled || typeof document === "undefined") return
  stageStyled = true
  const sheet = document.createElement("style")
  sheet.setAttribute("data-block-picker-stage", "")
  sheet.textContent = STAGE_RULES
  document.head.appendChild(sheet)
}

/** How the canvas draws this section: its width, and the theme variables its page carries. */
interface StageLook {
  width: number
  deviceMode: "desktop" | "mobile"
  /** The custom properties and type the canvas's page root hands every section, as an inline style. */
  inherited: string
}

const INHERITED = ["font-family", "font-size", "line-height", "letter-spacing", "color", "-webkit-font-smoothing"]

/**
 * Measured once per opening, from the canvas itself, so the preview and the
 * canvas agree on the numbers: the section's width, the theme root's own
 * style (its variables, which the theme's stylesheet in the canvas reads
 * under [data-storelib-theme]), and every variable the boxes between that
 * root and the section add.
 */
function readStageLook(sectionId: string): StageLook {
  const box = document.getElementById(`wb-section-${sectionId}`) ?? document.querySelector<HTMLElement>("#wb-preview-root [data-section-box]")
  const width = Math.round(box?.getBoundingClientRect().width || 0) || 1000
  const holder = box?.parentElement
  const root = box?.closest<HTMLElement>(`[${THEME_ROOT_ATTRIBUTE}]`)
  let inherited = root?.style.cssText ?? ""
  if (holder) {
    const cs = getComputedStyle(holder)
    const parts: string[] = inherited ? [inherited.replace(/;\s*$/, "")] : []
    for (let i = 0; i < cs.length; i++) {
      const name = cs[i]
      if (name.startsWith("--")) parts.push(`${name}:${cs.getPropertyValue(name)}`)
    }
    for (const name of INHERITED) {
      const v = cs.getPropertyValue(name)
      if (v) parts.push(`${name}:${v}`)
    }
    inherited = parts.join(";")
  }
  return { width, deviceMode: width < 600 ? "mobile" : "desktop", inherited }
}

/** A choice's own name in the kept markup. */
const choiceKey = (c: BlockChoice) => `${c.type}\u0000${c.preset?.name ?? ""}`

/**
 * ONE OPENING'S PREVIEWS. Built when the picker opens, for that section at
 * that place, and dropped when it closes: a section edited between two
 * openings is drawn fresh the next time.
 */
class PreviewSession {
  readonly markup = new Map<string, string>()
  constructor(
    readonly request: BlockPickerRequest,
    readonly env: PickerEnv,
    readonly look: StageLook,
  ) {}

  sectionFor(choice: BlockChoice): SectionInstance {
    const def = this.request.options.find((o) => o.type === choice.type)
    return sectionWith(this.request.section, this.request.parent, this.request.index, previewBlock(choice, def))
  }

  /** Storelib's own: drawn now if it is not yet. Returns the markup. */
  ensure(choice: BlockChoice | undefined): string | undefined {
    if (!choice || this.env.compatInstallId) return undefined
    const key = choiceKey(choice)
    const kept = this.markup.get(key)
    if (kept !== undefined) return kept
    const drawn = drawStorelib(this.sectionFor(choice), { ...(this.env.theme ?? {}) }, this.env.sources, this.look.deviceMode)
    const split = splitStyles(drawn)
    addStyles(split.css)
    this.markup.set(key, split.html)
    return split.html
  }
}

const idle = (cb: () => void): (() => void) => {
  const w = window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void }
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(cb, { timeout: 300 })
    return () => w.cancelIdleCallback?.(id)
  }
  const id = window.setTimeout(cb, 32)
  return () => window.clearTimeout(id)
}

/* ── Fitting the drawn section to the block ────────────────────────────── */

/** The block's box inside the drawn section: its own, or its children's for a box with none (`display: contents`). */
function boxOf(el: Element): DOMRect | null {
  const r = el.getBoundingClientRect()
  if (r.width > 0 || r.height > 0) return r
  let top = Infinity, left = Infinity, right = -Infinity, bottom = -Infinity
  for (const child of Array.from(el.children)) {
    const c = boxOf(child)
    if (!c) continue
    top = Math.min(top, c.top); left = Math.min(left, c.left); right = Math.max(right, c.right); bottom = Math.max(bottom, c.bottom)
  }
  return Number.isFinite(top) ? new DOMRect(left, top, right - left, bottom - top) : null
}

const PAINTED = "img, svg, video, picture, canvas, iframe, input, button, select, textarea, hr"
const CLEAR = /rgba\(0, 0, 0, 0\)|transparent/

/**
 * WHAT OF THE BLOCK CAN BE SEEN: its words, its pictures and every box it
 * paints, together. A Button block's own box is the width of the section,
 * with a button at one end of it; fitted by that box, the button was a
 * speck at the edge of the preview. Fitted by what is painted, it is shown
 * at its own size, in the middle. Null when it paints nothing (a spacer).
 */
function paintedBox(target: Element): DOMRect | null {
  const doc = target.ownerDocument
  const view = doc.defaultView ?? window
  let top = Infinity, left = Infinity, right = -Infinity, bottom = -Infinity
  const take = (r: DOMRect | DOMRectReadOnly) => {
    if (r.width <= 0 && r.height <= 0) return
    top = Math.min(top, r.top); left = Math.min(left, r.left); right = Math.max(right, r.right); bottom = Math.max(bottom, r.bottom)
  }
  const walker = doc.createTreeWalker(target, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT)
  const range = doc.createRange()
  for (let n: Node | null = walker.currentNode; n; n = walker.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) {
      if (!(n.textContent ?? "").trim()) continue
      range.selectNodeContents(n)
      take(range.getBoundingClientRect())
      continue
    }
    const el = n as Element
    if (el.matches(PAINTED)) { take(el.getBoundingClientRect()); continue }
    const cs = view.getComputedStyle(el)
    if (cs.display === "none") continue
    const painted = (cs.backgroundColor && !CLEAR.test(cs.backgroundColor)) || (cs.backgroundImage && cs.backgroundImage !== "none") || parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderBottomWidth) > 0 || parseFloat(cs.borderLeftWidth) > 0 || (cs.boxShadow && cs.boxShadow !== "none")
    if (painted) take(el.getBoundingClientRect())
  }
  range.detach?.()
  return Number.isFinite(top) ? new DOMRect(left, top, right - left, bottom - top) : null
}

/** What is painted behind the block: the nearest box under it with a colour or a picture, which is hidden with the rest. */
function backdropOf(target: Element, stop: Element): string {
  let at: Element | null = target.parentElement
  while (at && at !== stop) {
    const cs = getComputedStyle(at)
    const image = cs.backgroundImage && cs.backgroundImage !== "none" ? cs.backgroundImage : ""
    const color = cs.backgroundColor && !/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor) ? cs.backgroundColor : ""
    if (image || color) return [image, color].filter(Boolean).join(", ")
    at = at.parentElement
  }
  return ""
}

/** Whether a block draws nothing to see by itself (a spacer): its room is outlined so the pick still shows something. */
function drawsNothing(el: Element): boolean {
  if ((el.textContent ?? "").trim()) return false
  return !el.querySelector("img, svg, video, picture, canvas, iframe, input, button, hr")
}

const PANE_INSET = 24

/**
 * Lay the drawn section out in `stage` (inside `pane`), find the block, and
 * cut the window around it. Direct DOM work, in a layout effect, so the
 * preview that is painted is the one asked for in the same frame.
 */
function fitStage(pane: HTMLElement, stage: HTMLElement, outline: HTMLElement, doc: Document, width: number, fallbackBg: string): { found: boolean } {
  const target = doc.querySelector(`[data-block-id="${PREVIEW_BLOCK_ID}"]`)
  if (target) {
    target.setAttribute("data-bp-target", "")
    stage.setAttribute("data-bp-isolate", "")
  } else {
    stage.removeAttribute("data-bp-isolate")
  }
  stage.style.transform = "none"
  const s = stage.getBoundingClientRect()
  const stageH = stage.offsetHeight || s.height
  const r = target ? boxOf(target) : null
  const seen = target && r ? paintedBox(target) : null
  const pw = Math.max(1, pane.clientWidth - PANE_INSET * 2)
  const ph = Math.max(1, pane.clientHeight - PANE_INSET * 2)
  const offset = stage.tagName === "IFRAME" ? { x: 0, y: 0 } : { x: s.left, y: s.top }
  const block = r
    ? { x: r.left - offset.x, y: r.top - offset.y, w: r.width, h: r.height }
    : { x: 0, y: 0, w: width, h: Math.min(stageH, (width * ph) / pw) }
  const shown = seen ? { x: seen.left - offset.x, y: seen.top - offset.y, w: seen.width, h: seen.height } : block
  const fit = cropFor(shown, { w: width, h: stageH }, { w: pw, h: ph }, r ? 24 : 0)
  stage.style.transform = `translate(${fit.x + PANE_INSET}px, ${fit.y + PANE_INSET}px) scale(${fit.scale})`
  pane.style.background = (target && backdropOf(target, doc === document ? stage : doc.body)) || fallbackBg
  if (r && target && !seen && drawsNothing(target)) {
    outline.hidden = false
    outline.style.left = `${fit.x + PANE_INSET + block.x * fit.scale}px`
    outline.style.top = `${fit.y + PANE_INSET + block.y * fit.scale}px`
    outline.style.width = `${Math.max(2, block.w * fit.scale)}px`
    outline.style.height = `${Math.max(2, block.h * fit.scale)}px`
  } else {
    outline.hidden = true
  }
  return { found: !!target }
}

/* ── The preview pane ──────────────────────────────────────────────────── */

const PreviewPane = memo(function PreviewPane({ session, choice, className }: { session: PreviewSession; choice: BlockChoice | undefined; className?: string }) {
  const compat = !!session.env.compatInstallId
  return compat ? (
    <CompatPane session={session} choice={choice} className={className} />
  ) : (
    <StorelibPane session={session} choice={choice} className={className} />
  )
})

function PaneShell({ paneRef, outlineRef, className, children, choice, note }: { paneRef: React.RefObject<HTMLDivElement | null>; outlineRef: React.RefObject<HTMLDivElement | null>; className?: string; children: ReactNode; choice: BlockChoice | undefined; note?: string | null }) {
  return (
    <div className={cn("relative min-h-0 overflow-hidden rounded-xl border border-[#e5e7eb]/60", className)} data-block-preview="" data-showing={choice ? choiceKey(choice).replace("\u0000", ":") : undefined}>
      <div ref={paneRef} aria-hidden className="absolute inset-0 overflow-hidden bg-white">
        {children}
        <div ref={outlineRef} hidden className="pointer-events-none absolute rounded-[3px] border border-dashed border-[#9ca3af]" />
      </div>
      {note ? <p className="absolute inset-x-0 bottom-0 bg-white/90 px-3 py-1.5 text-[12px] text-[#6b7280]" data-preview-note="">{note}</p> : null}
    </div>
  )
}

function StorelibPane({ session, choice, className }: { session: PreviewSession; choice: BlockChoice | undefined; className?: string }) {
  const paneRef = useRef<HTMLDivElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const outlineRef = useRef<HTMLDivElement | null>(null)
  const [missing, setMissing] = useState(false)
  const shown = useRef<string | null>(null)
  const fallbackBg = String(session.env.theme?.background_color ?? "#ffffff")
  const apply = useCallback(() => {
    const pane = paneRef.current
    const stage = stageRef.current
    const outline = outlineRef.current
    if (!pane || !stage || !outline || !choice) return
    const html = session.markup.get(choiceKey(choice))
    if (html === undefined) return false
    const key = choiceKey(choice)
    /* A new opening is a new section at a new place: its own markup and its own look, even for a block of the same kind. */
    const showing = `${sessionKey(session)}:${key}`
    if (shown.current !== showing) {
      if (!shown.current?.startsWith(`${sessionKey(session)}:`)) {
        /* The theme root's own style, then the stage's place: the theme's rules paint the root's background, which here is the pane's to paint. */
        stage.style.cssText = `${session.look.inherited};position:absolute;left:0;top:0;width:${session.look.width}px;min-width:0;max-width:none;height:auto;min-height:0;margin:0;padding:0;background:transparent;border:0;box-shadow:none;transform-origin:0 0;container-type:inline-size`
      }
      stage.innerHTML = html
      shown.current = showing
    }
    const { found } = fitStage(pane, stage, outline, document, session.look.width, fallbackBg)
    stage.setAttribute("data-bp-showing", key.replace("\u0000", ":"))
    setMissing(!found && !!html)
    return true
  }, [session, choice, fallbackBg])
  useLayoutEffect(() => {
    styleStage()
    if (apply() === false) {
      /* Not drawn yet (the list moved under a still pointer): drawn in the next moment, outside this commit. */
      const id = window.setTimeout(() => {
        session.ensure(choice)
        apply()
      }, 0)
      return () => window.clearTimeout(id)
    }
  }, [apply, session, choice])
  /* A pane that changes size (the window, the sheet) cuts its window again. */
  useEffect(() => {
    const pane = paneRef.current
    if (!pane || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(() => apply())
    ro.observe(pane)
    return () => ro.disconnect()
  }, [apply])
  return (
    <PaneShell paneRef={paneRef} outlineRef={outlineRef} className={className} choice={choice} note={missing ? tt("Shown in its section") : null}>
      <div
        ref={stageRef}
        data-bp-stage=""
        {...{ [THEME_ROOT_ATTRIBUTE]: "" }}
        data-keep-transform=""
        className="pointer-events-none select-none"
      />
    </PaneShell>
  )
}

/**
 * AN IMPORTED THEME'S PREVIEW: one frame with the theme's head, kept for the
 * opening; each block's section is put into its <main> and the frame is
 * fitted like Storelib's stage. A theme whose template prints no
 * `block.shopify_attributes` has no block to find: the section is shown
 * whole, and says so.
 */
function CompatPane({ session, choice, className }: { session: PreviewSession; choice: BlockChoice | undefined; className?: string }) {
  const ctx = useCompatPreview()
  const paneRef = useRef<HTMLDivElement | null>(null)
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const outlineRef = useRef<HTMLDivElement | null>(null)
  const [loadedDoc, setLoadedDoc] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const width = session.look.width
  const doc = useMemo(() => {
    if (!ctx?.theme) return null
    const { html, main } = sheetDocument(ctx.theme, ctx.page, ctx.rows, width, 800)
    const rules = `<style data-block-picker-stage>html,body{height:auto!important}${STAGE_RULES.replace(/\[data-bp-stage\]/g, "body")}</style>`
    const withRules = html.replace(/<\/head>/i, () => `${rules}</head>`)
    return withRules.replace(/<\/body>/i, () => `${main || "<main>"}</main></body>`)
  }, [ctx?.theme, ctx?.page, ctx?.rows, width])
  const loaded = !!doc && loadedDoc === doc
  useLayoutEffect(() => {
    const frame = frameRef.current
    const pane = paneRef.current
    const outline = outlineRef.current
    const fd = frame?.contentDocument
    if (!ctx?.theme || !frame || !pane || !outline || !fd || !loaded || !choice) return
    const key = choiceKey(choice)
    let html = session.markup.get(key)
    if (html === undefined) {
      try {
        html = sectionMarkup(ctx.theme, ctx.page, session.sectionFor(choice) as unknown as StoredSection, ctx.rows, width, 800)
      } catch {
        html = ""
      }
      session.markup.set(key, html)
    }
    const main = fd.querySelector("main") ?? fd.body
    main.innerHTML = html
    frame.style.height = `${Math.max(1, fd.documentElement.scrollHeight)}px`
    const body = fd.body
    if (fd.querySelector(`[data-block-id="${PREVIEW_BLOCK_ID}"]`)) body.setAttribute("data-bp-isolate", "")
    else body.removeAttribute("data-bp-isolate")
    const { found } = fitStage(pane, frame, outline, fd, width, "#ffffff")
    frame.setAttribute("data-bp-showing", key.replace("\u0000", ":"))
    setNote(!html ? tt("No preview for this block") : found ? null : tt("Shown in its section"))
  }, [ctx?.theme, ctx?.page, ctx?.rows, loaded, choice, session, width])
  return (
    <PaneShell paneRef={paneRef} outlineRef={outlineRef} className={className} choice={choice} note={ctx?.failed ? tt("No preview for this block") : note}>
      {doc ? (
        <iframe
          ref={frameRef}
          title={tt("Block preview")}
          srcDoc={doc}
          sandbox="allow-same-origin"
          tabIndex={-1}
          aria-hidden
          data-bp-frame=""
          data-keep-transform=""
          onLoad={() => setLoadedDoc(doc)}
          className="pointer-events-none absolute left-0 top-0 origin-top-left border-0 bg-transparent"
          style={{ width, height: 0 }}
        />
      ) : (
        <span aria-hidden className="wb-preview-shimmer absolute inset-0" />
      )}
    </PaneShell>
  )
}

/* ── The picker ────────────────────────────────────────────────────────── */

const PHONE_SHEET = "[data-mobile-bottom-sheet]"

/** After adding: the new block, once the canvas has drawn it, brought on screen if it is not. */
function revealNewBlock(sectionId: string, before: Set<string>) {
  let frames = 0
  const look = () => {
    const box = document.getElementById(`wb-section-${sectionId}`)
    const scroller = document.getElementById("wb-preview-root")
    const fresh = box ? Array.from(box.querySelectorAll<HTMLElement>("[data-block-id]")).find((el) => !before.has(el.getAttribute("data-block-id") ?? "")) : null
    if (fresh && scroller) {
      const s = scroller.getBoundingClientRect()
      /* On a phone the sections sheet covers the foot of the canvas: what can be seen ends at its top. */
      const sheet = Array.from(document.querySelectorAll<HTMLElement>(PHONE_SHEET)).find((x) => x.querySelector("[data-wb-sidebar-scroll]"))
      const sheetTop = sheet ? sheet.getBoundingClientRect().top : Infinity
      const bottom = Math.min(s.bottom, sheetTop)
      const r = fresh.getBoundingClientRect()
      if (r.top < s.top + 8 || r.bottom > bottom - 8) {
        const room = Math.max(0, bottom - s.top)
        const top = Math.max(0, scroller.scrollTop + r.top - s.top - Math.max(16, (room - r.height) / 2))
        scroller.scrollTo({ top, behavior: "smooth" })
      }
      return
    }
    if (++frames < 40) requestAnimationFrame(look)
    /* An imported theme's canvas is a frame: it is asked to bring the section on screen itself. */
    else window.dispatchEvent(new CustomEvent(REVEAL_EVENT, { detail: { id: sectionId } }))
  }
  requestAnimationFrame(look)
}

export function BlockPickerProvider({ theme, sources, compatInstallId = null, children }: PickerEnv & { children: ReactNode }) {
  const envRef = useRef<PickerEnv>({ theme, sources, compatInstallId })
  envRef.current = { theme, sources, compatInstallId }
  const [session, setSession] = useState<PreviewSession | null>(null)
  const [open, setOpen] = useState(false)
  const [phone, setPhone] = useState(false)
  /* The compat engine's theme is built the first time the picker opens in an imported theme, and kept. */
  const [compatWanted, setCompatWanted] = useState(false)
  const everOpened = useRef(false)

  const openPicker = useCallback((request: BlockPickerRequest) => {
    const env = envRef.current
    const look = readStageLook(request.section.id)
    const s = new PreviewSession(request, env, look)
    /* The first block is drawn in the press itself, so the panel's first frame has its preview. */
    const first = request.choices.find((c) => !request.reasonFor?.(c)) ?? request.choices[0]
    s.ensure(first)
    setPhone(!!request.anchor.closest(PHONE_SHEET))
    if (env.compatInstallId) setCompatWanted(true)
    setSession(s)
    /* The very first time the panel and the sheet are built closed and opened on the next frame, so they move in like every later opening. */
    if (!everOpened.current) {
      everOpened.current = true
      requestAnimationFrame(() => setOpen(true))
    } else setOpen(true)
  }, [])

  const close = useCallback(() => setOpen(false), [])

  const picker = session ? (
    <PickerBody session={session} open={open} phone={phone} onClose={close} />
  ) : null

  return (
    <PickerContext.Provider value={openPicker}>
      {children}
      {compatInstallId && compatWanted ? (
        <CompatPreviewProvider installId={compatInstallId} sources={sources} settings={theme as Record<string, unknown> | undefined}>
          {picker}
        </CompatPreviewProvider>
      ) : (
        picker
      )}
    </PickerContext.Provider>
  )
}

const sessionIds = new WeakMap<PreviewSession, number>()
let sessionCount = 0
function sessionKey(s: PreviewSession): number {
  let id = sessionIds.get(s)
  if (id === undefined) sessionIds.set(s, (id = ++sessionCount))
  return id
}

function PickerBody({ session, open, phone, onClose }: { session: PreviewSession; open: boolean; phone: boolean; onClose: () => void }) {
  const { request } = session
  const [query, setQuery] = useState("")
  const shown = useMemo(() => matchChoices(request.choices, query), [request.choices, query])
  const reasons = useMemo(() => new Map(request.choices.map((c) => [choiceKey(c), request.reasonFor?.(c) ?? null])), [request])
  const firstOpen = useMemo(() => {
    const i = shown.findIndex((c) => !reasons.get(choiceKey(c)))
    return i < 0 ? 0 : i
  }, [shown, reasons])
  const [activeKey, setActiveKey] = useState<string | null>(() => (shown[firstOpen] ? choiceKey(shown[firstOpen]) : null))
  /* A new opening starts with nothing typed, on the first block that can be added, from its first frame. */
  const [seen, setSeen] = useState(session)
  if (seen !== session) {
    setSeen(session)
    setQuery("")
    const first = request.choices.find((c) => !request.reasonFor?.(c)) ?? request.choices[0]
    setActiveKey(first ? choiceKey(first) : null)
  }
  const active = shown.find((c) => choiceKey(c) === activeKey) ?? shown[firstOpen]
  const activeIndex = active ? shown.indexOf(active) : -1

  /* Drawn before it is asked for: the block under the pointer is drawn in the move that reaches it (show), the rest here. */
  useEffect(() => {
    if (!open) return
    let cancel = () => {}
    let i = 0
    const next = () => {
      while (i < request.choices.length && session.markup.has(choiceKey(request.choices[i]))) i++
      if (i >= request.choices.length || session.env.compatInstallId) return
      session.ensure(request.choices[i++])
      cancel = idle(next)
    }
    /* After the panel's entrance, so drawing ahead never takes its frames. */
    const t = window.setTimeout(() => { cancel = idle(next) }, 220)
    return () => {
      window.clearTimeout(t)
      cancel()
    }
  }, [open, session, request.choices])

  /* Committed in the event itself: a pointer move is otherwise rendered in a later task, a frame or two after the pointer got there. */
  const show = useCallback((c: BlockChoice | undefined) => {
    if (!c) return
    session.ensure(c)
    flushSync(() => setActiveKey(choiceKey(c)))
  }, [session])

  const add = useCallback((c: BlockChoice | undefined) => {
    if (!c || reasons.get(choiceKey(c))) return
    hapticTap("light")
    const box = document.getElementById(`wb-section-${request.section.id}`)
    const before = new Set(Array.from(box?.querySelectorAll("[data-block-id]") ?? []).map((el) => el.getAttribute("data-block-id") ?? ""))
    onClose()
    /* Close first, add on the next frame: the close is already with the compositor while the canvas draws the block. */
    requestAnimationFrame(() => {
      request.onAdd(c)
      revealNewBlock(request.section.id, before)
    })
  }, [reasons, request, onClose])

  const listRef = useRef<HTMLDivElement | null>(null)
  /* The row the keys are on stays in sight, in the list's own scroller only. */
  useLayoutEffect(() => {
    const list = listRef.current
    const row = list?.querySelector<HTMLElement>(`[data-active="true"]`)
    if (!list || !row) return
    const top = row.offsetTop
    if (top < list.scrollTop) list.scrollTop = top - 4
    else if (top + row.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = top + row.offsetHeight - list.clientHeight + 4
  }, [activeIndex])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault()
      if (!shown.length) return
      const step = e.key === "ArrowDown" ? 1 : -1
      show(shown[(Math.max(0, activeIndex) + step + shown.length) % shown.length])
    } else if (e.key === "Home" && shown.length && !query) {
      e.preventDefault()
      show(shown[0])
    } else if (e.key === "End" && shown.length && !query) {
      e.preventDefault()
      show(shown[shown.length - 1])
    } else if (e.key === "Enter") {
      e.preventDefault()
      add(active)
    }
  }

  const onQuery = (value: string) => {
    setQuery(value)
    const next = matchChoices(request.choices, value)
    if (!next.some((c) => choiceKey(c) === activeKey)) show(next.find((c) => !reasons.get(choiceKey(c))) ?? next[0])
  }

  const listId = `block-picker-list-${sessionKey(session)}`
  const searchRef = useRef<HTMLInputElement | null>(null)
  const search = (
    <div className="relative">
      <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
      <input
        ref={searchRef}
        type="search"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={tt("Search blocks")}
        aria-label={tt("Search blocks")}
        role="combobox"
        aria-expanded="true"
        aria-controls={listId}
        aria-activedescendant={active ? `${listId}-${activeIndex}` : undefined}
        autoComplete="off"
        data-block-picker-search=""
        /* 16px on a phone, or iOS zooms the page in and leaves it there. */
        className="h-10 w-full rounded-lg border border-[#e5e7eb] bg-white pl-9 pr-9 text-[16px] text-[#1a1a2e] placeholder:text-[#9ca3af] focus:border-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-black/5 sm:h-9 sm:text-[14px] [&::-webkit-search-cancel-button]:hidden"
      />
      {query ? (
        <button
          type="button"
          onClick={() => { onQuery(""); searchRef.current?.focus() }}
          aria-label={tt("Clear the search")}
          className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#1a1a2e]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  )

  const list = (
    <div ref={listRef} id={listId} role="listbox" aria-label={tt("Blocks")} data-block-picker-list="" className="wb-slim-scroll relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-1.5">
      {shown.map((c, i) => {
        const reason = reasons.get(choiceKey(c))
        const on = i === activeIndex
        return (
          <div
            key={choiceKey(c)}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={on}
            aria-disabled={reason ? true : undefined}
            data-active={on ? "true" : "false"}
            data-block-choice={c.type}
            data-preset={c.preset?.name ?? ""}
            /* The pointer previews; a press adds (on a phone a tap picks and Add adds). */
            onPointerMove={phone ? undefined : () => { if (!on) show(c) }}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => (phone ? show(c) : add(c))}
            className={cn(
              "flex min-h-9 cursor-pointer select-none flex-col justify-center rounded-lg px-3 py-1.5 text-left [-webkit-tap-highlight-color:transparent] max-sm:min-h-12",
              on ? "bg-[#f3f4f6]" : "",
              reason ? "cursor-default" : "",
            )}
          >
            <span className={cn("truncate text-[14px] leading-snug max-sm:text-[15px]", reason ? "text-[#9ca3af]" : "text-[#1a1a2e]", on && !reason && "font-medium")}>{c.label}</span>
            {reason ? <span className="truncate text-[12px] leading-snug text-[#9ca3af]">{reason}</span> : null}
          </div>
        )
      })}
      {shown.length === 0 ? <p className="px-3 py-8 text-center text-[13px] text-[#6b7280]">{tt("Nothing matches “{value}”", { value: query.trim() })}</p> : null}
    </div>
  )

  const preview = <PreviewPane session={session} choice={active} className={phone ? "mx-4 h-[min(34vh,280px)] shrink-0 bg-[#f8f9fa]" : "h-full bg-[#f8f9fa]"} />
  const activeReason = active ? reasons.get(choiceKey(active)) : null

  if (phone) {
    return (
      <MobileEditorSheet open={open} onOpenChange={(o) => { if (!o) onClose() }} openFull detents={[0.9]} layer="raised" peekHeight={0} label={tt("Add block")}>
        <div className="flex min-h-0 flex-1 flex-col" data-block-picker="phone" data-picker-open={open ? "" : undefined}>
          <div className="flex shrink-0 items-center px-4 pb-3 pt-0.5">
            <h2 className="min-w-0 flex-1 truncate text-[17px] font-semibold tracking-tight text-[#1a1a2e]">{tt("Add block")}</h2>
          </div>
          {preview}
          <div className="shrink-0 px-4 pb-2 pt-3">{search}</div>
          <div data-sheet-scroll className="flex min-h-0 flex-1 flex-col">{list}</div>
          <div className="shrink-0 border-t border-[#f0f1f3] px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3">
            <button
              type="button"
              disabled={!active || !!activeReason}
              onClick={() => add(active)}
              data-block-picker-add=""
              className="flex h-12 w-full items-center justify-center rounded-xl bg-[#1a1a2e] px-4 text-[15px] font-semibold text-white transition-opacity active:opacity-85 disabled:bg-[#e5e7eb] disabled:text-[#9ca3af]"
            >
              <span className="truncate">{activeReason ?? (active ? tt("Add {value}", { value: active.label }) : tt("Add block"))}</span>
            </button>
          </div>
        </div>
      </MobileEditorSheet>
    )
  }

  return (
    <DesktopPanel open={open} anchor={request.anchor} onClose={onClose} searchRef={searchRef}>
      <div className="flex w-[260px] shrink-0 flex-col border-r border-[#f0f1f3]">
        <div className="shrink-0 px-3 pb-2 pt-3">{search}</div>
        {list}
      </div>
      <div className="min-w-0 flex-1 p-3">{preview}</div>
    </DesktopPanel>
  )
}

/**
 * THE PANEL ON A COMPUTER. Beside the sidebar, level with the row, over
 * nothing: the editor stays in sight and a press anywhere outside puts it
 * away, as a menu does. Where the window has no room beside the sidebar, it
 * sits in the middle over a dimmed editor. It moves by opacity and a few
 * pixels of transform only, so opening it lays out nothing but itself.
 */
function DesktopPanel({ open, anchor, onClose, searchRef, children }: { open: boolean; anchor: HTMLElement; onClose: () => void; searchRef: React.RefObject<HTMLInputElement | null>; children: ReactNode }) {
  const [portal, setPortal] = useState<HTMLElement | null>(null)
  useEffect(() => setPortal(document.body), [])
  const panel = useRef<HTMLDivElement | null>(null)
  const [place, setPlace] = useState(() => measure(anchor))
  useLayoutEffect(() => {
    if (!open) return
    setPlace(measure(anchor))
    const onResize = () => setPlace(measure(anchor))
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [open, anchor])

  useEffect(() => {
    if (!open) return
    const raf = requestAnimationFrame(() => searchRef.current?.focus({ preventScroll: true }))
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== "Tab" || !panel.current) return
      const focusable = Array.from(panel.current.querySelectorAll<HTMLElement>("input, button:not([disabled])")).filter((el) => el.offsetParent !== null)
      if (focusable.length <= 1) { e.preventDefault(); focusable[0]?.focus(); return }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    const onDown = (e: PointerEvent) => {
      if (panel.current && !panel.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener("keydown", onKey, true)
    document.addEventListener("pointerdown", onDown, true)
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener("keydown", onKey, true)
      document.removeEventListener("pointerdown", onDown, true)
      if (anchor.isConnected && (!document.activeElement || document.activeElement === document.body || panel.current?.contains(document.activeElement))) anchor.focus({ preventScroll: true })
    }
  }, [open, onClose, searchRef, anchor])

  if (!portal) return null
  const center = place.mode === "center"
  return createPortal(
    <div data-block-picker-layer="" data-state={open ? "open" : "closed"} {...(open ? {} : { inert: "" as unknown as boolean })} className={cn("fixed inset-0 z-[2147483638]", !open && "pointer-events-none")}>
      {center ? <div aria-hidden className={cn("absolute inset-0 bg-black/30 transition-opacity duration-200", open ? "opacity-100" : "opacity-0")} /> : null}
      <div
        ref={panel}
        role="dialog"
        aria-modal={center || undefined}
        aria-label={tt("Add block")}
        data-block-picker="desktop"
        data-placement={place.mode}
        className={cn(
          "absolute flex overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_18px_48px_-16px_rgba(15,23,42,0.28),0_2px_6px_rgba(15,23,42,0.06)]",
          "transition-[opacity,translate,visibility] duration-[180ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
          open ? "visible translate-x-0 opacity-100" : "invisible -translate-x-1.5 opacity-0",
        )}
        style={{ left: place.left, top: place.top, width: place.width, height: place.height }}
      >
        {children}
      </div>
    </div>,
    portal,
  )
}

function measure(anchor: HTMLElement) {
  const sidebar = anchor.closest<HTMLElement>("[data-wb-sidebar-fold]")
  return placePicker(anchor.getBoundingClientRect(), sidebar ? sidebar.getBoundingClientRect() : null, { w: window.innerWidth, h: window.innerHeight })
}
