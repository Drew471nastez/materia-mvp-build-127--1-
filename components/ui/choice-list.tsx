"use client"

/**
 * ===========================================================================
 *  PICK ONE FROM A LONG LIST: LANGUAGE, TIME ZONE, COUNTRY
 * ===========================================================================
 * "The select language pop up is not updated to the latest UI of Storelib
 * and Polaris. Update it, and a mobile bottom sheet as well. And the time
 * zone as well, make it cleaner." The country field followed
 * (components/app/settings/country-picker), with a flag before each name
 * (`leading`, and `fieldLeading` in the field).
 *
 * One list, drawn in two places:
 *
 *   A COMPUTER   a popover under the field, 360px, a search field at the top
 *                and rows under it: the name, a quieter line under it, and a
 *                check on the one chosen. Polaris' Autocomplete, in the /app
 *                palette. The account menu, which has no field to hang from,
 *                opens the same list as a small dialog.
 *   A PHONE      the shared sheet (components/ui/bottom-sheet): the grabber,
 *                no X, the search pinned at the top, 48px rows.
 *
 * Search ignores case and accents, and every word typed has to match
 * somewhere in the row (its name, its line, its aside, or its keywords), so
 * "new york", "utc-5" and "eastern" all find New York.
 */
import * as React from "react"
import { Check, ChevronDown, Search, X } from "lucide-react"
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { cn } from "@/lib/utils"
import { matches, type Choice } from "@/lib/ui/choice-match"
import { tt } from "@/lib/i18n/text"

export type { Choice }

/** True below 640px, where panels become sheets, as everywhere else in /app. */
export function usePhoneWidth(): boolean {
  const [phone, setPhone] = React.useState(false)
  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)")
    const on = () => setPhone(mq.matches)
    on()
    mq.addEventListener("change", on)
    return () => mq.removeEventListener("change", on)
  }, [])
  return phone
}

export { matches }

function moveFocus(e: React.KeyboardEvent<HTMLElement>) {
  /* The search already moved the focus to the first row (ChoiceSearch): moving it again skipped that row. */
  if (e.defaultPrevented) return
  const rows = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("[data-choice]"))
  if (!rows.length) return
  const at = rows.indexOf(document.activeElement as HTMLButtonElement)
  /* Home and End on a row go to the first and the last; in the search they move the caret. */
  if ((e.key === "Home" || e.key === "End") && at >= 0) {
    e.preventDefault()
    rows[e.key === "Home" ? 0 : rows.length - 1].focus()
    return
  }
  const step = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0
  if (!step) return
  e.preventDefault()
  if (at === 0 && step === -1) {
    e.currentTarget.closest("[data-choice-list]")?.querySelector<HTMLInputElement>("[data-choice-search]")?.focus()
    return
  }
  rows[at < 0 ? 0 : Math.min(rows.length - 1, Math.max(0, at + step))].focus()
}

/**
 * The chosen row in the middle of the list it scrolls in, before anything is
 * painted. Its own scroller only: `scrollIntoView` scrolls every scroller
 * around the row too, and could move the page under the list.
 */
function centerChecked(root: Element | null) {
  const row = root?.querySelector<HTMLElement>("[data-choice][data-checked]")
  const scroller = row?.closest<HTMLElement>("[data-choice-scroll], [data-sheet-scroll]")
  if (!row || !scroller) return
  const r = row.getBoundingClientRect()
  const s = scroller.getBoundingClientRect()
  scroller.scrollTop += r.top - s.top - (s.height - r.height) / 2
}

