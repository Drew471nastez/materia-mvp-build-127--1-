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
  /** Every product a picker may name (memberships and tiers included), for a featured product picked in the sidebar. */
  catalog?: ProductCard[]
  /** The product a product page shows: the one picked in Pages or followed from a link. The shop's first when none. */
  productId?: string | null
  collections: CollectionLike[]
  menus: Record<string, { title?: string; links: MenuLinkLike[] }>
  shopName: string
  selectedSectionId: string | null
  /** The selected block's path key (lib/website-builder/block-tree.ts): its last part is the block. */
  selectedBlockId: string | null
  inspectorEnabled: boolean
  onSelect: (sectionId: string, blockPath: string[]) => void
  /** A link pressed in the page: its address, and whether it is in the header or the footer. */
  onNavigate?: (href: string, chrome: boolean) => void
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
  const catalog = props.catalog
  /* A slider under a finger: its section is drawn again with each value, before the editor commits it (lib/website-builder/live-settings.ts). */
  const sections = useLiveSections(props.sections as unknown as SectionInstance[]) as unknown as StoredSection[]
  const box = useRef<HTMLDivElement | null>(null)
  const [compatFiles, setCompatFiles] = useState<Record<string, string> | null>(null)
  const [height, setHeight] = useState(800)
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
  const productId = props.productId ?? null
  const dataKey = JSON.stringify([products, catalog, collections, menus, shopName])
  const dataRef = useRef({ products, catalog, collections, menus, shopName })
  dataRef.current = { products, catalog, collections, menus, shopName }
  const page = useMemo((): CompatPage => {
    const { products, catalog, collections, menus, shopName } = dataRef.current
    const { template, suffix } = templateOfPage(pageKey)
    const picked = productId ? products.find((p) => p.id === productId) ?? catalog?.find((p) => p.id === productId) : null
    const sample = picked ?? products[0] ?? null
    const firstCollection = collections[0] ?? null
    const path = pageKey === "home" ? "/" : pageKey === "product" ? (sample ? String(sample.settings.url) : "/products/sample") : pageKey === "collection" ? `/collections/${firstCollection?.handle ?? "all"}` : `/pages/${pageKey}`
    return {
      template,
      suffix,
      path,
      designMode: true,
      host: "",
      products,
      pickable: catalog,
      collections,
      menus,
      shop: { name: shopName, currency: "USD", moneyFormat: "${{amount}}" },
      /* A product page is drawn about the product opened, a collection page about the first collection, as Shopify's editor does. */
      product: template === "product" ? sample : null,
      collection: template === "collection" ? firstCollection ?? { id: "all", title: "Products", handle: "all", url: "/collections/all", products, products_count: products.length } : null,
      search: template === "search" ? { terms: sample ? String(sample.settings.title).split(" ")[0] : "", results: products.slice(0, 8), performed: true } : null,
      pageObject: template === "page" ? { title: pageKey.replace(/-/g, " ").replace(/^./, (x) => x.toUpperCase()), content: "", handle: pageKey, url: `/pages/${pageKey}` } : null,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageKey, dataKey, productId])

  /*
    ═══════════════════════════════════════════════════════════════════════
     DRAWN ONCE, THEN CHANGED IN PLACE, AND NEVER BLANK
    ═══════════════════════════════════════════════════════════════════════
    Every change to the theme's settings, the shop's data or the page's
    shape (a section added, moved, removed, hidden) draws the page again
    here, as text, and compares it with the page on screen (docShape). What
    differs is sent to the page and changed there: the theme's inline
    styles, the attributes on <html> and <body>, sections swapped, added,
    taken away or moved. The frame does not load again, so it keeps its
    scroll, its open menus and its pictures.

    Only a page whose skeleton changed (a different stylesheet, the layout
    drawn otherwise) is loaded again, and then BEHIND the one on screen: the
    new frame loads hidden, and takes the old one's place once it is drawn
    and its pictures are in. The canvas never shows an empty frame.
  */
  const shape = shapeOf(sections)
  const sectionsRef = useRef(sections)
  sectionsRef.current = sections
  /* Which page is drawn, in which files: a different one is always loaded again. */
  const docKey = `${installId}:${pageKey}:${pageKey === "product" ? productId ?? "" : ""}:${rows ? Object.keys(rows).length : 0}:${sources === undefined ? "" : Object.keys(sources).length}`
  const draw = (list: StoredSection[]) => {
    const restore = `<script>(function(){var y=${Math.round(scrollY.current)};if(y>0)addEventListener("load",function(){scrollTo(0,y)})})();</script>`
    const drawn = drawPage(compatTheme!, page, list, { scripts: true, extraHead: "<style data-storelib-gutter>html{scrollbar-gutter:stable}</style>", extraBodyEnd: `<script>${CANVAS_BRIDGE}</script>${restore}` })
    /* Before anything of the theme's: its scripts read storage on their first line. */
    return drawn.html.replace(/<head\b[^>]*>/i, (m) => `${m}${CANVAS_HEAD}`)
  }

  /* `leaving`: the page being left, kept under the new one while it fades in; `entering`: a page of another address, which fades in. */
  type Slot = { n: number; key: string; html: string; shape: DocShape; drawnFrom: Map<string, string>; ready: boolean; loaded: boolean; leaving?: boolean; entering?: boolean }
  const [slots, setSlots] = useState<Slot[]>([])
  /* The theme's first page has painted (its pictures in, or a moment after it is ready): the placeholder over it fades. */
  const [painted, setPainted] = useState(false)
  const slotsRef = useRef<Slot[]>([])
  slotsRef.current = slots
  const frames = useRef(new Map<number, HTMLIFrameElement>())
  const counter = useRef(0)
  const front = () => slotsRef.current[0] ?? null
  const frontWindow = () => { const f = front(); return f ? frames.current.get(f.n)?.contentWindow ?? null : null }

  /* A page loaded behind the one on screen. */
  const loadBehind = (html: string, key: string, list: StoredSection[]) => {
    const slot: Slot = { n: ++counter.current, key, html, shape: docShape(html), drawnFrom: new Map(list.map((s) => [s.id, JSON.stringify(s)])), ready: false, loaded: false }
    setSlots((prev) => (prev.length === 0 ? [slot] : [prev[0], slot]))
  }

  useEffect(() => {
    if (!compatTheme) return
    const list = sectionsRef.current
    const html = draw(list)
    const now = front()
    if (!now) { loadBehind(html, docKey, list); return }
    const next = docShape(html)
    const plan = now.key === docKey ? planPatch(now.shape, next) : null
    const win = frontWindow()
    if (!plan || !win || !now.ready) {
      loadBehind(html, docKey, list)
      return
    }
    if (plan.empty) { now.shape = next; return }
    for (const sw of plan.swaps) win.postMessage({ storelib: 1, type: "section", id: sw.id, html: sw.html }, "*")
    if (Object.keys(plan.message).length) win.postMessage({ storelib: 1, type: "patch", ...plan.message }, "*")
    now.shape = next
    for (const s of list) now.drawnFrom.set(s.id, JSON.stringify(s))
    for (const id of [...now.drawnFrom.keys()]) if (!list.some((s) => s.id === id)) now.drawnFrom.delete(id)
    /* A page that changed behind this one is out of date too: drawn again from now. */
    if (slotsRef.current[1]) loadBehind(html, docKey, list)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compatTheme, page, shape, docKey])

  /*
    A section's settings or blocks changed: that section, drawn again and
    swapped in. Only into a page that is ready: a change made while the page
    is loading is sent when it says it is (the "ready" message below).
  */
  const syncSlot = (slot: Slot) => {
    const win = frames.current.get(slot.n)?.contentWindow
    if (!compatTheme || !win || !slot.ready) return
    const list = sectionsRef.current
    const changed = list.filter((s) => slot.drawnFrom.has(s.id) && slot.drawnFrom.get(s.id) !== JSON.stringify(s))
    if (!changed.length) return
    const ctx = pageContextFor(compatTheme, page, list)
    for (const s of changed) {
      const at = list.indexOf(s)
      const group = s.group === "header" || s.group === "footer" ? s.group : undefined
      const { html } = drawSection(compatTheme, ctx, s, at, group)
      win.postMessage({ storelib: 1, type: "section", id: s.id, html }, "*")
      slot.drawnFrom.set(s.id, JSON.stringify(s))
      slot.shape.sections.set(s.id, html)
    }
  }
  const sync = useRef<() => void>(() => {})
  sync.current = () => { for (const slot of slotsRef.current) syncSlot(slot) }
  useEffect(() => sync.current(), [sections, compatTheme, page])

  /* The selection, outlined in the page and announced to the theme. */
  const selectedBlock = props.selectedBlockId ? props.selectedBlockId.split(/[/>]/).pop() ?? null : null
  const select = useRef({ sectionId: props.selectedSectionId, blockId: selectedBlock })
  select.current = { sectionId: props.inspectorEnabled ? props.selectedSectionId : null, blockId: props.inspectorEnabled ? selectedBlock : null }
  useEffect(() => {
    if (!front()?.ready) return
    frontWindow()?.postMessage({ storelib: 1, type: "select", ...select.current }, "*")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.selectedSectionId, selectedBlock, props.inspectorEnabled])

  /*
    THE TOOLBAR OVER THE CANVAS finds a section by its element in the editor's
    page (wb-section-<id>), and an imported theme's sections are inside the
    frame. The frame says where the selected one is; an empty box of that
    size stands there, and the toolbar points at it like any other section.
  */
  const [ghost, setGhost] = useState<{ id: string; top: number; left: number; width: number; height: number } | null>(null)
  useEffect(() => {
    document.getElementById("wb-preview-root")?.dispatchEvent(new Event("scroll"))
  }, [ghost])
  const onSelect = useRef(props.onSelect)
  onSelect.current = props.onSelect
  const onNavigate = useRef(props.onNavigate)
  onNavigate.current = props.onNavigate
  const inspecting = useRef(props.inspectorEnabled)
  inspecting.current = props.inspectorEnabled
  /* The page behind takes the front's place: drawn, its pictures in, and where the front was scrolled to. */
  /*
    ANOTHER PAGE CROSS-FADES IN. The same page drawn again (an edit it could
    not take in place) swaps in one frame, as it always has, because nothing
    about it should seem to move. A different page, opened from the page list
    or a link in it, fades in over the one it replaces, which stays under it
    for those 200ms rather than leaving a white frame between them.
  */
  const FADE_MS = 200
  const promote = (n: number) => {
    setSlots((prev) => {
      const at = prev.findIndex((x) => x.n === n)
      if (at <= 0) return prev
      const next = prev[at]
      const old = prev[0]
      const calm = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches
      if (old.key === next.key || calm) return prev.slice(at)
      next.entering = true
      old.leaving = true
      setTimeout(() => setSlots((now) => now.filter((x) => x !== old)), FADE_MS + 40)
      return [next, old]
    })
  }
  /* The page that came forward from another address fades in, once. */
  useEffect(() => {
    const slot = slots[0]
    if (!slot?.entering) return
    slot.entering = false
    frames.current.get(slot.n)?.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, easing: "ease-out" })
  }, [slots])
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const slot = slotsRef.current.find((x) => frames.current.get(x.n)?.contentWindow === e.source)
      if (!slot) return
      const m = e.data as { storelib?: number; type?: string; sectionId?: string; blockPath?: string[]; scrollY?: number }
      if (!m || m.storelib !== 1) return
      const win = e.source as Window
      const isFront = slot === slotsRef.current[0]
      if (m.type === "ready") {
        slot.ready = true
        if (isFront) setTimeout(() => setPainted(true), 900)
        syncSlot(slot)
        win.postMessage({ storelib: 1, type: "select", ...select.current, scroll: false }, "*")
        /* A page behind that never says it has loaded still comes forward. */
        if (!isFront) setTimeout(() => promote(slot.n), 2500)
      } else if (m.type === "loaded") {
        slot.loaded = true
        if (isFront) setPainted(true)
        if (!isFront) {
          win.postMessage({ storelib: 1, type: "scroll", top: scrollY.current }, "*")
          requestAnimationFrame(() => promote(slot.n))
        }
      } else if (m.type === "reload") {
        /* The page could not take a change in place: drawn again, behind it. */
        if (isFront && compatTheme) loadBehind(draw(sectionsRef.current), slot.key, sectionsRef.current)
      } else if (m.type === "navigate" && isFront) {
        const n = m as { href?: string; chrome?: boolean }
        if (typeof n.href === "string") onNavigate.current?.(n.href, n.chrome === true)
      } else if (m.type === "box" && isFront) {
        const b = m as { id?: string | null; top?: number; left?: number; width?: number; height?: number }
        setGhost(typeof b.id === "string" ? { id: b.id, top: b.top ?? 0, left: b.left ?? 0, width: b.width ?? 0, height: b.height ?? 0 } : null)
      } else if (m.type === "scrolled" && typeof m.scrollY === "number") {
        if (isFront) scrollY.current = m.scrollY
      } else if (m.type === "pick" && typeof m.sectionId === "string" && inspecting.current && isFront) {
        onSelect.current(m.sectionId, Array.isArray(m.blockPath) ? m.blockPath.filter((x): x is string => typeof x === "string") : [])
      }
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compatTheme])

  const compat = compatOf(settings)
  return (
    <div ref={box} className="relative w-full" style={{ height }} data-compat-canvas={compat?.theme ?? ""}>
      {/* Until the theme's first page has painted: the shape of a page, still, never a blank sheet or a line of text. */}
      <CanvasPlaceholder hidden={painted && slots.length > 0} label={`Loading ${compat?.theme ?? "the theme"}`} />
      {slots.length === 0 ? null : (
        <div className="sticky top-0 h-full w-full" style={{ height }}>
          {slots.map((slot, i) => (
            <iframe
              key={slot.n}
              ref={(el) => { if (el) frames.current.set(slot.n, el); else frames.current.delete(slot.n) }}
              title={`${compat?.theme ?? "Theme"} preview`}
              srcDoc={slot.html}
              sandbox="allow-scripts allow-forms allow-popups"
              data-compat-frame={i === 0 ? "front" : slot.leaving ? "leaving" : "behind"}
              aria-hidden={i === 0 ? undefined : true}
              tabIndex={i === 0 ? undefined : -1}
              className="absolute inset-0 block h-full w-full border-0 bg-white"
              style={i === 0 ? { zIndex: 1 } : slot.leaving ? { zIndex: 0, pointerEvents: "none" } : { visibility: "hidden", pointerEvents: "none" }}
            />
          ))}
          {ghost && props.selectedSectionId === ghost.id && (
            <div aria-hidden id={`wb-section-${ghost.id}`} className="pointer-events-none absolute" style={{ top: ghost.top, left: ghost.left, width: ghost.width, height: ghost.height }} />
          )}
        </div>
      )}
    </div>
  )
}

