"use client"

import React, { useState, useRef, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import { Plus, MoreHorizontal, Package, Search, X, Archive, Copy, Trash2, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { getProductUrl } from "@/lib/url-helpers"
import { createClient } from "@/lib/supabase/client"

interface Product {
  id: string
  title: string
  type: string
  price_cents: number
  status: string
  thumbnail_url: string | null
  slug: string
  created_at: string
  archived?: boolean
}

interface ProductsClientProps {
  products: Product[]
  creatorUsername: string
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
  const searchInputRef = useRef<HTMLInputElement>(null)

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
    if (activeTab === "active" && (product.archived || product.status === "archived")) return false
    if (activeTab === "archived" && !product.archived && product.status !== "archived") return false

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

      // Create a duplicate with a new title
      const duplicateData = {
        title: `${product.title} (Copy)`,
        type: product.type,
        price_cents: product.price_cents,
        status: "draft",
        thumbnail_url: product.thumbnail_url,
        slug: `${product.slug}-copy-${Date.now()}`,
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
    active: products.filter(p => !p.archived && p.status !== "archived").length,
    archived: products.filter(p => p.archived || p.status === "archived").length,
    all: products.length,
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
            {/* Tab Pills */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 -mb-1 scrollbar-hide">
              <button
                onClick={() => setActiveTab("active")}
                className={`px-3 sm:px-4 py-1.5 rounded-full text-[12px] sm:text-[13px] font-medium transition-colors cursor-pointer whitespace-nowrap flex-shrink-0 ${
                  activeTab === "active"
                    ? "bg-[#e5e7eb] text-[#374151]"
                    : "text-[#6b7280] hover:bg-[#f3f4f6]"
                }`}
              >
                Active ({tabCounts.active})
              </button>
              <button
                onClick={() => setActiveTab("archived")}
                className={`px-3 sm:px-4 py-1.5 rounded-full text-[12px] sm:text-[13px] font-medium transition-colors cursor-pointer whitespace-nowrap flex-shrink-0 ${
                  activeTab === "archived"
                    ? "bg-[#e5e7eb] text-[#374151]"
                    : "text-[#6b7280] hover:bg-[#f3f4f6]"
                }`}
              >
                Archived ({tabCounts.archived})
              </button>
              <button
                onClick={() => setActiveTab("all")}
                className={`px-3 sm:px-4 py-1.5 rounded-full text-[12px] sm:text-[13px] font-medium transition-colors cursor-pointer whitespace-nowrap flex-shrink-0 ${
                  activeTab === "all"
                    ? "bg-[#e5e7eb] text-[#374151]"
                    : "text-[#6b7280] hover:bg-[#f3f4f6]"
                }`}
              >
                All ({tabCounts.all})
              </button>
            </div>

            {/* Search Button */}
            <button
              onClick={() => setIsSearchOpen(!isSearchOpen)}
              className={`p-2 rounded-lg transition-colors flex-shrink-0 ${
                isSearchOpen
                  ? "bg-[#8b5cf6] text-white"
                  : "bg-white border border-[#e5e7eb] text-[#6b7280] hover:bg-[#f9fafb]"
              } shadow-sm`}
              title="Search products"
            >
              <Search className="h-4 w-4" />
            </button>
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
                    onClick={() => setSearchQuery("")}
                    className="p-1 text-[#9ca3af] hover:text-[#6b7280] flex-shrink-0"
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
                    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-[#f3f4f6]">
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
                    </div>
                    <div className="flex-1 min-w-0">
                      <Link href={`/app/products/${product.id}`} className="text-[14px] font-medium text-[#1a1a2e] hover:text-[#8b5cf6] line-clamp-1 transition-colors">
                        {product.title}
                      </Link>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full capitalize ${
                          product.status === "published"
                            ? "text-[#8b5cf6] bg-[#f5f3ff]"
                            : product.archived
                            ? "text-[#6b7280] bg-[#f3f4f6]"
                            : "text-[#6b7280] bg-[#f3f4f6]"
                        }`}>
                          {product.archived ? "Archived" : product.status}
                        </span>
                      </div>
                      <p className="mt-1.5 text-[13px] font-semibold text-[#1a1a2e]">{formatPrice(product.price_cents)}</p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="shrink-0 h-9 w-9 rounded-lg hover:bg-[#f3f4f6]">
                          <MoreHorizontal className="h-4 w-4 text-[#9ca3af]" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="rounded-xl w-48">
                        <DropdownMenuItem asChild>
                          <Link href={`/app/products/${product.id}`} className="cursor-pointer">Edit</Link>
                        </DropdownMenuItem>
                        {product.status === "published" && (
                          <DropdownMenuItem asChild>
                            <a href={getProductUrl(creatorUsername, product.slug)} target="_blank" rel="noopener noreferrer" className="cursor-pointer">
                              View public page
                            </a>
                          </DropdownMenuItem>
                        )}
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
                            <Link href={`/app/products/${product.id}`} className="text-[14px] font-medium text-[#1a1a2e] hover:text-[#8b5cf6] transition-colors">
                              {product.title}
                            </Link>
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
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="rounded-lg hover:bg-[#f3f4f6]">
                                <MoreHorizontal className="h-4 w-4 text-[#9ca3af]" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="rounded-xl w-48">
                              <DropdownMenuItem asChild>
                                <Link href={`/app/products/${product.id}`} className="cursor-pointer">Edit</Link>
                              </DropdownMenuItem>
                              {product.status === "published" && (
                                <DropdownMenuItem asChild>
                                  <a href={getProductUrl(creatorUsername, product.slug)} target="_blank" rel="noopener noreferrer" className="cursor-pointer">
                                    View public page
                                  </a>
                                </DropdownMenuItem>
                              )}
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
                  onClick={handleDeleteConfirm}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2.5 text-[14px] font-medium text-white bg-rose-600 rounded-xl hover:bg-rose-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
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
