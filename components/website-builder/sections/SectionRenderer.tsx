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
} from "lucide-react"
import { useState, CSSProperties } from "react"
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
            <img src={str(s.logo_url)} alt="Logo" className="h-8 object-contain" />
          ) : (
            <span className="text-[15px] font-bold" style={{ color: textColor }}>
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
          <img src={str(s.image_url)} alt="" className="w-full h-full object-cover" />
          <div
            className="absolute inset-0"
            style={{ background: bg, opacity: (Number(s.overlay_opacity ?? 40)) / 100 }}
          />
        </div>
      )}
      <div
        className={cn("relative z-10 flex flex-col gap-5 px-8 justify-center", alignClass, fullHeight ? "min-h-[80vh]" : "")}
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
      <div className={cn("px-8 py-16 mx-auto", mw)} style={{ textAlign: align as any }}>
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
          <img src={str(s.image_url)} alt="" className="w-full h-full object-cover" />
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
      <div className="px-8 py-16">
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
      <div className="px-8 py-16">
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
                    <img src={str(block.settings.avatar_url)} className="h-8 w-8 rounded-full object-cover" alt="" />
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
      <div className="px-8 py-16 text-center">
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
      <div className="px-8 py-12">
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
      <div className="px-8 py-16">
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
      <div className="px-8 py-16">
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
      <div className="px-8 py-10">
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
                  <img src={str(block.settings.image_url)} alt={str(block.settings.alt)} className="h-full w-auto object-contain" />
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
      <div className="px-8 py-16">
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
                  <img src={str(block.settings.image_url)} alt={str(block.settings.caption)} className="w-full h-full object-cover" />
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
      <div className="px-8 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
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

// ── Section registry ─────────────────────────────────────────
const SECTION_COMPONENTS: Record<string, React.ComponentType<SectionProps>> = {
  header: HeaderSection,
  hero: HeroSection,
  rich_text: RichTextSection,
  image_banner: ImageBannerSection,
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
