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
import { Check, ChevronDown, Pencil } from "lucide-react"

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
  if (!list) {
    const schemes = themeColorSchemes({})
    const keys = Object.keys(schemes)
    return (
      <div className="flex items-center gap-1.5" data-scheme-row="">
        <div className="relative min-w-0 flex-1">
          <select className={SELECT} aria-label={label} value={keys.includes(value) ? value : keys[0]} onChange={(e) => onChange(e.target.value)}>
            {keys.map((k) => <option key={k} value={k}>{schemes[k].name}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        </div>
        {/* Change the scheme's colours from here, rather than hunting for it in Theme settings. */}
        {env?.openColorSchemes ? (
          <button
            type="button"
            onClick={env.openColorSchemes}
            aria-label="Edit color schemes"
            title="Edit color schemes"
            data-scheme-edit=""
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[var(--wb-chrome-border,#e5e7eb)] text-[var(--wb-chrome-fg-3,#6b7280)] transition-colors hover:bg-[var(--wb-chrome-hover,#f3f4f6)] hover:text-[var(--wb-chrome-fg,#1a1a2e)]"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
    )
  }
  if (list.length === 0) return <p className={NOTE}>This theme saved no colour schemes to pick from. It draws this section with its own.</p>
  const current = list.some((s) => s.id === value) ? value : list.some((s) => s.id === fallback) ? fallback! : list[0].id
  return <SchemeSelect list={list} current={current} onChange={onChange} label={label ?? "Color scheme"} />
}

function SchemeSelect({ list, current, onChange, label }: { list: Scheme[]; current: string; onChange: (v: string) => void; label: string }) {
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
    <div data-theme-schemes="">
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
            className="flex h-9 w-full items-center gap-2 rounded-md border border-border bg-background pl-1.5 pr-2 text-left transition-colors hover:border-neutral-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900/10 max-sm:h-11"
          >
            <Swatch scheme={chosen} />
            <span className="min-w-0 flex-1 truncate text-[13px] text-foreground max-sm:text-[15px]">{chosen.name}</span>
            <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-[rotate] duration-150", open && "rotate-180")} />
          </button>
        }
      >
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={label}
          onMouseDown={(e) => e.preventDefault()}
          className="max-h-[320px] overflow-y-auto p-1"
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
    </div>
  )
}
