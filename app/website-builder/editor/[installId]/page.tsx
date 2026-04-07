"use client"

import { useEffect, useState, useCallback, useRef, use } from "react"
import { createPortal } from "react-dom"
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
  Upload, ImageIcon, Info, RefreshCw, Crop, CheckCircle,
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
  PageKey, EditorPanel, SchemaField, ColorSchemeValues, ColorSchemeKey,
} from "@/lib/website-builder/types"
import { PAGE_META, DEFAULT_COLOR_SCHEMES } from "@/lib/website-builder/types"
import { SECTION_SCHEMAS, ADDABLE_SECTIONS, SECTION_CATEGORIES } from "@/lib/website-builder/section-schemas"
import { THEME_SETTINGS_GROUPS } from "@/lib/website-builder/theme-settings-schema"
import SectionRenderer from "@/components/website-builder/sections/SectionRenderer"
import { toast } from "sonner"
import { getWebsiteShareUrl, getWebsiteUrlDisplay } from "@/lib/url-helpers"

// ── Logo sync maps (header section ↔ theme settings) ────────
const LOGO_SYNC_HEADER_TO_THEME: Record<string, string> = {
  logo_url: "logo_url",
  logo_height: "logo_width",
  mobile_logo_url: "mobile_logo_url",
  mobile_logo_height: "mobile_logo_width",
  use_mobile_logo: "use_mobile_logo",
}
const LOGO_SYNC_THEME_TO_HEADER: Record<string, string> = {
  logo_url: "logo_url",
  logo_width: "logo_height",
  mobile_logo_url: "mobile_logo_url",
  mobile_logo_width: "mobile_logo_height",
  use_mobile_logo: "use_mobile_logo",
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
  aspectRatio?: "square" | "video" | "logo" | "favicon"
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

  const emptyAspectClass =
    aspectRatio === "favicon" ? "min-h-[60px]"
    : aspectRatio === "square" ? "aspect-square"
    : aspectRatio === "logo" ? "min-h-[72px]"
    : "aspect-video"
  // Filled preview is kept small/compact so it doesn't dominate the sidebar
  const filledClass =
    aspectRatio === "favicon" ? "h-[60px]"
    : aspectRatio === "square" ? "aspect-square max-h-[120px]"
    : aspectRatio === "logo" ? "h-[68px]"
    : "h-[96px]"

  if (url) {
    return (
      <div className="space-y-2">
        {label && <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">{label}</p>}
        <div className={cn("relative w-full rounded-lg overflow-hidden border border-border bg-[#fafafa] flex items-center justify-center", filledClass)}>
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
          "relative w-full rounded-lg border-2 border-dashed transition-colors cursor-pointer flex flex-col items-center justify-center gap-1.5 py-5",
          emptyAspectClass,
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
            <ImageIcon className="h-5 w-5 text-muted-foreground/50" />
            <p className="text-[13px] font-medium text-muted-foreground">Add Image</p>
            <p className="text-[10px] text-muted-foreground/70">Click to upload or drag &amp; drop</p>
          </>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = "" }} />
    </div>
  )
}

