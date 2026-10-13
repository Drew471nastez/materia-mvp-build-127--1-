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
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { CANVAS_BRIDGE, CANVAS_HEAD } from "@/lib/storelib-theme/compat/canvas-bridge"
import { answerInCanvas, canvasPages, type CanvasCart } from "@/lib/storelib-theme/compat/canvas-cart"
import { CANVAS_SHOWN, canvasInsets } from "@/lib/storelib-theme/compat/canvas-network"
import { canvasAccountPage, cartLines, CANVAS_ACCOUNT_PATHS, type SiteData } from "@/lib/storelib-theme/compat/site"
import { assetAddresses, compatOf, templateOfPage } from "@/lib/storelib-theme/compat/install"
import { drawPage, drawSection, pageContextFor, sectionIndexIn, themeOfInstall, type StoredSection } from "@/lib/storelib-theme/compat/page"
import type { CompatPage } from "@/lib/storelib-theme/compat/theme"
import type { CollectionLike, MenuLinkLike } from "@/lib/storelib-theme/compat/objects"
import type { ProductCard } from "@/lib/website-builder/shop-products"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"
import { isLive, useLiveSections, useLiveTheme } from "@/lib/website-builder/live-settings"
import { reportLoadProblem } from "@/lib/website-builder/load-guard"
import { siteCommerce } from "@/lib/website-builder/site-commerce"
import { withPageFacts, type PageFacts } from "@/lib/storelib-theme/compat/product-facts"
import { CanvasProblem, PageOutline } from "@/components/website-builder/canvas-problem"
import { forgetCompatFiles, loadCompatFiles } from "./compat-files"
import { shopImageName } from "@/lib/website-builder/picture-address"
import { compatFields } from "@/lib/markets/compat-fields"
import { localizeMenus, localizeRecord, localizeSections, type TranslationMap } from "@/lib/markets/translate"
import { localePrefix } from "@/lib/markets/locales"

export interface CompatCanvasProps {
  installId: string
  /** Raised when the theme's own files changed elsewhere (a push to its GitHub repository): read again, the page shown meanwhile. */
  filesVersion?: number
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
  /** Every page the install has, by key: a link to a page it has none of is drawn going where the live site sends it (lib/storelib-theme/compat/links.ts). */
  pageKeys?: readonly string[]
  shopName: string
  selectedSectionId: string | null
  /** The selected block's path key (lib/website-builder/block-tree.ts): its last part is the block. */
  selectedBlockId: string | null
  inspectorEnabled: boolean
  onSelect: (sectionId: string, blockPath: string[]) => void
  /** A link pressed in the page: its address, and whether it is in the header or the footer. True when another page is opening because of it. */
  onNavigate?: (href: string, chrome: boolean) => boolean | void
  /** The pointer rests on a link (or a finger landed on one): the page it goes to can be read ahead. */
  onIntent?: (href: string) => void
  /** The page on screen has changed: `${pageKey}|${productId}`, the moment the new one is drawn in front (the sections panel swaps its list at this). */
  onPageShown?: (page: string) => void
  /** The website's own address (https://name.storelib.com or its domain): what a link shows under the pointer. */
  siteUrl?: string
  /** Something pressed in the page that only the live site does (checkout, Buy it now, signing in): the builder says so. */
  onLiveOnly?: (what: "checkout" | "account") => void
  /** The theme's first page has painted: the editor's loader over the canvas can go (editor page.tsx, compatFirstPaint). */
  onPainted?: () => void
  /**
   * False while the install's .storelib files (its layout and its sections)
   * are still being read. The page is drawn from them, so it is not drawn
   * before: drawn from the theme's other files alone it was a white page,
   * shown, and then the real page loaded again over it.
   */
  sourcesReady?: boolean
  /**
   * False while the shop's product cards are still on their way: the first
   * page waits for them (DATA_WAIT_MS at most) rather than being drawn with
   * stand-ins and its product sections drawn again a moment after it lands.
   */
  dataReady?: boolean
  /**
   * A page the pointer is resting on a link to (a row of the page list, a
   * link in the canvas), with the sections it would open with: drawn now,
   * out of sight, so a press on it shows a page already loaded (KEPT PAGES,
   * below).
   */
  warm?: { pageKey: string; sections: StoredSection[] } | null
  /**
   * The language the builder previews the website in (use-preview-language.ts):
   * its approved translations laid over the sections, menus and products, and
   * the theme's own words for it, as /fr draws it on the website. Absent, the
   * website's own language.
   */
  language?: { locale: string; defaultLanguage: string; languages: string[]; map: TranslationMap | null } | null
}

/*
  THE CART AND THE STORAGE OF THE CANVAS, per install, for as long as the
  builder is open: an add on the product page is in the drawer on the home
  page, and a heart pressed on one page is still pressed on the next. Never
  written anywhere; a reload of the builder starts both empty.
*/
const canvasCarts = new Map<string, CanvasCart>()
const canvasStorage = new Map<string, Record<string, Record<string, string>>>()

/*
  ═══════════════════════════════════════════════════════════════════════
   THE FIRST PAGE IS SHOWN WITH ITS FIRST SCREEN IN
  ═══════════════════════════════════════════════════════════════════════
  The loader came off 250ms after the page said it was ready, before its
  pictures had arrived: the page landed and its pictures popped in one by
  one over it ("the images flash"). A picture in the canvas is never in the
  browser's cache (the frame has no origin of its own, so nothing it loads
  is kept for the next frame), so that was every time. Now the loader comes
  off when the page says its first screen is in ("loaded", canvas-network.ts:
  fonts, and the pictures on the first screen arrived and decoded), and
  never later than FIRST_PAINT_MS after it said it was ready.
*/
const FIRST_PAINT_MS = 1200
/** The longest the first page waits for the shop's product cards (dataReady) once everything else is in. */
const DATA_WAIT_MS = 1200
/**
  The page being left fades off the one arriving, this long. Short: the new
  page is already whole under it, so this is a hand over, not a wait.
*/
const HANDOVER_MS = 180

/*
  ═══════════════════════════════════════════════════════════════════════
   THE CANVAS NEVER WAITS FOREVER (lib/website-builder/load-guard.ts)
  ═══════════════════════════════════════════════════════════════════════
  The outline of a page stayed up for good when any one of these happened:
  the theme's files never answered (or answered an error, which was kept as
  "this theme has no files" for the rest of the visit, ./compat-files), the
  page could not be drawn, the frame's page never said it was ready (a
  script of the theme's that stalls the page, a message missed), or a first
  page was replaced by a newer one before it said so, which nothing then
  told the placeholder. Each now ends: in the page, or in words and Try again.
*/
/** A frame that has said nothing by now is shown as it is: what it has drawn is better than the outline. */
const FRAME_CAP_MS = 6_000
/** A page loading behind the one on screen comes forward by now, whatever it has said. */
const BEHIND_CAP_MS = 7_000
/** Nothing to show by now: the outline says it is taking a while, and offers to try again. */
const SLOW_MS = 15_000
/** A kept page that has been shown already: out of sight and drawing nothing until it is wanted again (KEPT PAGES). Never a page behind, which draws itself whole under the front. */
const KEPT_STYLE = { zIndex: 0, pointerEvents: "none", visibility: "hidden" } as const
/** How many pages are kept loaded out of sight (KEPT PAGES): a computer's, and a phone's. */
const KEEP_PAGES = 3
const KEEP_PAGES_PHONE = 2

