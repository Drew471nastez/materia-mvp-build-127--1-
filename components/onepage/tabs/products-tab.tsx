"use client"

import { useOnePage } from "@/lib/onepage/context"
import { sheetAboveKeyboard } from "@/lib/ui/keyboard-safe-sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { primaryDepth } from "@/components/ui/depth-button"
import { createPortal } from "react-dom"
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
import { useState, useEffect, useCallback, useRef } from "react"
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
    title: "Digital Product",
    description: "PDFs, Guides, Templates, eBooks, etc.",
    icon: Package,
    color: QUICK_TILE,
    badge: "Digital",
    badgeColor: "bg-gray-100 text-gray-600",
  },
  {
    id: "course",
    type: "product",
    title: "eCourse",
    description: "Create and sell your online course",
    icon: GraduationCap,
    color: QUICK_TILE,
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
    color: QUICK_TILE,
    badge: "Email",
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
  const { onepage, addBlock, updateBlock } = useOnePage()
  const goToLinks = useCallback(() => onGoToLinks?.(), [onGoToLinks])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [addingProductId, setAddingProductId] = useState<string | null>(null)
  const [addedProductIds, setAddedProductIds] = useState<Set<string>>(new Set())
  const [notification, setNotification] = useState<{ message: string; visible: boolean }>({ message: "", visible: false })
  const [isMounted, setIsMounted] = useState(false)
  const [isMobileViewport, setIsMobileViewport] = useState(false)
  const [addProductSheetDragY, setAddProductSheetDragY] = useState(0)
  const [isAddProductSheetDragging, setIsAddProductSheetDragging] = useState(false)
  const [isAddProductSheetPresented, setIsAddProductSheetPresented] = useState(false)
  const addProductSheetStartYRef = useRef(0)
  const addProductSheetCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const addProductSheetLastYRef = useRef(0)
  const addProductSheetLastTimeRef = useRef(0)
  const addProductSheetVelocityRef = useRef(0)
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
      goToLinks()
    }, 500)
  }, [addBlock, updateBlock, goToLinks, addedProductIds, onepage?.draft_blocks])

  const closeAddProductSheet = () => {
    if (!showAddModal) return

    if (!isMobileViewport) {
      setShowAddModal(false)
      return
    }

    setIsAddProductSheetDragging(false)
    setAddProductSheetDragY(0)
    setIsAddProductSheetPresented(false)

    if (addProductSheetCloseTimerRef.current) clearTimeout(addProductSheetCloseTimerRef.current)
    addProductSheetCloseTimerRef.current = setTimeout(() => {
      setShowAddModal(false)
    }, 400)
  }

  // Handle modal option click
  const handleModalOptionClick = (option: typeof productTypeOptions[0] & { comingSoon?: boolean }) => {
    // Don't do anything if coming soon
    if (option.comingSoon) {
      return
    }

    if (option.type === "email_capture") {
      addBlock("email_capture")
      showNotification("Email form added")
      closeAddProductSheet()
      goToLinks()
    } else if (option.id === "digital") {
      addBlock("product")
      showNotification("Product added")
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

  useEffect(() => {
    if (!showAddModal || !isMobileViewport) return
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => {
        setIsAddProductSheetPresented(true)
      })
      return () => cancelAnimationFrame(raf2)
    })
    return () => cancelAnimationFrame(raf1)
  }, [showAddModal, isMobileViewport])

  useEffect(() => {
    return () => {
      if (addProductSheetCloseTimerRef.current) clearTimeout(addProductSheetCloseTimerRef.current)
    }
  }, [])

  // Filter products by search
  const filteredProducts = products.filter(p =>
    p.title.toLowerCase().includes(searchQuery.toLowerCase())
  )

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
        onClick={() => {
          setIsAddProductSheetPresented(false)
          setShowAddModal(true)
        }}
        className={cn(primaryDepth, "w-full h-12 rounded-xl text-[15px]")}
        size="lg"
      >
        <Plus className="h-5 w-5 mr-2" />
        Add Product
      </Button>

      {/* Existing Products Section */}
      <div className="border rounded-xl overflow-hidden">
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin h-8 w-8 border-2 border-[#1a1a2e] border-t-transparent rounded-full mx-auto" />
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
                          isAdding && "bg-[#1a1a2e] hover:bg-[#2a2a40]"
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
              showNotification("Email form added")
              goToLinks()
            }}
            className="flex items-center gap-4 p-4 border rounded-xl hover:border-[#c9cbd1] hover:bg-[#f7f7f8] transition-all text-left"
          >
            <div className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl", QUICK_TILE)}>
              <Mail className="h-5 w-5" strokeWidth={1.75} />
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
              showNotification("Product added")
              goToLinks()
            }}
            className="flex items-center gap-4 p-4 border rounded-xl hover:border-[#c9cbd1] hover:bg-[#f7f7f8] transition-all text-left"
          >
            <div className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl", QUICK_TILE)}>
              <Package className="h-5 w-5" strokeWidth={1.75} />
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
              showNotification("PDF added")
              goToLinks()
            }}
            className="flex items-center gap-4 p-4 border rounded-xl hover:border-[#c9cbd1] hover:bg-[#f7f7f8] transition-all text-left"
          >
            <div className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl", QUICK_TILE)}>
              <FileText className="h-5 w-5" strokeWidth={1.75} />
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
      <Dialog open={showAddModal} onOpenChange={(open) => {
        if (open) {
          setIsAddProductSheetPresented(false)
          setShowAddModal(true)
          return
        }
        closeAddProductSheet()
      }}>
        <DialogContent
          onOpenAutoFocus={(e) => e.preventDefault()}
          showCloseButton
          disableDefaultAnimations={isMobileViewport}
          overlayClassName={isMobileViewport ? cn("bg-black/40 scrim-graduated transition-opacity duration-400", isAddProductSheetPresented ? "opacity-100" : "opacity-0") : undefined}
          onTouchStart={(e) => {
            if (!isMobileViewport) return
            const touchY = e.touches[0]?.clientY ?? 0
            const bounds = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
            if (touchY - bounds.top <= 72) {
              addProductSheetStartYRef.current = touchY
              addProductSheetLastYRef.current = touchY
              addProductSheetLastTimeRef.current = Date.now()
              addProductSheetVelocityRef.current = 0
              setIsAddProductSheetDragging(true)
            }
          }}
          onTouchMove={(e) => {
            if (!isMobileViewport || !isAddProductSheetDragging) return
            const currentY = e.touches[0]?.clientY ?? 0
            const diff = currentY - addProductSheetStartYRef.current
            if (diff > 0) {
              e.preventDefault()
              const now = Date.now()
              const dt = Math.max(1, now - addProductSheetLastTimeRef.current)
              addProductSheetVelocityRef.current = (currentY - addProductSheetLastYRef.current) / dt
              addProductSheetLastYRef.current = currentY
              addProductSheetLastTimeRef.current = now

              const resisted = diff <= 160 ? diff * 0.92 : 147 + (diff - 160) * 0.4
              setAddProductSheetDragY(resisted)
            }
          }}
          onTouchEnd={() => {
            if (!isMobileViewport || !isAddProductSheetDragging) return
            setIsAddProductSheetDragging(false)
            if (addProductSheetDragY > 92 || addProductSheetVelocityRef.current > 0.55) {
              closeAddProductSheet()
              return
            }
            setAddProductSheetDragY(0)
          }}
          className={cn(
            "p-0 gap-0 overflow-hidden border-[#ececf1]",
            isMobileViewport
              ? "w-full max-w-none rounded-t-[24px] rounded-b-none border-x-0 border-b-0 max-h-[75vh] !top-auto !left-0 !right-0 !translate-x-0 !translate-y-0"
              : "max-w-[520px] max-h-[680px] rounded-2xl"
          )}
          style={isMobileViewport ? {
            position: 'fixed',
            top: 'auto',
            left: 0,
            right: 0,
            ...sheetAboveKeyboard(0.75),
            transform: isAddProductSheetPresented ? `translate3d(0, ${addProductSheetDragY}px, 0)` : "translate3d(0, 100%, 0)",
            willChange: 'transform',
            backfaceVisibility: 'hidden' as const,
            transition: isAddProductSheetDragging ? 'none' : 'transform 400ms cubic-bezier(0.32, 0.72, 0, 1)',
          } : undefined}
        >
          {isMobileViewport && (
            <div className="pt-3 pb-2 flex justify-center cursor-pointer">
              <div className="h-1.5 w-10 rounded-full bg-gray-300" />
            </div>
          )}

          {isMobileViewport ? (
            <>
              <div className="px-4 pt-2 pb-3 border-b border-gray-100">
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
                                Coming Soon
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
        </DialogContent>
      </Dialog>
      </div>
    </>
  )
}
