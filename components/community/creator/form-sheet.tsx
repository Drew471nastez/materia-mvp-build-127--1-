"use client"

/**
 * ===========================================================================
 *  A FORM: THE APP'S DIALOG ON A COMPUTER, THE COMPOSER'S SHEET ON A PHONE
 * ===========================================================================
 * Round 31, the owner (a phone, New space): the form's Cancel and Add space
 * floated in the middle of the screen with the keyboard up, the fields went
 * under the keys, and the sheet did not move like the New post one.
 *
 * On a phone a form is now the sheet New post is (components/community/
 * member/composer.tsx): the website builder's sheet (mobile-editor-sheet.tsx)
 * with its rise and close on the compositor, its drag, its light dim, sized to
 * what is in it. Cancel, the title and the one filled action sit in its top
 * row, so they are always where the thumb left them and never on, under or
 * floating above the keyboard. The keyboard is the sheet's own way
 * (keyboard "sheet"): the sheet grows by it and lifts its content, in the
 * iOS app by the composer's own number made in the focus itself
 * (visible-box.ts sheetKeyboardRoom), and the field being typed in is kept
 * in sight (keep-in-sight.ts). A tap into an empty field on iOS is focused
 * calmly (calm-focus.ts), so the page does not jump to it.
 *
 * On a computer it is the dialog every other section uses (parts.tsx
 * Dialog), Cancel and the action at its foot.
 *
 * What is inside stays while the sheet goes down, so a form never empties
 * itself on the first frame of its close.
 *
 * ONE RISE. A form that puts the caret in a field as it lands (`focus`, a new
 * space or event) opens at the sheet's tallest stop, as New post does: the
 * keyboard that follows needs that room, and a sheet sized to its content
 * would rise once and then grow again for the keyboard. A form opened to
 * look at or change (an edit) is sized to what is in it.
 */
import * as React from "react"
import { cn } from "@/lib/utils"
import { MobileEditorSheet } from "@/components/website-builder/mobile-editor-sheet"
import { SHEET_CLOSE_EASE } from "@/components/ui/bottom-sheet"
import { sheetKeyboardRoom } from "@/components/community/member/visible-box"
import { useKeepFieldInSight } from "@/components/community/member/keep-in-sight"
import { useCalmFocus } from "@/components/community/member/calm-focus"
import { Dialog, buttonPrimary, buttonSecondary } from "./parts"
import { tt } from "@/lib/i18n/text"

/** A phone, read at once in the browser so a form asked for on the first render opens as the sheet, never the dialog for a frame. */
export function usePhoneNow(): boolean {
  const [phone, setPhone] = React.useState(() => typeof window !== "undefined" && !!window.matchMedia?.("(max-width: 639px)").matches)
  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)")
    const read = () => setPhone(mq.matches)
    read()
    mq.addEventListener("change", read)
    return () => mq.removeEventListener("change", read)
  }, [])
  return phone
}

export interface FormAction {
  label: string
  /** What it says while the request is out ("Saving"). */
  busyLabel: string
  busy: boolean
  onClick: () => void
  /** Data attributes for the button (the probes find it by them). */
  data?: Record<`data-${string}`, string>
}

/** The sheet's Cancel: a plain word (the composer's CANCEL_BTN). */
const SHEET_CANCEL =
  "inline-flex h-10 shrink-0 touch-manipulation select-none items-center justify-center rounded-[10px] px-2.5 text-[15px] font-medium text-[#4b5563] outline-none transition-[background-color,color,opacity] duration-150 active:opacity-80 active:duration-0 hover:bg-[#f1f2f4] hover:text-[#1a1a2e] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 [-webkit-tap-highlight-color:transparent]"
/** Its one filled action (the composer's POST_BTN): near black, no hairline. */
const SHEET_ACTION =
  "inline-flex h-10 shrink-0 touch-manipulation select-none items-center justify-center rounded-[10px] bg-[#1a1a2e] px-4 text-[15px] font-semibold text-white shadow-[0_1px_1.5px_rgba(16,24,40,0.18)] outline-none transition-[background-color,opacity] duration-150 hover:bg-[#2b2b42] active:opacity-80 active:duration-0 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/25 aria-disabled:opacity-60 [-webkit-tap-highlight-color:transparent]"

export function FormSheet({
  open,
  onClose,
  title,
  action,
  cancelLabel,
  wide,
  name,
  focus = false,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  /** The one filled button; none for a form that only shows things. */
  action?: FormAction | null
  cancelLabel?: string
  wide?: boolean
  /** data-form-sheet's value, for the probes. */
  name: string
  /** On a phone, the caret goes into the field marked data-autofocus once the sheet has landed (see ONE RISE). */
  focus?: boolean
  children: React.ReactNode
}) {
  const phone = usePhoneNow()
  const cancel = cancelLabel ?? tt("Cancel")
  if (!phone)
    return (
      <Dialog
        open={open}
        onClose={onClose}
        title={title}
        wide={wide}
        footer={
          <>
            <button type="button" onClick={onClose} className={cn(buttonSecondary, "h-10 px-4 sm:h-9")}>
              {cancel}
            </button>
            {action ? (
              <button type="button" onClick={action.onClick} disabled={action.busy} className={cn(buttonPrimary, "h-10 px-4 sm:h-9")} {...action.data}>
                {action.busy ? action.busyLabel : action.label}
              </button>
            ) : null}
          </>
        }
      >
        <div data-form-sheet={name} data-form-kind="dialog">
          {children}
        </div>
      </Dialog>
    )
  return (
    <PhoneSheet open={open} onClose={onClose} title={title} action={action ?? null} cancel={cancel} name={name} focus={focus}>
      {children}
    </PhoneSheet>
  )
}

