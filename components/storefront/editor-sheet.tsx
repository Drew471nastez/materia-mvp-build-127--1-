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
 *  A SHEET ON A PHONE, A DRAWER ON A DESKTOP
 * ---------------------------------------------------------------------------
 * A centred dialog on a phone is a box in the middle of a small screen with
 * the keyboard covering half of it. The website builder solved that once,
 * with a bottom sheet that has detents, drag physics, a keyboard inset and a
 * measured viewport, and MobileEditorSheet IS that component.
 *
 * ON A DESKTOP IT IS A DRAWER AT THE RIGHT EDGE, not a centred dialog over a
 * dimmed page. A centred dialog with the lights off says "stop and answer
 * this"; these edit the page BEHIND them, and the whole reason the workspace
 * frames the real page is so a creator can see a change land. Dimming the
 * one thing they are looking at, and covering its middle, is working against
 * that. So the page stays lit, the drawer sits over the right of it with a
 * shadow to say which is in front, and the canvas is still readable while a
 * colour is picked.
 *
 * IT IS STILL A RADIX DIALOG. Focus trapping, Escape, returning focus to the
 * trigger and — the part that matters here — keeping the content mounted for
 * the length of the exit animation are all things it already does correctly
 * and all things that look like a flash when hand-rolled. Only the geometry
 * and the overlay are ours.
 *
 * `peekHeight={0}` and `layer="raised"`: the sheet's default is the builder's
 * BASE sheet, which peeks 72px above the bottom edge when closed because the
 * builder's tab row lives in it. An editor is not that. Left at the default,
 * a closed editor sat as a permanent strip across the bottom of the page —
 * which is what "your page is live is always at the bottom" was.
 */

import * as React from "react"

