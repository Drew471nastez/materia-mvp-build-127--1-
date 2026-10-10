"use client"

/**
 * ===========================================================================
 *  ADD A SECTION, FOR A THEME IMPORTED FROM SHOPIFY
 * ===========================================================================
 * The library drew every card with Storelib's own section renderer. An
 * imported theme's sections are Shopify sections, drawn by the compat engine
 * (lib/storelib-theme/compat), so Storelib's renderer had nothing to draw
 * and every card came out an empty white box with a name under it.
 *
 * Here a card is drawn the way the canvas and the website draw a page
 * (lib/storelib-theme/compat/page.ts, drawPage), with that one section as
 * the page's only content: the theme's own layout, so its colour schemes,
 * CSS variables and body classes are there; its stylesheets and the fonts
 * its settings name; and the section's preset settings and blocks.
 *
 * WITH NONE OF ITS SCRIPTS. The page is drawn without them (withoutScripts)
 * and the frame has no allow-scripts, so a preview can run nothing: forty
 * copies of a theme's sliders and observers in a closed dialog is what the
 * editor would otherwise pay for. allow-same-origin is there so the library
 * can read the section's height and size the card to it; with no scripts in
 * the frame there is nothing in it that could use that origin.
 *
 * DRAWN WHEN SEEN. A card builds its frame the first time it comes near the
 * screen, once, and keeps it.
 */
import { createContext, memo, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { loadCompatFiles } from "@/components/website-builder/compat/compat-canvas"
import { assetAddresses, templateOfPage } from "@/lib/storelib-theme/compat/install"
import { drawPage, drawSection, pageContextFor, themeOfInstall, withoutScripts, type StoredBlock, type StoredSection } from "@/lib/storelib-theme/compat/page"
import type { CompatPage, CompatTheme } from "@/lib/storelib-theme/compat/theme"
import type { SectionSchema } from "@/lib/website-builder/types"

interface CompatPreviewValue {
  theme: CompatTheme | null
  page: CompatPage
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
  useEffect(() => {
    let live = true
    void loadCompatFiles(installId).then((f) => {
      if (live) setFiles(f)
    })
    return () => {
      live = false
    }
  }, [installId])

  const theme = useMemo(() => {
    if (!files) return null
    /* The same theme for every opening of the dialog while nothing it is made of changed: its parsed files and its drawn layout are kept with it. */
    const key = `${installId}|${JSON.stringify(settings ?? {})}`
    const kept = keptThemes.get(files)
    if (kept && kept.key === key && kept.sources === sources) return kept.theme
    const rows = { ...sources, ...files }
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
  }, [files, sources, settings, installId])

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
      shop: { name: "My store", currency: "USD", moneyFormat: "${{amount}}" },
      product: null,
      collection: null,
      search: null,
      pageObject: null,
      /* No header and no footer around a preview: only the section asked for. */
      groups: { header: [], footer: [] },
    }
  }, [])

  const value = useMemo(() => ({ theme, page }), [theme, page])
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

/** The section a card shows: its preset's settings and blocks, as adding it would give. */
export function previewSectionFor(type: string, presetIndex: number, schema: SectionSchema): StoredSection {
  const presets = (schema.presets ?? []) as unknown as { settings?: Record<string, unknown>; blocks?: PresetBlock[] }[]
  const preset = presets[presetIndex] ?? presets[0]
  const id = `preview-${type}-${presetIndex}`
  return { id, type, settings: preset?.settings ?? {}, blocks: blocksOf(preset?.blocks, id) }
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
    extraHead: "<style data-storelib-preview>html,body{margin:0!important;overflow:hidden!important;min-height:0!important;height:auto!important;background:#fff}*,*::before,*::after{animation:none!important;transition:none!important}.scroll-trigger,[class*='animate--'],[data-aos],[data-animate],[data-reveal],.reveal,.fade-in,.js-animate,.animate-on-scroll,.wow{opacity:1!important;transform:none!important;visibility:visible!important;clip-path:none!important}</style>",
  })
  return html
}

