"use client"

// ============================================================
// Storelib Theme Engine — Section Renderer: Shared helpers
// ------------------------------------------------------------
// This module houses the types + helpers that every section
// renderer needs (SectionProps, str/bool, sectionColors,
// SectionWrapper, buttonRadiusStyle, DynamicIcon).
//
// Both the main SectionRenderer.tsx and individual per-section
// modules in ./renderers/* import from here. Keeping the shared
// surface in one file prevents circular imports between the
// dispatcher and the renderers.
// ============================================================

import type { SectionInstance, ThemeSettingsValues, ColorSchemeKey, ColorSchemeValues } from "@/lib/website-builder/types"
import { DEFAULT_COLOR_SCHEMES } from "@/lib/website-builder/types"
import {
  Zap, Shield, Star, CheckCircle, Download, Heart, Globe, Lock,
  RefreshCw, Rocket,
} from "lucide-react"
import type { CSSProperties } from "react"
import { cn } from "@/lib/utils"

// ── Shared props every section receives ─────────────────────
export interface SectionProps {
  section: SectionInstance
  theme: ThemeSettingsValues
  /** `isEditing` controls the "inspector" UI: hover outline, click-to-select,
   *  selection ring. When the user toggles the Inspector OFF in the editor
   *  this becomes `false`, even though we are STILL running inside the
   *  editor preview. Do NOT use this to decide "am I on the live site" —
   *  that is what `insideEditor` is for (see below). */
  isEditing?: boolean
  isSelected?: boolean
  onClick?: () => void
  deviceMode?: "desktop" | "mobile"
  /** `insideEditor === true` whenever the section renders inside the
   *  website-builder canvas (regardless of inspector state). Sections use
   *  this to switch between live-site layout (fixed sticky headers, etc.)
   *  and editor-canvas layout (in-flow sticky scoped to the preview card).
   *
   *  `insideEditor` is ALWAYS TRUE in the editor, even when the inspector
   *  toggle is off — that's the whole point of having a separate flag.
   *  `isEditing` may flip with the Inspector toggle; `insideEditor` does not. */
  insideEditor?: boolean
  /** Optional DOM id set on the outer section wrapper — used by the editor
   *  to `scrollIntoView` without needing a separate wrapping <div> which
   *  would constrain sticky's containing block. */
  wrapperId?: string
  /** Editor-only: intercept nav link / CTA clicks inside sections so clicking
   *  a link in the header navigates WITHIN the editor canvas to the matching
   *  page instead of doing a full browser navigation. */
  onEditorNavigate?: (href: string) => void
  /** Editor-only: border-radius (in px) for the selection ring's TOP corners,
   *  so the selection outline curves into the canvas's rounded top corners
   *  instead of being clipped as a rectangular ring. Set on the first
   *  visible section (header) by the editor. */
  canvasRoundedTopPx?: number
  /** Editor-only: same as canvasRoundedTopPx but for bottom corners — used
   *  on the final section (footer) when the canvas has a rounded bottom
   *  (mobile preview only; desktop canvas is rounded-top only). */
  canvasRoundedBottomPx?: number
}

// ── Color-scheme resolution ─────────────────────────────────

// Resolve a section's color scheme — falls back to the theme-level scheme,
// then to DEFAULT_COLOR_SCHEMES.
export function resolveScheme(theme: ThemeSettingsValues, key: string | undefined): ColorSchemeValues {
  const k = (key && (key in DEFAULT_COLOR_SCHEMES) ? key : "white") as ColorSchemeKey
  const themeSchemes = (theme.color_schemes as Record<string, ColorSchemeValues> | undefined) ?? {}
  return { ...DEFAULT_COLOR_SCHEMES[k], ...(themeSchemes[k] ?? {}) }
}

// Single entry point every section uses to resolve its effective colors.
// Reads section.settings.color_scheme and returns the merged scheme.
export function sectionColors(section: SectionInstance, theme: ThemeSettingsValues): ColorSchemeValues {
  const schemeKey = typeof section.settings.color_scheme === "string" ? section.settings.color_scheme : "white"
  return resolveScheme(theme, schemeKey)
}

// ── Value coercion helpers ──────────────────────────────────

export function str(v: unknown, fallback = ""): string {
  if (typeof v === "string") return v
  if (typeof v === "number") return String(v)
  return fallback
}

export function bool(v: unknown, fallback = false): boolean {
  return typeof v === "boolean" ? v : fallback
}

// Convert a hex colour ("#rgb" / "#rrggbb") to "rgba(r, g, b, a)".
// Non-hex input is returned as-is so CSS still renders something sensible
// (e.g. a pre-resolved "rgba(...)" from the color-scheme system passes
// straight through).
export function hexToRgba(hex: string, alpha: number): string {
  if (typeof hex !== "string") return hex as unknown as string
  const m = hex.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (!m) return hex
  let h = m[1]
  if (h.length === 3) h = h.split("").map(ch => ch + ch).join("")
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// ── Dynamic icon (feature grids, icon boxes, etc.) ──────────

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

export function DynamicIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICON_MAP[name] ?? Zap
  return <Icon className={className} strokeWidth={1.5} />
}

