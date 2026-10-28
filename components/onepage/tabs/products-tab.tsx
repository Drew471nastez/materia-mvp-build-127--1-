"use client"

import { useOnePage } from "@/lib/onepage/context"
import { useProductMoney } from "@/components/platform/price-currency"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { primaryDepth } from "@/components/ui/depth-button"
import { createPortal } from "react-dom"
import { SheetDialog, SheetDialogTitle } from "@/components/ui/sheet-dialog"
import {
  Plus,
  FileText,
  Mail,
  Download,
  ExternalLink,
  MoreVertical,
  Pencil,
  Trash2,
  Package,
  Gift,
  BookOpen,
  Video,
  Music,
  Image,
  ChevronRight,
  ChevronDown,
  Search,
  Check,
  GraduationCap,
} from "lucide-react"
import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { tt } from "@/lib/i18n/text"
import { ProductStateBadge, useCreatorProducts } from "./product-block-editor"
import { editorProductState, pickableProducts } from "@/lib/onepage/product-block"
import { PRODUCTS_SHOWN, productIdsOnPage, productsTabList } from "@/lib/onepage/products-tab"
import { Reveal } from "@/components/onepage/reveal"

interface Product {
  id: string
  title: string
  price_cents: number
  thumbnail_url?: string
  status: string
  archived?: boolean | null
  type?: string // 'digital' | 'course' | 'lead_magnet' etc.
  slug?: string
  description?: string
}

/*
  ONE CALM TILE FOR EVERY KIND. The kinds were a yellow, a green and a pink
  square with a white icon, and the Quick add rows a rose, an amber and a
  blue one: "too colourful". Now each is the line icon in ink on a pale grey
  tile with a hairline, the way the rest of /app draws an icon beside a row.
*/
const QUICK_TILE = "bg-[#f4f4f6] text-[#1a1a2e] shadow-[inset_0_0_0_1px_rgba(16,24,40,0.06)]"

// Product type options for the modal
const productTypeOptions = [
  {
    id: "digital",
    type: "product",
    get title() { return tt("Digital Product") },
    get description() { return tt("PDFs, Guides, Templates, eBooks, etc.") },
    icon: Package,
    color: QUICK_TILE,
    get badge() { return tt("Digital") },
    badgeColor: "bg-gray-100 text-gray-600",
  },
  {
    id: "course",
    type: "product",
    get title() { return tt("Video course") },
    get description() { return tt("Lessons, a player and each buyer's progress") },
    icon: GraduationCap,
    color: QUICK_TILE,
    get badge() { return tt("Course") },
    badgeColor: "bg-gray-100 text-gray-600",
  },
  {
    id: "email_capture",
    type: "email_capture",
    get title() { return tt("Email Capture Form") },
    get description() { return tt("Collect emails from your visitors") },
    icon: Mail,
    color: QUICK_TILE,
    get badge() { return tt("Email") },
    badgeColor: "bg-gray-100 text-gray-600",
  },
]

/**
 * `onGoToLinks` is the editor's own tab switch. This tab used to ask the
 * context's setActiveSection for "links", a value from an older layout that
 * nothing on screen reads any more, so "Go to Links" and the jump after
 * adding a product did nothing.
 */
