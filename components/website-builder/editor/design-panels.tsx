"use client"

/**
 * ===========================================================================
 *  THE DESIGN PANELS: COLOURS AND TYPE, GLOBAL AND PER SECTION
 * ===========================================================================
 * Four panels, one model (lib/storelib-theme/color-schemes.ts and
 * typography.ts):
 *
 *   SchemePicker        a dropdown of the theme's schemes, painted in them
 *   SectionDesignPanel  what a section shows: its scheme, "Customize" for
 *                       the few colours it may override, and its heading
 *                       and body style
 *   ColorsPanel         Theme settings, Colors: the schemes themselves
 *   TypographyPanel     Theme settings, Typography: fonts and text styles
 *
 * Simple by default. A section is a scheme and two style pickers; the
 * seventeen values of a scheme live in Theme settings, and a section's own
 * colour pickers are behind Customize. Nothing here paints a colour on its
 * own: every value goes through the same resolver the canvas and the
 * published page use.
 */

import { useEffect, useRef, useState, type ReactNode } from "react"
import { Check, ChevronDown, Info, Plus, RotateCcw, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  DEFAULT_COLOR_SCHEMES,
  FALLBACK_SCHEME_KEY,
  SCHEME_COLOR_GROUPS,
  SCHEME_COLOR_LABELS,
  SECTION_OVERRIDE_KEYS,
  HOVER_KEYS,
  defaultSchemeKey,
  isBuiltInScheme,
  newSchemeFrom,
  resolveSectionColors,
  schemeTokenName,
  stripSchemeDefaults,
  themeColorSchemes,
  type ColorScheme,
  type SchemeColorKey,
} from "@/lib/storelib-theme/color-schemes"
import {
  DEFAULT_TYPE_STYLES,
  TYPE_STYLE_KEYS,
  TYPE_STYLE_LABELS,
  baseTypeStyles,
  normalizeTypeStyle,
  stripTypeStyleDefaults,
  themeTypography,
  type FontRole,
  type TextTransform,
  type TypeStyle,
  type TypeStyleKey,
} from "@/lib/storelib-theme/typography"
import { designSupport } from "@/lib/website-builder/design-support"
import { effectiveOverride, resetOverrides, setOverride } from "@/lib/website-builder/section-overrides"
import type { SchemaField, SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"
import { ColorChip } from "./color-chip"
import { GRADIENT_PRESETS, GradientEditor } from "./gradient-editor"
import { Collapse } from "./collapse"
import { SECTION_ANIMATION_OPTIONS, isChromeType, themeAnimation, type SectionAnimation } from "@/lib/website-builder/section-anchors"

/** The theme's animation in the words the section's own choices use. */
const THEME_MOTION_LABEL: Record<SectionAnimation, string> = {
  none: "none",
  fade: "fade",
  fade_up: "fade up",
  zoom: "zoom",
  slide_left: "slide left",
  slide_right: "slide right",
}

type Theme = ThemeSettingsValues
const asRecord = (t: Theme) => t as unknown as Record<string, unknown>

// ── Small shared controls ────────────────────────────────────

const LABEL = "text-[11px] font-semibold text-muted-foreground uppercase tracking-widest"
const INPUT =
  "w-full h-8 px-2.5 text-[13px] border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-400 transition-colors"

function Select({
  label,
  value,
  onChange,
  options,
  compact,
}: {
  label?: string
  value: string
  onChange: (v: string) => void
  options: { label: string; value: string }[]
  compact?: boolean
}) {
  return (
    <div className={cn(label && "space-y-1.5")}>
      {label && <p className="text-[13px] font-medium text-foreground">{label}</p>}
      <div className="relative">
        <select
          className={cn(INPUT, "pr-8 appearance-none cursor-pointer")}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
      </div>
    </div>
  )
}

function NumberField({
  label,
  value,
  onChange,
  step = 1,
  min,
  max,
  unit,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  step?: number
  min?: number
  max?: number
  unit?: string
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="relative block">
        <input
          type="number"
          className={cn(INPUT, "font-mono text-[13px]", unit && "pr-8")}
          value={Number.isFinite(value) ? value : ""}
          step={step}
          min={min}
          max={max}
          onChange={(e) => {
            const n = Number(e.target.value)
            if (Number.isFinite(n)) onChange(n)
          }}
        />
        {unit && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground pointer-events-none">{unit}</span>}
      </span>
    </label>
  )
}

function Swatch({ scheme, size = "md" }: { scheme: ColorScheme; size?: "sm" | "md" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-md border border-black/10 font-semibold shrink-0",
        size === "sm" ? "h-6 w-6 text-[11px]" : "h-7 w-7 text-[13px]",
      )}
      style={{ background: scheme.gradient || scheme.background, color: scheme.heading }}
    >
      Aa
    </span>
  )
}

// ── Scheme picker ────────────────────────────────────────────

/** How long the scheme list takes to leave: a touch quicker than it arrives, as a dismissal should be. */
const SCHEME_LIST_OUT_MS = 140