function Row({
  choice,
  checked,
  compact,
  onPick,
  leading,
}: {
  choice: Choice
  checked: boolean
  compact: boolean
  onPick: () => void
  /** Drawn before the name: a country's flag. */
  leading?: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={checked}
      data-choice={choice.value}
      data-checked={checked || undefined}
      onClick={onPick}
      className={cn(
        "flex w-full cursor-pointer items-center gap-3 rounded-lg text-left outline-none transition-colors duration-100 focus-visible:bg-[#f1f1f4]",
        compact ? "min-h-[48px] px-3 py-1.5 active:bg-[#f1f1f4]" : "min-h-[40px] px-2.5 py-1.5 hover:bg-[#f4f4f6] active:bg-[#ececef]",
      )}
    >
      {leading}
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-[#1a1a2e]", compact ? "text-[15px]" : "text-[13px]", checked && "font-semibold")}>{choice.label}</span>
        {choice.detail ? (
          <span className={cn("block truncate text-[#6b7280]", compact ? "text-[13px]" : "text-[12px]")}>{choice.detail}</span>
        ) : null}
      </span>
      {choice.aside ? (
        <span className={cn("shrink-0 tabular-nums text-[#6b7280]", compact ? "text-[13px]" : "text-[12px]")}>{choice.aside}</span>
      ) : null}
      <span className="flex w-4 shrink-0 justify-center" aria-hidden>
        {checked ? <Check className="h-4 w-4 text-[#1a1a2e]" strokeWidth={2.25} /> : null}
      </span>
    </button>
  )
}

/**
 * The search and the rows. `lead` is drawn above the rows while nothing is
 * typed ("Use my current time zone").
 */
export function ChoiceList({
  choices,
  value,
  onPick,
  compact,
  label,
  placeholder,
  lead,
  leading,
  uniform = false,
  autoFocus = false,
  searchInHeader = false,
  scrollClassName,
  searchable = true,
}: {
  choices: Choice[]
  value: string | null
  onPick: (value: string) => void
  compact: boolean
  /** What the list is, for assistive technology ("Language"). */
  label: string
  placeholder: string
  lead?: (compact: boolean) => React.ReactNode
  /** A picture before each name (a country's flag); `near` is false for a row drawn after the list opened, off screen. */
  leading?: (choice: Choice, near: boolean) => React.ReactNode
  /** Every row is one line (ROW_PX tall): the list opens with the rows around the chosen one. */
  uniform?: boolean
  autoFocus?: boolean
  /** On a phone the search is drawn by the sheet's header instead (ChoiceSearch). */
  searchInHeader?: boolean
  /** Taller scroll area for long lists (countries). */
  scrollClassName?: string
  /** Round AN: rows alone, no search field (a short list). */
  searchable?: boolean
}) {
  const [query, setQuery] = React.useState("")
  return (
    <ChoiceListBody
      choices={choices}
      value={value}
      onPick={onPick}
      compact={compact}
      label={label}
      lead={lead}
      leading={leading}
      uniform={uniform}
      query={query}
      scrollClassName={scrollClassName}
      search={searchInHeader || !searchable ? null : <ChoiceSearch value={query} onChange={setQuery} placeholder={placeholder} label={label} compact={compact} autoFocus={autoFocus} />}
    />
  )
}

export function ChoiceSearch({
  value,
  onChange,
  placeholder,
  label,
  compact,
  autoFocus = false,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  label: string
  compact: boolean
  autoFocus?: boolean
}) {
  return (
    <div className={cn("relative", compact ? "px-4 pb-2" : "px-1.5 pb-1.5 pt-1.5")}>
      <Search className={cn("pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]", compact ? "left-7 -mt-1" : "left-4 mt-0")} aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault()
            const root = e.currentTarget.closest("[data-choice-list]") ?? e.currentTarget.closest("[data-sheet-panel]")
            root?.querySelector<HTMLElement>("[data-choice]")?.focus()
          }
        }}
        placeholder={placeholder}
        aria-label={tt("Search {value}", { value: label.toLowerCase() })}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        autoFocus={autoFocus}
        data-choice-search=""
        className={cn(
          "w-full min-w-0 pl-9 pr-3 text-[#1a1a2e] outline-none transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-[#9ca3af] [&::-webkit-search-cancel-button]:hidden",
          /* 16px on a phone: anything smaller and iOS zooms the page to type. In a
             sheet it is a soft filled field, the way a phone's own lists search. */
          compact ? "h-11 text-[16px]" : "h-9 text-[13px]",
          compact
            ? "rounded-xl border border-transparent bg-[#f3f4f6] focus:border-[#e3e5e8] focus:bg-white focus:shadow-[0_0_0_3px_rgba(17,17,19,0.05)]"
            : "rounded-lg border border-[#d5d7dd] bg-white focus:border-[#c9ccd3] focus:shadow-[0_0_0_3px_rgba(17,17,19,0.06)]",
        )}
      />
    </div>
  )
}

