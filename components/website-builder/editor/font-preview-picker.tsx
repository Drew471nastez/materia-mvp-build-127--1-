"use client"

/**
 * ===========================================================================
 *  A FONT IS CHOSEN BY LOOKING AT IT
 * ===========================================================================
 * The heading, body and accent font were native selects listing names:
 * "Playfair Display", "Bebas Neue", with no way to see either until it was
 * chosen and the canvas redrew. Here every family is drawn in its own face,
 * with a line of sample text under its name, and the field shows the chosen
 * one the same way.
 *
 * WHAT IT LOADS. One small request to Google Fonts for every offered family
 * at one weight, cut down with `text=` to the letters the list actually
 * draws (the names and the sample), so the previews cost a few kilobytes,
 * not every family in full. The page's own fonts are still loaded by
 * ThemePage (lib/website-builder/font-link.ts), from the same allow-list.
 *
 * A computer gets the list hanging from the field; a phone gets the shared
 * sheet (FieldPopover). Arrows and Enter work in the list.
 */
import * as React from "react"
import { Check, ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { FieldPopover } from "@/components/website-builder/field-popover"
import { OFFERED_FAMILIES } from "@/lib/website-builder/font-link"

const SAMPLE = "The quick brown fox"

/** How each offered family reads, for the line beside its name. */
const KIND: Record<string, string> = {
  "Playfair Display": "Serif",
  "Cormorant Garamond": "Serif",
  Lora: "Serif",
  Merriweather: "Serif",
  "Libre Baskerville": "Serif",
  "EB Garamond": "Serif",
  Oswald: "Condensed",
  "Bebas Neue": "Display",
}

/** A Shopify font handle ("work_sans_n7", an imported theme's font setting) as the family it names; anything else as it is. */
const familyOf = (value: string) => {
  const m = /^([a-z0-9_]+?)_[nio][1-9]$/.exec(value)
  return m ? m[1].split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") : value
}
const faceOf = (value: string) => {
  const family = familyOf(value)
  return family ? `"${family.replace(/"/g, "")}", ui-sans-serif, system-ui, sans-serif` : undefined
}

let previewsLoaded = false
/** The one request for every preview: each family at 500, only the letters drawn. */
function loadPreviews(extra: string[]) {
  if (previewsLoaded || typeof document === "undefined") return
  previewsLoaded = true
  const families = [...new Set([...OFFERED_FAMILIES, ...extra.filter((f) => OFFERED_FAMILIES.has(f))])]
  if (!families.length) return
  const letters = [...new Set([...families.join(""), ...SAMPLE, ..."Aa"])].join("")
  const q = families.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@500`).join("&")
  const link = document.createElement("link")
  link.rel = "stylesheet"
  link.href = `https://fonts.googleapis.com/css2?${q}&text=${encodeURIComponent(letters)}&display=swap`
  link.setAttribute("data-font-previews", "")
  document.head.appendChild(link)
}

export function FontPreviewPicker({
  label,
  value,
  onChange,
  options,
  bare = false,
}: {
  label: string
  value: unknown
  onChange: (v: string) => void
  options: { label: string; value: string }[]
  /** Without its own label, where the field's row already names it. */
  bare?: boolean
}) {
  const selected = typeof value === "string" ? value : String(options[0]?.value ?? "")
  const [open, setOpen] = React.useState(false)
  const [active, setActive] = React.useState(-1)
  const listRef = React.useRef<HTMLDivElement>(null)
  const listId = React.useId()

  React.useEffect(() => {
    loadPreviews(options.map((o) => familyOf(o.value)))
  }, [options])

  /* Opening lands on the chosen one, in view. */
  React.useEffect(() => {
    if (!open) return
    const i = Math.max(0, options.findIndex((o) => o.value === selected))
    setActive(i)
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>(`[data-font-row="${i}"]`)?.scrollIntoView({ block: "nearest" }))
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (v: string) => {
    if (v !== selected) onChange(v)
    setOpen(false)
  }
  const current = options.find((o) => o.value === selected)
  /* "Same as heading font": the face shown is the heading's, named by the caller in the label. */
  const shownFace = selected || ""

  return (
    <div className="space-y-1.5" data-font-picker="">
      {bare ? null : <p className="text-[13px] font-medium text-foreground">{label}</p>}
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
                setActive((i) => (e.key === "ArrowDown" ? Math.min(options.length - 1, i + 1) : Math.max(0, i - 1)))
              }
              if (e.key === "Enter" && active >= 0 && options[active]) {
                e.preventDefault()
                choose(options[active].value)
              }
            }}
            className="flex h-10 w-full items-center gap-2.5 rounded-md border border-border bg-background pl-2.5 pr-2 text-left transition-colors hover:border-neutral-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900/10"
          >
            <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-muted text-[15px] text-foreground" style={{ fontFamily: faceOf(shownFace) }}>
              Aa
            </span>
            <span className="min-w-0 flex-1 truncate text-[14px] text-foreground" style={{ fontFamily: faceOf(shownFace) }}>
              {current?.label ?? selected}
            </span>
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
          {options.map((o, i) => {
            const on = o.value === selected
            return (
              <div
                key={o.value || "same"}
                role="option"
                aria-selected={on}
                data-font-row={i}
                onMouseMove={() => active !== i && setActive(i)}
                onClick={() => choose(o.value)}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 transition-colors duration-75",
                  i === active ? "bg-muted" : "",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] leading-6 text-foreground" style={{ fontFamily: faceOf(o.value) }}>
                    {o.label}
                  </span>
                  <span className="block truncate text-[12.5px] leading-5 text-muted-foreground" style={{ fontFamily: faceOf(o.value) }}>
                    {o.value ? SAMPLE : o.label}
                  </span>
                </span>
                {o.value && KIND[familyOf(o.value)] ? <span className="shrink-0 text-[11px] text-muted-foreground">{KIND[familyOf(o.value)]}</span> : null}
                {on ? <Check className="h-3.5 w-3.5 shrink-0 text-foreground/70" strokeWidth={2.2} aria-label="Chosen" /> : null}
              </div>
            )
          })}
        </div>
      </FieldPopover>
    </div>
  )
}
