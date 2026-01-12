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
    badgeColor: "bg-amber-100 text-amber-700",
  },
  {
    id: "course",
    type: "product",
    title: "eCourse",
    description: "Create and sell your online course",
    icon: GraduationCap,
    color: "bg-emerald-500",
    badge: "eCourse",
    badgeColor: "bg-emerald-100 text-emerald-700",
  },
  {
    id: "email_capture",
    type: "email_capture",
    title: "Email Capture Form",
    description: "Collect emails from your visitors",
    icon: Mail,
    color: "bg-rose-500",
    badge: "Email",
    badgeColor: "bg-rose-100 text-rose-700",
  },
]

export function ProductsTab() {
  const { onepage, addBlock, setActiveSection } = useOnePage()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [addingProductId, setAddingProductId] = useState<string | null>(null)
  const router = useRouter()

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
        .select("id, title, price_cents, thumbnail_url, status, type")
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
        return { label: 'eCourse', color: 'bg-emerald-100 text-emerald-700' }
      case 'lead_magnet':
      case 'email_capture':
        return { label: 'Email', color: 'bg-rose-100 text-rose-700' }
      case 'digital':
      default:
        return { label: 'Digital', color: 'bg-amber-100 text-amber-700' }
    }
  }

  // Handle adding product to Links tab
  const handleAddProductToPage = useCallback(async (product: Product) => {
    setAddingProductId(product.id)

    // Determine block type based on product type
    if (product.type === 'lead_magnet' || product.type === 'email_capture') {
      addBlock("email_capture")
    } else {
      // Add product block
      const newBlock = addBlock("product")
      // Update the block with product_id if needed
    }

    // Show confirmation briefly then redirect
    setTimeout(() => {
      setAddingProductId(null)
      setActiveSection("links")
    }, 500)
  }, [addBlock, setActiveSection])

  // Handle modal option click
  const handleModalOptionClick = (option: typeof productTypeOptions[0]) => {
    if (option.type === "email_capture") {
      addBlock("email_capture")
      setShowAddModal(false)
      setActiveSection("links")
    } else {
      // Redirect to product creation page
      window.location.href = `/app/products/new?type=${option.id}`
    }
  }

  // Filter products by search
  const filteredProducts = products.filter(p =>
    p.title.toLowerCase().includes(searchQuery.toLowerCase())
  )

  if (!onepage) return null

  return (
    <div className="space-y-6">
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
        className="w-full h-12 bg-violet-600 hover:bg-violet-700 text-white"
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
                    <Button
                      variant={isAdding ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleAddProductToPage(product)}
                      disabled={isAdding}
                      className={cn(
                        "shrink-0 min-w-[70px]",
                        isAdding && "bg-green-500 hover:bg-green-500"
                      )}
                    >
                      {isAdding ? (
                        <>
                          <Check className="h-4 w-4 mr-1" />
                          Added
                        </>
                      ) : (
                        "Add"
                      )}
                    </Button>
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
              window.location.href = '/app/products/new?type=digital'
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

          {/* PDF */}
          <button
            onClick={() => {
              addBlock("link_button")
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
                Link to a PDF document
              </p>
            </div>
            <ChevronRight className="h-5 w-5 text-gray-400" />
          </button>
        </div>
      </div>

      {/* Add Product Modal - Similar to Links tab Add Block modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-[520px] max-h-[680px] p-0 gap-0 overflow-hidden">
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
                return (
                  <button
                    key={option.id}
                    onClick={() => handleModalOptionClick(option)}
                    className="flex items-center gap-4 p-4 border rounded-xl hover:border-violet-300 hover:bg-violet-50/50 transition-all text-left group"
                  >
                    <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center shrink-0", option.color)}>
                      <Icon className="h-6 w-6 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{option.title}</p>
                        <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", option.badgeColor)}>
                          {option.badge}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">{option.description}</p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-gray-400 group-hover:text-violet-500 transition-colors" />
                  </button>
                )
              })}
            </div>

            {/* Existing Products Quick Add */}
            {products.length > 0 && (
              <div className="mt-6 pt-6 border-t">
                <h4 className="text-sm font-medium text-muted-foreground mb-3">Or add an existing product</h4>
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {products.slice(0, 5).map((product) => {
                    const badge = getProductBadge(product.type)
                    const isAdding = addingProductId === product.id
                    return (
                      <div
                        key={product.id}
                        className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50/50 transition-all"
                      >
                        <div className="w-10 h-10 rounded-lg bg-gray-100 overflow-hidden shrink-0">
                          {product.thumbnail_url ? (
                            <img
                              src={product.thumbnail_url}
                              alt={product.title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Package className="h-4 w-4 text-gray-400" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium truncate">{product.title}</p>
                            <span className={cn("text-[9px] px-1.5 py-0.5 rounded-full font-medium shrink-0", badge.color)}>
                              {badge.label}
                            </span>
                          </div>
                        </div>
                        <Button
                          variant={isAdding ? "default" : "outline"}
                          size="sm"
                          onClick={() => {
                            handleAddProductToPage(product)
                            setShowAddModal(false)
                          }}
                          disabled={isAdding}
                          className={cn(
                            "h-8 px-3 text-xs shrink-0",
                            isAdding && "bg-green-500 hover:bg-green-500"
                          )}
                        >
                          {isAdding ? (
                            <>
                              <Check className="h-3 w-3 mr-1" />
                              Added
                            </>
                          ) : (
                            "Add"
                          )}
                        </Button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
