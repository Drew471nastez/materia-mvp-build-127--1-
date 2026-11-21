"use client"
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react"
import { Check, ChevronDown } from "lucide-react"

/*
  A FORM'S DROPDOWN, IN THE FORM'S OWN LOOK (round 24).

  The owner (r24, 24.png): "Cum ai prefera să lucrăm?" opened the system's
  menu, a grey macOS list over a dark OnePage sheet. This is the same
  question as a select-only combobox (WAI-ARIA APG): a button that names the
  choice, and a listbox under it drawn from the form's variables
  (--form-field, --form-line, --sheet-ink, --sheet-bg), so it is light on a
  light page, dark on a dark one, in the page's typeface and corners.

    keyboard   focus stays on the button; the list's active row is
               aria-activedescendant. Down, Up, Home, End, Page Up and Down
               move; Enter or Space picks; Escape closes (the sheet round it
               stays, components/onepage/block-sheet-context popupOpenAt); Tab
               picks the active row and moves on; typing jumps to a row.
    place      under the field, inside the sheet's own scroll; above it when
               there is no room under it; never taller than the room there is,
               so on a phone it stays inside the sheet.
    motion     160ms in, 120ms out, opacity and transform only; nothing moves
               under reduced motion.

  The value handed back is the option's id, exactly what the <select> gave,
  so submission and the server's checks are unchanged.
*/

export type FormSelectOption = { id: string; label: string }

const ROW = 44
const GAP = 6
const MAX_LIST = 296
const MIN_LIST = ROW * 2 + 8

/** The nearest ancestor that clips or scrolls (the sheet's body), else the window. */
function scrollBox(el: HTMLElement | null): HTMLElement | null {
  for (let p = el?.parentElement; p; p = p.parentElement) {
    if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(p).overflowY)) return p
  }
  return null
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()

