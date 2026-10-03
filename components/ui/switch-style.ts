import { cn } from "@/lib/utils"

/**
 * THE ONE SWITCH, as every toggle in /app draws it.
 *
 * Slim and near black, the way a phone's own settings draw one: a 36 by 20
 * track, sunk a little with an inner shadow, and a 16px white knob that sits
 * proud of it with a soft drop shadow. It was 38 by 22 with an 18px knob
 * until the owner found the toggles in the builder's sidebar too fat; two
 * pixels off the height, two off the width, and the knob's travel is the
 * same 16px, so on still reads as on from across the panel. Off is a quiet grey, not a colour.
 * The knob moves by transform only; the track changes colour only.
 *
 * Only the drawing lives here. Each switch keeps its own button, label and
 * press area (44px on a phone) where it is used.
 */
const TRACK =
  "relative inline-block h-[20px] w-[36px] shrink-0 rounded-full transition-[background-color,box-shadow] duration-200 ease-out motion-reduce:transition-none"
const TRACK_ON = "bg-[#111113] shadow-[inset_0_1px_2px_rgba(0,0,0,0.5),0_0_0_0.5px_rgba(0,0,0,0.5)]"
const TRACK_OFF = "bg-[#e4e5e9] shadow-[inset_0_1px_2px_rgba(16,24,40,0.14),inset_0_0_0_0.5px_rgba(16,24,40,0.08)]"
const KNOB =
  "pointer-events-none absolute left-[2px] top-[2px] block h-[16px] w-[16px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.22),0_2px_6px_-2px_rgba(0,0,0,0.22),inset_0_-0.5px_0_rgba(0,0,0,0.06)] transition-transform duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"

export const switchTrack = (on: boolean) => cn(TRACK, on ? TRACK_ON : TRACK_OFF)
export const switchKnob = (on: boolean) => cn(KNOB, on ? "translate-x-4" : "translate-x-0")

/**
 * THE SAME SWITCH ON A DARK SURFACE (Website Settings, which stands over the
 * builder and is dark). The same track, knob, size and curve; the colours
 * are the light switch's turned over, because near black on near black is
 * no switch at all: on is a near white track with a near black knob, off a
 * faint track with a white knob. The knob's colour changes over the same
 * 200ms as its move.
 */
const TRACK_ON_DARK = "bg-[#f2f2f3] shadow-[inset_0_1px_2px_rgba(0,0,0,0.18)]"
const TRACK_OFF_DARK = "bg-white/[0.16] shadow-[inset_0_1px_2px_rgba(0,0,0,0.45),inset_0_0_0_0.5px_rgba(255,255,255,0.06)]"
export const switchTrackDark = (on: boolean) => cn(TRACK, on ? TRACK_ON_DARK : TRACK_OFF_DARK)
export const switchKnobDark = (on: boolean) =>
  cn(
    KNOB,
    "transition-[transform,translate,background-color]",
    on ? "translate-x-4 bg-[#111113] shadow-[0_1px_2px_rgba(0,0,0,0.35)]" : "translate-x-0 bg-white",
  )

/** The same drawing for a Radix switch, which says on or off with data-state. */
export const radixSwitchTrack = cn(
  TRACK,
  "data-[state=checked]:bg-[#111113] data-[state=checked]:shadow-[inset_0_1px_2px_rgba(0,0,0,0.5),0_0_0_0.5px_rgba(0,0,0,0.5)]",
  "data-[state=unchecked]:bg-[#e4e5e9] data-[state=unchecked]:shadow-[inset_0_1px_2px_rgba(16,24,40,0.14),inset_0_0_0_0.5px_rgba(16,24,40,0.08)]",
)
export const radixSwitchKnob = cn(KNOB, "data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0")
