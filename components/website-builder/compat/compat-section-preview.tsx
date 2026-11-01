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
import { draftAssetVersion, loadCompatFiles, useCompatFilesVersion } from "@/components/website-builder/compat/compat-files"
import { assetAddresses, templateOfPage } from "@/lib/storelib-theme/compat/install"
import { drawPage, drawSection, pageContextFor, themeOfInstall, withoutScripts, type StoredBlock, type StoredSection } from "@/lib/storelib-theme/compat/page"
import type { CompatPage, CompatTheme } from "@/lib/storelib-theme/compat/theme"
import { freezeViewportInMarkup, inlineStylesheets } from "@/lib/storelib-theme/compat/preview-styles"
import { SHEET_WAIT_MS, releaseLateSheets } from "@/lib/storelib-theme/compat/sheet-guard"
import { reportLoadProblem, reportSealed } from "@/lib/website-builder/load-guard"
import type { SectionSchema } from "@/lib/website-builder/types"
import { markupLooksEmpty, rememberedHeightOk, rememberedHeightsFrom, sampleBlocks, textTag } from "@/lib/website-builder/preview-markup"
import { PreviewFallback } from "@/components/website-builder/editor/preview-fallback"

interface CompatPreviewValue {
  theme: CompatTheme | null
  page: CompatPage
  /** Whose theme: the key the cards' heights are remembered under. */
  installId: string
  /** The install and a tag of the theme's files and settings: the heights of one version are never another's (rememberedHeights). */
  heightsId: string
  /** The theme's files could not be had: each card names its section rather than shimmering for good. */
  failed: boolean
  /** The install's files, for the stylesheets the preview document carries itself. */
  rows: Record<string, string> | null
}

const CompatPreviewContext = createContext<CompatPreviewValue | null>(null)
/** How long a closed library waits after the last change before it takes the newest (CompatPreviewProvider): as long as a Storelib theme's closed library waits to draw its previews again (section-library.tsx REWARM_AFTER_MS). */
export const CLOSED_ADOPT_MS = 10_000
/** An open library takes changes once they have been quiet this long (CompatPreviewProvider), */
export const LIVE_ADOPT_QUIET_MS = 250
/** and never later than this after the first. */
export const LIVE_ADOPT_CAP_MS = 1_200
const keptThemes = new WeakMap<Record<string, string>, { key: string; sources: Record<string, string>; theme: CompatTheme }>()

/** Whether the library's cards are an imported theme's, drawn here. */
export function useCompatPreview(): CompatPreviewValue | null {
  return useContext(CompatPreviewContext)
}

