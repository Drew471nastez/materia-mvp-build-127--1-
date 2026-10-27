"use client"

/**
 * ===========================================================================
 *  ADD A SECTION, FOR AN IMPORTED THEME
 * ===========================================================================
 * The library drew every card with Storelib's own section renderer. An
 * imported theme's sections are drawn by the compat engine
 * (lib/storelib-theme/compat), so Storelib's renderer had nothing to draw
 * and every card came out an empty white box with a name under it.
 *
 * A card shows the section the way the canvas and the website draw a page
 * (lib/storelib-theme/compat/page.ts): the theme's own layout, so its colour
 * schemes, CSS variables, body classes, stylesheets and fonts are there, and
 * the section's preset settings and blocks. WITH NONE OF ITS SCRIPTS: the
 * page is drawn without them and the frame has no allow-scripts.
 *
 * ONE DOCUMENT FOR EVERY CARD, NOT ONE FRAME PER CARD. Each card used to be
 * its own frame, a whole page of the theme around one section, built when
 * the card neared the screen. Every one of them parsed the theme's 70 KB of
 * inline styles and its stylesheets again, laid out a document and loaded
 * its fonts, on the editor's own thread: 40ms of work a card, more than
 * 300ms before it could be seen, while the list was scrolling. Scrolling
 * the library was a run of long tasks and white boxes that popped into
 * pictures (measured on Posturex: 45 long tasks in nine seconds, frames at
 * 117ms). See PreviewSheet below.
 */
