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
import { ChevronDown, ChevronRight } from "lucide-react"
import { loadCompatFiles } from "./compat-files"
import { visibleFields } from "@/lib/storelib-theme/visible-if"
import type { SchemaField } from "@/lib/website-builder/types"
import { OVERRIDE_GROUP } from "@/lib/storelib-theme/compat/overrides"
import { tt } from "@/lib/i18n/text"

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

/*
  A THEME'S COLOUR SCHEMES, NAMED AND FOLDED. A scheme's heading used to be
  its key in the theme's settings ("scheme-0302a2b1-…"), as an 11px grey
  caption, and every scheme's ten colours ran on under it: unreadable, and
  one long list. Each scheme is now a row as Shopify's editor shows them,
  "Scheme 1", "Scheme 2", with a chip in its own background and text colour,
  and only the one opened shows its colours. Drawn here, so a theme imported
  before is shown the same way.
*/
const SCHEME_HEADER = /^scheme_(\d+)_hdr$/
/** group::scheme of the scheme a heading starts: the next setting's id says it. */
function schemeOf(settings: SchemaField[], i: number): string | null {
  const next = settings[i + 1]?.id ?? ""
  const parts = next.split(SEP)
  return parts.length >= 4 && parts[2] === "settings" ? `${parts[0]}${SEP}${parts[1]}` : null
}
function colourOf(scheme: unknown, words: string[]): string | null {
  const settings = scheme && typeof scheme === "object" ? ((scheme as Record<string, unknown>).settings as Record<string, unknown> | undefined) : undefined
  if (!settings) return null
  for (const w of words) {
    const hit = Object.entries(settings).find(([k, v]) => k.toLowerCase().includes(w) && typeof v === "string" && /^(#|rgb)/i.test(v))
    if (hit) return hit[1] as string
  }
  return null
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
  /* The colour scheme open in its group (group::scheme); the first one until another is chosen. */
  const [openScheme, setOpenScheme] = useState<string | null>(null)
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
    }, () => {
      /* The theme's files could not be had (compat-canvas.tsx loadCompatFiles): Storelib's own group, never "Loading…" for good. */
      if (live) setGroups([OVERRIDE_GROUP as unknown as Group])
    })
    return () => { live = false }
  }, [installId])

  const group = open ? groups?.find((g) => g.name === open) ?? null : null
  if (group) {
    return (
      <div className="flex h-full flex-col" data-compat-theme-group={group.name}>
        {back(group.name, () => onOpen(null))}
        <div data-sheet-scroll className="wb-slim-scroll flex-1 space-y-4 overflow-y-auto px-3.5 py-3.5">
          {(() => {
            const fields = visibleFields(group.settings, values)
            const firstScheme = fields.map((f, i) => (SCHEME_HEADER.test(f.id) ? schemeOf(fields, i) : null)).find(Boolean) ?? null
            const opened = openScheme ?? firstScheme
            return fields.map((field, i) => {
              const header = SCHEME_HEADER.exec(field.id)
              const scheme = header ? schemeOf(fields, i) : null
              if (header && scheme) {
                const on = opened === scheme
                const stored = readAt(values, scheme)
                const bg = colourOf(stored, ["background"]) ?? "#ffffff"
                const fg = colourOf(stored, ["foreground", "text", "heading"]) ?? "#1a1a2e"
                return (
                  <button
                    key={field.id}
                    type="button"
                    aria-expanded={on}
                    onClick={() => setOpenScheme(on ? "" : scheme)}
                    className="flex w-full items-center gap-3 rounded-lg border border-border bg-background px-3 py-2.5 text-left transition-colors duration-100 hover:bg-muted/50"
                    data-compat-scheme={scheme}
                  >
                    <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-black/10 text-[12px] font-semibold" style={{ background: bg, color: fg }}>
                      Aa
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-foreground">Scheme {header[1]}</span>
                    <ChevronDown aria-hidden className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150 ${on ? "rotate-180" : ""}`} />
                  </button>
                )
              }
              /* A scheme's colour shows under its own row, only while that row is open. */
              const parts = field.id.split(SEP)
              const owner = parts.length >= 4 && parts[2] === "settings" && SCHEME_HEADER.test(fields.slice(0, i).reverse().find((f) => SCHEME_HEADER.test(f.id))?.id ?? "") ? `${parts[0]}${SEP}${parts[1]}` : null
              if (owner && owner !== opened) return null
              return (
                <div key={field.id} className={owner ? "pl-1" : undefined}>
                  {renderField(field, readAt(values, field.id) ?? field.default, (v) => {
                    if (!field.id.includes(SEP)) return onChange(field.id, v)
                    const [top, ...rest] = field.id.split(SEP)
                    onChange(top, writeAt(values[top], rest, v))
                  })}
                </div>
              )
            })
          })()}
        </div>
      </div>
    )
  }
  return (
    <div className="flex h-full flex-col">
      {back(tt("Theme settings"), () => onOpen("__back__"))}
      <div data-sheet-scroll className="wb-slim-scroll flex-1 overflow-y-auto p-2">
        {groups === null ? (
          <p className="px-3 py-2 text-[14px] text-[#6b7280]">{tt("Loading…")}</p>
        ) : groups.length === 0 ? (
          <p className="px-3 py-2 text-[14px] text-[#6b7280]">{tt("This theme has no settings of its own.")}</p>
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
