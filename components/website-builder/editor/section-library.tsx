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
 * APPS. The sections Storelib's apps put on a website, one category per app
 * (Reviews, Email and the others in lib/website-builder/app-sections.ts)
 * under an Apps heading right after All, as Shopify's editor has its Apps
 * tab. The same cards as everywhere else, each with its app's name under
 * it, and over an app's cards a line when that app is off, with the way to
 * turn it on. Added like any other.
 *
 * scripts/check-add-section.mjs opens it, switches categories and adds a
 * section on a phone and a computer, reads every frame of a category switch
 * and films it, and follows the add until everything has settled.
 */

import { memo, startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { createPortal, flushSync } from "react-dom"
import { ArrowUpRight, Search, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { editorSpares, prefetchPlan } from "@/lib/nav/prefetch-policy"
import { hapticTap } from "@/lib/native-bridge"
import { MobileEditorSheet } from "@/components/website-builder/mobile-editor-sheet"
import SectionRenderer from "@/components/website-builder/sections/SectionRenderer"
import { StorelibLiveProvider } from "@/components/website-builder/sections/storelib-live"
import { SECTION_CATEGORIES, SECTION_CATEGORY_ORDER } from "@/lib/website-builder/section-schemas"
import { CUSTOM_SECTION_CATEGORY } from "@/lib/website-builder/storelib-schemas"
import { appSectionCategories, classifyImportedSection, IMPORTED_SECTION_CATEGORIES, IMPORTED_SECTION_CATEGORY_LABELS, isAppSectionCategory } from "@/lib/website-builder/section-categories"
import { hasBuiltInArt, StorelibTile } from "@/components/app/settings/integration-mark"
import { freezeViewport, freezeViewportInStyles, lazyImages, markupLooksEmpty, previewCardHeight, previewCentered, previewKey, rememberedHeightsFrom, sampleBlocks, splitStyles, withoutSticky } from "@/lib/website-builder/preview-markup"
import { PreviewFallback } from "@/components/website-builder/editor/preview-fallback"
import { sampleStorefrontReviews } from "@/lib/reviews/storefront"
import { readReviewsApp } from "@/lib/reviews/app-settings"
import type { StorefrontData } from "@/lib/storelib-theme/types"
import { CompatPreviewBox, CompatPreviewProvider, CompatPreviewSheet, releaseCompatHeld } from "@/components/website-builder/compat/compat-section-preview"
import type { SectionInstance, SectionSchema, ThemeSettingsValues } from "@/lib/website-builder/types"
import { tt } from "@/lib/i18n/text"
import { STORELIB_SECTION_APPS, appForSection, appIsOn, installedSectionApps, type SectionApp } from "@/lib/website-builder/app-sections"
import { ICON_MAP } from "@/components/website-builder/sections/icon-map"
import { useAppStates } from "./use-app-states"


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
/**
 * The window a preview is drawn in (round 45): as wide as it is drawn and
 * this tall, whatever the editor's own window is. A section's viewport
 * lengths are read against it (freezeViewport), and Storelib's own through
 * `--sl-vh`. The same windows as an imported theme's cards
 * (compat-section-preview.tsx WINDOW_HEIGHT_DESKTOP / _PHONE).
 */
export const PREVIEW_WINDOW_HEIGHT = 800
export const PREVIEW_WINDOW_HEIGHT_MOBILE = 844
export const previewWindowHeight = (renderWidth: number) => (renderWidth <= PREVIEW_RENDER_WIDTH_MOBILE ? PREVIEW_WINDOW_HEIGHT_MOBILE : PREVIEW_WINDOW_HEIGHT)
/** What a preview's window says to Storelib's own sections, on the card and on the ruler that measures it alike. */
const windowVars = (renderWidth: number) => ({ "--sl-vh": `${previewWindowHeight(renderWidth) / 100}px` }) as CSSProperties

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
/**
 * AND WHICH ONES DRAW NOTHING AT ALL: no words, no picture, nothing with a
 * size. A section made by the creator that needs a product to show, or
 * that only appears once a script runs, is an empty white box as a
 * preview; the card names it instead (EmptyPreview).
 */
const EMPTY = new Set<string>()
/** Counts every batch of heights, for what has to be worked out again when they change (the eager cards). */
let heightsVersion = 0

/*
  ===========================================================================
   THE HEIGHTS ARE REMEMBERED IN THIS BROWSER (round 44)
  ===========================================================================
  A small device draws nothing ahead (editorSpares), so every visit opened
  the library on cards a crop tall, and a card in sight whose section
  turned out shorter was held at that height over white until the next
  category: the Header card a 363px box round a 55px header. The heights
  are a number a preview, keyed by everything that decides them (the
  preview key: type, preset, width, the look and the creator's files), so
  the next visit's cards are their own height from the first frame, before
  anything is drawn. A convenience: a wrong or missing one only means a
  card is measured again, as an imported theme's are (compat-section-
  preview.tsx, rememberedHeights).
*/
/*
  ROUND 45: CHECKED AS THEY ARE READ, AND NEVER ALLOWED TO MOVE THE LIST.
  Only a preview's key (type, preset, one of the two widths a preview is
  drawn at, the tag) with a height a section can be is taken
  (rememberedHeightsFrom); the store before this round's (whose sections
  were measured against the editor's window, freezeViewport) is let go. A
  height that is only remembered is marked so (REMEMBERED) until its
  section is drawn and measured in this visit, and a card sized by one is
  never made taller in front of somebody either (useSteadyHeight).
*/
const HEIGHTS_STORE = "wb-preview-h:r45"
const OLD_HEIGHTS_STORES = ["wb-preview-h:r44"]
const PREVIEW_HEIGHT_KEY = /^[\w-]+:\d{1,3}:\d{3}:[a-z0-9]*$/
const REMEMBERED = new Set<string>()
let heightsRead = false
let heightsWrite = 0
function readRememberedHeights() {
  if (heightsRead || typeof window === "undefined") return
  heightsRead = true
  try {
    for (const old of OLD_HEIGHTS_STORES) window.localStorage.removeItem(old)
    const raw = window.localStorage.getItem(HEIGHTS_STORE)
    const widths = new Set([`${PREVIEW_RENDER_WIDTH}`, `${PREVIEW_RENDER_WIDTH_MOBILE}`])
    const valid = rememberedHeightsFrom(raw ? (JSON.parse(raw) as unknown) : null, PREVIEW_HEIGHT_KEY, (key) => widths.has(key.split(":")[2]))
    for (const [key, h] of Object.entries(valid)) {
      if (HEIGHTS.has(key)) continue
      HEIGHTS.set(key, h)
      REMEMBERED.add(key)
    }
  } catch {
    /* no storage: measured as they come */
  }
}
function rememberHeights() {
  if (typeof window === "undefined") return
  window.clearTimeout(heightsWrite)
  heightsWrite = window.setTimeout(() => {
    try {
      /* The latest few hundred: a colour changed many times is a new look each time, and the old ones are never asked for again. */
      const kept = [...HEIGHTS].filter(([key, h]) => h > 0 && !EMPTY.has(key)).slice(-400)
      const all: Record<string, number> = Object.fromEntries(kept)
      window.localStorage.setItem(HEIGHTS_STORE, JSON.stringify(all))
    } catch {
      /* full or blocked: kept for this visit only */
    }
  }, 1500)
}
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
    onCapture(ref.current ? stillMarkup(ref.current) : "")
  })
  return <div ref={ref}>{children}</div>
}

