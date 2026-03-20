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
import {
  ListChecks,
  Type,
  Megaphone,
  Grid,
  ImageIcon,
  Package,
  Star,
  X,
  Check,
  ShoppingBag,
} from "lucide-react"
import { sectionLibrary, createSectionFromLibrary } from "@/lib/store-builder/defaults"
import type { SectionLibraryItem } from "@/lib/store-builder/types"
import { cn } from "@/lib/utils"

interface AddSectionModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const sectionIconsMap: Record<string, React.ReactNode> = {
  "image-text": <ImageIcon className="h-4 w-4" />,
  benefits: <ListChecks className="h-4 w-4" />,
  "text-block": <Type className="h-4 w-4" />,
  "announcement-bar": <Megaphone className="h-4 w-4" />,
  "featured-products": <Grid className="h-4 w-4" />,
  reviews: <Star className="h-4 w-4" />,
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
  const { draftConfig, addSection } = useStoreBuilder()
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
          className="p-0 rounded-t-[28px] overflow-hidden flex flex-col gap-0"
          style={{ height: "92dvh" }}
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-0 shrink-0">
            <div className="w-10 h-1.5 rounded-full bg-foreground/10" />
          </div>

          {/* Mobile header */}
          <div className="flex items-center justify-between px-5 pt-3 pb-3 shrink-0">
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