function PhoneSheet({ open, onClose, title, action, cancel, name, focus, children }: { open: boolean; onClose: () => void; title: string; action: FormAction | null; cancel: string; name: string; focus: boolean; children: React.ReactNode }) {
  /* In the page from the moment it is asked for until it has landed down. */
  const [present, setPresent] = React.useState(open)
  const [up, setUp] = React.useState(false)
  /* Sized to its content unless it brings the keyboard as it lands; set as it is asked for, so it never changes mid move. */
  const [fit, setFit] = React.useState(!focus)
  if (open && !present) {
    setPresent(true)
    setFit(!focus)
  }
  const openRef = React.useRef(open)
  openRef.current = open
  const sheetRef = React.useRef<HTMLDivElement>(null)
  const scrollRef = React.useRef<HTMLDivElement>(null)
  /* The last content while it goes down (WHAT IS INSIDE STAYS). */
  const kept = React.useRef(children)
  if (open) kept.current = children

  React.useLayoutEffect(() => {
    if (!present) return
    if (!open) {
      /* Asked away before it rose: nothing to slide down. */
      if (!up) setPresent(false)
      else setUp(false)
      return
    }
    if (up) return
    /* Mounted primed (drawn at its stop, unseen) this commit; raised once it has been painted, as New post is. */
    let task = 0
    let raf = requestAnimationFrame(() => {
      task = window.setTimeout(() => {
        raf = requestAnimationFrame(() => {
          if (openRef.current) setUp(true)
        })
      }, 0)
    })
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(task)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, present])

  const active = present && up
  useKeepFieldInSight(active, () => scrollRef.current)
  const scope = React.useCallback(() => sheetRef.current, [])
  useCalmFocus(active, scope)
  const keyboardRoom = React.useCallback(() => sheetKeyboardRoom(sheetRef.current), [])
  const focusRef = React.useRef(focus)
  focusRef.current = focus
  const onMoved = React.useCallback((isUp: boolean) => {
    if (isUp) {
      /* Landed: the caret goes into the field the form asks for, on the frame after, so the keyboard rises on a still sheet. */
      if (focusRef.current) requestAnimationFrame(() => sheetRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus({ preventScroll: true }))
      return
    }
    if (!openRef.current) setPresent(false)
  }, [])


  if (!present) return null
  return (
    <MobileEditorSheet
      open={up && open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      peekHeight={0}
      detents={[0.94]}
      openFull
      fit={fit}
      closeMs={420}
      closeEase={SHEET_CLOSE_EASE}
      closeAt={0.3}
      layer="raised"
      zIndex={125}
      holdPage="scroll"
      keyboard="sheet"
      keyboardRoom={keyboardRoom}
      primed
      onMoved={onMoved}
      label={title}
      className="bg-white [--wb-sheet-skirt:#fff]"
    >
      <div ref={sheetRef} aria-label={title} data-form-sheet={name} data-form-kind="sheet" data-keyboard-own="" className="flex min-h-0 flex-1 flex-col bg-white">
        <div className="shrink-0 border-b border-[#f0f1f3]">
          <div className="flex h-12 items-center gap-2 pl-1.5 pr-3" data-form-sheet-bar="">
            {/* Cancel and the action keep the caret through the press, so the keyboard goes down with the sheet in one move. */}
            <button type="button" onPointerDown={(e) => e.preventDefault()} onMouseDown={(e) => e.preventDefault()} onClick={onClose} className={SHEET_CANCEL} data-form-cancel="">
              {cancel}
            </button>
            <span className="min-w-0 flex-1 truncate text-center text-[16px] font-semibold text-[#1a1a2e]">{title}</span>
            {action ? (
              <button
                type="button"
                onPointerDown={(e) => e.preventDefault()}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  if (!action.busy) action.onClick()
                }}
                aria-disabled={action.busy || undefined}
                className={SHEET_ACTION}
                data-form-action=""
                {...action.data}
              >
                {action.busy ? action.busyLabel : action.label}
              </button>
            ) : (
              <span aria-hidden className="w-[60px] shrink-0" />
            )}
          </div>
        </div>
        {/* data-sheet-scroll: the sheet measures what this holds, not the room it was given (mobile-editor-sheet.tsx fit). */}
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4" data-form-scroll="" data-sheet-scroll="">
          {open ? children : kept.current}
        </div>
      </div>
    </MobileEditorSheet>
  )
}
