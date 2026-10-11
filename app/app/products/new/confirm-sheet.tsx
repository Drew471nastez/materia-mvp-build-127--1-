"use client"

/**
 * ===========================================================================
 *  A QUESTION BEFORE SOMETHING IS LOST
 * ===========================================================================
 * Every question the product editor asks (leave without saving, delete a
 * file, a very large upload) is this, so they all look and move alike.
 *
 * On a phone it is the app's shared sheet (components/ui/bottom-sheet.tsx):
 * it rises, drags down to dismiss and closes like every other sheet in /app.
 * From 640px up it is a compact modal. Both draw the same Polaris content: a
 * short title, one plain sentence, and two buttons, the safe one and the one
 * that does it. On a phone the two sit side by side across the sheet, 48px
 * tall; in the modal they sit at the end of the footer, safe one first.
 *
 * It used to be the dialog component with a bottom sheet's classes forced
 * onto it and a swipe handler of its own, three buttons on a phone, and
 * "Unsaved changes" as its title.
 */

import * as React from "react"
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { cn } from "@/lib/utils"
import { secondaryDepth } from "./editor-buttons"

/** The breakpoint the sheet hides itself from, and the bar's buttons change size at. */
const PHONE = "(max-width: 639px)"

function usePhone(): boolean {
  const [phone, setPhone] = React.useState(false)
  React.useEffect(() => {
    const mql = window.matchMedia(PHONE)
    const check = () => setPhone(mql.matches)
    check()
    mql.addEventListener("change", check)
    return () => mql.removeEventListener("change", check)
  }, [])
  return phone
}

export interface ConfirmQuestion {
  title: string
  body: string
  /** The button that does it. */
  confirm: string
  /** The button that leaves things as they are. */
  cancel: string
  /** Near black either way (never red, never violet): the words say what it does. */
  tone?: "critical" | "default"
  /** A third way, like "Don't save" beside Save and Stay: a quiet button of its own. */
  alt?: string
}

export type ConfirmAnswer = boolean | "alt"

/* The button that throws work away: near black with the same depth as the bar's buttons, not an alarm red. */
const destructiveDepth = cn(
  "inline-flex shrink-0 cursor-pointer select-none items-center justify-center gap-1.5 whitespace-nowrap bg-[#1a1a2e] font-semibold text-white outline-none",
  "shadow-[inset_0_1px_0_rgba(255,255,255,0.14),inset_0_-1px_0_rgba(0,0,0,0.35),0_1px_2px_rgba(16,24,40,0.25)] transition-[background-color,box-shadow] duration-100",
  "hover:bg-[#2a2a40] active:bg-[#0f0f1c] active:shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)]",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1a1a2e]",
)

const primaryDepth = cn(
  "inline-flex shrink-0 cursor-pointer select-none items-center justify-center whitespace-nowrap bg-[#1a1a2e] font-semibold text-white outline-none",
  "shadow-[inset_0_1px_0_rgba(255,255,255,0.14),inset_0_-1px_0_rgba(0,0,0,0.35),0_1px_2px_rgba(16,24,40,0.25)] transition-[background-color,box-shadow] duration-100",
  "hover:bg-[#2a2a40] active:bg-[#0f0f1c] active:shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)]",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1a1a2e]/40",
)

const AHEAD: ConfirmQuestion = { title: "Discard changes?", body: "Your edits since the last save will be lost.", confirm: "Discard", cancel: "Keep editing" }