          {/* Right: 2-column grid */}
          <div className="flex-1 overflow-y-auto overscroll-contain p-5">
            <div className="grid grid-cols-2 gap-4">
              {filteredSections.map((item) => (
                <DesktopSectionCard
                  key={item.type}
                  item={item}
                  onAdd={handleAddSection}
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
// Desktop section card — preview on top, info below
// ────────────────────────────────────────────────────────────────────────────
function DesktopSectionCard({
  item,
  onAdd,
}: {
  item: SectionLibraryItem
  onAdd: (item: SectionLibraryItem) => void
}) {
  return (
    <button
      onClick={() => onAdd(item)}
      className={cn(
        "flex flex-col rounded-xl border border-border bg-background overflow-hidden text-left",
        "transition-all duration-200 ease-out will-change-transform",
        "hover:border-foreground/25 hover:shadow-lg hover:shadow-black/8 hover:-translate-y-0.5",
        "active:scale-[0.99] active:shadow-sm",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2",
        "group cursor-pointer"
      )}
    >
      {/* Preview thumbnail */}
      <div className="w-full aspect-[16/7] overflow-hidden border-b border-border/40 bg-[#f8f8f8] dark:bg-[#111]">
        <SectionPreview type={item.type} />
      </div>

      {/* Info row */}
      <div className="flex items-center gap-2.5 p-3">
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
            "bg-muted text-muted-foreground",
            "group-hover:bg-foreground/8 group-hover:text-foreground",
            "transition-colors duration-200"
          )}
        >
          {sectionIconsMap[item.type]}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm leading-tight text-foreground">{item.name}</p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{item.description}</p>
        </div>
      </div>
    </button>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Mobile section card — preview left, info right (landscape card)
// ────────────────────────────────────────────────────────────────────────────
function MobileSectionCard({
  item,
  onAdd,
}: {
  item: SectionLibraryItem
  onAdd: (item: SectionLibraryItem) => void
}) {
  return (
    <button
      onClick={() => onAdd(item)}
      className={cn(
        "flex flex-row items-stretch rounded-2xl border border-border bg-background overflow-hidden text-left",
        "transition-all duration-200 ease-out",
        "active:scale-[0.98] active:opacity-80",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
        "group cursor-pointer shadow-sm"
      )}
    >
      {/* Preview — fixed width thumbnail */}
      <div className="w-[136px] h-[86px] shrink-0 bg-[#f8f8f8] dark:bg-[#111] border-r border-border/40 overflow-hidden">
        <SectionPreview type={item.type} />
      </div>

      {/* Info */}
      <div className="flex-1 flex items-center gap-2.5 px-3.5 py-2.5">
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl",
            "bg-muted text-muted-foreground"
          )}
        >
          {sectionIconsMap[item.type]}
        </span>
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
// Section preview thumbnails
// These faithfully represent the actual layout of each section type as it
// appears in the store editor — same structure, proportions, and color cues.
// ────────────────────────────────────────────────────────────────────────────
export function SectionPreview({ type }: { type: string }) {
  switch (type) {
    case "image-text":
      return <ImageTextPreview />
    case "benefits":
      return <BenefitsPreview />
    case "text-block":
      return <TextBlockPreview />
    case "announcement-bar":
      return <AnnouncementBarPreview />
    case "featured-products":
      return <FeaturedProductsPreview />
    case "reviews":
      return <ReviewsPreview />
    default:
      return (
        <div className="w-full h-full flex items-center justify-center">
          <Package className="h-8 w-8 text-muted-foreground/20" />
        </div>
      )
  }
}

// ── Image + Text ─────────────────────────────────────────────────────────────
// Mirrors the actual layout: left image area | right headline + body + button
function ImageTextPreview() {
  return (
    <div className="w-full h-full flex items-stretch bg-white dark:bg-neutral-950">
      {/* Image block */}
      <div className="w-[42%] relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-neutral-100 via-neutral-150 to-neutral-200 dark:from-neutral-800 dark:to-neutral-700" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-8 h-8 rounded-lg bg-white/50 dark:bg-black/30 backdrop-blur-sm flex items-center justify-center">
            <ImageIcon className="h-4 w-4 text-neutral-400 dark:text-neutral-500" />
          </div>
        </div>
      </div>

      {/* Text block */}
      <div className="flex-1 flex flex-col justify-center px-3 py-3 gap-1.5">
        {/* Headline */}
        <div className="h-2.5 bg-neutral-900 dark:bg-white rounded-full w-4/5" />
        {/* Body copy lines */}
        <div className="space-y-1 mt-0.5">
          <div className="h-1.5 bg-neutral-300 dark:bg-neutral-600 rounded-full w-full" />
          <div className="h-1.5 bg-neutral-200 dark:bg-neutral-700 rounded-full w-[90%]" />
          <div className="h-1.5 bg-neutral-200 dark:bg-neutral-700 rounded-full w-3/4" />
        </div>
        {/* CTA button */}
        <div
          className="h-5 rounded-md mt-2 w-2/5"
          style={{ backgroundColor: "#2563eb" }}
        />
      </div>
    </div>
  )
}

// ── Benefits ─────────────────────────────────────────────────────────────────
// Centered heading + 3-column grid of icon / title / description
function BenefitsPreview() {
  const items = [
    { bg: "#dcfce7", color: "#16a34a" },
    { bg: "#dbeafe", color: "#2563eb" },
    { bg: "#ede9fe", color: "#7c3aed" },
  ]
  return (
    <div className="w-full h-full flex flex-col items-center bg-white dark:bg-neutral-950 px-3 py-2.5">
      {/* Section heading */}
      <div className="h-2 bg-neutral-800 dark:bg-white rounded-full w-[38%] mb-2.5" />

      {/* 3-column grid */}
      <div className="flex-1 flex items-start justify-center gap-2.5 w-full">
        {items.map((item, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center"
              style={{ backgroundColor: item.bg }}
            >
              <Check className="w-3.5 h-3.5" style={{ color: item.color }} />
            </div>
            {/* Item title */}
            <div className="h-1.5 bg-neutral-700 dark:bg-neutral-300 rounded-full w-full" />
            {/* Item description lines */}
            <div className="h-1 bg-neutral-300 dark:bg-neutral-600 rounded-full w-[85%]" />
            <div className="h-1 bg-neutral-200 dark:bg-neutral-700 rounded-full w-[70%]" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Text Block ────────────────────────────────────────────────────────────────
// Centered heading + body paragraph lines
function TextBlockPreview() {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-white dark:bg-neutral-950 px-4 py-3 gap-1.5">
      {/* Heading */}
      <div className="h-2.5 bg-neutral-900 dark:bg-white rounded-full w-[40%]" />
      {/* Thin accent line */}
      <div className="w-8 h-px bg-neutral-300 dark:bg-neutral-600 my-0.5" />
      {/* Body lines */}
      <div className="space-y-1.5 w-full max-w-[82%]">
        <div className="h-1.5 bg-neutral-300 dark:bg-neutral-600 rounded-full w-full" />
        <div className="h-1.5 bg-neutral-200 dark:bg-neutral-700 rounded-full w-[92%]" />
        <div className="h-1.5 bg-neutral-200 dark:bg-neutral-700 rounded-full w-full" />
        <div className="h-1.5 bg-neutral-300 dark:bg-neutral-600 rounded-full w-[80%]" />
      </div>
    </div>
  )
}

// ── Announcement Bar ──────────────────────────────────────────────────────────
// Full-width dark banner with centered text — matches the actual renderer exactly
function AnnouncementBarPreview() {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-[#f5f5f5] dark:bg-[#111] px-3 gap-1.5">
      {/* The bar itself */}
      <div className="w-full bg-neutral-900 dark:bg-neutral-100 rounded-md flex items-center px-3 py-2.5 gap-2">
        <Megaphone className="h-3 w-3 text-white/70 dark:text-neutral-600 shrink-0" />
        <div className="flex-1">
          <div className="h-1.5 bg-white/80 dark:bg-neutral-700 rounded-full w-3/5" />
        </div>
        <X className="h-2.5 w-2.5 text-white/30 dark:text-neutral-500 shrink-0" />
      </div>
      <span className="text-[9px] font-medium text-neutral-400 dark:text-neutral-500 tracking-wide uppercase">
        Full-width banner
      </span>
    </div>
  )
}

// ── Featured Products ─────────────────────────────────────────────────────────
// Section heading + row of 3 product cards (image + title + price)
function FeaturedProductsPreview() {
  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-neutral-950 px-3 py-2.5">
      {/* Section heading */}
      <div className="h-2 bg-neutral-800 dark:bg-white rounded-full w-[32%] mb-2.5" />

      {/* Product cards row */}
      <div className="flex-1 grid grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="flex flex-col bg-white dark:bg-neutral-900 rounded-lg overflow-hidden border border-neutral-100 dark:border-neutral-800 shadow-sm"
          >
            {/* Product image area */}
            <div className="flex-1 bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center">
              <ShoppingBag className="h-3 w-3 text-neutral-400 dark:text-neutral-500" />
            </div>
            {/* Product info */}
            <div className="px-1.5 py-1.5 space-y-1">
              <div className="h-1 bg-neutral-600 dark:bg-neutral-300 rounded-full w-full" />
              <div className="h-1.5 bg-emerald-500/80 rounded-full w-[55%]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Reviews ───────────────────────────────────────────────────────────────────
// Heading + overall rating + 2 review cards with avatar / stars / text
function ReviewsPreview() {
  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-neutral-950 px-3 py-2.5 gap-1.5">
      {/* Header row: title + stars + count */}
      <div className="flex items-center gap-1.5 shrink-0">
        <div className="h-2 bg-neutral-800 dark:bg-white rounded-full w-[22%]" />
        <div className="flex gap-0.5">
          {[0, 1, 2, 3, 4].map((s) => (
            <Star key={s} className="w-2 h-2 fill-amber-400 text-amber-400" />
          ))}
        </div>
        <div className="h-1.5 bg-neutral-300 dark:bg-neutral-600 rounded-full w-8 ml-0.5" />
      </div>

      {/* Review cards */}
      <div className="flex flex-col gap-1.5 flex-1">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="bg-neutral-50 dark:bg-neutral-900 rounded-lg p-2 border border-neutral-100 dark:border-neutral-800"
          >
            {/* Reviewer row */}
            <div className="flex items-center gap-1.5 mb-1">
              <div
                className="w-4 h-4 rounded-full shrink-0 bg-gradient-to-br from-violet-400 to-violet-600"
              />
              <div className="h-1.5 bg-neutral-600 dark:bg-neutral-300 rounded-full w-1/4" />
              <div className="flex gap-0.5 ml-auto">
                {[0, 1, 2, 3, 4].map((s) => (
                  <Star key={s} className="w-1.5 h-1.5 fill-amber-400 text-amber-400" />
                ))}
              </div>
            </div>
            {/* Review text lines */}
            <div className="space-y-0.5">
              <div className="h-1 bg-neutral-300 dark:bg-neutral-600 rounded-full w-full" />
              <div className="h-1 bg-neutral-200 dark:bg-neutral-700 rounded-full w-[85%]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
