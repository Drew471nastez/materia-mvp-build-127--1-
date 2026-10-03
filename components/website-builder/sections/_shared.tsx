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

import type { SectionInstance, ThemeSettingsValues, ColorSchemeValues } from "@/lib/website-builder/types"
import { hoverFill, resolveSectionColors, type ColorScheme } from "@/lib/storelib-theme/color-schemes"
import { sectionTypography } from "@/lib/storelib-theme/typography"
// `Zap` alone, and only as the fallback for a name no theme should be using.
import { Zap } from "lucide-react"
import { ICON_MAP } from "./icon-map"
import type { CSSProperties } from "react"
import { useEffect, useState } from "react"
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
  onClick?: (e: React.MouseEvent<HTMLElement>) => void
  /**
   * Which device the editor is previewing. Layout no longer hangs off this —
   * every section is a container query now — but the header is excluded from
   * the container (it positions things `fixed`) and still needs telling.
   */
  deviceMode?: "desktop" | "tablet" | "mobile"
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
  /** Editor-only: a class for the section's box, the element that has the
   *  page's other sections as siblings (the arrival animation). */
  boxClassName?: string
  /** Editor-only: intercept nav link / CTA clicks inside sections so clicking
   *  a link in the header navigates WITHIN the editor canvas to the matching
   *  page instead of doing a full browser navigation. */
  /**
   * Follow a link inside the canvas, in the editor.
   *
   * `fromNav` says the link IS the site's navigation — a menu row, the logo,
   * the search row — rather than content being edited. The editor refuses an
   * ordinary link while the inspector is on, because a tap on a hero's button
   * is almost always aimed at the hero; it follows a navigation one, because
   * a nav you cannot follow is a nav you cannot check.
   *
   * It used to be decided outside, by the section's ROLE: the editor handed
   * the navigating version only to a section whose type is exactly "header"
   * or "footer". A header that calls itself anything else — a theme's own,
   * a custom one — got the refusing version, and every link in its drawer
   * did nothing at all with the inspector on. The drawer knows what it is,
   * so it says so here instead.
   */
  onEditorNavigate?: (href: string, fromNav?: boolean) => void
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

/**
 * ONE RESOLVER FOR BOTH RENDERER FAMILIES. These call the engine's
 * `resolveSectionColors()`, the same function `render.ts` calls for a
 * .storelib section, and hand back the eighty legacy slot names the
 * renderers were written against (`c.bg`, `c.heading`, `c.primary_btn_bg`),
 * every one derived from the scheme's twenty-one semantic values. A section's
 * own `color_overrides` are already applied, so a renderer reading `c.bg`
 * gets the override without knowing there is one.
 */
export type SectionPalette = ColorSchemeValues & ColorScheme

export function resolveScheme(theme: ThemeSettingsValues, key: string | undefined): SectionPalette {
  const r = resolveSectionColors(theme as Record<string, unknown>, { color_scheme: key })
  return { ...r.legacy, ...r.scheme } as unknown as SectionPalette
}

// Single entry point every section uses to resolve its effective colors.
// Reads section.settings.color_scheme and color_overrides and returns the
// merged scheme.
export function sectionColors(section: SectionInstance, theme: ThemeSettingsValues): SectionPalette {
  const chosen = { color_scheme: section.settings.color_scheme, color_overrides: section.settings.color_overrides }
  const r = resolveSectionColors(theme as Record<string, unknown>, chosen)
  /**
   * Both vocabularies. The legacy slot names every renderer was written
   * against (`c.bg`, `c.primary_btn_bg`) and the seventeen semantic names
   * (`c.background`, `c.input_background`, `c.text_muted`), which are what a
   * renderer written today should reach for.
   */
  return { ...r.legacy, ...r.scheme } as unknown as SectionPalette
}

/**
 * What the dispatcher puts on the container around a section: the scheme's
 * custom properties, the gradient when the scheme has one, and the
 * heading and body style attributes the theme stylesheet keys off.
 */