/** A row with one line of text, at each density: what `uniform` lists are drawn at. */
const ROW_PX = { compact: 48, regular: 40 } as const
/** How many rows either side of the chosen one a `uniform` list opens with. */
const OPEN_WITH = 12
/** Rows either side of the chosen one that are on screen when it opens: 8 fit the popover, 11 the sheet. */
const NEAR_ROWS = 7

function ChoiceListBody({
  choices,
  value,
  onPick,
  compact,
  label,
  lead,
  leading,
  uniform = false,
  query,
  search,
  scrollClassName,
}: {
  choices: Choice[]
  value: string | null
  onPick: (value: string) => void
  compact: boolean
  label: string
  lead?: (compact: boolean) => React.ReactNode
  leading?: (choice: Choice, near: boolean) => React.ReactNode
  uniform?: boolean
  query: string
  search: React.ReactNode
  scrollClassName?: string
}) {
  const shown = React.useMemo(() => (query.trim() ? choices.filter((c) => matches(c, query)) : choices), [choices, query])
  /*
    A LONG LIST OPENS WITH THE ROWS YOU CAN SEE. Every row of every country
    was rendered in the tap that opened it: about 100ms of script before the
    first frame of the popover, on a desktop Chromium. A `uniform` list (one
    line per row, so every row is ROW_PX tall) opens with the chosen row and
    OPEN_WITH either side of it, between two spacers exactly as tall as the
    rows they stand for, so the scroll and the chosen row are where they will
    be. The rest is rendered a frame later in a transition, which React does
    in slices between frames, and it lands on exactly the spacers' pixels.
  */
  const [whole, setWhole] = React.useState(!uniform)
  React.useEffect(() => {
    if (whole) return
    let timer = 0
    const frame = requestAnimationFrame(() => {
      timer = window.setTimeout(() => React.startTransition(() => setWhole(true)), 0)
    })
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(timer)
    }
  }, [whole])
  const at = Math.max(0, shown.findIndex((c) => c.value === value))
  const [from, to] = React.useMemo(() => [Math.max(0, at - OPEN_WITH), Math.min(shown.length, at + OPEN_WITH + 1)], [at, shown.length])
  const windowed = uniform && !whole && !query.trim()
  const rowPx = compact ? ROW_PX.compact : ROW_PX.regular
  /*
    The rows on screen when it opens carry everything at once; the others
    say they are not `near`, and a picture in them can wait until it is
    scrolled close (a country's flag is an SVG document of its own: the
    browser built sixty nine of them in the frames after the list opened).
  */
  const firstAt = React.useRef<number | null>(null)
  if (firstAt.current === null) firstAt.current = at
  const near = (i: number) => (query.trim() ? i < NEAR_ROWS * 2 : Math.abs(i - (firstAt.current ?? 0)) <= NEAR_ROWS)
  const row = (c: Choice, i: number) => (
    <Row key={c.value} choice={c} checked={c.value === value} compact={compact} onPick={() => onPick(c.value)} leading={leading?.(c, near(i))} />
  )
  return (
    <div data-choice-list="" onKeyDown={moveFocus}>
      {search}
      <div
        role="listbox"
        aria-label={label}
        data-choice-scroll={compact ? undefined : ""}
        data-choice-whole={windowed ? undefined : ""}
        className={cn(compact ? "px-2 pb-3" : "overflow-y-auto overscroll-contain px-1.5 pb-1.5", !compact && !search && "pt-1.5", compact ? "" : scrollClassName ?? "max-h-[320px]")}
      >
        {!query.trim() && lead ? lead(compact) : null}
        {/* One keyed list in both states, so the rows drawn first are kept, not drawn again, when the rest arrive. */}
        {uniform
          ? [
              <div key="__above" aria-hidden style={{ height: windowed ? from * rowPx : 0 }} />,
              ...(windowed ? shown.slice(from, to).map((c, i) => row(c, from + i)) : shown.map(row)),
              <div key="__below" aria-hidden style={{ height: windowed ? (shown.length - to) * rowPx : 0 }} />,
            ]
          : shown.map(row)}
        {shown.length === 0 ? (
          <p className={cn("px-3 py-3 text-[#6b7280]", compact ? "text-[15px]" : "text-[13px]")}>{tt("Nothing matches “{value}”", { value: query.trim() })}</p>
        ) : null}
      </div>
    </div>
  )
}