export function ConfirmSheet({
  question,
  onAnswer,
}: {
  /** Null while closed. */
  question: ConfirmQuestion | null
  onAnswer: (yes: ConfirmAnswer) => void
}) {
  const phone = usePhone()
  const open = question !== null
  /* The words stay as they were while it closes, rather than going blank under the slide. */
  const [shown, setShown] = React.useState<ConfirmQuestion | null>(question)
  if (question !== null && question !== shown) setShown(question)
  /* On a phone the sheet is built ahead, before the first question, with the words it most often asks; the real ones replace them on the tap. */
  const q = question ?? shown ?? (phone ? AHEAD : null)
  if (!q) return null
  const doIt = q.tone === "default" ? primaryDepth : destructiveDepth

  if (phone) {
    return (
      <BottomSheet
        isOpen={open}
        onClose={() => onAnswer(false)}
        label={q.title}
        maxHeight="min(70dvh, 520px)"
        keepMounted
        header={
          <div className="px-5 pb-1 pt-3">
            <h2 className="text-[17px] font-semibold leading-6 text-[#1a1a2e]">{q.title}</h2>
            <p className="mt-1 text-[15px] leading-[1.45] text-[#6b7280]">{q.body}</p>
          </div>
        }
      >
        <div data-confirm-sheet="" data-surface="sheet" className="grid grid-cols-2 gap-2.5 px-5 pb-2 pt-4">
          <button type="button" onClick={() => onAnswer(false)} className={cn(secondaryDepth, "h-12 min-w-0 rounded-xl text-[16px]")}>
            {q.cancel}
          </button>
          <button type="button" data-confirm="" onClick={() => onAnswer(true)} className={cn(doIt, "h-12 min-w-0 rounded-xl text-[16px]")}>
            {q.confirm}
          </button>
          {q.alt ? (
            <button type="button" data-confirm-alt="" onClick={() => onAnswer("alt")} className="col-span-2 h-11 rounded-xl text-[15px] font-medium text-[#4b5563] active:bg-[#f3f4f6]">
              {q.alt}
            </button>
          ) : null}
        </div>
      </BottomSheet>
    )
  }

  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={(o) => !o && onAnswer(false)}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className="fixed inset-0 z-[200] bg-black/40 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 motion-reduce:animate-none" />
        <AlertDialogPrimitive.Content
          data-confirm-sheet=""
          data-surface="modal"
          className="fixed left-1/2 top-1/2 z-[200] w-[calc(100%-2rem)] max-w-[420px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white shadow-[0_20px_48px_-16px_rgba(17,24,39,0.28),0_2px_6px_rgba(17,24,39,0.06)] outline-none duration-150 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 motion-reduce:animate-none"
        >
          <div className="px-5 pb-4 pt-5">
            <AlertDialogPrimitive.Title className="text-[16px] font-semibold leading-6 text-[#1a1a2e]">{q.title}</AlertDialogPrimitive.Title>
            <AlertDialogPrimitive.Description className="mt-1 text-[14px] leading-[1.5] text-[#6b7280]">{q.body}</AlertDialogPrimitive.Description>
          </div>
          <div className="flex justify-end gap-2 border-t border-[#eceef1] px-5 py-3">
            {q.alt ? (
              <button type="button" data-confirm-alt="" onClick={() => onAnswer("alt")} className="mr-auto h-8 whitespace-nowrap rounded-lg px-2 text-[13px] font-medium text-[#4b5563] hover:bg-[#f3f4f6]">
                {q.alt}
              </button>
            ) : null}
            <AlertDialogPrimitive.Cancel className={cn(secondaryDepth, "h-8 rounded-lg px-3 text-[13px]")}>
              {q.cancel}
            </AlertDialogPrimitive.Cancel>
            <AlertDialogPrimitive.Action data-confirm="" onClick={() => onAnswer(true)} className={cn(doIt, "h-8 rounded-lg px-3 text-[13px]")}>
              {q.confirm}
            </AlertDialogPrimitive.Action>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  )
}

/**
 * ASKED LIKE window.confirm, ANSWERED IN THE SHEET. `ask` returns a promise
 * that settles with the answer, so a caller that used `confirm()` keeps its
 * shape: `if (!(await ask({...}))) return`. A second question while one is
 * open answers the first with no.
 */
export function useConfirm(): [(q: ConfirmQuestion) => Promise<boolean>, React.ReactElement, (q: ConfirmQuestion) => Promise<ConfirmAnswer>] {
  const [question, setQuestion] = React.useState<ConfirmQuestion | null>(null)
  const settle = React.useRef<((yes: ConfirmAnswer) => void) | null>(null)
  /* Three ways out (confirm, alt, cancel), for a question with a third button. */
  const choose = React.useCallback((q: ConfirmQuestion) => {
    settle.current?.(false)
    setQuestion(q)
    return new Promise<ConfirmAnswer>((resolve) => {
      settle.current = resolve
    })
  }, [])
  const ask = React.useCallback((q: ConfirmQuestion) => choose({ ...q, alt: undefined }).then((a) => a === true), [choose])
  const onAnswer = React.useCallback((yes: ConfirmAnswer) => {
    const resolve = settle.current
    settle.current = null
    setQuestion(null)
    resolve?.(yes)
  }, [])
  React.useEffect(() => () => settle.current?.(false), [])
  return [ask, <ConfirmSheet key="confirm" question={question} onAnswer={onAnswer} />, choose]
}
