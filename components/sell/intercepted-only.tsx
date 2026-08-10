"use client"

import { usePathname } from "next/navigation"

/**
 * ===========================================================================
 *  A MODAL SLOT SHOWS THE MODAL THE URL ASKED FOR, OR NOTHING
 * ===========================================================================
 *
 * THE BUG THIS EXISTS TO CLOSE: opening the sell form sometimes showed the EDIT
 * form for some other listing — the last one edited — or flickered between the
 * two before settling.
 *
 * A parallel route slot does not clear itself on a soft navigation. `@modal`
 * keeps rendering whatever it last matched until something replaces it, and
 * `default.tsx` — the file that renders nothing — is only consulted on a HARD
 * navigation. So after editing a listing, the slot is still holding
 * `(.)products/edit/[id]`; push `/products/new` and, for as long as the router
 * takes to resolve the new match, the slot goes on drawing the old one. What
 * reaches the eye is a sheet that opens with somebody else's listing in it, or
 * opens, closes and opens again.
 *
 * This is not a Next fault to work around so much as a consequence of what a
 * slot is: it is a second, independent place in the tree, and independence
 * means it does not follow the URL unless something makes it.
 *
 * ---------------------------------------------------------------------------
 * WHY A PATHNAME COMPARISON IS SOUND HERE
 * ---------------------------------------------------------------------------
 * `usePathname` reads the router's own state, which is updated in the same
 * render that commits the new tree — unlike `window.location`, which is written
 * by a `history.pushState` in an effect AFTERWARDS, and which is why both
 * intercepted routes below take their id and their draft from params rather
 * than from the URL. So this compares against a value that is already correct
 * on the first render of the route it belongs to: the right modal is never
 * hidden for a frame, and the wrong one is never shown for one.
 *
 * Fails CLOSED, deliberately. A slot rendering nothing is a screen with no
 * sheet on it, which is recoverable by pressing the button again. A slot
 * rendering the wrong listing is somebody editing a thing they did not open,
 * and the first they know of it is what they saved.
 */
export function InterceptedOnly({
  path,
  children,
}: {
  /** The exact pathname this modal is the interception OF. No query — see below. */
  path: string
  children: React.ReactNode
}) {
  // Query strings never appear here: usePathname strips them, so `?draft=` and
  // the rest compare equal to the bare route, which is what is wanted.
  const pathname = usePathname()
  if (pathname !== path) return null
  return <>{children}</>
}
