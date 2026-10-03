"use client"

import type React from "react"
import { useState, useEffect, useRef } from "react"

import { useStoreBuilder } from "./store-builder-context"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { X } from "lucide-react"
import { sectionLibrary, createSectionFromLibrary } from "@/lib/store-builder/defaults"
import type { SectionLibraryItem, SectionSettings, Section } from "@/lib/store-builder/types"
import { cn } from "@/lib/utils"
import { UnifiedSectionRenderer } from "./unified-section-renderer"
import { useCommunitiesEnabled } from "@/lib/platform/use-flags"
import { CommunitySectionSample } from "./community-section"

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
  { key: "community", label: "Community" },
]

const CATEGORY_FILTER: Record<string, string[]> = {
  "image-text": ["image-text"],
  content: ["text-block", "benefits"],
  marketing: ["announcement-bar"],
  commerce: ["featured-products"],
  info: ["reviews"],
  community: ["community"],
}

export function AddSectionModal({ open, onOpenChange }: AddSectionModalProps) {
  const { draftConfig, addSection, products } = useStoreBuilder()
  const [activeCategory, setActiveCategory] = useState("all")
  const [isMobileLayout, setIsMobileLayout] = useState(false)
  /*
    THE COMMUNITY SECTION IS OFFERED ONLY WHERE IT CAN DRAW: on the shop page
    (a product page is about the product), and only while communities are on
    across Storelib. Off, the category goes too, rather than an empty one.
  */
  const communitiesOn = useCommunitiesEnabled()
  const offersCommunity = communitiesOn && draftConfig.pageType === "shop"
  const library = offersCommunity ? sectionLibrary : sectionLibrary.filter((item) => item.type !== "community")
  const categories = offersCommunity ? SECTION_CATEGORIES : SECTION_CATEGORIES.filter((c) => c.key !== "community")

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
      ? library
      : library.filter((item) => CATEGORY_FILTER[activeCategory]?.includes(item.type))

  // ── Mobile: bottom sheet ──────────────────────────────────────────────────
  /*
    THE SHARED SHEET (components/ui/bottom-sheet.tsx), so Add Section rises,
    follows the thumb, flicks closed and slides out like every sheet in /app.
    It was Radix's side sheet with a drag of its own that only listened on
    the top rows. The title row drags it like the grabber; the list scrolls,
    and a pull down from its top closes the sheet.
  */
  if (isMobileLayout) {
    return (
      <BottomSheet
        isOpen={open}
        onClose={() => onOpenChange(false)}
        label="Add Section"
        hideFrom={null}
        fill
        height="80dvh"
        maxHeight="80dvh"
        header={
          <div className="flex items-center justify-between px-5 pt-3 pb-3">
            <div>
              <h2 className="text-base font-semibold text-foreground">Add Section</h2>
            </div>
            <button
              type="button"
              /* The sheet closes itself, then the editor hears (A BUTTON INSIDE CAN CLOSE IT). */
              data-sheet-close=""
              aria-label="Close"
              className="h-8 w-8 flex items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-muted/80 active:scale-95 transition-all"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        }
      >
        {/* Horizontal category pills */}
        <div className="shrink-0 px-4 pb-3 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <div className="flex gap-2 w-max">
            {categories.map((cat) => (
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
      </BottomSheet>
    )
  }

  // ── Desktop: centered modal ───────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "p-0 gap-0 flex flex-col overflow-hidden rounded-2xl",
          "w-[min(735px,calc(100vw-2rem))] !max-w-[calc(100vw-2rem)]",
          "max-h-[88vh]"
        )}
      >
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b border-border shrink-0">
          <DialogTitle className="text-lg font-semibold">Add New Section</DialogTitle>
          <p className="text-sm text-muted-foreground">Choose a section type to add to your page</p>
        </DialogHeader>

        {/* Body: sidebar + grid */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left categories sidebar */}
          <nav className="w-[150px] sm:w-[180px] border-r border-border shrink-0 overflow-y-auto py-2 bg-muted/20">
            {categories.map((cat) => (
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

          {/* Right: 1-column grid */}
          <div className="flex-1 overflow-y-auto overscroll-contain p-5">
            <div className="grid grid-cols-1 gap-4">
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
// Desktop section card — title above, full-width preview below, no description
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
  const containerRef = useRef<HTMLDivElement>(null)
  const [measuredWidth, setMeasuredWidth] = useState(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setMeasuredWidth(entry.contentRect.width)
      }
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  return (
    <button
      onClick={() => onAdd(item)}
      className={cn(
        "flex flex-col w-full rounded-xl border border-border bg-background overflow-hidden text-left",
        "transition-all duration-200 ease-out will-change-transform",
        "hover:border-foreground/25 hover:shadow-lg hover:shadow-black/8 hover:-translate-y-0.5",
        "active:scale-[0.99] active:shadow-sm",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2",
        "group cursor-pointer"
      )}
    >
      {/* Title above the preview */}
      <div className="px-4 pt-3 pb-2.5 shrink-0">
        <p className="font-semibold text-sm leading-tight text-foreground">{item.name}</p>
      </div>

      {/* Full-width section preview — shows the complete section */}
      <div ref={containerRef} className="w-full border-t border-border/40 bg-muted/10 overflow-hidden relative">
        {measuredWidth > 0 && (
          <SectionPreview
            type={item.type}
            settings={item.defaultSettings}
            containerWidth={measuredWidth}
            products={products}
          />
        )}
      </div>
    </button>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Mobile section card — title above, full-width preview below, no description
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
  const containerRef = useRef<HTMLDivElement>(null)
  const [measuredWidth, setMeasuredWidth] = useState(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setMeasuredWidth(entry.contentRect.width)
      }
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

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
      {/* Title above the preview */}
      <div className="px-4 pt-3 pb-2.5 shrink-0">
        <p className="font-semibold text-sm leading-tight text-foreground">{item.name}</p>
      </div>

      {/* Full-width section preview */}
      <div ref={containerRef} className="w-full border-t border-border/40 bg-muted/10 overflow-hidden relative">
        {measuredWidth > 0 && (
          <SectionPreview
            type={item.type}
            settings={item.defaultSettings}
            containerWidth={measuredWidth}
            products={products}
          />
        )}
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

  return (
    <div
      style={{
        width: RENDER_WIDTH,
        zoom: scale,
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
// Uses CSS zoom to scale the section so it shows completely without clipping.
// zoom affects layout (unlike transform: scale), so the section height is
// naturally correct and the full section is visible.
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

  /* The community section draws from a real community the creator has not picked yet, so the modal shows its layout. */
  if (type === "community") {
    return (
      <div style={{ width: 700, zoom: containerWidth / 700, pointerEvents: "none", userSelect: "none" }}>
        <CommunitySectionSample />
      </div>
    )
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

  // Announcement bar: render centered in the preview area
  if (type === "announcement-bar") {
    return (
      <div
        style={{
          width: RENDER_WIDTH,
          zoom: scale,
          pointerEvents: "none",
          userSelect: "none",
          /* A preview is a picture of the section: whatever it fixes or
             lifts stays in this box (see .wb-canvas-frame in globals.css). */
          contain: "layout paint",
          isolation: "isolate",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 80,
        }}
      >
        <div style={{ width: "100%" }}>
          <UnifiedSectionRenderer
            section={section}
            isPreviewMode={true}
            isMobile={false}
            products={[]}
          />
        </div>
      </div>
    )
  }

  // All other sections: zoom scales both width and height so the full
  // section is visible without any clipping.
  return (
    <div
      style={{
        width: RENDER_WIDTH,
        zoom: scale,
        pointerEvents: "none",
        userSelect: "none",
        contain: "layout paint",
        isolation: "isolate",
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
