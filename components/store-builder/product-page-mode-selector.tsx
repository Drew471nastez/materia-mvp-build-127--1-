"use client"

import { useState } from "react"
import { useSellerMoney } from "@/components/platform/price-currency"
import { useRouter } from "next/navigation"
import { useStoreBuilder } from "./store-builder-context"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Search, Package, Check, Plus } from "lucide-react"
import { cn } from "@/lib/utils"

interface ProductPageModeSelectorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  products: Array<{
    id: string
    title: string
    thumbnail_url?: string
    price_cents: number
  }>
}

export function ProductPageModeSelector({ open, onOpenChange, products }: ProductPageModeSelectorProps) {
  const router = useRouter()
  const { setCurrentPageType, setSelectedProductId, setIsEditingProductTemplate, templates, selectTemplate } =
    useStoreBuilder()

  const [selectedProduct, setSelectedProduct] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")

  const filteredProducts = products.filter((p) => p.title.toLowerCase().includes(searchQuery.toLowerCase()))

  /* In the store's own currency (components/platform/price-currency). */
  const sellerMoney = useSellerMoney()
  const formatPrice = (cents: number) => sellerMoney(cents, { grouping: true })

  const handleSelectProduct = (productId: string) => {
    setSelectedProduct(productId)
  }

  const handleConfirmProduct = () => {
    if (selectedProduct) {
      setCurrentPageType("product")
      setSelectedProductId(selectedProduct)
      setIsEditingProductTemplate(true)
      router.replace(`/store-builder?pageType=product&productId=${selectedProduct}`, { scroll: false })
      onOpenChange(false)
    }
  }

  const handleClose = () => {
    // Reset selection
    setSelectedProduct(null)
    setSearchQuery("")
    // Redirect back to shop page editor
    setCurrentPageType("shop")
    router.replace("/store-builder?pageType=shop", { scroll: false })
    onOpenChange(false)
  }

  const handleAddNewProduct = () => {
    router.push("/app/products/new")
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          handleClose()
        } else {
          onOpenChange(isOpen)
        }
      }}
    >
      <DialogContent
        className={cn(
          "p-0 gap-0 flex flex-col overflow-hidden",
          "w-[95vw] h-[90vh]",
          "sm:w-full sm:max-w-lg sm:h-auto sm:max-h-[85vh]",
        )}
      >
        <DialogHeader className="px-4 sm:px-6 py-4 border-b border-border shrink-0">
          <DialogTitle>Select a Product to Edit</DialogTitle>
          <DialogDescription>Choose a product to customize its page design</DialogDescription>
        </DialogHeader>

        {/* Search - fixed */}
        <div className="px-4 sm:px-6 py-3 border-b border-border shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search products..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Product list - scrollable */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="p-4 space-y-2">
            {filteredProducts.length === 0 ? (
              <div className="text-center py-8">
                <Package className="h-8 w-8 mx-auto mb-3 opacity-50 text-muted-foreground" />
                <p className="text-sm text-muted-foreground mb-3">No products found</p>
                <button
                  onClick={handleAddNewProduct}
                  className="inline-flex items-center gap-1.5 text-sm text-sky-500 hover:text-sky-600 hover:underline font-medium"
                >
                  <Plus className="h-4 w-4" />
                  Add New Product
                </button>
              </div>
            ) : (
              <>
                {filteredProducts.map((product) => (
                  <button
                    key={product.id}
                    onClick={() => handleSelectProduct(product.id)}
                    className={cn(
                      "flex items-center gap-3 w-full rounded-lg border p-3 text-left transition-all",
                      selectedProduct === product.id
                        ? "border-black dark:border-white bg-gray-50 dark:bg-gray-900/20"
                        : "border-border hover:bg-muted/50",
                    )}
                  >
                    <Avatar className="h-12 w-12 rounded-lg shrink-0">
                      <AvatarImage src={product.thumbnail_url || "/placeholder.svg"} className="object-cover" />
                      <AvatarFallback className="rounded-lg">
                        <Package className="h-5 w-5" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{product.title}</p>
                      <p className="text-sm text-muted-foreground">{formatPrice(product.price_cents)}</p>
                    </div>
                    {selectedProduct === product.id && (
                      <div className="h-5 w-5 rounded-full bg-black dark:bg-white flex items-center justify-center shrink-0">
                        <Check className="h-3 w-3 text-white dark:text-black" />
                      </div>
                    )}
                  </button>
                ))}
                {/* Add new product option at the bottom */}
                <button
                  onClick={handleAddNewProduct}
                  className="flex items-center gap-3 w-full rounded-lg border border-dashed border-border p-3 text-left transition-all hover:bg-muted/50 hover:border-purple-500"
                >
                  <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <Plus className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-purple-600 dark:text-purple-400">Add New Product</p>
                    <p className="text-sm text-muted-foreground">Create a new product to edit</p>
                  </div>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Footer - fixed */}
        <div className="px-4 sm:px-6 py-4 border-t border-border shrink-0 flex justify-end gap-2 bg-background">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button 
            onClick={handleConfirmProduct} 
            disabled={!selectedProduct}
            className="bg-purple-600 hover:bg-purple-700 text-white"
          >
            Edit This Product
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
