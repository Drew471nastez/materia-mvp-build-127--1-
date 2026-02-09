"use client"

import { useOnePage } from "@/lib/onepage/context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Plus,
  ShoppingBag,
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
  Search,
  Check,
  GraduationCap,
} from "lucide-react"
import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"

interface Product {
  id: string
  title: string
  price_cents: number
  thumbnail_url?: string
  status: string
  type?: string // 'digital' | 'course' | 'lead_magnet' etc.
  slug?: string
  description?: string
}

// Product type options for the modal
const productTypeOptions = [
  {
    id: "digital",
    type: "product",
    title: "Digital Product",
    description: "PDFs, Guides, Templates, eBooks, etc.",
    icon: Package,
    color: "bg-amber-500",
    badge: "Digital",
    badgeColor: "bg-gray-100 text-gray-600",
  },
  {
    id: "course",
    type: "product",
    title: "eCourse",
    description: "Create and sell your online course",
    icon: GraduationCap,
    color: "bg-emerald-500",
    badge: "eCourse",
    badgeColor: "bg-gray-100 text-gray-600",
    comingSoon: true,
  },
  {
    id: "email_capture",
    type: "email_capture",
    title: "Email Capture Form",
    description: "Collect emails from your visitors",
    icon: Mail,
    color: "bg-rose-500",
    badge: "Email",
    badgeColor: "bg-gray-100 text-gray-600",
  },
]

