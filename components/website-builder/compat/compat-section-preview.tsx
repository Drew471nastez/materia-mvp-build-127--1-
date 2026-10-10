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
import { drawPage, themeOfInstall, type StoredBlock, type StoredSection } from "@/lib/storelib-theme/compat/page"
import type { CompatPage, CompatTheme } from "@/lib/storelib-theme/compat/theme"
import type { SectionSchema } from "@/lib/website-builder/types"

interface CompatPreviewValue {
  theme: CompatTheme | null
  page: CompatPage
}

const CompatPreviewContext = createContext<CompatPreviewValue | null>(null)

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
    const rows = { ...sources, ...files }
    const media = assetAddresses(rows)
    try {
      return themeOfInstall(rows, settings ?? {}, {
        assetUrl: (name) => media[name] ?? `/api/site-theme/assets/${installId}/edit/${encodeURIComponent(name)}`,
        assetText: (name) => rows[`shopify/assets/${name}`] ?? null,
        imageUrl: (v) => (/^https?:\/\//.test(v) || v.startsWith("/") ? v : ""),
      })
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

type PresetBlock = { type?: string; settings?: Record<string, unknown>; blocks?: PresetBlock[] }

/** The preset's blocks, with ids of their own: the compat engine reads blocks by id. */
function blocksOf(list: PresetBlock[] | undefined, path: string): StoredBlock[] {
  return (list ?? [])
    .filter((b) => typeof b?.type === "string")
    .map((b, i) => ({ id: `${path}-${i}`, type: b.type as string, settings: b.settings ?? {}, blocks: blocksOf(b.blocks, `${path}-${i}`) }))
}

/** The section a card shows: its preset's settings and blocks, as adding it would give. */
export function previewSectionFor(type: string, presetIndex: number, schema: SectionSchema): StoredSection {
  const presets = (schema.presets ?? []) as unknown as { settings?: Record<string, unknown>; blocks?: PresetBlock[] }[]
  const preset = presets[presetIndex] ?? presets[0]
  const id = `preview-${type}-${presetIndex}`
  return { id, type, settings: preset?.settings ?? {}, blocks: blocksOf(preset?.blocks, id) }
}

/** The whole document a card's frame shows. Exported so the rule can be read back in a test. */
export function previewDocument(theme: CompatTheme, page: CompatPage, section: StoredSection): string {
  const { html } = drawPage(theme, page, [section], {
    scripts: false,
    /* No scrollbar, nothing that moves, and the page as tall as the section. */
    extraHead: "<style data-storelib-preview>html,body{margin:0!important;overflow:hidden!important;min-height:0!important;height:auto!important;background:#fff}*,*::before,*::after{animation:none!important;transition:none!important}.scroll-trigger,[class*='animate--'],[data-aos],[data-animate],[data-reveal],.reveal,.fade-in,.js-animate,.animate-on-scroll,.wow{opacity:1!important;transform:none!important;visibility:visible!important;clip-path:none!important}</style>",
  })
  return html
}

const TALLEST = 1.1

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
  const [seen, setSeen] = useState(false)
  const [drawnHeight, setDrawnHeight] = useState<number | null>(null)
  /* A section with nothing to show until it is filled in (apps, custom code): its name instead of a blank card. */
  const [blank, setBlank] = useState(false)

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

  const srcDoc = useMemo(() => {
    if (!seen || !ctx?.theme) return null
    try {
      return previewDocument(ctx.theme, ctx.page, previewSectionFor(type, presetIndex, schema))
    } catch {
      return null
    }
  }, [seen, ctx, type, presetIndex, schema])

  const scale = width > 0 ? width / renderWidth : 0.3
  const tallest = Math.round(width * TALLEST)
  const height = blank ? 96 : drawnHeight ? Math.max(64, Math.min(tallest, Math.ceil(drawnHeight * scale))) : Math.round(width * 0.5)

  /* Its height, once its pictures and fonts have had their say. */
  const measure = () => {
    const doc = frame.current?.contentDocument
    if (!doc?.body) return
    /* The body, not the document: the document is never shorter than the frame, so it could only grow. */
    const h = Math.ceil(doc.body.getBoundingClientRect().height)
    if (h > 0) setDrawnHeight(h)
    const root = doc.querySelector<HTMLElement>(".shopify-section") ?? doc.body
    const shows = [...root.querySelectorAll<HTMLElement>("img, svg, video, picture, canvas, input, button, h1, h2, h3, h4, p, a, span, li")].some((el) => {
      const r = el.getBoundingClientRect()
      if (r.width < 2 || r.height < 2) return false
      return /^(IMG|SVG|VIDEO|PICTURE|CANVAS|INPUT)$/i.test(el.tagName) || (el.textContent ?? "").trim().length > 0
    })
    setBlank(!shows)
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
          ref={frame}
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
          className="absolute left-0 top-0 origin-top-left border-0 bg-white"
          style={{ width: renderWidth, height: Math.ceil(height / scale), transform: `scale(${scale})`, pointerEvents: "none" }}
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