/*
  WHAT THE CANVAS SHOWS BEFORE THE THEME HAS PAINTED. An imported theme's
  first page takes a moment: its files are read, the page is drawn, its
  stylesheets and pictures load in the frame. That moment was a line of grey
  text and then a white sheet. Now it is the outline of a page (a header, a
  large picture, a row of cards) in the builder's lightest grey, not pulsing,
  and it fades once the page under it has painted.
*/
function CanvasPlaceholder({ hidden, label }: { hidden: boolean; label: string }) {
  const bar = "rounded-md bg-[#f1f2f4]"
  return (
    <div
      aria-hidden={hidden || undefined}
      aria-busy={!hidden || undefined}
      aria-label={hidden ? undefined : label}
      data-canvas-placeholder={hidden ? "gone" : "up"}
      className="pointer-events-none absolute inset-0 z-[1] overflow-hidden bg-white transition-opacity duration-[220ms] ease-out"
      style={{ opacity: hidden ? 0 : 1, visibility: hidden ? "hidden" : "visible", transitionProperty: "opacity, visibility" }}
    >
      <div className="flex h-16 items-center gap-6 border-b border-[#f3f4f6] px-[4%]">
        <div className={`${bar} h-5 w-24`} />
        <div className="hidden gap-4 sm:flex">
          <div className={`${bar} h-3 w-14`} />
          <div className={`${bar} h-3 w-14`} />
          <div className={`${bar} h-3 w-14`} />
        </div>
        <div className="ml-auto flex gap-3">
          <div className={`${bar} h-5 w-5 rounded-full`} />
          <div className={`${bar} h-5 w-5 rounded-full`} />
        </div>
      </div>
      <div className="px-[4%] pt-6">
        <div className={`${bar} h-[42vh] max-h-[460px] min-h-[220px] w-full rounded-xl`} />
        <div className={`${bar} mt-8 h-5 w-48`} />
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i}>
              <div className={`${bar} aspect-[4/5] w-full rounded-lg`} />
              <div className={`${bar} mt-3 h-3 w-3/4`} />
              <div className={`${bar} mt-2 h-3 w-1/3`} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── What a drawn page is, to compare one with the next ───────────────────── */

export interface DocShape {
  /** Everything in <head> but the text of its inline styles and the font links: a change here is a different page. */
  head: string
  styles: string[]
  fonts: string[]
  htmlAttrs: Record<string, string>
  bodyAttrs: Record<string, string>
  /** <body> with every section and script taken out: what the layout draws around the sections. */
  skeleton: string
  /** Every section, in the order drawn, by id: its markup. */
  sections: Map<string, string>
  order: { id: string; group: string }[]
}

const attrsOf = (el: Element): Record<string, string> => Object.fromEntries(Array.from(el.attributes).map((a) => [a.name, a.value]))

export function docShape(html: string): DocShape {
  const doc = new DOMParser().parseFromString(html, "text/html")
  const styles: string[] = []
  const fonts: string[] = []
  const head: string[] = []
  for (const el of Array.from(doc.head.children)) {
    if (el.tagName === "STYLE") { styles.push(el.textContent ?? ""); head.push("<style>"); continue }
    if (el.tagName === "LINK" && el.hasAttribute("data-storelib-font")) { fonts.push(el.getAttribute("href") ?? ""); continue }
    if (el.tagName === "SCRIPT") { head.push(`<script ${el.getAttribute("src") ?? ""}>`); continue }
    head.push(el.outerHTML)
  }
  const sections = new Map<string, string>()
  const order: { id: string; group: string }[] = []
  for (const el of Array.from(doc.body.querySelectorAll(".shopify-section[data-section-id]"))) {
    const id = el.getAttribute("data-section-id") ?? ""
    sections.set(id, el.outerHTML)
    order.push({ id, group: /shopify-section-group-([a-z0-9_-]+)/i.exec(el.className)?.[1] ?? "" })
  }
  const body = doc.body.cloneNode(true) as HTMLElement
  body.querySelectorAll(".shopify-section[data-section-id], script").forEach((el) => el.remove())
  return { head: head.join("\n"), styles, fonts, htmlAttrs: attrsOf(doc.documentElement), bodyAttrs: attrsOf(doc.body), skeleton: body.innerHTML, sections, order }
}

const sameRecord = (a: Record<string, string>, b: Record<string, string>) => {
  const ka = Object.keys(a)
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k])
}