/*
  WHAT A FRAME WAS DRAWN WITH, BESIDES ITS SECTIONS: the theme (its files and
  settings, one object per change), the shop's data, the product's stock and
  the site's address. A kept page drawn with other values is not the page a
  draw would give now, and is never shown again.
*/
const themeIds = new WeakMap<object, number>()
let themeCount = 0
const themeId = (t: object | null) => {
  if (!t) return 0
  let id = themeIds.get(t)
  if (!id) themeIds.set(t, (id = ++themeCount))
  return id
}

/* Kept apart (./compat-files) so the editor can ask for the files before this canvas's code has arrived. */
export { loadCompatFiles }

/** The page's shape: which sections, in which order, shown or not. A change to it draws the page again. */
const shapeOf = (sections: StoredSection[]) => sections.map((s) => `${s.id}:${s.type}:${s.group ?? ""}:${s.hidden ? 1 : 0}`).join("|")

/** A product in the language previewed: its title and description, as lib/markets/compat.ts lays them over on the website. */
function inLanguage(card: ProductCard, map: TranslationMap): ProductCard {
  const c = card as ProductCard & { descriptionHtml?: string }
  const opts = { approvedOnly: true }
  const settings = localizeRecord(c.settings as unknown as Record<string, unknown>, `product:${c.id}`, ["title", "description"], map, opts)
  const html = c.descriptionHtml !== undefined ? (localizeRecord({ description: c.descriptionHtml }, `product:${c.id}`, ["description"], map, opts).description as string) : undefined
  if (settings === (c.settings as unknown) && html === c.descriptionHtml) return card
  return { ...c, settings, ...(html !== undefined ? { descriptionHtml: html } : {}) } as unknown as ProductCard
}

/** A link in the previewed language's page (/fr/products/x), as the builder names the page (/products/x). */
function withoutLanguage(href: string, lang: string): string {
  if (!lang) return href
  const prefix = `/${localePrefix(lang)}`
  if (!href.startsWith("/")) return href
  if (href === prefix) return "/"
  return href.startsWith(`${prefix}/`) || href.startsWith(`${prefix}?`) || href.startsWith(`${prefix}#`) ? href.slice(prefix.length) || "/" : href
}

