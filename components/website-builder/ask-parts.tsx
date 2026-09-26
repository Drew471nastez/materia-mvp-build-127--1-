"use client"

/**
 * ===========================================================================
 *  ASK STORELIB'S SMALL PARTS
 * ===========================================================================
 * Drawn by components/website-builder/theme-chat.tsx on both its shapes, the
 * computer's dock and the phone's sheet:
 *
 *   CONNECT AI     Claude's and OpenAI's marks and two words, in the top
 *                  row: people can bring their own AI (Claude Code, Codex)
 *                  to this website. Opens Website settings, Connections.
 *   THE MODES      Change page, or Code section. Two halves of one control
 *                  with a thumb that slides between them, on transform.
 *   SUGGESTIONS    up to three things to ask, from where the creator is
 *                  (lib/website-builder/ask-suggestions.ts). One row; on a
 *                  phone it scrolls sideways rather than wrapping.
 *   A QUESTION     the run stopped to ask: the question, why, and its
 *                  answers to tap, which wrap rather than scroll so every
 *                  one is in view. Once answered, the one sent is marked.
 *   THE SCOPE      "Only Hero": the edit is limited to the selected section.
 */

import * as React from "react"
import { X } from "lucide-react"

import { ClaudeMark, OpenAIMark } from "@/components/website-builder/connection-marks"
import { chosenOption, type AskQuestion } from "@/lib/website-builder/ask-activity"
import { cn } from "@/lib/utils"

export function ConnectAiButton({ phone, onClick }: { phone: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      data-ask-connect=""
      onClick={onClick}
      title="Connect Claude Code or Codex to this website"
      className={cn(
        "relative flex shrink-0 items-center gap-1.5 rounded-full border border-black/[0.08] bg-white pl-1 pr-2.5 text-[12.5px] font-medium text-[#1a1a2e]/80 transition-colors",
        "hover:border-black/[0.16] hover:text-[#1a1a2e] active:bg-black/[0.03]",
        phone ? "h-8 after:absolute after:-inset-y-1.5 after:inset-x-0 after:content-['']" : "h-7",
      )}
    >
      <span aria-hidden className="flex items-center">
        <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-white ring-1 ring-black/[0.08]">
          <ClaudeMark className="h-3 w-3 text-[#D97757]" />
        </span>
        <span className="-ml-1.5 flex h-[22px] w-[22px] items-center justify-center rounded-full bg-white ring-1 ring-black/[0.08]">
          <OpenAIMark className="h-3 w-3 text-black" />
        </span>
      </span>
      Connect AI
    </button>
  )
}

export type AskMode = "change" | "code"

export const MODES: readonly (readonly [AskMode, string])[] = [
  ["change", "Change page"],
  ["code", "Code section"],
] as const