function cleanPreview(html: string): string {
  /* No script tag at all: the frame could not run one anyway, and each one it is handed is a console error. */
  return withoutScripts(html)
    /* A stylesheet loaded "print, then all on load" (Dawn's way) is simply on: the handler that would switch it cannot run here. */
    .replace(/(<link\b[^>]*?)\smedia=["']print["']([^>]*?)\sonload=(?:"[^"]*"|'[^']*')/gi, "$1$2")
    .replace(/(<link\b[^>]*?)\sonload=(?:"[^"]*"|'[^']*')([^>]*?)\smedia=["']print["']/gi, "$1$2")
    /* And no inline handler anywhere: each is a script the frame refuses, and says so in the console. */
    .replace(/(<[a-z][^>]*?)\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*')/gi, "$1")
}

const TALLEST = 1.1

/*
  LIGHT TO SCROLL, INSTANT TO COME BACK TO. A card's page was drawn the
  moment it neared the screen, on the main thread, several in one scroll
  frame: the list stuttered as it moved. Now each card asks a queue, which
  draws one page per idle moment. And what was drawn and measured is kept
  for the theme, so switching to another category and back shows the cards
  at once, at their own heights, with nothing to rebuild or jump.
*/
type Cache = { docs: Map<string, string | null>; heights: Map<string, number>; blank: Set<string> }
const caches = new WeakMap<CompatTheme, Cache>()
function cacheFor(theme: CompatTheme): Cache {
  let c = caches.get(theme)
  if (!c) caches.set(theme, (c = { docs: new Map(), heights: new Map(), blank: new Set() }))
  return c
}
const queue: (() => void)[] = []
let draining = false
function drain() {
  const job = queue.shift()
  if (!job) {
    draining = false
    return
  }
  job()
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }
  if (w.requestIdleCallback) w.requestIdleCallback(drain, { timeout: 120 })
  else window.setTimeout(drain, 16)
}
/** Runs `job` when the page is idle, one at a time; the returned function takes it back out if it has not run. */
function whenIdle(job: () => void): () => void {
  queue.push(job)
  if (!draining) {
    draining = true
    window.setTimeout(drain, 0)
  }
  return () => {
    const at = queue.indexOf(job)
    if (at >= 0) queue.splice(at, 1)
  }
}

