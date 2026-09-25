"use client"

/**
 * ===========================================================================
 *  THE SIDEBAR'S OWN SELECT AND SEGMENTED CONTROL
 * ===========================================================================
 * Two controls every schema setting that is a choice goes through.
 *
 * SettingSelect replaces the browser's <select>. The native one opened the
 * operating system's menu over the editor (a wheel on an iPhone, a grey list
 * on Windows) and was the one control in the panel that did not look like
 * the rest of it. This opens the list IN THE FLOW, under its field, the way
 * the link and icon pickers already do: nothing floats, so nothing has to be
 * measured against a sidebar that scrolls inside a sheet that moves, and the
 * list can never open under the fold with nothing to scroll it into view.
 * It opens and closes by height (./collapse.tsx) and scrolls itself into
 * view in whatever is scrolling it.
 *
 * SegmentedChoice is for two to four short answers, where a list is a step
 * too many: "Image on: Left | Right". One tap, the answer on screen, and a
 * small icon when the answer is a position. The white piece behind the
 * chosen one slides by transform.
 *
 * Both are keyboard complete: the select is a listbox with arrow keys,
 * Home, End, typing to jump and Escape; the segments are a radiogroup with
 * arrow keys.
 */
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { AlignCenter, AlignLeft, AlignRight, Check, ChevronDown, PanelBottom, PanelLeft, PanelRight, PanelTop } from "lucide-react"
import { cn } from "@/lib/utils"
import { useSheetExpand } from "@/components/website-builder/mobile-editor-sheet"
import { Collapse } from "./collapse"

export interface SettingOption {
  label: string
  value: string
  /** Drawn in its own face, for a font list. */
  fontFamily?: string
}

/** Scroll the one container a panel lives in by the least that shows it. */
export function revealInScroller(el: HTMLElement | null) {
  if (!el) return
  const scroller = el.closest("[data-sheet-scroll], [data-wb-sidebar-scroll]") as HTMLElement | null
  if (!scroller) return
  const r = el.getBoundingClientRect()
  const box = scroller.getBoundingClientRect()
  if (r.bottom <= box.bottom && r.top >= box.top) return
  const delta = r.bottom > box.bottom ? Math.min(r.bottom - box.bottom + 8, r.top - box.top) : r.top - box.top
  scroller.scrollBy({ top: delta, behavior: "smooth" })
}

export const SETTING_TRIGGER =
  "flex h-10 w-full items-center gap-2 rounded-lg border border-[#e5e7eb] bg-white px-3 text-left text-[14px] text-[#1a1a2e] transition-[border-color,box-shadow] duration-150 hover:border-[#d1d5db] focus:outline-none focus-visible:border-[#9ca3af] focus-visible:ring-2 focus-visible:ring-black/5"

export function SettingSelect({
  value,
  options,
  onChange,
  label,
  placeholder = "Choose",
  className,
}: {
  value: string
  options: SettingOption[]
  onChange: (value: string) => void
  /** Read by a screen reader; the visible label is the caller's. */
  label?: string
  placeholder?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const listId = useId()
  const current = options.find((o) => o.value === value)
  /* Typing jumps to the first option that starts with what was typed. */
  const typed = useRef({ text: "", at: 0 })

  /* The phone sheet goes to its full height while the list is open, or the list opens below the screen. */
  const sheet = useSheetExpand()
  const expandId = useId()
  useEffect(() => {
    if (!sheet) return
    if (open) sheet.expand(expandId)
    else sheet.release(expandId)
    return () => sheet.release(expandId)
  }, [expandId, open, sheet])

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (root.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener("pointerdown", onDown)
    return () => document.removeEventListener("pointerdown", onDown)
  }, [open])

  /* Open: the chosen one takes focus, and the list comes into view. */
  useLayoutEffect(() => {
    if (!open) return
    const el = list.current
    const chosen = el?.querySelector<HTMLElement>('[aria-selected="true"]') ?? el?.querySelector<HTMLElement>("[role=option]")
    chosen?.focus({ preventScroll: true })
    const id = requestAnimationFrame(() => requestAnimationFrame(() => revealInScroller(list.current)))
    return () => cancelAnimationFrame(id)
  }, [open])

  const close = useCallback((refocus = true) => {
    setOpen(false)
    if (refocus) trigger.current?.focus({ preventScroll: true })
  }, [])

  const pick = (v: string) => {
    if (v !== value) onChange(v)
    close()
  }

  const onListKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(list.current?.querySelectorAll<HTMLElement>("[role=option]") ?? [])
    const at = items.indexOf(document.activeElement as HTMLElement)
    const go = (i: number) => items[Math.max(0, Math.min(items.length - 1, i))]?.focus({ preventScroll: false })
    if (e.key === "ArrowDown") { e.preventDefault(); go(at + 1) }
    else if (e.key === "ArrowUp") { e.preventDefault(); go(at - 1) }
    else if (e.key === "Home") { e.preventDefault(); go(0) }
    else if (e.key === "End") { e.preventDefault(); go(items.length - 1) }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close() }
    else if (e.key === "Tab") close(false)
    else if (e.key.length === 1 && /\S/.test(e.key)) {
      const now = Date.now()
      typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : "") + e.key.toLowerCase(), at: now }
      const hit = options.findIndex((o) => o.label.toLowerCase().startsWith(typed.current.text))
      if (hit >= 0) go(hit)
    }
  }

  return (
    <div ref={root} className={cn("relative", className)} data-setting-select="">
      <button
        ref={trigger}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={label ? `${label}: ${current?.label ?? placeholder}` : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault()
            setOpen(true)
          }
        }}
        className={cn(SETTING_TRIGGER, open && "border-[#9ca3af]")}
      >
        <span
          className={cn("min-w-0 flex-1 truncate", !current && "text-[#9ca3af]")}
          style={current?.fontFamily ? { fontFamily: `${current.fontFamily}, ui-sans-serif, system-ui, sans-serif` } : undefined}
        >
          {current?.label ?? (value || placeholder)}
        </span>
        <ChevronDown aria-hidden className={cn("h-4 w-4 shrink-0 text-[#6b7280] transition-transform duration-200", open && "rotate-180")} />
      </button>
      <Collapse open={open}>
        <div
          ref={list}
          id={listId}
          role="listbox"
          aria-label={label}
          onKeyDown={onListKey}
          className="mt-1.5 max-h-[280px] overflow-y-auto overscroll-contain rounded-xl border border-[#e5e7eb] bg-white p-1 shadow-[0_8px_24px_-12px_rgba(15,23,42,0.25)] wb-slim-scroll"
        >
          {options.map((o) => {
            const on = o.value === value
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={on}
                tabIndex={-1}
                onClick={() => pick(o.value)}
                className={cn(
                  "flex h-10 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[14px] text-[#1a1a2e] outline-none transition-colors duration-100",
                  "hover:bg-[#f3f4f6] focus-visible:bg-[#f3f4f6]",
                  on && "font-medium",
                )}
                style={o.fontFamily ? { fontFamily: `${o.fontFamily}, ui-sans-serif, system-ui, sans-serif` } : undefined}
              >
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {on && <Check aria-hidden className="h-4 w-4 shrink-0 text-[#1a1a2e]" strokeWidth={2.25} />}
              </button>
            )
          })}
        </div>
      </Collapse>
    </div>
  )
}

