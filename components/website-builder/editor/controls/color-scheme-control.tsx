"use client"

/**
 * ===========================================================================
 *  A COLOUR SCHEME, FROM THE THEME THE SITE IS DRAWN WITH
 * ===========================================================================
 * `color_scheme` names one of the theme's schemes. On Storelib's own themes
 * those are Storelib's (lib/storelib-theme/color-schemes.ts) and the select
 * below lists them as it always has. On a theme imported from Shopify they
 * are the theme's own (lib/storelib-theme/compat/scheme-list.ts, given by the
 * editor as `colorSchemes`), drawn as Shopify's editor draws them: a swatch
 * of each scheme's background, text and button, and its number.
 */
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { themeColorSchemes } from "@/lib/storelib-theme/color-schemes"
import { useEditorFieldEnv } from "./context"
import { NOTE, SELECT } from "./styles"

export function ColorSchemeControl({ value, onChange, fallback, label }: { value: string; onChange: (v: string) => void; fallback?: string; label?: string }) {
  const env = useEditorFieldEnv()
  const list = env?.colorSchemes
  if (!list) {
    const schemes = themeColorSchemes({})
    const keys = Object.keys(schemes)
    return (
      <div className="relative">
        <select className={SELECT} aria-label={label} value={keys.includes(value) ? value : keys[0]} onChange={(e) => onChange(e.target.value)}>
          {keys.map((k) => <option key={k} value={k}>{schemes[k].name}</option>)}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      </div>
    )
  }
  if (list.length === 0) return <p className={NOTE}>This theme saved no colour schemes to pick from. It draws this section with its own.</p>
  const current = list.some((s) => s.id === value) ? value : list.some((s) => s.id === fallback) ? fallback! : list[0].id
  return (
    <div role="radiogroup" aria-label={label ?? "Color scheme"} className="grid grid-cols-2 gap-1.5" data-theme-schemes="">
      {list.map((s) => {
        const on = s.id === current
        return (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(s.id)}
            data-scheme={s.id}
            className={cn(
              "flex h-11 min-w-0 items-center gap-2 rounded-lg border px-1.5 text-left transition-[border-color,box-shadow] duration-150 max-sm:h-12",
              on ? "border-foreground/70 shadow-[0_0_0_1px_rgba(17,17,19,0.7)]" : "border-border hover:border-neutral-400",
            )}
          >
            <span className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-black/10 text-[12px] font-semibold" style={{ background: s.background, color: s.text }} aria-hidden>
              Aa
              <span className="absolute bottom-1 right-1 h-1.5 w-1.5 rounded-full" style={{ background: s.accent }} />
            </span>
            <span className="min-w-0 truncate text-[12.5px] font-medium text-foreground">{s.name}</span>
          </button>
        )
      })}
    </div>
  )
}
