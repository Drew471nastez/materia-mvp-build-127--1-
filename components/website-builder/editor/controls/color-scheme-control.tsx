"use client"

/**
 * ===========================================================================
 *  A COLOUR SCHEME, FROM THE THEME THE SITE IS DRAWN WITH
 * ===========================================================================
 * `color_scheme` names one of the theme's schemes. On Storelib's own themes
 * those are Storelib's (lib/storelib-theme/color-schemes.ts) and the select
 * below lists them as it always has. On a theme imported from Shopify they
 * are the theme's own (lib/storelib-theme/compat/scheme-list.ts, given by the
 * editor as `colorSchemes`).
 *
 * ONE ROW, NOT A WALL OF CARDS (round 25, the owner, with a screenshot of
 * twelve schemes two to a row filling the panel): the field is the sidebar's
 * own kind of choice, a row as tall as its other selects with the chosen
 * scheme's swatch and name, and the list opens from it, one scheme a line,
 * the way the font field opens (font-preview-picker.tsx): hanging from the
 * field at a computer, the app's bottom sheet on a phone (FieldPopover).
 * Arrows and Enter work in it. Each swatch is the scheme's background with
 * "Aa" in its text colour and a dot of its button colour.
 */
import * as React from "react"
import { Check, ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { themeColorSchemes } from "@/lib/storelib-theme/color-schemes"
import { FieldPopover } from "@/components/website-builder/field-popover"
import { useEditorFieldEnv } from "./context"
import { NOTE, SELECT } from "./styles"

type Scheme = { id: string; name: string; background: string; text: string; accent: string }

function Swatch({ scheme, size = "row" }: { scheme: Scheme; size?: "row" | "list" }) {
  return (
    <span
      aria-hidden
      data-scheme-swatch=""
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-[5px] font-semibold leading-none shadow-[inset_0_0_0_1px_rgba(0,0,0,0.1)]",
        size === "row" ? "h-6 w-6 text-[10.5px]" : "h-7 w-7 text-[11.5px]",
      )}
      style={{ background: scheme.background, color: scheme.text }}
    >
      Aa
      <span className="absolute bottom-[3px] right-[3px] h-[5px] w-[5px] rounded-full" style={{ background: scheme.accent }} />
    </span>
  )
}

export function ColorSchemeControl({ value, onChange, fallback, label }: { value: string; onChange: (v: string) => void; fallback?: string; label?: string }) {
  const env = useEditorFieldEnv()
  const list = env?.colorSchemes
  /* Storelib's own themes: the theme's schemes as Theme settings has them (its own names and colours), not the defaults. */
  const schemes = list ?? nativeSchemes(env?.themeSettings ?? null)
  if (schemes.length === 0) return <p className={NOTE}>This theme saved no colour schemes to pick from. It draws this section with its own.</p>
  const current = schemes.some((s) => s.id === value) ? value : schemes.some((s) => s.id === fallback) ? fallback! : schemes[0].id
  /* Every scheme can be edited from here: Edit sits inside the field, at its right, and opens Theme settings at this scheme. */
  const edit = env?.openColorSchemes ? () => env.openColorSchemes?.(current) : undefined
  return (
    <div data-scheme-row="">
      <SchemeSelect list={schemes} current={current} onChange={onChange} label={label ?? "Color scheme"} onEdit={edit} />
    </div>
  )
}

/** Storelib's schemes as the field lists them: their names, backgrounds, text and button colours. */
function nativeSchemes(theme: Record<string, unknown> | null): Scheme[] {
  const all = themeColorSchemes(theme ?? {})
  return Object.entries(all).map(([id, s]) => {
    const c = s as unknown as Record<string, unknown>
    const pick = (...keys: string[]) => keys.map((k) => c[k]).find((v): v is string => typeof v === "string" && v.length > 0)
    return { id, name: String(c.name ?? id), background: pick("background") ?? "#ffffff", text: pick("text", "heading", "foreground") ?? "#1a1a2e", accent: pick("primary_button_background", "accent") ?? "#1a1a2e" }
  })
}

