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
 *   THE CHOICES  two cards side by side, each a name and one short line:
 *                Archive (it can come back, from the Archive at the top of
 *                the list) and Delete (for good, in red). Cancel under them,
 *                and Escape does the same.
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
            "inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-[13.5px] font-medium transition-[background-color,color] duration-150 [-webkit-tap-highlight-color:transparent]",
            asking ? "bg-[#fef3f2] text-[#b42318]" : "text-[#4b5563] hover:bg-[#fef3f2] hover:text-[#b42318] active:bg-[#fef3f2] active:text-[#b42318]",
            focusRing,
          )}
        >
          <Trash2 aria-hidden className="h-4 w-4" strokeWidth={1.8} />
          {tt("Remove")}
        </button>
      </div>

      <Reveal open={asking} id={panelId} returnFocus={removeRef}>
        <div
          className="pt-3"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation()
              cancel()
            }
          }}
        >
          <div role="group" aria-label={question} className="rounded-2xl border border-[#ececf1] bg-white p-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)]" data-delete-question="">
            <p className="px-0.5 pb-2.5 text-[13.5px] font-medium text-[#1a1a2e]">{question}</p>
            <div className={cn("grid gap-2", first ? "grid-cols-2" : "grid-cols-1")}>
              {archive ? (
                <button
                  ref={firstChoiceRef}
                  type="button"
                  data-block-archive=""
                  onClick={() => {
                    hapticTap("light")
                    setAsking(false)
                    onArchive?.()
                  }}
                  className={cn(
                    "flex min-h-[64px] flex-col items-start justify-center gap-0.5 rounded-xl bg-[#f6f6f7] px-3 py-2.5 text-left transition-[background-color,box-shadow] duration-150 [-webkit-tap-highlight-color:transparent]",
                    "hover:bg-[#efeff2] active:bg-[#e9e9ed]",
                    focusRing,
                  )}
                >
                  <span className="flex items-center gap-1.5 text-[14px] font-semibold text-[#1a1a2e]">
                    <Archive aria-hidden className="h-4 w-4" strokeWidth={1.8} />
                    {tt("Archive")}
                  </span>
                  <span className="text-[12.5px] leading-[1.35] text-[#6b7280]">{tt("Off the page, back any time")}</span>
                </button>
              ) : keep ? (
                <button
                  ref={firstChoiceRef}
                  type="button"
                  data-block-keep=""
                  onClick={() => {
                    hapticTap("light")
                    setAsking(false)
                    keep.onPick()
                  }}
                  className={cn(
                    "flex min-h-[64px] flex-col items-start justify-center gap-0.5 rounded-xl bg-[#f6f6f7] px-3 py-2.5 text-left transition-[background-color,box-shadow] duration-150 [-webkit-tap-highlight-color:transparent]",
                    "hover:bg-[#efeff2] active:bg-[#e9e9ed]",
                    focusRing,
                  )}
                >
                  <span className="flex items-center gap-1.5 text-[14px] font-semibold text-[#1a1a2e]">
                    <ArrowUpRight aria-hidden className="h-4 w-4" strokeWidth={1.8} />
                    {keep.label}
                  </span>
                  <span className="text-[12.5px] leading-[1.35] text-[#6b7280]">{keep.line}</span>
                </button>
              ) : null}
              <button
                ref={first ? undefined : firstChoiceRef}
                type="button"
                data-block-delete=""
                onClick={() => {
                  hapticTap("medium")
                  setAsking(false)
                  onRemove()
                }}
                className={cn(
                  "flex min-h-[64px] flex-col items-start justify-center gap-0.5 rounded-xl bg-[#fef3f2] px-3 py-2.5 text-left transition-[background-color] duration-150 [-webkit-tap-highlight-color:transparent]",
                  "hover:bg-[#fde8e6] active:bg-[#fcdcd9]",
                  focusRing,
                )}
              >
                <span className="flex items-center gap-1.5 text-[14px] font-semibold text-[#b42318]">
                  <Trash2 aria-hidden className="h-4 w-4" strokeWidth={1.8} />
                  {tt("Delete")}
                </span>
                <span className="text-[12.5px] leading-[1.35] text-[#9f3a2f]">{tt("Gone for good")}</span>
              </button>
            </div>
            <button
              type="button"
              onClick={cancel}
              data-block-remove-cancel=""
              className={cn("mt-2 h-9 w-full rounded-xl text-[13.5px] font-medium text-[#6b7280] transition-colors duration-150 hover:bg-[#f6f6f7] hover:text-[#1a1a2e]", focusRing)}
            >
              {tt("Cancel")}
            </button>
          </div>
        </div>
      </Reveal>
    </div>
  )
}
