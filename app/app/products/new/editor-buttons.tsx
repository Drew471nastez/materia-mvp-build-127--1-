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
 *
 * The Products page wears the same depths: its rows' more buttons are
 * quietDepth, as the editor's more button is. Its New product is violet
 * (accentDepth in components/ui/depth-button), the one primary in /app the
 * owner asked to keep purple; Save stays near black.
 */

import * as React from "react"
import { Check, ChevronLeft } from "lucide-react"
import { ActivitySpinner } from "@/components/ui/activity-spinner"
import { cn } from "@/lib/utils"
import { REST_SHADOW, criticalDepth, primaryDepth, secondaryDepth } from "@/components/ui/depth-button"
import { tt } from "@/lib/i18n/text"

/* The depth itself lives in components/ui/depth-button.ts, so every light
   surface in /app presses the same way; it is re-exported here for the
   editor's own sheets. */
export { REST_SHADOW, secondaryDepth, primaryDepth, criticalDepth }

/* Measured from the padding box, which is 1px inside a bordered button: 3px there is 2px past the border. */
const PRESS_AREA = "relative after:absolute after:inset-x-0 after:-inset-y-[2px] after:content-[''] sm:after:hidden"
const PRESS_AREA_BORDERED = "relative after:absolute after:inset-x-0 after:-inset-y-[3px] after:content-[''] sm:after:hidden"

/** A labelled button in the bar. */
export const barButton = cn(secondaryDepth, PRESS_AREA_BORDERED, "h-10 rounded-[10px] px-3.5 text-[15px] sm:h-8 sm:rounded-lg sm:px-3 sm:text-[13px]")

/**
 * A BUTTON THAT IS ONLY AN ICON, A STEP QUIETER. The three dots (and, on the
 * list, Preview beside them) had the full depth of the labelled buttons,
 * which stood them as tall as Cancel and Save: "too much depth". The same
 * white and hairline, a lighter border and a softer foot, and the same flat
 * press. One value, so the editor's more button and the list's read alike.
 */
export const quietDepth = cn(secondaryDepth, "border-[#e1e3e7] shadow-[inset_0_-1px_0_rgba(0,0,0,0.05)]")

/** The more button: square, the same height as Save. */
export const barIconButton = cn(quietDepth, PRESS_AREA_BORDERED, "h-10 w-10 rounded-[10px] text-[#4b5563] sm:h-8 sm:w-8 sm:rounded-lg")

/**
 * THE WAY OUT OF THE EDITOR: CANCEL, OR BACK.
 *
 * Cancel while there is something that would be lost: a change not saved,
 * or a new product never saved. It asks before it throws a change away.
 * Back once everything on the screen is saved: there is nothing to discard,
 * so it says where it goes, with the chevron, and goes.
 *
 * Both words are always in the button, one over the other, and only the one
 * that applies is seen, so the button is the width of the longer one and
 * nothing in the bar moves when it changes. The change is a 150ms crossfade.
 * A screen reader hears only the word that applies.
 */