export function sectionTokenAttrs(
  section: SectionInstance,
  theme: ThemeSettingsValues,
): { style: CSSProperties; "data-color-scheme": string; "data-heading-style"?: string; "data-body-style"?: string } {
  const chosen = { color_scheme: section.settings.color_scheme, color_overrides: section.settings.color_overrides }
  const colors = resolveSectionColors(theme as Record<string, unknown>, chosen)
  const typo = sectionTypography(section.settings)
  const style: Record<string, string> = { ...colors.vars, ...typo.vars }
  if (colors.scheme.gradient) style.background = colors.scheme.gradient
  const out: ReturnType<typeof sectionTokenAttrs> = { style: style as CSSProperties, "data-color-scheme": colors.key }
  if (typo.heading) out["data-heading-style"] = typo.heading
  if (typo.body) out["data-body-style"] = typo.body
  return out
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

/**
 * A number a slider produced, which is not always a number.
 *
 * Settings arrive as `Record<string, unknown>`: the panel writes numbers, the
 * model writes `"80"`, and an older saved section can hold either. `Number("")`
 * is 0, so an empty string has to be rejected explicitly or a cleared padding
 * slider silently means "none" instead of "the default".
 */
export function num(v: unknown, fallback: number): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : fallback
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return fallback
}

/**
 * The vertical rhythm of a section, from its own two sliders.
 *
 * Sixteen renderers offered `padding_top` and `padding_bottom` in the panel
 * and then rendered a hard-coded `py-16`. Two sections next to each other
 * could not be given different spacing — which is most of what "make it look
 * designed" comes down to.
 *
 * The defaults are per-section on purpose: they are whatever that renderer
 * hard-coded before, so honouring the slider does not silently re-space every
 * page that already exists.
 */
export function sectionPadding(
  settings: Record<string, unknown>,
  topDefault: number,
  bottomDefault = topDefault,
): CSSProperties {
  /**
   * `calc(… * var(--theme-spacing-scale))` rather than a plain px, so the
   * theme's Spacing scale control means something. It was one of six controls
   * in the Layout group that nothing read: a creator could move it from 0.5 to
   * 2.0 and no page changed by a pixel.
   */
  return {
    paddingTop: `calc(${Math.max(0, num(settings.padding_top, topDefault))}px * var(--theme-spacing-scale, 1))`,
    paddingBottom: `calc(${Math.max(0, num(settings.padding_bottom, bottomDefault))}px * var(--theme-spacing-scale, 1))`,
  }
}

// ── Time, in a zone somebody chose ──────────────────────────

/**
 * The offset of a time zone at a given instant, in milliseconds.
 *
 * `Intl` will format an instant into any IANA zone but will not parse one, so
 * the offset is recovered by formatting and reading the wall clock back. This
 * is the standard trick and it is exact, including across a DST boundary,
 * because the offset is asked for at the instant in question rather than
 * assumed from the zone.
 */
function zoneOffset(instant: number, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(instant)
    const at = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0")
    const wall = Date.UTC(at("year"), at("month") - 1, at("day"), at("hour") % 24, at("minute"), at("second"))
    return wall - instant
  } catch {
    // An unknown zone name is the creator's typo, not a reason to fail.
    return 0
  }
}

/**
 * A wall-clock time, read in the zone the creator picked.
 *
 * "31 December, 23:59" means midnight in Los Angeles to somebody running a
 * sale from Los Angeles, and the countdown section has offered a Time zone
 * control from the day it shipped — while parsing the date in whatever zone
 * the VISITOR happens to be in. A sale ending at midnight PT ended at 8pm for
 * somebody in London and at 4pm the next day in Sydney.
 *
 * Two passes: the first offset is the one at the naive instant, the second at
 * the corrected instant. That second pass is what gets a time within an hour
 * of a DST change right.
 */
