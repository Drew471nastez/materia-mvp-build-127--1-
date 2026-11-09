"use client"

/**
 * ===========================================================================
 *  THEME SETTINGS › ONE OF THE SITE'S OWN GROUPS (round N, N5)
 * ===========================================================================
 * An AI-built website declares its own settings (lib/ai-builder/site-settings.ts):
 * a Palette with its colours by name, its Type, its Shape, a Texture toggle.
 * This draws one group with the editor's own controls. A change writes the
 * Theme settings it stands for (designPatch: the token's settings, or the
 * site's own custom token), so the canvas, which reads `var(--t-*)`, follows
 * at once like any other Theme setting.
 */
import type React from "react"
import { useMemo } from "react"

import { ColorField } from "@/components/storefront/color-field"
import { FontPreviewPicker } from "@/components/website-builder/editor/font-preview-picker"
import { SliderNumberControl } from "@/components/website-builder/editor/slider-number-control"
import { ChoiceControl } from "@/components/website-builder/editor/controls/choice-control"
import { NOTE } from "@/components/website-builder/editor/controls/styles"
import { themeSettingsToTokens } from "@/lib/ai-builder/tokens"
import { DESIGN_BINDINGS, designPatch, designValue, type DesignGroup, type DesignSetting } from "@/lib/ai-builder/site-settings"
import { tt } from "@/lib/i18n/text"
import { cn } from "@/lib/utils"

const LABEL = "text-xs font-medium text-muted-foreground mb-1.5 block"

export function SiteSettingsGroupPanel({
  theme,
  group,
  updateSetting,
  renderToggle,
}: {
  theme: Record<string, unknown>
  group: DesignGroup
  updateSetting: (key: string, value: unknown) => void
  /** The editor's own switch row (WbToggle), so a toggle here looks like every other one. */
  renderToggle?: (props: { label: string; value: boolean; info?: string; onChange: (v: boolean) => void }) => React.ReactNode
}) {
  const tokens = useMemo(() => themeSettingsToTokens(theme), [theme])
  const change = (s: DesignSetting, v: unknown) => {
    for (const [key, value] of Object.entries(designPatch(theme, s, v))) updateSetting(key, value)
  }
  return (
    <div className="space-y-4" data-site-settings-group={group.id}>
      {group.settings.map((s) => (
        <div key={s.id} data-site-setting={s.id}>
          <SiteSettingField setting={s} value={designValue(theme, s, tokens)} onChange={(v) => change(s, v)} renderToggle={renderToggle} />
          {s.info && s.type !== "toggle" ? <p className={cn(NOTE, "mt-1")}>{s.info}</p> : null}
        </div>
      ))}
    </div>
  )
}

function SiteSettingField({
  setting: s,
  value,
  onChange,
  renderToggle,
}: {
  setting: DesignSetting
  value: string | number | boolean
  onChange: (v: unknown) => void
  renderToggle?: (props: { label: string; value: boolean; info?: string; onChange: (v: boolean) => void }) => React.ReactNode
}) {
  switch (s.type) {
    case "color":
      return <ColorField label={s.label} value={String(value)} fallback={/^#[0-9a-f]{6}$/i.test(String(value)) ? String(value) : "#000000"} onChange={onChange} />
    case "font":
      return <FontPreviewPicker label={s.label} value={String(value)} options={s.token ? [...(DESIGN_BINDINGS[s.token].options ?? [])] : []} onChange={onChange} />
    case "range":
      return (
        <div>
          <span className={LABEL}>{s.label}</span>
          <SliderNumberControl value={Number(value)} min={s.min} max={s.max} step={s.step} unit={s.unit || undefined} onChange={(v) => onChange(Number(v))} />
        </div>
      )
    case "select":
      return (
        <div>
          <span className={LABEL}>{s.label}</span>
          <ChoiceControl label={s.label} value={String(value)} options={(s.options ?? []).map((o) => ({ value: o.value, label: tt(o.label) }))} onChange={onChange} />
        </div>
      )
    case "toggle":
      return renderToggle ? <>{renderToggle({ label: s.label, value: value === true, info: s.info, onChange })}</> : <SiteToggle label={s.label} info={s.info} on={value === true} onChange={onChange} />
  }
}

/** A switch row drawn like the editor's other Theme settings switches. */
function SiteToggle({ label, info, on, onChange }: { label: string; info?: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[13px] text-foreground">{label}</p>
        {info ? <p className={cn(NOTE, "mt-0.5")}>{info}</p> : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={() => onChange(!on)}
        className={cn("relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-150", on ? "bg-foreground" : "bg-muted-foreground/30")}
      >
        <span className={cn("inline-block h-4 w-4 rounded-full bg-background shadow-sm transition-transform duration-150", on ? "translate-x-[18px]" : "translate-x-0.5")} />
      </button>
    </div>
  )
}
