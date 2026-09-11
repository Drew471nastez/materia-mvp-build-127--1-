"use client"

import { useEffect, useState, useCallback, useMemo, useRef, use, memo } from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import {
  ArrowLeft, Monitor, Smartphone, Loader2, Code2, ChevronDown, Plus, Eye, EyeOff, GripVertical, Trash2, Copy, Settings, Check, Layers, X, RotateCcw, Layout, AlignLeft, Image, ShoppingBag, MessageSquare, HelpCircle, Megaphone, BarChart2, Grid, Award, LayoutGrid, DollarSign, LayoutTemplate, Video, Users, MapPin, Mail, Clock, BookOpen, Shirt, Columns, Play, Star, Timer, Shield, Rss, SlidersHorizontal, Code, Bell, ChevronRight, Package, Undo2, Redo2, ExternalLink, Search, FileText, ArrowRight, FolderOpen, MoreHorizontal, Upload, ImageIcon, Info, RefreshCw, Crop, CheckCircle, Type, Square, Rows3, Grid3x3, MousePointerClick, MoveHorizontal, Hash, Columns2, LayoutDashboard, Badge as BadgeIcon, PanelTop, PanelBottom, ArrowUp, ArrowDown,
} from "lucide-react"
import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  TouchSensor,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type Modifier,
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
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { MobileEditorSheet } from "@/components/website-builder/mobile-editor-sheet"
import { ResponsiveActionMenu } from "@/components/ui/responsive-action-menu"
import { hapticTap } from "@/lib/native-bridge"
import { BuilderLoader, useDelayedFlag, useLinger } from "@/components/website-builder/builder-loader"
import { CanvasScrollbar } from "@/components/website-builder/canvas-scrollbar"
import { usePhoneChromeTone } from "@/components/website-builder/native-chrome"
import { LeaveConfirm, hasSomethingToLose, type LeaveReason } from "@/components/website-builder/leave-confirm"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { PageSwitcher } from "@/components/website-builder/page-switcher"
import { PublishPanel } from "@/components/website-builder/publish-panel"
import { PreviewModeSwitch, CodePane, type PreviewMode } from "@/components/website-builder/preview-mode-switch"
import { ProjectSettings } from "@/components/website-builder/project-settings"
import { createClient } from "@/lib/supabase/client"
import { Slider } from "@/components/ui/slider"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type {
  ThemeInstall, SectionInstance, ThemeSettingsValues,
  PageKey, EditorPanel, SchemaField, ColorSchemeValues, ColorSchemeKey,
} from "@/lib/website-builder/types"
import { PAGE_META, DEFAULT_COLOR_SCHEMES } from "@/lib/website-builder/types"
import { SECTION_SCHEMAS, ADDABLE_SECTIONS, SECTION_CATEGORIES } from "@/lib/website-builder/section-schemas"
import { THEME_SETTINGS_GROUPS } from "@/lib/website-builder/theme-settings-schema"
import SectionRenderer from "@/components/website-builder/sections/SectionRenderer"
import { ThemePage } from "@/components/website-builder/theme/ThemePage"
import { scheduleSnapshot, cancelScheduledSnapshot } from "@/lib/website-builder/snapshot-capture"
import { FullScreenLock } from "@/components/website-builder/full-screen-lock"
import { StorelibMark } from "@/components/storelib-mark"
import { toast } from "sonner"
import { getWebsiteShareUrl, getWebsiteUrlDisplay } from "@/lib/url-helpers"
import { ThemeChat } from "@/components/website-builder/theme-chat"
import { applyOp, type ThemeOp } from "@/lib/website-builder/agent/operations"

// ── Custom back-with-bar icon (topbar) ──────────────────────
function BackWithBarIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 512 512"
      xmlns="http://www.w3.org/2000/svg"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <rect x="21.333" y="85.333" width="42.666" height="341.334" />
      <path d="M490.667 234.667 H185.333 L316 104 L286.083 74.083 L104.833 255.333 L286.083 436.583 L316 406.667 L185.333 277.333 H490.667 Z" />
    </svg>
  )
}

// ── Thin page-load progress bar (single A→B sweep) ──────────
// NProgress-style: while `active` is true, the bar creeps from 0 → ~90%
// on an ease-out curve (never looping). When `active` flips false, the
// bar snaps to 100% and fades out. There is NO repeating / double
// animation — one clean sweep per load.
function WbLoadProgressBar({ active }: { active: boolean }) {
  const [progress, setProgress] = useState(0)
  const [visible, setVisible] = useState(false)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    const clearTimers = () => {
      timersRef.current.forEach(t => clearTimeout(t))
      timersRef.current = []
    }

    if (active) {
      clearTimers()
      setVisible(true)
      // Kick off the ease-out creep: 0 → 30 → 60 → 80 → 90.
      // We never touch 100 while active so the bar can't visually "restart".
      setProgress(0)
      timersRef.current.push(setTimeout(() => setProgress(30), 30))
      timersRef.current.push(setTimeout(() => setProgress(60), 350))
      timersRef.current.push(setTimeout(() => setProgress(80), 900))
      timersRef.current.push(setTimeout(() => setProgress(90), 1800))
    } else if (visible) {
      // Finish the sweep: snap to 100, fade out, then reset.
      clearTimers()
      setProgress(100)
      timersRef.current.push(setTimeout(() => setVisible(false), 260))
      timersRef.current.push(setTimeout(() => setProgress(0), 560))
    }

    return clearTimers
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  return (
    <div
      aria-hidden
      /**
       * OVER the bottom edge of the bar, not under it.
       *
       * In flow, this was a 1.5px strip between the dark bar and the canvas,
       * transparent when idle, showing whatever is behind it: the page root,
       * which is light. On a desktop the light canvas hid it. On a phone the
       * theme is edge-to-edge and dark, and the strip read as a white line
       * under the bar. Absolute, it takes no room, and idle it is nothing.
       */
      className="absolute inset-x-0 bottom-0 z-10 h-[1.5px] overflow-hidden bg-transparent pointer-events-none"
      style={{
        // Subtler overall opacity so the bar reads as a hint of progress,
        // not a UI chrome element fighting for attention.
        opacity: visible ? 0.9 : 0,
        transition: "opacity 280ms ease-out",
      }}
    >
      <div
        className="h-full"
        style={{
          width: `${progress}%`,
          // Flat, modern blue (Tailwind blue-500 → blue-600). No purple/indigo
          // gradient and no glow — keeps it calm and subtle.
          background: "#3b82f6",
          transition: "width 380ms cubic-bezier(0.22, 1, 0.36, 1)",
          willChange: "width",
        }}
      />
    </div>
  )
}

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

// ── URL ⇄ editor-state mapping (Shopify-style `previewPath`) ─
// The canonical URL shape is
//   /store/{creatorSlug}/themes/{installId}/editor?previewPath={path}
// where `previewPath` is URL-encoded and mirrors the live-site path the
// user is currently previewing. We also accept the legacy `?page=X[&product=Y]`
// query string so existing deep-links keep working.
type ParsedPreview = {
  page: "home" | "product" | "about" | "contact"
  productSlug?: string
  productTitle?: string
}

function parsePreviewFromSearch(search: string): ParsedPreview {
  const params = new URLSearchParams(search)

  // Legacy format: ?page=home&product=My+Title
  const legacyPage = params.get("page")
  if (legacyPage) {
    const title = params.get("product") ?? undefined
    return { page: legacyPage as ParsedPreview["page"], productTitle: title }
  }

  // New format: ?previewPath=/products/my-slug  (URL-decoded by URLSearchParams)
  const preview = params.get("previewPath")
  if (!preview) return { page: "home" }
  const normalized = preview.startsWith("/") ? preview : `/${preview}`
  const pathOnly = normalized.split("?")[0].split("#")[0].replace(/\/$/, "") || "/"

  if (pathOnly === "/") return { page: "home" }
  if (pathOnly === "/about") return { page: "about" }
  if (pathOnly === "/contact") return { page: "contact" }
  if (pathOnly.startsWith("/products/")) {
    const slug = pathOnly.slice("/products/".length).split("/")[0]
    return { page: "product", productSlug: slug || undefined }
  }
  return { page: "home" }
}

function previewPathForState(page: string, productSlug?: string): string {
  if (page === "about") return "/about"
  if (page === "contact") return "/contact"
  if (page === "product" && productSlug) return `/products/${productSlug}`
  return "/"
}