export function parseInZone(wallClock: string, timeZone?: string): number {
  const text = wallClock.trim().replace(" ", "T")
  if (!text) return NaN
  // An explicit offset or a trailing Z means the author has already said which
  // instant they mean, and a zone control must not move it.
  if (/(?:Z|[+-]\d{2}:?\d{2})$/.test(text)) return Date.parse(text)

  const naive = Date.parse(/\d{2}:\d{2}/.test(text) ? `${text}Z` : `${text}T00:00:00Z`)
  if (!Number.isFinite(naive)) return NaN
  if (!timeZone) return Date.parse(text)

  const once = naive - zoneOffset(naive, timeZone)
  return naive - zoneOffset(once, timeZone)
}

export interface CountdownPart {
  label: string
  value: number
}

/**
 * A live countdown to a wall-clock time in a zone. Null once it has run out,
 * and null when there is nothing to count down to, so a caller renders nothing
 * rather than a row of zeroes.
 */
export function useCountdown(
  endsAt: string,
  timeZone?: string,
): { parts: CountdownPart[]; remaining: number } | null {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!endsAt) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [endsAt])

  if (!endsAt) return null
  const end = parseInZone(endsAt, timeZone)
  if (!Number.isFinite(end)) return null
  const remaining = end - now
  if (remaining <= 0) return null

  return {
    remaining,
    parts: [
      { label: "days", value: Math.floor(remaining / 86_400_000) },
      { label: "hrs", value: Math.floor((remaining % 86_400_000) / 3_600_000) },
      { label: "min", value: Math.floor((remaining % 3_600_000) / 60_000) },
      { label: "sec", value: Math.floor((remaining % 60_000) / 1000) },
    ],
  }
}

/**
 * The theme's own rounding and shadow, for sections that show a card or an
 * image. `border_radius`, `image_border_radius` and `card_shadow` were three
 * more Layout controls that nothing read.
 */
export const THEME_RADIUS = "var(--theme-radius, 8px)"
export const THEME_IMAGE_RADIUS = "var(--theme-image-radius, 8px)"
export const THEME_CARD_SHADOW = "var(--theme-card-shadow, 0 1px 3px rgba(15,23,42,0.10))"

/** The four content widths the schemas offer, in the px the canvas uses. */
export const MAX_WIDTHS: Record<string, string> = {
  narrow: "720px",
  medium: "960px",
  // "Wide" is whatever the THEME calls wide — its Max page width control.
  wide: "var(--theme-page-width, 1230px)",
  full: "100%",
}

export function maxWidth(v: unknown, fallback = "wide"): string {
  return MAX_WIDTHS[str(v, fallback)] ?? MAX_WIDTHS[fallback] ?? "1230px"
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

/**
 * The map used to be ten icons written out here, and the themes already named
 * icons that were not in it: `stats.json` defaults to "users" and
 * `process_steps.json` to "user-plus", neither of which was a key, so every
 * statistic and every process step on every site rendered a lightning bolt.
 *
 * It is 188 icons in components/website-builder/sections/icon-map.tsx now,
 * generated from lucide's own exports and shared with the editor's picker,
 * so what a creator can choose and what a page can draw are the same set by
 * construction.
 */
export function DynamicIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICON_MAP[name] ?? Zap
  return <Icon className={className} strokeWidth={1.5} />
}

// ── A button painted by its section's scheme, hover included ──

/**
 * ===========================================================================
 *  ONE WAY FOR A REACT SECTION TO DRAW A BUTTON
 * ===========================================================================
 * A button drawn with an inline `background` cannot have a hover colour: no
 * stylesheet rule without !important beats an inline style. So a React
 * section hands its button's colours over as custom properties, and one
 * rule (app/globals.css, `[data-sl-button]`) paints them, hover included.
 *
 * The colours are the section's scheme after its own Advanced colors,
 * which is where a creator changes a button. A section's older literal field
 * (the header's `cta_color`, a `button_color`) still wins when it is set, as
 * it always did; its hover is then worked out from that colour, the same way
 * a scheme's is. `data-button` puts the button under the theme's Buttons
 * settings: shape, radius, weight, shadow and the hover motion.
 */