export const CompatPreviewBox = memo(function CompatPreviewBox({
  type,
  presetIndex,
  schema,
  width,
  renderWidth,
}: {
  type: string
  presetIndex: number
  schema: SectionSchema
  /** The card's width on screen. */
  width: number
  /** The width the section is laid out at, scaled down to the card. */
  renderWidth: number
}) {
  const ctx = useCompatPreview()
  const box = useRef<HTMLDivElement | null>(null)
  const frame = useRef<HTMLIFrameElement | null>(null)
  const key = `${type}:${presetIndex}`
  const cache = ctx?.theme ? cacheFor(ctx.theme) : null
  const [seen, setSeen] = useState(false)
  const [drawnHeight, setDrawnHeight] = useState<number | null>(() => cache?.heights.get(key) ?? null)
  /* A section with nothing to show until it is filled in (apps, custom code): its name instead of a blank card. */
  const [blank, setBlank] = useState(() => cache?.blank.has(key) ?? false)
  /* Shown once it has been measured, faded in: never a white box that jumps to its height. */
  const [shown, setShown] = useState(false)
  const [srcDoc, setSrcDoc] = useState<string | null>(() => cache?.docs.get(key) ?? null)

  /* Built the first time it comes near the screen, then kept. */
  useEffect(() => {
    const el = box.current
    if (!el || seen) return
    if (typeof IntersectionObserver === "undefined") {
      setSeen(true)
      return
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setSeen(true)
        io.disconnect()
      }
    }, { rootMargin: "600px 0px" })
    io.observe(el)
    return () => io.disconnect()
  }, [seen])

  /* Drawn once per theme, in the idle queue; a card already drawn this visit comes straight from the cache. */
  useEffect(() => {
    if (!seen || !ctx?.theme || !cache) return
    if (cache.docs.has(key)) {
      setSrcDoc(cache.docs.get(key) ?? null)
      return
    }
    return whenIdle(() => {
      let doc: string | null = null
      try {
        doc = previewDocument(ctx.theme!, ctx.page, previewSectionFor(type, presetIndex, schema))
      } catch {
        doc = null
      }
      cache.docs.set(key, doc)
      setSrcDoc(doc)
    })
  }, [seen, ctx, cache, key, type, presetIndex, schema])

  const scale = width > 0 ? width / renderWidth : 0.3
  const tallest = Math.round(width * TALLEST)
  const height = blank ? 96 : drawnHeight ? Math.max(64, Math.min(tallest, Math.ceil(drawnHeight * scale))) : Math.round(width * 0.5)

  /* Its height, once its pictures and fonts have had their say. */
  const measure = () => {
    const doc = frame.current?.contentDocument
    if (!doc?.body) return
    /* The body, not the document: the document is never shorter than the frame, so it could only grow. */
    const h = Math.ceil(doc.body.getBoundingClientRect().height)
    if (h > 0) {
      setDrawnHeight(h)
      cache?.heights.set(key, h)
    }
    setShown(true)
    const root = doc.querySelector<HTMLElement>(".shopify-section") ?? doc.body
    const shows = [...root.querySelectorAll<HTMLElement>("img, svg, video, picture, canvas, input, button, h1, h2, h3, h4, p, a, span, li")].some((el) => {
      const r = el.getBoundingClientRect()
      if (r.width < 2 || r.height < 2) return false
      return /^(IMG|SVG|VIDEO|PICTURE|CANVAS|INPUT)$/i.test(el.tagName) || (el.textContent ?? "").trim().length > 0
    })
    setBlank(!shows)
    if (!shows) cache?.blank.add(key)
    else cache?.blank.delete(key)
  }

  return (
    <div
      ref={box}
      data-preview-box=""
      data-compat-preview={type}
      className="relative w-full overflow-hidden bg-[#f3f4f6]"
      style={{ height }}
    >
      {srcDoc ? (
        <iframe
          title={`${schema.name} preview`}
          srcDoc={srcDoc}
          sandbox="allow-same-origin"
          tabIndex={-1}
          aria-hidden
          /* Its scale is the whole picture: the touch rule that flattens transforms inside a .group must leave it alone. */
          data-keep-transform=""
          loading="lazy"
          onLoad={() => {
            measure()
            /* Fonts and the first pictures land a moment later and change the height. */
            window.setTimeout(measure, 400)
          }}
          /* Its markup is in before its pictures and fonts are: measured then too, so a slow font never holds the card back. */
          ref={(el) => {
            frame.current = el
            if (el && !el.dataset.watched) {
              el.dataset.watched = "1"
              const early = () => { if (el.contentDocument?.readyState !== "loading" && el.contentDocument?.body) measure(); else window.setTimeout(early, 60) }
              window.setTimeout(early, 60)
            }
          }}
          className="absolute left-0 top-0 origin-top-left border-0 bg-white"
          style={{ width: renderWidth, height: Math.ceil(height / scale), transform: `scale(${scale})`, pointerEvents: "none", opacity: shown ? 1 : 0, transition: "opacity 220ms ease-out" }}
        />
      ) : null}
      {blank ? (
        <div className="absolute inset-0 flex items-center justify-center bg-[#f9fafb] px-4 text-center text-[13px] font-medium text-[#9ca3af]">
          {schema.name}
        </div>
      ) : null}
    </div>
  )
})
