"use client"
/**
 * ===========================================================================
 *  A QUESTION BEFORE SOMETHING IS LOST, OVER THE FORMS (round AN)
 * ===========================================================================
 * Archive a form, close the builder with changes not saved: asked here
 * rather than with the browser's confirm(), which is a grey system box on a
 * computer and a jarring alert on a phone. The same content as /app's
 * confirm (app/(storelib)/app/products/new/confirm-sheet): a short title,
 * one sentence, the safe button and the one that does it, and a third,
 * quieter way where there is one ("Save draft").
 *
 * Built on SheetDialog, so it is the shared sheet on a phone and a small
 * centred dialog on a computer, and it stacks over the builder dialog (the
 * product editor's confirm sits on a layer under it).
 */
import * as React from "react"
import { createRoot } from "react-dom/client"
import { SheetDialog, SheetDialogTitle } from "@/components/ui/sheet-dialog"
import { usePhoneWidth } from "@/components/ui/choice-list"
import { cn } from "@/lib/utils"

export interface FormQuestion {
  title: string
  body: string
  confirm: string
  cancel: string
  /** A third way, quieter: "Save draft" beside Discard and Keep editing. */
  alt?: string
}

export type FormAnswer = boolean | "alt"

const safe =
  "inline-flex min-w-0 items-center justify-center whitespace-nowrap rounded-xl border border-[#e3e4e8] bg-white font-medium text-[#1a1a2e] outline-none transition-colors duration-100 hover:bg-[#f7f7f8] active:bg-[#f1f2f4] focus-visible:shadow-[0_0_0_3px_rgba(26,26,46,0.12)]"
const doIt =
  "inline-flex min-w-0 items-center justify-center whitespace-nowrap rounded-xl bg-[#1a1a2e] font-semibold text-white outline-none transition-colors duration-100 hover:bg-[#2a2a40] active:bg-[#0f0f1c] focus-visible:shadow-[0_0_0_3px_rgba(26,26,46,0.25)]"

function FormConfirm({ question, onAnswer }: { question: FormQuestion | null; onAnswer: (a: FormAnswer) => void }) {
  const phone = usePhoneWidth()
  /* The words stay while it closes, rather than going blank under the motion. */
  const [shown, setShown] = React.useState<FormQuestion | null>(question)
  if (question && question !== shown) setShown(question)
  const q = question ?? shown
  if (!q) return null
  return (
    <SheetDialog
      open={question !== null}
      onClose={() => onAnswer(false)}
      phone={phone}
      label={q.title}
      showCloseButton={false}
      className="w-[calc(100vw-32px)] max-w-[400px] gap-0 overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white p-0 shadow-[0_20px_48px_-16px_rgba(17,24,39,0.28),0_2px_6px_rgba(17,24,39,0.06)] sm:max-w-[400px]"
      sheet={{ fill: false, aboveKeyboard: false, maxHeight: "min(70dvh, 520px)" }}
      dialog={{ "aria-describedby": undefined }}
    >
      <div data-form-confirm="" className={phone ? "px-5 pb-2 pt-2" : "px-5 pb-4 pt-5"}>
        <SheetDialogTitle className={cn("font-semibold leading-6 text-[#1a1a2e]", phone ? "text-[17px]" : "text-[16px]")}>{q.title}</SheetDialogTitle>
        <p className={cn("mt-1.5 leading-[1.5] text-[#6b7280]", phone ? "text-[15px]" : "text-[14px]")}>{q.body}</p>
      </div>
      {phone ? (
        <div className="grid grid-cols-2 gap-2.5 px-5 pb-2 pt-3">
          <button type="button" className={cn(safe, "h-12 text-[16px]")} onClick={() => onAnswer(false)}>
            {q.cancel}
          </button>
          <button type="button" data-confirm="" className={cn(doIt, "h-12 text-[16px]")} onClick={() => onAnswer(true)}>
            {q.confirm}
          </button>
          {q.alt ? (
            <button type="button" data-confirm-alt="" className="col-span-2 h-11 rounded-xl text-[15px] font-medium text-[#4b5563] active:bg-[#f3f4f6]" onClick={() => onAnswer("alt")}>
              {q.alt}
            </button>
          ) : null}
        </div>
      ) : (
        <div className="flex justify-end gap-2 border-t border-[#eef0f2] px-5 py-3">
          {q.alt ? (
            <button type="button" data-confirm-alt="" className="mr-auto h-9 rounded-lg px-2.5 text-[13px] font-medium text-[#4b5563] hover:bg-[#f3f4f6]" onClick={() => onAnswer("alt")}>
              {q.alt}
            </button>
          ) : null}
          <button type="button" className={cn(safe, "h-9 rounded-lg px-3 text-[13px]")} onClick={() => onAnswer(false)}>
            {q.cancel}
          </button>
          <button type="button" data-confirm="" className={cn(doIt, "h-9 rounded-lg px-3 text-[13px]")} onClick={() => onAnswer(true)}>
            {q.confirm}
          </button>
        </div>
      )}
    </SheetDialog>
  )
}

/**
 * The same question for code that has no place in its tree to draw it (a
 * list with many early returns): mounted on its own root for the question,
 * and taken down once it has closed.
 */
export function confirmForm(q: FormQuestion): Promise<FormAnswer> {
  return new Promise((resolve) => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)
    function Asked() {
      const [question, setQuestion] = React.useState<FormQuestion | null>(q)
      return (
        <FormConfirm
          question={question}
          onAnswer={(a) => {
            setQuestion(null)
            resolve(a)
            window.setTimeout(() => {
              root.unmount()
              host.remove()
            }, 400)
          }}
        />
      )
    }
    root.render(<Asked />)
  })
}

/** Asked like confirm(), answered in the sheet or dialog: `if (!(await ask({...}))) return`. A second question answers the first with no. */
export function useFormConfirm(): [(q: FormQuestion) => Promise<FormAnswer>, React.ReactElement] {
  const [question, setQuestion] = React.useState<FormQuestion | null>(null)
  const settle = React.useRef<((a: FormAnswer) => void) | null>(null)
  const ask = React.useCallback((q: FormQuestion) => {
    settle.current?.(false)
    setQuestion(q)
    return new Promise<FormAnswer>((resolve) => {
      settle.current = resolve
    })
  }, [])
  const onAnswer = React.useCallback((a: FormAnswer) => {
    const resolve = settle.current
    settle.current = null
    setQuestion(null)
    resolve?.(a)
  }, [])
  React.useEffect(() => () => settle.current?.(false), [])
  return [ask, <FormConfirm key="form-confirm" question={question} onAnswer={onAnswer} />]
}