export function CompatCanvas(props: CompatCanvasProps) {
  const { installId, sources, pageKey, collections, shopName } = props
  /*
    A THEME SETTING UNDER A FINGER IS DRAWN TOO. A slider or a colour in
    Theme settings writes its values to the live layer while the finger is
    down (lib/website-builder/live-settings.ts), and only the Storelib canvas
    read them: on an imported theme the page did not move until the finger
    lifted, and then jumped. Measured on Dawn's page width
    (docs/audits/website-builder-engine-2026-10.md, C2): 11 values, the frame
    changed none of them, the first change 264ms after release.
  */
  const settings = useLiveTheme(props.theme as unknown as ThemeSettingsValues) as unknown as Record<string, unknown>
  /* A slider under a finger: its section is drawn again with each value, before the editor commits it (lib/website-builder/live-settings.ts). */
  const ownSections = useLiveSections(props.sections as unknown as SectionInstance[]) as unknown as StoredSection[]
  const language = props.language ?? null
  const langCode = language?.locale ?? ""
  const box = useRef<HTMLDivElement | null>(null)
  const [compatFiles, setCompatFiles] = useState<Record<string, string> | null>(null)
  const [height, setHeight] = useState(800)
  const scrollY = useRef(0)
  /* Whether the inspector is on, for a page drawn from now: it knows before its first paint (canvas-bridge.ts, window.__slInspect). */
  const inspecting = useRef(props.inspectorEnabled)
  inspecting.current = props.inspectorEnabled

  /* Try again: everything asked for again, from the theme's files on. */
  const [attempt, setAttempt] = useState(0)
  /* What stopped the page being shown, in a word: said over the outline with Try again. */
  const [failure, setFailure] = useState<"files" | "draw" | "slow" | null>(null)

  /* The theme's own files: templates, config, the default locale, its stylesheets and scripts. */
  const filesVersion = props.filesVersion ?? 0
  const readVersion = useRef(filesVersion)
  useEffect(() => {
    let live = true
    /* Changed elsewhere since they were read: asked for again, and the page already drawn stays until they are here. */
    if (readVersion.current !== filesVersion) {
      readVersion.current = filesVersion
      forgetCompatFiles(installId)
    }
    loadCompatFiles(installId).then(
      (files) => { if (live) setCompatFiles(files) },
      () => { if (live) setFailure("files") },
    )
    return () => { live = false }
  }, [installId, attempt, filesVersion])

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

  /* The theme's own words in the language previewed (its locales/fr.json), for `| t`: read once per language. */
  const [langFiles, setLangFiles] = useState<{ lang: string; files: Record<string, string> } | null>(null)
  useEffect(() => {
    if (!langCode || langFiles?.lang === langCode) return
    let live = true
    fetch(`/api/website-builder/themes/${installId}/files?compat-locale=${encodeURIComponent(langCode)}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ files?: Record<string, string> }>) : { files: {} }))
      .then((d) => { if (live) setLangFiles({ lang: langCode, files: d.files ?? {} }) })
      .catch(() => { if (live) setLangFiles({ lang: langCode, files: {} }) })
    return () => { live = false }
  }, [installId, langCode, langFiles?.lang])
  const wordsFiles = langCode && langFiles?.lang === langCode ? langFiles.files : null

  /* Not before the install's own .storelib files are in (sourcesReady): the page is drawn from them. */
  const sourcesReady = props.sourcesReady !== false
  const rows = useMemo(() => (compatFiles && sourcesReady ? { ...sources, ...compatFiles, ...(wordsFiles ?? {}) } : null), [sources, compatFiles, sourcesReady, wordsFiles])
  const compatTheme = useMemo(() => {
    if (!rows) return null
    const media = assetAddresses(rows)
    /* A theme that cannot be read is said (failure "draw", below), never a canvas that throws the editor away. */
    try {
      return themeOfInstall(rows, settings, {
        assetUrl: (name) => media[name] ?? `/api/site-theme/assets/${installId}/edit/${encodeURIComponent(name)}`,
        assetText: (name) => rows[`shopify/assets/${name}`] ?? null,
        /* "shopify://shop_images/logo.png": the theme's own picture of that name where it brought one, as the live site draws it (lib/website-builder/compat-site.ts). */
        imageUrl: (v) => (/^https?:\/\//.test(v) || v.startsWith("/") ? v : media[shopImageName(v) ?? ""] ?? ""),
      })
    } catch (e) {
      console.error("[compat-canvas] the theme could not be read", e)
      reportLoadProblem("compat-canvas", e)
      return null
    }
  }, [rows, settings, installId])
  const themeUnreadable = !!rows && !compatTheme

  /*
    IN THE LANGUAGE PREVIEWED: the same overlay the website draws /fr with
    (lib/markets/compat.ts localizeCompatSite), read with the theme's own
    schemas. What has no approved translation stays as written.
  */
  const map = language?.map ?? null
  const fields = useMemo(() => (compatTheme && map ? compatFields(compatTheme) : null), [compatTheme, map])
  const sections = useMemo(
    () => (fields && map ? (localizeSections(ownSections as unknown as SectionInstance[], map, fields.fieldsOf, fields.blockFieldsOf, { approvedOnly: true }) as unknown as StoredSection[]) : ownSections),
    [ownSections, fields, map],
  )
  const products = useMemo(() => (map ? props.products.map((c) => inLanguage(c, map)) : props.products), [props.products, map])
  const catalog = useMemo(() => (map && props.catalog ? props.catalog.map((c) => inLanguage(c, map)) : props.catalog), [props.catalog, map])
  const menus = useMemo(() => (map ? localizeMenus(props.menus as never, map, { approvedOnly: true }) as CompatCanvasProps["menus"] : props.menus), [props.menus, map])
  const i18n = useMemo(() => (language ? { locale: language.locale, defaultLanguage: language.defaultLanguage, languages: language.languages } : undefined), [language?.locale, language?.defaultLanguage, language?.languages.join(",")])

  /*
    BY WHAT THEY HOLD, NOT BY WHICH OBJECT. The editor makes its menus again
    from the page on every edit, and a new object here drew the whole page
    again for every letter typed into a heading: the frame reloaded under the
    person typing, and the last letter went to the page being thrown away.
  */
  const productId = props.productId ?? null
  const pageKeys = props.pageKeys
  const dataKey = JSON.stringify([products, catalog, collections, menus, shopName, pageKeys])
  const dataRef = useRef({ products, catalog, collections, menus, shopName, pageKeys })
  dataRef.current = { products, catalog, collections, menus, shopName, pageKeys }
  /*
    THE PRODUCT PAGE'S VARIANTS, AS THE LIVE SITE DRAWS THEM. The cards are
    the shop's list copy; what is true now about each variant (on sale or
    archived, its option values, sold out, how many are left, Limit sales,
    a download's sales limit, Continue selling, the SKU, where it can be
    picked up) is read for the product the page shows by the very read the
    live site's loader makes (lib/storelib-theme/compat/product-facts-
    server.ts, through app/api/website-builder/products ?facts=1), and read
    again when the builder comes back into view, after a change in
    Products. "Only 3 left" follows Website settings › Commerce, as on the
    live site.
  */
  const showLeft = siteCommerce(settings).showStockLeft
  const [stock, setStock] = useState<{ id: string; facts: PageFacts } | null>(null)
  useEffect(() => {
    if (pageKey !== "product") return
    const { products, catalog } = dataRef.current
    const card = (productId ? products.find((p) => p.id === productId) ?? catalog?.find((p) => p.id === productId) : null) ?? products[0] ?? null
    if (!card) return
    let alive = true
    const read = () =>
      fetch(`/api/website-builder/products?id=${encodeURIComponent(card.id)}&facts=1`, { cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<{ facts?: PageFacts | null }>) : null))
        .then((d) => {
          if (!alive || !d?.facts) return
          const next = { id: card.id, facts: d.facts }
          setStock((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
        })
        .catch(() => {})
    void read()
    const again = () => {
      if (document.visibilityState === "visible") void read()
    }
    document.addEventListener("visibilitychange", again)
    window.addEventListener("focus", again)
    return () => {
      alive = false
      document.removeEventListener("visibilitychange", again)
      window.removeEventListener("focus", again)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageKey, productId, dataKey])
  const stockKey = stock ? `${JSON.stringify(stock)}:${showLeft}` : ""
  /* The page a key draws, as the canvas draws it: the one in front (`page`), or one drawn ahead out of sight (KEPT PAGES). */
  const pageFor = (pageKey: string, productId: string | null): CompatPage => {
    const { products, catalog, collections, menus, shopName, pageKeys } = dataRef.current
    const { template, suffix } = templateOfPage(pageKey)
    const picked = productId ? products.find((p) => p.id === productId) ?? catalog?.find((p) => p.id === productId) : null
    const found = picked ?? products[0] ?? null
    const sample = found && stock && stock.id === found.id ? (withPageFacts(found as unknown as { id: string; settings: Record<string, unknown> }, { ...stock.facts, showLeft }) as unknown as ProductCard) : found
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
      pageKeys: pageKeys ? [...pageKeys] : undefined,
      shop: { name: shopName, currency: "USD", moneyFormat: "${{amount}}" },
      i18n,
      /* The builder's own cart (canvasCarts), so the cart page and a drawer drawn again show what was added. */
      cart: cartLines({ products }, canvasCarts.get(installId)?.cart ?? []),
      /* A product page is drawn about the product opened, a collection page about the first collection, as Shopify's editor does. */
      product: template === "product" ? sample : null,
      collection: template === "collection" ? firstCollection ?? { id: "all", title: "Products", handle: "all", url: "/collections/all", products, products_count: products.length } : null,
      search: template === "search" ? { terms: sample ? String(sample.settings.title).split(" ")[0] : "", results: products.slice(0, 8), performed: true } : null,
      pageObject: template === "page" ? { title: pageKey.replace(/-/g, " ").replace(/^./, (x) => x.toUpperCase()), content: "", handle: pageKey, url: `/pages/${pageKey}` } : null,
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const page = useMemo((): CompatPage => pageFor(pageKey, productId), [pageKey, dataKey, productId, stockKey, i18n])
  const pageRef = useRef(page)
  pageRef.current = page

  /*
    THE ACCOUNT PAGES, IN THE CANVAS. The header's account link opens
    /account/login (or /account, /account/register) here, drawn by the theme
    as the website draws it (site.ts canvasAccountPage), so it can be seen
    and styled. They are not pages of the builder's own: this page stays the
    one being edited, and any other link, or another page picked, leaves.
    Sending a form on them says sign in works on the live site.
  */
  const [accountPath, setAccountPath] = useState<string | null>(null)
  const accountRef = useRef(accountPath)
  accountRef.current = accountPath
  useEffect(() => setAccountPath(null), [pageKey, productId])

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
    drawn otherwise), or another page, is loaded again, and then BEHIND the
    one on screen: the new frame loads under it, and takes the old one's
    place once it is drawn and its pictures are in. The canvas never shows
    an empty frame.
  */
  const shape = shapeOf(sections)
  const sectionsRef = useRef(sections)
  sectionsRef.current = sections
  /* Which page is drawn, in which files: a different one is always loaded again. */
  const docKeyFor = (pageKey: string, productId: string | null, account: string | null) => `${installId}:${langCode}:${pageKey}:${pageKey === "product" ? productId ?? "" : ""}:${rows ? Object.keys(rows).length : 0}:${sources === undefined ? "" : Object.keys(sources).length}:${account ?? ""}`
  const docKey = docKeyFor(pageKey, productId, accountPath)
  /* What a page drawn now is drawn with besides its sections (themeId, above). */
  const stamp = `${themeId(compatTheme)}|${dataKey}|${stockKey}|${props.siteUrl ?? ""}`
  const stampRef = useRef(stamp)
  stampRef.current = stamp
  const canvasSite = (): SiteData => {
    const { products, catalog, collections, menus } = dataRef.current
    return { creatorId: "", theme: compatTheme!, pages: canvasPages(compatTheme!, pageKey, sectionsRef.current), products, pickable: catalog, collections, menus, shop: pageRef.current.shop, host: "", designMode: true, i18n }
  }
  /* `ahead`: a page drawn out of sight (KEPT PAGES): its own page, at its top, never an account page. */
  const draw = (list: StoredSection[], ahead?: CompatPage) => {
    const drawnPage = ahead ?? page
    const restore = `<script>(function(){var y=${ahead ? 0 : Math.round(scrollY.current)};if(y>0)addEventListener("load",function(){scrollTo(0,y)})})();</script>`
    let site = ""
    try {
      site = props.siteUrl ? new URL(props.siteUrl).origin : ""
    } catch {
      site = ""
    }
    const extra = { extraHead: "<style data-storelib-gutter>html{scrollbar-gutter:stable}</style>", extraBodyEnd: `<script>window.__slSite=${JSON.stringify(site).replace(/</g, "\\u003c")};window.__slInspect=${inspecting.current ? "true" : "false"};${CANVAS_BRIDGE}</script>${restore}` }
    const account = !ahead && accountPath ? canvasAccountPage(canvasSite(), accountPath, extra) : null
    const drawn = account ?? drawPage(compatTheme!, drawnPage, list, { scripts: true, ...extra })
    /* Before anything of the theme's: its scripts read storage on their first line, and may ask for the cart as they start. CANVAS_SHOWN says when the page has painted its first screen. */
    const seed = `<script>window.__slPath=${JSON.stringify(account?.path ?? drawnPage.path).replace(/</g, "\\u003c")};window.__slSeed=${JSON.stringify(canvasStorage.get(installId) ?? {}).replace(/</g, "\\u003c")};</script>`
    /* No safe-area inset in the canvas: it reaches no edge of the phone (canvas-network.ts, canvasInsets). */
    return canvasInsets(drawn.html).replace(/<head\b[^>]*>/i, (m) => `${m}${seed}${CANVAS_HEAD}${CANVAS_SHOWN}`)
  }

  /*
    `page`: which page of the builder it draws (`${pageKey}|${productId}`), said to the editor when it comes to the front.
    `stamp`: what it was drawn with besides its sections (above); `account`: an account page (never kept); `ahead`: drawn ahead, never yet shown.
  */
  type Slot = { n: number; key: string; page: string; html: string; shape: DocShape; drawnFrom: Map<string, string>; ready: boolean; loaded: boolean; stamp: string; account: boolean; ahead?: boolean }
  const [slots, setSlots] = useState<Slot[]>([])
  /* The theme's first page has painted (its pictures in, or a moment after it is ready): the placeholder over it fades. */
  const [painted, setPainted] = useState(false)
  const paintedRef = useRef(painted)
  paintedRef.current = painted
  const onPainted = useRef(props.onPainted)
  onPainted.current = props.onPainted
  const shown = painted && slots.length > 0
  /* A failure is said over the canvas, so the editor's own loader steps aside for it as it does for a page. */
  const stuck = failure !== null || themeUnreadable
  /*
    One frame after the page has been told it is shown (below), so its
    entrance is back at its start under the loader before the loader starts
    to fade, never put back in view.
  */
  useEffect(() => {
    if (!shown && !stuck) return
    let id = requestAnimationFrame(() => { id = requestAnimationFrame(() => onPainted.current?.()) })
    return () => cancelAnimationFrame(id)
  }, [shown, stuck])
  const slotsRef = useRef<Slot[]>([])
  slotsRef.current = slots
  const frames = useRef(new Map<number, HTMLIFrameElement>())
  const counter = useRef(0)
  const front = () => slotsRef.current[0] ?? null
  const frontWindow = () => { const f = front(); return f ? frames.current.get(f.n)?.contentWindow ?? null : null }

  /* A page loaded behind the one on screen. */
  const loadBehind = (html: string, key: string, list: StoredSection[]) => {
    const slot: Slot = { n: ++counter.current, key, page: `${pageKey}|${productId ?? ""}`, html, shape: docShape(html), drawnFrom: new Map(list.map((s) => [s.id, JSON.stringify(s)])), ready: false, loaded: false, stamp: stampRef.current, account: !!accountPath }
    setSlots((prev) => (prev.length === 0 ? [slot] : [prev[0], slot]))
    /* One that never says it has loaded (a stalled script of the theme's, a message missed) still comes forward. */
    window.setTimeout(() => promote(slot.n), BEHIND_CAP_MS)
  }

  /*
    ═══════════════════════════════════════════════════════════════════════
     KEPT PAGES: A PAGE ALREADY LOADED IS NOT LOADED AGAIN (round 25)
    ═══════════════════════════════════════════════════════════════════════
    "Navigating between pages in the editor takes too long." Every page
    switch loaded a new frame, and a frame with no origin of its own keeps
    nothing it loads: measured, every one of the theme's stylesheets and
    scripts was asked for again on every switch (25 of them for a theme with
    Dawn's count), from the server, before the page could be shown, and the
    page left was thrown away when the next came forward.

    So the page left is KEPT, loaded, out of sight (KEEP_PAGES of them, the
    oldest let go first), and a page the pointer rests on a link to is drawn
    AHEAD the same way (`warm`, from the editor). Going to a kept page takes
    no request and no load: it comes forward the way a page behind does
    (scrolled to its top, settled, then the page left fades off it).

    Only a page that is exactly what a draw would give now: the same page,
    the same sections, the same theme, shop and stock (`stamp`). Anything
    else is drawn and loaded as before. Kept pages hear nothing but the
    answers to their own requests, and are let go when the theme changes.
  */
  const [kept, setKept] = useState<Slot[]>([])
  const keptRef = useRef<Slot[]>([])
  keptRef.current = kept
  const keepMax = () => (typeof window !== "undefined" && window.innerWidth < 768 ? KEEP_PAGES_PHONE : KEEP_PAGES)
  const keep = (slot: Slot) => setKept((prev) => [...prev.filter((x) => x.n !== slot.n && x.key !== slot.key), slot].slice(-keepMax()))
  /** Whether a frame holds exactly these sections, in this order. */
  const holds = (slot: Slot, list: StoredSection[]) => {
    if (slot.drawnFrom.size !== list.length) return false
    const drawn = [...slot.drawnFrom]
    return list.every((s, i) => drawn[i][0] === s.id && drawn[i][1] === JSON.stringify(s))
  }
  /** A kept page that is this page as a draw would give it now, brought behind the front to come forward. */
  const bringKept = (key: string, list: StoredSection[]): boolean => {
    const hit = keptRef.current.find((x) => x.key === key && x.stamp === stampRef.current && holds(x, list))
    if (!hit) return false
    hit.ahead = false
    setKept((prev) => prev.filter((x) => x.n !== hit.n))
    setSlots((prev) => (prev.length === 0 ? [hit] : [prev[0], hit]))
    const win = frames.current.get(hit.n)?.contentWindow
    win?.postMessage({ storelib: 1, type: "select", ...select.current, scroll: false }, "*")
    /* Loaded already: put at its top and settled, then forward ("settled" below). Not yet: its own "loaded" does that. */
    if (hit.loaded) win?.postMessage({ storelib: 1, type: "scroll", top: 0, settle: true }, "*")
    window.setTimeout(() => promote(hit.n), BEHIND_CAP_MS)
    return true
  }
  /* The theme, the shop or the stock changed: no kept page is the page a draw would give any more. */
  useEffect(() => {
    setKept((prev) => (prev.some((x) => x.stamp !== stamp) ? prev.filter((x) => x.stamp === stamp) : prev))
  }, [stamp])
  /* A page the pointer rests on a link to, drawn ahead out of sight. Not before the first page is shown, never a product page or the page in front. */
  const warm = props.warm ?? null
  useEffect(() => {
    if (!warm || !compatTheme || !paintedRef.current || warm.pageKey === pageKey || warm.pageKey === "product") return
    const key = docKeyFor(warm.pageKey, null, null)
    if (slotsRef.current.some((x) => x.key === key)) return
    /* In the language previewed, as the page in front is (`sections`, above). */
    const list = fields && map ? (localizeSections(warm.sections as unknown as SectionInstance[], map, fields.fieldsOf, fields.blockFieldsOf, { approvedOnly: true }) as unknown as StoredSection[]) : warm.sections
    if (keptRef.current.some((x) => x.key === key && x.stamp === stampRef.current && holds(x, list))) return
    let html: string
    try {
      html = draw(list, pageFor(warm.pageKey, null))
    } catch {
      return
    }
    keep({ n: ++counter.current, key, page: `${warm.pageKey}|`, html, shape: docShape(html), drawnFrom: new Map(list.map((s) => [s.id, JSON.stringify(s)])), ready: false, loaded: false, stamp: stampRef.current, account: false, ahead: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warm, compatTheme])

  /*
    ═══════════════════════════════════════════════════════════════════════
     WHILE A FINGER IS DOWN, THE PAGE IS DRAWN AS OFTEN AS IT CAN BE, NOT MORE
    ═══════════════════════════════════════════════════════════════════════
    A theme setting draws the whole page again, and on a large theme that is
    tens of milliseconds of the builder's main thread (Horizon's home page,
    C1 in the audit). Asked once per value of a drag, the drawing queued
    behind itself and the thumb stuttered behind the finger. So during a
    gesture only the newest page is drawn, and the next draw waits for the
    next frame and for as long as the last one took: the page follows the
    finger at the rate the device can draw it, and a value overtaken before
    it was drawn is never drawn at all. Outside a gesture nothing waits.
  */
  const redraw = useRef<{ run: (() => void) | null; timer: number; frame: number; nextAt: number }>({ run: null, timer: 0, frame: 0, nextAt: 0 })
  const runRedraw = (run: () => void) => {
    const r = redraw.current
    const t0 = performance.now()
    try { run() } finally {
      const cost = performance.now() - t0
      r.nextAt = performance.now() + cost
    }
  }
  const cancelRedraw = () => {
    const r = redraw.current
    r.run = null
    if (r.timer) { clearTimeout(r.timer); r.timer = 0 }
    if (r.frame) { cancelAnimationFrame(r.frame); r.frame = 0 }
  }
  const scheduleRedraw = (run: () => void) => {
    const r = redraw.current
    r.run = run
    if (r.timer || r.frame) return
    const go = () => {
      r.frame = requestAnimationFrame(() => {
        r.frame = 0
        const next = r.run
        r.run = null
        if (next) runRedraw(next)
      })
    }
    const wait = r.nextAt - performance.now()
    if (wait > 1) r.timer = window.setTimeout(() => { r.timer = 0; go() }, wait)
    else go()
  }
  useEffect(() => () => cancelRedraw(), [])

  /*
    THE FIRST PAGE IS DRAWN ONCE, WITH THE SHOP IN IT. The product cards
    come from their own request, and a page drawn before they arrived was
    drawn again when they did: a second page loaded behind the first while
    it was still appearing, or its product sections swapped out a moment
    after it had landed. The first page waits for them (dataReady), never
    longer than DATA_WAIT_MS once the theme itself can be drawn.
  */
  const [dataWaitOver, setDataWaitOver] = useState(false)
  const holdForData = props.dataReady === false && !dataWaitOver && slots.length === 0
  useEffect(() => {
    if (!compatTheme || !holdForData) return
    const t = window.setTimeout(() => setDataWaitOver(true), DATA_WAIT_MS)
    return () => window.clearTimeout(t)
  }, [compatTheme, holdForData])

  useEffect(() => {
    if (!compatTheme || holdForData) return
    const run = () => drawAndPatch()
    if (isLive()) { scheduleRedraw(run); return }
    cancelRedraw()
    runRedraw(run)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compatTheme, page, shape, docKey, accountPath, attempt, holdForData])

  /* A change arrived for the page in front while it was loading: drawn again and sent to it when it is ready. */
  const stale = useRef(false)
  /* The page drawn now and compared with the one on screen; what differs is sent to it. Reads everything it needs when it runs. */
  const drawAndPatch = () => {
    if (!compatTheme) return
    stale.current = false
    /* An account page wears only this page's header, footer and overlay: those are the sections it can take a change to. */
    const list = accountPath ? sectionsRef.current.filter((s) => s.group === "header" || s.group === "footer" || s.group === "overlay") : sectionsRef.current
    /* Another page opens at its top, as a page of the website does: not where the page it replaces was scrolled to. */
    if (front() && front()!.key !== docKey) scrollY.current = 0
    /* Another page, kept loaded as it would be drawn now: brought forward, nothing drawn or loaded (KEPT PAGES). */
    if (front() && front()!.key !== docKey && !accountPath && slotsRef.current[1]?.key !== docKey && bringKept(docKey, list)) return
    /* A page that cannot be drawn this time leaves the one on screen as it is: never a blank canvas. */
    let html: string
    try {
      html = draw(list)
    } catch (e) {
      console.error("[compat-canvas] the page could not be drawn", e)
      /* With nothing on screen yet, that is said, with Try again; otherwise the page on screen stays. */
      if (!front()) {
        reportLoadProblem("compat-canvas", e)
        setFailure("draw")
      }
      return
    }
    const now = front()
    if (!now) { loadBehind(html, docKey, list); return }
    const next = docShape(html)
    const plan = now.key === docKey ? planPatch(now.shape, next) : null
    const win = frontWindow()
    /*
      THE SAME PAGE, NOT READY YET: CHANGED WHEN IT IS. A change that came in
      while the page on screen was still loading (the shop's cards, the
      store's name) loaded a whole second copy of the page behind it, which
      then replaced the first as it was appearing: every picture asked for
      again, the entrance played again. It is sent to this page in place as
      soon as it says it is ready ("ready" below), before it is shown.
    */
    if (plan && !now.ready) {
      stale.current = true
      return
    }
    if (!plan || !win) {
      loadBehind(html, docKey, list)
      return
    }
    now.stamp = stampRef.current
    if (plan.empty) { now.shape = next; return }
    /* With the markup it was drawn from, so the page can change only what differs (canvas-bridge.ts, morph). */
    for (const sw of plan.swaps) win.postMessage({ storelib: 1, type: "section", id: sw.id, html: sw.html, prev: now.shape.sections.get(sw.id) }, "*")
    if (Object.keys(plan.message).length) win.postMessage({ storelib: 1, type: "patch", ...plan.message }, "*")
    now.shape = next
    for (const s of list) now.drawnFrom.set(s.id, JSON.stringify(s))
    for (const id of [...now.drawnFrom.keys()]) if (!list.some((s) => s.id === id)) now.drawnFrom.delete(id)
    /* A page that changed behind this one is out of date too: drawn again from now. */
    if (slotsRef.current[1]) loadBehind(html, docKey, list)
  }

  const drawAndPatchRef = useRef(drawAndPatch)
  drawAndPatchRef.current = drawAndPatch

  /*
    A section's settings or blocks changed: that section, drawn again and
    swapped in. Only into a page that is ready: a change made while the page
    is loading is sent when it says it is (the "ready" message below).
  */
  const syncSlot = (slot: Slot) => {
    const win = frames.current.get(slot.n)?.contentWindow
    if (!compatTheme || !win || !slot.ready) return
    /*
      ONLY A PAGE OF THE PAGE BEING EDITED. While another page opens, the
      page being left is still in front, and the editor already holds the
      next page's sections: a section of the same id on both (a Shopify
      template's "main" is on every page) was drawn for the next page and
      swapped into the one being left, which showed it for as long as the
      next page took to load, and kept it (KEPT PAGES).
    */
    if (slot.key !== docKey) return
    const list = sectionsRef.current
    const changed = list.filter((s) => slot.drawnFrom.has(s.id) && slot.drawnFrom.get(s.id) !== JSON.stringify(s))
    if (!changed.length) return
    let ctx: ReturnType<typeof pageContextFor>
    try {
      ctx = pageContextFor(compatTheme, page, list)
    } catch (e) {
      console.error("[compat-canvas] the page could not be read", e)
      return
    }
    for (const s of changed) {
      /* Its place among its own part's sections, as the page was drawn (section.index). */
      const at = sectionIndexIn(list, s)
      const group = s.group === "header" || s.group === "footer" ? s.group : undefined
      let html: string
      try {
        html = canvasInsets(drawSection(compatTheme, ctx, s, at, group).html)
      } catch (e) {
        /* This section stays as it was drawn; the others still change. */
        console.error("[compat-canvas] a section could not be drawn", e)
        continue
      }
      win.postMessage({ storelib: 1, type: "section", id: s.id, html, prev: slot.shape.sections.get(s.id) }, "*")
      slot.drawnFrom.set(s.id, JSON.stringify(s))
      slot.shape.sections.set(s.id, html)
    }
  }
  const sync = useRef<() => void>(() => {})
  sync.current = () => { for (const slot of slotsRef.current) syncSlot(slot) }
  /*
    AT MOST ONCE A FRAME. A slider under a finger renders this with every
    value it passes, several between two frames, and each one drew the
    section through the theme's Liquid again on the editor's main thread.
    The values in between are never seen; the last one in the frame is.
  */
  const syncFrame = useRef(0)
  useEffect(() => {
    if (syncFrame.current) return
    syncFrame.current = requestAnimationFrame(() => {
      syncFrame.current = 0
      sync.current()
    })
  }, [sections, compatTheme, page])
  useEffect(() => () => { if (syncFrame.current) cancelAnimationFrame(syncFrame.current) }, [])

  /* The selection, outlined in the page and announced to the theme. */
  const selectedBlock = props.selectedBlockId ? props.selectedBlockId.split(/[/>]/).pop() ?? null : null
  const select = useRef({ sectionId: props.selectedSectionId, blockId: selectedBlock, inspect: props.inspectorEnabled })
  select.current = { sectionId: props.inspectorEnabled ? props.selectedSectionId : null, blockId: props.inspectorEnabled ? selectedBlock : null, inspect: props.inspectorEnabled }
  /*
    EVERY PAGE HEARS IT, NOT ONLY THE ONE IN FRONT. A page loading behind the
    one on screen that had already said it was ready kept the inspector as it
    was when it said so, and came forward outlining sections with the
    inspector off. And only a new selection scrolls to itself: switching the
    inspector back on leaves the page where it is.
  */
  const lastPicked = useRef<string>("")
  useEffect(() => {
    const picked = `${select.current.sectionId ?? ""}|${select.current.blockId ?? ""}`
    const scroll = select.current.inspect && picked !== lastPicked.current && lastPicked.current !== ""
    if (select.current.inspect) lastPicked.current = picked
    slotsRef.current.forEach((slot, i) => {
      if (!slot.ready) return
      frames.current.get(slot.n)?.contentWindow?.postMessage({ storelib: 1, type: "select", ...select.current, scroll: i === 0 && scroll }, "*")
    })
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
  /* The language previewed: its links carry /fr, and the builder's pages are named without it. */
  const langRef = useRef(langCode)
  langRef.current = langCode
  const onLiveOnly = useRef(props.onLiveOnly)
  onLiveOnly.current = props.onLiveOnly
  const onIntent = useRef(props.onIntent)
  onIntent.current = props.onIntent
  /*
    A REQUEST FROM THE THEME'S SCRIPTS (Add to cart, the drawer drawn again,
    a product's data), answered as the website answers it, from this page,
    the shop and the builder's cart (lib/storelib-theme/compat/canvas-cart.ts).
  */
  const answerRequest = (win: Window, m: { id?: unknown; method?: unknown; url?: unknown; body?: unknown; ajax?: unknown }) => {
    if (!compatTheme || typeof m.id !== "number" || typeof m.url !== "string") return
    const { products, catalog, collections, menus, pageKeys } = dataRef.current
    const current = pageRef.current
    const site: SiteData = {
      creatorId: "",
      theme: compatTheme,
      pages: canvasPages(compatTheme, pageKey, sectionsRef.current),
      pageKeys: pageKeys ? [...pageKeys] : undefined,
      products,
      pickable: catalog,
      collections,
      menus,
      shop: current.shop,
      host: "",
      designMode: true,
      i18n,
      /* The product the page shows, with what is true now about its variants: a section drawn again on a choice (`?option_values=`, `?variant=`) says the same stock as the page did. */
      product: async (handle) => {
        const p = current.product
        return p && (String(p.settings.slug ?? "") === handle || p.id === handle) ? p : null
      },
    }
    const id = m.id
    const state = canvasCarts.get(installId) ?? { cart: [], note: "" }
    const body = m.body && typeof m.body === "object" ? (m.body as Record<string, unknown>) : null
    answerInCanvas(site, state, { method: typeof m.method === "string" ? m.method : "GET", url: m.url, body, ajax: m.ajax === true }, accountRef.current ?? current.path)
      .then(({ answer, state: next }) => {
        canvasCarts.set(installId, next)
        const { type: contentType, ...rest } = answer
        win.postMessage({ storelib: 1, type: "response", id, contentType, ...rest }, "*")
      })
      .catch((e) => {
        console.error("[compat-canvas] a request from the page could not be answered", e)
        win.postMessage({ storelib: 1, type: "response", id, status: 500, contentType: "application/json", body: JSON.stringify({ status: 500, message: "Something went wrong" }) }, "*")
      })
  }
  const answerRequestRef = useRef(answerRequest)
  answerRequestRef.current = answerRequest
  /*
    ═══════════════════════════════════════════════════════════════════════
     THE PAGE BEHIND COMES FORWARD WHOLE, AND ARRIVES AS THE WEBSITE'S DOES
    ═══════════════════════════════════════════════════════════════════════
    Another page opened from a link in the canvas or from the page list was
    shown four ways at once (filmed in scripts/check-canvas20.ts, About to
    Home on the Posturex fixture): the editor dimmed the page being left the
    moment the new page's sections arrived; the new page's frame waited
    behind with `visibility: hidden`, where the browser does not draw it and
    runs none of its animation frames, so it came forward unpainted.

    So the page behind is drawn UNDER the one in front, visible to the
    browser and covered by the front: it lays itself out, its fonts load,
    the pictures on its first screen arrive and decode, its scripts start.
    It says when its first screen is in (canvas-network.ts, CANVAS_SHOWN),
    it is put where it should be scrolled to and says it is there
    ("settled"), and then it comes forward.

    It used to come forward as a cut, with its entrance already finished
    for it out of sight: the page landed flat, "too direct", nothing of the
    theme's own arrival (the hero fading up, the sections rising) that the
    live site plays. Now the page being left fades off it (HANDOVER_MS, the
    page under it already whole, so nothing white and nothing half drawn
    shows through), and the page arriving is told it is shown ("shown"),
    which plays its first screen's entrance from the beginning where it can
    be seen, as the website does when the page opens.
  */
  /* The page being left, over the one that came forward, while it fades off it. */
  const [handover, setHandover] = useState<Slot | null>(null)
  const promote = (n: number) => {
    /*
      The page that comes forward is drawn: the outline goes with it. A first
      page replaced by a newer one before it had said it was ready left the
      outline up over a page that was there all along.
    */
    const list = slotsRef.current
    const at = list.findIndex((x) => x.n === n)
    if (at <= 0) return
    /* Another page: the one being left fades off it. The same page drawn again (an edit) is a cut: it looks as the one it replaces does. */
    if (paintedRef.current && list[0].key !== list[at].key && !(typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches)) setHandover(list[0])
    setPainted(true)
    /* Another page: the one being left is kept, loaded, for going back to it (KEPT PAGES), as it now stands. */
    if (list[0].key !== list[at].key && !list[0].account && list[0].ready) {
      list[0].stamp = stampRef.current
      keep(list[0])
    }
    setSlots((prev) => {
      const i = prev.findIndex((x) => x.n === n)
      return i <= 0 ? prev : prev.slice(i)
    })
  }
  /* Fades the page being left off the one under it, then lets it go. */
  useLayoutEffect(() => {
    if (!handover) return
    const el = frames.current.get(handover.n)
    const done = () => setHandover((h) => (h === handover ? null : h))
    if (!el || typeof el.animate !== "function") return done()
    const a = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: HANDOVER_MS, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "forwards" })
    a.finished.then(done, done)
    return () => a.cancel()
  }, [handover])
  /* The page in front changed: the editor's sections panel swaps its list in the same frame. */
  const onPageShown = useRef(props.onPageShown)
  onPageShown.current = props.onPageShown
  const frontPage = slots[0]?.page ?? null
  const frontN = slots[0]?.n ?? 0
  useEffect(() => { if (frontPage) onPageShown.current?.(frontPage) }, [frontPage, frontN])
  /*
    THE PAGE IN FRONT IS TOLD WHEN IT CAN BE SEEN: the first page as the
    loader comes off it, a page that came forward as it does. Its first
    screen's entrance plays from the beginning there (canvas-network.ts).
  */
  useEffect(() => {
    if (!shown || !frontN) return
    frames.current.get(frontN)?.contentWindow?.postMessage({ storelib: 1, type: "shown" }, "*")
  }, [shown, frontN])
  /*
    A LINK PRESSED TO ANOTHER PAGE LEAVES THE PAGE IN FRONT STILL. Until the
    next page is drawn, the page being left takes no pointer: on the video a
    pointer passing over Shop on its way off the header opened the theme's
    product menu over About while Home was loading, and that menu was the
    "products section" that flashed before Home.
  */
  const [leavingFrom, setLeavingFrom] = useState<number | null>(null)
  useEffect(() => {
    if (leavingFrom === null) return
    const t = setTimeout(() => setLeavingFrom(null), 4000)
    return () => clearTimeout(t)
  }, [leavingFrom])
  useEffect(() => { if (leavingFrom !== null && slots[0]?.n !== leavingFrom) setLeavingFrom(null) }, [slots, leavingFrom])
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const slot = slotsRef.current.find((x) => frames.current.get(x.n)?.contentWindow === e.source)
      const m = e.data as { storelib?: number; type?: string; sectionId?: string; blockPath?: string[]; scrollY?: number }
      if (!slot) {
        /* A kept page (KEPT PAGES): what it says about itself is noted, its requests answered, and nothing else of it is heard. */
        const away = keptRef.current.find((x) => frames.current.get(x.n)?.contentWindow === e.source)
        if (!away || !m || m.storelib !== 1) return
        if (m.type === "ready") {
          away.ready = true
          ;(e.source as Window).postMessage({ storelib: 1, type: "select", ...select.current, scroll: false }, "*")
        } else if (m.type === "loaded") away.loaded = true
        else if (m.type === "request") answerRequestRef.current(e.source as Window, m as never)
        return
      }
      if (!m || m.storelib !== 1) return
      const win = e.source as Window
      const isFront = slot === slotsRef.current[0]
      if (m.type === "ready") {
        slot.ready = true
        /*
          READY IS DRAWABLE. The bridge says so at the end of the page's
          markup, after the theme's stylesheets (a script waits for the
          stylesheets above it), so the page can paint now; its pictures
          arrive as they do on any website. It waited 900ms here for them,
          which was most of what the placeholder cost on a quick load.
        */
        if (isFront) setTimeout(() => setPainted(true), FIRST_PAINT_MS)
        /* A change that came in while it loaded, sent now, before it is shown. */
        if (isFront && stale.current) drawAndPatchRef.current()
        syncSlot(slot)
        win.postMessage({ storelib: 1, type: "select", ...select.current, scroll: false }, "*")
        /* A page behind that never says it has loaded still comes forward. */
        if (!isFront) setTimeout(() => promote(slot.n), 2500)
      } else if (m.type === "loaded") {
        slot.loaded = true
        if (isFront) setPainted(true)
        /* Where it should stand (the same page drawn again stays where it was; another page opens at its top), and told to say when it is drawn there. */
        if (!isFront) {
          const same = slot.key === slotsRef.current[0]?.key
          /* The same page drawn again (an edit): settled where it ends before it replaces the one in front (canvas-network.ts, instant). */
          if (same) win.postMessage({ storelib: 1, type: "shown", instant: true }, "*")
          win.postMessage({ storelib: 1, type: "scroll", top: same ? scrollY.current : 0, settle: true }, "*")
        }
      } else if (m.type === "settled") {
        if (!isFront && slot.loaded) promote(slot.n)
      } else if (m.type === "reload") {
        /* The page could not take a change in place: drawn again, behind it. */
        if (isFront && compatTheme) {
          try {
            loadBehind(draw(sectionsRef.current), slot.key, sectionsRef.current)
          } catch (e) {
            console.error("[compat-canvas] the page could not be drawn", e)
          }
        }
      } else if (m.type === "request") {
        answerRequestRef.current(win, m as never)
      } else if (m.type === "live-only" && isFront) {
        onLiveOnly.current?.((m as { what?: unknown }).what === "account" ? "account" : "checkout")
      } else if (m.type === "leaving" && isFront && slot.ready) {
        /* A script opened another address in the frame (location.href = "/checkout"): the page is drawn again in its place. */
        if ((m as { checkout?: boolean }).checkout === true) onLiveOnly.current?.("checkout")
        if (compatTheme) {
          try {
            loadBehind(draw(sectionsRef.current), slot.key, sectionsRef.current)
          } catch (err) {
            console.error("[compat-canvas] the page could not be drawn", err)
          }
        }
      } else if (m.type === "storage") {
        const st = m as { area?: unknown; items?: unknown }
        if ((st.area === "localStorage" || st.area === "sessionStorage") && st.items && typeof st.items === "object") {
          canvasStorage.set(installId, { ...(canvasStorage.get(installId) ?? {}), [st.area]: st.items as Record<string, string> })
        }
      } else if (m.type === "navigate" && isFront) {
        const n = m as { href?: string; chrome?: boolean }
        if (typeof n.href !== "string") return
        n.href = withoutLanguage(n.href, langRef.current)
        const to = n.href.split(/[?#]/)[0].replace(/\/+$/, "") || "/"
        if ((CANVAS_ACCOUNT_PATHS as readonly string[]).includes(to)) {
          /* As any link in the page: from the header and footer always, from the page itself while the inspector is off. */
          if (n.chrome === true || !inspecting.current) setAccountPath(to)
          return
        }
        /* Leaving an account page: the page being edited again, then wherever the link goes. */
        if (accountRef.current) setAccountPath(null)
        if (onNavigate.current?.(n.href, n.chrome === true) === true) setLeavingFrom(slot.n)
      } else if (m.type === "intent" && isFront) {
        const h = (m as { href?: unknown }).href
        if (typeof h === "string") onIntent.current?.(withoutLanguage(h, langRef.current))
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

  /*
    THE FRAME'S OWN LOAD EVENT, WHATEVER THE PAGE SAID. The page's messages
    are how the canvas knows it has drawn, and a message can be missed (sent
    before anything listened, or a theme script that stops the bridge). The
    frame element's load event is the browser's, so it is heard whatever
    order things happened in: a page that has loaded is asked again whether
    it is ready ("hello", canvas-bridge.ts), and is shown.
  */
  const onFrameLoad = (n: number) => {
    const at = slotsRef.current.findIndex((x) => x.n === n)
    if (at < 0) {
      const away = keptRef.current.find((x) => x.n === n)
      if (away && !away.ready) frames.current.get(n)?.contentWindow?.postMessage({ storelib: 1, type: "hello" }, "*")
      return
    }
    const slot = slotsRef.current[at]
    if (!slot.ready) frames.current.get(n)?.contentWindow?.postMessage({ storelib: 1, type: "hello" }, "*")
    /*
      In front: shown once it says its first screen is in ("loaded"), or
      FIRST_PAINT_MS after it said it was ready. A page that has said
      neither by its load event is shown a moment after it. The load event
      itself is not the first screen: a picture the theme loads lazily is
      not waited for by it, and the page landed with its hero still empty.
    */
    if (at === 0) {
      if (!slot.ready) window.setTimeout(() => setPainted(true), 400)
    } else {
      /* Behind: its own "loaded" brings it forward in a frame; this is for a page whose message never comes. */
      window.setTimeout(() => { if (!slot.loaded) promote(n) }, 400)
    }
  }

  /*
    A FRAME THAT SAYS NOTHING IS SHOWN AS IT IS after FRAME_CAP_MS, and a
    canvas with nothing to show after SLOW_MS says so and offers Try again.
    Both are said to the error log once.
  */
  const hasSlot = slots.length > 0
  const blocked = failure === "files" || failure === "draw" || themeUnreadable
  useEffect(() => {
    if (shown || blocked) return
    const t = window.setTimeout(() => {
      if (slotsRef.current.length > 0) {
        setPainted(true)
        reportLoadProblem("compat-canvas", "the page never said it had drawn; shown as it is")
      }
    }, FRAME_CAP_MS)
    return () => window.clearTimeout(t)
  }, [shown, blocked, hasSlot, attempt])
  useEffect(() => {
    if (shown || stuck) return
    const t = window.setTimeout(() => {
      setFailure((f) => f ?? "slow")
      reportLoadProblem("compat-canvas", `nothing to show after ${SLOW_MS / 1000}s`)
    }, SLOW_MS)
    return () => window.clearTimeout(t)
  }, [shown, stuck, attempt])
  /* The page arrived after all: whatever was said about it goes. */
  useEffect(() => { if (shown && failure === "slow") setFailure(null) }, [shown, failure])

  const retry = () => {
    /* Anything but a slow wait asks for the theme's files afresh: an answer that could not be read is not read again. */
    if (failure !== "slow") {
      forgetCompatFiles(installId)
      setCompatFiles(null)
    }
    setFailure(null)
    setPainted(false)
    setSlots([])
    setKept([])
    setAttempt((n) => n + 1)
  }

  const compat = compatOf(settings)
  return (
    <div ref={box} className="relative w-full" style={{ height }} data-compat-canvas={compat?.theme ?? ""}>
      {/* Until the theme's first page has painted: the shape of a page, still, never a blank sheet or a line of text. */}
      <CanvasPlaceholder hidden={shown} label={`Loading ${compat?.theme ?? "the theme"}`} />
      {!shown && (failure || themeUnreadable) ? <CanvasProblem kind={themeUnreadable ? "draw" : failure!} {...PROBLEM_WORDS[themeUnreadable ? "draw" : failure!]} onRetry={retry} /> : null}
      {slots.length === 0 ? null : (
        <div className="sticky top-0 h-full w-full" style={{ height }}>
          {/*
            IN THE ORDER THEY WERE MADE, NEVER MOVED. Which page is in front is
            the slot order (slots[0]); the frames themselves stay where they
            were put in the page. Rendered in the slot order, a page coming
            forward reordered them, React moved the page being left in the
            document, and a frame that is moved loads its page again. That
            page then said it was ready, was taken for a page behind, and was
            brought forward over the one just opened: a header link showed
            the new page for a moment and went back, or the two swapped back
            and forth (measured in scripts/check-builder-nav19.ts: after a
            second link the canvas was left on its grey outline).
          */}
          {/*
            THE PAGE BEHIND IS UNDER THE FRONT, NOT HIDDEN. `visibility:
            hidden` kept the browser from drawing it at all (and from running
            its animation frames), so it was only drawn once it was already in
            front. Under the front frame (opaque, white) it is drawn exactly
            as it will be seen and is covered until the front is taken away.
          */}
          {/*
            THE PAGE BEING LEFT, while it fades off the page that came forward
            (handover): over it, taking no pointer, still the same frame in the
            same place, so nothing about it loads again.
          */}
          {/*
            KEPT PAGES are frames like the others, in the same order, so a page
            going from kept to behind to front is never moved either. One drawn
            ahead lies under the front like a page behind, drawing itself whole;
            one that has been shown already is out of sight until it is wanted
            again, so its slideshows and animations cost nothing meanwhile.
          */}
          {[...(handover && !slots.some((x) => x.n === handover.n) ? [...slots, handover] : [...slots]), ...kept.filter((k) => !slots.some((x) => x.n === k.n) && k.n !== handover?.n)].sort((a, b) => a.n - b.n).map((slot) => {
            const i = slots.indexOf(slot)
            const role = i === 0 ? "front" : i > 0 ? "behind" : slot === handover ? "leaving" : slot.ahead ? "ahead" : "kept"
            return (
              <iframe
                key={slot.n}
                ref={(el) => { if (el) frames.current.set(slot.n, el); else frames.current.delete(slot.n) }}
                title={`${compat?.theme ?? "Theme"} preview`}
                srcDoc={slot.html}
                onLoad={() => onFrameLoad(slot.n)}
                sandbox="allow-scripts allow-forms allow-popups"
                data-compat-frame={role}
                aria-hidden={i === 0 ? undefined : true}
                tabIndex={i === 0 ? undefined : -1}
                className="absolute inset-0 block h-full w-full border-0 bg-white"
                style={role === "front" ? { zIndex: 1, pointerEvents: leavingFrom === slot.n ? "none" : undefined } : role === "leaving" ? { zIndex: 2, pointerEvents: "none" } : role === "kept" ? KEPT_STYLE : { zIndex: 0, pointerEvents: "none" }}
              />
            )
          })}
          {ghost && props.inspectorEnabled && props.selectedSectionId === ghost.id && (
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
  return (
    <div
      aria-hidden={hidden || undefined}
      aria-busy={!hidden || undefined}
      aria-label={hidden ? undefined : label}
      data-canvas-placeholder={hidden ? "gone" : "up"}
      className="pointer-events-none absolute inset-0 z-[1] overflow-hidden bg-white transition-opacity duration-[220ms] ease-out"
      style={{ opacity: hidden ? 0 : 1, visibility: hidden ? "hidden" : "visible", transitionProperty: "opacity, visibility" }}
    >
      <PageOutline />
    </div>
  )
}

/* "slow" is not a failure yet: the page is still being asked for, and comes in under this if it arrives. */
const PROBLEM_WORDS = {
  slow: { title: "This is taking longer than usual", body: "Your theme is still loading." },
  files: { title: "Your theme didn't load", body: "Check your connection and try again." },
  draw: { title: "This page couldn't be shown", body: "Try again. If it keeps happening, reload the editor." },
} as const

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
