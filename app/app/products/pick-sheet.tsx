"use client"

/**
 * ===========================================================================
 *  A SHORT PICK-ONE SHEET: THE PHONE'S VIEWS, AND ITS ORDERS
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
 * Only below 768px, where the phone's toolbar is: the sheet is drawn up to
 * md (`hideFrom="md"`), so a small tablet in portrait gets it too.
 */

import * as React from "react"
import { Check } from "lucide-react"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { hapticTap } from "@/lib/native-bridge"
import { cn } from "@/lib/utils"

export interface PickOption {
  value: string
  label: string
}

type TriggerProps = {
  onClick?: (e: React.MouseEvent<HTMLElement>) => void
  "aria-haspopup"?: "dialog"
  "aria-expanded"?: boolean
}

export const PickSheet = React.memo(function PickSheet({
  title,
  options,
  value,
  onPick,
  trigger,
  name,
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
  /** `data-pick-sheet`, for the probes. */
  name: string
}) {
  const [open, setOpen] = React.useState(false)
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

  const opener = React.cloneElement(trigger, {
    "aria-haspopup": "dialog",
    "aria-expanded": open,
    onClick: (e: React.MouseEvent<HTMLElement>) => {
      trigger.props.onClick?.(e)
      if (e.defaultPrevented) return
      picked.current = null
      /* Felt as the press lands, before anything has moved. */
      hapticTap("soft")
      setOpen(true)
    },
  })

  return (
    <>
      {opener}
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
