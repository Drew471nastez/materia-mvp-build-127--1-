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
 *   REMEMBERED     "Remembered: ..." under an answer that kept a note in
 *                  AI Memory, with Undo.
 *   SUGGESTIONS    up to three things to ask, from where the creator is
 *                  (lib/website-builder/ask-suggestions.ts). One row; on a
 *                  phone it scrolls sideways rather than wrapping.
 *   A QUESTION     the run stopped to ask: the question, why, and its
 *                  answers to tap, which wrap rather than scroll so every
 *                  one is in view. Once answered, the one sent is marked.
 *   THE SCOPE      "Editing: Hero": the edit is limited to the selection.
 *                  Round 69: or "New section below Hero" when the words ask
 *                  for one (lib/website-builder/section-aim.ts), with one tap
 *                  to switch between the two, and the place itself a button
 *                  that flips above and below.
 */

import * as React from "react"
import { ArrowUpDown, X } from "lucide-react"

import { ClaudeMark, OpenAIMark } from "@/components/website-builder/connection-marks"
import { chosenOption, type AskQuestion } from "@/lib/website-builder/ask-activity"
import { optionAction, readImageUrl, type QuestionAction } from "@/lib/sites/agent/questions"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"

export function ConnectAiButton({ phone, onClick }: { phone: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      data-ask-connect=""
      onClick={onClick}
      title={tt("Use your own Claude or OpenAI API key, or connect Claude Code or Codex")}
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
      {tt("Connect AI")}
    </button>
  )
}

/**
 * WHAT IT KEPT IN AI MEMORY, under the answer: "Remembered: never use
 * gradients", with Undo, which deletes the note (lib/ai-memory). Once undone
 * the line says so and offers nothing more.
 */
export function RememberedLine({ content, undone, onUndo, phone }: { content: string; undone: boolean; onUndo: () => void; phone: boolean }) {
  return (
    <p data-ask-remembered={undone ? "undone" : "kept"} className={cn("flex min-w-0 items-baseline gap-1.5 leading-snug text-[#6b7280]", phone ? "text-[13.5px]" : "text-[12.5px]")}>
      <span className={cn("min-w-0 flex-1", undone && "line-through decoration-[#9ca3af]")}>
        <span className="font-medium text-[#1a1a2e]/80">{tt("Remembered:")}</span> {content}
      </span>
      {undone ? (
        <span className="shrink-0">{tt("Undone")}</span>
      ) : (
        <button
          type="button"
          data-ask-remembered-undo=""
          onClick={onUndo}
          className="relative shrink-0 font-medium text-[#1a1a2e]/75 underline-offset-2 after:absolute after:-inset-2 after:content-[''] hover:text-[#1a1a2e] hover:underline"
        >
          {tt("Undo")}
        </button>
      )}
    </p>
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
        phone ? "scrollbar-hide -mx-4 overflow-x-auto px-4 [touch-action:pan-x_pan-y]" : "flex-wrap",
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
  onImage,
  onUpload,
  phone,
}: {
  question: AskQuestion
  answer: string | undefined
  canAnswer: boolean
  onAnswer: (text: string) => void
  /**
   * A picture for the setting the question names: uploaded, or an address
   * pasted. `option` is the pill that was pressed, so it shows as the one
   * chosen. Without a target the pills are words, as before.
   */
  onImage?: (url: string, how: QuestionAction, option: string) => void
  onUpload?: (file: File) => Promise<string>
  phone: boolean
}) {
  const answered = answer !== undefined
  const chosen = chosenOption(question, answer)
  /* "Upload image" and "Paste image URL" act, when the question names where the picture goes. */
  const acts = !!question.target && !!onImage
  const [urlOpen, setUrlOpen] = React.useState<string | null>(null)
  const [uploading, setUploading] = React.useState(false)
  const [problem, setProblem] = React.useState<string | null>(null)
  const fileRef = React.useRef<HTMLInputElement>(null)
  const uploadOption = React.useRef("")
  const press = (option: string) => {
    const action = acts ? optionAction(option) : null
    setProblem(null)
    if (action === "upload_image" && onUpload) {
      uploadOption.current = option
      setUrlOpen(null)
      fileRef.current?.click()
      return
    }
    if (action === "image_url") {
      setUrlOpen((open) => (open ? null : option))
      return
    }
    onAnswer(option)
  }
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
                data-ask-action={acts ? (optionAction(option) ?? undefined) : undefined}
                disabled={answered || !canAnswer || uploading}
                aria-pressed={answered ? picked : undefined}
                aria-expanded={acts && optionAction(option) === "image_url" ? urlOpen === option : undefined}
                onClick={() => press(option)}
                className={cn(
                  "min-w-0 max-w-full rounded-[22px] border text-left transition-colors duration-150",
                  phone ? "min-h-[44px] px-4 py-[10px] text-[15px] leading-[22px]" : "min-h-8 px-3 py-[5px] text-[13px] leading-5",
                  !answered && "border-[#1a1a2e]/15 bg-white font-medium text-[#1a1a2e] hover:border-[#1a1a2e]/35 active:bg-black/[0.03]",
                  answered && picked && "border-transparent bg-[#f1f2f4] font-medium text-[#1a1a2e]",
                  answered && !picked && "border-[#e5e7eb] bg-transparent text-[#6b7280]/80",
                )}
              >
                {uploading && uploadOption.current === option ? tt("Uploading") : option}
              </button>
            )
          })}
        </div>
      )}
      {acts && (
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp,image/avif"
          className="hidden"
          data-ask-upload-input=""
          onChange={async (event) => {
            const file = event.target.files?.[0]
            event.target.value = ""
            if (!file || !onUpload || !onImage) return
            setUploading(true)
            setProblem(null)
            try {
              const url = await onUpload(file)
              onImage(url, "upload_image", uploadOption.current)
            } catch (thrown) {
              setProblem(thrown instanceof Error && thrown.message ? thrown.message : tt("The upload did not go through. Try again."))
            } finally {
              setUploading(false)
            }
          }}
        />
      )}
      {acts && urlOpen !== null && !answered && (
        <ImageUrlField
          phone={phone}
          onUse={(url) => {
            const option = urlOpen
            setUrlOpen(null)
            onImage?.(url, "image_url", option)
          }}
          onCancel={() => setUrlOpen(null)}
        />
      )}
      {problem && (
        <p data-ask-image-problem="" role="alert" className="mt-1.5 text-[12px] leading-snug text-[#b45309]">
          {problem}
        </p>
      )}
    </div>
  )
}

