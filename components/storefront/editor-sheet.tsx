"use client"

/**
 * ===========================================================================
 *  ONE SHAPE FOR EVERY EDITOR ON A CREATOR PAGE
 * ===========================================================================
 * The page has four things a creator can open: the profile, the bar at the
 * top, the story, and the colour scheme inside the profile. They were four
 * separately written dialogs, so the page had four ideas of what an editor
 * looks like. This is the one: a fixed header, a scrolling body, a sticky
 * footer with Cancel and Save, so Save is never below the fold.
 *
 * ---------------------------------------------------------------------------
 *  A SHEET ON A PHONE, A DIALOG ON A DESKTOP
 * ---------------------------------------------------------------------------
 * A centred dialog on a phone is a box in the middle of a small screen with
 * the keyboard covering half of it. The website builder solved this once,
 * with a bottom sheet that has detents, drag physics, a keyboard inset and a
 * measured viewport, and MobileEditorSheet IS that component. On a phone
 * every editor here is one of those; on a desktop it is the Radix Dialog the
 * profile editor always was. The content in the middle does not know which.
 *
 * `peekHeight={0}` and `layer="raised"`: the sheet's default is the builder's
 * BASE sheet, which peeks 72px above the bottom edge when closed because the
 * builder's tab row lives in it. An editor is not that. Left at the default,
 * a closed editor sat as a permanent strip across the bottom of the page —
 * which is what "your page is live is always at the bottom" was.
 */

import * as React from "react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { MobileEditorSheet } from "@/components/website-builder/mobile-editor-sheet"
import { useIsPhone } from "@/components/storefront/use-is-phone"
import { cn } from "@/lib/utils"

export function EditorField({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-foreground">{label}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

/**
 * A choice among a few words — which sentence the bar generates, which label
 * the button carries. A SELECT, the website builder's own: a row of pills
 * was six things competing for the eye where one closed control says the
 * current answer and opens on request.
 */
export function EditorSelect({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: string
  options: readonly { value: string; label: string }[]
  onChange: (value: string) => void
  ariaLabel?: string
}) {
  return (
    <div className="relative">
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full cursor-pointer appearance-none rounded-lg border border-border bg-background px-3 pr-9 text-sm text-foreground transition-colors focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
  )
}

export function EditorSheet({
  open,
  onClose,
  title,
  busy,
  error,
  onSave,
  saveDisabled = false,
  saveLabel = "Save",
  children,
  wide = false,
}: {
  open: boolean
  onClose: () => void
  title: string
  busy?: boolean
  error?: string | null
  onSave: () => void
  saveDisabled?: boolean
  saveLabel?: React.ReactNode
  children: React.ReactNode
  wide?: boolean
}) {
  const phone = useIsPhone()

  const footer = (
    <div className="grid shrink-0 grid-cols-2 gap-3 border-t border-border bg-background px-5 py-3 sm:px-6 sm:py-4">
      <Button type="button" variant="outline" className="w-full" onClick={onClose} disabled={busy}>
        Cancel
      </Button>
      <Button type="button" className="w-full" onClick={onSave} disabled={busy || saveDisabled}>
        {saveLabel}
      </Button>
    </div>
  )

  if (phone) {
    return (
      <MobileEditorSheet
        open={open}
        onOpenChange={(next) => { if (!next) onClose() }}
        peekHeight={0}
        layer="raised"
        /*
          HALF FIRST. A form that opens to the whole screen is a page, and a
          page has no reason to be a sheet. It opens to half, which keeps the
          thing being edited visible above it, and a drag on the handle takes
          it to the top for the long ones. The body scrolls inside either.
        */
        detents={[0.55, 0.92]}
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 border-b border-border px-5 pb-3 pt-1">
            <h2 className="text-[17px] font-semibold text-foreground">{title}</h2>
          </div>
          {/* data-sheet-scroll is what the sheet's drag arbitration reads:
              a finger on a scroller that can still scroll scrolls it, one at
              its top edge pulls the sheet. */}
          <div data-sheet-scroll className="wb-slim-scroll min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
            {children}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          {footer}
        </div>
      </MobileEditorSheet>
    )
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className={cn("flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0", wide ? "sm:max-w-lg" : "sm:max-w-md")}>
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {children}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        {/* Not DialogFooter: its `sm:justify-end` beats a grid quietly. */}
        {footer}
      </DialogContent>
    </Dialog>
  )
}