/** A row above the list that is an action rather than a choice. */
export function ChoiceAction({ compact, onClick, children, aside }: { compact: boolean; onClick: () => void; children: React.ReactNode; aside?: string }) {
  return (
    <>
      <button
        type="button"
        data-choice="__action"
        onClick={onClick}
        className={cn(
          "flex w-full cursor-pointer items-center gap-3 rounded-lg text-left font-medium text-[#1a1a2e] outline-none transition-colors duration-100 focus-visible:bg-[#f1f1f4]",
          compact ? "min-h-[48px] px-3 text-[15px] active:bg-[#f1f1f4]" : "min-h-[36px] px-2.5 text-[13px] hover:bg-[#f4f4f6]",
        )}
      >
        <span className="min-w-0 flex-1 truncate">{children}</span>
        {aside ? <span className={cn("shrink-0 font-normal tabular-nums text-[#6b7280]", compact ? "text-[13px]" : "text-[12px]")}>{aside}</span> : null}
        <span className="w-4 shrink-0" aria-hidden />
      </button>
      <div aria-hidden className={cn("h-px bg-[#eef0f2]", compact ? "mx-3 my-1" : "mx-2 my-1")} />
    </>
  )
}

/** How tall a list sheet opens with the keyboard down. */
export const CHOICE_SHEET_HEIGHT = "min(80dvh, 640px)"
/** The least room left for the title, the search and two rows above a keyboard. */
const KEYBOARD_ROOM_PX = 220
/**
 * THE SHEET STAYS WHERE IT OPENED WHEN THE KEYBOARD COMES UP. Focusing the
 * search on an iPhone grew the sheet by the keyboard's height: the shared
 * sheet (components/ui/bottom-sheet, lib/ui/keyboard-safe-sheet
 * sheetOverKeyboard) adds the keyboard to the height it is given, so a
 * 640px sheet became 976px, held only by "the visible screen less 24px",
 * and its top went up under the clock. Here the height it is given is the
 * opening height LESS the keyboard, never less than room for the title, the
 * search and a few rows: the helper adds the keyboard back, so the top stays
 * where it was and the list under the search is what gets shorter, the way
 * a phone's own sheets behave. Only a keyboard taller than the sheet leaves
 * room for lifts it, and never past the safe area at the top
 * (SHEET_UNDER_CLOCK). scripts/check-setup-country.mjs measures it with a
 * keyboard and the clock's safe area simulated.
 */
export function sheetAboveKeyboardHeight(height: string): string {
  return `max(calc(${height} - var(--kb-inset, 0px)), ${KEYBOARD_ROOM_PX}px)`
}
/** At most the screen under the clock's safe area and 12px more, keyboard or not (the helper adds the keyboard back). */
export const SHEET_UNDER_CLOCK = "calc(100dvh - env(safe-area-inset-top, 0px) - 12px - var(--kb-inset, 0px))"

