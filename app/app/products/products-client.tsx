"use client"

import { announceChange } from "@/lib/seo/announce-client"
import { forwardRef, useState, useRef, useEffect, useLayoutEffect, useMemo, type ButtonHTMLAttributes, type ChangeEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from "react"
import Link from "next/link"
import { ArrowUpDown, Check, ChevronLeft, ChevronRight, ChevronsUpDown, Download, Eye, Search, X } from "lucide-react"
import { getProductUrl } from "@/lib/url-helpers"
import { ResponsiveActionMenu } from "@/components/ui/responsive-action-menu"
import { cn } from "@/lib/utils"
import { useRouter } from "next/navigation"
import { GUTTER, LIST_BAR, PaneBar, RowMenuButton, buttonSecondary, formatMoney } from "../orders/order-parts"
import { primaryDepth, secondaryDepth } from "./new/editor-buttons"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { isNativeApp, openExternal } from "@/lib/native-bridge"
import { isReturning, listShown, openEditor, takeEdited, warmEditor, whenIdle } from "./list-return"
import { playList, shootList, type ListShot } from "./list-motion"
import { LAYER_MOTION_MS } from "@/components/app/page-layer"
import { createClient } from "@/lib/supabase/client"
import { useLanguage } from "@/lib/i18n"
import { STORELIB_LOGO } from "@/lib/brand/logo"
import { PORTRAIT_QUALITY, optimizedImageUrl, optimizedSrcSet } from "@/lib/images/optimized-url"
import { archiveProduct, isArchivedProduct as isArchived, restoreProduct } from "@/lib/products/archive"

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

/**
 * A link drawn at the Orders page's 32px that a finger still gets 44px of
 * under 768px: an invisible box 6px bigger on every side, so the page stays
 * as compact as Orders and nothing on it is hard to press. Links only:
 * Chromium clips a button's hit test to its own box, so a button does the
 * same with `Press` below.
 */
const PRESS = "relative max-md:after:absolute max-md:after:-inset-1.5 max-md:after:content-['']"

/** order-parts' buttonSecondary, drawn by the span inside a `Press`. */
const SECONDARY_LOOK =
  "inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-[#e3e4e8] bg-white px-3 text-[13px] font-medium text-[#1a1a2e] shadow-[0_1px_0_rgba(17,24,39,0.05)] transition-colors duration-100 group-hover/press:bg-[#f7f7f8] group-active/press:bg-[#f1f2f4] group-disabled/press:opacity-50 select-none"

/*
 * ONE SCALE, ABOUT A TENTH SMALLER, AND 7% BIGGER FROM 1024px. "Reduce the
 * products page's overall scale by about 10%" brought the bar's buttons,
 * the search and the views to 32px from 768px, the table to 13px, its rows
 * to 56px (64px from 1280px) with a 40px picture (44px), and a phone's rows
 * to 64px with a 50px picture. Then: "On desktop larger screens, make the
 * page just 7% bigger, a little bit." From 1024px every size on the page
 * is that one times 1.07, rounded to the pixel: the column (1200 to 1284px)
 * and its gutters, the bar, the title, the buttons, the search, the views,
 * the table's heading, text, rows, pictures and columns, and the footer.
 * Real sizes, not zoom, so text stays sharp and every press is where it is
 * drawn. A phone keeps its sizes, and every press on it is still 44px.
 */
const BAR_BUTTON_SIZE = "lg:h-[34px] lg:px-[13px] lg:text-[14px]"

/** The page's column: Orders' 1200px, 7% wider from 1024px, with gutters 7% wider too. */
const PAGE_WIDTH = "max-w-[1200px] lg:max-w-[1284px]"
const PAGE_GUTTER = "lg:px-[34px]"
/** Orders' bar (LIST_BAR), 7% taller from 1024px: 66 to 71px, 14 and 8px round the title to 15 and 9. */
const PAGE_BAR = "lg:min-h-[71px] lg:pb-[9px] lg:pt-[15px]"

/** Export in the bar, from 768px: the secondary button with its word. On a phone it is Download, in the list's own toolbar. */
const EXPORT_LOOK = cn(SECONDARY_LOOK, BAR_BUTTON_SIZE)

/**
 * THE DOWNLOAD BUTTON IN THE PHONE'S TOOLBAR. "Around the download icon add
 * an extremely small, subtle border to make it like a button." White, a
 * hairline a step lighter than any other border on the page, 8px round, no
 * shadow, and a grey fill while it is pressed. Drawn 32px in a 44px press.
 */
const DOWNLOAD_LOOK =
  "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#eef0f2] bg-white text-[#4b5563] transition-colors duration-100 group-hover/press:bg-[#f7f7f8] group-active/press:border-[#e5e7eb] group-active/press:bg-[#f1f2f4]"

/** Sort beside the search field, from 768px: the field's own white box and hairline. */
const SORT_LOOK =
  "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#e3e5e8] bg-white text-[#4b5563] transition-colors duration-100 group-hover/press:bg-[#f7f7f8] group-active/press:bg-[#f1f2f4] lg:h-[34px] lg:w-[34px]"
/** And when an order other than Newest is on. */
const SORT_ON = "border-transparent bg-[#eceef1] text-[#1a1a2e] group-hover/press:bg-[#e5e7eb]"

/**
 * A name on a pointer: a small near-black label with no arrow, the Website
 * page's Settings tooltip to the letter. The shared tooltip's theme colours
 * and its arrow are replaced here, not added to.
 */
const TOOLTIP = "rounded-md bg-[#1a1a2e] px-2 py-1 text-[12px] font-medium text-white shadow-[0_2px_8px_rgba(15,23,42,0.18)] [&_svg]:hidden!"

/**
 * A button that is its drawing on a computer and a 44px press around the
 * same drawing on a phone. It passes on its ref and everything it is given,
 * so it can be ResponsiveActionMenu's trigger. The keyboard's outline is
 * drawn round the drawing in the /app violet, as the depth buttons' is.
 */
const Press = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { look: string }>(function Press(
  { look, className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      {...rest}
      className={cn(
        "group/press inline-flex shrink-0 cursor-pointer items-center justify-center outline-none disabled:cursor-not-allowed max-md:min-h-11 max-md:min-w-11",
        "[&:focus-visible>span]:outline-2 [&:focus-visible>span]:outline-offset-2 [&:focus-visible>span]:outline-[#8b5cf6] [&:focus-visible>span]:outline-solid",
        className,
      )}
    >
      <span className={look}>{children}</span>
    </button>
  )
})

/**
 * The New product button: the editor's violet Save (primaryDepth), at the
 * bar's 32px (34 from 1024px), with the 44px press on a phone.
 */
const NEW_LOOK = cn(primaryDepth, PRESS, "h-8 gap-1.5 rounded-lg px-3 text-[13px]", BAR_BUTTON_SIZE)

/**
 * A ROW'S TWO BUTTONS: Preview (the eye) and the more button, the same size
 * side by side, both in the editor's depth (secondaryDepth), so the pair
 * reads as one. A product with no page to open draws its eye off: grey,
 * flat, and no pressed look. On a phone each is drawn 32px with a 44px
 * press (6px of invisible box on every side), 12px apart, so the two
 * presses meet and never overlap. In the table 28px, and 30px from 1024px.
 */
const ROW_BUTTON_PHONE = "relative z-[1] h-8 w-8 rounded-lg text-[#4b5563] after:absolute after:-inset-1.5 after:content-['']"
const ROW_BUTTON_TABLE = "h-7 w-7 rounded-[7px] text-[#4b5563] lg:h-[30px] lg:w-[30px] lg:[&>svg]:h-[17px] lg:[&>svg]:w-[17px]"
const ROW_MENU_PHONE = cn(secondaryDepth, ROW_BUTTON_PHONE)
const ROW_MENU_TABLE = cn(secondaryDepth, ROW_BUTTON_TABLE)
const EYE_DEPTH = cn(
  secondaryDepth,
  "aria-disabled:cursor-not-allowed aria-disabled:text-[#b6bac1] aria-disabled:shadow-none aria-disabled:hover:bg-white aria-disabled:active:bg-white aria-disabled:active:shadow-none",
)
const EYE_PHONE = cn(EYE_DEPTH, ROW_BUTTON_PHONE)
const EYE_TABLE = cn(EYE_DEPTH, ROW_BUTTON_TABLE)

/**
 * THE PICTURES, SHARP ON EVERY SCREEN. They went through next/image at a
 * fixed width, which offers a 1x and a 2x file at Next's default quality of
 * 75: on a 3x phone a 56px picture was a 128px file stretched over 168
 * device pixels, and at 75 a small picture's edges went soft and blocky.
 * Now each size offers the files its box needs at 1x, 2x and 3x, with honest
 * `w` descriptors and `sizes`, so the browser takes the smallest one that
 * is sharp at its own pixel ratio, at quality 88 (listed in next.config's
 * images.qualities, or the optimizer answers 400). Three candidates each,
 * not Next's fifteen, so fifty rows do not add a page of markup. The
 * table's box is 40px, 43 from 1024px and 47 from 1280px (the 7% step):
 * 48, 96 and 128 still cover it at 1x and 2x, which is what a computer's
 * screen is.
 */
type ThumbSize = "phone" | "table"
const THUMB_QUALITY = PORTRAIT_QUALITY
const THUMB_FILES: Record<ThumbSize, number[]> = { phone: [64, 128, 256], table: [48, 96, 128] }
const THUMB_SIZES: Record<ThumbSize, string> = { phone: "50px", table: "(min-width: 1280px) 47px, (min-width: 1024px) 43px, 40px" }
/** The largest box each size is drawn in: the width and height the picture reserves, and its fallback file. */
const THUMB_BOX: Record<ThumbSize, number> = { phone: 50, table: 47 }

/** How long a pointer rests on a row before its editor is fetched ahead. */
const WARM_REST_MS = 50
/** How many of the first rows are fetched ahead once the list is idle. */
const WARM_AHEAD = 3

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
const generateProductsPDF = (products: Product[], formatPrice: (cents: number) => string) => {
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

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
        .logo img { height: 32px; }
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
        .footer img { height: 20px; margin-bottom: 8px; opacity: 0.6; }
        .branding { display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 4px; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="logo">
          <img src="${STORELIB_LOGO}" alt="Storelib" />
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
              <td class="price">${escapeHtml(formatPrice(product.price_cents))}</td>
              <td><span class="status status-${isArchived(product) ? 'archived' : product.status === 'published' ? 'published' : 'draft'}">${isArchived(product) ? 'Archived' : escapeHtml(product.status)}</span></td>
              <td>${new Date(product.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="footer">
        <div class="branding">
          <img src="${STORELIB_LOGO}" alt="Storelib" />
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
const generateProductsCSV = (products: Product[], formatPrice: (cents: number) => string) => {
  const headers = ['Title', 'Type', 'Price', 'Status', 'Slug', 'Created At', 'Description']

  const rows = products.map(product => [
    `"${product.title.replace(/"/g, '""')}"`,
    product.type,
    formatPrice(product.price_cents),
    isArchived(product) ? 'Archived' : product.status,
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
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "title_asc", label: "Title A to Z" },
  { value: "title_desc", label: "Title Z to A" },
  { value: "price_desc", label: "Price high to low" },
  { value: "price_asc", label: "Price low to high" },
  { value: "sales", label: "Best selling" },
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
  const [products, setProducts] = useState<Product[]>(initialProducts)
  const [resumed] = useState(() => (isReturning() ? leftAt : null))
  const [view, setView] = useState<View>(resumed?.view ?? "all")
  const [sort, setSort] = useState<Sort>(resumed?.sort ?? "newest")
  const [page, setPage] = useState(resumed?.page ?? 1)
  const [searchQuery, setSearchQuery] = useState(resumed?.search ?? "")
  useEffect(() => {
    leftAt = { view, sort, search: searchQuery, page }
  }, [view, sort, searchQuery, page])
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [productToDelete, setProductToDelete] = useState<Product | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [notification, setNotification] = useState<{ message: string; visible: boolean; type: "success" | "error" }>({ message: "", visible: false, type: "success" })
  /* Two fields, one search: the phone's in the list's toolbar and the computer's above the table. */
  const searchInputRef = useRef<HTMLInputElement>(null)
  const phoneSearchRef = useRef<HTMLInputElement>(null)

  const exportPDF = () => {
    generateProductsPDF(products, formatMoney)
    showNotification("PDF report generated")
  }
  const exportCSV = () => {
    generateProductsCSV(products, formatMoney)
    showNotification("CSV file downloaded")
  }
  const exportItems = [
    { label: "Export as CSV", onClick: exportCSV },
    { label: "Export as PDF", onClick: exportPDF },
  ]

  /* Polaris's order, and as on Orders only the views with something in them, plus the open one. One view alone is not drawn. */
  const views = ([
    { value: "all", label: t("products.all") },
    { value: "active", label: t("products.active") },
    { value: "draft", label: t("products.draft") },
    { value: "archived", label: t("products.archived") },
  ] as Array<{ value: View; label: string }>).filter((v) => v.value === "all" || v.value === view || products.some((p) => inView(p, v.value)))

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
      setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, ...row } : p)))
      showNotification(restoring ? (row.status === "published" ? "Product restored" : "Product restored as a draft") : "Product archived")
    } catch (error) {
      console.error("Error archiving product:", error)
      showNotification(restoring ? "Could not restore the product" : "Could not archive the product", "error")
    }
  }

  const handleDuplicate = async (product: Product) => {
    try {
      const supabase = createClient()

      // Create a duplicate with a new title and all required fields
      const duplicateData = {
        creator_id: product.creator_id,
        title: `${product.title} (Copy)`,
        type: product.type,
        price_cents: product.price_cents,
        status: "draft",
        thumbnail_url: product.thumbnail_url,
        slug: `${product.slug}-copy-${Date.now()}`,
        description: product.description || null,
        includes_community: product.includes_community || false,
        archived: false,
      }

      const { data, error } = await supabase
        .from("products")
        .insert(duplicateData)
        .select()
        .single()

      if (error) throw error

      if (data) {
        setProducts(prev => [data, ...prev])
        showNotification("Product duplicated")
      }
    } catch (error) {
      console.error("Error duplicating product:", error)
      showNotification("Could not duplicate the product", "error")
    }
  }

  const handleDeleteClick = (product: Product) => {
    setProductToDelete(product)
    setDeleteModalOpen(true)
  }
  const closeDelete = () => {
    setDeleteModalOpen(false)
    setProductToDelete(null)
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
      showNotification("Link copied")
    } catch (error) {
      console.error("Error copying to clipboard:", error)
      showNotification("Could not copy the link", "error")
    }
  }

  const handleDeleteConfirm = async () => {
    if (!productToDelete) return

    setIsDeleting(true)
    try {
      const supabase = createClient()

      /* With the row back, so a delete row level security refused is not reported as done. */
      const { data: gone, error } = await supabase
        .from("products")
        .delete()
        .eq("id", productToDelete.id)
        .select("id")

      if (error) throw error
      if (!gone?.length) throw new Error("Nothing was deleted")

      setProducts(prev => prev.filter(p => p.id !== productToDelete.id))
      showNotification("Product deleted")
      closeDelete()
    } catch (error) {
      console.error("Error deleting product:", error)
      showNotification("Could not delete the product", "error")
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
  const search = (q: string) => {
    setSearchQuery(q)
    setPage(1)
  }
  const clearSearch = () => {
    search("")
    const field = [phoneSearchRef.current, searchInputRef.current].find((f) => f && f.getClientRects().length > 0)
    field?.focus({ preventScroll: true })
  }
  /* What both fields share: the value, the typing, and Escape to clear. */
  const searchField = {
    type: "search",
    enterKeyHint: "search" as const,
    "aria-label": "Search products",
    value: searchQuery,
    onChange: (e: ChangeEvent<HTMLInputElement>) => search(e.target.value),
    onKeyDown: (e: ReactKeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape" && searchQuery) {
        e.preventDefault()
        search("")
      }
    },
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
  const warmed = useRef(new Set<string>())
  const warm = (id: string) => {
    if (warmed.current.has(id)) return
    warmed.current.add(id)
    warmEditor(router, `/app/products/${id}`)
  }
  const resting = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hover = (id: string) => ({
    onMouseEnter: () => {
      if (resting.current) clearTimeout(resting.current)
      resting.current = setTimeout(() => warm(id), WARM_REST_MS)
    },
    onMouseLeave: () => {
      if (resting.current) clearTimeout(resting.current)
    },
    onPointerDown: () => warm(id),
    onFocus: () => warm(id),
  })
  /* New product the same way: its page is the empty editor, read on the server. */
  const warmNew = () => {
    if (warmed.current.has("new")) return
    warmed.current.add("new")
    warmEditor(router, "/app/products/new")
  }
  const firstShown = useRef<string[]>([])
  firstShown.current = pageProducts.slice(0, WARM_AHEAD).map((p) => p.id)
  useEffect(
    () =>
      whenIdle(() => {
        warmNew()
        for (const id of firstShown.current) warm(id)
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per visit, with the rows shown when the browser is idle
    [],
  )

  /*
    OPENING THE EDITOR SLIDES IT IN over the list (../list-return,
    components/app/page-layer moveLayer), the way it slides out again. A
    press with a modifier key, or not the main button, is left to the link:
    a new tab or window, as the browser does.
  */
  const openFromLink = (href: string) => (e: ReactMouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    openEditor(router, href)
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
      el.animate([{ backgroundColor: EDITED_TINT }, { backgroundColor: rest }], { duration: EDITED_FADE_MS, delay: LAYER_MOTION_MS, easing: "ease-out", fill: "backwards" })
    }
  }, [])

  const statusOf = (product: Product): Status =>
    isArchived(product) ? "archived" : product.status === "published" ? "live" : "draft"
  const statusLabel: Record<Status, string> = {
    live: t("products.active"),
    draft: t("products.draft"),
    archived: t("products.archived"),
  }

  /*
    PREVIEW. The product's own page, the address View in its menu opens, in
    a new tab. A draft or an archived product has no public page (the page
    serves published products only) and there is no preview address for
    one, so its eye is drawn but off: "Publish to preview" on a pointer, and
    in a toast on a phone. In the app the page opens in the phone's browser
    through openExternal, as the editor's View does. Never the row's press.
  */
  const previewable = (product: Product) => statusOf(product) === "live"
  const openPreview = (url: string) => (e: ReactMouseEvent<HTMLAnchorElement>) => {
    e.stopPropagation()
    if (isNativeApp()) {
      e.preventDefault()
      openExternal(url)
    }
  }
  const previewOff = (e: ReactMouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (!window.matchMedia("(hover: hover)").matches) showNotification("Publish to preview")
  }

  const actionsFor = (product: Product) => [
    { label: t("common.view"), href: getProductUrl(creatorUsername, product.slug), target: "_blank" as const },
    { label: t("products.share"), onClick: () => handleShare(product) },
    { label: isArchived(product) ? t("products.restore") : t("products.archive"), onClick: () => handleArchive(product), separatorBefore: true },
    { label: t("products.duplicate"), onClick: () => handleDuplicate(product) },
    { label: "Delete", variant: "destructive" as const, separatorBefore: true, onClick: () => handleDeleteClick(product) },
  ]

  const emptyTitle = searchQuery
    ? "No products match"
    : products.length === 0
      ? "No products yet"
      : view === "archived"
        ? "No archived products"
        : view === "draft"
          ? "No drafts"
          : view === "active"
            ? "No active products"
            : "Every product is archived"

  const viewIndex = Math.max(0, views.findIndex((v) => v.value === view))
  const viewLabel = views[viewIndex]?.label ?? t("products.all")

  const sortItems = SORTS.map((o) => ({
    label: o.label,
    icon: <Check className={o.value === sort ? "opacity-100" : "opacity-0"} />,
    onClick: () => sortBy(o.value),
  }))
  /* The phone's one sheet: the views, then the orders under Sort by. */
  const viewAndSortItems = [
    ...views.map((v) => ({
      label: v.label,
      icon: <Check className={v.value === view ? "opacity-100" : "opacity-0"} />,
      onClick: () => showView(v.value),
    })),
    ...sortItems.map((item, i) => (i === 0 ? { ...item, section: "Sort by" } : item)),
  ]

  /**
   * A row's Preview: a link to the product's page in a new tab, or, for a
   * product that has no public page, the same eye drawn off. The name
   * "Preview" (or why it is off) on a pointer in the table; a phone has no
   * pointer to rest, so there it is only the button's label.
   */
  const previewButton = (product: Product, look: string, tip: boolean) => {
    const on = previewable(product)
    const url = getProductUrl(creatorUsername, product.slug)
    const eye = <Eye className="h-4 w-4" strokeWidth={1.9} aria-hidden />
    const button = on ? (
      <a href={url} target="_blank" rel="noopener noreferrer" data-preview="" aria-label={`Preview ${product.title}`} onClick={openPreview(url)} className={look}>
        {eye}
      </a>
    ) : (
      <button type="button" data-preview="" aria-disabled="true" aria-label={`Preview ${product.title}`} onClick={previewOff} className={look}>
        {eye}
      </button>
    )
    if (!tip) return button
    return (
      <Tooltip delayDuration={400}>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="top" sideOffset={6} className={TOOLTIP}>
          {on ? "Preview" : "Publish to preview"}
        </TooltipContent>
      </Tooltip>
    )
  }

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
        A CREATOR'S SHELF IN ONE WHITE CARD. On a phone the card's first row
        is its toolbar, the way Shopify's app has it: the view ("All", with
        the order in the same sheet), a search that takes the rest of the
        row, and Download after a thin divider. Nothing above the card but
        the bar. Then a "Product" heading and the rows: a 50px picture, the
        name, and under it the price and how many sold in quiet grey, with
        Preview and the more button at the right. A row only says its status
        when it is not on sale. The bar keeps the title and New product, top
        right, so nothing floats over the list or the navigation pill. From
        768px the same parts are a light table in the same card, with the
        views and the search above it, where there is room to show them all.
      */}
      <PaneBar width={PAGE_WIDTH} className={cn(LIST_BAR, PAGE_BAR, PAGE_GUTTER)}>
        <h1 className="min-w-0 truncate text-[22px] font-bold leading-7 text-[#1a1a2e] sm:text-[25px] sm:leading-8 lg:text-[27px] lg:leading-[34px]">{t("products.title")}</h1>
        {/* An empty shop has nothing to export, and its one way forward is the button in the middle of the page. */}
        {products.length > 0 ? (
          <div className="flex shrink-0 items-center gap-2 lg:gap-[9px]">
            <ResponsiveActionMenu
              title="Export"
              align="end"
              trigger={
                <Press aria-label="Export products" className="max-md:hidden" look={EXPORT_LOOK}>
                  Export
                </Press>
              }
              items={exportItems}
            />
            <Link
              href="/app/products/new"
              data-new-product=""
              onClick={openFromLink("/app/products/new")}
              onMouseEnter={warmNew}
              onTouchStart={warmNew}
              onPointerDown={warmNew}
              onFocus={warmNew}
              className={NEW_LOOK}
            >
              {t("products.newProduct")}
            </Link>
          </div>
        ) : null}
      </PaneBar>

      <div className={cn("@container mx-auto pb-2 md:pb-8", PAGE_WIDTH, GUTTER, PAGE_GUTTER)}>
        {/*
          FROM 768px: the views and the search above the card. Stacked (the
          field, then the views) until the column is 700px wide, then one row
          with the views on the left and the field on the right. By the
          column's own width, not the window's: at 768px the sidebar leaves
          the page 528px, and one row did not fit.
        */}
        {products.length > 0 ? (
          <div data-controls="" className="hidden flex-col gap-2 pt-1 md:flex @min-[700px]:flex-row-reverse @min-[700px]:items-center @min-[700px]:justify-between @min-[700px]:gap-4">
            <div className="flex min-w-0 items-center gap-2 lg:gap-[9px]">
              <label data-search="" className="flex h-8 min-w-0 flex-1 cursor-text items-center lg:h-[34px] @min-[700px]:w-[240px] @min-[700px]:flex-none lg:@min-[700px]:w-[257px] xl:@min-[700px]:w-[289px]">
                <span className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border border-[#e3e5e8] bg-white px-2.5 transition-[border-color,box-shadow] duration-150 focus-within:border-[#c9ccd3] focus-within:shadow-[0_0_0_3px_rgba(17,17,19,0.06)] lg:h-[34px] lg:gap-[9px] lg:px-[11px]">
                  <Search className="h-[15px] w-[15px] shrink-0 text-[#9ca3af] lg:h-4 lg:w-4" aria-hidden />
                  <input
                    ref={searchInputRef}
                    {...searchField}
                    placeholder="Search products"
                    className="min-w-0 flex-1 bg-transparent text-[13px] text-[#1a1a2e] outline-none placeholder:text-[#9ca3af] lg:text-[14px] [&::-webkit-search-cancel-button]:hidden"
                  />
                  {searchQuery ? (
                    <button type="button" aria-label="Clear search" className="-mr-1.5 flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#9ca3af] hover:text-[#4b5563] lg:h-[26px] lg:w-[26px]" onClick={clearSearch}>
                      <X className="h-4 w-4" />
                    </button>
                  ) : null}
                </span>
              </label>
              <ResponsiveActionMenu
                title="Sort by"
                align="end"
                menuWidth="w-52"
                trigger={
                  <Press aria-label="Sort" title="Sort" look={cn(SORT_LOOK, sort !== "newest" && SORT_ON)}>
                    <ArrowUpDown className="h-[15px] w-[15px] lg:h-4 lg:w-4" />
                  </Press>
                }
                items={sortItems}
              />
            </div>

            {/*
              THE VIEWS, AS ONE SEGMENTED CONTROL. A grey track and a white
              segment that slides to the open view on transform alone. Equal
              columns, so the segment is one column wide and moves by whole
              widths of itself. Only when there is more than one view to be
              in: a shop with nothing drafted or archived has nothing to
              switch between.
            */}
            {views.length > 1 ? (
              <div
                role="tablist"
                aria-label="Views"
                data-views=""
                className="relative grid h-8 w-[calc(var(--views)*84px)] shrink-0 lg:h-[34px] lg:w-[calc(var(--views)*90px)] xl:w-[calc(var(--views)*98px)]"
                style={{ gridTemplateColumns: `repeat(${views.length}, minmax(0, 1fr))`, ["--views" as string]: views.length }}
              >
                <span aria-hidden className="pointer-events-none absolute inset-0 rounded-[9px] bg-[#eceef1] lg:rounded-[10px]" />
                <span
                  aria-hidden
                  data-segment=""
                  className="pointer-events-none absolute bottom-[2px] left-[2px] top-[2px] rounded-[7px] bg-white shadow-[0_1px_2px_rgba(17,24,39,0.08),0_0_0_0.5px_rgba(17,24,39,0.06)] transition-transform duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"
                  style={{ width: `calc((100% - 4px) / ${views.length})`, transform: `translateX(${viewIndex * 100}%)` }}
                />
                {views.map((option) => {
                  const selected = view === option.value
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      onClick={() => showView(option.value)}
                      className={cn(
                        "relative min-w-0 cursor-pointer truncate rounded-[7px] px-2 text-[13px] font-medium outline-none transition-colors duration-100 focus-visible:shadow-[inset_0_0_0_2px_#1a1a2e] lg:text-[14px]",
                        selected ? "text-[#1a1a2e]" : "text-[#6b7280] hover:text-[#1a1a2e]",
                      )}
                    >
                      {option.label}
                    </button>
                  )
                })}
              </div>
            ) : null}
          </div>
        ) : null}

        <section
          ref={sectionRef}
          aria-label="Products"
          className="relative mt-1 overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] md:mt-2.5 lg:mt-[11px]"
        >
          {/*
            THE PHONE'S TOOLBAR, THE CARD'S FIRST ROW. The view as a word and
            an up and down chevron, opening one sheet with the views and the
            orders; a search with no box of its own, 16px so iOS does not
            zoom into it; a thin divider; and Download, drawn 32px with the
            faintest border. Every press 44px. Then the column's name.
          */}
          {products.length > 0 ? (
            <div className="md:hidden">
              <div data-toolbar="" className="flex h-12 items-center gap-1 border-b border-[#eef0f2] pl-0.5 pr-1.5">
                <ResponsiveActionMenu
                  title="View"
                  align="start"
                  trigger={
                    <button
                      type="button"
                      data-view-select=""
                      aria-label={`Showing ${viewLabel}. Change view or order`}
                      className="flex h-11 shrink-0 cursor-pointer items-center gap-1 rounded-lg pl-2.5 pr-2 text-[15px] font-semibold text-[#1a1a2e] outline-none transition-colors duration-100 active:bg-[#f1f2f4] focus-visible:shadow-[inset_0_0_0_2px_#1a1a2e] [-webkit-tap-highlight-color:transparent]"
                    >
                      {viewLabel}
                      <ChevronsUpDown className="h-4 w-4 text-[#6b7280]" aria-hidden />
                    </button>
                  }
                  items={viewAndSortItems}
                />
                <label data-search="" className="flex h-11 min-w-0 flex-1 cursor-text items-center gap-2 pl-1.5">
                  <Search className="h-4 w-4 shrink-0 text-[#9ca3af]" aria-hidden />
                  <input
                    ref={phoneSearchRef}
                    {...searchField}
                    placeholder="Search and filter"
                    className="h-11 min-w-0 flex-1 bg-transparent text-[16px] text-[#1a1a2e] outline-none placeholder:text-[#9ca3af] [&::-webkit-search-cancel-button]:hidden"
                  />
                  {searchQuery ? (
                    <button type="button" aria-label="Clear search" className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center text-[#9ca3af] active:text-[#4b5563]" onClick={clearSearch}>
                      <X className="h-4 w-4" />
                    </button>
                  ) : null}
                </label>
                <span aria-hidden data-divider="" className="h-6 w-px shrink-0 bg-[#e5e7eb]" />
                <ResponsiveActionMenu
                  title="Export"
                  align="end"
                  trigger={
                    <Press aria-label="Export products" data-download="" look={DOWNLOAD_LOOK}>
                      <Download className="h-4 w-4" />
                    </Press>
                  }
                  items={exportItems}
                />
              </div>
              <div data-list-head="" aria-hidden hidden={pageProducts.length === 0} className="flex h-9 items-center border-b border-[#eef0f2] px-3 text-[12px] font-medium text-[#6b7280]">
                Product
              </div>
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
                A PHONE: one 64px row per product inside the card, the whole
                row the press. The picture at 50px, the name on one line, and
                under it the price and sales in grey, ending in an ellipsis
                when they do not fit. A Draft says so with a small amber dot
                in All, where live and draft products are mixed; in its own
                view the sheet already says it. The hairline between rows
                starts where the text does, on every row shown after another
                shown row. At the right, Preview and the more button, 32px
                each and 12px apart, on the row's middle; the name gives way
                (an ellipsis) before they move.
              */}
              <ul aria-label="Products" data-list="" className="md:hidden" hidden={pageProducts.length === 0}>
                {drawn.map((product) => {
                  const status = statusOf(product)
                  return (
                    <li
                      key={product.id}
                      data-row={product.id}
                      hidden={!shownIds.has(product.id)}
                      className="relative flex h-16 items-center gap-3 px-3 has-[a[data-row-link]:active]:bg-[#eef0f2] [li:not([hidden])~&]:before:absolute [li:not([hidden])~&]:before:left-[74px] [li:not([hidden])~&]:before:right-0 [li:not([hidden])~&]:before:top-0 [li:not([hidden])~&]:before:h-px [li:not([hidden])~&]:before:bg-[#eceef1]"
                    >
                      <Link
                        href={`/app/products/${product.id}`}
                        aria-label={product.title}
                        data-row-link=""
                        onTouchStart={() => warm(product.id)}
                        onClick={openFromLink(`/app/products/${product.id}`)}
                        {...hover(product.id)}
                        className="absolute inset-0 z-0 outline-none focus-visible:shadow-[inset_0_0_0_2px_#1a1a2e]"
                      />
                      <Thumb src={product.thumbnail_url} title={product.title} size="phone" />
                      <span className="pointer-events-none min-w-0 flex-1">
                        <span data-name="" className="block truncate text-[14px] font-medium leading-[18px] tracking-[-0.01em] text-[#1a1a2e]">{product.title}</span>
                        <span data-meta="" className="mt-1 block h-4 truncate text-[12px] leading-4 text-[#6b7280]">
                          {view === "all" && status !== "live" ? (
                            <>
                              <StatusMark status={status} label={statusLabel[status]} />
                              <Sep />
                            </>
                          ) : null}
                          <span data-price="" className="tabular-nums">{priceOf(product.price_cents)}</span>
                          {product.sales_count ? (
                            <>
                              <Sep />
                              <span className="tabular-nums">{product.sales_count.toLocaleString("en-US")} sold</span>
                            </>
                          ) : null}
                        </span>
                      </span>
                      {previewButton(product, EYE_PHONE, false)}
                      <ResponsiveActionMenu
                        title={product.title}
                        align="end"
                        trigger={<RowMenuButton label={`Actions for ${product.title}`} className={ROW_MENU_PHONE} />}
                        items={actionsFor(product)}
                      />
                    </li>
                  )
                })}
              </ul>

              {/*
                A COMPUTER: the same parts as a light table. 56px rows with a
                40px picture and 13px text (64px rows, a 44px picture and 14px
                names from 1280px), and 7% bigger from 1024px: 60 and 68px
                rows, 43 and 47px pictures, 14 and 15px text. The status as a
                dot and a word rather than a tinted badge, numbers right
                aligned in figures of one width, and the whole row opens the
                product. No grey heading band and no line above the first row
                shown. Sales joins from 1024px, where the sidebar leaves room
                for it. Preview and the more button share the last column;
                under 1024px Status and Price are 96 and 88px, so the name
                keeps the room it had.
              */}
              <table className="hidden w-full table-fixed border-separate border-spacing-0 text-[13px] md:table lg:text-[14px]" hidden={pageProducts.length === 0}>
                <thead>
                  <tr className="h-9 text-left text-[12px] text-[#6b7280] lg:h-[39px] lg:text-[13px] xl:h-[43px]">
                    <th scope="col" className="border-b border-[#eef0f2] pl-4 pr-3 font-medium lg:pl-[17px] lg:pr-[13px] xl:pl-[21px]">Product</th>
                    <th scope="col" className="w-[96px] border-b border-[#eef0f2] px-3 font-medium lg:w-[111px] lg:px-[13px] xl:w-[128px]">Status</th>
                    <th scope="col" className="hidden w-[94px] border-b border-[#eef0f2] px-3 text-right font-medium lg:table-cell lg:px-[13px] xl:w-[107px]">Sales</th>
                    <th scope="col" className="w-[88px] border-b border-[#eef0f2] px-3 text-right font-medium lg:w-[111px] lg:px-[13px] xl:w-[128px]">Price</th>
                    <th scope="col" className="w-[76px] border-b border-[#eef0f2] lg:w-[82px] xl:w-[86px]" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {drawn.map((product) => {
                    const status = statusOf(product)
                    return (
                      <tr
                        key={product.id}
                        data-row={product.id}
                        hidden={!shownIds.has(product.id)}
                        className="group h-14 cursor-pointer lg:h-[60px] xl:h-[68px] [tr:not([hidden])~&>td]:border-t [tr:not([hidden])~&>td]:border-[#f1f2f4]"
                        {...hover(product.id)}
                        onClick={(e) => {
                          /* Not a press inside the row's own controls, nor one that bubbled up from its menu's portal. */
                          const target = e.target as HTMLElement
                          if (!e.currentTarget.contains(target) || target.closest("a,button,input,label")) return
                          openEditor(router, `/app/products/${product.id}`)
                        }}
                      >
                        <td className="bg-white pl-4 pr-3 group-hover:bg-[#fafafb] lg:pl-[17px] lg:pr-[13px] xl:pl-[21px]">
                          <div className="flex min-w-0 items-center gap-3 lg:gap-[13px]">
                            <Thumb src={product.thumbnail_url} title={product.title} size="table" />
                            <Link
                              href={`/app/products/${product.id}`}
                              onClick={openFromLink(`/app/products/${product.id}`)}
                              className="min-w-0 truncate text-[13px] font-medium text-[#1a1a2e] outline-none hover:underline focus-visible:underline lg:text-[14px] xl:text-[15px]"
                            >
                              {product.title}
                            </Link>
                          </div>
                        </td>
                        <td className="whitespace-nowrap bg-white px-3 group-hover:bg-[#fafafb] lg:px-[13px]">
                          <StatusMark status={status} label={statusLabel[status]} strong={status === "live"} />
                        </td>
                        <td className="hidden whitespace-nowrap bg-white px-3 text-right tabular-nums text-[#4b5563] group-hover:bg-[#fafafb] lg:table-cell lg:px-[13px]">
                          {product.sales_count ? product.sales_count.toLocaleString("en-US") : <span className="text-[#b6bac1]">0</span>}
                        </td>
                        <td className="whitespace-nowrap bg-white px-3 text-right font-medium tabular-nums text-[#1a1a2e] group-hover:bg-[#fafafb] lg:px-[13px]">{priceOf(product.price_cents)}</td>
                        <td className="bg-white pr-3 group-hover:bg-[#fafafb] lg:pr-[13px] xl:pr-[17px]">
                          <div data-row-actions="" className="flex items-center justify-end gap-2 lg:gap-[9px]">
                            {previewButton(product, EYE_TABLE, true)}
                            <ResponsiveActionMenu
                              title={product.title}
                              align="end"
                              trigger={<RowMenuButton label={`Actions for ${product.title}`} className={ROW_MENU_TABLE} />}
                              items={actionsFor(product)}
                            />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </>
          ) : null}
          {pageProducts.length === 0 ? (
            <div data-empty="" className="flex flex-col items-center px-6 py-16 text-center md:py-14 lg:py-[60px]">
              <p className="text-[16px] font-semibold text-[#1a1a2e] md:text-[15px] lg:text-[16px]">{emptyTitle}</p>
              <p className="mt-1 max-w-[320px] text-[14px] leading-5 text-[#6b7280] md:text-[13px] lg:max-w-[342px] lg:text-[14px]">
                {searchQuery
                  ? "Try another name, or clear the search."
                  : products.length === 0
                    ? "Add something to sell, like a preset pack, a course or an ebook. It goes on your page and your website."
                    : view === "archived"
                      ? "A product you archive is kept here, off your page, until you restore it."
                      : "Nothing in this view right now."}
              </p>
              {searchQuery ? (
                <Press className="mt-4 max-md:mt-2.5" look={cn(SECONDARY_LOOK, BAR_BUTTON_SIZE)} onClick={clearSearch}>
                  Clear search
                </Press>
              ) : products.length === 0 ? (
                <Link
                  href="/app/products/new"
                  onClick={openFromLink("/app/products/new")}
                  onMouseEnter={warmNew}
                  onTouchStart={warmNew}
                  className={cn(NEW_LOOK, "mt-5 max-md:h-10 max-md:px-4 max-md:text-[14px]")}
                >
                  Create product
                </Link>
              ) : null}
            </div>
          ) : null}

          {/*
            THE FOOTER. On a computer it counts what is shown, as Orders'
            does. On a phone a count of the rows you can see is noise, so it
            is drawn only when there is a second page to go to.
          */}
          {filteredProducts.length > 0 ? (
            <div
              data-footer=""
              className={cn(
                "flex h-11 items-center justify-between gap-3 border-t border-[#eef0f2] pl-3 pr-1.5 md:h-10 md:px-4 lg:h-[43px] lg:px-[17px] xl:h-[47px] xl:px-[21px]",
                pages === 1 && "max-md:hidden",
              )}
            >
              <span className="text-[12px] tabular-nums text-[#6b7280] lg:text-[13px]">
                {from + 1}&ndash;{from + pageProducts.length} of {filteredProducts.length.toLocaleString("en-US")}
              </span>
              {pages > 1 ? (
                <div className="flex items-center gap-1 max-md:gap-0">
                  <Press aria-label="Previous page" look={cn(SECONDARY_LOOK, "h-7 w-8 px-0 lg:h-[30px] lg:w-[34px]")} disabled={pageNow <= 1} onClick={() => setPage(pageNow - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Press>
                  <Press aria-label="Next page" look={cn(SECONDARY_LOOK, "h-7 w-8 px-0 lg:h-[30px] lg:w-[34px]")} disabled={pageNow >= pages} onClick={() => setPage(pageNow + 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Press>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>

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
                Delete {productToDelete.title}?
              </h3>
              <p className="mt-1.5 text-[13px] leading-5 text-[#6b7280]">It comes off your page and cannot be brought back. Archive it instead to keep it.</p>
            </div>
            <div className="flex justify-end gap-2 border-t border-[#eef0f2] px-5 py-3 max-md:gap-3">
              <button
                ref={deleteCancel}
                type="button"
                onClick={closeDelete}
                disabled={isDeleting}
                className={cn(buttonSecondary, "max-md:h-11 max-md:flex-1 max-md:text-[15px]")}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
                className="inline-flex h-8 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-[#c4290c] px-3 text-[13px] font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_1px_2px_rgba(127,29,29,0.3)] transition-colors duration-100 hover:bg-[#a8230a] active:bg-[#8f1e08] disabled:opacity-50 max-md:h-11 max-md:flex-1 max-md:text-[15px]"
              >
                {isDeleting ? (
                  <>
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Deleting
                  </>
                ) : (
                  "Delete"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

type Status = "live" | "draft" | "archived"

/** A free product says Free rather than $0.00, on the list and in the table. */
function priceOf(cents: number) {
  return cents > 0 ? formatMoney(cents) : "Free"
}

/** The middle dot between the parts of a phone row's second line, which ends in an ellipsis when it does not fit. */
function Sep() {
  return (
    <span aria-hidden className="mx-1.5 text-[#c4c8ce]">
      &middot;
    </span>
  )
}

/**
 * A status as a small dot and a word, instead of a tinted badge. Amber for a
 * draft (it is not on sale), grey for archived, green for live, which only
 * the table's Status column draws: a phone row that is on sale says nothing.
 */
function StatusMark({ status, label, strong = false }: { status: Status; label: string; strong?: boolean }) {
  return (
    <span data-status={status} className={cn("inline-flex items-center gap-1.5 align-top", strong ? "text-[#303036]" : "text-[#6b7280]")}>
      <span
        aria-hidden
        className={cn(
          "h-1.5 w-1.5 shrink-0 rounded-full",
          status === "live" ? "bg-[#22a06b]" : status === "draft" ? "bg-[#e0a100]" : "bg-[#b6bac1]",
        )}
      />
      {label}
    </span>
  )
}

/**
 * A product's picture: 50px on a phone and 40px in the table (43 from
 * 1024px, 47 from 1280px), rounded in proportion, with a hairline drawn inside it so a white
 * cover still has an edge. With no picture, the name's first letter on grey
 * rather than a stock box icon, so two products without covers can still be
 * told apart.
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
        phone ? "h-[50px] w-[50px] rounded-[11px]" : "h-10 w-10 rounded-[9px] lg:h-[43px] lg:w-[43px] lg:rounded-[10px] xl:h-[47px] xl:w-[47px] xl:rounded-[11px]",
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
        <span aria-hidden className={cn("flex h-full items-center justify-center font-semibold text-[#9ca3af]", phone ? "text-[18px]" : "text-[15px] lg:text-[16px]")}>
          {letter}
        </span>
      )}
    </span>
  )
}
