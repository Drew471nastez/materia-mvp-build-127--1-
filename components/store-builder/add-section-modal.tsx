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
  CheckCircle,
  Zap,
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

          {/* Right: single-column list */}
          <div className="flex-1 overflow-y-auto overscroll-contain p-5">
            <div className="flex flex-col gap-3">
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
        "flex flex-row items-stretch w-full rounded-xl border border-border bg-background overflow-hidden text-left",
        "transition-all duration-200 ease-out will-change-transform",
        "hover:border-foreground/25 hover:shadow-lg hover:shadow-black/8 hover:-translate-y-0.5",
        "active:scale-[0.99] active:shadow-sm",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2",
        "group cursor-pointer"
      )}
    >
      {/* Preview thumbnail — landscape left panel */}
      <div className="w-[220px] shrink-0 h-[110px] overflow-hidden border-r border-border/40 bg-[#f8f8f8] dark:bg-[#111]">
        <SectionPreview type={item.type} />
      </div>

      {/* Info — right panel */}
      <div className="flex items-center gap-3 px-4 py-3 flex-1 min-w-0">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
            "bg-muted text-muted-foreground",
            "group-hover:bg-foreground/8 group-hover:text-foreground",
            "transition-colors duration-200"
          )}
        >
          {sectionIconsMap[item.type]}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm leading-tight text-foreground">{item.name}</p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">{item.description}</p>
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
// Each preview is a faithful pixel-scaled replica of the actual section layout —
// same structure, proportions, visual hierarchy, and color palette as the real
// rendered section, scaled to fit the thumbnail frame.
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
// Mirrors the actual section: left image (aspect-video, rounded-lg) | right text column
// with headline, body paragraph lines, and a CTA button.
function ImageTextPreview() {
  return (
    <div className="w-full h-full flex items-center bg-white dark:bg-neutral-950 px-3 py-2.5 gap-3">
      {/* Image block — aspect-video, rounded-lg */}
      <div className="shrink-0 w-[44%] h-[72px] rounded-md overflow-hidden relative bg-gradient-to-br from-slate-100 via-slate-150 to-slate-200 dark:from-neutral-800 dark:to-neutral-700 flex items-center justify-center">
        {/* Subtle landscape illustration */}
        <div className="absolute inset-0 opacity-30" style={{
          background: "linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 40%, #94a3b8 100%)"
        }} />
        <div className="relative z-10 flex flex-col items-center gap-0.5">
          <div className="w-8 h-5 rounded bg-white/60 dark:bg-black/30 flex items-center justify-center">
            <ImageIcon className="h-3 w-3 text-slate-400" />
          </div>
        </div>
      </div>

      {/* Text column */}
      <div className="flex-1 flex flex-col justify-center gap-1.5 min-w-0">
        {/* Headline — bold, dark */}
        <div className="h-2.5 rounded-full bg-neutral-900 dark:bg-white w-[88%]" />
        {/* Sub-headline or second line */}
        <div className="h-2 rounded-full bg-neutral-700 dark:bg-neutral-200 w-[65%]" />
        {/* Body paragraph lines */}
        <div className="flex flex-col gap-[3px] mt-0.5">
          <div className="h-1.5 rounded-full bg-neutral-300 dark:bg-neutral-600 w-full" />
          <div className="h-1.5 rounded-full bg-neutral-250 dark:bg-neutral-650 w-[92%]" />
          <div className="h-1.5 rounded-full bg-neutral-200 dark:bg-neutral-700 w-[78%]" />
        </div>
        {/* CTA button */}
        <div
          className="mt-1 h-[18px] rounded-md w-[42%]"
          style={{ backgroundColor: "#2563eb" }}
        />
      </div>
    </div>
  )
}

