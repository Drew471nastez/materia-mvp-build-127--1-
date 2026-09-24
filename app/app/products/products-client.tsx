"use client"

import { announceChange } from "@/lib/seo/announce-client"
import { forwardRef, useState, useRef, useEffect, useMemo, type ButtonHTMLAttributes } from "react"
import Link from "next/link"
import Image from "next/image"
import { ArrowUpDown, Check, ChevronLeft, ChevronRight, Download, Package, Search, X } from "lucide-react"
import { getProductUrl } from "@/lib/url-helpers"
import { ResponsiveActionMenu } from "@/components/ui/responsive-action-menu"
import { cn } from "@/lib/utils"
import { useRouter } from "next/navigation"
import { GUTTER, LIST_BAR, LIST_WIDTH, PaneBar, RowMenuButton, StatusBadge, buttonAccent, buttonSecondary, card, formatMoney } from "../orders/order-parts"
import { createClient } from "@/lib/supabase/client"
import { useLanguage } from "@/lib/i18n"
import { STORELIB_LOGO } from "@/lib/brand/logo"

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

/** order-parts' iconButton, the same way. */
const ICON_LOOK =
  "inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#4b5563] transition-colors duration-100 group-hover/press:bg-[#f1f2f4] group-active/press:bg-[#e8e9ec]"

/**
 * A button that is its drawing on a computer and a 44px press around the
 * same drawing on a phone. It passes on its ref and everything it is given,
 * so it can be ResponsiveActionMenu's trigger.
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
      className={cn("group/press inline-flex shrink-0 cursor-pointer items-center justify-center disabled:cursor-not-allowed max-md:min-h-11 max-md:min-w-11", className)}
    >
      <span className={look}>{children}</span>
    </button>
  )
})

/** How many rows a page holds before the footer's arrows take over. */
const PAGE_SIZE = 50

/** `router.prefetch`'s full kind: the page's data too, not only its shell. */
const FULL_PREFETCH = { kind: "full" } as unknown as Parameters<ReturnType<typeof useRouter>["prefetch"]>[1]

interface ProductsClientProps {
  products: Product[]
  creatorUsername: string
}

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
          <div class="value">${products.filter(p => p.status === 'published' && !p.archived).length}</div>
        </div>
        <div class="summary-card">
          <div class="label">Drafts</div>
          <div class="value">${products.filter(p => p.status === 'draft' && !p.archived).length}</div>
        </div>
        <div class="summary-card">
          <div class="label">Archived</div>
          <div class="value">${products.filter(p => p.archived).length}</div>
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
              <td class="product-title">${product.title}</td>
              <td>${product.type}</td>
              <td class="price">${formatPrice(product.price_cents)}</td>
              <td><span class="status status-${product.archived ? 'archived' : product.status}">${product.archived ? 'Archived' : product.status}</span></td>
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
    product.archived ? 'Archived' : product.status,
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