export function ProductsTab() {
  const { onepage, addBlock, updateBlock, setActiveSection } = useOnePage()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [addingProductId, setAddingProductId] = useState<string | null>(null)
  const [addedProductIds, setAddedProductIds] = useState<Set<string>>(new Set())
  const [notification, setNotification] = useState<{ message: string; visible: boolean }>({ message: "", visible: false })
  const [isMobileViewport, setIsMobileViewport] = useState(false)
  const router = useRouter()

  // Show notification and auto-hide after 3 seconds
  const showNotification = (message: string) => {
    setNotification({ message, visible: true })
    setTimeout(() => {
      setNotification({ message: "", visible: false })
    }, 3000)
  }

  // Check which products already have blocks on the page
  useEffect(() => {
    if (onepage?.draft_blocks) {
      const productBlockIds = new Set<string>()
      onepage.draft_blocks.forEach(block => {
        if (block.type === "product" && (block.data as any).product_id) {
          productBlockIds.add((block.data as any).product_id)
        }
      })
      setAddedProductIds(productBlockIds)
    }
  }, [onepage?.draft_blocks])

  // Fetch user's products
  useEffect(() => {
    async function fetchProducts() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: creator } = await supabase
        .from("creators")
        .select("id")
        .eq("user_id", user.id)
        .single()

      if (!creator) return

      const { data } = await supabase
        .from("products")
        .select("id, title, price_cents, thumbnail_url, status, type, slug, description")
        .eq("creator_id", creator.id)
        .order("created_at", { ascending: false })

      setProducts(data || [])
      setLoading(false)
    }

    fetchProducts()
  }, [])

  // Get badge info for product type
  const getProductBadge = (type?: string) => {
    switch (type) {
      case 'course':
        return { label: 'eCourse', color: 'bg-gray-100 text-gray-600' }
      case 'lead_magnet':
      case 'email_capture':
        return { label: 'Email', color: 'bg-gray-100 text-gray-600' }
      case 'digital':
      default:
        return { label: 'Digital', color: 'bg-gray-100 text-gray-600' }
    }
  }

  // Handle adding product to Links tab
  const handleAddProductToPage = useCallback(async (product: Product) => {
    // Check if product is already added
    if (addedProductIds.has(product.id)) {
      // Product already added, just navigate to links
      setActiveSection("links")
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
            cta_text: "Get My Guide",
            style: "callout",
            product_title: product.title,
            product_thumbnail: product.thumbnail_url || null,
            product_description: shortDescription || null,
            product_price_cents: product.price_cents || 0,
            product_slug: product.slug || null,
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
              cta_text: "Get My Guide",
              style: "callout",
              product_title: product.title,
              product_thumbnail: product.thumbnail_url || null,
              product_description: shortDescription || null,
              product_price_cents: product.price_cents || 0,
              product_slug: product.slug || null,
            }
          })
        }
      }

      // Add to added products set
      setAddedProductIds(prev => new Set([...prev, product.id]))
    }

    // Show confirmation briefly then redirect
    setTimeout(() => {
      setAddingProductId(null)
      setActiveSection("links")
    }, 500)
  }, [addBlock, updateBlock, setActiveSection, addedProductIds, onepage?.draft_blocks])

  // Handle modal option click
  const handleModalOptionClick = (option: typeof productTypeOptions[0] & { comingSoon?: boolean }) => {
    // Don't do anything if coming soon
    if (option.comingSoon) {
      return
    }

    if (option.type === "email_capture") {
      addBlock("email_capture")
      showNotification("Email Capture Form added to your page")
      setShowAddModal(false)
      setActiveSection("links")
    } else if (option.id === "digital") {
      addBlock("product")
      showNotification("Digital Product block added to your page")
      setShowAddModal(false)
      setActiveSection("links")
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

  // Filter products by search
  const filteredProducts = products.filter(p =>
    p.title.toLowerCase().includes(searchQuery.toLowerCase())
  )

  if (!onepage) return null

  return (
    <div className="space-y-6">
      {/* Notification Toast */}
      {notification.visible && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-center gap-2 px-4 py-3 bg-gray-900 text-white rounded-lg shadow-lg">
            <Check className="h-4 w-4 text-green-400" />
            <span className="text-sm font-medium">{notification.message}</span>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Products & Lead Forms</h2>
          <p className="text-sm text-muted-foreground">
            Add products to sell or forms to collect leads
          </p>
        </div>
      </div>

      {/* Add Product Button */}
      <Button
        onClick={() => setShowAddModal(true)}
        className="w-full h-12 bg-violet-600 hover:bg-violet-700 text-white cursor-pointer"
        size="lg"
      >
        <Plus className="h-5 w-5 mr-2" />
        Add Product
      </Button>

      {/* Existing Products Section */}
      <div className="border rounded-xl overflow-hidden">
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin h-8 w-8 border-2 border-violet-600 border-t-transparent rounded-full mx-auto" />
          </div>
        ) : products.length > 0 ? (
          <div>
            <div className="p-4 border-b bg-gray-50/50">
              <h3 className="text-sm font-medium text-muted-foreground">Your Products ({products.length})</h3>
            </div>
            <div className="divide-y max-h-[400px] overflow-y-auto">
              {products.map((product) => {
                const badge = getProductBadge(product.type)
                const isAdding = addingProductId === product.id
                return (
                  <div
                    key={product.id}
                    className="flex items-center gap-4 p-4 hover:bg-gray-50/50 transition-all"
                  >
                    <div className="w-14 h-14 rounded-lg bg-gray-100 overflow-hidden shrink-0">
                      {product.thumbnail_url ? (
                        <img
                          src={product.thumbnail_url}
                          alt={product.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package className="h-6 w-6 text-gray-400" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium truncate">{product.title}</p>
                        <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0", badge.color)}>
                          {badge.label}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {product.price_cents > 0 ? `$${(product.price_cents / 100).toFixed(2)}` : 'Free'}
                      </p>
                    </div>
                    {addedProductIds.has(product.id) ? (
                      <div className="shrink-0 min-w-[70px] h-8 px-3 flex items-center justify-center rounded-md bg-gray-100 text-gray-400 text-sm cursor-not-allowed">
                        <Check className="h-4 w-4 mr-1" />
                        Added
                      </div>
                    ) : (
                      <Button
                        variant={isAdding ? "default" : "outline"}
                        size="sm"
                        onClick={() => handleAddProductToPage(product)}
                        disabled={isAdding}
                        className={cn(
                          "shrink-0 min-w-[70px]",
                          isAdding && "bg-violet-500 hover:bg-violet-600"
                        )}
                      >
                        {isAdding ? (
                          <>
                            <Check className="h-4 w-4 mr-1" />
                            Adding...
                          </>
                        ) : (
                          "Add"
                        )}
                      </Button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="text-center py-12 px-4">
            <ShoppingBag className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="font-medium text-muted-foreground">No products yet</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Create a product to sell on your page
            </p>
            <Button variant="outline" className="mt-4" asChild>
              <a href="/app/products/new">Create Product</a>
            </Button>
          </div>
        )}
      </div>

      {/* Quick Add Section */}
      <div className="border-t pt-6">
        <h3 className="text-sm font-medium mb-4">Quick Add</h3>
        <div className="grid gap-3">
          {/* Email Capture Form */}
          <button
            onClick={() => {
              addBlock("email_capture")
              showNotification("Email Capture Form added to your page")
              setActiveSection("links")
            }}
            className="flex items-center gap-4 p-4 border rounded-xl hover:border-violet-300 hover:bg-violet-50/50 transition-all text-left"
          >
            <div className="w-12 h-12 rounded-xl bg-rose-100 flex items-center justify-center shrink-0">
              <Mail className="h-6 w-6 text-rose-600" />
            </div>
            <div className="flex-1">
              <p className="font-medium">Email Capture Form</p>
              <p className="text-sm text-muted-foreground">
                Collect emails from your visitors
              </p>
            </div>
            <ChevronRight className="h-5 w-5 text-gray-400" />
          </button>

          {/* Digital Product */}
          <button
            onClick={() => {
              addBlock("product")
              showNotification("Digital Product block added to your page")
              setActiveSection("links")
            }}
            className="flex items-center gap-4 p-4 border rounded-xl hover:border-violet-300 hover:bg-violet-50/50 transition-all text-left"
          >
            <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
              <Package className="h-6 w-6 text-amber-600" />
            </div>
            <div className="flex-1">
              <p className="font-medium">Digital Product</p>
              <p className="text-sm text-muted-foreground">
                PDFs, Guides, Templates, eBooks
              </p>
            </div>
            <ChevronRight className="h-5 w-5 text-gray-400" />
          </button>

          {/* PDF Document */}
          <button
            onClick={() => {
              addBlock("pdf_document")
              showNotification("PDF Document block added to your page")
              setActiveSection("links")
            }}
            className="flex items-center gap-4 p-4 border rounded-xl hover:border-violet-300 hover:bg-violet-50/50 transition-all text-left"
          >
            <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
              <FileText className="h-6 w-6 text-blue-600" />
            </div>
            <div className="flex-1">
              <p className="font-medium">PDF</p>
              <p className="text-sm text-muted-foreground">
                Upload or link to a PDF document
              </p>
            </div>
            <ChevronRight className="h-5 w-5 text-gray-400" />
          </button>
        </div>
      </div>

      {/* Add Product Modal - desktop dialog + mobile bottom sheet */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent
          onOpenAutoFocus={(e) => e.preventDefault()}
          className={cn(
            "p-0 gap-0 overflow-hidden border-[#ececf1]",
            isMobileViewport
              ? "top-auto left-0 right-0 bottom-0 translate-x-0 translate-y-0 w-full max-w-none rounded-t-[24px] rounded-b-none border-x-0 border-b-0 max-h-[86vh] data-[state=open]:slide-in-from-bottom-4 data-[state=closed]:slide-out-to-bottom-4"
              : "max-w-[520px] max-h-[680px] rounded-2xl"
          )}
        >
          {isMobileViewport && (
            <div className="pt-2 pb-1 flex justify-center border-b border-[#f1f1f4]">
              <div className="h-1 w-10 rounded-full bg-[#d7d7df]" />
            </div>
          )}

          {isMobileViewport ? (
            <>
              <div className="px-4 pt-2 pb-3 border-b">
                <DialogTitle className="text-base font-semibold">Add Product</DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">Choose what you want to add to your page</p>
              </div>
              <div className="max-h-[65vh] space-y-2 overflow-y-auto p-4 pb-[max(12px,env(safe-area-inset-bottom))]">
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
                        isComingSoon ? "opacity-60 cursor-not-allowed bg-gray-50" : "hover:border-violet-300 hover:bg-violet-50/50"
                      )}
                    >
                      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", option.color, isComingSoon && "opacity-60")}>
                        <Icon className="h-5 w-5 text-white" />
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
                <DialogTitle className="text-lg font-semibold">Add Product</DialogTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Choose what you want to add to your page
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
                            : "hover:border-violet-300 hover:bg-violet-50/50"
                        )}
                      >
                        <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center shrink-0", option.color, isComingSoon && "opacity-60")}>
                          <Icon className="h-6 w-6 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{option.title}</p>
                            <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", option.badgeColor)}>
                              {option.badge}
                            </span>
                            {isComingSoon && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-gray-200 text-gray-500">
                                Coming Soon
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mt-0.5">{option.description}</p>
                        </div>
                        <ChevronRight className={cn("h-5 w-5 text-gray-400 transition-colors", !isComingSoon && "group-hover:text-violet-500")} />
                      </button>
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
