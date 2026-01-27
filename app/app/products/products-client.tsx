"use client"

import React, { useState, useRef, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import { Plus, MoreHorizontal, Package, Search, X, Archive, Copy, Trash2, AlertTriangle, Pencil, Eye, Share2, RotateCcw, TrendingUp, ShoppingCart, DollarSign, Users, BarChart3, Calendar, Target, Clock, ArrowUpRight, Percent, Download, FileText, Table } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { getProductUrl } from "@/lib/url-helpers"
import { createClient } from "@/lib/supabase/client"

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

interface ProductAnalytics {
  views: number
  orders: number
  revenue: number
  conversionRate: string
  avgOrderValue: number
  refunds: number
  refundRate: string
  customers: number
  chartData: { day: string; views: number; orders: number }[]
  daysLive: number
  lastSale: string
  firstSale: string
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
          <img src="https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/5135%20(1).svg" alt="StoreLib" />
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
          <img src="https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/5135%20(1).svg" alt="StoreLib" />
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
  const [products, setProducts] = useState<Product[]>(initialProducts)
  const [activeTab, setActiveTab] = useState<TabType>("active")
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [productToDelete, setProductToDelete] = useState<Product | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [notification, setNotification] = useState<{ message: string; visible: boolean; type: "success" | "error" }>({ message: "", visible: false, type: "success" })
  const [productDetailsOpen, setProductDetailsOpen] = useState(false)
  const [selectedProductForDetails, setSelectedProductForDetails] = useState<Product | null>(null)
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
    { value: "active" as TabType, label: "Active" },
    { value: "all" as TabType, label: "All" },
    { value: "archived" as TabType, label: "Archived" },
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

  // Filter products based on tab and search
  const filteredProducts = products.filter((product) => {
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
  })

  const handleArchive = async (product: Product) => {
    try {
      const supabase = createClient()
      const newArchivedState = !product.archived

      const { error } = await supabase
        .from("products")
        .update({ archived: newArchivedState })
        .eq("id", product.id)

      if (error) throw error

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

  const handleProductClick = (product: Product) => {
    setSelectedProductForDetails(product)
    setProductDetailsOpen(true)
  }

  const closeProductDetails = () => {
    setProductDetailsOpen(false)
    setTimeout(() => setSelectedProductForDetails(null), 300)
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
    <div className="h-full overflow-y-auto page-scroll bg-[#f8f9fa]">
      {/* Notification Toast */}
      {notification.visible && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] animate-in fade-in-0 slide-in-from-top-2 duration-300">
          <div className={`px-4 py-3 rounded-xl shadow-lg ${notification.type === "error" ? "bg-rose-600" : "bg-[#1a1a2e]"} text-white text-[13px] font-medium`}>
            {notification.message}
          </div>
        </div>
      )}

      <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-[1200px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-[22px] sm:text-[26px] font-semibold text-[#1a1a2e] tracking-tight">Products</h1>
            <p className="text-[14px] text-[#6b7280] mt-1">Manage your digital products</p>
          </div>
          <Button
            asChild
            className="w-full sm:w-auto min-h-[44px] bg-[#8b5cf6] hover:bg-[#7c3aed] text-white rounded-xl group"
          >
            <Link href="/app/products/new">
              <Plus className="mr-2 h-4 w-4 transition-transform duration-300 ease-out group-hover:rotate-90" />
              New product
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
                    <button
                      type="button"
                      onClick={() => handleProductClick(product)}
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
                    </button>
                    <button type="button" onClick={() => handleProductClick(product)} className="flex-1 min-w-0 text-left cursor-pointer">
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-medium text-[#1a1a2e] hover:text-[#8b5cf6] line-clamp-1 transition-colors">
                          {product.title}
                        </span>
                        {/* Subtle dot for published status on mobile */}
                        {product.status === "published" && !product.archived && (
                          <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-[#9ca3af]" title="Published" />
                        )}
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
                    </button>
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
                      <a
                        href={getProductUrl(creatorUsername, product.slug)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center h-8 px-2.5 bg-[#f3f4f6] hover:bg-[#e5e7eb] text-[#1f2937] text-[11px] font-medium rounded-lg transition-colors"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </a>
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
                            {product.archived ? "Restore" : "Archive"}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDuplicate(product)} className="cursor-pointer">
                            <Copy className="h-4 w-4 mr-2" />
                            Duplicate
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
                      <tr key={product.id} className="border-b border-[#e5e7eb]/60 last:border-0 hover:bg-[#f9fafb] transition-colors cursor-pointer" onClick={() => handleProductClick(product)}>
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
                        <td className="px-5 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-2">
                            {/* Edit Button - Light gray */}
                            <Link
                              href={`/app/products/${product.id}`}
                              className="inline-flex items-center gap-1.5 h-8 px-3 bg-[#f3f4f6] hover:bg-[#e5e7eb] text-[#1f2937] text-[12px] font-medium rounded-lg transition-colors"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Edit
                            </Link>
                            {/* View Button - Light gray with black text */}
                            <a
                              href={getProductUrl(creatorUsername, product.slug)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 h-8 px-3 bg-[#f3f4f6] hover:bg-[#e5e7eb] text-[#1f2937] text-[12px] font-medium rounded-lg transition-colors"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              View
                            </a>
                            {/* Conditional: Share Button for active products, Restore for archived */}
                            {product.archived || product.status === "archived" ? (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleArchive(product); }}
                                className="inline-flex items-center gap-1.5 h-8 px-3 bg-[#f3f4f6] hover:bg-[#e5e7eb] text-[#1f2937] text-[12px] font-medium rounded-lg transition-colors"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                                Restore
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleShare(product); }}
                                className="inline-flex items-center gap-1.5 h-8 px-3 bg-[#f3f4f6] hover:bg-[#e5e7eb] text-[#1f2937] text-[12px] font-medium rounded-lg transition-colors"
                              >
                                <Share2 className="h-3.5 w-3.5" />
                                Share
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
                                      Share
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                  </>
                                )}
                                <DropdownMenuItem onClick={() => handleArchive(product)} className="cursor-pointer">
                                  <Archive className="h-4 w-4 mr-2" />
                                  {product.archived ? "Restore" : "Archive"}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleDuplicate(product)} className="cursor-pointer">
                                  <Copy className="h-4 w-4 mr-2" />
                                  Duplicate
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
              <h3 className="text-[18px] font-semibold text-[#1a1a2e] text-center mb-2">Delete Product</h3>
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

      {/* Product Details Modal */}
      {productDetailsOpen && selectedProductForDetails && (
        <ProductDetailsModal
          isOpen={productDetailsOpen}
          onClose={closeProductDetails}
          product={selectedProductForDetails}
          formatPrice={formatPrice}
          creatorUsername={creatorUsername}
        />
      )}
    </div>
  )
}

// Product Details Modal Component with Real Analytics Data
function ProductDetailsModal({
  isOpen,
  onClose,
  product,
  formatPrice,
  creatorUsername,
}: {
  isOpen: boolean
  onClose: () => void
  product: Product
  formatPrice: (cents: number) => string
  creatorUsername: string
}) {
  const [isVisible, setIsVisible] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const [dragY, setDragY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [analytics, setAnalytics] = useState<ProductAnalytics | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const startY = React.useRef(0)
  const sheetRef = React.useRef<HTMLDivElement>(null)

  // Fetch real analytics data from API endpoint (uses admin client for accurate data)
  useEffect(() => {
    const fetchAnalytics = async () => {
      setIsLoading(true)
      try {
        const response = await fetch(`/api/product-analytics?productId=${product.id}`)

        if (!response.ok) {
          throw new Error("Failed to fetch analytics")
        }

        const data = await response.json()

        setAnalytics({
          views: data.views,
          orders: data.orders,
          revenue: data.revenue,
          conversionRate: data.conversionRate,
          avgOrderValue: data.avgOrderValue,
          refunds: data.refunds,
          refundRate: data.refundRate,
          customers: data.customers,
          chartData: data.chartData,
          daysLive: data.daysLive,
          firstSale: data.firstSale,
          lastSale: data.lastSale,
        })
      } catch (error) {
        console.error("Error fetching analytics:", error)
        // Set default analytics on error
        setAnalytics({
          views: 0,
          orders: 0,
          revenue: 0,
          conversionRate: "0.0",
          avgOrderValue: 0,
          refunds: 0,
          refundRate: "0.0",
          customers: 0,
          chartData: Array.from({ length: 7 }, (_, i) => ({
            day: new Date(Date.now() - (6 - i) * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { weekday: 'short' }),
            views: 0,
            orders: 0,
          })),
          daysLive: Math.max(1, Math.floor((Date.now() - new Date(product.created_at).getTime()) / (1000 * 60 * 60 * 24))),
          firstSale: "No sales yet",
          lastSale: "No sales yet",
        })
      } finally {
        setIsLoading(false)
      }
    }

    if (isOpen && product) {
      fetchAnalytics()
    }
  }, [isOpen, product])

  useEffect(() => {
    if (isOpen && !isVisible) {
      setIsVisible(true)
      document.body.style.overflow = "hidden"
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsAnimating(true)
        })
      })
    } else if (!isOpen && isVisible) {
      setIsAnimating(false)
      document.body.style.overflow = ""
      const timer = setTimeout(() => {
        setIsVisible(false)
        setDragY(0)
      }, 400)
      return () => clearTimeout(timer)
    }
    return () => {
      document.body.style.overflow = ""
    }
  }, [isOpen, isVisible])

  const handleClose = () => {
    setIsAnimating(false)
    setDragY(0)
    setTimeout(() => {
      onClose()
    }, 400)
  }

  // Handle drag for mobile swipe-to-close
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0]
    const sheetElement = sheetRef.current
    if (!sheetElement) return

    const sheetRect = sheetElement.getBoundingClientRect()
    const touchYInSheet = touch.clientY - sheetRect.top

    if (touchYInSheet <= 60) {
      startY.current = touch.clientY
      setIsDragging(true)
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return
    const currentY = e.touches[0].clientY
    const diff = currentY - startY.current
    if (diff > 0) {
      setDragY(diff * 0.8)
    }
  }

  const handleTouchEnd = () => {
    if (!isDragging) return
    setIsDragging(false)
    if (dragY > 80) {
      handleClose()
    } else {
      setDragY(0)
    }
  }

  if (!isVisible) return null

  const maxChartValue = Math.max(...(analytics?.chartData.map(d => d.views) || [1]), 1)

  return (
    <>
      {/* Desktop Modal */}
      <div className="fixed inset-0 z-50 hidden sm:flex items-center justify-center p-4">
        <div
          className={`absolute inset-0 bg-black/50 transition-opacity duration-400 ${isAnimating ? 'opacity-100' : 'opacity-0'}`}
          onClick={handleClose}
        />
        <div
          className={`relative bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl transition-all duration-400 ${
            isAnimating ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
          }`}
          style={{ transitionTimingFunction: 'cubic-bezier(0.32, 0.72, 0, 1)' }}
        >
          {/* Desktop Header */}
          <div className="sticky top-0 bg-white border-b border-[#e5e7eb] px-6 py-4 flex items-center justify-between z-10">
            <h2 className="text-[18px] font-semibold text-[#1a1a2e]">Product Analytics</h2>
            <button
              type="button"
              onClick={handleClose}
              className="w-8 h-8 rounded-lg bg-[#f3f4f6] flex items-center justify-center text-[#6b7280] hover:bg-[#e5e7eb] transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Desktop Content */}
          <div className="p-6 space-y-6">
            {/* Product Header */}
            <div className="flex items-center gap-4">
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-[#f3f4f6]">
                {product.thumbnail_url ? (
                  <Image
                    src={product.thumbnail_url}
                    alt={product.title}
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <Package className="h-7 w-7 text-[#9ca3af]" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-[16px] font-semibold text-[#1a1a2e] line-clamp-1">{product.title}</h3>
                <p className="text-[14px] text-[#6b7280] mt-0.5">{formatPrice(product.price_cents)} · {product.type}</p>
              </div>
              <span className={`text-[12px] font-medium px-2.5 py-1 rounded-full capitalize ${
                product.status === "published"
                  ? "text-[#8b5cf6] bg-[#f5f3ff]"
                  : "text-[#6b7280] bg-[#f3f4f6]"
              }`}>
                {product.archived ? "Archived" : product.status}
              </span>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-8 h-8 border-2 border-[#e5e7eb] border-t-[#8b5cf6] rounded-full animate-spin" />
              </div>
            ) : analytics && (
              <>
                {/* KPI Stats Grid - Matching Sales page styling */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[13px] font-medium text-[#6b7280]">Total Views</span>
                      <div className="w-8 h-8 rounded-lg bg-[#f3f4f6] flex items-center justify-center">
                        <Eye className="h-4 w-4 text-[#9ca3af]" />
                      </div>
                    </div>
                    <p className="text-[22px] font-semibold text-[#1a1a2e] tracking-tight">{analytics.views.toLocaleString()}</p>
                    <p className="text-[11px] text-[#9ca3af] mt-1">Page impressions</p>
                  </div>

                  <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[13px] font-medium text-[#6b7280]">Orders</span>
                      <div className="w-8 h-8 rounded-lg bg-[#f3f4f6] flex items-center justify-center">
                        <ShoppingCart className="h-4 w-4 text-[#9ca3af]" />
                      </div>
                    </div>
                    <p className="text-[22px] font-semibold text-[#1a1a2e] tracking-tight">{analytics.orders.toLocaleString()}</p>
                    <p className="text-[11px] text-[#9ca3af] mt-1">Completed orders</p>
                  </div>

                  <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[13px] font-medium text-[#6b7280]">Revenue</span>
                      <div className="w-8 h-8 rounded-lg bg-[#f3f4f6] flex items-center justify-center">
                        <DollarSign className="h-4 w-4 text-[#9ca3af]" />
                      </div>
                    </div>
                    <p className="text-[22px] font-semibold text-[#1a1a2e] tracking-tight">{formatPrice(analytics.revenue)}</p>
                    <p className="text-[11px] text-[#9ca3af] mt-1">Gross revenue</p>
                  </div>

                  <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[13px] font-medium text-[#6b7280]">Conversion</span>
                      <div className="w-8 h-8 rounded-lg bg-[#f3f4f6] flex items-center justify-center">
                        <Target className="h-4 w-4 text-[#9ca3af]" />
                      </div>
                    </div>
                    <p className="text-[22px] font-semibold text-[#1a1a2e] tracking-tight">{analytics.conversionRate}%</p>
                    <p className="text-[11px] text-[#9ca3af] mt-1">View to order rate</p>
                  </div>
                </div>

                {/* Mini Chart - Views over last 7 days */}
                <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-[13px] font-semibold text-[#1a1a2e] flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-[#9ca3af]" />
                      Views (Last 7 Days)
                    </h4>
                    <span className="text-[11px] text-[#9ca3af]">Real-time data</span>
                  </div>
                  <div className="flex items-end gap-2 h-24">
                    {analytics.chartData.map((data, index) => (
                      <div key={index} className="flex-1 flex flex-col items-center gap-1">
                        <div
                          className="w-full bg-[#8b5cf6] hover:bg-[#7c3aed] rounded-t-sm transition-all duration-300"
                          style={{ height: `${Math.max((data.views / maxChartValue) * 100, 4)}%`, minHeight: '4px' }}
                        />
                        <span className="text-[10px] text-[#9ca3af]">{data.day}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Additional Stats */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4 space-y-3">
                    <h4 className="text-[13px] font-semibold text-[#1a1a2e] flex items-center gap-2">
                      <Users className="h-4 w-4 text-[#9ca3af]" />
                      Customer Insights
                    </h4>
                    <div className="space-y-2.5">
                      <div className="flex justify-between items-center">
                        <span className="text-[12px] text-[#6b7280]">Unique Customers</span>
                        <span className="text-[13px] font-medium text-[#1a1a2e]">{analytics.customers}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[12px] text-[#6b7280]">Avg Order Value</span>
                        <span className="text-[13px] font-medium text-[#1a1a2e]">{formatPrice(analytics.avgOrderValue)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[12px] text-[#6b7280]">Refund Rate</span>
                        <span className="text-[13px] font-medium text-[#1a1a2e]">{analytics.refundRate}%</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4 space-y-3">
                    <h4 className="text-[13px] font-semibold text-[#1a1a2e] flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-[#9ca3af]" />
                      Timeline
                    </h4>
                    <div className="space-y-2.5">
                      <div className="flex justify-between items-center">
                        <span className="text-[12px] text-[#6b7280]">Days Live</span>
                        <span className="text-[13px] font-medium text-[#1a1a2e]">{analytics.daysLive} days</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[12px] text-[#6b7280]">First Sale</span>
                        <span className="text-[13px] font-medium text-[#1a1a2e]">{analytics.firstSale}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[12px] text-[#6b7280]">Last Sale</span>
                        <span className="text-[13px] font-medium text-[#1a1a2e]">{analytics.lastSale}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Performance Metrics */}
                <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4 space-y-3">
                  <h4 className="text-[13px] font-semibold text-[#1a1a2e] flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-[#9ca3af]" />
                    Performance Metrics
                  </h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <span className="text-[12px] text-[#6b7280]">Revenue/Day</span>
                      <p className="text-[14px] font-medium text-[#1a1a2e]">{analytics.daysLive > 0 ? formatPrice(analytics.revenue / analytics.daysLive) : '$0.00'}</p>
                    </div>
                    <div>
                      <span className="text-[12px] text-[#6b7280]">Orders/Day</span>
                      <p className="text-[14px] font-medium text-[#1a1a2e]">{analytics.daysLive > 0 ? (analytics.orders / analytics.daysLive).toFixed(1) : '0'}</p>
                    </div>
                    <div>
                      <span className="text-[12px] text-[#6b7280]">Views/Day</span>
                      <p className="text-[14px] font-medium text-[#1a1a2e]">{analytics.daysLive > 0 ? Math.round(analytics.views / analytics.daysLive) : '0'}</p>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              <Link
                href={`/app/products/${product.id}`}
                className="flex-1 inline-flex items-center justify-center gap-2 h-11 px-4 bg-[#8b5cf6] hover:bg-[#7c3aed] text-white text-[14px] font-medium rounded-xl transition-colors"
              >
                <Pencil className="h-4 w-4" />
                Edit Product
              </Link>
              <a
                href={getProductUrl(creatorUsername, product.slug)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 inline-flex items-center justify-center gap-2 h-11 px-4 bg-[#f3f4f6] hover:bg-[#e5e7eb] text-[#1f2937] text-[14px] font-medium rounded-xl transition-colors"
              >
                <Eye className="h-4 w-4" />
                View Page
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Bottom Sheet */}
      <div className="fixed inset-0 z-50 sm:hidden">
        <div
          className={`absolute inset-0 bg-black/50 transition-opacity duration-400 ${isAnimating ? 'opacity-100' : 'opacity-0'}`}
          onClick={handleClose}
        />
        <div
          ref={sheetRef}
          className={`absolute bottom-0 left-0 right-0 bg-white rounded-t-[20px] transition-transform duration-400 max-h-[92vh] overflow-hidden ${
            isAnimating ? 'translate-y-0' : 'translate-y-full'
          }`}
          style={{
            transform: `translateY(${isAnimating ? dragY : '100%'}px)`,
            transitionTimingFunction: isDragging ? 'linear' : 'cubic-bezier(0.32, 0.72, 0, 1)',
            transitionDuration: isDragging ? '0ms' : '400ms'
          }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* Drag Handle */}
          <div className="flex justify-center py-3">
            <div className="w-10 h-1 rounded-full bg-[#d1d5db]" />
          </div>

          {/* Mobile Header */}
          <div className="px-5 pb-4 flex items-center justify-between border-b border-[#e5e7eb]">
            <h2 className="text-[17px] font-semibold text-[#1a1a2e]">Product Analytics</h2>
            <button
              type="button"
              onClick={handleClose}
              className="w-8 h-8 rounded-full bg-[#f3f4f6] flex items-center justify-center text-[#6b7280]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Mobile Content - Scrollable */}
          <div className="overflow-y-auto max-h-[calc(92vh-80px)] overscroll-contain">
            <div className="p-5 space-y-5">
              {/* Product Header */}
              <div className="flex items-center gap-3">
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-[#f3f4f6]">
                  {product.thumbnail_url ? (
                    <Image
                      src={product.thumbnail_url}
                      alt={product.title}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <Package className="h-6 w-6 text-[#9ca3af]" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-[15px] font-semibold text-[#1a1a2e] line-clamp-1">{product.title}</h3>
                  <p className="text-[13px] text-[#6b7280]">{formatPrice(product.price_cents)}</p>
                </div>
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-8 h-8 border-2 border-[#e5e7eb] border-t-[#8b5cf6] rounded-full animate-spin" />
                </div>
              ) : analytics && (
                <>
                  {/* KPI Stats Grid - Matching Sales page styling */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white rounded-xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-3.5">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-medium text-[#6b7280]">Views</span>
                        <div className="w-6 h-6 rounded-md bg-[#f3f4f6] flex items-center justify-center">
                          <Eye className="h-3 w-3 text-[#9ca3af]" />
                        </div>
                      </div>
                      <p className="text-[18px] font-semibold text-[#1a1a2e] tracking-tight">{analytics.views.toLocaleString()}</p>
                    </div>

                    <div className="bg-white rounded-xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-3.5">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-medium text-[#6b7280]">Orders</span>
                        <div className="w-6 h-6 rounded-md bg-[#f3f4f6] flex items-center justify-center">
                          <ShoppingCart className="h-3 w-3 text-[#9ca3af]" />
                        </div>
                      </div>
                      <p className="text-[18px] font-semibold text-[#1a1a2e] tracking-tight">{analytics.orders.toLocaleString()}</p>
                    </div>

                    <div className="bg-white rounded-xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-3.5">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-medium text-[#6b7280]">Revenue</span>
                        <div className="w-6 h-6 rounded-md bg-[#f3f4f6] flex items-center justify-center">
                          <DollarSign className="h-3 w-3 text-[#9ca3af]" />
                        </div>
                      </div>
                      <p className="text-[18px] font-semibold text-[#1a1a2e] tracking-tight">{formatPrice(analytics.revenue)}</p>
                    </div>

                    <div className="bg-white rounded-xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-3.5">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-medium text-[#6b7280]">Conversion</span>
                        <div className="w-6 h-6 rounded-md bg-[#f3f4f6] flex items-center justify-center">
                          <Target className="h-3 w-3 text-[#9ca3af]" />
                        </div>
                      </div>
                      <p className="text-[18px] font-semibold text-[#1a1a2e] tracking-tight">{analytics.conversionRate}%</p>
                    </div>
                  </div>

                  {/* Mini Chart */}
                  <div className="bg-white rounded-xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-[12px] font-semibold text-[#1a1a2e] flex items-center gap-1.5">
                        <BarChart3 className="h-3.5 w-3.5 text-[#9ca3af]" />
                        Views (7 Days)
                      </h4>
                      <span className="text-[10px] text-[#9ca3af]">Real-time</span>
                    </div>
                    <div className="flex items-end gap-1.5 h-20">
                      {analytics.chartData.map((data, index) => (
                        <div key={index} className="flex-1 flex flex-col items-center gap-1">
                          <div
                            className="w-full bg-[#8b5cf6] rounded-t-sm"
                            style={{ height: `${Math.max((data.views / maxChartValue) * 100, 4)}%`, minHeight: '4px' }}
                          />
                          <span className="text-[9px] text-[#9ca3af]">{data.day.slice(0, 1)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Additional Stats */}
                  <div className="bg-white rounded-xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4 space-y-3">
                    <h4 className="text-[12px] font-semibold text-[#1a1a2e]">More Details</h4>
                    <div className="grid grid-cols-2 gap-y-3 gap-x-4">
                      <div>
                        <span className="text-[11px] text-[#6b7280]">Customers</span>
                        <p className="text-[13px] font-medium text-[#1a1a2e]">{analytics.customers}</p>
                      </div>
                      <div>
                        <span className="text-[11px] text-[#6b7280]">Avg Order</span>
                        <p className="text-[13px] font-medium text-[#1a1a2e]">{formatPrice(analytics.avgOrderValue)}</p>
                      </div>
                      <div>
                        <span className="text-[11px] text-[#6b7280]">Refund Rate</span>
                        <p className="text-[13px] font-medium text-[#1a1a2e]">{analytics.refundRate}%</p>
                      </div>
                      <div>
                        <span className="text-[11px] text-[#6b7280]">Days Live</span>
                        <p className="text-[13px] font-medium text-[#1a1a2e]">{analytics.daysLive}</p>
                      </div>
                      <div>
                        <span className="text-[11px] text-[#6b7280]">First Sale</span>
                        <p className="text-[13px] font-medium text-[#1a1a2e]">{analytics.firstSale}</p>
                      </div>
                      <div>
                        <span className="text-[11px] text-[#6b7280]">Last Sale</span>
                        <p className="text-[13px] font-medium text-[#1a1a2e]">{analytics.lastSale}</p>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 pt-1 pb-4">
                <Link
                  href={`/app/products/${product.id}`}
                  className="flex-1 inline-flex items-center justify-center gap-2 h-12 px-4 bg-[#8b5cf6] hover:bg-[#7c3aed] text-white text-[14px] font-medium rounded-xl transition-colors"
                >
                  <Pencil className="h-4 w-4" />
                  Edit
                </Link>
                <a
                  href={getProductUrl(creatorUsername, product.slug)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 inline-flex items-center justify-center gap-2 h-12 px-4 bg-[#f3f4f6] hover:bg-[#e5e7eb] text-[#1f2937] text-[14px] font-medium rounded-xl transition-colors"
                >
                  <Eye className="h-4 w-4" />
                  View
                </a>
              </div>
            </div>
            {/* Safe area padding for iOS */}
            <div className="h-[env(safe-area-inset-bottom)]" />
          </div>
        </div>
      </div>
    </>
  )
}
