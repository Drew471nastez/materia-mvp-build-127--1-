"use client"

/**
 * ===========================================================================
 *  THEME SETTINGS › DESIGN TOKENS, FOR A WEBSITE THE AI BUILT
 * ===========================================================================
 * The few values the whole site is drawn from, on one panel: its colours,
 * its two fonts and type scale, corners, shadow, spacing and width, motion,
 * and the named values the AI made up for this site (custom tokens). Every
 * one of them is a Theme setting (lib/ai-builder/tokens.ts), so this panel
 * writes exactly what Colors, Typography, Layout and Animations write, and
 * one group at a time (tokenPatch): changing the accent never rewrites a
 * radius somebody set in Layout. Components read them as `var(--t-*)`,
 * `var(--theme-*)` and the scheme's colours, so the canvas follows at once,
 * and a component's own setting still wins where it has one.
 *
 * "Used by" names the AI's components that read a custom token, so removing
 * one is a decision made knowing what it touches.
 */
import { useMemo, useState } from "react"
import { Plus, Trash2 } from "lucide-react"

import { ColorField } from "@/components/storefront/color-field"
import { FontPreviewPicker } from "@/components/website-builder/editor/font-preview-picker"
import { SliderNumberControl } from "@/components/website-builder/editor/slider-number-control"
import { ChoiceControl } from "@/components/website-builder/editor/controls/choice-control"
import { INPUT, NOTE, TEXT_BUTTON, ICON_BUTTON, PROBLEM } from "@/components/website-builder/editor/controls/styles"
import { BODY_FONT_OPTIONS, HEADING_FONT_OPTIONS } from "@/lib/website-builder/font-options"
import { MAX_CUSTOM_TOKENS, SCALE_TOKENS, TOKEN_NAME, cleanTokenValue, themeSettingsToTokens, tokenPatch, tokenUsage, type TokenGroup } from "@/lib/ai-builder/tokens"
import type { DesignTokens } from "@/lib/ai-builder/types"
import { tt } from "@/lib/i18n/text"

const LABEL = "text-xs font-medium text-muted-foreground mb-1.5 block"
const GROUP = "space-y-3 border-t border-border pt-4 first:border-t-0 first:pt-0"
const HEADING = "text-[11px] font-semibold uppercase tracking-widest text-muted-foreground"

type ColorKey = keyof Omit<DesignTokens["colors"], "inverse">
const COLOR_KEYS: ColorKey[] = ["background", "surface", "text", "muted", "accent", "accentText", "border"]
/** Each colour's name, in the creator's language. */
function colorLabel(key: ColorKey): string {
  switch (key) {
    case "background": return tt("Background")
    case "surface": return tt("Surface")
    case "text": return tt("Text")
    case "muted": return tt("Muted text")
    case "accent": return tt("Accent")
    case "accentText": return tt("Text on accent")
    default: return tt("Border")
  }
}

/** Whether a website should show this panel: the AI set its tokens, or it has a component of the AI's. */
export function showsDesignTokens(theme: Record<string, unknown> | null | undefined, sources: Record<string, string>): boolean {
  return !!theme && ("custom_tokens" in theme || "ai_section_y" in theme || Object.keys(sources).some((p) => /^sections\/ai_[a-z0-9_]+\.storelib$/.test(p)))
}