export function FormSelect({
  id,
  options,
  value,
  onChange,
  placeholder = "Choose…",
  required,
  describedBy,
  labelId,
  className = "",
}: {
  id: string
  options: FormSelectOption[]
  value: string
  onChange: (id: string) => void
  placeholder?: string
  required?: boolean
  describedBy?: string
  /** The question's own label, which names the button. */
  labelId: string
  className?: string
}) {
  const listId = `${id}-listbox`
  const own = useId()
  const optionId = (i: number) => `${id}-option-${i}-${own.replace(/:/g, "")}`
  const wrap = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLUListElement>(null)
  /* shown: drawn at all; open: drawn and coming in (false while it goes). */
  const [shown, setShown] = useState(false)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [place, setPlace] = useState<{ above: boolean; max: number }>({ above: false, max: MAX_LIST })
  const typed = useRef({ text: "", at: 0 })
  const leaving = useRef<number | null>(null)
  const chosen = options.findIndex((o) => o.id === value)
  const current = chosen >= 0 ? options[chosen] : null

  const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches

  const show = useCallback(
    (at: number) => {
      if (leaving.current) window.clearTimeout(leaving.current)
      leaving.current = null
      setActive(Math.max(0, Math.min(options.length - 1, at)))
      setShown(true)
      setOpen(true)
    },
    [options.length],
  )
  const hide = useCallback(() => {
    setOpen(false)
    if (leaving.current) window.clearTimeout(leaving.current)
    if (reduced()) {
      setShown(false)
      return
    }
    leaving.current = window.setTimeout(() => {
      leaving.current = null
      setShown(false)
    }, 130)
  }, [])
  useEffect(() => () => {
    if (leaving.current) window.clearTimeout(leaving.current)
  }, [])

  const pick = (i: number) => {
    const o = options[i]
    if (o) onChange(o.id)
    hide()
  }

  /* Where it goes: under the field when the list fits there, else above when there is more room above; never taller than the room. */
  useLayoutEffect(() => {
    if (!open || !button.current) return
    const r = button.current.getBoundingClientRect()
    const box = scrollBox(wrap.current)
    const b = box?.getBoundingClientRect()
    const top = Math.max(b ? b.top : 0, 0)
    const bottom = Math.min(b ? b.bottom : window.innerHeight, window.innerHeight)
    const below = bottom - r.bottom - GAP - 8
    const aboveRoom = r.top - top - GAP - 8
    const want = Math.min(MAX_LIST, options.length * ROW + 8)
    const above = below < want && aboveRoom > below
    setPlace({ above, max: Math.max(MIN_LIST, Math.min(MAX_LIST, above ? aboveRoom : below)) })
  }, [open, options.length])

  /* The active row stays in view inside the list (the list's own scroll only, never the sheet's). */
  useEffect(() => {
    if (!open || active < 0) return
    const ul = list.current
    const li = ul?.children[active] as HTMLElement | undefined
    if (!ul || !li) return
    if (li.offsetTop < ul.scrollTop) ul.scrollTop = li.offsetTop
    else if (li.offsetTop + li.offsetHeight > ul.scrollTop + ul.clientHeight) ul.scrollTop = li.offsetTop + li.offsetHeight - ul.clientHeight
  }, [open, active, place.max])

  /* A tap anywhere else closes it. */
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) hide()
    }
    document.addEventListener("pointerdown", away, true)
    return () => document.removeEventListener("pointerdown", away, true)
  }, [open, hide])

  /* Typing a label's first letters moves to it (and opens the list when it is closed). */
  const typeAhead = (key: string) => {
    const now = Date.now()
    const t = typed.current
    t.text = now - t.at > 600 ? key : t.text + key
    t.at = now
    const needle = fold(t.text)
    const same = needle.split("").every((c) => c === needle[0])
    const from = open ? active : chosen
    const order = options.map((_, k) => (from + (same ? 1 : 0) + k + options.length) % options.length)
    const hit = order.find((k) => fold(options[k].label).startsWith(same ? needle[0] : needle))
    return hit
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const last = options.length - 1
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " " || e.key === "Home" || e.key === "End") {
        e.preventDefault()
        show(e.key === "Home" ? 0 : e.key === "End" ? last : chosen >= 0 ? chosen : e.key === "ArrowUp" ? last : 0)
        return
      }
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && e.key !== " ") {
        const hit = typeAhead(e.key)
        if (hit !== undefined) show(hit)
      }
      return
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault()
        if (e.altKey) return
        setActive((a) => Math.min(last, a + 1))
        return
      case "ArrowUp":
        e.preventDefault()
        if (e.altKey) return pick(active)
        setActive((a) => Math.max(0, a - 1))
        return
      case "Home":
        e.preventDefault()
        setActive(0)
        return
      case "End":
        e.preventDefault()
        setActive(last)
        return
      case "PageDown":
        e.preventDefault()
        setActive((a) => Math.min(last, a + 10))
        return
      case "PageUp":
        e.preventDefault()
        setActive((a) => Math.max(0, a - 10))
        return
      case "Enter":
      case " ":
        e.preventDefault()
        pick(active)
        return
      case "Escape":
        e.preventDefault()
        e.stopPropagation()
        hide()
        return
      case "Tab":
        pick(active)
        return
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          const hit = typeAhead(e.key)
          if (hit !== undefined) setActive(hit)
        }
    }
  }

  return (
    <div ref={wrap} className="relative min-w-0" data-form-select="">
      <button
        ref={button}
        type="button"
        id={id}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-labelledby={`${labelId} ${id}`}
        aria-describedby={describedBy}
        aria-required={required || undefined}
        aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
        data-value={value || ""}
        onClick={() => (open ? hide() : show(chosen >= 0 ? chosen : 0))}
        onKeyDown={onKeyDown}
        onBlur={(e) => {
          if (open && !wrap.current?.contains(e.relatedTarget as Node | null)) hide()
        }}
        className={`${className} flex min-h-11 items-center gap-2 text-left`}
      >
        <span className={`min-w-0 flex-1 truncate ${current ? "" : "text-[var(--sheet-muted,#6b7280)]"}`} data-form-select-value="">
          {current ? current.label : placeholder}
        </span>
        <ChevronDown aria-hidden className={`h-4 w-4 shrink-0 opacity-70 transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-180" : ""}`} />
      </button>
      {shown ? (
        <ul
          ref={list}
          id={listId}
          role="listbox"
          aria-labelledby={labelId}
          tabIndex={-1}
          data-form-select-list={place.above ? "above" : "below"}
          data-state={open ? "open" : "closed"}
          /* Focus stays on the button: a press on a row must not take it. */
          onMouseDown={(e) => e.preventDefault()}
          style={{
            maxHeight: place.max,
            background: "linear-gradient(var(--form-field, transparent), var(--form-field, transparent)), var(--sheet-bg, var(--sheet-on-ink, #ffffff))",
            transformOrigin: place.above ? "bottom center" : "top center",
          }}
          className={`absolute inset-x-0 z-30 overflow-y-auto overscroll-contain rounded-xl border border-[var(--form-line,#dfe2e7)] p-1 text-[16px] text-[var(--sheet-ink,#1a1a2e)] shadow-[0_12px_32px_-8px_rgba(0,0,0,0.35),0_2px_6px_-2px_rgba(0,0,0,0.18)] outline-none sm:text-[15px] ${
            place.above ? "bottom-[calc(100%+6px)]" : "top-[calc(100%+6px)]"
          } ${
            open
              ? `motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-98 motion-safe:duration-[160ms] motion-safe:ease-out ${place.above ? "motion-safe:slide-in-from-bottom-1" : "motion-safe:slide-in-from-top-1"}`
              : "pointer-events-none motion-safe:animate-out motion-safe:fade-out-0 motion-safe:zoom-out-98 motion-safe:duration-[120ms] motion-safe:ease-in motion-safe:fill-mode-forwards"
          }`}
        >
          {options.map((o, i) => {
            const selected = o.id === value
            const on = i === active
            return (
              <li
                key={o.id}
                id={optionId(i)}
                role="option"
                aria-selected={selected}
                data-option={o.id}
                data-active={on ? "" : undefined}
                onPointerMove={() => active !== i && setActive(i)}
                onClick={() => {
                  pick(i)
                  button.current?.focus({ preventScroll: true })
                }}
                className={`flex min-h-11 cursor-pointer select-none items-center gap-2.5 rounded-lg px-3 py-2 ${selected ? "font-medium" : ""} ${
                  on ? "bg-[color-mix(in_srgb,var(--sheet-ink,#1a1a2e)_9%,transparent)]" : ""
                }`}
              >
                <span className="min-w-0 flex-1 break-words">{o.label}</span>
                <Check aria-hidden className={`h-4 w-4 shrink-0 ${selected ? "opacity-100" : "opacity-0"}`} strokeWidth={2.25} />
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