// ── Shared black slider control with inline number input ────
// Smooth drag on desktop + mobile (28px thumb, large hit area,
// touch-none). Number input syncs live with drag via value prop.
function SliderNumberControl({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  unit,
  className,
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  unit?: string
  className?: string
}) {
  const [inputStr, setInputStr] = useState<string>(String(value))
  const focusedRef = useRef(false)

  // Keep input text in sync when drag updates value (but not while typing)
  useEffect(() => {
    if (!focusedRef.current) setInputStr(String(value))
  }, [value])

  const commit = (raw: string) => {
    const n = Number(raw)
    if (Number.isFinite(n)) {
      const clamped = Math.min(max, Math.max(min, n))
      const snapped = step > 0 ? Math.round(clamped / step) * step : clamped
      onChange(snapped)
      setInputStr(String(snapped))
    } else {
      setInputStr(String(value))
    }
  }

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="flex-1 relative py-2 -my-2 touch-none select-none">
        <Slider
          value={[value]}
          onValueChange={([v]) => onChange(v)}
          min={min}
          max={max}
          step={step}
          className="wb-black-slider"
        />
      </div>
      <div className="relative shrink-0">
        <input
          type="text"
          inputMode="numeric"
          className="h-8 w-[58px] px-2 text-xs text-center border border-neutral-200 rounded-md bg-white text-foreground tabular-nums focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-neutral-400 transition-colors"
          value={inputStr + (focusedRef.current ? "" : unit ?? "")}
          onFocus={e => {
            focusedRef.current = true
            setInputStr(String(value))
            // Select on focus so user can type immediately
            requestAnimationFrame(() => e.target.select())
          }}
          onChange={e => setInputStr(e.target.value.replace(unit ?? "", "").replace(/[^0-9.\-]/g, ""))}
          onBlur={e => { focusedRef.current = false; commit(e.target.value.replace(unit ?? "", "")) }}
          onKeyDown={e => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur()
            if (e.key === "ArrowUp") { e.preventDefault(); onChange(Math.min(max, value + step)) }
            if (e.key === "ArrowDown") { e.preventDefault(); onChange(Math.max(min, value - step)) }
          }}
        />
      </div>
    </div>
  )
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
        className="w-full h-9 px-3 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-400 transition-colors"
        placeholder={field.placeholder ?? ""}
        value={typeof raw === "string" ? raw : ""}
        onChange={e => onChange(e.target.value)}
      />
    )
  }

  if (field.type === "textarea" || field.type === "richtext") {
    return (
      <textarea
        className="w-full min-h-[80px] px-3 py-2.5 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-400 resize-y transition-colors"
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
          className="flex-1 h-9 px-3 text-sm border border-border rounded-lg bg-background font-mono focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-400 transition-colors"
          value={typeof raw === "string" ? raw : ""}
          onChange={e => onChange(e.target.value)}
        />
      </div>
    )
  }

  if (field.type === "select") {
    return (
      <div className="relative">
        <select
          className="w-full h-10 px-3 pr-8 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-400 appearance-none cursor-pointer transition-colors"
          value={typeof raw === "string" ? raw : String(field.default ?? "")}
          onChange={e => onChange(e.target.value)}
        >
          {field.options?.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
      </div>
    )
  }

  if (field.type === "toggle") {
    const checked = typeof raw === "boolean" ? raw : !!field.default
    return (
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={cn(
          "relative inline-flex h-[22px] w-[38px] items-center rounded-full transition-colors shrink-0 cursor-pointer focus:outline-none",
          checked ? "bg-foreground" : "bg-muted-foreground/30",
        )}
        onClick={() => onChange(!checked)}
      >
        <span className={cn("inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow-md transition-transform duration-200", checked ? "translate-x-[18px]" : "translate-x-0.5")} />
      </button>
    )
  }

  if (field.type === "range") {
    const num = typeof raw === "number" ? raw : Number(field.default ?? 0)
    return (
      <SliderNumberControl
        value={num}
        onChange={onChange}
        min={field.min ?? 0}
        max={field.max ?? 100}
        step={field.step ?? 1}
        unit={field.unit ?? ""}
      />
    )
  }

  if (field.type === "number") {
    return (
      <input
        type="number"
        className="w-full h-9 px-3 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-400 transition-colors"
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
          className="w-full h-9 px-3 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-400 transition-colors"
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
        className="w-full h-9 px-3 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-400 appearance-none cursor-pointer transition-colors"
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
    const current = typeof raw === "string" ? raw : String(field.default ?? "")
    const opts = field.options ?? []
    // Fallback to a select when there are too many options for a segmented control
    if (opts.length > 3) {
      return (
        <div className="relative">
          <select
            className="w-full h-10 px-3 pr-8 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-400 appearance-none cursor-pointer transition-colors"
            value={current}
            onChange={e => onChange(e.target.value)}
          >
            {opts.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        </div>
      )
    }
    return (
      <div className="flex gap-1 p-1 bg-neutral-100 rounded-lg">
        {opts.map(opt => {
          const isSelected = current === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={cn(
                "flex-1 py-1.5 px-3 text-sm font-medium rounded-md border text-center transition-[background-color,color,border-color,box-shadow,scale] duration-200 ease-out active:scale-[0.97] active:duration-75",
                isSelected
                  ? "bg-white text-foreground border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.06),0_0_0_0.5px_rgba(0,0,0,0.04)]"
                  : "bg-transparent text-neutral-500 border-transparent hover:text-foreground hover:bg-white/40"
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
/*
 * The per-section icon map lived here and is gone with the icons themselves.
 *
 * Forty-nine section types were mapped onto a couple of dozen lucide glyphs,
 * so the same picture stood for several different sections and none of them
 * was the thing it named. An icon that does not identify anything is
 * decoration in the one place a list has to be scannable — people read the
 * name.
 */


// ── Section Preview — renders the real section scaled down ───
/**
 * Long enough that a drag or a burst of typing settles into one write, short
 * enough that closing the tab a second later has already saved.
 */
const AUTOSAVE_DELAY_MS = 1_500

/**
 * ===========================================================================
 *  THE THREE DEVICES
 * ===========================================================================
 * These widths are what the preview card is actually set to, and — since every
 * section became a container query (components/website-builder/sections/
 * SectionRenderer.tsx) — they are also the widths the sections THEMSELVES
 * measure. Pressing the phone button used to change the size of the card and
 * nothing inside it, because a `md:` class asks about the browser window.
 *
 * Real hardware, not round numbers: 390 is an iPhone 14/15, 834 an iPad in
 * portrait. A tablet is where a two-column layout usually decides whether it
 * survives, which is exactly why guessing at it from desktop and phone alone
 * did not work.
 *
 * Desktop has no fixed width on purpose. It is however wide the canvas is, so
 * what you see is a real width rather than a made-up one — and it grows when
 * you close the AI panel or the sidebar.
 */
/**
 * TWO, NOT THREE. Tablet was a third preview whose width nobody designs to:
 * a layout that works at 390 and at 1280 works at 834, and a breakpoint that
 * only exists in a preview is a breakpoint nobody tests against. It was a
 * choice the builder asked for and did nothing with.
 */
export type DeviceMode = "desktop" | "mobile"

/**
 * 390px — iPhone 14/15/16 and the Pro, the single most common width in the
 * wild, and narrow enough that anything which survives it survives an older
 * 375px phone too. The preview is worth nothing if it is not a real phone's
 * width.
 */
const DEVICE_WIDTH: Record<Exclude<DeviceMode, "desktop">, number> = {
  mobile: 390,
}

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
          <div className="flex-1 min-h-0 overflow-y-auto wb-slim-scroll overscroll-contain px-4 pt-3 pb-8">
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
        data-wb-add-section-modal
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
          <nav className="w-[150px] sm:w-[180px] border-r border-border shrink-0 overflow-y-auto wb-slim-scroll py-2 bg-muted/20">
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
          <div className="flex-1 overflow-y-auto wb-slim-scroll overscroll-contain p-5">
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
          dragOver ? "border-foreground/40 bg-muted" : "border-border bg-[#fafafa] hover:border-foreground/25 hover:bg-muted/60",
        )}
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
      >
        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <div className="h-5 w-5 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-muted-foreground">Uploading... {progress}%</p>
            <div className="w-32 h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-foreground rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
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
          className="w-full h-10 px-3 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-400 transition-colors"
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
          className="w-full h-10 px-3 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-400 transition-colors"
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
          className="flex-1 h-10 px-3 text-sm border border-border rounded-lg bg-background font-mono focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-400 transition-colors"
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
      <p className="text-sm font-medium text-foreground">{label}</p>
      <SliderNumberControl
        value={num}
        onChange={onChange}
        min={min}
        max={max}
        step={step}
        unit={unit}
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
    <label className="flex items-center justify-between py-1.5 cursor-pointer select-none group">
      <div className="flex-1 min-w-0 pr-3">
        <p className="text-sm font-medium text-foreground transition-colors">{label}</p>
        {info && <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{info}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={cn(
          "relative inline-flex h-[22px] w-[38px] items-center rounded-full transition-colors shrink-0 cursor-pointer focus:outline-none",
          checked ? "bg-foreground" : "bg-muted-foreground/30",
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
          className="w-full h-10 px-3 pr-8 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-400 appearance-none cursor-pointer transition-colors"
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
  onEditScheme?: (schemeKey?: ColorSchemeKey) => void
  dense?: boolean
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDoc)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const activeKey = (SCHEME_KEYS_ORDERED.includes(value as ColorSchemeKey)
    ? (value as ColorSchemeKey)
    : SCHEME_KEYS_ORDERED[0])
  const activeScheme = { ...DEFAULT_COLOR_SCHEMES[activeKey], ...(themeSchemes?.[activeKey] ?? {}) }

  return (
    <div ref={rootRef} className="relative">
      {/* Trigger — shows the currently selected scheme */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={cn(
          "w-full h-12 flex items-center justify-between gap-2 px-3 rounded-xl border transition-all cursor-pointer",
          open ? "border-blue-500" : "border-neutral-200 hover:border-neutral-300",
        )}
        style={{ background: activeScheme.bg, color: activeScheme.heading }}
      >
        <span className="flex items-center gap-2.5 min-w-0">
          <span className="text-[16px] font-bold">Aa</span>
          <span className="text-[14px] font-medium truncate">{SCHEME_PILL_LABELS[activeKey]}</span>
        </span>
        <span className="flex items-center gap-2 shrink-0">
          {onEditScheme && (
            <span
              role="button"
              tabIndex={0}
              onClick={e => { e.stopPropagation(); onEditScheme(activeKey) }}
              onKeyDown={e => { if (e.key === "Enter") { e.stopPropagation(); onEditScheme(activeKey) } }}
              className="text-[12px] font-medium px-3 py-1 rounded-md bg-white text-gray-900 border border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer shadow-sm"
            >
              Edit
            </span>
          )}
          <ChevronDown
            className={cn(
              "h-4 w-4 opacity-70 transition-transform duration-200 ease-out",
              open && "rotate-180",
            )}
          />
        </span>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          className="absolute left-0 right-0 top-full mt-2 z-50 rounded-xl border border-neutral-200 bg-popover shadow-lg p-1.5 space-y-1 origin-top"
          style={{
            animation: "scheme-dropdown-in 180ms cubic-bezier(0.32, 0.72, 0, 1) both",
          }}
        >
          <style jsx>{`
            @keyframes scheme-dropdown-in {
              from { opacity: 0; transform: translateY(-4px) scaleY(0.98); }
              to   { opacity: 1; transform: translateY(0) scaleY(1); }
            }
          `}</style>
          {SCHEME_KEYS_ORDERED.map(k => {
            const sc = { ...DEFAULT_COLOR_SCHEMES[k], ...(themeSchemes?.[k] ?? {}) }
            const isActive = value === k
            return (
              <button
                key={k}
                type="button"
                onClick={() => { onChange(k); setOpen(false) }}
                className={cn(
                  "w-full h-11 flex items-center gap-2.5 px-3 rounded-lg border-2 transition-colors duration-150 cursor-pointer",
                  isActive ? "border-blue-500" : "border-transparent hover:border-blue-200",
                )}
                style={{ background: sc.bg, color: sc.heading }}
              >
                <span className="text-[15px] font-bold">Aa</span>
                <span className="text-[13px] font-medium truncate">{SCHEME_PILL_LABELS[k]}</span>
                {isActive && <Check className="h-3.5 w-3.5 ml-auto opacity-70" />}
              </button>
            )
          })}
        </div>
      )}
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
  onEditScheme?: (schemeKey?: ColorSchemeKey) => void
}) {
  return (
    <div className="border-b border-border p-4 space-y-3">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Color Scheme</p>
      <div className="text-[11px] text-muted-foreground leading-relaxed flex items-start gap-1.5">
        <Info className="h-3 w-3 shrink-0 mt-0.5" />
        <p className="flex-1">
          Choose a color scheme for this section. Visit the{" "}
          {onEditScheme ? (
            <button type="button" onClick={() => onEditScheme()} className="text-blue-600 hover:underline inline">
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
        className="flex items-center gap-1 h-7 px-1.5 rounded border border-border hover:border-foreground/30 transition-colors cursor-pointer"
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
  initialActive,
  onInitialActiveConsumed,
}: {
  value: Record<string, ColorSchemeValues> | undefined
  onChange: (v: Record<string, ColorSchemeValues>) => void
  initialActive?: ColorSchemeKey | null
  onInitialActiveConsumed?: () => void
}) {
  const [active, setActive] = useState<ColorSchemeKey>(initialActive ?? "white")
  useEffect(() => {
    if (initialActive) {
      setActive(initialActive)
      onInitialActiveConsumed?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialActive])
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
        <p className="flex-1">Click on any element in the preview, then its settings will appear. Each scheme is global. Every section using it updates.</p>
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
          className="text-[11px] font-medium text-foreground/70 hover:text-foreground flex items-center gap-1"
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
  // Fallback to a select when there are too many options for a segmented control
  if (options.length > 3) {
    return (
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <div className="relative">
          <select
            className="w-full h-10 px-3 pr-8 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-400 appearance-none cursor-pointer transition-colors"
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
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">{label}</p>
      <div className="flex gap-1 p-1 bg-neutral-100 rounded-lg">
        {options.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "flex-1 py-1.5 px-3 text-sm font-medium rounded-md border text-center transition-[background-color,color,border-color,box-shadow,scale] duration-200 ease-out active:scale-[0.97] active:duration-75",
              selected === opt.value
                ? "bg-white text-foreground border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.06),0_0_0_0.5px_rgba(0,0,0,0.04)]"
                : "bg-transparent text-neutral-500 border-transparent hover:text-foreground hover:bg-white/40"
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
      <div className="overflow-y-auto overscroll-contain wb-slim-scroll">
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
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted text-left transition-colors"
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
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted text-left transition-colors"
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
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted text-left transition-colors"
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
          className="w-full h-9 pl-9 pr-3 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-400 transition-colors"
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
// Supports 1-level nested submenus via `settings.parent_id` pointing to
// the parent nav_link's id. Root items show an "Add Link to {label}"
// button that creates a child. Children are draggable within their sibling
// group and indented with a subtle left border.
function SortableNavLink({
  block,
  idx,
  blockSchema,
  onUpdateBlockSetting,
  onRemoveBlock,
  products,
  collections,
  customPages,
  children,
  isChild = false,
  onAddChild,
}: {
  block: { id: string; type: string; settings: Record<string, unknown> }
  idx: number
  blockSchema: any
  onUpdateBlockSetting: (blockId: string, key: string, value: unknown) => void
  onRemoveBlock: (blockId: string) => void
  products: { id: string; title: string; slug: string }[]
  collections: { id: string; name: string; slug: string }[]
  customPages: { name: string; key: string }[]
  children?: React.ReactNode
  isChild?: boolean
  onAddChild?: () => void
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

  const label = String(block.settings.label || `Link ${idx + 1}`)

  return (
    <details
      ref={setNodeRef}
      style={style}
      className={cn(
        "group border border-border rounded-lg overflow-hidden bg-background hover:border-foreground/25 hover:shadow-sm transition-all",
        isChild && "bg-muted/20",
      )}
    >
      <summary className="flex items-center justify-between px-3 py-2.5 cursor-pointer list-none bg-muted/30 hover:bg-muted transition-colors">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            className="cursor-grab active:cursor-grabbing touch-none p-1 -ml-1 rounded hover:bg-neutral-100 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Drag to reorder"
            {...attributes}
            {...listeners}
            onClick={e => e.preventDefault()}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
          <span className="text-sm font-medium truncate">{label}</span>
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
        {blockSchema?.fields.map((field: SchemaField) => {
          // Toggles get their own inline row with the label on the left and
          // the switch on the right — no redundant floating label above.
          if (field.type === "toggle") {
            const checked = typeof block.settings[field.id] === "boolean"
              ? (block.settings[field.id] as boolean)
              : false
            // Special polish for `open_in_new_tab`: add a small external-link
            // icon + subtle description so it reads as a proper setting.
            const isOpenInNew = field.id === "open_in_new_tab"
            return (
              <label
                key={field.id}
                className="flex items-center justify-between gap-3 px-3 py-2.5 border border-border rounded-lg bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {isOpenInNew && (
                    <span className="h-7 w-7 shrink-0 rounded-md bg-background border border-border flex items-center justify-center text-muted-foreground">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-foreground leading-tight truncate">{field.label}</p>
                    {isOpenInNew && (
                      <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                        Opens the link in a separate browser tab.
                      </p>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={checked}
                  onClick={e => { e.preventDefault(); onUpdateBlockSetting(block.id, field.id, !checked) }}
                  className={cn(
                    "relative inline-flex h-[22px] w-[38px] items-center rounded-full transition-colors shrink-0 focus:outline-none",
                    checked ? "bg-foreground" : "bg-muted-foreground/30",
                  )}
                >
                  <span className={cn(
                    "inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow-md transition-transform duration-200",
                    checked ? "translate-x-[18px]" : "translate-x-0.5",
                  )} />
                </button>
              </label>
            )
          }
          return (
            <div key={field.id}>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{field.label}</label>
              {field.id === "url" ? (
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
                  className="w-full h-9 px-3 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-400 transition-colors"
                  placeholder={field.placeholder ?? ""}
                  value={typeof block.settings[field.id] === "string" ? (block.settings[field.id] as string) : ""}
                  onChange={e => onUpdateBlockSetting(block.id, field.id, e.target.value)}
                />
              )}
            </div>
          )
        })}

        {/* Children (submenu) — only on root items */}
        {!isChild && (children || onAddChild) && (
          <div className="pt-2 mt-2 border-t border-dashed border-border space-y-2">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Submenu links</p>
            {children}
            {onAddChild && (
              <button
                type="button"
                onClick={e => { e.preventDefault(); onAddChild() }}
                className="w-full flex items-center justify-center gap-1.5 py-2 text-[12.5px] font-medium text-blue-600 hover:text-blue-700 border border-dashed border-blue-300 hover:border-blue-400 rounded-lg transition-colors hover:bg-blue-50/50"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Link to {label}
              </button>
            )}
          </div>
        )}
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
  onAddBlock: (type: string, initialSettings?: Record<string, unknown>) => void
  onRemoveBlock: (blockId: string) => void
  onReorderBlocks: (blocks: { id: string; type: string; settings: Record<string, unknown> }[]) => void
  products: { id: string; title: string; slug: string }[]
  collections: { id: string; name: string; slug: string }[]
  customPages: { name: string; key: string }[]
  themeSchemes: Record<string, ColorSchemeValues> | undefined
  onEditScheme: (schemeKey?: ColorSchemeKey) => void
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
    // Only the root-level DnD context uses this handler — reorder by moving
    // the active block (and its children, which stay pinned as a group
    // right after their parent) within the full blocks array.
    const oldIndex = blocks.findIndex(b => b.id === active.id)
    const newIndex = blocks.findIndex(b => b.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    onReorderBlocks(arrayMove(blocks, oldIndex, newIndex))
  }

  const tabs = [
    { id: "logo", label: "Store Logo" },
    { id: "nav", label: "Navigation Links" },
    { id: "header", label: "Header Settings" },
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

            {/* Mobile logo — always visible picker (no toggle). If the user
                uploads an image here it's automatically used for mobile
                devices; if left empty the main LOGO IMAGE is reused. */}
            <WbImagePicker
              label="MOBILE LOGO IMAGE"
              value={typeof s.mobile_logo_url === "string" ? s.mobile_logo_url : undefined}
              onChange={url => {
                onUpdateSetting("mobile_logo_url", url ?? "")
                // Auto-flip the legacy flag so the renderer picks up the
                // new image without requiring an explicit toggle.
                onUpdateSetting("use_mobile_logo", !!url)
              }}
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
          </div>
        )

      case "nav": {
        const allBlocks = section.blocks ?? []
        const blockSchema = schema?.blocks?.find((b: any) => b.type === "nav_link")
        // Group: root blocks (no parent_id) + children grouped by parent id
        const roots = allBlocks.filter(b => !(b.settings?.parent_id))
        const childrenOf = (parentId: string) =>
          allBlocks.filter(b => (b.settings?.parent_id as string | undefined) === parentId)
        return (
          <div className="space-y-3">
            <DndContext sensors={navSensors} collisionDetection={closestCenter} onDragEnd={handleNavDragEnd}>
              <SortableContext items={roots.map(b => b.id)} strategy={verticalListSortingStrategy}>
                {roots.map((block, idx) => {
                  const kids = childrenOf(block.id)
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
                      onAddChild={() => onAddBlock("nav_link", { parent_id: block.id, label: "New link", url: "#", link_type: "custom" })}
                    >
                      {kids.length > 0 && (
                        <DndContext
                          sensors={navSensors}
                          collisionDetection={closestCenter}
                          onDragEnd={(e) => {
                            const { active, over } = e
                            if (!over || active.id === over.id) return
                            // Reorder within siblings: splice children in place within `allBlocks`
                            const nextAll = [...allBlocks]
                            const activeIdx = nextAll.findIndex(b => b.id === active.id)
                            const overIdx = nextAll.findIndex(b => b.id === over.id)
                            if (activeIdx === -1 || overIdx === -1) return
                            onReorderBlocks(arrayMove(nextAll, activeIdx, overIdx))
                          }}
                        >
                          <SortableContext items={kids.map(b => b.id)} strategy={verticalListSortingStrategy}>
                            <div className="pl-3 border-l-2 border-border space-y-2">
                              {kids.map((childBlock, childIdx) => (
                                <SortableNavLink
                                  key={childBlock.id}
                                  block={childBlock}
                                  idx={childIdx}
                                  blockSchema={blockSchema}
                                  onUpdateBlockSetting={onUpdateBlockSetting}
                                  onRemoveBlock={onRemoveBlock}
                                  products={products}
                                  collections={collections}
                                  customPages={customPages}
                                  isChild
                                />
                              ))}
                            </div>
                          </SortableContext>
                        </DndContext>
                      )}
                    </SortableNavLink>
                  )
                })}
              </SortableContext>
            </DndContext>
            {(!schema?.max_blocks || roots.length < schema.max_blocks) && (
              <button
                className="w-full flex items-center justify-center gap-1.5 py-3 text-sm font-medium text-foreground/70 hover:text-foreground border border-dashed border-border hover:border-foreground/30 rounded-lg transition-colors hover:bg-muted/60"
                onClick={() => onAddBlock("nav_link")}
              >
                <Plus className="h-3.5 w-3.5" />
                Add navigation link
              </button>
            )}
          </div>
        )
      }

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
        ]
        const currentLayoutMeta = layoutOptions.find(l => l.id === currentLayout) ?? layoutOptions[0]

        const currentMobileLayout = (typeof s.mobile_header_layout === "string" ? s.mobile_header_layout : "logo_center_hamburger_left")
        const currentMobileLayoutLabel =
          currentMobileLayout === "hamburger_left_logo_left" ? "Hamburger left · Logo left"
          : "Logo centered · Hamburger left"
        const mobilePreviewSummary = MOBILE_LAYOUT_PREVIEW_NODE(currentMobileLayout)
        const showCta = s.show_cta_button !== false
        // Border & shadow — preserve legacy `show_border` default (true) so a
        // pre-existing store that never saved `show_bottom_border` keeps
        // showing its border after the upgrade.
        const bottomBorderEnabled = typeof s.show_bottom_border === "boolean"
          ? s.show_bottom_border
          : (typeof s.show_border === "boolean" ? s.show_border : true)
        const borderStyleValue = typeof s.border_style === "string" ? s.border_style : "solid"
        const borderVisibilityValue = typeof s.border_visibility === "string" ? s.border_visibility : "all"
        const depthShadowEnabled = s.header_depth_shadow !== false
        return (
          <div className="space-y-6">
            {/* ── 1. Header layout (desktop) ── */}
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Header layout (desktop)</p>
              <button
                type="button"
                onClick={() => setLayoutPickerOpen(true)}
                className="w-full group border border-border rounded-xl bg-background hover:border-foreground/30 transition-colors overflow-hidden"
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

            {/* ── 2. Header layout (mobile) ── */}
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Header layout (mobile)</p>
              <button
                type="button"
                onClick={() => setMobileLayoutPickerOpen(true)}
                className="w-full group border border-border rounded-xl bg-background hover:border-foreground/30 transition-colors overflow-hidden"
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

            {/* ── 3. Colors ──
                Moved above Width & spacing so the section that "sets the
                tone" of the header (scheme + hover style) sits right next to
                the layout pickers — matches the visual priority ordering the
                user asked for in the sidebar. */}
            <div className="space-y-3">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Colors</p>
              <div className="text-[11px] text-muted-foreground leading-relaxed flex items-start gap-1.5">
                <Info className="h-3 w-3 shrink-0 mt-0.5" />
                <p className="flex-1">
                  Choose a color scheme for the header. Visit the{" "}
                  <button type="button" onClick={() => onEditScheme()} className="text-blue-600 hover:underline inline">
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
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground block">Menu link hover style</label>
                <div className="relative">
                  <select
                    className="w-full h-10 px-3 pr-8 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-400 appearance-none cursor-pointer transition-colors"
                    value={typeof s.menu_link_hover_style === "string" ? s.menu_link_hover_style : "inherit"}
                    onChange={e => onUpdateSetting("menu_link_hover_style", e.target.value)}
                  >
                    <option value="inherit">Inherit (theme default)</option>
                    <option value="none">None</option>
                    <option value="underline">Underline</option>
                    <option value="underline_reverse">Underline (reverse)</option>
                    <option value="fade_siblings">Fade siblings</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Controls how desktop menu links react when hovered.
                </p>
              </div>
            </div>

            <div className="h-px bg-border" />

            {/* ── 4. Width & spacing ── */}
            <div className="space-y-4">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Width &amp; spacing</p>
              {/* Header width — controls the maximum width of the header
                  content on desktop / large screens. Narrow/Medium/Wide map
                  to 960/1140/1280px caps; Full is edge-to-edge. */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground block">Header width</label>
                <div className="relative">
                  <select
                    className="w-full h-10 px-3 pr-8 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-400 appearance-none cursor-pointer transition-colors"
                    value={typeof s.header_width === "string" ? s.header_width : "wide"}
                    onChange={e => onUpdateSetting("header_width", e.target.value)}
                  >
                    <option value="narrow">Narrow (960px)</option>
                    <option value="medium">Medium (1140px)</option>
                    <option value="wide">Wide (1280px)</option>
                    <option value="full">Full width</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Controls the maximum width of the header on desktop (large) screens.
                </p>
              </div>
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

            <div className="h-px bg-border" />

            {/* ── 4. Sticky behaviour ── */}
            <div className="space-y-3">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Sticky behaviour</p>
              <WbToggle
                label="Enable sticky header"
                value={!!s.header_sticky_enabled && !s.header_sticky_on_scroll_up}
                onChange={v => {
                  if (v) {
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
                    onUpdateSetting("header_sticky_enabled", true)
                    onUpdateSetting("header_sticky_on_scroll_up", true)
                  } else {
                    onUpdateSetting("header_sticky_on_scroll_up", false)
                  }
                }}
                info="Only reveal the header when scrolling up. Hides on scroll down."
              />
              <WbToggle
                label="Make header transparent"
                value={s.header_transparent}
                onChange={v => onUpdateSetting("header_transparent", v)}
              />
            </div>

            <div className="h-px bg-border" />

            {/* ── 5. Border & shadow ──
                Three controls for the bottom edge of the header:
                  • toggle: is a bottom border drawn at all?
                  • radio:  solid (uses inset_border) vs subtle (50% alpha)
                  • select: where does it show (all / home only / inner only / none)
                Plus a separate toggle for the smooth depth shadow under the
                header (default ON — matches the "lifted off the page" feel). */}
            <div className="space-y-3">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Border &amp; shadow</p>
              <WbToggle
                label="Show bottom border"
                value={bottomBorderEnabled}
                onChange={v => onUpdateSetting("show_bottom_border", v)}
                info="Shows a 1px line at the bottom of the header to visually separate it from the page content."
              />
              {bottomBorderEnabled && (
                <>
                  <WbRadioSegment
                    label="Border style"
                    value={borderStyleValue}
                    onChange={v => onUpdateSetting("border_style", v)}
                    options={[
                      { label: "Solid",  value: "solid" },
                      { label: "Subtle", value: "subtle" },
                    ]}
                  />
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground block">Show border on</label>
                    <div className="relative">
                      <select
                        className="w-full h-10 px-3 pr-8 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-400 appearance-none cursor-pointer transition-colors"
                        value={borderVisibilityValue}
                        onChange={e => onUpdateSetting("border_visibility", e.target.value)}
                      >
                        <option value="all">All pages</option>
                        <option value="home_only">Homepage only</option>
                        <option value="inner_only">Inner pages only</option>
                        <option value="none">None</option>
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>
                </>
              )}
              <WbToggle
                label="Subtle depth shadow"
                value={depthShadowEnabled}
                onChange={v => onUpdateSetting("header_depth_shadow", v)}
                info="Adds a soft shadow underneath the header so it feels gently lifted off the page."
              />
            </div>

            <div className="h-px bg-border" />

            {/* ── 7. Header elements ── */}
            <div className="space-y-3">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Header elements</p>
              <WbToggle
                label="Show search icon"
                value={s.show_search}
                onChange={v => onUpdateSetting("show_search", v)}
              />
              <WbToggle
                label="Show account icon"
                value={s.show_account_icon}
                onChange={v => onUpdateSetting("show_account_icon", v)}
                info="Desktop header icon and the sidebar Log In button on mobile."
              />
              <WbToggle
                label="Show wishlist icon"
                value={s.show_wishlist_icon}
                onChange={v => onUpdateSetting("show_wishlist_icon", v)}
                info="Desktop header only. Also appears in the mobile sidebar footer."
              />
              <WbToggle
                label="Show cart icon"
                value={s.show_cart}
                onChange={v => onUpdateSetting("show_cart", v)}
              />
            </div>

            <div className="h-px bg-border" />

            {/* ── 8. Call to action button (consolidated from former Button tab) ──
                Toggle gates the button visibility on the live header. The URL
                picker is the same component used by nav links, so users get
                the same Pages/Products/Categories dropdown experience. */}
            <div className="space-y-3">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Call to action button</p>
              <WbToggle
                label="Show call to action button"
                value={s.show_cta_button !== false}
                onChange={v => onUpdateSetting("show_cta_button", v)}
              />
              {showCta && (
                <>
                  <div className="space-y-1.5">
                    <p className="text-sm font-medium text-foreground">Button text</p>
                    <input
                      type="text"
                      className="w-full h-10 px-3 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-400 transition-colors"
                      placeholder="Shop Now"
                      value={typeof s.cta_text === "string" ? s.cta_text : ""}
                      onChange={e => onUpdateSetting("cta_text", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-sm font-medium text-foreground">Button URL</p>
                    <NavLinkPicker
                      value={typeof s.cta_url === "string" ? s.cta_url : ""}
                      onChange={val => onUpdateSetting("cta_url", val)}
                      products={products}
                      collections={collections}
                      customPages={customPages}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug flex items-start gap-1.5">
                    <Info className="h-3 w-3 shrink-0 mt-0.5" />
                    Button style, radius and colors are inherited from your theme&apos;s global button settings.
                  </p>
                </>
              )}
            </div>

          </div>
        )
      }

      default:
        return null
    }
  }

  // ── Mobile layout picker sub-panel ─────────────────────────
  if (mobileLayoutPickerOpen) {
    const mobileLayoutOptions: { id: string; label: string }[] = [
      { id: "logo_center_hamburger_left", label: "Logo centered · Hamburger left" },
      { id: "hamburger_left_logo_left",   label: "Hamburger left · Logo left" },
    ]
    const currentMobileLayout = (typeof s.mobile_header_layout === "string" ? s.mobile_header_layout : "logo_center_hamburger_left")
    return (
      <div className="flex flex-col h-full">
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
        <div className="flex-1 overflow-y-auto wb-slim-scroll px-5 py-4 space-y-3">
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
      }
      return null
    }

    return (
      <div className="flex flex-col h-full">
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
        <div className="flex-1 overflow-y-auto wb-slim-scroll px-5 py-4 space-y-3">
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
        className="flex flex-col h-full"
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
        <div className="flex-1 overflow-y-auto wb-slim-scroll px-5 py-4">
          {renderSubPanel(activeTab)}
        </div>
      </div>
    )
  }

  // ── Main tab list ──────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2 shrink-0">
        <button className="text-muted-foreground hover:text-foreground transition-colors" onClick={onBack} aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold">Header Settings</span>
      </div>

      <div className="flex-1 overflow-y-auto wb-slim-scroll">
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
      return parsePreviewFromSearch(window.location.search).page as PageKey
    }
    return "home"
  })
  const [selectedPanel, setSelectedPanel] = useState<Panel>({ type: "pages" })
  const [device, setDevice] = useState<DeviceMode>("desktop")
  // Inspector mode — when ON, hovering/clicking a section shows the blue
  // selection rectangle and opens its settings panel. When OFF the canvas
  // behaves like a plain preview (no outlines, no section-click interception).
  // Defaults to ON so first-time users see the editing affordances.
  const [inspectorEnabled, setInspectorEnabled] = useState<boolean>(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)
  /** Set the instant Exit is pressed. Going back can take a second or more
   *  on a phone, and a button that does nothing for that second is a button
   *  somebody presses again. */
  const [leaving, setLeaving] = useState(false)

  /**
   * =========================================================================
   *  LEAVING, WHEN THERE IS SOMETHING TO LOSE
   * =========================================================================
   * `window.confirm` used to ask this, and the browser's dialog is the one
   * part of a product nobody can design: the OS's font, "storelib.com says",
   * and no way to name what is unsaved. It is asked properly now, and only
   * when there is an actual answer — a draft still saving, a code file with
   * edits, or a save in flight.
   */
  const [pendingExit, setPendingExit] = useState<string | null>(null)
  /** Reported by the code editor in its frame; see its postMessage. */
  const [codeDirty, setCodeDirty] = useState(false)
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      // Same-origin only: the frame is our own page and nothing else may
      // tell the builder what its unsaved state is.
      if (e.origin !== window.location.origin) return
      const data = e.data as { type?: string; dirty?: boolean } | null
      if (data?.type === "storelib:code-dirty") setCodeDirty(Boolean(data.dirty))
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [])
  /** `document` exists only after the first client render, and the leaving
   *  screen is portalled into it. */
  const [portalReady, setPortalReady] = useState(false)
  useEffect(() => setPortalReady(true), [])
  const publishBtnRef = useRef<HTMLDivElement | null>(null)
  const [previewMode, setPreviewMode] = useState<PreviewMode>("preview")
  useEffect(() => {
    // `?view=code` / `?view=settings` — the website page's "Edit code" and
    // "Project settings" open the editor straight onto that pane. Preview
    // stays the default; the pane is switched once, on arrival.
    const v = new URLSearchParams(window.location.search).get("view")
    if (v === "code" || v === "settings") setPreviewMode(v)
  }, [])
  const [projectSettingsOpen, setProjectSettingsOpen] = useState(false)

  /**
   * A backup after every task Storelib AI completes, labelled with what was
   * asked. It waits for the draft to be written first (autosave is debounced),
   * because a backup of the state BEFORE the change is not a backup of the
   * task. Fire and forget: a backup that fails must never interrupt editing.
   */
  const backupAfterTask = useCallback(
    (prompt: string) => {
      window.setTimeout(() => {
        void fetch(`/api/website-builder/themes/${installId}/backups`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source: "ai", label: prompt }),
        }).catch(() => {})
      }, 2500)
    },
    [installId],
  )
  const [isDirty, setIsDirty] = useState(false)

  /**
   * THE DRAFT IS AHEAD OF WHAT IS LIVE.
   *
   * `isDirty` used to serve both questions — "is there anything unsaved" and
   * "is the live site behind" — and one flag could, right up until autosave.
   * With autosave writing drafts every couple of seconds, `isDirty` is false
   * almost always, and a button reading its value would have said "Saved" on a
   * published theme whose visitors were still seeing last week's page. Somebody
   * would believe they had published when they had not.
   *
   * So: `isDirty` means "not written to the draft yet" and is cleared by
   * autosave. This means "the draft has changes the public site has not seen"
   * and is cleared only by publishing.
   *
   * Seeded from the server's own answer — `has_draft` is `draft_sections IS NOT
   * NULL`, and publishing nulls it — so it survives a reload rather than
   * resetting to a comfortable false.
   */
  const [unpublished, setUnpublished] = useState(false)

  /**
   * A PAGE SWITCH IS IN FLIGHT.
   *
   * `handlePageChange` sets `currentPage` to the new page and only then awaits
   * that page's sections, so for a few hundred milliseconds `currentPage` says
   * "about" while `sections` still holds home's. An autosave firing in that
   * window writes HOME'S SECTIONS UNDER THE ABOUT PAGE KEY — real corruption,
   * and one that autosave created: before it, nothing wrote on a timer.
   *
   * A ref rather than state: it is read inside a timeout that must see the
   * value as of when it FIRES, not as of the render that scheduled it.
   */
  const switchingPage = useRef(false)
  const [expandedSettings, setExpandedSettings] = useState<string | null>(null)
  const [editSchemeKey, setEditSchemeKey] = useState<ColorSchemeKey | null>(null)
  const [addSectionOpen, setAddSectionOpen] = useState(false)
  // Absolute index in `sections` where a new section should be inserted.
  // Set when the user clicks an "insert between" divider in the sidebar.
  // null = append before the footer (default).
  const [pendingInsertIndex, setPendingInsertIndex] = useState<number | null>(null)
  /** The AI panel, docked beside the sidebar. Closed until asked for. */
  const [aiOpen, setAiOpen] = useState(false)
  /**
   * Mounted on first open and kept: the phone's AI sheet used to unmount the
   * instant it closed, which is a sheet that vanishes rather than one that
   * goes down. Kept mounted, it animates out like every other sheet and the
   * conversation survives being closed.
   */
  const [aiMounted, setAiMounted] = useState(false)
  useEffect(() => {
    if (aiOpen) setAiMounted(true)
  }, [aiOpen])

  /**
   * ONE OPERATION FROM THE AI, APPLIED TO THE STATE THE PANELS ALREADY EDIT.
   *
   * `applyOp` is the SAME function the server used to produce this operation —
   * see lib/website-builder/agent/operations.ts for why there is exactly one
   * of it. What lands here is therefore what the model was working against.
   *
   * Split by kind because the editor keeps sections and theme settings in two
   * pieces of state, and no operation reads across them: `update_theme`
   * touches only settings, everything else touches only sections. Passing the
   * half it does not read keeps the shared applier's signature honest without
   * needing a joint updater React does not offer.
   *
   * Ordinary setState, so the preview repaints, `isDirty` flips, and Save
   * behaves exactly as it does for a change made by hand.
   */
  const applyAiOp = useCallback((op: ThemeOp) => {
    /**
     * MARKED DIRTY, LIKE EVERY OTHER EDIT.
     *
     * `isDirty` is a manual flag: every hand-edit handler in this file sets it,
     * and this one did not. So the AI changed the page, the preview updated,
     * and Save stayed greyed out reading "Saved" — the work could not be saved,
     * and leaving the tab gave no warning either. The whole AI edit was lost on
     * reload while looking, on screen, like it had worked.
     *
     * (The comment here used to claim isDirty flipped. It did not. A comment
     * asserting the property that is missing is worse than no comment.)
     */
    setIsDirty(true)

    if (op.kind === "update_theme") {
      setSettingsDraft(previous => applyOp({ sections: [], settings: previous }, op).settings as ThemeSettingsValues)
      return
    }

    /**
     * THE LOGO LIVES IN TWO PLACES and the hand-edit path keeps them together.
     *
     * `updateSectionSetting` mirrors the header's logo fields into the theme
     * settings, because the header section and the theme both hold one. An AI
     * edit that skipped the mirror would leave the two disagreeing — the header
     * showing a new logo and the theme still holding the old one, which
     * surfaces later as the logo reverting on another page.
     */
    if (op.kind === "update_section") {
      const target = sections.find(s => s.id === op.id)
      if (target?.type === "header") {
        const mirrored: Record<string, unknown> = {}
        for (const [key, value] of Object.entries(op.settings)) {
          const themeKey = LOGO_SYNC_HEADER_TO_THEME[key]
          if (themeKey) mirrored[themeKey] = value
        }
        if (Object.keys(mirrored).length > 0) {
          setSettingsDraft(previous => ({ ...previous, ...mirrored }) as ThemeSettingsValues)
        }
      }
    }

    /**
     * A SECTION THE AI DELETES CANNOT STAY SELECTED.
     *
     * `removeSection` clears the selection when it deletes the open one, and
     * this did not — so the inspector was left pointing at a section that no
     * longer exists. It degrades to a blank panel rather than crashing, but a
     * blank settings panel beside a page that just changed reads as the editor
     * having broken.
     */
    if (op.kind === "remove_section") {
      // Read from the panel state directly: `selectedSectionId` is derived
      // further down the component and is not in scope here.
      setSelectedPanel(previous =>
        previous.type === "section" && previous.sectionId === op.id ? { type: "pages" } : previous,
      )
    }

    setSections(previous => applyOp({ sections: previous, settings: {} }, op).sections)
  }, [sections])

  /**
   * =========================================================================
   *  THE SIDEBAR IS AS WIDE AS YOU LEFT IT
   * =========================================================================
   * Dragged from its right edge, clamped so it can neither vanish nor eat
   * the canvas, written straight to the element while the pointer moves
   * (a React render per pointer event is a sidebar that lags its handle)
   * and committed to state and storage on release.
   */
  const [sidebarWidth, setSidebarWidth] = useState(288)
  const sidebarRef = useRef<HTMLDivElement | null>(null)
  const SIDEBAR_MIN = 240
  const SIDEBAR_MAX = 560
  useEffect(() => {
    try {
      const saved = Number(window.localStorage.getItem("wb:sidebar-width"))
      if (Number.isFinite(saved) && saved >= SIDEBAR_MIN && saved <= SIDEBAR_MAX) setSidebarWidth(saved)
    } catch {
      /* storage blocked: the default is fine */
    }
  }, [])
  const startSidebarResize = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = sidebarRef.current?.getBoundingClientRect().width ?? sidebarWidth
    const handle = e.currentTarget
    handle.setPointerCapture(e.pointerId)
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"
    let latest = startW
    const onMove = (ev: PointerEvent) => {
      latest = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, startW + (ev.clientX - startX)))
      if (sidebarRef.current) sidebarRef.current.style.width = `${latest}px`
    }
    const onUp = () => {
      handle.removeEventListener("pointermove", onMove)
      handle.removeEventListener("pointerup", onUp)
      handle.removeEventListener("pointercancel", onUp)
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
      setSidebarWidth(latest)
      try {
        window.localStorage.setItem("wb:sidebar-width", String(Math.round(latest)))
      } catch {
        /* storage blocked */
      }
    }
    handle.addEventListener("pointermove", onMove)
    handle.addEventListener("pointerup", onUp)
    handle.addEventListener("pointercancel", onUp)
  }
  const [isMobileView, setIsMobileView] = useState(false)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [username, setUsername] = useState("")
  const [hasPublished, setHasPublished] = useState(false)
  const canvasRef = useRef<HTMLDivElement>(null)
  useEffect(() => () => cancelScheduledSnapshot(), [])

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
  // If the editor is opened directly on a product deep-link, keep the canvas
  // in "loading" state from the very first render until the deep-link effect
  // has injected `_product_data` — otherwise the canvas would briefly render
  // the bare product template (placeholder "Product Title / $29.99 / Product
  // image") between `loadData` finishing and `handleSelectProductPage` being
  // called.
  const [canvasLoading, setCanvasLoading] = useState(() => {
    if (typeof window === "undefined") return false
    const parsed = parsePreviewFromSearch(window.location.search)
    return parsed.page === "product" && (!!parsed.productSlug || !!parsed.productTitle)
  })
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

  /**
   * ===========================================================================
   *  UNDO AND REDO, TAKEN FROM REFS SO THEY ARE NEVER STALE
   * ===========================================================================
   * `pushUndo` used to close over `sections` and `settingsDraft`, so it was a
   * new function on every keystroke — and any handler that wanted to call it
   * had to list it as a dependency or capture an old one that would snapshot
   * an old page. Several handlers did neither: they simply did not call it,
   * which is why hiding a section, dragging one, or nudging one up or down
   * could not be undone at all. Undo went back past them to whatever edit had
   * last bothered to record itself, which is worse than not offering it.
   *
   * Reading the latest values out of refs makes all three stable, so a
   * mutation can record itself without dragging a dependency chain behind it,
   * and every mutation below does.
   */
  const [undoStack, setUndoStack] = useState<{ sections: SectionInstance[]; settings: ThemeSettingsValues }[]>([])
  const [redoStack, setRedoStack] = useState<{ sections: SectionInstance[]; settings: ThemeSettingsValues }[]>([])

  const sectionsRef = useRef(sections)
  sectionsRef.current = sections
  const settingsRef = useRef(settingsDraft)
  settingsRef.current = settingsDraft
  const undoRef = useRef(undoStack)
  undoRef.current = undoStack
  const redoRef = useRef(redoStack)
  redoRef.current = redoStack

  /** The page as it is right now, deep copied so a later edit cannot reach it. */
  const snapshotNow = useCallback(
    () => ({
      sections: JSON.parse(JSON.stringify(sectionsRef.current)) as SectionInstance[],
      settings: JSON.parse(JSON.stringify(settingsRef.current)) as ThemeSettingsValues,
    }),
    [],
  )

  /** Thirty steps. Anything a person can remember doing, they can undo. */
  const pushUndo = useCallback(() => {
    setUndoStack(prev => [...prev.slice(-30), snapshotNow()])
    setRedoStack([])
  }, [snapshotNow])

  const handleUndo = useCallback(() => {
    const stack = undoRef.current
    if (stack.length === 0) return
    const last = stack[stack.length - 1]
    setRedoStack(prev => [...prev, snapshotNow()])
    setSections(last.sections)
    setSettingsDraft(last.settings)
    setUndoStack(prev => prev.slice(0, -1))
    setIsDirty(true)
  }, [snapshotNow])

  const handleRedo = useCallback(() => {
    const stack = redoRef.current
    if (stack.length === 0) return
    const last = stack[stack.length - 1]
    setUndoStack(prev => [...prev, snapshotNow()])
    setSections(last.sections)
    setSettingsDraft(last.settings)
    setRedoStack(prev => prev.slice(0, -1))
    setIsDirty(true)
  }, [snapshotNow])

  // dnd-kit sensors
  /**
   * THREE WAYS TO PICK A SECTION UP.
   *
   * A mouse starts dragging after three pixels rather than five — five is far
   * enough that a short deliberate drag reads as a click that did nothing. A
   * finger needs a different rule entirely: any distance threshold competes
   * with scrolling the list, so touch waits 160ms in place instead, which is
   * a press rather than a swipe and leaves scrolling alone. The keyboard
   * reorders with the arrow keys.
   */
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 3 } }),
    /**
     * 220ms, up from 160, with a 10px tolerance.
     *
     * The delay is what separates "I am about to drag this" from "I am about
     * to scroll the list", and at 160ms an ordinary flick through a long list
     * of sections could be taken for a press. The tolerance is how far the
     * finger may travel during the wait before the gesture is given back to
     * the scroller; 8px is inside the noise a thumb makes resting on glass,
     * so a still finger sometimes lost its own press.
     */
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 10 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  /**
   * A list reorders vertically, so the drag does too.
   *
   * Two pixels of horizontal drift on every vertical move is the difference
   * between a row that tracks the finger and a row that wobbles under it, and
   * a thumb never travels straight. Written here rather than pulled in from
   * @dnd-kit/modifiers, since the whole of it is "throw away x".
   */
  const restrictToVerticalAxis: Modifier = useCallback(({ transform }) => ({ ...transform, x: 0 }), [])
  // One array, not a fresh literal on every render: DndContext compares the
  // list it is given, and a new array every time is a new list every time.
  const dragModifiers = useMemo(() => [restrictToVerticalAxis], [restrictToVerticalAxis])

  /** The row currently in the air, drawn by the overlay. */
  const [draggingId, setDraggingId] = useState<string | null>(null)
  /** What it was last over, so the tick fires on a change and not per frame. */
  const lastOverId = useRef<string | null>(null)

  /**
   * The taps a reorder is worth. Picking up is the moment that needs
   * confirming — on a phone the finger is over the row it has just lifted, so
   * the tap is the only signal that the press was taken as a press. Every
   * time the order actually changes under the finger gets a light tick, which
   * is what makes a reorder feel like it is happening rather than like it is
   * being computed. Dropping gets one too. Silent where there are no haptics.
   */
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setDraggingId(String(event.active.id))
    lastOverId.current = String(event.active.id)
    hapticTap("medium")
  }, [])

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const over = event.over ? String(event.over.id) : null
    if (over === lastOverId.current) return
    lastOverId.current = over
    if (over) hapticTap("light")
  }, [])

  const handleDragCancel = useCallback(() => {
    setDraggingId(null)
    lastOverId.current = null
  }, [])

  // Scroll to a section in the canvas
  const scrollToSection = useCallback((sectionId: string) => {
    setTimeout(() => {
      const el = document.getElementById(`wb-section-${sectionId}`)
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" })
    }, 80)
  }, [])

  // Drag end — reorder body sections (keep header/footer pinned)
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setDraggingId(null)
    lastOverId.current = null
    hapticTap("light")
    const { active, over } = event
    if (!over || active.id === over.id) return
    // After the no-op check, so a drag that lands back where it started is
    // not an undo step that undoes nothing.
    pushUndo()
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
  }, [pushUndo])

  /**
   * Move a body section one place. The header and the footer are chrome and
   * do not take part; a step past either end is a no-op rather than an error,
   * because the buttons that call this are disabled at the ends and a guard
   * that throws would be a guard for a case that cannot happen.
   */
  const moveSectionBy = useCallback((sectionId: string, step: -1 | 1) => {
    /**
     * Recorded BEFORE the move, and only when there is a move to record: the
     * buttons are disabled at the ends, but a keyboard or a stale render can
     * still ask for a step past one, and an undo entry for a no-op is an undo
     * press that appears to do nothing.
     */
    const body = sectionsRef.current.filter((x) => x.type !== "header" && x.type !== "footer")
    const from = body.findIndex((x) => x.id === sectionId)
    const to = from + step
    if (from === -1 || to < 0 || to >= body.length) return
    pushUndo()
    hapticTap("light")
    setSections((prev) => {
      const header = prev.find((x) => x.type === "header")
      const footer = prev.find((x) => x.type === "footer")
      const body = prev.filter((x) => x.type !== "header" && x.type !== "footer")
      const from = body.findIndex((x) => x.id === sectionId)
      const to = from + step
      if (from === -1 || to < 0 || to >= body.length) return prev
      return [...(header ? [header] : []), ...arrayMove(body, from, to), ...(footer ? [footer] : [])]
    })
    setIsDirty(true)
  }, [pushUndo])

  // Returns sections array — callers can inject product data before setting state
  // Home is the source of truth for header/footer across the entire site.
  // Every non-home page in the editor (and on the live site) renders using
  // home's header/footer rather than its own persisted copy, so custom/about/
  // contact/product pages can never drift visually from home.
  const fetchHomeHeaderFooter = useCallback(async (): Promise<{ header?: SectionInstance; footer?: SectionInstance }> => {
    const res = await fetch(`/api/website-builder/themes/${installId}/sections?page=home`)
    if (!res.ok) return {}
    const data = await res.json()
    const loaded: SectionInstance[] = data.sections ?? []
    return {
      header: loaded.find(s => s.type === "header"),
      footer: loaded.find(s => s.type === "footer"),
    }
  }, [installId])

  const mergeWithHomeHeaderFooter = (
    pageSections: SectionInstance[],
    home: { header?: SectionInstance; footer?: SectionInstance }
  ): SectionInstance[] => {
    const body = pageSections.filter(s => s.type !== "header" && s.type !== "footer")
    return [
      ...(home.header ? [home.header] : pageSections.filter(s => s.type === "header")),
      ...body,
      ...(home.footer ? [home.footer] : pageSections.filter(s => s.type === "footer")),
    ]
  }

  const fetchPageSections = useCallback(async (page: PageKey): Promise<SectionInstance[]> => {
    const res = await fetch(`/api/website-builder/themes/${installId}/sections?page=${page}`)
    if (!res.ok) return []
    const data = await res.json()
    // The server's own answer to "is the draft ahead of live". See `unpublished`.
    if (data.has_draft) setUnpublished(true)
    let loaded: SectionInstance[] = data.sections ?? []

    // `_product_data` is a runtime-only injection used by the preview; it
    // must never be trusted from storage (legacy installs persisted it). If
    // we leave stale data in, switching between product pages shows the
    // previous product because the injection only overwrites when the new
    // productData resolves — a transient API failure would otherwise reveal
    // the wrong product.
    loaded = loaded.map(sec => {
      if (!sec.settings || !("_product_data" in sec.settings)) return sec
      const { _product_data: _omit, ...rest } = sec.settings as Record<string, unknown>
      return { ...sec, settings: rest }
    })

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

  // Load install data.
  // Wrapped in try / finally so `loading` is ALWAYS cleared — even if the
  // fetch throws on a network error, a 5xx, or if the response JSON is
  // malformed. Without this the page would sit on the auth/loader spinner
  // forever, which is exactly what the user reported.
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
    const res = await fetch(`/api/website-builder/themes/${installId}`)
    if (!res.ok) { setLoading(false); return }
    const data = await res.json()
    const inst: ThemeInstall = data.install
    setInstall(inst)
    if (data.username) setUsername(data.username)

    // Load settings
    const settings = inst.settings
    const loadedSettings = settings?.draft_settings ?? settings?.settings ?? {}

    // Prefill default page title with "{creator username} | Storelib" on
    // load. We always derive the canonical "{handle} | Storelib" string
    // and use it when:
    //   • `seo_title` is missing / empty, OR
    //   • `seo_title` is still one of the stale auto-generated defaults
    //     we've shipped before ("My Store | Storelib", "{install name} |
    //     Storelib"). This lets every existing theme pick up the correct
    //     platform handle without overriding anything the user has
    //     manually typed.
    {
      const handle = (typeof data.username === "string" && data.username.trim())
        ? data.username.trim()
        : (typeof loadedSettings.brand_name === "string" && loadedSettings.brand_name.trim()
            ? loadedSettings.brand_name.trim()
            : (inst.name || "My Store"))
      const canonical = `${handle} | Storelib`
      const current = typeof loadedSettings.seo_title === "string" ? loadedSettings.seo_title.trim() : ""
      const staleDefaults = new Set([
        "",
        "My Store | Storelib",
        `${inst.name} | Storelib`,
      ])
      if (staleDefaults.has(current)) {
        loadedSettings.seo_title = canonical
      }
    }

    // Load sections for current page. If not on home, fetch home's
    // header/footer in parallel and splice them in — home is the universal
    // source of truth for header/footer.
    const [loadedRaw, homeHF] = await Promise.all([
      fetchPageSections(currentPage),
      currentPage !== "home" ? fetchHomeHeaderFooter() : Promise.resolve<{ header?: SectionInstance; footer?: SectionInstance }>({}),
    ])
    const loaded = currentPage !== "home" ? mergeWithHomeHeaderFooter(loadedRaw, homeHF) : loadedRaw

    // Sync logo between header section and theme settings on initial load
    const header = loaded.find(s => s.type === "header")
    if (header) {
      // Settings bag values are typed loosely (unknown | Record<string, unknown>);
      // coerce via string() to keep downstream types happy.
      const headerLogo = typeof header.settings.logo_url === "string" ? header.settings.logo_url : ""
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
    } catch (err) {
      console.error("[editor] loadData failed:", err)
    } finally {
      setLoading(false)
    }
  }, [installId, currentPage, fetchPageSections, fetchHomeHeaderFooter])

  // `loadData` is intentionally fired exactly ONCE on mount. Re-running it
  // whenever its dep identity changes (which happens every time
  // `setCurrentPage` flips to a new page key) would refetch the bare page
  // template and overwrite the `_product_data` that `handleSelectProductPage`
  // just injected — producing the random "Product Title / $29.99 / Product
  // image" placeholder flash when switching to a product page. Page
  // navigation is already handled by `handlePageChange` /
  // `handleSelectProductPage`, so we do not need an automatic refetch here.
  const initialLoadRef = useRef(false)
  useEffect(() => {
    if (initialLoadRef.current) return
    initialLoadRef.current = true
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Username is loaded from API in loadData

  // Check mobile view. When the editor itself is being opened on a phone,
  // force the preview into "mobile" device mode — otherwise we'd render the
  // 1200-wide desktop layout inside a 390px viewport and every header row
  // turns into a squished mess.
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768
      setIsMobileView(mobile)
      if (mobile) setDevice("mobile")
    }
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

  // Deep-link handler: when the editor is opened directly at
  // `?page=product&product=<title>` (refresh, reopened tab, or shared link),
  // the initial load path only fetches the generic product template — it
  // never reads the `product=` param, so the canvas shows "Product Title /
  // $29.99 / Product image" placeholders. Once the products list and the
  // initial data have loaded, look up the product from the URL and run the
  // same injection flow the sidebar click uses.
  const deepLinkHandledRef = useRef(false)
  useEffect(() => {
    if (deepLinkHandledRef.current) return
    if (loading) return
    if (products.length === 0) return
    if (currentPage !== "product") return
    if (typeof window === "undefined") return
    const parsed = parsePreviewFromSearch(window.location.search)
    // New format supplies a product slug; legacy format supplies a title.
    const match =
      (parsed.productSlug && products.find(p => p.slug === parsed.productSlug)) ||
      (parsed.productTitle && products.find(p => p.title === parsed.productTitle)) ||
      null
    if (!match) return
    deepLinkHandledRef.current = true
    handleSelectProductPage(match.id, match.title)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, products, currentPage])

  // Update browser URL to reflect current page.
  // Writes the canonical `?previewPath=…` format. We also clear the legacy
  // `?page=` / `?product=` params so the URL bar doesn't grow stale junk.
  const updatePageUrl = useCallback((page: string, productSlug?: string) => {
    const url = new URL(window.location.href)
    url.searchParams.set("previewPath", previewPathForState(page, productSlug))
    url.searchParams.delete("page")
    url.searchParams.delete("product")
    window.history.replaceState({}, "", url.toString())
  }, [])

  const handlePageChange = async (page: PageKey) => {
    /**
     * WHAT YOU WERE WORKING ON IS SAVED BEFORE YOU LEAVE IT.
     *
     * This function replaces `sections` with the new page's, so anything not
     * yet written was simply gone — no warning, no save. Autosave narrowed the
     * window to a second and a half; it did not close it, and a second and a
     * half is exactly long enough to change a heading and click another page.
     *
     * Awaited, not fired and forgotten: the write must land while
     * `currentPage` and `sections` still agree about which page they describe.
     */
    if (isDirty && !saving && !publishing) {
      await saveDraft({ quiet: true })
    }
    switchingPage.current = true
    /**
     * try/finally, because the fetches below can reject — a dropped
     * connection, a 500 — and a flag left true would switch autosave off for
     * the rest of the session. Every change after that would sit unsaved
     * behind a guard nobody could see.
     */
    try {

      // IMPORTANT: do NOT flip `canvasLoading` on for simple page switches —
      // the skeleton should only appear on the very first editor mount
      // (handled by the `loading` state) or on a direct product deep-link
      // (handled by the `canvasLoading` useState initializer). Leave the
      // previously-rendered sections on screen until the new page is ready
      // so the editor feels instant instead of flashing a spinner every
      // time the user clicks a different page.
      setSectionsLoading(true)

      // If leaving home, capture home's header/footer from in-memory state
      // so they remain the universal version. Otherwise, fetch from API.
      const leavingHomeHF =
        currentPage === "home"
          ? {
              header: sections.find(s => s.type === "header"),
              footer: sections.find(s => s.type === "footer"),
            }
          : null

      setCurrentPage(page)
      setSelectedPanel({ type: "pages" })
      setPageBrowserOpen(false)
      setSelectedProductPage(null)
      setEditAllProductPages(false)
      updatePageUrl(page)

      // Load new page sections, then — if not home — splice in home's
      // header/footer so every page renders identically to home.
      const [loaded, homeHF] = await Promise.all([
        fetchPageSections(page),
        page !== "home"
          ? (leavingHomeHF ? Promise.resolve(leavingHomeHF) : fetchHomeHeaderFooter())
          : Promise.resolve<{ header?: SectionInstance; footer?: SectionInstance }>({}),
      ])
      const merged = page !== "home" ? mergeWithHomeHeaderFooter(loaded, homeHF) : loaded
      setSections(merged)

      setSectionsLoading(false)
      setCanvasLoading(false)
    } finally {
      switchingPage.current = false
    }
  }

  const handleSelectProductPage = async (productId: string, productTitle: string) => {
    setSectionsLoading(true)
    // Only flip `canvasLoading` on when the user is landing here via a
    // product deep-link (URL already has product=...) — otherwise keep the
    // previous page visible so switching to a product page feels instant.
    // The deep-link case is already covered by the `canvasLoading` useState
    // initializer, so we don't need to set it here.

    // Product pages always use home's header/footer. If leaving home, grab
    // them from in-memory state; otherwise refetch from the API.
    const leavingHomeHF =
      currentPage === "home"
        ? {
            header: sections.find(s => s.type === "header"),
            footer: sections.find(s => s.type === "footer"),
          }
        : null

    setSelectedProductPage(productTitle)
    setCurrentPage("product")
    setSelectedPanel({ type: "pages" })
    setPageBrowserOpen(false)
    // Prefer slug for the previewPath so the URL matches the live site's
    // /products/{slug} shape; fall back to id if the product wasn't found
    // in the in-memory list yet.
    const slugForUrl =
      products.find(p => p.id === productId)?.slug ?? productId
    updatePageUrl("product", slugForUrl)

    // Build fallback product data from the products list immediately. We
    // include id + slug so the Buy Now / Add to Cart buttons remain wired
    // up even when the dedicated product API call momentarily fails.
    const listProduct = products.find(p => p.id === productId)
    const fallbackData = listProduct ? {
      id: listProduct.id,
      slug: listProduct.slug,
      title: listProduct.title,
      description: listProduct.description,
      price_cents: listProduct.price_cents,
      compare_at_cents: listProduct.compare_at_cents,
      thumbnail_url: listProduct.thumbnail_url,
      gallery_urls: listProduct.gallery_urls,
      whats_included: listProduct.whats_included,
      files: [],
    } : null

    // Fetch sections, product data, and home's header/footer in parallel.
    // The product fetch retries once on a transient failure so a single flaky
    // request doesn't strand the canvas on placeholder content.
    const fetchProductWithRetry = async (): Promise<{ product?: unknown } | null> => {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const r = await fetch(`/api/website-builder/products?id=${productId}`, { cache: "no-store" })
          if (r.ok) return await r.json()
        } catch {}
      }
      return null
    }

    const [pageSections, productRes, homeHF] = await Promise.all([
      fetchPageSections("product"),
      fetchProductWithRetry(),
      leavingHomeHF ? Promise.resolve(leavingHomeHF) : fetchHomeHeaderFooter(),
    ])

    // Use API response first, fall back to list data
    const productData = productRes?.product ?? fallbackData

    // Always clear any stale _product_data from the fetched template, then
    // inject the new product. Without the clear step, switching products
    // would show the prior product whenever the new product's API call
    // fails — the screenshot bug where selecting "Deep House..." still
    // rendered "Free Ambience Sample Pack Vol I".
    for (let i = 0; i < pageSections.length; i++) {
      if (pageSections[i].type !== "product") continue
      const { _product_data: _omit, ...restSettings } = (pageSections[i].settings ?? {}) as Record<string, unknown>
      pageSections[i] = {
        ...pageSections[i],
        settings: productData
          ? { ...restSettings, _product_data: productData }
          : restSettings,
      }
    }

    // Splice home's header/footer around this product template
    const merged = mergeWithHomeHeaderFooter(pageSections, homeHF)

    setSections(merged)
    setSectionsLoading(false)
    setCanvasLoading(false)
  }

  // ── Editor-internal navigation ─────────────────────────────
  // Clicking a nav link / CTA inside a section while editing should NEVER
  // perform a full browser navigation (that would blow the user out of the
  // editor). Instead, map the href to the appropriate editor page/action.
  // External URLs and `#` anchors are simply ignored in edit mode.
  const handleEditorNavigate = useCallback((href: string) => {
    if (!href) return
    const trimmed = href.trim()
    if (!trimmed || trimmed === "#") return
    // External → ignore (we don't want to leave the editor)
    if (/^https?:\/\//i.test(trimmed)) return
    if (trimmed.startsWith("mailto:") || trimmed.startsWith("tel:")) return

    // Normalise path-only hrefs
    const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`

    // Product page deep-link
    if (path.startsWith("/products/")) {
      const slug = path.slice("/products/".length).split("?")[0].split("/")[0]
      if (!slug) return
      const match = products.find(p => p.slug === slug || p.id === slug)
      if (match) handleSelectProductPage(match.id, match.title)
      return
    }

    // Home + common platform routes
    if (path === "/" || path === "") {
      handlePageChange("home")
      return
    }
    if (path === "/shop" || path.startsWith("/shop/") || path.startsWith("/collections")) {
      // We don't have a dedicated shop page in the editor — treat it as home.
      handlePageChange("home")
      return
    }
    if (path === "/about" || path === "/about/") {
      handlePageChange("about" as PageKey)
      return
    }
    if (path === "/contact" || path === "/contact/") {
      handlePageChange("contact" as PageKey)
      return
    }

    // Custom page match — user-created pages stored in `customPages`.
    const pageKeyGuess = path.replace(/^\//, "").replace(/\/$/, "") as PageKey
    const customMatch = customPages.find(p => p.key === pageKeyGuess)
    if (customMatch) {
      handlePageChange(customMatch.key)
      return
    }
    // Unknown internal path — silently ignore (keeps editor in current page).
  }, [products, customPages])

  // ── Memoized section buckets ─────────────────────────────────
  /**
   * How many sections are neither chrome — for the empty-page prompt below.
   *
   * The editor used to split `sections` into header/body/footer here and lay
   * the three out itself, which meant it decided where a header went. It does
   * not any more: ThemePage owns that, and owns it for the published page
   * too, so the two cannot disagree about a header dragged into the middle.
   */
  const bodyCount = useMemo(
    () => sections.filter((s) => s.type !== "header" && s.type !== "footer").length,
    [sections],
  )

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

  const addBlock = (sectionId: string, blockType: string, initialSettings: Record<string, unknown> = {}) => {
    const newBlock = { id: `block-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, type: blockType, settings: initialSettings }
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
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s
      // Cascade-delete: also drop any children whose parent_id === blockId
      // (used by header nav_link submenus).
      const keep = (s.blocks ?? []).filter(b =>
        b.id !== blockId && (b.settings?.parent_id as string | undefined) !== blockId,
      )
      return { ...s, blocks: keep }
    }))
    setIsDirty(true)
  }

  const toggleSectionHidden = (sectionId: string) => {
    // Hiding a section changes the page as much as deleting one does, and it
    // was the one change Undo could not take back.
    pushUndo()
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
    // Smoothly reveal the newly-duplicated section in the canvas.
    // Two rAF ticks: one for React commit, one for layout post-paint.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => scrollToSection(copy.id))
    })
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
    const next = [...sections]
    if (pendingInsertIndex != null) {
      // Clamp into the body range (between header and footer) so an insert
      // divider can never land above the header or below the footer.
      const headerIdx = sections.findIndex(s => s.type === "header")
      const footerIdx = sections.findIndex(s => s.type === "footer")
      const minIdx = headerIdx !== -1 ? headerIdx + 1 : 0
      const maxIdx = footerIdx !== -1 ? footerIdx : sections.length
      const clamped = Math.max(minIdx, Math.min(maxIdx, pendingInsertIndex))
      next.splice(clamped, 0, newSection)
      setPendingInsertIndex(null)
    } else {
      // Default — append before footer if it exists
      const footerIdx = sections.findIndex(s => s.type === "footer")
      if (footerIdx !== -1) next.splice(footerIdx, 0, newSection)
      else next.push(newSection)
    }
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

    // Reuse the current session's header/footer so new pages inherit the
    // exact same nav links, logo, colors, and footer that the rest of the
    // site already uses. Falling back to the schema preset would show a
    // blank factory header on the new page until the next sync, breaking
    // the "universal header" contract.
    const currentHeader = sections.find(s => s.type === "header")
    const currentFooter = sections.find(s => s.type === "footer")
    const headerSchema = SECTION_SCHEMAS["header"]
    const footerSchema = SECTION_SCHEMAS["footer"]
    const defaultSections: SectionInstance[] = []
    if (currentHeader) {
      defaultSections.push(currentHeader)
    } else if (headerSchema) {
      defaultSections.push({
        id: `header-${Date.now()}`,
        type: "header",
        name: headerSchema.name,
        settings: headerSchema.presets?.[0]?.settings ?? {},
        blocks: headerSchema.presets?.[0]?.blocks ?? [],
        hidden: false,
      })
    }
    if (currentFooter) {
      defaultSections.push(currentFooter)
    } else if (footerSchema) {
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

  /**
   * Every change puts the draft ahead of the public site.
   *
   * Derived from `isDirty` going true rather than added to the twelve handlers
   * that set it — twelve call sites is twelve chances for the next one to
   * forget, and forgetting here means a creator is told they have published
   * when they have not.
   */
  useEffect(() => {
    if (isDirty) setUnpublished(true)
  }, [isDirty])

  /**
   * ===========================================================================
   *  AUTOSAVE — THE DRAFT ONLY, NEVER THE LIVE SITE
   * ===========================================================================
   * `handleSave` PUBLISHES when the theme is live. Autosave calling it would
   * push every keystroke to the public site: a half-written headline visible to
   * customers, and no way to work on something without shipping it. So this
   * calls `saveDraft` directly and publishing stays a decision somebody makes.
   *
   * Debounced rather than run on every change. A drag produces a change per
   * frame, and a request per frame would be a request storm that arrives out of
   * order — the last one to land wins, and that is not necessarily the last one
   * sent.
   *
   * Not while a save is already going, and not while the AI is mid-run: both
   * would write a state nobody has finished producing.
   */
  useEffect(() => {
    if (!isDirty || saving || publishing || loading) return
    const timer = setTimeout(() => {
      // Checked when it FIRES, not when it was scheduled: the switch may have
      // started in between, and that is the whole window this guards.
      if (switchingPage.current) return
      void saveDraft({ quiet: true })
    }, AUTOSAVE_DELAY_MS)
    return () => clearTimeout(timer)
    // `saveDraft` is redefined on every render and is not a dependency worth
    // tracking: what should restart the timer is a CHANGE, not a re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty, saving, publishing, loading, sections, settingsDraft])

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

  // Strip runtime-only `_product_data` that the preview injects into
  // product sections — we don't want a specific product's data baked into
  // the page template because every product page renders from the same
  // saved template and injects its own data at view time.
  const sectionsForSave = (input: SectionInstance[]): SectionInstance[] =>
    input.map(sec => {
      if (!sec.settings || !("_product_data" in sec.settings)) return sec
      const { _product_data: _omit, ...rest } = sec.settings as Record<string, unknown>
      return { ...sec, settings: rest }
    })

  /**
   * The website page's cover is a picture of the home page from the last
   * save. Ask for one after a save has succeeded — debounced, idle-time,
   * and only when the canvas is showing the home page at desktop width.
   * See lib/website-builder/snapshot-capture.ts for why each of those.
   */
  const snapshotAfterSave = () => {
    const node = canvasRef.current
    if (!node) return
    if (currentPage !== "home" || device !== "desktop" || previewMode !== "preview" || isMobileView) return
    if (loading || canvasLoading) return
    scheduleSnapshot({ installId, node })
  }

  const saveDraft = async (options: { quiet?: boolean } = {}) => {
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
        body: JSON.stringify({ page_key: currentPage, sections: sectionsForSave(sections), mode: "draft" }),
      })
      if (!sectionsRes.ok) {
        const d = await sectionsRes.json().catch(() => ({}))
        // A FAILED autosave is not quiet. Silence here is how somebody keeps
        // working for an hour against a server that stopped accepting writes.
        showNotification(d.error ?? "Failed to save sections", "error")
        return
      }

      // Sync header/footer to all other pages
      await syncHeaderFooterToAllPages("draft")

      setIsDirty(false)
      snapshotAfterSave()
      /**
       * Autosave says nothing. A toast every couple of seconds is noise that
       * trains somebody to ignore the one that matters — the bar already shows
       * the state.
       */
      if (!options.quiet) showNotification("Changes saved successfully")
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
        body: JSON.stringify({ page_key: currentPage, sections: sectionsForSave(sections), mode: "draft" }),
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
        setInstall({ ...install, status: "published", published_at: new Date().toISOString() })
      }

      setIsDirty(false)
      setUnpublished(false)
      setHasPublished(true)
      snapshotAfterSave()
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

  /**
   * The canvas's two callbacks, made once.
   *
   * They exist as their own useCallbacks because EditorCanvasPage below is
   * memoised, and a memoised component handed a freshly built arrow function
   * on every render is a memoised component that re-renders on every render.
   * Neither closes over a section, so neither has a reason to be rebuilt.
   */
  const selectSectionFromCanvas = useCallback(
    (sectionId: string) => {
      setSelectedPanel({ type: "section", sectionId })
      scrollToSection(sectionId)
    },
    [scrollToSection],
  )
  const openAddSection = useCallback(() => setAddSectionOpen(true), [])

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
      <div className="flex flex-col h-full">
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

        <div className="flex-1 overflow-y-auto wb-slim-scroll px-3 pb-4">

          {/* Custom Pages */}
          {allCustomPages.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center justify-between px-1 mb-1.5">
                <p className="text-xs font-bold text-foreground">Custom Pages</p>
                <button className="text-muted-foreground hover:text-foreground cursor-pointer" title="Add page" onClick={() => setAddPageOpen(true)}>
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="border border-border rounded-lg overflow-hidden divide-y divide-border">
                {allCustomPages.map(p => (
                  <button
                    key={p.key}
                    className={cn(
                      "w-full text-left px-3 py-2.5 text-sm transition-colors hover:bg-muted/50",
                      currentPage === p.key && !selectedProductPage ? "text-foreground font-medium bg-muted" : "text-foreground"
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
              <button className="text-muted-foreground hover:text-foreground" title="Add product page">
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
                      selectedProductPage === p.title ? "text-foreground font-medium bg-muted" : "text-foreground"
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
          <div className="flex flex-col h-full">
            <div className="px-4 py-3 border-b border-border shrink-0">
              <p className="text-sm font-semibold">General Settings</p>
              <p className="text-xs text-muted-foreground mt-0.5">Colors, fonts, buttons, spacing</p>
            </div>
            <div className="flex-1 overflow-y-auto wb-slim-scroll p-2">
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
                          initialActive={editSchemeKey}
                          onInitialActiveConsumed={() => setEditSchemeKey(null)}
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
        <div className="flex flex-col h-full">
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
            <div className="flex-1 overflow-y-auto wb-slim-scroll p-3 space-y-2">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="h-12 rounded-lg bg-muted/60 animate-pulse" style={{ animationDelay: `${i * 80}ms` }} />
              ))}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto wb-slim-scroll p-3 space-y-0.5">
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
                    structureRole="header"
                  />
                </div>
              )}

              {/* Body sections — no connector line */}
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                modifiers={dragModifiers}
                /**
                 * Re-measure the rows while the drag is in flight.
                 *
                 * The default measures them once, when the drag starts, and
                 * then works from that snapshot. But the rows MOVE during a
                 * reorder, so every swap put the real rows further from where
                 * dnd-kit believed they were, and by the third or fourth one
                 * the row under the finger was not the row that lit up. That
                 * is the whole of "it is not accurate". Measuring always
                 * costs a layout per animation frame of the drag and buys
                 * back a drop that lands where it was aimed.
                 */
                measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragCancel={handleDragCancel}
                onDragEnd={handleDragEnd}
              >
                <SortableContext items={bodySection.map(s => s.id)} strategy={verticalListSortingStrategy}>
                  {(() => {
                    const bodyStart = header ? 1 : 0
                    const openInsert = (relIdx: number) => {
                      setPendingInsertIndex(bodyStart + relIdx)
                      setAddSectionOpen(true)
                    }
                    return (
                      <div className="space-y-0.5">
                        {/* Insert slot above the first body section */}
                        {bodySection.length > 0 && (
                          <InsertSectionDivider onClick={() => openInsert(0)} />
                        )}
                        {bodySection.map((section, idx) => (
                          <div key={section.id}>
                            <SortableSectionRow
                              section={section}
                              isSelected={selectedSectionId === section.id}
                              onSelect={() => { setSelectedPanel({ type: "section", sectionId: section.id }); scrollToSection(section.id) }}
                              onToggleHide={() => toggleSectionHidden(section.id)}
                              onDuplicate={() => duplicateSection(section.id)}
                              onRemove={() => removeSection(section.id)}
                            />
                            {/* Insert slot after this section (also before next, or before "Add section" button) */}
                            <InsertSectionDivider onClick={() => openInsert(idx + 1)} />
                          </div>
                        ))}
                        <button
                          className="w-full flex items-center gap-2.5 px-3 py-3 text-sm text-foreground/70 hover:bg-muted hover:text-foreground rounded-lg transition-colors font-medium"
                          onClick={() => { setPendingInsertIndex(null); setAddSectionOpen(true) }}
                        >
                          <div className="h-8 w-8 rounded-lg border border-dashed border-border flex items-center justify-center">
                            <Plus className="h-4 w-4" />
                          </div>
                          Add section
                        </button>
                      </div>
                    )
                  })()}
                </SortableContext>
                {/**
                 * THE ROW IN THE AIR IS A SEPARATE ROW.
                 *
                 * Without this the row being dragged is the row in the list,
                 * moved by a transform: it is laid out with its neighbours,
                 * clipped by whatever clips them, and it repaints inside the
                 * scrolling list on every frame. The overlay is one fixed
                 * element on its own layer that follows the pointer, so the
                 * finger has something that tracks it exactly while the list
                 * underneath quietly reflows into the new order.
                 *
                 * `dropAnimation` is left at the default, which flies the
                 * overlay back to the placeholder's final rectangle. That
                 * flight is the confirmation that the drop was taken.
                 */}
                <DragOverlay>
                  {draggingId ? (
                    <div className="wb-drag-lift rounded-lg bg-white">
                      <SidebarSectionRow
                        section={sections.find((x) => x.id === draggingId) ?? bodySection[0]}
                        isSelected={false}
                        onSelect={() => {}}
                        onToggleHide={() => {}}
                        onDuplicate={() => {}}
                        onRemove={() => {}}
                      />
                    </div>
                  ) : null}
                </DragOverlay>
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
                    structureRole="footer"
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
            onAddBlock={(type, initialSettings) => addBlock(section.id, type, initialSettings)}
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
            onEditScheme={(schemeKey) => {
              if (schemeKey) setEditSchemeKey(schemeKey)
              setSidebarMode("settings")
              setExpandedSettings("color_schemes")
              setSelectedPanel({ type: "pages" })
            }}
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

          <div className="flex-1 overflow-y-auto wb-slim-scroll">
            {/* Per-section color scheme picker (uses global Color Schemes) */}
            <SectionColorSchemePicker
              value={typeof section.settings.color_scheme === "string" ? section.settings.color_scheme : "white"}
              onChange={v => updateSectionSetting(section.id, "color_scheme", v)}
              themeSchemes={settingsDraft.color_schemes as Record<string, ColorSchemeValues> | undefined}
              onEditScheme={(schemeKey) => {
                if (schemeKey) setEditSchemeKey(schemeKey)
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
                            {!!block.settings.author && <span className="ml-1 opacity-50">{String(block.settings.author)}</span>}
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
                    className="mt-2 w-full flex items-center justify-center gap-1.5 py-2.5 text-sm text-muted-foreground hover:text-foreground border border-dashed border-border hover:border-neutral-400 rounded-lg transition-colors"
                    onClick={() => addBlock(section.id, schema.blocks![0].type)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add {schema.blocks[0]?.name?.toLowerCase() ?? "block"}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ── The section's actions, pinned under its settings ──
              THE ROW IS MEASURED, NOT GUESSED.

              This was three equal columns, each with a 16px icon, an 8px gap
              and its label. Measured in Chromium at 13px/600, "Duplicate" is
              69.8px wide, so that button needed 93.8px of content. At the
              sidebar's default 288px a third of the row is 82.6px, and at its
              240px minimum it is 66.7px. Measured in the browser, Duplicate
              ran 23.1px past its button at the default width and 39.1px past
              it at the minimum, and Delete 1.3px and 17.3px. That is the icon
              sitting on the word, and it is what was reported.

              Two things follow from those numbers. The icons go: with them,
              the three labels need 275px at a width that offers 216, and no
              amount of tightening closes that. And the columns stop being
              equal: `flex: 1 1 auto` starts each button at its own label's
              width and shares only the space left over, so "Hide" (33.5px)
              stops reserving as much room as "Duplicate" and every button
              fits at every width the sidebar can be dragged to. Total at the
              240px minimum: 203px of 216. See scripts/check-section-actions.mjs.

              Delete is grey at rest and red under the pointer. Both halves
              of that matter, and they were argued out separately: a button
              that is red before anyone has reached for it is a warning label
              stuck on the end of a row of controls, shouting at somebody who
              has not decided anything yet. With the bin gone, though,
              position is the only thing left telling a destructive action
              apart from a duplicate, so the colour arrives at the moment the
              hand is on it and not before. */}
          <div className="shrink-0 border-t border-[#e5e7eb] bg-white px-3 pt-3 pb-3.5 flex gap-2">
            <button
              type="button"
              className={cn(
                "flex-auto min-w-0 h-10 px-1.5 flex items-center justify-center rounded-xl text-[13px] font-semibold transition-colors duration-150",
                section.hidden
                  ? "bg-[#1a1a2e] text-white active:bg-[#2a2a44]"
                  : "bg-[#f3f4f6] text-[#1a1a2e] hover:bg-[#e9eaee] active:bg-[#e3e4e9]",
              )}
              onClick={() => toggleSectionHidden(section.id)}
            >
              <span className="truncate">{section.hidden ? "Show" : "Hide"}</span>
            </button>
            <button
              type="button"
              className="flex-auto min-w-0 h-10 px-1.5 flex items-center justify-center rounded-xl bg-[#f3f4f6] text-[13px] font-semibold text-[#1a1a2e] transition-colors duration-150 hover:bg-[#e9eaee] active:bg-[#e3e4e9]"
              onClick={() => duplicateSection(section.id)}
            >
              <span className="truncate">Duplicate</span>
            </button>
            <button
              type="button"
              className="flex-auto min-w-0 h-10 px-1.5 flex items-center justify-center rounded-xl bg-[#f3f4f6] text-[13px] font-semibold text-[#1a1a2e] transition-colors duration-150 hover:bg-[#fee2e2] hover:text-[#dc2626] active:bg-[#fecaca] active:text-[#b91c1c]"
              onClick={() => removeSection(section.id)}
            >
              <span className="truncate">Delete</span>
            </button>
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
          <div className="flex-1 overflow-y-auto wb-slim-scroll p-3">
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

  /**
   * Undo and redo, as one pair. On a desktop they sit on the right beside the
   * AI; on a phone they are the middle of the bar, because the middle is the
   * only place on a 390px bar where two buttons can be found without looking.
   * One definition, two homes, so they cannot drift apart.
   */
  const undoRedo = (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className="wb-depth h-8 w-8 flex items-center justify-center rounded-lg text-white/80 hover:text-white active:scale-90 transition-[scale,color] duration-150 disabled:active:scale-100 shrink-0"
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            aria-label="Undo"
          >
            <Undo2 className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Undo</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className="wb-depth h-8 w-8 flex items-center justify-center rounded-lg text-white/80 hover:text-white active:scale-90 transition-[scale,color] duration-150 disabled:active:scale-100 shrink-0"
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            aria-label="Redo"
          >
            <Redo2 className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Redo</TooltipContent>
      </Tooltip>
    </>
  )

  /** See `useDelayedFlag`: a fast load should show nothing at all. */
  const showCanvasLoader = useDelayedFlag(loading || canvasLoading)
  /**
   * The loader's surface stays for a beat after the page has arrived, so it
   * can fade over the page rather than vanish from in front of it.
   */
  const canvasBusy = loading || canvasLoading
  const canvasLoaderLingers = useLinger(canvasBusy, 280)
  /** Light chrome on a phone, wherever the clock can still be read. */
  const chromeTone = usePhoneChromeTone(isMobileView)

  /** What leaving would cost right now, if anything. */
  const leaveReason: LeaveReason = {
    draft: isDirty,
    code: codeDirty,
    busy: saving || publishing,
  }

  /**
   * One door out, used by both exits. Asks only when there is something to
   * lose; otherwise it goes, which is what somebody pressing Back meant.
   */
  const requestExit = useCallback(
    (href: string) => {
      if (hasSomethingToLose({ draft: isDirty, code: codeDirty, busy: saving || publishing })) {
        setPendingExit(href)
        return
      }
      setLeaving(true)
      router.push(href)
    },
    [isDirty, codeDirty, saving, publishing, router],
  )

  // ── Main editor layout ─────────────────────────────────────
  return (
    <div
      className={cn(
        // `fixed inset-0`, not `h-svh`. A 100svh element is CONTENT, and the
        // body adds its safe-area padding underneath it — one screen plus
        // 34px, a document that scrolls, a top bar that slides back under
        // the status bar. Fixed is measured against the viewport and adds
        // nothing to the document. FullScreenLock below zeroes that padding
        // so nothing else can put the scroll back.
        "wb-editor fixed inset-0 flex flex-col bg-muted/30 overflow-hidden wb-editor-enter",
        chromeTone === "light" && "wb-chrome-light",
        // Leaving fades the editor while the next page is fetched, so the
        // hand-off is a dissolve rather than a hard cut when it lands.
        leaving && "wb-editor-leaving",
      )}
    >
      <FullScreenLock tone={chromeTone} />
      {/* ── Top bar ── */}
      {/* Dark, like the reference: the bar is chrome, and chrome that is the
          same colour as the page it frames is chrome you keep mistaking for
          the page. Everything on it is white-on-dark from here down. */}
      <header className="wb-editor-topbar relative bg-[var(--wb-chrome-bg)] text-[var(--wb-chrome-fg)] border-b border-[var(--wb-chrome-line)] flex items-center px-3 md:px-4 gap-2 shrink-0 z-50">
        {/* LEFT: Exit + sidebar mode toggles (desktop only) */}
        <div className="flex items-center gap-1.5 min-w-0">
          {/* Exit button — X on mobile (Shopify-style editor close), back arrow on desktop */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="h-8 w-8 flex items-center justify-center rounded-lg text-[var(--wb-chrome-fg-2)] hover:bg-[var(--wb-chrome-hover)] hover:text-[var(--wb-chrome-fg)] active:scale-90 active:bg-[var(--wb-chrome-active)] transition-[background-color,scale,color] duration-150 shrink-0"
                onClick={() => requestExit("/app/website-builder")}
                aria-label="Back"
              >
                {isMobileView ? (
                  <ArrowLeft className="h-[18px] w-[18px]" strokeWidth={2} />
                ) : (
                  <BackWithBarIcon className="h-4 w-4" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Exit</TooltipContent>
          </Tooltip>

          {/* Desktop: sidebar mode toggles (Pages / Sections / General Settings)
              Moved up from the old vertical rail so the sidebar gets the full
              horizontal space for its panel content. */}
          {!isMobileView && (
            <div className="flex items-center gap-0.5 ml-1.5 pl-1.5 border-l border-[var(--wb-chrome-line)]">
              <button
                className={cn(
                  "h-8 w-8 flex items-center justify-center rounded-lg transition-colors",
                  sidebarMode === "sections" && !pageBrowserOpen
                    ? "bg-[var(--wb-chrome-active)] text-[var(--wb-chrome-fg)]"
                    : "text-[var(--wb-chrome-fg-3)] hover:bg-[var(--wb-chrome-hover)] hover:text-[var(--wb-chrome-fg)]",
                )}
                onClick={() => { setSidebarMode("sections"); setPageBrowserOpen(false); setSelectedPanel({ type: "pages" }) }}
                title="Sections"
              >
                <Layers className="h-4 w-4" strokeWidth={1.75} />
              </button>
              <button
                className={cn(
                  "h-8 w-8 flex items-center justify-center rounded-lg transition-colors",
                  pageBrowserOpen
                    ? "bg-[var(--wb-chrome-active)] text-[var(--wb-chrome-fg)]"
                    : "text-[var(--wb-chrome-fg-3)] hover:bg-[var(--wb-chrome-hover)] hover:text-[var(--wb-chrome-fg)]",
                )}
                onClick={() => { setPageBrowserOpen(true); setSelectedPanel({ type: "pages" }) }}
                title="Pages"
              >
                <FileText className="h-4 w-4" strokeWidth={1.75} />
              </button>
              <button
                className={cn(
                  "h-8 w-8 flex items-center justify-center rounded-lg transition-colors",
                  sidebarMode === "settings" && !pageBrowserOpen
                    ? "bg-[var(--wb-chrome-active)] text-[var(--wb-chrome-fg)]"
                    : "text-[var(--wb-chrome-fg-3)] hover:bg-[var(--wb-chrome-hover)] hover:text-[var(--wb-chrome-fg)]",
                )}
                onClick={() => { setSidebarMode("settings"); setPageBrowserOpen(false); setSelectedPanel({ type: "theme_settings" }) }}
                title="General Settings"
              >
                <Settings className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>
          )}
<div className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm font-medium text-[var(--wb-chrome-fg)] truncate hidden md:block max-w-[180px]">{install?.name}</span>
          {/*
            THE DOT IS THE WHOLE BADGE.

            "Live" in a bordered pill is a word, a border and a colour all
            saying one thing, sitting next to the theme's name where the name
            is what you are reading. The dot says it in one glyph, and the
            word is still there for anyone who hovers or is using a screen
            reader — where it belongs, rather than occupying the bar.
          */}
          {install?.status === "published" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="hidden md:flex h-4 w-4 shrink-0 items-center justify-center"
                  aria-label="Site is live"
                >
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom">Site is live</TooltipContent>
            </Tooltip>
          )}
          <ResponsiveActionMenu
            title="Actions"
            align="center"
            menuWidth="w-52"
            trigger={
              <button className="h-8 w-8 flex items-center justify-center rounded-lg text-[var(--wb-chrome-fg-3)] hover:bg-[var(--wb-chrome-hover)] hover:text-[var(--wb-chrome-fg)] transition-colors shrink-0" title="Theme options">
                <MoreHorizontal className="h-4 w-4" />
              </button>
            }
            items={[
              {
                label: previewMode === "code" ? "Back to preview" : "View code",
                icon: <Code2 className="h-4 w-4" />,
                onClick: () => {
                  const next: PreviewMode = previewMode === "code" ? "preview" : "code"
                  setPreviewMode(next)
                  if (next === "code") { setMobileSidebarOpen(false); setAiOpen(false) }
                },
              },
              {
                label: "Theme settings",
                icon: <Settings className="h-4 w-4" />,
                onClick: () => {
                  setSidebarMode("settings")
                  setPageBrowserOpen(false)
                  setSelectedPanel({ type: "theme_settings" })
                  if (isMobileView) setMobileSidebarOpen(true)
                },
              },
              {
                // The desktop pill has a Project Settings segment. A phone has
                // no pill, so this is the phone's way in; on a desktop it is
                // the same page from a second door.
                label: "Project settings",
                icon: <SlidersHorizontal className="h-4 w-4" />,
                onClick: () => {
                  setPreviewMode("settings")
                  setProjectSettingsOpen(true)
                  setMobileSidebarOpen(false)
                  setAiOpen(false)
                },
              },
              {
                label: "Undo",
                icon: <Undo2 className="h-4 w-4" />,
                onClick: handleUndo,
                separatorBefore: true,
              },
              {
                label: "Redo",
                icon: <Redo2 className="h-4 w-4" />,
                onClick: handleRedo,
              },
              ...(websiteUrl
                ? [{
                    label: "View live site",
                    icon: <ExternalLink className="h-4 w-4" />,
                    href: websiteUrl,
                    target: "_blank" as const,
                    separatorBefore: true,
                  }]
                : []),
              {
                label: "Back to Dashboard",
                icon: <ArrowLeft className="h-4 w-4" />,
                onClick: () => requestExit("/app"),
                separatorBefore: !websiteUrl,
              },
            ]}
          />
          {/* A phone puts undo and redo here, straight after the menu, rather
              than in the middle of the bar. Centred, they were an island
              between the project's name and the page's; here they are the
              end of the row of things you do TO the project, which is where
              a thumb already is. */}
          {isMobileView && undoRedo}
          {/* No running commentary on the save. The Publish button already
              says whether the public site is behind, in the one place
              somebody goes to do something about it, and a sentence of grey
              text beside the project's name only pushed the name and its
              menu away from the switcher they belong next to. */}
        </div>
          {/* Preview, the code, or the project. It follows the project's own
              name and menu rather than preceding them: the row reads left to
              right as which project, what to do with it, then how you are
              looking at it. A phone has no room for it and reaches Code and
              Project settings from the menu. */}
          {!isMobileView && (
            <div className="ml-1.5 shrink-0">
              <PreviewModeSwitch
                mode={previewMode}
                onChange={(m) => {
                  setPreviewMode(m)
                  if (m === "settings") setProjectSettingsOpen(true)
                }}
              />
            </div>
          )}
        </div>

        {/* CENTER: theme name + Live badge + 3-dots menu + unsaved indicator */}
        

        {/*
          CENTRE: WHICH PAGE, AND HOW YOU ARE LOOKING AT IT.

          The page you are editing is the most important fact on this bar, so
          it is in the middle and it is named rather than implied. Everything
          immediately around it is about LOOKING at that page — the format you
          are viewing it in on the left, reloading it and opening it for real
          on the right — and everything about the PROJECT stays on the edges.
        */}
        <div className="flex flex-1 items-center justify-center gap-1.5 min-w-0">
          {/* Format, to the left of the page it applies to. */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="hidden sm:flex h-8 w-8 items-center justify-center rounded-lg text-[var(--wb-chrome-fg-3)] transition-colors hover:bg-[var(--wb-chrome-hover)] hover:text-[var(--wb-chrome-fg)] shrink-0"
                onClick={() => setDevice(device === "desktop" ? "mobile" : "desktop")}
                aria-label={device === "desktop" ? "Switch to phone preview" : "Switch to desktop preview"}
                aria-pressed={device === "mobile"}
              >
                {device === "desktop" ? (
                  <Monitor className="h-4 w-4" strokeWidth={1.75} />
                ) : (
                  <Smartphone className="h-4 w-4" strokeWidth={1.75} />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {device === "desktop" ? "Switch to phone" : `Switch to desktop (phone is ${DEVICE_WIDTH.mobile}px)`}
            </TooltipContent>
          </Tooltip>

          {!isMobileView && (
          <PageSwitcher
            pages={[
              ...(Object.keys(PAGE_META) as PageKey[]).map((k) => ({
                key: k,
                name: PAGE_META[k].label,
                path: k === "home" ? "/" : `/${k}`,
              })),
              ...customPages.map((p) => ({ key: p.key as string, name: p.name, path: `/${p.key}`, custom: true })),
            ]}
            current={currentPage}
            onSelect={(key) => { void handlePageChange(key as PageKey) }}
            onCreate={() => setAddPageOpen(true)}
            onDelete={(key) => setCustomPages((prev) => prev.filter((p) => p.key !== key))}
            onReload={() => { void handlePageChange(currentPage) }}
            reloading={sectionsLoading}
            disabled={sectionsLoading}
            products={products.map((p) => ({ id: p.id, title: p.title }))}
            currentProduct={selectedProductPage}
            onSelectProduct={(title) => {
              const p = products.find((x) => x.title === title)
              if (p) handleSelectProductPage(p.id, p.title)
            }}
          />
          )}

          {/* Open the real thing, to the right of the page it opens. */}
          {websiteUrl && (
            <Tooltip>
              <TooltipTrigger asChild>
                <a
                  href={websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hidden sm:flex h-8 w-8 items-center justify-center rounded-lg text-[var(--wb-chrome-fg-3)] transition-colors hover:bg-[var(--wb-chrome-hover)] hover:text-[var(--wb-chrome-fg)] shrink-0"
                  aria-label="Open the live page"
                >
                  <ExternalLink className="h-4 w-4" strokeWidth={1.75} />
                </a>
              </TooltipTrigger>
              <TooltipContent side="bottom">Open the live page</TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* RIGHT: where the site is, and what to do with it. */}
        <div className="flex items-center gap-2 shrink-0">
          {/* The address, as an address.
              A globe icon said "there is a website somewhere"; the domain says
              WHICH website, which is the thing somebody actually wants to
              check before they publish — and it is one fewer hover to find
              out. Falls back to the icon where there is no room for text. */}
          {/* Device Switcher — pill toggle */}
          
          {/* Inspector toggle — filled when on.
              When ON (default): clicking a section highlights it with the
              blue selection rectangle and opens its settings panel.
              When OFF: canvas behaves like a pure preview — no outlines,
              no section-click interception. */}
          {/* Undo and redo are a pair and sit as one: the left button and
              the right button. On a desktop they are here; a phone puts them
              beside the menu, on the left. */}
          {!isMobileView && undoRedo}

          {/* The inspector, immediately beside the AI at every size. The two
              of them are the builder's own tools — everything else on this
              side is about the site — so they stand together, and the pair
              is what a thumb reaches for on a phone. */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={cn(
                  "wb-depth wb-inspector h-8 w-8 flex items-center justify-center rounded-lg text-[var(--wb-chrome-fg-2)] hover:text-[var(--wb-chrome-fg)] shrink-0 active:scale-90",
                  inspectorEnabled && "wb-inspector-on",
                )}
                onClick={() => setInspectorEnabled(v => !v)}
                aria-label={inspectorEnabled ? "Disable section inspector" : "Enable section inspector"}
                aria-pressed={inspectorEnabled}
              >
                <MousePointerClick className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {inspectorEnabled ? "Inspector: on, click to disable" : "Inspector: off, click to enable"}
            </TooltipContent>
          </Tooltip>

          {/* Ask AI */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className={cn(
                  // Shown on every size. It was `hidden sm:flex`, which hid the
                  // AI from the device most likely to want it.
                  "wb-ai-button h-8 w-8 flex items-center justify-center rounded-lg transition-[scale,box-shadow] duration-150 cursor-pointer active:scale-90",
                  /*
                    The mark keeps its own colour in both states. Inverting the
                    button to solid black used to be fine for a line-art
                    sparkle and is not for a logo — a brand mark on a black
                    tile reads as a different brand.
                  */
                  aiOpen ? "wb-ai-button-open" : "",
                )}
                onClick={() => {
                  setAiOpen(open => !open)
                  // The section sheet and the AI sheet cannot both own the
                  // bottom of the screen.
                  if (isMobileView) setMobileSidebarOpen(false)
                }}
                aria-label="Ask Storelib"
                aria-pressed={aiOpen}
              >
                <StorelibMark className={cn("h-[18px] w-[18px] rounded-[5px] transition-opacity", aiOpen ? "opacity-100" : "opacity-80")} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{aiOpen ? "Hide Storelib AI" : "Ask Storelib"}</TooltipContent>
          </Tooltip>
          {/* The button says what is actually true.
              On a LIVE theme it is Publish: the draft is saved automatically,
              so "Save" would be a button for something that has already
              happened, and greying it out would say "Saved" over a public site
              that is still showing last week's page. It is enabled exactly
              when the draft is ahead of what visitors see.
              On a theme that is not live there is nothing to publish TO, so it
              stays Save and follows `isDirty`. */}
          {(() => {
            const live = install?.status === "published"
            const pending = live ? unpublished : isDirty
            const busyNow = saving || publishing
            return (
              <div ref={publishBtnRef} className="relative">
                <Button
                  size="sm"
                  className={cn(
                    "h-8 cursor-pointer min-w-[92px] rounded-full transition-all duration-200 gap-2",
                    // White on purple whatever the chrome's tone; the chrome's
                    // own text only on the chrome's own surface.
                    live ? "bg-[#8B56FA] text-white hover:bg-[#7b46ec]" : "bg-[var(--wb-chrome-hover)] text-[var(--wb-chrome-fg)] hover:bg-[var(--wb-chrome-active)]",
                  )}
                  onClick={() => {
                    if (!live) { void handleSave(); return }
                    setPublishOpen((v) => !v)
                    if (isMobileView) { setMobileSidebarOpen(false); setAiOpen(false) }
                  }}
                  disabled={busyNow || (!live && !pending)}
                >
                  {busyNow ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : live ? (
                    <span className={cn("h-2 w-2 rounded-full", pending ? "bg-white" : "bg-white/50")} />
                  ) : null}
                  <span>{busyNow ? (live ? "Publishing" : "Saving") : live ? "Publish" : pending ? "Save" : "Saved"}</span>
                </Button>
                <PublishPanel
                  open={publishOpen}
                  onOpenChange={setPublishOpen}
                  anchorRef={publishBtnRef}
                  mobile={isMobileView}
                  live={live}
                  pending={pending}
                  publishedAt={install?.published_at ?? null}
                  websiteUrl={websiteUrl}
                  websiteUrlDisplay={websiteUrlDisplay}
                  busy={busyNow}
                  onPublish={() => { void handleSave() }}
                />
              </div>
            )
          })()}
        </div>

        {/* ── Thin page-load progress bar ──
            Single A→B sweep (NProgress-style), never looping. Creeps toward
            ~90% while the load is in flight, snaps to 100% and fades out.
            Lives on the bar's bottom edge so it has no height of its own. */}
        <WbLoadProgressBar active={sectionsLoading} />
      </header>

      <ProjectSettings
        open={projectSettingsOpen}
        onClose={() => {
          setProjectSettingsOpen(false)
          setPreviewMode("preview")
        }}
        installId={installId}
        name={install?.name ?? ""}
        onRenamed={(name) => setInstall((cur) => (cur ? { ...cur, name } : cur))}
        websiteUrl={websiteUrl}
        websiteUrlDisplay={websiteUrlDisplay}
        live={install?.status === "published"}
        publishedAt={install?.published_at ?? null}
        // The draft on the server has just been replaced. The editor's own
        // copy of it is stale in every state it holds, and reloading is the
        // one honest way to pick all of it up at once.
        onRestored={() => window.location.reload()}
      />

      {/* Leaving. Rendered the moment Back is pressed: going back can take a
          second or more on a phone, and a second of nothing is a second in
          which the button gets pressed again. */}
      {/* Portalled, for the reason the sheets are: a z-index is only
          comparable inside one stacking context, and this has to cover sheets
          that render into the body. From in here it could not. */}
      <LeaveConfirm
        open={pendingExit !== null}
        reason={leaveReason}
        onCancel={() => setPendingExit(null)}
        onLeave={() => {
          const href = pendingExit
          setPendingExit(null)
          setLeaving(true)
          if (href) router.push(href)
        }}
      />

      {leaving && portalReady && createPortal(
        <div className="wb-leaving" role="status" aria-live="polite" aria-label="Going back">
          {/* `dark` is the surface this is ON, not the colour of the words:
              the glass is a near-black blur, so the loader draws in white.
              It said `light` and rendered dark grey on it, which is why
              going back looked like a blur with nothing written on it. */}
          <BuilderLoader
            className="wb-leaving-content"
            tone="dark"
            lines={["Going back", "Saving where you were", "Almost there"]}
          />
        </div>,
        document.body,
      )}

      {/* ── Top notification bar ── */}
      <div
        className={cn(
          "fixed top-0 left-0 right-0 z-[100] flex justify-center pointer-events-none transition-all duration-300 ease-out",
          notification ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0"
        )}
        // Same inset as the bar it appears under. Without it the toast is
        // one more thing rendered behind the status bar on a phone.
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
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

      {/* ── Body ──
          NO MAT, AND NOTHING BLACK BEHIND THE PANELS.

          This was eight pixels of the bar's dark on every side of every
          panel, which put a black gutter down the left of the sidebar, a
          black band under the preview and a black seam between the two. Dark
          matting only works where it is wide enough to read as a frame; at
          eight pixels it reads as a gap that failed to close, and that is
          what was reported.

          So the panels are flush: the sidebar meets the left edge, the
          preview meets the sidebar, and the only surround left anywhere is
          the two wedges inside the workspace's outer top corners.

          THE WORKSPACE IS ONE ROUNDED SHAPE UNDER THE BAR.

          The rounding used to sit at the sidebar/canvas junction, which put
          an arc in the middle of the row and left both ends of it square
          against the screen. That is backwards: the seam between two panels
          is an internal divider and wants to be a straight hairline, and the
          corners that meet the chrome are the ones that should turn. So the
          sidebar rounds at the top left, the canvas rounds at the top right,
          and the row reads as a single sheet tucked under the bar.

          This row paints the LIGHT surround, not the bar's dark. The dark was
          tried and it reads as a hole punched between two white panels: the
          arcs are small, and a small dark shape surrounded by white is a gap,
          not a frame. In the workspace's own light grey the same arcs read as
          the surface the panels are sitting on, which is what they are.

          THIS ROW IS DARKER THAN THE CANVAS, AND THAT IS THE WHOLE TRICK.

          Every arc in the row opens onto this colour, so it has to differ
          from BOTH things that curve away from it: the white of the sidebar
          and the light grey of the canvas. It was the same grey as the
          canvas, which meant the canvas's own corners revealed exactly the
          colour already beside them — present, correctly clipped, and
          invisible. That is why the canvas kept reading as square under the
          bar while the sidebar beside it read as round.

          #d9dee6 is 33 points of luminance from white and 19 from the canvas,
          so both curves are visible, and the canvas itself gets LIGHTER at
          the same time rather than darker. None of this colour is ever seen
          except inside those four arcs. */}
      <div className="relative flex flex-1 min-h-0 overflow-hidden bg-[#d9dee6]">
        {/* ── Left sidebar (desktop — no vertical rail, switches live in topbar) ── */}
        {!isMobileView ? (
          <div className="relative flex-shrink-0 flex h-full overflow-visible">
            {/* Clipped HERE, on the box with the width, so the list's own
                scrollbar stays inside it. The outer box stays
                `overflow-visible` for the grab edge that hangs past it.

                BOTH TOP CORNERS, like the canvas beside it. The sidebar
                turned only at the screen's edge, so at the seam a rounded
                canvas met a square sidebar and the surround between them was
                a one-sided notch. Curving both sides makes it a symmetric
                valley: two panels tucked under the bar, mirroring each
                other, with the workspace's own surface showing between. */}
            <div
              ref={sidebarRef}
              className="flex-1 flex flex-col min-h-0 overflow-hidden bg-white border-r border-[#e5e7eb] rounded-t-2xl"
              style={{ width: sidebarWidth, minWidth: SIDEBAR_MIN, maxWidth: SIDEBAR_MAX }}
            >
              <div className="flex-1 min-h-0 overflow-y-auto wb-slim-scroll overflow-x-hidden">
                {renderSidebarContent()}
              </div>
            </div>
            {/* The grab edge. Wider than it looks, so it can be found; drawn
                only under the pointer, so it is not a second border. */}
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize the sidebar"
              onPointerDown={startSidebarResize}
              onDoubleClick={() => {
                setSidebarWidth(288)
                if (sidebarRef.current) sidebarRef.current.style.width = "288px"
              }}
              className="group/resize absolute -right-1.5 top-0 z-20 h-full w-3 cursor-col-resize touch-none"
            >
              <div className="mx-auto h-full w-px bg-transparent transition-colors duration-150 group-hover/resize:bg-[#8B56FA]/70 group-active/resize:bg-[#8B56FA]" />
            </div>
          </div>
        ) : (
          /* Mobile — persistent bottom sheet (Shopify-style). Always visible
             with a small peek at the bottom when "closed", expands to ~50% of
             the viewport when opened. Drag the pill handle to move between
             states — finger tracks in real time. */
          previewMode !== "code" && (
          <MobileEditorSheet
            open={mobileSidebarOpen}
            onOpenChange={(next) => {
              setMobileSidebarOpen(next)
              // Two sheets cannot both own the bottom of the screen. Whichever
              // is being opened wins; the other gets out of the way.
              if (next) setAiOpen(false)
            }}
          >
            {/* Segmented tabs — Sections / Pages / Settings */}
            <div className="px-3 pt-1 pb-2 shrink-0 bg-background">
              <div className="flex items-center gap-1 p-0.5 bg-neutral-100 rounded-lg">
                <button
                  type="button"
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 h-8 rounded-md text-[13px] font-medium transition-all",
                    sidebarMode === "sections" && !pageBrowserOpen
                      ? "bg-white text-foreground shadow-sm"
                      : "text-muted-foreground",
                  )}
                  onClick={() => { setSidebarMode("sections"); setPageBrowserOpen(false); setSelectedPanel({ type: "pages" }); setMobileSidebarOpen(true) }}
                >
                  <Layers className="h-3.5 w-3.5" />
                  Sections
                </button>
                <button
                  type="button"
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 h-8 rounded-md text-[13px] font-medium transition-all",
                    pageBrowserOpen
                      ? "bg-white text-foreground shadow-sm"
                      : "text-muted-foreground",
                  )}
                  onClick={() => { setPageBrowserOpen(true); setSelectedPanel({ type: "pages" }); setMobileSidebarOpen(true) }}
                >
                  <FileText className="h-3.5 w-3.5" />
                  Pages
                </button>
                <button
                  type="button"
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 h-8 rounded-md text-[13px] font-medium transition-all",
                    sidebarMode === "settings" && !pageBrowserOpen
                      ? "bg-white text-foreground shadow-sm"
                      : "text-muted-foreground",
                  )}
                  onClick={() => { setSidebarMode("settings"); setPageBrowserOpen(false); setSelectedPanel({ type: "theme_settings" }); setMobileSidebarOpen(true) }}
                >
                  <Settings className="h-3.5 w-3.5" />
                  Settings
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto wb-slim-scroll overflow-x-hidden bg-background">
              {renderSidebarContent()}
            </div>
          </MobileEditorSheet>
          )
        )}

        {/* ── AI panel ──
            A COLUMN, not an overlay. Docked between the section list and the
            canvas so the preview stays fully visible and keeps its width to
            the right of it — the page moving while you type is the point, and
            a panel floating over the preview would hide the thing it is
            changing. Hidden rather than unmounted so a conversation survives
            being closed and reopened. */}
        {/* The AI on a phone.
            It was desktop-only — `!isMobileView` — so the one place somebody
            is most likely to want to describe a change rather than hunt for a
            control had no way to. It opens straight to the tallest stop,
            because a conversation is the case that needs the room and starting
            at half only ever has one answer. */}
        {isMobileView && aiMounted && (
          <MobileEditorSheet open={aiOpen} onOpenChange={(next) => setAiOpen(next)} openFull layer="raised" peekHeight={0}>
            <ThemeChat
              installId={installId}
              page={currentPage}
              sections={sections}
              settings={settingsDraft as Record<string, unknown>}
              selectedSectionId={selectedSectionId ?? undefined}
              onRunStart={pushUndo}
              onRunEnd={backupAfterTask}
              onOp={applyAiOp}
              onClose={() => setAiOpen(false)}
            />
          </MobileEditorSheet>
        )}

        {/* The AI takes the same shape as the panels either side of it, so
            opening it adds a column to the row rather than a square block in
            the middle of a row of rounded ones. */}
        {!isMobileView && aiOpen && (
          <div className="relative flex-shrink-0 overflow-hidden bg-white border-r border-[#e5e7eb] rounded-t-2xl" style={{ width: 340 }}>
            <ThemeChat
              installId={installId}
              page={currentPage}
              sections={sections}
              settings={settingsDraft as Record<string, unknown>}
              selectedSectionId={selectedSectionId ?? undefined}
              onRunStart={pushUndo}
              onRunEnd={backupAfterTask}
              onOp={applyAiOp}
              onClose={() => setAiOpen(false)}
            />
          </div>
        )}

        {/* ── Canvas ──
            The `<main>` is NOT scrollable. It just paints the gray surround
            and centers the preview card. The preview card itself
            (`#wb-preview-root`) IS the scroll container on both desktop and
            mobile — which means:
              • Sticky headers inside the preview stick to the TOP of the
                card, not to the top of the editor viewport.
              • Scrolled content can never visually escape the card's
                rounded corners into the editor topbar.
        */}
        <main
          className={cn(
            // `relative` so the code pane and the mode switch can sit over
            // the canvas without leaving the flex layout.
            "relative flex-1 min-w-0 overflow-hidden flex justify-center",
            /**
             * LIGHT. THE BUILDER IS A LIGHT PRODUCT.
             *
             * This has been dark twice, and both times for the same reason:
             * a card needs something behind it for its rounded corner to be
             * a corner, and dark is the easy way to get that. It is also the
             * wrong way here. The bar is chrome and is meant to be dark; the
             * canvas is the page you are working on, and a near-black field
             * around it makes the builder read as two products, one of them
             * with a hole in the middle. On a phone preview the hole is most
             * of the screen.
             *
             * So the surround is a light grey, far enough from white to give
             * the preview an edge, and its own corners curve away onto the
             * row behind it — which is a step darker again, so they can be
             * seen. When this and the row were the same grey, the canvas's
             * corners revealed the colour already beside them and read as
             * square however correctly they were clipped.
             */
            isMobileView ? "bg-background" : "bg-[#eef1f5] rounded-t-2xl",
            // On an actual mobile viewport the preview fills the viewport
            // (no gray gutter, no phone-chrome) — it IS the phone. On desktop
            // the tablet and phone buttons render a device-width card centred
            // vertically with gray gutters, and the sections inside measure
            // that card rather than the browser window.
            isMobileView
              ? "items-start p-0"
              /**
               * NO MAT, AND BOTH TOP CORNERS.
               *
               * The card is flush on every side and turns at the top, on BOTH
               * ends: at the right, where it meets the edge of the screen
               * under the bar, and at the left, where it meets the sidebar
               * under the bar. The sidebar mirrors it, so the four top
               * corners in the row all curve and the workspace's own light
               * surface shows through every one of them.
               *
               * This has been one corner twice — the left alone, then the
               * right alone — and dark behind the arcs once, which read as a
               * hole punched between two white panels rather than as a frame.
               * A device preview is a card in the middle of the canvas
               * instead, so that one is rounded all the way round.
               */
              : device === "desktop" ? "items-stretch p-0" : "items-center py-6 px-6",
          )}
          /**
           * The sheet is pinned to the viewport, so the canvas keeps its peek
           * clear itself — with the number the sheet PUBLISHES, measured on
           * this device, not a second computation of the same sum in CSS.
           * The 72px fallback is the peek before any inset, for the frame
           * before the sheet has measured itself.
           */
          style={isMobileView ? { paddingBottom: "var(--wb-sheet-peek, 72px)" } : undefined}
        >
          <CodePane
            installId={installId}
            visible={previewMode === "code"}
            fullScreen={isMobileView}
            onClose={() => setPreviewMode("preview")}
          />
          {/* ── The card's rounded corners survive its scrollbar ──
              A scrollbar is laid out and painted inside the scroll
              container's own box, and it is NOT held inside that box's
              border-radius. So while the card was itself the scroller, the
              bar painted a square 12px column straight through both
              right-hand arcs: measured in Chromium, every one of the 44
              pixels that the radius should have cut away was painted, at the
              top corner and the bottom one. The corner read square on the
              right and round on the left, which is what was reported.

              Styling the bar is not the way out of that. It was tried, and
              `::-webkit-scrollbar` rules are what convert a platform overlay
              scrollbar into a classic one, which then reserves a column of
              layout — the white strip down the right of the builder. This
              wrapper leaves the scrollbar alone entirely and clips it
              instead: the radius lives out here, on a box that does not
              scroll, and `overflow: hidden` cuts everything the arc excludes,
              the scrollbar included. Same measurement afterwards: 0 of 44 at
              the top, 1 at the bottom, that one being the arc's antialiasing.

              It carries the card's size and shape; the scroller inside it is
              simply 100% of it. See scripts/check-canvas-corner.mjs. */}
          <div
            className={cn(
              "relative overflow-hidden transition-all duration-300",
              // Fading the whole card, not just the scroller, so the corner
              // clip goes with it.
              previewMode === "code" && "opacity-0 pointer-events-none",
              isMobileView
                ? "w-full rounded-none"
                : device === "desktop"
                  ? "rounded-t-2xl w-full"
                  // A phone or a tablet is a card floating on the canvas, so
                  // it needs the edge and the lift a card has. On the dark
                  // surround the contrast did that job; on a light one it has
                  // to be drawn.
                  : "rounded-2xl ring-1 ring-black/[0.06] shadow-[0_18px_50px_-20px_rgba(15,23,42,0.28)]",
            )}
            style={
              isMobileView
                ? { width: "100%", height: "100%" }
                : device === "desktop"
                  ? { height: "100%" }
                  : {
                      /**
                       * A device-shaped card at the device's real width. The
                       * sections inside measure THIS, so the width is the
                       * whole preview — not a frame drawn around a desktop
                       * layout.
                       *
                       * `maxWidth: 100%` so a narrow canvas — sidebar open,
                       * AI panel open, laptop screen — shrinks the tablet
                       * card instead of letting it overflow and clip. The
                       * layout it shows is then honest about the width it
                       * actually got.
                       */
                      width: `${DEVICE_WIDTH[device]}px`,
                      maxWidth: "100%",
                      height: "min(900px, 100%)",
                      flex: "0 1 auto",
                    }
            }
          >
          <div
            id="wb-preview-root"
            /**
             * THE SCROLL THAT STOPS.
             * iOS hands a scroll gesture to the parent when the scroller is
             * exactly at its top or bottom, and the parent here is
             * `overflow: hidden` on purpose — so the gesture goes nowhere,
             * and every touch after it until the finger reverses is eaten.
             * `overscroll-behavior: contain` is the modern answer and is set
             * below; this is the belt to its braces: nudge one pixel off
             * either end at touchdown so there is never a hand-off to make.
             */
            onTouchStart={(e) => {
              if (!isMobileView) return
              const el = e.currentTarget
              const max = el.scrollHeight - el.clientHeight
              if (max <= 2) return
              if (el.scrollTop <= 0) el.scrollTop = 1
              else if (el.scrollTop >= max) el.scrollTop = max - 1
            }}
            className={cn(
              /**
               * `isolate` is the whole reason the page switcher's panel stopped
               * being drawn over by the site's own header. A theme header is
               * `sticky z-[60]`, the editor's bar is `z-50`, and while this
               * card created no stacking context of its own those two numbers
               * were compared in the same place — so a site's header won, and
               * painted across a menu belonging to the editor. Isolating the
               * card means nothing inside it can ever climb out of it.
               */
              // No border. A hairline around a card that is flush with the
              // chrome is a seam, and at the rounded corner it is the little
              // hook of grey that kept showing up there.
              // Leaving for the code fades rather than cuts: `invisible`
              // removed the site between one frame and the next, which is the
              // flash you see as the code arrives. Opacity keeps the scroll
              // position and hands over on the same curve — it is on the
              // wrapper now, so the card fades as one piece.
              //
              // No border. A hairline around a card that is flush with the
              // chrome is a seam, and at the rounded corner it is the little
              // hook of grey that kept showing up there. The rounding itself
              // is the wrapper's; this box is square and simply fills it.
              "relative isolate bg-white flex flex-col overflow-y-auto overflow-x-hidden border-0 rounded-none w-full h-full",
              // On a desktop the native bar is hidden and CanvasScrollbar,
              // below, draws one over the card. A phone keeps its own.
              !isMobileView && "wb-canvas-hidebar",
            )}
            style={
              isMobileView
                ? {
                    // The card is the scroller. Say so to the browser: a
                    // vertical drag here is a scroll and nothing else, and a
                    // scroll that reaches the end stays in the card rather
                    // than bouncing the page, which on iOS is where a touch
                    // scroll gets stuck.
                    touchAction: "pan-y",
                    overscrollBehavior: "contain",
                    WebkitOverflowScrolling: "touch",
                  }
                : undefined
            }
          >
            {/* Inner wrapper — used to be the scroll container; now just
                a flex-col so the footer sits at the bottom. It is also what
                the snapshot is taken of: the page and nothing else. */}
            <div ref={canvasRef} className="flex flex-col w-full flex-1">
            {/**
              * ONE SURFACE, AND THE LOADER IN THE MIDDLE OF IT.
              *
              * This was three stacked blocks in three tints, which drew a
              * hard edge across the canvas wherever one ended — the cut
              * between the white and the grey. A page that is loading is one
              * empty page, so it is one colour, and the only thing on it is
              * centred in the whole of it rather than in the top half.
              *
              * It waits a third of a second before appearing: below that a
              * person reads the pause as the interface being quick, and a
              * loader in that window makes a fast load feel slow.
              *
              * And it LEAVES rather than vanishes. Laid over the card, it
              * stays for a beat after the page has arrived and fades out
              * across it while the page rises in underneath — the swap used
              * to happen in one frame, which is the cut that read as cheap.
              */}
            {(canvasBusy || canvasLoaderLingers) && (
              <div
                className="wb-canvas-loader absolute inset-0 z-10 flex items-center justify-center bg-white"
                data-leaving={!canvasBusy}
                aria-hidden={!canvasBusy}
              >
                {showCanvasLoader && (
                  <BuilderLoader
                    className="wb-loading-line"
                    tone="light"
                    lines={
                      loading
                        ? ["Loading the editor", "Fetching your sections", "Just a moment"]
                        : ["Loading the page", "Just a moment"]
                    }
                  />
                )}
              </div>
            )}

            {!canvasBusy && (
              /* Keyed by the page, so each page arrives with the rise-in and
                 a re-render of the same page does not. */
              <div key={currentPage} className="wb-canvas-in flex w-full flex-1 flex-col">
              {/**
               * THE SAME PAGE THE STOREFRONT RENDERS.
               *
               * The canvas used to assemble a page of its own: its own
               * announcement bar, its own header-first-footer-last rule, its
               * own wrapper — and it applied neither the theme's background
               * colour nor its body font, both of which the published page
               * did. So a creator designed against a white page in Inter and
               * published something else.
               *
               * ThemePage owns chrome, ordering and the theme's own CSS. What
               * stays here is the only thing that is genuinely the editor's:
               * how a section is rendered, with selection, hovering and the
               * device mode on it.
               */}
              <EditorCanvasPage
                theme={activeThemeSettings}
                sections={sections}
                inspectorEnabled={inspectorEnabled}
                selectedSectionId={selectedSectionId}
                device={device}
                bodyCount={bodyCount}
                onSelectSection={selectSectionFromCanvas}
                onAddSection={openAddSection}
                onEditorNavigate={handleEditorNavigate}
              />
              </div>
            )}
            </div>
          </div>
          {!isMobileView && <CanvasScrollbar targetId="wb-preview-root" />}
          {/* end of the rounded clipping wrapper */}
          </div>
          {/* The selected section's own toolbar, over the canvas. Only with
              the inspector on: with it off the canvas is a plain preview and
              nothing in it is selectable. */}
          {inspectorEnabled && !isMobileView && previewMode === "preview" && (() => {
            const body = sections.filter((x) => x.type !== "header" && x.type !== "footer")
            const idx = body.findIndex((x) => x.id === selectedSectionId)
            const current = sections.find((x) => x.id === selectedSectionId)
            if (!current) return null
            const chrome = current.type === "header" || current.type === "footer"
            return (
              <SectionToolbar
                sectionId={selectedSectionId}
                hidden={!!current.hidden}
                isChrome={chrome}
                canMoveUp={idx > 0}
                canMoveDown={idx > -1 && idx < body.length - 1}
                onMoveUp={() => selectedSectionId && moveSectionBy(selectedSectionId, -1)}
                onMoveDown={() => selectedSectionId && moveSectionBy(selectedSectionId, 1)}
                onDuplicate={() => selectedSectionId && duplicateSection(selectedSectionId)}
                onToggleHide={() => selectedSectionId && toggleSectionHidden(selectedSectionId)}
                onRemove={() => selectedSectionId && removeSection(selectedSectionId)}
              />
            )
          })()}
        </main>
      </div>

      {/* ── Add Section Modal ── */}
      <AddSectionModal
        open={addSectionOpen}
        onOpenChange={(o) => {
          setAddSectionOpen(o)
          if (!o) setPendingInsertIndex(null)
        }}
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
              className="bg-foreground text-background hover:bg-foreground/90 min-w-[70px]"
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
              className="bg-foreground text-background hover:bg-foreground/90"
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

// ── Insert-between-sections divider ──────────────────────────
// A 16px tall hover target that reveals a thin line + plus button
// exactly between two sections. Clicking it opens the Add Section
// library with the insert position pre-set.
function InsertSectionDivider({ onClick }: { onClick: () => void }) {
  /**
   * ===========================================================================
   *  WHY THIS STOPPED FLICKERING
   * ===========================================================================
   * It was `h-3 -my-1` holding a 20px pill. Two separate problems, both
   * producing the same symptom — a list that jumps and flashes as the cursor
   * moves down it.
   *
   *   THE NEGATIVE MARGIN made every divider overlap the rows above and below
   *   it, so a few pixels of every row belonged to two hover targets at once.
   *   Moving down the list crossed those zones repeatedly and the hover states
   *   fought over which was active.
   *
   *   THE PILL WAS BIGGER THAN ITS STRIP — 20px inside 12px — so it stuck out
   *   into the rows and took the pointer with it, and `group-hover:scale`
   *   moved that boundary again while the cursor sat on it.
   *
   * Now: no negative margin, so the strip owns its own space; the pill does
   * not take the pointer at all, so the strip is the only hover target there
   * is; and nothing under the cursor changes size.
   */
  return (
    <div
      className="group relative flex h-2.5 cursor-pointer select-none items-center justify-center"
      onClick={onClick}
    >
      {/* Always drawn, faintly. A list of rows with nothing between them
          reads as one block of text on a phone, where there is no cursor to
          reveal a hover line — which is what made this list look unfinished.
          It brightens under a pointer, where the strip is also a target. */}
      <div className="pointer-events-none absolute inset-x-2 h-px bg-border/50 transition-colors duration-150 group-hover:bg-foreground/50" />
      <div className="pointer-events-none relative z-10 flex h-4 w-4 items-center justify-center rounded-full border border-border bg-background opacity-0 shadow-sm transition-opacity duration-150 group-hover:opacity-100">
        <Plus className="h-2.5 w-2.5 text-foreground" strokeWidth={2.5} />
      </div>
    </div>
  )
}


// ── Sortable wrapper for drag-and-drop ───────────────────────
function SortableSectionRow(props: Parameters<typeof SidebarSectionRow>[0]) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.section.id })
  /**
   * While this row is in the air the overlay is drawing it, so what is left
   * here is the gap it came out of. It was drawn at half opacity, which is
   * a second, ghostly copy of the row sliding around under the real one.
   *
   * The rows that are NOT being dragged are the ones that animate, and they
   * are hinted for it only while a drag is actually happening: a permanent
   * `will-change` on every row in a long list is a permanent layer for every
   * row in a long list.
   */
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
    willChange: transform ? "transform" : undefined,
  }
  return (
    <div ref={setNodeRef} style={style}>
      <SidebarSectionRow {...props} dragHandleProps={{ ...attributes, ...listeners }} />
    </div>
  )
}

/**
 * ===========================================================================
 *  THE SELECTED SECTION'S OWN TOOLBAR
 * ===========================================================================
 *
 * Selecting a section in the canvas told you it was selected and then made
 * you go back to the sidebar to do anything about it. This is the handful of
 * things you actually want at that moment, next to the thing itself: move it
 * up, move it down, duplicate it, hide it, delete it.
 *
 * POSITIONED BY MEASUREMENT, NOT BY NESTING. Putting it inside the section
 * would mean threading five callbacks through every one of forty renderers,
 * and it would inherit the theme's own font, colour and stacking. So it
 * lives in the canvas and reads the section's rectangle: top-right of the
 * section, pushed down when the section starts above the fold so it never
 * scrolls out of reach, and hidden entirely when the section has scrolled
 * past.
 */
/** How long the section toolbar takes to arrive, and to leave. */
const TOOLBAR_FADE_MS = 200

function SectionToolbar({
  sectionId,
  hidden,
  canMoveUp,
  canMoveDown,
  isChrome,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onToggleHide,
  onRemove,
}: {
  sectionId: string | null
  hidden: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  /** The header and the footer cannot be reordered or removed. */
  isChrome: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  onDuplicate: () => void
  onToggleHide: () => void
  onRemove: () => void
}) {
  const [box, setBox] = useState<{ top: number; right: number } | null>(null)
  /**
   * =====================================================================
   *  IT ARRIVES AND LEAVES, RATHER THAN BLINKING
   * =====================================================================
   * This returned `null` the moment it had nowhere to point, so selecting a
   * section put the toolbar on screen in one frame and scrolling it out of
   * view took it away in one — a hard cut both ways, on the one piece of
   * chrome that follows the pointer around.
   *
   * An element removed from the tree cannot animate its departure, so it
   * stays mounted for the length of the fade and is unmounted after. Three
   * pieces of state, because they answer three different questions: where to
   * draw it, whether it is in the tree, and whether it is faded in.
   */
  const lastBox = useRef<{ top: number; right: number } | null>(null)
  if (box) lastBox.current = box
  const present = box !== null
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (present) {
      setMounted(true)
      return
    }
    setVisible(false)
    const id = window.setTimeout(() => setMounted(false), TOOLBAR_FADE_MS)
    return () => window.clearTimeout(id)
  }, [present])

  /**
   * Faded in on the frame AFTER it is in the tree. Setting the final state
   * in the same commit that mounts it gives the browser one computed style
   * and nothing to interpolate from, which is the cut this exists to remove.
   */
  useEffect(() => {
    if (!mounted || !present) return
    const id = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(id)
  }, [mounted, present])

  useEffect(() => {
    if (!sectionId) {
      setBox(null)
      return
    }
    const scroller = document.getElementById("wb-preview-root")
    if (!scroller) return

    let frame = 0
    const measure = () => {
      frame = 0
      const el = document.getElementById(`wb-section-${sectionId}`)
      if (!el) {
        setBox(null)
        return
      }
      const s = scroller.getBoundingClientRect()
      const r = el.getBoundingClientRect()
      // Gone past, above or below: nothing to point at.
      if (r.bottom < s.top + 8 || r.top > s.bottom - 8) {
        setBox(null)
        return
      }
      const top = Math.max(r.top + 10, s.top + 10)
      setBox({ top: top - s.top, right: s.right - r.right + 10 })
    }
    // Coalesced into a frame: a scroll fires far more often than the screen
    // is painted, and a measurement per event is a measurement thrown away.
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure)
    }
    measure()
    scroller.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onScroll)
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(onScroll) : null
    ro?.observe(scroller)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      scroller.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
      ro?.disconnect()
    }
  }, [sectionId])

  /**
   * The last place it was, so a toolbar on its way out has somewhere to
   * fade FROM. While it is visible this is simply where it is now.
   */
  const draw = box ?? lastBox.current
  if (!mounted || !draw) return null

  const Item = ({
    label,
    onClick,
    disabled,
    children,
  }: {
    label: string
    onClick: () => void
    disabled?: boolean
    children: React.ReactNode
  }) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation()
            onClick()
          }}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg transition-[background-color,color,scale] duration-150",
            "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 active:scale-90",
            "disabled:pointer-events-none disabled:opacity-30",
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )

  return (
    <div
      // Above the sections (9998) and the badge (9999), below the editor's
      // own chrome. It belongs to the editor, not to the page.
      className={cn(
        "wb-section-toolbar absolute z-[60] flex items-center gap-0.5 rounded-xl border border-neutral-200/80 bg-white/95 p-1 shadow-[0_8px_28px_-10px_rgba(15,23,42,0.35)] backdrop-blur",
        /**
         * Opacity and transform only, and NOT `top`. It tracks its section
         * on every scrolled frame, so a transition on the position would
         * make it swim along behind the page it is pointing at. What
         * animates is its arrival: a few pixels down and a hair small, on
         * the curve a thrown thing settles on.
         */
        /**
         * `translate` and `scale`, NOT `transform`. Tailwind v4 compiles
         * `-translate-y-1` and `scale-[0.97]` to the standalone `translate:`
         * and `scale:` properties, so a transition naming `transform`
         * transitions nothing at all and the movement snaps while the fade
         * runs. Measured: with `transform` named, changing the class starts
         * one transition; with these named, three.
         */
        "transition-[opacity,translate,scale] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
        visible
          ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
          : // Deaf while it leaves: a toolbar nobody can see is not a
            // toolbar anybody should be able to press.
            "pointer-events-none -translate-y-1 scale-[0.97] opacity-0",
      )}
      style={{ top: draw.top, right: draw.right }}
      onClick={(e) => e.stopPropagation()}
    >
      {!isChrome && (
        <>
          <Item label="Move up" onClick={onMoveUp} disabled={!canMoveUp}>
            <ArrowUp className="h-4 w-4" strokeWidth={1.75} />
          </Item>
          <Item label="Move down" onClick={onMoveDown} disabled={!canMoveDown}>
            <ArrowDown className="h-4 w-4" strokeWidth={1.75} />
          </Item>
          <span aria-hidden className="mx-0.5 h-5 w-px bg-neutral-200" />
          <Item label="Duplicate" onClick={onDuplicate}>
            <Copy className="h-4 w-4" strokeWidth={1.75} />
          </Item>
        </>
      )}
      <Item label={hidden ? "Show" : "Hide"} onClick={onToggleHide}>
        {hidden ? <Eye className="h-4 w-4" strokeWidth={1.75} /> : <EyeOff className="h-4 w-4" strokeWidth={1.75} />}
      </Item>
      {!isChrome && (
        <Item label="Delete" onClick={onRemove}>
          <Trash2 className="h-4 w-4" strokeWidth={1.75} />
        </Item>
      )}
    </div>
  )
}