import { moneyFormatFor } from "@/lib/markets/pricing"
import { SHOP_CURRENCY } from "@/lib/store/shop-money"
import { createContext, memo, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react"
import { loadCompatFiles, useCompatFilesVersion } from "@/components/website-builder/compat/compat-files"
import { assetAddresses, templateOfPage } from "@/lib/storelib-theme/compat/install"
import { drawPage, drawSection, pageContextFor, themeOfInstall, withoutScripts, type StoredBlock, type StoredSection } from "@/lib/storelib-theme/compat/page"
import type { CompatPage, CompatTheme } from "@/lib/storelib-theme/compat/theme"
import { freezeViewportInMarkup, inlineStylesheets } from "@/lib/storelib-theme/compat/preview-styles"
import type { SectionSchema } from "@/lib/website-builder/types"
import { markupLooksEmpty, sampleBlocks } from "@/lib/website-builder/preview-markup"
import { PreviewFallback } from "@/components/website-builder/editor/preview-fallback"

interface CompatPreviewValue {
  theme: CompatTheme | null
  page: CompatPage
  /** Whose theme: the key the cards' heights are remembered under. */
  installId: string
  /** The theme's files could not be had: each card names its section rather than shimmering for good. */
  failed: boolean
  /** The install's files, for the stylesheets the preview document carries itself. */
  rows: Record<string, string> | null
}

const CompatPreviewContext = createContext<CompatPreviewValue | null>(null)
const keptThemes = new WeakMap<Record<string, string>, { key: string; sources: Record<string, string>; theme: CompatTheme }>()

/** Whether the library's cards are an imported theme's, drawn here. */
export function useCompatPreview(): CompatPreviewValue | null {
  return useContext(CompatPreviewContext)
}

/** The theme, built once for the whole library from the install's own files. */
export function CompatPreviewProvider({
  installId,
  sources,
  settings,
  children,
}: {
  installId: string
  sources: Record<string, string>
  settings: Record<string, unknown> | undefined
  children: ReactNode
}) {
  const [files, setFiles] = useState<Record<string, string> | null>(null)
  const [failed, setFailed] = useState(false)
  /* A push changed the theme's code: its cards are drawn again from the new files, the old ones staying until those are here. */
  const filesVersion = useCompatFilesVersion(installId)
  useEffect(() => {
    let live = true
    loadCompatFiles(installId).then(
      (f) => {
        if (!live) return
        setFiles(f)
        setFailed(false)
      },
      () => {
        if (live) setFailed(true)
      },
    )
    return () => {
      live = false
    }
  }, [installId, filesVersion])

  const rows = useMemo(() => (files ? { ...sources, ...files } : null), [files, sources])
  const theme = useMemo(() => {
    if (!files || !rows) return null
    /* The same theme for every opening of the dialog while nothing it is made of changed: its parsed files and its drawn layout are kept with it. */
    const key = `${installId}|${JSON.stringify(settings ?? {})}`
    const kept = keptThemes.get(files)
    if (kept && kept.key === key && kept.sources === sources) return kept.theme
    const media = assetAddresses(rows)
    try {
      const made = themeOfInstall(rows, settings ?? {}, {
        assetUrl: (name) => media[name] ?? `/api/site-theme/assets/${installId}/edit/${encodeURIComponent(name)}`,
        assetText: (name) => rows[`shopify/assets/${name}`] ?? null,
        imageUrl: (v) => (/^https?:\/\//.test(v) || v.startsWith("/") ? v : ""),
      })
      keptThemes.set(files, { key, sources, theme: made })
      return made
    } catch {
      return null
    }
  }, [files, rows, sources, settings, installId])

  const page = useMemo<CompatPage>(() => {
    const { template } = templateOfPage("home")
    return {
      template,
      path: "/",
      designMode: true,
      host: "",
      products: [],
      collections: [],
      menus: {},
      /* No products drawn here: the platform's currency, written its way. */
      shop: { name: "My store", currency: SHOP_CURRENCY, moneyFormat: moneyFormatFor(SHOP_CURRENCY) },
      product: null,
      collection: null,
      search: null,
      pageObject: null,
      /* No header and no footer around a preview: only the section asked for. */
      groups: { header: [], footer: [] },
    }
  }, [])

  const value = useMemo(() => ({ theme, page, installId, failed: failed || (!!files && !theme), rows }), [theme, page, installId, failed, files, rows])
  return <CompatPreviewContext.Provider value={value}>{children}</CompatPreviewContext.Provider>
}

type PresetBlock = { id?: string; type?: string; static?: boolean; settings?: Record<string, unknown>; blocks?: PresetBlock[] }

/** The preset's blocks, with ids of their own: the compat engine reads blocks by id. */
function blocksOf(list: PresetBlock[] | undefined, path: string): StoredBlock[] {
  return (list ?? [])
    .filter((b) => typeof b?.type === "string")
    /* A static block keeps its id, which is how the section's {% content_for 'block', id: %} finds it (Horizon's carousel, its header). */
    .map((b, i) => {
      const id = typeof b.id === "string" && b.id ? b.id : `${path}-${i}`
      return { id, type: b.type as string, settings: b.settings ?? {}, ...(b.static === true ? { static: true } : {}), blocks: blocksOf(b.blocks, id) }
    })
}

/**
 * The section a card shows: its preset's settings and blocks, as adding it
 * would give. `sample`: a preset with no blocks is given a few of the
 * section's own (lib/website-builder/preview-markup.ts, sampleBlocks), for a
 * section that is all blocks and draws nothing without them.
 */
export function previewSectionFor(type: string, presetIndex: number, schema: SectionSchema, sample = false): StoredSection {
  const presets = (schema.presets ?? []) as unknown as { settings?: Record<string, unknown>; blocks?: PresetBlock[] }[]
  const preset = presets[presetIndex] ?? presets[0]
  const id = `preview-${type}-${presetIndex}`
  const blocks = blocksOf(preset?.blocks, id)
  if (sample && blocks.length === 0) return { id, type, settings: preset?.settings ?? {}, blocks: sampleBlocks(schema.blocks as never, schema.max_blocks, id).map((b) => ({ ...b, blocks: [] })) }
  return { id, type, settings: preset?.settings ?? {}, blocks }
}

/** Whether a section's preset has no blocks of its own and the section declares some it could be shown with. */
function canSample(type: string, presetIndex: number, schema: SectionSchema): boolean {
  const presets = (schema.presets ?? []) as unknown as { blocks?: PresetBlock[] }[]
  const preset = presets[presetIndex] ?? presets[0]
  return !(preset?.blocks ?? []).length && sampleBlocks(schema.blocks as never, schema.max_blocks, type).length > 0
}

/*
 * THE LAYOUT, DRAWN ONCE. Every card's document is the theme's layout (its
 * head, its stylesheets, its colour schemes) around one section, and the
 * layout is the same for all of them: drawn once a theme and kept, and only
 * the section drawn for each card. On a large theme that was most of the
 * time the dialog took to fill.
 */
const PREVIEW_SLOT = "<!--storelib-preview-section-->"
const shells = new WeakMap<CompatTheme, Map<CompatPage, string>>()

function previewShell(theme: CompatTheme, page: CompatPage): string {
  let byPage = shells.get(theme)
  if (!byPage) shells.set(theme, (byPage = new Map()))
  const hit = byPage.get(page)
  if (hit) return hit
  let shell = cleanPreview(fullPreview(theme, page, [], PREVIEW_SLOT))
  /*
    The body holds only the page's <main> around the section: the layout's
    drawers, cart, search, phone tab bar and popups are not the card's to
    show, and on a large theme they were half of every card's document.
  */
  const at = shell.indexOf(PREVIEW_SLOT)
  const body = shell.match(/<body\b[^>]*>/i)
  const mainAt = at > 0 ? shell.lastIndexOf("<main", at) : -1
  if (body && body.index !== undefined && mainAt > body.index) {
    const mainOpen = shell.slice(mainAt, shell.indexOf(">", mainAt) + 1)
    shell = `${shell.slice(0, body.index)}${body[0]}${mainOpen}${PREVIEW_SLOT}</main></body></html>`
  }
  byPage.set(page, shell)
  return shell
}

/** The whole document a card's frame shows. Exported so the rule can be read back in a test. */
export function previewDocument(theme: CompatTheme, page: CompatPage, section: StoredSection): string {
  const shell = previewShell(theme, page)
  if (shell.includes(PREVIEW_SLOT)) {
    const ctx = pageContextFor(theme, page, [section])
    const { html } = drawSection(theme, ctx, section, 0)
    return shell.replace(PREVIEW_SLOT, () => cleanPreview(html))
  }
  return cleanPreview(fullPreview(theme, page, [section]))
}

function fullPreview(theme: CompatTheme, page: CompatPage, sections: StoredSection[], content?: string): string {
  const { html } = drawPage(theme, page, sections, {
    ...(content !== undefined ? { content } : {}),
    scripts: false,
    /* No scrollbar, nothing that moves, and the page as tall as the section. */
    extraHead: "<style data-storelib-preview>html,body{margin:0!important;overflow:hidden!important;min-height:0!important;height:auto!important;background:#fff}*,*::before,*::after{animation:none!important;transition:none!important}.scroll-trigger,[class*='animate--'],[data-aos],[data-animate],[data-reveal],.reveal,.fade-in,.js-animate,.animate-on-scroll,.wow,.slick-slider,.swiper,.splide,.glide,.flickity-enabled,[x-cloak]{opacity:1!important;transform:none!important;visibility:visible!important;clip-path:none!important}.owl-carousel{display:block!important;opacity:1!important}[x-cloak]{display:revert!important}</style>",
  })
  return html
}

function cleanPreview(html: string): string {
  /* No script tag at all: the frame could not run one anyway, and each one it is handed is a console error. */
  return withoutScripts(html)
    /*
      Round BC: "previews ... sometimes display weird text". The frame runs no
      script, so the browser shows every <noscript> in it ("Please turn on
      JavaScript", a second copy of a picture), which no visitor ever sees.
      And a theme that swaps `no-js` for `js` on <html> as its first script
      (Dawn) is drawn as it is for a visitor, with `js`.
    */
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript\s*>/gi, "")
    .replace(/(<html\b[^>]*\bclass=["'][^"']*?)\bno-js\b/i, "$1js")
    /* A stylesheet loaded "print, then all on load" (Dawn's way) is simply on: the handler that would switch it cannot run here. */
    .replace(/(<link\b[^>]*?)\smedia=["']print["']([^>]*?)\sonload=(?:"[^"]*"|'[^']*')/gi, "$1$2")
    .replace(/(<link\b[^>]*?)\sonload=(?:"[^"]*"|'[^']*')([^>]*?)\smedia=["']print["']/gi, "$1$2")
    /* And no inline handler anywhere: each is a script the frame refuses, and says so in the console. */
    .replace(/(<[a-z][^>]*?)\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*')/gi, "$1")
}

/* The window a section is pictured in: its viewport heights are this tall (lib/storelib-theme/compat/preview-styles.ts). */
const WINDOW_HEIGHT_DESKTOP = 800
const WINDOW_HEIGHT_PHONE = 844

/**
 * The cards' document's own rules. Its page is see-through (the cards' names
 * and the gaps between them are the library's, under it), and each card's
 * section sits in its own copy of the theme's <main>, put where its card is,
 * cut at the card's foot, with its layout and paint kept to itself: a
 * section's fixed layer or its overflow stays inside its card.
 */
function sheetRules(width: number): string {
  return [
    "html,body{background:transparent!important;background-image:none!important;overflow:hidden!important;margin:0!important;padding:0!important;min-height:0!important;height:auto!important;border:0!important}",
    `body>[data-sl-pv]{position:absolute!important;top:0;left:0;right:auto!important;bottom:auto!important;width:${width}px!important;max-width:none!important;min-width:0!important;height:auto!important;margin:0!important;overflow:hidden!important;contain:layout paint style!important;box-sizing:border-box!important;float:none!important;transform:none!important;opacity:0;visibility:hidden}`,
    "body>[data-sl-pv][data-placed]{visibility:visible}",
    /* Measured: a section away from the screen is neither styled, laid out nor painted again until it nears it, so putting in the next one costs that one alone. */
    "body>[data-sl-pv][data-measured]{content-visibility:auto}",
    "body>[data-sl-pv][hidden]{display:none!important}",
    "body>[data-sl-pv][data-on]{opacity:1;transition:opacity 220ms cubic-bezier(0.32,0.72,0,1)!important}",
    "body>[data-sl-pv][data-on][data-instant]{transition:none!important}",
    "@media (prefers-reduced-motion:reduce){body>[data-sl-pv][data-on]{transition:none!important}}",
  ].join("\n")
}

/** The cards' document: the theme's head, an empty body, and the <main> each section is put in. Exported for its test. */
export function sheetDocument(theme: CompatTheme, page: CompatPage, rows: Record<string, string> | null, width: number, height: number): { html: string; main: string } {
  const shell = previewShell(theme, page)
  let main = ""
  const at = shell.indexOf(PREVIEW_SLOT)
  const bodyAt = shell.search(/<body\b/i)
  const mainAt = at > 0 ? shell.lastIndexOf("<main", at) : -1
  if (mainAt > bodyAt && bodyAt >= 0) main = shell.slice(mainAt, shell.indexOf(">", mainAt) + 1)
  /* Nothing in the body but what is put there: the layout's drawers and bars are no card's. */
  let html = shell.replace(/(<body\b[^>]*>)[\s\S]*(<\/body>)/i, "$1$2")
  html = freezeViewportInMarkup(inlineStylesheets(html, rows, width, height), width, height)
  html = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, () => `<style data-storelib-sheet>${sheetRules(width)}</style></head>`) : `<style data-storelib-sheet>${sheetRules(width)}</style>${html}`
  return { html, main }
}

/**
 * One section's markup for its card: its own stylesheets carried in it as
 * the theme's are (a section that links countdown.css would otherwise be
 * shown unstyled until a round trip came back), its viewport heights
 * frozen. Exported for its test.
 */
export function sectionMarkup(theme: CompatTheme, page: CompatPage, section: StoredSection, rows: Record<string, string> | null, width: number, height: number, errors?: string[]): string {
  const ctx = pageContextFor(theme, page, [section])
  const { html, errors: said } = drawSection(theme, ctx, section, 0)
  errors?.push(...said)
  return freezeViewportInMarkup(inlineStylesheets(cleanPreview(html), rows, width, height), width, height)
}

/**
 * One block's markup for Add block's preview, drawn from the block itself
 * (lib/storelib-theme/compat/theme.ts renderBlockAlone): its own markup with
 * its sample settings and the page's product, in a minimal section wrapper,
 * never the whole section it goes in. Null when the block cannot be drawn
 * alone: the library then shows its icon. Exported for its test.
 */
export function blockMarkup(theme: CompatTheme, page: CompatPage, sectionType: string, block: StoredBlock, rows: Record<string, string> | null, width: number, height: number): string | null {
  const ctx = pageContextFor(theme, page, [])
  const html = theme.renderBlockAlone(ctx, sectionType, { id: block.id, type: block.type, settings: block.settings ?? {}, blocks: (block.blocks ?? []) as never })
  if (html === null) return null
  return freezeViewportInMarkup(inlineStylesheets(cleanPreview(html), rows, width, height), width, height)
}

/*
  ═══════════════════════════════════════════════════════════════════════
   A CARD IS ITS OWN HEIGHT FROM ITS FIRST FRAME, THE SECOND TIME
  ═══════════════════════════════════════════════════════════════════════
  A card's height is only known once its section has been laid out and
  measured. The heights measured are remembered for the theme in this
  browser (a convenience: a wrong or missing one only means a card is
  measured again), so a library opened again, in this visit or the next,
  has every card at its own height before anything in it is drawn.
*/
type Heights = Record<string, number>
const heightMemory = new Map<string, Heights>()
const heightsKey = (installId: string, renderWidth: number) => `wb-compat-preview-h2:${installId}:${renderWidth}`
function rememberedHeights(installId: string, renderWidth: number): Heights {
  const k = heightsKey(installId, renderWidth)
  let hit = heightMemory.get(k)
  if (!hit) {
    hit = {}
    try {
      const raw = window.localStorage.getItem(k)
      const parsed = raw ? (JSON.parse(raw) as unknown) : null
      if (parsed && typeof parsed === "object") for (const [key, v] of Object.entries(parsed)) if (typeof v === "number" && v > 0 && v < 20_000) hit[key] = v
    } catch {
      /* no storage: measured as they come */
    }
    heightMemory.set(k, hit)
  }
  return hit
}
const heightWrites = new Map<string, number>()
function rememberHeight(installId: string, renderWidth: number, key: string, h: number) {
  const all = rememberedHeights(installId, renderWidth)
  if (all[key] === h) return
  all[key] = h
  const k = heightsKey(installId, renderWidth)
  window.clearTimeout(heightWrites.get(k))
  heightWrites.set(k, window.setTimeout(() => {
    try {
      window.localStorage.setItem(k, JSON.stringify(all))
    } catch {
      /* full or blocked: kept for this visit only */
    }
  }, 600))
}

/*
  ═══════════════════════════════════════════════════════════════════════
   WHILE SOMEBODY IS USING THE EDITOR, NOTHING IS DRAWN AHEAD
  ═══════════════════════════════════════════════════════════════════════
  Cards are drawn ahead into the closed library in idle moments, and only
  once the pointer, the keys, the wheel and every scroll have been still
  for a moment: somebody typing or scrolling the canvas is never held up by
  a card nobody has asked for. An open library is what somebody is waiting
  for, and is drawn a frame at a time, nearest the screen first.
*/
const INPUT_QUIET_MS = 1000
let lastInput = 0
/* The canvas in use (a frame, whose input never reaches this window): quiet for longer, since a heavy theme's frames come slowly and a scroll's messages with them. */
const CANVAS_QUIET_MS = 2500
let lastCanvasInput = -Infinity
let watchingInput = false
function watchInput() {
  if (watchingInput || typeof window === "undefined") return
  watchingInput = true
  const seen = () => {
    lastInput = performance.now()
  }
  const o = { capture: true, passive: true } as const
  for (const t of ["pointermove", "pointerdown", "keydown", "wheel", "touchstart"]) window.addEventListener(t, seen, o)
  document.addEventListener("scroll", seen, o)
  /* The canvas of an imported theme is a frame: its wheel and scroll never reach this window, so the canvas says it is in use (compat-canvas.tsx, CANVAS_INPUT_EVENT). */
  window.addEventListener("storelib:canvas-input", () => {
    lastCanvasInput = performance.now()
  })
}

type IdleDeadline = { timeRemaining: () => number }
function onIdle(cb: (d: IdleDeadline) => void): void {
  const w = window as Window & { requestIdleCallback?: (cb: (d: IdleDeadline) => void, o?: { timeout: number }) => number }
  if (w.requestIdleCallback) w.requestIdleCallback(cb)
  else window.setTimeout(() => cb({ timeRemaining: () => 8 }), 50)
}

/** How much of a frame an open library spends putting sections in, at most. */
const FRAME_BUDGET_MS = 8
/** How long a section's pictures may hold its fade-in back. */
const DECODE_WAIT_MS = 500
/** The card's own corner, inside its 1px border (rounded-xl). */
const CARD_RADIUS = 11
/** The shortest a card is (see CompatPreviewBox). */
const FLOOR = 64

type CardState = { height: number | undefined; state: "waiting" | "shown" | "named" }
const WAITING: CardState = { height: undefined, state: "waiting" }

interface CardEntry {
  type: string
  presetIndex: number
  schema: SectionSchema
  box: HTMLElement
  eager: boolean
}

/**
 * ===========================================================================
 *  EVERY CARD'S SECTION, IN ONE DOCUMENT
 * ===========================================================================
 * One frame lies over the whole list of cards, see-through and taking no
 * presses, scaled as the cards are. Its document is the theme's head (its
 * styles parsed once, its fonts loaded once) and, for each card, the
 * card's section in a copy of the theme's <main>, put exactly over the
 * card's picture box and cut at its foot. The library's own cards, their
 * names, their borders, their hover and their focus, are all underneath and
 * all the library's; only the picture is the frame's.
 *
 *   A SECTION IS PUT IN ONCE. Drawing it is the compat engine (about 3ms),
 *   putting it in is the browser styling and laying out one section in a
 *   document whose styles are already parsed. Both are done ahead, in the
 *   editor's quiet moments, so by the time anybody opens the library every
 *   card is drawn and scrolling it asks for nothing. One opened before then
 *   is filled a frame at a time, never more than FRAME_BUDGET_MS of one,
 *   nearest what is on screen first.
 *
 *   A PICTURE ARRIVES ONCE AND WHOLE. A card shows its grey and its shimmer
 *   until its section is placed over it with its pictures decoded; then it
 *   fades in over the grey, once (or is simply there, if nobody was looking).
 *
 *   A CATEGORY MOVES NOTHING BUT POSITIONS. A card a category hides hides
 *   its section; the ones it shows are put over their cards again, read
 *   from the cards in the same frame the library lays them out in.
 */
class PreviewSheet {
  readonly html = new Map<string, string | null>()
  readonly cards = new Map<string, CardEntry>()
  private readonly states = new Map<string, CardState>()
  private readonly listeners = new Map<string, Set<() => void>>()
  private readonly wrappers = new Map<string, HTMLElement>()
  private readonly heights = new Map<string, number>()
  private readonly blank = new Set<string>()
  private readonly failed = new Set<string>()
  /** Drawn again with a few of their own blocks, once, after drawing nothing (previewSectionFor, `sample`). */
  private readonly sampled = new Set<string>()
  /** Drawn with a Liquid error and nothing to see. */
  private readonly erred = new Set<string>()
  private doc: Document | null = null
  private proto: Element | null = null
  frame: HTMLIFrameElement | null = null
  grid: HTMLElement | null = null
  open = false
  private scheduled = false
  private syncQueued = false
  private remeasure = new Set<string>()
  private remeasureQueued = false
  private document_: { html: string; main: string } | null = null

  constructor(
    readonly theme: CompatTheme,
    readonly page: CompatPage,
    readonly rows: Record<string, string> | null,
    readonly installId: string,
    readonly renderWidth: number,
  ) {}

  get windowHeight(): number {
    return this.renderWidth < 640 ? WINDOW_HEIGHT_PHONE : WINDOW_HEIGHT_DESKTOP
  }

  /** The frame's whole document, built once. */
  get srcDoc(): string {
    if (!this.document_) {
      try {
        this.document_ = sheetDocument(this.theme, this.page, this.rows, this.renderWidth, this.windowHeight)
      } catch {
        this.document_ = { html: "<!doctype html><html><head></head><body></body></html>", main: "" }
      }
    }
    return this.document_.html
  }

  /* ── what a card reads ── */

  stateOf(key: string): CardState {
    return this.states.get(key) ?? WAITING
  }

  /** Whether the theme could not draw this card's section at all (rather than drawing nothing to see). */
  cannotDraw(key: string): boolean {
    return this.failed.has(key) || this.erred.has(key)
  }

  subscribe(key: string, l: () => void): () => void {
    let set = this.listeners.get(key)
    if (!set) this.listeners.set(key, (set = new Set()))
    set.add(l)
    return () => {
      set!.delete(l)
    }
  }

  private setState(key: string, next: Partial<CardState>) {
    const prev = this.stateOf(key)
    const merged = { ...prev, ...next }
    if (merged.height === prev.height && merged.state === prev.state) return
    this.states.set(key, merged)
    for (const l of this.listeners.get(key) ?? []) l()
  }

  register(key: string, entry: CardEntry): () => void {
    this.cards.set(key, entry)
    this.schedule()
    return () => {
      if (this.cards.get(key) === entry) this.cards.delete(key)
    }
  }

  /* ── the frame ── */

  /** The frame has (re)loaded its document: everything drawn before is put in again, nearest first. */
  attach(frame: HTMLIFrameElement) {
    this.frame = frame
    this.grid = frame.parentElement
    const doc = frame.contentDocument
    /* Not the blank page a new frame holds before its own document has loaded. */
    if (!doc?.body || doc === this.doc || doc.URL !== "about:srcdoc" || doc.readyState !== "complete") return
    this.doc = doc
    this.wrappers.clear()
    for (const [k, st] of this.states) if (st.state === "shown") this.states.set(k, { ...st, state: "waiting" })
    for (const key of this.states.keys()) for (const l of this.listeners.get(key) ?? []) l()
    /* The theme's <main>, copied for each card, so the theme's rules for what is in it still hold. */
    if (this.document_?.main) {
      const t = doc.createElement("template")
      t.innerHTML = `${this.document_.main}</main>`
      this.proto = t.content.firstElementChild
    }
    /* The page's own background under each section, as on the page: read with the frame's see-through rule off. */
    const own = doc.querySelector<HTMLStyleElement>("style[data-storelib-sheet]")
    if (own?.sheet) {
      own.sheet.disabled = true
      const v = doc.defaultView
      const b = v?.getComputedStyle(doc.body)
      const h = v?.getComputedStyle(doc.documentElement)
      const clear = (c: string | undefined) => !c || c === "transparent" || /rgba\(.*,\s*0\)$/.test(c)
      const color = !clear(b?.backgroundColor) ? b!.backgroundColor : !clear(h?.backgroundColor) ? h!.backgroundColor : "#fff"
      const image = b?.backgroundImage && b.backgroundImage !== "none" ? b.backgroundImage : "none"
      own.sheet.disabled = false
      own.appendChild(doc.createTextNode(`\nbody>[data-sl-pv]{background-color:${color};background-image:${image}}`))
    }
    /* A font that lands later changes heights: each drawn card is measured again then. */
    doc.fonts?.addEventListener?.("loadingdone", () => {
      for (const k of this.wrappers.keys()) this.remeasure.add(k)
      this.queueRemeasure()
    })
    this.sync()
    this.schedule()
  }

  /**
   * Open: what somebody may scroll to is wanted now. A picture a theme
   * loads lazily would only start loading as its card came on screen, and
   * pop in after it; it is asked for at once, quietly, in the list's order.
   */
  setOpen(open: boolean) {
    this.open = open
    if (!open || !this.doc) return
    for (const img of Array.from(this.doc.querySelectorAll<HTMLImageElement>("img[loading='lazy']"))) {
      img.setAttribute("fetchpriority", "low")
      img.loading = "eager"
    }
  }

  /* ── putting sections in ── */

  /** The cards still to put in, in the order to put them in: on screen and nearest it first while open; the list's own order while closed. */
  private pending(): string[] {
    const out: { key: string; score: number }[] = []
    const view = this.open ? this.grid?.closest("[data-library-scroll]")?.getBoundingClientRect() ?? null : null
    let i = 0
    for (const [key, card] of this.cards) {
      i++
      if (this.wrappers.has(key) || this.failed.has(key) || !card.box.isConnected) continue
      let score: number
      if (view) {
        const r = card.box.getBoundingClientRect()
        /* Hidden by the category: after everything that can be seen. Above the screen counts three times its distance: a list is mostly scrolled down. */
        score = r.height === 0 && r.width === 0 ? 1e9 + i : r.bottom < view.top ? (view.top - r.bottom) * 3 : r.top > view.bottom ? r.top - view.bottom : -1e6 + r.top
      } else {
        score = card.eager ? i - 1e6 : i
      }
      out.push({ key, score })
    }
    return out.sort((a, b) => a.score - b.score).map((x) => x.key)
  }

  private hasPending(): boolean {
    for (const [key, card] of this.cards) if (!this.wrappers.has(key) && !this.failed.has(key) && card.box.isConnected) return true
    return false
  }

  schedule() {
    if (this.scheduled || !this.doc || typeof window === "undefined") return
    if (!this.hasPending()) return
    this.scheduled = true
    watchInput()
    if (this.open) {
      /* Just after a frame is drawn, so the work has the rest of the frame to itself. */
      requestAnimationFrame(() => window.setTimeout(() => this.run(FRAME_BUDGET_MS), 0))
      return
    }
    const wait = Math.max(INPUT_QUIET_MS - (performance.now() - lastInput), CANVAS_QUIET_MS - (performance.now() - lastCanvasInput))
    if (wait > 0) {
      window.setTimeout(() => {
        this.scheduled = false
        this.schedule()
      }, wait)
      return
    }
    /* One section per idle moment at least (a section is 10 to 30ms), more while the moment has room. */
    onIdle((d) => this.run(this.open ? FRAME_BUDGET_MS : Math.min(Math.max(d.timeRemaining() - 4, 0), 30)))
  }

  private run(budget: number) {
    this.scheduled = false
    if (!this.doc) return
    const t0 = performance.now()
    let put = 0
    for (const key of this.pending()) {
      this.insert(key)
      put++
      if (performance.now() - t0 >= budget) break
    }
    if (put) this.sync()
    this.schedule()
  }

  /** A card's section, drawn: as its preset gives it, or with a few of its own blocks. Null when the theme cannot draw it. */
  private draw(card: CardEntry, sample: boolean): string | null {
    const key = `${card.type}:${card.presetIndex}`
    const errors: string[] = []
    try {
      const html = sectionMarkup(this.theme, this.page, previewSectionFor(card.type, card.presetIndex, card.schema, sample), this.rows, this.renderWidth, this.windowHeight, errors)
      /* Drawn with an error, and nothing in it: the theme cannot draw it here, which its card says rather than "once it has content". */
      if (errors.length && markupLooksEmpty(html)) this.erred.add(key)
      else this.erred.delete(key)
      return html
    } catch {
      this.erred.add(key)
      return null
    }
  }

  private insert(key: string) {
    const doc = this.doc!
    const card = this.cards.get(key)!
    let html = this.html.get(key)
    if (html === undefined) {
      html = this.draw(card, false)
      /* Nothing in it to see (a section that is all blocks, with a preset that has none): drawn with some of its blocks instead. */
      if ((html === null || markupLooksEmpty(html)) && canSample(card.type, card.presetIndex, card.schema)) {
        const withBlocks = this.draw(card, true)
        if (withBlocks !== null) html = withBlocks
        this.sampled.add(key)
      }
      this.html.set(key, html)
    }
    if (html === null) {
      this.failed.add(key)
      this.setState(key, { state: "named" })
      return
    }
    const w = (this.proto ? this.proto.cloneNode(false) : doc.createElement("div")) as HTMLElement
    w.setAttribute("data-sl-pv", key)
    w.style.minHeight = "0px"
    doc.body.appendChild(w)
    this.wrappers.set(key, w)
    this.fill(key, w, html)
  }

  /** Puts a section's markup in its wrapper, keeps its styles to it, and measures it. */
  private fill(key: string, w: HTMLElement, html: string) {
    w.innerHTML = html
    keepStylesInside(w, key)
    if (this.open) {
      for (const img of Array.from(w.querySelectorAll<HTMLImageElement>("img[loading='lazy']"))) {
        img.setAttribute("fetchpriority", "low")
        img.loading = "eager"
      }
    }
    this.measure(key, w)
    /* A picture or a stylesheet that lands later may change the height: measured again then. */
    const again = () => {
      this.remeasure.add(key)
      this.queueRemeasure()
    }
    for (const img of Array.from(w.querySelectorAll("img"))) {
      if (!img.complete) img.addEventListener("load", again, { once: true })
    }
    for (const link of Array.from(w.querySelectorAll<HTMLLinkElement>("link[rel=stylesheet]"))) {
      if (!link.sheet) link.addEventListener("load", again, { once: true })
    }
  }

  /** Its natural height, at the width it is pictured at, and whether it has anything to see. */
  private measure(key: string, w: HTMLElement) {
    /*
      Laid out for real while it is measured, whatever its distance from the
      screen, and without what fills its card. AND SHOWN while it is: a
      section put away (its card hidden by a category, or named for a moment)
      and measured again when a font or a picture landed measured 0px tall
      and was named for good, which was half of "sometimes previews show,
      sometimes they don't". sync() puts away again what should be.
    */
    w.hidden = false
    w.removeAttribute("data-measured")
    /* Inline, so a theme's own floor for its <main> (often a whole window tall) is not measured as the section. */
    w.style.minHeight = "0px"
    w.style.paddingTop = ""
    placedAt.delete(w)
    /*
      ITS OWN BOX, NOT WHAT SPILLS OUT OF IT. A header holds a menu drawer, a
      search overlay or a mega menu laid out a whole window tall and hidden
      off to the side; scrollHeight counted all of it, so a 90px header got a
      card as tall as a hero. The box's own height is what the section takes
      on a page; only a section whose box is empty (everything in it
      positioned) falls back to what it holds.
    */
    const own = w.offsetHeight
    const h = Math.ceil(own > 8 ? own : w.scrollHeight)
    const root = w.querySelector<HTMLElement>(".shopify-section") ?? w
    const shows = h > 8 && somethingToSee(root)
    if (shows) this.blank.delete(key)
    else this.blank.add(key)
    /* Laid out, still nothing to see: once, drawn again with some of its own blocks. */
    if (!shows && !this.sampled.has(key)) {
      this.sampled.add(key)
      const card = this.cards.get(key)
      const withBlocks = card && canSample(card.type, card.presetIndex, card.schema) ? this.draw(card, true) : null
      if (withBlocks !== null) {
        this.html.set(key, withBlocks)
        this.fill(key, w, withBlocks)
        return
      }
    }
    /* Skipped while away from the screen from now on, at the size it is: its own height, cut at its card's foot. */
    w.style.containIntrinsicSize = `auto ${this.renderWidth}px auto ${Math.max(1, h)}px`
    w.setAttribute("data-measured", "")
    if (h > 0 && h !== this.heights.get(key)) {
      this.heights.set(key, h)
      rememberHeight(this.installId, this.renderWidth, key, h)
    }
    const prev = this.stateOf(key)
    this.setState(key, { height: h > 0 ? h : prev.height, state: shows ? (prev.state === "named" ? "waiting" : prev.state) : "named" })
  }

  private queueRemeasure() {
    if (this.remeasureQueued) return
    this.remeasureQueued = true
    requestAnimationFrame(() => {
      this.remeasureQueued = false
      for (const key of this.remeasure) {
        const w = this.wrappers.get(key)
        if (w?.isConnected) this.measure(key, w)
      }
      this.remeasure.clear()
      this.sync()
    })
  }

  /* ── putting each section over its card ── */

  /** After the cards have committed, before the frame is drawn: a microtask runs in the same task as the commit. */
  requestSync() {
    if (this.syncQueued) return
    this.syncQueued = true
    queueMicrotask(() => {
      this.syncQueued = false
      this.sync()
    })
  }

  sync() {
    const frame = this.frame
    const grid = this.grid
    if (!frame || !grid || !this.doc || !frame.isConnected) return
    const g = grid.getBoundingClientRect()
    /* A transform over the library (the dialog's entrance) scales what is read; the cards' own offsets do not have it. */
    const zoom = grid.offsetWidth > 0 ? g.width / grid.offsetWidth : 1
    if (!(zoom > 0)) return
    let scale = 0
    for (const [key, w] of this.wrappers) {
      const card = this.cards.get(key)
      const box = card?.box
      const st = this.stateOf(key)
      if (!box || !box.isConnected || st.state === "named") {
        w.hidden = true
        continue
      }
      const r = box.getBoundingClientRect()
      if (r.width === 0 && r.height === 0) {
        w.hidden = true
        continue
      }
      const s = box.clientWidth / this.renderWidth
      if (!(s > 0)) continue
      scale = s
      w.hidden = false
      /* Written only when it moved: the same values again would still ask the frame to look. */
      /*
        The section fills its card with its page's background: a card is
        never shorter than the floor, and one held at a height it is about
        to lose (see CompatPreviewBox) is taller than its section. Under the
        floor, the section sits in the middle of it, as the library's own
        cards do; otherwise at the top.
      */
      const cardH = box.clientHeight / s
      const natural = st.height ?? cardH
      const pad = natural * s < FLOOR && natural < cardH ? (cardH - natural) / 2 : 0
      const pos = `${(r.top - g.top) / zoom / s}|${(r.left - g.left) / zoom / s}|${cardH}|${CARD_RADIUS / s}|${pad}`
      if (placedAt.get(w) !== pos) {
        placedAt.set(w, pos)
        const [top, left, max, radius] = pos.split("|")
        w.style.top = `${top}px`
        w.style.left = `${left}px`
        w.style.maxHeight = `${max}px`
        w.style.minHeight = `${max}px`
        w.style.paddingTop = pad ? `${pad}px` : ""
        w.style.borderRadius = `${radius}px`
      }
      if (!w.hasAttribute("data-placed")) {
        w.setAttribute("data-placed", "")
        this.reveal(key, w, box)
      } else if (w.hasAttribute("data-on") && st.state !== "shown") {
        /* Named for a moment (its pictures had not come yet) and back: shown again. */
        this.setState(key, { state: "shown" })
      }
    }
    if (!scale) {
      const first = [...this.cards.values()].find((c) => c.box.isConnected && c.box.clientWidth > 0)
      scale = first ? first.box.clientWidth / this.renderWidth : 0
    }
    if (scale > 0) {
      frame.style.transform = `scale(${scale})`
      frame.style.height = `${Math.ceil(grid.offsetHeight / scale)}px`
    }
  }

  /** Shown once its pictures are decoded and any stylesheet it still links has come: faded in if somebody is looking, simply there otherwise. */
  private reveal(key: string, w: HTMLElement, box: HTMLElement) {
    const imgs = Array.from(w.querySelectorAll("img")).filter((i) => !i.complete || i.naturalWidth > 0).slice(0, 12)
    const links = Array.from(w.querySelectorAll<HTMLLinkElement>("link[rel=stylesheet]")).filter((l) => !l.sheet)
    const show = () => {
      if (!w.isConnected) return
      const view = box.closest("[data-library-scroll]")?.getBoundingClientRect()
      const r = box.getBoundingClientRect()
      const seen = this.open && !!view && r.bottom > view.top && r.top < view.bottom
      if (seen) w.removeAttribute("data-instant")
      else w.setAttribute("data-instant", "")
      w.setAttribute("data-on", "")
      this.setState(key, { state: "shown" })
    }
    if (!imgs.length && !links.length) return show()
    let done = false
    const once = () => {
      if (done) return
      done = true
      show()
    }
    const loaded = (l: HTMLLinkElement) => new Promise<void>((ok) => {
      l.addEventListener("load", () => ok(), { once: true })
      l.addEventListener("error", () => ok(), { once: true })
    })
    Promise.all([...imgs.map((i) => (typeof i.decode === "function" ? i.decode().catch(() => undefined) : undefined)), ...links.map(loaded)]).then(once, once)
    window.setTimeout(once, DECODE_WAIT_MS)
  }
}

/*
  ═══════════════════════════════════════════════════════════════════════
   A CARD'S STYLES ARE ITS OWN
  ═══════════════════════════════════════════════════════════════════════
  Every card's section is in one document, so a section's own <style> with
  a rule that is not tied to its id (`h2 { display: none }`, `.title {...}`,
  `body { background }`, common in section packs) reached every other card:
  "previews can interact with each other". Each of a section's own <style>s
  is put inside an @scope of its wrapper, so its rules still see the page
  around it (`body.template-index .x` still matches) but only ever style
  what is in its card. What it says about the page itself (`:root`, `html`,
  `body`) is said about its card instead, so its colour variables still
  reach it. Fonts, keyframes and imports stay outside the scope, as they
  must. A browser without @scope has each selector put under the wrapper.
*/
const ROOT_SELECTOR = /^(?::root|html|body)(?:[.#:[][^\s>+~]*)?(?:\s*[>\s]\s*body(?:[.#:[][^\s>+~]*)?)?$/i

function splitSelectors(list: string): string[] {
  const out: string[] = []
  let depth = 0
  let from = 0
  for (let i = 0; i < list.length; i++) {
    const c = list[i]
    if (c === "(" || c === "[") depth++
    else if (c === ")" || c === "]") depth--
    else if (c === "," && depth === 0) {
      out.push(list.slice(from, i).trim())
      from = i + 1
    }
  }
  out.push(list.slice(from).trim())
  return out.filter(Boolean)
}

/** Its page-wide selectors made the card's own: `:scope` inside @scope, the wrapper itself without it. */
function retarget(rules: CSSRuleList, scope: string, scoped: boolean) {
  for (const rule of Array.from(rules)) {
    const style = rule as CSSStyleRule
    if (typeof style.selectorText === "string") {
      const parts = splitSelectors(style.selectorText)
      const next = parts.map((p) => {
        if (ROOT_SELECTOR.test(p)) return scoped ? ":scope" : scope
        if (scoped) return p
        /* Without @scope: under the wrapper, the page's own `html`/`body` taken off the front. */
        return `${scope} ${p.replace(/^(?::root|html|body)(?:[.#:[][^\s>+~]*)?\s*[>\s]?\s*(?:body(?:[.#:[][^\s>+~]*)?\s*[>\s]?\s*)?/i, "")}`
      }).join(", ")
      if (next !== style.selectorText) style.selectorText = next
      continue
    }
    const group = rule as CSSGroupingRule
    if (group.cssRules && !/^@(?:keyframes|-webkit-keyframes|font-face|font-feature-values|property|page|counter-style)/i.test(rule.cssText)) retarget(group.cssRules, scope, scoped)
  }
}

/** Each of the section's own <style>s, kept to its wrapper. Exported for its test. */
export function keepStylesInside(w: HTMLElement, key: string) {
  const win = w.ownerDocument.defaultView as (Window & { CSSScopeRule?: unknown; CSS?: { escape?: (s: string) => string } }) | null
  const esc = win?.CSS?.escape ? win.CSS.escape(key) : key.replace(/["\\]/g, "\\$&")
  const scope = `[data-sl-pv="${esc}"]`
  const scoped = !!win?.CSSScopeRule
  /*
    Not the theme's own stylesheets a section links (carried in as <style
    data-sheet-from>, lib/storelib-theme/compat/preview-styles.ts): they are
    the theme's, the same in every card and on every page, and parsing tens
    of kilobytes of them again for each card is what would make the library
    slow to fill.
  */
  for (const el of Array.from(w.querySelectorAll("style:not([data-sheet-from])"))) {
    const sheet = (el as HTMLStyleElement).sheet
    if (!sheet) continue
    try {
      retarget(sheet.cssRules, scope, scoped)
      if (!scoped) continue
      /* At-rules a scope cannot hold stay outside it; everything else goes in. */
      const outside: string[] = []
      const inside: string[] = []
      for (const rule of Array.from(sheet.cssRules)) {
        if (/^@(?:import|namespace|font-face|keyframes|-webkit-keyframes|property|page|counter-style|font-feature-values|layer\s+[^{]*;)/i.test(rule.cssText)) outside.push(rule.cssText)
        else inside.push(rule.cssText)
      }
      if (!inside.length) continue
      el.textContent = `${outside.join("\n")}\n@scope (${scope}) {\n${inside.join("\n")}\n}`
    } catch {
      /* A sheet that cannot be read stays as it was. */
    }
  }
}

/**
 * Whether a drawn section has anything to see: a picture or a field with a
 * size, or words in any element with one. Words were only looked for in a
 * list of tags (h1 to h4, p, a, span, li), so a slider of <blockquote>s, a
 * form of <label>s or a heading in an <h5> or a <div> counted as nothing and
 * its card was named instead of shown.
 */
function somethingToSee(root: HTMLElement): boolean {
  const sized = (el: Element) => {
    const r = el.getBoundingClientRect()
    return r.width >= 2 && r.height >= 2
  }
  if (Array.from(root.querySelectorAll("img, svg, video, picture, canvas, iframe, input, textarea, select, button")).some(sized)) return true
  const walk = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const el = n.parentElement
    if (!el || !(n.nodeValue ?? "").trim() || /^(STYLE|SCRIPT|TEMPLATE|NOSCRIPT)$/.test(el.tagName)) continue
    if (sized(el)) return true
  }
  return false
}

/** Where each section was last put, so an unchanged place is not written again. */
const placedAt = new WeakMap<HTMLElement, string>()

const sheets = new WeakMap<CompatTheme, Map<number, PreviewSheet>>()
function sheetFor(ctx: CompatPreviewValue, renderWidth: number): PreviewSheet | null {
  if (!ctx.theme) return null
  let byWidth = sheets.get(ctx.theme)
  if (!byWidth) sheets.set(ctx.theme, (byWidth = new Map()))
  let sheet = byWidth.get(renderWidth)
  if (!sheet) byWidth.set(renderWidth, (sheet = new PreviewSheet(ctx.theme, ctx.page, ctx.rows, ctx.installId, renderWidth)))
  return sheet
}

const noSubscribe = () => () => {}

/**
 * THE FRAME OVER THE CARDS. Put once in the list of cards (which must be
 * `position: relative`), at its top left; PreviewSheet sizes, scales and
 * fills it. `open` says the library is on screen; `layoutKey` changes with
 * whatever moves the cards (a category, a search).
 */
export function CompatPreviewSheet({ renderWidth, open, layoutKey }: { renderWidth: number; open: boolean; layoutKey: string }) {
  const ctx = useCompatPreview()
  const sheet = ctx && !ctx.failed ? sheetFor(ctx, renderWidth) : null
  const frame = useRef<HTMLIFrameElement | null>(null)
  useLayoutEffect(() => {
    if (!sheet) return
    sheet.setOpen(open)
    sheet.sync()
    sheet.schedule()
  }, [sheet, open, layoutKey])
  /* The list's width changes every card's size: put each section over its card again. */
  useEffect(() => {
    const grid = frame.current?.parentElement
    if (!sheet || !grid || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(() => sheet.sync())
    ro.observe(grid)
    return () => ro.disconnect()
  }, [sheet])
  if (!sheet) return null
  return (
    <iframe
      ref={(el) => {
        frame.current = el
        /* Already loaded (kept from an earlier render): attach now; otherwise onLoad does. */
        if (el) sheet.attach(el)
      }}
      title="Section previews"
      srcDoc={sheet.srcDoc}
      sandbox="allow-same-origin"
      tabIndex={-1}
      aria-hidden
      data-compat-sheet=""
      /* Its scale is the whole picture: the touch rule that flattens transforms inside a .group must leave it alone. */
      data-keep-transform=""
      onLoad={(e) => sheet.attach(e.currentTarget)}
      className="pointer-events-none absolute left-0 top-0 z-[1] border-0 bg-transparent"
      style={{ width: renderWidth, height: 0, transformOrigin: "0 0", overflowAnchor: "none", colorScheme: "normal" }}
    />
  )
}

export const CompatPreviewBox = memo(function CompatPreviewBox({
  type,
  presetIndex,
  schema,
  width,
  renderWidth,
  eager = false,
}: {
  type: string
  presetIndex: number
  schema: SectionSchema
  /** The card's width on screen. */
  width: number
  /** The width the section is laid out at, scaled down to the card. */
  renderWidth: number
  /** Among the first few of what the library shows: drawn first. */
  eager?: boolean
}) {
  const ctx = useCompatPreview()
  const box = useRef<HTMLDivElement | null>(null)
  const key = `${type}:${presetIndex}`
  const sheet = ctx && !ctx.failed ? sheetFor(ctx, renderWidth) : null
  useLayoutEffect(() => {
    if (!sheet || !box.current) return
    return sheet.register(key, { type, presetIndex, schema, box: box.current, eager })
  }, [sheet, key, type, presetIndex, schema, eager])
  const snap = useSyncExternalStore(sheet ? (l: () => void) => sheet.subscribe(key, l) : noSubscribe, () => sheet?.stateOf(key) ?? WAITING, () => WAITING)
  /* Measured this visit, or remembered from the last one (rememberedHeights). */
  const drawnHeight = snap.height ?? (ctx && typeof window !== "undefined" ? rememberedHeights(ctx.installId, renderWidth)[key] ?? null : null)
  /* Nothing to draw it from (its files did not come, or the section could not be drawn), or nothing to see until it is filled in: its name instead of a blank card. */
  const unavailable = !!ctx?.failed
  const named = snap.state === "named" || unavailable
  const shown = snap.state === "shown"
  const scale = width > 0 ? width / renderWidth : 0.3
  const tallest = Math.round(width * TALLEST)
  const wanted = named ? NAMED_HEIGHT : drawnHeight ? Math.max(FLOOR, Math.min(tallest, Math.ceil(drawnHeight * scale))) : Math.round(width * PLACEHOLDER_RATIO)
  /*
    NEVER SHORTER WHERE IT CAN BE SEEN. A card measured shorter than its
    placeholder while somebody is looking keeps its height, the section on
    white at its top, rather than pulling every card under it up the list;
    it takes its own height once nobody can see it change (the library
    opening again, releaseCompatHeld). Taller at once: a card that grows
    moves nothing above it.
  */
  const [kept, setKept] = useState(() => ({ h: wanted, w: width }))
  const height = kept.w === width ? kept.h : wanted
  useLayoutEffect(() => {
    if (kept.w !== width) {
      setKept({ h: wanted, w: width })
      return
    }
    if (kept.h === wanted) return
    const take = () => setKept({ h: wanted, w: width })
    if (wanted > kept.h || !inSight(box.current)) {
      take()
      return
    }
    held.add(take)
    return () => {
      held.delete(take)
    }
  }, [wanted, width, kept])
  /* Its section goes where the card now is, in the same frame. */
  useLayoutEffect(() => {
    sheet?.requestSync()
  })

  return (
    <div
      ref={box}
      data-preview-box=""
      data-compat-preview={type}
      data-compat-preview-state={named ? "named" : shown ? "shown" : "waiting"}
      className="relative w-full overflow-hidden bg-[#f3f4f6]"
      style={{ height }}
    >
      {/* Until its section is over it: a quiet light passing over the grey, so a card that is coming reads as coming. */}
      {!shown && !named ? <span aria-hidden data-compat-shimmer="" className="wb-preview-shimmer absolute inset-0" /> : null}
      {named ? <PreviewFallback title={schema.name} reason={unavailable || sheet?.cannotDraw(key) ? "unavailable" : "empty"} /> : null}
    </div>
  )
})

const TALLEST = 1.1
/** A card with nothing to picture: room for its sketch, its name and why (PreviewFallback). */
const NAMED_HEIGHT = 132

/* Cards keeping a height they are about to lose, until nobody can see them change. */
const held = new Set<() => void>()
/** Every held card takes its own height: the library calls this as it opens, before its first frame. */
export function releaseCompatHeld() {
  for (const take of [...held]) {
    held.delete(take)
    take()
  }
}

/** A card's placeholder before its section has ever been measured: a desktop section's usual shape. */
const PLACEHOLDER_RATIO = 0.5

/** Where a change in this box's height would move something somebody can see (as the library's own cards, section-library.tsx). */
function inSight(box: HTMLElement | null): boolean {
  if (!box || box.getClientRects().length === 0) return false
  const check = (box as HTMLElement & { checkVisibility?: (o?: Record<string, boolean>) => boolean }).checkVisibility
  if (typeof check === "function" && !check.call(box, { visibilityProperty: true, opacityProperty: true })) return false
  const list = box.closest("[data-library-scroll]")
  if (!list) return true
  return box.getBoundingClientRect().top < list.getBoundingClientRect().bottom
}
