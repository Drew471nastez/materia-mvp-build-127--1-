"use client"

import { useEffect, useState, useCallback, use } from "react"
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
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
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
      <div className="space-y-2">
        {typeof raw === "string" && raw && (
          <div className="relative w-full aspect-video rounded-lg overflow-hidden border border-border">
            <img src={raw} alt="" className="w-full h-full object-cover" />
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
          placeholder="Paste image URL..."
          value={typeof raw === "string" ? raw : ""}
          onChange={e => onChange(e.target.value)}
        />
      </div>
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

// ── Section Preview Components for Modal ─────────────────────
function SectionPreviewThumbnail({ type }: { type: string }) {
  const schema = SECTION_SCHEMAS[type]
  if (!schema) return <div className="w-full h-full bg-muted flex items-center justify-center"><Layout className="h-8 w-8 text-muted-foreground/30" /></div>

  switch (type) {
    case "hero":
      return (
        <div className="w-full h-full bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 flex flex-col items-center justify-center gap-2 p-4 text-white">
          <div className="h-2 bg-white/90 rounded w-3/5" />
          <div className="h-1.5 bg-white/50 rounded w-2/5" />
          <div className="h-5 bg-white/90 rounded-md w-1/4 mt-1" />
        </div>
      )
    case "video_hero":
      return (
        <div className="w-full h-full bg-gradient-to-br from-slate-800 to-slate-900 flex flex-col items-center justify-center gap-2 p-4">
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
            <Play className="h-5 w-5 text-white/80 fill-white/80" />
          </div>
          <div className="h-1.5 bg-white/60 rounded w-2/5" />
        </div>
      )
    case "rich_text":
      return (
        <div className="w-full h-full bg-white flex flex-col gap-2 items-center justify-center p-4">
          <div className="h-2.5 bg-slate-800 rounded w-1/3" />
          <div className="space-y-1.5 w-4/5">
            <div className="h-1.5 bg-slate-300 rounded w-full" />
            <div className="h-1.5 bg-slate-200 rounded w-11/12" />
            <div className="h-1.5 bg-slate-200 rounded w-4/5" />
          </div>
        </div>
      )
    case "split_content":
      return (
        <div className="w-full h-full bg-white flex gap-2 p-3">
          <div className="flex-1 bg-gradient-to-br from-purple-100 to-blue-100 rounded-lg flex items-center justify-center">
            <Image className="h-5 w-5 text-slate-400" />
          </div>
          <div className="flex-1 flex flex-col gap-1.5 justify-center py-1">
            <div className="h-2 bg-slate-800 rounded w-4/5" />
            <div className="h-1.5 bg-slate-300 rounded w-full" />
            <div className="h-1.5 bg-slate-200 rounded w-3/4" />
            <div className="h-4 bg-purple-500 rounded w-3/5 mt-1" />
          </div>
        </div>
      )
    case "image_banner":
      return (
        <div className="w-full h-full bg-gradient-to-br from-amber-100 via-orange-200 to-rose-200 flex items-center justify-center">
          <div className="text-center">
            <div className="h-2 bg-slate-800/60 rounded w-24 mx-auto mb-1" />
            <div className="h-1.5 bg-slate-800/30 rounded w-16 mx-auto" />
          </div>
        </div>
      )
    case "slideshow":
      return (
        <div className="w-full h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 flex items-center justify-center relative">
          <div className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 rounded-full bg-white/30" />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 rounded-full bg-white/30" />
          <div className="h-2 bg-white/80 rounded w-1/3" />
        </div>
      )
    case "product_list":
      return (
        <div className="w-full h-full bg-white p-3 flex flex-col gap-2">
          <div className="h-2 bg-slate-800 rounded w-1/3" />
          <div className="flex-1 grid grid-cols-3 gap-1.5">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-slate-100 rounded-lg flex flex-col overflow-hidden border border-slate-200">
                <div className="flex-1 bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center">
                  <Package className="h-3 w-3 text-slate-400" />
                </div>
                <div className="p-1 space-y-0.5">
                  <div className="h-1 bg-slate-600 rounded w-full" />
                  <div className="h-1 bg-emerald-500 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )
    case "feature_grid":
      return (
        <div className="w-full h-full bg-white p-3 flex flex-col gap-2">
          <div className="h-2 bg-slate-800 rounded w-2/5 mx-auto" />
          <div className="flex-1 grid grid-cols-3 gap-2">
            {[{ c: "bg-purple-100 text-purple-500" }, { c: "bg-blue-100 text-blue-500" }, { c: "bg-emerald-100 text-emerald-500" }].map((item, i) => (
              <div key={i} className="flex flex-col items-center gap-1 p-1">
                <div className={cn("w-6 h-6 rounded-full flex items-center justify-center", item.c)}>
                  <Star className="w-3 h-3" />
                </div>
                <div className="h-1.5 bg-slate-700 rounded w-full" />
                <div className="h-1 bg-slate-300 rounded w-4/5" />
              </div>
            ))}
          </div>
        </div>
      )
    case "testimonials":
      return (
        <div className="w-full h-full bg-slate-50 p-3 flex flex-col gap-2">
          <div className="h-2 bg-slate-800 rounded w-1/3 mx-auto" />
          <div className="flex-1 flex gap-2">
            {[1, 2].map(i => (
              <div key={i} className="flex-1 bg-white rounded-lg p-2 border border-slate-200">
                <div className="flex gap-0.5 mb-1">
                  {[1, 2, 3, 4, 5].map(s => <Star key={s} className="w-2 h-2 text-amber-400 fill-amber-400" />)}
                </div>
                <div className="h-1 bg-slate-300 rounded w-full mb-0.5" />
                <div className="h-1 bg-slate-200 rounded w-3/4" />
              </div>
            ))}
          </div>
        </div>
      )
    case "faq":
      return (
        <div className="w-full h-full bg-white p-3 flex flex-col gap-1.5">
          <div className="h-2 bg-slate-800 rounded w-1/4 mx-auto mb-1" />
          {[1, 2, 3].map(i => (
            <div key={i} className="flex items-center justify-between px-2 py-1.5 border border-slate-200 rounded-md">
              <div className="h-1.5 bg-slate-600 rounded w-2/3" />
              <ChevronDown className="h-2.5 w-2.5 text-slate-400" />
            </div>
          ))}
        </div>
      )
    case "cta":
      return (
        <div className="w-full h-full bg-gradient-to-br from-purple-600 to-indigo-700 flex flex-col items-center justify-center gap-2 p-4">
          <div className="h-2 bg-white/90 rounded w-2/5" />
          <div className="h-1.5 bg-white/50 rounded w-3/5" />
          <div className="h-5 bg-white rounded-md w-1/4 mt-1" />
        </div>
      )
    case "stats":
      return (
        <div className="w-full h-full bg-slate-50 p-3 flex items-center justify-center">
          <div className="grid grid-cols-4 gap-4 w-full">
            {["10K+", "500+", "99%", "24/7"].map((n, i) => (
              <div key={i} className="text-center">
                <div className="text-[10px] font-bold text-purple-600">{n}</div>
                <div className="h-1 bg-slate-300 rounded w-3/4 mx-auto mt-0.5" />
              </div>
            ))}
          </div>
        </div>
      )
    case "newsletter":
      return (
        <div className="w-full h-full bg-gradient-to-br from-blue-600 to-indigo-600 flex flex-col items-center justify-center gap-2 p-4">
          <Mail className="h-5 w-5 text-white/80" />
          <div className="h-1.5 bg-white/80 rounded w-2/5" />
          <div className="flex gap-1 w-3/5">
            <div className="flex-1 h-4 bg-white/20 rounded" />
            <div className="h-4 w-12 bg-white rounded" />
          </div>
        </div>
      )
    case "pricing":
      return (
        <div className="w-full h-full bg-white p-3 flex flex-col gap-2">
          <div className="h-2 bg-slate-800 rounded w-1/3 mx-auto" />
          <div className="flex-1 grid grid-cols-3 gap-1.5">
            {[false, true, false].map((featured, i) => (
              <div key={i} className={cn("rounded-lg p-1.5 border flex flex-col gap-1", featured ? "bg-purple-600 border-purple-600" : "bg-white border-slate-200")}>
                <div className={cn("h-1.5 rounded w-2/3", featured ? "bg-white/80" : "bg-slate-600")} />
                <div className={cn("text-[8px] font-bold", featured ? "text-white" : "text-slate-800")}>$29</div>
                <div className={cn("h-3 rounded text-[6px] flex items-center justify-center font-medium", featured ? "bg-white text-purple-600" : "bg-purple-600 text-white")}>Buy</div>
              </div>
            ))}
          </div>
        </div>
      )
    case "gallery":
      return (
        <div className="w-full h-full bg-white p-3">
          <div className="grid grid-cols-3 gap-1.5 h-full">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="bg-gradient-to-br from-slate-200 to-slate-300 rounded-md" />
            ))}
          </div>
        </div>
      )
    case "logo_bar":
      return (
        <div className="w-full h-full bg-slate-50 flex items-center justify-center gap-4 p-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-5 w-12 bg-slate-300 rounded opacity-60" />
          ))}
        </div>
      )
    case "trust_badges":
      return (
        <div className="w-full h-full bg-white flex items-center justify-center gap-3 p-4">
          {[Shield, Star, Award].map((Icon, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center">
                <Icon className="h-3.5 w-3.5 text-emerald-600" />
              </div>
              <div className="h-1 bg-slate-400 rounded w-8" />
            </div>
          ))}
        </div>
      )
    default:
      return (
        <div className="w-full h-full bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
          <SectionIcon type={type} className="h-8 w-8 text-muted-foreground/30" />
        </div>
      )
  }
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

  const byCategory = ADDABLE_SECTIONS.reduce<Record<string, string[]>>((acc, type) => {
    const cat = SECTION_SCHEMAS[type]?.category ?? "content"
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(type)
    return acc
  }, {})

  const categories = Object.keys(byCategory)
  const visibleCategory = activeCategory ?? categories[0]
  const visibleSections = activeCategory ? byCategory[activeCategory] ?? [] : ADDABLE_SECTIONS

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 gap-0 flex flex-col overflow-hidden rounded-2xl w-[calc(100vw-32px)] max-w-4xl h-[85vh] sm:h-[80vh]">
        <DialogHeader className="px-6 py-4 border-b border-border shrink-0 bg-background">
          <DialogTitle className="text-lg font-semibold">Add New Section</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">Choose a section to add to your page</DialogDescription>
        </DialogHeader>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left: Categories */}
          <div className="w-[200px] border-r border-border bg-muted/30 overflow-y-auto shrink-0 py-2">
            <button
              className={cn(
                "w-full text-left px-4 py-2.5 text-sm transition-colors",
                !activeCategory ? "text-purple-600 font-semibold bg-purple-50 border-l-2 border-purple-600" : "text-foreground hover:bg-muted"
              )}
              onClick={() => setActiveCategory(null)}
            >
              All Sections
            </button>
            {categories.map(cat => (
              <button
                key={cat}
                className={cn(
                  "w-full text-left px-4 py-2.5 text-sm transition-colors",
                  activeCategory === cat ? "text-purple-600 font-semibold bg-purple-50 border-l-2 border-purple-600" : "text-foreground hover:bg-muted"
                )}
                onClick={() => setActiveCategory(cat)}
              >
                {SECTION_CATEGORIES[cat] ?? cat}
              </button>
            ))}
          </div>

          {/* Right: Section previews */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {visibleSections.map(type => {
                const schema = SECTION_SCHEMAS[type]
                if (!schema) return null
                return (
                  <button
                    key={type}
                    onClick={() => { onAddSection(type); onOpenChange(false) }}
                    className="group flex flex-col rounded-xl border border-border bg-background overflow-hidden transition-all hover:border-purple-400 hover:shadow-lg hover:scale-[1.01] focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer text-left"
                  >
                    {/* Preview thumbnail */}
                    <div className="w-full aspect-[16/9] overflow-hidden border-b border-border/50 bg-muted">
                      <SectionPreviewThumbnail type={type} />
                    </div>
                    {/* Info */}
                    <div className="p-3 flex items-center gap-2.5">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground group-hover:bg-purple-100 group-hover:text-purple-600 shrink-0 transition-colors">
                        <SectionIcon type={type} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm truncate">{schema.name}</p>
                        {schema.description && <p className="text-xs text-muted-foreground truncate">{schema.description}</p>}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
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

  // Group header fields into categories
  const tabs = [
    {
      id: "logo",
      label: "Store Logo",
      fields: schema?.fields?.filter((f: SchemaField) =>
        ["logo_text", "logo_url", "logo_font"].includes(f.id)
      ) ?? [],
    },
    {
      id: "nav",
      label: "Navigation Links",
      isBlocks: true,
    },
    {
      id: "settings",
      label: "Header Settings",
      fields: schema?.fields?.filter((f: SchemaField) =>
        ["hdr_layout", "sticky", "transparent_on_hero", "nav_alignment", "max_width"].includes(f.id)
      ) ?? [],
    },
    {
      id: "announcement",
      label: "Announcement Bar",
      fields: schema?.fields?.filter((f: SchemaField) =>
        f.id.startsWith("hdr_button") || ["cta_text", "cta_url", "cta_style", "cta_color", "cta_text_color", "cta_border_radius"].includes(f.id)
      ) ?? [],
    },
    {
      id: "elements",
      label: "Elements",
      fields: schema?.fields?.filter((f: SchemaField) =>
        ["hdr_style", "bg_color", "text_color", "border_color", "show_border"].includes(f.id)
      ) ?? [],
    },
  ]

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

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {tab.id === "nav" ? (
            // Navigation links (blocks)
            <div className="space-y-3">
              {(section.blocks ?? []).map(block => {
                const blockSchema = schema?.blocks?.find((b: any) => b.type === block.type)
                return (
                  <details key={block.id} className="group border border-border rounded-lg overflow-hidden">
                    <summary className="flex items-center justify-between px-3 py-2.5 cursor-pointer list-none bg-muted/30 hover:bg-muted/50">
                      <span className="text-sm font-medium">
                        {String(block.settings.label || "Nav link")}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          className="h-6 w-6 flex items-center justify-center rounded hover:bg-red-50 text-red-400 hover:text-red-600"
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
                          <FieldEditor
                            field={field}
                            value={block.settings[field.id]}
                            onChange={val => onUpdateBlockSetting(block.id, field.id, val)}
                          />
                        </div>
                      ))}
                    </div>
                  </details>
                )
              })}
              {(!schema?.max_blocks || (section.blocks?.length ?? 0) < schema.max_blocks) && (
                <button
                  className="w-full flex items-center justify-center gap-1.5 py-2.5 text-sm text-muted-foreground hover:text-foreground border border-dashed border-border hover:border-purple-400 rounded-lg transition-colors"
                  onClick={() => onAddBlock("nav_link")}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add nav link
                </button>
              )}
            </div>
          ) : (
            // Regular fields
            tab.fields?.map((field: SchemaField) => (
              <div key={field.id}>
                {field.type !== "header" && field.type !== "paragraph" && (
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{field.label}</label>
                )}
                <FieldEditor
                  field={field}
                  value={section.settings[field.id]}
                  onChange={val => onUpdateSetting(field.id, val)}
                />
              </div>
            ))
          )}
        </div>
      </div>
    )
  }

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
  const [currentPage, setCurrentPage] = useState<PageKey>("home")
  const [selectedPanel, setSelectedPanel] = useState<Panel>({ type: "pages" })
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [expandedSettings, setExpandedSettings] = useState<string | null>("branding")
  const [addSectionOpen, setAddSectionOpen] = useState(false)
  const [previewMode, setPreviewMode] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(300)
  const [isMobileView, setIsMobileView] = useState(false)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(true)
  const [username, setUsername] = useState("")

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
    setSettingsDraft(settings?.draft_settings ?? settings?.settings ?? {})

    // Load sections for current page
    await loadSections(currentPage)
    setLoading(false)
  }, [installId, currentPage])

  const loadSections = useCallback(async (page: PageKey) => {
    const res = await fetch(`/api/website-builder/themes/${installId}/sections?page=${page}`)
    if (!res.ok) return
    const data = await res.json()
    setSections(data.sections ?? [])
  }, [installId])

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

  const handlePageChange = async (page: PageKey) => {
    setCurrentPage(page)
    setSelectedPanel({ type: "pages" })
    await loadSections(page)
  }

  // Settings change
  const updateSetting = (key: string, value: unknown) => {
    setSettingsDraft(prev => ({ ...prev, [key]: value }))
    setIsDirty(true)
  }

  // Section settings change
  const updateSectionSetting = (sectionId: string, key: string, value: unknown) => {
    setSections(prev => prev.map(s =>
      s.id === sectionId ? { ...s, settings: { ...s.settings, [key]: value } } : s
    ))
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
    setSections(prev => prev.filter(s => s.id !== sectionId))
    if (selectedSectionId === sectionId) {
      setSelectedPanel({ type: "pages" })
    }
    setIsDirty(true)
  }

  const duplicateSection = (sectionId: string) => {
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
  }

  const saveDraft = async () => {
    setSaving(true)
    try {
      await fetch(`/api/website-builder/themes/${installId}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft_settings: settingsDraft }),
      })

      await fetch(`/api/website-builder/themes/${installId}/sections`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page_key: currentPage, sections, mode: "draft" }),
      })

      setIsDirty(false)
      toast.success("Draft saved")
    } catch {
      toast.error("Failed to save draft")
    }
    setSaving(false)
  }

  const publishChanges = async () => {
    setPublishing(true)
    try {
      // Save current state first (both settings and sections)
      await fetch(`/api/website-builder/themes/${installId}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: settingsDraft, draft_settings: settingsDraft, mode: "publish" }),
      })

      await fetch(`/api/website-builder/themes/${installId}/sections`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page_key: currentPage, sections, mode: "publish" }),
      })

      // Then publish
      const res = await fetch(`/api/website-builder/themes/${installId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "publish" }),
      })

      if (!res.ok) {
        const d = await res.json()
        toast.error(d.error ?? "Failed to publish")
        setPublishing(false)
        return
      }

      setIsDirty(false)
      toast.success("Published and live!")
      await loadData()
    } catch {
      toast.error("Failed to publish")
    }
    setPublishing(false)
  }

  const handleSave = async () => {
    await saveDraft()
  }

  const activeThemeSettings: ThemeSettingsValues = settingsDraft

  // Narrow the selected section id safely
  const selectedSectionId: string | null =
    selectedPanel.type === "section" ? (selectedPanel as { type: "section"; sectionId: string }).sectionId : null

  // ── Sidebar panel rendering ─────────────────────────────────
  const renderSidebarContent = () => {
    // PAGES panel (default — shows section list)
    if (selectedPanel.type === "pages") {
      const header = sections.find(s => s.type === "header")
      const footer = sections.find(s => s.type === "footer")
      const bodySection = sections.filter(s => s.type !== "header" && s.type !== "footer")

      return (
        <div className="flex flex-col h-full">
          <div className="px-4 py-3 border-b border-border shrink-0">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Page</p>
            <p className="text-sm font-semibold mt-0.5">{PAGE_META[currentPage]?.label}</p>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-1">
            {/* Header */}
            {header && (
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-1 mb-1">Header</p>
                <SidebarSectionRow
                  section={header}
                  isSelected={selectedSectionId === header.id}
                  onSelect={() => setSelectedPanel({ type: "section", sectionId: header.id })}
                  onToggleHide={() => toggleSectionHidden(header.id)}
                  onDuplicate={() => duplicateSection(header.id)}
                  onRemove={() => removeSection(header.id)}
                  isStructure
                />
              </div>
            )}

            {/* Template sections */}
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-1 mb-1 mt-3">Template</p>
              <div className="space-y-1">
                {bodySection.map(section => (
                  <SidebarSectionRow
                    key={section.id}
                    section={section}
                    isSelected={selectedSectionId === section.id}
                    onSelect={() => setSelectedPanel({ type: "section", sectionId: section.id })}
                    onToggleHide={() => toggleSectionHidden(section.id)}
                    onDuplicate={() => duplicateSection(section.id)}
                    onRemove={() => removeSection(section.id)}
                  />
                ))}
                <button
                  className="w-full flex items-center gap-1.5 px-2.5 py-2.5 text-sm text-purple-600 hover:bg-purple-50 rounded-lg transition-colors font-medium"
                  onClick={() => setAddSectionOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                  Add section
                </button>
              </div>
            </div>

            {/* Footer */}
            {footer && (
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-1 mb-1 mt-3">Footer</p>
                <SidebarSectionRow
                  section={footer}
                  isSelected={selectedSectionId === footer.id}
                  onSelect={() => setSelectedPanel({ type: "section", sectionId: footer.id })}
                  onToggleHide={() => toggleSectionHidden(footer.id)}
                  onDuplicate={() => duplicateSection(footer.id)}
                  onRemove={() => removeSection(footer.id)}
                  isStructure
                />
              </div>
            )}

            {/* Theme settings link */}
            <div className="mt-4 pt-4 border-t border-border">
              <button
                className="w-full flex items-center gap-2 px-2.5 py-2.5 rounded-lg text-sm font-medium transition-colors text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => setSelectedPanel({ type: "theme_settings" })}
              >
                <Palette className="h-4 w-4" />
                Theme settings
              </button>
            </div>
          </div>
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
        <div className="flex flex-col h-full">
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
                    {group.fields.map(field => (
                      <div key={field.id}>
                        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{field.label}</label>
                        <FieldEditor
                          field={field}
                          value={settingsDraft[field.id]}
                          onChange={val => updateSetting(field.id, val)}
                        />
                        {field.info && <p className="text-[11px] text-muted-foreground mt-1">{field.info}</p>}
                      </div>
                    ))}
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

  // ── Loading state ──────────────────────────────────────────
  if (loading) {
    return (
      <div className="h-svh flex items-center justify-center bg-muted/30">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
          <p className="text-sm text-muted-foreground">Loading editor...</p>
        </div>
      </div>
    )
  }

  // ── Preview mode ───────────────────────────────────────────
  if (previewMode) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-background">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-4">
          <span className="text-sm font-medium">Preview Mode</span>
          <Button size="sm" onClick={() => setPreviewMode(false)} className="bg-purple-600 hover:bg-purple-700 text-white">
            Exit Preview
          </Button>
        </div>
        <div className="flex-1 overflow-auto flex items-start justify-center p-6 bg-muted/50">
          <div className={cn("bg-white rounded-xl shadow-lg overflow-hidden", device === "mobile" ? "w-[390px]" : "w-full max-w-5xl")} style={{ minHeight: "600px" }}>
            {settingsDraft.announcement_bar_enabled && settingsDraft.announcement_bar_text && (
              <div className="w-full py-2 text-center text-sm font-medium" style={{ background: String(settingsDraft.announcement_bar_bg ?? "#6366f1"), color: String(settingsDraft.announcement_bar_color ?? "#ffffff") }}>
                {String(settingsDraft.announcement_bar_text)}
              </div>
            )}
            {sections.map(section => (
              <SectionRenderer key={section.id} section={section} theme={activeThemeSettings} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ── Website URL display ────────────────────────────────────
  const websiteUrl = username ? getWebsiteShareUrl(username) : ""
  const websiteUrlDisplay = username ? getWebsiteUrlDisplay(username) : ""

  // ── Main editor layout ─────────────────────────────────────
  return (
    <div className="h-svh flex flex-col bg-muted/30 overflow-hidden">
      {/* ── Top bar ── */}
      <header className="h-14 bg-background border-b border-border flex items-center px-3 md:px-4 gap-2 shrink-0 z-30">
        {/* Left side */}
        <div className="flex items-center gap-1.5 md:gap-2 min-w-0">
          {isMobileView && (
            <Button variant="outline" size="icon" className="h-9 w-9 shrink-0 bg-transparent" onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}>
              <PanelLeft className="h-5 w-5" />
            </Button>
          )}

          {/* Back menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-9 w-9 bg-transparent shrink-0 cursor-pointer">
                <Menu className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56 z-[100]">
              <DropdownMenuItem onClick={() => {
                if (isDirty && !window.confirm("You have unsaved changes. Are you sure you want to leave?")) return
                router.push("/app/website-builder")
              }} className="cursor-pointer">
                Back to Website Builder
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => {
                if (isDirty && !window.confirm("You have unsaved changes. Are you sure you want to leave?")) return
                router.push("/app")
              }} className="cursor-pointer">
                Back to Dashboard
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {websiteUrl && (
                <DropdownMenuItem onClick={() => window.open(websiteUrl, "_blank")} className="cursor-pointer">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  View Live Website
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Page Switcher */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 border-border bg-background shrink-0 cursor-pointer justify-between gap-1.5 w-[160px] md:w-[200px]">
                <span className="truncate flex-1 text-left text-sm font-normal">
                  {PAGE_META[currentPage]?.label ?? currentPage}
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="z-[100]">
              {(Object.keys(PAGE_META) as PageKey[]).map(key => (
                <DropdownMenuItem key={key} onClick={() => handlePageChange(key)} className="cursor-pointer">
                  {PAGE_META[key].label}
                  {currentPage === key && <Check className="h-3.5 w-3.5 ml-auto text-purple-600" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Add Section Button */}
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 bg-transparent shrink-0 cursor-pointer"
            onClick={() => setAddSectionOpen(true)}
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Add</span>
          </Button>
        </div>

        {/* Center: theme name + status */}
        <div className="flex-1 flex items-center justify-center gap-2 min-w-0">
          <span className="text-sm font-medium text-foreground truncate hidden md:block">{install?.name}</span>
          {install?.status === "published" && (
            <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-200 text-[10px] font-semibold uppercase tracking-wide shrink-0">Live</Badge>
          )}
          {isDirty && (
            <span className="text-xs text-amber-600 hidden md:inline">Unsaved changes</span>
          )}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2 shrink-0">
          {/* View Live */}
          {websiteUrl && (
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 bg-transparent hidden sm:flex cursor-pointer"
              onClick={() => window.open(websiteUrl, "_blank")}
            >
              <ExternalLink className="h-4 w-4" />
              <span className="hidden md:inline">View Live</span>
            </Button>
          )}

          {/* Device Switcher */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-1.5 bg-transparent hidden sm:flex cursor-pointer">
                {device === "desktop" ? <Monitor className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="z-[100]">
              <DropdownMenuItem onClick={() => setDevice("desktop")} className="cursor-pointer">
                <Monitor className="mr-2 h-4 w-4" /> Desktop
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setDevice("mobile")} className="cursor-pointer">
                <Smartphone className="mr-2 h-4 w-4" /> Mobile
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Preview */}
          <Button size="sm" className="h-9 bg-gray-900 text-white hover:bg-gray-800 cursor-pointer" onClick={() => setPreviewMode(true)}>
            <span className="hidden sm:inline">Preview</span>
            <Monitor className="h-4 w-4 sm:hidden" />
          </Button>

          {/* Save Draft button */}
          <Button
            size="sm"
            variant="outline"
            className="h-9 cursor-pointer gap-1.5"
            onClick={handleSave}
            disabled={saving || !isDirty}
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="hidden sm:inline">Saving...</span>
              </>
            ) : isDirty ? (
              <>
                <Save className="h-4 w-4" />
                <span className="hidden sm:inline">Save</span>
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                <span className="hidden sm:inline">Saved</span>
              </>
            )}
          </Button>

          {/* Publish button */}
          <Button
            size="sm"
            className="h-9 cursor-pointer gap-1.5 bg-purple-600 text-white hover:bg-purple-700"
            onClick={publishChanges}
            disabled={publishing}
          >
            {publishing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="hidden sm:inline">Publishing...</span>
              </>
            ) : (
              <>
                <Globe className="h-4 w-4" />
                <span className="hidden sm:inline">Publish</span>
              </>
            )}
          </Button>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* ── Left sidebar ── */}
        {!isMobileView ? (
          <div
            className="relative flex-shrink-0 border-r border-border bg-background flex flex-col h-full overflow-hidden"
            style={{ width: sidebarWidth, minWidth: 280 }}
          >
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
              {renderSidebarContent()}
            </div>
          </div>
        ) : (
          <>
            {/* Mobile sidebar overlay */}
            <div
              className={cn(
                "absolute inset-y-0 left-0 z-30 w-[85vw] max-w-[320px] bg-background border-r border-border transition-transform duration-300 ease-in-out",
                mobileSidebarOpen ? "translate-x-0" : "-translate-x-full",
              )}
              style={{ top: "56px" }}
            >
              <div className="flex flex-col h-full">
                {renderSidebarContent()}
              </div>
            </div>
            {mobileSidebarOpen && (
              <div className="absolute inset-0 z-20 bg-black/30" style={{ top: "56px" }} onClick={() => setMobileSidebarOpen(false)} />
            )}
          </>
        )}

        {/* ── Canvas ── */}
        <main className="flex-1 min-w-0 h-full overflow-y-auto overflow-x-hidden bg-muted/50 p-4 md:p-6 flex items-start justify-center">
          <div
            className={cn(
              "bg-white rounded-xl shadow-lg overflow-hidden transition-all duration-300",
              device === "mobile" ? "w-[390px]" : "w-full max-w-5xl",
            )}
            style={{ minHeight: "600px" }}
          >
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

            {/* Sections */}
            {sections.map(section => (
              <SectionRenderer
                key={section.id}
                section={section}
                theme={activeThemeSettings}
                isEditing={true}
                isSelected={selectedSectionId === section.id}
                onClick={() => setSelectedPanel({ type: "section", sectionId: section.id })}
              />
            ))}

            {sections.length === 0 && (
              <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
                <div className="text-center">
                  <Layers className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">No sections yet</p>
                  <button
                    className="mt-2 text-purple-600 underline text-sm font-medium"
                    onClick={() => setAddSectionOpen(true)}
                  >
                    Add a section
                  </button>
                </div>
              </div>
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
}: {
  section: SectionInstance
  isSelected: boolean
  onSelect: () => void
  onToggleHide: () => void
  onDuplicate: () => void
  onRemove: () => void
  isStructure?: boolean
}) {
  return (
    <div
      className={cn(
        "group flex items-center gap-2 px-2.5 py-2.5 rounded-lg cursor-pointer transition-colors",
        isSelected ? "bg-purple-600 text-white" : "hover:bg-muted text-foreground",
        section.hidden && "opacity-50",
      )}
      onClick={onSelect}
    >
      {!isStructure && (
        <GripVertical className={cn("h-3.5 w-3.5 shrink-0 opacity-30", isSelected && "opacity-60")} />
      )}
      <SectionIcon type={section.type} className={isSelected ? "text-white" : "text-muted-foreground"} />
      <span className="flex-1 text-sm font-medium truncate">{section.name}</span>
      {section.hidden && (
        <EyeOff className={cn("h-3 w-3 shrink-0", isSelected ? "opacity-60" : "opacity-40")} />
      )}

      {/* Hover actions */}
      <div className={cn("items-center gap-0.5 hidden group-hover:flex", isSelected && "flex")}>
        <button
          className={cn("h-5 w-5 rounded flex items-center justify-center transition-colors", isSelected ? "hover:bg-white/20" : "hover:bg-muted-foreground/10")}
          onClick={e => { e.stopPropagation(); onToggleHide() }}
          title={section.hidden ? "Show" : "Hide"}
        >
          {section.hidden
            ? <Eye className="h-2.5 w-2.5" />
            : <EyeOff className="h-2.5 w-2.5" />}
        </button>
        {!isStructure && (
          <>
            <button
              className={cn("h-5 w-5 rounded flex items-center justify-center transition-colors", isSelected ? "hover:bg-white/20" : "hover:bg-muted-foreground/10")}
              onClick={e => { e.stopPropagation(); onDuplicate() }}
              title="Duplicate"
            >
              <Copy className="h-2.5 w-2.5" />
            </button>
            <button
              className={cn("h-5 w-5 rounded flex items-center justify-center transition-colors", isSelected ? "hover:bg-white/20 text-red-300" : "hover:bg-red-100 text-red-400")}
              onClick={e => { e.stopPropagation(); onRemove() }}
              title="Remove"
            >
              <Trash2 className="h-2.5 w-2.5" />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
