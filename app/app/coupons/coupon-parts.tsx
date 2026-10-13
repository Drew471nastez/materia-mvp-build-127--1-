"use client"

/**
 * ===========================================================================
 *  THE COUPON PAGES' OWN PIECES
 * ===========================================================================
 * The near black primary (Save, New coupon), the dark pill that says what
 * just happened, and the check box of the product picker. The rest is the
 * product editor's (app/app/products/new/editor-buttons, editor-controls,
 * confirm-sheet), so a coupon is edited with the same bar, the same
 * switches and the same questions as a product.
 */

import * as React from "react"
import { Check } from "lucide-react"
import { ActivitySpinner } from "@/components/ui/activity-spinner"
import { cn } from "@/lib/utils"
import { secondaryDepth } from "@/components/ui/depth-button"
import { tt } from "@/lib/i18n/text"

/**
 * Near black, with the product editor's depth: a line of light on top, a
 * darker line under it, flat and a step darker when pressed. No violet.
 */
export const inkDepth = cn(
  "inline-flex shrink-0 cursor-pointer select-none items-center justify-center gap-1.5 whitespace-nowrap font-semibold text-white outline-none",
  "bg-[#111113] shadow-[inset_0_1px_0_rgba(255,255,255,0.14),inset_0_-1px_0_rgba(0,0,0,0.4),0_1px_2px_rgba(16,24,40,0.22)]",
  "transition-[background-color,box-shadow,color] duration-100",
  "hover:bg-[#26262b] active:bg-black active:shadow-[inset_0_1px_2px_rgba(0,0,0,0.45)]",
  "focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[#111113]",
  "[-webkit-tap-highlight-color:transparent]",
)

/** The white button with a red word, for the one action that removes something. Quiet: the question it asks is where the weight is. */
export const quietDanger = cn(secondaryDepth, "text-[#b42318] hover:text-[#912018]")

/* Measured from the padding box: on a phone the press is 44px high inside a 40px button. */
const PRESS_AREA = "relative after:absolute after:inset-x-0 after:-inset-y-[2px] after:content-[''] sm:after:hidden"

/**
 * SAVE, in the editor's bar and its foot. The product editor's Save
 * (editor-buttons SaveButton) in near black: the same sizes, grey with grey
 * text when there is nothing to save, busy (not disabled) while it saves,
 * with the word kept in the layout so the button never changes width.
 */
export function CouponSaveButton({ saving, disabled, onSave }: { saving: boolean; disabled: boolean; onSave: () => void }) {
  return (
    <button
      type="button"
      data-save-button=""
      data-phase={saving ? "saving" : "idle"}
      onClick={() => {
        if (!saving) onSave()
      }}
      disabled={!saving && disabled}
      aria-disabled={saving || undefined}
      aria-busy={saving || undefined}
      aria-keyshortcuts="Meta+S Control+S"
      className={cn(
        PRESS_AREA,
        inkDepth,
        "h-10 min-w-[64px] rounded-[10px] px-4 text-[15px] sm:h-8 sm:min-w-[60px] sm:rounded-lg sm:px-3 sm:text-[13px]",
        "disabled:cursor-default disabled:bg-[#ebebef] disabled:text-[#a1a1aa] disabled:shadow-none",
        saving && "cursor-default hover:bg-[#111113] active:bg-[#111113]",
      )}
    >
      <span className={cn(saving && "opacity-0")}>{tt("Save")}</span>
      {saving ? (
        <span aria-hidden className="absolute inset-0 flex items-center justify-center">
          <ActivitySpinner size={18} label={tt("Saving")} className="text-white" />
        </span>
      ) : null}
    </button>
  )
}

/**
 * WHAT JUST HAPPENED, as a dark pill under the app's header: "SUMMER20
 * saved". It comes in on opacity and a 6px drop, and goes the same way. A
 * problem is the same pill with a red dot, not a red box.
 */
export function Pill({ notice }: { notice: { message: string; tone: "ok" | "error"; key: number } | null }) {
  const [shown, setShown] = React.useState(notice)
  const [leaving, setLeaving] = React.useState(false)
  React.useEffect(() => {
    if (notice) {
      setShown(notice)
      setLeaving(false)
      return
    }
    setLeaving(true)
    const t = window.setTimeout(() => setShown(null), 160)
    return () => window.clearTimeout(t)
  }, [notice])
  if (!shown) return null
  return (
    <div
      role="status"
      data-coupon-pill=""
      className="pointer-events-none fixed left-1/2 top-[calc(68px+env(safe-area-inset-top)+12px)] z-[100] -translate-x-1/2 md:top-[calc(58px+env(safe-area-inset-top)+14px)]"
    >
      <div
        key={shown.key}
        className={cn(
          "flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-full bg-[#111113] py-2.5 pl-4 pr-4 text-[14px] font-medium text-white md:text-[13px]",
          "shadow-[0_1px_2px_rgba(0,0,0,0.2),0_8px_24px_-6px_rgba(0,0,0,0.35)]",
          leaving
            ? "opacity-0 -translate-y-1.5 transition-[opacity,translate] duration-150 ease-in motion-reduce:transition-none"
            : "animate-in fade-in-0 slide-in-from-top-2 duration-200 motion-reduce:animate-none",
        )}
      >
        {shown.tone === "error" ? <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#f87171]" /> : null}
        <span className="truncate">{shown.message}</span>
      </div>
    </div>
  )
}

/** A notice that lasts 3.5 seconds. */
export function usePill() {
  const [notice, setNotice] = React.useState<{ message: string; tone: "ok" | "error"; key: number } | null>(null)
  const timer = React.useRef<number | null>(null)
  const say = React.useCallback((message: string, tone: "ok" | "error" = "ok") => {
    setNotice({ message, tone, key: Date.now() })
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setNotice(null), 3500)
  }, [])
  React.useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current)
  }, [])
  return [notice, say] as const
}

/** A square check box, near black when ticked. Drawn only: the row around it is the control. */
export function Tick({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-[6px] border transition-[background-color,border-color] duration-100 sm:h-[18px] sm:w-[18px] sm:rounded-[5px]",
        on ? "border-[#111113] bg-[#111113] text-white" : "border-[#c7cad1] bg-white",
      )}
    >
      {on ? <Check className="h-3.5 w-3.5 sm:h-3 sm:w-3" strokeWidth={3} /> : null}
    </span>
  )
}