export function schemeButton(
  c: SectionPalette,
  variant: "primary" | "secondary" = "primary",
  own: { background?: string; text?: string } = {},
): { "data-sl-button": string; "data-button": string; style: CSSProperties } {
  const primary = variant === "primary"
  const bg = own.background || (primary ? c.primary_button_background : c.secondary_button_background)
  const fg = own.text || (primary ? c.primary_button_text : c.secondary_button_text)
  /* A filled button's edge is its fill, as it is in every .storelib section,
     so a section that recolours the fill does not keep the scheme's edge. */
  const border = primary ? bg : own.background || c.secondary_button_border
  const hoverBg = own.background
    ? hoverFill(own.background)
    : primary ? c.primary_button_hover_background : c.secondary_button_hover_background
  const hoverFg = own.text || (primary ? c.primary_button_hover_text : c.secondary_button_hover_text)
  return {
    "data-sl-button": variant,
    "data-button": "",
    style: {
      "--sl-btn-bg": bg,
      "--sl-btn-fg": fg,
      "--sl-btn-border": border,
      "--sl-btn-hover-bg": hoverBg,
      "--sl-btn-hover-fg": hoverFg,
    } as CSSProperties,
  }
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
  isChrome,
}: {
  id?: string
  children: React.ReactNode
  bgColor?: string
  isEditing?: boolean
  isSelected?: boolean
  onClick?: (e: React.MouseEvent<HTMLElement>) => void
  className?: string
  style?: CSSProperties
  forwardRef?: React.Ref<HTMLDivElement>
  /** Drop the default `transition-all` so inline `transition` rules (e.g.
   *  for sticky hide) aren't fighting the wrapper's own transitions. */
  disableWrapperTransition?: boolean
  canvasRoundedTopPx?: number
  canvasRoundedBottomPx?: number
  /**
   * The header and the footer. They are chrome, not content, and the theme's
   * entrance animation must not touch them: a header appears with the page,
   * and — since the header uses `transform` to slide itself away on scroll —
   * an animation on the same property fights the thing that makes it sticky.
   */
  isChrome?: boolean
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
      /**
       * The hook the theme's own stylesheet hangs off — section gaps, the
       * entrance animation, the button rules. It goes HERE rather than on the
       * dispatcher's container wrapper because the header is deliberately
       * outside that wrapper (it positions things `fixed`, and containment
       * would make an ancestor the containing block), and a theme setting that
       * skipped the header would be the same drift this is fixing.
       */
      data-section=""
      data-chrome={isChrome ? "" : undefined}
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
        // which made the selection outline invisible on header/footer.
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
          don't cross-trigger. `wb-ring` is how the editor fades the rings
          in and out with the inspector (globals.css, [data-wb-inspect]). */}
      {isEditing && !isSelected && (
        <span
          aria-hidden
          className="wb-ring absolute inset-0 pointer-events-none z-[9997] opacity-0 group-hover/section:opacity-100 transition-opacity"
          style={{ boxShadow: "inset 0 0 0 2px rgba(59, 130, 246, 0.5)", ...ringRadiusStyle }}
        />
      )}
      {/* Selected ring: solid blue (#3b82f6), the canvas selection colour the
          owner asked to keep, as Shopify marks a selection. The builder chrome
          stays violet. Above all children so opaque child backgrounds (header
          inner div, footer, etc.) can't hide it. */}
      {isEditing && isSelected && (
        <span
          aria-hidden
          className="wb-ring absolute inset-0 pointer-events-none z-[9998]"
          style={{ boxShadow: "inset 0 0 0 2px #3b82f6", ...ringRadiusStyle }}
        />
      )}
      {/* "Selected" badge — anchored to bottom-right so it never overlaps
          the header's logo/nav area or any section's top content. */}
      {isEditing && isSelected && (
        <span
          className="wb-ring absolute bottom-2 right-2 z-[9999] pointer-events-none select-none"
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