import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { MobileEditorSheet } from "@/components/website-builder/mobile-editor-sheet"
import { useIsPhone } from "@/components/storefront/use-is-phone"
import { notifyEditorSheet } from "@/lib/store-builder/editor-channel"
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

  /**
   * THE DIM HAS TO REACH THE BAR ABOVE THE FRAME.
   *
   * These editors run inside the workspace's iframe, and a sheet dims the
   * page behind it — but "the page" is the frame, and the workspace's bar is
   * above it in the other document. So the dim stopped at a hard horizontal
   * edge with a lit bar over it. The workspace dims its bar when this says
   * so; outside the frame this is a no-op and nothing changes.
   *
   * Closed on unmount as well as on close, because a creator navigating the
   * canvas away with an editor open would otherwise leave the bar dark.
   */
  React.useEffect(() => {
    if (!phone) return
    notifyEditorSheet(open)
    return () => notifyEditorSheet(false)
  }, [open, phone])

  const footer = (
    <div className="grid shrink-0 grid-cols-2 gap-3 border-t border-border bg-background px-5 py-3 sm:px-6 sm:py-4">
      <Button type="button" variant="outline" className="w-full" onClick={onClose} disabled={busy}>
        Cancel
      </Button>
      {/*
        ===================================================================
         NOTHING ABOUT THIS BUTTON MOVES OR FADES WHEN IT IS PRESSED
        ===================================================================
        Two rounds of this. First the whole label was swapped for a spinner,
        so the word vanished at the moment it was pressed. Then the spinner
        was put BESIDE the word — which fixed the vanishing and left two
        things wrong that a photograph of it made obvious:

        1. The row is centred, so adding a 16px mark and an 8px gap shoved
           the label 12px to the left as the request went out. The label
           slides sideways the instant you commit, which is the "it jumps"
           part. The spinner is absolutely positioned now: it is painted at
           the left inset and takes part in no layout at all, so the word is
           in exactly the same place before, during and after.

        2. `disabled` carries `disabled:opacity-50` from the button variants,
           so a save in flight turned the whole control 50% transparent. A
           faded-out button is the universal look of one that cannot be
           used, and it is on screen for the length of the request. Busy is
           not the same state as unavailable: it stays disabled, because a
           second press must not send a second save, but it keeps its colour.

        A Save with nothing to save still dims, which is the one case where
        the dimming means what it looks like.
      */}
      <Button
        type="button"
        aria-busy={busy || undefined}
        className={cn("relative w-full", busy && "disabled:opacity-100")}
        onClick={onSave}
        disabled={busy || saveDisabled}
      >
        {busy && (
          <Loader2
            className="absolute left-4 h-4 w-4 animate-spin"
            aria-hidden
          />
        )}
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
          ONE STOP. Two stops made the height a thing a creator had to
          manage: the sheet could be left at any of them, a drag meant to
          scroll the form resized it instead, and nothing in it needs the
          whole screen. One stop is a fixed sheet with a scroller in it — the
          drag is only ever "close".

          78%, up from 60%. At 60% a form with four fields in it was a
          three-field window with a scrollbar, and the thing being edited is
          visible above the sheet either way — a strip of cover photo says
          which page this is, and a creator does not need half the screen of
          it to know that. A keyboard grows this further, by its own height,
          so the panel above it stays this size: see sheet-gestures.ts.
        */
        detents={[0.78]}
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
      <DialogContent
        showCloseButton={false}
        /*
          NO DIM. `bg-transparent` on the overlay leaves the page lit; the
          overlay element itself stays, because it is what catches a click
          outside and closes the drawer.
        */
        overlayClassName="bg-transparent"
        /*
          The base content class zooms from 95% about the centre, which is a
          dialog's animation and fights a drawer's slide. `disableDefaultAnimations`
          drops the whole animation set — including the pair of `duration`s
          and the zoom that twMerge has no rule for and would let through —
          and the slide below is then the only thing moving. The OVERLAY
          keeps its fade: an invisible layer has nothing to fade, so it costs
          nothing and keeps Radix's own state machine honest.
        */
        disableDefaultAnimations
        disableOverlayDefaultAnimations={false}
        className={cn(
          // Undo the centring: Radix positions content at 50%/50% with a
          // translate, and a drawer is pinned to an edge instead.
          "left-auto right-0 top-0 translate-x-0 translate-y-0 max-w-none",
          "flex h-dvh flex-col gap-0 overflow-hidden rounded-none border-y-0 border-r-0 p-0",
          "shadow-[-24px_0_60px_-24px_rgba(15,23,42,0.35)]",
          /*
            A 60px blurred shadow travelling across the screen is repainted
            every frame unless the panel is on a layer of its own. Declaring
            what is about to change lets the compositor rasterise the panel
            and its shadow once and then move it, which is the difference
            between a slide that is drawn and a slide that is transformed.
            It costs a layer only while the drawer exists, because Radix
            unmounts the whole thing on close.
          */
          "[will-change:transform,opacity]",
          "w-full sm:w-[420px]",
          wide && "sm:w-[520px]",
          // The slide. Radix keeps the node mounted for the exit, so the
          // closed state is a real animation rather than a deletion.
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right",
          "data-[state=open]:duration-300 data-[state=closed]:duration-200",
          /*
            The curve, which is the whole difference between this reading as
            a panel and reading as a box that appears. `.animate-in` uses
            var(--tw-ease, ease) and nothing was setting it, so both the
            slide and the fade ran on the browser's symmetric `ease`: slow
            off the mark, which looks like a dropped frame at the start even
            when every frame is on time. `ease-sheet` is the curve the phone
            sheet already snaps on, defined once in globals.css.
          */
          "ease-sheet",
          /*
            AND NO TRANSITIONS ON TOP OF THE ANIMATION. `transition-property`
            starts life as `all`, and `duration-300` sets transition-duration
            as well as the animation's, so the panel was quietly transitioning
            EVERY property for 300ms alongside its slide. The probe caught it
            animating `scrollbar-color`. `transition-none` clears the property
            list; --tw-duration, which is what animate-in actually reads,
            is untouched.
          */
          "transition-none",
          "data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0",
        )}
      >
        <DialogHeader className="shrink-0 border-b border-border px-6 py-4">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {/*
          wb-slim-scroll, the same bar the phone sheet and the builder's
          panels use. Without it this one drew the system's 15px bar with a
          painted track, which is the heaviest thing in the drawer.
        */}
        <div data-sheet-scroll className="wb-slim-scroll min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {children}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        {/* Not DialogFooter: its `sm:justify-end` beats a grid quietly. */}
        {footer}
      </DialogContent>
    </Dialog>
  )
}