/*
  WHAT A CARD IS DRAWN WITH, PAST ITS SECTION. Round BC: the reviews
  sections (a widget, a carousel, the badge) draw nothing while Storelib
  Reviews has nothing to give them, so their cards were the section's name
  on grey. A card is given the same sample reviews the canvas shows a store
  that has none yet (lib/reviews/storefront.ts, marked `sample`, never on a
  live page).
*/
let previewData: StorefrontData | null = null
function previewStorefront(): StorefrontData {
  if (!previewData) {
    let reviews: Record<string, unknown> | null = null
    try {
      reviews = { ...sampleStorefrontReviews(readReviewsApp({ enabled: true }), ""), enabled: true } as unknown as Record<string, unknown>
    } catch {
      reviews = null
    }
    /* A reply is signed with the shop's name ("Reply from My store"), as an imported theme's cards are (compat-section-preview.tsx). */
    previewData = { reviews, shop: { name: "My store" } }
  }
  return previewData
}

function drawOne(job: Job): string {
  const first = drawWith(job, false, false)
  if (first && !markupLooksEmpty(first)) return first
  /*
    Nothing to see as its preset gives it. A section that is all blocks, with
    none in its preset, is drawn with a few of its own; a gallery whose
    pictures are all still to be chosen, with the placeholder picture in
    each. Whatever draws something first is the card.
  */
  const preset = job.schema.presets?.[job.presetIndex] ?? job.schema.presets?.[0]
  const sample = !(preset?.blocks ?? []).length && sampleBlocks(job.schema.blocks, job.schema.max_blocks, job.type).length > 0
  if (sample) {
    const again = drawWith(job, true, false)
    if (again && !markupLooksEmpty(again)) return again
  }
  const pictured = drawWith(job, sample, true)
  return pictured && !markupLooksEmpty(pictured) ? pictured : first
}

/** The picture a preview shows where a section's picture is still to be chosen. */
const PLACEHOLDER_PICTURE = "/placeholder.svg"

/** Each empty picture setting given the placeholder picture: the fields are the section's or a block type's. */
function withPictures(settings: Record<string, unknown>, fields: readonly { id: string; type: string }[] | undefined): Record<string, unknown> {
  const out = { ...settings }
  for (const f of fields ?? []) if (f.type === "image_picker" && !out[f.id]) out[f.id] = PLACEHOLDER_PICTURE
  return out
}

