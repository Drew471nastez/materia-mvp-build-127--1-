"use client"

import type React from "react"

import { useStoreBuilder } from "./store-builder-context"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ListChecks, Type, Megaphone, Grid, ImageIcon, Package, CheckCircle, X, Star, Users, ShoppingBag } from "lucide-react"
import { sectionLibrary, createSectionFromLibrary } from "@/lib/store-builder/defaults"
import type { SectionLibraryItem } from "@/lib/store-builder/types"
import { cn } from "@/lib/utils"

interface AddSectionModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const sectionIconsMap: Record<string, React.ReactNode> = {
  "image-text": <ImageIcon className="h-5 w-5" />,
  benefits: <ListChecks className="h-5 w-5" />,
  "text-block": <Type className="h-5 w-5" />,
  "announcement-bar": <Megaphone className="h-5 w-5" />,
  "featured-products": <Grid className="h-5 w-5" />,
  "more-from-seller": <Package className="h-5 w-5" />,
  reviews: <CheckCircle className="h-5 w-5" />,
}

export function AddSectionModal({ open, onOpenChange }: AddSectionModalProps) {
  const { draftConfig, addSection } = useStoreBuilder()

  const handleAddSection = (libraryItem: SectionLibraryItem) => {
    const newSection = createSectionFromLibrary(libraryItem, draftConfig.sections.length)
    addSection(newSection)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "p-0 gap-0 flex flex-col overflow-hidden rounded-2xl",
          // Mobile: near full screen
          "w-[calc(100vw-24px)] h-[85vh]",
          // Desktop: constrained size
          "sm:w-full sm:max-w-2xl sm:h-auto sm:max-h-[80vh]",
        )}
      >
        {/* Header - fixed */}
        <DialogHeader className="px-5 py-4 border-b border-border shrink-0 bg-background">
          <DialogTitle className="text-lg font-semibold">Add Section</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">Choose a section type to add to your page</DialogDescription>
        </DialogHeader>

        {/* Content - scrollable */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain bg-muted/30">
          <div className="p-4 sm:p-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Filter out featured-products (automatically added and locked) and reviews (product page only) */}
              {sectionLibrary
                .filter((item) => item.type !== "featured-products" && item.type !== "reviews")
                .map((item) => (
                <button
                  key={item.type}
                  onClick={() => handleAddSection(item)}
                  className="flex flex-col items-start rounded-xl border border-border bg-background p-3 text-left transition-all hover:border-purple-400 hover:shadow-md hover:scale-[1.02] group focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 cursor-pointer"
                >
                  {/* Section Preview */}
                  <div className="w-full aspect-[16/9] rounded-lg bg-muted mb-2.5 flex items-center justify-center overflow-hidden border border-border/50">
                    <RealSectionPreview type={item.type} />
                  </div>
                  {/* Section Info */}
                  <div className="flex items-center gap-2.5 w-full">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground group-hover:bg-purple-100 group-hover:text-purple-600 dark:group-hover:bg-purple-900 dark:group-hover:text-purple-400 shrink-0 transition-colors">
                      {sectionIconsMap[item.type]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm truncate">{item.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{item.description}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function RealSectionPreview({ type }: { type: string }) {
  switch (type) {
    case "image-text":
      return (
        <div className="w-full h-full p-2.5 flex gap-3 bg-gradient-to-br from-slate-50 to-white dark:from-slate-900 dark:to-slate-800">
          {/* Image side - more realistic with layered gradient */}
          <div className="flex-1 bg-gradient-to-br from-purple-100 via-blue-50 to-emerald-100 dark:from-purple-900/30 dark:via-blue-900/30 dark:to-emerald-900/30 rounded-lg flex items-center justify-center shadow-sm">
            <div className="w-8 h-8 rounded-lg bg-white/60 dark:bg-white/10 backdrop-blur-sm flex items-center justify-center">
              <ImageIcon className="h-4 w-4 text-slate-400" />
            </div>
          </div>
          {/* Text side - more realistic content structure */}
          <div className="flex-1 flex flex-col gap-1.5 justify-center py-1">
            <div className="h-2.5 bg-slate-800 dark:bg-white rounded-sm w-4/5" />
            <div className="space-y-1 mt-1">
              <div className="h-1.5 bg-slate-300 dark:bg-slate-600 rounded-sm w-full" />
              <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-sm w-5/6" />
              <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-sm w-3/4" />
            </div>
            <div className="h-5 bg-gradient-to-r from-purple-500 to-purple-600 rounded-md w-3/5 mt-2 shadow-sm" />
          </div>
        </div>
      )

    case "benefits":
      return (
        <div className="w-full h-full p-2.5 flex flex-col gap-2 bg-gradient-to-br from-slate-50 to-white dark:from-slate-900 dark:to-slate-800">
          <div className="h-2.5 bg-slate-800 dark:bg-white rounded-sm w-2/5 mx-auto" />
          <div className="flex-1 grid grid-cols-3 gap-2 mt-1">
            {[
              { color: "from-emerald-400 to-emerald-500", bg: "bg-emerald-100 dark:bg-emerald-900/40" },
              { color: "from-blue-400 to-blue-500", bg: "bg-blue-100 dark:bg-blue-900/40" },
              { color: "from-purple-400 to-purple-500", bg: "bg-purple-100 dark:bg-purple-900/40" },
            ].map((item, i) => (
              <div key={i} className="flex flex-col items-center gap-1 p-1">
                <div className={cn("w-6 h-6 rounded-full flex items-center justify-center shadow-sm", item.bg)}>
                  <CheckCircle className={cn("w-3.5 h-3.5 bg-gradient-to-br", item.color.replace("from-", "text-").split(" ")[0])} />
                </div>
                <div className="h-1.5 bg-slate-700 dark:bg-slate-200 rounded-sm w-full" />
                <div className="h-1 bg-slate-300 dark:bg-slate-600 rounded-sm w-4/5" />
              </div>
            ))}
          </div>
        </div>
      )

    case "text-block":
      return (
        <div className="w-full h-full p-3 flex flex-col gap-2 items-center justify-center bg-gradient-to-br from-slate-50 to-white dark:from-slate-900 dark:to-slate-800">
          <div className="h-2.5 bg-slate-800 dark:bg-white rounded-sm w-1/3" />
          <div className="space-y-1.5 w-full max-w-[85%]">
            <div className="h-1.5 bg-slate-300 dark:bg-slate-600 rounded-sm w-full mx-auto" />
            <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-sm w-11/12 mx-auto" />
            <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-sm w-full mx-auto" />
            <div className="h-1.5 bg-slate-300 dark:bg-slate-600 rounded-sm w-4/5 mx-auto" />
          </div>
        </div>
      )

    case "announcement-bar":
      return (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-50 to-white dark:from-slate-900 dark:to-slate-800 p-3">
          <div className="w-full h-7 bg-gradient-to-r from-slate-800 to-slate-900 dark:from-slate-200 dark:to-white rounded-md flex items-center justify-center gap-2 px-3 shadow-sm">
            <Megaphone className="h-3 w-3 text-white/70 dark:text-slate-800/70" />
            <div className="h-1.5 bg-white/80 dark:bg-slate-800/80 rounded-sm w-1/3" />
            <div className="h-1.5 bg-white/50 dark:bg-slate-800/50 rounded-sm w-1/5" />
            <X className="h-2.5 w-2.5 text-white/40 dark:text-slate-800/40 ml-auto" />
          </div>
        </div>
      )

    case "featured-products":
      return (
        <div className="w-full h-full p-2.5 flex flex-col gap-2 bg-gradient-to-br from-slate-50 to-white dark:from-slate-900 dark:to-slate-800">
          <div className="h-2.5 bg-slate-800 dark:bg-white rounded-sm w-1/3" />
          <div className="flex-1 grid grid-cols-3 gap-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white dark:bg-slate-800 rounded-lg flex flex-col overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm">
                <div className="flex-1 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-600 flex items-center justify-center">
                  <Package className="h-4 w-4 text-slate-400/60" />
                </div>
                <div className="p-1.5 space-y-1 bg-white dark:bg-slate-800">
                  <div className="h-1.5 bg-slate-600 dark:bg-slate-300 rounded-sm w-full" />
                  <div className="h-1.5 bg-emerald-500 rounded-sm w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )

    case "reviews":
      return (
        <div className="w-full h-full p-2.5 flex flex-col gap-2 bg-gradient-to-br from-slate-50 to-white dark:from-slate-900 dark:to-slate-800">
          <div className="flex items-center gap-2">
            <div className="h-2.5 bg-slate-800 dark:bg-white rounded-sm w-1/4" />
            <div className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map((i) => (
                <Star key={i} className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />
              ))}
            </div>
          </div>
          <div className="flex-1 space-y-1.5">
            {[1, 2].map((i) => (
              <div key={i} className="bg-white dark:bg-slate-800 rounded-lg p-2 border border-slate-200 dark:border-slate-700 shadow-sm">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <div className="w-4 h-4 rounded-full bg-gradient-to-br from-purple-400 to-purple-500" />
                  <div className="h-1.5 bg-slate-600 dark:bg-slate-300 rounded-sm w-1/4" />
                  <div className="flex gap-0.5 ml-auto">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star key={s} className="w-2 h-2 text-amber-400 fill-amber-400" />
                    ))}
                  </div>
                </div>
                <div className="h-1 bg-slate-300 dark:bg-slate-600 rounded-sm w-full" />
                <div className="h-1 bg-slate-200 dark:bg-slate-700 rounded-sm w-4/5 mt-0.5" />
              </div>
            ))}
          </div>
        </div>
      )

    case "more-from-seller":
      return (
        <div className="w-full h-full p-2.5 flex flex-col gap-2 bg-gradient-to-br from-slate-50 to-white dark:from-slate-900 dark:to-slate-800">
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 bg-slate-800 dark:bg-white rounded-sm w-1/4" />
            <div className="w-4 h-4 rounded-full bg-gradient-to-br from-blue-400 to-blue-500 shadow-sm" />
          </div>
          <div className="flex-1 grid grid-cols-4 gap-1.5">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white dark:bg-slate-800 rounded-md flex flex-col overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm">
                <div className="flex-1 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-600 flex items-center justify-center aspect-square">
                  <ShoppingBag className="h-3 w-3 text-slate-400/60" />
                </div>
                <div className="p-1 space-y-0.5">
                  <div className="h-1 bg-slate-600 dark:bg-slate-300 rounded-sm w-full" />
                  <div className="h-1 bg-emerald-500 rounded-sm w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )

    default:
      return <Package className="h-8 w-8 text-muted-foreground/30" />
  }
}
