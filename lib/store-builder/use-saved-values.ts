"use client"

import * as React from "react"

/**
 * ===========================================================================
 *  AN EDITOR THAT IS CLOSED SHOWS WHAT IS SAVED
 * ===========================================================================
 * Every editor on the creator page kept its fields in local state and put
 * them back from its props on close:
 *
 *   React.useEffect(() => { if (open) return; setName(displayName); ... },
 *     [open])
 *
 * The dependency is `open` ALONE, and that is the bug. Saving does
 * `setOpen(false)` and then `router.refresh()`, in that order, because the
 * drawer should close at once rather than after a round trip. So the effect
 * runs immediately, with the props as they were BEFORE the save — it puts the
 * old values back — and when the refreshed props finally arrive nothing
 * re-runs, because `open` has not changed since.
 *
 * The result is an editor that saves correctly, renders correctly on the
 * page, and shows the previous values the next time it is opened. Which is
 * indistinguishable, from the outside, from a save that did not work: "the
 * settings always reset their value."
 *
 * So the re-sync watches the SAVED VALUES as well as `open`. The comparison
 * is on a serialisation rather than identity, because these props are object
 * literals built in a server component's render and are a new object every
 * time — depending on identity would reset the fields under the cursor on
 * every parent render, which is a worse bug than the one being fixed.
 */
export function useSavedValues<T>(open: boolean, saved: T, apply: (value: T) => void) {
  const signature = React.useMemo(() => JSON.stringify(saved ?? null), [saved])
  const applied = React.useRef<string | null>(null)
  /* Ref, not a dependency: `apply` closes over setState calls and is a new
     function every render, which would defeat the signature check. */
  const applyRef = React.useRef(apply)
  applyRef.current = apply

  React.useEffect(() => {
    /*
      Open is left alone on purpose: re-syncing a drawer somebody is typing
      in would throw away their work the moment anything upstream re-rendered.
    */
    if (open) return
    if (applied.current === signature) return
    applied.current = signature
    applyRef.current(saved)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, signature])
}