/**
 * What to send a page drawn as `from` so it reads as `to`, or null when the
 * page has to be loaded again (its head or its skeleton changed).
 */
export function planPatch(from: DocShape, to: DocShape): { empty: boolean; message: Record<string, unknown>; swaps: { id: string; html: string }[] } | null {
  if (from.head !== to.head || from.skeleton !== to.skeleton || from.styles.length !== to.styles.length) return null
  const message: Record<string, unknown> = {}
  if (from.styles.some((x, i) => x !== to.styles[i])) message.styles = to.styles
  if (from.fonts.join("\n") !== to.fonts.join("\n")) message.fonts = to.fonts
  if (!sameRecord(from.htmlAttrs, to.htmlAttrs)) message.htmlAttrs = to.htmlAttrs
  if (!sameRecord(from.bodyAttrs, to.bodyAttrs)) message.bodyAttrs = to.bodyAttrs
  const remove = from.order.filter((x) => !to.sections.has(x.id)).map((x) => x.id)
  if (remove.length) message.remove = remove
  /* A section whose markup changed is swapped in its place (canvas-bridge.ts, swap); one added is put where it goes; one only moved is moved. */
  const swaps = to.order.filter((x) => from.sections.has(x.id) && from.sections.get(x.id) !== to.sections.get(x.id)).map((x) => ({ id: x.id, html: to.sections.get(x.id)! }))
  const kept = from.order.filter((x) => to.sections.has(x.id)).map((x) => x.id)
  const moved = kept.join("|") !== to.order.filter((x) => from.sections.has(x.id)).map((x) => x.id).join("|")
  const added = to.order.some((x) => !from.sections.has(x.id))
  if (moved || added) message.order = to.order.map((x) => ({ ...x, html: from.sections.has(x.id) ? undefined : to.sections.get(x.id) }))
  return { empty: Object.keys(message).length === 0 && swaps.length === 0, message, swaps }
}