/**
 * "PASTE IMAGE URL", right under the question: an address box, the picture
 * as it will look, and Use it. The address is checked as it is typed
 * (lib/sites/agent/questions.ts, readImageUrl: https, or a path on the site)
 * and the picture must load before it can be used, so a page is never left
 * pointing at nothing.
 */
export function ImageUrlField({ phone, onUse, onCancel }: { phone: boolean; onUse: (url: string) => void; onCancel: () => void }) {
  const [value, setValue] = React.useState("")
  const [loaded, setLoaded] = React.useState<"waiting" | "ok" | "broken">("waiting")
  const field = React.useRef<HTMLInputElement>(null)
  const read = readImageUrl(value)
  const url = read.ok ? read.url : null
  React.useEffect(() => {
    field.current?.focus({ preventScroll: true })
  }, [])
  React.useEffect(() => {
    setLoaded("waiting")
  }, [url])
  /* A path on the creator's own site is drawn there, not here: it is used as it is. */
  const sitePath = !!url && url.startsWith("/")
  const usable = !!url && (loaded === "ok" || sitePath)
  const message = !value.trim() ? null : read.ok === false ? read.error : loaded === "broken" && !sitePath ? tt("That address does not open as a picture.") : null
  return (
    <form
      data-ask-image-url=""
      className="mt-2 min-w-0 rounded-2xl border border-[#e5e7eb] bg-white p-2"
      onSubmit={(event) => {
        event.preventDefault()
        if (url && usable) onUse(url)
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return
        event.preventDefault()
        event.stopPropagation()
        onCancel()
      }}
    >
      <div className="flex min-w-0 items-center gap-2">
        {url && (
          /* The picture as it will look: it must load before it can be used. */
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt=""
            data-ask-image-preview={loaded}
            onLoad={() => setLoaded("ok")}
            onError={() => setLoaded("broken")}
            className={cn("h-10 w-10 shrink-0 rounded-lg border border-[#e5e7eb] object-cover", loaded !== "ok" && "opacity-40")}
          />
        )}
        <input
          ref={field}
          value={value}
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          aria-label={tt("Picture address")}
          aria-invalid={message ? true : undefined}
          placeholder="https://"
          onChange={(event) => setValue(event.target.value)}
          className={cn(
            "block min-w-0 flex-1 rounded-lg border border-[#e5e7eb] bg-white px-2.5 text-[#1a1a2e] outline-none placeholder:text-[#6b7280]/70 focus:border-[#1a1a2e]/30",
            /* 16px on a phone: smaller, and iOS zooms the page to the field. */
            phone ? "h-10 text-[16px]" : "h-8 text-[12.5px]",
          )}
        />
        <button
          type="submit"
          data-ask-image-use=""
          disabled={!usable}
          className={cn("shrink-0 rounded-full bg-[#1a1a2e] px-3 text-[12.5px] font-medium text-white disabled:opacity-40", phone ? "h-10" : "h-8")}
        >
          {tt("Use it")}
        </button>
      </div>
      {message && (
        <p data-ask-image-url-problem="" role="alert" className="mt-1.5 text-[12px] leading-snug text-[#b45309]">
          {message}
        </p>
      )}
    </form>
  )
}

