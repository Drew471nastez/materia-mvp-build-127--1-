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
  defaultSchemeKey,
  isBuiltInScheme,
  newSchemeFrom,
  resolveSectionColors,
  stripSchemeDefaults,
  themeColorSchemes,
  type ColorScheme,
  type SchemeColorKey,
} from "@/lib/storelib-theme/color-schemes"
import { sayRatio, schemeContrast } from "@/lib/storelib-theme/contrast"
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
import { effectiveOverride, hasOverrides, resetOverrides, setOverride } from "@/lib/website-builder/section-overrides"
import type { SchemaField, SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"
import { ColorChip } from "./color-chip"

type Theme = ThemeSettingsValues
const asRecord = (t: Theme) => t as unknown as Record<string, unknown>

// ── Small shared controls ────────────────────────────────────

const LABEL = "text-[11px] font-semibold text-muted-foreground uppercase tracking-widest"
const INPUT =
  "w-full h-9 px-3 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-400 transition-colors"

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
      {label && <p className="text-sm font-medium text-foreground">{label}</p>}
      <div className="relative">
        <select
          className={cn(INPUT, "pr-8 appearance-none cursor-pointer", compact ? "h-9" : "h-10")}
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
  const [open, setOpen] = useState(false)
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
          size === "sm" ? "h-10" : "h-12",
          open ? "border-blue-500" : "border-neutral-200 hover:border-neutral-300",
        )}
        style={{ background: active.gradient || active.background, color: active.heading }}
      >
        <span className="flex items-center gap-2.5 min-w-0">
          <span className={cn("font-bold", size === "sm" ? "text-[14px]" : "text-[16px]")}>Aa</span>
          <span className={cn("font-medium truncate", size === "sm" ? "text-[13px]" : "text-[14px]")}>{active.name}</span>
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

      {open && (
        <div
          className="absolute left-0 right-0 top-full mt-2 z-50 rounded-xl border border-neutral-200 bg-popover shadow-lg p-1.5 space-y-1 origin-top max-h-[320px] overflow-y-auto wb-slim-scroll"
          style={{ animation: "scheme-dropdown-in 180ms cubic-bezier(0.32, 0.72, 0, 1) both" }}
        >
          <style jsx>{`
            @keyframes scheme-dropdown-in {
              from { opacity: 0; transform: translateY(-4px) scaleY(0.98); }
              to   { opacity: 1; transform: translateY(0) scaleY(1); }
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
                  isActive ? "border-blue-500" : "border-transparent hover:border-blue-200",
                )}
                style={{ background: sc.gradient || sc.background, color: sc.heading }}
              >
                <button
                  type="button"
                  onClick={() => { onChange(key); setOpen(false) }}
                  className="flex h-11 min-w-0 flex-1 cursor-pointer items-center gap-2.5 px-3 text-left"
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
  { label: "Primary button", keys: ["primary_button_background", "primary_button_text"] },
  { label: "Secondary button", keys: ["secondary_button_background", "secondary_button_text"] },
]

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
  const [customizeOpen, setCustomizeOpen] = useState(() => hasOverrides(s))
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

  if (!support.colorScheme && !support.typography) return null

  return (
    <div className={cn(!compact && "border-b border-border p-4", "space-y-4")}>
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
              <button
                type="button"
                onClick={() => setCustomizeOpen((o) => !o)}
                className="w-full flex items-center justify-between px-3 h-10 text-sm"
              >
                <span className="font-medium text-foreground">Advanced colors</span>
                <span className="flex items-center gap-2 text-[12px] text-muted-foreground">
                  {overridden > 0 ? `${overridden} customized` : "Using scheme"}
                  <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", customizeOpen && "rotate-180")} />
                </span>
              </button>
              {customizeOpen && (
                <div className="border-t border-border px-3 py-2">
                  {OVERRIDE_ROWS.filter((row) => row.keys.some((k) => support.colorOverrides.includes(k))).map((row, idx) => {
                    const keys = row.keys.filter((k) => support.colorOverrides.includes(k))
                    const anySet = keys.some((k) => effectiveOverride(s, k) !== "")
                    return (
                      <div key={row.label} className={cn("flex items-center justify-between gap-3 py-2", idx > 0 && "border-t border-border/60")}>
                        <span className="text-[13px] text-foreground flex-1 truncate">{row.label}</span>
                        <div className="flex items-center gap-1.5">
                          {keys.map((k) => {
                            const own = effectiveOverride(s, k)
                            const shown = own || colors.base[k]
                            return (
                              <span key={k} className={cn("inline-flex", !own && "opacity-60")} title={own ? SCHEME_COLOR_LABELS[k] : `${SCHEME_COLOR_LABELS[k]}: use scheme`}>
                                <ColorChip value={shown === "transparent" ? "" : shown} onChange={(c) => applySettings(setOverride(s, k, c))} existing={[]} />
                              </span>
                            )
                          })}
                          {anySet ? (
                            <button
                              type="button"
                              onClick={() => { let next = s; for (const k of keys) next = setOverride(next, k, ""); applySettings(next) }}
                              className="text-[11px] font-medium text-muted-foreground hover:text-foreground w-[68px] text-right"
                            >
                              Use scheme
                            </button>
                          ) : (
                            <span className="text-[11px] text-muted-foreground w-[68px] text-right">Scheme</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  <div className="flex items-center justify-between pt-2 border-t border-border/60">
                    <span className="text-[11px] text-muted-foreground">A global scheme change still reaches every color left on the scheme.</span>
                    {overridden > 0 && (
                      <button type="button" onClick={() => applySettings(resetOverrides(s))} className="text-[11px] font-medium text-foreground/70 hover:text-foreground flex items-center gap-1 shrink-0">
                        <RotateCcw className="h-3 w-3" />
                        Reset to scheme
                      </button>
                    )}
                  </div>
                </div>
              )}
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
    </div>
  )
}

// ── Theme settings: Colors ───────────────────────────────────

const GRADIENT_PRESETS: { label: string; value: string }[] = [
  { label: "Dusk", value: "linear-gradient(135deg, #0f172a 0%, #4c1d95 100%)" },
  { label: "Sunrise", value: "linear-gradient(135deg, #fde68a 0%, #f472b6 100%)" },
  { label: "Ocean", value: "linear-gradient(160deg, #0ea5e9 0%, #1e3a8a 100%)" },
  { label: "Mist", value: "linear-gradient(180deg, #ffffff 0%, #f1f5f9 100%)" },
]

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

  /**
   * Seventeen colours can be set to anything, and the pair that stops being
   * readable is the one nobody notices: it looks fine on the screen it was
   * picked on. The ratio is arithmetic, so it can simply be said. It is a
   * note and not a block. Somebody may have a reason, and a scheme the
   * editor refuses to save is worse than one it has an opinion about.
   */
  const contrast = schemeContrast(current)

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

        {contrast.failing.length > 0 && (
          <div className="border-l-2 border-[#c2751a] pl-2.5 space-y-0.5">
            <p className="text-[12px] font-medium text-foreground">Hard to read</p>
            {contrast.failing.map((f) => (
              <p key={`${f.fg}-${f.bg}`} className="text-[12px] text-muted-foreground leading-snug">
                {f.label} is {sayRatio(f.ratio)}, under the {f.need} to 1 it needs.
              </p>
            ))}
          </div>
        )}
        {current.gradient && contrast.unknown.length > 0 && (
          <p className="text-[12px] text-muted-foreground leading-snug">
            A gradient sits over the background, so text on it is not measured here.
          </p>
        )}

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
            <div className="space-y-2">
              <div className="grid grid-cols-4 gap-1.5">
                {GRADIENT_PRESETS.map((g) => (
                  <button
                    key={g.label}
                    type="button"
                    title={g.label}
                    onClick={() => save({ ...current, gradient: g.value })}
                    className={cn("h-8 rounded-md border-2", current.gradient === g.value ? "border-blue-500" : "border-transparent hover:border-neutral-300")}
                    style={{ background: g.value }}
                  />
                ))}
              </div>
              <input
                type="text"
                className={cn(INPUT, "font-mono text-[12px]")}
                value={current.gradient}
                onChange={(e) => save({ ...current, gradient: e.target.value })}
                placeholder="linear-gradient(135deg, #000 0%, #333 100%)"
              />
            </div>
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
          <button type="button" onClick={() => setAdvancedOpen((o) => !o)} className="w-full flex items-center justify-between text-sm font-medium text-foreground">
            Page colors
            <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform duration-200", advancedOpen && "rotate-180")} />
          </button>
          <p className="text-[11px] text-muted-foreground mt-1">The page behind the sections, the announcement bar and links outside any section.</p>
          {advancedOpen && <div className="space-y-4 mt-3">{advanced}</div>}
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
              <button type="button" onClick={() => setOpen(isOpen ? null : key)} className="w-full flex items-center gap-3 px-3 h-12 text-left">
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
                {changed && <span className="h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />}
                <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 shrink-0", isOpen && "rotate-180")} />
              </button>
              {isOpen && (
                <div className="border-t border-border p-3">
                  <TypeStyleFields value={st} base={bases[key]} onChange={(next) => save(key, next)} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
