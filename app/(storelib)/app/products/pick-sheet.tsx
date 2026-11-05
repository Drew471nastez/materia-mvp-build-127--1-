"use client"

/**
 * ===========================================================================
 *  A SHORT PICK-ONE LIST: THE VIEWS, AND THE ORDERS (A SHEET, OR A DROPDOWN)
 * ===========================================================================
 * "Put the sort by icon, which opens the mobile bottom sheet with only the
 * sort by options", and the view ("All") "opens a bottom sheet with only the
 * view options". Two sheets of a few rows each, in the shared sheet
 * (components/ui/bottom-sheet), so they rise, drag and close like every other
 * sheet in /app. The rows are the pick-one rows of the app's longer lists
 * (components/ui/choice-list): the name, and a check at the end of the one
 * that is on, in semibold. No icon column: one check says it.
 *
 * "Absolutely optimized, 200 fps smooth, not laggy at all." What that takes
 * here, each measured by scripts/check-products-sheets.mjs under a 4x slower
 * CPU:
 *
 *   OPEN ON THE FIRST FRAME. The press only flips this component's own
 *   state. The sheet's portal is committed in that same render, below the
 *   screen, and its rise starts in a layout effect, before the frame is
 *   painted (bottom-sheet). Nothing is fetched, measured or decoded first.
 *
 *   THE LIST IS NOT TOUCHED WHILE THE SHEET MOVES. The page (products-client)
 *   renders fifty rows twice, a list and a table; none of them is rendered
 *   to open this, to close it, or while it is on screen. The rows in the
 *   sheet are drawn once per opening and are a few buttons.
 *
 *   A CHOICE WAITS FOR THE SHEET TO LEAVE. A pick closes the sheet, and the
 *   page hears it once the sheet is out of the document (`onClosed`), the
 *   way the app's action sheets run a row's action (responsive-action-menu).
 *   So the list changes after the motion, not under it: one thing moving at
 *   a time. Picking what is already on only closes.
 *
 * Below 768px it is the sheet: drawn up to md (`hideFrom="md"`), so a small
 * tablet in portrait gets it too.
 *
 * FROM 768px, THE SAME PICK AS A DROPDOWN UNDER ITS BUTTON. "On desktop large
 * screens ... the tabs (All, Active, Draft, Archived) are up there instead of
 * being like on the mobile version. Make it that way: like mobile, with an
 * inline modal." So the computer has the phone's toolbar too, and the same
 * button opens the app's own dropdown instead of a sheet: the date range
 * picker's surface and rows (components/app/date-range-picker pickerSurface
 * and PickerRow), so a pick on Products looks and answers like a period on
 * Home or Orders. The name, a check at the end of the one that is on, in
 * semibold, and the check's place kept on the others so no word moves.
 *
 *   WHICH ONE OPENS is read at the press, from the window's width, not
 *   decided in a render: the button is one element at every width, and a
 *   window made narrower or wider between two presses gets the right one.
 *   Radix's popover owns the dropdown (the trigger's toggle, a press
 *   outside, Escape, focus back on the button when it closes); a press on
 *   a phone stops Radix's toggle before it runs (preventDefault) and opens
 *   the sheet instead, so the phone's path is the one it always was.
 *
 *   THE KEYBOARD. Enter or Space on the button opens it, and so do the up
 *   and down arrows; the focus lands on the one that is on, not the first.
 *   Up and down move between the rows (wrapping), Home and End go to the
 *   ends, Enter picks, Escape or Tab closes and the focus goes back to the
 *   button.
 *
 *   NOTHING ON THE PAGE MOVES. The dropdown is a portal, drawn over the
 *   list, and the button only takes the pressed grey while it is open
 *   (`data-open`): the same size, the same words.
 *
 *   A PICK APPLIES AT ONCE here. The dropdown fades in 150ms and nothing
 *   is under a finger, so the list changes as it closes, the way the old
 *   tabs changed it on the press. Picking what is already on only closes.
 */

