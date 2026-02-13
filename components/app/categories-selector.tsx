"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Check, Search, ChevronRight } from "lucide-react"
import { MobileBottomSheet } from "@/components/ui/mobile-bottom-sheet"
import type { Category } from "@/lib/types"

interface CategoriesSelectorProps {
  selectedCategory: string | null
  onChange: (categoryId: string | null) => void
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640)
    check()
    window.addEventListener("resize", check)
    return () => window.removeEventListener("resize", check)
  }, [])
  return isMobile
}

export function CategoriesSelector({ selectedCategory, onChange }: CategoriesSelectorProps) {
  const [categories, setCategories] = useState<Category[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [sheetOpen, setSheetOpen] = useState(false)
  const isMobile = useIsMobile()

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

  const filteredCategories = categories.filter((cat) => cat.name.toLowerCase().includes(searchQuery.toLowerCase()))

  const selectedCategoryObject = selectedCategory ? categories.find((cat) => cat.id === selectedCategory) : null

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading categories...</div>
  }

  const handleCategorySelect = (catId: string | null) => {
    onChange(catId)
    if (isMobile) {
      setSheetOpen(false)
    }
  }

  // Category list content (shared between desktop inline and mobile sheet)
  const categoryListContent = (
    <>
      {/* Search input - uses readonly trick on mobile to prevent keyboard in preventFocus mode */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          inputMode="none"
          placeholder="Search categories..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onFocus={(e) => {
            if (isMobile) {
              // Set inputMode to text after focus to allow typing if user really wants
              // but initially prevent keyboard from opening
              e.target.setAttribute('inputmode', 'none')
            }
          }}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 pl-9 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {filteredCategories.length > 0 ? (
          filteredCategories.map((cat) => {
            const isSelected = selectedCategory === cat.id
            return (
              <Badge
                key={cat.id}
                variant={isSelected ? "default" : "outline"}
                className="cursor-pointer hover:bg-accent py-2 px-3 text-sm"
                onClick={() => handleCategorySelect(isSelected ? null : cat.id)}
              >
                {isSelected && <Check className="mr-1 h-3 w-3" />}
                {cat.name}
              </Badge>
            )
          })
        ) : (
          <p className="text-sm text-muted-foreground">No categories found</p>
        )}
      </div>
    </>
  )

  // Mobile: show trigger button + bottom sheet
  if (isMobile) {
    return (
      <div className="space-y-3">
        <div className="space-y-2">
          <Label>Category</Label>
          {/* Mobile trigger - tappable, no keyboard */}
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="flex w-full items-center justify-between rounded-lg border border-border bg-background p-3 text-left transition-colors active:bg-muted"
          >
            <div className="flex items-center gap-2">
              {selectedCategoryObject ? (
                <Badge variant="default" className="pointer-events-none">
                  <Check className="mr-1 h-3 w-3" />
                  {selectedCategoryObject.name}
                </Badge>
              ) : (
                <span className="text-sm text-muted-foreground">Choose a category</span>
              )}
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>

          {selectedCategoryObject && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Clear selection
            </button>
          )}
        </div>

        <MobileBottomSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          title="Select Category"
          heightPercent={60}
          preventFocus
        >
          {categoryListContent}
        </MobileBottomSheet>
      </div>
    )
  }

  // Desktop: inline selector (unchanged)
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label>Selected Category</Label>
        {selectedCategoryObject ? (
          <div className="flex items-center gap-2">
            <Badge variant="default" className="cursor-pointer" onClick={() => onChange(null)}>
              <Check className="mr-1 h-3 w-3" />
              {selectedCategoryObject.name}
            </Badge>
            <button
              type="button"
              onClick={() => onChange(null)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No category selected</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="category-search">Browse Categories</Label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            id="category-search"
            type="text"
            placeholder="Search categories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 pl-9 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
      </div>

      <div className="max-h-60 overflow-y-auto rounded-lg border border-border p-3">
        <div className="flex flex-wrap gap-2">
          {filteredCategories.length > 0 ? (
            filteredCategories.map((cat) => {
              const isSelected = selectedCategory === cat.id
              return (
                <Badge
                  key={cat.id}
                  variant={isSelected ? "default" : "outline"}
                  className="cursor-pointer hover:bg-accent"
                  onClick={() => onChange(isSelected ? null : cat.id)}
                >
                  {isSelected && <Check className="mr-1 h-3 w-3" />}
                  {cat.name}
                </Badge>
              )
            })
          ) : (
            <p className="text-sm text-muted-foreground">No categories found</p>
          )}
        </div>
      </div>
    </div>
  )
}
