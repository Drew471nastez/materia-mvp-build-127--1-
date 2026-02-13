"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Check, Search, ChevronDown } from "lucide-react"
import type { Category } from "@/lib/types"
import {
  MobileBottomSheet,
  MobileBottomSheetContent,
  MobileBottomSheetHeader,
  MobileBottomSheetBody,
  MobileBottomSheetTitle,
  MobileBottomSheetDescription,
} from "@/components/ui/mobile-bottom-sheet"

interface CategoriesSelectorProps {
  selectedCategory: string | null
  onChange: (categoryId: string | null) => void
}

export function CategoriesSelector({ selectedCategory, onChange }: CategoriesSelectorProps) {
  const [categories, setCategories] = useState<Category[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isOpen, setIsOpen] = useState(false)

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

  const handleSelectCategory = (categoryId: string) => {
    const isSelected = selectedCategory === categoryId
    onChange(isSelected ? null : categoryId)
    if (!isSelected) {
      setIsOpen(false)
    }
  }

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading categories...</div>
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label>Category</Label>
        <Button
          type="button"
          variant="outline"
          onClick={() => setIsOpen(true)}
          className="w-full justify-between h-auto min-h-[40px] py-2"
        >
          <span className="flex items-center gap-2">
            {selectedCategoryObject ? (
              <>
                <Check className="h-4 w-4 text-green-600" />
                <span>{selectedCategoryObject.name}</span>
              </>
            ) : (
              <span className="text-muted-foreground">Choose a category that best describes your product</span>
            )}
          </span>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </div>

      <MobileBottomSheet open={isOpen} onOpenChange={setIsOpen}>
        <MobileBottomSheetContent>
          <MobileBottomSheetHeader>
            <MobileBottomSheetTitle>Select Category</MobileBottomSheetTitle>
            <MobileBottomSheetDescription>
              Choose a category that best describes your product
            </MobileBottomSheetDescription>
          </MobileBottomSheetHeader>

          <MobileBottomSheetBody>
            <div className="space-y-4">
              {/* Search Input */}
              <div className="sticky top-0 bg-background pb-3 z-10">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  <Input
                    placeholder="Search categories..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                    inputMode="none"
                    autoComplete="off"
                    onFocus={(e) => {
                      // Prevent keyboard on mobile
                      e.target.readOnly = true
                      setTimeout(() => {
                        e.target.readOnly = false
                      }, 100)
                    }}
                  />
                </div>
              </div>

              {/* Selected Category */}
              {selectedCategoryObject && (
                <div className="pb-3 border-b border-border">
                  <p className="text-xs font-medium text-muted-foreground mb-2">SELECTED</p>
                  <Badge
                    variant="default"
                    className="cursor-pointer"
                    onClick={() => onChange(null)}
                  >
                    <Check className="mr-1 h-3 w-3" />
                    {selectedCategoryObject.name}
                  </Badge>
                </div>
              )}

              {/* Categories Grid */}
              <div className="flex flex-wrap gap-2">
                {filteredCategories.length > 0 ? (
                  filteredCategories.map((cat) => {
                    const isSelected = selectedCategory === cat.id
                    return (
                      <Badge
                        key={cat.id}
                        variant={isSelected ? "default" : "outline"}
                        className="cursor-pointer hover:bg-accent active:scale-95 transition-transform"
                        onClick={() => handleSelectCategory(cat.id)}
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
          </MobileBottomSheetBody>
        </MobileBottomSheetContent>
      </MobileBottomSheet>
    </div>
  )
}
