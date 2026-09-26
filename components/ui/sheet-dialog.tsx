"use client"

/**
 * ===========================================================================
 *  A DIALOG ON A COMPUTER, THE SHARED SHEET ON A PHONE
 * ===========================================================================
 * "Take everything you applied to the Quick access, account and
 * notifications sheets and bring the same feel to every bottom sheet." The
 * OnePage editor's sheets (Add block, the social link, the thumbnail, a
 * block's animation and its stats, Add product) were the last ones in /app
 * still built by hand: a Radix dialog pushed to the bottom of the screen
 * with `!top-auto` and friends, and a drag written into React state on every
 * touchmove, so each finger event re-rendered the whole links list under
 * it. They only followed the finger from the top 72px, never read the
 * finger's real speed, closed on a fixed 92px line, and faded a blurred
 * scrim that the other sheets do not have.
 *
 * This is the one place that choice is made now. On a phone the children
 * go into the shared sheet (components/ui/bottom-sheet.tsx), so they open,
 * follow the thumb, give on a pull up, flick closed and settle exactly as
 * Quick access does. On a computer they go into the same centred dialog as
 * before, with the same classes, so nothing changes there.
 *
 * THE CHILDREN LAY THEMSELVES OUT, as they did in the dialog: a title, a
 * search, a list that scrolls. The sheet is `fill`, so it is the same
 * column the dialog was, at most three quarters of what is visible (the
 * fraction the hand built sheets used), and on the keyboard rather than
 * under it. A list at its top hands a pull down to the sheet, so a drag
 * from the top of a scrolled list closes it in one movement.
 *
 * THE TITLE. Radix's DialogTitle only exists inside a Radix dialog, and the
 * sheet is not one, so a title written with `SheetDialogTitle` is Radix's
 * in the dialog and a plain heading, drawn the same, in the sheet.
 */

import * as React from "react"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

/** Three quarters of what is on screen, keyboard included: what the hand built sheets asked for. */
export const SHEET_DIALOG_MAX_HEIGHT = "calc(var(--vv-h, 100dvh) * 0.75)"

const InSheet = React.createContext(false)

/** True inside the phone sheet, for content that draws itself a little differently there. */
export function useInSheet(): boolean {
  return React.useContext(InSheet)
}

type SheetOptions = Omit<React.ComponentProps<typeof BottomSheet>, "isOpen" | "onClose" | "children">

export function SheetDialog({
  open,
  onClose,
  phone,
  label,
  className,
  showCloseButton = true,
  onOpenAutoFocus,
  sheet,
  children,
}: {
  open: boolean
  /** Every way out: the scrim, a pull down, Escape, the dialog's X. */
  onClose: () => void
  /** Whoever decides what is a phone (the caller's own breakpoint). */
  phone: boolean
  /** For the sheet, which has no Radix title to name it. */
  label: string
  /** The dialog's classes, on a computer. */
  className?: string
  showCloseButton?: boolean
  onOpenAutoFocus?: (e: Event) => void
  /** Anything the sheet should do other than the defaults above. */
  sheet?: Partial<SheetOptions>
  children: React.ReactNode
}) {
  if (phone) {
    return (
      <InSheet.Provider value>
        <BottomSheet
          isOpen={open}
          onClose={onClose}
          label={label}
          /* The caller's breakpoint decides; the sheet must not hide itself on top of that. */
          hideFrom={null}
          fill
          aboveKeyboard
          maxHeight={SHEET_DIALOG_MAX_HEIGHT}
          {...sheet}
        >
          {children}
        </BottomSheet>
      </InSheet.Provider>
    )
  }
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className={className} showCloseButton={showCloseButton} onOpenAutoFocus={onOpenAutoFocus}>
        {children}
      </DialogContent>
    </Dialog>
  )
}

/** Radix's title in the dialog; in the sheet, a heading drawn the same way. */
export function SheetDialogTitle({ className, children }: { className?: string; children: React.ReactNode }) {
  const inSheet = useInSheet()
  if (inSheet) return <h2 className={cn("text-lg leading-none font-semibold", className)}>{children}</h2>
  return <DialogTitle className={className}>{children}</DialogTitle>
}
