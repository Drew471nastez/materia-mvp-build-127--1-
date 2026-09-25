"use client"

/**
 * ===========================================================================
 *  THE DESIGN PANELS: COLOURS AND TYPE, GLOBAL AND PER SECTION
 * ===========================================================================
 * One model (lib/storelib-theme/color-schemes.ts and typography.ts), drawn
 * in five places:
 *
 *   SchemeTiles         a section's scheme: every scheme as a small tile
 *                       painted in it, chosen with one tap
 *   SectionDesignPanel  what a section shows: its scheme, Advanced colors
 *                       for the few it may override, and its text styles
 *   ColorsPanel         Theme settings, Colors: the schemes as a list of
 *                       cards, each opening its own editor
 *   SchemeEditor        one scheme, in a panel of its own: a live preview,
 *                       its contrast, and its colours one row each
 *   TypographyPanel     Theme settings, Typography: fonts and text styles
 *
 * "The colour schemes, the selection of the colour scheme ... editing the
 * colour scheme colours: easy, looking great."
 *
 * A scheme used to be chosen from a dropdown and edited in the same column
 * as the list of all the others, so its twenty-one colours hung under five
 * schemes that were not being edited. Now picking and editing are separate
 * places: tiles to pick, a card to open, and an editor that is only about
 * the scheme you opened. Every colour row opens its picker in place, one at
 * a time, and every group opens and closes by height (./collapse.tsx).
 *
 * Nothing here paints a colour on its own: every value goes through the same
 * resolver the canvas and the published page use.
 */

import { useEffect, useRef, useState, type ReactNode } from "react"
import { Check, ChevronDown, ChevronRight, Plus, RotateCcw, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { switchKnob, switchTrack } from "@/components/ui/switch-style"
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
  stripSchemeDefaults,
  themeColorSchemes,
  type ColorScheme,
  type SchemeColorKey,
} from "@/lib/storelib-theme/color-schemes"
import { READ_PAIRS, contrastRatio, parseColor, sayRatio, schemeContrast } from "@/lib/storelib-theme/contrast"
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
import { ColorChip, ColorPickerPanel } from "./color-chip"
import { GRADIENT_PRESETS, GradientEditor } from "./gradient-editor"
import { Collapse } from "./collapse"
import { SettingSelect, revealInScroller } from "./setting-controls"

type Theme = ThemeSettingsValues
const asRecord = (t: Theme) => t as unknown as Record<string, unknown>

// ── Small shared controls ────────────────────────────────────

const LABEL = "text-[11px] font-semibold text-muted-foreground uppercase tracking-widest"
const INPUT =
  "w-full h-9 px-3 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-400 transition-colors"