function SchemeSelect({ list, current, onChange, label, onEdit }: { list: Scheme[]; current: string; onChange: (v: string) => void; label: string; onEdit?: () => void }) {
  const [open, setOpen] = React.useState(false)
  const [active, setActive] = React.useState(-1)
  const listRef = React.useRef<HTMLDivElement>(null)
  const listId = React.useId()
  const chosen = list.find((s) => s.id === current) ?? list[0]

  /* Opening lands on the chosen one, in view. */
  React.useEffect(() => {
    if (!open) return
    const i = Math.max(0, list.findIndex((s) => s.id === current))
    setActive(i)
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>(`[data-scheme-row="${i}"]`)?.scrollIntoView({ block: "nearest" }))
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (id: string) => {
    if (id !== current) onChange(id)
    setOpen(false)
  }

  return (
    <div data-theme-schemes="" className="relative">
      <FieldPopover
        float
        open={open}
        onOpenChange={setOpen}
        sheetLabel={label}
        trigger={
          <button
            type="button"
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={listId}
            aria-label={`${label}: ${chosen.name}`}
            data-scheme-field=""
            onClick={() => setOpen((o) => !o)}
            onKeyDown={(e) => {
              if (!open && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) {
                e.preventDefault()
                setOpen(true)
                return
              }
              if (!open) return
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault()
                setActive((i) => (e.key === "ArrowDown" ? Math.min(list.length - 1, i + 1) : Math.max(0, i - 1)))
              }
              if (e.key === "Enter" && active >= 0 && list[active]) {
                e.preventDefault()
                choose(list[active].id)
              }
            }}
            className={cn(
              "flex h-9 w-full items-center gap-2 rounded-md border border-border bg-background pl-1.5 text-left transition-colors hover:border-neutral-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900/10 max-sm:h-11",
              onEdit ? "pr-[64px]" : "pr-2",
            )}
          >
            <Swatch scheme={chosen} />
            <span className="min-w-0 flex-1 truncate text-[13px] text-foreground max-sm:text-[15px]">{chosen.name}</span>
            {onEdit ? null : <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-[rotate] duration-150", open && "rotate-180")} />}
          </button>
        }
      >
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={label}
          onMouseDown={(e) => e.preventDefault()}
          className="max-h-[320px] overflow-y-auto p-1 [scrollbar-color:#d1d5db_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#d1d5db]"
        >
          {list.map((s, i) => {
            const on = s.id === current
            return (
              <div
                key={s.id}
                role="option"
                aria-selected={on}
                data-scheme={s.id}
                data-scheme-row={i}
                onMouseMove={() => active !== i && setActive(i)}
                onClick={() => choose(s.id)}
                className={cn(
                  "flex h-10 cursor-pointer items-center gap-2.5 rounded-lg px-1.5 transition-colors duration-75 max-sm:h-12",
                  i === active ? "bg-muted" : "",
                )}
              >
                <Swatch scheme={s} size="list" />
                <span className={cn("min-w-0 flex-1 truncate text-[13px] text-foreground max-sm:text-[15px]", on && "font-medium")}>{s.name}</span>
                {on ? <Check className="mr-1 h-3.5 w-3.5 shrink-0 text-foreground/70" strokeWidth={2.2} aria-label="Chosen" /> : null}
              </div>
            )
          })}
        </div>
      </FieldPopover>
      {onEdit ? (
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${chosen.name}`}
          data-scheme-edit=""
          className="absolute right-1.5 top-1/2 h-6 -translate-y-1/2 rounded-[6px] bg-white px-2.5 text-[12px] font-medium text-[#374151] shadow-[0_0_0_1px_rgba(16,24,40,0.12),0_1px_2px_rgba(16,24,40,0.06)] transition-[box-shadow,color] hover:text-[#1a1a2e] hover:shadow-[0_0_0_1px_rgba(16,24,40,0.2),0_1px_3px_rgba(16,24,40,0.08)] active:translate-y-[calc(-50%+1px)] max-sm:h-8 max-sm:px-3 max-sm:text-[13px]"
        >
          Edit
        </button>
      ) : null}
    </div>
  )
}