const isArchived = (p: Product) => !!p.archived || p.status === "archived"

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
  const [view, setView] = useState<View>("all")
  const [sort, setSort] = useState<Sort>("newest")
  const [page, setPage] = useState(1)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [productToDelete, setProductToDelete] = useState<Product | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [notification, setNotification] = useState<{ message: string; visible: boolean; type: "success" | "error" }>({ message: "", visible: false, type: "success" })
  const searchInputRef = useRef<HTMLInputElement>(null)

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

  /* Polaris's order, and as on Orders only the views with something in them, plus the open one. */
  const views = ([
    { value: "all", label: t("products.all") },
    { value: "active", label: t("products.active") },
    { value: "draft", label: t("products.draft") },
    { value: "archived", label: t("products.archived") },
  ] as Array<{ value: View; label: string }>).filter((v) => v.value === "all" || v.value === view || products.some((p) => inView(p, v.value)))

  useEffect(() => {
    if (isSearchOpen && searchInputRef.current) {
      searchInputRef.current.focus()
    }
  }, [isSearchOpen])

  const showNotification = (message: string, type: "success" | "error" = "success") => {
    setNotification({ message, visible: true, type })
    setTimeout(() => setNotification({ message: "", visible: false, type: "success" }), 4000)
  }

  const filteredProducts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return products
      .filter((product) => inView(product, view) && (!query || product.title.toLowerCase().includes(query)))
      .sort(compare(sort))
  }, [products, view, searchQuery, sort])

  const pages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE))
  const pageNow = Math.min(page, pages)
  const from = (pageNow - 1) * PAGE_SIZE
  const pageProducts = filteredProducts.slice(from, from + PAGE_SIZE)

  const handleArchive = async (product: Product) => {
    try {
      const supabase = createClient()
      const newArchivedState = !product.archived

      const { error } = await supabase
        .from("products")
        .update({ archived: newArchivedState })
        .eq("id", product.id)

      if (error) throw error
      announceChange({ product: product.id })

      setProducts(prev => prev.map(p =>
        p.id === product.id ? { ...p, archived: newArchivedState } : p
      ))
      showNotification(newArchivedState ? "Product archived" : "Product restored")
    } catch (error) {
      console.error("Error archiving product:", error)
      showNotification("Failed to archive product", "error")
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
        showNotification("Product duplicated successfully")
      }
    } catch (error) {
      console.error("Error duplicating product:", error)
      showNotification("Failed to duplicate product", "error")
    }
  }

  const handleDeleteClick = (product: Product) => {
    setProductToDelete(product)
    setDeleteModalOpen(true)
  }

  const handleShare = async (product: Product) => {
    const url = getProductUrl(creatorUsername, product.slug)
    try {
      await navigator.clipboard.writeText(url)
      showNotification("Link copied to clipboard")
    } catch (error) {
      console.error("Error copying to clipboard:", error)
      showNotification("Failed to copy link", "error")
    }
  }

  const handleDeleteConfirm = async () => {
    if (!productToDelete) return

    setIsDeleting(true)
    try {
      const supabase = createClient()

      const { error } = await supabase
        .from("products")
        .delete()
        .eq("id", productToDelete.id)

      if (error) throw error

      setProducts(prev => prev.filter(p => p.id !== productToDelete.id))
      showNotification("Product deleted successfully")
      setDeleteModalOpen(false)
      setProductToDelete(null)
    } catch (error) {
      console.error("Error deleting product:", error)
      showNotification("Failed to delete product", "error")
    } finally {
      setIsDeleting(false)
    }
  }

  /* A new view, search or order starts from its first page. */
  const showView = (next: View) => {
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
  const closeSearch = () => {
    search("")
    setIsSearchOpen(false)
  }

  /*
    OPENING A PRODUCT BEFORE IT IS PRESSED. The editor is a server page that
    reads the product, its files and its variants; a full prefetch fetches
    that whole payload when the pointer arrives (a hover on a computer, the
    finger going down on a phone), so the press itself has nothing left to
    wait for. Once per product per visit, and a pointer only passing over
    a row on its way somewhere else does not count: it has to rest on it.
  */
  const router = useRouter()
  const warmed = useRef(new Set<string>())
  const warm = (id: string) => {
    if (warmed.current.has(id)) return
    warmed.current.add(id)
    router.prefetch(`/app/products/${id}`, FULL_PREFETCH)
  }
  const resting = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hover = (id: string) => ({
    onMouseEnter: () => {
      if (resting.current) clearTimeout(resting.current)
      resting.current = setTimeout(() => warm(id), 80)
    },
    onMouseLeave: () => {
      if (resting.current) clearTimeout(resting.current)
    },
  })

  const statusOf = (product: Product) =>
    isArchived(product) ? (
      <StatusBadge tone="neutral">{t("products.archived")}</StatusBadge>
    ) : product.status === "published" ? (
      <StatusBadge tone="success">{t("products.active")}</StatusBadge>
    ) : (
      <StatusBadge tone="neutral">{t("products.draft")}</StatusBadge>
    )

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

  return (
    <div className="orders-pane h-full overflow-y-auto overflow-x-hidden page-scroll bg-[#f8f9fa] app-page-enter">
      {notification.visible && (
        <div className="fixed top-[calc(68px+env(safe-area-inset-top)+12px)] md:top-4 left-1/2 -translate-x-1/2 z-[100] animate-in fade-in-0 slide-in-from-top-2 duration-300">
          <div className={`px-4 py-3 rounded-xl shadow-lg ${notification.type === "error" ? "bg-rose-600" : "bg-[#1a1a2e]"} text-white text-[13px] font-medium whitespace-nowrap max-w-[calc(100vw-2rem)] overflow-hidden text-ellipsis`}>
            {notification.message}
          </div>
        </div>
      )}

      {/*
        SHOPIFY'S PRODUCTS INDEX, IN THE ORDERS PAGE'S PARTS
        (app/app/orders/order-parts.tsx). The same bar as Orders: the title,
        Export as the quiet action and New product as the one loud one, both
        at Orders' 32px. Then one card: the views and the search and sort
        buttons in one 48px toolbar, and under it a dense table on a
        computer, or on a phone a list of 64px rows with a 40px picture, the
        name, and the price under it. A footer counts what is shown and
        pages through it fifty at a time.
      */}
      <PaneBar width={LIST_WIDTH} className={LIST_BAR}>
        <h1 className="min-w-0 truncate text-[24px] font-bold leading-[30px] text-[#1a1a2e] sm:text-[28px] sm:leading-9">{t("products.title")}</h1>
        <div className="flex shrink-0 items-center gap-3 md:gap-2">
          <ResponsiveActionMenu
            title="Export"
            align="end"
            trigger={
              <Press aria-label="Export products" className="max-sm:-mx-1.5" look={cn(SECONDARY_LOOK, "max-sm:w-8 max-sm:px-0")}>
                <Download className="h-4 w-4 sm:hidden" />
                <span className="max-sm:hidden">Export</span>
              </Press>
            }
            items={exportItems}
          />
          <Link href="/app/products/new" className={cn(buttonAccent, PRESS)}>
            {t("products.newProduct")}
          </Link>
        </div>
      </PaneBar>

      <div className={cn("mx-auto pb-24 md:pb-8", LIST_WIDTH, GUTTER)}>
        <section aria-label="Products" className={cn(card, "mt-2 overflow-hidden md:mt-3")}>
          {/*
            The toolbar: one row, the same height searching or not. On a
            phone each view, search and sort are a 44px press around a 32px
            drawing, so the row is 52px there rather than 48.
          */}
          <div data-toolbar="" className="flex h-[52px] items-center border-b border-[#eef0f2] px-1 md:h-12 md:gap-2 md:px-2">
            {isSearchOpen ? (
              <>
                <label className="flex h-11 min-w-0 flex-1 cursor-text items-center md:h-8">
                  <span className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-[#d5d7dd] bg-white px-2.5 focus-within:border-[#1a1a2e] focus-within:shadow-[0_0_0_1px_#1a1a2e] md:h-8">
                    <Search className="h-4 w-4 shrink-0 text-[#6b7280]" aria-hidden />
                    <input
                      ref={searchInputRef}
                      type="search"
                      enterKeyHint="search"
                      aria-label="Search products"
                      value={searchQuery}
                      onChange={(e) => search(e.target.value)}
                      placeholder="Search products"
                      className="min-w-0 flex-1 bg-transparent text-[16px] text-[#1a1a2e] outline-none placeholder:text-[#9ca3af] md:text-[13px] [&::-webkit-search-cancel-button]:hidden"
                    />
                    {searchQuery ? (
                      <button type="button" aria-label="Clear search" className="-mr-1 flex h-6 w-6 shrink-0 items-center justify-center text-[#9ca3af] hover:text-[#4b5563] max-md:-mr-2.5 max-md:h-11 max-md:w-11" onClick={() => search("")}>
                        <X className="h-4 w-4" />
                      </button>
                    ) : null}
                  </span>
                </label>
                <button type="button" className="h-11 shrink-0 rounded-lg px-2.5 text-[13px] font-medium text-[#1a1a2e] hover:bg-[#f1f2f4] md:h-8" onClick={closeSearch}>
                  Cancel
                </button>
              </>
            ) : (
              <>
                <div role="tablist" aria-label="Views" className="orders-strip flex min-w-0 flex-1 items-center overflow-x-auto md:gap-0.5">
                  {views.map((option) => {
                    const selected = view === option.value
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        onClick={() => showView(option.value)}
                        className="group flex h-11 shrink-0 cursor-pointer items-center md:h-8"
                      >
                        <span
                          className={cn(
                            "flex h-8 items-center whitespace-nowrap rounded-lg px-2 text-[13px] font-medium transition-colors duration-100 md:px-3",
                            selected ? "bg-[#eceef1] text-[#1a1a2e]" : "text-[#4b5563] group-hover:bg-[#f4f5f7] group-active:bg-[#eceef1]",
                          )}
                        >
                          {option.label}
                        </span>
                      </button>
                    )
                  })}
                </div>
                <Press aria-label="Search products" title="Search" look={ICON_LOOK} onClick={() => setIsSearchOpen(true)}>
                  <Search className="h-4 w-4" />
                </Press>
              </>
            )}
            <ResponsiveActionMenu
              title="Sort by"
              align="end"
              menuWidth="w-52"
              trigger={
                <Press aria-label="Sort" title="Sort" look={cn(ICON_LOOK, sort !== "newest" && "bg-[#eceef1] text-[#1a1a2e]")}>
                  <ArrowUpDown className="h-4 w-4" />
                </Press>
              }
              items={SORTS.map((o) => ({
                label: o.label,
                icon: <Check className={o.value === sort ? "opacity-100" : "opacity-0"} />,
                onClick: () => sortBy(o.value),
              }))}
            />
          </div>

          {pageProducts.length > 0 ? (
            <>
              {/*
                A PHONE: one 64px row per product, the whole row the press. A
                40px picture, the name on one line, and under it the price and
                how many sold. In All, where live and draft products are mixed,
                each row says which it is; in the other views the tab says it
                once. The hairline between rows starts where the text does.
              */}
              <ul aria-label="Products" className="md:hidden">
                {pageProducts.map((product) => (
                  <li
                    key={product.id}
                    className="relative flex h-16 items-center gap-3 pl-3 pr-1 has-[a:active]:bg-[#f6f7f8] [&+li]:before:absolute [&+li]:before:left-[64px] [&+li]:before:right-0 [&+li]:before:top-0 [&+li]:before:h-px [&+li]:before:bg-[#f0f1f3]"
                  >
                    <Link
                      href={`/app/products/${product.id}`}
                      aria-label={product.title}
                      onTouchStart={() => warm(product.id)}
                      {...hover(product.id)}
                      className="absolute inset-0 z-0 outline-none focus-visible:shadow-[inset_0_0_0_2px_#8b5cf6]"
                    />
                    <Thumb src={product.thumbnail_url} />
                    <span className="pointer-events-none min-w-0 flex-1">
                      <span data-name="" className="block truncate text-[15px] font-medium leading-5 text-[#1a1a2e]">{product.title}</span>
                      <span data-meta="" className="mt-0.5 flex h-[22px] items-center gap-2 overflow-hidden whitespace-nowrap text-[13px] text-[#6b7280]">
                        {view === "all" ? statusOf(product) : null}
                        <span className="font-medium tabular-nums text-[#1a1a2e]">{formatMoney(product.price_cents)}</span>
                        {product.sales_count ? <span className="tabular-nums">{product.sales_count} sold</span> : null}
                      </span>
                    </span>
                    <ResponsiveActionMenu
                      title={product.title}
                      align="end"
                      trigger={<RowMenuButton label={`Actions for ${product.title}`} className="relative z-[1] h-11 w-11 shrink-0 rounded-xl" />}
                      items={actionsFor(product)}
                    />
                  </li>
                ))}
              </ul>

              {/*
                A COMPUTER: Polaris's index table at Orders' type scale. 13px,
                52px rows, a 40px picture, numbers right aligned in figures of
                one width, and the whole row opens the product. Sales joins
                from 1024px, where the sidebar leaves room for it.
              */}
              <table className="hidden w-full table-fixed border-separate border-spacing-0 text-[13px] md:table">
                <thead>
                  <tr className="h-9 text-left text-[12px] font-medium text-[#4b5563]">
                    <th scope="col" className="bg-[#f7f7f8] pl-4 pr-3 font-medium">Product</th>
                    <th scope="col" className="w-[112px] bg-[#f7f7f8] px-3 font-medium">Status</th>
                    <th scope="col" className="hidden w-[96px] bg-[#f7f7f8] px-3 text-right font-medium lg:table-cell">Sales</th>
                    <th scope="col" className="w-[112px] bg-[#f7f7f8] px-3 text-right font-medium">Price</th>
                    <th scope="col" className="w-12 bg-[#f7f7f8]" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {pageProducts.map((product) => (
                    <tr
                      key={product.id}
                      className="group h-[52px] cursor-pointer"
                      {...hover(product.id)}
                      onClick={(e) => {
                        /* Not a press inside the row's own controls, nor one that bubbled up from its menu's portal. */
                        const target = e.target as HTMLElement
                        if (!e.currentTarget.contains(target) || target.closest("a,button,input,label")) return
                        router.push(`/app/products/${product.id}`)
                      }}
                    >
                      <td className="border-t border-[#f0f1f3] bg-white pl-4 pr-3 group-hover:bg-[#fafafb]">
                        <div className="flex min-w-0 items-center gap-3">
                          <Thumb src={product.thumbnail_url} />
                          <Link href={`/app/products/${product.id}`} className="min-w-0 truncate font-semibold text-[#1a1a2e] outline-none hover:underline focus-visible:underline">
                            {product.title}
                          </Link>
                        </div>
                      </td>
                      <td className="whitespace-nowrap border-t border-[#f0f1f3] bg-white px-3 group-hover:bg-[#fafafb]">{statusOf(product)}</td>
                      <td className="hidden whitespace-nowrap border-t border-[#f0f1f3] bg-white px-3 text-right tabular-nums text-[#303036] group-hover:bg-[#fafafb] lg:table-cell">
                        {product.sales_count ? product.sales_count.toLocaleString("en-US") : <span className="text-[#9ca3af]">0</span>}
                      </td>
                      <td className="whitespace-nowrap border-t border-[#f0f1f3] bg-white px-3 text-right font-medium tabular-nums text-[#1a1a2e] group-hover:bg-[#fafafb]">{formatMoney(product.price_cents)}</td>
                      <td className="border-t border-[#f0f1f3] bg-white pr-2 text-right group-hover:bg-[#fafafb]">
                        <ResponsiveActionMenu
                          title={product.title}
                          align="end"
                          trigger={<RowMenuButton label={`Actions for ${product.title}`} />}
                          items={actionsFor(product)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <div className="flex flex-col items-center px-6 py-12 text-center">
              <p className="text-[15px] font-semibold text-[#1a1a2e]">{emptyTitle}</p>
              <p className="mt-1 max-w-[340px] text-[13px] text-[#6b7280]">
                {searchQuery
                  ? "Try another name, or clear the search."
                  : products.length === 0
                    ? "Create a product and it can be sold on your page and your website."
                    : view === "archived"
                      ? "A product you archive is kept here, off your page, until you restore it."
                      : "Nothing in this view right now."}
              </p>
              {searchQuery ? (
                <Press className="mt-4 max-md:mt-2.5" look={SECONDARY_LOOK} onClick={closeSearch}>
                  Clear search
                </Press>
              ) : products.length === 0 ? (
                <Link href="/app/products/new" className={cn(buttonAccent, PRESS, "mt-4")}>
                  Create product
                </Link>
              ) : null}
            </div>
          )}

          {filteredProducts.length > 0 ? (
            <div data-footer="" className="flex h-11 items-center justify-between gap-3 border-t border-[#eef0f2] bg-[#fafafb] px-3">
              <span className="text-[12px] tabular-nums text-[#6b7280]">
                {from + 1}&ndash;{from + pageProducts.length} of {filteredProducts.length.toLocaleString("en-US")}
              </span>
              {pages > 1 ? (
                <div className="flex items-center gap-1 max-md:-mr-1.5 max-md:gap-0">
                  <Press aria-label="Previous page" look={cn(SECONDARY_LOOK, "h-7 w-8 px-0")} disabled={pageNow <= 1} onClick={() => setPage(pageNow - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Press>
                  <Press aria-label="Next page" look={cn(SECONDARY_LOOK, "h-7 w-8 px-0")} disabled={pageNow >= pages} onClick={() => setPage(pageNow + 1)}>
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
              if (!isDeleting) {
                setDeleteModalOpen(false)
                setProductToDelete(null)
              }
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
                type="button"
                onClick={() => {
                  setDeleteModalOpen(false)
                  setProductToDelete(null)
                }}
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

/** A product's picture in a row: 40px, 8px round, one hairline, a box drawn when there is none. */
function Thumb({ src }: { src: string | null }) {
  return (
    <span data-thumb="" className="pointer-events-none relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-[#e3e5e8] bg-[#f3f4f6]">
      {src ? (
        <Image src={src} alt="" fill sizes="40px" className="object-cover" />
      ) : (
        <span className="flex h-full items-center justify-center">
          <Package className="h-4 w-4 text-[#9ca3af]" />
        </span>
      )}
    </span>
  )
}
