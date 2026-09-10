"use client"

export type ChromeTone = "dark" | "light"

/**
 * ===========================================================================
 *  WHICH TONE THE PHONE'S CHROME IS
 * ===========================================================================
 * Dark, everywhere. The bar was made light on a phone and the owner asked
 * for it back: on a light bar the editor's own tiles are grey on grey, and
 * Undo and Redo in particular — disabled most of the time, and disabled
 * means faded — came out as two blank squares with nothing legible in them.
 * Dark chrome gives every one of those tiles a surface to be seen on, which
 * is the same reason the desktop bar is dark.
 *
 * The hook stays, rather than the call sites being unwound, because the
 * decision it makes is a real one and it is made in one place: the native
 * shell's status bar is drawn by iOS OVER the page and its text colour is
 * not the page's to choose, so any future light bar has to negotiate with
 * the clock before it can be light. This is where that negotiation would
 * live. Today the answer is dark and it does not need to ask.
 */
export function usePhoneChromeTone(_phone: boolean): ChromeTone {
  return "dark"
}