import * as React from "react"
import { Check } from "lucide-react"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { PickerRow, onRowsKey, pickerSurface } from "@/components/app/date-range-picker"
import { hapticTap } from "@/lib/native-bridge"
import { cn } from "@/lib/utils"

/** Where the page stops being a phone (its table, md): from here a pick is a dropdown, below it a sheet. */
const WIDE = "(min-width: 768px)"
const isWide = () => typeof window !== "undefined" && window.matchMedia(WIDE).matches

/**
 * The width, for what the button says it opens (a menu or a dialog). Only
 * an attribute depends on it; what a press opens is read at the press.
 * False on the server and in the first render, so the markup matches.
 */
function subscribeWide(on: () => void) {
  const mq = window.matchMedia(WIDE)
  mq.addEventListener("change", on)
  return () => mq.removeEventListener("change", on)
}
function useWide() {
  return React.useSyncExternalStore(subscribeWide, isWide, () => false)
}

export interface PickOption {
  value: string
  label: string
}

type TriggerProps = {
  onClick?: (e: React.MouseEvent<HTMLElement>) => void
  onKeyDown?: (e: React.KeyboardEvent<HTMLElement>) => void
  "aria-haspopup"?: "dialog" | "menu"
  "aria-expanded"?: boolean
  "data-open"?: string
}

export const PickSheet = React.memo(function PickSheet({
  title,
  options,
  value,
  onPick,
  trigger,
  name,
  align = "start",
}: {
  /** Heads the sheet, and names it for a screen reader. */
  title: string
  options: readonly PickOption[]
  /** The one on now: marked with a check. */
  value: string
  /** Heard once the sheet has gone, and only for a change. */
  onPick: (value: string) => void
  /** The button that opens it. Its own onClick, if any, runs first. */
  trigger: React.ReactElement<TriggerProps>
  /** `data-pick-sheet` (and the dropdown's `data-pick-menu`), for the probes. */
  name: string
  /** Which edge of the button the dropdown lines up with, from 768px. */
  align?: "start" | "end"
}) {
  const [open, setOpen] = React.useState(false)
  /** The dropdown, from 768px. A separate state: the sheet's never changes on a computer, nor this one on a phone. */
  const [menu, setMenu] = React.useState(false)
  const wide = useWide()
  /** The row pressed, handed to the page once the sheet has left. */
  const picked = React.useRef<string | null>(null)
  const onPickRef = React.useRef(onPick)
  React.useLayoutEffect(() => {
    onPickRef.current = onPick
  })

  const pick = React.useCallback((next: string, current: string) => {
    picked.current = next === current ? null : next
    setOpen(false)
  }, [])

  /* A pick in the dropdown: it closes, and the page hears it now, only for a change. */
  const choose = React.useCallback((next: string, current: string) => {
    setMenu(false)
    if (next !== current) onPickRef.current(next)
  }, [])

  const opener = React.cloneElement(trigger, {
    "aria-haspopup": wide ? "menu" : "dialog",
    "aria-expanded": open || menu,
    "data-open": menu ? "" : undefined,
    onClick: (e: React.MouseEvent<HTMLElement>) => {
      trigger.props.onClick?.(e)
      if (e.defaultPrevented) return
      /* From 768px Radix's trigger toggles the dropdown after this. */
      if (isWide()) return
      /* A phone: the sheet, and Radix's toggle is stopped here. */
      e.preventDefault()
      picked.current = null
      /* Felt as the press lands, before anything has moved. */
      hapticTap("soft")
      setOpen(true)
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
      trigger.props.onKeyDown?.(e)
      if (e.defaultPrevented || menu || (e.key !== "ArrowDown" && e.key !== "ArrowUp") || !isWide()) return
      e.preventDefault()
      setMenu(true)
    },
  })

  return (
    <>
      <Popover open={menu} onOpenChange={setMenu}>
        <PopoverTrigger asChild>{opener}</PopoverTrigger>
        <PopoverContent
          align={align}
          sideOffset={6}
          className={cn(pickerSurface, "w-auto min-w-[184px] max-w-[calc(100vw-24px)]")}
          onOpenAutoFocus={(e) => {
            /* Onto the one that is on, not the first row. */
            e.preventDefault()
            const el = e.currentTarget as HTMLElement | null
            const row = el?.querySelector<HTMLElement>("[data-row][data-checked]") ?? el?.querySelector<HTMLElement>("[data-row]")
            row?.focus({ preventScroll: true })
          }}
        >
          <MenuRows name={name} title={title} options={options} value={value} onPick={choose} />
        </PopoverContent>
      </Popover>
      <BottomSheet
        isOpen={open}
        onClose={() => setOpen(false)}
        onClosed={() => {
          const next = picked.current
          picked.current = null
          if (next !== null) onPickRef.current(next)
        }}
        title={title}
        label={title}
        hideFrom="md"
      >
        <PickRows name={name} title={title} options={options} value={value} onPick={pick} />
      </BottomSheet>
    </>
  )
})

