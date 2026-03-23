"use client"

import { useEffect, useState, useCallback, useRef, use } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft, Monitor, Smartphone, Loader2, Globe, Save,
  ChevronDown, Plus, Eye, EyeOff, GripVertical, Trash2,
  Copy, Settings, Check, Layers, Palette, X, RotateCcw,
  Layout, AlignLeft, Image, ShoppingBag, MessageSquare,
  HelpCircle, Megaphone, BarChart2, Grid, Award, LayoutGrid,
  DollarSign, LayoutTemplate, Video, Users, MapPin, Mail,
  Clock, BookOpen, Shirt, Columns, Play, Star, Timer, Shield,
  Rss, SlidersHorizontal, Code, Bell, ChevronRight, Package,
  Menu, Undo2, Redo2, PanelLeft, ExternalLink, Link2,
  Search, FileText, ArrowRight, FolderOpen, MoreHorizontal,
  Upload, ImageIcon, Info, RefreshCw, Crop,
} from "lucide-react"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { Slider } from "@/components/ui/slider"
import type {
  ThemeInstall, SectionInstance, ThemeSettingsValues,
  PageKey, EditorPanel, SchemaField,
} from "@/lib/website-builder/types"
import { PAGE_META } from "@/lib/website-builder/types"
import { SECTION_SCHEMAS, ADDABLE_SECTIONS, SECTION_CATEGORIES } from "@/lib/website-builder/section-schemas"
import { THEME_SETTINGS_GROUPS } from "@/lib/website-builder/theme-settings-schema"
import SectionRenderer from "@/components/website-builder/sections/SectionRenderer"
import { toast } from "sonner"
import { getWebsiteShareUrl, getWebsiteUrlDisplay } from "@/lib/url-helpers"

// ── Logo sync maps (header section ↔ theme settings) ────────
const LOGO_SYNC_HEADER_TO_THEME: Record<string, string> = {
  logo_url: "logo_url",
  logo_height: "logo_width",
}
const LOGO_SYNC_THEME_TO_HEADER: Record<string, string> = {
  logo_url: "logo_url",
  logo_width: "logo_height",
}

