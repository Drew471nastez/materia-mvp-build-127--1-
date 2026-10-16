"use client"

/**
 * ===========================================================================
 *  A WIDGET'S SETTINGS, AS THE SECTION DECLARES THEM
 * ===========================================================================
 * Drawn from the section file's own schema (the same settings the website
 * editor's panel shows for it), grouped under its headers, so a setting
 * added to the section is here with nothing else to change. The words are
 * the dashboard's (./copy.ts). Each group folds; the first two start open.
 */
import { useMemo, useState } from "react"
import { cn } from "@/lib/utils"
import { Switch } from "@/components/ui/switch"
import { visibleFields } from "@/lib/storelib-theme/visible-if"
import { themeColorSchemes } from "@/lib/storelib-theme/color-schemes"
import type { SchemaField } from "@/lib/website-builder/types"
import { GROUP_LABELS, optionLabel, settingLabel } from "./copy"
import { tt } from "@/lib/i18n/text"

const INPUT = "h-9 w-full rounded-lg border border-[#e3e4e8] bg-white px-3 text-[14px] text-[#1a1a2e] outline-none transition-colors focus:border-[#9ca3af] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/10 max-md:h-10 max-md:text-[16px]"
const LABEL = "text-[13px] font-medium text-[#374151]"

interface Group {
  id: string
  label: string
  fields: SchemaField[]
}

function groupsOf(fields: SchemaField[]): Group[] {
  const out: Group[] = []
  for (const f of fields) {
    if (f.type === "header") {
      out.push({ id: f.id, label: GROUP_LABELS[f.id]?.() ?? f.label, fields: [] })
      continue
    }
    if (!out.length) out.push({ id: "hdr_content", label: GROUP_LABELS.hdr_content(), fields: [] })
    out[out.length - 1].fields.push(f)
  }
  return out.filter((g) => g.fields.length > 0)
}

