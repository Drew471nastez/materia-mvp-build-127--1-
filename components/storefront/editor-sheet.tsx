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
 * the keyboard covering half of it. On a phone these are the app's own
 * bottom sheet (components/ui/bottom-sheet), the one every other phone sheet
 * in /app is: open and close on the compositor on the iOS curve, a drag that
 * follows the finger and leaves at its speed, pictures decoded before the
 * slide, and the footer riding on the keyboard.
 *
 * It was the website builder's MobileEditorSheet at one 78% stop. Two
 * things about that were wrong here. A fixed 78% put the sheet's top edge
 * across the middle of the cover on the page behind, so whatever was drawn
 * there (a logo on the creator's banner, in the report) sat on the sheet's
 * edge like a tab stuck to it. And it dimmed the page, which on a phone was
 * a dark fade over the cover the creator was in the middle of changing.
 *
 * NO DIM ON A PHONE EITHER, for the reason the drawer has none (below):
 * these edit the page behind them. The layer is still there, invisible, and
 * a tap on it still closes. The sheet sizes to its form, up to nearly the
 * whole screen, so a long form is not a short window with a scrollbar and a
 * short one is not a tall empty sheet.
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
 * THE DRAWER IS STILL A RADIX DIALOG. Focus trapping, Escape, returning
 * focus to the trigger and keeping the content mounted for the length of the
 * exit animation are all things it already does correctly, and all things
 * that look like a flash when hand-rolled. Only the geometry and the overlay
 * are ours. The phone sheet has no closed state on screen at all: closed, it
 * is out of the document.
 */

import * as React from "react"

import { Button } from "@/components/ui/button"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { OverlayScroll } from "@/components/storefront/overlay-scroll"
import { useIsPhone } from "@/components/storefront/use-is-phone"
import { useRouter } from "next/navigation"

import { isInEditorFrame, notifyEditorSaved } from "@/lib/store-builder/editor-channel"
import { SaveNotification } from "@/components/ui/save-notification"
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

/** The drawer's Radix exit, the `duration-200` in components/ui/dialog. The
    phone sheet says when it has gone itself (BottomSheet `onClosed`). */
export const SHEET_EXIT_MS_DESKTOP = 200

/**
 * How tall a phone editor may get: the whole screen less the status bar and
 * a strip of the page, so it still reads as a sheet over something.
 */
export const PHONE_EDITOR_MAX_HEIGHT = "calc(100dvh - env(safe-area-inset-top, 0px) - 48px)"

/**
 * ===========================================================================
 *  SAVE, CLOSE, AND THEN SHOW THE RESULT
 * ===========================================================================
 * The four editors on a creator page all did the same thing, and all did it
 * at the same moment as the close. Pair this with `onClosed` and the order
 * becomes: the request finishes, the sheet leaves, and only then does the
 * page behind it change.
 *
 * `markSaved` is what separates a save from a cancel — closing with Cancel
 * must not refresh anything, because nothing changed.
 */
export function useSaveThenRefresh() {
  const router = useRouter()
  const pending = React.useRef(false)
  /**
   * AND IT SAYS SO. A save used to end with the sheet leaving and the page
   * changing under it, with nothing that said the change had been kept. A
   * dark pill says "Saved" once the sheet has gone. Inside the workspace the
   * workspace says it (this frame is about to be replaced by the reloaded
   * page, and a toast in it would go with it); at the page's own address
   * this does.
   */
  const [toastSeq, setToastSeq] = React.useState(0)

  const actions = React.useMemo(
    () => ({
      markSaved: () => {
        pending.current = true
      },
      onClosed: () => {
        if (!pending.current) return
        pending.current = false
        /* Inside the workspace the frame around this reloads the page; at its
           own address the refresh is the only thing that can show the save. */
        notifyEditorSaved()
        if (!isInEditorFrame()) setToastSeq((n) => n + 1)
        router.refresh()
      },
    }),
    [router],
  )
  const toast = <SaveNotification key={toastSeq} show={toastSeq > 0} message="Saved" duration={2200} />
  return { ...actions, toast }
}

export function EditorSheet({
  open,
  onClose,
  title,
  busy,
  error,
  notice = null,
  onSave,
  saveDisabled = false,
  saveLabel = "Save",
  children,
  wide = false,
  onClosed,
  peek = null,
  onPeekEnd,
}: {
  open: boolean
  onClose: () => void
  title: string
  busy?: boolean
  error?: string | null
  /** Something to know that is not an error (round 41): saved, but not on the page yet. Grey, not red. */
  notice?: string | null
  onSave: () => void
  saveDisabled?: boolean
  saveLabel?: React.ReactNode
  children: React.ReactNode
  wide?: boolean
  /** Runs once the sheet has finished leaving. See the note below. */
  onClosed?: () => void
  /**
   * ON A PHONE, LOWER THE SHEET TO SHOW THE PAGE. A selector for the part of
   * the form to keep in view: the form scrolls it to the top and the sheet
   * glides down until that part is all that is left above the bottom edge,
   * so the page behind is visible while it is being changed (a colour scheme
   * being tried). A pull up, a tap on the title or a field taking focus puts
   * the sheet back, and `onPeekEnd` says so. Ignored on a desktop, where the
   * drawer never covers the page.
   */
  peek?: string | null
  onPeekEnd?: () => void
}) {
  const phone = useIsPhone()
  const scrollerRef = React.useRef<HTMLDivElement>(null)
  const [lowered, setLowered] = React.useState(0)
  const peekEndRef = React.useRef(onPeekEnd)
  peekEndRef.current = onPeekEnd

  React.useLayoutEffect(() => {
    if (!phone || !open || !peek) {
      setLowered(0)
      return
    }
    const scroller = scrollerRef.current
    const panel = scroller?.closest<HTMLElement>("[data-sheet-panel]")
    const anchor = scroller?.querySelector<HTMLElement>(peek)
    if (!scroller || !panel || !anchor) return
    const pr = panel.getBoundingClientRect()
    const sr = scroller.getBoundingClientRect()
    const ar = anchor.getBoundingClientRect()
    /* The part is brought up to just under the title, as far as the form can scroll. */
    const maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight)
    const target = Math.max(0, Math.min(maxScroll, scroller.scrollTop + (ar.top - sr.top) - 16))
    const anchorTop = ar.top - (target - scroller.scrollTop)
    /* Cancel and Save stay on the screen while it is lowered (BottomSheet pins them). */
    const footer = panel.querySelector<HTMLElement>("[data-sheet-pin-bottom]")
    const footerH = footer ? footer.getBoundingClientRect().height : 0
    const pad = parseFloat(getComputedStyle(panel).paddingBottom) || 0
    /* What has to stay above the bottom edge: the title, the part, a margin, and the footer. */
    const keep = anchorTop - pr.top + ar.height + 16 + footerH + pad
    const next = Math.max(0, Math.round(pr.height - keep))
    if (Math.abs(target - scroller.scrollTop) > 1) scroller.scrollTo({ top: target, behavior: "smooth" })
    setLowered(next)
  }, [phone, open, peek])

  /* A field taking focus needs the whole sheet, and the keyboard above it. */
  const endPeek = React.useCallback(() => { if (lowered > 0) peekEndRef.current?.() }, [lowered])

  /**
   * NOT CLOSED WHILE A SAVE IS IN FLIGHT, by anything. Cancel was already
   * disabled, but a tap above the sheet, a pull down or Escape still closed
   * it: the save then finished after the sheet had gone, `onClosed` had
   * already run with nothing to refresh, and the page kept showing the old
   * values until some later Cancel refreshed it. An error from that save had
   * nowhere to appear. While busy a close is refused: the drawer stays, and
   * the phone sheet springs back from a pull (BottomSheet `dismissible`).
   */
  const busyRef = React.useRef(busy)
  busyRef.current = busy
  const close = React.useCallback(() => {
    if (busyRef.current) return
    onClose()
  }, [onClose])

  /**
   * ===========================================================================
   *  THE SHEET LEAVES FIRST, AND THE PAGE CHANGES AFTER
   * ===========================================================================
   * Every editor did `setOpen(false)` and `router.refresh()` on the same line.
   * The refresh re-renders the whole page from a new server payload, and that
   * commit landed in the middle of the sheet's exit — so the sheet stuttered
   * on its way down while the page redrew underneath it, and the result
   * appeared halfway through the animation instead of at the end of it. That
   * is the "abrupt" part: two things happening at once, neither finishing
   * before the other starts.
   *
   * So the close plays on its own, and whatever the caller wanted to do
   * afterwards happens when the sheet is actually gone. The phone sheet says
   * so itself (BottomSheet `onClosed`, once its slide has finished); the
   * desktop drawer's Radix exit is 200ms, the `duration-200` in
   * components/ui/dialog, so that is timed.
   */
  const closedRef = React.useRef(onClosed)
  closedRef.current = onClosed
  const wasOpen = React.useRef(open)

  React.useEffect(() => {
    const leaving = wasOpen.current && !open
    wasOpen.current = open
    /* The phone sheet reports its own exit, to the frame. */
    if (!leaving || phone) return
    /**
     * ===================================================================
     *  THE PAGE ANSWERS THE MOMENT THE DRAWER STARTS TO LEAVE
     * ===================================================================
     * "Sometimes after closing it, it cannot be opened again." A modal
     * Radix dialog turns `pointer-events` off on the body while it is
     * mounted, and it stays mounted for the length of its exit. So for the
     * 200ms the drawer took to slide away, every click on the page landed
     * nowhere: close it by clicking beside it, press the pencil again, and
     * nothing happened. Measured in scripts/check-creator-editor.mjs, where
     * a press 90ms after closing opened nothing at all.
     *
     * The layer being closed no longer holds the page: the overlay and the
     * panel stop taking pointers as soon as their state is `closed` (the
     * classes below), and the body's lock goes now rather than after the
     * slide. Radix puts back the same empty value when the layer unmounts.
     */
    if (typeof document !== "undefined" && document.body.style.pointerEvents === "none") {
      document.body.style.pointerEvents = ""
    }
    const fn = closedRef.current
    if (!fn) return
    const timer = setTimeout(fn, SHEET_EXIT_MS_DESKTOP)
    return () => clearTimeout(timer)
  }, [open, phone])

  const footer = (
    <div
      /* Held at the bottom edge while a phone sheet is lowered; the skirt
         below covers the form it is held over. Clipped away otherwise. */
      data-sheet-pin-bottom=""
      className="relative z-10 grid shrink-0 grid-cols-2 gap-3 border-t border-border bg-background px-5 py-3 after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-16 after:bg-background after:content-[''] sm:px-6 sm:py-4"
    >
      {/*
        WHAT WENT WRONG IS SAID BESIDE SAVE (round 41). It was the last line of
        the form, under the social links and the switches: a creator who
        pressed Save at the top of a long form saw the button come back and
        nothing else. It is pinned here, over Cancel and Save, where the eye is
        when the request answers, and it goes as soon as the form is touched.
      */}
      {error || notice ? (
        <p
          role={error ? "alert" : "status"}
          data-sheet-message={error ? "error" : "notice"}
          className={cn("col-span-2 -mb-0.5 text-[13px] leading-5", error ? "font-medium text-[#b42318]" : "text-[#4b5563]")}
        >
          {error || notice}
        </p>
      ) : null}
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

        AND NO SPINNER. A spinner in the corner of the one button a creator is
        watching is the loudest thing on the sheet for the length of the
        request. The word eases into "Saving" with three soft dots, in the
        same grid cell as "Save", so the cell is as wide as the wider of the
        two and nothing beside it moves. Opacity and transform only.
        Near-black, the product's primary action, not the design system blue.
      */}
      <Button
        type="button"
        aria-busy={busy || undefined}
        /**
         * BUSY IS NOT `disabled`, and that is the third and last go at this.
         *
         * `disabled` drags in `disabled:opacity-50` from the button variants,
         * and the previous fix cancelled it with `disabled:opacity-100`
         * through tailwind-merge. That works, and it works by winning an
         * argument about class precedence between a `cva` base, a variant and
         * a merged override — three layers, any of which can change, for the
         * single most important control in the sheet. It is the wrong thing
         * to be depending on.
         *
         * So a save in flight is not disabled at all. The button keeps every
         * pixel it had, and the thing `disabled` was really there for — not
         * sending the request twice — is done by the guard below, which is
         * where it can actually be read. `aria-disabled` and `aria-busy` tell
         * assistive technology the truth without touching a single style.
         */
        className="relative w-full bg-[#111113] text-white hover:bg-[#1a1a2e]"
        onClick={() => {
          if (busy || saveDisabled) return
          onSave()
        }}
        disabled={saveDisabled}
        aria-disabled={busy || saveDisabled || undefined}
      >
        <span className="grid place-items-center">
          <span
            aria-hidden={busy || undefined}
            className={cn(
              "col-start-1 row-start-1 transition-[opacity,translate] duration-200 ease-out motion-reduce:transition-none",
              busy ? "-translate-y-1 opacity-0" : "translate-y-0 opacity-100",
            )}
          >
            {saveLabel}
          </span>
          <span
            aria-hidden={!busy || undefined}
            className={cn(
              "col-start-1 row-start-1 inline-flex items-center gap-[3px] transition-[opacity,translate] duration-200 ease-out motion-reduce:transition-none",
              busy ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
            )}
          >
            Saving
            <span className="cp-saving-dots ml-0.5 inline-flex gap-[3px]" aria-hidden>
              <i /><i /><i />
            </span>
          </span>
        </span>
      </Button>
    </div>
  )

  if (phone) {
    return (
      <BottomSheet
        isOpen={open}
        onClose={close}
        dismissible={!busy}
        onClosed={() => closedRef.current?.()}
        label={title}
        /* useIsPhone decides; the sheet must not hide itself between 640 and 767. */
        hideFrom={null}
        /* ONE STOP, and the drag is only ever "close". The column below lays
           itself out: a fixed title, the form scrolling, the footer pinned. */
        fill
        maxHeight={PHONE_EDITOR_MAX_HEIGHT}
        /* Cancel and Save sit on the keyboard, never under it. */
        aboveKeyboard
        scrim="clear"
        waitForImages
        lowered={lowered}
        onRaise={() => peekEndRef.current?.()}
        /* The title drags the sheet like the handle does, and a tap on it raises a lowered sheet. */
        header={
          <div className="border-b border-border px-5 pb-3 pt-2" onClick={endPeek}>
            <h2 className="text-[17px] font-semibold text-foreground">{title}</h2>
          </div>
        }
      >
        <div className="flex min-h-0 flex-1 flex-col">
          {/* The sheet's drag reads the scroller under the finger: one that
              can still scroll scrolls, one at its top edge pulls the sheet. */}
          <div
            ref={scrollerRef}
            data-sheet-scroll
            onFocus={(e) => { if ((e.target as HTMLElement).matches("input, textarea, select, [contenteditable]")) endPeek() }}
            /* `isolate`: what is stacked inside the form (the scheme discs) stays under the pinned footer. */
            className="wb-slim-scroll isolate min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-5"
          >
            {children}
          </div>
          {footer}
        </div>
      </BottomSheet>
    )
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) close() }}>
      <DialogContent
        showCloseButton={false}
        /*
          NO DIM. `bg-transparent` on the overlay leaves the page lit; the
          overlay element itself stays, because it is what catches a click
          outside and closes the drawer.
        */
        overlayClassName="bg-transparent data-[state=closed]:!pointer-events-none"
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
          /* Leaving, it takes no clicks: see the note on the body's lock above. */
          "data-[state=closed]:!pointer-events-none",
        )}
      >
        <DialogHeader className="shrink-0 border-b border-border px-6 py-4">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {/*
          A THIN THUMB OVER THE CONTENT, not the platform's bar. wb-slim-scroll
          was meant to be that, but Chrome ignores every ::-webkit-scrollbar
          rule once `scrollbar-width` is set, and drew its own bar with arrow
          buttons down the side of the form. See overlay-scroll.
        */}
        <OverlayScroll className="px-6 py-5" scrollerProps={{ "data-sheet-scroll": "" }}>
          {children}
        </OverlayScroll>

        {/* Not DialogFooter: its `sm:justify-end` beats a grid quietly. */}
        {footer}
      </DialogContent>
    </Dialog>
  )
}