export function ModeSwitch({
  mode,
  onChange,
  phone,
  reducedMotion,
}: {
  mode: AskMode
  onChange: (mode: AskMode) => void
  phone: boolean
  reducedMotion: boolean
}) {
  return (
    <div
      role="radiogroup"
      aria-label="What to ask for"
      data-ask-modes=""
      className="relative grid shrink-0 grid-cols-2 rounded-full bg-black/[0.045] p-0.5"
    >
      <span
        aria-hidden
        data-ask-mode-thumb=""
        className="pointer-events-none absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-full bg-white shadow-[0_1px_2px_rgba(15,23,42,0.1)]"
        style={{
          transform: mode === "code" ? "translateX(100%)" : "none",
          transition: reducedMotion ? "none" : "transform 260ms cubic-bezier(0.32, 0.72, 0, 1)",
        }}
      />
      {MODES.map(([key, label]) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={mode === key}
          data-ask-mode={key}
          onClick={() => onChange(key)}
          className={cn(
            "relative whitespace-nowrap rounded-full font-medium transition-colors duration-200",
            phone ? "h-9 px-3 text-[13px] after:absolute after:-inset-y-1 after:inset-x-0 after:content-['']" : "h-7 px-3 text-[12px]",
            mode === key ? "text-[#1a1a2e]" : "text-[#6b7280] hover:text-[#1a1a2e]",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

export function SuggestionChips({
  items,
  onPick,
  phone,
  className,
}: {
  items: string[]
  onPick: (text: string) => void
  phone: boolean
  className?: string
}) {
  if (items.length === 0) return null
  return (
    <div
      data-ask-suggestions=""
      className={cn(
        "flex min-w-0 gap-1.5",
        phone ? "scrollbar-hide -mx-4 overflow-x-auto px-4 [touch-action:pan-x]" : "flex-wrap",
        className,
      )}
    >
      {items.map((text) => (
        <button
          key={text}
          type="button"
          data-ask-suggestion=""
          onClick={() => onPick(text)}
          className={cn(
            "relative shrink-0 whitespace-nowrap rounded-full border border-[#e5e7eb] bg-white text-[#1a1a2e]/80 transition-colors hover:border-[#1a1a2e]/20 hover:text-[#1a1a2e] active:bg-black/[0.03]",
            phone ? "h-9 px-3.5 text-[13.5px] after:absolute after:-inset-y-1 after:inset-x-0 after:content-['']" : "h-8 px-3 text-[12.5px]",
          )}
        >
          {text}
        </button>
      ))}
    </div>
  )
}

/**
 * THE RUN'S QUESTION, WITH ITS ANSWERS. It stands where the answer would:
 * the question is what the run said. The answers wrap under it and never
 * scroll sideways, so on a 360px phone every one is in view, each 44px tall
 * there, and one too long for a line wraps inside itself. A tap sends it as
 * the next message in this conversation; the box below takes any other
 * answer. `answer` is that next message once there is one: the choices stay
 * as a record, the one sent filled like a message of yours.
 */
export function QuestionChoices({
  question,
  answer,
  canAnswer,
  onAnswer,
  phone,
}: {
  question: AskQuestion
  answer: string | undefined
  canAnswer: boolean
  onAnswer: (text: string) => void
  phone: boolean
}) {
  const answered = answer !== undefined
  const chosen = chosenOption(question, answer)
  return (
    <div data-ask-question={answered ? "answered" : "open"} className="min-w-0">
      {/* The same size and weight as the rest of the thread: a size up on a phone. */}
      <p
        data-ask-question-text=""
        className={cn("whitespace-pre-wrap leading-relaxed text-[#1a1a2e]", phone ? "text-[15px] font-[450]" : "text-[13.5px]")}
      >
        {question.question}
      </p>
      {question.why && (
        <p data-ask-question-why="" className="mt-0.5 text-[12.5px] leading-snug text-[#6b7280]">
          {question.why}
        </p>
      )}
      {question.options.length > 0 && (
        /* `items-start`: an answer that wraps inside itself is taller, and the others on its row keep their own height. */
        <div role="group" aria-label={question.question} className={cn("flex min-w-0 flex-wrap items-start", phone ? "mt-3 gap-2" : "mt-2.5 gap-1.5")}>
          {question.options.map((option) => {
            const picked = option === chosen
            return (
              <button
                key={option}
                type="button"
                data-ask-option=""
                data-picked={picked ? "" : undefined}
                disabled={answered || !canAnswer}
                aria-pressed={answered ? picked : undefined}
                onClick={() => onAnswer(option)}
                className={cn(
                  "min-w-0 max-w-full rounded-[22px] border text-left transition-colors duration-150",
                  phone ? "min-h-[44px] px-4 py-[10px] text-[15px] leading-[22px]" : "min-h-8 px-3 py-[5px] text-[13px] leading-5",
                  !answered && "border-[#1a1a2e]/15 bg-white font-medium text-[#1a1a2e] hover:border-[#1a1a2e]/35 active:bg-black/[0.03]",
                  answered && picked && "border-transparent bg-[#f1f2f4] font-medium text-[#1a1a2e]",
                  answered && !picked && "border-[#e5e7eb] bg-transparent text-[#6b7280]/80",
                )}
              >
                {option}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * THE SCOPE OF THE EDIT, where you are about to type it. On by default when
 * a section is selected, because that is what selecting one means; one
 * press clears it to edit the whole page, and one puts it back.
 */
export function ScopeChip({
  name,
  locked,
  onLock,
  onUnlock,
  phone,
}: {
  name: string
  locked: boolean
  onLock: () => void
  onUnlock: () => void
  phone: boolean
}) {
  if (locked) {
    return (
      <span
        data-ask-scope="locked"
        title={`Only ${name} will change`}
        className={cn(
          "inline-flex min-w-0 items-center gap-1 rounded-full border border-[#1a1a2e]/12 bg-white pl-2.5 pr-1 text-[12px] text-[#1a1a2e]",
          phone ? "h-9" : "h-7",
        )}
      >
        <span className="min-w-0 truncate">Only {name}</span>
        <button
          type="button"
          onClick={onUnlock}
          aria-label={`Stop limiting edits to ${name}`}
          title="Edit the whole page instead"
          className="relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[#6b7280] transition-colors after:absolute after:-inset-3 after:content-[''] hover:bg-black/[0.06] hover:text-[#1a1a2e]"
        >
          <X className="h-3 w-3" strokeWidth={2.25} />
        </button>
      </span>
    )
  }
  return (
    <button
      type="button"
      data-ask-scope="page"
      onClick={onLock}
      className={cn(
        "relative inline-flex min-w-0 items-center rounded-full border border-dashed border-[#1a1a2e]/20 px-2.5 text-[12px] text-[#6b7280] transition-colors hover:border-[#1a1a2e]/35 hover:text-[#1a1a2e]",
        phone ? "h-9 after:absolute after:-inset-y-1 after:inset-x-0 after:content-['']" : "h-7",
      )}
    >
      <span className="min-w-0 truncate">Limit to {name}</span>
    </button>
  )
}
