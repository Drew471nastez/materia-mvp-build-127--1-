"use client"

import type React from "react"

import { useStoreBuilder } from "./store-builder-context"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ListChecks, Type, Megaphone, Grid, ImageIcon, Package, CheckCircle, X } from "lucide-react"
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
          "p-0 gap-0 flex flex-col overflow-hidden",
          // Mobile: near full screen
          "w-[95vw] h-[90vh]",
          // Desktop: constrained size
          "sm:w-full sm:max-w-2xl sm:h-auto sm:max-h-[85vh]",
        )}
      >
        {/* Header - fixed */}
        <DialogHeader className="px-4 sm:px-6 py-4 border-b border-border shrink-0">
          <DialogTitle>Add Section</DialogTitle>
          <DialogDescription>Choose a section type to add to your page</DialogDescription>
        </DialogHeader>

        {/* Content - scrollable */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          <div className="p-4 sm:p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              {sectionLibrary.map((item) => (
                <button
                  key={item.type}
                  onClick={() => handleAddSection(item)}
                  className="flex flex-col items-start rounded-lg border border-border p-3 sm:p-4 text-left transition-all hover:border-sky-500 hover:bg-sky-50 dark:hover:bg-sky-950/20 group focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
                >
                  {/* Section Preview */}
                  <div className="w-full aspect-[16/9] rounded-md bg-muted mb-3 flex items-center justify-center overflow-hidden border border-border/50">
                    <RealSectionPreview type={item.type} />
                  </div>
                  {/* Section Info */}
                  <div className="flex items-center gap-2 w-full">
                    <span className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground group-hover:bg-sky-100 group-hover:text-sky-600 dark:group-hover:bg-sky-900 dark:group-hover:text-sky-400 shrink-0 transition-colors">
                      {sectionIconsMap[item.type]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">{item.name}</p>
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

    default:
      return <Package className="h-8 w-8 text-muted-foreground/30" />
  }
}