/** A colour with nothing in it, drawn as the checkerboard every editor uses for "none". */
const CHECKER = "repeating-conic-gradient(#d1d5db 0% 25%, #ffffff 0% 50%) 50% / 8px 8px"

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label?: string
  value: string
  onChange: (v: string) => void
  options: { label: string; value: string }[]
  compact?: boolean
}) {
  return (
    <div className={cn(label && "space-y-1.5")}>
      {label && <p className="wb-field-label text-[13px] font-medium text-[#374151]">{label}</p>}
      <SettingSelect label={label} value={value} onChange={onChange} options={options} />
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

/**
 * A scheme at a glance: its background, "Aa" in its heading colour, and a
 * bar in its button colour beside one in its text colour. The three things
 * that tell two schemes apart.
 */
export function SchemeSwatch({ scheme, className }: { scheme: ColorScheme; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("relative inline-flex shrink-0 overflow-hidden rounded-md border border-black/10", className ?? "h-9 w-12")}
      style={{ background: scheme.gradient || scheme.background }}
    >
      <span className="absolute left-1.5 top-1 text-[12px] font-semibold leading-none" style={{ color: scheme.heading }}>Aa</span>
      <span className="absolute bottom-1.5 left-1.5 flex items-center gap-1">
        <span className="h-1.5 w-4 rounded-full" style={{ background: scheme.primary_button_background }} />
        <span className="h-1.5 w-2.5 rounded-full opacity-80" style={{ background: scheme.text }} />
      </span>
    </span>
  )
}

// ── A section's scheme: tiles ────────────────────────────────

/**
 * Every scheme as a tile, chosen with one tap. It used to be a dropdown:
 * two taps to see the choices, one of them painted over the field it opened
 * from. Five to eight schemes fit in two short rows, so they are simply on
 * screen, and the chosen one has a ring and a check.
 */
export function SchemeTiles({
  value,
  onChange,
  theme,
}: {
  value: string
  onChange: (key: string) => void
  theme: Theme
}) {
  const schemes = themeColorSchemes(asRecord(theme))
  const activeKey = schemes[value] ? value : defaultSchemeKey(asRecord(theme), schemes)
  const keys = Object.keys(schemes)
  const move = (step: number) => {
    const at = keys.indexOf(activeKey)
    onChange(keys[(at + step + keys.length) % keys.length])
  }
  return (
    <div
      role="radiogroup"
      aria-label="Color scheme"
      data-scheme-tiles=""
      className="grid grid-cols-[repeat(auto-fill,minmax(40px,1fr))] gap-x-2 gap-y-2.5"
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); move(1) }
        if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); move(-1) }
      }}
    >
      {keys.map((key) => {
        const sc = schemes[key]
        const on = key === activeKey
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={sc.name}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(key)}
            className="group flex min-w-0 flex-col items-center gap-1 outline-none"
          >
            <span
              className={cn(
                "relative flex h-9 w-full items-center justify-center rounded-lg transition-[box-shadow] duration-150",
                on
                  ? "shadow-[0_0_0_2px_#fff,0_0_0_3.5px_#1a1a2e]"
                  : "shadow-[0_0_0_1px_rgba(15,23,42,0.1)] group-hover:shadow-[0_0_0_1px_rgba(15,23,42,0.28)] group-focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_3.5px_#9ca3af]",
              )}
              style={{ background: sc.gradient || sc.background }}
            >
              <span className="text-[13px] font-semibold leading-none" style={{ color: sc.heading }}>Aa</span>
              {on && (
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#1a1a2e] text-white">
                  <Check className="h-2.5 w-2.5" strokeWidth={3} />
                </span>
              )}
            </span>
            <span className={cn("max-w-full truncate text-[11px] leading-tight", on ? "font-medium text-[#1a1a2e]" : "text-[#6b7280]")}>{sc.name}</span>
          </button>
        )
      })}
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
 * all. Each colour now says what it is, and the two hover colours say Auto
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
 * One button's four colours as labelled swatches, with "Use scheme" when any
 * is the section's own. Shared by every section's Advanced colors and by the
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
  const anySet = parts.some((p) => effectiveOverride(settings, p.key) !== "")
  return (
    <div data-button-colors={group.label}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-medium text-foreground">{group.label}</span>
        {anySet ? (
          <button
            type="button"
            onClick={() => { let next = settings; for (const p of parts) next = setOverride(next, p.key, ""); onApply(next) }}
            className="text-[11px] font-medium text-muted-foreground hover:text-foreground"
          >
            Use scheme
          </button>
        ) : (
          <span className="text-[11px] text-muted-foreground">Scheme</span>
        )}
      </div>
      <div className="mt-2 grid grid-cols-4 gap-1.5">
        {parts.map((p) => {
          const own = effectiveOverride(settings, p.key)
          /* A hover shows what it will be: worked out from this section's button. */
          const shown = own || (isHoverKey(p.key) ? colors.scheme[p.key] : colors.base[p.key])
          const auto = !own && isHoverKey(p.key)
          return (
            <div key={p.key} className="flex flex-col items-center gap-1" title={SCHEME_COLOR_LABELS[p.key]}>
              <span className={cn("inline-flex", !own && "opacity-70")}>
                <ColorChip value={shown === "transparent" ? "" : shown} onChange={(c) => onApply(setOverride(settings, p.key, c))} existing={[]} />
              </span>
              <span className="text-[10.5px] leading-tight text-muted-foreground text-center">
                {p.label}
                {auto ? <span className="block text-[10px] text-muted-foreground/70">Auto</span> : null}
              </span>
            </div>
          )
        })}
      </div>
    </div>
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
   * SHUT, always. It opened itself whenever the section had any colour
   * override at all, and an override is set by picking one colour once. The
   * row already says "3 customized" when there is something in there.
   */
  const [customizeOpen, setCustomizeOpen] = useState(false)
  const colors = resolveSectionColors(asRecord(theme), s)
  const overridden = SECTION_OVERRIDE_KEYS.filter((k) => effectiveOverride(s, k) !== "").length
  const schemes = themeColorSchemes(asRecord(theme))
  const schemeKey = typeof s.color_scheme === "string" && schemes[s.color_scheme] ? s.color_scheme : defaultSchemeKey(asRecord(theme), schemes)

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
          <div className="flex items-center justify-between gap-3">
            <p className={LABEL}>Color scheme</p>
            {onEditScheme && (
              <button
                type="button"
                onClick={() => onEditScheme(schemeKey)}
                className="text-[12px] font-medium text-[#6b7280] underline-offset-2 transition-colors hover:text-[#1a1a2e] hover:underline"
              >
                Edit {schemes[schemeKey]?.name ?? "scheme"}
              </button>
            )}
          </div>
          <SchemeTiles
            value={typeof s.color_scheme === "string" ? s.color_scheme : ""}
            onChange={(key) => onUpdateSetting("color_scheme", key)}
            theme={theme}
          />

          {support.colorOverrides.length > 0 && (
            <div className="rounded-lg border border-border">
              {/*
                TWO LABELS IN A ROW THAT IS SOMETIMES NARROW. `min-w-0` so a
                child may shrink, `truncate` on the part that may lose
                characters, `shrink-0` on the part that may not: the name of
                the control stays whole and the status gives up characters.
              */}
              <button
                type="button"
                aria-expanded={customizeOpen}
                onClick={() => setCustomizeOpen((o) => !o)}
                className="w-full flex items-center justify-between gap-2 overflow-hidden px-3 h-11 md:h-10 text-sm"
              >
                <span className="shrink-0 whitespace-nowrap font-medium text-foreground">Advanced colors</span>
                <span className="flex min-w-0 items-center gap-2 text-[12px] text-muted-foreground">
                  {/* Said only when there is something to say: the scheme is what a section uses unless told otherwise. */}
                  {overridden > 0 && <span className="truncate">{overridden} changed</span>}
                  <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform duration-200", customizeOpen && "rotate-180")} />
                </span>
              </button>
              <Collapse open={customizeOpen}>
                {() => (
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
                    {BUTTON_COLOR_GROUPS.map((group) => (
                      <div key={group.label} className="border-t border-border/60 py-2.5">
                        <ButtonColorGroup group={group} settings={s} theme={theme} onApply={applySettings} allowed={support.colorOverrides} />
                      </div>
                    ))}
                    <div className="flex items-center justify-between gap-3 pt-2 border-t border-border/60">
                      <span className="text-[11px] text-muted-foreground">Colors left on the scheme follow it.</span>
                      {overridden > 0 && (
                        <button type="button" onClick={() => applySettings(resetOverrides(s))} className="text-[11px] font-medium text-foreground/70 hover:text-foreground flex items-center gap-1 shrink-0">
                          <RotateCcw className="h-3 w-3" />
                          Reset to scheme
                        </button>
                      )}
                    </div>
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
    </div>
  )
}

// ── Theme settings: Colors ───────────────────────────────────

/**
 * The schemes as a list of cards. A card opens its scheme's editor, a panel
 * of its own (SchemeEditor): picking which scheme to edit and editing it
 * used to share one column, with the whole scheme hanging under the list.
 */
export function ColorsPanel({
  theme,
  updateSetting,
  onOpenScheme,
  advanced,
}: {
  theme: Theme
  updateSetting: (key: string, value: unknown) => void
  /** Opens one scheme's editor. */
  onOpenScheme: (key: string) => void
  /** The page-level colour fields, rendered by the caller, behind a disclosure. */
  advanced?: ReactNode
}) {
  const t = asRecord(theme)
  const schemes = themeColorSchemes(t)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const own = (t.color_schemes && typeof t.color_schemes === "object" ? t.color_schemes : {}) as Record<string, unknown>
  const defaultKey = defaultSchemeKey(t, schemes)

  const addScheme = () => {
    const key = `custom_${Date.now().toString(36)}`
    const n = Object.keys(schemes).length + 1
    const from = schemes[defaultKey] ?? DEFAULT_COLOR_SCHEMES[FALLBACK_SCHEME_KEY]
    updateSetting("color_schemes", { ...own, [key]: stripSchemeDefaults(newSchemeFrom(from, `Scheme ${n}`), DEFAULT_COLOR_SCHEMES[FALLBACK_SCHEME_KEY]) })
    onOpenScheme(key)
  }

  return (
    <div className="space-y-4">
      <p className="text-[12.5px] leading-relaxed text-[#6b7280]">Every section uses one of these. Change a scheme and every section on it changes.</p>

      <div className="space-y-1.5" data-scheme-list="">
        {Object.entries(schemes).map(([key, sc]) => (
          <button
            key={key}
            type="button"
            onClick={() => onOpenScheme(key)}
            className="group flex h-14 w-full items-center gap-3 rounded-xl border border-[#e5e7eb] bg-white px-2.5 text-left transition-[border-color,box-shadow] duration-150 hover:border-[#d1d5db] hover:shadow-[0_1px_3px_rgba(0,0,0,0.05)] focus:outline-none focus-visible:ring-2 focus-visible:ring-black/10"
          >
            <SchemeSwatch scheme={sc} />
            <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-[#1a1a2e]">{sc.name}</span>
            {key === defaultKey && <span className="shrink-0 text-[11.5px] text-[#6b7280]">Default</span>}
            <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-[#9ca3af] transition-transform duration-150 group-hover:translate-x-0.5" />
          </button>
        ))}
        <button
          type="button"
          onClick={addScheme}
          className="flex h-11 w-full items-center gap-2 rounded-xl px-2.5 text-[13.5px] font-medium text-[#6b7280] transition-colors hover:bg-[#f6f7f8] hover:text-[#1a1a2e]"
        >
          <Plus className="h-4 w-4" />
          Add scheme
        </button>
      </div>

      {advanced && (
        <div className="border-t border-border pt-3">
          {/* Same row, same three rules as Advanced colors. */}
          <button type="button" aria-expanded={advancedOpen} onClick={() => setAdvancedOpen((o) => !o)} className="flex h-9 w-full items-center justify-between gap-2 text-sm font-medium text-foreground">
            <span className="min-w-0 truncate">Page colors</span>
            <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200", advancedOpen && "rotate-180")} />
          </button>
          <p className="text-[11px] text-muted-foreground">Behind and between sections, and the announcement bar.</p>
          <Collapse open={advancedOpen} innerClassName="space-y-4 pt-3">
            {advanced}
          </Collapse>
        </div>
      )}
    </div>
  )
}

/** A scheme drawn as a tiny section: heading, text, a link and both buttons. */
function SchemePreview({ scheme }: { scheme: ColorScheme }) {
  return (
    <div
      data-scheme-preview=""
      className="overflow-hidden rounded-xl border border-black/[0.08] px-4 py-4"
      style={{ background: scheme.gradient || scheme.background }}
    >
      <p className="text-[17px] font-semibold leading-tight" style={{ color: scheme.heading }}>Heading</p>
      <p className="mt-1 text-[12.5px] leading-snug" style={{ color: scheme.text }}>
        Body text, with <span className="underline underline-offset-2" style={{ color: scheme.link }}>a link</span> in it.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <span
          className="rounded-md border px-3 py-1.5 text-[12px] font-semibold leading-none"
          style={{ background: scheme.primary_button_background, color: scheme.primary_button_text, borderColor: scheme.primary_button_border }}
        >
          Primary
        </span>
        <span
          className="rounded-md border px-3 py-1.5 text-[12px] font-semibold leading-none"
          style={{ background: scheme.secondary_button_background, color: scheme.secondary_button_text, borderColor: scheme.secondary_button_border }}
        >
          Secondary
        </span>
      </div>
    </div>
  )
}

/** What each colour is read against, for the ratio shown under its picker. */
const READ_AGAINST: Partial<Record<SchemeColorKey, SchemeColorKey>> = Object.fromEntries(
  READ_PAIRS.filter((p) => p.bg !== "background_secondary").map((p) => [p.fg, p.bg]),
) as Partial<Record<SchemeColorKey, SchemeColorKey>>

/** The four pairs worth a line each in the readout. */
const READOUT = READ_PAIRS.filter((p) =>
  (p.fg === "text" && p.bg === "background") ||
  (p.fg === "heading" && p.bg === "background") ||
  p.fg === "primary_button_text" ||
  p.fg === "secondary_button_text",
)
const READOUT_LABEL: Record<string, string> = {
  "text/background": "Text",
  "heading/background": "Headings",
  "primary_button_text/primary_button_background": "Primary button",
  "secondary_button_text/secondary_button_background": "Secondary button",
}

/** A pair's ratio, falling back to the background where the scheme leaves a colour transparent. */
function pairRatio(scheme: ColorScheme, fg: SchemeColorKey, bg: SchemeColorKey): number | null {
  const f = parseColor(scheme[fg])
  const b = parseColor(scheme[bg]) ?? parseColor(scheme.background)
  if (!f || !b) return null
  return contrastRatio(f, b)
}

/** One colour: its row, and its picker opening under it. */
function ColorRow({
  label,
  value,
  onChange,
  existing,
  open,
  onToggle,
  against,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  existing: string[]
  open: boolean
  onToggle: () => void
  against?: { label: string; color: string }
}) {
  const shown = !value || value === "transparent" ? "" : value
  /* A picker that opens below the fold has opened somewhere nobody is looking. */
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(() => revealInScroller(root.current), 260)
    return () => window.clearTimeout(t)
  }, [open])
  return (
    <div ref={root} className={cn("rounded-lg transition-colors duration-150", open && "bg-[#f6f7f8]")} data-color-row={label}>
      <button type="button" aria-expanded={open} onClick={onToggle} className="flex h-11 w-full items-center gap-3 rounded-lg px-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-black/10">
        <span className="min-w-0 flex-1 truncate text-[13px] text-[#1a1a2e]">{label}</span>
        <span className="font-mono text-[11px] uppercase tabular-nums text-[#6b7280]">{shown || "None"}</span>
        <span aria-hidden className="h-6 w-6 shrink-0 rounded-md border border-black/10" style={{ background: shown || CHECKER }} />
      </button>
      <Collapse open={open} innerClassName="px-2.5 pb-3">
        {() => <ColorPickerPanel value={shown} onChange={onChange} existing={existing} against={against} />}
      </Collapse>
    </div>
  )
}

/**
 * ===========================================================================
 *  ONE SCHEME, IN A PANEL OF ITS OWN
 * ===========================================================================
 * Opened from a card in Colors, or from Edit beside a section's scheme. At
 * the top, the scheme drawn as a small section, so every change is seen on
 * something that looks like a page; under it, how readable its pairs are;
 * then its colours, one row each, opening one picker at a time.
 */
export function SchemeEditor({
  theme,
  schemeKey,
  updateSetting,
  onRemapSections,
  onDeleted,
}: {
  theme: Theme
  schemeKey: string
  updateSetting: (key: string, value: unknown) => void
  /** Move every section on the current page from one scheme to another. */
  onRemapSections: (from: string, to: string) => void
  /** The scheme is gone; the caller goes back to the list. */
  onDeleted: () => void
}) {
  const t = asRecord(theme)
  const schemes = themeColorSchemes(t)
  const activeKey = schemes[schemeKey] ? schemeKey : FALLBACK_SCHEME_KEY
  const current = schemes[activeKey]
  const base = isBuiltInScheme(activeKey) ? DEFAULT_COLOR_SCHEMES[activeKey] : DEFAULT_COLOR_SCHEMES[FALLBACK_SCHEME_KEY]
  const own = (t.color_schemes && typeof t.color_schemes === "object" ? t.color_schemes : {}) as Record<string, unknown>
  const defaultKey = defaultSchemeKey(t, schemes)
  const isDirty = Object.keys(stripSchemeDefaults(current, base)).length > 0
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [openRow, setOpenRow] = useState<SchemeColorKey | null>(null)
  useEffect(() => { setConfirmDelete(false); setOpenRow(null) }, [activeKey])

  const save = (next: ColorScheme) => {
    updateSetting("color_schemes", { ...own, [activeKey]: stripSchemeDefaults(next, base) })
  }
  const setColor = (key: SchemeColorKey, value: string) => save({ ...current, [key]: value })

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
    onDeleted()
  }

  const existing = Array.from(new Set(Object.values(current).filter((v): v is string => typeof v === "string" && /^#/.test(v)))).slice(0, 16)

  /**
   * Twenty-one colours can be set to anything, and the pair that stops being
   * readable is the one nobody notices: it looks fine on the screen it was
   * picked on. The ratio is arithmetic, so it can simply be said. It is a
   * note and not a block: a scheme the editor refuses to save is worse than
   * one it has an opinion about.
   */
  const contrast = schemeContrast(current)
  const isDefault = defaultKey === activeKey

  return (
    <div className="space-y-5" data-scheme-editor={activeKey}>
      <SchemePreview scheme={current} />

      <div className="space-y-3">
        <input
          type="text"
          className={cn(INPUT, "h-10 font-medium")}
          value={current.name}
          aria-label="Scheme name"
          onChange={(e) => save({ ...current, name: e.target.value })}
          onBlur={(e) => { if (!e.target.value.trim()) save({ ...current, name: base.name }) }}
        />
        <label className="flex cursor-pointer items-center justify-between gap-3 text-[13px] text-foreground">
          <span>Default for new sections</span>
          <button
            type="button"
            role="switch"
            aria-checked={isDefault}
            onClick={() => updateSetting("default_color_scheme", isDefault ? FALLBACK_SCHEME_KEY : activeKey)}
            className={cn(switchTrack(isDefault), "cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#111113]/30 focus-visible:ring-offset-2")}
          >
            <span className={switchKnob(isDefault)} />
          </button>
        </label>
      </div>

      {/* How readable it is: four pairs, each with its ratio. */}
      <div className="rounded-lg border border-[#e5e7eb]" data-contrast-readout="">
        {READOUT.map((pair, i) => {
          const ratio = pairRatio(current, pair.fg, pair.bg)
          const low = ratio !== null && ratio < pair.need - 0.005
          return (
            <div key={`${pair.fg}/${pair.bg}`} className={cn("flex h-9 items-center justify-between gap-3 px-3 text-[12.5px]", i > 0 && "border-t border-[#f0f1f3]")}>
              <span className="text-[#4b5563]">{READOUT_LABEL[`${pair.fg}/${pair.bg}`] ?? pair.label}</span>
              {ratio === null || (current.gradient && pair.bg === "background") ? (
                <span className="text-[#9ca3af]">Not measured</span>
              ) : (
                <span className={cn("flex items-center gap-1.5 tabular-nums", low ? "font-medium text-[#b45309]" : "text-[#1a1a2e]")}>
                  {(Math.round(ratio * 10) / 10).toFixed(1)} : 1
                  {low ? <span className="text-[11px]">Low</span> : <Check aria-hidden className="h-3.5 w-3.5 text-[#15803d]" strokeWidth={2.5} />}
                </span>
              )}
            </div>
          )
        })}
      </div>
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
          <p className="px-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#6b7280]">{group.label}</p>
          <div className="space-y-0.5">
            {group.keys.map((key) => {
              const bgKey = READ_AGAINST[key]
              const against = bgKey ? { label: SCHEME_COLOR_LABELS[bgKey], color: current[bgKey] === "transparent" ? current.background : current[bgKey] } : undefined
              return (
                <ColorRow
                  key={key}
                  label={SCHEME_COLOR_LABELS[key]}
                  value={current[key]}
                  onChange={(c) => setColor(key, c)}
                  existing={existing}
                  open={openRow === key}
                  onToggle={() => setOpenRow((o) => (o === key ? null : key))}
                  against={against}
                />
              )
            })}
          </div>
        </div>
      ))}

      {/* Gradient */}
      <div className="space-y-2">
        <label className="flex cursor-pointer items-center justify-between gap-3 px-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#6b7280]">Gradient</span>
          <span className="flex items-center gap-2 text-[12px] text-muted-foreground">
            Over the background
            <button
              type="button"
              role="switch"
              aria-checked={!!current.gradient}
              onClick={() => save({ ...current, gradient: current.gradient ? "" : GRADIENT_PRESETS[0].value })}
              className={cn(switchTrack(!!current.gradient), "cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#111113]/30 focus-visible:ring-offset-2")}
            >
              <span className={switchKnob(!!current.gradient)} />
            </button>
          </span>
        </label>
        <Collapse open={!!current.gradient}>
          {() => (
            /* A gradient you make by looking at it; it still saves the CSS string. */
            <GradientEditor value={current.gradient} onChange={(css) => save({ ...current, gradient: css })} existing={existing} />
          )}
        </Collapse>
      </div>

      <div className="flex items-center justify-between border-t border-[#f0f1f3] pt-3">
        {isBuiltInScheme(activeKey) ? (
          <button type="button" disabled={!isDirty} onClick={() => save({ ...base })} className="text-[12.5px] font-medium text-foreground/70 hover:text-foreground disabled:opacity-40 flex items-center gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" />
            Reset to default
          </button>
        ) : confirmDelete ? (
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
            <span className="text-muted-foreground">Sections on it move to {schemes[defaultKey === activeKey ? FALLBACK_SCHEME_KEY : defaultKey].name}.</span>
            <button type="button" onClick={deleteScheme} className="font-medium text-red-600 hover:text-red-700">Delete</button>
            <button type="button" onClick={() => setConfirmDelete(false)} className="font-medium text-muted-foreground hover:text-foreground">Keep</button>
          </span>
        ) : (
          <button type="button" onClick={() => setConfirmDelete(true)} className="text-[12.5px] font-medium text-foreground/70 hover:text-red-600 flex items-center gap-1.5">
            <Trash2 className="h-3.5 w-3.5" />
            Delete scheme
          </button>
        )}
      </div>
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
        <p className="text-[11px] text-muted-foreground leading-relaxed">Sections use these unless they pick another style or set their own.</p>
      </div>
      <div className="space-y-1">
        {TYPE_STYLE_KEYS.map((key) => {
          const st = typo.styles[key]
          const isOpen = open === key
          const changed = Object.keys(stripTypeStyleDefaults(st, bases[key])).length > 0
          const family = typo.fonts[st.font]
          return (
            <div key={key} className={cn("rounded-lg border transition-colors duration-150", isOpen ? "border-neutral-300" : "border-border")}>
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
                {changed && <span className="h-1.5 w-1.5 rounded-full bg-[#1a1a2e] shrink-0" aria-label="Changed" />}
                <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 shrink-0", isOpen && "rotate-180")} />
              </button>
              <Collapse open={isOpen}>
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
