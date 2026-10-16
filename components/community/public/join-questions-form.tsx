"use client"

/**
 * ===========================================================================
 *  THE QUESTIONS, AS SOMEBODY JOINING SEES THEM (round 32)
 * ===========================================================================
 * The fields of the join form (join-controls.tsx JoinFormDialog), and the
 * same fields in the admin's preview (components/community/creator/
 * join-questions-panel.tsx), so what the admin sees is what people get. One
 * question after another: its words, a quiet line under them when there is
 * one, Optional beside it when it may be left, and the field. A choice is a
 * list of rows with a dot (one) or a box (several), the leave dialog's rows.
 * Text is 16px on a phone so iOS does not zoom into it.
 */
import * as React from "react"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { JOIN_LONG_MAX, JOIN_SHORT_MAX, type AnswerDraft, type JoinQuestion } from "@/lib/communities/join-questions"

const FIELD =
  "block w-full rounded-xl border border-[#e6e8ec] bg-white px-3.5 text-[16px] leading-snug text-[#1a1a2e] shadow-[0_1px_1px_rgba(16,24,40,0.03)] outline-none placeholder:text-[#9ca3af] focus:border-[#c9ccd2] focus:ring-2 focus:ring-[#1a1a2e]/10 disabled:bg-[#f7f7f8] sm:text-[14.5px]"
const ROW =
  "flex min-h-[44px] w-full items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left text-[14.5px] leading-snug outline-none transition-[background-color,border-color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 [-webkit-tap-highlight-color:transparent] sm:min-h-10 sm:text-[14px]"

export function JoinQuestionFields({
  questions,
  draft,
  onChange,
  invalid,
  disabled,
  idPrefix = "jq",
}: {
  questions: JoinQuestion[]
  draft: AnswerDraft
  onChange: (next: AnswerDraft) => void
  /** The question the server pointed at, drawn with a red edge. */
  invalid?: string | null
  disabled?: boolean
  idPrefix?: string
}) {
  const set = (id: string, v: string | string[]) => onChange({ ...draft, [id]: v })
  return (
    <div className="space-y-5" data-join-questions="">
      {questions.map((q) => {
        const fieldId = `${idPrefix}-${q.id}`
        const bad = invalid === q.id
        const value = draft[q.id]
        const head = (
          <span className="flex items-baseline justify-between gap-3">
            <span className="text-[14.5px] font-medium leading-snug text-[#1a1a2e] [overflow-wrap:anywhere]">{q.label}</span>
            {q.required ? null : <span className="shrink-0 text-[12.5px] text-[#8a8f98]">Optional</span>}
          </span>
        )
        const help = q.help ? <span className="mt-0.5 block text-[13px] leading-snug text-[#6b7280]">{q.help}</span> : null
        if (q.kind === "choice" || q.kind === "multi") {
          const picked = Array.isArray(value) ? value : typeof value === "string" && value ? [value] : []
          const multi = q.kind === "multi"
          return (
            <div key={q.id} role={multi ? "group" : "radiogroup"} aria-labelledby={`${fieldId}-label`} aria-required={q.required || undefined} aria-invalid={bad || undefined} data-join-question={q.id}>
              <p id={`${fieldId}-label`}>
                {head}
                {help}
                {multi ? <span className="mt-0.5 block text-[12.5px] text-[#8a8f98]">Pick any that fit.</span> : null}
              </p>
              <div className="mt-2.5 space-y-1.5">
                {q.options.map((o) => {
                  const on = picked.includes(o)
                  return (
                    <button
                      key={o}
                      type="button"
                      role={multi ? "checkbox" : "radio"}
                      aria-checked={on}
                      disabled={disabled}
                      onClick={() => set(q.id, multi ? (on ? picked.filter((x) => x !== o) : [...picked, o]) : on && !q.required ? "" : o)}
                      className={cn(ROW, on ? "border-[#1a1a2e] bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.08)]" : bad ? "border-[#f3b4ae] bg-white text-[#374151]" : "border-[#e6e8ec] bg-white text-[#374151] hover:bg-[#fafbfc] active:bg-[#f4f5f7]")}
                    >
                      {multi ? (
                        <span aria-hidden className={cn("grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] border transition-colors duration-150", on ? "border-[#1a1a2e] bg-[#1a1a2e] text-white" : "border-[#c9ccd2] bg-white")}>
                          {on ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                        </span>
                      ) : (
                        <span aria-hidden className={cn("relative flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition-colors duration-150", on ? "border-[#1a1a2e]" : "border-[#c9ccd2]")}>
                          <span className={cn("h-2 w-2 rounded-full bg-[#1a1a2e] transition-[scale,opacity] duration-150 ease-out motion-reduce:transition-none", on ? "scale-100 opacity-100" : "scale-50 opacity-0")} />
                        </span>
                      )}
                      <span className="min-w-0 [overflow-wrap:anywhere]">{o}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        }
        const text = typeof value === "string" ? value : ""
        return (
          <label key={q.id} htmlFor={fieldId} className="block" data-join-question={q.id}>
            {head}
            {help}
            {q.kind === "long" ? (
              <textarea
                id={fieldId}
                value={text}
                disabled={disabled}
                required={q.required}
                aria-invalid={bad || undefined}
                rows={3}
                maxLength={JOIN_LONG_MAX}
                onChange={(e) => set(q.id, e.target.value)}
                className={cn(FIELD, "mt-2 resize-none py-2.5", bad && "border-[#f3b4ae]")}
              />
            ) : (
              <input
                id={fieldId}
                type={q.kind === "email" ? "email" : "text"}
                inputMode={q.kind === "email" ? "email" : undefined}
                autoComplete={q.kind === "email" ? "email" : "off"}
                value={text}
                disabled={disabled}
                required={q.required}
                aria-invalid={bad || undefined}
                maxLength={q.kind === "email" ? 254 : JOIN_SHORT_MAX}
                onChange={(e) => set(q.id, e.target.value)}
                className={cn(FIELD, "mt-2 h-11", bad && "border-[#f3b4ae]")}
              />
            )}
          </label>
        )
      })}
    </div>
  )
}