/**
 * ===========================================================================
 *  THE CANVAS, AND WHY IT IS ITS OWN COMPONENT
 * ===========================================================================
 *
 * Everything below this line used to be written inline in the editor's
 * render, which meant every one of the site's sections was re-rendered
 * whenever ANY of the editor's state changed. The editor has a great deal of
 * state that has nothing to do with the page: a toast, the publish sheet, the
 * width of the sidebar, which row the pointer is over, where the section
 * toolbar has measured itself to on the last scroll frame. A long page is
 * thirty or forty section renderers, several of them carousels and grids, so
 * on a mid-range phone that is thirty or forty renders of real work to move
 * a toolbar four pixels.
 *
 * Extracted and memoised, it re-renders when the page it is drawing changes
 * and not before. It is a component with props rather than a `useMemo` with a
 * dependency array on purpose: a prop this needs and does not get is a
 * compile error, where a missing dependency is a canvas that quietly stops
 * updating.
 *
 * The callbacks are the whole reason it works, so they must be stable in the
 * parent. `onSelectSection` and `onAddSection` take no closure over a
 * section; they are given the id.
 */
const EditorCanvasPage = memo(function EditorCanvasPage({
  theme,
  sections,
  inspectorEnabled,
  selectedSectionId,
  device,
  bodyCount,
  onSelectSection,
  onAddSection,
  onEditorNavigate,
}: {
  theme: ThemeSettingsValues
  sections: SectionInstance[]
  inspectorEnabled: boolean
  selectedSectionId: string | null
  device: DeviceMode
  bodyCount: number
  onSelectSection: (sectionId: string) => void
  onAddSection: () => void
  onEditorNavigate: (href: string) => void
}) {
  return (
    <ThemePage
      theme={theme}
      sections={sections}
      /**
       * `atTop` says whether this header has any chrome above it.
       * ThemePage answers that because ThemePage draws the chrome;
       * reading the theme's own flags from here is how the
       * announcement bar came to exist in four places at once.
       */
      renderSection={(section, role, atTop) => {
        const shared = {
          section,
          theme,
          // TRUE whether or not the Inspector is on — it tells a
          // section "you are inside the canvas card, use the
          // editor-scoped sticky mode". `isEditing` flips with the
          // toggle; this does not, which is what kept the header
          // from going `position: fixed` over the editor chrome.
          insideEditor: true,
          isEditing: inspectorEnabled,
          isSelected: inspectorEnabled && selectedSectionId === section.id,
          onClick: inspectorEnabled ? () => onSelectSection(section.id) : undefined,
          deviceMode: device,
          onEditorNavigate,
        }

        // The header takes `wrapperId` rather than sitting in a
        // wrapping div: the id has to land on the SectionWrapper's
        // own root, or `position: sticky` gets a containing block
        // exactly the header's height and never sticks.
        if (role === "header") {
          return (
            <SectionRenderer
              key={section.id}
              wrapperId={`wb-section-${section.id}`}
              {...shared}
              /**
               * Only when the header IS the top of the card. With an
               * announcement bar above it the header is a square band
               * in the middle of the page, and rounding its selection
               * ring there curves the corners of nothing — which is
               * the ring that looked arbitrary.
               */
              canvasRoundedTopPx={atTop ? (device === "desktop" ? 12 : 16) : undefined}
            />
          )
        }

        return (
          <div key={section.id} id={`wb-section-${section.id}`}>
            <SectionRenderer
              {...shared}
              canvasRoundedBottomPx={
                role === "footer" && device !== "desktop" ? 16 : undefined
              }
            />
          </div>
        )
      }}
    >
      {bodyCount === 0 && sections.length > 0 && (
        <div className="py-24 flex items-center justify-center text-center">
          <div>
            <p className="text-xl font-bold tracking-tight text-neutral-300 uppercase mb-1">Empty Page</p>
            <p className="text-sm text-neutral-400 mb-4">Create your beautiful page by adding sections</p>
            <button className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-foreground border border-border rounded-lg hover:bg-muted transition-colors" onClick={onAddSection}>
              <Plus className="h-4 w-4" />
              Add a section
            </button>
          </div>
        </div>
      )}
    </ThemePage>
  )
})

