"use client"

import type React from "react"
import { useState, useEffect } from "react"

import { useStoreBuilder } from "./store-builder-context"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { X } from "lucide-react"
import { sectionLibrary, createSectionFromLibrary } from "@/lib/store-builder/defaults"
import type { SectionLibraryItem, SectionSettings, Section } from "@/lib/store-builder/types"
import { cn } from "@/lib/utils"
import { UnifiedSectionRenderer } from "./unified-section-renderer"

interface AddSectionModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const SECTION_CATEGORIES = [
  { key: "all", label: "All" },
  { key: "image-text", label: "Image + Text" },
  { key: "content", label: "Content" },
  { key: "marketing", label: "Marketing" },
  { key: "commerce", label: "Products" },
  { key: "info", label: "Information" },
]

const CATEGORY_FILTER: Record<string, string[]> = {
  "image-text": ["image-text"],
  content: ["text-block", "benefits"],
  marketing: ["announcement-bar"],
  commerce: ["featured-products"],
  info: ["reviews"],
}

export function AddSectionModal({ open, onOpenChange }: AddSectionModalProps) {
  const { draftConfig, addSection, products } = useStoreBuilder()
  const [activeCategory, setActiveCategory] = useState("all")
  const [isMobileLayout, setIsMobileLayout] = useState(false)

  useEffect(() => {
    const check = () => setIsMobileLayout(window.innerWidth < 640)
    check()
    window.addEventListener("resize", check)
    return () => window.removeEventListener("resize", check)
  }, [])

  // Reset category when modal opens
  useEffect(() => {
    if (open) setActiveCategory("all")
  }, [open])

  const handleAddSection = (libraryItem: SectionLibraryItem) => {
    const newSection = createSectionFromLibrary(libraryItem, draftConfig.sections.length)
    addSection(newSection)
    onOpenChange(false)
  }

  const filteredSections =
    activeCategory === "all"
      ? sectionLibrary
      : sectionLibrary.filter((item) => CATEGORY_FILTER[activeCategory]?.includes(item.type))

  // ── Mobile: bottom sheet ──────────────────────────────────────────────────
  if (isMobileLayout) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          hideCloseButton
          enableDragToClose
          onDragClose={() => onOpenChange(false)}
          className="p-0 rounded-t-[28px] overflow-hidden flex flex-col gap-0"
          style={{ height: "74dvh" }}
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-0 shrink-0" data-drag-handle="true">
            <div className="w-10 h-1.5 rounded-full bg-foreground/10" />
          </div>

          {/* Mobile header */}
          <div className="flex items-center justify-between px-5 pt-3 pb-3 shrink-0" data-drag-handle="true">
            <div>
              <h2 className="text-base font-semibold text-foreground">Add Section</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Choose a section type
              </p>
            </div>
            <button
              onClick={() => onOpenChange(false)}
              className="h-8 w-8 flex items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-muted/80 active:scale-95 transition-all"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Horizontal category pills */}
          <div className="shrink-0 px-4 pb-3 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <div className="flex gap-2 w-max">
              {SECTION_CATEGORIES.map((cat) => (
                <button
                  key={cat.key}
                  onClick={() => setActiveCategory(cat.key)}
                  className={cn(
                    "px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-200",
                    activeCategory === cat.key
                      ? "bg-foreground text-background shadow-sm"
                      : "bg-muted text-muted-foreground hover:bg-muted/70 active:scale-95"
                  )}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          <div className="w-full h-px bg-border/60 shrink-0" />

          {/* Section list — single column */}
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pt-3 pb-8">
            <div className="flex flex-col gap-3">
              {filteredSections.map((item) => (
                <MobileSectionCard
                  key={item.type}
                  item={item}
                  onAdd={handleAddSection}
                  products={products}
                />
              ))}
            </div>
            {filteredSections.length === 0 && (
              <div className="py-16 text-center text-muted-foreground">
                <p className="text-sm">No sections in this category</p>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    )
  }

  // ── Desktop: centered modal ───────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "p-0 gap-0 flex flex-col overflow-hidden rounded-2xl",
          "w-full max-w-4xl",
          "max-h-[82vh]"
        )}
      >
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b border-border shrink-0">
          <DialogTitle className="text-lg font-semibold">Add New Section</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Choose a section type to add to your page
          </DialogDescription>
        </DialogHeader>

        {/* Body: sidebar + grid */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left categories sidebar */}
          <nav className="w-[180px] border-r border-border shrink-0 overflow-y-auto py-2 bg-muted/20">
            {SECTION_CATEGORIES.map((cat) => (
              <button
                key={cat.key}
                onClick={() => setActiveCategory(cat.key)}
                className={cn(
                  "w-full text-left px-4 py-2.5 text-sm font-medium transition-all relative",
                  activeCategory === cat.key
                    ? "text-foreground bg-background border-l-2 border-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-background/60"
                )}
              >
                {cat.label}
              </button>
            ))}
          </nav>

          {/* Right: single-column list */}
          <div className="flex-1 overflow-y-auto overscroll-contain p-5">
            <div className="flex flex-col gap-3">
              {filteredSections.map((item) => (
                <DesktopSectionCard
                  key={item.type}
                  item={item}
                  onAdd={handleAddSection}
                  products={products}
                />
              ))}
            </div>
            {filteredSections.length === 0 && (
              <div className="py-16 text-center text-muted-foreground">
                <p className="text-sm">No sections in this category</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Desktop section card — preview on left, info on right
// ────────────────────────────────────────────────────────────────────────────
function DesktopSectionCard({
  item,
  onAdd,
  products,
}: {
  item: SectionLibraryItem
  onAdd: (item: SectionLibraryItem) => void
  products: Array<{ id: string; title: string; thumbnail_url?: string }>
}) {
  return (
    <button
      onClick={() => onAdd(item)}
      className={cn(
        "flex flex-row items-stretch w-full rounded-xl border border-border bg-background overflow-hidden text-left",
        "transition-all duration-200 ease-out will-change-transform",
        "hover:border-foreground/25 hover:shadow-lg hover:shadow-black/8 hover:-translate-y-0.5",
        "active:scale-[0.99] active:shadow-sm",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2",
        "group cursor-pointer"
      )}
    >
      {/* Preview thumbnail — landscape left panel */}
      <div className="w-[280px] shrink-0 h-[140px] overflow-hidden border-r border-border/40 bg-muted/10 relative">
        <SectionPreview type={item.type} settings={item.defaultSettings} containerWidth={280} products={products} />
        {/* Bottom fade gradient */}
        <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-background/80 to-transparent pointer-events-none" />
      </div>

      {/* Info — right panel */}
      <div className="flex items-center px-4 py-3 flex-1 min-w-0">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm leading-tight text-foreground">{item.name}</p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">{item.description}</p>
        </div>
      </div>
    </button>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Mobile section card — preview top, info below
// ────────────────────────────────────────────────────────────────────────────
function MobileSectionCard({
  item,
  onAdd,
  products,
}: {
  item: SectionLibraryItem
  onAdd: (item: SectionLibraryItem) => void
  products: Array<{ id: string; title: string; thumbnail_url?: string }>
}) {
  return (
    <button
      onClick={() => onAdd(item)}
      className={cn(
        "flex flex-col w-full rounded-2xl border border-border bg-background overflow-hidden text-left",
        "transition-all duration-200 ease-out",
        "active:scale-[0.98] active:opacity-80",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
        "group cursor-pointer shadow-sm"
      )}
    >
      {/* Preview — full width top */}
      <div className="w-full h-[140px] bg-muted/10 border-b border-border/40 overflow-hidden relative">
        <SectionPreview type={item.type} settings={item.defaultSettings} containerWidth={340} products={products} />
        {/* Bottom fade so clipping looks intentional */}
        <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-background/90 to-transparent pointer-events-none" />
      </div>

      {/* Info */}
      <div className="flex items-center px-3.5 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm leading-tight text-foreground">{item.name}</p>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
            {item.description}
          </p>
        </div>
      </div>
    </button>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Products placeholder preview — rendered inline without needing real product data
// Shows a 2×2 grid of product cards with real thumbnails or gray placeholders
// ────────────────────────────────────────────────────────────────────────────
function ProductsPlaceholderPreview({
  containerWidth = 220,
  products = [],
}: {
  containerWidth?: number
  products?: Array<{ id: string; title: string; thumbnail_url?: string }>
}) {
  const RENDER_WIDTH = 700
  const scale = containerWidth / RENDER_WIDTH
  const hasProducts = products.length > 0
  const displayItems = hasProducts ? products.slice(0, 4) : [0, 1, 2, 3]

  return (
    <div
      style={{
        width: RENDER_WIDTH,
        transformOrigin: "top left",
        transform: `scale(${scale})`,
        pointerEvents: "none",
        userSelect: "none",
        padding: "44px 28px 28px",
      }}
    >
      {/* Section headline bar */}
      <div
        style={{
          height: 28,
          width: 210,
          background: "rgba(0,0,0,0.12)",
          borderRadius: 7,
          marginBottom: 32,
        }}
      />

      {/* 2×2 product grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 20,
        }}
      >
        {[0, 1, 2, 3].map((i) => {
          const product = hasProducts ? (products[i] ?? null) : null
          return (
            <div key={i}>
              {/* Product image */}
              <div
                style={{
                  width: "100%",
                  paddingBottom: "100%",
                  position: "relative",
                  borderRadius: 12,
                  overflow: "hidden",
                  marginBottom: 12,
                  background: product?.thumbnail_url ? undefined : "#f0f0f0",
                }}
              >
                {product?.thumbnail_url ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={product.thumbnail_url}
                    alt=""
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: i % 2 === 0 ? "#e8e8e8" : "#ebebeb",
                    }}
                  />
                )}
              </div>
              {/* Title line */}
              <div
                style={{
                  height: 16,
                  width: product ? "80%" : `${60 + (i % 3) * 10}%`,
                  background: "#d4d4d4",
                  borderRadius: 5,
                  marginBottom: 8,
                }}
              />
              {/* Price line */}
              <div
                style={{
                  height: 14,
                  width: "42%",
                  background: "#e8e8e8",
                  borderRadius: 5,
                }}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Section preview thumbnails
// Renders the actual UnifiedSectionRenderer scaled down to thumbnail size so the
// preview is a pixel-perfect match of what the section looks like on the canvas.
// For featured-products, renders a dedicated placeholder that doesn't need real data.
// ────────────────────────────────────────────────────────────────────────────
export function SectionPreview({
  type,
  settings,
  containerWidth = 220,
  products = [],
}: {
  type: string
  settings: SectionSettings
  containerWidth?: number
  products?: Array<{ id: string; title: string; thumbnail_url?: string }>
}) {
  // Products section needs special handling — full renderer returns null with no products
  if (type === "featured-products") {
    return <ProductsPlaceholderPreview containerWidth={containerWidth} products={products} />
  }

  const RENDER_WIDTH = 700
  const scale = containerWidth / RENDER_WIDTH

  const section: Section = {
    id: "preview",
    type: type as Section["type"],
    settings: { ...settings, visible: true },
    order: 0,
    locked: false,
  }

  return (
    <div
      style={{
        width: RENDER_WIDTH,
        transformOrigin: "top left",
        transform: `scale(${scale})`,
        pointerEvents: "none",
        userSelect: "none",
      }}
    >
      <UnifiedSectionRenderer
        section={section}
        isPreviewMode={true}
        isMobile={false}
        products={[]}
      />
    </div>
  )
}