/**
 * THE SCOPE OF THE EDIT, where you are about to type it. On by default when
 * a section is selected, because that is what selecting one means: "Editing:
 * Pricing" says the next message changes that section (its settings, its
 * blocks, or its code) and nothing else. The x clears it to edit the whole
 * page; one press puts it back.
 */
/** Round 69: what Enter will do, when it is not a plain edit, and the taps beside it. */
export interface ScopeAim {
  kind: "edit" | "new" | "replace"
  /** "below Hero", "at the top of the page". */
  place?: string
  /** Flips the place: above and below the open section, or the two ends of the page. */
  onPlace?: () => void
  /** The other reading, in words: "New section instead", "Edit Hero instead". */
  switchLabel?: string
  onSwitch?: () => void
}

/** The quiet word beside the chip that switches what Enter does. */
function SwitchWord({ label, onClick, phone, kind }: { label: string; onClick: () => void; phone: boolean; kind: string }) {
  return (
    <button
      type="button"
      data-ask-aim-switch={kind}
      onClick={onClick}
      className={cn(
        "relative shrink-0 whitespace-nowrap rounded-full px-1 text-[12px] font-medium text-[#6b7280] transition-colors hover:text-[#1a1a2e]",
        phone ? "h-9 after:absolute after:-inset-y-1 after:inset-x-0 after:content-['']" : "h-7",
      )}
    >
      {label}
    </button>
  )
}

export function ScopeChip({
  name,
  locked,
  onLock,
  onUnlock,
  phone,
  aim,
}: {
  name: string
  locked: boolean
  onLock: () => void
  onUnlock: () => void
  phone: boolean
  aim?: ScopeAim | null
}) {
  /*
    A NEW SECTION, OR THE OPEN ONE REPLACED. Solid rather than dashed, because it is what Enter does, and the place is
    the part that can be pressed: "below Hero" flips to "above Hero".
  */
  if (aim && aim.kind !== "edit") {
    const lead = aim.kind === "new" ? tt("New section") : tt("Replacing:")
    return (
      <>
        <span
          data-ask-scope={aim.kind}
          className={cn(
            "inline-flex min-w-0 items-center gap-1 rounded-full border border-[#1a1a2e]/12 bg-[#1a1a2e] pl-2.5 text-[12px] text-white",
            aim.onPlace ? "pr-1" : "pr-2.5",
            phone ? "h-9" : "h-7",
          )}
        >
          <span className="min-w-0 truncate">
            <span className="font-medium">{lead}</span> {aim.kind === "new" ? (aim.place ?? "") : name}
          </span>
          {aim.onPlace && (
            <button
              type="button"
              data-ask-aim-place=""
              onClick={aim.onPlace}
              aria-label={tt("Move where it goes")}
              title={tt("Move where it goes")}
              className="relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white/70 transition-colors after:absolute after:-inset-3 after:content-[''] hover:bg-white/10 hover:text-white"
            >
              <ArrowUpDown className="h-3 w-3" strokeWidth={2.25} />
            </button>
          )}
        </span>
        {aim.switchLabel && aim.onSwitch && <SwitchWord label={aim.switchLabel} onClick={aim.onSwitch} phone={phone} kind="edit" />}
      </>
    )
  }
  if (locked) {
    return (
      <>
        <span
          data-ask-scope="locked"
          title={tt("Only {name} will change", { name })}
          className={cn(
            "inline-flex min-w-0 items-center gap-1 rounded-full border border-[#1a1a2e]/12 bg-white pl-2.5 pr-1 text-[12px] text-[#1a1a2e]",
            phone ? "h-9" : "h-7",
          )}
        >
          <span className="min-w-0 truncate">
            <span className="text-[#6b7280]">{tt("Editing:")}</span> {name}
          </span>
          <button
            type="button"
            onClick={onUnlock}
            aria-label={tt("Stop editing only {name}", { name })}
            title={tt("Edit the whole page instead")}
            className="relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[#6b7280] transition-colors after:absolute after:-inset-3 after:content-[''] hover:bg-black/[0.06] hover:text-[#1a1a2e]"
          >
            <X className="h-3 w-3" strokeWidth={2.25} />
          </button>
        </span>
        {aim?.switchLabel && aim.onSwitch && <SwitchWord label={aim.switchLabel} onClick={aim.onSwitch} phone={phone} kind="new" />}
      </>
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
      <span className="min-w-0 truncate">{tt("Limit to {name}", { name })}</span>
    </button>
  )
}
