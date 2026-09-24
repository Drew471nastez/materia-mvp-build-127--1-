"use client"

import { announceChange } from "@/lib/seo/announce-client"
import { useState, useRef, useEffect, useMemo } from "react"
import Link from "next/link"
import Image from "next/image"
import { Plus, Package, Search, X, Trash2, AlertTriangle, Download } from "lucide-react"
import { getProductUrl } from "@/lib/url-helpers"
import { ResponsiveActionMenu } from "@/components/ui/responsive-action-menu"
import { cn } from "@/lib/utils"
import { GUTTER, LIST_WIDTH, PaneBar, RowMenuButton, StatusBadge, buttonAccent, buttonSecondary, card, iconButton } from "../orders/order-parts"
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
}

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

type TabType = "active" | "archived" | "all"

export function ProductsClient({ products: initialProducts, creatorUsername }: ProductsClientProps) {
  const { t } = useLanguage()
  const [products, setProducts] = useState<Product[]>(initialProducts)
  const [activeTab, setActiveTab] = useState<TabType>("active")
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [productToDelete, setProductToDelete] = useState<Product | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [notification, setNotification] = useState<{ message: string; visible: boolean; type: "success" | "error" }>({ message: "", visible: false, type: "success" })
  const searchInputRef = useRef<HTMLInputElement>(null)


  const exportPDF = () => {
    generateProductsPDF(products, formatPrice)
    showNotification("PDF report generated")
  }
  const exportCSV = () => {
    generateProductsCSV(products, formatPrice)
    showNotification("CSV file downloaded")
  }

  const tabOptions = [
    { value: "active" as TabType, label: t("products.active") },
    { value: "all" as TabType, label: t("products.all") },
    { value: "archived" as TabType, label: t("products.archived") },
  ]

  useEffect(() => {
    if (isSearchOpen && searchInputRef.current) {
      searchInputRef.current.focus()
    }
  }, [isSearchOpen])

  const showNotification = (message: string, type: "success" | "error" = "success") => {
    setNotification({ message, visible: true, type })
    setTimeout(() => setNotification({ message: "", visible: false, type: "success" }), 4000)
  }

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100)
  }

  // Memoize filtered products to prevent re-computation on every render
  const filteredProducts = useMemo(() => products.filter((product) => {
    // Tab filter
    // Active: Only published products (not archived)
    if (activeTab === "active") {
      if (product.archived || product.status === "archived") return false
      if (product.status !== "published") return false
    }
    // Archived: Only archived products
    if (activeTab === "archived" && !product.archived && product.status !== "archived") return false
    // All: Draft and active products (not archived)
    if (activeTab === "all" && (product.archived || product.status === "archived")) return false

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      return product.title.toLowerCase().includes(query)
    }
    return true
  }), [products, activeTab, searchQuery])

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

  const tabCounts = {
    // Active: Only published products (not archived)
    active: products.filter(p => !p.archived && p.status !== "archived" && p.status === "published").length,
    // Archived: Only archived products
    archived: products.filter(p => p.archived || p.status === "archived").length,
    // All: Draft and active products (not archived)
    all: products.filter(p => !p.archived && p.status !== "archived").length,
  }

  return (
    <div className="orders-pane h-full overflow-y-auto overflow-x-hidden page-scroll bg-[#f8f9fa] app-page-enter">
      {/* Notification Toast */}
      {notification.visible && (
        <div className="fixed top-[calc(68px+env(safe-area-inset-top)+12px)] md:top-4 left-1/2 -translate-x-1/2 z-[100] animate-in fade-in-0 slide-in-from-top-2 duration-300">
          <div className={`px-4 py-3 rounded-xl shadow-lg ${notification.type === "error" ? "bg-rose-600" : "bg-[#1a1a2e]"} text-white text-[13px] font-medium whitespace-nowrap max-w-[calc(100vw-2rem)] overflow-hidden text-ellipsis`}>
            {notification.message}
          </div>
        </div>
      )}

      {/*
        THE ORDERS PAGE'S LANGUAGE (app/app/orders/order-parts.tsx): the pane's
        bar with the page's one action, then one card whose toolbar holds the
        views, search and export, over a dense table. One table for every
        width: on a phone it scrolls sideways under a Product column that
        stays put, where it used to be a second, different list of cards.
      */}
      <PaneBar width={LIST_WIDTH} className="flex min-h-[60px] items-center justify-between gap-3 py-2">
        <h1 className="text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">{t("products.title")}</h1>
        <Link href="/app/products/new" className={buttonAccent}>
          <Plus className="h-4 w-4" />
          {t("products.newProduct")}
        </Link>
      </PaneBar>

      <div className={cn("mx-auto pb-24 md:pb-8", LIST_WIDTH, GUTTER)}>
        <section aria-label="Products" className={cn(card, "mt-4 overflow-hidden")}>
          <div className="flex h-12 items-center gap-2 border-b border-[#eef0f2] px-2">
            {isSearchOpen ? (
              <>
                <label className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border border-[#d5d7dd] bg-white px-2.5 focus-within:border-[#1a1a2e] focus-within:shadow-[0_0_0_1px_#1a1a2e]">
                  <Search className="h-4 w-4 shrink-0 text-[#6b7280]" />
                  <input
                    ref={searchInputRef}
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search products"
                    className="min-w-0 flex-1 bg-transparent text-[16px] text-[#1a1a2e] outline-none placeholder:text-[#9ca3af] sm:text-[13px] [&::-webkit-search-cancel-button]:hidden"
                  />
                  {searchQuery ? (
                    <button type="button" aria-label="Clear search" className="text-[#9ca3af] hover:text-[#4b5563]" onClick={() => setSearchQuery("")}>
                      <X className="h-4 w-4" />
                    </button>
                  ) : null}
                </label>
                <button
                  type="button"
                  className="h-8 shrink-0 rounded-lg px-2.5 text-[13px] font-medium text-[#1a1a2e] hover:bg-[#f1f2f4]"
                  onClick={() => {
                    setSearchQuery("")
                    setIsSearchOpen(false)
                  }}
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <div role="tablist" aria-label="Views" className="orders-strip -my-2 flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto py-2">
                  {tabOptions.map((option) => {
                    const selected = activeTab === option.value
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        onClick={() => setActiveTab(option.value)}
                        className={cn(
                          "inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[13px] font-medium transition-colors duration-100",
                          selected ? "bg-[#eceef1] text-[#1a1a2e]" : "text-[#4b5563] hover:bg-[#f4f5f7]",
                        )}
                      >
                        {option.label}
                        <span className="tabular-nums text-[#9ca3af]">{tabCounts[option.value]}</span>
                      </button>
                    )
                  })}
                </div>
                <button type="button" aria-label="Search products" className={iconButton} onClick={() => setIsSearchOpen(true)}>
                  <Search className="h-4 w-4" />
                </button>
                <ResponsiveActionMenu
                  title="Export"
                  align="end"
                  trigger={
                    <button type="button" aria-label="Export products" className={iconButton}>
                      <Download className="h-4 w-4" />
                    </button>
                  }
                  items={[
                    { label: "Export as CSV", onClick: exportCSV },
                    { label: "Export as PDF", onClick: exportPDF },
                  ]}
                />
              </>
            )}
          </div>

          {filteredProducts.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[500px] border-collapse">
                <thead className="border-b border-[#eef0f2] bg-[#fafbfb]">
                  <tr>
                    <th className="sticky left-0 z-[1] h-9 bg-[#fafbfb] px-3 text-left text-[12px] font-medium text-[#4b5563]">Product</th>
                    <th className="h-9 px-3 text-left text-[12px] font-medium text-[#4b5563]">Status</th>
                    <th className="h-9 px-3 text-right text-[12px] font-medium text-[#4b5563]">Price</th>
                    <th className="h-9 w-[132px] px-3" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f2f4]">
                  {filteredProducts.map((product) => {
                    const archived = product.archived || product.status === "archived"
                    return (
                      <tr key={product.id} className="group hover:bg-[#fafbfb]">
                        <td className="sticky left-0 z-[1] h-14 bg-white px-3 group-hover:bg-[#fafbfb]">
                          {/* The limit is on the link: a table cell's own max-width is ignored.
                              Narrow on a phone, so the columns scrolling under it still show. */}
                          <Link href={`/app/products/${product.id}`} className="flex min-w-0 max-w-[170px] items-center gap-3 sm:max-w-[320px]">
                            <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-[#eef0f2] bg-[#f3f4f6]">
                              {product.thumbnail_url ? (
                                <Image src={product.thumbnail_url} alt="" fill sizes="40px" className="object-cover" />
                              ) : (
                                <span className="flex h-full items-center justify-center">
                                  <Package className="h-4 w-4 text-[#9ca3af]" />
                                </span>
                              )}
                            </span>
                            <span className="truncate text-[13px] font-medium text-[#1a1a2e]">{product.title}</span>
                          </Link>
                        </td>
                        <td className="h-14 whitespace-nowrap px-3">
                          {archived ? (
                            <StatusBadge tone="neutral">Archived</StatusBadge>
                          ) : product.status === "published" ? (
                            <StatusBadge tone="success">Active</StatusBadge>
                          ) : (
                            <StatusBadge tone="neutral">Draft</StatusBadge>
                          )}
                        </td>
                        <td className="h-14 whitespace-nowrap px-3 text-right text-[13px] tabular-nums text-[#1a1a2e]">{formatPrice(product.price_cents)}</td>
                        <td className="h-14 whitespace-nowrap px-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Link href={`/app/products/${product.id}`} className={buttonSecondary}>
                              {t("products.edit")}
                            </Link>
                            <ResponsiveActionMenu
                              title={product.title}
                              align="end"
                              trigger={<RowMenuButton label={`Actions for ${product.title}`} />}
                              items={[
                                { label: t("common.view"), href: getProductUrl(creatorUsername, product.slug), target: "_blank" },
                                { label: t("products.share"), onClick: () => handleShare(product) },
                                { label: archived ? t("products.restore") : t("products.archive"), onClick: () => handleArchive(product), separatorBefore: true },
                                { label: t("products.duplicate"), onClick: () => handleDuplicate(product) },
                                { label: "Delete", variant: "destructive", separatorBefore: true, onClick: () => handleDeleteClick(product) },
                              ]}
                            />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center px-6 py-14 text-center">
              <p className="text-[15px] font-semibold text-[#1a1a2e]">
                {searchQuery ? "No products match" : activeTab === "archived" ? "No archived products" : "No products yet"}
              </p>
              <p className="mt-1 max-w-[340px] text-[13px] text-[#6b7280]">
                {searchQuery
                  ? "Try another name."
                  : activeTab === "archived"
                    ? "A product you archive is kept here, off your page, until you restore it."
                    : "Create a product and it can be sold on your page and your website."}
              </p>
              {!searchQuery && activeTab !== "archived" ? (
                <Link href="/app/products/new" className={cn(buttonAccent, "mt-4")}>
                  <Plus className="h-4 w-4" />
                  Create product
                </Link>
              ) : null}
            </div>
          )}
        </section>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteModalOpen && productToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-[2px] animate-in fade-in-0 duration-200"
            onClick={() => {
              if (!isDeleting) {
                setDeleteModalOpen(false)
                setProductToDelete(null)
              }
            }}
          />

          {/* Modal */}
          <div className="relative bg-white rounded-2xl w-full max-w-md shadow-xl animate-in fade-in-0 zoom-in-95 duration-200">
            <div className="p-6">
              {/* Warning Icon */}
              <div className="mx-auto w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center mb-4">
                <AlertTriangle className="h-6 w-6 text-rose-600" />
              </div>

              {/* Content */}
              <h3 className="text-[18px] font-semibold text-[#1a1a2e] text-center mb-2">{t("products.delete")} Product</h3>
              <p className="text-[14px] text-[#6b7280] text-center mb-6">
                Are you sure you want to delete <span className="font-medium text-[#1a1a2e]">"{productToDelete.title}"</span>? This action cannot be undone.
              </p>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setDeleteModalOpen(false)
                    setProductToDelete(null)
                  }}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2.5 text-[14px] font-medium text-[#374151] bg-[#f3f4f6] rounded-xl hover:bg-[#e5e7eb] transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteConfirm}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2.5 text-[14px] font-medium text-white bg-[#1a1a2e] rounded-xl hover:bg-[#2d2d44] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isDeleting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