export function SchemePicker({
  value,
  onChange,
  theme,
  onEdit,
  size = "md",
}: {
  value: string
  onChange: (key: string) => void
  theme: Theme
  /** Opens a scheme in Theme settings. Offered on each row of the open list. */
  onEdit?: (key: string) => void
  size?: "sm" | "md"
}) {
  const [open, setOpenRaw] = useState(false)
  /*
   * OPEN AND CLOSE ARE BOTH MOTIONS. The list used to animate in and vanish
   * on the next frame going out, which reads as a glitch. It stays drawn for
   * the length of its exit (`closing`), then leaves.
   */
  const [closing, setClosing] = useState(false)
  const closeTimer = useRef<number | null>(null)
  const setOpen = (next: boolean | ((o: boolean) => boolean)) => {
    const want = typeof next === "function" ? next(open) : next
    if (closeTimer.current) window.clearTimeout(closeTimer.current)
    if (open && !want) {
      setClosing(true)
      closeTimer.current = window.setTimeout(() => setClosing(false), SCHEME_LIST_OUT_MS)
    } else if (want) {
      setClosing(false)
    }
    setOpenRaw(want)
  }
  useEffect(() => () => { if (closeTimer.current) window.clearTimeout(closeTimer.current) }, [])
  const rootRef = useRef<HTMLDivElement>(null)
  const schemes = themeColorSchemes(asRecord(theme))
  const activeKey = schemes[value] ? value : defaultSchemeKey(asRecord(theme), schemes)
  const active = schemes[activeKey]

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

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "w-full flex items-center justify-between gap-2 px-3 rounded-xl border transition-all cursor-pointer",
          size === "sm" ? "h-9" : "h-10",
          open ? "border-neutral-400" : "border-neutral-200 hover:border-neutral-300",
        )}
        style={{ background: active.gradient || active.background, color: active.heading }}
      >
        <span className="flex items-center gap-2.5 min-w-0">
          <span className={cn("font-bold", size === "sm" ? "text-[13px]" : "text-[15px]")}>Aa</span>
          <span className={cn("font-medium truncate", size === "sm" ? "text-[12.5px]" : "text-[13px]")}>{active.name}</span>
        </span>
        {/**
          * THE TRIGGER SHOWS THE SCHEME, AND NOTHING ELSE.
          *
          * Edit used to sit here, on a control whose whole job is to say
          * which scheme is on: a white pill on every coloured swatch, always
          * present, and it only ever edited the ACTIVE one. Editing belongs
          * with the list, where every scheme is in reach.
          */}
        <span className="flex items-center gap-2 shrink-0">
          <ChevronDown className={cn("h-4 w-4 opacity-70 transition-transform duration-200 ease-out", open && "rotate-180")} />
        </span>
      </button>

      {(open || closing) && (
        <div
          data-scheme-list={open ? "open" : "closing"}
          className={cn(
            "absolute left-0 right-0 top-full mt-2 z-50 rounded-xl border border-neutral-200 bg-popover shadow-lg p-1.5 space-y-1 origin-top max-h-[320px] overflow-y-auto wb-slim-scroll",
            !open && "pointer-events-none",
          )}
          style={{
            /* Transform and opacity only: the compositor's, so a busy sidebar never stutters it. No vertical squash on the way in: it bent the text. */
            animation: open
              ? "scheme-dropdown-in 200ms cubic-bezier(0.32, 0.72, 0, 1) both"
              : `scheme-dropdown-out ${SCHEME_LIST_OUT_MS}ms cubic-bezier(0.4, 0, 1, 1) both`,
          }}
        >
          <style jsx>{`
            @keyframes scheme-dropdown-in {
              from { opacity: 0; transform: translateY(-6px); }
              to   { opacity: 1; transform: translateY(0); }
            }
            @keyframes scheme-dropdown-out {
              from { opacity: 1; transform: translateY(0); }
              to   { opacity: 0; transform: translateY(-4px); }
            }
            @media (prefers-reduced-motion: reduce) {
              div { animation-duration: 1ms !important; }
            }
          `}</style>
          {Object.entries(schemes).map(([key, sc]) => {
            const isActive = activeKey === key
            return (
              /**
               * A row is a pair, not a button inside a button, which is
               * invalid markup and which browsers resolve by dropping one of
               * them. Choosing is the whole row; editing is the affordance on
               * the end, and it only appears where it can do something.
               */
              <div
                key={key}
                className={cn(
                  "relative flex w-full items-center rounded-lg border-2 transition-colors duration-150",
                  isActive ? "border-neutral-900" : "border-transparent hover:border-neutral-300",
                )}
                style={{ background: sc.gradient || sc.background, color: sc.heading }}
              >
                <button
                  type="button"
                  onClick={() => { onChange(key); setOpen(false) }}
                  className="flex h-9 min-w-0 flex-1 cursor-pointer items-center gap-2.5 px-3 text-left"
                >
                  <span className="text-[15px] font-bold">Aa</span>
                  <span className="truncate text-[13px] font-medium">{sc.name}</span>
                  {isActive && <Check className="ml-auto h-3.5 w-3.5 shrink-0 opacity-70" />}
                </button>
                {onEdit && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setOpen(false); onEdit(key) }}
                    className="mr-1.5 shrink-0 rounded-md border border-black/10 bg-white/90 px-2.5 py-1 text-[12px] font-medium text-gray-900 shadow-sm transition-colors hover:bg-white"
                  >
                    Edit
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Per-section design ───────────────────────────────────────

const OVERRIDE_ROWS: { label: string; keys: SchemeColorKey[] }[] = [
  { label: "Background", keys: ["background"] },
  { label: "Text", keys: ["text"] },
  { label: "Heading", keys: ["heading"] },
  { label: "Accent", keys: ["accent"] },
  { label: "Border", keys: ["border"] },
]

/**
 * ===========================================================================
 *  A BUTTON'S COLOURS, EACH ONE NAMED
 * ===========================================================================
 * "Primary button" was a row with two unlabelled dots, one the fill and one
 * the text, and nothing said which was which or that there was no hover at
 * all. The owner tried to recolour the header's button and could not tell
 * how. Each colour now says what it is, and the two hover colours say Auto
 * until someone picks one: see automaticHover in the colour schemes.
 */
export const BUTTON_COLOR_GROUPS: { label: string; parts: { key: SchemeColorKey; label: string }[] }[] = [
  {
    label: "Primary button",
    parts: [
      { key: "primary_button_background", label: "Fill" },
      { key: "primary_button_text", label: "Text" },
      { key: "primary_button_hover_background", label: "Hover fill" },
      { key: "primary_button_hover_text", label: "Hover text" },
    ],
  },
  {
    label: "Secondary button",
    parts: [
      { key: "secondary_button_background", label: "Fill" },
      { key: "secondary_button_text", label: "Text" },
      { key: "secondary_button_hover_background", label: "Hover fill" },
      { key: "secondary_button_hover_text", label: "Hover text" },
    ],
  },
]

const isHoverKey = (k: SchemeColorKey) => (HOVER_KEYS as readonly string[]).includes(k)

/**
 * ===========================================================================
 *  ONE COLOUR, ONE ROW
 * ===========================================================================
 * The section's colours were drawn as swatches side by side under each
 * button, four in a row with a label under each and a scheme label
 * down the right, and the owner found it busy and hard to read. They are a
 * list now, the way a scheme is edited in Shopify: the name on the left, the
 * colour and its hex on the right, the picker opening from there.
 *
 * A colour left on the scheme shows the scheme's value, quieter, with a word
 * saying where it comes from. A colour the section chose shows its own value
 * and, on hover or focus, an arrow that puts it back.
 */
const GROUP_HEADING = "text-[13px] font-semibold text-foreground"

function ColorRow({
  label,
  name,
  own,
  shown,
  hint,
  onChange,
  onReset,
}: {
  label: string
  /** The full name for a screen reader: "Primary button fill". */
  name: string
  own: string
  shown: string
  hint: string
  onChange: (c: string) => void
  onReset: () => void
}) {
  return (
    <div data-color-row={name} className="group/row flex min-h-9 max-sm:min-h-11 items-center gap-1.5">
      <span className="min-w-0 flex-1 truncate text-[12.5px] max-sm:text-[14px] text-foreground">{label}</span>
      {own ? (
        <button
          type="button"
          onClick={onReset}
          aria-label={`Put ${name.toLowerCase()} back to the scheme`}
          title="Back to scheme"
          className="flex h-7 w-7 max-sm:h-10 max-sm:w-10 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-opacity hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900/10 opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100 max-sm:opacity-100 [@media(hover:none)]:opacity-100"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      ) : null}
      <ColorChip
        variant="field"
        label={name}
        value={shown === "transparent" ? "" : shown}
        muted={!own}
        hint={own ? undefined : hint}
        onChange={onChange}
        existing={[]}
      />
    </div>
  )
}

/**
 * One button's colours as rows: Fill, Text, Hover fill and Hover text, all
 * four in the open. The hover pair used to sit behind a "Hover colors"
 * toggle of its own, a disclosure inside a disclosure for two rows, and the
 * owner asked for it gone. Each hover row says Auto until someone picks a
 * colour, because it works itself out from the fill (automaticHover in the
 * colour schemes). Shared by every section's Advanced colors and by the
 * header's Button panel, so the two cannot describe one button differently.
 */
export function ButtonColorGroup({
  group,
  settings,
  theme,
  onApply,
  allowed,
}: {
  group: (typeof BUTTON_COLOR_GROUPS)[number]
  settings: Record<string, unknown>
  theme: Theme
  onApply: (next: Record<string, unknown>) => void
  /** The keys this section lets be overridden; all four when omitted. */
  allowed?: SchemeColorKey[]
}) {
  const colors = resolveSectionColors(asRecord(theme), settings)
  const parts = group.parts.filter((p) => !allowed || allowed.includes(p.key))
  if (parts.length === 0) return null

  const row = (p: (typeof parts)[number]) => {
    const own = effectiveOverride(settings, p.key)
    /* A hover shows what it will be: worked out from this section's button. */
    const shown = own || (isHoverKey(p.key) ? colors.scheme[p.key] : colors.base[p.key])
    const auto = isHoverKey(p.key)
    return (
      <ColorRow
        key={p.key}
        label={p.label}
        name={`${group.label} ${p.label.toLowerCase()}`}
        own={own}
        shown={shown}
        hint={auto ? "Auto" : "Scheme"}
        onChange={(c) => onApply(setOverride(settings, p.key, c))}
        onReset={() => onApply(setOverride(settings, p.key, ""))}
      />
    )
  }

  return (
    <div data-button-colors={group.label}>
      <p className={GROUP_HEADING}>{group.label}</p>
      {parts.map(row)}
    </div>
  )
}

/**
 * ===========================================================================
 *  A COLOUR THE SECTION DECLARES FOR ITSELF
 * ===========================================================================
 * Beside its scheme and Advanced colors, a section may declare colour
 * settings of its own: the stars on a review, a timeline's dot, the scrim
 * over a photo, a card's fill. These used to be filtered out of the panel
 * altogether, on the reasoning that colours come from the scheme, which left
 * a section's author no way to give the creator a colour just for that
 * section. They are drawn now, as the same row Advanced colors uses.
 *
 * Untouched, the row shows what the section will draw and says where it
 * comes from: "Scheme" when the default names a scheme colour
 * (`"default": "scheme.accent"`, followed until somebody picks one), the
 * default's own hex otherwise, or "Auto" when the section works it out. A
 * colour the creator picked shows its own value and an arrow that puts it
 * back.
 */
export function SectionColorSetting({
  field,
  value,
  settings,
  theme,
  onChange,
}: {
  field: { id: string; label?: string; default?: unknown }
  value: unknown
  /** The section's settings, for the scheme and overrides this colour may follow. */
  settings: Record<string, unknown>
  theme: Theme
  onChange: (next: string | undefined) => void
}) {
  const colors = resolveSectionColors(asRecord(theme), settings)
  const scheme = { ...colors.legacy, ...colors.scheme } as Record<string, string>
  const raw = typeof value === "string" ? value.trim() : ""
  const own = raw && schemeTokenName(raw) === null && raw !== String(field.default ?? "") ? raw : ""
  const follows = schemeTokenName(field.default)
  const fallback = follows ? scheme[follows] ?? "" : typeof field.default === "string" ? field.default : ""
  const label = field.label || field.id
  return (
    <ColorRow
      label={label}
      name={label}
      own={own}
      shown={own || fallback}
      hint={follows ? "Scheme" : fallback ? "Default" : "Auto"}
      onChange={(c) => onChange(c)}
      onReset={() => onChange(undefined)}
    />
  )
}

const HEADING_STYLE_OPTIONS = [
  { label: "Theme default", value: "" },
  { label: "Heading 1", value: "h1" },
  { label: "Heading 2", value: "h2" },
  { label: "Heading 3", value: "h3" },
  { label: "Heading 4", value: "h4" },
  { label: "Custom", value: "custom" },
]
const BODY_STYLE_OPTIONS = [
  { label: "Theme default", value: "" },
  { label: "Body", value: "body" },
  { label: "Body large", value: "body_large" },
  { label: "Body small", value: "body_small" },
  { label: "Custom", value: "custom" },
]
const WEIGHT_OPTIONS = ["300", "400", "500", "600", "700", "800", "900"].map((w) => ({ label: w, value: w }))
const FONT_ROLE_OPTIONS: { label: string; value: FontRole }[] = [
  { label: "Heading font", value: "heading" },
  { label: "Body font", value: "body" },
  { label: "Accent font", value: "accent" },
]
const TRANSFORM_OPTIONS: { label: string; value: TextTransform }[] = [
  { label: "None", value: "none" },
  { label: "Uppercase", value: "uppercase" },
  { label: "Capitalize", value: "capitalize" },
  { label: "Lowercase", value: "lowercase" },
]

/**
 * The six things a text style is. Used for a theme's style and for a
 * section's custom style alike, so the two never drift apart.
 */
function TypeStyleFields({
  value,
  onChange,
  base,
}: {
  value: TypeStyle
  onChange: (next: TypeStyle) => void
  base: TypeStyle
}) {
  const set = (patch: Partial<TypeStyle>) => onChange({ ...value, ...patch })
  const isDefault = JSON.stringify(value) === JSON.stringify(base)
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Select compact label="Font" value={value.font} onChange={(v) => set({ font: v as FontRole })} options={FONT_ROLE_OPTIONS} />
        <Select compact label="Weight" value={value.weight} onChange={(v) => set({ weight: v })} options={WEIGHT_OPTIONS} />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground mb-1.5">Size</p>
        <div className="grid grid-cols-3 gap-2">
          <NumberField label="Desktop" unit="px" min={8} max={200} value={value.size.desktop} onChange={(n) => set({ size: { ...value.size, desktop: n } })} />
          <NumberField label="Tablet" unit="px" min={8} max={200} value={value.size.tablet} onChange={(n) => set({ size: { ...value.size, tablet: n } })} />
          <NumberField label="Phone" unit="px" min={8} max={200} value={value.size.mobile} onChange={(n) => set({ size: { ...value.size, mobile: n } })} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="Line height" step={0.05} min={0.8} max={3} value={value.line_height} onChange={(n) => set({ line_height: n })} />
        <NumberField label="Letter spacing" unit="px" step={0.1} min={-5} max={20} value={value.letter_spacing} onChange={(n) => set({ letter_spacing: n })} />
      </div>
      <Select compact label="Transform" value={value.transform} onChange={(v) => set({ transform: v as TextTransform })} options={TRANSFORM_OPTIONS} />
      {!isDefault && (
        <button type="button" onClick={() => onChange({ ...base, size: { ...base.size } })} className="text-[12px] font-medium text-foreground/70 hover:text-foreground flex items-center gap-1">
          <RotateCcw className="h-3 w-3" />
          Reset style
        </button>
      )}
    </div>
  )
}

export function SectionDesignPanel({
  section,
  schema,
  theme,
  onUpdateSetting,
  onEditScheme,
  compact,
}: {
  section: SectionInstance
  schema: { fields?: SchemaField[] } | null | undefined
  theme: Theme
  onUpdateSetting: (key: string, value: unknown) => void
  onEditScheme?: (key: string) => void
  /** Inside another panel (the header's), without the outer border and padding. */
  compact?: boolean
}) {
  const support = designSupport(schema)
  const s = section.settings
  /**
   * SHUT, always.
   *
   * It opened itself whenever the section had any colour override at all,
   * and an override is set by picking one colour once: from then on the
   * panel greeted you with seven colour rows above the settings you came
   * for. The row already says "3 customized" when there is something in
   * there, which is the part worth seeing without opening it.
   */
  const [customizeOpen, setCustomizeOpen] = useState(false)
  const colors = resolveSectionColors(asRecord(theme), s)
  const overridden = SECTION_OVERRIDE_KEYS.filter((k) => effectiveOverride(s, k) !== "").length

  /** Apply a whole-settings change as per-key updates, so undo sees each. */
  const applySettings = (next: Record<string, unknown>) => {
    for (const key of new Set([...Object.keys(s), ...Object.keys(next)])) {
      if (JSON.stringify(s[key]) !== JSON.stringify(next[key])) onUpdateSetting(key, next[key])
    }
  }

  const headingStyle = typeof s.heading_style === "string" ? s.heading_style : ""
  const bodyStyle = typeof s.body_style === "string" ? s.body_style : ""
  const typo = themeTypography(asRecord(theme))
  const customHeading = normalizeTypeStyle(s.custom_heading, typo.styles.h2)
  const customBody = normalizeTypeStyle(s.custom_body, typo.styles.body)

  /**
   * HOW THIS SECTION ARRIVES, over the theme's choice (Theme settings ›
   * Animations). Not for the header and the footer, which never move, and
   * not when the section's own code declares an `animation` setting, which
   * its own panel already shows. lib/website-builder/section-anchors.ts.
   */
  const showAnimation = !isChromeType(section.type) && !schema?.fields?.some((f) => f.id === "animation")
  const animation = typeof s.animation === "string" && SECTION_ANIMATION_OPTIONS.some((o) => o.value === s.animation) ? s.animation : "theme"
  const themeMotion = themeAnimation(asRecord(theme))
  const animationOptions = SECTION_ANIMATION_OPTIONS.map((o) =>
    o.value === "theme" ? { ...o, label: `Same as theme (${THEME_MOTION_LABEL[themeMotion]})` } : o,
  )

  if (!support.colorScheme && !support.typography && !showAnimation) return null

  return (
    <div className={cn(!compact && "border-b border-border px-3.5 py-3.5", "space-y-3.5")}>
      {support.colorScheme && (
        <div className="space-y-3">
          <p className={LABEL}>Color scheme</p>
          <SchemePicker
            value={typeof s.color_scheme === "string" ? s.color_scheme : ""}
            onChange={(key) => onUpdateSetting("color_scheme", key)}
            theme={theme}
            onEdit={onEditScheme}
          />

          {support.colorOverrides.length > 0 && (
            <div className="rounded-lg border border-border">
              {/*
                ═══════════════════════════════════════════════════════════
                 TWO LABELS IN A ROW THAT IS SOMETIMES NARROW
                ═══════════════════════════════════════════════════════════
                A flex child's `min-width` is `auto`, which means it will not
                shrink below its own content. Two of them in a row that runs
                out of width therefore do not shrink at all: the text inside
                them wraps instead, both sides at once, and the row grows to
                two lines. Reported with a picture of "Advanced" over
                "colors" beside "Using" over "scheme".

                The scheme trigger directly above this has always had the
                answer. `min-w-0` so a child may shrink, `truncate` on the
                part that may lose characters, `shrink-0` on the part that
                may not. This is the same three things.

                Which shrinks is a decision: the name of the control stays
                whole and the status beside it gives up characters first,
                because "Advanced colors" is what you are looking for and
                "Using scheme" is what you already know.
              */}
              <button
                type="button"
                aria-expanded={customizeOpen}
                onClick={() => setCustomizeOpen((o) => !o)}
                className="w-full flex items-center justify-between gap-2 overflow-hidden px-3 h-11 md:h-9 text-[13px]"
              >
                <span className="shrink-0 whitespace-nowrap font-medium text-foreground">Advanced colors</span>
                <span className="flex min-w-0 items-center gap-2 text-[12px] text-muted-foreground">
                  <span className="truncate">
                    {overridden > 0 ? `${overridden} customized` : "Using scheme"}
                  </span>
                  <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform duration-200", customizeOpen && "rotate-180")} />
                </span>
              </button>
              <Collapse open={customizeOpen} onlyVisible>
                {() => (
                <div className="border-t border-border px-3 pb-2">
                  {(() => {
                    const general = OVERRIDE_ROWS.flatMap((row) => row.keys.filter((k) => support.colorOverrides.includes(k)).map((k) => ({ key: k, label: row.label })))
                    const buttons = BUTTON_COLOR_GROUPS.filter((g) => g.parts.some((p) => support.colorOverrides.includes(p.key)))
                    return (
                      <>
                        {general.length > 0 && (
                          <div className="pt-2.5" data-color-group="General">
                            <p className={GROUP_HEADING}>General</p>
                            {general.map(({ key, label }) => {
                              const own = effectiveOverride(s, key)
                              return (
                                <ColorRow
                                  key={key}
                                  label={label}
                                  name={label}
                                  own={own}
                                  shown={own || colors.base[key]}
                                  hint="Scheme"
                                  onChange={(c) => applySettings(setOverride(s, key, c))}
                                  onReset={() => applySettings(setOverride(s, key, ""))}
                                />
                              )
                            })}
                          </div>
                        )}
                        {buttons.map((group, idx) => (
                          <div key={group.label} className={cn("pt-2.5", (idx > 0 || general.length > 0) && "mt-1.5 border-t border-border/60")}>
                            <ButtonColorGroup group={group} settings={s} theme={theme} onApply={applySettings} allowed={support.colorOverrides} />
                          </div>
                        ))}
                      </>
                    )
                  })()}
                  {overridden > 0 && (
                    <div className="mt-1.5 flex justify-end border-t border-border/60 pt-1.5">
                      <button
                        type="button"
                        onClick={() => applySettings(resetOverrides(s))}
                        className="min-h-8 max-sm:min-h-10 px-1 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                      >
                        Reset all to scheme
                      </button>
                    </div>
                  )}
                </div>
                )}
              </Collapse>
            </div>
          )}
        </div>
      )}

      {support.typography && (
        <div className="space-y-3">
          <p className={LABEL}>Text</p>
          <Select label="Heading style" value={headingStyle} onChange={(v) => onUpdateSetting("heading_style", v || undefined)} options={HEADING_STYLE_OPTIONS} />
          {headingStyle === "custom" && (
            <div className="rounded-lg border border-border p-3">
              <TypeStyleFields value={customHeading} base={typo.styles.h2} onChange={(next) => onUpdateSetting("custom_heading", stripTypeStyleDefaults(next, DEFAULT_TYPE_STYLES.h2))} />
            </div>
          )}
          <Select label="Body style" value={bodyStyle} onChange={(v) => onUpdateSetting("body_style", v || undefined)} options={BODY_STYLE_OPTIONS} />
          {bodyStyle === "custom" && (
            <div className="rounded-lg border border-border p-3">
              <TypeStyleFields value={customBody} base={typo.styles.body} onChange={(next) => onUpdateSetting("custom_body", stripTypeStyleDefaults(next, DEFAULT_TYPE_STYLES.body))} />
            </div>
          )}
        </div>
      )}

      {showAnimation && (
        <div className="space-y-3">
          <p className={LABEL}>Animation</p>
          <Select value={animation} onChange={(v) => onUpdateSetting("animation", v === "theme" ? undefined : v)} options={animationOptions} />
        </div>
      )}
    </div>
  )
}

// ── Theme settings: Colors ───────────────────────────────────


export function ColorsPanel({
  theme,
  updateSetting,
  onRemapSections,
  initialActive,
  onInitialActiveConsumed,
  advanced,
}: {
  theme: Theme
  updateSetting: (key: string, value: unknown) => void
  /** Move every section on the current page from one scheme to another. */
  onRemapSections: (from: string, to: string) => void
  initialActive?: string | null
  onInitialActiveConsumed?: () => void
  /** The page-level colour fields, rendered by the caller, behind a disclosure. */
  advanced?: ReactNode
}) {
  const t = asRecord(theme)
  const schemes = themeColorSchemes(t)
  const [active, setActive] = useState<string>(initialActive && schemes[initialActive] ? initialActive : FALLBACK_SCHEME_KEY)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  useEffect(() => {
    if (initialActive && schemes[initialActive]) {
      setActive(initialActive)
      onInitialActiveConsumed?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialActive])
  useEffect(() => { setConfirmDelete(false) }, [active])

  const activeKey = schemes[active] ? active : FALLBACK_SCHEME_KEY
  const current = schemes[activeKey]
  const base = isBuiltInScheme(activeKey) ? DEFAULT_COLOR_SCHEMES[activeKey] : DEFAULT_COLOR_SCHEMES[FALLBACK_SCHEME_KEY]
  const own = (t.color_schemes && typeof t.color_schemes === "object" ? t.color_schemes : {}) as Record<string, unknown>
  const defaultKey = defaultSchemeKey(t, schemes)
  const isDirty = Object.keys(stripSchemeDefaults(current, base)).length > 0

  const save = (next: ColorScheme) => {
    updateSetting("color_schemes", { ...own, [activeKey]: stripSchemeDefaults(next, base) })
  }
  const setColor = (key: SchemeColorKey, value: string) => save({ ...current, [key]: value })

  const addScheme = () => {
    const key = `custom_${Date.now().toString(36)}`
    const n = Object.keys(schemes).length + 1
    updateSetting("color_schemes", { ...own, [key]: stripSchemeDefaults(newSchemeFrom(current, `Scheme ${n}`), DEFAULT_COLOR_SCHEMES[FALLBACK_SCHEME_KEY]) })
    setActive(key)
  }

  const deleteScheme = () => {
    if (isBuiltInScheme(activeKey)) return
    const to = defaultKey === activeKey ? FALLBACK_SCHEME_KEY : defaultKey
    const rest = { ...own }
    delete rest[activeKey]
    updateSetting("color_schemes", rest)
    const remaps = (t.color_scheme_remaps && typeof t.color_scheme_remaps === "object" ? t.color_scheme_remaps : {}) as Record<string, string>
    updateSetting("color_scheme_remaps", { ...remaps, [activeKey]: to })
    if (defaultKey === activeKey) updateSetting("default_color_scheme", to)
    onRemapSections(activeKey, to)
    setActive(to)
  }

  const existing = Array.from(new Set(Object.values(current).filter((v): v is string => typeof v === "string" && /^#/.test(v)))).slice(0, 14)

  /*
    NO CONTRAST NUMBERS AND NO WARNINGS HERE. A ratio and a "Hard to read"
    list under the colours were more than somebody choosing a colour needs,
    and the owner asked for them gone. What stays is invisible: every scheme
    Storelib ships is held readable by tests/contrast.test.ts.
  */

  return (
    <div className="space-y-4">
      <div className="text-[11px] text-muted-foreground leading-relaxed flex items-start gap-1.5">
        <Info className="h-3 w-3 shrink-0 mt-0.5" />
        <p className="flex-1">Every section picks one of these schemes. Change a scheme here and every section using it changes with it.</p>
      </div>

      {/* The schemes */}
      <div className="space-y-1">
        {Object.entries(schemes).map(([key, sc]) => {
          const isActive = key === activeKey
          return (
            <button
              key={key}
              type="button"
              onClick={() => setActive(key)}
              className={cn(
                "w-full h-11 flex items-center gap-2.5 px-2.5 rounded-lg transition-colors duration-100",
                isActive ? "bg-[#1a1a2e] text-white" : "hover:bg-muted/60 text-foreground",
              )}
            >
              <Swatch scheme={sc} />
              <span className="text-sm font-medium flex-1 text-left truncate">{sc.name}</span>
              {key === defaultKey && <span className={cn("text-[10px] font-medium uppercase tracking-wider", isActive ? "text-white/70" : "text-muted-foreground")}>Default</span>}
            </button>
          )
        })}
        <button type="button" onClick={addScheme} className="w-full h-10 flex items-center gap-2 px-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors">
          <Plus className="h-4 w-4" />
          Add scheme
        </button>
      </div>

      <div className="h-px bg-border" />

      {/* The active scheme */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Swatch scheme={current} />
          <input
            type="text"
            className={cn(INPUT, "flex-1 font-medium")}
            value={current.name}
            aria-label="Scheme name"
            onChange={(e) => save({ ...current, name: e.target.value })}
            onBlur={(e) => { if (!e.target.value.trim()) save({ ...current, name: base.name }) }}
          />
        </div>
        <label className="flex items-center justify-between gap-3 text-[13px] text-foreground">
          <span>Default for new sections</span>
          <input
            type="checkbox"
            className="h-4 w-4 accent-[#1a1a2e]"
            checked={defaultKey === activeKey}
            onChange={(e) => updateSetting("default_color_scheme", e.target.checked ? activeKey : FALLBACK_SCHEME_KEY)}
          />
        </label>

        {SCHEME_COLOR_GROUPS.map((group) => (
          <div key={group.label} className="space-y-1">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{group.label}</p>
            <div>
              {group.keys.map((key, idx) => (
                <div key={key} className={cn("flex items-center justify-between gap-3 py-2.5", idx > 0 && "border-t border-border/60")}>
                  <span className="text-[13px] text-foreground flex-1 truncate">{SCHEME_COLOR_LABELS[key]}</span>
                  <ColorChip value={current[key] === "transparent" ? "" : current[key]} onChange={(c) => setColor(key, c)} existing={existing} />
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Gradient */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Gradient</p>
            <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-[#1a1a2e]"
                checked={!!current.gradient}
                onChange={(e) => save({ ...current, gradient: e.target.checked ? GRADIENT_PRESETS[0].value : "" })}
              />
              Over the background
            </label>
          </div>
          {current.gradient && (
            /* A gradient you make by looking at it: direction, stops and
               colours, with the scheme's own picker. It still saves the CSS
               string, so nothing downstream changed. */
            <GradientEditor value={current.gradient} onChange={(css) => save({ ...current, gradient: css })} existing={existing} />
          )}
        </div>

        <div className="flex items-center justify-between pt-1">
          {isBuiltInScheme(activeKey) ? (
            <button type="button" disabled={!isDirty} onClick={() => save({ ...base })} className="text-[12px] font-medium text-foreground/70 hover:text-foreground disabled:opacity-40 flex items-center gap-1">
              <RotateCcw className="h-3 w-3" />
              Reset to default
            </button>
          ) : confirmDelete ? (
            <span className="flex items-center gap-2 text-[12px]">
              <span className="text-muted-foreground">Sections on it move to {schemes[defaultKey === activeKey ? FALLBACK_SCHEME_KEY : defaultKey].name}.</span>
              <button type="button" onClick={deleteScheme} className="font-medium text-red-600 hover:text-red-700">Delete</button>
              <button type="button" onClick={() => setConfirmDelete(false)} className="font-medium text-muted-foreground hover:text-foreground">Keep</button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} className="text-[12px] font-medium text-foreground/70 hover:text-red-600 flex items-center gap-1">
              <Trash2 className="h-3 w-3" />
              Delete scheme
            </button>
          )}
        </div>
      </div>

      {advanced && (
        <div className="border-t border-border pt-3">
          {/* Same row, same three rules, before it is reported too. */}
          <button type="button" aria-expanded={advancedOpen} onClick={() => setAdvancedOpen((o) => !o)} className="w-full flex items-center justify-between gap-2 text-sm font-medium text-foreground">
            <span className="min-w-0 truncate">Page colors</span>
            <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200", advancedOpen && "rotate-180")} />
          </button>
          <p className="text-[11px] text-muted-foreground mt-1">The page behind the sections, the announcement bar and links outside any section.</p>
          {/* `pt-3` where the list had `mt-3`: the same 12px, inside the height the Collapse measures. */}
          <Collapse open={advancedOpen} onlyVisible innerClassName="space-y-4 pt-3">{advanced}</Collapse>
        </div>
      )}
    </div>
  )
}

// ── Theme settings: Typography ───────────────────────────────

export function TypographyPanel({
  theme,
  updateSetting,
  fonts,
}: {
  theme: Theme
  updateSetting: (key: string, value: unknown) => void
  /** The three font pickers, rendered by the caller from the settings group. */
  fonts: ReactNode
}) {
  const t = asRecord(theme)
  const typo = themeTypography(t)
  const bases = baseTypeStyles(t)
  const own = (t.typography_styles && typeof t.typography_styles === "object" ? t.typography_styles : {}) as Record<string, unknown>
  const [open, setOpen] = useState<TypeStyleKey | null>(null)

  const save = (key: TypeStyleKey, next: TypeStyle) => {
    const stripped = stripTypeStyleDefaults(next, bases[key])
    const nextOwn = { ...own }
    if (Object.keys(stripped).length) nextOwn[key] = stripped
    else delete nextOwn[key]
    updateSetting("typography_styles", nextOwn)
  }

  return (
    <div className="space-y-5">
      <div className="space-y-4">{fonts}</div>
      <div className="h-px bg-border" />
      <div className="space-y-1">
        <p className={LABEL}>Text styles</p>
        <p className="text-[11px] text-muted-foreground leading-relaxed">Sections use these by default. A section can pick a different style for its heading and body, or set its own.</p>
      </div>
      <div className="space-y-1">
        {TYPE_STYLE_KEYS.map((key) => {
          const st = typo.styles[key]
          const isOpen = open === key
          const changed = Object.keys(stripTypeStyleDefaults(st, bases[key])).length > 0
          const family = typo.fonts[st.font]
          return (
            <div key={key} className={cn("rounded-lg border", isOpen ? "border-neutral-300" : "border-border")}>
              <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : key)} className="w-full flex items-center gap-3 px-3 h-12 text-left">
                <span
                  className="w-10 shrink-0 text-center truncate"
                  style={{
                    fontFamily: `${family}, ui-sans-serif, system-ui, sans-serif`,
                    fontWeight: Number(st.weight),
                    fontSize: Math.min(22, Math.max(12, st.size.desktop / 2.2)),
                    textTransform: st.transform,
                  }}
                >
                  Aa
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-foreground">{TYPE_STYLE_LABELS[key]}</span>
                  <span className="block text-[11px] text-muted-foreground truncate">
                    {family} {st.weight} · {st.size.desktop}/{st.size.tablet}/{st.size.mobile}px · {st.line_height}
                  </span>
                </span>
                {changed && <span className="h-1.5 w-1.5 rounded-full bg-[#8b5cf6] shrink-0" />}
                <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 shrink-0", isOpen && "rotate-180")} />
              </button>
              <Collapse open={isOpen} onlyVisible>
                {() => (
                  <div className="border-t border-border p-3">
                    <TypeStyleFields value={st} base={bases[key]} onChange={(next) => save(key, next)} />
                  </div>
                )}
              </Collapse>
            </div>
          )
        })}
      </div>
    </div>
  )
}