/**
 * The list in the shared phone sheet: the grabber, a title, the search
 * pinned under it, the rows scrolling beneath. No X: the scrim, a pull down
 * and Escape close it.
 */
export function ChoiceSheet({
  open,
  onClose,
  title,
  choices,
  value,
  onPick,
  placeholder,
  lead,
  leading,
  uniform = false,
  scrollClassName,
  sheetZIndex,
  sheetHeight = CHOICE_SHEET_HEIGHT,
  searchable = true,
}: {
  open: boolean
  onClose: () => void
  title: string
  choices: Choice[]
  value: string | null
  onPick: (value: string) => void
  placeholder: string
  lead?: (compact: boolean) => React.ReactNode
  leading?: (choice: Choice, near: boolean) => React.ReactNode
  uniform?: boolean
  scrollClassName?: string
  /**
   * The sheet's stacking layer, when the field that opens it lives inside a
   * panel drawn above the usual z-index 200 (Set up payments). Left out, the
   * sheet sits where every other sheet sits.
   */
  sheetZIndex?: number
  /** How tall the sheet opens, keyboard down (the country list is a little shorter than the rest). */
  sheetHeight?: string
  /** False for a short list (an action, a template): no search field, and the sheet only as tall as its rows. */
  searchable?: boolean
}) {
  const [query, setQuery] = React.useState("")
  const [prevOpen, setPrevOpen] = React.useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) setQuery("")
  }
  /* A long list (every country, every zone) opens on the one chosen, in the
     middle of the sheet, from its first frame: this runs in the commit that
     puts the sheet in the document, before it is painted or starts to rise. */
  const listRef = React.useRef<HTMLDivElement>(null)
  React.useLayoutEffect(() => {
    if (open) centerChecked(listRef.current)
  }, [open])
  /* A short list with no search (round AN: an action, a template): no keyboard to make room for, and only as tall as its rows. */
  if (!searchable)
    return (
      <BottomSheet
        isOpen={open}
        onClose={onClose}
        label={title}
        maxHeight={CHOICE_SHEET_HEIGHT}
        zIndex={sheetZIndex}
        header={
          <div data-choice-sheet-header="">
            <p className="px-5 pb-2 pt-2 text-[16px] font-semibold text-[#1a1a2e]">{title}</p>
          </div>
        }
      >
        <div data-choice-sheet="" ref={listRef}>
          <ChoiceListBody choices={choices} value={value} onPick={onPick} compact label={title} lead={lead} leading={leading} uniform={uniform} query="" search={null} scrollClassName={scrollClassName ?? "max-h-[min(440px,52dvh)]"} />
        </div>
      </BottomSheet>
    )
  return (
    <BottomSheet
      isOpen={open}
      onClose={onClose}
      label={title}
      aboveKeyboard
      height={searchable ? sheetAboveKeyboardHeight(sheetHeight) : undefined}
      maxHeight={SHEET_UNDER_CLOCK}
      scrollKey={query}
      zIndex={sheetZIndex}
      header={
        <div data-choice-sheet-header="">
          <p className="px-5 pb-2 pt-2 text-[16px] font-semibold text-[#1a1a2e]">{title}</p>
          {searchable ? <ChoiceSearch value={query} onChange={setQuery} placeholder={placeholder} label={title} compact /> : null}
        </div>
      }
    >
      <div data-choice-sheet="" ref={listRef}>
        <ChoiceListBody choices={choices} value={value} onPick={onPick} compact label={title} lead={lead} leading={leading} uniform={uniform} query={query} search={null} scrollClassName={scrollClassName ?? "max-h-[min(440px,52dvh)]"} />
      </div>
    </BottomSheet>
  )
}

/**
 * A Settings field that opens the list: the choice's name on the left, its
 * aside on the right, a chevron. A popover under it on a computer, the sheet
 * on a phone.
 */
