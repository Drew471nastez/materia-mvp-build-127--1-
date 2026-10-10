"use client"

/**
 * ===========================================================================
 *  THE CANVAS OF A WEBSITE WHOSE THEME WAS IMPORTED FROM SHOPIFY
 * ===========================================================================
 * The page is drawn by the same function the live site uses
 * (lib/storelib-theme/compat/page.ts, drawPage), from the same files, the
 * same theme settings and the same sections, so what the builder shows is
 * what the website serves. It is drawn into a frame:
 *
 *   SANDBOXED, WITH NO ORIGIN. `sandbox="allow-scripts allow-forms"` and no
 *   allow-same-origin: the theme's own scripts run (its sliders, menus,
 *   drawers, variant pickers, exactly as on the website), and they can reach
 *   nothing of the builder, the session or the account. The builder talks to
 *   the page by postMessage only (./canvas-bridge.ts).
 *
 *   DRAWN ONCE, THEN CHANGED IN PLACE. A setting changed in the sidebar
 *   draws that one section again and swaps it in, with the events Shopify's
 *   own editor sends, so the page keeps its scroll and the rest of it is
 *   untouched. A change to the page's shape (a section added, moved,
 *   removed, hidden) or to the theme's settings draws the page again, where
 *   it was scrolled to.
 */
import { useEffect, useMemo, useRef, useState } from "react"
import { CANVAS_BRIDGE, CANVAS_HEAD } from "@/lib/storelib-theme/compat/canvas-bridge"
import { assetAddresses, compatOf, templateOfPage } from "@/lib/storelib-theme/compat/install"
import { drawPage, drawSection, pageContextFor, themeOfInstall, type StoredSection } from "@/lib/storelib-theme/compat/page"
import type { CompatPage } from "@/lib/storelib-theme/compat/theme"
import type { CollectionLike, MenuLinkLike } from "@/lib/storelib-theme/compat/objects"
import type { ProductCard } from "@/lib/website-builder/shop-products"
import type { SectionInstance } from "@/lib/website-builder/types"
import { useLiveSections } from "@/lib/website-builder/live-settings"

export interface CompatCanvasProps {
  installId: string
  /** The install's .storelib files (the editor's storelibSources). */
  sources: Record<string, string>
  /** The theme settings, `compat` and `shopify` among them. */
  theme: Record<string, unknown>
  pageKey: string
  sections: StoredSection[]
  products: ProductCard[]
  collections: CollectionLike[]
  menus: Record<string, { title?: string; links: MenuLinkLike[] }>
  shopName: string
  selectedSectionId: string | null
  /** The selected block's path key (lib/website-builder/block-tree.ts): its last part is the block. */
  selectedBlockId: string | null
  inspectorEnabled: boolean
  onSelect: (sectionId: string, blockPath: string[]) => void
}

const loading = new Map<string, Promise<Record<string, string>>>()

/** The theme's own files (`shopify/…`), read once per install for the canvas and the settings panel together. */
export function loadCompatFiles(installId: string): Promise<Record<string, string>> {
  const hit = loading.get(installId)
  if (hit) return hit
  const p = fetch(`/api/website-builder/themes/${installId}/files?compat=1`)
    .then((r) => (r.ok ? r.json() : { files: {} }))
    .then((d: { files?: Record<string, string> }) => d.files ?? {})
    .catch(() => {
      loading.delete(installId)
      return {} as Record<string, string>
    })
  loading.set(installId, p)
  return p
}

/** The page's shape: which sections, in which order, shown or not. A change to it draws the page again. */
const shapeOf = (sections: StoredSection[]) => sections.map((s) => `${s.id}:${s.type}:${s.group ?? ""}:${s.hidden ? 1 : 0}`).join("|")

