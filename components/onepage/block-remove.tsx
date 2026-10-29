"use client"

/**
 * ===========================================================================
 *  THE FOOT OF A BLOCK'S SETTINGS: MOVE IT, OR TAKE IT OFF THE PAGE
 * ===========================================================================
 * Round 40, the owner: "The delete, remove this block, archive buttons: more
 * Storelib UI, smoother. I like them, make them a little better."
 *
 * What was there: two bare chevrons, a red Delete, and on a press the row
 * swapped in one frame for a question, a red outline button, an amber one,
 * 10px captions under each and a grey Cancel. Now:
 *
 *   THE ROW      the two moves as one small pair on the left (the same
 *                quiet keys as the rest of the editor), Remove on the right
 *                in the page's ink, red only on a hover or a press.
 *   THE QUESTION opens under the row to its own height (./reveal), the
 *                row stays where it was, and focus goes to the first choice.
 *   THE CHOICES  (round 43: one compact line) the question, then Cancel,
 *                Archive (it can come back, from the Archive at the top of
 *                the list) and Delete (for good, in red), each a 32px key.
 *                Escape cancels too.
 *
 * Round 41: a block inside a group has the same foot. Its first choice is
 * Move out (back on the page, under the group) instead of Archive, through
 * `keep`; Delete takes it out of the group for good.
 */