export function ChoicePicker({
  title,
  choices,
  value,
  onChange,
  placeholder,
  lead,
  leading,
  uniform = false,
  fieldLabel,
  fieldAside,
  fieldLeading,
  fieldMuted = false,
  name,
  id,
  scrollClassName,
  sheetZIndex,
  sheetHeight,
  fieldClassName,
  searchable = true,
  align = "start",
}: {
  title: string
  choices: Choice[] | (() => Choice[])
  value: string | null
  onChange: (value: string) => void
  placeholder: string
  lead?: (compact: boolean, pick: (value: string) => void) => React.ReactNode
  /** A picture before each name in the list (a country's flag). */
  leading?: (choice: Choice, near: boolean) => React.ReactNode
  /** Every row is one line: the list opens with the rows around the chosen one (ChoiceListBody). */
  uniform?: boolean
  fieldLabel: string
  fieldAside?: string
  /** The chosen one's picture, before its name in the field. */
  fieldLeading?: React.ReactNode
  /** Nothing chosen yet: the field's words are a prompt, in the placeholder grey. */
  fieldMuted?: boolean
  /** data-choice-field, for the probes. */
  name: string
  /** The field's id, for a <label htmlFor> beside it. */
  id?: string
  scrollClassName?: string
  /**
   * The sheet's stacking layer, when the field that opens it lives inside a
   * panel drawn above the usual z-index 200 (Set up payments). Left out, the
   * sheet sits where every other sheet sits.
   */
  sheetZIndex?: number
  /** How tall the phone sheet opens (ChoiceSheet). */
  sheetHeight?: string
  /** The field's look, for a form whose own fields are drawn differently (Set up payments). */
  fieldClassName?: string
  /** False for a short list (an action, a template): the rows alone, with no search field over them. */
  searchable?: boolean
  /** Which edge of the field the popover lines up with: "end" for a small field at the right of a row. */
  align?: "start" | "end"
}) {
  const [open, setOpen] = React.useState(false)
  const phone = usePhoneWidth()
  const list = React.useMemo(() => (open ? (typeof choices === "function" ? choices() : choices) : []), [open, choices])
  const pick = (v: string) => {
    setOpen(false)
    onChange(v)
  }
  const leadFor = lead ? (compact: boolean) => lead(compact, pick) : undefined
  const trigger = (
    <button
      type="button"
      id={id}
      data-choice-field={name}
      data-state={open ? "open" : "closed"}
      aria-haspopup={phone ? "dialog" : "listbox"}
      aria-expanded={open}
      onClick={phone ? () => setOpen(true) : undefined}
      className={cn(
        "flex h-11 w-full min-w-0 cursor-pointer items-center gap-2 rounded-xl border border-[#e5e7eb] bg-white px-3 text-left text-[14px] text-[#1a1a2e] shadow-[0_1px_0_rgba(17,24,39,0.04)] outline-none transition-[background-color,box-shadow,border-color] duration-100 hover:bg-[#fafafb] focus-visible:border-[#1a1a2e] focus-visible:shadow-[0_0_0_3px_rgba(26,26,46,0.10)]",
        /* The open ring belongs to a popover; under a sheet the field is hidden anyway, and a ring flashing as the sheet rises reads as a toggle. */
        !phone && "data-[state=open]:border-[#1a1a2e] data-[state=open]:shadow-[0_0_0_3px_rgba(26,26,46,0.08)]",
        fieldClassName,
      )}
    >
      {fieldLeading}
      <span className={cn("min-w-0 flex-1 truncate", fieldMuted && "text-[#9ca3af]")}>{fieldLabel}</span>
      {fieldAside ? <span className="shrink-0 tabular-nums text-[13px] text-[#6b7280]">{fieldAside}</span> : null}
      {/* The chevron turns over a popover it hangs from; a sheet covers the field, so on a phone it stays still. */}
      <ChevronDown className={cn("h-4 w-4 shrink-0 text-[#9ca3af] transition-transform duration-150", open && !phone && "rotate-180")} aria-hidden />
    </button>
  )

  if (phone) {
    return (
      <>
        {trigger}
        <ChoiceSheet open={open} onClose={() => setOpen(false)} title={title} choices={list} value={value} onPick={pick} placeholder={placeholder} lead={leadFor} leading={leading} uniform={uniform} scrollClassName={scrollClassName} sheetZIndex={sheetZIndex} sheetHeight={sheetHeight} searchable={searchable} />
      </>
    )
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align={align}
        sideOffset={6}
        collisionPadding={12}
        data-choice-popover={name}
        className="w-[var(--radix-popover-trigger-width)] min-w-[300px] max-w-[min(420px,calc(100vw-24px))] overflow-hidden rounded-xl border border-[#e3e4e8] bg-white p-0 text-[#1a1a2e] shadow-[0_12px_40px_-8px_rgba(17,24,39,0.22),0_2px_6px_rgba(17,24,39,0.06)]"
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          const root = e.currentTarget as HTMLElement | null
          /* With no search, the chosen row (or the first) takes the focus, so the arrows and Enter work at once. */
          root?.querySelector<HTMLElement>(searchable ? "[data-choice-search]" : "[data-choice][data-checked], [data-choice]")?.focus({ preventScroll: true })
          /* The chosen one in view under the search, not the top of a long list, and nothing else scrolled. */
          centerChecked(root)
        }}
      >
        <ChoiceList choices={list} value={value} onPick={pick} compact={false} label={title} placeholder={placeholder} lead={leadFor} leading={leading} uniform={uniform} searchable={searchable} scrollClassName={searchable ? scrollClassName : cn("pt-1.5", scrollClassName ?? "max-h-[320px]")} />
      </PopoverContent>
    </Popover>
  )
}

