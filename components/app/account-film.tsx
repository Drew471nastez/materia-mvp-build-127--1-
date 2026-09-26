import type React from "react"
import { cn } from "@/lib/utils"

/**
 * ===========================================================================
 *  THE GREY BEHIND THE NAME IN THE BLACK BAR
 * ===========================================================================
 * "The gray on the name button in the black header: when I'm on it and when
 * I'm out of it it's not smooth, glitchy and too direct."
 *
 * The account button (the photo, the name and the chevron, top left of the
 * bar on a phone and from md) had its grey as a background colour that
 * changed on hover and while its menu was open. A background colour is
 * animated on the page's main thread, and the press that opens the menu is
 * the busiest frame there is: the sheet or the dropdown is put together in
 * it. So the grey was due to fade and did not get the frames to, and landed
 * at once, most of the way on, in one step.
 *
 * Now the grey is a film of white laid under the button's contents, and only
 * its opacity changes: a change the compositor runs on its own, frame after
 * frame, however busy the page is. 180ms on Core Animation's default curve
 * (0.25, 0.1, 0.25, 1, which is CSS's `ease`), the same both ways, so it
 * comes and goes at the same pace. The steps, on the bar's #111111 or
 * #131316, are the shades the button had:
 *
 *   rest       nothing
 *   hover      `hover`, only where there is a pointer that hovers (Tailwind's
 *              hover: is inside @media (hover: hover)), so a finger never
 *              leaves a grey behind that stays after the tap
 *   pressed    `on`, the moment the finger or the button is down, so the
 *              grey is already there as the menu starts to come
 *   open       `on`, the same, while the menu is showing: pressed and open
 *              are one shade, so there is no second step as the menu arrives
 *
 * Closing goes back to rest, or to `hover` where the pointer still is.
 *
 * With reduced motion the steps change at once. scripts/check-account-film
 * .mjs measures it frame by frame, with the menu opening in the same frame.
 */

/** How long the grey takes to come or go, and on which curve. */
export const FILM_MS = 180
export const FILM_EASE = "cubic-bezier(0.25, 0.1, 0.25, 1)"

/** Its shades over each bar: the phone's #111111 and the desktop's #131316, as the button had them. */
export const FILM = {
  phone: { hover: 0.1, on: 0.15 },
  desktop: { hover: 0.08, on: 0.12 },
} as const

/**
 * The film itself: the first child of a button that is `relative isolate`
 * with `group/acct`, so it sits under the button's photo and words and takes
 * the button's rounding. `open`: the button's menu is showing.
 */
export function AccountFilm({ shades, open }: { shades: { hover: number; on: number }; open: boolean }) {
  return (
    <span
      aria-hidden="true"
      data-account-film=""
      className={cn(
        "pointer-events-none absolute inset-0 -z-10 rounded-[inherit] bg-white transition-opacity motion-reduce:transition-none",
        open ? "opacity-(--film-on)" : "opacity-0 group-hover/acct:opacity-(--film-hover) group-active/acct:opacity-(--film-on)",
      )}
      style={{ "--film-hover": shades.hover, "--film-on": shades.on, transitionDuration: `${FILM_MS}ms`, transitionTimingFunction: FILM_EASE } as React.CSSProperties}
    />
  )
}
