"use client"

/**
 * ===========================================================================
 *  THE COMMUNITY ADMIN'S LISTS, DRAWN THE WAY ORDERS DRAWS ITS (round 32)
 * ===========================================================================
 * The owner, on a computer: the community admin "looks horrible, too shrunk".
 * Each list was one column of words with a long grey line under every name,
 * so a 1000px card held a 300px column and empty white beside it. From 768px
 * a list is now a table, as Orders and Products draw one (app/app/orders/
 * orders-list.tsx): a grey head row of 36px with the column names, rows of
 * one height each, a hairline between them, the row's menu in the last
 * column, a check box first where rows can be picked together, and a foot
 * that says how many are shown with Show more in it. A phone keeps the list
 * it had: one row per thing, its words in two lines.
 *
 * The pieces here hold only what two or more sections share: the table's
 * classes, the sort pick (the Products view pick with the sort glyph), the
 * selection, the bar that acts on it, the foot, a CSV made in the browser,
 * and the facts list of a detail sheet. parts.tsx keeps the fields, the
 * dialogs and the list card itself.
 */
import * as React from "react"
import { createPortal } from "react-dom"
import { ArrowUpDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { Checkbox } from "@/app/app/orders/order-parts"
import { PickSheet, type PickOption } from "@/app/app/products/pick-sheet"
import { csvRow } from "./logic"
import { buttonSecondary } from "./parts"
import { SHEET_CLOSE_EASE, SHEET_EASE } from "@/components/ui/bottom-sheet"
import { tt } from "@/lib/i18n/text"
import { appLocale } from "@/lib/i18n/format"

export { Checkbox }

/* ── The table ──────────────────────────────────────────────────────────── */

/** The table itself: shown from 768px, its columns set by the head's widths. */
export const TABLE = "hidden w-full table-fixed border-separate border-spacing-0 md:table"
/** A head cell: Orders' grey row, 36px, the names in 12px. */
export const TH = "h-9 whitespace-nowrap bg-[#f7f7f8] px-3 text-left text-[12px] font-medium text-[#4b5563] first:pl-5 last:pr-4"
/** A body cell: a hairline above, the words in 13.5px, nothing wraps. */
export const TD = "border-t border-[#f0f1f3] px-3 align-middle text-[13.5px] text-[#303036] first:pl-5 last:pr-4"
/** A row that opens what it is: the pointer, a soft grey under it, the same grey while its check box is on. */
export const TR = "group/row cursor-pointer transition-colors duration-100 hover:bg-[#fafafb] data-[picked]:bg-[#f6f6f8] [-webkit-tap-highlight-color:transparent]"
/** The phone's list under the table, hidden from 768px. */
export const PHONE_LIST = "divide-y divide-[#f1f2f4] md:hidden"
/** Quiet words in a cell (a date, a count). */
export const MUTED = "text-[#6b7280]"

/** "1,284", in the chosen language. */
export const count = (n: number) => n.toLocaleString(appLocale())

/* ── Sort ───────────────────────────────────────────────────────────────── */

/**
 * The order of a list: the sort glyph and the order's name, opening the
 * Products pick (the app's dropdown from 768px, the shared bottom sheet on a
 * phone). On a phone only the glyph shows, the name is in its label.
 */
export function SortPick({ value, options, onPick, name = "sort" }: { value: string; options: readonly PickOption[]; onPick: (v: string) => void; name?: string }) {
  const current = options.find((o) => o.value === value)?.label ?? options[0]?.label ?? ""
  return (
    <PickSheet
      name={name}
      title={tt("Sort by")}
      options={options}
      value={value}
      onPick={onPick}
      align="end"
      trigger={
        <button
          type="button"
          data-pick={name}
          aria-label={tt("Sort by: {current}. Change", { current })}
          className="flex h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-[14px] font-medium text-[#1a1a2e] outline-none transition-colors duration-100 active:bg-[#f1f2f4] focus-visible:shadow-[inset_0_0_0_2px_#1a1a2e] md:h-8 md:min-w-0 md:px-2 md:text-[13px] md:hover:bg-[#f4f4f6] md:data-open:bg-[#ececef]"
        >
          <ArrowUpDown aria-hidden className="h-4 w-4 text-[#6b7280] md:h-[15px] md:w-[15px]" />
          <span className="max-md:hidden">{current}</span>
        </button>
      }
    />
  )
}

/* ── Picking rows ───────────────────────────────────────────────────────── */

/** Which rows are picked, by id. Rows that leave the list leave the selection. */
export function useSelection(ids: string[]) {
  const [picked, setPicked] = React.useState<Set<string>>(() => new Set())
  const key = ids.join(",")
  React.useEffect(() => {
    setPicked((s) => {
      if (s.size === 0) return s
      const here = new Set(key ? key.split(",") : [])
      const next = new Set([...s].filter((id) => here.has(id)))
      return next.size === s.size ? s : next
    })
  }, [key])
  const set = React.useCallback((list: string[], on: boolean) => {
    setPicked((s) => {
      const next = new Set(s)
      for (const id of list) {
        if (on) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }, [])
  const clear = React.useCallback(() => setPicked(new Set()), [])
  const all = ids.length > 0 && ids.every((id) => picked.has(id))
  const some = !all && ids.some((id) => picked.has(id))
  return { picked, set, clear, all, some, size: picked.size }
}

/** The head's check box: all of the rows shown, or none. */
export function PickAll({ sel, ids }: { sel: ReturnType<typeof useSelection>; ids: string[] }) {
  return (
    <label className="flex h-9 w-full cursor-pointer items-center">
      <Checkbox label={sel.all ? tt("Deselect all") : tt("Select all")} checked={sel.all} indeterminate={sel.some} onChange={(on) => sel.set(ids, on)} />
    </label>
  )
}

/** A row's check box, with a press area the size of the cell, that never opens the row. */
export function PickOne({ on, label, onChange }: { on: boolean; label: string; onChange: (on: boolean) => void }) {
  return (
    <label className="-my-2 flex h-14 w-full cursor-pointer items-center" onClick={(e) => e.stopPropagation()}>
      <Checkbox label={label} checked={on} onChange={onChange} />
    </label>
  )
}

/**
 * What to do with the picked rows: how many, the actions, Clear. It floats at
 * the foot of the screen while any are picked, the way Settings' save bar
 * does (components/app/settings-form-new.tsx): a white bar with a hairline
 * and a soft shadow, above the navigation pill on a phone, rising in on
 * translate and opacity. So it is in reach wherever the list is scrolled to,
 * and nothing in the list moves when it comes or goes. Drawn into the body,
 * so no scrolling pane around the list can hold it.
 */
export function BulkBar({ size, onClear, children }: { size: number; onClear: () => void; children: React.ReactNode }) {
  const [host, setHost] = React.useState<HTMLElement | null>(null)
  React.useEffect(() => setHost(document.body), [])
  const up = size > 0
  /* The last words while it leaves, so it does not empty itself on the way down. */
  const kept = React.useRef({ size, children })
  if (up) kept.current = { size, children }
  if (!host) return null
  return createPortal(
    <div
      data-bulk-bar={up ? "up" : "down"}
      aria-hidden={!up || undefined}
      className="pointer-events-none fixed inset-x-0 z-40 flex justify-center px-3 bottom-[calc(var(--app-nav-top,0px)+10px)] md:left-[var(--app-rail-w,240px)] md:bottom-[max(16px,env(safe-area-inset-bottom))] md:px-6"
    >
      <div
        role="region"
        aria-label={tt("Selected rows")}
        className={cn(
          "flex w-full max-w-[640px] items-center gap-2 rounded-[14px] border border-[#e5e7eb]/80 bg-white/95 py-1.5 pl-3.5 pr-1.5 shadow-[0_10px_30px_-16px_rgba(17,24,39,0.30),0_2px_6px_-2px_rgba(17,24,39,0.08)] will-change-[translate,opacity] transition-[translate,opacity] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
          up ? "pointer-events-auto translate-y-0 opacity-100 duration-[320ms]" : "translate-y-4 opacity-0 duration-[220ms]",
        )}
      >
        <span className="shrink-0 text-[14px] font-medium tabular-nums text-[#1a1a2e]">{tt("{size} selected", { size: kept.current.size })}</span>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5 overflow-x-auto scrollbar-hide">{kept.current.children}</div>
        <button type="button" onClick={onClear} tabIndex={up ? 0 : -1} className="h-10 shrink-0 cursor-pointer rounded-lg px-2.5 text-[13.5px] font-medium text-[#4b5563] hover:bg-[#f1f2f4] md:h-9">
          {tt("Clear")}
        </button>
      </div>
    </div>,
    host,
  )
}

/** A bulk action's button: the secondary button, the bar's height. */
export const bulkButton = cn(buttonSecondary, "shrink-0 md:h-9 md:rounded-[10px] md:px-3 md:text-[13.5px]")

/* ── The foot ───────────────────────────────────────────────────────────── */

/**
 * The last row of a list card: how many are shown (and of how many, when the
 * total is known), and Show more while there are more. Orders' foot: 44px,
 * the faint grey, the words in 12px.
 */
export function ListFoot({ shown, total, more, loading, onMore, label }: { shown: number; total?: number | null; more: boolean; loading?: boolean; onMore?: () => void; /** How many are shown, in words that count them the language's way ("50 members"). */ label?: (n: number) => string }) {
  if (shown === 0) return null
  return (
    <div data-list-foot="" className="flex min-h-11 items-center justify-between gap-3 border-t border-[#eef0f2] bg-[#fafafb] py-1.5 pl-4 pr-2 md:pl-5 md:pr-3">
      <span className="truncate text-[12.5px] tabular-nums text-[#6b7280]">
        {typeof total === "number" && total >= shown ? tt("{shown} of {total}", { shown: count(shown), total: count(total) }) : label ? label(shown) : count(shown)}
      </span>
      {more ? (
        <button type="button" onClick={onMore} disabled={loading} className={cn(buttonSecondary, "shrink-0 md:h-7 md:text-[12.5px]")} data-load-more="">
          {loading ? tt("Loading") : tt("Show more")}
        </button>
      ) : null}
    </div>
  )
}

/* ── A CSV from rows already on screen ──────────────────────────────────── */

/** Hands the browser a CSV made of these rows (the selection's export: nothing is asked of the server). */
export function downloadCsv(fileName: string, head: string[], rows: unknown[][]) {
  const text = [csvRow(head), ...rows.map((r) => csvRow(r))].join("")
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }))
  const a = document.createElement("a")
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/* ── A detail sheet's facts ─────────────────────────────────────────────── */

/** Label and value pairs, two to a row from 480px: what a detail sheet knows about one thing. */
export function Facts({ items }: { items: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-[#eef0f2] bg-[#fafafb] px-4 py-3.5" data-facts="">
      {items.map((x) => (
        <div key={x.label} className="min-w-0">
          <dt className="text-[12px] font-medium text-[#6b7280]">{x.label}</dt>
          <dd className="mt-0.5 truncate text-[14px] text-[#1a1a2e]">{x.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/* ── A sheet from the right, on a computer (round 33) ───────────────────── */

/**
 * Above the app's bars and the section's toasts, under everything that can open from inside it: the dialogs and menus
 * (components/ui/dialog.tsx, the action menu), the lightbox (160) and the member side's confirm sheet (150).
 */
export const SIDE_SHEET_Z = 85
const SIDE_IN_MS = 260
const SIDE_OUT_MS = 200
/** Off screen to the right, with room for its shadow. */
const SIDE_OFF = "calc(100% + 32px) 0"

/**
 * What a row opens without leaving the list (the Posts viewer, ./post-viewer.tsx): the full height of the screen on its
 * right, the page dimmed under it. The move is a Web Animation on `translate`, started before the first paint, so the
 * compositor runs it from the first frame; a plain fade with reduced motion. Escape, the dim and the bar's own close
 * button close it, unless a dialog, a menu or the lightbox opened from inside it is up (Escape is theirs then). What was
 * in it stays while it slides out. A wheel over the dim does not scroll the page under it.
 */
export function SideSheet({ open, onClose, label, bar, onShown, name, children }: { open: boolean; onClose: () => void; label: string; /** Its top: a title, a close button, whatever stays put while the rest scrolls. */ bar: React.ReactNode; /** The move in has finished. */ onShown?: () => void; /** data-side-sheet, for the probes. */ name: string; children: React.ReactNode }) {
  const [present, setPresent] = React.useState(open)
  if (open && !present) setPresent(true)
  const kept = React.useRef({ bar, children })
  if (open) kept.current = { bar, children }
  if (!present || typeof document === "undefined") return null
  return createPortal(
    <SideSheetPanel open={open} onClose={onClose} label={label} name={name} onShown={onShown} onGone={() => setPresent(false)} bar={open ? bar : kept.current.bar}>
      {open ? children : kept.current.children}
    </SideSheetPanel>,
    document.body,
  )
}

function SideSheetPanel({ open, onClose, label, name, onShown, onGone, bar, children }: { open: boolean; onClose: () => void; label: string; name: string; onShown?: () => void; onGone: () => void; bar: React.ReactNode; children: React.ReactNode }) {
  const rootRef = React.useRef<HTMLDivElement>(null)
  const panelRef = React.useRef<HTMLDivElement>(null)
  const scrimRef = React.useRef<HTMLDivElement>(null)
  const done = React.useRef({ onShown, onGone })
  React.useEffect(() => {
    done.current = { onShown, onGone }
  })
  const first = React.useRef(true)
  const returnTo = React.useRef<HTMLElement | null>(null)

  React.useLayoutEffect(() => {
    const panel = panelRef.current
    const scrim = scrimRef.current
    if (!panel || !scrim) return
    const arriving = first.current
    first.current = false
    if (arriving) {
      returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      panel.focus({ preventScroll: true })
    }
    const finish = () => {
      if (open) return done.current.onShown?.()
      done.current.onGone()
      const back = returnTo.current
      if (back && back.isConnected) back.focus({ preventScroll: true })
    }
    if (typeof panel.animate !== "function") return finish()
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      if (open) return finish()
      const fade = panel.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: "forwards" })
      scrim.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: "forwards" })
      fade.onfinish = finish
      return
    }
    /* From wherever it is now (a close while it was still coming in starts from there), to where it is going. */
    const now = getComputedStyle(panel).translate
    const from = arriving ? SIDE_OFF : now === "none" ? "0px 0px" : now
    const dimFrom = arriving ? 0 : Number(getComputedStyle(scrim).opacity)
    for (const a of [...panel.getAnimations(), ...scrim.getAnimations()]) a.cancel()
    const ms = open ? SIDE_IN_MS : SIDE_OUT_MS
    const move = panel.animate([{ translate: from }, { translate: open ? "0 0" : SIDE_OFF }], { duration: ms, easing: open ? SHEET_EASE : SHEET_CLOSE_EASE, fill: "forwards" })
    const dim = scrim.animate([{ opacity: dimFrom }, { opacity: open ? 1 : 0 }], { duration: ms, easing: "ease-out", fill: "forwards" })
    let ended = false
    const end = () => {
      if (ended) return
      ended = true
      /* Arrived: the move lets go, so nothing in the sheet sits inside a moved box (a fixed child is placed on the screen again). */
      if (open) {
        move.cancel()
        dim.cancel()
      }
      finish()
    }
    move.onfinish = end
    /* A tab in the background draws no frames: it still arrives or goes. */
    const t = window.setTimeout(end, ms + 200)
    return () => window.clearTimeout(t)
  }, [open])

  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return
      if (document.querySelector("[data-lightbox], [role=alertdialog], [role=dialog][data-state=open], [role=menu]")) return
      e.preventDefault()
      onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  React.useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !(e.target as HTMLElement | null)?.closest?.("[data-side-sheet-scroll]")) e.preventDefault()
    }
    root.addEventListener("wheel", onWheel, { passive: false })
    return () => root.removeEventListener("wheel", onWheel)
  }, [])

  return (
    <div ref={rootRef} className="fixed inset-0" style={{ zIndex: SIDE_SHEET_Z, pointerEvents: open ? undefined : "none" }} data-side-sheet-root={name}>
      <div ref={scrimRef} aria-hidden className="absolute inset-0 bg-[#0f1115]/25" onClick={open ? onClose : undefined} data-side-sheet-scrim="" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        data-sheet-root=""
        data-side-sheet={name}
        data-side-sheet-open={open ? "" : undefined}
        className="absolute inset-y-0 right-0 flex w-[min(640px,calc(100vw-48px))] flex-col border-l border-[#e5e7eb]/80 bg-white pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] shadow-[-24px_0_64px_-28px_rgba(17,24,39,0.3)] outline-none"
      >
        <div className="shrink-0 border-b border-[#f0f1f3]" data-side-sheet-bar="">
          {bar}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-color:var(--sl-scroll-thumb,#d3d6db)_transparent] [scrollbar-width:thin]" data-side-sheet-scroll="">
          {children}
        </div>
      </div>
    </div>
  )
}