// ── Sidebar section row ──────────────────────────────────────
function SidebarSectionRow({
  section,
  isSelected,
  onSelect,
  onToggleHide,
  onDuplicate,
  onRemove,
  isStructure = false,
  structureRole,
  dragHandleProps,
}: {
  section: SectionInstance
  isSelected: boolean
  onSelect: () => void
  onToggleHide: () => void
  onDuplicate: () => void
  onRemove: () => void
  isStructure?: boolean
  /** Which piece of chrome this is, so it can carry its own icon. */
  structureRole?: "header" | "footer"
  dragHandleProps?: Record<string, unknown>
}) {
  const [contextMenuOpen, setContextMenuOpen] = useState(false)
  const rowRef = useRef<HTMLDivElement>(null)

  return (
    <div className="relative" ref={rowRef}>
      <div
        className={cn(
          "group flex items-center gap-2 px-2.5 py-2.5 rounded-lg cursor-pointer transition-colors",
          isSelected ? "bg-foreground text-background" : "hover:bg-muted text-foreground",
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
          /**
           * The grip, always drawn. A handle that only appears under the
           * pointer is a handle nobody knows is there until they happen to
           * pass over it, and the whole point of a grip is that the list
           * looks reorderable at rest. The target is a 28px square rather
           * than the 14px glyph, because a handle you have to aim at is a
           * handle people give up on, and the grab cursor lives on it alone.
           */
          <span
            {...(dragHandleProps ?? {})}
            aria-label={`Drag ${section.name} to reorder`}
            className={cn(
              "-ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md touch-none",
              "cursor-grab active:cursor-grabbing transition-colors",
              isSelected ? "hover:bg-white/20" : "hover:bg-muted-foreground/10",
            )}
            onClick={e => e.stopPropagation()}
          >
            <GripVertical
              className={cn("h-4 w-4 transition-opacity", isSelected ? "opacity-70" : "opacity-40 group-hover:opacity-70")}
              strokeWidth={1.75}
            />
          </span>
        )}
        {/* The header and the footer are chrome, and chrome gets a badge so
            they are not mistaken for sections: a dark tile with the piece
            drawn on it. It was quietened to grey for one round on the
            argument that two black squares are the loudest thing in a white
            list; the owner asked for the black back, and they are right that
            loud is the point here. These two rows are the only ones in the
            list that cannot be moved, duplicated or deleted, and the badge
            is what says so before you try. */}
        {isStructure && structureRole && (
          <span
            aria-hidden
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
              isSelected ? "bg-white/15 text-white" : "bg-neutral-800 text-white",
            )}
          >
            {structureRole === "header" ? (
              <PanelTop className="h-4 w-4" strokeWidth={1.75} />
            ) : (
              <PanelBottom className="h-4 w-4" strokeWidth={1.75} />
            )}
          </span>
        )}
        <span className="flex-1 text-sm font-medium truncate">{section.name}</span>

        {/**
         * ===================================================================
         *  THE EYE IS A BUTTON, AND FOR THE HEADER IT IS THE ONLY ONE
         * ===================================================================
         * This was a static icon: a row that had been hidden said so and gave
         * you nothing to do about it. For an ordinary section that was merely
         * a detour, since the three dots beside it carry Show. For the header
         * and the footer it was a dead end — they are chrome, so they have no
         * three dots, and their settings panel is a bespoke one with no
         * Hide/Show in it. Hiding the header was therefore a one-way door:
         * the row greyed out, the site lost its header, and there was no
         * control anywhere in the editor to bring it back.
         *
         * So the eye toggles. It is drawn at rest whenever the row is hidden,
         * because that is the row that needs a way out, and under the pointer
         * on the header and the footer, which have nothing else.
         */}
        {(section.hidden || isStructure) && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={section.hidden ? `Show ${section.name}` : `Hide ${section.name}`}
                aria-pressed={section.hidden}
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleHide()
                }}
                className={cn(
                  "h-6 w-6 shrink-0 rounded-md flex items-center justify-center",
                  // `scale`, not `transform`: Tailwind v4 compiles `scale-90`
                  // to the standalone `scale` property, so a transition naming
                  // `transform` animates nothing and the press just snaps.
                  "transition-[opacity,background-color,scale] duration-150 active:scale-90",
                  section.hidden || isSelected
                    ? "opacity-100"
                    : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
                  isSelected ? "hover:bg-white/20" : "hover:bg-muted-foreground/10",
                )}
              >
                {section.hidden ? (
                  <EyeOff className="h-3.5 w-3.5" strokeWidth={1.75} />
                ) : (
                  <Eye className="h-3.5 w-3.5" strokeWidth={1.75} />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{section.hidden ? "Show" : "Hide"}</TooltipContent>
          </Tooltip>
        )}

        {/* One button under the pointer, and the choices in a menu, rather
            than an eye and a bin sitting on every row you pass. The menu is
            the same one a right-click opens. */}
        {!isStructure && (
          /* The three dots ARE the menu's trigger, so opening and closing is
             the dropdown's own business: a button that toggled state by hand
             reopened on the same click that had just closed it, because the
             pointer-down outside closes before the click lands. A right-click
             on the row opens the same menu. */
          <DropdownMenu open={contextMenuOpen} onOpenChange={setContextMenuOpen}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`Options for ${section.name}`}
                className={cn(
                  "h-6 w-6 shrink-0 rounded-md flex items-center justify-center transition-[opacity,background-color] duration-150",
                  // Under the pointer only. The grip is drawn at rest because
                  // it says the list can be reordered; a column of menu
                  // buttons says nothing and is six more marks on the page.
                  isSelected || contextMenuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
                  isSelected ? "hover:bg-white/20" : "hover:bg-muted-foreground/10",
                )}
                onClick={e => e.stopPropagation()}
              >
                <MoreHorizontal className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </DropdownMenuTrigger>
            {/* The app's own dropdown, the one every other menu on the page
                is, not a hand-drawn card. Delete is a row like the others: a
                red row shouts at somebody who has not decided anything yet,
                and Undo takes a deletion back in one keystroke. */}
            <DropdownMenuContent align="end" sideOffset={4} className="w-44" onClick={e => e.stopPropagation()}>
              <DropdownMenuItem
                className="cursor-pointer hover:bg-neutral-100 focus:bg-neutral-100 data-[highlighted]:bg-neutral-100"
                onClick={() => onDuplicate()}
              >
                <Copy className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer hover:bg-neutral-100 focus:bg-neutral-100 data-[highlighted]:bg-neutral-100"
                onClick={() => onToggleHide()}
              >
                {section.hidden ? (
                  <Eye className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
                ) : (
                  <EyeOff className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
                )}
                {section.hidden ? "Show" : "Hide"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="cursor-pointer hover:bg-neutral-100 focus:bg-neutral-100 data-[highlighted]:bg-neutral-100"
                onClick={() => onRemove()}
              >
                <Trash2 className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

    </div>
  )
}