export function DesignTokensPanel({
  theme,
  updateSetting,
  sources,
}: {
  theme: Record<string, unknown>
  updateSetting: (key: string, value: unknown) => void
  /** The install's own section files, for "used by". */
  sources: Record<string, string>
}) {
  const tokens = useMemo(() => themeSettingsToTokens(theme), [theme])
  const usage = useMemo(() => tokenUsage(sources), [sources])
  const apply = (group: TokenGroup, next: DesignTokens) => {
    for (const [key, value] of Object.entries(tokenPatch(group, next, theme))) updateSetting(key, value)
  }
  const color = (key: ColorKey, v: string) => apply("colors", { ...tokens, colors: { ...tokens.colors, [key]: v } })
  const scale = tokens.typeScale ?? { base: 16, ratio: 1.25 }

  return (
    <div className="space-y-5" data-design-tokens="">
      <p className={NOTE}>{tt("The values your whole website is drawn from. A section's own setting still wins where it has one.")}</p>

      <section className={GROUP} data-token-group="colors">
        <p className={HEADING}>{tt("Colors")}</p>
        {COLOR_KEYS.map((key) => (
          <ColorField key={key} label={colorLabel(key)} value={tokens.colors[key]} fallback={tokens.colors[key]} onChange={(v) => color(key, v)} />
        ))}
      </section>

      <section className={GROUP} data-token-group="type">
        <p className={HEADING}>{tt("Type")}</p>
        <FontPreviewPicker label={tt("Heading font")} value={tokens.fonts.heading} options={HEADING_FONT_OPTIONS} onChange={(v) => apply("fonts", { ...tokens, fonts: { ...tokens.fonts, heading: v } })} />
        <FontPreviewPicker label={tt("Body font")} value={tokens.fonts.body} options={BODY_FONT_OPTIONS} onChange={(v) => apply("fonts", { ...tokens, fonts: { ...tokens.fonts, body: v } })} />
        <div>
          <span className={LABEL}>{tt("Body size")}</span>
          <SliderNumberControl value={scale.base} min={12} max={22} step={1} unit="px" onChange={(v) => apply("typeScale", { ...tokens, typeScale: { ...scale, base: Number(v) } })} />
        </div>
        <div>
          <span className={LABEL}>{tt("Heading scale")}</span>
          <SliderNumberControl value={scale.ratio} min={1.05} max={1.6} step={0.01} onChange={(v) => apply("typeScale", { ...tokens, typeScale: { ...scale, ratio: Number(v) } })} />
          <p className={`${NOTE} mt-1`}>{tt("How much bigger each heading is than the one below it.")}</p>
        </div>
      </section>

      <section className={GROUP} data-token-group="shape">
        <p className={HEADING}>{tt("Corners and shadow")}</p>
        {(["small", "medium", "large"] as const).map((k) => (
          <div key={k}>
            <span className={LABEL}>{tt(k === "small" ? "Small corners" : k === "medium" ? "Card corners" : "Large corners")}</span>
            <SliderNumberControl value={tokens.radius[k]} min={0} max={k === "large" ? 40 : 24} step={1} unit="px" onChange={(v) => apply("radius", { ...tokens, radius: { ...tokens.radius, [k]: Number(v) } })} />
          </div>
        ))}
        <div>
          <span className={LABEL}>{tt("Shadow")}</span>
          <ChoiceControl
            label={tt("Shadow")}
            value={tokens.shadow ?? "none"}
            options={[{ value: "none", label: tt("None") }, { value: "sm", label: tt("Small") }, { value: "md", label: tt("Medium") }, { value: "lg", label: tt("Large") }]}
            onChange={(v) => apply("shadow", { ...tokens, shadow: v as DesignTokens["shadow"] })}
          />
        </div>
      </section>

      <section className={GROUP} data-token-group="space">
        <p className={HEADING}>{tt("Spacing and width")}</p>
        <div>
          <span className={LABEL}>{tt("Section spacing")}</span>
          <SliderNumberControl value={tokens.spacing.sectionY} min={0} max={240} step={4} unit="px" onChange={(v) => apply("spacing", { ...tokens, spacing: { ...tokens.spacing, sectionY: Number(v) } })} />
        </div>
        <div>
          <span className={LABEL}>{tt("Page width")}</span>
          <SliderNumberControl value={tokens.spacing.pageWidth} min={900} max={1800} step={20} unit="px" onChange={(v) => apply("spacing", { ...tokens, spacing: { ...tokens.spacing, pageWidth: Number(v) } })} />
        </div>
        <div>
          <span className={LABEL}>{tt("Side padding")}</span>
          <SliderNumberControl value={tokens.spacing.gutter} min={8} max={80} step={4} unit="px" onChange={(v) => apply("spacing", { ...tokens, spacing: { ...tokens.spacing, gutter: Number(v) } })} />
        </div>
      </section>

      <section className={GROUP} data-token-group="motion">
        <p className={HEADING}>{tt("Motion")}</p>
        <ChoiceControl
          label={tt("Motion")}
          value={tokens.motion.level}
          options={[{ value: "none", label: tt("None") }, { value: "subtle", label: tt("Subtle") }, { value: "expressive", label: tt("Lively") }]}
          onChange={(v) => apply("motion", { ...tokens, motion: { level: v as DesignTokens["motion"]["level"], durationMs: tokens.motion.durationMs } })}
        />
        {tokens.motion.level !== "none" ? (
          <div>
            <span className={LABEL}>{tt("Duration")}</span>
            <SliderNumberControl value={tokens.motion.durationMs ?? 600} min={200} max={1200} step={50} unit="ms" onChange={(v) => apply("motion", { ...tokens, motion: { ...tokens.motion, durationMs: Number(v) } })} />
          </div>
        ) : null}
        <p className={NOTE}>{tt("Visitors who turn off motion on their device see the site without it.")}</p>
      </section>

      <CustomTokens tokens={tokens} usage={usage} onChange={(custom) => apply("custom", { ...tokens, custom })} />
    </div>
  )
}