/** The theme, built once for the whole library from the install's own files. */
export function CompatPreviewProvider({
  installId,
  sources: sourcesNow,
  settings: settingsNow,
  live = true,
  children,
}: {
  installId: string
  sources: Record<string, string>
  settings: Record<string, unknown> | undefined
  /**
   * Whether somebody can see the cards (the library open, the block picker
   * up). Unset, they can. When they cannot, a change is taken once the
   * editor has been left alone (CLOSED_ADOPT_MS), not as it lands.
   */
  live?: boolean
  children: ReactNode
}) {
  const [files, setFiles] = useState<Record<string, string> | null>(null)
  const [failed, setFailed] = useState(false)
  /* A push changed the theme's code: its cards are drawn again from the new files, the old ones staying until those are here. */
  const filesVersionNow = useCompatFilesVersion(installId)
  /*
    A CLOSED LIBRARY TAKES A CHANGE WHEN THE EDITOR IS LEFT ALONE (push lag,
    round 2). Each file an agent saved made a new theme here, so a new sheet:
    its whole preview document drawn again and its frame loaded again, about
    150ms of the main thread on a store theme at a quarter speed for every
    file, while nobody was looking at a card. Closed, the newest sources,
    settings and files are taken once nothing has changed for
    CLOSED_ADOPT_MS and the browser has a moment; open, at once.
  */
  const [taken, setTaken] = useState({ sources: sourcesNow, settings: settingsNow, filesVersion: filesVersionNow })
  const newest = useRef(taken)
  newest.current = { sources: sourcesNow, settings: settingsNow, filesVersion: filesVersionNow }
  const behind = taken.sources !== sourcesNow || taken.settings !== settingsNow || taken.filesVersion !== filesVersionNow
  const behindSince = useRef<number | null>(null)
  useEffect(() => {
    if (!behind) {
      behindSince.current = null
      return
    }
    /*
      OPEN, A BURST IS TAKEN ONCE. A push or an AI run lands as several
      changes a few milliseconds apart, and each was a new theme, a new sheet
      and every card drawn again while somebody looked at them. Taken once
      nothing has changed for LIVE_ADOPT_QUIET_MS, and never later than
      LIVE_ADOPT_CAP_MS after the first.
    */
    if (live) {
      const now = performance.now()
      if (behindSince.current === null) behindSince.current = now
      const wait = Math.max(0, Math.min(LIVE_ADOPT_QUIET_MS, behindSince.current + LIVE_ADOPT_CAP_MS - now))
      const t = window.setTimeout(() => setTaken(newest.current), wait)
      return () => window.clearTimeout(t)
    }
    let idleId = 0
    const w = window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void }
    const t = window.setTimeout(() => {
      const take = () => setTaken(newest.current)
      if (w.requestIdleCallback) idleId = w.requestIdleCallback(take, { timeout: 2_000 })
      else take()
    }, CLOSED_ADOPT_MS)
    return () => {
      window.clearTimeout(t)
      if (idleId) w.cancelIdleCallback?.(idleId)
    }
  }, [behind, live, sourcesNow, settingsNow, filesVersionNow])
  const { sources, settings, filesVersion } = taken
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
    /*
      And the asset version its addresses carry (edit.<pass>): the pass is in hand before the files are
      (compat-files.ts sets it before they resolve), so this is the version of the first draw; a theme
      kept from before a pass was known is never taken for one drawn with it.
    */
    const assets = draftAssetVersion(installId)
    const key = `${installId}|${assets}|${JSON.stringify(settings ?? {})}`
    const kept = keptThemes.get(files)
    if (kept && kept.key === key && kept.sources === sources) return kept.theme
    const media = assetAddresses(rows)
    try {
      const made = themeOfInstall(rows, settings ?? {}, {
        assetUrl: (name) => media[name] ?? `/api/site-theme/assets/${installId}/${draftAssetVersion(installId)}/${encodeURIComponent(name)}`,
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

  /* The version of the theme a card's height belongs to: its files and its settings. */
  const heightsId = useMemo(() => `${installId}:${rows ? filesTag(rows, settings) : "none"}`, [installId, rows, settings])
  const value = useMemo(() => ({ theme, page, installId, heightsId, failed: failed || (!!files && !theme), rows }), [theme, page, installId, heightsId, failed, files, rows])
  return <CompatPreviewContext.Provider value={value}>{children}</CompatPreviewContext.Provider>
}

/** A short tag of a theme's files and settings: each file's name, size, and its first and last words (textTag). */
function filesTag(rows: Record<string, string>, settings: Record<string, unknown> | undefined): string {
  const parts: string[] = [JSON.stringify(settings ?? {})]
  for (const [k, v] of Object.entries(rows)) parts.push(k, String(v.length), v.slice(0, 64), v.slice(-64))
  return textTag(parts)
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
    const { html, errors } = drawSection(theme, ctx, section, 0)
    /* Closed where it ends if it left a <template> or a comment open (lib/storelib-theme/compat/seal.ts); said once. */
    reportSealed("section-preview", { [section.type]: errors })
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
 * ===========================================================================
 *  EVERY CARD'S SECTION IS IN A BOX OF THE LIBRARY'S OWN (round 45)
 * ===========================================================================
 * The owner: in Hero and banners a Before / After section's labels, halves
 * and arrow were drawn over the cards above and below it, a hero with its
 * "Pause gallery" button lay over another card, and a hero product card was
 * cut and out of line.
 *
 * Each section used to sit in a copy of the theme's own <main>, and that
 * copy was the card's frame: `position: absolute`, cut at the card's foot,
 * with `!important` on all of it. But it was the theme's element. A theme
 * that says `#MainContent { position: static !important }` (an id beats our
 * selector, so its `!important` beat ours), or `* { overflow: visible
 * !important }`, or a section whose own `main#MainContent { contain: none
 * !important }` reached it through its scope, took the frame apart: the
 * copies fell back into the page's flow one under another, each a card's
 * height lower than it should be, nothing cut, and whatever a section put
 * outside its box (a label pushed off it, a fixed control) lay over the
 * next card. scripts/check-add-section-contain.mjs on
 * tests/fixtures/shopify-escape: 68 boxes painted outside their cards, 8
 * sections off their card, before; none after.
 *
 * So the frame is not the theme's any more. It is <sl-card>, an element no
 * theme or section has a selector for, outside every section's scope, and
 * its rules are in a cascade layer declared before anything else in the
 * document: an `!important` in the first layer beats every `!important` a
 * theme or a section writes, whatever its selector. It is a hard box:
 * absolute, its own size (contain: strict, so nothing inside sizes or moves
 * it), cut (overflow: clip), its own stacking context, and the box every
 * absolute and fixed element in it is placed against. The theme's <main> is
 * inside it at its top left, the section inside that.
 */
export const CARD_TAG = "sl-card"
const CARD_LAYER = "storelib-card"
function sheetRules(width: number): string {
  const card = `body>${CARD_TAG}[data-sl-card]`
  return [
    `@layer ${CARD_LAYER}{`,
    /*
      THE PAGE ITSELF IS THE CARDS' COORDINATE SPACE, SO NOTHING MAY MOVE IT.
      This lock used to sit outside the layer, where an unlayered `!important`
      with a stronger selector beats it: a section pack's
      `body.template-index { margin-top: 40px !important }` (room under a
      fixed bar) moved every card's picture 40px down its card, over the
      name under it. In the first layer nothing in the theme can beat it.
      No zoom or transform on the page either (both would scale every card's
      place), and nothing that could scroll it. Positioned, at no offset, so
      the body holds the cards: with `position: static` the cards were the
      viewport's, and the list scrolled at 23ms a frame instead of 17
      (scripts/check-section-preview-stress.mjs PROFILE=1).
    */
    "html,body{background:transparent!important;background-image:none!important;margin:0!important;padding:0!important;min-height:0!important;height:auto!important;border:0!important;position:relative!important;inset:auto!important;zoom:1!important;transform:none!important;translate:none!important;scale:none!important;rotate:none!important;filter:none!important;backdrop-filter:none!important;perspective:none!important;contain:none!important;scroll-snap-type:none!important;scroll-behavior:auto!important}",
    /*
      THE PAGE NEVER SCROLLS, AND THE BODY NEVER CUTS. The cards are the
      body's (it is positioned), and the body holds nothing in its flow, so
      it is 0px tall: with `overflow: hidden` on it as well as on <html>,
      every card was cut away whole. Each card was measured, sized and
      marked shown, and not one pixel of it painted: the owner's empty grey
      boxes after #392 (scripts/check-section-preview-pixels.mjs). <html>
      keeps `hidden`, which is the viewport's (no scrollbar); the body is
      `visible`, so it cuts nothing. Nor may a theme hide the page until its
      scripts run (`body { opacity: 0 }` until a load class, a preloader's
      `visibility: hidden`): the cards run no script, so it would never be
      shown.
    */
    /* No gutter kept for a scrollbar it never has (a theme's `scrollbar-gutter: stable`): it cut every card's right edge 15px short. */
    "html{overflow:hidden!important;scrollbar-gutter:auto!important;scrollbar-width:none!important}",
    "body{overflow:visible!important;display:block!important;opacity:1!important;visibility:visible!important;clip-path:none!important;mask:none!important;content-visibility:visible!important}",
    `${card}{display:block!important;position:absolute!important;top:var(--sl-top,0px)!important;left:var(--sl-left,0px)!important;right:auto!important;bottom:auto!important;width:${width}px!important;height:var(--sl-h,auto)!important;min-width:0!important;max-width:none!important;min-height:0!important;max-height:none!important;margin:0!important;padding:var(--sl-pad,0px) 0 0 0!important;border:0!important;border-radius:var(--sl-r,0px)!important;box-sizing:border-box!important;overflow:clip!important;contain:strict!important;isolation:isolate!important;z-index:0!important;float:none!important;transform:none!important;translate:none!important;scale:none!important;rotate:none!important;filter:none!important;clip-path:none!important;mask:none!important;content-visibility:visible!important;opacity:0!important;visibility:hidden!important;transition:none!important;pointer-events:auto!important}`,
    /* Layout containment includes child margins and floats in the natural height,
       instead of measuring a short box with its content spilling below it. */
    `${card}>[data-sl-pv]{position:relative!important;top:0!important;left:0!important;right:auto!important;bottom:auto!important;width:100%!important;min-width:0!important;max-width:none!important;height:auto!important;min-height:0!important;max-height:none!important;margin:0!important;float:none!important;transform:none!important;translate:none!important;scale:none!important;rotate:none!important;box-sizing:border-box!important;contain:layout style!important}`,
    `${card}[data-placed]{visibility:visible!important}`,
    /* Measured: a section away from the screen is neither styled, laid out nor painted again until it nears it, so putting in the next one costs that one alone. */
    `${card}[data-measured]{content-visibility:auto!important}`,
    `${card}[hidden]{display:none!important}`,
    `${card}[data-on]{opacity:1!important;transition:opacity 220ms cubic-bezier(0.32,0.72,0,1)!important}`,
    `${card}[data-on][data-instant]{transition:none!important}`,
    `@media (prefers-reduced-motion:reduce){${card}[data-on]{transition:none!important}}`,
    "}",
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
  /* The cards' layer is named before any stylesheet of the theme's, so it is the first layer, and its !important the strongest in the document. */
  const first = `<style data-storelib-layer>@layer ${CARD_LAYER};</style>`
  html = /<head\b[^>]*>/i.test(html) ? html.replace(/<head\b[^>]*>/i, (m) => `${m}${first}`) : `${first}${html}`
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
/*
  ROUND 45: A REMEMBERED HEIGHT IS ONLY EVER THE THEME'S IT WAS MEASURED IN.
  They were kept per install and width, so a theme pushed again (a section
  rewritten, a stylesheet changed) opened its cards at the heights of the
  theme before it. The key now carries a tag of the theme's files and
  settings (heightsId, CompatPreviewProvider); what is read is checked
  (rememberedHeightsFrom: a section's key, a height a section can be), and
  the remembered heights of an install's other versions are let go.
*/
type Heights = Record<string, number>
const heightMemory = new Map<string, Heights>()
const HEIGHTS_PREFIX = "wb-compat-preview-h3:"
/* `heightsId` is the install and the tag of its files: `${installId}:${tag}`. */
const heightsKey = (heightsId: string, renderWidth: number) => `${HEIGHTS_PREFIX}${heightsId}:${renderWidth}`
const COMPAT_HEIGHT_KEY = /^[^:\s]+:\d{1,3}$/
function rememberedHeights(heightsId: string, renderWidth: number): Heights {
  const k = heightsKey(heightsId, renderWidth)
  let hit = heightMemory.get(k)
  if (!hit) {
    hit = {}
    try {
      const raw = window.localStorage.getItem(k)
      hit = rememberedHeightsFrom(raw ? (JSON.parse(raw) as unknown) : null, COMPAT_HEIGHT_KEY)
      /* The same install's other versions, and the store before round 45's: never read again. */
      const install = heightsId.slice(0, heightsId.lastIndexOf(":"))
      const stale: string[] = []
      for (let i = 0; i < window.localStorage.length; i++) {
        const other = window.localStorage.key(i)
        if (!other || other === k) continue
        if (other.startsWith(`wb-compat-preview-h2:${install}:`) || (other.startsWith(`${HEIGHTS_PREFIX}${install}:`) && other.endsWith(`:${renderWidth}`))) stale.push(other)
      }
      for (const other of stale) window.localStorage.removeItem(other)
    } catch {
      /* no storage: measured as they come */
    }
    heightMemory.set(k, hit)
  }
  return hit
}
const heightWrites = new Map<string, number>()
function rememberHeight(heightsId: string, renderWidth: number, key: string, h: number) {
  if (!rememberedHeightOk(h)) return
  const all = rememberedHeights(heightsId, renderWidth)
  if (all[key] === h) return
  all[key] = h
  const k = heightsKey(heightsId, renderWidth)
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
/** Input this recent means the list is being scrolled or used. */
const SCROLLING_MS = 200
/** How long after the last scroll or input the list counts as still (queueRefresh). */
const SCROLL_SETTLE_MS = 150
/** How many sections away from the screen are laid out again in one frame (queueRefresh). */
const REFRESH_PER_FRAME = 6
/** How much of a frame putting sections in may take while the list scrolls. */
const SCROLL_FRAME_BUDGET_MS = 4
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
  /** Sections whose layout is out of date (a picture, a stylesheet or a font came) while skipped away from the screen (queueRefresh). */
  private readonly stale = new Set<string>()
  /** Let out of content-visibility for one frame so the browser lays them out and `sizes` reports them. */
  private readonly unskipped = new Set<string>()
  private refreshQueued = false
  /** Each section's own box and its <main>, watched for their size (onSizes). */
  private sizes: ResizeObserver | null = null
  private readonly roots = new Map<string, HTMLElement>()
  private document_: { html: string; main: string } | null = null
  /** The theme stylesheets sections link, each once in the head, by its text (hoistSheets): the token the cards that link it carry. */
  private readonly shared = new Map<string, string>()
  private sharedEls: HTMLStyleElement[] = []
  /** What the document showed under the sheet before this one (shownBefore): a section drawn the same again is shown at once, without a fade. */
  private donor: Map<string, string> | null = null
  private readonly instant = new Set<string>()
  private readonly fontsLoaded = () => {
    for (const k of this.wrappers.keys()) this.stale.add(k)
    this.queueRefresh()
    for (const k of this.onScreen.keys()) this.arriving.add(k)
    this.checkOnScreen()
  }

  /* A stylesheet of the head that came late may hide what moves in (showRevealed), as well as change heights. */
  private readonly sheetLoaded = () => {
    for (const w of this.wrappers.values()) if (w.isConnected) showRevealed(w)
    this.fontsLoaded()
  }

  constructor(
    readonly theme: CompatTheme,
    readonly page: CompatPage,
    readonly rows: Record<string, string> | null,
    /** Whose theme, and which version of it: what its heights are remembered under (heightsId). */
    readonly heightsId: string,
    readonly renderWidth: number,
  ) {}

  /** Whether it has its document (attach). */
  get attached(): boolean {
    return !!this.doc && this.doc === this.frame?.contentDocument
  }

  get windowHeight(): number {
    return this.renderWidth < 640 ? WINDOW_HEIGHT_PHONE : WINDOW_HEIGHT_DESKTOP
  }

  /**
   * ANOTHER SHEET HAS THE FRAME NOW (a push gave the theme new files, so the
   * cards are drawn by a new sheet), or the library is gone. What this one
   * held of the frame's document is let go: React keeps the last render's
   * ref callback, and with it this sheet, for a while, and the document it
   * held stayed alive with it, one more after every push (Memory
   * getDOMCounters in scripts/check-editor-push-lag.mjs). Asked for again,
   * it attaches to the frame as it would to a frame that reloaded.
   */
  release(): void {
    this.watcher?.disconnect()
    this.watcher = null
    /* A section-only update can keep exactly the same srcDoc, so React
       reuses this document for the next sheet. Forgetting the map alone
       left its old pictures painted underneath the replacement cards. */
    if (this.doc) {
      const drawn = new Map<string, string>()
      for (const [key, inner] of this.wrappers) {
        const html = this.html.get(key)
        if (html && frameOf(inner).hasAttribute("data-on")) drawn.set(key, html)
      }
      shownBefore.set(this.doc, drawn)
    }
    for (const inner of this.wrappers.values()) frameOf(inner).remove()
    for (const el of this.sharedEls) el.remove()
    this.sharedEls = []
    this.shared.clear()
    this.doc?.fonts?.removeEventListener?.("loadingdone", this.fontsLoaded)
    this.sizes?.disconnect()
    this.sizes = null
    this.roots.clear()
    this.stale.clear()
    this.unskipped.clear()
    this.doc = null
    this.proto = null
    this.frame = null
    this.grid = null
    this.wrappers.clear()
  }

  /** The frame's whole document, built once. */
  get srcDoc(): string {
    if (!this.document_) {
      let made: { html: string; main: string }
      try {
        made = sheetDocument(this.theme, this.page, this.rows, this.renderWidth, this.windowHeight)
      } catch {
        made = { html: "<!doctype html><html><head></head><body></body></html>", main: "" }
      }
      /* Which document it is, read back from the document itself (attach): by what it holds, so a sheet drawn the same as the one before it takes the same document. */
      this.docTag = sheetTag(made.html)
      const tag = `<meta name="sl-sheet" content="${this.docTag}">`
      this.document_ = { ...made, html: /<head\b[^>]*>/i.test(made.html) ? made.html.replace(/<head\b[^>]*>/i, (m) => `${m}${tag}`) : `${tag}${made.html}` }
    }
    return this.document_.html
  }
  private docTag = ""

  /** Whether `doc` was loaded from this sheet's srcdoc (its tag, written first in its head). */
  private isMine(doc: Document): boolean {
    void this.srcDoc
    return doc.querySelector('meta[name="sl-sheet"]')?.getAttribute("content") === this.docTag
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

  /**
   * WHATEVER MOVES A CARD PUTS ITS SECTION BACK OVER IT (round 45). A
   * section's place is read from its card, so it is only right while
   * nothing has moved the card since: a category, a search and a card's own
   * new height said so, but a title that wrapped once Inter arrived, an
   * app's name under a card, or a card shown or hidden by its group moved
   * every card under it and said nothing, and their sections stayed where
   * the cards had been, over the next card. Every card is watched for its
   * size (shown or hidden is a size too), and any change puts every section
   * where its card now is, before that frame is painted.
   */
  private watcher: ResizeObserver | null = null
  private watch(el: Element | null, on: boolean) {
    if (!el || typeof ResizeObserver === "undefined") return
    if (!this.watcher) this.watcher = new ResizeObserver(() => this.sync())
    if (on) this.watcher.observe(el)
    else this.watcher.unobserve(el)
  }

  register(key: string, entry: CardEntry): () => void {
    this.cards.set(key, entry)
    const card = entry.box.closest("[data-library-card]")
    this.watch(entry.box, true)
    this.watch(card, true)
    this.inView(entry.box, key, true)
    this.schedule()
    return () => {
      this.watch(entry.box, false)
      this.watch(card, false)
      this.inView(entry.box, key, false)
      if (this.cards.get(key) === entry) this.cards.delete(key)
    }
  }

  /**
   * ===========================================================================
   *  WHAT IS ON SCREEN IS ALWAYS ITS SECTION'S HEIGHT
   * ===========================================================================
   * A card's height follows its section through the ResizeObserver and the
   * reads above, but a section laid out again inside a skipped card (a font
   * or a stylesheet that landed while it was away) can come on screen with
   * no notice at all, a few pixels or a picture's height short, cut at its
   * foot. So a card coming on screen, or within 100px of it (an
   * IntersectionObserver says which, nothing is read for that), has its
   * section's height read once in the next frame, and so do the cards on
   * screen when the library opens. The browser has just laid them out, so
   * each read costs nothing; once on screen a card is never skipped, and the
   * ResizeObserver follows it.
   */
  private readonly onScreen = new Map<string, Element>()
  private screen: IntersectionObserver | null = null
  private screenRoot: Element | null = null
  private checking = false
  private inView(box: HTMLElement, key: string, on: boolean) {
    if (typeof IntersectionObserver === "undefined") return
    const root = box.closest("[data-library-scroll]")
    if (!this.screen || this.screenRoot !== root) {
      this.screen?.disconnect()
      this.screenRoot = root
      this.onScreen.clear()
      this.screen = new IntersectionObserver((entries) => {
        for (const e of entries) {
          const k = (e.target as HTMLElement).dataset.slKey
          if (!k) continue
          if (e.isIntersecting) {
            this.onScreen.set(k, e.target)
            this.arriving.add(k)
          } else if (this.onScreen.get(k) === e.target) this.onScreen.delete(k)
        }
        this.checkOnScreen()
      }, { root, rootMargin: "100px 0px" })
      for (const [k, c] of this.cards) {
        c.box.dataset.slKey = k
        this.screen.observe(c.box)
      }
    }
    box.dataset.slKey = key
    if (on) this.screen.observe(box)
    else {
      this.screen.unobserve(box)
      if (this.onScreen.get(key) === box) this.onScreen.delete(key)
    }
  }

  /**
   * Cards just come on screen (or near it), and sections just let out of
   * content-visibility: each section's height is read in the next frame,
   * after the browser has laid it out. A fresh ResizeObserver observation
   * was tried instead and is not enough: a section laid out again inside a
   * skipped card can be reported at its old size, and the card stays cut.
   */
  private readonly arriving = new Set<string>()
  private checkOnScreen() {
    if (this.checking || typeof window === "undefined") return
    this.checking = true
    requestAnimationFrame(() => {
      this.checking = false
      if (!this.doc) return
      for (const key of this.arriving) {
        const w = this.wrappers.get(key)
        if (!w?.isConnected || frameOf(w).hidden) continue
        this.takeHeight(key, w, Math.max(w.offsetHeight, (this.roots.get(key) ?? w).offsetHeight))
      }
      this.arriving.clear()
    })
  }

  /* ── the frame ── */

  /** The frame has (re)loaded its document: everything drawn before is put in again, nearest first. */
  attach(frame: HTMLIFrameElement) {
    this.frame = frame
    this.grid = frame.parentElement
    /* Watched again after a release (a sheet given up and asked for again keeps its cards). */
    for (const card of this.cards.values()) {
      this.watch(card.box, true)
      this.watch(card.box.closest("[data-library-card]"), true)
    }
    const doc = frame.contentDocument
    /* Not the blank page a new frame holds before its own document has loaded, nor one still being read. */
    if (!doc?.body || doc === this.doc || doc.URL !== "about:srcdoc" || doc.readyState === "loading") return
    /*
      NOT THE DOCUMENT ON ITS WAY OUT. A push that changes the theme's head
      gives the frame a new srcdoc, and until that has loaded the frame still
      holds the old document, complete and about:srcdoc. A newer sheet took
      it for its own and drew its sections into the old theme's styles,
      measured them there, and kept those heights. A document is this
      sheet's only once it holds this sheet's own tag (srcDoc): read from
      the document, not from its load event, which a stylesheet that never
      answers holds back for good.
    */
    if (!this.isMine(doc)) return
    /*
      ITS STYLESHEETS ARE WAITED FOR, NEVER FOR GOOD (lib/storelib-theme/compat/
      sheet-guard.ts). The cards are drawn once the document has loaded, so
      none is ever measured without the theme's styles; but a stylesheet in
      its head that does not answer (a web font host, the asset route held by
      a database) held the load event, and with it every card, grey for good
      (scripts/check-compat-stalls.mjs: all 157). After SHEET_WAIT_MS the
      document is taken as it is, what has not come is let go of (it styles
      the cards when it does arrive, and they are measured again), and the
      error log is told.
    */
    if (doc.readyState !== "complete") {
      const now = performance.now()
      const seen = parsedAt.get(doc) ?? now
      if (!parsedAt.has(doc)) parsedAt.set(doc, now)
      if (now - seen < SHEET_WAIT_MS) return
      const late = releaseLateSheets(doc)
      reportLoadProblem("section-preview", `the cards' page did not load in ${SHEET_WAIT_MS / 1000}s; drawn without waiting${late.length ? `: ${late.slice(0, 6).join(", ")}` : ""}`)
    }
    this.doc?.fonts?.removeEventListener?.("loadingdone", this.fontsLoaded)
    this.doc = doc
    this.sizes?.disconnect()
    this.sizes = typeof ResizeObserver === "undefined" ? null : new ResizeObserver((entries) => this.onSizes(entries))
    this.roots.clear()
    this.stale.clear()
    this.unskipped.clear()
    this.wrappers.clear()
    this.shared.clear()
    this.sharedEls = []
    this.instant.clear()
    this.donor = shownBefore.get(doc) ?? null
    shownBefore.delete(doc)
    /* Nothing of another sheet's is left in it: whatever card or shared style is still in the page is no card of this sheet's. */
    for (const el of Array.from(doc.querySelectorAll(`body>${CARD_TAG}, style[data-sl-shared]`))) el.remove()
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
      own.appendChild(doc.createTextNode(`\nbody>${CARD_TAG}[data-sl-card]{background-color:${color};background-image:${image}}`))
    }
    /* A font that lands later changes heights: each drawn card is measured again then. */
    doc.fonts?.addEventListener?.("loadingdone", this.fontsLoaded)
    /* And so does a stylesheet of the head that came after the cards were drawn (one let go of above, or one still on its way). */
    for (const link of Array.from(doc.head?.querySelectorAll<HTMLLinkElement>("link[rel~='stylesheet']") ?? [])) {
      if (!link.sheet) link.addEventListener("load", this.sheetLoaded, { once: true })
    }
    this.sync()
    this.schedule()
    for (const key of this.onScreen.keys()) this.arriving.add(key)
    this.checkOnScreen()
  }

  /**
   * Open: what somebody may scroll to is wanted now. A picture a theme
   * loads lazily would only start loading as its card came on screen, and
   * pop in after it; it is asked for at once, quietly, in the list's order.
   */
  setOpen(open: boolean) {
    this.open = open
    if (!open || !this.doc) return
    for (const key of this.onScreen.keys()) this.arriving.add(key)
    this.checkOnScreen()
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
      /* Half as much while the list is moving under somebody's finger or wheel: a frame then is theirs first. */
      requestAnimationFrame(() => window.setTimeout(() => this.run(performance.now() - lastInput < SCROLLING_MS ? SCROLL_FRAME_BUDGET_MS : FRAME_BUDGET_MS), 0))
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
    /* Drawn exactly as the sheet before this one showed it: shown at once, not faded in again (a push that changed other sections). */
    if (this.donor?.get(key) === html) this.instant.add(key)
    /* The card's own box (sheetRules), and the theme's <main> in it. */
    const box = doc.createElement(CARD_TAG)
    box.setAttribute("data-sl-card", key)
    /*
      A card scrolled to is laid out again by the browser as it leaves
      content-visibility's skip, and the ResizeObserver says nothing then.
      Its height is read in the next frame (checkOnScreen), from the layout
      that frame did anyway.
    */
    box.addEventListener("contentvisibilityautostatechange", (e) => {
      if ((e as Event & { skipped?: boolean }).skipped !== false) return
      this.arriving.add(key)
      this.checkOnScreen()
    })
    const w = (this.proto ? this.proto.cloneNode(false) : doc.createElement("div")) as HTMLElement
    w.setAttribute("data-sl-pv", key)
    box.appendChild(w)
    doc.body.appendChild(box)
    this.wrappers.set(key, w)
    this.fill(key, w, html)
  }

  /** Puts a section's markup in its wrapper, keeps its styles to it, and measures it. */
  private fill(key: string, w: HTMLElement, html: string) {
    w.innerHTML = html
    this.hoistSheets(w)
    keepStylesInside(w, key)
    showRevealed(w)
    if (this.open) {
      for (const img of Array.from(w.querySelectorAll<HTMLImageElement>("img[loading='lazy']"))) {
        img.setAttribute("fetchpriority", "low")
        img.loading = "eager"
      }
    }
    this.measure(key, w)
    /*
      A picture or a stylesheet that lands later may change the height. On or
      near the screen the browser lays it out and `sizes` reports the new
      height in that frame; away from it its layout is skipped, so it is let
      out of content-visibility for a frame once the list is still (queueRefresh).
    */
    const again = () => {
      if (w.isConnected) showRevealed(w)
      this.stale.add(key)
      this.queueRefresh()
      if (this.onScreen.has(key)) {
        this.arriving.add(key)
        this.checkOnScreen()
      }
    }
    for (const img of Array.from(w.querySelectorAll("img"))) {
      if (!img.complete) img.addEventListener("load", again, { once: true })
    }
    for (const link of Array.from(w.querySelectorAll<HTMLLinkElement>("link[rel=stylesheet]"))) {
      if (!link.sheet) link.addEventListener("load", again, { once: true })
    }
  }

  /**
   * A THEME STYLESHEET A SECTION LINKS REACHES ONLY THE CARDS THAT LINK IT.
   * It was left inside the section, a <style> in the body of the one
   * document every card is in, so it styled every card from the moment that
   * section was put in: a section pack's `#MainContent { padding-top }` or
   * `h2 { font-size }` moved and grew every other card's section after it
   * had been measured, and its picture was cut mid line. Each linked sheet
   * is now put in the head once (by its whole text), in an @scope of the
   * cards that link it, and a card carries the token of each it links.
   */
  private hoistSheets(w: HTMLElement) {
    const doc = this.doc
    if (!doc?.head) return
    const tokens: string[] = []
    for (const el of Array.from(w.querySelectorAll<HTMLStyleElement>("style[data-sheet-from]"))) {
      const text = el.textContent ?? ""
      const media = el.getAttribute("media") ?? ""
      const id = `${media}|${sheetTag(text)}`
      let token = this.shared.get(id)
      if (!token) {
        token = `s${++sharedSheetCount}`
        const copy = doc.createElement("style")
        copy.setAttribute("data-sl-shared", token)
        copy.setAttribute("data-sheet-from", el.getAttribute("data-sheet-from") ?? "")
        if (media) copy.setAttribute("media", media)
        copy.textContent = text
        doc.head.appendChild(copy)
        keepStyleTo(copy, `[data-sl-sheets~="${token}"]`)
        this.shared.set(id, token)
        this.sharedEls.push(copy)
      }
      if (!tokens.includes(token)) tokens.push(token)
      el.remove()
    }
    if (tokens.length) w.setAttribute("data-sl-sheets", tokens.join(" "))
    else w.removeAttribute("data-sl-sheets")
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
    const box = frameOf(w)
    box.hidden = false
    box.removeAttribute("data-measured")
    /* A theme's own floor for its <main> (often a whole window tall) is not measured as the section: the cards' layer has it at 0, and inline too. */
    w.style.minHeight = "0px"
    placedAt.delete(box)
    /*
      ITS OWN BOX, NOT WHAT SPILLS OUT OF IT. A header holds a menu drawer, a
      search overlay or a mega menu laid out a whole window tall and hidden
      off to the side; scrollHeight counted all of it, so a 90px header got a
      card as tall as a hero. The box's own height is what the section takes
      on a page; only a section whose box is empty (everything in it
      positioned) falls back to what it holds.
    */
    const root = w.querySelector<HTMLElement>(".shopify-section") ?? w
    /* Negative section margins can make the containing flow shorter than
       the section's own box. They must not shrink its preview crop. */
    const own = Math.max(w.offsetHeight, root.offsetHeight)
    const h = Math.ceil(own > 8 ? own : w.scrollHeight)
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
    /* Skipped while away from the screen from now on: its box is its card's size whatever it holds (contain: strict), so skipping it moves nothing. */
    box.setAttribute("data-measured", "")
    /* Watched from now on: any later change in its height arrives with the browser's own layout, nothing forced. */
    if (this.sizes) {
      const was = this.roots.get(key)
      if (was && was !== root) this.sizes.unobserve(was)
      this.roots.set(key, root)
      this.sizes.observe(w)
      if (root !== w) this.sizes.observe(root)
    }
    if (h > 0 && h !== this.heights.get(key)) this.heights.set(key, h)
    if (h > 0 && this.settled(w)) rememberHeight(this.heightsId, this.renderWidth, key, h)
    const prev = this.stateOf(key)
    this.setState(key, { height: h > 0 ? h : prev.height, state: shows ? (prev.state === "named" ? "waiting" : prev.state) : "named" })
  }

  /**
   * Whether a section's height is final: its pictures are in and the
   * document's fonts have loaded. Only such a height is remembered. One
   * measured before a picture had a size, or in the fallback font, was
   * remembered too, and the next opening held the card at it (a remembered
   * height never moves the list) with the section cut at its foot.
   */
  private settled(w: HTMLElement): boolean {
    if (this.doc?.fonts && this.doc.fonts.status !== "loaded") return false
    return Array.from(w.querySelectorAll("img")).every((img) => img.complete)
  }

  /**
   * ===========================================================================
   *  A SECTION'S NEW HEIGHT ARRIVES WITH THE BROWSER'S OWN LAYOUT
   * ===========================================================================
   * Measuring again after a picture or a font came was offsetHeight read
   * card by card, each read laying out the whole cards' document there and
   * then, a few every frame: the list scrolled at 23ms a frame where it had
   * scrolled at 17. Each section's box is watched instead (a ResizeObserver
   * in this window can watch elements in the frame's document), so its
   * height comes from the layout the browser does for the frame anyway.
   */
  private onSizes(entries: ResizeObserverEntry[]) {
    const keys = new Set<string>()
    for (const e of entries) {
      const size = e.borderBoxSize?.[0]?.blockSize ?? e.contentRect.height
      measuredSize.set(e.target, size)
      const key = (e.target as HTMLElement).closest?.("[data-sl-pv]")?.getAttribute("data-sl-pv")
      if (key) keys.add(key)
    }
    for (const key of keys) {
      const w = this.wrappers.get(key)
      if (!w?.isConnected) continue
      const root = this.roots.get(key) ?? w
      this.takeHeight(key, w, Math.max(measuredSize.get(w) ?? 0, measuredSize.get(root) ?? 0))
    }
    /* The page never scrolls (sheetRules), but find in page or a re-snap can still scroll it; read here, where its layout is already done. */
    const page = this.doc?.scrollingElement
    if (page && (page.scrollTop !== 0 || page.scrollLeft !== 0)) page.scrollTo(0, 0)
  }

  /** A section's height, as the browser laid it out. Nothing laid out (a card put away, or skipped) is not a height; a section with nothing to see was named by measure. */
  private takeHeight(key: string, w: HTMLElement, own: number) {
    if (!(own > 8)) return
    const h = Math.ceil(own)
    if (h === this.heights.get(key)) return
    this.heights.set(key, h)
    if (this.settled(w)) rememberHeight(this.heightsId, this.renderWidth, key, h)
    this.setState(key, { height: h })
  }

  /**
   * Sections laid out again away from the screen, a few a frame, nearest
   * first, never while the list is moving: each is let out of
   * content-visibility for one frame (the browser lays it out in that
   * frame's own layout, and `sizes` reports it), then skipped again.
   */
  private queueRefresh() {
    if (this.refreshQueued || typeof window === "undefined") return
    this.refreshQueued = true
    requestAnimationFrame(() => {
      this.refreshQueued = false
      /* Laid out by the browser in the frame just drawn, and read (checkOnScreen): skipped again. */
      for (const key of this.unskipped) {
        const w = this.wrappers.get(key)
        if (w?.isConnected) frameOf(w).setAttribute("data-measured", "")
      }
      this.unskipped.clear()
      if (!this.stale.size || !this.doc) return
      const still = performance.now() - lastInput
      if (this.open && still < SCROLL_SETTLE_MS) {
        this.refreshQueued = true
        window.setTimeout(() => {
          this.refreshQueued = false
          this.queueRefresh()
        }, SCROLL_SETTLE_MS - still)
        return
      }
      const view = this.open ? this.grid?.closest("[data-library-scroll]")?.getBoundingClientRect() ?? null : null
      const distance = (key: string) => {
        const r = view ? this.cards.get(key)?.box.getBoundingClientRect() : null
        if (!view || !r) return 0
        return r.bottom < view.top ? view.top - r.bottom : r.top > view.bottom ? r.top - view.bottom : 0
      }
      /* A card put away (its category hidden) stays to be laid out when it is shown again (sync). */
      const ready = [...this.stale].filter((key) => {
        const w = this.wrappers.get(key)
        if (!w?.isConnected) this.stale.delete(key)
        return !!w?.isConnected && !frameOf(w).hidden
      })
      if (!ready.length) return
      const next = ready.map((key) => ({ key, d: distance(key) })).sort((a, b) => a.d - b.d).slice(0, REFRESH_PER_FRAME)
      for (const { key } of next) {
        this.stale.delete(key)
        frameOf(this.wrappers.get(key)!).removeAttribute("data-measured")
        this.unskipped.add(key)
        /* Read in the next frame: the ResizeObserver says nothing for a section put away (0) and shown again inside a skipped card. */
        this.arriving.add(key)
      }
      this.checkOnScreen()
      this.queueRefresh()
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
    /* Read the host boxes together before writing to the preview document.
       offsetWidth rounds fractional CSS pixels; treating that rounding as a
       dialog transform made the error accumulate down a long list. */
    const targets = [...this.wrappers].map(([key, inner]) => {
      const box = this.cards.get(key)?.box
      const st = this.stateOf(key)
      const rect = box?.isConnected && st.state !== "named" ? box.getBoundingClientRect() : null
      return { key, inner, box, st, rect }
    })
    const first = targets.find((t) => t.rect && t.rect.width > 0 && t.box)
    if (!first?.box) {
      for (const { inner } of targets) frameOf(inner).hidden = true
      return
    }
    const width = Number.parseFloat(getComputedStyle(first.box).width)
    const scale = width / this.renderWidth
    if (!(scale > 0)) return
    frame.style.transform = `scale(${scale})`
    frame.style.height = `${Math.ceil(grid.getBoundingClientRect().height / first.rect!.width * this.renderWidth)}px`
    /* The frame supplies the exact origin and scale, including the dialog's
       entrance transform and browser zoom. Never reconstruct them from an
       integer offsetWidth. */
    const surface = frame.getBoundingClientRect()
    const paintedScale = surface.width / this.renderWidth
    if (!(paintedScale > 0)) return
    let reshown = false
    for (const { key, inner, box, st, rect: r } of targets) {
      const w = frameOf(inner)
      if (!box || !r || !(r.width > 0) || !(r.height > 0)) {
        w.hidden = true
        continue
      }
      /* Shown again after being put away: what changed meanwhile (a picture, a font) is laid out and read once (queueRefresh). */
      if (w.hidden) {
        this.stale.add(key)
        reshown = true
      }
      w.hidden = false
      /* Written only when it moved: the same values again would still ask the frame to look. */
      /*
        The section fills its card with its page's background: a card is
        never shorter than the floor, and one held at a height it is about
        to lose (see CompatPreviewBox) is taller than its section. Under the
        floor, the section sits in the middle of it, as the library's own
        cards do; otherwise at the top.
      */
      const cardH = r.height / paintedScale
      const natural = st.height ?? cardH
      const pad = natural * scale < FLOOR && natural < cardH ? (cardH - natural) / 2 : 0
      const pos = `${(r.top - surface.top) / paintedScale}|${(r.left - surface.left) / paintedScale}|${cardH}|${CARD_RADIUS / scale}|${pad}`
      if (placedAt.get(w) !== pos) {
        placedAt.set(w, pos)
        const [top, left, height, radius] = pos.split("|")
        /* Read by the cards' layer (sheetRules), whose !important nothing in the theme can beat. */
        w.style.setProperty("--sl-top", `${top}px`)
        w.style.setProperty("--sl-left", `${left}px`)
        w.style.setProperty("--sl-h", `${height}px`)
        w.style.setProperty("--sl-r", `${radius}px`)
        w.style.setProperty("--sl-pad", `${pad}px`)
      }
      if (!w.hasAttribute("data-placed")) {
        w.setAttribute("data-placed", "")
        this.reveal(key, inner, box)
      } else if (w.hasAttribute("data-on") && st.state !== "shown") {
        /* Named for a moment (its pictures had not come yet) and back: shown again. */
        this.setState(key, { state: "shown" })
      }
    }
    if (reshown) this.queueRefresh()
  }

  /**
   * ===========================================================================
   *  A CARD SAID SHOWN IS LOOKED AT, NOT ONLY MEASURED
   * ===========================================================================
   * After #392 every card was measured, sized and marked shown while the
   * body of the cards' document, 0px tall and `overflow: hidden`, cut all
   * of them away: empty grey boxes, and nothing anywhere said so. A card
   * shown on screen is checked a moment later in the cards' document
   * itself: the browser's own hit test at a few points of its box (which
   * honours every clip, opacity and visibility above it) must reach the
   * card. If it does not, the card is put over its box again once; if it
   * still cannot be reached, the error log is told what cut it.
   */
  private reportedUnseen = false
  private verify(key: string, retried: boolean) {
    const inner = this.wrappers.get(key)
    if (!inner?.isConnected || !this.doc || !this.open || !this.onScreen.has(key)) return
    const box = frameOf(inner)
    if (box.hidden || !box.hasAttribute("data-on")) return
    const why = unseenBecause(box)
    if (!why) return
    if (!retried) {
      placedAt.delete(box)
      this.sync()
      requestAnimationFrame(() => this.verify(key, true))
      return
    }
    if (this.reportedUnseen) return
    this.reportedUnseen = true
    reportLoadProblem("section-preview", `a card marked shown cannot be seen in the cards' page (${why}): ${key}`)
  }

  /** Shown once its pictures are decoded and any stylesheet it still links has come: faded in if somebody is looking, simply there otherwise. */
  private reveal(key: string, inner: HTMLElement, box: HTMLElement) {
    const w = frameOf(inner)
    const imgs = Array.from(inner.querySelectorAll("img")).filter((i) => !i.complete || i.naturalWidth > 0).slice(0, 12)
    const links = Array.from(inner.querySelectorAll<HTMLLinkElement>("link[rel=stylesheet]")).filter((l) => !l.sheet)
    const show = (again = false) => {
      if (!w.isConnected) return
      const view = box.closest("[data-library-scroll]")?.getBoundingClientRect()
      const r = box.getBoundingClientRect()
      const seen = !again && this.open && !!view && r.bottom > view.top && r.top < view.bottom
      if (seen) w.removeAttribute("data-instant")
      else w.setAttribute("data-instant", "")
      w.setAttribute("data-on", "")
      /* Said on the section's own <main> as well, for what reads a drawn card (scripts/check-preview-reliability.ts). */
      inner.setAttribute("data-on", "")
      this.setState(key, { state: "shown" })
      window.setTimeout(() => this.verify(key, false), VERIFY_AFTER_MS)
    }
    if (!imgs.length && !links.length) return show()
    if (this.instant.delete(key)) {
      w.setAttribute("data-instant", "")
      return show(true)
    }
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
  const win = w.ownerDocument.defaultView as (Window & { CSS?: { escape?: (s: string) => string } }) | null
  const esc = win?.CSS?.escape ? win.CSS.escape(key) : key.replace(/["\\]/g, "\\$&")
  /*
    Not the theme's own stylesheets a section links (carried in as <style
    data-sheet-from>, lib/storelib-theme/compat/preview-styles.ts): those are
    taken out of the section and put in the head once each, kept to the
    cards that link them (PreviewSheet.hoistSheets).
  */
  for (const el of Array.from(w.querySelectorAll<HTMLStyleElement>("style:not([data-sheet-from])"))) keepStyleTo(el, `[data-sl-pv="${esc}"]`)
}

/** One <style>'s rules made to reach only what is inside `scope`: in an @scope where there is one, under the selector otherwise. */
function keepStyleTo(el: HTMLStyleElement, scope: string) {
  const win = el.ownerDocument.defaultView as (Window & { CSSScopeRule?: unknown }) | null
  const scoped = !!win?.CSSScopeRule
  const sheet = el.sheet
  if (!sheet) return
  try {
    retarget(sheet.cssRules, scope, scoped)
    if (!scoped) return
    /* At-rules a scope cannot hold stay outside it; everything else goes in. */
    const outside: string[] = []
    const inside: string[] = []
    for (const rule of Array.from(sheet.cssRules)) {
      if (/^@(?:import|namespace|font-face|keyframes|-webkit-keyframes|property|page|counter-style|font-feature-values|layer\s+[^{]*;)/i.test(rule.cssText)) outside.push(rule.cssText)
      else inside.push(rule.cssText)
    }
    if (!inside.length) return
    el.textContent = `${outside.join("\n")}\n@scope (${scope}) {\n${inside.join("\n")}\n}`
  } catch {
    /* A sheet that cannot be read stays as it was. */
  }
}

/** A short tag of a stylesheet's whole text: two linked copies are one only when every character is the same. */
function sheetTag(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193)
  return `${text.length}:${(h >>> 0).toString(36)}`
}
/** Unique across every sheet and document, so a document a newer sheet reuses never confuses one sheet's shared styles with another's. */
let sharedSheetCount = 0

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

/*
  ═══════════════════════════════════════════════════════════════════════
   WHAT A THEME SHOWS WITH A SCRIPT IS SHOWN
  ═══════════════════════════════════════════════════════════════════════
  A card runs no script, and its document has every animation off. A theme
  that hides a piece until its script reveals it (Materia's
  `<motion-element class="opacity-0">` with a failsafe animation that never
  plays, a countdown's `[data-cd-reveal]:not(.is-revealed) { opacity: 0 }`,
  a `.reveal` that waits for an IntersectionObserver) left that piece
  invisible for good: a slideshow whose heading and text were there, sized,
  and never seen. The preview's own rules (fullPreview) cover the usual
  class names; this covers the rest. Only an element whose tag, class or
  attribute names says it moves in, that is hidden, and that holds words or
  a picture, is shown, inline and `!important`, as the script would have.
*/
const MOTION_NAME = /reveal|motion|aos|animat|scroll-trigger|opacity-0|wow|appear|in-?view|fade-?(?:in|up|down|left|right)|data-sal|lazy-?show/i
function showRevealed(w: HTMLElement): void {
  const v = w.ownerDocument.defaultView
  if (!v) return
  for (const el of Array.from(w.querySelectorAll<HTMLElement>("*"))) {
    const names = `${el.localName} ${typeof el.className === "string" ? el.className : ""} ${el.getAttributeNames().join(" ")}`
    if (!MOTION_NAME.test(names)) continue
    const c = v.getComputedStyle(el)
    const hidden = Number.parseFloat(c.opacity) < 0.05 || c.visibility === "hidden" || (c.clipPath !== "none" && /inset\(\s*(?:0[^)]*100%|100%)/.test(c.clipPath))
    if (!hidden || (!(el.textContent ?? "").trim() && !el.querySelector("img, svg, picture, video"))) continue
    el.style.setProperty("opacity", "1", "important")
    el.style.setProperty("visibility", "visible", "important")
    el.style.setProperty("clip-path", "none", "important")
    el.style.setProperty("transform", "none", "important")
    el.style.setProperty("translate", "none", "important")
    el.style.setProperty("filter", "none", "important")
  }
}

/** How long after a card is shown it is checked for being seen (PreviewSheet.verify): past its fade. */
const VERIFY_AFTER_MS = 1200

/**
 * Why a card's box cannot be seen in its document, or null when it can: the
 * browser's hit test at three points of it reaches the card (the cards'
 * layer gives it pointer-events; the frame itself takes none). Exported for
 * its test.
 */
export function unseenBecause(box: HTMLElement): string | null {
  const doc = box.ownerDocument
  const v = doc.defaultView
  if (!v) return null
  const own = v.getComputedStyle(box)
  if (own.visibility !== "visible") return "card hidden"
  if (Number.parseFloat(own.opacity) < 0.05) return "card transparent"
  const r = box.getBoundingClientRect()
  if (!(r.width > 0 && r.height > 0)) return "card has no size"
  let tried = 0
  for (const [fx, fy] of [[0.5, 0.5], [0.2, 0.2], [0.8, 0.8]]) {
    const x = r.left + r.width * fx
    const y = r.top + Math.min(r.height * fy, 400)
    if (x < 0 || y < 0 || x >= v.innerWidth || y >= v.innerHeight) continue
    tried++
    if (doc.elementsFromPoint(x, y).some((e) => e === box || box.contains(e))) return null
  }
  if (!tried) return null
  for (let e = box.parentElement; e; e = e.parentElement) {
    const c = v.getComputedStyle(e)
    const er = e.getBoundingClientRect()
    if (Number.parseFloat(c.opacity) < 0.05 || c.visibility !== "visible") return `${e.localName} is not visible`
    if (c.overflow !== "visible" && (er.bottom < r.bottom || er.right < r.left + 1)) return `${e.localName} cuts it: overflow ${c.overflow}, ${Math.round(er.height)}px tall`
  }
  return "covered"
}

/** When each of the frame's documents was first seen read but not loaded (PreviewSheet.attach, SHEET_WAIT_MS). */
const parsedAt = new WeakMap<Document, number>()
/** What a document showed when its sheet was given up: each shown section's markup, by card. */
const shownBefore = new WeakMap<Document, Map<string, string>>()
/** The last size the browser reported for a section's box or its <main> (PreviewSheet.onSizes). */
const measuredSize = new WeakMap<Element, number>()
/** Where each section was last put, so an unchanged place is not written again. */
const placedAt = new WeakMap<HTMLElement, string>()
/** A section's card box in the cards' document (sheetRules): its <main>'s parent. */
const frameOf = (inner: HTMLElement): HTMLElement => (inner.parentElement && inner.parentElement.localName === CARD_TAG ? inner.parentElement : inner)

const sheets = new WeakMap<CompatTheme, Map<number, PreviewSheet>>()
function sheetFor(ctx: CompatPreviewValue, renderWidth: number): PreviewSheet | null {
  if (!ctx.theme) return null
  let byWidth = sheets.get(ctx.theme)
  if (!byWidth) sheets.set(ctx.theme, (byWidth = new Map()))
  let sheet = byWidth.get(renderWidth)
  if (!sheet) byWidth.set(renderWidth, (sheet = new PreviewSheet(ctx.theme, ctx.page, ctx.rows, ctx.heightsId, renderWidth)))
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
  /* Remove the previous sheet's pictures before paint, even when its srcDoc
     is unchanged. Reattach here too for effect cleanup/setup replay. */
  useLayoutEffect(() => {
    if (!sheet) return
    if (frame.current) sheet.attach(frame.current)
    return () => sheet.release()
  }, [sheet])
  /*
    NOT ONLY AT ITS LOAD EVENT. A document whose load never comes (a
    stylesheet that does not answer) is looked at again a few times a second
    until it is this sheet's, then taken as it is after SHEET_WAIT_MS
    (attach). Nothing is looked at once the sheet has its document.
  */
  useEffect(() => {
    if (!sheet) return
    const t = window.setInterval(() => {
      if (sheet.attached) return window.clearInterval(t)
      if (frame.current) sheet.attach(frame.current)
    }, 250)
    return () => window.clearInterval(t)
  }, [sheet])
  /* The list's width changes every card's size: put each section over its card again. */
  useEffect(() => {
    const grid = frame.current?.parentElement
    if (!sheet || !grid || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(() => sheet.sync())
    ro.observe(grid)
    /* A card put in, taken out or shown by a category, whatever React did or did not render around it: every section put back over its card before paint. */
    /* Only the cards themselves: a card's shimmer or name coming and going inside it moves nothing its ResizeObserver would not see. */
    const mo = typeof MutationObserver === "undefined" ? null : new MutationObserver(() => sheet.requestSync())
    mo?.observe(grid, { childList: true })
    const shown = typeof MutationObserver === "undefined" ? null : new MutationObserver((records) => {
      if (records.some((r) => (r.target as HTMLElement).parentElement === grid)) sheet.requestSync()
    })
    shown?.observe(grid, { subtree: true, attributes: true, attributeFilter: ["hidden"] })
    return () => {
      ro.disconnect()
      mo?.disconnect()
      shown?.disconnect()
    }
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
  const remembered = snap.height === undefined && ctx && typeof window !== "undefined" ? rememberedHeights(ctx.heightsId, renderWidth)[key] ?? null : null
  const drawnHeight = snap.height ?? remembered
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
  /*
    AND NEVER TALLER WHERE IT CAN BE SEEN, WHEN ITS HEIGHT WAS ONLY
    REMEMBERED (round 45). A card at a height read from this browser's
    memory that turns out shorter than its section keeps that height too,
    the section cut at its foot, rather than pushing every card under it
    down the list: a wrong remembered height can mis-size a card for a
    moment, never move the list.

    EXCEPT ONCE ITS SECTION IS MEASURED. The owner: a picture cut in half
    or a heading cut mid line is worse than the list under it moving down.
    A card grows to its section as soon as the section is measured, whether
    its height until then was remembered or a placeholder. Only a height
    from memory never grows a card in sight, and nothing ever shrinks one.
  */
  const fromMemory = remembered !== null && !named
  const [kept, setKept] = useState(() => ({ h: wanted, w: width, mem: fromMemory }))
  const height = kept.w === width ? kept.h : wanted
  useLayoutEffect(() => {
    if (kept.w !== width) {
      setKept({ h: wanted, w: width, mem: fromMemory })
      return
    }
    /* A replacement sheet has not measured this section yet. Keep the
       existing card instead of expanding it back to a placeholder, which
       moved the list and then left that extra height held until reopening. */
    if (!named && drawnHeight === null) return
    if (kept.h === wanted) {
      if (kept.mem && !fromMemory) setKept({ h: wanted, w: width, mem: false })
      return
    }
    const take = () => setKept({ h: wanted, w: width, mem: fromMemory })
    if ((wanted > kept.h && (!kept.mem || !fromMemory)) || !inSight(box.current)) {
      take()
      return
    }
    held.add(take)
    return () => {
      held.delete(take)
    }
  }, [wanted, width, kept, fromMemory, named, drawnHeight])
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
      /* A hard box, as the library's own cards are (section-library.tsx PreviewBox); its section is in the cards' frame, in a box of the same size (sheetRules). */
      style={{ height, contain: "strict", overflow: "clip", isolation: "isolate" }}
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
