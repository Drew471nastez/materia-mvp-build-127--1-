"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Check, Search, X } from "lucide-react"
import type { Category } from "@/lib/types"
import {
  MobileBottomSheet,
  MobileBottomSheetContent,
  MobileBottomSheetHeader,
  MobileBottomSheetTitle,
  MobileBottomSheetDescription,
} from "@/components/ui/mobile-bottom-sheet"

interface CategoriesSelectorMobileProps {
  selectedCategory: string | null
  onChange: (categoryId: string | null) => void
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CategoriesSelectorMobile({
  selectedCategory,
  onChange,
  open,
  onOpenChange,
}: CategoriesSelectorMobileProps) {
  const [categories, setCategories] = useState<Category[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchCategories = async () => {
      const supabase = createClient()
      const { data, error } = await supabase.from("categories").select("*").order("name")

      if (!error && data) {
        setCategories(data)
      }
      setIsLoading(false)
    }

    fetchCategories()
  }, [])

  const filteredCategories = categories.filter((cat) =>
    cat.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const selectedCategoryObject = selectedCategory
    ? categories.find((cat) => cat.id === selectedCategory)
    : null

  const handleCategorySelect = (categoryId: string) => {
    onChange(categoryId === selectedCategory ? null : categoryId)
    onOpenChange(false)
  }

  if (isLoading) {
    return null
  }

  return (
    <MobileBottomSheet open={open} onOpenChange={onOpenChange}>
      <MobileBottomSheetContent>
        <MobileBottomSheetHeader>
          <MobileBottomSheetTitle>Select Category</MobileBottomSheetTitle>
          <MobileBottomSheetDescription>
            Choose a category that best describes your product
          </MobileBottomSheetDescription>
        </MobileBottomSheetHeader>

        <div className="px-6 pb-6 space-y-4">
          {/* Search input with keyboard prevention on mobile */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Search categories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              // Prevent zoom on iOS
              style={{ fontSize: '16px' }}
              className="w-full h-10 pl-9 pr-3 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Selected category display */}
          {selectedCategoryObject && (
            <div className="flex items-center gap-2 p-3 bg-primary/10 rounded-lg border border-primary/20">
              <Check className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-primary">
                {selectedCategoryObject.name}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onChange(null)}
                className="ml-auto h-6 px-2"
              >
                Clear
              </Button>
            </div>
          )}

          {/* Categories grid */}
          <div className="max-h-[50vh] overflow-y-auto overscroll-contain -mx-2 px-2">
            <div className="flex flex-wrap gap-2">
              {filteredCategories.length > 0 ? (
                filteredCategories.map((cat) => {
                  const isSelected = selectedCategory === cat.id
                  return (
                    <button
                      key={cat.id}
                      onClick={() => handleCategorySelect(cat.id)}
                      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all transform active:scale-95 ${
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                      }`}
                      style={{
                        // GPU acceleration
                        willChange: 'transform',
                        transform: 'translateZ(0)',
                      }}
                    >
                      {isSelected && <Check className="h-3 w-3" />}
                      {cat.name}
                    </button>
                  )
                })
              ) : (
                <p className="w-full text-center text-sm text-muted-foreground py-8">
                  No categories found
                </p>
              )}
            </div>
          </div>
        </div>
      </MobileBottomSheetContent>
    </MobileBottomSheet>
  )
}
