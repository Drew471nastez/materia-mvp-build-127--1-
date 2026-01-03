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
} from "lucide-react"
import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"

interface Product {
  id: string
  title: string
  price: number
  cover_image_url?: string
  status: string
}

export function ProductsTab() {
  const { onepage, addBlock } = useOnePage()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)

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
        .select("id, title, price, cover_image_url, status")
        .eq("creator_id", creator.id)
        .eq("status", "published")
        .order("created_at", { ascending: false })

      setProducts(data || [])
      setLoading(false)
    }

    fetchProducts()
  }, [])

  if (!onepage) return null

  const productTypes = [
    {
      id: "digital",
      title: "Digital Product",
      description: "PDFs, Guides, Templates, Exclusive Content, eBooks, etc.",
      icon: Package,
      color: "bg-amber-100 text-amber-600",
    },
    {
      id: "lead_magnet",
      title: "Collect Emails / Applications",
      description: "Collect Your Audience's Info with a Lead Magnet",
      icon: Mail,
      color: "bg-rose-100 text-rose-600",
    },
    {
      id: "course",
      title: "eCourse",
      description: "Create, Host, and Sell your Course",
      icon: BookOpen,
      color: "bg-emerald-100 text-emerald-600",
    },
    {
      id: "coaching",
      title: "Coaching Call",
      description: "Book Discovery Calls, Paid Coaching",
      icon: Video,
      color: "bg-blue-100 text-blue-600",
    },
    {
      id: "membership",
      title: "Recurring Membership",
      description: "Charge Recurring Subscriptions",
      icon: Gift,
      color: "bg-purple-100 text-purple-600",
    },
    {
      id: "custom",
      title: "Custom Product",
      description: '"Ask Me Anything" requests, Audits/Analyses, Video Reviews',
      icon: FileText,
      color: "bg-gray-100 text-gray-600",
    },
  ]

  const handleAddProductBlock = (productId: string) => {
    addBlock("product")
    // The block will be created with default product_id, you'd update it
    setShowAddModal(false)
  }

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

      {/* Existing Products */}
      {loading ? (
        <div className="text-center py-8">
          <div className="animate-spin h-8 w-8 border-2 border-violet-600 border-t-transparent rounded-full mx-auto" />
        </div>
      ) : products.length > 0 ? (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">Your Products</h3>
          {products.map((product) => (
            <div
              key={product.id}
              className="flex items-center gap-4 p-4 border rounded-xl hover:border-gray-300 transition-all"
            >
              <div className="w-14 h-14 rounded-lg bg-gray-100 overflow-hidden shrink-0">
                {product.cover_image_url ? (
                  <img
                    src={product.cover_image_url}
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
                <p className="font-medium truncate">{product.title}</p>
                <p className="text-sm text-muted-foreground">
                  ${(product.price / 100).toFixed(2)}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleAddProductBlock(product.id)}
              >
                Add to page
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 border-2 border-dashed rounded-xl">
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

      {/* Lead Form Section */}
      <div className="border-t pt-6">
        <h3 className="text-sm font-medium mb-4">Quick Add</h3>
        <div className="grid gap-3">
          <button
            onClick={() => addBlock("email_capture")}
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
        </div>
      </div>

      {/* Add Product Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Choose Product type</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Pick the format that best fits what you're selling
            </p>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4 mt-4">
            {productTypes.map((type) => {
              const Icon = type.icon
              return (
                <button
                  key={type.id}
                  onClick={() => {
                    if (type.id === "lead_magnet") {
                      addBlock("email_capture")
                      setShowAddModal(false)
                    } else {
                      // Redirect to product creation
                      window.location.href = `/app/products/new?type=${type.id}`
                    }
                  }}
                  className="flex items-start gap-4 p-4 border rounded-xl hover:border-gray-300 hover:bg-gray-50 transition-all text-left"
                >
                  <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center shrink-0", type.color)}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{type.title}</p>
                    <p className="text-sm text-muted-foreground mt-1">{type.description}</p>
                  </div>
                </button>
              )
            })}
          </div>

          <div className="mt-4 pt-4 border-t">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setShowAddModal(false)}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Get product ideas
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
