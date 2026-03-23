"use client"

// ============================================================
// Storelib Theme Engine — Section Renderer
// Renders a SectionInstance using its registered React component.
// All sections receive: settings (their config), blocks, themeSettings.
// ============================================================

import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"
import {
  Zap, Shield, Star, CheckCircle, Download, Heart, Globe, Lock,
  RefreshCw, Rocket, ChevronDown, ChevronUp,
  Share2, Package, FileText, Eye,
} from "lucide-react"
import { useState, useEffect, CSSProperties } from "react"
import { cn } from "@/lib/utils"

interface SectionProps {
  section: SectionInstance
  theme: ThemeSettingsValues
  isEditing?: boolean
  isSelected?: boolean
  onClick?: () => void
}

// ── Utility ──────────────────────────────────────────────────

function str(v: unknown, fallback = ""): string {
  if (typeof v === "string") return v
  if (typeof v === "number") return String(v)
  return fallback
}

function bool(v: unknown, fallback = false): boolean {
  return typeof v === "boolean" ? v : fallback
}

const ICON_MAP: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  zap: Zap,
  shield: Shield,
  star: Star,
  "check-circle": CheckCircle,
  download: Download,
  heart: Heart,
  globe: Globe,
  lock: Lock,
  "refresh-cw": RefreshCw,
  rocket: Rocket,
}

function DynamicIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICON_MAP[name] ?? Zap
  return <Icon className={className} strokeWidth={1.5} />
}

function buttonRadiusStyle(theme: ThemeSettingsValues): CSSProperties {
  const style = theme.button_style ?? "rounded"
  const r = theme.border_radius ?? 8
  if (style === "pill") return { borderRadius: "9999px" }
  if (style === "square") return { borderRadius: "4px" }
  return { borderRadius: `${r}px` }
}

function SectionWrapper({
  children,
  bgColor,
  isEditing,
  isSelected,
  onClick,
  className,
}: {
  children: React.ReactNode
  bgColor?: string
  isEditing?: boolean
  isSelected?: boolean
  onClick?: () => void
  className?: string
}) {
  return (
    <div
      className={cn(
        "relative w-full transition-all",
        isEditing && "cursor-pointer",
        isEditing && !isSelected && "hover:ring-2 hover:ring-blue-400/50 hover:ring-inset",
        isEditing && isSelected && "ring-2 ring-blue-500 ring-inset",
        className,
      )}
      style={{ background: bgColor }}
      onClick={onClick}
    >
      {isEditing && isSelected && (
        <div className="absolute top-0 left-0 bg-blue-500 text-white text-[10px] font-bold px-2 py-0.5 z-50 rounded-br">
          Selected
        </div>
      )}
      {children}
    </div>
  )
}

// ── Section components ────────────────────────────────────────

function HeaderSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const bg = str(s.bg_color, "#ffffff")
  const textColor = str(s.text_color, "#0f172a")

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div
        className="w-full px-6 py-3 flex items-center justify-between border-b"
        style={{ borderColor: theme.border_color ?? "#e2e8f0" }}
      >
        <div className="flex items-center gap-2">
          {s.logo_url ? (
            <>
              <img
                src={str(s.logo_url)}
                alt={str(s.logo_text, theme.brand_name ?? "Logo")}
                className="object-contain hidden md:block"
                style={{ height: `${Number(s.logo_height) || 40}px` }}
                loading="eager"
                decoding="async"
                fetchPriority="high"
              />
              <img
                src={s.use_mobile_logo && s.mobile_logo_url ? str(s.mobile_logo_url) : str(s.logo_url)}
                alt={str(s.logo_text, theme.brand_name ?? "Logo")}
                className="object-contain md:hidden"
                style={{ height: `${s.use_mobile_logo && s.mobile_logo_url ? (Number(s.mobile_logo_height) || 32) : (Number(s.logo_height) || 40)}px` }}
                loading="eager"
                decoding="async"
                fetchPriority="high"
              />
            </>
          ) : (
            <span className="text-[15px] font-bold" style={{ color: textColor, fontFamily: str(s.logo_font, "inherit") }}>
              {str(s.logo_text, theme.brand_name ?? "My Store")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          {section.blocks?.slice(0, 4).map(block => (
            <a
              key={block.id}
              href={str(block.settings.url, "#")}
              className="text-[13px] font-medium opacity-70 hover:opacity-100"
              style={{ color: textColor }}
            >
              {str(block.settings.label)}
            </a>
          ))}
          {!!s.cta_text && (
            <a
              href={str(s.cta_url, "#")}
              className="px-3 py-1.5 text-[13px] font-semibold text-white"
              style={{ background: theme.primary_color ?? "#6366f1", ...buttonRadiusStyle(theme) }}
            >
              {str(s.cta_text)}
            </a>
          )}
        </div>
      </div>
    </SectionWrapper>
  )
}

function HeroSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const bg = str(s.bg_color, "#0f172a")
  const textColor = str(s.text_color, "#ffffff")
  const layout = str(s.layout, "center")
  const fullHeight = bool(s.full_height)
  const ctaStyle = str(s.cta_style, "primary")

  const alignClass = layout === "center" ? "items-center text-center" : layout === "right" ? "items-end text-right" : "items-start text-left"

  const ctaStyles: CSSProperties = ctaStyle === "primary"
    ? { background: theme.primary_color ?? "#6366f1", color: "#fff", ...buttonRadiusStyle(theme) }
    : ctaStyle === "outline"
    ? { border: `2px solid ${textColor}`, color: textColor, background: "transparent", ...buttonRadiusStyle(theme) }
    : ctaStyle === "ghost"
    ? { color: textColor, background: "transparent", ...buttonRadiusStyle(theme) }
    : { background: theme.secondary_color ?? "#8b5cf6", color: "#fff", ...buttonRadiusStyle(theme) }

  return (
    <SectionWrapper
      bgColor={s.image_url ? undefined : bg}
      isEditing={isEditing}
      isSelected={isSelected}
      onClick={onClick}
      className={cn(fullHeight ? "min-h-[80vh]" : "py-20")}
    >
      {!!s.image_url && (
        <div className="absolute inset-0">
          <img src={str(s.image_url)} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
          <div
            className="absolute inset-0"
            style={{ background: bg, opacity: (Number(s.overlay_opacity ?? 40)) / 100 }}
          />
        </div>
      )}
      <div
        className={cn("relative z-10 flex flex-col gap-5 px-8 justify-center max-w-[1280px] mx-auto w-full", alignClass, fullHeight ? "min-h-[80vh]" : "")}
      >
        {!!s.heading && (
          <h1
            className="text-4xl sm:text-5xl font-bold leading-tight max-w-3xl"
            style={{ color: textColor, fontFamily: theme.font_heading ?? "Inter" }}
          >
            {str(s.heading)}
          </h1>
        )}
        {!!s.subheading && (
          <p className="text-lg max-w-xl opacity-80" style={{ color: textColor }}>
            {str(s.subheading)}
          </p>
        )}
        {!!s.cta_text && (
          <div>
            <a
              href={str(s.cta_url, "#")}
              className="inline-block px-6 py-3 text-[15px] font-semibold transition-opacity hover:opacity-90"
              style={ctaStyles}
            >
              {str(s.cta_text)}
            </a>
          </div>
        )}
      </div>
    </SectionWrapper>
  )
}

function RichTextSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const bg = str(s.bg_color, "#ffffff")
  const textColor = str(s.text_color, "#0f172a")
  const align = str(s.alignment, "left")
  const maxWidthMap: Record<string, string> = { narrow: "max-w-xl", medium: "max-w-2xl", wide: "max-w-4xl", full: "max-w-none" }
  const mw = maxWidthMap[str(s.max_width, "medium")] ?? "max-w-2xl"

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className={cn("px-8 py-16 mx-auto", mw === "max-w-none" ? "max-w-[1280px]" : mw)} style={{ textAlign: align as any }}>
        {!!s.heading && (
          <h2 className="text-3xl font-bold mb-4" style={{ color: textColor, fontFamily: theme.font_heading }}>
            {str(s.heading)}
          </h2>
        )}
        {!!s.body && (
          <p className="text-lg leading-relaxed opacity-80" style={{ color: textColor }}>
            {str(s.body)}
          </p>
        )}
      </div>
    </SectionWrapper>
  )
}

function ImageBannerSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const aspectMap: Record<string, string> = { "16:9": "aspect-video", "3:1": "aspect-[3/1]", "4:3": "aspect-[4/3]", auto: "" }
  const aspect = aspectMap[str(s.aspect_ratio, "16:9")] ?? "aspect-video"
  const textColor = str(s.text_color, "#ffffff")

  return (
    <SectionWrapper isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className={cn("relative w-full overflow-hidden bg-neutral-200", aspect)}>
        {s.image_url ? (
          <img src={str(s.image_url)} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-neutral-300 to-neutral-400 flex items-center justify-center">
            <span className="text-neutral-500 text-sm">Add an image</span>
          </div>
        )}
        {!!(s.heading || s.subheading) && (
          <>
            <div className="absolute inset-0" style={{ background: "#000", opacity: (Number(s.overlay_opacity ?? 30)) / 100 }} />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center">
              {!!s.heading && <h2 className="text-3xl font-bold" style={{ color: textColor }}>{str(s.heading)}</h2>}
              {!!s.subheading && <p className="text-lg opacity-80" style={{ color: textColor }}>{str(s.subheading)}</p>}
            </div>
          </>
        )}
      </div>
    </SectionWrapper>
  )
}

function ProductListSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const bg = str(s.bg_color, "#ffffff")
  const textColor = str(s.text_color, "#0f172a")
  const cols = str(s.columns, "3")
  const colClass: Record<string, string> = { "2": "grid-cols-2", "3": "grid-cols-3", "4": "grid-cols-4" }

  // Placeholder products
  const placeholders = Array.from({ length: parseInt(cols, 10) }, (_, i) => ({
    id: i,
    name: ["Digital Template Pack", "Course Bundle", "Icon Set Pro"][i % 3],
    price: ["$29", "$99", "$49"][i % 3],
    img: null,
  }))

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className="px-8 py-16 max-w-[1280px] mx-auto">
        {!!s.heading && (
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold mb-2" style={{ color: textColor, fontFamily: theme.font_heading }}>{str(s.heading)}</h2>
            {!!s.subheading && <p className="text-base opacity-70" style={{ color: textColor }}>{str(s.subheading)}</p>}
          </div>
        )}
        <div className={cn("grid gap-6", colClass[cols] ?? "grid-cols-3")}>
          {placeholders.map(p => (
            <div key={p.id} className="rounded-xl overflow-hidden border" style={{ borderColor: theme.border_color ?? "#e2e8f0", background: theme.surface_color ?? "#f8fafc" }}>
              <div className="aspect-[4/3] bg-gradient-to-br from-neutral-200 to-neutral-300 flex items-center justify-center">
                <span className="text-neutral-400 text-xs">Product image</span>
              </div>
              <div className="p-4">
                <div className="font-semibold text-[14px] mb-1" style={{ color: textColor }}>{p.name}</div>
                {bool(s.show_price) && <div className="text-[13px] font-bold" style={{ color: theme.primary_color ?? "#6366f1" }}>{p.price}</div>}
                {bool(s.show_button) && (
                  <button
                    className="mt-3 w-full py-1.5 text-[13px] font-semibold text-white"
                    style={{ background: theme.primary_color ?? "#6366f1", ...buttonRadiusStyle(theme) }}
                  >
                    Buy now
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </SectionWrapper>
  )
}

function TestimonialsSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const bg = str(s.bg_color, "#f8fafc")
  const textColor = str(s.text_color, "#0f172a")
  const blocks = section.blocks ?? []

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className="px-8 py-16 max-w-[1280px] mx-auto">
        {!!s.heading && (
          <h2 className="text-3xl font-bold text-center mb-10" style={{ color: textColor, fontFamily: theme.font_heading }}>
            {str(s.heading)}
          </h2>
        )}
        {blocks.length === 0 ? (
          <p className="text-center text-sm opacity-40" style={{ color: textColor }}>Add testimonial blocks in the sidebar</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {blocks.map(block => (
              <div key={block.id} className="rounded-xl p-6 border" style={{ background: "#fff", borderColor: theme.border_color ?? "#e2e8f0" }}>
                <p className="text-[14px] leading-relaxed mb-4 opacity-80" style={{ color: textColor }}>
                  "{str(block.settings.quote)}"
                </p>
                <div className="flex items-center gap-3">
                  {block.settings.avatar_url ? (
                    <img src={str(block.settings.avatar_url)} className="h-8 w-8 rounded-full object-cover" alt="" loading="lazy" decoding="async" />
                  ) : (
                    <div className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: theme.primary_color ?? "#6366f1" }}>
                      {str(block.settings.author).charAt(0)}
                    </div>
                  )}
                  <div>
                    <div className="text-[13px] font-semibold" style={{ color: textColor }}>{str(block.settings.author)}</div>
                    <div className="text-[11px] opacity-60" style={{ color: textColor }}>{str(block.settings.role)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </SectionWrapper>
  )
}

function FaqSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const bg = str(s.bg_color, "#ffffff")
  const textColor = str(s.text_color, "#0f172a")
  const blocks = section.blocks ?? []
  const [open, setOpen] = useState<string | null>(null)

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className="max-w-2xl mx-auto px-8 py-16">
        {!!s.heading && (
          <h2 className="text-3xl font-bold text-center mb-10" style={{ color: textColor, fontFamily: theme.font_heading }}>
            {str(s.heading)}
          </h2>
        )}
        <div className="space-y-2">
          {blocks.map(block => (
            <div key={block.id} className="border rounded-lg overflow-hidden" style={{ borderColor: theme.border_color ?? "#e2e8f0" }}>
              <button
                className="w-full flex items-center justify-between px-5 py-4 text-left"
                style={{ color: textColor }}
                onClick={() => setOpen(open === block.id ? null : block.id)}
              >
                <span className="font-medium text-[14px]">{str(block.settings.question)}</span>
                {open === block.id ? <ChevronUp className="h-4 w-4 opacity-50" /> : <ChevronDown className="h-4 w-4 opacity-50" />}
              </button>
              {open === block.id && (
                <div className="px-5 pb-4 text-[14px] opacity-70" style={{ color: textColor }}>
                  {str(block.settings.answer)}
                </div>
              )}
            </div>
          ))}
          {blocks.length === 0 && (
            <p className="text-center text-sm opacity-40" style={{ color: textColor }}>Add FAQ items in the sidebar</p>
          )}
        </div>
      </div>
    </SectionWrapper>
  )
}

function CtaSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const bg = str(s.bg_color, theme.primary_color ?? "#6366f1")
  const textColor = str(s.text_color, "#ffffff")
  const btnColor = str(s.button_color, "#ffffff")

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className="px-8 py-16 text-center max-w-[1280px] mx-auto">
        {!!s.heading && (
          <h2 className="text-3xl font-bold mb-3" style={{ color: textColor, fontFamily: theme.font_heading }}>
            {str(s.heading)}
          </h2>
        )}
        {!!s.subheading && (
          <p className="text-lg opacity-80 mb-7 max-w-xl mx-auto" style={{ color: textColor }}>
            {str(s.subheading)}
          </p>
        )}
        {!!s.button_text && (
          <a
            href={str(s.button_url, "#")}
            className="inline-block px-8 py-3 text-[15px] font-semibold"
            style={{ background: btnColor, color: bg, ...buttonRadiusStyle(theme) }}
          >
            {str(s.button_text)}
          </a>
        )}
      </div>
    </SectionWrapper>
  )
}

function StatsSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const bg = str(s.bg_color, "#f8fafc")
  const textColor = str(s.text_color, "#0f172a")
  const blocks = section.blocks ?? []

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className="px-8 py-12 max-w-[1280px] mx-auto">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 text-center">
          {blocks.map(block => (
            <div key={block.id}>
              <div className="text-4xl font-bold mb-1" style={{ color: theme.primary_color ?? "#6366f1" }}>
                {str(block.settings.value)}
              </div>
              <div className="text-[13px] opacity-60" style={{ color: textColor }}>
                {str(block.settings.label)}
              </div>
            </div>
          ))}
          {blocks.length === 0 && (
            <div className="col-span-4 text-sm opacity-40 text-center" style={{ color: textColor }}>
              Add stat blocks in the sidebar
            </div>
          )}
        </div>
      </div>
    </SectionWrapper>
  )
}

function FeatureGridSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const bg = str(s.bg_color, "#ffffff")
  const textColor = str(s.text_color, "#0f172a")
  const cols = str(s.columns, "3")
  const colClass: Record<string, string> = { "2": "grid-cols-2", "3": "grid-cols-3", "4": "grid-cols-4" }
  const blocks = section.blocks ?? []

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className="px-8 py-16 max-w-[1280px] mx-auto">
        {!!(s.heading || s.subheading) && (
          <div className="text-center mb-10">
            {!!s.heading && <h2 className="text-3xl font-bold mb-2" style={{ color: textColor, fontFamily: theme.font_heading }}>{str(s.heading)}</h2>}
            {!!s.subheading && <p className="text-base opacity-70" style={{ color: textColor }}>{str(s.subheading)}</p>}
          </div>
        )}
        {blocks.length === 0 ? (
          <p className="text-center text-sm opacity-40" style={{ color: textColor }}>Add feature blocks in the sidebar</p>
        ) : (
          <div className={cn("grid gap-8", colClass[cols] ?? "grid-cols-3")}>
            {blocks.map(block => (
              <div key={block.id} className="flex flex-col gap-3">
                <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: theme.primary_color ?? "#6366f1", opacity: 0.15 }}>
                  <DynamicIcon name={str(block.settings.icon, "zap")} className="h-5 w-5" />
                </div>
                <div className="font-semibold text-[15px]" style={{ color: textColor }}>{str(block.settings.title)}</div>
                <div className="text-[13px] opacity-70 leading-relaxed" style={{ color: textColor }}>{str(block.settings.description)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </SectionWrapper>
  )
}

function PricingSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const bg = str(s.bg_color, "#ffffff")
  const textColor = str(s.text_color, "#0f172a")
  const blocks = section.blocks ?? []

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className="px-8 py-16 max-w-[1280px] mx-auto">
        <div className="text-center mb-10">
          {!!s.heading && <h2 className="text-3xl font-bold mb-2" style={{ color: textColor, fontFamily: theme.font_heading }}>{str(s.heading)}</h2>}
          {!!s.subheading && <p className="text-base opacity-70" style={{ color: textColor }}>{str(s.subheading)}</p>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {blocks.map(block => {
            const featured = bool(block.settings.is_featured)
            return (
              <div
                key={block.id}
                className="rounded-2xl border p-6 flex flex-col gap-4"
                style={{
                  borderColor: featured ? (theme.primary_color ?? "#6366f1") : (theme.border_color ?? "#e2e8f0"),
                  background: featured ? (theme.primary_color ?? "#6366f1") : (theme.surface_color ?? "#f8fafc"),
                }}
              >
                <div>
                  <div className="font-bold text-[15px]" style={{ color: featured ? "#fff" : textColor }}>{str(block.settings.name)}</div>
                  {!!block.settings.description && <div className="text-[12px] opacity-70 mt-0.5" style={{ color: featured ? "#fff" : textColor }}>{str(block.settings.description)}</div>}
                </div>
                <div>
                  <span className="text-3xl font-bold" style={{ color: featured ? "#fff" : textColor }}>{str(block.settings.price)}</span>
                  <span className="text-[12px] opacity-60 ml-1" style={{ color: featured ? "#fff" : textColor }}>{str(block.settings.period)}</span>
                </div>
                {!!block.settings.cta_text && (
                  <a
                    href={str(block.settings.cta_url, "#")}
                    className="text-center py-2 text-[13px] font-semibold"
                    style={{
                      background: featured ? "#fff" : (theme.primary_color ?? "#6366f1"),
                      color: featured ? (theme.primary_color ?? "#6366f1") : "#fff",
                      ...buttonRadiusStyle(theme),
                    }}
                  >
                    {str(block.settings.cta_text)}
                  </a>
                )}
              </div>
            )
          })}
          {blocks.length === 0 && (
            <div className="col-span-3 text-center text-sm opacity-40" style={{ color: textColor }}>Add pricing plan blocks in the sidebar</div>
          )}
        </div>
      </div>
    </SectionWrapper>
  )
}

function LogoBarSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const bg = str(s.bg_color, "#f8fafc")
  const blocks = section.blocks ?? []
  const grayscale = bool(s.grayscale, true)

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className="px-8 py-10 max-w-[1280px] mx-auto">
        {!!s.heading && (
          <p className="text-center text-sm font-medium opacity-50 mb-6 uppercase tracking-widest" style={{ color: theme.text_color ?? "#0f172a" }}>
            {str(s.heading)}
          </p>
        )}
        {blocks.length === 0 ? (
          <p className="text-center text-sm opacity-40" style={{ color: theme.text_color ?? "#0f172a" }}>Add logo blocks in the sidebar</p>
        ) : (
          <div className="flex flex-wrap items-center justify-center gap-8">
            {blocks.map(block => (
              <div key={block.id} className={cn("h-8", grayscale && "grayscale opacity-60")}>
                {block.settings.image_url ? (
                  <img src={str(block.settings.image_url)} alt={str(block.settings.alt)} className="h-full w-auto object-contain" loading="lazy" decoding="async" />
                ) : (
                  <div className="h-8 w-20 bg-neutral-300 rounded flex items-center justify-center text-[10px] text-neutral-500">Logo</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </SectionWrapper>
  )
}

function GallerySection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const bg = str(s.bg_color, "#ffffff")
  const cols = str(s.columns, "3")
  const colClass: Record<string, string> = { "2": "grid-cols-2", "3": "grid-cols-3", "4": "grid-cols-4" }
  const blocks = section.blocks ?? []

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className="px-8 py-16 max-w-[1280px] mx-auto">
        {!!s.heading && <h2 className="text-3xl font-bold mb-8 text-center" style={{ color: theme.text_color ?? "#0f172a", fontFamily: theme.font_heading }}>{str(s.heading)}</h2>}
        {blocks.length === 0 ? (
          <div className={cn("grid gap-4", colClass[cols] ?? "grid-cols-3")}>
            {Array.from({ length: parseInt(cols, 10) }).map((_, i) => (
              <div key={i} className="aspect-square bg-neutral-100 rounded-xl flex items-center justify-center text-xs text-neutral-400">Photo</div>
            ))}
          </div>
        ) : (
          <div className={cn("grid gap-4", colClass[cols] ?? "grid-cols-3")}>
            {blocks.map(block => (
              <div key={block.id} className="aspect-square rounded-xl overflow-hidden">
                {block.settings.image_url ? (
                  <img src={str(block.settings.image_url)} alt={str(block.settings.caption)} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                ) : (
                  <div className="w-full h-full bg-neutral-200 flex items-center justify-center text-xs text-neutral-400">Image</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </SectionWrapper>
  )
}

function FooterSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const bg = str(s.bg_color, "#0f172a")
  const textColor = str(s.text_color, "#94a3b8")
  const blocks = section.blocks ?? []

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className="px-8 py-10 flex flex-col sm:flex-row items-center justify-between gap-4 max-w-[1280px] mx-auto">
        <div>
          <div className="font-bold text-[15px] mb-1" style={{ color: "#fff" }}>
            {str(s.logo_text, theme.brand_name ?? "My Store")}
          </div>
          <div className="text-[12px]" style={{ color: textColor }}>
            {str(s.copyright, `© ${new Date().getFullYear()} My Store`)}
          </div>
        </div>
        {blocks.length > 0 && (
          <div className="flex items-center gap-4 flex-wrap">
            {blocks.map(block => (
              <a key={block.id} href={str(block.settings.url, "#")} className="text-[13px] hover:opacity-100 transition-opacity" style={{ color: textColor, opacity: 0.7 }}>
                {str(block.settings.label)}
              </a>
            ))}
          </div>
        )}
      </div>
    </SectionWrapper>
  )
}

// ── Product section (single product page) ────────────────────
function ProductSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const bg = str(s.bg_color, "#ffffff")
  const textColor = str(s.text_color, "#0f172a")
  const layout = str(s.product_layout, "two_column")
  const imageWidth = str(s.image_width, "55%")
  const colorScheme = str(s.color_scheme, "white")
  const showWishlist = bool(s.show_wishlist, true)
  const showShare = bool(s.show_share_button, true)
  const showWhatsIncluded = bool(s.show_whats_included, true)
  const [showAllFiles, setShowAllFiles] = useState(false)

  // Product data is injected via section.settings._product_data by the editor
  const productData = (s._product_data as Record<string, unknown> | undefined) ?? null

  const title = str(productData?.title as unknown, "Product Title")
  const description = str(productData?.description as unknown, "Product description will appear here. This is where you describe your product in detail, including features, benefits, and what makes it special.")
  const priceCents = typeof productData?.price_cents === "number" ? productData.price_cents : 2999
  const compareAtCents = typeof productData?.compare_at_cents === "number" ? productData.compare_at_cents : null
  const thumbnailUrl = str(productData?.thumbnail_url as unknown, "")
  const galleryUrls: string[] = Array.isArray(productData?.gallery_urls) ? (productData.gallery_urls as string[]) : []
  const whatsIncluded: string[] = Array.isArray(productData?.whats_included) ? (productData.whats_included as string[]) : []
  const files: { file_name: string; file_size: number; mime_type: string }[] = Array.isArray(productData?.files) ? (productData.files as any[]) : []

  const allImages = thumbnailUrl ? [thumbnailUrl, ...galleryUrls] : galleryUrls
  const [activeImage, setActiveImage] = useState(0)

  const formatPrice = (cents: number) => {
    const val = cents / 100
    return val % 1 === 0 ? `$${val}` : `$${val.toFixed(2)}`
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  }

  const getFileExtension = (name: string) => {
    const ext = name.split(".").pop()?.toUpperCase() ?? ""
    return ext
  }

  const isOnSale = compareAtCents && compareAtCents > priceCents
  const discount = isOnSale ? Math.round(((compareAtCents - priceCents) / compareAtCents) * 100) : 0

  // Color scheme backgrounds
  const schemeColors: Record<string, { bg: string; text: string; muted: string; surface: string; border: string }> = {
    white: { bg: "#ffffff", text: "#0f172a", muted: "#64748b", surface: "#f8fafc", border: "#e2e8f0" },
    light: { bg: "#f8fafc", text: "#0f172a", muted: "#64748b", surface: "#ffffff", border: "#e2e8f0" },
    dark: { bg: "#1e293b", text: "#f1f5f9", muted: "#94a3b8", surface: "#334155", border: "#475569" },
    black: { bg: "#0f172a", text: "#f8fafc", muted: "#94a3b8", surface: "#1e293b", border: "#334155" },
    highlight: { bg: str(theme.primary_color, "#6366f1"), text: "#ffffff", muted: "rgba(255,255,255,0.7)", surface: "rgba(255,255,255,0.1)", border: "rgba(255,255,255,0.2)" },
  }
  const scheme = schemeColors[colorScheme] ?? schemeColors.white
  const primaryColor = str(theme.primary_color, "#6366f1")

  const visibleFiles = showAllFiles ? files : files.slice(0, 4)

  return (
    <SectionWrapper bgColor={scheme.bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div
        className={cn("w-full mx-auto", layout === "one_column" ? "max-w-2xl px-6" : "max-w-[1280px] flex flex-col md:flex-row")}
        style={{ color: scheme.text, paddingTop: `${s.padding_top ?? 48}px`, paddingBottom: `${s.padding_bottom ?? 48}px` }}
      >
        {/* Image column */}
        <div
          className={cn(layout === "two_column" ? "px-6 md:px-8" : "mb-8")}
          style={layout === "two_column" ? { width: imageWidth, flexShrink: 0 } : undefined}
        >
          {allImages.length > 0 ? (
            <div>
              {/* Main image */}
              <div className="w-full overflow-hidden rounded-lg" style={{ background: scheme.surface }}>
                <img
                  src={allImages[activeImage] ?? allImages[0]}
                  alt={title}
                  className="w-full h-auto object-contain"
                  style={{ maxHeight: "600px" }}
                  loading="lazy"
                  decoding="async"
                />
              </div>
              {/* Thumbnails */}
              {allImages.length > 1 && (
                <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
                  {allImages.map((img, i) => (
                    <button
                      key={i}
                      className={cn(
                        "w-16 h-16 rounded-md overflow-hidden border-2 shrink-0 transition-all",
                        activeImage === i ? "border-current opacity-100" : "opacity-50 hover:opacity-80"
                      )}
                      style={{ borderColor: activeImage === i ? primaryColor : scheme.border }}
                      onClick={e => { e.stopPropagation(); setActiveImage(i) }}
                    >
                      <img src={img} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div
              className="w-full aspect-[4/5] rounded-lg flex items-center justify-center"
              style={{ background: scheme.surface, border: `1px solid ${scheme.border}` }}
            >
              <div className="text-center" style={{ color: scheme.muted }}>
                <Package className="h-12 w-12 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Product image</p>
              </div>
            </div>
          )}
        </div>

        {/* Content column */}
        <div className={cn("flex-1 min-w-0", layout === "two_column" ? "px-6 md:px-8 py-4" : "")}>
          {/* Sale badge */}
          {isOnSale && (
            <span
              className="inline-block px-3 py-1 text-xs font-bold text-white rounded-full mb-4"
              style={{ background: "#16a34a" }}
            >
              On Sale
            </span>
          )}

          {/* Title */}
          <h1
            className="text-2xl md:text-3xl font-bold mb-4 leading-tight"
            style={{ fontFamily: theme.font_heading, color: scheme.text }}
          >
            {title}
          </h1>

          {/* Pricing */}
          <div className="flex items-baseline gap-3 mb-6">
            {isOnSale && (
              <span className="text-lg line-through" style={{ color: scheme.muted }}>
                {formatPrice(compareAtCents)}
              </span>
            )}
            {isOnSale && (
              <span className="text-sm" style={{ color: scheme.muted }}>
                ({discount}% off)
              </span>
            )}
            <span className="text-2xl font-bold" style={{ color: scheme.text }}>
              {priceCents === 0 ? "Free" : formatPrice(priceCents)}
            </span>
          </div>

          {/* CTA Buttons */}
          <div className="space-y-3 mb-6">
            <button
              className="w-full py-3.5 text-base font-semibold border-2 rounded-lg transition-colors"
              style={{ borderColor: primaryColor, color: primaryColor, ...buttonRadiusStyle(theme) }}
            >
              Add to Cart
            </button>
            <button
              className="w-full py-3.5 text-base font-semibold text-white rounded-lg transition-colors"
              style={{ background: primaryColor, ...buttonRadiusStyle(theme) }}
            >
              Buy Now
            </button>
          </div>

          {/* Wishlist + Share */}
          <div className="flex items-center gap-4 mb-6" style={{ color: scheme.muted }}>
            {showWishlist && (
              <button className="flex items-center gap-1.5 text-sm hover:opacity-80 transition-opacity">
                <Heart className="h-4 w-4" />
                <span className="underline">Add to wishlist</span>
              </button>
            )}
            {showShare && (
              <button className="flex items-center gap-1.5 text-sm hover:opacity-80 transition-opacity">
                <Share2 className="h-4 w-4" />
                <span className="underline">Share</span>
              </button>
            )}
          </div>

          {/* Description */}
          <div className="mb-6">
            <div
              className="text-sm leading-relaxed whitespace-pre-wrap"
              style={{ color: scheme.text }}
              dangerouslySetInnerHTML={{ __html: description }}
            />
          </div>

          {/* What you'll get */}
          {showWhatsIncluded && (files.length > 0 || whatsIncluded.length > 0) && (
            <div className="mb-6 p-4 rounded-lg" style={{ background: scheme.surface, border: `1px solid ${scheme.border}` }}>
              {files.length > 0 && (
                <>
                  <p className="text-sm font-semibold mb-1" style={{ color: scheme.text }}>
                    You will get the following files:
                  </p>
                  <div className="space-y-1.5 mb-3">
                    {visibleFiles.map((f, i) => (
                      <div key={i} className="flex items-center justify-between text-sm" style={{ color: scheme.muted }}>
                        <span className="flex items-center gap-2">
                          <FileText className="h-3.5 w-3.5 shrink-0" />
                          {getFileExtension(f.file_name)} ({formatFileSize(f.file_size)})
                        </span>
                      </div>
                    ))}
                  </div>
                  {files.length > 4 && !showAllFiles && (
                    <button
                      className="text-sm font-medium underline"
                      style={{ color: primaryColor }}
                      onClick={e => { e.stopPropagation(); setShowAllFiles(true) }}
                    >
                      Show all ({files.length} files)
                    </button>
                  )}
                  {showAllFiles && files.length > 4 && (
                    <button
                      className="text-sm font-medium underline"
                      style={{ color: primaryColor }}
                      onClick={e => { e.stopPropagation(); setShowAllFiles(false) }}
                    >
                      Show less
                    </button>
                  )}
                </>
              )}

              {whatsIncluded.length > 0 && (
                <div className={files.length > 0 ? "mt-3 pt-3" : ""} style={files.length > 0 ? { borderTop: `1px solid ${scheme.border}` } : undefined}>
                  <p className="text-sm font-semibold mb-2" style={{ color: scheme.text }}>
                    What you&apos;re getting:
                  </p>
                  <ul className="space-y-1.5">
                    {whatsIncluded.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm" style={{ color: scheme.muted }}>
                        <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: "#16a34a" }} />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </SectionWrapper>
  )
}

// ── Image with Text (split_content) ──────────────────────────
function SplitContentSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const bg = str(s.bg_color, "#ffffff")
  const textColor = str(s.text_color, "#0f172a")
  const imagePos = str(s.image_position, "left")
  const imgUrl = str(s.image_url, "")

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className={cn("flex flex-col md:flex-row items-center gap-8 px-8 max-w-[1280px] mx-auto", imagePos === "right" && "md:flex-row-reverse")} style={{ paddingTop: `${s.padding_top ?? 60}px`, paddingBottom: `${s.padding_bottom ?? 60}px` }}>
        <div className="flex-1 min-w-0">
          {imgUrl ? (
            <img src={imgUrl} alt="" className="w-full h-auto rounded-lg object-cover" style={{ maxHeight: "500px" }} loading="lazy" decoding="async" />
          ) : (
            <div className="w-full aspect-[4/3] rounded-lg bg-neutral-100 flex items-center justify-center">
              <span className="text-neutral-400 text-sm">Image</span>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0" style={{ color: textColor }}>
          {!!s.heading && <h2 className="text-3xl font-bold mb-4" style={{ fontFamily: theme.font_heading }}>{str(s.heading)}</h2>}
          {!!s.text && <p className="text-base leading-relaxed opacity-80 mb-6">{str(s.text)}</p>}
          {!!s.button_text && (
            <a href={str(s.button_link, "#")} className="inline-block px-6 py-3 text-sm font-semibold text-white" style={{ background: theme.primary_color ?? "#6366f1", ...buttonRadiusStyle(theme) }}>
              {str(s.button_text)}
            </a>
          )}
        </div>
      </div>
    </SectionWrapper>
  )
}

// ── Slideshow ────────────────────────────────────────────────
function SlideshowSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const bg = str(s.bg_color, "#000000")
  const blocks = section.blocks ?? []
  const [activeSlide, setActiveSlide] = useState(0)

  const slides = blocks.length > 0 ? blocks : [
    { id: "1", type: "slide", settings: { image_url: "", heading: "Slide 1", subheading: "Your first slide", button_text: "Shop Now" } },
    { id: "2", type: "slide", settings: { image_url: "", heading: "Slide 2", subheading: "Your second slide", button_text: "Learn More" } },
  ]

  const slide = slides[activeSlide] ?? slides[0]
  const slideSettings = slide?.settings ?? {}

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className="relative w-full" style={{ height: `${s.height ?? 500}px` }}>
        {str(slideSettings.image_url as unknown) ? (
          <img src={str(slideSettings.image_url as unknown)} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" decoding="async" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-neutral-800 to-neutral-900" />
        )}
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center text-white">
          <div className="max-w-[1280px] mx-auto w-full px-8 text-center flex flex-col items-center">
            {!!slideSettings.heading && <h2 className="text-4xl md:text-5xl font-bold mb-4" style={{ fontFamily: theme.font_heading }}>{str(slideSettings.heading as unknown)}</h2>}
            {!!slideSettings.subheading && <p className="text-lg opacity-80 max-w-xl mb-6">{str(slideSettings.subheading as unknown)}</p>}
            {!!slideSettings.button_text && (
              <button className="px-8 py-3 text-sm font-semibold text-white" style={{ background: theme.primary_color ?? "#6366f1", ...buttonRadiusStyle(theme) }}>
                {str(slideSettings.button_text as unknown)}
              </button>
            )}
          </div>
        </div>
        {/* Dots */}
        {slides.length > 1 && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
            {slides.map((_, i) => (
              <button key={i} className={cn("w-2.5 h-2.5 rounded-full transition-all", i === activeSlide ? "bg-white" : "bg-white/40")} onClick={e => { e.stopPropagation(); setActiveSlide(i) }} />
            ))}
          </div>
        )}
      </div>
    </SectionWrapper>
  )
}

// ── Image Section (single image) ─────────────────────────────
function ImageSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const bg = str(s.bg_color, "#ffffff")
  const imgUrl = str(s.image_url, "")
  const caption = str(s.caption, "")
  const aspectRatio = str(s.aspect_ratio, "auto")

  const aspectMap: Record<string, string> = { "16:9": "aspect-video", "4:3": "aspect-[4/3]", "1:1": "aspect-square", "auto": "" }

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className="px-8 max-w-[1280px] mx-auto" style={{ paddingTop: `${s.padding_top ?? 40}px`, paddingBottom: `${s.padding_bottom ?? 40}px` }}>
        {imgUrl ? (
          <img src={imgUrl} alt={caption} className={cn("w-full h-auto rounded-lg object-cover", aspectMap[aspectRatio])} loading="lazy" decoding="async" />
        ) : (
          <div className={cn("w-full rounded-lg bg-neutral-100 flex items-center justify-center", aspectMap[aspectRatio] || "aspect-video")}>
            <span className="text-neutral-400 text-sm">Add an image</span>
          </div>
        )}
        {caption && <p className="text-center text-sm text-neutral-500 mt-3">{caption}</p>}
      </div>
    </SectionWrapper>
  )
}

// ── Section registry ─────────────────────────────────────────
const SECTION_COMPONENTS: Record<string, React.ComponentType<SectionProps>> = {
  header: HeaderSection,
  hero: HeroSection,
  rich_text: RichTextSection,
  image_banner: ImageBannerSection,
  split_content: SplitContentSection,
  image_section: ImageSection,
  slideshow: SlideshowSection,
  product: ProductSection,
  product_list: ProductListSection,
  testimonials: TestimonialsSection,
  faq: FaqSection,
  cta: CtaSection,
  stats: StatsSection,
  feature_grid: FeatureGridSection,
  pricing: PricingSection,
  logo_bar: LogoBarSection,
  gallery: GallerySection,
  footer: FooterSection,
}

// ── Public API ────────────────────────────────────────────────
export function renderSection(props: SectionProps) {
  if (props.section.hidden) return null
  const Component = SECTION_COMPONENTS[props.section.type]
  if (!Component) {
    return (
      <div className="p-4 bg-red-50 text-red-500 text-sm text-center border border-red-200">
        Unknown section type: <code>{props.section.type}</code>
      </div>
    )
  }
  return <Component {...props} />
}

export default function SectionRenderer({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  return renderSection({ section, theme, isEditing, isSelected, onClick }) ?? null
}