/** Up and down move between the rows, for a keyboard on a tablet. */
function moveFocus(e: React.KeyboardEvent<HTMLElement>) {
  const step = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0
  if (!step) return
  const rows = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("[data-pick]"))
  if (!rows.length) return
  e.preventDefault()
  const at = rows.indexOf(document.activeElement as HTMLButtonElement)
  rows[at < 0 ? 0 : Math.min(rows.length - 1, Math.max(0, at + step))].focus()
}

/**
 * The rows, memoised: drawn when the sheet opens and left alone while it
 * moves. 48px each, the name in 15px, the one on in semibold with a check at
 * the end, a grey fill while pressed.
 */
const PickRows = React.memo(function PickRows({
  name,
  title,
  options,
  value,
  onPick,
}: {
  name: string
  title: string
  options: readonly PickOption[]
  value: string
  onPick: (next: string, current: string) => void
}) {
  return (
    <div role="listbox" aria-label={title} data-pick-sheet={name} onKeyDown={moveFocus} className="px-2 pb-2 pt-1.5">
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="option"
            aria-selected={on}
            data-pick={o.value}
            data-checked={on || undefined}
            onClick={() => onPick(o.value, value)}
            className="flex min-h-[48px] w-full cursor-pointer items-center gap-3 rounded-lg px-3 text-left text-[15px] text-[#1a1a2e] outline-none transition-colors duration-100 [-webkit-tap-highlight-color:transparent] active:bg-[#f1f2f4] focus-visible:bg-[#f1f2f4]"
          >
            <span className={cn("min-w-0 flex-1 truncate", on && "font-semibold")}>{o.label}</span>
            <span className="flex w-4 shrink-0 justify-center" aria-hidden>
              {on ? <Check className="h-4 w-4" strokeWidth={2.25} /> : null}
            </span>
          </button>
        )
      })}
    </div>
  )
})

/**
 * The dropdown's rows, from 768px: the date range picker's own (PickerRow),
 * 34px each in 13px, the one on in semibold with its check, a grey fill
 * under the pointer and the keyboard. A menu of radio items, so a screen
 * reader hears which one is on.
 */
const MenuRows = React.memo(function MenuRows({
  name,
  title,
  options,
  value,
  onPick,
}: {
  name: string
  title: string
  options: readonly PickOption[]
  value: string
  onPick: (next: string, current: string) => void
}) {
  return (
    <div role="menu" aria-label={title} data-pick-menu={name} onKeyDown={onRowsKey} className="p-1.5">
      {options.map((o) => (
        <PickerRow key={o.value} rowKey={o.value} compact={false} checked={o.value === value} onClick={() => onPick(o.value, value)}>
          {o.label}
        </PickerRow>
      ))}
    </div>
  )
})