// ── Button radius derived from theme-level button_style ─────

export function buttonRadiusStyle(theme: ThemeSettingsValues): CSSProperties {
  const style = theme.button_style ?? "rounded"
  const r = theme.border_radius ?? 8
  if (style === "pill") return { borderRadius: "9999px" }
  if (style === "square") return { borderRadius: "4px" }
  return { borderRadius: `${r}px` }
}

// ── SectionWrapper ──────────────────────────────────────────
// Every section renders inside this to get consistent hover /
// selection affordances in the editor.
// ────────────────────────────────────────────────────────────

export function SectionWrapper({
  id,
  children,
  bgColor,
  isEditing,
  isSelected,
  onClick,
  className,
  style,
  forwardRef,
  disableWrapperTransition,
  canvasRoundedTopPx,
  canvasRoundedBottomPx,
}: {
  id?: string
  children: React.ReactNode
  bgColor?: string
  isEditing?: boolean
  isSelected?: boolean
  onClick?: () => void
  className?: string
  style?: CSSProperties
  forwardRef?: React.Ref<HTMLDivElement>
  /** Drop the default `transition-all` so inline `transition` rules (e.g.
   *  for sticky hide) aren't fighting the wrapper's own transitions. */
  disableWrapperTransition?: boolean
  canvasRoundedTopPx?: number
  canvasRoundedBottomPx?: number
}) {
  // Precompute the selection-ring border-radius so its corners curve into
  // the canvas's rounded corners instead of being clipped as a square.
  const ringRadiusStyle: CSSProperties = (canvasRoundedTopPx || canvasRoundedBottomPx)
    ? {
        borderTopLeftRadius: canvasRoundedTopPx ? `${canvasRoundedTopPx}px` : undefined,
        borderTopRightRadius: canvasRoundedTopPx ? `${canvasRoundedTopPx}px` : undefined,
        borderBottomLeftRadius: canvasRoundedBottomPx ? `${canvasRoundedBottomPx}px` : undefined,
        borderBottomRightRadius: canvasRoundedBottomPx ? `${canvasRoundedBottomPx}px` : undefined,
      }
    : {}
  return (
    <div
      id={id}
      ref={forwardRef as any}
      className={cn(
        "relative w-full",
        // `isolate` (isolation: isolate) creates a new stacking context per
        // section. Without this, the selection-ring overlay's huge z-index
        // (9998) lives in the ROOT stacking context and ends up painting
        // OVER sibling sections — most visibly, when a hero section is
        // selected its ring bleeds across the sticky header (z-40) as
        // content scrolls behind it. Scoping every section to its own
        // stacking context keeps each ring contained to its own section.
        "isolate",
        !disableWrapperTransition && "transition-all",
        isEditing && "cursor-pointer group/section",
        // NOTE: we no longer rely on Tailwind's `ring-inset` for the
        // selected/hover states because `ring-inset` is a box-shadow on the
        // wrapper itself — it gets painted UNDER any child that has its own
        // opaque background (e.g. the header's inner `background: bg` div),
        // which made the blue selection outline invisible on header/footer.
        // Instead we render an absolutely-positioned overlay below so the
        // ring sits ABOVE all children's backgrounds.
        className,
      )}
      style={{ background: bgColor, ...style }}
      onClick={onClick}
    >
      {children}
      {/* Hover ring — paints above children via group-hover so opaque child
          backgrounds can't hide it. Uses a named group so nested sections
          don't cross-trigger. */}
      {isEditing && !isSelected && (
        <span
          aria-hidden
          className="absolute inset-0 pointer-events-none z-[9997] opacity-0 group-hover/section:opacity-100 transition-opacity"
          style={{ boxShadow: "inset 0 0 0 2px rgba(59, 130, 246, 0.5)", ...ringRadiusStyle }}
        />
      )}
      {/* Selected ring — solid blue, renders ABOVE all children so opaque
          child backgrounds (header inner div, footer, etc.) can't hide it. */}
      {isEditing && isSelected && (
        <span
          aria-hidden
          className="absolute inset-0 pointer-events-none z-[9998]"
          style={{ boxShadow: "inset 0 0 0 2px #3b82f6", ...ringRadiusStyle }}
        />
      )}
      {/* "Selected" badge — anchored to bottom-right so it never overlaps
          the header's logo/nav area or any section's top content. */}
      {isEditing && isSelected && (
        <span
          className="absolute bottom-2 right-2 z-[9999] pointer-events-none select-none"
          style={{
            background: "#3b82f6",
            color: "#fff",
            fontSize: "11px",
            fontWeight: 600,
            lineHeight: 1,
            letterSpacing: "0.02em",
            padding: "3px 8px",
            borderRadius: "4px",
            boxShadow: "0 1px 4px rgba(0,0,0,0.18)",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          Selected
        </span>
      )}
    </div>
  )
}
