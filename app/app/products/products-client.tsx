"use client"

import { announceChange } from "@/lib/seo/announce-client"
import React, { useState, useRef, useEffect, useMemo } from "react"
import Link from "next/link"
import Image from "next/image"
import { Plus, MoreHorizontal, Package, Search, X, Archive, Copy, Trash2, AlertTriangle, Pencil, Eye, Share2, RotateCcw, Download, FileText, Table } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { getProductUrl } from "@/lib/url-helpers"
import { SmartLink } from "@/components/smart-link"
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
          <img src={STORELIB_LOGO} alt="StoreLib" />
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
          <img src={STORELIB_LOGO} alt="StoreLib" />
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
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const exportMenuRef = useRef<HTMLDivElement>(null)

  // Close export menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setExportMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleExportPDF = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    generateProductsPDF(products, formatPrice)
    setExportMenuOpen(false)
    showNotification("PDF report generated")
  }

  const handleExportCSV = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    generateProductsCSV(products, formatPrice)
    setExportMenuOpen(false)
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

  const handleSearchClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsSearchOpen(!isSearchOpen)
  }

  const handleExportToggle = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setExportMenuOpen(!exportMenuOpen)
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
    <div className="h-full overflow-y-auto page-scroll bg-[#f8f9fa] app-page-enter">
      {/* Notification Toast */}
      {notification.visible && (
        <div className="fixed top-[calc(68px+env(safe-area-inset-top)+12px)] md:top-4 left-1/2 -translate-x-1/2 z-[100] animate-in fade-in-0 slide-in-from-top-2 duration-300">
          <div className={`px-4 py-3 rounded-xl shadow-lg ${notification.type === "error" ? "bg-rose-600" : "bg-[#1a1a2e]"} text-white text-[13px] font-medium whitespace-nowrap max-w-[calc(100vw-2rem)] overflow-hidden text-ellipsis`}>
            {notification.message}
          </div>
        </div>
      )}

      <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-[1200px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-[24px] sm:text-[28px] font-bold text-[#1a1a2e]">{t("products.title")}</h1>
            <p className="text-[14px] text-[#6b7280] mt-1">{t("products.subtitle")}</p>
          </div>
          <Button
            asChild
            className="w-full sm:w-auto min-h-[44px] bg-[#8b5cf6] hover:bg-[#7c3aed] text-white rounded-xl group"
          >
            <Link href="/app/products/new">
              <Plus className="mr-2 h-4 w-4 transition-transform duration-300 ease-out group-hover:rotate-90" />
              {t("products.newProduct")}
            </Link>
          </Button>
        </div>

        {/* Tab Pills & Search */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            {/* Horizontal Tab Pills */}
            <div className="flex items-center gap-2">
              {tabOptions.map((option) => {
                // Active tab keeps the original white/border/shadow style
                // All and Archived tabs use pill style like Sales page
                const isActiveTab = option.value === "active"
                const isSelected = activeTab === option.value

                return (
                  <button
                    key={option.value}
                    onClick={() => setActiveTab(option.value)}
                    className={`inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors cursor-pointer ${
                      isActiveTab
                        ? `px-4 py-2 rounded-xl ${
                            isSelected
                              ? "bg-white border border-[#e5e7eb] text-[#374151] shadow-sm"
                              : "bg-[#f3f4f6] text-[#6b7280] hover:bg-[#e5e7eb]"
                          }`
                        : `px-3 sm:px-4 py-1.5 rounded-full ${
                            isSelected
                              ? "bg-[#e5e7eb] text-[#374151]"
                              : "text-[#6b7280] hover:bg-[#f3f4f6]"
                          }`
                    }`}
                  >
                    {option.label}
                    <span className="text-[11px] text-[#9ca3af]">
                      {tabCounts[option.value]}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Search & Export Buttons */}
            <div className="flex items-center gap-2">
              {/* Search Button - Clickable */}
              <button
                type="button"
                onClick={handleSearchClick}
                className={`p-2 rounded-lg transition-colors flex-shrink-0 cursor-pointer select-none ${
                  isSearchOpen
                    ? "bg-[#8b5cf6] text-white"
                    : "bg-white border border-[#e5e7eb] text-[#6b7280] hover:bg-[#f9fafb] hover:text-[#374151]"
                } shadow-sm`}
                title="Search products"
                aria-label="Search products"
              >
                <Search className="h-4 w-4 pointer-events-none" />
              </button>

              {/* Export Button - Clickable */}
              <div className="relative" ref={exportMenuRef}>
                <button
                  type="button"
                  onClick={handleExportToggle}
                  className={`p-2 rounded-lg transition-colors flex-shrink-0 cursor-pointer select-none ${
                    exportMenuOpen
                      ? "bg-[#8b5cf6] text-white"
                      : "bg-white border border-[#e5e7eb] text-[#6b7280] hover:bg-[#f9fafb] hover:text-[#374151]"
                  } shadow-sm`}
                  title="Export products"
                  aria-label="Export products"
                  aria-expanded={exportMenuOpen}
                  aria-haspopup="true"
                >
                  <Download className="h-4 w-4 pointer-events-none" />
                </button>

                {/* Export Dropdown Menu */}
                {exportMenuOpen && (
                  <div className="absolute right-0 mt-2 w-52 bg-white rounded-xl border border-[#e5e7eb] shadow-lg z-50 overflow-hidden animate-in fade-in-0 slide-in-from-top-2 duration-200">
                    <button
                      type="button"
                      onClick={handleExportPDF}
                      className="w-full px-4 py-3 text-left text-[14px] text-[#374151] hover:bg-[#f9fafb] active:bg-[#f3f4f6] transition-colors flex items-center gap-3 cursor-pointer"
                    >
                      <div className="w-8 h-8 rounded-lg bg-[#fef2f2] flex items-center justify-center">
                        <FileText className="h-4 w-4 text-[#ef4444]" />
                      </div>
                      <div>
                        <p className="font-medium">Export as PDF</p>
                        <p className="text-[11px] text-[#9ca3af]">Printable report</p>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={handleExportCSV}
                      className="w-full px-4 py-3 text-left text-[14px] text-[#374151] hover:bg-[#f9fafb] active:bg-[#f3f4f6] transition-colors flex items-center gap-3 border-t border-[#e5e7eb] cursor-pointer"
                    >
                      <div className="w-8 h-8 rounded-lg bg-[#f0fdf4] flex items-center justify-center">
                        <Table className="h-4 w-4 text-[#22c55e]" />
                      </div>
                      <div>
                        <p className="font-medium">Export as CSV</p>
                        <p className="text-[11px] text-[#9ca3af]">Spreadsheet data</p>
                      </div>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Search Bar */}
          {isSearchOpen && (
            <div className="animate-in fade-in-0 slide-in-from-top-2 duration-200">
              <div className="flex items-center gap-2 bg-white border border-[#e5e7eb] rounded-xl px-3 py-2 shadow-sm">
                <Search className="h-4 w-4 text-[#9ca3af] flex-shrink-0" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search products..."
                  className="flex-1 text-[14px] bg-transparent outline-none placeholder:text-[#9ca3af]"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="p-1 text-[#9ca3af] hover:text-[#6b7280] flex-shrink-0 cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {filteredProducts.length > 0 ? (
          <>
            {/* Mobile view */}
            <div className="grid gap-4 sm:hidden">
              {filteredProducts.map((product) => (
                <div key={product.id} className="bg-white rounded-2xl border border-[#e5e7eb]/60 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                  <div className="flex gap-3">
                    {/* Clickable product area */}
                    <Link
                      href={`/app/products/${product.id}`}
                      className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-[#f3f4f6] cursor-pointer hover:ring-2 hover:ring-[#8b5cf6]/20 transition-all"
                    >
                      {product.thumbnail_url ? (
                        <Image
                          src={product.thumbnail_url || "/placeholder.svg"}
                          alt={product.title}
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <Package className="h-6 w-6 text-[#9ca3af]" />
                        </div>
                      )}
                    </Link>
                    <Link href={`/app/products/${product.id}`} className="flex-1 min-w-0 text-left cursor-pointer">
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-medium text-[#1a1a2e] hover:text-[#8b5cf6] line-clamp-1 transition-colors">
                          {product.title}
                        </span>
                      </div>
                      {/* Show status badge only for non-published products on mobile */}
                      {(product.status !== "published" || product.archived) && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full capitalize ${
                            product.archived
                              ? "text-[#6b7280] bg-[#f3f4f6]"
                              : "text-[#6b7280] bg-[#f3f4f6]"
                          }`}>
                            {product.archived ? "Archived" : product.status}
                          </span>
                        </div>
                      )}
                      <p className="mt-1.5 text-[13px] font-semibold text-[#1a1a2e]">{formatPrice(product.price_cents)}</p>
                    </Link>
                    {/* Action Buttons */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Edit Button - Light gray */}
                      <Link
                        href={`/app/products/${product.id}`}
                        className="inline-flex items-center justify-center h-8 px-2.5 bg-[#f3f4f6] hover:bg-[#e5e7eb] text-[#1f2937] text-[11px] font-medium rounded-lg transition-colors"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Link>
                      {/* View Button - Light gray with black text */}
                      <SmartLink
                        href={getProductUrl(creatorUsername, product.slug)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center h-8 px-2.5 bg-[#f3f4f6] hover:bg-[#e5e7eb] text-[#1f2937] text-[11px] font-medium rounded-lg transition-colors"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </SmartLink>
                      {/* Restore Button - Only for archived products (light gray) */}
                      {(product.archived || product.status === "archived") && (
                        <button
                          type="button"
                          onClick={() => handleArchive(product)}
                          className="inline-flex items-center justify-center h-8 px-2.5 bg-[#f3f4f6] hover:bg-[#e5e7eb] text-[#1f2937] text-[11px] font-medium rounded-lg transition-colors"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {/* More Actions Dropdown - includes Share on mobile */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8 rounded-lg hover:bg-[#f3f4f6]">
                            <MoreHorizontal className="h-4 w-4 text-[#9ca3af]" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="rounded-xl w-48">
                          {/* Share option in dropdown on mobile */}
                          <DropdownMenuItem onClick={() => handleShare(product)} className="cursor-pointer">
                            <Share2 className="h-4 w-4 mr-2" />
                            Share
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleArchive(product)} className="cursor-pointer">
                            <Archive className="h-4 w-4 mr-2" />
                            {product.archived ? t("products.restore") : t("products.archive")}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDuplicate(product)} className="cursor-pointer">
                            <Copy className="h-4 w-4 mr-2" />
                            {t("products.duplicate")}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => handleDeleteClick(product)}
                            className="cursor-pointer text-rose-600 focus:text-rose-600 focus:bg-rose-50"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop view */}
            <div className="hidden sm:block bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
              <div className="table-scroll">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#e5e7eb]">
                      <th className="px-5 py-4 text-left text-[13px] font-medium text-[#6b7280]">Product</th>
                      <th className="px-5 py-4 text-left text-[13px] font-medium text-[#6b7280]">Price</th>
                      <th className="px-5 py-4 text-left text-[13px] font-medium text-[#6b7280]">Status</th>
                      <th className="px-5 py-4 text-right text-[13px] font-medium text-[#6b7280]">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.map((product) => (
                      <tr key={product.id} className="border-b border-[#e5e7eb]/60 last:border-0 hover:bg-[#f9fafb] transition-colors">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-[#f3f4f6]">
                              {product.thumbnail_url ? (
                                <Image
                                  src={product.thumbnail_url || "/placeholder.svg"}
                                  alt={product.title}
                                  fill
                                  className="object-cover"
                                />
                              ) : (
                                <div className="flex h-full items-center justify-center">
                                  <Package className="h-5 w-5 text-[#9ca3af]" />
                                </div>
                              )}
                            </div>
                            <span className="text-[14px] font-medium text-[#1a1a2e] hover:text-[#8b5cf6] transition-colors">
                              {product.title}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-[14px] font-semibold text-[#1a1a2e]">{formatPrice(product.price_cents)}</td>
                        <td className="px-5 py-4">
                          <span className={`text-[12px] font-medium px-2.5 py-1 rounded-full capitalize ${
                            product.status === "published"
                              ? "text-[#8b5cf6] bg-[#f5f3ff]"
                              : product.archived
                              ? "text-[#6b7280] bg-[#f3f4f6]"
                              : "text-[#6b7280] bg-[#f3f4f6]"
                          }`}>
                            {product.archived ? "Archived" : product.status}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {/* Edit Button - Light gray */}
                            <Link
                              href={`/app/products/${product.id}`}
                              className="inline-flex items-center gap-1.5 h-8 px-3 bg-[#f3f4f6] hover:bg-[#e5e7eb] text-[#1f2937] text-[12px] font-medium rounded-lg transition-colors"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              {t("products.edit")}
                            </Link>
                            {/* View Button - Light gray with black text */}
                            <SmartLink
                              href={getProductUrl(creatorUsername, product.slug)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 h-8 px-3 bg-[#f3f4f6] hover:bg-[#e5e7eb] text-[#1f2937] text-[12px] font-medium rounded-lg transition-colors"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              {t("common.view")}
                            </SmartLink>
                            {/* Conditional: Share Button for active products, Restore for archived */}
                            {product.archived || product.status === "archived" ? (
                              <button
                                type="button"
                                onClick={() => handleArchive(product)}
                                className="inline-flex items-center gap-1.5 h-8 px-3 bg-[#f3f4f6] hover:bg-[#e5e7eb] text-[#1f2937] text-[12px] font-medium rounded-lg transition-colors"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                                {t("products.restore")}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleShare(product)}
                                className="inline-flex items-center gap-1.5 h-8 px-3 bg-[#f3f4f6] hover:bg-[#e5e7eb] text-[#1f2937] text-[12px] font-medium rounded-lg transition-colors"
                              >
                                <Share2 className="h-3.5 w-3.5" />
                                {t("products.share")}
                              </button>
                            )}
                            {/* More Actions Dropdown */}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="rounded-lg hover:bg-[#f3f4f6] h-8 w-8">
                                  <MoreHorizontal className="h-4 w-4 text-[#9ca3af]" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="rounded-xl w-48">
                                {/* Share option for archived products in dropdown */}
                                {(product.archived || product.status === "archived") && (
                                  <>
                                    <DropdownMenuItem onClick={() => handleShare(product)} className="cursor-pointer">
                                      <Share2 className="h-4 w-4 mr-2" />
                                      {t("products.share")}
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                  </>
                                )}
                                <DropdownMenuItem onClick={() => handleArchive(product)} className="cursor-pointer">
                                  <Archive className="h-4 w-4 mr-2" />
                                  {product.archived ? t("products.restore") : t("products.archive")}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleDuplicate(product)} className="cursor-pointer">
                                  <Copy className="h-4 w-4 mr-2" />
                                  {t("products.duplicate")}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => handleDeleteClick(product)}
                                  className="cursor-pointer text-rose-600 focus:text-rose-600 focus:bg-rose-50"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <div className="bg-white rounded-2xl border border-dashed border-[#e5e7eb] p-8 sm:p-12 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <Package className="mx-auto h-12 w-12 text-[#d1d5db]" />
            <h3 className="mt-4 text-[15px] font-semibold text-[#1a1a2e]">
              {searchQuery ? "No products found" : activeTab === "archived" ? "No archived products" : "No products yet"}
            </h3>
            <p className="mt-1 text-[13px] text-[#6b7280]">
              {searchQuery
                ? "Try adjusting your search query."
                : activeTab === "archived"
                ? "Archived products will appear here."
                : "Create your first product to start selling."}
            </p>
            {!searchQuery && activeTab !== "archived" && (
              <Button className="mt-4 min-h-[44px] bg-[#8b5cf6] hover:bg-[#7c3aed] text-white rounded-xl group" asChild>
                <Link href="/app/products/new">
                  <Plus className="mr-2 h-4 w-4 transition-transform duration-300 ease-out group-hover:rotate-90" />
                  Create product
                </Link>
              </Button>
            )}
          </div>
        )}
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