export function ProductsTab({ onGoToLinks }: { onGoToLinks?: () => void } = {}) {
  /* In the store's own currency (components/platform/price-currency). */
  const shopMoney = useProductMoney()
  const { onepage, addBlock, updateBlock } = useOnePage()
  const goToLinks = useCallback(() => onGoToLinks?.(), [onGoToLinks])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  /* Four products, the ones on the page first, until "Show all" (lib/onepage/products-tab productsTabList). */
  const [showAll, setShowAll] = useState(false)
  const moreRef = useRef<HTMLButtonElement>(null)
  const [addingProductId, setAddingProductId] = useState<string | null>(null)
  const [addedProductIds, setAddedProductIds] = useState<Set<string>>(new Set())
  const [notification, setNotification] = useState<{ message: string; visible: boolean }>({ message: "", visible: false })
  const [isMounted, setIsMounted] = useState(false)
  const [isMobileViewport, setIsMobileViewport] = useState(false)
  const router = useRouter()

  // Show notification and auto-hide after 3 seconds
  const showNotification = (message: string) => {
    setNotification({ message, visible: true })
    setTimeout(() => {
      setNotification({ message: "", visible: false })
    }, 3000)
  }

  // Set mounted state for portal rendering
  useEffect(() => {
    setIsMounted(true)
    return () => setIsMounted(false)
  }, [])

  // Which products already have blocks on the page, inside a group too (lib/onepage/products-tab)
  useEffect(() => {
    if (onepage?.draft_blocks) setAddedProductIds(productIdsOnPage(onepage.draft_blocks))
  }, [onepage?.draft_blocks])

  /* The creator's products with their status, read once for the whole editor (./product-block-editor). Archived ones cannot go on a page and are left out. */
  const creatorProducts = useCreatorProducts()
  useEffect(() => {
    if (creatorProducts === null) return
    setProducts(pickableProducts(creatorProducts.map((p) => ({ ...p, thumbnail_url: p.thumbnail_url ?? undefined, slug: p.slug ?? undefined, description: p.description ?? undefined, type: p.type ?? undefined, status: p.status ?? "published" }))))
    setLoading(false)
  }, [creatorProducts])
  /* A creator with nothing to read (signed out, a failed read) sees the empty state, not a spinner forever. */
  useEffect(() => {
    const t = window.setTimeout(() => setLoading(false), 8000)
    return () => window.clearTimeout(t)
  }, [])

  // Get badge info for product type
  const getProductBadge = (type?: string) => {
    switch (type) {
      case 'course':
        return { label: 'eCourse', color: 'bg-gray-100 text-gray-600' }
      case 'lead_magnet':
      case 'email_capture':
        return { label: tt("Email"), color: 'bg-gray-100 text-gray-600' }
      case 'digital':
      default:
        return { label: tt("Digital"), color: 'bg-gray-100 text-gray-600' }
    }
  }

  // Handle adding product to Links tab
  const handleAddProductToPage = useCallback(async (product: Product) => {
    // Check if product is already added
    if (addedProductIds.has(product.id)) {
      // Product already added, just navigate to links
      goToLinks()
      return
    }

    setAddingProductId(product.id)

    // Determine block type based on product type
    if (product.type === 'lead_magnet' || product.type === 'email_capture') {
      addBlock("email_capture")
    } else {
      // Truncate description to ~7 words
      let shortDescription = product.description || ''
      const words = shortDescription.split(' ')
      if (words.length > 7) {
        shortDescription = words.slice(0, 7).join(' ') + '...'
      }

      // Check if there's an existing product block without a product selected
      const existingEmptyProductBlock = onepage?.draft_blocks?.find(
        block => block.type === "product" && !(block.data as any).product_id
      )

      if (existingEmptyProductBlock) {
        // Use existing empty product block
        updateBlock(existingEmptyProductBlock.id, {
          data: {
            product_id: product.id,
            show_price: true,
            show_description: true,
            cta_text: tt("Get My Guide"),
            style: "callout",
            product_title: product.title,
            product_thumbnail: product.thumbnail_url || null,
            product_description: shortDescription || null,
            product_price_cents: product.price_cents || 0,
            product_slug: product.slug || null,
            product_type: product.type || null,
          }
        })
      } else {
        // Create new product block
        const newBlock = addBlock("product")
        if (newBlock) {
          updateBlock(newBlock.id, {
            data: {
              product_id: product.id,
              show_price: true,
              show_description: true,
              cta_text: tt("Get My Guide"),
              style: "callout",
              product_title: product.title,
              product_thumbnail: product.thumbnail_url || null,
              product_description: shortDescription || null,
              product_price_cents: product.price_cents || 0,
              product_slug: product.slug || null,
              product_type: product.type || null,
            }
          })
        }
      }

      // Add to added products set
      setAddedProductIds(prev => new Set([...prev, product.id]))
      /* A draft goes on the page now and shows to visitors once it is published (lib/onepage/live-products). */
      if (product.status !== "published") showNotification(tt("Added. Publish it to show it."))
    }

    // Show confirmation briefly then redirect
    setTimeout(() => {
      setAddingProductId(null)
      goToLinks()
    }, 500)
  }, [addBlock, updateBlock, goToLinks, addedProductIds, onepage?.draft_blocks])

  /* The phone sheet slides out on its own and keeps what it showed until it has gone. */
  const closeAddProductSheet = () => setShowAddModal(false)

  // Handle modal option click
  const handleModalOptionClick = (option: typeof productTypeOptions[0] & { comingSoon?: boolean }) => {
    // Don't do anything if coming soon
    if (option.comingSoon) {
      return
    }

    if (option.type === "email_capture") {
      addBlock("email_capture")
      showNotification(tt("Email form added"))
      closeAddProductSheet()
      goToLinks()
    } else if (option.id === "digital") {
      addBlock("product")
      showNotification(tt("Product added"))
      closeAddProductSheet()
      goToLinks()
    } else {
      // Redirect to product creation page for other types
      window.location.href = `/app/products/new?type=${option.id}`
    }
  }


  useEffect(() => {
    if (typeof window === "undefined") return
    const media = window.matchMedia("(max-width: 767px)")
    const sync = () => setIsMobileViewport(media.matches)
    sync()
    media.addEventListener("change", sync)
    return () => media.removeEventListener("change", sync)
  }, [])


  /* On the page first, then a few others; a search looks through all of them (lib/onepage/products-tab). */
  const view = productsTabList(products, addedProductIds, searchQuery)

  const renderRow = (product: Product) => {
    const badge = getProductBadge(product.type)
    const isAdding = addingProductId === product.id
    const added = addedProductIds.has(product.id)
    const state = editorProductState(product.id, products)
    return (
      <li key={product.id} className="flex items-center gap-3 px-3.5 py-3 transition-colors [@media(hover:hover)]:hover:bg-[#fafafb]" data-products-row={state}>
        <div className="h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-[#f4f4f6] shadow-[inset_0_0_0_1px_rgba(16,24,40,0.05)]">
          {product.thumbnail_url ? (
            <img src={product.thumbnail_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full w-full place-items-center">
              <Package className="h-5 w-5 text-[#9ca3af]" strokeWidth={1.7} />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[14.5px] font-medium text-[#1a1a2e]">{product.title}</span>
            <ProductStateBadge state={state} />
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-[#6b7280]">
            <span className="tabular-nums">{product.price_cents > 0 ? shopMoney(product.price_cents, product) : tt("Free")}</span>
            <span aria-hidden className="text-[#c4c8ce]">·</span>
            <span>{badge.label}</span>
          </p>
        </div>
        {added ? (
          <button
            type="button"
            onClick={goToLinks}
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg px-2.5 text-[12.5px] font-medium text-[#4b5563] transition-colors [@media(hover:hover)]:hover:bg-[#f4f4f6]"
            data-products-on-page=""
          >
            <Check className="h-3.5 w-3.5" strokeWidth={2.4} />
            {tt("Added")}
          </button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleAddProductToPage(product)}
            disabled={isAdding}
            className="h-8 shrink-0 rounded-lg px-3 text-[13px]"
            data-products-add-one=""
          >
            {isAdding ? <Check className="h-4 w-4" /> : <Plus className="mr-1 h-3.5 w-3.5" />}
            {isAdding ? tt("Added") : tt("Add")}
          </Button>
        )}
      </li>
    )
  }

  if (!onepage) return null

  return (
    <>
      {/* Notification Toast - Rendered via Portal */}
      {isMounted && notification.visible && createPortal(
        <div className="fixed top-[calc(68px+env(safe-area-inset-top)+12px)] md:top-[calc(58px+env(safe-area-inset-top)+14px)] left-1/2 transform -translate-x-1/2 z-[2147483647] animate-in fade-in slide-in-from-top-2 duration-300 pointer-events-none">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-[#111113] text-white rounded-full shadow-[0_1px_2px_rgba(0,0,0,0.2),0_8px_24px_-6px_rgba(0,0,0,0.35)] whitespace-nowrap max-w-[calc(100vw-2rem)]">
            <Check className="h-4 w-4 text-white shrink-0" strokeWidth={2.5} />
            <span className="min-w-0 truncate text-sm font-medium">{notification.message}</span>
          </div>
        </div>,
        document.body
      )}

      <div className="space-y-5" data-products-tab="">
      {/*
        ROUND 10: ONE CALM LIST. The tab was a header, a big button, a bordered
        box with its own grey title bar and a list capped at 400px, then a
        second list of quick adds. Now: the title and Add product on one line,
        a search once there are enough products to need one, and each product
        a row that says what it is, what it costs, whether it is a draft, and
        whether it is already on the page.
      */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-[#1a1a2e]">{tt("Products")}</h2>
          <p className="mt-0.5 text-[13px] text-[#6b7280]">{tt("Sell your products right on your page.")}</p>
        </div>
        <Button onClick={() => setShowAddModal(true)} className={cn(primaryDepth, "h-10 shrink-0 rounded-xl px-3.5 text-[14px]")} data-products-add="">
          <Plus className="mr-1.5 h-4 w-4" />
          {tt("Add product")}
        </Button>
      </div>

      {products.length > PRODUCTS_SHOWN ? (
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
          <span className="sr-only">{tt("Search products")}</span>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={tt("Search products")}
            className="h-11 w-full rounded-xl border border-[#e3e4e8] bg-white pl-10 pr-3 text-[16px] text-[#1a1a2e] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[#9ca3af] focus:border-[#1a1a2e] focus:shadow-[0_0_0_3px_rgba(26,26,46,0.08)] sm:text-[14.5px]"
            data-products-search=""
          />
        </label>
      ) : null}

      <section aria-label={tt("Your products")} className="overflow-hidden rounded-2xl border border-[#ececf1] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        {loading ? (
          <div aria-hidden className="divide-y divide-[#f1f2f4]">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 p-3.5">
                <div className="h-12 w-12 rounded-xl bg-[#f1f2f4]" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-2/3 rounded-full bg-[#f1f2f4]" />
                  <div className="h-3 w-1/4 rounded-full bg-[#f4f4f6]" />
                </div>
              </div>
            ))}
          </div>
        ) : products.length > 0 ? (
          /*
            NO SCROLL OF ITS OWN. The list was a box 560px tall that scrolled
            inside the tab, with a wide grey bar beside it, and on a phone a
            finger on it moved the list and not the page. It is as long as
            what it shows, and it shows a few: the products on the page, then
            five more and "Show all".
          */
          <div data-products-list="">
            {view.searching ? (
              view.first.length === 0 ? (
                <p className="px-4 py-8 text-center text-[13.5px] text-[#6b7280]">{tt("No products match your search.")}</p>
              ) : (
                <ul className="divide-y divide-[#f1f2f4]">{view.first.map(renderRow)}</ul>
              )
            ) : (
              <>
                {/*
                  ROUND 40: FOUR, THEN SHOW ALL (lib/onepage/products-tab
                  productsTabList). The products on the page come first and
                  say Added; the rest open under them to their own height
                  (components/onepage/reveal), and close back the same way.
                */}
                <ul className="divide-y divide-[#f1f2f4]" data-products-first="">{view.first.map(renderRow)}</ul>
                {view.rest.length > 0 ? (
                  <>
                    <Reveal open={showAll} id="products-tab-rest" returnFocus={moreRef}>
                      <ul className="divide-y divide-[#f1f2f4] border-t border-[#f1f2f4]" data-products-rest="">{view.rest.map(renderRow)}</ul>
                    </Reveal>
                    <button
                      ref={moreRef}
                      type="button"
                      onClick={() => setShowAll((v) => !v)}
                      className="flex h-11 w-full items-center justify-center gap-1.5 border-t border-[#f1f2f4] text-[13.5px] font-medium text-[#1a1a2e] outline-none transition-colors hover:bg-[#fafafb] focus-visible:bg-[#f6f6f7]"
                      data-products-more={showAll ? "less" : "all"}
                      aria-expanded={showAll}
                      aria-controls="products-tab-rest"
                    >
                      {showAll ? tt("Show fewer") : tt("Show all {count}", { count: products.length })}
                      <ChevronDown aria-hidden className={cn("h-4 w-4 text-[#6b7280] transition-[rotate] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none", showAll && "rotate-180")} strokeWidth={2} />
                    </button>
                  </>
                ) : null}
              </>
            )}
          </div>
        ) : (
          /* As the app's own Products page says it (app/app/products/products-client): the words and one button, no picture. */
          <div className="px-6 py-10 text-center" data-products-empty="">
            <h3 className="text-[15px] font-semibold text-[#1a1a2e]">{tt("No products yet")}</h3>
            <p className="mx-auto mt-1 max-w-[280px] text-[13.5px] leading-5 text-[#6b7280]">{tt("Make your first product, then put it on your page in one tap.")}</p>
            <Button className={cn(primaryDepth, "mt-4 h-10 rounded-xl px-4 text-[14px]")} asChild>
              <a href="/app/products/new">{tt("Create product")}</a>
            </Button>
          </div>
        )}
      </section>
      {products.some((p) => editorProductState(p.id, products) === "draft") ? (
        <p className="-mt-2 px-1 text-[12px] text-[#6b7280]">{tt("Drafts can go on your page now. They show to visitors once you publish them.")}</p>
      ) : null}

      {/* Quick add */}
      <section className="space-y-2.5">
        <h3 className="px-1 text-[13px] font-semibold text-[#1a1a2e]">{tt("Quick add")}</h3>
        <div className="grid gap-2">
          {[
            { key: "email", icon: Mail, title: tt("Email Capture Form"), hint: tt("Collect emails from your visitors"), run: () => { addBlock("email_capture"); showNotification(tt("Email form added")); goToLinks() } },
            { key: "product", icon: Package, title: tt("Product block"), hint: tt("Pick a product for it on the Links tab"), run: () => { addBlock("product"); showNotification(tt("Product added")); goToLinks() } },
            { key: "pdf", icon: FileText, title: "PDF", hint: tt("Upload or link to a PDF document"), run: () => { addBlock("pdf_document"); showNotification(tt("PDF added")); goToLinks() } },
          ].map((q) => {
            const Icon = q.icon
            return (
              <button
                key={q.key}
                type="button"
                onClick={q.run}
                className="flex items-center gap-3 rounded-xl border border-[#ececf1] bg-white p-3 text-left transition-colors hover:border-[#c9cbd1] hover:bg-[#fafafb]"
                data-products-quick={q.key}
              >
                <div className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", QUICK_TILE)}>
                  <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium text-[#1a1a2e]">{q.title}</p>
                  <p className="truncate text-[12.5px] text-[#6b7280]">{q.hint}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-[#9ca3af]" />
              </button>
            )
          })}
        </div>
      </section>

      {/*
        Add Product: a dialog on a computer, and under 768px the shared sheet
        (components/ui/sheet-dialog.tsx), which moves like every other sheet
        in the app. It was a dialog pushed to the bottom by hand with its
        drag in React state.
      */}
      <SheetDialog
        open={showAddModal}
        onClose={closeAddProductSheet}
        phone={isMobileViewport}
        label={tt("Add Product")}
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="p-0 gap-0 overflow-hidden border-[#ececf1] max-w-[520px] max-h-[680px] rounded-2xl"
      >
          {isMobileViewport ? (
            <>
              <div className="px-4 pt-2 pb-3 border-b border-gray-100">
                <SheetDialogTitle className="text-base font-semibold">{tt("Add Product")}</SheetDialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">{tt("Choose what you want to add to your page")}</p>
              </div>
              {/* The sheet keeps clear of the home indicator itself. */}
              <div className="min-h-0 space-y-2 overflow-y-auto overscroll-contain p-4">
                {productTypeOptions.map((option) => {
                  const Icon = option.icon
                  const isComingSoon = (option as any).comingSoon === true
                  return (
                    <button
                      key={option.id}
                      onClick={() => handleModalOptionClick(option as any)}
                      disabled={isComingSoon}
                      className={cn(
                        "w-full flex items-center gap-3 p-3 border rounded-xl transition-all text-left",
                        isComingSoon ? "opacity-60 cursor-not-allowed bg-gray-50" : "hover:border-[#c9cbd1] hover:bg-[#f7f7f8]"
                      )}
                    >
                      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", option.color, isComingSoon && "opacity-60")}>
                        <Icon className="h-5 w-5" strokeWidth={1.75} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{option.title}</p>
                        <p className="text-xs text-muted-foreground">{option.description}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                    </button>
                  )
                })}
              </div>
            </>
          ) : (
            <>
              <div className="p-6 pb-4 border-b">
                <SheetDialogTitle className="text-lg font-semibold">{tt("Add Product")}</SheetDialogTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  {tt("Choose what you want to add to your page")}
                </p>
              </div>

              <div className="p-4 overflow-y-auto max-h-[500px]">
                <div className="grid gap-3">
                  {productTypeOptions.map((option) => {
                    const Icon = option.icon
                    const isComingSoon = (option as any).comingSoon === true
                    return (
                      <button
                        key={option.id}
                        onClick={() => handleModalOptionClick(option as any)}
                        disabled={isComingSoon}
                        className={cn(
                          "flex items-center gap-4 p-4 border rounded-xl transition-all text-left group",
                          isComingSoon
                            ? "opacity-60 cursor-not-allowed bg-gray-50"
                            : "hover:border-[#c9cbd1] hover:bg-[#f7f7f8]"
                        )}
                      >
                        <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center shrink-0", option.color, isComingSoon && "opacity-60")}>
                          <Icon className="h-5 w-5" strokeWidth={1.75} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{option.title}</p>
                            <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", option.badgeColor)}>
                              {option.badge}
                            </span>
                            {isComingSoon && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-gray-200 text-gray-500">
                                {tt("Coming Soon")}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mt-0.5">{option.description}</p>
                        </div>
                        <ChevronRight className={cn("h-5 w-5 text-gray-400 transition-colors", !isComingSoon && "group-hover:text-[#4b5563]")} />
                      </button>
                    )
                  })}
                </div>
              </div>
            </>
          )}
      </SheetDialog>
      </div>
    </>
  )
}