// ── Field editor ─────────────────────────────────────────────
function FieldEditor({
  field,
  value,
  onChange,
}: {
  field: SchemaField
  value: unknown
  onChange: (v: unknown) => void
}) {
  const raw = value ?? field.default

  if (field.type === "text" || field.type === "link") {
    return (
      <input
        type="text"
        className="w-full h-9 px-3 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-colors"
        placeholder={field.placeholder ?? ""}
        value={typeof raw === "string" ? raw : ""}
        onChange={e => onChange(e.target.value)}
      />
    )
  }

  if (field.type === "textarea" || field.type === "richtext") {
    return (
      <textarea
        className="w-full min-h-[80px] px-3 py-2.5 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 resize-y transition-colors"
        placeholder={field.placeholder ?? ""}
        value={typeof raw === "string" ? raw : ""}
        onChange={e => onChange(e.target.value)}
      />
    )
  }

  if (field.type === "color") {
    return (
      <div className="flex items-center gap-2">
        <div className="relative h-9 w-9 rounded-lg overflow-hidden border border-border shrink-0">
          <input
            type="color"
            className="absolute -inset-1 cursor-pointer"
            value={typeof raw === "string" ? raw : "#000000"}
            onChange={e => onChange(e.target.value)}
          />
        </div>
        <input
          type="text"
          className="flex-1 h-9 px-3 text-sm border border-border rounded-lg bg-background font-mono focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-colors"
          value={typeof raw === "string" ? raw : ""}
          onChange={e => onChange(e.target.value)}
        />
      </div>
    )
  }

  if (field.type === "select") {
    return (
      <select
        className="w-full h-9 px-3 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 appearance-none cursor-pointer transition-colors"
        value={typeof raw === "string" ? raw : String(field.default ?? "")}
        onChange={e => onChange(e.target.value)}
      >
        {field.options?.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    )
  }

  if (field.type === "toggle") {
    const checked = typeof raw === "boolean" ? raw : !!field.default
    return (
      <button
        className={cn(
          "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
          checked ? "bg-purple-600" : "bg-muted",
        )}
        onClick={() => onChange(!checked)}
        type="button"
      >
        <span
          className={cn(
            "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-4" : "translate-x-0.5",
          )}
        />
      </button>
    )
  }

  if (field.type === "range") {
    const num = typeof raw === "number" ? raw : Number(field.default ?? 0)
    return (
      <div className="flex items-center gap-3">
        <input
          type="range"
          className="flex-1 accent-purple-600"
          min={field.min ?? 0}
          max={field.max ?? 100}
          step={field.step ?? 1}
          value={num}
          onChange={e => onChange(Number(e.target.value))}
        />
        <span className="text-xs text-muted-foreground w-12 text-right shrink-0 tabular-nums">
          {num}{field.unit ?? ""}
        </span>
      </div>
    )
  }

  if (field.type === "number") {
    return (
      <input
        type="number"
        className="w-full h-9 px-3 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-colors"
        min={field.min}
        max={field.max}
        step={field.step ?? 1}
        value={typeof raw === "number" ? raw : Number(field.default ?? 0)}
        onChange={e => onChange(Number(e.target.value))}
      />
    )
  }

  if (field.type === "image") {
    return (
      <WbImagePicker
        value={typeof raw === "string" ? raw : undefined}
        onChange={url => onChange(url ?? "")}
        aspectRatio="video"
        folder="sections"
      />
    )
  }

  if (field.type === "header") {
    return (
      <div className="pt-3 pb-1 border-t border-border mt-2">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">{field.label}</span>
        {field.info && <p className="text-[11px] text-muted-foreground mt-0.5">{field.info}</p>}
      </div>
    )
  }

  if (field.type === "paragraph") {
    return (
      <p className="text-xs text-muted-foreground leading-relaxed">{field.info ?? field.label}</p>
    )
  }

  if (field.type === "video") {
    return (
      <div className="space-y-2">
        {typeof raw === "string" && raw && (
          <div className="relative w-full aspect-video rounded-lg overflow-hidden border border-border bg-muted">
            <video src={raw} className="w-full h-full object-cover" muted />
            <button
              className="absolute top-1.5 right-1.5 h-6 w-6 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center transition-colors"
              onClick={() => onChange("")}
            >
              <X className="h-3 w-3 text-white" />
            </button>
          </div>
        )}
        <input
          type="text"
          className="w-full h-9 px-3 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-colors"
          placeholder="Paste video URL..."
          value={typeof raw === "string" ? raw : ""}
          onChange={e => onChange(e.target.value)}
        />
      </div>
    )
  }

  if (field.type === "font") {
    return (
      <select
        className="w-full h-9 px-3 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 appearance-none cursor-pointer transition-colors"
        value={typeof raw === "string" ? raw : String(field.default ?? "")}
        onChange={e => onChange(e.target.value)}
        style={{ fontFamily: typeof raw === "string" ? raw : String(field.default ?? "") }}
      >
        {(field.options ?? [
          { label: "Inter", value: "Inter" },
          { label: "Poppins", value: "Poppins" },
          { label: "Playfair Display", value: "Playfair Display" },
          { label: "Merriweather", value: "Merriweather" },
          { label: "Raleway", value: "Raleway" },
          { label: "Montserrat", value: "Montserrat" },
          { label: "Lora", value: "Lora" },
          { label: "DM Sans", value: "DM Sans" },
          { label: "Space Grotesk", value: "Space Grotesk" },
        ]).map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    )
  }

  if (field.type === "radio") {
    return (
      <div className="flex flex-wrap gap-1.5">
        {field.options?.map(opt => {
          const isSelected = (typeof raw === "string" ? raw : String(field.default ?? "")) === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={cn(
                "px-3 py-1.5 text-xs rounded-lg border transition-all",
                isSelected
                  ? "bg-purple-600 text-white border-purple-600 shadow-sm"
                  : "bg-background text-foreground border-border hover:border-purple-400"
              )}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    )
  }

  // Fallback
  return (
    <input
      type="text"
      className="w-full h-9 px-3 text-sm border border-border rounded-lg bg-background"
      value={String(raw ?? "")}
      onChange={e => onChange(e.target.value)}
    />
  )
}

// ── Section icon map ─────────────────────────────────────────
const SECTION_ICONS: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  header: LayoutTemplate,
  footer: LayoutTemplate,
  hero: Star,
  rich_text: AlignLeft,
  image_banner: Image,
  product: Star,
  product_list: ShoppingBag,
  testimonials: MessageSquare,
  faq: HelpCircle,
  cta: Megaphone,
  stats: BarChart2,
  feature_grid: Grid,
  logo_bar: Award,
  gallery: LayoutGrid,
  pricing: DollarSign,
  video_hero: Video,
  split_content: Columns,
  image_section: Image,
  slideshow: Play,
  slideshow: Play,
  team_members: Users,
  countdown_timer: Timer,
  trust_badges: Shield,
  newsletter: Mail,
  social_feed: Rss,
  contact_form: Mail,
  video_embed: Video,
  timeline: Clock,
  tabs_content: SlidersHorizontal,
  custom_html: Code,
  announcement_banner: Bell,
  press_mentions: Award,
  process_steps: ChevronRight,
  comparison_table: Grid,
  ebook_showcase: BookOpen,
  author_bio: Users,
  chapter_preview: BookOpen,
  lookbook: Image,
  size_guide: Shirt,
  collection_banner: Package,
  map_embed: MapPin,
  sticky_bar: Bell,
  social_proof_bar: BarChart2,
}

function SectionIcon({ type, className }: { type: string; className?: string }) {
  const Icon = SECTION_ICONS[type] ?? Layout
  return <Icon className={cn("h-4 w-4", className)} strokeWidth={1.5} />
}

// ── Section Preview — renders the real section scaled down ───
const PREVIEW_RENDER_WIDTH = 800
const PREVIEW_THEME: ThemeSettingsValues = {
  primary_color: "#6366f1",
  secondary_color: "#8b5cf6",
  accent_color: "#f59e0b",
  background_color: "#ffffff",
  surface_color: "#f8fafc",
  text_color: "#0f172a",
  text_secondary_color: "#64748b",
  border_color: "#e2e8f0",
  button_style: "rounded",
  border_radius: 8,
  font_heading: "Inter",
  font_body: "Inter",
}

function buildPreviewSection(type: string): SectionInstance | null {
  const schema = SECTION_SCHEMAS[type]
  if (!schema) return null
  const preset = schema.presets?.[0]
  return {
    id: `preview-${type}`,
    type,
    name: schema.name,
    settings: preset?.settings ?? {},
    blocks: preset?.blocks ?? [],
    hidden: false,
  }
}

function SectionPreviewThumbnail({ type, containerWidth = 220 }: { type: string; containerWidth?: number }) {
  const section = buildPreviewSection(type)
  if (!section) {
    return (
      <div className="w-full h-full bg-muted flex items-center justify-center">
        <Layout className="h-8 w-8 text-muted-foreground/30" />
      </div>
    )
  }
  const scale = containerWidth / PREVIEW_RENDER_WIDTH
  return (
    <div
      className="origin-top-left overflow-hidden"
      style={{
        width: PREVIEW_RENDER_WIDTH,
        zoom: scale,
        pointerEvents: "none",
        userSelect: "none",
      }}
    >
      <SectionRenderer
        section={section}
        theme={PREVIEW_THEME}
        isEditing={false}
        isSelected={false}
      />
    </div>
  )
}

// ── Add Section Modal ────────────────────────────────────────
function AddSectionModal({
  open,
  onOpenChange,
  onAddSection,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAddSection: (type: string) => void
}) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [isMobileLayout, setIsMobileLayout] = useState(false)

  useEffect(() => {
    const check = () => setIsMobileLayout(window.innerWidth < 640)
    check()
    window.addEventListener("resize", check)
    return () => window.removeEventListener("resize", check)
  }, [])

  // Reset category when modal opens
  useEffect(() => {
    if (open) setActiveCategory(null)
  }, [open])

  const byCategory = ADDABLE_SECTIONS.reduce<Record<string, string[]>>((acc, type) => {
    const cat = SECTION_SCHEMAS[type]?.category ?? "content"
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(type)
    return acc
  }, {})

  const categories = Object.keys(byCategory)
  const visibleSections = activeCategory ? byCategory[activeCategory] ?? [] : ADDABLE_SECTIONS

  const allCategories = [
    { key: "all", label: "All" },
    ...categories.map(cat => ({ key: cat, label: SECTION_CATEGORIES[cat] ?? cat })),
  ]

  const handleAdd = (type: string) => {
    onAddSection(type)
    onOpenChange(false)
  }

  // ── Section card (shared between mobile & desktop) ──
  const SectionCard = ({ type, mobile }: { type: string; mobile?: boolean }) => {
    const schema = SECTION_SCHEMAS[type]
    const cardRef = useRef<HTMLButtonElement>(null)
    const [cardWidth, setCardWidth] = useState(mobile ? 300 : 260)
    useEffect(() => {
      if (!cardRef.current) return
      const ro = new ResizeObserver(([entry]) => {
        if (entry) setCardWidth(entry.contentRect.width)
      })
      ro.observe(cardRef.current)
      return () => ro.disconnect()
    }, [])
    if (!schema) return null
    return (
      <button
        ref={cardRef}
        onClick={() => handleAdd(type)}
        className={cn(
          "flex flex-col w-full rounded-xl border border-border bg-background overflow-hidden text-left",
          "transition-all duration-200 ease-out will-change-transform",
          mobile
            ? "rounded-2xl active:scale-[0.98] active:opacity-80 shadow-sm"
            : "hover:border-foreground/25 hover:shadow-lg hover:shadow-black/8 hover:-translate-y-0.5 active:scale-[0.99] active:shadow-sm",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2",
          "group cursor-pointer"
        )}
      >
        {/* Title above the preview */}
        <div className="px-4 pt-3 pb-2.5 shrink-0">
          <p className="font-semibold text-sm leading-tight text-foreground">{schema.name}</p>
        </div>
        {/* Full-width real section preview */}
        <div className="w-full border-t border-border/40 bg-muted/10 overflow-hidden">
          <SectionPreviewThumbnail type={type} containerWidth={cardWidth} />
        </div>
      </button>
    )
  }

  // ── Mobile: bottom sheet ──
  if (isMobileLayout) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          hideCloseButton
          enableDragToClose
          onDragClose={() => onOpenChange(false)}
          className="p-0 rounded-t-[28px] overflow-hidden flex flex-col gap-0"
          style={{ height: "80dvh" }}
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-0 shrink-0" data-drag-handle="true">
            <div className="w-10 h-1.5 rounded-full bg-foreground/10" />
          </div>

          {/* Mobile header */}
          <div className="flex items-center justify-between px-5 pt-3 pb-3 shrink-0" data-drag-handle="true">
            <div>
              <h2 className="text-base font-semibold text-foreground">Add Section</h2>
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
              {allCategories.map((cat) => (
                <button
                  key={cat.key}
                  onClick={() => setActiveCategory(cat.key === "all" ? null : cat.key)}
                  className={cn(
                    "px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-200",
                    (cat.key === "all" && !activeCategory) || activeCategory === cat.key
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
              {visibleSections.map((type) => (
                <SectionCard key={type} type={type} mobile />
              ))}
            </div>
            {visibleSections.length === 0 && (
              <div className="py-16 text-center text-muted-foreground">
                <p className="text-sm">No sections in this category</p>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    )
  }

  // ── Desktop: centered modal ──
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
          <DialogDescription className="text-sm text-muted-foreground">Choose a section type to add to your page</DialogDescription>
        </DialogHeader>

        {/* Body: sidebar + grid */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left categories sidebar */}
          <nav className="w-[150px] sm:w-[180px] border-r border-border shrink-0 overflow-y-auto py-2 bg-muted/20">
            {allCategories.map((cat) => (
              <button
                key={cat.key}
                onClick={() => setActiveCategory(cat.key === "all" ? null : cat.key)}
                className={cn(
                  "w-full text-left px-4 py-2.5 text-sm font-medium transition-all relative",
                  (cat.key === "all" && !activeCategory) || activeCategory === cat.key
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
              {visibleSections.map((type) => (
                <SectionCard key={type} type={type} />
              ))}
            </div>
            {visibleSections.length === 0 && (
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

// ── Professional Image Picker ────────────────────────────────
function WbImagePicker({
  value,
  onChange,
  label,
  aspectRatio = "video",
  bucket = "store-builder-images" as const,
  folder = "logos",
}: {
  value: string | undefined
  onChange: (url: string | null) => void
  label?: string
  aspectRatio?: "square" | "video" | "logo"
  bucket?: "product-images" | "avatars" | "covers" | "store-builder-images"
  folder?: string
}) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const url = typeof value === "string" && value ? value : null

  // Allowed image MIME types for security
  const ALLOWED_TYPES = new Set([
    "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml", "image/avif",
  ])
  // Safe file extensions
  const SAFE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "svg", "avif"])

  const handleFile = useCallback(async (file: File) => {
    if (!ALLOWED_TYPES.has(file.type)) {
      toast.error("Only JPEG, PNG, GIF, WebP, SVG, and AVIF images are allowed")
      return
    }
    const ext = (file.name.split(".").pop() ?? "").toLowerCase()
    if (!SAFE_EXTENSIONS.has(ext)) {
      toast.error("Invalid file extension")
      return
    }
    if (file.size > 5 * 1024 * 1024) { toast.error("Image must be under 5 MB"); return }

    setUploading(true)
    setProgress(10)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Not logged in")

      // Sanitize filename: only keep alphanumeric + timestamp
      const safeName = `${Date.now()}.${ext}`
      const filePath = `${user.id}/${folder}/${safeName}`
      setProgress(30)

      const { error: uploadError } = await supabase.storage.from(bucket).upload(filePath, file, {
        cacheControl: "31536000", // 1 year — immutable content-addressed names
        upsert: true,
        contentType: file.type,
      })
      if (uploadError) throw uploadError

      setProgress(80)
      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(filePath)
      setProgress(100)
      onChange(urlData.publicUrl)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setUploading(true) // brief delay to show 100%
      setTimeout(() => { setUploading(false); setProgress(0) }, 300)
    }
  }, [bucket, folder, onChange])

  const aspectClass = aspectRatio === "square" ? "aspect-square" : aspectRatio === "logo" ? "min-h-[100px]" : "aspect-video"

  if (url) {
    return (
      <div className="space-y-2.5">
        {label && <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">{label}</p>}
        <div className={cn("relative w-full rounded-lg overflow-hidden border border-border bg-[#fafafa]", aspectClass, "flex items-center justify-center")}>
          <img src={url} alt="" className="max-w-full max-h-full object-contain p-2" />
        </div>
        <div className="flex items-center gap-2">
          <button
            className="flex-1 flex items-center justify-center gap-1.5 h-9 text-xs font-medium border border-border rounded-lg hover:bg-muted/50 transition-colors"
            onClick={() => inputRef.current?.click()}
          >
            <RefreshCw className="h-3 w-3" />
            Replace
          </button>
          <button
            className="flex-1 flex items-center justify-center gap-1.5 h-9 text-xs font-medium border border-border rounded-lg hover:bg-muted/50 transition-colors text-red-500"
            onClick={() => onChange(null)}
          >
            <Trash2 className="h-3 w-3" />
            Remove
          </button>
        </div>
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = "" }} />
      </div>
    )
  }

  return (
    <div className="space-y-2.5">
      {label && <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">{label}</p>}
      <div
        className={cn(
          "relative w-full rounded-lg border-2 border-dashed transition-colors cursor-pointer flex flex-col items-center justify-center gap-2",
          aspectClass,
          dragOver ? "border-purple-400 bg-purple-50" : "border-border bg-[#fafafa] hover:border-purple-300 hover:bg-purple-50/30",
        )}
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
      >
        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <div className="h-5 w-5 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-muted-foreground">Uploading... {progress}%</p>
            <div className="w-32 h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-purple-500 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
          </div>
        ) : (
          <>
            <ImageIcon className="h-6 w-6 text-muted-foreground/50" />
            <p className="text-sm font-medium text-muted-foreground">Add Image</p>
            <p className="text-[11px] text-muted-foreground/70">Click to upload or drag & drop</p>
          </>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = "" }} />
    </div>
  )
}

// ── Professional Color Picker with Swatches ──────────────────
const COLOR_SWATCHES = [
  "#000000", "#374151", "#3B82F6", "#10B981", "#F59E0B",
  "#EF4444", "#8B5CF6", "#EC4899", "#6366F1", "#14B8A6",
]

function WbColorPicker({
  label,
  value,
  onChange,
  defaultValue = "#000000",
}: {
  label: string
  value: unknown
  onChange: (v: string) => void
  defaultValue?: string
}) {
  const color = typeof value === "string" && value ? value : defaultValue
  const [inputVal, setInputVal] = useState(color)

  useEffect(() => {
    setInputVal(typeof value === "string" && value ? value : defaultValue)
  }, [value, defaultValue])

  const handleInput = (v: string) => {
    setInputVal(v)
    if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v) || v === "transparent") {
      onChange(v)
    }
  }

  return (
    <div className="space-y-2.5">
      <p className="text-sm font-medium text-foreground">{label}</p>
      <div className="flex items-center gap-2.5">
        <div className="relative h-10 w-10 rounded-lg overflow-hidden border border-border shrink-0 shadow-sm">
          {color === "transparent" ? (
            <div className="w-full h-full" style={{ background: "repeating-conic-gradient(#e5e7eb 0% 25%, transparent 0% 50%) 50% / 10px 10px" }} />
          ) : (
            <div className="w-full h-full" style={{ backgroundColor: color }} />
          )}
          <input
            type="color"
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            value={color === "transparent" ? "#ffffff" : color}
            onChange={e => { onChange(e.target.value); setInputVal(e.target.value) }}
          />
        </div>
        <input
          type="text"
          className="flex-1 h-10 px-3 text-sm border border-border rounded-lg bg-background font-mono focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-colors"
          value={inputVal}
          onChange={e => handleInput(e.target.value)}
          onBlur={() => setInputVal(color)}
        />
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {COLOR_SWATCHES.map(sw => (
          <button
            key={sw}
            type="button"
            className={cn(
              "h-7 w-7 rounded-full border-2 transition-all hover:scale-110",
              color === sw ? "border-foreground ring-2 ring-foreground/10 scale-110" : "border-transparent"
            )}
            style={{ backgroundColor: sw }}
            onClick={() => { onChange(sw); setInputVal(sw) }}
          />
        ))}
      </div>
    </div>
  )
}

// ── Professional Slider with value display ───────────────────
function WbSlider({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  unit = "px",
  defaultValue = 0,
}: {
  label: string
  value: unknown
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  unit?: string
  defaultValue?: number
}) {
  const num = typeof value === "number" ? value : defaultValue
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <span className="text-sm text-muted-foreground tabular-nums">{num}{unit}</span>
      </div>
      <Slider
        value={[num]}
        onValueChange={([v]) => onChange(v)}
        min={min}
        max={max}
        step={step}
      />
    </div>
  )
}

// ── Professional Toggle Row ──────────────────────────────────
function WbToggle({
  label,
  value,
  onChange,
  info,
}: {
  label: string
  value: unknown
  onChange: (v: boolean) => void
  info?: string
}) {
  const checked = typeof value === "boolean" ? value : false
  return (
    <div className="flex items-center justify-between py-1">
      <div className="flex-1">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {info && <p className="text-[11px] text-muted-foreground mt-0.5">{info}</p>}
      </div>
      <button
        type="button"
        className={cn(
          "relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ml-3",
          checked ? "bg-purple-600" : "bg-muted",
        )}
        onClick={() => onChange(!checked)}
      >
        <span className={cn("inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform", checked ? "translate-x-4" : "translate-x-0.5")} />
      </button>
    </div>
  )
}

// ── Professional Select dropdown ─────────────────────────────
function WbSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: unknown
  onChange: (v: string) => void
  options: { label: string; value: string }[]
}) {
  const selected = typeof value === "string" ? value : String(options[0]?.value ?? "")
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium text-foreground">{label}</p>
      <div className="relative">
        <select
          className="w-full h-10 px-3 pr-8 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 appearance-none cursor-pointer transition-colors"
          value={selected}
          onChange={e => onChange(e.target.value)}
        >
          {options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
      </div>
    </div>
  )
}

// ── Professional Radio Segment Control ───────────────────────
function WbRadioSegment({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: unknown
  onChange: (v: string) => void
  options: { label: string; value: string }[]
}) {
  const selected = typeof value === "string" ? value : String(options[0]?.value ?? "")
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">{label}</p>
      <div className="flex gap-1.5">
        {options.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "flex-1 py-2 text-sm font-medium rounded-lg border-2 transition-all text-center",
              selected === opt.value
                ? "border-foreground bg-background text-foreground shadow-sm"
                : "border-transparent bg-muted/50 text-muted-foreground hover:bg-muted"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Header Section Settings Panel ────────────────────────────
function HeaderSectionSettings({
  section,
  schema,
  onBack,
  onUpdateSetting,
  onUpdateBlockSetting,
  onAddBlock,
  onRemoveBlock,
}: {
  section: SectionInstance
  schema: any
  onBack: () => void
  onUpdateSetting: (key: string, value: unknown) => void
  onUpdateBlockSetting: (blockId: string, key: string, value: unknown) => void
  onAddBlock: (type: string) => void
  onRemoveBlock: (blockId: string) => void
}) {
  const [activeTab, setActiveTab] = useState<string | null>(null)
  const s = section.settings

  const tabs = [
    { id: "logo", label: "Store Logo" },
    { id: "nav", label: "Navigation Links" },
    { id: "settings", label: "Header Settings" },
    { id: "button", label: "Button" },
    { id: "elements", label: "Elements" },
  ]

  // ── Sub-panel content ──────────────────────────────────────
  const renderSubPanel = (tabId: string) => {
    switch (tabId) {
      case "logo":
        return (
          <div className="space-y-5">
            {/* Logo image picker */}
            <WbImagePicker
              label="LOGO IMAGE"
              value={typeof s.logo_url === "string" ? s.logo_url : undefined}
              onChange={url => onUpdateSetting("logo_url", url ?? "")}
              aspectRatio="logo"
              folder="logos"
            />

            {/* Logo height slider */}
            {typeof s.logo_url === "string" && s.logo_url && (
              <WbSlider
                label="Logo height"
                value={s.logo_height}
                onChange={v => onUpdateSetting("logo_height", v)}
                min={24}
                max={120}
                step={2}
                unit="px"
                defaultValue={40}
              />
            )}

            {/* Use different logo for mobile */}
            <WbToggle
              label="Use different logo for mobile devices"
              value={s.use_mobile_logo}
              onChange={v => onUpdateSetting("use_mobile_logo", v)}
            />

            {/* Mobile logo image */}
            {!!s.use_mobile_logo && (
              <>
                <WbImagePicker
                  label="MOBILE LOGO IMAGE"
                  value={typeof s.mobile_logo_url === "string" ? s.mobile_logo_url : undefined}
                  onChange={url => onUpdateSetting("mobile_logo_url", url ?? "")}
                  aspectRatio="logo"
                  folder="logos"
                />
                {typeof s.mobile_logo_url === "string" && s.mobile_logo_url && (
                  <WbSlider
                    label="Mobile logo height"
                    value={s.mobile_logo_height}
                    onChange={v => onUpdateSetting("mobile_logo_height", v)}
                    min={20}
                    max={80}
                    step={2}
                    unit="px"
                    defaultValue={32}
                  />
                )}
              </>
            )}

            {/* Store title */}
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">STORE TITLE</p>
              <input
                type="text"
                className="w-full h-10 px-3 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-colors"
                placeholder="My Store"
                value={typeof s.logo_text === "string" ? s.logo_text : ""}
                onChange={e => onUpdateSetting("logo_text", e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground flex items-start gap-1.5 mt-1.5">
                <Info className="h-3 w-3 shrink-0 mt-0.5" />
                Search engines like Google need the store title, so ensure you add one even when you use a logo. Logos replace the store title on all pages.
              </p>
            </div>

            {/* Logo font */}
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-foreground">Logo font</p>
              <div className="relative">
                <select
                  className="w-full h-10 px-3 pr-8 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 appearance-none cursor-pointer transition-colors"
                  value={typeof s.logo_font === "string" ? s.logo_font : "Inter"}
                  onChange={e => onUpdateSetting("logo_font", e.target.value)}
                  style={{ fontFamily: typeof s.logo_font === "string" ? s.logo_font : "Inter" }}
                >
                  {[
                    "Inter", "Poppins", "Playfair Display", "Merriweather", "Raleway",
                    "Montserrat", "Lora", "DM Sans", "Space Grotesk",
                  ].map(f => (
                    <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              </div>
            </div>
          </div>
        )

      case "nav":
        return (
          <div className="space-y-3">
            {(section.blocks ?? []).map((block, idx) => {
              const blockSchema = schema?.blocks?.find((b: any) => b.type === block.type)
              return (
                <details key={block.id} className="group border border-border rounded-lg overflow-hidden">
                  <summary className="flex items-center justify-between px-3 py-2.5 cursor-pointer list-none bg-muted/30 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-2">
                      <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40" />
                      <span className="text-sm font-medium">{String(block.settings.label || `Link ${idx + 1}`)}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        className="h-6 w-6 flex items-center justify-center rounded hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors"
                        onClick={e => { e.preventDefault(); onRemoveBlock(block.id) }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground group-open:rotate-180 transition-transform" />
                    </div>
                  </summary>
                  <div className="px-3 pb-3 space-y-3 border-t border-border pt-3">
                    {blockSchema?.fields.map((field: SchemaField) => (
                      <div key={field.id}>
                        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{field.label}</label>
                        {field.type === "toggle" ? (
                          <WbToggle
                            label=""
                            value={block.settings[field.id]}
                            onChange={val => onUpdateBlockSetting(block.id, field.id, val)}
                          />
                        ) : (
                          <input
                            type="text"
                            className="w-full h-9 px-3 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-colors"
                            placeholder={field.placeholder ?? ""}
                            value={typeof block.settings[field.id] === "string" ? (block.settings[field.id] as string) : ""}
                            onChange={e => onUpdateBlockSetting(block.id, field.id, e.target.value)}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              )
            })}
            {(!schema?.max_blocks || (section.blocks?.length ?? 0) < schema.max_blocks) && (
              <button
                className="w-full flex items-center justify-center gap-1.5 py-3 text-sm font-medium text-purple-600 hover:text-purple-700 border border-dashed border-purple-300 hover:border-purple-400 rounded-lg transition-colors hover:bg-purple-50/50"
                onClick={() => onAddBlock("nav_link")}
              >
                <Plus className="h-3.5 w-3.5" />
                Add navigation link
              </button>
            )}
          </div>
        )

      case "settings":
        return (
          <div className="space-y-5">
            <WbToggle
              label="Sticky header"
              value={s.sticky}
              onChange={v => onUpdateSetting("sticky", v)}
              info="Header stays at the top when scrolling"
            />
            <WbToggle
              label="Transparent over hero"
              value={s.transparent_on_hero}
              onChange={v => onUpdateSetting("transparent_on_hero", v)}
              info="Header background becomes transparent when over hero section"
            />
            <div className="h-px bg-border" />
            <WbRadioSegment
              label="Navigation alignment"
              value={s.nav_alignment}
              onChange={v => onUpdateSetting("nav_alignment", v)}
              options={[
                { label: "Left", value: "left" },
                { label: "Center", value: "center" },
                { label: "Right", value: "right" },
              ]}
            />
            <WbSelect
              label="Container width"
              value={s.max_width}
              onChange={v => onUpdateSetting("max_width", v)}
              options={[
                { label: "Narrow", value: "narrow" },
                { label: "Medium", value: "medium" },
                { label: "Wide", value: "wide" },
                { label: "Full width", value: "full" },
              ]}
            />
          </div>
        )

      case "button":
        return (
          <div className="space-y-5">
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-foreground">Button text</p>
              <input
                type="text"
                className="w-full h-10 px-3 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-colors"
                placeholder="Shop Now"
                value={typeof s.cta_text === "string" ? s.cta_text : ""}
                onChange={e => onUpdateSetting("cta_text", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-foreground">Button URL</p>
              <input
                type="text"
                className="w-full h-10 px-3 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-colors"
                placeholder="/products"
                value={typeof s.cta_url === "string" ? s.cta_url : ""}
                onChange={e => onUpdateSetting("cta_url", e.target.value)}
              />
            </div>
            <WbRadioSegment
              label="Button style"
              value={s.cta_style}
              onChange={v => onUpdateSetting("cta_style", v)}
              options={[
                { label: "Filled", value: "filled" },
                { label: "Outline", value: "outline" },
                { label: "Ghost", value: "ghost" },
              ]}
            />
            <WbColorPicker
              label="Button color"
              value={s.cta_color}
              onChange={v => onUpdateSetting("cta_color", v)}
              defaultValue="#6366f1"
            />
            <WbColorPicker
              label="Button text color"
              value={s.cta_text_color}
              onChange={v => onUpdateSetting("cta_text_color", v)}
              defaultValue="#ffffff"
            />
            <WbSlider
              label="Button radius"
              value={s.cta_border_radius}
              onChange={v => onUpdateSetting("cta_border_radius", v)}
              min={0}
              max={32}
              step={2}
              unit="px"
              defaultValue={8}
            />
          </div>
        )

      case "elements":
        return (
          <div className="space-y-5">
            <WbColorPicker
              label="Background color"
              value={s.bg_color}
              onChange={v => onUpdateSetting("bg_color", v)}
              defaultValue="#ffffff"
            />
            <WbColorPicker
              label="Text color"
              value={s.text_color}
              onChange={v => onUpdateSetting("text_color", v)}
              defaultValue="#0f172a"
            />
            <div className="h-px bg-border" />
            <WbToggle
              label="Show bottom border"
              value={s.show_border}
              onChange={v => onUpdateSetting("show_border", v)}
            />
            {(s.show_border !== false) && (
              <WbColorPicker
                label="Border color"
                value={s.border_color}
                onChange={v => onUpdateSetting("border_color", v)}
                defaultValue="#e2e8f0"
              />
            )}
          </div>
        )

      default:
        return null
    }
  }

  // ── Sub-panel view ─────────────────────────────────────────
  if (activeTab) {
    const tab = tabs.find(t => t.id === activeTab)
    if (!tab) return null

    return (
      <div className="flex flex-col h-full">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2 shrink-0">
          <button className="text-muted-foreground hover:text-foreground transition-colors" onClick={() => setActiveTab(null)}>
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold">{tab.label}</span>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {renderSubPanel(activeTab)}
        </div>
      </div>
    )
  }

  // ── Main tab list ──────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2 shrink-0">
        <button className="text-muted-foreground hover:text-foreground transition-colors" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold">Header Section</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className="w-full flex items-center justify-between px-5 py-4 border-b border-border text-left hover:bg-muted/30 transition-colors"
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="text-sm font-medium">{tab.label}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Types ────────────────────────────────────────────────────
type Panel = EditorPanel

// ── Main editor ──────────────────────────────────────────────
export default function StoreEditorPage({ params }: { params: Promise<{ installId: string }> }) {
  const { installId } = use(params)
  const router = useRouter()

  const [install, setInstall] = useState<ThemeInstall | null>(null)
  const [sections, setSections] = useState<SectionInstance[]>([])
  const [settingsDraft, setSettingsDraft] = useState<ThemeSettingsValues>({})
  const [currentPage, setCurrentPage] = useState<PageKey>(() => {
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search).get("page")
      if (p) return p as PageKey
    }
    return "home"
  })
  const [selectedPanel, setSelectedPanel] = useState<Panel>({ type: "pages" })
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [expandedSettings, setExpandedSettings] = useState<string | null>(null)
  const [addSectionOpen, setAddSectionOpen] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(320)
  const [isMobileView, setIsMobileView] = useState(false)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(true)
  const [username, setUsername] = useState("")
  const [hasPublished, setHasPublished] = useState(false)
  const canvasRef = useRef<HTMLDivElement>(null)

  // ── New: Sidebar mode, page browser, product/collection pages ──
  const [sidebarMode, setSidebarMode] = useState<"sections" | "settings">("sections")
  const [pageBrowserOpen, setPageBrowserOpen] = useState(false)
  const [pageBrowserSearch, setPageBrowserSearch] = useState("")
  const [products, setProducts] = useState<{ id: string; title: string; slug: string; thumbnail_url: string; price_cents: number; compare_at_cents: number | null; description: string; whats_included: string[]; gallery_urls: string[] }[]>([])
  const [collections, setCollections] = useState<{ id: string; name: string; slug: string }[]>([])
  const [productsLoading, setProductsLoading] = useState(false)
  const [selectedProductPage, setSelectedProductPage] = useState<string | null>(null)
  const [editAllProductPages, setEditAllProductPages] = useState(false)
  const [editAllConfirmOpen, setEditAllConfirmOpen] = useState(false)
  const [sectionsLoading, setSectionsLoading] = useState(false)
  const [canvasLoading, setCanvasLoading] = useState(false)
  const [notification, setNotification] = useState<{ message: string; type: "success" | "error" } | null>(null)
  const notificationTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showNotification = useCallback((message: string, type: "success" | "error" = "success") => {
    if (notificationTimer.current) clearTimeout(notificationTimer.current)
    setNotification({ message, type })
    notificationTimer.current = setTimeout(() => setNotification(null), 4000)
  }, [])
  const [customPages, setCustomPages] = useState<{ id: string; name: string; key: PageKey }[]>([])
  const [addPageOpen, setAddPageOpen] = useState(false)
  const [newPageTitle, setNewPageTitle] = useState("")
  const [addingPage, setAddingPage] = useState(false)

  // Undo / Redo history
  const [undoStack, setUndoStack] = useState<{ sections: SectionInstance[]; settings: ThemeSettingsValues }[]>([])
  const [redoStack, setRedoStack] = useState<{ sections: SectionInstance[]; settings: ThemeSettingsValues }[]>([])

  const pushUndo = useCallback(() => {
    setUndoStack(prev => [...prev.slice(-30), { sections: JSON.parse(JSON.stringify(sections)), settings: JSON.parse(JSON.stringify(settingsDraft)) }])
    setRedoStack([])
  }, [sections, settingsDraft])

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return
    const last = undoStack[undoStack.length - 1]
    setRedoStack(prev => [...prev, { sections: JSON.parse(JSON.stringify(sections)), settings: JSON.parse(JSON.stringify(settingsDraft)) }])
    setSections(last.sections)
    setSettingsDraft(last.settings)
    setUndoStack(prev => prev.slice(0, -1))
    setIsDirty(true)
  }, [undoStack, sections, settingsDraft])

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return
    const last = redoStack[redoStack.length - 1]
    setUndoStack(prev => [...prev, { sections: JSON.parse(JSON.stringify(sections)), settings: JSON.parse(JSON.stringify(settingsDraft)) }])
    setSections(last.sections)
    setSettingsDraft(last.settings)
    setRedoStack(prev => prev.slice(0, -1))
    setIsDirty(true)
  }, [redoStack, sections, settingsDraft])

  // dnd-kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // Scroll to a section in the canvas
  const scrollToSection = useCallback((sectionId: string) => {
    setTimeout(() => {
      const el = document.getElementById(`wb-section-${sectionId}`)
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" })
    }, 80)
  }, [])

  // Drag end — reorder body sections (keep header/footer pinned)
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setSections(prev => {
      const header = prev.find(s => s.type === "header")
      const footer = prev.find(s => s.type === "footer")
      const body = prev.filter(s => s.type !== "header" && s.type !== "footer")
      const oldIdx = body.findIndex(s => s.id === active.id)
      const newIdx = body.findIndex(s => s.id === over.id)
      if (oldIdx === -1 || newIdx === -1) return prev
      const newBody = arrayMove(body, oldIdx, newIdx)
      return [
        ...(header ? [header] : []),
        ...newBody,
        ...(footer ? [footer] : []),
      ]
    })
    setIsDirty(true)
  }, [])

  // Returns sections array — callers can inject product data before setting state
  const fetchPageSections = useCallback(async (page: PageKey): Promise<SectionInstance[]> => {
    const res = await fetch(`/api/website-builder/themes/${installId}/sections?page=${page}`)
    if (!res.ok) return []
    const data = await res.json()
    let loaded: SectionInstance[] = data.sections ?? []

    // Ensure header and footer exist on every page
    if (!loaded.some(s => s.type === "header")) {
      const hs = SECTION_SCHEMAS["header"]
      if (hs) loaded = [{ id: `header-${Date.now()}`, type: "header", name: hs.name, settings: hs.presets?.[0]?.settings ?? {}, blocks: hs.presets?.[0]?.blocks ?? [], hidden: false }, ...loaded]
    }
    if (!loaded.some(s => s.type === "footer")) {
      const fs = SECTION_SCHEMAS["footer"]
      if (fs) loaded = [...loaded, { id: `footer-${Date.now()}`, type: "footer", name: fs.name, settings: fs.presets?.[0]?.settings ?? {}, blocks: fs.presets?.[0]?.blocks ?? [], hidden: false }]
    }

    // Auto-add Product section on product pages if missing
    if (page === "product" && !loaded.some(s => s.type === "product")) {
      const ps = SECTION_SCHEMAS["product"]
      if (ps) {
        const headerIdx = loaded.findIndex(s => s.type === "header")
        const newSection: SectionInstance = { id: `product-${Date.now()}`, type: "product", name: ps.name, settings: ps.presets?.[0]?.settings ?? {}, blocks: [], hidden: false }
        if (headerIdx !== -1) loaded.splice(headerIdx + 1, 0, newSection)
        else loaded.unshift(newSection)
      }
    }

    return loaded
  }, [installId])

  const loadSections = useCallback(async (page: PageKey) => {
    const loaded = await fetchPageSections(page)
    setSections(loaded)
  }, [fetchPageSections])

  // Load install data
  const loadData = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/website-builder/themes/${installId}`)
    if (!res.ok) { setLoading(false); return }
    const data = await res.json()
    const inst: ThemeInstall = data.install
    setInstall(inst)
    if (data.username) setUsername(data.username)

    // Load settings
    const settings = inst.settings
    const loadedSettings = settings?.draft_settings ?? settings?.settings ?? {}

    // Load sections for current page
    const loaded = await fetchPageSections(currentPage)

    // Sync logo between header section and theme settings on initial load
    const header = loaded.find(s => s.type === "header")
    if (header) {
      const headerLogo = header.settings.logo_url
      const themeLogo = loadedSettings.logo_url
      // If header has a logo but theme settings doesn't, populate theme settings
      if (headerLogo && !themeLogo) {
        loadedSettings.logo_url = headerLogo
        if (header.settings.logo_height) loadedSettings.logo_width = header.settings.logo_height
      }
      // If theme settings has a logo but header doesn't, populate header
      else if (themeLogo && !headerLogo) {
        header.settings.logo_url = themeLogo
        if (loadedSettings.logo_width) header.settings.logo_height = loadedSettings.logo_width
      }
    }

    setSettingsDraft(loadedSettings)
    setSections(loaded)
    setLoading(false)
  }, [installId, currentPage, fetchPageSections])

  useEffect(() => { loadData() }, [loadData])

  // Username is loaded from API in loadData

  // Check mobile view
  useEffect(() => {
    const checkMobile = () => setIsMobileView(window.innerWidth < 768)
    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  // Warn about unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) { e.preventDefault(); e.returnValue = "" }
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [isDirty])

  // Fetch products and collections for page browser
  const loadProducts = useCallback(async () => {
    setProductsLoading(true)
    try {
      const res = await fetch("/api/website-builder/products?limit=100")
      if (res.ok) {
        const data = await res.json()
        setProducts((data.products ?? []).map((p: any) => ({
          id: p.id,
          title: p.title || "Untitled Product",
          slug: p.slug || p.id,
          thumbnail_url: p.thumbnail_url || "",
          price_cents: p.price_cents ?? 0,
          compare_at_cents: p.compare_at_cents ?? null,
          description: p.description || "",
          whats_included: p.whats_included ?? [],
          gallery_urls: p.gallery_urls ?? [],
        })))
      }
    } catch {}
    try {
      const res = await fetch("/api/collections?limit=100")
      if (res.ok) {
        const data = await res.json()
        setCollections((data.collections ?? data ?? []).map((c: any) => ({
          id: c.id,
          name: c.name || "Untitled Collection",
          slug: c.slug || c.id,
        })))
      }
    } catch {}
    setProductsLoading(false)
  }, [])

  useEffect(() => { loadProducts() }, [loadProducts])

  // Update browser URL to reflect current page
  const updatePageUrl = useCallback((page: string, productName?: string) => {
    const url = new URL(window.location.href)
    url.searchParams.set("page", page)
    if (productName) url.searchParams.set("product", productName)
    else url.searchParams.delete("product")
    window.history.replaceState({}, "", url.toString())
  }, [])

  const handlePageChange = async (page: PageKey) => {
    setSectionsLoading(true)
    setCanvasLoading(true)

    // Capture current header/footer before switching — they are universal
    const currentHeader = sections.find(s => s.type === "header")
    const currentFooter = sections.find(s => s.type === "footer")

    setCurrentPage(page)
    setSelectedPanel({ type: "pages" })
    setPageBrowserOpen(false)
    setSelectedProductPage(null)
    setEditAllProductPages(false)
    updatePageUrl(page)

    // Load new page sections, then replace its header/footer with the shared ones
    const loaded = await fetchPageSections(page)
    const bodySections = loaded.filter(s => s.type !== "header" && s.type !== "footer")
    const merged = [
      ...(currentHeader ? [currentHeader] : loaded.filter(s => s.type === "header")),
      ...bodySections,
      ...(currentFooter ? [currentFooter] : loaded.filter(s => s.type === "footer")),
    ]
    setSections(merged)

    setSectionsLoading(false)
    setCanvasLoading(false)
  }

  const handleSelectProductPage = async (productId: string, productTitle: string) => {
    setSectionsLoading(true)
    setCanvasLoading(true)

    // Capture current header/footer — they are universal
    const currentHeader = sections.find(s => s.type === "header")
    const currentFooter = sections.find(s => s.type === "footer")

    setSelectedProductPage(productTitle)
    setCurrentPage("product")
    setSelectedPanel({ type: "pages" })
    setPageBrowserOpen(false)
    updatePageUrl("product", productTitle)

    // Build fallback product data from the products list immediately
    const listProduct = products.find(p => p.id === productId)
    const fallbackData = listProduct ? {
      title: listProduct.title,
      description: listProduct.description,
      price_cents: listProduct.price_cents,
      compare_at_cents: listProduct.compare_at_cents,
      thumbnail_url: listProduct.thumbnail_url,
      gallery_urls: listProduct.gallery_urls,
      whats_included: listProduct.whats_included,
      files: [],
    } : null

    // Fetch sections and full product data in parallel
    const [pageSections, productRes] = await Promise.all([
      fetchPageSections("product"),
      fetch(`/api/website-builder/products?id=${productId}`)
        .then(r => r.ok ? r.json() : null)
        .catch(() => null),
    ])

    // Use API response first, fall back to list data
    const productData = productRes?.product ?? fallbackData

    // Inject into every product-type section
    if (productData) {
      for (let i = 0; i < pageSections.length; i++) {
        if (pageSections[i].type === "product") {
          pageSections[i] = {
            ...pageSections[i],
            settings: { ...pageSections[i].settings, _product_data: productData },
          }
        }
      }
    }

    // Replace header/footer with shared universal ones
    const bodySections = pageSections.filter(s => s.type !== "header" && s.type !== "footer")
    const merged = [
      ...(currentHeader ? [currentHeader] : pageSections.filter(s => s.type === "header")),
      ...bodySections,
      ...(currentFooter ? [currentFooter] : pageSections.filter(s => s.type === "footer")),
    ]

    setSections(merged)
    setSectionsLoading(false)
    setCanvasLoading(false)
  }

  // Settings change (debounced undo push)
  const undoPushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const debouncedPushUndo = useCallback(() => {
    if (undoPushTimerRef.current) clearTimeout(undoPushTimerRef.current)
    undoPushTimerRef.current = setTimeout(() => pushUndo(), 500)
  }, [pushUndo])

  const updateSetting = (key: string, value: unknown) => {
    debouncedPushUndo()
    setSettingsDraft(prev => ({ ...prev, [key]: value }))

    // If updating logo in theme settings, also sync to header section
    if (key in LOGO_SYNC_THEME_TO_HEADER) {
      const sectionKey = LOGO_SYNC_THEME_TO_HEADER[key]
      setSections(prev => prev.map(s =>
        s.type === "header" ? { ...s, settings: { ...s.settings, [sectionKey]: value } } : s
      ))
    }

    setIsDirty(true)
  }

  // Section settings change
  const updateSectionSetting = (sectionId: string, key: string, value: unknown) => {
    debouncedPushUndo()
    setSections(prev => {
      const section = prev.find(s => s.id === sectionId)
      // If updating header section logo settings, also sync to theme settings
      if (section?.type === "header" && key in LOGO_SYNC_HEADER_TO_THEME) {
        const themeKey = LOGO_SYNC_HEADER_TO_THEME[key]
        setSettingsDraft(p => ({ ...p, [themeKey]: value }))
      }
      return prev.map(s =>
        s.id === sectionId ? { ...s, settings: { ...s.settings, [key]: value } } : s
      )
    })
    setIsDirty(true)
  }

  // Block settings change
  const updateBlockSetting = (sectionId: string, blockId: string, key: string, value: unknown) => {
    setSections(prev => prev.map(s =>
      s.id === sectionId
        ? { ...s, blocks: s.blocks?.map(b => b.id === blockId ? { ...b, settings: { ...b.settings, [key]: value } } : b) }
        : s
    ))
    setIsDirty(true)
  }

  const addBlock = (sectionId: string, blockType: string) => {
    const newBlock = { id: `block-${Date.now()}`, type: blockType, settings: {} }
    setSections(prev => prev.map(s =>
      s.id === sectionId ? { ...s, blocks: [...(s.blocks ?? []), newBlock] } : s
    ))
    setIsDirty(true)
  }

  const removeBlock = (sectionId: string, blockId: string) => {
    setSections(prev => prev.map(s =>
      s.id === sectionId ? { ...s, blocks: s.blocks?.filter(b => b.id !== blockId) } : s
    ))
    setIsDirty(true)
  }

  const toggleSectionHidden = (sectionId: string) => {
    setSections(prev => prev.map(s =>
      s.id === sectionId ? { ...s, hidden: !s.hidden } : s
    ))
    setIsDirty(true)
  }

  const removeSection = (sectionId: string) => {
    pushUndo()
    setSections(prev => prev.filter(s => s.id !== sectionId))
    if (selectedSectionId === sectionId) {
      setSelectedPanel({ type: "pages" })
    }
    setIsDirty(true)
  }

  const duplicateSection = (sectionId: string) => {
    pushUndo()
    const idx = sections.findIndex(s => s.id === sectionId)
    if (idx === -1) return
    const orig = sections[idx]
    const copy: SectionInstance = { ...orig, id: `${orig.type}-${Date.now()}`, name: `${orig.name} (copy)` }
    const next = [...sections]
    next.splice(idx + 1, 0, copy)
    setSections(next)
    setIsDirty(true)
  }

  const addSection = (type: string) => {
    pushUndo()
    const schema = SECTION_SCHEMAS[type]
    if (!schema) return
    const preset = schema.presets?.[0]
    const newSection: SectionInstance = {
      id: `${type}-${Date.now()}`,
      type,
      name: schema.name,
      settings: preset?.settings ?? {},
      blocks: preset?.blocks ?? [],
      hidden: false,
    }
    // Insert before footer if it exists
    const footerIdx = sections.findIndex(s => s.type === "footer")
    const next = [...sections]
    if (footerIdx !== -1) next.splice(footerIdx, 0, newSection)
    else next.push(newSection)
    setSections(next)
    setSelectedPanel({ type: "section", sectionId: newSection.id })
    setIsDirty(true)
    scrollToSection(newSection.id)
  }

  // Add custom page
  const handleAddCustomPage = async () => {
    if (!newPageTitle.trim()) return
    setAddingPage(true)
    // Create the page key from title
    const pageKey = newPageTitle.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") as PageKey
    const newPage = { id: `page-${Date.now()}`, name: newPageTitle.trim(), key: pageKey }

    // Add default header + footer sections for new page
    const headerSchema = SECTION_SCHEMAS["header"]
    const footerSchema = SECTION_SCHEMAS["footer"]
    const defaultSections: SectionInstance[] = []
    if (headerSchema) {
      defaultSections.push({
        id: `header-${Date.now()}`,
        type: "header",
        name: headerSchema.name,
        settings: headerSchema.presets?.[0]?.settings ?? {},
        blocks: headerSchema.presets?.[0]?.blocks ?? [],
        hidden: false,
      })
    }
    if (footerSchema) {
      defaultSections.push({
        id: `footer-${Date.now() + 1}`,
        type: "footer",
        name: footerSchema.name,
        settings: footerSchema.presets?.[0]?.settings ?? {},
        blocks: footerSchema.presets?.[0]?.blocks ?? [],
        hidden: false,
      })
    }

    // Save sections for the new page
    try {
      await fetch(`/api/website-builder/themes/${installId}/sections`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page_key: pageKey, sections: defaultSections, mode: "draft" }),
      })
    } catch {}

    setCustomPages(prev => [...prev, newPage])
    setAddPageOpen(false)
    setNewPageTitle("")
    setAddingPage(false)

    // Navigate to new page
    setSectionsLoading(true)
    setCurrentPage(pageKey)
    setSelectedPanel({ type: "pages" })
    setPageBrowserOpen(false)
    setSections(defaultSections)
    setSectionsLoading(false)
  }

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) { e.preventDefault(); handleUndo() }
      if ((e.metaKey || e.ctrlKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); handleRedo() }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [handleUndo, handleRedo])

  // Save header/footer to all pages so they stay universal
  const syncHeaderFooterToAllPages = async (mode: "draft" | "publish" = "draft") => {
    const header = sections.find(s => s.type === "header")
    const footer = sections.find(s => s.type === "footer")
    if (!header && !footer) return

    // Fetch all pages for this install
    const res = await fetch(`/api/website-builder/themes/${installId}/sections/sync-global`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        header: header ?? null,
        footer: footer ?? null,
        current_page: currentPage,
        mode,
      }),
    })
    if (!res.ok) {
      console.warn("Failed to sync header/footer to other pages")
    }
  }

  const saveDraft = async () => {
    try {
      const settingsRes = await fetch(`/api/website-builder/themes/${installId}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft_settings: settingsDraft }),
      })
      if (!settingsRes.ok) {
        const d = await settingsRes.json().catch(() => ({}))
        showNotification(d.error ?? "Failed to save settings", "error")
        return
      }

      const sectionsRes = await fetch(`/api/website-builder/themes/${installId}/sections`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page_key: currentPage, sections, mode: "draft" }),
      })
      if (!sectionsRes.ok) {
        const d = await sectionsRes.json().catch(() => ({}))
        showNotification(d.error ?? "Failed to save sections", "error")
        return
      }

      // Sync header/footer to all other pages
      await syncHeaderFooterToAllPages("draft")

      setIsDirty(false)
      showNotification("Changes saved successfully")
    } catch {
      showNotification("Failed to save", "error")
    }
  }

  const publishChanges = async () => {
    setPublishing(true)
    try {
      // 1. Save current editor state as draft (settings + current page sections)
      const settingsRes = await fetch(`/api/website-builder/themes/${installId}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft_settings: settingsDraft }),
      })
      if (!settingsRes.ok) {
        const d = await settingsRes.json().catch(() => ({}))
        showNotification(d.error ?? "Failed to save settings", "error")
        setPublishing(false)
        return
      }

      const sectionsRes = await fetch(`/api/website-builder/themes/${installId}/sections`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page_key: currentPage, sections, mode: "draft" }),
      })
      if (!sectionsRes.ok) {
        const d = await sectionsRes.json().catch(() => ({}))
        showNotification(d.error ?? "Failed to save sections", "error")
        setPublishing(false)
        return
      }

      // 1b. Sync header/footer to all other pages before publish
      await syncHeaderFooterToAllPages("draft")

      // 2. Publish — promotes ALL pages' draft_sections → sections
      //    and draft_settings → settings atomically
      const res = await fetch(`/api/website-builder/themes/${installId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "publish" }),
      })

      if (!res.ok) {
        const d = await res.json()
        showNotification(d.error ?? "Failed to publish", "error")
        setPublishing(false)
        return
      }

      // Update local install status so subsequent saves also publish
      if (install) {
        setInstall({ ...install, status: "published" })
      }

      setIsDirty(false)
      setHasPublished(true)
      showNotification("Changes saved and published")
    } catch {
      showNotification("Failed to publish", "error")
    }
    setPublishing(false)
  }

  const handleSave = async () => {
    setSaving(true)
    if (install?.status === "published") {
      await publishChanges()
    } else {
      await saveDraft()
    }
    setSaving(false)
  }

  const activeThemeSettings: ThemeSettingsValues = settingsDraft

  // Narrow the selected section id safely
  const selectedSectionId: string | null =
    selectedPanel.type === "section" ? (selectedPanel as { type: "section"; sectionId: string }).sectionId : null

  // ── Sidebar panel rendering ─────────────────────────────────

  // Page browser content — shows all pages grouped by type
  const renderPageBrowser = () => {
    const search = pageBrowserSearch.toLowerCase()
    const filteredProducts = products.filter(p => p.title.toLowerCase().includes(search))
    const filteredCollections = collections.filter(c => c.name.toLowerCase().includes(search))
    const builtInPages = [
      { name: "Home Page", key: "home" as PageKey },
      { name: "About Page", key: "about" as PageKey },
      { name: "Contact Page", key: "contact" as PageKey },
    ]
    const allCustomPages = [
      ...builtInPages,
      ...customPages.map(p => ({ name: p.name, key: p.key })),
    ].filter(p => p.name.toLowerCase().includes(search))

    return (
      <div className="flex flex-col h-full animate-in fade-in duration-200">
        {/* Header with back button */}
        <div className="px-4 py-3 border-b border-border shrink-0">
          <button
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
            onClick={() => { setPageBrowserOpen(false); setSidebarMode("sections") }}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>
          <p className="text-sm font-semibold">Pages</p>
        </div>

        {/* Search */}
        <div className="px-3 pt-3 pb-2 shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search for page..."
              value={pageBrowserSearch}
              onChange={e => setPageBrowserSearch(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-4">

          {/* Custom Pages */}
          {allCustomPages.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center justify-between px-1 mb-1.5">
                <p className="text-xs font-bold text-foreground">Custom Pages</p>
                <button className="text-purple-600 hover:text-purple-700 cursor-pointer" title="Add page" onClick={() => setAddPageOpen(true)}>
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="border border-border rounded-lg overflow-hidden divide-y divide-border">
                {allCustomPages.map(p => (
                  <button
                    key={p.key}
                    className={cn(
                      "w-full text-left px-3 py-2.5 text-sm transition-colors hover:bg-muted/50",
                      currentPage === p.key && !selectedProductPage ? "text-purple-600 font-medium bg-purple-50" : "text-foreground"
                    )}
                    onClick={() => handlePageChange(p.key)}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Product Pages */}
          <div className="mb-4">
            <div className="flex items-center justify-between px-1 mb-1.5">
              <p className="text-xs font-bold text-foreground">Product Pages</p>
              <button className="text-purple-600 hover:text-purple-700" title="Add product page">
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            {productsLoading ? (
              <div className="flex items-center gap-2 px-3 py-4 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading products...
              </div>
            ) : filteredProducts.length > 0 ? (
              <div className="border border-border rounded-lg overflow-hidden divide-y divide-border">
                {filteredProducts.map(p => (
                  <button
                    key={p.id}
                    className={cn(
                      "w-full text-left px-3 py-2.5 text-sm transition-colors hover:bg-muted/50",
                      selectedProductPage === p.title ? "text-purple-600 font-medium bg-purple-50" : "text-foreground"
                    )}
                    onClick={() => handleSelectProductPage(p.id, p.title)}
                  >
                    {p.title}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground px-3 py-2">No products found</p>
            )}
          </div>

          {/* Collection Pages */}
          <div className="mb-4">
            <div className="flex items-center justify-between px-1 mb-1.5">
              <p className="text-xs font-bold text-foreground">Collection Pages</p>
            </div>
            {filteredCollections.length > 0 ? (
              <div className="border border-border rounded-lg overflow-hidden divide-y divide-border">
                {filteredCollections.map(c => (
                  <button
                    key={c.id}
                    className="w-full text-left px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-muted/50"
                    onClick={() => handlePageChange("home")}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground px-3 py-2">No collections found</p>
            )}
          </div>
        </div>
      </div>
    )
  }

  const renderSidebarContent = () => {
    // ── Page browser mode ──
    if (pageBrowserOpen) return renderPageBrowser()

    // ── General Settings mode ──
    if (sidebarMode === "settings") {
      // Show section settings if a section is selected
      if (selectedPanel.type === "section") {
        const section = sections.find(s => s.id === (selectedPanel as any).sectionId)
        if (!section) { setSelectedPanel({ type: "pages" }); return null }
        const schema = SECTION_SCHEMAS[section.type]
        // This will fall through to the existing SECTION panel code below
      } else {
        // Global theme settings
        return (
          <div className="flex flex-col h-full animate-in fade-in duration-150">
            <div className="px-4 py-3 border-b border-border shrink-0">
              <p className="text-sm font-semibold">General Settings</p>
              <p className="text-xs text-muted-foreground mt-0.5">Colors, fonts, buttons, spacing</p>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {THEME_SETTINGS_GROUPS.map(group => (
                <div key={group.id} className="mb-0.5">
                  <button
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
                      expandedSettings === group.id ? "bg-muted/80 text-foreground" : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                    )}
                    onClick={() => setExpandedSettings(expandedSettings === group.id ? null : group.id)}
                  >
                    {group.label}
                    <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", expandedSettings === group.id && "rotate-180")} />
                  </button>
                  {expandedSettings === group.id && (
                    <div className="px-3 py-3 space-y-4 animate-in fade-in slide-in-from-top-1 duration-150">
                      {/* Custom Branding section with proper image pickers + sliders */}
                      {group.id === "branding" ? (
                        <>
                          {/* Store name */}
                          <div>
                            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Store name</label>
                            <input
                              type="text"
                              className="w-full h-10 px-3 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-colors"
                              placeholder="My Store"
                              value={typeof settingsDraft.brand_name === "string" ? settingsDraft.brand_name : ""}
                              onChange={e => updateSetting("brand_name", e.target.value)}
                            />
                          </div>

                          {/* Logo image — synced with header section */}
                          <WbImagePicker
                            label="LOGO IMAGE"
                            value={typeof settingsDraft.logo_url === "string" ? settingsDraft.logo_url as string : undefined}
                            onChange={url => updateSetting("logo_url", url ?? "")}
                            aspectRatio="logo"
                            folder="logos"
                          />

                          {/* Logo height slider — synced with header section */}
                          {typeof settingsDraft.logo_url === "string" && settingsDraft.logo_url && (
                            <WbSlider
                              label="Logo height"
                              value={settingsDraft.logo_width}
                              onChange={v => updateSetting("logo_width", v)}
                              min={24}
                              max={120}
                              step={2}
                              unit="px"
                              defaultValue={40}
                            />
                          )}

                          {/* Favicon */}
                          <WbImagePicker
                            label="FAVICON"
                            value={typeof settingsDraft.favicon_url === "string" ? settingsDraft.favicon_url as string : undefined}
                            onChange={url => updateSetting("favicon_url", url ?? "")}
                            aspectRatio="square"
                            folder="logos"
                          />

                          {/* Tagline */}
                          <div>
                            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Tagline</label>
                            <input
                              type="text"
                              className="w-full h-10 px-3 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-colors"
                              placeholder="Your trusted digital store"
                              value={typeof settingsDraft.tagline === "string" ? settingsDraft.tagline : ""}
                              onChange={e => updateSetting("tagline", e.target.value)}
                            />
                          </div>

                          <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                            <Info className="h-3 w-3 shrink-0 mt-0.5" />
                            Logo and height are synced with the Header section. Changes here update the header everywhere.
                          </p>
                        </>
                      ) : (
                        /* All other groups use modern Wb* components */
                        group.fields.map(field => {
                          const val = settingsDraft[field.id as keyof ThemeSettingsValues] ?? field.default
                          return (
                            <div key={field.id}>
                              {field.type === "toggle" ? (
                                <WbToggle
                                  label={field.label}
                                  value={val}
                                  onChange={v => updateSetting(field.id, v)}
                                  info={field.info}
                                />
                              ) : field.type === "range" ? (
                                <WbSlider
                                  label={field.label}
                                  value={val}
                                  onChange={v => updateSetting(field.id, v)}
                                  min={field.min ?? 0}
                                  max={field.max ?? 100}
                                  step={field.step ?? 1}
                                  unit={field.unit ?? ""}
                                  defaultValue={typeof field.default === "number" ? field.default : 0}
                                />
                              ) : field.type === "select" || field.type === "font" ? (
                                <WbSelect
                                  label={field.label}
                                  value={val}
                                  onChange={v => updateSetting(field.id, v)}
                                  options={field.options ?? []}
                                />
                              ) : field.type === "radio" ? (
                                <WbRadioSegment
                                  label={field.label}
                                  value={val}
                                  onChange={v => updateSetting(field.id, v)}
                                  options={field.options ?? []}
                                />
                              ) : field.type === "image" ? (
                                <>
                                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{field.label}</label>
                                  <WbImagePicker
                                    value={typeof val === "string" ? val : undefined}
                                    onChange={url => updateSetting(field.id, url ?? "")}
                                    aspectRatio="video"
                                    folder="sections"
                                  />
                                </>
                              ) : field.type === "color" ? (
                                <>
                                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{field.label}</label>
                                  <FieldEditor field={field} value={val} onChange={v => updateSetting(field.id, v)} />
                                </>
                              ) : field.type === "header" || field.type === "paragraph" ? (
                                <FieldEditor field={field} value={val} onChange={v => updateSetting(field.id, v)} />
                              ) : (
                                <>
                                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{field.label}</label>
                                  <FieldEditor field={field} value={val} onChange={v => updateSetting(field.id, v)} />
                                </>
                              )}
                              {field.type !== "toggle" && field.info && (
                                <p className="text-[11px] text-muted-foreground mt-1">{field.info}</p>
                              )}
                            </div>
                          )
                        })
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      }
    }

    // ── Sections mode — PAGES panel (default — shows section list) ──
    if (selectedPanel.type === "pages") {
      const header = sections.find(s => s.type === "header")
      const footer = sections.find(s => s.type === "footer")
      const bodySection = sections.filter(s => s.type !== "header" && s.type !== "footer")
      const pageLabel = selectedProductPage
        ? selectedProductPage
        : (PAGE_META[currentPage]?.label ?? currentPage)

      return (
        <div className="flex flex-col h-full animate-in fade-in duration-150">
          {/* Page selector — opens Pages panel */}
          <div className="px-3 py-3 border-b border-border shrink-0">
            <button
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-border bg-background hover:bg-muted/50 transition-colors text-sm font-medium cursor-pointer"
              onClick={() => setPageBrowserOpen(true)}
            >
              <span className="truncate">{pageLabel}</span>
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground ml-2" />
            </button>
          </div>

          {/* Skeleton loading when switching pages */}
          {sectionsLoading ? (
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="h-12 rounded-lg bg-muted/60 animate-pulse" style={{ animationDelay: `${i * 80}ms` }} />
              ))}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-3 space-y-0.5 animate-in fade-in slide-in-from-bottom-1 duration-200">
              {/* Header (global) */}
              {header && (
                <div className="border border-border rounded-lg mb-3">
                  <SidebarSectionRow
                    section={header}
                    isSelected={selectedSectionId === header.id}
                    onSelect={() => { setSelectedPanel({ type: "section", sectionId: header.id }); scrollToSection(header.id) }}
                    onToggleHide={() => toggleSectionHidden(header.id)}
                    onDuplicate={() => duplicateSection(header.id)}
                    onRemove={() => removeSection(header.id)}
                    isStructure
                  />
                </div>
              )}

              {/* Body sections — no connector line */}
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={bodySection.map(s => s.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-0.5">
                    {bodySection.map(section => (
                      <SortableSectionRow
                        key={section.id}
                        section={section}
                        isSelected={selectedSectionId === section.id}
                        onSelect={() => { setSelectedPanel({ type: "section", sectionId: section.id }); scrollToSection(section.id) }}
                        onToggleHide={() => toggleSectionHidden(section.id)}
                        onDuplicate={() => duplicateSection(section.id)}
                        onRemove={() => removeSection(section.id)}
                      />
                    ))}
                    <button
                      className="w-full flex items-center gap-2.5 px-3 py-3 text-sm text-purple-600 hover:bg-purple-50/60 rounded-lg transition-colors font-medium"
                      onClick={() => setAddSectionOpen(true)}
                    >
                      <div className="h-8 w-8 rounded-lg border-2 border-dashed border-purple-300 flex items-center justify-center">
                        <Plus className="h-4 w-4" />
                      </div>
                      Add section
                    </button>
                  </div>
                </SortableContext>
              </DndContext>

              {/* Footer (global) */}
              {footer && (
                <div className="border border-border rounded-lg mt-3">
                  <SidebarSectionRow
                    section={footer}
                    isSelected={selectedSectionId === footer.id}
                    onSelect={() => { setSelectedPanel({ type: "section", sectionId: footer.id }); scrollToSection(footer.id) }}
                    onToggleHide={() => toggleSectionHidden(footer.id)}
                    onDuplicate={() => duplicateSection(footer.id)}
                    onRemove={() => removeSection(footer.id)}
                    isStructure
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )
    }

    // SECTION panel - Header gets special treatment
    if (selectedPanel.type === "section") {
      const section = sections.find(s => s.id === selectedPanel.sectionId)
      if (!section) return null
      const schema = SECTION_SCHEMAS[section.type]

      // Special Header Section UI matching the screenshot
      if (section.type === "header") {
        return (
          <HeaderSectionSettings
            section={section}
            schema={schema}
            onBack={() => setSelectedPanel({ type: "pages" })}
            onUpdateSetting={(key, val) => updateSectionSetting(section.id, key, val)}
            onUpdateBlockSetting={(blockId, key, val) => updateBlockSetting(section.id, blockId, key, val)}
            onAddBlock={(type) => addBlock(section.id, type)}
            onRemoveBlock={(blockId) => removeBlock(section.id, blockId)}
          />
        )
      }

      return (
        <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-2 duration-150">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2 shrink-0">
            <button
              className="text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setSelectedPanel({ type: "pages" })}
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{section.name}</p>
              <p className="text-[11px] text-muted-foreground">{schema?.name ?? section.type}</p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {schema?.fields && schema.fields.length > 0 && (
              <div className="p-4 space-y-4">
                {schema.fields.map(field => (
                  <div key={field.id}>
                    {field.type !== "header" && field.type !== "paragraph" && (
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{field.label}</label>
                    )}
                    <FieldEditor
                      field={field}
                      value={section.settings[field.id]}
                      onChange={val => updateSectionSetting(section.id, field.id, val)}
                    />
                    {field.type !== "header" && field.type !== "paragraph" && field.info && (
                      <p className="text-[11px] text-muted-foreground mt-1">{field.info}</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Blocks */}
            {schema?.blocks && (
              <div className="border-t border-border p-4">
                <p className="text-xs font-semibold mb-3">
                  {schema.blocks[0]?.name ? `${schema.blocks[0].name}s` : "Blocks"}
                </p>
                <div className="space-y-2">
                  {(section.blocks ?? []).map(block => {
                    const blockSchema = schema.blocks?.find(b => b.type === block.type)
                    return (
                      <details key={block.id} className="group border border-border rounded-lg overflow-hidden">
                        <summary className="flex items-center justify-between px-3 py-2.5 cursor-pointer list-none bg-muted/30 hover:bg-muted/50">
                          <span className="text-sm font-medium">
                            {blockSchema?.name ?? block.type}
                            {!!block.settings.author && <span className="ml-1 opacity-50">— {String(block.settings.author)}</span>}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              className="h-6 w-6 flex items-center justify-center rounded hover:bg-red-50 text-red-400 hover:text-red-600"
                              onClick={e => { e.preventDefault(); removeBlock(section.id, block.id) }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground group-open:rotate-180 transition-transform" />
                          </div>
                        </summary>
                        <div className="px-3 pb-3 space-y-3 border-t border-border pt-3">
                          {blockSchema?.fields.map(field => (
                            <div key={field.id}>
                              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{field.label}</label>
                              <FieldEditor
                                field={field}
                                value={block.settings[field.id]}
                                onChange={val => updateBlockSetting(section.id, block.id, field.id, val)}
                              />
                            </div>
                          ))}
                        </div>
                      </details>
                    )
                  })}
                </div>

                {(!schema.max_blocks || (section.blocks?.length ?? 0) < schema.max_blocks) && (
                  <button
                    className="mt-2 w-full flex items-center justify-center gap-1.5 py-2.5 text-sm text-muted-foreground hover:text-foreground border border-dashed border-border hover:border-purple-400 rounded-lg transition-colors"
                    onClick={() => addBlock(section.id, schema.blocks![0].type)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add {schema.blocks[0]?.name?.toLowerCase() ?? "block"}
                  </button>
                )}
              </div>
            )}

            {/* Section actions */}
            <div className="border-t border-border p-4 flex gap-2">
              <button
                className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs text-muted-foreground hover:text-foreground border border-border hover:border-foreground/30 rounded-lg transition-colors"
                onClick={() => toggleSectionHidden(section.id)}
              >
                {section.hidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                {section.hidden ? "Show" : "Hide"}
              </button>
              <button
                className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs text-muted-foreground hover:text-foreground border border-border hover:border-foreground/30 rounded-lg transition-colors"
                onClick={() => duplicateSection(section.id)}
              >
                <Copy className="h-3.5 w-3.5" />
                Duplicate
              </button>
              <button
                className="flex items-center justify-center gap-1.5 py-2 px-3 text-xs text-red-400 hover:text-red-600 border border-border hover:border-red-200 rounded-lg transition-colors"
                onClick={() => removeSection(section.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )
    }

    // THEME SETTINGS panel
    if (selectedPanel.type === "theme_settings") {
      return (
        <div className="flex flex-col h-full">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2 shrink-0">
            <button className="text-muted-foreground hover:text-foreground transition-colors" onClick={() => setSelectedPanel({ type: "pages" })}>
              <ArrowLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-semibold">Theme settings</span>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {THEME_SETTINGS_GROUPS.map(group => (
              <div key={group.id} className="mb-1">
                <button
                  className={cn(
                    "w-full flex items-center justify-between py-2.5 px-3 rounded-lg text-left transition-colors",
                    expandedSettings === group.id ? "bg-muted" : "hover:bg-muted/50"
                  )}
                  onClick={() => setExpandedSettings(expandedSettings === group.id ? null : group.id)}
                >
                  <span className="text-sm font-medium">{group.label}</span>
                  <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", expandedSettings === group.id && "rotate-180")} />
                </button>
                {expandedSettings === group.id && (
                  <div className="px-3 pb-4 space-y-4">
                    {group.id === "branding" ? (
                      <>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Store name</label>
                          <input
                            type="text"
                            className="w-full h-10 px-3 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-colors"
                            placeholder="My Store"
                            value={typeof settingsDraft.brand_name === "string" ? settingsDraft.brand_name : ""}
                            onChange={e => updateSetting("brand_name", e.target.value)}
                          />
                        </div>
                        <WbImagePicker
                          label="LOGO IMAGE"
                          value={typeof settingsDraft.logo_url === "string" ? settingsDraft.logo_url as string : undefined}
                          onChange={url => updateSetting("logo_url", url ?? "")}
                          aspectRatio="logo"
                          folder="logos"
                        />
                        {typeof settingsDraft.logo_url === "string" && settingsDraft.logo_url && (
                          <WbSlider
                            label="Logo height"
                            value={settingsDraft.logo_width}
                            onChange={v => updateSetting("logo_width", v)}
                            min={24}
                            max={120}
                            step={2}
                            unit="px"
                            defaultValue={40}
                          />
                        )}
                        <WbImagePicker
                          label="FAVICON"
                          value={typeof settingsDraft.favicon_url === "string" ? settingsDraft.favicon_url as string : undefined}
                          onChange={url => updateSetting("favicon_url", url ?? "")}
                          aspectRatio="square"
                          folder="logos"
                        />
                        <div>
                          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Tagline</label>
                          <input
                            type="text"
                            className="w-full h-10 px-3 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-colors"
                            placeholder="Your trusted digital store"
                            value={typeof settingsDraft.tagline === "string" ? settingsDraft.tagline : ""}
                            onChange={e => updateSetting("tagline", e.target.value)}
                          />
                        </div>
                        <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                          <Info className="h-3 w-3 shrink-0 mt-0.5" />
                          Logo and height are synced with the Header section.
                        </p>
                      </>
                    ) : (
                      group.fields.map(field => {
                        const val = settingsDraft[field.id as keyof ThemeSettingsValues] ?? field.default
                        return (
                          <div key={field.id}>
                            {field.type === "toggle" ? (
                              <WbToggle
                                label={field.label}
                                value={val}
                                onChange={v => updateSetting(field.id, v)}
                                info={field.info}
                              />
                            ) : field.type === "range" ? (
                              <WbSlider
                                label={field.label}
                                value={val}
                                onChange={v => updateSetting(field.id, v)}
                                min={field.min ?? 0}
                                max={field.max ?? 100}
                                step={field.step ?? 1}
                                unit={field.unit ?? ""}
                                defaultValue={typeof field.default === "number" ? field.default : 0}
                              />
                            ) : field.type === "select" || field.type === "font" ? (
                              <WbSelect
                                label={field.label}
                                value={val}
                                onChange={v => updateSetting(field.id, v)}
                                options={field.options ?? []}
                              />
                            ) : field.type === "radio" ? (
                              <WbRadioSegment
                                label={field.label}
                                value={val}
                                onChange={v => updateSetting(field.id, v)}
                                options={field.options ?? []}
                              />
                            ) : field.type === "image" ? (
                              <>
                                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{field.label}</label>
                                <WbImagePicker
                                  value={typeof val === "string" ? val : undefined}
                                  onChange={url => updateSetting(field.id, url ?? "")}
                                  aspectRatio="video"
                                  folder="sections"
                                />
                              </>
                            ) : field.type === "color" ? (
                              <>
                                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{field.label}</label>
                                <FieldEditor field={field} value={val} onChange={v => updateSetting(field.id, v)} />
                              </>
                            ) : field.type === "header" || field.type === "paragraph" ? (
                              <FieldEditor field={field} value={val} onChange={v => updateSetting(field.id, v)} />
                            ) : (
                              <>
                                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{field.label}</label>
                                <FieldEditor field={field} value={val} onChange={v => updateSetting(field.id, v)} />
                              </>
                            )}
                            {field.type !== "toggle" && field.info && (
                              <p className="text-[11px] text-muted-foreground mt-1">{field.info}</p>
                            )}
                          </div>
                        )
                      })
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )
    }

    return null
  }

  // ── Loading state — no separate screen, render the shell with skeleton ──

  // ── Website URL display ────────────────────────────────────
  const websiteUrl = username ? getWebsiteShareUrl(username) : ""
  const websiteUrlDisplay = username ? getWebsiteUrlDisplay(username) : ""

  // ── Main editor layout ─────────────────────────────────────
  return (
    <div className="h-svh flex flex-col bg-muted/30 overflow-hidden">
      {/* ── Top bar ── */}
      <header className="h-12 bg-background border-b border-border flex items-center px-3 md:px-4 gap-2 shrink-0 z-30">
        {/* Left side: Back, theme name, Live badge, 3-dots */}
        <div className="flex items-center gap-2 min-w-0">
          {isMobileView && (
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}>
              <PanelLeft className="h-4 w-4" />
            </Button>
          )}

          {/* Back button */}
          <button
            className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-muted transition-colors shrink-0"
            onClick={() => {
              if (isDirty && !window.confirm("You have unsaved changes. Are you sure you want to leave?")) return
              router.push("/app/website-builder")
            }}
            title="Back to Website Builder"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>

          {/* Theme name + Live badge */}
          <span className="text-sm font-semibold text-foreground truncate hidden md:block max-w-[180px]">{install?.name}</span>
          {install?.status === "published" && (
            <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-200 text-[10px] font-semibold uppercase tracking-wide shrink-0 px-2 py-0">
              <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Live
            </Badge>
          )}

          {/* 3-dots menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-muted transition-colors shrink-0">
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52 z-[100]">
              {websiteUrl && (
                <DropdownMenuItem onClick={() => window.open(websiteUrl, "_blank")} className="cursor-pointer">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  View Live
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => { setSidebarMode("settings"); setPageBrowserOpen(false); setSelectedPanel({ type: "theme_settings" }) }} className="cursor-pointer">
                <Settings className="mr-2 h-4 w-4" />
                Theme Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => {
                if (isDirty && !window.confirm("You have unsaved changes. Are you sure you want to leave?")) return
                router.push("/app")
              }} className="cursor-pointer">
                Back to Dashboard
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Undo / Redo */}
          <div className="flex items-center border border-border rounded-lg overflow-hidden shrink-0 ml-1">
            <button
              className="h-8 w-8 flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              onClick={handleUndo}
              disabled={undoStack.length === 0}
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="h-4 w-4 text-neutral-600" />
            </button>
            <div className="w-px h-5 bg-border" />
            <button
              className="h-8 w-8 flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              onClick={handleRedo}
              disabled={redoStack.length === 0}
              title="Redo (Ctrl+Shift+Z)"
            >
              <Redo2 className="h-4 w-4 text-neutral-600" />
            </button>
          </div>
        </div>

        {/* Center: unsaved indicator */}
        <div className="flex-1 flex items-center justify-center min-w-0">
          {isDirty && (
            <span className="text-xs text-amber-600 hidden md:inline">Unsaved changes</span>
          )}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2 shrink-0">
          {/* View Live — globe icon only */}
          {websiteUrl && (
            <button
              className="h-9 w-9 hidden sm:flex items-center justify-center rounded-lg border border-neutral-200 bg-transparent hover:bg-neutral-100 transition-colors cursor-pointer"
              onClick={() => window.open(websiteUrl, "_blank")}
              title="View live website"
            >
              <Globe className="h-4 w-4 text-neutral-600" />
            </button>
          )}

          {/* Device Switcher — pill toggle */}
          <div className="hidden sm:flex items-center bg-neutral-100 rounded-lg p-0.5 shrink-0">
            <button
              className={cn("h-7 w-7 flex items-center justify-center rounded-md transition-all duration-150", device === "desktop" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
              onClick={() => setDevice("desktop")}
              title="Desktop"
            >
              <Monitor className="h-3.5 w-3.5" />
            </button>
            <button
              className={cn("h-7 w-7 flex items-center justify-center rounded-md transition-all duration-150", device === "mobile" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
              onClick={() => setDevice("mobile")}
              title="Mobile"
            >
              <Smartphone className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Preview */}
          <button
            className="h-8 w-8 hidden sm:flex items-center justify-center rounded-lg border border-border hover:bg-muted transition-colors cursor-pointer"
            onClick={() => {
              if (!websiteUrl) return
              const urlWithPreview = `${websiteUrl}${websiteUrl.includes("?") ? "&" : "?"}builder_preview=1&show_preview_bar=1`
              window.open(urlWithPreview, "_blank", "noopener,noreferrer")
            }}
            title="Preview"
          >
            <ExternalLink className="h-3.5 w-3.5 text-neutral-600" />
          </button>

          {/* Save button — publishes automatically if theme is live */}
          <Button
            size="sm"
            className={cn(
              "h-9 cursor-pointer min-w-[80px] transition-all duration-200 text-white",
              saving
                ? "bg-purple-600 hover:bg-purple-600"
                : isDirty
                  ? "bg-purple-600 hover:bg-purple-700"
                  : "bg-purple-600/50 hover:bg-purple-600/50 cursor-default"
            )}
            onClick={handleSave}
            disabled={saving || !isDirty}
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                <span>Saving...</span>
              </>
            ) : isDirty ? (
              <span>Save</span>
            ) : (
              <span>Saved</span>
            )}
          </Button>
        </div>
      </header>

      {/* ── Top notification bar ── */}
      <div
        className={cn(
          "fixed top-0 left-0 right-0 z-[100] flex justify-center pointer-events-none transition-all duration-300 ease-out",
          notification ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0"
        )}
      >
        <div
          className={cn(
            "mt-3 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium pointer-events-auto flex items-center gap-2",
            notification?.type === "error"
              ? "bg-red-600 text-white"
              : "bg-neutral-900 text-white"
          )}
        >
          {notification?.type === "error" ? (
            <X className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <Check className="h-3.5 w-3.5 shrink-0" />
          )}
          {notification?.message}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* ── Left sidebar ── */}
        {!isMobileView ? (
          <div className="relative flex-shrink-0 border-r border-border bg-background flex h-full overflow-hidden">
            {/* Vertical icon rail */}
            <div className="w-12 border-r border-border bg-muted/30 flex flex-col items-center py-3 gap-1 shrink-0">
              <button
                className={cn(
                  "h-10 w-10 flex items-center justify-center rounded-lg transition-colors",
                  sidebarMode === "sections" && !pageBrowserOpen
                    ? "bg-neutral-200/80 text-foreground"
                    : "text-muted-foreground hover:bg-neutral-100 hover:text-foreground"
                )}
                onClick={() => { setSidebarMode("sections"); setPageBrowserOpen(false); setSelectedPanel({ type: "pages" }) }}
                title="Sections"
              >
                <Layers className="h-[18px] w-[18px]" />
              </button>
              <button
                className={cn(
                  "h-10 w-10 flex items-center justify-center rounded-lg transition-colors",
                  pageBrowserOpen
                    ? "bg-neutral-200/80 text-foreground"
                    : "text-muted-foreground hover:bg-neutral-100 hover:text-foreground"
                )}
                onClick={() => { setPageBrowserOpen(true); setSelectedPanel({ type: "pages" }) }}
                title="Pages"
              >
                <FileText className="h-[18px] w-[18px]" />
              </button>
              <button
                className={cn(
                  "h-10 w-10 flex items-center justify-center rounded-lg transition-colors",
                  sidebarMode === "settings" && !pageBrowserOpen
                    ? "bg-neutral-200/80 text-foreground"
                    : "text-muted-foreground hover:bg-neutral-100 hover:text-foreground"
                )}
                onClick={() => { setSidebarMode("settings"); setPageBrowserOpen(false); setSelectedPanel({ type: "theme_settings" }) }}
                title="General Settings"
              >
                <Settings className="h-[18px] w-[18px]" />
              </button>
            </div>
            {/* Sidebar content panel */}
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden" style={{ width: sidebarWidth - 48, minWidth: 232 }}>
              <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
                {renderSidebarContent()}
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Mobile sidebar overlay */}
            <div
              className={cn(
                "absolute inset-y-0 left-0 z-30 w-[85vw] max-w-[360px] bg-background border-r border-border transition-transform duration-300 ease-in-out flex",
                mobileSidebarOpen ? "translate-x-0" : "-translate-x-full",
              )}
              style={{ top: "48px" }}
            >
              {/* Mobile icon rail */}
              <div className="w-12 border-r border-border bg-muted/30 flex flex-col items-center py-3 gap-1 shrink-0">
                <button
                  className={cn("h-10 w-10 flex items-center justify-center rounded-lg transition-colors", sidebarMode === "sections" && !pageBrowserOpen ? "bg-neutral-200/80 text-foreground" : "text-muted-foreground hover:bg-neutral-100")}
                  onClick={() => { setSidebarMode("sections"); setPageBrowserOpen(false); setSelectedPanel({ type: "pages" }) }}
                >
                  <Layers className="h-[18px] w-[18px]" />
                </button>
                <button
                  className={cn("h-10 w-10 flex items-center justify-center rounded-lg transition-colors", pageBrowserOpen ? "bg-neutral-200/80 text-foreground" : "text-muted-foreground hover:bg-neutral-100")}
                  onClick={() => { setPageBrowserOpen(true); setSelectedPanel({ type: "pages" }) }}
                >
                  <FileText className="h-[18px] w-[18px]" />
                </button>
                <button
                  className={cn("h-10 w-10 flex items-center justify-center rounded-lg transition-colors", sidebarMode === "settings" && !pageBrowserOpen ? "bg-neutral-200/80 text-foreground" : "text-muted-foreground hover:bg-neutral-100")}
                  onClick={() => { setSidebarMode("settings"); setPageBrowserOpen(false); setSelectedPanel({ type: "theme_settings" }) }}
                >
                  <Settings className="h-[18px] w-[18px]" />
                </button>
              </div>
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
                  {renderSidebarContent()}
                </div>
              </div>
            </div>
            {mobileSidebarOpen && (
              <div className="absolute inset-0 z-20 bg-black/30" style={{ top: "48px" }} onClick={() => setMobileSidebarOpen(false)} />
            )}
          </>
        )}

        {/* ── Canvas ── */}
        <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden bg-muted/50" style={{ paddingTop: device === "mobile" ? "16px" : "24px", paddingLeft: device === "mobile" ? "16px" : "24px", paddingRight: device === "mobile" ? "16px" : "24px", paddingBottom: 0 }}>
          <div
            className={cn(
              "bg-white shadow-lg transition-all duration-300 rounded-t-xl mx-auto flex flex-col",
              device === "mobile" ? "w-[360px]" : "w-full max-w-[1400px]",
            )}
            style={{ minHeight: "calc(100vh - 72px)" }}
          >
            {/* Loading skeleton for canvas — page switch */}
            {(loading || canvasLoading) && (
              <div>
                <div className="h-14 bg-neutral-100/60 animate-pulse" />
                <div className="h-[50vh] flex items-center justify-center bg-neutral-50/40">
                  <div className="flex flex-col items-center gap-3">
                    <div className="h-7 w-7 border-2 border-neutral-300/60 border-t-transparent rounded-full animate-spin" />
                    <p className="text-xs text-neutral-400">Loading page...</p>
                  </div>
                </div>
                <div className="h-20 bg-neutral-100/40 animate-pulse" style={{ animationDelay: "200ms" }} />
              </div>
            )}

            {!loading && !canvasLoading && (
              <>
                {/* Announcement bar */}
                {settingsDraft.announcement_bar_enabled && settingsDraft.announcement_bar_text && (
                  <div
                    className="w-full py-2 text-center text-sm font-medium"
                    style={{
                      background: String(settingsDraft.announcement_bar_bg ?? "#6366f1"),
                      color: String(settingsDraft.announcement_bar_color ?? "#ffffff"),
                    }}
                  >
                    {String(settingsDraft.announcement_bar_text)}
                  </div>
                )}

                {/* Header */}
                {sections.filter(s => s.type === "header").map(section => (
                  <div key={section.id} id={`wb-section-${section.id}`}>
                    <SectionRenderer section={section} theme={activeThemeSettings} isEditing={true} isSelected={selectedSectionId === section.id} onClick={() => { setSelectedPanel({ type: "section", sectionId: section.id }); scrollToSection(section.id) }} />
                  </div>
                ))}

                {/* Body sections — flex-1 so footer sticks to bottom without trailing whitespace */}
                <div className="flex-1">
                  {sections.filter(s => s.type !== "header" && s.type !== "footer").map(section => (
                    <div key={section.id} id={`wb-section-${section.id}`}>
                      <SectionRenderer section={section} theme={activeThemeSettings} isEditing={true} isSelected={selectedSectionId === section.id} onClick={() => { setSelectedPanel({ type: "section", sectionId: section.id }); scrollToSection(section.id) }} />
                    </div>
                  ))}

                  {/* Empty page — between header and footer */}
                  {sections.filter(s => s.type !== "header" && s.type !== "footer").length === 0 && (
                    <div className="py-24 flex items-center justify-center text-center">
                      <div>
                        <p className="text-xl font-bold tracking-tight text-neutral-300 uppercase mb-1">Empty Page</p>
                        <p className="text-sm text-neutral-400 mb-4">Create your beautiful page by adding sections</p>
                        <button className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-purple-600 border border-purple-200 rounded-lg hover:bg-purple-50 transition-colors" onClick={() => setAddSectionOpen(true)}>
                          <Plus className="h-4 w-4" />
                          Add a section
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer */}
                {sections.filter(s => s.type === "footer").map(section => (
                  <div key={section.id} id={`wb-section-${section.id}`}>
                    <SectionRenderer section={section} theme={activeThemeSettings} isEditing={true} isSelected={selectedSectionId === section.id} onClick={() => { setSelectedPanel({ type: "section", sectionId: section.id }); scrollToSection(section.id) }} />
                  </div>
                ))}
              </>
            )}
          </div>
        </main>
      </div>

      {/* ── Add Section Modal ── */}
      <AddSectionModal
        open={addSectionOpen}
        onOpenChange={setAddSectionOpen}
        onAddSection={addSection}
      />

      {/* ── Add Custom Page Modal ── */}
      <Dialog open={addPageOpen} onOpenChange={setAddPageOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Add New Custom Page</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Page title</label>
              <Input
                placeholder="e.g. FAQ, Shipping, Terms..."
                value={newPageTitle}
                onChange={e => setNewPageTitle(e.target.value)}
                className="h-9"
                autoFocus
                onKeyDown={e => { if (e.key === "Enter" && newPageTitle.trim()) handleAddCustomPage() }}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => { setAddPageOpen(false); setNewPageTitle("") }} disabled={addingPage}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-purple-600 text-white hover:bg-purple-700 min-w-[70px]"
              onClick={handleAddCustomPage}
              disabled={!newPageTitle.trim() || addingPage}
            >
              {addingPage ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                  Adding...
                </>
              ) : (
                "Add"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Edit All Product Pages Confirmation Modal ── */}
      <Dialog open={editAllConfirmOpen} onOpenChange={setEditAllConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl">Are you sure?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm text-muted-foreground">
            <p>Editing all product pages means that you can change all your store product pages at the same time from one place.</p>
            <p>For example, you can add a slideshow section to all your product pages simultaneously without needing to add it one by one.</p>
            <p>This is a great way to save a lot of effort while you make bulk changes.</p>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setEditAllConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-purple-600 text-white hover:bg-purple-700"
              onClick={() => {
                setEditAllProductPages(true)
                setEditAllConfirmOpen(false)
                setSelectedProductPage(null)
              }}
            >
              Start Editing All
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Sortable wrapper for drag-and-drop ───────────────────────
function SortableSectionRow(props: Parameters<typeof SidebarSectionRow>[0]) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.section.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  }
  return (
    <div ref={setNodeRef} style={style}>
      <SidebarSectionRow {...props} dragHandleProps={{ ...attributes, ...listeners }} />
    </div>
  )
}

// ── Sidebar section row ──────────────────────────────────────
function SidebarSectionRow({
  section,
  isSelected,
  onSelect,
  onToggleHide,
  onDuplicate,
  onRemove,
  isStructure = false,
  dragHandleProps,
}: {
  section: SectionInstance
  isSelected: boolean
  onSelect: () => void
  onToggleHide: () => void
  onDuplicate: () => void
  onRemove: () => void
  isStructure?: boolean
  dragHandleProps?: Record<string, unknown>
}) {
  const [contextMenuOpen, setContextMenuOpen] = useState(false)
  const rowRef = useRef<HTMLDivElement>(null)

  return (
    <div className="relative" ref={rowRef}>
      <div
        className={cn(
          "group flex items-center gap-2 px-2.5 py-2.5 rounded-lg cursor-pointer transition-colors",
          isSelected ? "bg-purple-600 text-white" : "hover:bg-muted text-foreground",
          section.hidden && "opacity-50",
        )}
        onClick={onSelect}
        onContextMenu={e => {
          if (isStructure) return
          e.preventDefault()
          setContextMenuOpen(true)
        }}
      >
        {!isStructure && (
          <span
            {...(dragHandleProps ?? {})}
            className="shrink-0 cursor-grab active:cursor-grabbing touch-none"
            onClick={e => e.stopPropagation()}
          >
            <GripVertical className={cn("h-3.5 w-3.5 opacity-30", isSelected && "opacity-60")} />
          </span>
        )}
        <SectionIcon type={section.type} className={isSelected ? "text-white" : "text-muted-foreground"} />
        <span className="flex-1 text-sm font-medium truncate">{section.name}</span>
        {section.hidden && (
          <EyeOff className={cn("h-3 w-3 shrink-0", isSelected ? "opacity-60" : "opacity-40")} />
        )}

        {/* Hover actions — only eye + trash */}
        {!isStructure && (
          <div className={cn("items-center gap-0.5 hidden group-hover:flex", isSelected && "flex")}>
            <button
              className={cn("h-5 w-5 rounded flex items-center justify-center transition-colors", isSelected ? "hover:bg-white/20" : "hover:bg-muted-foreground/10")}
              onClick={e => { e.stopPropagation(); onToggleHide() }}
              title={section.hidden ? "Show" : "Hide"}
            >
              {section.hidden ? <Eye className="h-2.5 w-2.5" /> : <EyeOff className="h-2.5 w-2.5" />}
            </button>
            <button
              className={cn("h-5 w-5 rounded flex items-center justify-center transition-colors", isSelected ? "hover:bg-white/20 text-red-300" : "hover:bg-red-100 text-red-400")}
              onClick={e => { e.stopPropagation(); onRemove() }}
              title="Remove"
            >
              <Trash2 className="h-2.5 w-2.5" />
            </button>
          </div>
        )}
      </div>

      {/* Right-click context menu — positioned below the row */}
      {contextMenuOpen && (
        <>
          <div className="fixed inset-0 z-[200]" onClick={() => setContextMenuOpen(false)} onContextMenu={e => { e.preventDefault(); setContextMenuOpen(false) }} />
          <div className="absolute left-2 right-2 top-full mt-1 z-[201] bg-white rounded-lg shadow-xl border border-border py-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
            <button className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors rounded-md mx-0" onClick={() => { onDuplicate(); setContextMenuOpen(false) }}>
              <Copy className="h-3.5 w-3.5 text-muted-foreground" />
              Duplicate
            </button>
            <button className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors rounded-md" onClick={() => { onToggleHide(); setContextMenuOpen(false) }}>
              {section.hidden ? <Eye className="h-3.5 w-3.5 text-muted-foreground" /> : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
              {section.hidden ? "Show" : "Hide"}
            </button>
            <div className="h-px bg-border mx-2 my-1" />
            <button className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-500 hover:bg-red-50 transition-colors rounded-md" onClick={() => { onRemove(); setContextMenuOpen(false) }}>
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  )
}
