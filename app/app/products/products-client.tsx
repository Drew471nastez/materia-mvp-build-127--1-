"use client"

import { announceChange } from "@/lib/seo/announce-client"
import { forgetProduct } from "@/lib/products/forget-client"
import { deleteProduct, deleteQuestion, isStale, previewProductDelete, rememberDeleted, rememberStatus, takeNotice, withChanges, type DeleteKind } from "@/lib/products/delete-client"
import { memo, useCallback, useState, useRef, useEffect, useLayoutEffect, useMemo, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from "react"
import Link from "next/link"
import { ArrowUpDown, ChevronLeft, ChevronRight, Download, Plus, Search, X } from "lucide-react"
import { getCanonicalSiteUrl, getProductUrl } from "@/lib/url-helpers"
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import { PickSheet } from "./pick-sheet"
import { asksInPlace, useNewProductChooser } from "./new/kind-chooser"
import { cn } from "@/lib/utils"
import { useRouter } from "next/navigation"
import { useStoreCurrency } from "@/lib/store/currency-context"
import { productPriceCurrency } from "@/lib/money/product-currency"
import { GUTTER, LIST_BAR, LIST_WIDTH, PaneBar, RowMenuButton, StatusBadge, buttonSecondary, card, formatMoney, iconButton } from "../orders/order-parts"
import { accentDepth } from "@/components/ui/depth-button"
import { isNativeApp, openExternal } from "@/lib/native-bridge"
import { editorAnswered, isReturning, listShown, openEditor, takeEdited, warmEditor, warmInTurn, whenIdle, WAIT_LONGEST_MS, WAIT_TICK_MS } from "./list-return"
import { getAppNavigation, holdLanding } from "@/lib/ui/app-navigation"
import { startNavigationLoading } from "@/components/app/navigation-loading-bar"
import { ActivitySpinner } from "@/components/ui/activity-spinner"
import { playList, shootList, type ListShot } from "./list-motion"
import { LAYER_LEAVE_MS, LAYER_PRESS_WAIT_MS } from "@/components/app/page-layer"
import { createClient } from "@/lib/supabase/client"
import { PullToRefresh } from "@/components/ui/pull-to-refresh"
import { useLanguage } from "@/lib/i18n"
import { STORELIB_LOGO, STORELIB_LOGO_SHADOW, storelibAssetUrl } from "@/lib/brand/logo"
import { PORTRAIT_QUALITY, optimizedImageUrl, optimizedSrcSet } from "@/lib/images/optimized-url"
import { archiveProduct, isArchivedProduct as isArchived, restoreProduct } from "@/lib/products/archive"
import { pressMark } from "@/lib/press-mark"
import { ReadinessBanner } from "@/components/physical/readiness-banner"
import { tt } from "@/lib/i18n/text"
import { appLocale, zoned } from "@/lib/i18n/format"

interface Product {
  id: string
  creator_id: string
  title: string
  type: string
  price_cents: number
  status: string
  thumbnail_url: string | null
  slug: string
  created_at: string
  archived?: boolean
  description?: string | null
  includes_community?: boolean
  sales_count?: number | null
}

/*
 * ORDERS' AND EMAILS' LIST, FOR PRODUCTS. The page wears the same parts as
 * Orders and Emails (../orders/order-parts): the 1200px column and its bar,
 * the 24px title (28px from 640px), a white card whose first row is the
 * toolbar (the views as tabs, Search, Sort), and rows drawn the way those
 * lists draw them. Only what a product has that an order does not is its
 * own: the picture, and New product in violet (the owner: "The New product
 * button needs to be purple there, both on mobile and desktop").
 */
const NEW_LOOK = cn(accentDepth, "h-8 gap-1.5 rounded-lg px-3 text-[13px]")
/** A phone's press is 44px tall around a 32px bar button, as Orders' Export is. */
const BAR_PRESS = "relative before:absolute before:-inset-y-1.5 before:inset-x-0 before:content-[''] sm:before:hidden"

/**
 * A row's more button: Orders' and Emails' (RowMenuButton), 44px on a phone.
 * On a touch screen its pressed grey waits 130ms, as a sheet's rows do
 * (app/globals.css A SWIPE THROUGH A SHEET OF CHOICES LIGHTS NOTHING), so a
 * scroll that starts on it lights nothing.
 */
const ROW_MENU = "relative z-[1] pointer-coarse:active:delay-[130ms] [-webkit-tap-highlight-color:transparent]"

/**
 * THE PICTURES, SHARP ON EVERY SCREEN. They went through next/image at a
 * fixed width, which offers a 1x and a 2x file at Next's default quality of
 * 75: on a 3x phone a 56px picture was a 128px file stretched over 168
 * device pixels, and at 75 a small picture's edges went soft and blocky.
 * Now each size offers the files its box needs at 1x, 2x and 3x, with honest
 * `w` descriptors and `sizes`, so the browser takes the smallest one that
 * is sharp at its own pixel ratio, at quality 88 (listed in next.config's
 * images.qualities, or the optimizer answers 400). Three candidates each,
 * not Next's fifteen, so fifty rows do not add a page of markup. A
 * phone's box is 48px and the table's 40px.
 */
type ThumbSize = "phone" | "table"
const THUMB_QUALITY = PORTRAIT_QUALITY
const THUMB_FILES: Record<ThumbSize, number[]> = { phone: [48, 96, 144], table: [40, 80, 120] }
const THUMB_SIZES: Record<ThumbSize, string> = { phone: "48px", table: "40px" }
/** The box each size is drawn in: the width and height the picture reserves, and its fallback file. */
const THUMB_BOX: Record<ThumbSize, number> = { phone: 48, table: 40 }

/** How long a pointer rests on a row before its editor is fetched ahead. */
const WARM_REST_MS = 50
/** How many of the first rows are fetched ahead once the list is idle. */
const WARM_AHEAD = 3
/**
 * A product fetched ahead is asked for again after this. The router keeps a
 * page for five minutes (staleTimes), and a refresh after a save drops them
 * all, so a list left open longer, or refreshed, found its hover and its
 * finger going down doing nothing while the press waited for the server.
 * Asking again for a page the router still holds costs nothing.
 */
const WARM_AGAIN_MS = 60_000

/** How many rows a page holds before the footer's arrows take over. */
const PAGE_SIZE = 50

/**
 * WHERE THE LIST WAS LEFT. Opening a product and coming back is a new page
 * to the router, so the list would open on All, Newest, no search, page 1.
 * Kept here for the tab instead (never stored), and read as the page's first
 * state only when this visit is a return: the way back from the editor, or
 * the browser's back or forward (isReturning, ./list-return). Then the list
 * comes back as it was left, at the scroll the stage puts back. A fresh
 * visit, from the sidebar or the pill, and a full load start from nothing.
 */
let leftAt: { view: View; sort: Sort; search: string; page: number } | null = null

/** The edited row's tint as the list comes back, fading out once the editor has gone. */
const EDITED_TINT = "#f3effe"
const EDITED_FADE_MS = 1200


interface ProductsClientProps {
  products: Product[]
  creatorUsername: string
}

/**
 * Text into the report's markup. The report is written into a window this
 * page opens, which is this origin, so a title with markup in it would have
 * run there as script.
 */
const escapeHtml = (value: unknown) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string)