// ── Branding Tab Panel — logo/favicon/tagline with header sync ──
function BrandingTabPanel({
  settingsDraft,
  updateSetting,
}: {
  settingsDraft: ThemeSettingsValues
  updateSetting: (key: string, value: unknown) => void
}) {
  const hasLogo = typeof settingsDraft.logo_url === "string" && settingsDraft.logo_url
  const hasMobileLogo = typeof settingsDraft.mobile_logo_url === "string" && !!settingsDraft.mobile_logo_url
  const useMobileLogo = !!settingsDraft.use_mobile_logo
  return (
    <div className="space-y-5">
      {/* Store name */}
      <div>
        <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-1.5 block">Store name</label>
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
      {hasLogo && (
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

      {/* Mobile logo toggle */}
      <WbToggle
        label="Use different logo for mobile"
        value={useMobileLogo}
        onChange={v => updateSetting("use_mobile_logo", v)}
        info="Enable to show a smaller logo on phones."
      />
      {useMobileLogo && (
        <>
          <WbImagePicker
            label="MOBILE LOGO"
            value={typeof settingsDraft.mobile_logo_url === "string" ? settingsDraft.mobile_logo_url as string : undefined}
            onChange={url => updateSetting("mobile_logo_url", url ?? "")}
            aspectRatio="logo"
            folder="logos"
          />
          {hasMobileLogo && (
            <WbSlider
              label="Mobile logo height"
              value={settingsDraft.mobile_logo_width}
              onChange={v => updateSetting("mobile_logo_width", v)}
              min={20}
              max={80}
              step={2}
              unit="px"
              defaultValue={32}
            />
          )}
        </>
      )}

      {/* Favicon — compact clean preview */}
      <WbImagePicker
        label="FAVICON"
        value={typeof settingsDraft.favicon_url === "string" ? settingsDraft.favicon_url as string : undefined}
        onChange={url => updateSetting("favicon_url", url ?? "")}
        aspectRatio="favicon"
        folder="logos"
      />
      <p className="text-[11px] text-muted-foreground flex items-start gap-1.5 -mt-2">
        <Info className="h-3 w-3 shrink-0 mt-0.5" />
        The favicon is the tiny icon shown in browser tabs. Use a square image (ideally 64×64 or larger).
      </p>

      {/* Tagline */}
      <div>
        <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-1.5 block">Tagline</label>
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
        Logo, mobile logo and heights are synced with the Header section. Changes here update the header everywhere.
      </p>
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
    <div className="space-y-2 group">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <span className="text-sm text-muted-foreground tabular-nums">{num}{unit}</span>
      </div>
      <div className="py-1 cursor-grab active:cursor-grabbing hover:[&_[role=slider]]:scale-110 [&_[role=slider]]:transition-transform">
        <Slider
          value={[num]}
          onValueChange={([v]) => onChange(v)}
          min={min}
          max={max}
          step={step}
        />
      </div>
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
    <label className="flex items-center justify-between py-1.5 cursor-pointer select-none group">
      <div className="flex-1 min-w-0 pr-3">
        <p className="text-sm font-medium text-foreground group-hover:text-purple-700 transition-colors">{label}</p>
        {info && <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{info}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={cn(
          "relative inline-flex h-[22px] w-[38px] items-center rounded-full transition-colors shrink-0 cursor-pointer focus:outline-none",
          checked ? "bg-purple-600" : "bg-gray-300",
        )}
        onClick={e => { e.preventDefault(); onChange(!checked) }}
      >
        <span className={cn("inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow-md transition-transform duration-200", checked ? "translate-x-[18px]" : "translate-x-0.5")} />
      </button>
    </label>
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

// ── Shared Scheme Pill List ──────────────────────────────────
// Vertical list of 5 Aa pills whose bg + text colors come straight
// from the scheme's own background + heading colors in
// theme.color_schemes (with DEFAULT_COLOR_SCHEMES as a fallback).
// Labels are "Scheme 1..5" so editing the underlying colors doesn't
// make the name lie. Active row reveals an Edit button that jumps
// to General Settings → Color Schemes.
const SCHEME_KEYS_ORDERED: ColorSchemeKey[] = ["white", "light", "dark", "black", "highlight"]
const SCHEME_PILL_LABELS: Record<ColorSchemeKey, string> = {
  white: "Scheme 1", light: "Scheme 2", dark: "Scheme 3", black: "Scheme 4", highlight: "Scheme 5",
}

function SchemePillList({
  value,
  onChange,
  themeSchemes,
  onEditScheme,
  dense = false,
}: {
  value: string
  onChange: (v: string) => void
  themeSchemes: Record<string, ColorSchemeValues> | undefined
  onEditScheme?: () => void
  dense?: boolean
}) {
  return (
    <div className={cn("space-y-2", dense ? "" : "")}>
      {SCHEME_KEYS_ORDERED.map(k => {
        const sc = { ...DEFAULT_COLOR_SCHEMES[k], ...(themeSchemes?.[k] ?? {}) }
        const isActive = value === k
        // Dynamic pill colors: background = scheme.bg, text = scheme.heading
        const pillBg = sc.bg
        const pillText = sc.heading
        return (
          <button
            key={k}
            type="button"
            onClick={() => onChange(k)}
            className={cn(
              "w-full h-12 flex items-center justify-between gap-2 px-3 rounded-xl border-2 transition-all cursor-pointer",
              isActive ? "border-blue-500" : "border-transparent hover:border-blue-200",
            )}
            style={{ background: pillBg, color: pillText }}
          >
            <span className="flex items-center gap-2.5">
              <span className="text-[16px] font-bold">Aa</span>
              <span className="text-[14px] font-medium">{SCHEME_PILL_LABELS[k]}</span>
            </span>
            {isActive && onEditScheme && (
              <span
                role="button"
                tabIndex={0}
                onClick={e => { e.stopPropagation(); onEditScheme() }}
                onKeyDown={e => { if (e.key === "Enter") { e.stopPropagation(); onEditScheme() } }}
                className="text-[12px] font-medium px-3 py-1 rounded-md bg-white text-gray-900 border border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer shadow-sm"
              >
                Edit
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ── Per-section Color Scheme Picker ──────────────────────────
function SectionColorSchemePicker({
  value,
  onChange,
  themeSchemes,
  onEditScheme,
}: {
  value: string
  onChange: (v: string) => void
  themeSchemes: Record<string, ColorSchemeValues> | undefined
  onEditScheme?: () => void
}) {
  return (
    <div className="border-b border-border p-4 space-y-3">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Color Scheme</p>
      <div className="text-[11px] text-muted-foreground leading-relaxed flex items-start gap-1.5">
        <Info className="h-3 w-3 shrink-0 mt-0.5" />
        <p className="flex-1">
          Choose a color scheme for this section. Visit the{" "}
          {onEditScheme ? (
            <button type="button" onClick={onEditScheme} className="text-blue-600 hover:underline inline">
              color scheme editor
            </button>
          ) : (
            <span className="text-blue-600 inline">color scheme editor</span>
          )}{" "}
          to customise colors.
        </p>
      </div>
      <SchemePillList
        value={value}
        onChange={onChange}
        themeSchemes={themeSchemes}
        onEditScheme={onEditScheme}
      />
    </div>
  )
}

// ── Global Color Schemes Editor ──────────────────────────────
// Renders a tabbed editor for the 5 global color schemes (white,
// light, dark, black, highlight). Each scheme exposes the color
// slots that the renderer reads when a section selects it.
const COLOR_SCHEME_KEYS: ColorSchemeKey[] = ["white", "light", "dark", "black", "highlight"]
// Labels are generic "Scheme N" so editing a scheme's colors doesn't
// make its name lie. The 5 built-in keys (white/light/dark/black/
// highlight) are still used internally for stable storage.
const COLOR_SCHEME_LABELS: Record<ColorSchemeKey, string> = {
  white: "Scheme 1", light: "Scheme 2", dark: "Scheme 3", black: "Scheme 4", highlight: "Scheme 5",
}
// Full color slot definitions, grouped by section as in the spec.
const COLOR_SCHEME_GROUPS: { id: keyof ColorSchemeValues; label: string; group: string }[] = [
  // Header
  { id: "store_title",           label: "Store title",           group: "Header" },
  { id: "nav_link",              label: "Navigation links",      group: "Header" },
  // Section
  { id: "bg",                    label: "Background",            group: "Section" },
  { id: "inset_border",          label: "Inset border",          group: "Section" },
  // Text
  { id: "heading",               label: "Heading text",          group: "Text" },
  { id: "paragraph",             label: "Paragraph text",        group: "Text" },
  { id: "link",                  label: "Link",                  group: "Text" },
  { id: "link_underline",        label: "Link underline",        group: "Text" },
  // Primary Button — Normal
  { id: "primary_btn_bg",        label: "Background",            group: "Primary Button (Normal State)" },
  { id: "primary_btn_text",      label: "Text",                  group: "Primary Button (Normal State)" },
  { id: "primary_btn_border",    label: "Border",                group: "Primary Button (Normal State)" },
  // Primary Button — Hover
  { id: "primary_btn_hover_bg",  label: "Background",            group: "Primary Button (Hover State)" },
  { id: "primary_btn_hover_text",label: "Text",                  group: "Primary Button (Hover State)" },
  { id: "primary_btn_hover_border", label: "Border",             group: "Primary Button (Hover State)" },
  // Secondary Button — Normal
  { id: "secondary_btn_bg",      label: "Background",            group: "Secondary Button (Normal State)" },
  { id: "secondary_btn_text",    label: "Text",                  group: "Secondary Button (Normal State)" },
  { id: "secondary_btn_border",  label: "Border",                group: "Secondary Button (Normal State)" },
  // Secondary Button — Hover
  { id: "secondary_btn_hover_bg",label: "Background",            group: "Secondary Button (Hover State)" },
  { id: "secondary_btn_hover_text", label: "Text",               group: "Secondary Button (Hover State)" },
  { id: "secondary_btn_hover_border", label: "Border",           group: "Secondary Button (Hover State)" },
  // Footer
  { id: "footer_link",           label: "Footer link",           group: "Footer" },
  { id: "footer_link_underline", label: "Footer link underline", group: "Footer" },
  // Misc
  { id: "borders",               label: "Borders",               group: "Misc" },
  { id: "on_sale",               label: "On sale",               group: "Misc" },
  // Subscription Page
  { id: "plan_bg",               label: "Plan background",       group: "Subscription Page" },
  { id: "plan_border",           label: "Plan border",           group: "Subscription Page" },
  { id: "plan_heading",          label: "Plan heading",          group: "Subscription Page" },
  { id: "plan_paragraph",        label: "Plan paragraph",        group: "Subscription Page" },
  { id: "plan_link",             label: "Plan link",             group: "Subscription Page" },
  { id: "plan_link_underline",   label: "Plan link underline",   group: "Subscription Page" },
  // Subscription Login Page
  { id: "login_form_bg",         label: "Login form background", group: "Subscription Login Page" },
  { id: "login_form_border",     label: "Login form border",     group: "Subscription Login Page" },
  // Slideshow Section
  { id: "slideshow_controls",    label: "Controls",              group: "Slideshow Section" },
  { id: "slideshow_controls_bg", label: "Controls background",   group: "Slideshow Section" },
  // Image Overlay
  { id: "image_overlay_bg",      label: "Background",            group: "Image Overlay" },
  { id: "image_overlay_text",    label: "Text",                  group: "Image Overlay" },
  // Announcement Bar
  { id: "announcement_bg",       label: "Background",            group: "Announcement Bar" },
  { id: "announcement_text",     label: "Text",                  group: "Announcement Bar" },
  // Image Collage
  { id: "collage_title",         label: "Title",                 group: "Image Collage" },
  { id: "collage_subtitle",      label: "Subtitle",              group: "Image Collage" },
  { id: "collage_bg",            label: "Background",            group: "Image Collage" },
  { id: "collage_link",          label: "Image collage link",    group: "Image Collage" },
  { id: "collage_link_underline",label: "Image collage link underline", group: "Image Collage" },
  // Header Dropdown
  { id: "header_dropdown_bg",    label: "Background",            group: "Header Dropdown" },
  { id: "header_dropdown_link",  label: "Link",                  group: "Header Dropdown" },
  // Header Cart Notification
  { id: "cart_notification_bg",  label: "Background",            group: "Header Cart Notification" },
  { id: "cart_notification_text",label: "Text",                  group: "Header Cart Notification" },
  // Pagination
  { id: "pagination_bg",         label: "Background",            group: "Pagination (Normal State)" },
  { id: "pagination_text",       label: "Text",                  group: "Pagination (Normal State)" },
  { id: "pagination_active_bg",  label: "Background",            group: "Pagination (Active State)" },
  { id: "pagination_active_text",label: "Text",                  group: "Pagination (Active State)" },
  // Course Curriculum
  { id: "curriculum_bg",         label: "Background",            group: "Course Curriculum" },
  { id: "curriculum_list_title", label: "List item title",       group: "Course Curriculum" },
  { id: "curriculum_lesson_title", label: "Lesson title",        group: "Course Curriculum" },
  { id: "curriculum_icon",       label: "Icon",                  group: "Course Curriculum" },
  { id: "curriculum_free_badge", label: "Free preview badge",    group: "Course Curriculum" },
  // Customer Reviews
  { id: "review_star",           label: "Star rating",           group: "Customer Reviews" },
  { id: "review_verified",       label: "Verified buyer icon",   group: "Customer Reviews" },
  { id: "review_recommended",    label: "Recommended icon",      group: "Customer Reviews" },
  // Video Play Button
  { id: "video_play_bg",         label: "Background",            group: "Video Play Button" },
  { id: "video_play_icon",       label: "Icon",                  group: "Video Play Button" },
  // On Sale Badge
  { id: "sale_badge_bg",         label: "Background",            group: "On Sale Badge" },
  { id: "sale_badge_text",       label: "Text",                  group: "On Sale Badge" },
  { id: "sale_badge_border",     label: "Border",                group: "On Sale Badge" },
  // Out Of Stock Badge
  { id: "oos_badge_bg",          label: "Background",            group: "Out Of Stock Badge" },
  { id: "oos_badge_text",        label: "Text",                  group: "Out Of Stock Badge" },
  { id: "oos_badge_border",      label: "Border",                group: "Out Of Stock Badge" },
  // Sale Time Remaining
  { id: "sale_time_bg",          label: "Background",            group: "Sale Time Remaining" },
  { id: "sale_time_text",        label: "Text",                  group: "Sale Time Remaining" },
  { id: "sale_time_border",      label: "Border",                group: "Sale Time Remaining" },
  // Inventory Low Message
  { id: "inventory_low_text",    label: "Text",                  group: "Inventory Low Message" },
  // Description Tab
  { id: "desc_tab_bg",           label: "Background",            group: "Description Tab" },
  { id: "desc_tab_text",         label: "Text",                  group: "Description Tab" },
  { id: "desc_tab_border",       label: "Border",                group: "Description Tab" },
  // Slider List Section
  { id: "slider_controls",       label: "Controls",              group: "Slider List Section" },
  { id: "slider_controls_bg",    label: "Controls background",   group: "Slider List Section" },
]

const SCHEME_PILL_STYLES: Record<ColorSchemeKey, { bg: string; text: string }> = {
  white:     { bg: "#ffffff", text: "#0f172a" },
  light:     { bg: "#f1f5f9", text: "#0f172a" },
  dark:      { bg: "#1f2937", text: "#ffffff" },
  black:     { bg: "#000000", text: "#ffffff" },
  highlight: { bg: "#fde2e4", text: "#1f2937" },
}

// ── HSV ↔ HEX helpers ────────────────────────────────────────
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let h = hex.replace("#", "").trim()
  if (h.length === 3) h = h.split("").map(c => c + c).join("")
  if (h.length !== 6 || !/^[0-9a-f]+$/i.test(h)) return { r: 0, g: 0, b: 0 }
  const n = parseInt(h, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}
function rgbToHex(r: number, g: number, b: number): string {
  const to = (n: number) => {
    const x = Math.max(0, Math.min(255, Math.round(n))).toString(16)
    return x.length === 1 ? "0" + x : x
  }
  return "#" + to(r) + to(g) + to(b)
}
function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  const s = max === 0 ? 0 : d / max
  return { h, s, v: max }
}
function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  let r = 0, g = 0, b = 0
  if (h < 60)       { r = c; g = x; b = 0 }
  else if (h < 120) { r = x; g = c; b = 0 }
  else if (h < 180) { r = 0; g = c; b = x }
  else if (h < 240) { r = 0; g = x; b = c }
  else if (h < 300) { r = x; g = 0; b = c }
  else              { r = c; g = 0; b = x }
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 }
}
function hsvToHex(h: number, s: number, v: number): string {
  const { r, g, b } = hsvToRgb(h, s, v)
  return rgbToHex(r, g, b)
}

// ── Pretty color picker dropdown (chevron + popup) ───────────
// Uses a portal + fixed positioning so the popup floats above every
// sidebar scroller and isn't clipped by the parent `overflow-y-auto`.
function ColorChip({
  value,
  onChange,
  existing,
}: {
  value: string
  onChange: (v: string) => void
  existing: string[]
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const svRef = useRef<HTMLDivElement>(null)
  const hueRef = useRef<HTMLDivElement>(null)
  const POPUP_W = 230
  const POPUP_H = 320

  // Current HSV state derived from the hex value (keeps the marker
  // positions stable while editing even when the hex rounding changes
  // the visible color slightly).
  const isTransparent = !value || value === "transparent"
  const initial = isTransparent ? { r: 92, g: 91, b: 99 } : hexToRgb(value)
  const [hsv, setHsv] = useState(() => rgbToHsv(initial.r, initial.g, initial.b))
  const [hexInput, setHexInput] = useState(isTransparent ? "" : value.toUpperCase())

  // Re-sync from prop value whenever it changes externally
  useEffect(() => {
    if (isTransparent) return
    const rgb = hexToRgb(value)
    const next = rgbToHsv(rgb.r, rgb.g, rgb.b)
    setHsv(next)
    setHexInput(value.toUpperCase())
  }, [value, isTransparent])

  // Position the popup BELOW the trigger (slightly offset to the left so
  // the trigger chevron sits at the top-right edge of the popup, matching
  // the mock). Keep it on-screen on all sides.
  useEffect(() => {
    if (!open) return
    const update = () => {
      const el = triggerRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const vw = window.innerWidth
      const vh = window.innerHeight
      // Align popup's right edge ~12 px past the trigger's right so the
      // chevron sits at the top-right corner of the popup.
      let left = r.right - POPUP_W + 12
      if (left < 8) left = 8
      if (left + POPUP_W > vw - 8) left = vw - POPUP_W - 8
      // Open just below the trigger; flip up if it would overflow.
      let top = r.bottom + 6
      if (top + POPUP_H > vh - 8) {
        top = r.top - POPUP_H - 6
        if (top < 8) top = 8
      }
      setPos({ top, left })
    }
    update()
    const onScroll = () => update()
    window.addEventListener("scroll", onScroll, true)
    window.addEventListener("resize", update)
    return () => {
      window.removeEventListener("scroll", onScroll, true)
      window.removeEventListener("resize", update)
    }
  }, [open])

  // Close on outside click / escape
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (triggerRef.current?.contains(t)) return
      if (popupRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    document.addEventListener("mousedown", onDoc)
    window.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDoc)
      window.removeEventListener("keydown", onKey)
    }
  }, [open])

  // Commit a new HSV state to both local state and the parent via hex
  const commit = useCallback((next: { h: number; s: number; v: number }) => {
    setHsv(next)
    const hex = hsvToHex(next.h, next.s, next.v)
    setHexInput(hex.toUpperCase())
    onChange(hex)
  }, [onChange])

  // Saturation/value box drag handling
  const handleSvPoint = useCallback((clientX: number, clientY: number) => {
    const el = svRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (clientX - r.left) / r.width))
    const y = Math.max(0, Math.min(1, (clientY - r.top) / r.height))
    commit({ h: hsv.h, s: x, v: 1 - y })
  }, [commit, hsv.h])

  const onSvPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    handleSvPoint(e.clientX, e.clientY)
  }
  const onSvPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons !== 1) return
    handleSvPoint(e.clientX, e.clientY)
  }

  // Hue slider drag handling
  const handleHuePoint = useCallback((clientX: number) => {
    const el = hueRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (clientX - r.left) / r.width))
    commit({ h: x * 360, s: hsv.s, v: hsv.v })
  }, [commit, hsv.s, hsv.v])

  const onHuePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    handleHuePoint(e.clientX)
  }
  const onHuePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons !== 1) return
    handleHuePoint(e.clientX)
  }

  // Hex text input — only commit when it's a valid hex
  const onHexInputChange = (v: string) => {
    setHexInput(v)
    const clean = v.startsWith("#") ? v : "#" + v
    if (/^#[0-9a-f]{6}$/i.test(clean)) {
      const rgb = hexToRgb(clean)
      commit(rgbToHsv(rgb.r, rgb.g, rgb.b))
    }
  }

  const pureHue = hsvToHex(hsv.h, 1, 1)
  const markerLeft = `${hsv.s * 100}%`
  const markerTop  = `${(1 - hsv.v) * 100}%`
  const hueLeft    = `${(hsv.h / 360) * 100}%`
  const swatchColor = isTransparent ? "transparent" : hsvToHex(hsv.h, hsv.s, hsv.v)

  const popup = open && pos && typeof document !== "undefined" ? createPortal(
    <div
      ref={popupRef}
      className="fixed z-[200] w-[230px] bg-white border border-border rounded-xl shadow-2xl p-2.5 animate-in fade-in zoom-in-95 duration-100"
      style={{ top: pos.top, left: pos.left }}
      onMouseDown={e => e.stopPropagation()}
    >
      {/* Saturation/value box */}
      <div
        ref={svRef}
        className="relative h-[120px] w-full rounded-md overflow-hidden cursor-crosshair touch-none select-none"
        style={{
          background: `
            linear-gradient(to top, #000, rgba(0,0,0,0)),
            linear-gradient(to right, #fff, rgba(255,255,255,0)),
            ${pureHue}
          `,
        }}
        onPointerDown={onSvPointerDown}
        onPointerMove={onSvPointerMove}
      >
        <div
          className="absolute h-3.5 w-3.5 rounded-full border-2 border-white pointer-events-none"
          style={{
            left: markerLeft,
            top: markerTop,
            transform: "translate(-50%, -50%)",
            boxShadow: "0 0 0 1px rgba(0,0,0,0.4)",
          }}
        />
      </div>

      {/* Hue slider */}
      <div
        ref={hueRef}
        className="relative mt-2.5 h-2.5 w-full rounded-full cursor-pointer touch-none select-none"
        style={{
          background: "linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)",
        }}
        onPointerDown={onHuePointerDown}
        onPointerMove={onHuePointerMove}
      >
        <div
          className="absolute top-1/2 h-4 w-4 rounded-full border-2 border-white pointer-events-none"
          style={{
            left: hueLeft,
            transform: "translate(-50%, -50%)",
            background: pureHue,
            boxShadow: "0 1px 3px rgba(0,0,0,0.35)",
          }}
        />
      </div>

      {/* Hex input with swatch preview */}
      <div className="mt-2.5 flex items-center gap-2 h-9 px-2 border border-border rounded-lg bg-muted/20">
        <span
          className="h-5 w-5 rounded border border-border shrink-0"
          style={{
            background: isTransparent
              ? "repeating-conic-gradient(#cbd5e1 0% 25%, #ffffff 0% 50%) 50% / 8px 8px"
              : swatchColor,
          }}
        />
        <input
          type="text"
          value={hexInput}
          onChange={e => onHexInputChange(e.target.value)}
          className="flex-1 h-full text-[12px] bg-transparent border-0 tabular-nums uppercase focus:outline-none"
          placeholder="#FFFFFF"
        />
      </div>

      {existing.length > 0 && (
        <div className="mt-2.5">
          <p className="text-[10px] font-medium text-muted-foreground mb-1">Existing colors</p>
          <div className="grid grid-cols-8 gap-1">
            {existing.map((c, i) => (
              <button
                key={`${c}-${i}`}
                type="button"
                onClick={() => { onChange(c); setOpen(false) }}
                className="h-5 w-5 rounded border border-border hover:scale-110 transition-transform"
                style={{ background: c }}
                aria-label={`Use ${c}`}
              />
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => { onChange("transparent"); setOpen(false) }}
        className="mt-2.5 w-full h-8 flex items-center justify-center gap-1.5 text-[12px] font-medium border border-border rounded-lg hover:bg-muted transition-colors"
      >
        <span className="inline-block h-3.5 w-3.5 rounded-full" style={{ background: "repeating-conic-gradient(#cbd5e1 0% 25%, #ffffff 0% 50%) 50% / 6px 6px" }} />
        Don&apos;t apply any color
      </button>
    </div>,
    document.body,
  ) : null

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 h-7 px-1.5 rounded border border-border hover:border-purple-400 transition-colors cursor-pointer"
        aria-label="Pick color"
      >
        <span
          className="h-5 w-5 rounded-full border border-border shrink-0"
          style={{
            background: isTransparent
              ? "repeating-conic-gradient(#cbd5e1 0% 25%, #ffffff 0% 50%) 50% / 8px 8px"
              : value,
          }}
        />
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      </button>
      {popup}
    </>
  )
}

function ColorSchemesEditor({
  value,
  onChange,
}: {
  value: Record<string, ColorSchemeValues> | undefined
  onChange: (v: Record<string, ColorSchemeValues>) => void
}) {
  const [active, setActive] = useState<ColorSchemeKey>("white")
  const [stepOneOpen, setStepOneOpen] = useState(false)

  // Merge defaults so we always have a complete shape to edit
  const schemes: Record<ColorSchemeKey, ColorSchemeValues> = {
    white:     { ...DEFAULT_COLOR_SCHEMES.white,     ...(value?.white ?? {}) },
    light:     { ...DEFAULT_COLOR_SCHEMES.light,     ...(value?.light ?? {}) },
    dark:      { ...DEFAULT_COLOR_SCHEMES.dark,      ...(value?.dark ?? {}) },
    black:     { ...DEFAULT_COLOR_SCHEMES.black,     ...(value?.black ?? {}) },
    highlight: { ...DEFAULT_COLOR_SCHEMES.highlight, ...(value?.highlight ?? {}) },
  }
  const current = schemes[active]

  const updateColor = (key: keyof ColorSchemeValues, color: string) => {
    onChange({ ...schemes, [active]: { ...current, [key]: color } })
  }
  const resetScheme = () => {
    onChange({ ...schemes, [active]: { ...DEFAULT_COLOR_SCHEMES[active] } })
  }

  // Build the recently-used color list for the picker
  const existing = Array.from(
    new Set(
      Object.values(current).filter((v): v is string => typeof v === "string" && v !== "transparent"),
    ),
  ).slice(0, 14)

  // Group fields by their group label
  const grouped: Record<string, typeof COLOR_SCHEME_GROUPS> = {}
  for (const f of COLOR_SCHEME_GROUPS) {
    (grouped[f.group] ??= []).push(f)
  }

  // Step 1 dropdown portal positioning — matches trigger width and sits
  // just below the trigger with on-screen clamping, so the dropdown is
  // never clipped by a sidebar overflow-y-auto.
  const stepOneTriggerRef = useRef<HTMLButtonElement>(null)
  const [stepOnePos, setStepOnePos] = useState<{ top: number; left: number; width: number } | null>(null)
  useEffect(() => {
    if (!stepOneOpen) return
    const update = () => {
      const el = stepOneTriggerRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const vh = window.innerHeight
      const desiredHeight = 5 * 48 + 8
      let top = r.bottom + 4
      if (top + desiredHeight > vh - 8) top = Math.max(8, r.top - desiredHeight - 4)
      setStepOnePos({ top, left: r.left, width: r.width })
    }
    update()
    const onScroll = () => update()
    window.addEventListener("scroll", onScroll, true)
    window.addEventListener("resize", update)
    return () => {
      window.removeEventListener("scroll", onScroll, true)
      window.removeEventListener("resize", update)
    }
  }, [stepOneOpen])
  useEffect(() => {
    if (!stepOneOpen) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (stepOneTriggerRef.current?.contains(t)) return
      const popup = document.getElementById("color-scheme-step1-popup")
      if (popup?.contains(t)) return
      setStepOneOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [stepOneOpen])

  return (
    <div className="space-y-4">
      <h3 className="text-[15px] font-semibold">Edit Section Color Scheme</h3>
      <div className="text-[11px] text-muted-foreground leading-relaxed flex items-start gap-1.5">
        <Info className="h-3 w-3 shrink-0 mt-0.5" />
        <p className="flex-1">Click on any element in the preview, then its settings will appear. Each scheme is global — every section using it updates.</p>
      </div>

      {/* ─── Step 1: Choose color scheme (dropdown) ─── */}
      <div className="space-y-2">
        <p className="text-[12px] font-semibold text-foreground"><span className="font-bold">Step 1:</span> Choose color scheme you&apos;d like to edit</p>
        <div className="relative">
          <button
            ref={stepOneTriggerRef}
            type="button"
            onClick={() => setStepOneOpen(o => !o)}
            className={cn(
              "w-full h-12 flex items-center justify-between gap-2 px-3 rounded-lg border-2 bg-white transition-all duration-150",
              stepOneOpen
                ? "border-blue-500 shadow-[0_0_0_3px_rgba(59,130,246,0.15)]"
                : "border-border hover:border-blue-400 hover:shadow-sm",
            )}
          >
            <span className="flex items-center gap-2.5 min-w-0">
              <span
                className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-border text-[13px] font-semibold shrink-0 transition-colors"
                style={{ background: schemes[active].bg, color: schemes[active].heading }}
              >
                Aa
              </span>
              <span className="text-sm font-medium text-foreground truncate">{COLOR_SCHEME_LABELS[active]}</span>
            </span>
            <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200", stepOneOpen && "rotate-180 text-blue-500")} />
          </button>
          {stepOneOpen && stepOnePos && typeof document !== "undefined" && createPortal(
            <div
              id="color-scheme-step1-popup"
              className="fixed z-[200] bg-white border border-border rounded-xl shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95 slide-in-from-top-1 duration-150 ease-out p-1"
              style={{ top: stepOnePos.top, left: stepOnePos.left, width: stepOnePos.width }}
            >
              {COLOR_SCHEME_KEYS.map(k => {
                const isActive = active === k
                const sc = schemes[k]
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => { setActive(k); setStepOneOpen(false) }}
                    className={cn(
                      "w-full h-11 flex items-center gap-2.5 px-2.5 rounded-md transition-all duration-100",
                      isActive
                        ? "bg-blue-50 ring-1 ring-blue-500/40"
                        : "hover:bg-muted/60 active:scale-[0.99]",
                    )}
                  >
                    <span
                      className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-border text-[13px] font-semibold shrink-0"
                      style={{ background: sc.bg, color: sc.heading }}
                    >
                      Aa
                    </span>
                    <span className={cn(
                      "text-sm font-medium flex-1 text-left truncate",
                      isActive ? "text-blue-700" : "text-foreground",
                    )}>
                      {COLOR_SCHEME_LABELS[k]}
                    </span>
                    {isActive && <CheckCircle className="h-4 w-4 text-blue-500 shrink-0" />}
                  </button>
                )
              })}
            </div>,
            document.body,
          )}
        </div>
      </div>

      <div className="h-px bg-border" />

      {/* ─── Step 2: Edit colors ─── */}
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-semibold text-foreground"><span className="font-bold">Step 2:</span> Edit the colors of this color scheme</p>
        <button
          type="button"
          onClick={resetScheme}
          className="text-[11px] font-medium text-purple-600 hover:text-purple-700 flex items-center gap-1"
        >
          <RotateCcw className="h-3 w-3" />
          Reset
        </button>
      </div>

      <div className="space-y-5">
        {Object.entries(grouped).map(([groupLabel, fields]) => (
          <div key={groupLabel} className="space-y-1">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{groupLabel}</p>
            <div>
              {fields.map((f, idx) => (
                <div
                  key={f.id}
                  className={cn(
                    "flex items-center justify-between gap-3 py-2.5",
                    idx > 0 && "border-t border-border/60",
                  )}
                >
                  <span className="text-[13px] text-foreground flex-1 truncate">{f.label}</span>
                  <ColorChip
                    value={current[f.id] || "#000000"}
                    onChange={c => updateColor(f.id, c)}
                    existing={existing}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
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

// ── Smart Link Picker for Nav URLs ───────────────────────────
function NavLinkPicker({
  value,
  onChange,
  products,
  collections,
  customPages,
}: {
  value: string
  onChange: (v: string) => void
  products: { id: string; title: string; slug: string }[]
  collections: { id: string; name: string; slug: string }[]
  customPages: { name: string; key: string }[]
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null)

  // Measure trigger position for the portaled dropdown
  useEffect(() => {
    if (!open) { setPos(null); return }
    const update = () => {
      const el = wrapRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const vh = window.innerHeight
      const spaceBelow = vh - r.bottom - 16
      const spaceAbove = r.top - 16
      const maxH = Math.min(320, Math.max(spaceBelow, spaceAbove))
      const openUp = spaceBelow < 220 && spaceAbove > spaceBelow
      setPos({
        top: openUp ? Math.max(8, r.top - maxH - 6) : r.bottom + 6,
        left: r.left,
        width: r.width,
        maxHeight: maxH,
      })
    }
    update()
    const onScroll = () => update()
    window.addEventListener("scroll", onScroll, true)
    window.addEventListener("resize", update)
    return () => {
      window.removeEventListener("scroll", onScroll, true)
      window.removeEventListener("resize", update)
    }
  }, [open])

  // Close on click outside (both trigger and portaled popup)
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const t = e.target as Node
      if (wrapRef.current?.contains(t)) return
      const pop = document.getElementById("nav-link-picker-popup")
      if (pop?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  const builtInPages = [
    { label: "Home", url: "/" },
    { label: "Shop", url: "/shop" },
    { label: "About", url: "/about" },
    { label: "Contact", url: "/contact" },
    { label: "FAQ", url: "/faq" },
  ]
  const allPages = [
    ...builtInPages,
    ...customPages.map(p => ({ label: p.name, url: `/${p.key}` })),
  ]

  const q = search.toLowerCase()
  const filteredPages = allPages.filter(p => p.label.toLowerCase().includes(q))
  const filteredProducts = products.filter(p => p.title.toLowerCase().includes(q))
  const filteredCollections = collections.filter(c => c.name.toLowerCase().includes(q))

  const hasResults = filteredPages.length > 0 || filteredProducts.length > 0 || filteredCollections.length > 0

  const popup = open && pos && typeof document !== "undefined" ? createPortal(
    <div
      id="nav-link-picker-popup"
      className="fixed z-[300] bg-white border border-border rounded-lg shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-100"
      style={{ top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxHeight }}
    >
      <div className="overflow-y-auto overscroll-contain">
        {!hasResults && search && (
          <div className="px-3 py-6 text-sm text-muted-foreground text-center">No results found</div>
        )}
        {!hasResults && !search && (
          <div className="px-3 py-4 text-[12px] text-muted-foreground text-center">Type to search or paste a URL</div>
        )}

        {filteredPages.length > 0 && (
          <div className="py-1">
            <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Pages</div>
            {filteredPages.map(p => (
              <button
                key={p.url}
                type="button"
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-purple-50 text-left transition-colors"
                onMouseDown={e => { e.preventDefault(); onChange(p.url); setOpen(false) }}
              >
                <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="truncate flex-1">{p.label}</span>
                <span className="ml-2 text-[11px] text-muted-foreground/60 shrink-0 truncate max-w-[40%]">{p.url}</span>
              </button>
            ))}
          </div>
        )}

        {filteredCollections.length > 0 && (
          <div className="py-1 border-t border-border">
            <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Categories</div>
            {filteredCollections.slice(0, 20).map(c => (
              <button
                key={c.id}
                type="button"
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-purple-50 text-left transition-colors"
                onMouseDown={e => { e.preventDefault(); onChange(`/collections/${c.slug}`); setOpen(false) }}
              >
                <FolderOpen className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="truncate">{c.name}</span>
              </button>
            ))}
          </div>
        )}

        {filteredProducts.length > 0 && (
          <div className="py-1 border-t border-border">
            <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Products</div>
            {filteredProducts.slice(0, 20).map(p => (
              <button
                key={p.id}
                type="button"
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-purple-50 text-left transition-colors"
                onMouseDown={e => { e.preventDefault(); onChange(`/products/${p.slug}`); setOpen(false) }}
              >
                <ShoppingBag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="truncate">{p.title}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body,
  ) : null

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          className="w-full h-9 pl-9 pr-3 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-colors"
          placeholder="Paste your link (or type to search)"
          value={open ? search : (value || "")}
          onFocus={() => { setOpen(true); setSearch(value || "") }}
          onChange={e => {
            const v = e.target.value
            setSearch(v)
            if (v.startsWith("/") || v.startsWith("http") || v.startsWith("#")) {
              onChange(v)
            }
          }}
          onKeyDown={e => {
            if (e.key === "Escape") { setOpen(false); inputRef.current?.blur() }
          }}
        />
      </div>
      {popup}
    </div>
  )
}

// ── Sortable Nav Link Item ───────────────────────────────────
function SortableNavLink({
  block,
  idx,
  blockSchema,
  onUpdateBlockSetting,
  onRemoveBlock,
  products,
  collections,
  customPages,
}: {
  block: { id: string; type: string; settings: Record<string, unknown> }
  idx: number
  blockSchema: any
  onUpdateBlockSetting: (blockId: string, key: string, value: unknown) => void
  onRemoveBlock: (blockId: string) => void
  products: { id: string; title: string; slug: string }[]
  collections: { id: string; name: string; slug: string }[]
  customPages: { name: string; key: string }[]
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  }

  return (
    <details ref={setNodeRef} style={style} className="group border border-border rounded-lg overflow-hidden bg-background hover:border-purple-300 hover:shadow-sm transition-all">
      <summary className="flex items-center justify-between px-3 py-2.5 cursor-pointer list-none bg-muted/30 hover:bg-purple-50/40 transition-colors">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            className="cursor-grab active:cursor-grabbing touch-none p-1 -ml-1 rounded hover:bg-purple-100 text-muted-foreground hover:text-purple-600 transition-colors"
            aria-label="Drag to reorder"
            {...attributes}
            {...listeners}
            onClick={e => e.preventDefault()}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
          <span className="text-sm font-medium truncate">{String(block.settings.label || `Link ${idx + 1}`)}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            className="h-7 w-7 flex items-center justify-center rounded hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors cursor-pointer"
            aria-label="Delete link"
            onClick={e => { e.preventDefault(); onRemoveBlock(block.id) }}
          >
            <Trash2 className="h-3.5 w-3.5" />
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
            ) : field.id === "url" ? (
              <NavLinkPicker
                value={typeof block.settings.url === "string" ? block.settings.url : ""}
                onChange={val => onUpdateBlockSetting(block.id, "url", val)}
                products={products}
                collections={collections}
                customPages={customPages}
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
}

// ── Mobile header layout preview thumbnails (shared) ────────
const MOBILE_LAYOUT_PREVIEW_NODE = (id: string): React.ReactNode => {
  const burger = (
    <div className="flex flex-col gap-[2px]">
      <div className="h-[2px] w-3 bg-gray-800 rounded-full" />
      <div className="h-[2px] w-3 bg-gray-800 rounded-full" />
      <div className="h-[2px] w-3 bg-gray-800 rounded-full" />
    </div>
  )
  const logo = <div className="h-3 w-8 bg-gray-800 rounded-sm" />
  const dot = <div className="h-2 w-2 bg-gray-800 rounded-full" />
  if (id === "logo_left_hamburger_right") {
    return (
      <div className="flex items-center justify-between w-full h-full px-4">
        {logo}
        <div className="flex items-center gap-2">{dot}{burger}</div>
      </div>
    )
  }
  if (id === "hamburger_left_logo_left") {
    return (
      <div className="flex items-center w-full h-full px-4 gap-2">
        {burger}
        {logo}
        <div className="flex-1" />
        {dot}
      </div>
    )
  }
  // logo_center_hamburger_left (default)
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center w-full h-full px-4">
      <div className="flex items-center justify-start">{burger}</div>
      <div className="flex items-center justify-center">{logo}</div>
      <div className="flex items-center justify-end">{dot}</div>
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
  onReorderBlocks,
  products,
  collections,
  customPages,
  themeSchemes,
  onEditScheme,
}: {
  section: SectionInstance
  schema: any
  onBack: () => void
  onUpdateSetting: (key: string, value: unknown) => void
  onUpdateBlockSetting: (blockId: string, key: string, value: unknown) => void
  onAddBlock: (type: string) => void
  onRemoveBlock: (blockId: string) => void
  onReorderBlocks: (blocks: { id: string; type: string; settings: Record<string, unknown> }[]) => void
  products: { id: string; title: string; slug: string }[]
  collections: { id: string; name: string; slug: string }[]
  customPages: { name: string; key: string }[]
  themeSchemes: Record<string, ColorSchemeValues> | undefined
  onEditScheme: () => void
}) {
  const [activeTab, setActiveTab] = useState<string | null>(null)
  const s = section.settings

  const navSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleNavDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const blocks = section.blocks ?? []
    const oldIndex = blocks.findIndex(b => b.id === active.id)
    const newIndex = blocks.findIndex(b => b.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    onReorderBlocks(arrayMove(blocks, oldIndex, newIndex))
  }

  const tabs = [
    { id: "logo", label: "Store Logo" },
    { id: "nav", label: "Navigation Links" },
    { id: "header", label: "Header Section" },
    { id: "button", label: "Button" },
    { id: "elements", label: "Elements" },
  ]

  const [layoutPickerOpen, setLayoutPickerOpen] = useState(false)
  const [mobileLayoutPickerOpen, setMobileLayoutPickerOpen] = useState(false)

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

            {/* Custom logo horizontal position — desktop (clean inline) */}
            <WbToggle
              label="Custom logo horizontal position"
              value={s.logo_horizontal_offset_enabled}
              onChange={v => onUpdateSetting("logo_horizontal_offset_enabled", v)}
              info="Nudge the logo left or right inside the header."
            />
            {!!s.logo_horizontal_offset_enabled && (
              <WbSlider
                label="Horizontal offset"
                value={s.logo_horizontal_offset_px}
                onChange={v => onUpdateSetting("logo_horizontal_offset_px", v)}
                min={-120}
                max={120}
                step={1}
                unit="px"
                defaultValue={0}
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

            {/* Custom logo horizontal position — mobile (clean inline) */}
            <WbToggle
              label="Custom mobile logo horizontal position"
              value={s.mobile_logo_horizontal_offset_enabled}
              onChange={v => onUpdateSetting("mobile_logo_horizontal_offset_enabled", v)}
              info="Nudge the mobile logo left or right inside the header."
            />
            {!!s.mobile_logo_horizontal_offset_enabled && (
              <WbSlider
                label="Mobile horizontal offset"
                value={s.mobile_logo_horizontal_offset_px}
                onChange={v => onUpdateSetting("mobile_logo_horizontal_offset_px", v)}
                min={-80}
                max={80}
                step={1}
                unit="px"
                defaultValue={0}
              />
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
          </div>
        )

      case "nav":
        return (
          <div className="space-y-3">
            <DndContext sensors={navSensors} collisionDetection={closestCenter} onDragEnd={handleNavDragEnd}>
              <SortableContext items={(section.blocks ?? []).map(b => b.id)} strategy={verticalListSortingStrategy}>
                {(section.blocks ?? []).map((block, idx) => {
                  const blockSchema = schema?.blocks?.find((b: any) => b.type === block.type)
                  return (
                    <SortableNavLink
                      key={block.id}
                      block={block}
                      idx={idx}
                      blockSchema={blockSchema}
                      onUpdateBlockSetting={onUpdateBlockSetting}
                      onRemoveBlock={onRemoveBlock}
                      products={products}
                      collections={collections}
                      customPages={customPages}
                    />
                  )
                })}
              </SortableContext>
            </DndContext>
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

      case "header": {
        const currentLayout = (typeof s.header_layout === "string" ? s.header_layout : "logo_left_nav_right")
        const currentScheme = (typeof s.color_scheme === "string" ? s.color_scheme : "white")
        const colorSchemes: { id: string; label: string; bg: string; text: string }[] = [
          { id: "white",     label: "White",     bg: "#ffffff", text: "#0f172a" },
          { id: "light",     label: "Light",     bg: "#f1f5f9", text: "#0f172a" },
          { id: "dark",      label: "Dark",      bg: "#1f2937", text: "#ffffff" },
          { id: "black",     label: "Black",     bg: "#000000", text: "#ffffff" },
          { id: "highlight", label: "Highlight", bg: "#6366f1", text: "#ffffff" },
        ]
        const layoutOptions: { id: string; label: string; preview: React.ReactNode }[] = [
          {
            id: "logo_left_nav_right",
            label: "Logo left · Nav + icons right",
            preview: (
              <div className="flex items-center justify-between w-full h-full px-3">
                <div className="h-3 w-10 bg-gray-700 rounded-sm" />
                <div className="flex items-center gap-1.5">
                  <div className="h-1.5 w-4 bg-gray-500 rounded-full" />
                  <div className="h-1.5 w-4 bg-gray-500 rounded-full" />
                  <div className="h-1.5 w-4 bg-gray-500 rounded-full" />
                  <div className="h-2 w-2 bg-gray-700 rounded-full ml-1" />
                </div>
              </div>
            ),
          },
          {
            id: "logo_left_nav_inline",
            label: "Logo left · Nav inline · Icons right",
            preview: (
              <div className="flex items-center w-full h-full px-3 gap-3">
                <div className="h-3 w-8 bg-gray-700 rounded-sm" />
                <div className="h-1.5 w-4 bg-gray-500 rounded-full" />
                <div className="h-1.5 w-4 bg-gray-500 rounded-full" />
                <div className="h-1.5 w-4 bg-gray-500 rounded-full" />
                <div className="flex-1" />
                <div className="h-2 w-2 bg-gray-700 rounded-full" />
              </div>
            ),
          },
          {
            id: "logo_left_nav_center",
            label: "Logo left · Nav centered · Icons right",
            preview: (
              <div className="flex items-center justify-between w-full h-full px-3">
                <div className="h-3 w-8 bg-gray-700 rounded-sm" />
                <div className="flex items-center gap-1.5">
                  <div className="h-1.5 w-4 bg-gray-500 rounded-full" />
                  <div className="h-1.5 w-4 bg-gray-500 rounded-full" />
                  <div className="h-1.5 w-4 bg-gray-500 rounded-full" />
                </div>
                <div className="h-2 w-2 bg-gray-700 rounded-full" />
              </div>
            ),
          },
          {
            id: "nav_left_logo_center",
            label: "Nav left · Logo centered · Icons right",
            preview: (
              <div className="flex items-center justify-between w-full h-full px-3">
                <div className="flex items-center gap-1.5">
                  <div className="h-1.5 w-4 bg-gray-500 rounded-full" />
                  <div className="h-1.5 w-4 bg-gray-500 rounded-full" />
                </div>
                <div className="h-3 w-8 bg-gray-700 rounded-sm" />
                <div className="h-2 w-2 bg-gray-700 rounded-full" />
              </div>
            ),
          },
          {
            id: "logo_center_nav_below",
            label: "Logo centered · Nav below",
            preview: (
              <div className="flex flex-col items-center justify-center w-full h-full gap-1.5">
                <div className="h-3 w-8 bg-gray-700 rounded-sm" />
                <div className="flex items-center gap-1.5">
                  <div className="h-1.5 w-4 bg-gray-500 rounded-full" />
                  <div className="h-1.5 w-4 bg-gray-500 rounded-full" />
                  <div className="h-1.5 w-4 bg-gray-500 rounded-full" />
                  <div className="h-1.5 w-4 bg-gray-500 rounded-full" />
                </div>
              </div>
            ),
          },
        ]
        const currentLayoutMeta = layoutOptions.find(l => l.id === currentLayout) ?? layoutOptions[0]

        const currentMobileLayout = (typeof s.mobile_header_layout === "string" ? s.mobile_header_layout : "logo_center_hamburger_left")
        const currentMobileLayoutLabel =
          currentMobileLayout === "hamburger_left_logo_left" ? "Hamburger left · Logo left"
          : currentMobileLayout === "logo_left_hamburger_right" ? "Logo left · Hamburger right"
          : "Logo centered · Hamburger left"
        const mobilePreviewSummary = MOBILE_LAYOUT_PREVIEW_NODE(currentMobileLayout)
        return (
          <div className="space-y-6">
            {/* ── Header layout (desktop) ── */}
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Header layout (desktop)</p>
              <button
                type="button"
                onClick={() => setLayoutPickerOpen(true)}
                className="w-full group border border-border rounded-xl bg-background hover:border-purple-400 transition-colors overflow-hidden"
              >
                <div className="h-14 bg-muted/30 border-b border-border">
                  {currentLayoutMeta.preview}
                </div>
                <div className="flex items-center justify-between px-3 py-2.5 text-left">
                  <span className="text-xs font-medium text-foreground">{currentLayoutMeta.label}</span>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
              </button>
            </div>

            {/* ── Header layout (mobile) — opens its own sub-panel ── */}
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Header layout (mobile)</p>
              <button
                type="button"
                onClick={() => setMobileLayoutPickerOpen(true)}
                className="w-full group border border-border rounded-xl bg-background hover:border-purple-400 transition-colors overflow-hidden"
              >
                <div className="h-14 bg-muted/30 border-b border-border">
                  {mobilePreviewSummary}
                </div>
                <div className="flex items-center justify-between px-3 py-2.5 text-left">
                  <span className="text-xs font-medium text-foreground">{currentMobileLayoutLabel}</span>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
              </button>
            </div>

            <div className="h-px bg-border" />

            {/* ── Color Settings ── */}
            <div className="space-y-3">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Color Settings</p>
              <WbToggle
                label="Make header transparent"
                value={s.header_transparent}
                onChange={v => onUpdateSetting("header_transparent", v)}
              />
              <div className="text-[11px] text-muted-foreground leading-relaxed flex items-start gap-1.5">
                <Info className="h-3 w-3 shrink-0 mt-0.5" />
                <p className="flex-1">
                  Choose a color scheme for the header. Visit the{" "}
                  <button type="button" onClick={onEditScheme} className="text-blue-600 hover:underline inline">
                    color scheme editor
                  </button>{" "}
                  to customise colors.
                </p>
              </div>
              <SchemePillList
                value={currentScheme}
                onChange={v => onUpdateSetting("color_scheme", v)}
                themeSchemes={themeSchemes}
                onEditScheme={onEditScheme}
                dense
              />
            </div>

            <div className="h-px bg-border" />

            {/* ── Advanced Settings ── */}
            <div className="space-y-4">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Advanced Settings</p>
              <WbRadioSegment
                label="Header width"
                value={s.header_width}
                onChange={v => onUpdateSetting("header_width", v)}
                options={[
                  { label: "Full", value: "full" },
                  { label: "Fixed", value: "fixed" },
                ]}
              />
              <WbToggle
                label="Enable sticky header"
                value={!!s.header_sticky_enabled && !s.header_sticky_on_scroll_up}
                onChange={v => {
                  if (v) {
                    // Turning plain sticky on — turn scroll-up variant off
                    onUpdateSetting("header_sticky_enabled", true)
                    onUpdateSetting("header_sticky_on_scroll_up", false)
                  } else {
                    onUpdateSetting("header_sticky_enabled", false)
                  }
                }}
                info="Keep the header pinned to the top as the visitor scrolls."
              />
              <WbToggle
                label="Sticky header on scroll up"
                value={!!s.header_sticky_on_scroll_up}
                onChange={v => {
                  if (v) {
                    // Turning scroll-up variant on — enable sticky, mark variant
                    onUpdateSetting("header_sticky_enabled", true)
                    onUpdateSetting("header_sticky_on_scroll_up", true)
                  } else {
                    onUpdateSetting("header_sticky_on_scroll_up", false)
                  }
                }}
                info="Only reveal the header when scrolling up — hides on scroll down."
              />
              <WbSlider
                label="Vertical padding"
                value={s.vertical_padding_vw}
                onChange={v => onUpdateSetting("vertical_padding_vw", v)}
                min={0}
                max={5}
                step={0.1}
                unit="vw"
                defaultValue={1.2}
              />
              <WbSlider
                label="Space between menu links"
                value={s.link_spacing_vw}
                onChange={v => onUpdateSetting("link_spacing_vw", v)}
                min={0.2}
                max={5}
                step={0.1}
                unit="vw"
                defaultValue={1.4}
              />
            </div>

          </div>
        )
      }

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
            <p className="text-[11px] text-muted-foreground leading-snug flex items-start gap-1.5">
              <Info className="h-3 w-3 shrink-0 mt-0.5" />
              Button colors are controlled by the section&apos;s Color Scheme. Edit colors from General Settings → Color Schemes.
            </p>
          </div>
        )

      case "elements":
        return (
          <div className="space-y-6">
            {/* ── Call To Action Button ── */}
            <div className="space-y-3">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Call To Action Button</p>
              <WbToggle
                label="Show call to action button"
                value={s.show_cta_button}
                onChange={v => onUpdateSetting("show_cta_button", v)}
              />
              {s.show_cta_button !== false && (
                <>
                  <div className="space-y-1.5">
                    <p className="text-sm font-medium text-foreground">Button Text</p>
                    <input
                      type="text"
                      className="w-full h-10 px-3 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-colors"
                      placeholder="Discover"
                      value={typeof s.cta_text === "string" ? s.cta_text : ""}
                      onChange={e => onUpdateSetting("cta_text", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-sm font-medium text-foreground">Button Link</p>
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
                </>
              )}
              <p className="text-[11px] text-muted-foreground leading-snug">
                A call to action button lets you immediately draw a visitor&apos;s attention to the most important page.
              </p>
            </div>

            <div className="h-px bg-border" />

            {/* ── Search & Cart ── */}
            <div className="space-y-3">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Search &amp; Cart</p>
              <WbToggle
                label="Show search icon"
                value={s.show_search}
                onChange={v => onUpdateSetting("show_search", v)}
              />
              <WbToggle
                label="Show cart icon"
                value={s.show_cart}
                onChange={v => onUpdateSetting("show_cart", v)}
              />
              <p className="text-[11px] text-muted-foreground leading-snug">
                We highly recommend you don&apos;t disable the cart icon, however in some cases you might need to.
              </p>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  // ── Mobile layout picker sub-panel ─────────────────────────
  if (mobileLayoutPickerOpen) {
    const mobileLayoutOptions: { id: string; label: string }[] = [
      { id: "logo_center_hamburger_left", label: "Logo centered · Hamburger left" },
      { id: "hamburger_left_logo_left",   label: "Hamburger left · Logo left" },
      { id: "logo_left_hamburger_right",  label: "Logo left · Hamburger right" },
    ]
    const currentMobileLayout = (typeof s.mobile_header_layout === "string" ? s.mobile_header_layout : "logo_center_hamburger_left")
    return (
      <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-4 duration-200 ease-out">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2 shrink-0">
          <button
            className="text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setMobileLayoutPickerOpen(false)}
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold">Choose mobile header layout</span>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {mobileLayoutOptions.map(opt => {
            const active = currentMobileLayout === opt.id
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  onUpdateSetting("mobile_header_layout", opt.id)
                  setMobileLayoutPickerOpen(false)
                }}
                className={cn(
                  "w-full text-left border rounded-xl overflow-hidden bg-white transition-all",
                  active ? "border-blue-500 ring-2 ring-blue-500/30" : "border-border hover:border-blue-300",
                )}
              >
                <div className="h-20 bg-gray-50 border-b border-border flex items-center">
                  {MOBILE_LAYOUT_PREVIEW_NODE(opt.id)}
                </div>
                <div className="px-3 py-2.5 flex items-center justify-between">
                  <span className="text-xs font-medium">{opt.label}</span>
                  {active && (
                    <span className="text-[10px] font-semibold text-blue-600 uppercase tracking-wider">Selected</span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Layout picker sub-panel (inline, not modal) ────────────
  if (layoutPickerOpen) {
    // Re-use the same layoutOptions the "header" tab builds. We build
    // a minimal local set so this branch is independent — keeps the
    // rendering stable even if the "header" case wasn't mounted yet.
    const layoutOptions: { id: string; label: string }[] = [
      { id: "logo_left_nav_right",   label: "Logo left · Nav + icons right" },
      { id: "logo_left_nav_inline",  label: "Logo left · Nav inline · Icons right" },
      { id: "logo_left_nav_center",  label: "Logo left · Nav centered · Icons right" },
      { id: "nav_left_logo_center",  label: "Nav left · Logo centered · Icons right" },
      { id: "logo_center_nav_below", label: "Logo centered · Nav below" },
    ]
    const currentLayout = (typeof s.header_layout === "string" ? s.header_layout : "logo_left_nav_right")
    const renderPreview = (id: string) => {
      switch (id) {
        case "logo_left_nav_right":
          return (
            <div className="flex items-center justify-between w-full h-full px-4">
              <div className="h-3 w-12 bg-gray-800 rounded-sm" />
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-5 bg-gray-500 rounded-full" />
                <div className="h-1.5 w-5 bg-gray-500 rounded-full" />
                <div className="h-1.5 w-5 bg-gray-500 rounded-full" />
                <div className="h-2 w-2 bg-gray-800 rounded-full ml-1.5" />
                <div className="h-2 w-2 bg-gray-800 rounded-full" />
              </div>
            </div>
          )
        case "logo_left_nav_inline":
          return (
            <div className="flex items-center w-full h-full px-4 gap-3">
              <div className="h-3 w-10 bg-gray-800 rounded-sm" />
              <div className="h-1.5 w-5 bg-gray-500 rounded-full" />
              <div className="h-1.5 w-5 bg-gray-500 rounded-full" />
              <div className="h-1.5 w-5 bg-gray-500 rounded-full" />
              <div className="flex-1" />
              <div className="h-2 w-2 bg-gray-800 rounded-full" />
              <div className="h-2 w-2 bg-gray-800 rounded-full" />
            </div>
          )
        case "logo_left_nav_center":
          return (
            <div className="flex items-center justify-between w-full h-full px-4">
              <div className="h-3 w-10 bg-gray-800 rounded-sm" />
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-5 bg-gray-500 rounded-full" />
                <div className="h-1.5 w-5 bg-gray-500 rounded-full" />
                <div className="h-1.5 w-5 bg-gray-500 rounded-full" />
              </div>
              <div className="h-2 w-2 bg-gray-800 rounded-full" />
            </div>
          )
        case "nav_left_logo_center":
          return (
            <div className="flex items-center justify-between w-full h-full px-4">
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-5 bg-gray-500 rounded-full" />
                <div className="h-1.5 w-5 bg-gray-500 rounded-full" />
              </div>
              <div className="h-3 w-10 bg-gray-800 rounded-sm" />
              <div className="h-2 w-2 bg-gray-800 rounded-full" />
            </div>
          )
        case "logo_center_nav_below":
          return (
            <div className="flex flex-col items-center justify-center w-full h-full gap-2">
              <div className="h-3 w-10 bg-gray-800 rounded-sm" />
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-5 bg-gray-500 rounded-full" />
                <div className="h-1.5 w-5 bg-gray-500 rounded-full" />
                <div className="h-1.5 w-5 bg-gray-500 rounded-full" />
                <div className="h-1.5 w-5 bg-gray-500 rounded-full" />
              </div>
            </div>
          )
      }
      return null
    }

    return (
      <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-4 duration-200 ease-out">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2 shrink-0">
          <button
            className="text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setLayoutPickerOpen(false)}
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold">Choose header layout</span>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {layoutOptions.map(opt => {
            const active = currentLayout === opt.id
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  onUpdateSetting("header_layout", opt.id)
                  setLayoutPickerOpen(false)
                }}
                className={cn(
                  "w-full text-left border rounded-xl overflow-hidden bg-white transition-all",
                  active ? "border-blue-500 ring-2 ring-blue-500/30" : "border-border hover:border-blue-300",
                )}
              >
                <div className="h-20 bg-gray-50 border-b border-border flex items-center">
                  {renderPreview(opt.id)}
                </div>
                <div className="px-3 py-2.5 flex items-center justify-between">
                  <span className="text-xs font-medium">{opt.label}</span>
                  {active && (
                    <span className="text-[10px] font-semibold text-blue-600 uppercase tracking-wider">Selected</span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Sub-panel view ─────────────────────────────────────────
  if (activeTab) {
    const tab = tabs.find(t => t.id === activeTab)
    if (!tab) return null

    return (
      <div
        key={`sub-${activeTab}`}
        className="flex flex-col h-full animate-in fade-in slide-in-from-right-3 duration-200 ease-out"
      >
        <div className="px-4 py-3 border-b border-border flex items-center gap-2 shrink-0">
          <button
            className="text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setActiveTab(null)}
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold">{tab.label}</span>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {renderSubPanel(activeTab)}
        </div>
      </div>
    )
  }

  // ── Main tab list ──────────────────────────────────────────
  return (
    <div className="flex flex-col h-full animate-in fade-in slide-in-from-left-3 duration-200 ease-out">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2 shrink-0">
        <button className="text-muted-foreground hover:text-foreground transition-colors" onClick={onBack} aria-label="Back">
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
    } else {
      // Backfill default nav links for legacy headers that were seeded with empty blocks
      const hs = SECTION_SCHEMAS["header"]
      const preset = hs?.presets?.[0]
      loaded = loaded.map(sec => {
        if (sec.type !== "header") return sec
        const needsNav = !sec.blocks || sec.blocks.length === 0
        if (!needsNav || !preset?.blocks?.length) return sec
        return {
          ...sec,
          blocks: preset.blocks.map(b => ({
            id: `${b.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            type: b.type,
            settings: { ...b.settings },
          })),
        }
      })
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

    // Prefill default page title with "{seller name} | Storelib" the first
    // time the editor loads for a theme that has no SEO title set yet. The
    // user can freely edit or clear it — we only fill it in when blank.
    if (!loadedSettings.seo_title || typeof loadedSettings.seo_title !== "string" || !loadedSettings.seo_title.trim()) {
      const brand = (typeof loadedSettings.brand_name === "string" && loadedSettings.brand_name.trim())
        ? loadedSettings.brand_name.trim()
        : (data.username || inst.name || "My Store")
      loadedSettings.seo_title = `${brand} | Storelib`
    }

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

      // Mobile logo sync (header ↔ theme)
      const headerMobileLogo = header.settings.mobile_logo_url
      const themeMobileLogo = loadedSettings.mobile_logo_url
      if (headerMobileLogo && !themeMobileLogo) {
        loadedSettings.mobile_logo_url = headerMobileLogo as string
        if (header.settings.mobile_logo_height) loadedSettings.mobile_logo_width = header.settings.mobile_logo_height as number
      } else if (themeMobileLogo && !headerMobileLogo) {
        header.settings.mobile_logo_url = themeMobileLogo
        if (loadedSettings.mobile_logo_width) header.settings.mobile_logo_height = loadedSettings.mobile_logo_width
      }
      // use_mobile_logo flag sync — header is source of truth when set
      if (typeof header.settings.use_mobile_logo === "boolean") {
        loadedSettings.use_mobile_logo = header.settings.use_mobile_logo
      } else if (typeof loadedSettings.use_mobile_logo === "boolean") {
        header.settings.use_mobile_logo = loadedSettings.use_mobile_logo
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

  const reorderBlocks = (sectionId: string, blocks: { id: string; type: string; settings: Record<string, unknown> }[]) => {
    setSections(prev => prev.map(s =>
      s.id === sectionId ? { ...s, blocks } : s
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
                      {/* Custom Color Schemes editor */}
                      {group.id === "color_schemes" ? (
                        <ColorSchemesEditor
                          value={settingsDraft.color_schemes as Record<string, ColorSchemeValues> | undefined}
                          onChange={v => updateSetting("color_schemes", v)}
                        />
                      ) : group.id === "branding" ? (
                        <BrandingTabPanel
                          settingsDraft={settingsDraft}
                          updateSetting={updateSetting}
                        />
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
            onReorderBlocks={(blocks) => reorderBlocks(section.id, blocks)}
            products={products}
            collections={collections}
            customPages={[
              { name: "Home", key: "home" },
              { name: "About", key: "about" },
              { name: "Contact", key: "contact" },
              ...customPages.map(p => ({ name: p.name, key: p.key as string })),
            ]}
            themeSchemes={settingsDraft.color_schemes as Record<string, ColorSchemeValues> | undefined}
            onEditScheme={() => {
              setSidebarMode("settings")
              setExpandedSettings("color_schemes")
              setSelectedPanel({ type: "pages" })
            }}
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
            {/* Per-section color scheme picker (uses global Color Schemes) */}
            <SectionColorSchemePicker
              value={typeof section.settings.color_scheme === "string" ? section.settings.color_scheme : "white"}
              onChange={v => updateSectionSetting(section.id, "color_scheme", v)}
              themeSchemes={settingsDraft.color_schemes as Record<string, ColorSchemeValues> | undefined}
              onEditScheme={() => {
                setSidebarMode("settings")
                setExpandedSettings("color_schemes")
                setSelectedPanel({ type: "pages" })
              }}
            />

            {schema?.fields && schema.fields.length > 0 && (() => {
              // Colors are driven by the section's Color Scheme — hide any
              // color fields so sidebars only expose content + layout.
              // Also drop "header"/"paragraph" dividers that only separated
              // color groups and end up as orphans once the colors are gone.
              const visible = schema.fields.filter(f => f.type !== "color")
              const clean: typeof visible = []
              for (let i = 0; i < visible.length; i++) {
                const f = visible[i]
                if (f.type === "header" || f.type === "paragraph") {
                  const next = visible[i + 1]
                  // Drop a header if nothing meaningful follows before the
                  // next header (i.e. the whole group was colors).
                  if (!next || next.type === "header") continue
                }
                clean.push(f)
              }
              if (clean.length === 0) return null
              return (
                <div className="p-4 space-y-4">
                  {clean.map(field => (
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
              )
            })()}

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
                      <BrandingTabPanel
                        settingsDraft={settingsDraft}
                        updateSetting={updateSetting}
                      />
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
        {/* LEFT: Back + sidebar mode toggles (desktop only) */}
        <div className="flex items-center gap-1.5 min-w-0">
          {isMobileView && (
            <button
              type="button"
              aria-label={mobileSidebarOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileSidebarOpen}
              onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
              className="h-8 w-8 shrink-0 flex items-center justify-center rounded-md hover:bg-muted transition-colors"
            >
              <span className="relative block h-[14px] w-[18px]">
                <span
                  className="absolute left-0 h-[2px] w-full bg-current rounded-full transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
                  style={{ top: mobileSidebarOpen ? "6px" : "0px", transform: mobileSidebarOpen ? "rotate(45deg)" : "rotate(0deg)" }}
                />
                <span
                  className="absolute left-0 top-[6px] h-[2px] w-full bg-current rounded-full transition-opacity duration-200 ease-out"
                  style={{ opacity: mobileSidebarOpen ? 0 : 1 }}
                />
                <span
                  className="absolute left-0 h-[2px] w-full bg-current rounded-full transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
                  style={{ top: mobileSidebarOpen ? "6px" : "12px", transform: mobileSidebarOpen ? "rotate(-45deg)" : "rotate(0deg)" }}
                />
              </span>
            </button>
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

          {/* Desktop: sidebar mode toggles (Pages / Sections / General Settings)
              Moved up from the old vertical rail so the sidebar gets the full
              horizontal space for its panel content. */}
          {!isMobileView && (
            <div className="flex items-center gap-0.5 ml-1">
              <button
                className={cn(
                  "h-8 w-8 flex items-center justify-center rounded-md transition-colors",
                  pageBrowserOpen
                    ? "bg-neutral-200/80 text-foreground"
                    : "text-muted-foreground hover:bg-neutral-100 hover:text-foreground",
                )}
                onClick={() => { setPageBrowserOpen(true); setSelectedPanel({ type: "pages" }) }}
                title="Pages"
              >
                <FileText className="h-[17px] w-[17px]" />
              </button>
              <button
                className={cn(
                  "h-8 w-8 flex items-center justify-center rounded-md transition-colors",
                  sidebarMode === "sections" && !pageBrowserOpen
                    ? "bg-neutral-200/80 text-foreground"
                    : "text-muted-foreground hover:bg-neutral-100 hover:text-foreground",
                )}
                onClick={() => { setSidebarMode("sections"); setPageBrowserOpen(false); setSelectedPanel({ type: "pages" }) }}
                title="Sections"
              >
                <Layers className="h-[17px] w-[17px]" />
              </button>
              <button
                className={cn(
                  "h-8 w-8 flex items-center justify-center rounded-md transition-colors",
                  sidebarMode === "settings" && !pageBrowserOpen
                    ? "bg-neutral-200/80 text-foreground"
                    : "text-muted-foreground hover:bg-neutral-100 hover:text-foreground",
                )}
                onClick={() => { setSidebarMode("settings"); setPageBrowserOpen(false); setSelectedPanel({ type: "theme_settings" }) }}
                title="General Settings"
              >
                <Settings className="h-[17px] w-[17px]" />
              </button>
            </div>
          )}
        </div>

        {/* CENTER: theme name + Live badge + 3-dots menu + unsaved indicator */}
        <div className="flex-1 flex items-center justify-center gap-2 min-w-0">
          <span className="text-sm font-semibold text-foreground truncate hidden md:block max-w-[220px]">{install?.name}</span>
          {install?.status === "published" && (
            <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-200 text-[10px] font-semibold uppercase tracking-wide shrink-0 px-2 py-0">
              <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Live
            </Badge>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-muted transition-colors shrink-0" title="Theme options">
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-52 z-[100]">
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
          {isDirty && (
            <span className="text-xs text-amber-600 hidden md:inline ml-2">Unsaved changes</span>
          )}
        </div>

        {/* RIGHT: view live, device switcher, undo/redo, save */}
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

          {/* Undo / Redo — sit next to the Save button per the mock */}
          <div className="flex items-center border border-border rounded-lg overflow-hidden shrink-0">
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
      <div className="relative flex flex-1 min-h-0 overflow-hidden">
        {/* ── Left sidebar (desktop — no vertical rail, switches live in topbar) ── */}
        {!isMobileView ? (
          <div className="relative flex-shrink-0 border-r border-border bg-background flex h-full overflow-hidden">
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden" style={{ width: sidebarWidth, minWidth: 280 }}>
              <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
                {renderSidebarContent()}
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Mobile sidebar overlay — slides in from the left UNDER the topbar */}
            <div
              className={cn(
                "absolute inset-y-0 left-0 z-30 w-[85vw] max-w-[360px] bg-background border-r border-border flex will-change-transform shadow-2xl",
              )}
              style={{
                top: 0,
                transform: mobileSidebarOpen ? "translateX(0)" : "translateX(-102%)",
                transition: "transform 420ms cubic-bezier(0.22, 1, 0.36, 1)",
              }}
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
            {/* Backdrop — fade in/out smoothly */}
            <div
              className="absolute inset-0 z-20 bg-black/40"
              style={{
                opacity: mobileSidebarOpen ? 1 : 0,
                pointerEvents: mobileSidebarOpen ? "auto" : "none",
                transition: "opacity 320ms cubic-bezier(0.22, 1, 0.36, 1)",
              }}
              onClick={() => setMobileSidebarOpen(false)}
            />
          </>
        )}

        {/* ── Canvas ── */}
        <main
          className={cn(
            "flex-1 min-w-0 bg-muted/50",
            device === "mobile"
              ? "overflow-hidden flex items-start justify-center py-8 px-6"
              : "overflow-y-auto overflow-x-hidden",
          )}
          style={device === "mobile" ? undefined : { paddingTop: "24px", paddingLeft: "24px", paddingRight: "24px", paddingBottom: 0 }}
        >
          <div
            id="wb-preview-root"
            className={cn(
              "relative bg-white shadow-xl transition-all duration-300 mx-auto flex flex-col overflow-hidden",
              device === "mobile"
                ? "rounded-2xl"
                : "rounded-t-xl w-full max-w-[1400px]",
            )}
            style={
              device === "mobile"
                ? {
                    // Phone-shaped — fixed width keeps content from reflowing while
                    // the height adapts to the available viewport (browser zoom).
                    width: "380px",
                    height: "min(800px, calc(100vh - 96px))",
                    flex: "0 0 auto",
                  }
                : { minHeight: "calc(100vh - 72px)" }
            }
          >
            {/* Inner scroll container — for mobile the phone is the viewport;
                for desktop the outer <main> handles scrolling. */}
            <div
              className={cn(
                "flex flex-col w-full",
                device === "mobile" ? "flex-1 min-h-0 overflow-y-auto overflow-x-hidden" : "flex-1",
              )}
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
                    <SectionRenderer section={section} theme={activeThemeSettings} isEditing={true} isSelected={selectedSectionId === section.id} onClick={() => { setSelectedPanel({ type: "section", sectionId: section.id }); scrollToSection(section.id) }} deviceMode={device} />
                  </div>
                ))}

                {/* Body sections — flex-1 so footer sticks to bottom without trailing whitespace */}
                <div className="flex-1">
                  {sections.filter(s => s.type !== "header" && s.type !== "footer").map(section => (
                    <div key={section.id} id={`wb-section-${section.id}`}>
                      <SectionRenderer section={section} theme={activeThemeSettings} isEditing={true} isSelected={selectedSectionId === section.id} onClick={() => { setSelectedPanel({ type: "section", sectionId: section.id }); scrollToSection(section.id) }} deviceMode={device} />
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
                    <SectionRenderer section={section} theme={activeThemeSettings} isEditing={true} isSelected={selectedSectionId === section.id} onClick={() => { setSelectedPanel({ type: "section", sectionId: section.id }); scrollToSection(section.id) }} deviceMode={device} />
                  </div>
                ))}
              </>
            )}
            </div>
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
