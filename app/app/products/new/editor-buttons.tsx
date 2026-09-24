"use client"

/**
 * ===========================================================================
 *  THE EDITOR'S BUTTONS, WITH A LITTLE DEPTH
 * ===========================================================================
 * Shaped like Polaris buttons: a white secondary with a hairline border and
 * a soft shade along its foot, a solid primary with a line of light on top
 * and a darker line under it. Pressed, both go flat: the shade under the
 * button becomes a shade inside it, which is how a real key reads when it is
 * down. No gradients, no glow.
 *
 * One height per screen for everything in the editor's bar, so Cancel, the
 * more button and Save line up: 40px on a phone and 32px from 640px, the
 * same 32px as the Orders and Products bars. On a phone the press area is
 * 44px high (an invisible band 2px above and below), inside the 56px bar.
 */

import * as React from "react"
import { Check } from "lucide-react"
import { ActivitySpinner } from "@/components/ui/activity-spinner"
import { cn } from "@/lib/utils"

/** The shade of a button at rest: a line inside its foot and a hairline under it. */
export const REST_SHADOW = "inset 0 -1px 0 rgba(0,0,0,0.08), 0 1px 0 rgba(0,0,0,0.05)"

/* Measured from the padding box, which is 1px inside a bordered button: 3px there is 2px past the border. */
const PRESS_AREA = "relative after:absolute after:inset-x-0 after:-inset-y-[2px] after:content-[''] sm:after:hidden"
const PRESS_AREA_BORDERED = "relative after:absolute after:inset-x-0 after:-inset-y-[3px] after:content-[''] sm:after:hidden"

/** White, hairline border, a soft 1px foot. Flat and a step darker when pressed. */
export const secondaryDepth = cn(
  "inline-flex shrink-0 cursor-pointer select-none items-center justify-center gap-1.5 whitespace-nowrap border border-[#d9dbe0] bg-white font-medium text-[#1a1a2e] outline-none",
  "shadow-[inset_0_-1px_0_rgba(0,0,0,0.08),0_1px_0_rgba(0,0,0,0.05)] transition-[background-color,box-shadow] duration-100",
  "hover:bg-[#f7f7f8] active:bg-[#f1f2f4] active:shadow-[inset_0_1px_1px_rgba(0,0,0,0.1)]",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8b5cf6]",
  "disabled:cursor-not-allowed disabled:opacity-50",
  "[-webkit-tap-highlight-color:transparent]",
)

/** Red, for the one action that throws work away. The same light and shade as the primary. */
export const criticalDepth = cn(
  "inline-flex shrink-0 cursor-pointer select-none items-center justify-center gap-1.5 whitespace-nowrap bg-[#c4290c] font-semibold text-white outline-none",
  "shadow-[inset_0_1px_0_rgba(255,255,255,0.2),inset_0_-1px_0_rgba(0,0,0,0.2),0_1px_1px_rgba(0,0,0,0.12)] transition-[background-color,box-shadow] duration-100",
  "hover:bg-[#ab230a] active:bg-[#921e09] active:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c4290c]",
  "[-webkit-tap-highlight-color:transparent]",
)

/** A labelled button in the bar. */
export const barButton = cn(secondaryDepth, PRESS_AREA_BORDERED, "h-10 rounded-[10px] px-3.5 text-[15px] sm:h-8 sm:rounded-lg sm:px-3 sm:text-[13px]")

/** The more button: square, the same height as Save. */
export const barIconButton = cn(secondaryDepth, PRESS_AREA_BORDERED, "h-10 w-10 rounded-[10px] text-[#4b5563] sm:h-8 sm:w-8 sm:rounded-lg")

/**
 * What Save is doing: nothing, saving, or showing for a moment that it
 * saved. `saved` lasts SAVED_CHECK_MS, then Save is idle again (and greyed,
 * with nothing left to save).
 */
export type SavePhase = "idle" | "saving" | "saved"
export const SAVED_CHECK_MS = 900

/**
 * THE SAVE BUTTON. The /app violet, solid.
 *
 * Its width never changes: the word stays in the layout the whole time and
 * only goes invisible while the spinner or the check is drawn over it, so
 * nothing in the bar moves when a save starts or ends.
 *
 * While it saves it is busy, not disabled: it keeps its colour, says
 * aria-busy, and a second press does nothing. The editor's save also keeps
 * its own guard, for Cmd or Ctrl and S.
 *
 * Disabled (nothing to save, or no name yet) is grey with grey text and no
 * depth, the way Polaris draws it, so it cannot be mistaken for a button
 * that is waiting.
 */
export function SaveButton({
  phase,
  disabled,
  onSave,
}: {
  phase: SavePhase
  disabled: boolean
  onSave: () => void
}) {
  const busy = phase !== "idle"
  return (
    <button
      type="button"
      data-save-button=""
      data-phase={phase}
      onClick={() => {
        if (!busy) onSave()
      }}
      disabled={!busy && disabled}
      aria-disabled={busy || undefined}
      aria-busy={phase === "saving" || undefined}
      aria-keyshortcuts="Meta+S Control+S"
      className={cn(
        PRESS_AREA,
        "inline-flex h-10 min-w-[64px] shrink-0 cursor-pointer select-none items-center justify-center whitespace-nowrap rounded-[10px] px-4 text-[15px] font-semibold outline-none sm:h-8 sm:min-w-[60px] sm:rounded-lg sm:px-3 sm:text-[13px]",
        "bg-[#8b5cf6] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-1px_0_rgba(0,0,0,0.18),0_1px_1px_rgba(76,29,149,0.25)]",
        "transition-[background-color,box-shadow,color] duration-100",
        "hover:bg-[#7c3aed] active:bg-[#6d28d9] active:shadow-[inset_0_1px_2px_rgba(0,0,0,0.28)]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8b5cf6]",
        "disabled:cursor-default disabled:bg-[#ebebef] disabled:text-[#a1a1aa] disabled:shadow-none",
        busy && "cursor-default hover:bg-[#8b5cf6] active:bg-[#8b5cf6] active:shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-1px_0_rgba(0,0,0,0.18),0_1px_1px_rgba(76,29,149,0.25)]",
        "[-webkit-tap-highlight-color:transparent]",
      )}
    >
      <span className={cn(busy && "opacity-0")}>Save</span>
      {phase === "saving" ? (
        <span aria-hidden className="absolute inset-0 flex items-center justify-center">
          <ActivitySpinner size={18} label="Saving" className="text-white" />
        </span>
      ) : null}
      {phase === "saved" ? (
        <span aria-hidden className="absolute inset-0 flex items-center justify-center">
          <Check
            data-save-check=""
            className="h-[18px] w-[18px] animate-in fade-in-0 zoom-in-50 duration-200 motion-reduce:animate-none"
            strokeWidth={2.75}
          />
        </span>
      ) : null}
    </button>
  )
}
