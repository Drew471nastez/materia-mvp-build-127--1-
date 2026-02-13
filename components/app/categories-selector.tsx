"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Check, Search, ChevronRight } from "lucide-react"
import type { Category } from "@/lib/types"
import { CategoriesSelectorMobile } from "./categories-selector-mobile"

interface CategoriesSelectorProps {
  selectedCategory: string | null
  onChange: (categoryId: string | null) => void
}

export function CategoriesSelector({ selectedCategory, onChange }: CategoriesSelectorProps) {
  const [categories, setCategories] = useState<Category[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isMobile, setIsMobile] = useState(false)
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false)

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

  // Detect mobile view
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }

    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const filteredCategories = categories.filter((cat) => cat.name.toLowerCase().includes(searchQuery.toLowerCase()))

  const selectedCategoryObject = selectedCategory ? categories.find((cat) => cat.id === selectedCategory) : null

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading categories...</div>
  }

  // Mobile view: Show button that opens bottom sheet
  if (isMobile) {
    return (
      <>
        <div className="space-y-2">
          <Label>Category</Label>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-between h-auto py-3"
            onClick={() => setIsBottomSheetOpen(true)}
          >
            <span className="text-left">
              {selectedCategoryObject ? (
                <span className="font-medium">{selectedCategoryObject.name}</span>
              ) : (
                <span className="text-muted-foreground">Select a category</span>
              )}
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>

        <CategoriesSelectorMobile
          selectedCategory={selectedCategory}
          onChange={onChange}
          open={isBottomSheetOpen}
          onOpenChange={setIsBottomSheetOpen}
        />
      </>
    )
  }

  // Desktop view: Show inline selector
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
          <Input
            id="category-search"
            placeholder="Search categories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
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