import * as React from "react"
import { Archive, ArrowUpRight, ChevronDown, ChevronUp, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { hapticTap } from "@/lib/native-bridge"
import { Reveal } from "@/components/onepage/reveal"

const focusRing = "outline-none focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_4px_rgba(26,26,46,0.45)]"
const moveKey = cn(
  "grid h-8 w-9 place-items-center rounded-[9px] text-[#4b5563] transition-[background-color,color,box-shadow] duration-150 [-webkit-tap-highlight-color:transparent]",
  "hover:bg-white hover:text-[#1a1a2e] hover:shadow-[0_1px_2px_rgba(16,24,40,0.08),0_0_0_1px_rgba(16,24,40,0.06)] active:bg-white",
  "disabled:cursor-not-allowed disabled:text-[#c4c8ce] disabled:shadow-none disabled:hover:bg-transparent",
  focusRing,
)

/** A key in the remove question: 32px, the move pair's height, tight. */
const confirmKey = cn(
  "inline-flex h-8 items-center gap-1.5 rounded-[9px] px-2.5 text-[13px] font-medium transition-[background-color,color] duration-150 [-webkit-tap-highlight-color:transparent]",
  focusRing,
)

export function BlockFootActions({
  question,
  canArchive = true,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onRemove,
  onArchive,
  keep,
}: {
  /** "Remove this block?", or what a group's removal means for its blocks. */
  question: string
  canArchive?: boolean
  isFirst: boolean
  isLast: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  onRemove: () => void
  onArchive?: () => void
  /** Round 41: the first choice when it is not Archive (a group's block: Move out). */
  keep?: { label: string; line: string; onPick: () => void }
}) {
  const [asking, setAsking] = React.useState(false)
  const removeRef = React.useRef<HTMLButtonElement>(null)
  const firstChoiceRef = React.useRef<HTMLButtonElement>(null)
  const panelId = React.useId()

  React.useEffect(() => {
    if (!asking) return
    /* After the box has started to open, so the focus ring lands on something already drawn. */
    const t = window.setTimeout(() => firstChoiceRef.current?.focus({ preventScroll: true }), 60)
    return () => window.clearTimeout(t)
  }, [asking])

  const cancel = () => setAsking(false)
  const archive = onArchive && canArchive && !keep
  const first = !!archive || !!keep

  return (
    <div data-block-foot="" className="border-t border-[#eef0f2] pt-3">
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-0.5 rounded-xl bg-[#f4f4f6] p-[3px]" role="group" aria-label={tt("Move")}>
          <button type="button" onClick={onMoveUp} disabled={isFirst} aria-label={tt("Move up")} title={tt("Move up")} className={moveKey} data-block-move="up">
            <ChevronUp aria-hidden className="h-4 w-4" strokeWidth={2} />
          </button>
          <button type="button" onClick={onMoveDown} disabled={isLast} aria-label={tt("Move down")} title={tt("Move down")} className={moveKey} data-block-move="down">
            <ChevronDown aria-hidden className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
        <button
          ref={removeRef}
          type="button"
          onClick={() => setAsking((v) => !v)}
          aria-expanded={asking}
          aria-controls={panelId}
          data-block-remove=""
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-[9px] px-2.5 text-[13px] font-medium transition-[background-color,color] duration-150 [-webkit-tap-highlight-color:transparent]",
            asking ? "bg-[#fef3f2] text-[#b42318]" : "text-[#4b5563] hover:bg-[#fef3f2] hover:text-[#b42318] active:bg-[#fef3f2] active:text-[#b42318]",
            focusRing,
          )}
        >
          <Trash2 aria-hidden className="h-3.5 w-3.5" strokeWidth={1.8} />
          {tt("Remove")}
        </button>
      </div>

      <Reveal open={asking} id={panelId} returnFocus={removeRef}>
        <div
          className="pt-2"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation()
              cancel()
            }
          }}
        >
          {/*
            Round 43, the owner: "the Remove, Archive and Delete buttons are too
            fat". They were two 64px cards with a line under each name and a
            full width Cancel under them. Now the question and its answers are
            one compact line, the way a confirm reads in the rest of /app: the
            question, then three 32px keys. The line each card carried is the
            key's title, so a pointer still tells what Archive means.
          */}
          <div
            role="group"
            aria-label={question}
            className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-white px-3 py-2 shadow-[0_0_0_1px_#ececf1,0_1px_2px_rgba(16,24,40,0.04)]"
            data-delete-question=""
          >
            <p className="mr-auto min-w-0 text-[13px] font-medium leading-[1.35] text-[#1a1a2e]">{question}</p>
            <div className="ml-auto flex items-center gap-1.5">
              <button
                type="button"
                onClick={cancel}
                data-block-remove-cancel=""
                className={cn(confirmKey, "text-[#6b7280] hover:bg-[#f4f4f6] hover:text-[#1a1a2e]")}
              >
                {tt("Cancel")}
              </button>
              {archive ? (
                <button
                  ref={firstChoiceRef}
                  type="button"
                  data-block-archive=""
                  title={tt("Off the page, back any time")}
                  onClick={() => {
                    hapticTap("light")
                    setAsking(false)
                    onArchive?.()
                  }}
                  className={cn(confirmKey, "bg-[#f4f4f6] text-[#1a1a2e] hover:bg-[#ececf0] active:bg-[#e6e6ea]")}
                >
                  <Archive aria-hidden className="h-3.5 w-3.5" strokeWidth={1.8} />
                  {tt("Archive")}
                </button>
              ) : keep ? (
                <button
                  ref={firstChoiceRef}
                  type="button"
                  data-block-keep=""
                  title={keep.line}
                  onClick={() => {
                    hapticTap("light")
                    setAsking(false)
                    keep.onPick()
                  }}
                  className={cn(confirmKey, "bg-[#f4f4f6] text-[#1a1a2e] hover:bg-[#ececf0] active:bg-[#e6e6ea]")}
                >
                  <ArrowUpRight aria-hidden className="h-3.5 w-3.5" strokeWidth={1.8} />
                  {keep.label}
                </button>
              ) : null}
              <button
                ref={first ? undefined : firstChoiceRef}
                type="button"
                data-block-delete=""
                title={tt("Gone for good")}
                onClick={() => {
                  hapticTap("medium")
                  setAsking(false)
                  onRemove()
                }}
                className={cn(confirmKey, "bg-[#fef3f2] text-[#b42318] hover:bg-[#fde8e6] active:bg-[#fcdcd9]")}
              >
                <Trash2 aria-hidden className="h-3.5 w-3.5" strokeWidth={1.8} />
                {tt("Delete")}
              </button>
            </div>
          </div>
        </div>
      </Reveal>
    </div>
  )
}