// ── Benefits ─────────────────────────────────────────────────────────────────
// Mirrors the actual section: centered heading + 3-column grid, each column having
// a circular icon (bg-primary/10 with icon), bold title, and 2 description lines.
function BenefitsPreview() {
  const items = [
    { bg: "#ede9fe", iconColor: "#7c3aed", Icon: CheckCircle },
    { bg: "#dbeafe", iconColor: "#2563eb", Icon: Zap },
    { bg: "#dcfce7", iconColor: "#16a34a", Icon: Check },
  ]
  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-white dark:bg-neutral-950 px-3 py-2">
      {/* Section headline — centered, bold */}
      <div className="h-2.5 bg-neutral-900 dark:bg-white rounded-full w-[45%] mb-3" />

      {/* 3-column benefits grid */}
      <div className="flex items-start justify-center gap-2 w-full">
        {items.map((item, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            {/* Circular icon container — h-14 w-14 scaled down */}
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
              style={{ backgroundColor: item.bg }}
            >
              <item.Icon
                className="w-4 h-4"
                style={{ color: item.iconColor }}
              />
            </div>
            {/* Title */}
            <div className="h-1.5 bg-neutral-800 dark:bg-neutral-200 rounded-full w-[80%]" />
            {/* Description lines */}
            <div className="h-1 bg-neutral-300 dark:bg-neutral-600 rounded-full w-full" />
            <div className="h-1 bg-neutral-200 dark:bg-neutral-700 rounded-full w-[75%]" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Text Block ────────────────────────────────────────────────────────────────
// Mirrors the actual section: optional headline, body text paragraphs, left-aligned.
function TextBlockPreview() {
  return (
    <div className="w-full h-full flex flex-col justify-center bg-white dark:bg-neutral-950 px-4 py-3 gap-1.5">
      {/* Headline — bold, foreground */}
      <div className="h-2.5 bg-neutral-900 dark:bg-white rounded-full w-[55%]" />
      {/* Body text lines — muted, varying widths */}
      <div className="flex flex-col gap-[4px] mt-1">
        <div className="h-1.5 bg-neutral-400 dark:bg-neutral-500 rounded-full w-full" />
        <div className="h-1.5 bg-neutral-350 dark:bg-neutral-550 rounded-full w-[96%]" />
        <div className="h-1.5 bg-neutral-300 dark:bg-neutral-600 rounded-full w-full" />
        <div className="h-1.5 bg-neutral-300 dark:bg-neutral-600 rounded-full w-[88%]" />
        <div className="h-1.5 bg-neutral-250 dark:bg-neutral-650 rounded-full w-[72%]" />
      </div>
    </div>
  )
}

// ── Announcement Bar ──────────────────────────────────────────────────────────
// Mirrors the actual section: full-width solid background banner with centered text.
// The banner itself occupies most of the preview frame, with a small neutral surround.
function AnnouncementBarPreview() {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-[#f5f5f5] dark:bg-[#111] px-2.5 py-2.5 gap-2">
      {/* The announcement bar itself */}
      <div
        className="w-full rounded-sm flex items-center justify-center px-3 py-3 gap-2"
        style={{ backgroundColor: "#111111" }}
      >
        <Megaphone className="h-3 w-3 shrink-0" style={{ color: "rgba(255,255,255,0.6)" }} />
        <div className="flex flex-col items-center gap-1 flex-1">
          {/* Main text line */}
          <div className="h-1.5 rounded-full w-[62%]" style={{ backgroundColor: "rgba(255,255,255,0.85)" }} />
          {/* Optional second shorter line */}
          <div className="h-1 rounded-full w-[40%]" style={{ backgroundColor: "rgba(255,255,255,0.4)" }} />
        </div>
      </div>
      {/* Label */}
      <span className="text-[8px] font-medium text-neutral-400 dark:text-neutral-500 tracking-wide uppercase">
        Full-width banner
      </span>
    </div>
  )
}

// ── Featured Products ─────────────────────────────────────────────────────────
// Mirrors the actual section: section heading + product grid with cards
// Each card has an image area (bg-muted, ShoppingBag icon), title bar, and price.
function FeaturedProductsPreview() {
  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-neutral-950 px-3 py-2.5 gap-2">
      {/* Section heading row: title + sort button */}
      <div className="flex items-center justify-between shrink-0">
        <div className="h-2 bg-neutral-900 dark:bg-white rounded-full w-[35%]" />
        <div className="h-[14px] w-[18%] rounded bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center gap-0.5 px-1">
          <div className="h-1 w-1 rounded-full bg-neutral-400 dark:bg-neutral-500" />
          <div className="h-1 w-[14px] rounded-full bg-neutral-300 dark:bg-neutral-600" />
        </div>
      </div>

      {/* Product cards row — 3 columns */}
      <div className="flex-1 grid grid-cols-3 gap-1.5">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="flex flex-col bg-white dark:bg-neutral-900 rounded-lg overflow-hidden border border-neutral-100 dark:border-neutral-800 shadow-sm"
          >
            {/* Product image */}
            <div className="flex-1 min-h-0 bg-gradient-to-br from-neutral-100 to-neutral-150 dark:from-neutral-800 dark:to-neutral-750 flex items-center justify-center">
              <ShoppingBag className="h-3 w-3 text-neutral-300 dark:text-neutral-600" />
            </div>
            {/* Product info */}
            <div className="px-1.5 py-1.5 flex flex-col gap-1">
              <div className="h-1 bg-neutral-700 dark:bg-neutral-300 rounded-full w-full" />
              <div className="h-1.5 rounded-full w-[55%]" style={{ backgroundColor: "#10b981" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Reviews ───────────────────────────────────────────────────────────────────
// Mirrors the actual section: overall rating row (title + 5 stars + count) + 2 review
// cards, each with avatar circle, reviewer name, star rating, and text lines.
function ReviewsPreview() {
  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-neutral-950 px-3 py-2 gap-1.5">
      {/* Header row: Reviews title + stars + average + count */}
      <div className="flex items-center gap-1.5 shrink-0">
        <div className="h-2 bg-neutral-900 dark:bg-white rounded-full w-[24%]" />
        <div className="flex gap-[2px]">
          {[0, 1, 2, 3, 4].map((s) => (
            <Star key={s} className="w-[9px] h-[9px] fill-amber-400 text-amber-400" />
          ))}
        </div>
        <div className="h-1.5 bg-neutral-800 dark:bg-neutral-200 rounded-full w-[12px]" />
        <div className="h-1.5 bg-neutral-300 dark:bg-neutral-600 rounded-full w-[24px] ml-auto" />
      </div>

      {/* Review cards */}
      <div className="flex flex-col gap-1.5 flex-1">
        {[
          { avatarFrom: "#a78bfa", avatarTo: "#7c3aed" },
          { avatarFrom: "#6ee7b7", avatarTo: "#059669" },
        ].map((card, i) => (
          <div
            key={i}
            className="bg-neutral-50 dark:bg-neutral-900 rounded-lg p-1.5 border border-neutral-100 dark:border-neutral-800 flex-1"
          >
            {/* Reviewer row: avatar + name + stars */}
            <div className="flex items-center gap-1.5 mb-1">
              <div
                className="w-[14px] h-[14px] rounded-full shrink-0"
                style={{ background: `linear-gradient(135deg, ${card.avatarFrom}, ${card.avatarTo})` }}
              />
              <div className="h-1.5 bg-neutral-600 dark:bg-neutral-300 rounded-full w-[22%]" />
              <div className="flex gap-[2px] ml-auto">
                {[0, 1, 2, 3, 4].map((s) => (
                  <Star key={s} className="w-[7px] h-[7px] fill-amber-400 text-amber-400" />
                ))}
              </div>
            </div>
            {/* Review text lines */}
            <div className="flex flex-col gap-[3px]">
              <div className="h-1 bg-neutral-300 dark:bg-neutral-600 rounded-full w-full" />
              <div className="h-1 bg-neutral-200 dark:bg-neutral-700 rounded-full w-[80%]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