// StoreLib branded PDF Export function
const generateProductsPDF = (products: Product[], formatPrice: (cents: number, product: Product) => string) => {
  const today = new Date().toLocaleDateString(appLocale(), zoned({ year: 'numeric', month: 'long', day: 'numeric' }))

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Products Report - StoreLib</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; color: #1a1a2e; }
        .header { text-align: center; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 2px solid #e5e7eb; }
        .logo { margin-bottom: 16px; }
        .logo img { width: 32px; height: 32px; border-radius: 7px; box-shadow: ${STORELIB_LOGO_SHADOW}; }
        .header h1 { font-size: 28px; font-weight: 600; margin-bottom: 8px; }
        .header p { color: #6b7280; font-size: 14px; }
        .summary { display: flex; gap: 20px; margin-bottom: 30px; flex-wrap: wrap; }
        .summary-card { flex: 1; min-width: 150px; background: #f9fafb; padding: 20px; border-radius: 12px; border: 1px solid #e5e7eb; }
        .summary-card .label { font-size: 12px; color: #6b7280; margin-bottom: 4px; }
        .summary-card .value { font-size: 24px; font-weight: 600; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th { background: #f9fafb; padding: 14px 12px; text-align: left; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e5e7eb; }
        td { padding: 16px 12px; border-bottom: 1px solid #e5e7eb; font-size: 14px; }
        tr:hover { background: #f9fafb; }
        .product-title { font-weight: 500; color: #1a1a2e; }
        .status { display: inline-block; padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 500; text-transform: capitalize; }
        .status-published { background: #f5f3ff; color: #8b5cf6; }
        .status-draft { background: #f3f4f6; color: #6b7280; }
        .status-archived { background: #f3f4f6; color: #6b7280; }
        .price { font-weight: 600; color: #1a1a2e; }
        .footer { margin-top: 40px; text-align: center; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 12px; }
        .footer img { width: 20px; height: 20px; border-radius: 7px; box-shadow: ${STORELIB_LOGO_SHADOW}; margin-bottom: 8px; opacity: 0.6; }
        .branding { display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 4px; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="logo">
          <img src="${storelibAssetUrl(STORELIB_LOGO)}" alt="Storelib" width="32" height="32" />
        </div>
        <h1>Products Report</h1>
        <p>Generated on ${today}</p>
      </div>

      <div class="summary">
        <div class="summary-card">
          <div class="label">Total Products</div>
          <div class="value">${products.length}</div>
        </div>
        <div class="summary-card">
          <div class="label">Published</div>
          <div class="value">${products.filter(p => p.status === 'published' && !isArchived(p)).length}</div>
        </div>
        <div class="summary-card">
          <div class="label">Drafts</div>
          <div class="value">${products.filter(p => p.status !== 'published' && !isArchived(p)).length}</div>
        </div>
        <div class="summary-card">
          <div class="label">Archived</div>
          <div class="value">${products.filter(isArchived).length}</div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Product</th>
            <th>Type</th>
            <th>Price</th>
            <th>Status</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          ${products.map(product => `
            <tr>
              <td class="product-title">${escapeHtml(product.title)}</td>
              <td>${escapeHtml(product.type)}</td>
              <td class="price">${escapeHtml(formatPrice(product.price_cents, product))}</td>
              <td><span class="status status-${isArchived(product) ? 'archived' : product.status === 'published' ? 'published' : 'draft'}">${isArchived(product) ? tt("Archived") : escapeHtml(product.status)}</span></td>
              <td>${new Date(product.created_at).toLocaleDateString(appLocale(), zoned({ year: 'numeric', month: 'short', day: 'numeric' }))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="footer">
        <div class="branding">
          <img src="${storelibAssetUrl(STORELIB_LOGO)}" alt="Storelib" width="20" height="20" />
        </div>
        <p>This report contains ${products.length} product(s) • Powered by StoreLib</p>
      </div>
    </body>
    </html>
  `

  // Open in new window for printing/saving as PDF
  const printWindow = window.open('', '_blank')
  if (printWindow) {
    printWindow.document.write(htmlContent)
    printWindow.document.close()
    printWindow.onload = () => {
      printWindow.print()
    }
  }
}

// CSV Export function
const generateProductsCSV = (products: Product[], formatPrice: (cents: number, product: Product) => string) => {
  const headers = [tt("Title"), tt("Type"), tt("Price"), tt("Status"), tt("Slug"), tt("Created At"), tt("Description")]

  const rows = products.map(product => [
    `"${product.title.replace(/"/g, '""')}"`,
    product.type,
    formatPrice(product.price_cents, product),
    isArchived(product) ? tt("Archived") : product.status,
    product.slug,
    new Date(product.created_at).toISOString(),
    `"${(product.description || '').replace(/"/g, '""')}"`
  ])

  const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n')

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  link.setAttribute('href', url)
  link.setAttribute('download', `products_${new Date().toISOString().split('T')[0]}.csv`)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

type View = "all" | "active" | "draft" | "archived"
type Sort = "newest" | "oldest" | "title_asc" | "title_desc" | "price_desc" | "price_asc" | "sales"

const SORTS: Array<{ value: Sort; label: string }> = [
  { value: "newest", get label() { return tt("Newest") } },
  { value: "oldest", get label() { return tt("Oldest") } },
  { value: "title_asc", get label() { return tt("Title A to Z") } },
  { value: "title_desc", get label() { return tt("Title Z to A") } },
  { value: "price_desc", get label() { return tt("Price high to low") } },
  { value: "price_asc", get label() { return tt("Price low to high") } },
  { value: "sales", get label() { return tt("Best selling") } },
]

/** Which view a product is in besides All: All is everything that is not archived. */
function inView(p: Product, view: View): boolean {
  if (view === "archived") return isArchived(p)
  if (isArchived(p)) return false
  if (view === "active") return p.status === "published"
  if (view === "draft") return p.status !== "published"
  return true
}

function compare(sort: Sort) {
  const created = (p: Product) => Date.parse(p.created_at) || 0
  switch (sort) {
    case "oldest":
      return (a: Product, b: Product) => created(a) - created(b)
    case "title_asc":
      return (a: Product, b: Product) => a.title.localeCompare(b.title)
    case "title_desc":
      return (a: Product, b: Product) => b.title.localeCompare(a.title)
    case "price_desc":
      return (a: Product, b: Product) => b.price_cents - a.price_cents
    case "price_asc":
      return (a: Product, b: Product) => a.price_cents - b.price_cents
    case "sales":
      return (a: Product, b: Product) => (b.sales_count ?? 0) - (a.sales_count ?? 0)
    default:
      return (a: Product, b: Product) => created(b) - created(a)
  }
}

export function ProductsClient({ products: initialProducts, creatorUsername }: ProductsClientProps) {
  const { t } = useLanguage()
  /* Drawn from the copy the router kept, with what this tab has deleted or archived since applied (lib/products/delete-client). */
  const [products, setProducts] = useState<Product[]>(() => withChanges(initialProducts))
  /*
    BACK TO THE LIST IS THE LIST, AS IT WAS. From 768px the editor is a page
    in the shell, not a layer (components/app/page-layer), so the way back
    from it, the editor's Back as much as the browser's, was a new page to
    the stage, which played its landing: every box of the list faded in from
    nothing and rose 2px, the "bump" Emails and Orders lost. A return comes
    back as it was left (the view, order, search and page below, the scroll
    the stage puts back, the rows the router kept), so it asks the stage for
    no landing (lib/ui/app-navigation holdLanding). On a phone the editor's
    own Back drops it off as a layer, which lands nothing either; the
    browser's back there did land, and no longer does. A fresh visit still
    lands. scripts/check-lists-back.mjs measures it.
  */
  const [returning] = useState(isReturning)
  useLayoutEffect(() => {
    if (returning) holdLanding()
  }, [returning])
  const [resumed] = useState(() => (returning ? leftAt : null))
  const [view, setView] = useState<View>(resumed?.view ?? "all")
  const [sort, setSort] = useState<Sort>(resumed?.sort ?? "newest")
  const [page, setPage] = useState(resumed?.page ?? 1)
  const [searchQuery, setSearchQuery] = useState(resumed?.search ?? "")
  /* The toolbar is the views or the search field, as on Orders; a list that comes back searched comes back with the field open. */
  const [searching, setSearching] = useState(() => !!resumed?.search)
  useEffect(() => {
    leftAt = { view, sort, search: searchQuery, page }
  }, [view, sort, searchQuery, page])
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [productToDelete, setProductToDelete] = useState<Product | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  /* What went wrong, said in the question itself: a toast would sit under its scrim. */
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [notification, setNotification] = useState<{ message: string; visible: boolean; type: "success" | "error" }>({ message: "", visible: false, type: "success" })
  /* One field on every width, in the card's toolbar. */
  const searchInputRef = useRef<HTMLInputElement>(null)

  const storeCurrency = useStoreCurrency()
  const exportPDF = () => {
    generateProductsPDF(products, (c, p) => formatMoney(c, productPriceCurrency(p, storeCurrency)))
    showNotification(tt("PDF report generated"))
  }
  const exportCSV = () => {
    generateProductsCSV(products, (c, p) => formatMoney(c, productPriceCurrency(p, storeCurrency)))
    showNotification(tt("CSV file downloaded"))
  }
  const exportItems = [
    { label: tt("Export as CSV"), onClick: exportCSV },
    { label: tt("Export as PDF"), onClick: exportPDF },
  ]

  /* Polaris's order, and as on Orders only the views with something in them, plus the open one. The view's button is there even with All alone, as it always was on a phone: the toolbar keeps its shape. */
  const views = useMemo(
    () =>
      ([
        { value: "all", label: t("products.all") },
        { value: "active", label: t("products.active") },
        { value: "draft", label: t("products.draft") },
        { value: "archived", label: t("products.archived") },
      ] as Array<{ value: View; label: string }>).filter((v) => v.value === "all" || v.value === view || products.some((p) => inView(p, v.value))),
    [t, view, products],
  )

  /* One timer: a second notice restarts it, rather than the first one's timer hiding the second early. */
  const notificationTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (notificationTimer.current) clearTimeout(notificationTimer.current)
  }, [])
  const showNotification = (message: string, type: "success" | "error" = "success") => {
    setNotification({ message, visible: true, type })
    if (notificationTimer.current) clearTimeout(notificationTimer.current)
    notificationTimer.current = setTimeout(() => setNotification({ message: "", visible: false, type: "success" }), 4000)
  }

  const filteredProducts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return products
      .filter((product) => inView(product, view) && (!query || product.title.toLowerCase().includes(query)))
      .sort(compare(sort))
  }, [products, view, searchQuery, sort])

  const pages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE))
  const pageNow = Math.min(page, pages)
  /* A delete that empties the last page shows the page before it, and the
     page is set there too: left at 2, the next product added would jump the
     list back to a page nobody asked for. */
  useEffect(() => {
    if (page > pages) setPage(pages)
  }, [page, pages])
  const from = (pageNow - 1) * PAGE_SIZE
  const pageProducts = filteredProducts.slice(from, from + PAGE_SIZE)

  /*
    A ROW, ONCE DRAWN, STAYS. Switching view, searching or sorting used to
    unmount every row that left and mount a new one for every row that came
    back: a new <img> each time, decoded again, a grey frame where the picture
    was. Now every product shown since the page opened keeps its element, in
    the current order, and the ones not in the view are only hidden. Coming
    back to All finds the same elements with their pictures already decoded,
    and only a row never shown before is new. Rows are keyed by product id.
  */
  const shownIds = useMemo(() => new Set(pageProducts.map((p) => p.id)), [pageProducts])
  const [kept, setKept] = useState<ReadonlySet<string>>(() => new Set())
  const drawn = useMemo(
    () => [...products].sort(compare(sort)).filter((p) => shownIds.has(p.id) || kept.has(p.id)),
    [products, sort, shownIds, kept],
  )
  useLayoutEffect(() => {
    for (const id of shownIds) {
      if (!kept.has(id)) {
        setKept((prev) => new Set([...prev, ...shownIds]))
        return
      }
    }
  }, [shownIds, kept])

  /* The change of view, measured just before and played just after (./list-motion). */
  const sectionRef = useRef<HTMLElement>(null)
  const listShot = useRef<ListShot | null>(null)
  useLayoutEffect(() => {
    const before = listShot.current
    listShot.current = null
    playList(sectionRef.current, before)
  }, [view])

  /**
   * Archive takes a product off every page; Restore brings it back as a
   * draft (lib/products/archive.ts). Which one is decided by what the row
   * shows now, and the row the database answers with replaces the page's
   * copy, so the list and the database cannot disagree afterwards.
   */
  const handleArchive = async (product: Product) => {
    const restoring = isArchived(product)
    try {
      const supabase = createClient()
      const row = restoring ? await restoreProduct(supabase, product.id) : await archiveProduct(supabase, product.id)
      announceChange({ product: product.id })
      /* Archived is off every page, and restored is back on one. Both are a
         change to what a visitor may see, so both purge what is cached. */
      await forgetProduct(product.id, product.slug)
      rememberStatus(product.id, row)
      setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, ...row } : p)))
      /* The router's kept pages (this list, the editor fetched ahead) still hold the old row. */
      router.refresh()
      showNotification(restoring ? (row.status === "published" ? tt("Product restored") : tt("Product restored as a draft")) : tt("Product archived"))
    } catch (error) {
      console.error("Error archiving product:", error)
      showNotification(restoring ? tt("Could not restore the product") : tt("Could not archive the product"), "error")
    }
  }

  const handleDuplicate = async (product: Product) => {
    try {
      const supabase = createClient()

      // Create a duplicate with a new title and all required fields
      const duplicateData = {
        creator_id: product.creator_id,
        title: tt("{title} (Copy)", { title: product.title }),
        type: product.type,
        price_cents: product.price_cents,
        status: "draft",
        thumbnail_url: product.thumbnail_url,
        slug: `${product.slug}-copy-${Date.now()}`,
        description: product.description || null,
        includes_community: product.includes_community || false,
        archived: false,
        /* A copy of a thing that ships ships too, never the column's default (part 161). */
        ...(product.type === "physical" ? { requires_shipping: true } : {}),
      }

      const { data, error } = await supabase
        .from("products")
        .insert(duplicateData)
        .select()
        .single()

      if (error) throw error

      if (data) {
        /* Settings › Sales channels: the copy is taken off the same channels as the product it copies. Best effort; the copy is a draft either way. */
        await fetch(`/api/store/channels/product?productId=${encodeURIComponent(product.id)}`, { cache: "no-store", credentials: "same-origin" })
          .then((r) => (r.ok ? r.json() : null))
          .then((d: { off?: string[] } | null) =>
            d?.off?.length
              ? fetch("/api/store/channels/product", { method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ productId: data.id, off: d.off }) })
              : null,
          )
          .catch(() => null)
        setProducts(prev => [data, ...prev])
        showNotification(tt("Product duplicated"))
      }
    } catch (error) {
      console.error("Error duplicating product:", error)
      showNotification(tt("Could not duplicate the product"), "error")
    }
  }

  /* What the press will do, asked before the question opens so its words are true: a product with sales is archived, never deleted. */
  const [deleteKind, setDeleteKind] = useState<DeleteKind>("delete")
  const previewing = useRef(false)
  const handleDeleteClick = async (product: Product) => {
    if (previewing.current) return
    previewing.current = true
    const kind = await previewProductDelete(product.id)
    previewing.current = false
    setDeleteKind(kind)
    setDeleteError(null)
    setProductToDelete(product)
    setDeleteModalOpen(true)
  }
  const closeDelete = () => {
    setDeleteModalOpen(false)
    setProductToDelete(null)
    setDeleteError(null)
  }

  /*
    THE QUESTION HAS THE KEYBOARD. Cancel, the safe answer, takes focus once
    the menu that opened it has let go (a tick later), Escape closes it
    unless a delete is running, and focus goes back where it was.
  */
  const deleteCancel = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!deleteModalOpen) return
    let opener: HTMLElement | null = null
    const t = setTimeout(() => {
      opener = document.activeElement as HTMLElement | null
      deleteCancel.current?.focus({ preventScroll: true })
    }, 0)
    return () => {
      clearTimeout(t)
      if (opener && opener.isConnected && opener !== document.body) opener.focus({ preventScroll: true })
    }
  }, [deleteModalOpen])
  useEffect(() => {
    if (!deleteModalOpen || isDeleting) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDelete()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [deleteModalOpen, isDeleting])

  const handleShare = async (product: Product) => {
    const url = getProductUrl(creatorUsername, product.slug)
    try {
      await navigator.clipboard.writeText(url)
      showNotification(tt("Link copied"))
    } catch (error) {
      console.error("Error copying to clipboard:", error)
      showNotification(tt("Could not copy the link"), "error")
    }
  }

  /*
    DELETE, ON THE SERVER (app/api/products/delete). It deletes by the
    session's own creator and answers with what the database did: deleted;
    archived, because the product has sales this database would lose with it
    (the one line why is shown); or not done, said in the question, which
    stays open. The caches and the OnePage are dealt with there too.
  */
  const handleDeleteConfirm = async () => {
    if (!productToDelete) return
    const product = productToDelete

    setIsDeleting(true)
    setDeleteError(null)
    try {
      const result = await deleteProduct(product.id)
      if (result.outcome === "deleted") {
        /* A live product's address now answers nothing; the search engines are
           told by the slug it had, since the row is gone. Never waited for. */
        if (product.status === "published" && product.slug) announceChange({ removedProduct: product.slug })
        rememberDeleted(product.id)
        setProducts(prev => prev.filter(p => p.id !== product.id))
        showNotification(tt("Product deleted"))
      } else {
        announceChange({ product: product.id })
        rememberStatus(product.id, result)
        setProducts(prev => prev.map(p => (p.id === product.id ? { ...p, status: result.status, archived: result.archived } : p)))
        showNotification(result.message)
      }
      closeDelete()
      /* The router's kept pages (this list, the editor fetched ahead) still hold the product. */
      router.refresh()
    } catch (error) {
      console.error("Error deleting product:", error)
      setDeleteError(error instanceof Error && error.message ? error.message : tt("Could not delete the product"))
    } finally {
      setIsDeleting(false)
    }
  }

  /* A new view, search or order starts from its first page. */
  const showView = (next: View) => {
    if (next === view) return
    listShot.current = shootList(sectionRef.current)
    setView(next)
    setPage(1)
  }
  const sortBy = (next: Sort) => {
    setSort(next)
    setPage(1)
  }
  /* The toolbar's two picks: on a phone a sheet, which hands over its pick once it has gone; from 768px a dropdown, at once (./pick-sheet). */
  const pickSort = (next: string) => sortBy(next as Sort)
  const search = (q: string) => {
    setSearchQuery(q)
    setPage(1)
  }
  const clearSearch = () => {
    search("")
    searchInputRef.current?.focus({ preventScroll: true })
  }
  /* Search opens the field in place of the views, focused; Cancel empties it and brings the views back. */
  const openSearch = () => {
    setSearching(true)
    requestAnimationFrame(() => searchInputRef.current?.focus({ preventScroll: true }))
  }
  const closeSearch = () => {
    search("")
    setSearching(false)
  }
  /* Escape clears the field, as its clear button does, and a second Escape closes it. */
  const searchKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Escape") return
    e.preventDefault()
    if (searchQuery) search("")
    else closeSearch()
  }

  /*
    OPENING A PRODUCT BEFORE IT IS PRESSED. The editor is a server page that
    reads the product, its files and its variants; a full prefetch fetches
    that whole payload, and the editor's code with it, before the press
    (./list-return warmEditor), so the press itself has nothing left to wait
    for. It starts at the first sign of intent: a pointer resting on a row
    for 50ms (one only passing over on its way somewhere else does not
    count), the finger or the button going down, or keyboard focus. Once the
    list has drawn and the browser is idle, New product and the first three
    rows are fetched ahead as well: those are the presses most visits end in,
    and on a phone there is no hover to give them a head start. Once per
    product per visit.
  */
  const router = useRouter()
  /*
    A COPY FROM BEFORE A CHANGE. The list was drawn from a page the router
    kept from before this tab deleted or archived something (from here or
    from the editor): the rows are already right (withChanges), and the kept
    pages are dropped so nothing else opens the old product. And the line
    the editor left for the list, when it deleted on its way here.
  */
  useEffect(() => {
    if (isStale(initialProducts)) router.refresh()
    const notice = takeNotice()
    if (notice) showNotification(notice)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, for the copy the list first drew
  }, [])
  /*
    PULL TO REFRESH READS THE ROWS ITSELF. The spinner waits for the
    database's answer, not for a router refresh it cannot see the end of; the
    router's kept copy is dropped behind it so the next visit is fresh too.
    The creator comes from a row already on the page when there is one.
  */
  const productsRef = useRef(products)
  productsRef.current = products
  const refreshList = useCallback(async () => {
    const supabase = createClient()
    let creatorId = productsRef.current[0]?.creator_id as string | undefined
    if (!creatorId) {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) return
      const { data: creator } = await supabase.from("creators").select("id").eq("user_id", session.user.id).maybeSingle()
      creatorId = (creator as { id: string } | null)?.id
    }
    if (!creatorId) return
    const { data } = await supabase.from("products").select("*").eq("creator_id", creatorId).order("created_at", { ascending: false })
    if (data) setProducts(withChanges((data as (Product & { community_id?: string | null })[]).filter((p) => !p.community_id)))
    router.refresh()
  }, [router])
  /* A refresh from anywhere (a save, an archive, the pull) hands the list new rows: drawn, with this tab's own changes kept. */
  const firstRows = useRef(initialProducts)
  useEffect(() => {
    if (firstRows.current === initialProducts) return
    firstRows.current = initialProducts
    setProducts(withChanges(initialProducts))
  }, [initialProducts])
  const warmed = useRef(new Map<string, number>())
  /* Once a minute at most per product (WARM_AGAIN_MS), not once per visit. */
  const due = (key: string) => {
    const at = warmed.current.get(key)
    if (at !== undefined && Date.now() - at < WARM_AGAIN_MS) return false
    warmed.current.set(key, Date.now())
    return true
  }
  const warm = (id: string) => {
    if (!due(id)) return
    warmEditor(router, `/app/products/${id}`)
  }
  const resting = useRef<ReturnType<typeof setTimeout> | null>(null)
  /*
    NEW PRODUCT ASKS FIRST: a digital product or a video course, and a paid
    community while communities are on (./new/kind-chooser.tsx), in a sheet
    on a phone and a dialog on a computer. Both editors it can open are fetched ahead the same way
    a row's is, so the pick finds its page here.
  */
  const newProduct = useNewProductChooser()
  const askNew = (e: ReactMouseEvent<HTMLAnchorElement>) => {
    if (!asksInPlace(e)) return
    e.preventDefault()
    newProduct.open()
  }
  const warmNew = () => {
    if (!due("new")) return
    newProduct.warm()
  }
  const firstShown = useRef<string[]>([])
  firstShown.current = pageProducts.slice(0, WARM_AHEAD).map((p) => p.id)
  /* One after another on a fresh session, not all at once (./list-return warmInTurn). */
  useEffect(() => {
    let stop: (() => void) | null = null
    const cancelIdle = whenIdle(() => {
      stop = warmInTurn([warmNew, ...firstShown.current.map((id) => () => warm(id))], () => createClient().auth.getSession())
    })
    return () => {
      cancelIdle()
      stop?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per visit, with the rows shown when the browser is idle
  }, [])

  /*
    OPENING THE EDITOR RAISES IT from the bottom over the list (../list-return,
    components/app/page-layer), the way it drops away again. A press with a
    modifier key, or not the main button, is left to the link: a new tab or
    window, as the browser does.
  */
  /*
    THE PRESS IS ANSWERED ON ITS OWN FRAME, ONCE, IN ONE PLACE. The editor is
    read on the server (the account, the product, its files and variants),
    and on a slow line that took seconds with the row looking untouched. The
    row you pressed takes its pressed tint in the press itself, and a spinner
    fades in where its Preview was if the editor is not here a tenth of a
    second later (OpeningMark). That is the whole answer: the layer is told
    not to add one of its own (openEditor's `answered`), which used to put a
    second spinner over whatever was under the pointer, the product's name,
    and paint the name away behind it.

    AND IT LASTS AS LONG AS THE WAIT. It ends when the editor arrives (this
    list goes with it) or when nothing is coming any more, never on a clock
    of its own: ../list-return, THE SIGN OF PROGRESS LASTS AS LONG AS THE
    WAIT.
  */
  const [opening, setOpening] = useState<string | null>(null)
  /* The lock, from the press itself: `opening` is drawn a frame later. */
  const openingRef = useRef(false)
  const openedAt = useRef(0)
  useEffect(() => {
    if (!opening) return
    /* Still here after all: shown again from the browser's back cache. The list comes back to life. */
    const reset = () => {
      openingRef.current = false
      setOpening(null)
    }
    const href = `/app/products/${opening}`
    const tick = window.setInterval(() => {
      const waited = performance.now() - openedAt.current
      /* The router's own request for the editor is still out: the wait is
         real, and the row goes on saying so. Nothing here tells the shell
         anything: a second "a navigation started" is not true, and the shell
         reads that as a press on the address already showing. */
      if (!editorAnswered(href, openedAt.current) && waited < WAIT_LONGEST_MS) return
      /* Answered, and this list is still the page: either it landed in this
         same commit (and this runs no more) or it is not coming. */
      if (getAppNavigation()) return
      reset()
    }, WAIT_TICK_MS)
    window.addEventListener("pageshow", reset)
    return () => {
      window.clearInterval(tick)
      window.removeEventListener("pageshow", reset)
    }
  }, [opening])
  /* `id` is the product's, or "new" for New product. */
  const open = (id: string) => {
    if (opening || openingRef.current) return
    const href = `/app/products/${id}`
    if (id === "new") warmNew()
    else warm(id)
    openingRef.current = true
    openedAt.current = performance.now()
    startNavigationLoading(href)
    /* The tint in the press's own task, on the row itself: React draws the
       same attribute a frame later, with the spinner, which is work the
       press must not wait for. New product has no row, and the layer answers
       it (openEditor). */
    if (id !== "new") {
      for (const el of sectionRef.current?.querySelectorAll<HTMLElement>(`[data-row="${CSS.escape(id)}"]`) ?? []) el.dataset.opening = ""
    }
    openEditor(router, href, id !== "new")
    requestAnimationFrame(() => setOpening(id))
  }
  const openFromLink = (id: string) => (e: ReactMouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    open(id)
  }

  /*
    THE ROW YOU CAME BACK FROM. Tinted as the list comes back under the
    editor, fading once the editor has gone, and brought into view if the
    list's scroll left it out.
  */
  useEffect(() => {
    listShown()
    const id = takeEdited()
    const section = sectionRef.current
    if (!id || !section) return
    const row = Array.from(section.querySelectorAll<HTMLElement>(`[data-row="${CSS.escape(id)}"]:not([hidden])`)).find((el) => el.getClientRects().length > 0)
    if (!row || typeof row.animate !== "function") return
    const pane = section.closest<HTMLElement>(".orders-pane")
    if (pane) {
      const r = row.getBoundingClientRect()
      const p = pane.getBoundingClientRect()
      if (r.top < p.top || r.bottom > p.bottom) pane.scrollTo({ top: pane.scrollTop + r.top - p.top - (p.height - r.height) / 2, behavior: "smooth" })
    }
    /* The table's cells are white and paint over their row, so there it is the cells that are tinted. */
    const targets = row.tagName === "TR" ? (Array.from(row.children) as HTMLElement[]) : [row]
    const rest = row.tagName === "TR" ? "#ffffff" : "rgba(243, 239, 254, 0)"
    for (const el of targets) {
      el.animate([{ backgroundColor: EDITED_TINT }, { backgroundColor: rest }], { duration: EDITED_FADE_MS, delay: LAYER_LEAVE_MS, easing: "ease-out", fill: "backwards" })
    }
  }, [])

  const statusLabel = useMemo<Record<Status, string>>(
    () => ({ live: t("products.active"), draft: t("products.draft"), archived: t("products.archived") }),
    [t],
  )
  /* What a row's menu says, once per language, so a row is not drawn again for it. */
  const rowLabels = useMemo<RowLabels>(
    () => ({ view: t("common.view"), share: t("products.share"), restore: t("products.restore"), archive: t("products.archive"), duplicate: t("products.duplicate") }),
    [t],
  )

  /*
    VIEW, IN THE ROW'S MENU. The product's own page in a new tab: a link, so
    the browser itself honours the new tab. In the app the page opens in the
    phone's browser through openExternal, as the editor's View does, with the
    whole address when View is the live route on Storelib itself. A draft or
    an archived product has no public page, so its View is there but off,
    with why under it.
  */
  const viewIn = isNativeApp()
    ? (url: string) => openExternal(url.startsWith("/") ? `${getCanonicalSiteUrl()}${url}` : url)
    : null

  /*
    A ROW IS DRAWN ONCE. Each row (PhoneRow, TableRow, below) is memoised on
    its product, whether it is hidden, and the words it shows, and reaches
    everything it does through `rowApi`, which this page keeps current and a
    row reads only at the moment of a press. So a sort, a new view, a search
    or a new page renders this component and moves the rows it already has;
    it does not draw fifty rows twice, each with its menu, again. Measured on
    a CPU slowed four times (scripts/check-products-sheets.mjs): picking an
    order in the phone's Sort sheet was 225ms of rendering once the sheet had
    gone.
  */
  const rowApi = useRef<RowApi | null>(null)
  useLayoutEffect(() => {
    rowApi.current = {
      rest: (id) => {
        if (resting.current) clearTimeout(resting.current)
        resting.current = setTimeout(() => warm(id), WARM_REST_MS)
      },
      leave: () => {
        if (resting.current) clearTimeout(resting.current)
      },
      warm,
      open: openFromLink,
      openRow: open,
      viewIn,
      share: handleShare,
      archive: handleArchive,
      duplicate: handleDuplicate,
      remove: handleDeleteClick,
    }
  })

  const emptyTitle = searchQuery
    ? tt("No products match")
    : products.length === 0
      ? tt("No products yet")
      : view === "archived"
        ? tt("No archived products")
        : view === "draft"
          ? tt("No drafts")
          : view === "active"
            ? tt("No active products")
            : tt("Every product is archived")

  const viewLabel = views.find((v) => v.value === view)?.label ?? t("products.all")

  /*
    THE BANNER THAT ARRIVES LATE. ReadinessBanner asks the server once the
    page has drawn (components/physical/readiness-client), so on a first
    visit it came in a moment after the list and pushed the whole card down
    in one frame: the jump on landing. One that was already there when the
    page drew stays put; one that arrives later opens its own room over
    BANNER_IN_MS, on the slot's height, once, so the card glides down rather
    than jumping.
  */
  const bannerSlot = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const slot = bannerSlot.current
    if (!slot || typeof MutationObserver === "undefined") return
    const observer = new MutationObserver(() => {
      if (!slot.firstElementChild || typeof slot.animate !== "function" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
      const height = slot.getBoundingClientRect().height
      if (!height) return
      slot.style.overflow = "hidden"
      const a = slot.animate([{ height: "0px", opacity: 0 }, { height: `${height}px`, opacity: 1 }], { duration: BANNER_IN_MS, easing: "cubic-bezier(0.4, 0, 0.2, 1)" })
      const done = () => {
        slot.style.overflow = ""
      }
      a.onfinish = done
      a.oncancel = done
    })
    observer.observe(slot, { childList: true })
    return () => observer.disconnect()
  }, [])

  return (
    <div className="orders-pane h-full overflow-y-auto overflow-x-hidden page-scroll bg-[#f8f9fa] app-page-enter">
      {notification.visible && (
        <div className="fixed top-[calc(68px+env(safe-area-inset-top)+12px)] md:top-[calc(58px+env(safe-area-inset-top)+14px)] left-1/2 -translate-x-1/2 z-[100] animate-in fade-in-0 slide-in-from-top-2 duration-300">
          <div className={`px-4 py-3 rounded-xl shadow-lg ${notification.type === "error" ? "bg-rose-600" : "bg-[#1a1a2e]"} text-white text-[13px] font-medium whitespace-nowrap max-w-[calc(100vw-2rem)] overflow-hidden text-ellipsis`}>
            {notification.message}
          </div>
        </div>
      )}

      {/*
        THE PULL MOVES THE WHOLE PAGE, TITLE AND ALL, as Orders' and Emails'
        do: the spinner opens in the room above "Products", at the very top
        of the page, the way iOS draws it. It used to wrap only the card, so
        the spinner came out between New product and the list.
      */}
      <PullToRefresh onRefresh={refreshList}>
      {/*
        THE BAR, AS ORDERS' AND EMAILS': the title, then Collections (from
        768px; on a phone it is under Products in the menu), Export and New
        product. Export is the Download icon alone on a phone. An empty shop
        has nothing to export or group, and its one way forward is the
        button in the middle of the card.
      */}
      <PaneBar width={LIST_WIDTH} className={LIST_BAR}>
        <h1 className="min-w-0 truncate text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">{t("products.title")}</h1>
        {products.length > 0 ? (
          <div className="flex shrink-0 items-center gap-2">
            <Link href="/app/products/collections" data-products-collections="" className={cn(buttonSecondary, "max-md:hidden")}>
              {tt("Collections")}
            </Link>
            <ResponsiveActionMenu
              title={tt("Export")}
              align="end"
              trigger={
                <button type="button" aria-label={tt("Export products")} data-export="" className={cn(buttonSecondary, BAR_PRESS, "max-sm:w-8 max-sm:px-0")}>
                  <Download className="h-4 w-4" />
                  <span className="hidden sm:inline">{tt("Export")}</span>
                </button>
              }
              items={exportItems}
            />
            <Link
              href="/app/products/new"
              data-new-product=""
              onClick={askNew}
              onMouseEnter={warmNew}
              onTouchStart={warmNew}
              onPointerDown={warmNew}
              onFocus={warmNew}
              className={cn(NEW_LOOK, BAR_PRESS)}
            >
              <Plus className="h-4 w-4" aria-hidden />
              <span>{t("products.newProduct")}</span>
            </Link>
          </div>
        ) : null}
      </PaneBar>

      <div className={cn("mx-auto pb-6", LIST_WIDTH, GUTTER)}>
        {/* Physical products on sale that buyers can't check out with yet, and why (components/physical/readiness-banner). A late one opens its room (bannerSlot). */}
        <div ref={bannerSlot} data-readiness-slot="" className="flow-root">
          <ReadinessBanner surface="products" className="mt-4" />
        </div>
        <section
          ref={sectionRef}
          aria-label={tt("Products")}
          data-products-list=""
          className={cn(card, "relative mt-4 overflow-hidden")}
        >
          {/*
            THE TOOLBAR, ORDERS' TO THE LETTER: one 48px row, the same height
            whether searching or not. The views as tabs (only the ones with
            something in them, plus the open one), then Search and Sort at
            the right. Search swaps the tabs for a boxed field and Cancel.
            Sort opens the orders alone (./pick-sheet: a sheet on a phone,
            the app's dropdown from 768px).
          */}
          {products.length > 0 ? (
            <div data-toolbar="" className="flex h-12 items-center gap-2 border-b border-[#eef0f2] px-2">
              {searching ? (
                <>
                  <label data-search="" className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border border-[#d5d7dd] bg-white px-2.5 transition-[border-color,box-shadow] duration-150 focus-within:border-[#c9ccd3] focus-within:shadow-[0_0_0_3px_rgba(17,17,19,0.06)] max-sm:h-9">
                    <Search className="h-4 w-4 shrink-0 text-[#6b7280]" aria-hidden />
                    <input
                      ref={searchInputRef}
                      type="search"
                      enterKeyHint="search"
                      aria-label={tt("Search products")}
                      value={searchQuery}
                      onChange={(e) => search(e.target.value)}
                      onKeyDown={searchKey}
                      placeholder={tt("Search products")}
                      className="min-w-0 flex-1 bg-transparent text-[13px] text-[#1a1a2e] outline-none placeholder:text-[#9ca3af] max-sm:text-[16px] [&::-webkit-search-cancel-button]:hidden"
                    />
                    {searchQuery ? (
                      <button type="button" aria-label={tt("Clear search")} className="grid h-6 w-6 shrink-0 cursor-pointer place-items-center text-[#9ca3af] hover:text-[#4b5563]" onClick={clearSearch}>
                        <X className="h-4 w-4" />
                      </button>
                    ) : null}
                  </label>
                  <button type="button" data-search-cancel="" className="h-8 shrink-0 cursor-pointer rounded-lg px-2.5 text-[13px] font-medium text-[#1a1a2e] hover:bg-[#f1f2f4] max-sm:h-9 max-sm:text-[15px]" onClick={closeSearch}>
                    {tt("Cancel")}
                  </button>
                </>
              ) : (
                <>
                  <ViewTabs views={views} value={view} onPick={showView} />
                  <button type="button" data-search-open="" aria-label={tt("Search products")} title={tt("Search products")} className={cn(iconButton, "ml-auto shrink-0 max-sm:h-9 max-sm:w-9")} onClick={openSearch}>
                    <Search className="h-4 w-4" />
                  </button>
                </>
              )}
              <PickSheet
                name="sort"
                title={tt("Sort by")}
                options={SORTS}
                value={sort}
                onPick={pickSort}
                align="end"
                trigger={
                  <button
                    type="button"
                    aria-label={tt("Sort")}
                    title={tt("Sort")}
                    data-sort=""
                    className={cn(iconButton, "shrink-0 max-sm:h-9 max-sm:w-9 data-open:bg-[#eceef1]", sort !== "newest" && "bg-[#eceef1] text-[#1a1a2e]")}
                  >
                    <ArrowUpDown className="h-4 w-4" />
                  </button>
                }
              />
            </div>
          ) : null}

          {/*
            Every row drawn since the page opened is here (`drawn`); the ones
            not in the view, the search or the page are hidden, not gone.
            With nothing to show, both lists are hidden and the empty words
            show, and the rows are still kept.
          */}
          {drawn.length > 0 ? (
            <>
              {/*
                A PHONE: Orders' and Emails' stacked row, with the picture in
                front. The name at 17px and the price at the right of it,
                then the status as Orders' badge and how many sold in grey.
                The whole row opens the product; the more button is at the
                end, where a thumb is. Every row is the same height, so a
                hidden one coming back moves nothing but itself.
              */}
              <ul aria-label={tt("Products")} data-list="" className="md:hidden" hidden={pageProducts.length === 0}>
                {drawn.map((product) => (
                  <PhoneRow
                    key={product.id}
                    product={product}
                    hidden={!shownIds.has(product.id)}
                    opening={opening === product.id}
                    statusText={statusLabel[productStatus(product)]}
                    username={creatorUsername}
                    labels={rowLabels}
                    api={rowApi}
                  />
                ))}
              </ul>

              {/*
                FROM 768px: Emails' table. A quiet grey heading, 56px rows
                with a 40px picture and 13px text, the status as a badge,
                numbers right aligned in figures of one width (Sales from
                1024px), and the more button last. The whole row opens the
                product.
              */}
              <table className="hidden w-full table-fixed border-separate border-spacing-0 text-[13px] md:table" hidden={pageProducts.length === 0}>
                <thead>
                  <tr className="h-9 text-left text-[12px] font-medium text-[#4b5563]">
                    <th scope="col" className="border-b border-[#eef0f2] bg-[#fafbfb] pl-4 pr-3 font-medium">{tt("Product")}</th>
                    <th scope="col" className="w-[120px] border-b border-[#eef0f2] bg-[#fafbfb] px-3 font-medium">{tt("Status")}</th>
                    <th scope="col" className="hidden w-[96px] border-b border-[#eef0f2] bg-[#fafbfb] px-3 text-right font-medium lg:table-cell">{tt("Sales")}</th>
                    <th scope="col" className="w-[112px] border-b border-[#eef0f2] bg-[#fafbfb] px-3 text-right font-medium">{tt("Price")}</th>
                    <th scope="col" className="w-14 border-b border-[#eef0f2] bg-[#fafbfb]" aria-label={tt("Actions")} />
                  </tr>
                </thead>
                <tbody>
                  {drawn.map((product) => (
                    <TableRow
                      key={product.id}
                      product={product}
                      hidden={!shownIds.has(product.id)}
                      opening={opening === product.id}
                      statusText={statusLabel[productStatus(product)]}
                      username={creatorUsername}
                      labels={rowLabels}
                      api={rowApi}
                    />
                  ))}
                </tbody>
              </table>
            </>
          ) : null}
          {pageProducts.length === 0 ? (
            <div data-empty="" className="flex flex-col items-center px-6 py-14 text-center">
              <p className="text-[15px] font-semibold text-[#1a1a2e]">{emptyTitle}</p>
              <p className="mt-1 max-w-[340px] text-[13px] text-[#6b7280]">
                {searchQuery
                  ? tt("Try another name, or clear the search.")
                  : products.length === 0
                    ? tt("Add something to sell, like a preset pack, a course or an ebook. It goes on your page and your website.")
                    : view === "archived"
                      ? tt("A product you archive is kept here, off your page, until you restore it.")
                      : tt("Nothing in this view right now.")}
              </p>
              {searchQuery ? (
                <button type="button" className={cn(buttonSecondary, "mt-4")} onClick={clearSearch}>
                  {tt("Clear search")}
                </button>
              ) : products.length === 0 ? (
                <Link
                  href="/app/products/new"
                  onClick={askNew}
                  onMouseEnter={warmNew}
                  onTouchStart={warmNew}
                  className={cn(NEW_LOOK, "mt-4 max-sm:h-10 max-sm:px-4 max-sm:text-[14px]")}
                >
                  {tt("Create product")}
                </Link>
              ) : null}
            </div>
          ) : null}

          {/*
            THE FOOTER, ORDERS': the count of what is shown and the arrows,
            on the faintest grey. On a phone a count of the rows you can see
            is noise, so it is drawn only when there is a second page.
          */}
          {filteredProducts.length > 0 ? (
            <div
              data-footer=""
              className={cn(
                "flex h-11 items-center justify-between gap-3 border-t border-[#eef0f2] bg-[#fafafb] px-3",
                pages === 1 && "max-md:hidden",
              )}
            >
              <span className="text-[12px] tabular-nums text-[#6b7280] max-sm:text-[14px]">
                {/* One string, so a page turn replaces the words (see TRANSLATED TEXT below). */}
                {tt("{value}–{value2} of {value3}", { value: from + 1, value2: from + pageProducts.length, value3: filteredProducts.length.toLocaleString(appLocale()) })}
              </span>
              {pages > 1 ? (
                <div className="flex items-center gap-1">
                  <button type="button" aria-label={tt("Previous page")} className={cn(buttonSecondary, BAR_PRESS, "h-7 w-8 px-0 max-sm:h-9 max-sm:w-10")} disabled={pageNow <= 1} onClick={() => setPage(pageNow - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button type="button" aria-label={tt("Next page")} className={cn(buttonSecondary, BAR_PRESS, "h-7 w-8 px-0 max-sm:h-9 max-sm:w-10")} disabled={pageNow >= pages} onClick={() => setPage(pageNow + 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>
      </PullToRefresh>

      {deleteModalOpen && productToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 animate-in fade-in-0 duration-200"
            onClick={() => {
              if (!isDeleting) closeDelete()
            }}
          />
          <div role="alertdialog" aria-modal="true" aria-labelledby="delete-product-title" className="relative w-full max-w-[400px] rounded-2xl bg-white shadow-[0_20px_50px_-12px_rgba(17,24,39,0.3)] animate-in fade-in-0 zoom-in-95 duration-200">
            <div className="px-5 pb-4 pt-5">
              <h3 id="delete-product-title" className="break-words text-[15px] font-semibold text-[#1a1a2e]">
                {deleteQuestion(productToDelete.title, deleteKind).title}
              </h3>
              <p className="mt-1.5 text-[13px] leading-5 text-[#6b7280]">{deleteQuestion(productToDelete.title, deleteKind).body}</p>
              {deleteError ? (
                <p role="alert" className="mt-2 text-[13px] font-medium leading-5 text-[#c4290c]">
                  {deleteError}
                </p>
              ) : null}
            </div>
            <div className="flex justify-end gap-2 border-t border-[#eef0f2] px-5 py-3 max-md:gap-3">
              <button
                ref={deleteCancel}
                type="button"
                onClick={closeDelete}
                disabled={isDeleting}
                className={cn(buttonSecondary, "max-md:h-11 max-md:flex-1 max-md:text-[15px]")}
              >
                {tt("Cancel")}
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
                className={cn(
                  "inline-flex h-8 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 text-[13px] font-medium text-white transition-colors duration-100 disabled:opacity-50 max-md:h-11 max-md:flex-1 max-md:text-[15px]",
                  /* Archive loses nothing and can be undone: near black, as the app's other actions. Delete stays red. */
                  deleteKind === "archive"
                    ? "bg-[#1a1a2e] shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_1px_2px_rgba(16,24,40,0.25)] hover:bg-[#2a2a40] active:bg-[#0f0f1c]"
                    : "bg-[#c4290c] shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_1px_2px_rgba(127,29,29,0.3)] hover:bg-[#a8230a] active:bg-[#8f1e08]",
                )}
              >
                {/* The word in an element of its own on both sides, so a refused delete can take the spinner away (see TRANSLATED TEXT below). */}
                {isDeleting ? (
                  <>
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    <span>{deleteKind === "archive" ? tt("Archiving") : tt("Deleting")}</span>
                  </>
                ) : (
                  <span>{deleteQuestion(productToDelete.title, deleteKind).confirm}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {newProduct.chooser}
    </div>
  )
}

type Status = "live" | "draft" | "archived"

function productStatus(product: Product): Status {
  return isArchived(product) ? "archived" : product.status === "published" ? "live" : "draft"
}

/** Orders' badge tones: on sale in green, a draft in amber (it is not on sale), archived in grey. */
const STATUS_TONE: Record<Status, "success" | "attention" | "neutral"> = { live: "success", draft: "attention", archived: "neutral" }

/** BANNER_IN_MS: a late readiness banner opening its room (see bannerSlot). */
const BANNER_IN_MS = 320

/**
 * THE VIEWS AS TABS, Orders' ViewTabs: a word each, the open one on a grey
 * pill, a strip that scrolls sideways when a language makes it wider than
 * the phone. A pick is played by ./list-motion.
 */
function ViewTabs({ views, value, onPick }: { views: Array<{ value: View; label: string }>; value: View; onPick: (next: View) => void }) {
  return (
    <div role="tablist" aria-label={tt("Views")} data-views="" className="orders-strip -my-2 flex min-w-0 items-center gap-0.5 overflow-x-auto py-2">
      {views.map((v) => {
        const active = v.value === value
        return (
          <button
            key={v.value}
            type="button"
            role="tab"
            aria-selected={active}
            data-view={v.value}
            onClick={() => onPick(v.value)}
            className={cn(
              "h-8 shrink-0 cursor-pointer whitespace-nowrap rounded-lg px-3 text-[13px] font-medium transition-colors duration-100 [-webkit-tap-highlight-color:transparent] max-sm:h-9 max-sm:text-[15px]",
              active ? "bg-[#eceef1] text-[#1a1a2e]" : "text-[#4b5563] hover:bg-[#f4f5f7]",
            )}
          >
            {/* Its own element: see TRANSLATED TEXT below. */}
            <span>{v.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/** What the rows call on, read at the moment of a press: the page keeps it current (rowApi). */
interface RowApi {
  /** A pointer rests on a row for WARM_REST_MS, or has left it. */
  rest: (id: string) => void
  leave: () => void
  /** The editor of this product, fetched ahead. */
  warm: (id: string) => void
  /** The product's editor, from its link (a modifier key left to the browser) or from anywhere else on its row. */
  open: (id: string) => (e: ReactMouseEvent<HTMLAnchorElement>) => void
  openRow: (id: string) => void
  /** In the app, View opens the phone's browser instead of a tab; null in a browser. */
  viewIn: ((url: string) => void) | null
  share: (product: Product) => void
  archive: (product: Product) => void
  duplicate: (product: Product) => void
  remove: (product: Product) => void
}
type RowApiRef = { readonly current: RowApi | null }
interface RowLabels {
  view: string
  share: string
  restore: string
  archive: string
  duplicate: string
}

/**
 * A row's menu, made once per product: Edit, View, Share, then Archive or
 * Restore and Duplicate, and Delete last. View is a link to the product's
 * page in a new tab; a product with no public page has it off, with why.
 */
function useRowActions(product: Product, username: string, labels: RowLabels, api: RowApiRef): ActionMenuItem[] {
  return useMemo(() => {
    const url = viewUrl(product, username)
    const live = productStatus(product) === "live"
    return [
      { label: tt("Edit"), onClick: () => api.current?.openRow(product.id) },
      live
        ? api.current?.viewIn
          ? { label: labels.view, onClick: () => api.current?.viewIn?.(url) }
          : { label: labels.view, href: url, target: "_blank" as const }
        : { label: labels.view, disabled: true, hint: tt("Publish to view") },
      { label: labels.share, onClick: () => api.current?.share(product) },
      { label: isArchived(product) ? labels.restore : labels.archive, onClick: () => api.current?.archive(product), separatorBefore: true },
      { label: labels.duplicate, onClick: () => api.current?.duplicate(product) },
      { label: tt("Delete"), variant: "destructive" as const, separatorBefore: true, onClick: () => api.current?.remove(product) },
    ]
  }, [product, username, labels, api])
}

/**
 * Where View opens. A product that ships is bought on the store's published
 * website, so it opens there (app/api/app/products/[id]/live picks the
 * domain, else the storelib.com address), as the editor's View on your
 * store does; every other product opens on the creator page.
 */
function viewUrl(product: Product, username: string): string {
  return product.type === "physical" ? `/api/app/products/${encodeURIComponent(product.id)}/live` : getProductUrl(username, product.slug)
}

/**
 * A PHONE'S ROW (see the list's note in ProductsClient). One link covers the
 * row and is the press. A finger tints it only once it has stayed on the row
 * (lib/press-mark: 120ms, and never once it moves), so a scroll that starts
 * on a row lights nothing; the row you opened holds its tint while the
 * editor is on its way.
 */
const PhoneRow = memo(function PhoneRow({
  product,
  hidden,
  opening,
  statusText,
  username,
  labels,
  api,
}: {
  product: Product
  hidden: boolean
  /** This row was pressed and its editor is on its way: it holds its tint, a spinner where the more button's neighbour is. */
  opening: boolean
  statusText: string
  username: string
  labels: RowLabels
  api: RowApiRef
}) {
  const status = productStatus(product)
  const href = `/app/products/${product.id}`
  const items = useRowActions(product, username, labels, api)
  return (
    <li
      data-row={product.id}
      hidden={hidden}
      data-opening={opening ? "" : undefined}
      className="relative flex items-center gap-3 py-3 pl-4 pr-1.5 transition-colors duration-75 data-[pressed]:bg-[#f4f5f7] data-[opening]:bg-[#f4f5f7] [li:not([hidden])~&]:border-t [li:not([hidden])~&]:border-[#f1f2f4]"
    >
      <Link
        href={href}
        aria-label={product.title || tt("Untitled draft")}
        data-row-link=""
        onTouchStart={() => api.current?.warm(product.id)}
        onClick={(e) => api.current?.open(product.id)(e)}
        onMouseEnter={() => api.current?.rest(product.id)}
        onMouseLeave={() => api.current?.leave()}
        onPointerDown={() => api.current?.warm(product.id)}
        onFocus={() => api.current?.warm(product.id)}
        {...pressMark}
        className="absolute inset-0 z-0 outline-none [-webkit-tap-highlight-color:transparent] focus-visible:shadow-[inset_0_0_0_2px_#1a1a2e]"
      />
      <Thumb src={product.thumbnail_url} title={product.title} size="phone" />
      <span className="pointer-events-none min-w-0 flex-1">
        <span className="flex min-w-0 items-baseline justify-between gap-3">
          <span data-name="" className="min-w-0 truncate text-[17px] font-semibold leading-6 text-[#1a1a2e]">{product.title || tt("Untitled draft")}</span>
          <span data-price="" className="shrink-0 text-[16px] font-medium tabular-nums text-[#1a1a2e]"><PriceOf cents={product.price_cents} type={product.type} /></span>
        </span>
        <span data-meta="" className="mt-1 flex h-[22px] min-w-0 items-center gap-2">
          <StatusBadge tone={STATUS_TONE[status]} className="shrink-0">
            <span>{statusText}</span>
          </StatusBadge>
          {product.sales_count ? (
            <span className="truncate text-[14px] tabular-nums text-[#6b7280]">{tt("{value} sold", { value: product.sales_count.toLocaleString(appLocale()) })}</span>
          ) : null}
        </span>
      </span>
      <ResponsiveActionMenu
        title={product.title}
        align="end"
        trigger={<RowMenuButton label={tt("Actions for {title}", { title: product.title })} className={cn(ROW_MENU, "h-11 w-11")} />}
        items={items}
      />
      {/* Over the more button, in its own box: the row's text keeps its width and the price stays where it was. */}
      {opening ? <OpeningMark over /> : null}
    </li>
  )
})

/** A COMPUTER'S ROW (see the table's note in ProductsClient). The whole row opens the product. */
const TableRow = memo(function TableRow({
  product,
  hidden,
  opening,
  statusText,
  username,
  labels,
  api,
}: {
  product: Product
  hidden: boolean
  opening: boolean
  statusText: string
  username: string
  labels: RowLabels
  api: RowApiRef
}) {
  const status = productStatus(product)
  const href = `/app/products/${product.id}`
  const items = useRowActions(product, username, labels, api)
  /* The cells are white and paint over their row, so the hover, the press and the opening tint are the cells'. */
  const cell = "bg-white transition-colors duration-75 group-hover:bg-[#fafbfb] group-data-[opening]:bg-[#f4f5f7] [tr:not([hidden])~tr>&]:border-t [tr:not([hidden])~tr>&]:border-[#f1f2f4]"
  return (
    <tr
      data-row={product.id}
      hidden={hidden}
      data-opening={opening ? "" : undefined}
      className="group h-14 cursor-pointer"
      onMouseEnter={() => api.current?.rest(product.id)}
      onMouseLeave={() => api.current?.leave()}
      onPointerDown={() => api.current?.warm(product.id)}
      onFocus={() => api.current?.warm(product.id)}
      onClick={(e) => {
        /* Not a press inside the row's own controls, nor one that bubbled up from its menu's portal. */
        const target = e.target as HTMLElement
        if (!e.currentTarget.contains(target) || target.closest("a,button,input,label")) return
        api.current?.openRow(product.id)
      }}
    >
      <td className={cn(cell, "pl-4 pr-3")}>
        <div className="flex min-w-0 items-center gap-3">
          <Thumb src={product.thumbnail_url} title={product.title} size="table" />
          <Link
            href={href}
            onClick={(e) => api.current?.open(product.id)(e)}
            className="min-w-0 truncate font-medium text-[#1a1a2e] outline-none hover:underline focus-visible:underline"
          >
            {product.title || tt("Untitled draft")}
          </Link>
        </div>
      </td>
      <td className={cn(cell, "whitespace-nowrap px-3")}>
        <StatusBadge tone={STATUS_TONE[status]}>
          <span>{statusText}</span>
        </StatusBadge>
      </td>
      <td className={cn(cell, "hidden whitespace-nowrap px-3 text-right tabular-nums text-[#4b5563] lg:table-cell")}>
        {product.sales_count ? product.sales_count.toLocaleString(appLocale()) : <span className="text-[#9ca3af]">0</span>}
      </td>
      <td className={cn(cell, "whitespace-nowrap px-3 text-right font-medium tabular-nums text-[#1a1a2e]")}><PriceOf cents={product.price_cents} type={product.type} /></td>
      <td className={cn(cell, "pr-2 text-right")}>
        <div data-row-actions="" className="flex items-center justify-end">
          {opening ? <OpeningMark /> : (
            <ResponsiveActionMenu
              title={product.title}
              align="end"
              trigger={<RowMenuButton label={tt("Actions for {title}", { title: product.title })} className={ROW_MENU} />}
              items={items}
            />
          )}
        </div>
      </td>
    </tr>
  )
})

/**
 * A pressed row's sign that its editor is on its way: the spinner, fading
 * in only once the wait has lasted LAYER_PRESS_WAIT_MS (components/app/
 * page-layer), so a warm editor, which rises well inside that, shows the
 * tint alone.
 */
function OpeningMark({ over = false }: { over?: boolean }) {
  return (
    <span
      data-row-opening=""
      className={cn(
        "z-[1] grid shrink-0 place-items-center",
        /* A phone's row: laid over the 44px more button, in the row's pressed tint, so nothing beside it moves. */
        over ? "pointer-events-none absolute right-1.5 top-1/2 h-11 w-11 -translate-y-1/2 bg-[#f4f5f7]" : "relative h-8 w-8",
      )}
      style={{ animation: `press-spinner-in 120ms ease-out ${LAYER_PRESS_WAIT_MS}ms both` }}
    >
      <ActivitySpinner size={16} label={tt("Opening")} className="text-[#4b5563]" />
    </span>
  )
}

/*
  TRANSLATED TEXT. A browser's translator (Chrome's, Safari's) swaps every
  text node on the page for <font> elements of its own. React still holds the
  old text node, so a word that sits beside other children, as a text node of
  its own, is changed in a node no longer on the page (the view still said
  "All" after picking Draft) and taking it away threw, taking the whole list
  down: "Failed to execute 'removeChild' on 'Node'", measured by pressing
  Delete, refused, on a translated page. A changing word here is therefore
  always the ONLY child of its element, which React rewrites whole
  (textContent), translated or not. instrumentation-client.ts keeps the rest
  of the app from crashing on the same thing (lib/ui/dom-guard).
*/

/** A free product says Free rather than $0.00, on the list and in the table. In the store's own currency: a lei store's 49 is 49 lei. */
function PriceOf({ cents, type }: { cents: number; type?: string | null }) {
  const store = useStoreCurrency()
  /* A membership or community plan is priced in dollars (lib/money/product-currency): never relabelled as the store's currency. */
  return <>{cents > 0 ? formatMoney(cents, productPriceCurrency({ type }, store)) : "Free"}</>
}

/**
 * A product's picture: 48px on a phone and 40px in the table, rounded in
 * proportion, with a hairline drawn inside it so a white cover still has an
 * edge. With no picture, the name's first letter on grey rather than a stock
 * box icon, so two products without covers can still be told apart.
 *
 * The grey is under the picture too, so a picture still on its way shows
 * grey, never white. Its box is its size exactly, decoded off the main
 * thread, and loaded lazily only the first time: the row keeps this element
 * for as long as the page is open (see `drawn`), so a picture once shown is
 * not asked for again.
 */
function Thumb({ src, title, size }: { src: string | null; title: string; size: ThumbSize }) {
  const letter = (Array.from(title.trim())[0] || "").toUpperCase()
  const phone = size === "phone"
  const srcSet = src ? optimizedSrcSet(src, THUMB_FILES[size], THUMB_QUALITY) : ""
  return (
    <span
      data-thumb=""
      className={cn(
        "pointer-events-none relative shrink-0 overflow-hidden bg-[#eceef1] after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:shadow-[inset_0_0_0_1px_rgba(17,24,39,0.06)] after:content-['']",
        phone ? "h-12 w-12 rounded-[10px]" : "h-10 w-10 rounded-[9px]",
      )}
    >
      {src ? (
        /* eslint-disable-next-line @next/next/no-img-element -- the srcset is chosen here (THUMB_FILES), see there */
        <img
          src={srcSet ? optimizedImageUrl(src, THUMB_BOX[size], THUMB_QUALITY) : src}
          srcSet={srcSet || undefined}
          sizes={THUMB_SIZES[size]}
          alt=""
          width={THUMB_BOX[size]}
          height={THUMB_BOX[size]}
          loading="lazy"
          decoding="async"
          draggable={false}
          className="h-full w-full object-cover"
        />
      ) : (
        <span aria-hidden className={cn("flex h-full items-center justify-center font-semibold text-[#9ca3af]", phone ? "text-[18px]" : "text-[15px]")}>
          {letter}
        </span>
      )}
    </span>
  )
}