/* ── Segmented ─────────────────────────────────────────────────────────── */

/**
 * A small picture for an answer that is a position. Only where the value
 * says where something goes: a label like "Solid" gets no icon, because an
 * icon beside every word is decoration.
 */
export function positionIcon(fieldId: string, value: string): ReactNode {
  const v = value.toLowerCase()
  const id = fieldId.toLowerCase()
  const cls = "h-3.5 w-3.5 shrink-0"
  const text = /align|text/.test(id) && !/image|media|side|position|layout/.test(id)
  if (text) {
    if (v === "left" || v === "start") return <AlignLeft aria-hidden className={cls} />
    if (v === "center" || v === "centre" || v === "middle") return <AlignCenter aria-hidden className={cls} />
    if (v === "right" || v === "end") return <AlignRight aria-hidden className={cls} />
    return null
  }
  if (v === "left" || v === "image_left" || v === "start") return <PanelLeft aria-hidden className={cls} />
  if (v === "right" || v === "image_right" || v === "end") return <PanelRight aria-hidden className={cls} />
  if (v === "top" || v === "above" || v === "image_top") return <PanelTop aria-hidden className={cls} />
  if (v === "bottom" || v === "below" || v === "image_bottom") return <PanelBottom aria-hidden className={cls} />
  if (/align/.test(id) && (v === "center" || v === "centre")) return <AlignCenter aria-hidden className={cls} />
  return null
}

export function SegmentedChoice({
  value,
  options,
  onChange,
  label,
  fieldId = "",
  className,
}: {
  value: string
  options: SettingOption[]
  onChange: (value: string) => void
  label?: string
  /** The setting's id, which says whether the answers are positions worth a picture. */
  fieldId?: string
  className?: string
}) {
  const index = Math.max(0, options.findIndex((o) => o.value === value))
  const known = options.some((o) => o.value === value)
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const onKey = (e: React.KeyboardEvent) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0
    if (!step) return
    e.preventDefault()
    const next = (index + step + options.length) % options.length
    onChange(options[next].value)
    refs.current[next]?.focus()
  }
  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKey}
      className={cn("wb-segmented relative grid rounded-lg bg-[#f3f4f6] p-0.5", className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {known && (
        <span
          aria-hidden
          className="wb-segmented-thumb pointer-events-none absolute inset-y-0.5 left-0.5 rounded-md bg-white shadow-[0_1px_2px_rgba(15,23,42,0.08),0_0_0_0.5px_rgba(15,23,42,0.06)]"
          style={{ width: `calc((100% - 4px) / ${options.length})`, transform: `translate3d(${index * 100}%, 0, 0)` }}
        />
      )}
      {options.map((o, i) => {
        const on = o.value === value
        const icon = positionIcon(fieldId, o.value)
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on || (!known && i === 0) ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative z-[1] flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-md px-2 text-[13px] font-medium outline-none transition-colors duration-150",
              "focus-visible:ring-2 focus-visible:ring-black/10",
              on ? "text-[#1a1a2e]" : "text-[#6b7280] hover:text-[#1a1a2e]",
            )}
          >
            {icon}
            <span className="truncate">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * Two to four answers that fit side by side get the segmented control; a
 * longer list, or one with long labels, gets the select.
 */
export function fitsSegmented(options: SettingOption[]): boolean {
  if (options.length < 2 || options.length > 4) return false
  const longest = Math.max(...options.map((o) => o.label.length))
  return options.length <= 2 ? longest <= 16 : options.length === 3 ? longest <= 10 : longest <= 7
}