function drawWith(job: Job, sample: boolean, pictures: boolean): string {
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
  if (sample) section.blocks = sampleBlocks(job.schema.blocks, job.schema.max_blocks, section.id)
  if (pictures) {
    section.settings = withPictures(section.settings, job.schema.fields)
    section.blocks = (section.blocks ?? []).map((b) => ({ ...b, settings: withPictures(b.settings ?? {}, job.schema.blocks?.find((t) => t.type === b.type)?.fields) }))
  }
  /* A floating section (a popup, a phone tab bar, back to top) is hidden on a live page until it is scrolled to or its moment comes, so its card would be empty: it is drawn as the canvas draws it, in place and open. */
  const floats = job.schema.enabled_on?.groups?.includes("overlay") === true
  flushSync(() => {
    root!.render(
      <StorelibLiveProvider sources={job.sources} inEditor={floats} preview data={previewStorefront()}>
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
  /* Its viewport lengths, of the page it is drawn on (freezeViewport), not of the editor's window. */
  const winH = previewWindowHeight(job.width)
  addStyles(split.css.map(withoutSticky).map((css) => freezeViewport(css, job.width, winH)))
  return lazyImages(freezeViewportInStyles(withoutSticky(split.html), job.width, winH))
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

/**
 * ===========================================================================
 *  SEVERAL PREVIEWS MEASURED FOR THE PRICE OF ONE
 * ===========================================================================
 * Measured in the real editor (scripts/check-editor-perf.mjs): putting
 * markup anywhere in the editor's document and reading a height restyles
 * the whole document, about 1,180 elements and 35 to 45ms on a computer,
 * however small the markup is. One preview per read was 51 such passes in
 * the first seconds after the editor opened, 2 to 4 seconds of the main
 * thread in tasks of 50 to 250ms.
 *
 * (Round V12 found the cause: two `html:has()` rules for the account pages,
 * now classes, see app/globals.css. The same insertion restyles a few
 * elements now, under 1ms in the body and 2 to 8ms in the sidebar, so a
 * batch is a small saving rather than the whole of it.)
 *
 * So a batch goes in at once, each in its own box with the ruler's own
 * containment (the same width, the same formatting context, a fixed layer
 * held inside it), and the heights are read after all of them are in: the
 * first read pays for the pass and the rest find it done. Each box is the
 * ruler as it was when it held one preview at a time, so a height is the
 * same either way.
 */
export const MEASURE_BATCH = 8
function measureMany(items: { html: string; width: number }[]): { height: number; empty: boolean }[] {
  if (typeof document === "undefined") return items.map(() => ({ height: 0, empty: true }))
  if (!ruler || !ruler.isConnected) {
    ruler = document.createElement("div")
    ruler.setAttribute("aria-hidden", "true")
    ruler.setAttribute("data-section-preview-ruler", "")
    ruler.style.cssText = "position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none;contain:layout paint"
    document.body.appendChild(ruler)
  }
  ruler.style.width = `${Math.max(0, ...items.map((i) => i.width))}px`
  const boxes = items.map((item) => {
    const box = document.createElement("div")
    box.style.cssText = `width:${item.width}px;contain:layout paint;--sl-vh:${previewWindowHeight(item.width) / 100}px`
    box.innerHTML = item.html
    return box
  })
  ruler.append(...boxes)
  const out = boxes.map((box, k) => {
    if (!items[k].html) return { height: 0, empty: true }
    const height = box.getBoundingClientRect().height
    const words = (box.textContent ?? "").replace(/\s+/g, "").length
    const things = box.querySelector("img, svg, video, picture, canvas, iframe, input, button")
    const empty = height < 8 || (words === 0 && !things)
    return { height: Math.ceil(height), empty }
  })
  ruler.textContent = ""
  return out
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
/*
  ===========================================================================
   AND NOT WHILE SOMEBODY IS USING THE EDITOR
  ===========================================================================
  Each preview is a section laid out in the editor's own document, 60 to
  130ms on a computer however it is sliced, and the warm-up ran for the
  first thirteen seconds the editor was open: half of every second in long
  tasks, while somebody was already pointing at the canvas, typing in the
  sidebar or scrolling (measured in the real editor, through
  scripts/editor-probe-harness.mjs). The idle callback's timeout ran a
  slice whether or not anybody was in the middle of something.

  So drawing ahead waits until the pointer, the keys, the wheel and every
  scroll have been still for INPUT_QUIET_MS, and steps aside again the
  moment they are not. Previews asked for by an open library (`urgent`) are
  what somebody is waiting for, and are drawn as before.
*/
const INPUT_QUIET_MS = 1200
let lastInput = 0
let urgent = false
let waiting = 0
let watching = false
/*
  ===========================================================================
   AN OPEN LIBRARY DRAWS BETWEEN PRESSES, NOT UNDER THEM (round 44)
  ===========================================================================
  The owner, on a small phone: the library "stutters and lags when clicking
  categories and scrolling". A small device draws nothing ahead, so every
  preview was drawn with the library open, as urgent work that ignored
  input: one section at a time is 40 to 110ms at a quarter or a sixth of a
  computer's speed, and they landed under every pill press and every
  frame of a scroll (scripts/check-add-section-perf.mjs: 29 long tasks over
  the category presses on a computer at a quarter speed, 2.2s of them).
  Open, a press, a wheel, a touch or a scroll now holds the drawing for
  OPEN_QUIET_MS, about a third of a second, so the press is answered and
  the scroll runs on frames of its own; the cards it reaches are drawn the
  moment it rests, nearest the screen first (promotePreviews). Hovering is
  not a press: a pointer resting over the list holds nothing.
*/
const OPEN_QUIET_MS = 320
let lastPress = -Infinity
function watchInput() {
  if (watching || typeof window === "undefined") return
  watching = true
  const seen = () => { lastInput = performance.now() }
  const pressed = () => { lastPress = lastInput = performance.now() }
  const o = { capture: true, passive: true } as const
  window.addEventListener("pointermove", seen, o)
  for (const type of ["pointerdown", "keydown", "wheel", "touchstart", "touchmove"]) window.addEventListener(type, pressed, o)
  document.addEventListener("scroll", pressed, o)
  /* A sheet sliding (Ask Storelib's going down, the sections sheet coming up) is the screen in use too: a batch laid out in its slide was a 278ms task at a quarter speed (scripts/check-ask-sheet-r18.mjs). */
  const moving = (e: Event) => {
    if (e.target instanceof Element && e.target.matches("[data-mobile-bottom-sheet]")) seen()
  }
  window.addEventListener("transitionrun", moving, o)
  window.addEventListener("transitionend", moving, o)
}
/*
  NOR WHILE STORELIB AI IS AT WORK (round 16). A person watching a run is not
  moving the pointer, so the quiet that lets drawing ahead start came in the
  middle of every run, and batches of previews were laid out beside the
  section being written and the sections being changed: long tasks of 120ms
  and more on a slow laptop, in the animation being watched
  (scripts/check-wb-write-r16.mjs). Held for the run, and let go after it.
*/
let aiAtWork = false
/**
 * A change from outside is landing (a push, an agent's edit): drawing ahead
 * steps aside for INPUT_QUIET_MS as it does for a key, so its batches are not
 * laid out in the frames that change is drawn in.
 */
export function deferPreviewsForChange() {
  if (typeof performance !== "undefined") lastInput = performance.now()
}
export function holdPreviewsForAi(on: boolean) {
  if (aiAtWork === on) return
  aiAtWork = on
  if (!on && typeof window !== "undefined" && (queue.length || unmeasured.length)) pump()
}

/** How long since the last press, scroll or key, while the library is open: the work it waits on waits this much longer. */
function pressQuietFor(): number {
  return Math.max(0, OPEN_QUIET_MS - (performance.now() - lastPress))
}

/** How much longer warm work has to wait, or 0 when it may run. */
function busyFor(): number {
  if (typeof performance === "undefined") return 0
  if (urgent) return pressQuietFor()
  if (aiAtWork) return INPUT_QUIET_MS
  return Math.max(0, INPUT_QUIET_MS - (performance.now() - lastInput))
}

/*
  ===========================================================================
   A SLICE TAKES ON WHAT IT HAS ROOM FOR, AS THE DEVICE HAS SHOWN IT (round 44)
  ===========================================================================
  A slice went on drawing while it had 12ms left and measured eight at a
  time whatever it had left, numbers that suit a computer at full speed. On
  a slow phone one section is 40ms and eight measured are 100ms and more,
  so nearly every slice overran its idle moment into the next frame. What a
  draw and a measured preview have cost on this device is learnt as they
  happen, and a slice starts another only when the moment left has room
  for it; always one, so the work still finishes.
*/
let drawCost = 8
let measureCost = 4
const learnCost = (was: number, ms: number) => (Number.isFinite(ms) && ms >= 0 ? was * 0.6 + ms * 0.4 : was)
function roomFor(deadline: { timeRemaining: () => number }, each: number, most: number): number {
  return Math.max(1, Math.min(most, Math.floor(deadline.timeRemaining() / Math.max(1, each))))
}

function pump() {
  if (running) return
  watchInput()
  const wait = busyFor()
  if (wait > 0) {
    if (!waiting) waiting = window.setTimeout(() => { waiting = 0; pump() }, wait)
    return
  }
  running = true
  idle((deadline) => {
    running = false
    if (busyFor() > 0) {
      pump()
      return
    }
    if (unmeasured.length) {
      /* After the styles are in, so each is measured as it will look. */
      flushStyles()
      /* A batch per idle moment (measureMany), as many as the moment has room for, and more while it has room. */
      do {
        const batch = unmeasured.splice(0, roomFor(deadline, measureCost, MEASURE_BATCH))
        let sizes: { height: number; empty: boolean }[]
        const began = performance.now()
        try {
          sizes = measureMany(batch)
        } catch {
          sizes = batch.map(() => ({ height: 0, empty: true }))
        }
        measureCost = learnCost(measureCost, (performance.now() - began) / batch.length)
        batch.forEach((next, k) => {
          const { height, empty } = sizes[k]
          if (empty || !next.html) EMPTY.add(next.key)
          else EMPTY.delete(next.key)
          HEIGHTS.set(next.key, height)
          REMEMBERED.delete(next.key)
          MARKUP.set(next.key, next.html)
          pending.delete(next.key)
        })
      } while (unmeasured.length && deadline.timeRemaining() > Math.max(MEASURE_ROOM_MS, measureCost * 2))
      heightsVersion++
      notify()
      rememberHeights()
    } else {
      do {
        const job = queue.shift()
        if (!job) break
        queued.delete(job.key)
        if (MARKUP.has(job.key) || pending.has(job.key)) continue
        let html = ""
        const began = performance.now()
        try {
          html = drawOne(job)
        } catch {
          html = ""
        }
        drawCost = learnCost(drawCost, performance.now() - began)
        pending.add(job.key)
        unmeasured.push({ key: job.key, html, width: job.width })
      } while (queue.length && deadline.timeRemaining() > Math.max(12, drawCost * 1.25))
    }
    if (queue.length || unmeasured.length) pump()
    else urgent = false
  })
}

/**
 * The library closed: what it still wanted drawn waits for a quiet moment
 * again (round 12). `urgent` stayed on until the whole queue was drawn and
 * measured, so after a card was picked the previews of the rest went on
 * being laid out in the editor's document between keys typed next, 60 to
 * 130ms a batch (scripts/check-wb-perf-r12.mjs, "add menu link").
 */
export function calmPreviews() {
  urgent = false
}

/**
 * What the library shows now goes first, in the order it shows it: a
 * category pressed, or cards scrolled near (PreviewBox). The queue is the
 * order of the whole library, so a category near its foot waited for every
 * card above it to be drawn.
 */
export function promotePreviews(keys: readonly string[]) {
  if (!queue.length || !keys.length) return
  const want = new Map(keys.map((k, i) => [k, i]))
  const first: Job[] = []
  const rest: Job[] = []
  for (const j of queue) (want.has(j.key) ? first : rest).push(j)
  if (!first.length) return
  first.sort((a, b) => want.get(a.key)! - want.get(b.key)!)
  queue.splice(0, queue.length, ...first, ...rest)
}

/** Ask for previews; the first in the list first. Already drawn, being drawn or already asked for: nothing. */
export function requestPreviews(jobs: Job[], front = false) {
  const fresh = jobs.filter((j) => !MARKUP.has(j.key) && !queued.has(j.key) && !pending.has(j.key))
  for (const j of fresh) queued.add(j.key)
  if (front) queue.unshift(...fresh)
  else queue.push(...fresh)
  /* An open library is waited on: drawn now, input or not. */
  if (front && (queue.length || unmeasured.length)) {
    urgent = true
    if (waiting) { window.clearTimeout(waiting); waiting = 0 }
  }
  if (queue.length || (urgent && unmeasured.length)) pump()
}

/** Only the card whose preview just landed renders again: the snapshot is its own string. */
function useMarkup(key: string): string | undefined {
  return useSyncExternalStore(subscribe, () => MARKUP.get(key), () => undefined)
}

/** Whether the section drew nothing to see (see EMPTY). */
function useDrawnEmpty(key: string): boolean {
  return useSyncExternalStore(subscribe, () => EMPTY.has(key), () => false)
}

/**
 * WHAT A SCRIPT WOULD REVEAL, SHOWN. A preview is markup with no script in
 * it, so a section that starts hidden and waits for a script to bring it in
 * as it scrolls into view (Storelib's own data-reveal, and the classes AI
 * written and imported sections use for the same) would stay hidden in its
 * card forever. In a card they are simply there.
 */
/*
  ===========================================================================
   BUT NEVER WHAT IS CLOSED ON PURPOSE (round 44)
  ===========================================================================
  The owner: the Header card was "completely broken ... garbled". Its card
  showed the header's search field, an X and an empty suggestions box, with
  the logo and the menu under them. The header draws its search panel
  closed as `opacity: 0; pointer-events: none` with aria-hidden, over the
  header's own row, and the rule below took every inline `opacity: 0` for
  a reveal still to come and showed it. A closed panel, drawer or menu says
  so: aria-hidden, inert, or no pointer events. Those keep their own look.

  AND NOTHING STICKY, NOTHING MOVING. A card is a still picture: a sticky
  header (and an FAQ's sticky column) has nothing to stick to in it, and as
  relative it lays out exactly where sticky put it at rest. A section's own
  animations (a spinner, a ticker, an entrance) and its will-change layers
  were drawn again on every frame the list scrolled, in cards nobody was
  looking at as animations: at a sixth of a computer's speed, freezing them
  took one scroll of the whole list from 43 long tasks to 35 and its 95th
  percentile frame from 50ms to 33ms (one A/B, on a busy machine).
  Each ends at once on its last frame, so an entrance shows what it brings
  in, never the nothing it starts from.
*/
/*
  WHAT WOULD BE REVEALED IS FOUND ONCE, AS THE PREVIEW IS DRAWN, NOT BY THE
  PAGE'S STYLESHEET (round 44). These were attribute substring selectors in
  the document, tried against every element restyled anywhere in the editor
  while somebody scrolled the canvas. A copy of the drawn preview is walked
  once instead, and what is to be shown gets a class of its own; the cards'
  rules are class selectors under the preview's own class, `.wb-pv`.
*/
const REVEALED = `[data-reveal],[data-animate],[data-aos],.reveal,.fade-in,.fade-up,.scroll-trigger,.animate-on-scroll,.js-animate,.wow,[class*="reveal"],[class*="animate--"],[style*="opacity: 0"],[style*="opacity:0"]`
function closedOnPurpose(el: Element): boolean {
  const style = el.getAttribute("style") ?? ""
  return el.getAttribute("aria-hidden") === "true" || el.hasAttribute("inert") || /pointer-events\s*:\s*none/i.test(style)
}
/** A drawn preview's markup, what a script would reveal marked to be shown (wb-pv-reveal). Read from a copy: the drawing root's own nodes are React's. */
function stillMarkup(root: HTMLElement): string {
  const copy = root.cloneNode(true) as HTMLElement
  for (const el of Array.from(copy.querySelectorAll(REVEALED))) if (!closedOnPurpose(el)) el.classList.add("wb-pv-reveal")
  return copy.innerHTML
}
const REVEAL_SHOWN = `.wb-pv .wb-pv-reveal{opacity:1!important;visibility:visible!important;transform:none!important;clip-path:none!important}
.wb-pv .sticky{position:relative!important;inset:auto!important}
.wb-pv *{animation-duration:0s!important;animation-delay:0s!important;animation-iteration-count:1!important;transition:none!important;will-change:auto!important}`
let revealStyled = false
function showRevealsInCards() {
  if (revealStyled || typeof document === "undefined") return
  revealStyled = true
  const sheet = document.createElement("style")
  sheet.setAttribute("data-section-preview-reveal", "")
  sheet.textContent = REVEAL_SHOWN
  document.head.appendChild(sheet)
}

/*
  CARDS SCROLLED NEAR ARE DRAWN NEXT (round 44). One observer for every card
  still waiting for its preview, a screen above and below the list's
  window: what comes into reach goes to the front of the queue, top first.
*/
let nearObserver: IntersectionObserver | null = null
const nearKeys = new WeakMap<Element, string>()
function observeNear(el: Element, key: string): () => void {
  if (typeof IntersectionObserver === "undefined") return () => {}
  if (!nearObserver) {
    nearObserver = new IntersectionObserver(
      (seen) => {
        const keys = seen
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
          .map((e) => nearKeys.get(e.target))
          .filter((k): k is string => !!k)
        promotePreviews(keys)
      },
      { rootMargin: "100% 0px" },
    )
  }
  nearKeys.set(el, key)
  nearObserver.observe(el)
  return () => nearObserver?.unobserve(el)
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
function useSteadyHeight(boxRef: React.RefObject<HTMLDivElement | null>, wanted: number, width: number, known: boolean, fromMemory = false): number {
  const [kept, setKept] = useState(() => ({ height: wanted, width, mem: fromMemory }))
  useLayoutEffect(() => {
    /* A new width is a new layout: everything is its new size at once. */
    if (kept.width !== width) {
      setKept({ height: wanted, width, mem: fromMemory })
      return
    }
    if (kept.height === wanted) {
      if (kept.mem && !fromMemory) setKept({ height: wanted, width, mem: false })
      return
    }
    if (!known) return
    const take = () => setKept({ height: wanted, width, mem: fromMemory })
    const box = boxRef.current
    /* Round 45: a card sized by a height only remembered is not made taller in front of somebody either: its section is cut at its foot until nobody can see it change. */
    if ((wanted > kept.height && !kept.mem) || !box || !inSight(box)) {
      take()
      return
    }
    const held: HeldCard = { box, take }
    heldCards.add(held)
    return () => {
      heldCards.delete(held)
    }
  }, [boxRef, wanted, width, known, kept, fromMemory])
  return kept.width === width ? kept.height : wanted
}

const PreviewBox = memo(function PreviewBox({
  markupKey,
  title,
  width,
  renderWidth,
  ratio,
  live,
  eager,
}: {
  markupKey: string
  /** The section's name, for a card whose section draws nothing to see. */
  title: string
  width: number
  renderWidth: number
  ratio: number
  /** Its turn has come to be put in (see `live` in the library). */
  live: boolean
  /** Among the first few of what is shown, so drawn the moment it is shown (see `eager` in the library). */
  eager: boolean
}) {
  const stored = useMarkup(markupKey)
  const empty = useDrawnEmpty(markupKey)
  useEffect(showRevealsInCards, [])
  const markup = live && !empty ? stored : undefined
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
  const waitingForIt = stored === undefined
  useEffect(() => {
    const el = boxRef.current
    if (!waitingForIt || !el) return
    return observeNear(el, markupKey)
  }, [waitingForIt, markupKey])
  const drawn = useDrawnHeight(markupKey)
  const fromMemory = drawn !== undefined && REMEMBERED.has(markupKey)
  const height = useSteadyHeight(boxRef, previewCardHeight(drawn, width, renderWidth, ratio), width, drawn !== undefined, fromMemory)
  const scale = width > 0 ? width / renderWidth : 0.3
  const centered = previewCentered(drawn, width, renderWidth, height)
  const inner: CSSProperties = {
    width: renderWidth,
    /* A section shorter than its card sits on white to the card's foot: in the middle of it under the floor, at the top of it otherwise. */
    minHeight: height ? Math.ceil(height / scale) : undefined,
    ...(centered ? IN_THE_MIDDLE : null),
    transform: `scale(${scale})`,
    /* The page the section is drawn on: what it paints past its own width or its foot is cut here, and its window is the card's (windowVars). */
    contain: "layout paint style",
    overflow: "clip",
    isolation: "isolate",
    ...windowVars(renderWidth),
    pointerEvents: "none",
    userSelect: "none",
  }
  return (
    <div
      ref={boxRef}
      data-preview-box=""
      /*
        Until its preview is in: a soft band of light crossing the grey, only
        while the library is open (app/globals.css, .wb-preview-shimmer). On
        the box itself, not a child laid over it (round 44): a child of a box
        that content-visibility skipped has no place until the box is drawn,
        and every one that came into view was reported as a layout shift
        from nowhere, 0.09 of one in a single scroll on a small phone.
      */
      data-preview-shimmer={!html && !(live && empty) ? "" : undefined}
      className={cn("relative w-full overflow-hidden bg-[#f3f4f6]", !html && !(live && empty) && "wb-preview-shimmer")}
      style={{
        /* The box is its section's height before anything is drawn in it, so the list never moves. */
        height: height || undefined,
        aspectRatio: height ? undefined : `1 / ${ratio}`,
        /*
          A HARD BOX (round 45). Its own size whatever it holds (strict: size,
          layout, paint, style), the box every absolute and fixed element in
          its section is placed against (the scale on .wb-pv is one too), cut
          at its edges, and a stacking context of its own, so a z-index of a
          million in a section is a million inside this card and nowhere
          else. Nothing drawn in a card can paint outside it.
        */
        contain: "strict",
        overflow: "clip",
        isolation: "isolate",
        contentVisibility: eager ? "visible" : "auto",
        containIntrinsicSize: `${width || 200}px ${height || 200}px`,
      }}
    >
      {live && empty ? <EmptyPreview title={title} /> : null}
      {html && (
        <div
          ref={innerRef}
          className="wb-pv absolute left-0 top-0 origin-top-left bg-white"
          data-keep-transform
          style={inner}
          aria-hidden
          dangerouslySetInnerHTML={html}
        />
      )}
    </div>
  )
})

/** A section that draws nothing until it has content or a product: its name, quietly, never a blank white box (preview-fallback.tsx). */
function EmptyPreview({ title }: { title: string }) {
  return <PreviewFallback title={title} />
}

const LibraryCard = memo(function LibraryCard({
  entry,
  width,
  renderWidth,
  ratio,
  hidden,
  live,
  eager,
  phone,
  compat,
  onAdd,
}: {
  entry: LibraryEntry
  width: number
  renderWidth: number
  ratio: number
  hidden: boolean
  live: boolean
  eager: boolean
  phone: boolean
  /** An imported Shopify theme: the card is drawn by its own engine (compat-section-preview.tsx). */
  compat: boolean
  onAdd: (type: string, presetIndex: number) => void
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
          !phone && "group-hover:border-[#d1d5db] group-hover:shadow-[0_6px_18px_-10px_rgba(15,23,42,0.35)]",
          /* An imported theme's picture lies over the card from the list's own frame (CompatPreviewSheet), so its card does not rise from under it. */
          !phone && !compat && "group-hover:-translate-y-px",
        )}
      >
        {compat ? (
          <CompatPreviewBox type={entry.type} presetIndex={entry.presetIndex} schema={entry.schema} width={width} renderWidth={phone ? renderWidth : COMPAT_RENDER_WIDTH} eager={eager} />
        ) : (
          <PreviewBox markupKey={entry.keyFor(renderWidth)} title={entry.title} width={width} renderWidth={renderWidth} ratio={ratio} live={live} eager={eager} />
        )}
      </div>
      {/* The name under the picture; a size up on a phone, where the card is the width of the sheet. */}
      <span className="truncate px-0.5 text-[14px] font-medium leading-tight text-[#1a1a2e] sm:text-[13px]">{entry.title}</span>
      {/* The app it comes from, for a section an app provides. */}
      {entry.app && <span data-card-app={entry.app.id} className="-mt-1.5 truncate px-0.5 text-[12.5px] leading-tight text-[#6b7280] sm:text-[12px]">{entry.app.name}</span>}
    </button>
  )
})

/* ── The library ───────────────────────────────────────────────────────── */

interface LibraryEntry {
  type: string
  presetIndex: number
  title: string
  schema: SectionSchema
  category: string
  /** The app that provides it, when one does: it is in the Apps category too. */
  app?: SectionApp
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
/** How many at the top of the list a small device draws ahead, with the header and the footer (see the warm-up). */
const SPARE_DEVICE_AHEAD = 4
/** How long after the editor has settled the previews start being drawn. */
const WARM_AFTER_MS = 1800
/** And again after the look changed (an Ask Storelib run, a colour slider), once it has stood this long. */
const REWARM_AFTER_MS = 10_000
/**
 * And then only the first of the cards still to be drawn, in the order they are seen (push lag, round 2): a push of two hundred
 * section files asked for two hundred previews laid out in the closed library, about 1.2s of layout at a quarter speed. The rest
 * are drawn when the library is opened, nearest first, as a library opened before its previews were drawn always was.
 */
export const REWARM_FIRST = 12
/** How long the library's entrance takes before anything heavy is asked of the page (the panel's 280ms, less a frame). */
const OPEN_SETTLE_MS = 260

/**
 * APP EMBEDS, first in the list. Every section and widget a Storelib app
 * puts on a website (Reviews, Offers, Email, Wishlist), together, the way
 * Shopify's editor keeps App embeds apart from a theme's sections, so
 * nobody has to know which category an app's section is filed under. With
 * the apps themselves above the cards, one tap from managing them.
 */
const APP_EMBEDS = "app-embeds"

/* An imported theme is laid out at a desktop width, as Shopify's own editor shows its sections. */
const COMPAT_RENDER_WIDTH = 1200

/** The compat engine's theme for the cards, built once, only for an imported theme. */
function CompatGridWrap({ installId, sources, settings, live, children }: { installId: string | null; sources: Record<string, string>; settings: Record<string, unknown> | undefined; live: boolean; children: ReactNode }) {
  if (!installId) return <>{children}</>
  return (
    <CompatPreviewProvider installId={installId} sources={sources} settings={settings} live={live}>
      {children}
    </CompatPreviewProvider>
  )
}

export const SectionLibrary = memo(function SectionLibrary({
  open,
  onOpenChange,
  onAddSection,
  schemas,
  addable,
  ownTypes,
  sources,
  theme,
  compatInstallId = null,
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
   * Set when the install is a theme imported from Shopify. Its sections are
   * Shopify sections, which Storelib's renderer cannot draw: every card was
   * a blank white box. They are drawn by the theme's own engine instead.
   */
  compatInstallId?: string | null
}) {
  /* Before any card asks for its height (readRememberedHeights). */
  readRememberedHeights()
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
      releaseCompatHeld()
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
        /*
          AN IMPORTED THEME'S SECTIONS ARE THE THEME'S, NOT THE CREATOR'S. They
          are all files of the install, so every one of them used to be filed
          under Created, 143 cards in one list. Each is filed by its kind
          instead, from what the theme says about it (section-categories.ts).
        */
        /* Storelib's own apps' sections (Storelib Reviews and its widgets) under Apps, in either kind of theme (section-categories.ts). */
        /* Round AK: an imported theme's files all count as the install's own, Storelib Reviews' two among them, so "own" alone hid every app section there and App embeds stayed empty. A file the creator wrote is still never an app's. */
        const appInfo = own_ && !schema.imported ? undefined : appForSection(type)?.app
        const app = appInfo?.id ?? null
        const category = app
          ? app
          : compatInstallId && schema.imported
          ? classifyImportedSection({
              type,
              name: schema.name,
              presetName: presets[i]?.name,
              presetCategory: presets[i]?.category,
              blockTypes: [...(schema.blocks ?? []).map((b) => b.type), ...(presets[i]?.blocks ?? []).map((b) => b.type)],
              settingTypes: (schema.fields ?? []).map((f) => f.type),
              groups: schema.enabled_on?.groups,
            })
          : !own_ && presets[i]?.category ? presets[i].category! : sectionCategory
        const label = (app ? appSectionCategories().find((c) => c.id === app)?.label : undefined) ?? (compatInstallId && schema.imported ? IMPORTED_SECTION_CATEGORY_LABELS[category] : undefined) ?? SECTION_CATEGORIES[category] ?? category
        out.push({
          type,
          presetIndex: i,
          title: name,
          schema,
          category,
          app: appInfo,
          haystack: `${name} ${schema.name} ${label} ${schema.description ?? ""} ${type}${appInfo ? ` ${appInfo.name} apps` : ""}`.toLowerCase(),
          keyFor: (w) => previewKey(type, i, w, `${own.has(type) ? sourcesTag : ""}${lookTag}`),
        })
      }
    }
    return out
  }, [addable, schemas, own, sourcesTag, lookTag, compatInstallId])

  /*
    ===========================================================================
     A CARD ONCE BUILT IS KEPT, WHICHEVER GROUP THE LIBRARY OPENS FOR (round 44)
    ===========================================================================
    Add section in the Header group lists the header and the bars that go
    above it, three cards; the page's lists sixty. Each opening built its
    own list, so going to the Header group took the other fifty seven cards
    and their previews out of the document, and coming back to the page put
    them all in again in one commit, every preview parsed at once: 400ms
    and more on a small phone (scripts/check-add-section-perf.mjs, "hdr
    open"). The cards a group does not offer stay, hidden as a category
    hides them, so either way is a filter. Forgotten only when their section
    is no longer the one the theme has.
  */
  const keptCards = useRef(new Map<string, LibraryEntry>())
  const cards = useMemo(() => {
    const kept = keptCards.current
    const now = new Set<string>()
    for (const e of entries) {
      now.add(cardKey(e))
      kept.set(cardKey(e), e)
    }
    for (const [k, e] of kept) if (!now.has(k) && schemas[e.type] !== e.schema) kept.delete(k)
    return [...entries, ...[...kept].filter(([k]) => !now.has(k)).map(([, e]) => e)]
  }, [entries, schemas])

  /**
   * The creator's own sections FIRST, then everything, then the theme's own
   * order. What somebody made themselves is what they come back for.
   */
  const categories = useMemo(() => {
    const counts = new Map<string, number>()
    for (const e of entries) counts.set(e.category, (counts.get(e.category) ?? 0) + 1)
    /* An imported theme's kinds in their own order (section-categories.ts); Storelib's in the theme's. */
    const order = compatInstallId ? IMPORTED_SECTION_CATEGORIES.map((c) => c.id as string) : SECTION_CATEGORY_ORDER.map((c) => c.id)
    const themeOrder = order.filter((id) => counts.has(id) && id !== CUSTOM_SECTION_CATEGORY && !isAppSectionCategory(id))
    const rest = [...counts.keys()].filter((id) => !themeOrder.includes(id) && id !== CUSTOM_SECTION_CATEGORY && !isAppSectionCategory(id))
    const label = (id: string) => (compatInstallId ? IMPORTED_SECTION_CATEGORY_LABELS[id] : undefined) ?? SECTION_CATEGORIES[id] ?? id
    const mine = counts.has(CUSTOM_SECTION_CATEGORY)
      ? [{ key: CUSTOM_SECTION_CATEGORY, label: SECTION_CATEGORIES[CUSTOM_SECTION_CATEGORY] ?? tt("Yours"), count: counts.get(CUSTOM_SECTION_CATEGORY) ?? 0 }]
      : []
    /*
      Round Z1: no Apps group (Reviews, Email, Offers) in the list. The
      owner: "just the button there, app embeds, next to the search". Every
      app's sections are one press away on that button, and in All.
    */
    return [
      ...mine,
      { key: "all", label: tt("All"), count: entries.length },
      ...[...themeOrder, ...rest].map((id) => ({ key: id, label: label(id), count: counts.get(id) ?? 0 })),
    ] as { key: string; label: string; count: number }[]
  }, [entries, compatInstallId])

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
      const ok = words.length ? words.every((w) => e.haystack.includes(w)) : !activeCategory || (activeCategory === APP_EMBEDS ? !!e.app : e.category === activeCategory)
      if (ok) set.add(e)
    }
    return set
  }, [entries, needle, activeCategory])

  const renderWidth = phone ? PREVIEW_RENDER_WIDTH_MOBILE : PREVIEW_RENDER_WIDTH
  const ratio = phone ? PREVIEW_RATIO_MOBILE : PREVIEW_RATIO

  /* ── The previews, drawn ahead ── */
  const jobs = useMemo(
    () => entries.map((e) => ({ key: e.keyFor(renderWidth), type: e.type, presetIndex: e.presetIndex, schema: e.schema, width: renderWidth, sources, theme: previewTheme })),
    [entries, renderWidth, sources, previewTheme],
  )
  /*
    THE HEADER AND THE FOOTER, DRAWN AHEAD AS WELL (round 44). Add section in
    the Header group (or the Footer's) is a library of its own, the header
    first in it, and the header is never among a page's sections: its
    preview was only drawn once that library was opened, so its card stood
    a crop tall, 363px round a 55px header, until the next category. Drawn
    after everything else, in the same quiet moments, so its card is its
    own height the first time.
  */
  const spareJobs = useMemo(() => {
    if (compatInstallId) return []
    const out: typeof jobs = []
    for (const type of ["header", "footer"]) {
      const schema = schemas[type]
      if (!schema || addable.includes(type) || own.has(type)) continue
      const n = (schema.presets?.length ?? 0) > 1 ? schema.presets!.length : 1
      for (let i = 0; i < n; i++) out.push({ key: previewKey(type, i, renderWidth, lookTag), type, presetIndex: i, schema, width: renderWidth, sources, theme: previewTheme })
    }
    return out
  }, [compatInstallId, schemas, addable, own, renderWidth, lookTag, sources, previewTheme])
  /**
   * The cards are built the first time the library is opened, or once the
   * previews have been drawn in idle time, whichever is first. Until then
   * the closed library costs the editor nothing at all.
   */
  const [built, setBuilt] = useState(false)
  const warmed = useRef(false)
  useEffect(() => {
    if (open) {
      /*
        Round AK, the owner: "a bump" on pressing Add section. Drawing the
        missing previews at once, and building the cards for a library
        opened before they were built, was a 200 to 600ms task on the
        entrance's first frames (scripts/check-add-section.mjs). The cards
        build in an interruptible render, and what is still missing is drawn
        once the entrance has settled (OPEN_SETTLE_MS), so the dialog or the
        sheet arrives in one smooth movement and the previews fade in after.
      */
      startTransition(() => setBuilt(true))
      const settle = window.setTimeout(() => {
        /* Whatever is still missing, in the order it will be seen. An imported theme draws its own (compat-section-preview.tsx). */
        if (!compatInstallId) requestPreviews(jobs, true)
      }, OPEN_SETTLE_MS)
      return () => {
        window.clearTimeout(settle)
        calmPreviews()
      }
    }
    /*
      A NEW LOOK WAITS UNTIL IT HAS SETTLED (round 15). The previews are drawn
      in the theme's look, so every colour an Ask Storelib run or a slider
      changed asked for the whole library again, and each pause of the
      person's hands while the run went on laid out another batch of them in
      the editor's document (scripts/check-wb-live-r15.mjs). The first look
      is drawn ahead as before; a changed one once it has stood for
      REWARM_AFTER_MS, and an open library draws what it shows at once.
    */
    /*
      A small device draws the previews when Add section is opened, not while
      the canvas is being scrolled. All but the first screen of them (round
      44): the header, the footer and the top of the list are drawn in the
      editor's quiet moments as on any device, a handful of sections, so the
      library opens on pictures at their own heights, and a Header group
      library on a header its own size, rather than on grey a crop tall.
    */
    if (editorSpares()) {
      if (compatInstallId) return
      const t = window.setTimeout(() => requestPreviews([...jobs.slice(0, SPARE_DEVICE_AHEAD), ...spareJobs]), WARM_AFTER_MS)
      return () => window.clearTimeout(t)
    }
    const t = window.setTimeout(() => {
      const again = warmed.current
      warmed.current = true
      if (!compatInstallId) requestPreviews(again ? jobs.filter((j) => !MARKUP.has(j.key)).slice(0, REWARM_FIRST) : jobs)
      requestPreviews(again ? spareJobs.filter((j) => !MARKUP.has(j.key)) : spareJobs)
      idle(() => setBuilt(true))
    }, warmed.current ? REWARM_AFTER_MS : WARM_AFTER_MS)
    return () => window.clearTimeout(t)
  }, [open, jobs, spareJobs, compatInstallId])

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
  /* A category pressed in an open library: its cards are drawn first, top to bottom (promotePreviews). */
  useEffect(() => {
    if (!open || compatInstallId) return
    promotePreviews(entries.filter((e) => shown.has(e)).map((e) => e.keyFor(renderWidth)))
  }, [open, compatInstallId, entries, shown, renderWidth])
  useEffect(() => {
    if (!built) return
    /* Closed, on a small device: nothing is parsed until Add section is open. */
    if (!open && editorSpares()) return
    let cancelled = false
    let raf = 0
    let later = 0
    const batch = prefetchPlan().tier === "rich" ? FILL_PER_FRAME : 2
    const step = () => {
      if (cancelled) return
      /*
        Closed, the cards are put in only while nobody is using the editor
        (the same quiet the previews wait for, busyFor). Each batch is a
        commit that mounts cards, a long task on a slow device, and they
        were landing under a scroll, a key typed and an agent's edit
        arriving (scripts/check-editor-perf.mjs, PART=live: the library's
        cards among the renders of a one section edit).
      */
      watchInput()
      /* Open, between presses and scrolls (OPEN_QUIET_MS): each batch is markup parsed and laid out, which a scroll's frames have no room for on a slow phone. */
      const wait = open ? pressQuietFor() : busyFor()
      if (wait > 0) {
        later = window.setTimeout(step, wait)
        return
      }
      const next = new Set(liveRef.current)
      let added = 0
      for (const k of orderRef.current) {
        if (next.has(k)) continue
        next.add(k)
        if (++added === batch) break
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
      window.clearTimeout(later)
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
  /*
    ON A COMPUTER, THE DIALOG STARTS CLOSING IN THE FRAME AFTER THE CLICK,
    AND THE EDITOR IS DRAWN ONCE FOR THE CLOSE AND THE ADD (scripts/check-
    section-insert-smooth.mjs). Telling the editor the library had closed,
    inside the click, drew the whole editor there and then: 130 to 260ms
    before the first frame of the close at a quarter speed, then the whole
    editor again for the add. The closed state is put on the dialog's own
    element instead (its exit is opacity and transform, run by the
    compositor once that frame is drawn, and the dialog stops taking clicks
    with it, so a second click cannot add twice), and the editor hears of the
    close and the add together, in one render, just after that frame. A phone's
    sheet closes as before: its movement belongs to the sheet.

    The add is said first. On a Storelib theme the canvas draws the section
    at once and the editor takes in the add, and the close with it, once
    the section has arrived (the editor's addSection, A SECTION JUST ADDED,
    CANVAS FIRST).
  */
  const handleAdd = useCallback((type: string, presetIndex = 0) => {
    hapticTap("light")
    const layer = phone ? null : document.querySelector<HTMLElement>("[data-section-library-layer]")
    if (layer) {
      layer.setAttribute("data-state", "closed")
      layer.setAttribute("inert", "")
      /* In a task after that frame, so the editor's render cannot hold the frame the exit starts in. */
      requestAnimationFrame(() => setTimeout(() => {
        onAddSection(type, presetIndex)
        onOpenChange(false)
      }, 0))
      return
    }
    onOpenChange(false)
    requestAnimationFrame(() => onAddSection(type, presetIndex))
  }, [onAddSection, onOpenChange, phone])

  const empty = searching
    ? tt("Nothing matches “{value}”", { value: query.trim() })
    : activeCategory === CUSTOM_SECTION_CATEGORY
      ? tt("Write a section in the code editor and it appears here")
      : activeCategory === APP_EMBEDS
        ? tt("Your apps' sections appear here once this theme can show them")
        : tt("No sections in this category")

  /**
   * AN APP THAT IS OFF, said once over its cards, with the way to turn it
   * on. Its sections can still be added: they show on the website once the
   * app is on.
   */
  const hasApps = useMemo(() => entries.some((e) => e.app), [entries])
  /* Asked for with the library's own warm-up (`built`), so the App embeds marks are there on its first frame. */
  const appStates = useAppStates(hasApps && (open || built))
  const appsOff = useMemo(() => {
    const seen = new Map<string, SectionApp>()
    for (const e of entries) if (e.app && (e.app.id === activeCategory || activeCategory === APP_EMBEDS) && appIsOn(e.app, appStates) === false) seen.set(e.app.id, e.app)
    return [...seen.values()]
  }, [entries, appStates, activeCategory])
  const appsNotice = !searching && appsOff.length > 0 ? (
    <div data-apps-off="" className="mb-4 flex flex-col gap-2">
      {appsOff.map((app) => {
        const Icon = ICON_MAP[app.icon]
        return (
          <div key={app.id} data-app-off={app.id} className="flex min-h-11 items-center gap-3 rounded-xl border border-[#e5e7eb] bg-[#f8f9fa] px-3.5 py-2">
            {Icon ? <Icon className="h-4 w-4 shrink-0 text-[#6b7280]" strokeWidth={1.75} /> : null}
            <span className="min-w-0 flex-1 truncate text-[14px] text-[#1a1a2e] sm:text-[13px]">{tt("{name} is off", { name: app.name })}</span>
            <a
              href={app.href}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 rounded-md px-2 py-1 text-[14px] font-medium text-[#7c3aed] transition-colors hover:bg-[#8b5cf6]/10 sm:text-[13px]"
            >
              {tt("Turn on")}
            </a>
          </div>
        )
      })}
    </div>
  ) : null

  /*
    Above the cards in App embeds: the apps themselves, each a tap from its
    own page, and every integration after them. Round AK: words, no icons
    (the owner: "avoid those bad icons"), one quiet row of pills.
  */
  const embedCount = useMemo(() => entries.filter((e) => e.app).length, [entries])
  const embedsStrip = !searching && activeCategory === APP_EMBEDS ? (
    <div data-app-embeds="" className="mb-4">
      <div className="flex flex-wrap gap-1.5">
        {STORELIB_SECTION_APPS.map((app) => (
          <a
            key={app.id}
            href={app.href}
            target="_blank"
            rel="noopener noreferrer"
            data-app-embed={app.id}
            className="group/app inline-flex h-8 items-center gap-1 rounded-full bg-white pl-3 pr-2.5 text-[13px] font-medium text-[#1a1a2e] shadow-[0_0_0_1px_rgba(16,24,40,0.10),0_1px_2px_rgba(16,24,40,0.05)] transition-[box-shadow,color] duration-150 hover:shadow-[0_0_0_1px_rgba(16,24,40,0.18),0_2px_6px_-2px_rgba(16,24,40,0.12)] [-webkit-tap-highlight-color:transparent]"
          >
            {tt(app.label)}
            <ArrowUpRight aria-hidden className="h-3 w-3 text-[#9ca3af] transition-colors group-hover/app:text-[#4b5563]" />
          </a>
        ))}
        <a href="/app/integrations" target="_blank" rel="noopener noreferrer" data-app-embed="all" className="inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-[12.5px] font-medium text-[#6b7280] transition-colors hover:text-[#1a1a2e]">
          {tt("All integrations")}
          <ArrowUpRight aria-hidden className="h-3 w-3" />
        </a>
      </div>
    </div>
  ) : null

  /*
    App embeds: a toggle of its own beside the search (round AK). On, the
    list is the apps' sections; off, back to where it was. Round Z1: on a
    phone it says Apps, and on both it carries the marks of up to three of
    the store's installed apps that put sections on a website, overlapping,
    as Settings › Integrations draws them (integration-mark.tsx). Drawn, not
    fetched: each is a tile of CSS and one line icon, so there is nothing
    to load and nothing to wait for. No apps on: the word alone.
  */
  const embedsOn = activeCategory === APP_EMBEDS && !searching
  const lastCategory = useRef<string | null>(null)
  const appsWithSections = useMemo(() => new Set(entries.flatMap((e) => (e.app ? [e.app.id] : []))), [entries])
  const installed = useMemo(() => installedSectionApps(appsWithSections, appStates), [appsWithSections, appStates])
  const embedsLabel = phone ? tt("Apps") : tt("App embeds")
  const embedsButton = embedCount > 0 ? (
    <button
      type="button"
      aria-pressed={embedsOn}
      data-app-embeds-toggle=""
      /* The marks are pictures of the apps; the name of the control is the word, and which apps they are is said once. */
      aria-label={installed.length ? `${embedsLabel}: ${installed.map((a) => a.name).join(", ")}` : undefined}
      onClick={() => {
        setQuery("")
        if (embedsOn) setActiveCategory(lastCategory.current)
        else {
          lastCategory.current = activeCategory === APP_EMBEDS ? null : activeCategory
          setActiveCategory(APP_EMBEDS)
        }
      }}
      className={cn(
        "inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg pl-2.5 pr-3 text-[14px] font-medium transition-[background-color,color,box-shadow] duration-150 [-webkit-tap-highlight-color:transparent] md:h-9 md:text-[13px]",
        installed.length === 0 && "pl-3",
        embedsOn
          ? "bg-[#1a1a2e] text-white shadow-[0_1px_2px_rgba(16,24,40,0.2)]"
          : "bg-white text-[#374151] shadow-[0_0_0_1px_rgba(16,24,40,0.10),0_1px_2px_rgba(16,24,40,0.05)] hover:text-[#1a1a2e] hover:shadow-[0_0_0_1px_rgba(16,24,40,0.18),0_1px_2px_rgba(16,24,40,0.06)]",
      )}
    >
      {installed.length > 0 ? <AppMarks apps={installed} ring={embedsOn ? "#1a1a2e" : "#ffffff"} /> : null}
      {embedsLabel}
    </button>
  ) : null

  const searchRef = useRef<HTMLInputElement | null>(null)
  const search = (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
      <input
        ref={searchRef}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={tt("Search sections")}
        aria-label={tt("Search sections")}
        /* 16px on a phone, or iOS zooms the page and does not zoom back. */
        className="h-10 w-full rounded-lg border border-[#e5e7eb] bg-white pl-9 pr-9 text-[16px] text-[#1a1a2e] placeholder:text-[#9ca3af] focus:border-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-black/5 md:h-9 md:text-sm [&::-webkit-search-cancel-button]:hidden"
      />
      {searching && (
        <button
          type="button"
          onClick={() => setQuery("")}
          aria-label={tt("Clear the search")}
          className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#1a1a2e]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )

  const grid = built ? (
    <CompatGridWrap installId={compatInstallId} sources={sources} settings={theme as Record<string, unknown> | undefined} live={open}>
      <div ref={gridRef} data-library-grid="" className="relative flex flex-col" style={{ rowGap: phone ? 20 : 24 }}>
        {/* An imported theme's sections, every one in one document over the cards (compat-section-preview.tsx). */}
        {compatInstallId ? <CompatPreviewSheet renderWidth={phone ? renderWidth : COMPAT_RENDER_WIDTH} open={open} layoutKey={`${filterKey}:${cardWidth}`} /> : null}
        {cards.map((e) => {
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
              compat={!!compatInstallId}
              onAdd={handleAdd}
            />
          )
        })}
      </div>
      {shown.size === 0 && (
        <p className="py-16 text-center text-[14px] text-[#6b7280]">{empty}</p>
      )}
    </CompatGridWrap>
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
        <div className="flex min-h-0 flex-1 flex-col" data-section-library="phone" data-library-open={open ? "" : undefined}>
          <div className="flex shrink-0 items-center gap-3 px-4 pb-3 pt-0.5">
            <h2 className="min-w-0 flex-1 truncate text-[17px] font-semibold tracking-tight text-[#1a1a2e]">{tt("Add a section")}</h2>
          </div>
          {/* Apps beside the search, as on a computer (round Z1). */}
          <div className="flex shrink-0 items-center gap-2 px-4 pb-3">
            <div className="min-w-0 flex-1">{search}</div>
            {embedsButton}
          </div>
          <div ref={pillRow} className="wb-chip-row shrink-0 overflow-x-auto px-4 pb-3" role="toolbar" aria-label={tt("Categories")}>
            <div className="flex w-max items-center gap-2">{categories.map((cat) => chip(cat))}</div>
          </div>
          <div className="h-px w-full shrink-0 bg-[#f0f1f3]" />
          <div
            ref={scroller}
            data-sheet-scroll
            data-library-scroll=""
            className="wb-slim-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-10 pt-4 [scrollbar-gutter:stable]"
          >
            {embedsStrip}
            {appsNotice}
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
        <h2 id="section-library-title" className="min-w-0 shrink truncate text-[16px] font-semibold text-[#1a1a2e]">{tt("Add a section")}</h2>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {embedsButton}
          <div className="w-[260px] max-w-full shrink-0">{search}</div>
        </div>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label={tt("Close")}
          className="-mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#6b7280] transition-colors hover:bg-[#f3f4f6] hover:text-[#1a1a2e]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1">
        <nav className="wb-slim-scroll w-[200px] shrink-0 overflow-y-auto border-r border-[#f0f1f3] px-2 py-3" aria-label={tt("Categories")}>
          {categories.map((cat) => {
            const on = !searching && ((cat.key === "all" && !activeCategory) || activeCategory === cat.key)
            return (
              <div key={cat.key}>
              <button
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
                {/* How many each holds, so a long theme's list says where the most is. */}
                <span data-category-count="" className="ml-auto shrink-0 text-[12px] tabular-nums text-[#9ca3af]">{cat.count}</span>
              </button>
              </div>
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
              {shown.size === 1 ? tt("1 section") : tt("{size} sections", { size: shown.size })} {tt("matching “{value}”", { value: query.trim() })}
            </p>
          )}
          {embedsStrip}
          {appsNotice}
          {grid}
        </div>
      </div>
    </LibraryDialog>
  )
})

/**
 * UP TO THREE INSTALLED APPS, AS ROUND MARKS OVERLAPPING. Each is the app's
 * own tile from Settings › Integrations (integration-mark.tsx), cut to a
 * circle, with a ring in the button's own colour so each one reads apart
 * from the one under it. A fixed 20px box each, set before anything draws,
 * so the button never changes size or moves its word. An app with no tile
 * of its own gets a plain grey circle rather than nothing.
 */
const MARK_PX = 20
const AppMarks = memo(function AppMarks({ apps, ring }: { apps: SectionApp[]; ring: string }) {
  return (
    <span aria-hidden data-app-marks={apps.length} className="flex shrink-0 items-center" style={{ height: MARK_PX }}>
      {apps.map((app, i) => (
        <span
          key={app.id}
          data-app-mark={app.id}
          className="relative block shrink-0 overflow-hidden rounded-full bg-[#e5e7eb]"
          style={{ width: MARK_PX, height: MARK_PX, marginLeft: i === 0 ? 0 : -6, zIndex: apps.length - i, boxShadow: `0 0 0 2px ${ring}` }}
        >
          {app.markId && hasBuiltInArt(app.markId) ? <StorelibTile id={app.markId} size={MARK_PX} mini /> : null}
        </span>
      ))}
    </span>
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
