"use client"

/**
 * ===========================================================================
 *  THEME SETTINGS, AS THE IMPORTED THEME DECLARES THEM
 * ===========================================================================
 * The groups of the theme's own config/settings_schema.json (Colors,
 * Typography, Layout, Cart…), read at import into the builder's controls
 * (shopify/config/settings_panel.json, lib/storelib-theme/shopify/convert.ts).
 * Values are the theme's own, under `shopify` in the install's settings, by
 * the ids the theme's markup reads them by.
 */
import { useEffect, useState, type ReactNode } from "react"
import { ChevronRight } from "lucide-react"
import { loadCompatFiles } from "./compat-canvas"
import { visibleFields } from "@/lib/storelib-theme/visible-if"
import type { SchemaField } from "@/lib/website-builder/types"
import { OVERRIDE_GROUP } from "@/lib/storelib-theme/compat/overrides"

/**
 * A colour scheme's colour is kept at shopify[group][scheme].settings[id]; its
 * panel id spells that out with "::" (lib/storelib-theme/shopify/convert.ts,
 * SCHEME_PATH). Any other id is a key of the theme's settings itself.
 */
const SEP = "::"
function readAt(values: Record<string, unknown>, id: string): unknown {
  let cur: unknown = values
  for (const k of id.split(SEP)) cur = cur && typeof cur === "object" ? (cur as Record<string, unknown>)[k] : undefined
  return cur
}
function writeAt(value: unknown, path: string[], v: unknown): Record<string, unknown> {
  const base = value && typeof value === "object" ? { ...(value as Record<string, unknown>) } : {}
  const [head, ...rest] = path
  base[head] = rest.length ? writeAt(base[head], rest, v) : v
  return base
}

interface Group {
  name: string
  settings: SchemaField[]
}

export function CompatThemeSettings({
  installId,
  values,
  open,
  onOpen,
  onChange,
  renderField,
  back,
}: {
  installId: string
  /** The theme's settings: `shopify` of the install's settings. */
  values: Record<string, unknown>
  /** The open group's name, or null for the list. */
  open: string | null
  onOpen: (name: string | null) => void
  onChange: (id: string, value: unknown) => void
  renderField: (field: SchemaField, value: unknown, onChange: (v: unknown) => void) => ReactNode
  /** The row that goes back, drawn by the editor. */
  back: (label: string, onBack: () => void) => ReactNode
}) {
  const [groups, setGroups] = useState<Group[] | null>(null)
  useEffect(() => {
    let live = true
    void loadCompatFiles(installId).then((files) => {
      if (!live) return
      try {
        const parsed = JSON.parse(files["shopify/config/settings_panel.json"] ?? "[]") as Group[]
        /* The theme's own groups, then Storelib's Hover and focus (lib/storelib-theme/compat/overrides.ts). */
        setGroups([...(Array.isArray(parsed) ? parsed : []), OVERRIDE_GROUP as unknown as Group])
      } catch {
        setGroups([OVERRIDE_GROUP as unknown as Group])
      }
    })
    return () => { live = false }
  }, [installId])

  const group = open ? groups?.find((g) => g.name === open) ?? null : null
  if (group) {
    return (
      <div className="flex h-full flex-col" data-compat-theme-group={group.name}>
        {back(group.name, () => onOpen(null))}
        <div data-sheet-scroll className="wb-slim-scroll flex-1 space-y-4 overflow-y-auto px-3.5 py-3.5">
          {visibleFields(group.settings, values).map((field) => (
            <div key={field.id}>
              {renderField(field, readAt(values, field.id) ?? field.default, (v) => {
                if (!field.id.includes(SEP)) return onChange(field.id, v)
                const [top, ...rest] = field.id.split(SEP)
                onChange(top, writeAt(values[top], rest, v))
              })}
            </div>
          ))}
        </div>
      </div>
    )
  }
  return (
    <div className="flex h-full flex-col">
      {back("Theme settings", () => onOpen("__back__"))}
      <div data-sheet-scroll className="wb-slim-scroll flex-1 overflow-y-auto p-2">
        {groups === null ? (
          <p className="px-3 py-2 text-[14px] text-[#6b7280]">Loading…</p>
        ) : groups.length === 0 ? (
          <p className="px-3 py-2 text-[14px] text-[#6b7280]">This theme has no settings of its own.</p>
        ) : (
          groups.map((g) => (
            <button
              key={g.name}
              type="button"
              onClick={() => onOpen(g.name)}
              className="group/row mb-0.5 flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-[13.5px] font-medium text-foreground transition-colors duration-100 hover:bg-muted/60 active:bg-muted max-sm:h-12 max-sm:text-[15px]"
            >
              <span className="min-w-0 flex-1 truncate">{g.name}</span>
              <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-transform duration-150 group-hover/row:translate-x-0.5 group-hover/row:text-foreground" />
            </button>
          ))
        )}
      </div>
    </div>
  )
}