export function WidgetControls({
  fields,
  values,
  theme,
  onChange,
}: {
  fields: SchemaField[]
  /** The settings as they stand: saved over the defaults. */
  values: Record<string, unknown>
  theme: Record<string, unknown>
  onChange: (id: string, value: unknown) => void
}) {
  const shown = useMemo(() => new Set(visibleFields(fields, values).map((f) => f.id)), [fields, values])
  const groups = useMemo(() => groupsOf(fields), [fields])
  const schemes = useMemo(() => themeColorSchemes(theme), [theme])
  return (
    <div className="divide-y divide-[#eef0f2]" data-widget-controls="">
      {groups.map((g, i) => (
        <details key={g.id} open={i < 2} className="group/g" data-widget-group={g.id}>
          <summary className="flex h-12 cursor-pointer list-none items-center justify-between px-4 text-[14px] font-semibold text-[#1a1a2e] [&::-webkit-details-marker]:hidden">
            {g.label}
            <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5 text-[#9ca3af] transition-transform duration-150 group-open/g:rotate-180">
              <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </summary>
          <div className="space-y-4 px-4 pb-5">
            {g.fields.filter((f) => shown.has(f.id)).map((f) => (
              <Control key={f.id} field={f} value={values[f.id]} schemes={schemes} onChange={(v) => onChange(f.id, v)} />
            ))}
          </div>
        </details>
      ))}
    </div>
  )
}

function Control({ field, value, schemes, onChange }: { field: SchemaField; value: unknown; schemes: Record<string, { name: string; background: string }>; onChange: (v: unknown) => void }) {
  const label = settingLabel(field.id, field.label)
  const inputId = `wc-${field.id}`
  switch (field.type) {
    case "toggle":
    case "checkbox":
      return (
        <label htmlFor={inputId} className="flex min-h-[28px] cursor-pointer items-center justify-between gap-3">
          <span className={LABEL}>{label}</span>
          <Switch id={inputId} checked={value === true} onCheckedChange={(v) => onChange(v === true)} />
        </label>
      )
    case "text":
      return (
        <div className="space-y-1.5">
          <label htmlFor={inputId} className={LABEL}>{label}</label>
          <input id={inputId} className={INPUT} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} />
        </div>
      )
    case "textarea":
      return (
        <div className="space-y-1.5">
          <label htmlFor={inputId} className={LABEL}>{label}</label>
          <textarea id={inputId} rows={2} className={cn(INPUT, "h-auto py-2 leading-snug")} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} />
        </div>
      )
    case "select":
    case "radio": {
      const options = (field.options ?? []).map((o) => ({ value: String(o.value), label: optionLabel(field.id, String(o.value), o.label) }))
      const current = typeof value === "string" ? value : String(field.default ?? "")
      if (options.length <= 3 && options.every((o) => o.label.length <= 16)) {
        return (
          <div className="space-y-1.5">
            <p className={LABEL} id={`${inputId}-l`}>{label}</p>
            <div role="radiogroup" aria-labelledby={`${inputId}-l`} className="grid gap-1 rounded-lg bg-[#f1f2f4] p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
              {options.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={current === o.value}
                  onClick={() => onChange(o.value)}
                  className={cn("h-8 truncate rounded-md px-2 text-[13px] font-medium transition-colors", current === o.value ? "bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.12)]" : "text-[#6b7280] hover:text-[#1a1a2e]")}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        )
      }
      return (
        <div className="space-y-1.5">
          <label htmlFor={inputId} className={LABEL}>{label}</label>
          <select id={inputId} className={cn(INPUT, "cursor-pointer pr-8")} value={current} onChange={(e) => onChange(e.target.value)}>
            {options.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      )
    }
    case "color_scheme": {
      const current = typeof value === "string" && schemes[value] ? value : String(field.default ?? "white")
      return (
        <div className="space-y-1.5">
          <label htmlFor={inputId} className={LABEL}>{label}</label>
          <div className="relative">
            <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 rounded-[5px] border border-black/10" style={{ background: schemes[current]?.background }} />
            <select id={inputId} className={cn(INPUT, "cursor-pointer pl-9")} value={current} onChange={(e) => onChange(e.target.value)}>
              {Object.entries(schemes).map(([k, s]) => (
                <option key={k} value={k}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>
      )
    }
    case "color":
      return <ColorControl id={inputId} label={label} value={typeof value === "string" ? value : ""} onChange={onChange} />
    case "range":
    case "number":
      if (field.responsive) {
        const v = value && typeof value === "object" ? (value as Record<string, number>) : ((field.default ?? {}) as Record<string, number>)
        return (
          <div className="space-y-2">
            <p className={LABEL}>{label}</p>
            {([["desktop", tt("Computer")], ["tablet", tt("Tablet")], ["mobile", tt("Phone")]] as const).map(([k, name]) => (
              <Range key={k} id={`${inputId}-${k}`} label={name} small field={field} value={Number(v[k] ?? 1)} onChange={(n) => onChange({ ...v, [k]: n })} />
            ))}
          </div>
        )
      }
      return <Range id={inputId} label={label} field={field} value={Number(value ?? field.default ?? 0)} onChange={onChange} />
    default:
      return null
  }
}

function Range({ id, label, field, value, small, onChange }: { id: string; label: string; field: SchemaField; value: number; small?: boolean; onChange: (n: number) => void }) {
  const unit = field.unit && field.unit !== "%" ? ` ${field.unit}` : field.unit ?? ""
  return (
    <div className={cn("grid items-center gap-x-3 gap-y-1", small ? "grid-cols-[72px_minmax(0,1fr)_52px]" : "grid-cols-[minmax(0,1fr)_56px]")}>
      <label htmlFor={id} className={cn(small ? "text-[13px] text-[#6b7280]" : cn(LABEL, "col-span-2"))}>{label}</label>
      <input
        id={id}
        type="range"
        min={field.min ?? 0}
        max={field.max ?? 100}
        step={field.step ?? 1}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-6 w-full cursor-pointer accent-[#1a1a2e]"
      />
      <span className="text-right text-[13px] tabular-nums text-[#6b7280]">{value}{unit}</span>
    </div>
  )
}

function ColorControl({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  const [typing, setTyping] = useState<string | null>(null)
  const hex = /^#[0-9a-f]{6}$/i.test(value) ? value : /^#[0-9a-f]{3}$/i.test(value) ? `#${value.slice(1).split("").map((c) => c + c).join("")}` : ""
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className={LABEL}>{label}</label>
      <div className="flex items-center gap-2">
        <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-[#e3e4e8]" style={hex ? { background: hex } : { backgroundImage: "linear-gradient(45deg,#eef0f2 25%,transparent 25%,transparent 75%,#eef0f2 75%),linear-gradient(45deg,#eef0f2 25%,#fff 25%,#fff 75%,#eef0f2 75%)", backgroundSize: "10px 10px", backgroundPosition: "0 0,5px 5px" }}>
          <input aria-label={label} type="color" value={hex || "#000000"} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
        </span>
        <input
          id={id}
          className={cn(INPUT, "font-mono text-[13px]")}
          placeholder={tt("Default")}
          value={typing ?? value}
          onChange={(e) => {
            setTyping(e.target.value)
            const t = e.target.value.trim()
            if (t === "" || /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(t)) onChange(t.toLowerCase())
          }}
          onBlur={() => setTyping(null)}
        />
        {value ? (
          <button type="button" onClick={() => onChange("")} className="h-9 shrink-0 rounded-lg px-2.5 text-[13px] font-medium text-[#6b7280] hover:bg-[#f1f2f4] hover:text-[#1a1a2e]">
            {tt("Reset")}
          </button>
        ) : null}
      </div>
    </div>
  )
}