export function CompatCanvas(props: CompatCanvasProps) {
  const { installId, sources, theme: settings, pageKey, products, collections, menus, shopName } = props
  /* A slider under a finger: its section is drawn again with each value, before the editor commits it (lib/website-builder/live-settings.ts). */
  const sections = useLiveSections(props.sections as unknown as SectionInstance[]) as unknown as StoredSection[]
  const frame = useRef<HTMLIFrameElement | null>(null)
  const box = useRef<HTMLDivElement | null>(null)
  const [compatFiles, setCompatFiles] = useState<Record<string, string> | null>(null)
  const [height, setHeight] = useState(800)
  const ready = useRef(false)
  const scrollY = useRef(0)

  /* The theme's own files: templates, config, the default locale, its stylesheets and scripts. */
  useEffect(() => {
    let live = true
    void loadCompatFiles(installId).then((files) => { if (live) setCompatFiles(files) })
    return () => { live = false }
  }, [installId])

  /* The frame is as tall as the canvas it sits in: the page scrolls inside it, as the website does. */
  useEffect(() => {
    const root = document.getElementById("wb-preview-root")
    if (!root) return
    const fit = () => setHeight(Math.max(320, root.clientHeight))
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(root)
    return () => ro.disconnect()
  }, [])

  const rows = useMemo(() => (compatFiles ? { ...sources, ...compatFiles } : null), [sources, compatFiles])
  const compatTheme = useMemo(() => {
    if (!rows) return null
    const media = assetAddresses(rows)
    return themeOfInstall(rows, settings, {
      assetUrl: (name) => media[name] ?? `/api/site-theme/assets/${installId}/edit/${encodeURIComponent(name)}`,
      assetText: (name) => rows[`shopify/assets/${name}`] ?? null,
      imageUrl: (v) => (/^https?:\/\//.test(v) || v.startsWith("/") ? v : ""),
    })
  }, [rows, settings, installId])

  /*
    BY WHAT THEY HOLD, NOT BY WHICH OBJECT. The editor makes its menus again
    from the page on every edit, and a new object here drew the whole page
    again for every letter typed into a heading: the frame reloaded under the
    person typing, and the last letter went to the page being thrown away.
  */
  const dataKey = JSON.stringify([products, collections, menus, shopName])
  const dataRef = useRef({ products, collections, menus, shopName })
  dataRef.current = { products, collections, menus, shopName }
  const page = useMemo((): CompatPage => {
    const { products, collections, menus, shopName } = dataRef.current
    const { template, suffix } = templateOfPage(pageKey)
    const sample = products[0] ?? null
    const firstCollection = collections[0] ?? null
    const path = pageKey === "home" ? "/" : pageKey === "product" ? (sample ? String(sample.settings.url) : "/products/sample") : pageKey === "collection" ? `/collections/${firstCollection?.handle ?? "all"}` : `/pages/${pageKey}`
    return {
      template,
      suffix,
      path,
      designMode: true,
      host: "",
      products,
      collections,
      menus,
      shop: { name: shopName, currency: "USD", moneyFormat: "${{amount}}" },
      /* A product page and a collection page are drawn about the first of each, as Shopify's editor does. */
      product: template === "product" ? sample : null,
      collection: template === "collection" ? firstCollection ?? { id: "all", title: "Products", handle: "all", url: "/collections/all", products, products_count: products.length } : null,
      search: template === "search" ? { terms: sample ? String(sample.settings.title).split(" ")[0] : "", results: products.slice(0, 8), performed: true } : null,
      pageObject: template === "page" ? { title: pageKey.replace(/-/g, " ").replace(/^./, (x) => x.toUpperCase()), content: "", handle: pageKey, url: `/pages/${pageKey}` } : null,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageKey, dataKey])

  /* The whole page, when its shape, its theme or its data changes. */
  const shape = shapeOf(sections)
  const sectionsRef = useRef(sections)
  sectionsRef.current = sections
  const drawnFrom = useRef<Map<string, string>>(new Map())
  const srcDoc = useMemo(() => {
    if (!compatTheme) return null
    const list = sectionsRef.current
    const restore = `<script>(function(){var y=${Math.round(scrollY.current)};if(y>0)addEventListener("load",function(){scrollTo(0,y)})})();</script>`
    const drawn = drawPage(compatTheme, page, list, { scripts: true, extraHead: "<style data-storelib-gutter>html{scrollbar-gutter:stable}</style>", extraBodyEnd: `<script>${CANVAS_BRIDGE}</script>${restore}` })
    drawnFrom.current = new Map(list.map((s) => [s.id, JSON.stringify(s)]))
    ready.current = false
    /* Before anything of the theme's: its scripts read storage on their first line. */
    return drawn.html.replace(/<head\b[^>]*>/i, (m) => `${m}${CANVAS_HEAD}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compatTheme, page, shape])

  /*
    A section's settings or blocks changed: that section, drawn again and
    swapped in. Only into a page that is ready: a change made while the page
    is loading is sent when it says it is (the "ready" message below).
  */
  const sync = useRef<() => void>(() => {})
  sync.current = () => {
    if (!compatTheme || !frame.current?.contentWindow || !ready.current) return
    const changed = sections.filter((s) => drawnFrom.current.get(s.id) !== JSON.stringify(s))
    if (!changed.length) return
    const ctx = pageContextFor(compatTheme, page, sections)
    for (const s of changed) {
      const at = sections.indexOf(s)
      const group = s.group === "header" || s.group === "footer" ? s.group : undefined
      const { html } = drawSection(compatTheme, ctx, s, at, group)
      frame.current.contentWindow.postMessage({ storelib: 1, type: "section", id: s.id, html }, "*")
      drawnFrom.current.set(s.id, JSON.stringify(s))
    }
  }
  useEffect(() => sync.current(), [sections, compatTheme, page])

  /* The selection, outlined in the page and announced to the theme. */
  const selectedBlock = props.selectedBlockId ? props.selectedBlockId.split(/[/>]/).pop() ?? null : null
  const select = useRef({ sectionId: props.selectedSectionId, blockId: selectedBlock })
  select.current = { sectionId: props.inspectorEnabled ? props.selectedSectionId : null, blockId: props.inspectorEnabled ? selectedBlock : null }
  useEffect(() => {
    if (!ready.current) return
    frame.current?.contentWindow?.postMessage({ storelib: 1, type: "select", ...select.current }, "*")
  }, [props.selectedSectionId, selectedBlock, props.inspectorEnabled])

  const onSelect = useRef(props.onSelect)
  onSelect.current = props.onSelect
  const inspecting = useRef(props.inspectorEnabled)
  inspecting.current = props.inspectorEnabled
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (!frame.current || e.source !== frame.current.contentWindow) return
      const m = e.data as { storelib?: number; type?: string; sectionId?: string; blockPath?: string[]; scrollY?: number }
      if (!m || m.storelib !== 1) return
      if (m.type === "ready") {
        ready.current = true
        sync.current()
        frame.current.contentWindow?.postMessage({ storelib: 1, type: "select", ...select.current, scroll: false }, "*")
      } else if (m.type === "scrolled" && typeof m.scrollY === "number") {
        scrollY.current = m.scrollY
      } else if (m.type === "pick" && typeof m.sectionId === "string" && inspecting.current) {
        onSelect.current(m.sectionId, Array.isArray(m.blockPath) ? m.blockPath.filter((x): x is string => typeof x === "string") : [])
      }
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [])

  const compat = compatOf(settings)
  return (
    <div ref={box} className="relative w-full" style={{ height }} data-compat-canvas={compat?.theme ?? ""}>
      {srcDoc === null ? (
        <div className="flex h-full items-center justify-center text-[14px] text-[#6b7280]">Loading {compat?.theme ?? "the theme"}…</div>
      ) : (
        <iframe
          ref={frame}
          title={`${compat?.theme ?? "Theme"} preview`}
          srcDoc={srcDoc}
          sandbox="allow-scripts allow-forms allow-popups"
          className="block h-full w-full border-0 bg-white"
          style={{ position: "sticky", top: 0 }}
        />
      )}
    </div>
  )
}