export type LeaveMode = "cancel" | "back"
/** A pressed control's content: dimmed at once, gone after LAYER_PRESS_WAIT_MS (app/globals.css press-content-out). */
export const PRESS_CONTENT_OUT = "[animation:press-content-out_120ms_ease-out_100ms_both]"
/** The spinner that takes its place, from LAYER_PRESS_WAIT_MS on. */
export const PRESS_SPINNER_IN = "[animation:press-spinner-in_120ms_ease-out_100ms_both]"
export function LeaveButton({
  mode,
  disabled = false,
  leaving = false,
  asks = false,
  label = tt("Going back to products"),
  onLeave,
}: {
  mode: LeaveMode
  disabled?: boolean
  /** The press has been taken and the list is on its way: a spinner where the word was, and no second press. */
  leaving?: boolean
  /** The press asks before it goes (a change would be lost): the question is the answer, so the button does not dim. */
  asks?: boolean
  /** What the spinner says to a screen reader. */
  label?: string
  onLeave: () => void
}) {
  /*
    ANSWERED BY THE BUTTON ITSELF. `leaving` comes from the whole editor
    drawing again, which on a slow phone is several frames after the finger.
    A press that goes straight away is answered here first, by this button
    alone, on the next frame. A press that went nowhere after all (shown
    again from the back cache) lets go.
  */
  const [pressed, setPressed] = React.useState(false)
  React.useEffect(() => {
    if (!pressed) return
    const reset = () => setPressed(false)
    const t = window.setTimeout(reset, 10_000)
    window.addEventListener("pageshow", reset)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener("pageshow", reset)
    }
  }, [pressed])
  const going = leaving || pressed
  const back = mode === "back"
  const word = "col-start-1 row-start-1 flex items-center justify-center transition-opacity duration-150 motion-reduce:transition-none"
  return (
    <button
      type="button"
      data-leave-button=""
      data-answers-press=""
      data-mode={mode}
      data-leaving={going ? "" : undefined}
      aria-label={back ? tt("Back") : tt("Cancel")}
      aria-busy={going || undefined}
      disabled={disabled}
      onClick={
        going
          ? undefined
          : () => {
              if (!asks) setPressed(true)
              onLeave()
            }
      }
      className={cn(barButton, "grid", going && "bg-[#f1f2f4] shadow-[inset_0_1px_1px_rgba(0,0,0,0.1)]")}
    >
      {/*
        The press: the word dims at once, and if the list is not here
        LAYER_PRESS_WAIT_MS later the spinner takes its place (the same
        answer components/app/page-layer holdPress gives every other way out
        of a layer). A warm list is there well inside it, so most presses
        show the dim alone.
      */}
      <span aria-hidden className={cn(word, back ? "opacity-0" : "opacity-100", going && !back && PRESS_CONTENT_OUT)}>
        {tt("Cancel")}
      </span>
      <span aria-hidden className={cn(word, "-ml-1 gap-0.5", back ? "opacity-100" : "opacity-0", going && back && PRESS_CONTENT_OUT)}>
        <ChevronLeft className="h-[18px] w-[18px] sm:h-4 sm:w-4" strokeWidth={2.25} />
        {tt("Back")}
      </span>
      {going ? (
        <span className={cn(word, PRESS_SPINNER_IN)}>
          <ActivitySpinner size={16} label={label} className="text-[#4b5563]" />
        </span>
      ) : null}
    </button>
  )
}

/**
 * What Save is doing: nothing, saving, or showing for a moment that it
 * saved. `saved` lasts SAVED_CHECK_MS, then Save is idle again (and greyed,
 * with nothing left to save).
 */
export type SavePhase = "idle" | "saving" | "saved"
export const SAVED_CHECK_MS = 900

/**
 * THE SAVE BUTTON. Near black, solid (primaryDepth).
 *
 * Its width never changes: the word stays in the layout the whole time and
 * only goes invisible while the spinner or the check is drawn over it, and
 * the box is always as wide as "Saved", so nothing in the bar moves when a
 * save starts or ends, or when Save becomes Saved.
 *
 * While it saves it is busy, not disabled: it keeps its colour, says
 * aria-busy, and a second press does nothing. The editor's save also keeps
 * its own guard, for Cmd or Ctrl and S.
 *
 * Disabled (nothing to save, or no name yet) is grey with grey text and no
 * depth, the way Polaris draws it, so it cannot be mistaken for a button
 * that is waiting. After a save in this visit, until the next change, the
 * grey button says Saved.
 */
export function SaveButton({
  phase,
  disabled,
  saved = false,
  onSave,
}: {
  phase: SavePhase
  disabled: boolean
  /** Saved in this visit and nothing changed since: the grey button says Saved. */
  saved?: boolean
  onSave: () => void
}) {
  const busy = phase !== "idle"
  const word = !busy && disabled && saved ? "Saved" : tt("Save")
  return (
    <button
      type="button"
      data-save-button=""
      data-phase={phase}
      data-saved={word === "Saved" ? "" : undefined}
      onClick={() => {
        if (!busy) onSave()
      }}
      disabled={!busy && disabled}
      aria-disabled={busy || undefined}
      aria-busy={phase === "saving" || undefined}
      aria-keyshortcuts="Meta+S Control+S"
      className={cn(
        PRESS_AREA,
        primaryDepth,
        "h-10 min-w-[64px] rounded-[10px] px-4 text-[15px] sm:h-8 sm:min-w-[60px] sm:rounded-lg sm:px-3 sm:text-[13px]",
        "disabled:cursor-default disabled:bg-[#ebebef] disabled:text-[#a1a1aa] disabled:shadow-none",
        busy && "cursor-default hover:bg-[#8b5cf6] active:bg-[#8b5cf6] active:shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-1px_0_rgba(0,0,0,0.18),0_1px_1px_rgba(76,29,149,0.25)]",
      )}
    >
      {/* The word, over an unseen "Saved" that holds the width. */}
      <span className="grid after:invisible after:col-start-1 after:row-start-1 after:content-['Saved']">
        <span className={cn("col-start-1 row-start-1 text-center", busy && "opacity-0")}>{word}</span>
      </span>
      {phase === "saving" ? (
        <span aria-hidden className="absolute inset-0 flex items-center justify-center">
          <ActivitySpinner size={18} label={tt("Saving")} className="text-white" />
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