/**
 * The list where there is no field to hang it from (the account menu's
 * Language): a small dialog on a computer, 400px, the title and a close
 * button over the search, and the sheet on a phone.
 */
export function ChoiceDialog({
  open,
  onOpenChange,
  title,
  choices,
  value,
  onPick,
  placeholder,
  name,
  sheetZIndex,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  choices: Choice[]
  value: string | null
  onPick: (value: string) => void
  placeholder: string
  /** data-choice-dialog, for the probes. */
  name: string
  /** The phone sheet's layer, when it opens over something already above the page (the settings layer, z 420). */
  sheetZIndex?: number
}) {
  const phone = usePhoneWidth()
  const pick = (v: string) => {
    onOpenChange(false)
    onPick(v)
  }
  if (phone) {
    return <ChoiceSheet open={open} onClose={() => onOpenChange(false)} title={title} choices={choices} value={value} onPick={pick} placeholder={placeholder} sheetZIndex={sheetZIndex} />
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        data-choice-dialog={name}
        aria-describedby={undefined}
        className="w-[calc(100vw-32px)] max-w-[400px] gap-0 overflow-hidden rounded-xl border border-[#e3e4e8] bg-white p-0 text-[#1a1a2e] shadow-[0_24px_60px_-12px_rgba(17,24,39,0.28),0_2px_6px_rgba(17,24,39,0.06)] sm:max-w-[400px]"
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          const root = e.currentTarget as HTMLElement | null
          root?.querySelector<HTMLElement>("[data-choice-search]")?.focus({ preventScroll: true })
        }}
      >
        <div className="flex h-12 items-center justify-between border-b border-[#eef0f2] pl-4 pr-2">
          <DialogTitle className="text-[15px] font-semibold text-[#1a1a2e]">{title}</DialogTitle>
          <DialogClose
            aria-label={tt("Close")}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-[#6b7280] outline-none transition-colors hover:bg-[#f4f4f6] hover:text-[#1a1a2e] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20"
          >
            <X className="h-4 w-4" aria-hidden />
          </DialogClose>
        </div>
        <div className="pt-1">
          <ChoiceList choices={choices} value={value} onPick={pick} compact={false} label={title} placeholder={placeholder} />
        </div>
      </DialogContent>
    </Dialog>
  )
}