/** The named values the AI made for this site, `--t-<name>`: change a value, add one, remove one. */
function CustomTokens({ tokens, usage, onChange }: { tokens: DesignTokens; usage: Record<string, string[]>; onChange: (next: Record<string, string>) => void }) {
  const custom = tokens.custom ?? {}
  const [name, setName] = useState("")
  const [value, setValue] = useState("")
  const [problem, setProblem] = useState<string | null>(null)
  const names = Object.keys(custom)
  const add = () => {
    const n = name.trim().toLowerCase().replace(/^--t-/, "")
    const v = cleanTokenValue(value)
    if (!TOKEN_NAME.test(n)) return setProblem(tt("A name is lowercase letters, numbers and hyphens, starting with a letter."))
    if ((SCALE_TOKENS as readonly string[]).includes(n)) return setProblem(tt("That name is one of the site's own. Pick another."))
    if (v === null) return setProblem(tt("That value cannot be used. Try a color, a size or a number."))
    if (names.length >= MAX_CUSTOM_TOKENS && !(n in custom)) return setProblem(tt("A site keeps {n} custom tokens at most.", { n: MAX_CUSTOM_TOKENS }))
    setProblem(null)
    setName("")
    setValue("")
    onChange({ ...custom, [n]: v })
  }
  return (
    <section className={GROUP} data-token-group="custom">
      <p className={HEADING}>{tt("Custom tokens")}</p>
      {names.length === 0 ? <p className={NOTE}>{tt("None yet. Sections read one as var(--t-name).")}</p> : null}
      <ul className="space-y-2">
        {names.map((n) => {
          const users = usage[n] ?? []
          return (
            <li key={n} data-custom-token={n} className="space-y-1">
              <div className="flex items-center gap-2">
                <code className="min-w-0 shrink truncate text-[12px] text-foreground" title={`--t-${n}`}>{`--t-${n}`}</code>
                <input
                  aria-label={tt("Value of {name}", { name: n })}
                  className={`${INPUT} min-w-0 flex-1`}
                  defaultValue={custom[n]}
                  onBlur={(e) => {
                    const v = cleanTokenValue(e.target.value)
                    if (v === null) { e.target.value = custom[n]; return }
                    if (v !== custom[n]) onChange({ ...custom, [n]: v })
                  }}
                />
                <button type="button" className={ICON_BUTTON} aria-label={tt("Remove {name}", { name: n })} onClick={() => { const next = { ...custom }; delete next[n]; onChange(next) }}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className={NOTE}>{users.length ? tt("Used by {list}", { list: users.map((p) => p.replace(/^sections\//, "").replace(/\.storelib$/, "")).join(", ") }) : tt("Not used by any section yet")}</p>
            </li>
          )
        })}
      </ul>
      <div className="flex items-center gap-2">
        <input aria-label={tt("New token name")} className={`${INPUT} min-w-0 flex-1`} placeholder="brand-stripe" value={name} onChange={(e) => setName(e.target.value)} />
        <input aria-label={tt("New token value")} className={`${INPUT} min-w-0 flex-1`} placeholder="#9a3412" value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add() }} />
      </div>
      <button type="button" className={TEXT_BUTTON} onClick={add} data-add-token="">
        <Plus className="mr-1 h-3.5 w-3.5" />
        {tt("Add token")}
      </button>
      {problem ? <p className={PROBLEM} role="alert">{problem}</p> : null}
    </section>
  )
}
