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
              {sectionLibrary.map((item) => (
                <button
                  key={item.type}
                  onClick={() => handleAddSection(item)}
                  className="flex flex-col items-start rounded-xl border border-border bg-background p-3 text-left transition-all hover:border-purple-400 hover:shadow-md hover:scale-[1.02] group focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
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
        <div className="w-full h-full p-2 flex gap-2 bg-background scale-[0.9] origin-center">
          {/* Image side */}
          <div className="flex-1 bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-800 rounded flex items-center justify-center">
            <ImageIcon className="h-4 w-4 text-muted-foreground/50" />
          </div>
          {/* Text side */}
          <div className="flex-1 flex flex-col gap-1 justify-center py-1">
            <div className="h-2 bg-foreground/80 rounded w-3/4" />
            <div className="h-1 bg-muted-foreground/30 rounded w-full" />
            <div className="h-1 bg-muted-foreground/30 rounded w-5/6" />
            <div className="h-1 bg-muted-foreground/30 rounded w-4/6" />
            <div className="h-4 bg-primary rounded w-1/2 mt-1.5" />
          </div>
        </div>
      )

    case "benefits":
      return (
        <div className="w-full h-full p-2 flex flex-col gap-1.5 bg-background scale-[0.9] origin-center">
          <div className="h-2 bg-foreground/80 rounded w-1/3 mx-auto" />
          <div className="flex-1 grid grid-cols-3 gap-1.5 mt-1">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex flex-col items-center gap-0.5 p-1">
                <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center">
                  <CheckCircle className="w-3 h-3 text-primary/60" />
                </div>
                <div className="h-1.5 bg-foreground/60 rounded w-full" />
                <div className="h-1 bg-muted-foreground/30 rounded w-4/5" />
              </div>
            ))}
          </div>
        </div>
      )

    case "text-block":
      return (
        <div className="w-full h-full p-3 flex flex-col gap-1.5 items-center justify-center bg-background scale-[0.9] origin-center">
          <div className="h-2 bg-foreground/80 rounded w-2/5" />
          <div className="h-1 bg-muted-foreground/40 rounded w-4/5" />
          <div className="h-1 bg-muted-foreground/40 rounded w-3/4" />
          <div className="h-1 bg-muted-foreground/40 rounded w-4/5" />
          <div className="h-1 bg-muted-foreground/40 rounded w-2/3" />
        </div>
      )

    case "announcement-bar":
      return (
        <div className="w-full h-full flex items-center justify-center bg-background scale-[0.9] origin-center">
          <div className="w-full h-6 bg-foreground flex items-center justify-center gap-1.5 px-2">
            <div className="h-1 bg-background/80 rounded w-1/4" />
            <div className="h-1 bg-background/60 rounded w-1/6 underline" />
            <X className="h-2 w-2 text-background/50 ml-auto" />
          </div>
        </div>
      )

    case "featured-products":
      return (
        <div className="w-full h-full p-2 flex flex-col gap-1.5 bg-background scale-[0.9] origin-center">
          <div className="h-2 bg-foreground/80 rounded w-1/3" />
          <div className="flex-1 grid grid-cols-3 gap-1.5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-muted rounded flex flex-col overflow-hidden border border-border/50">
                <div className="flex-1 bg-gradient-to-br from-slate-200/50 to-slate-300/50 dark:from-slate-700/50 dark:to-slate-800/50 flex items-center justify-center">
                  <Package className="h-3 w-3 text-muted-foreground/30" />
                </div>
                <div className="p-1 space-y-0.5">
                  <div className="h-1 bg-foreground/60 rounded w-full" />
                  <div className="h-1 bg-primary/60 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )

    case "reviews":
      return (
        <div className="w-full h-full p-2 flex flex-col gap-1.5 bg-background scale-[0.9] origin-center">
          <div className="flex items-center gap-1.5">
            <div className="h-2 bg-foreground/80 rounded w-1/4" />
            <div className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map((i) => (
                <Star key={i} className="w-2 h-2 text-yellow-400 fill-yellow-400" />
              ))}
            </div>
          </div>
          <div className="flex-1 space-y-1.5">
            {[1, 2].map((i) => (
              <div key={i} className="bg-muted rounded p-1.5 border border-border/50">
                <div className="flex items-center gap-1 mb-1">
                  <div className="w-3 h-3 rounded-full bg-slate-300 dark:bg-slate-600" />
                  <div className="h-1 bg-foreground/60 rounded w-1/4" />
                  <div className="flex gap-0.5 ml-auto">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star key={s} className="w-1.5 h-1.5 text-yellow-400 fill-yellow-400" />
                    ))}
                  </div>
                </div>
                <div className="h-1 bg-muted-foreground/30 rounded w-full" />
                <div className="h-1 bg-muted-foreground/30 rounded w-3/4 mt-0.5" />
              </div>
            ))}
          </div>
        </div>
      )

    case "more-from-seller":
      return (
        <div className="w-full h-full p-2 flex flex-col gap-1.5 bg-background scale-[0.9] origin-center">
          <div className="flex items-center gap-1">
            <div className="h-2 bg-foreground/80 rounded w-1/4" />
            <div className="w-3 h-3 rounded-full bg-slate-300 dark:bg-slate-600" />
          </div>
          <div className="flex-1 grid grid-cols-4 gap-1">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-muted rounded flex flex-col overflow-hidden border border-border/50">
                <div className="flex-1 bg-gradient-to-br from-slate-200/50 to-slate-300/50 dark:from-slate-700/50 dark:to-slate-800/50 flex items-center justify-center aspect-square">
                  <ShoppingBag className="h-2.5 w-2.5 text-muted-foreground/30" />
                </div>
                <div className="p-0.5 space-y-0.5">
                  <div className="h-0.5 bg-foreground/60 rounded w-full" />
                  <div className="h-0.5 bg-primary/60 rounded w-1/2" />
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
