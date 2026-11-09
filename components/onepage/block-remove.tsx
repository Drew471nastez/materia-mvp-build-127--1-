"use client"

/**
 * ===========================================================================
 *  A BLOCK'S MORE MENU: MOVE IT, OR TAKE IT OFF THE PAGE
 * ===========================================================================
 * Round 40, the owner: "The delete, remove this block, archive buttons: more
 * Storelib UI, smoother. I like them, make them a little better."
 *
 * Round 41: a block inside a group has the same actions. Its first choice is
 * Move out (back on the page, under the group) instead of Archive, through
 * `keep`; Delete takes it out of the group for good.
 *
 * Round AL had the move pair and Remove at the foot of an open block ("not
 * have to scroll down to understand where the remove button is"); round AN
 * moved them to the first line of an open block, over its Settings | Layout
 * tabs. The owner, round AO: "don't position the remove button thing above
 * the settings and layouts buttons in the blocks".
 *
 * ROUND AO, THE ROW'S MORE BUTTON. The actions live in the block's own row,
 * beside its switch, as one "more" button that opens Storelib's action list
 * (components/ui/responsive-action-menu: a menu on a computer, the shared
 * sheet on a phone):
 *
 *   Move up, Move down     disabled at the ends, never hidden
 *   Move out of group      a group's block only
 *   Remove                 in red, last, after a hairline
 *
 * The row is there whether the block is open or closed, so the menu is found
 * at once and never needs a scroll. Remove opens the same question as before
 * (BlockRemoveQuestion) right under the row: Cancel, Archive (or Move out)
 * and Delete, each a 32px key, Escape cancelling. An open block's settings
 * start with its Settings | Layout tabs and nothing above them.
 */
import * as React from "react"
import { Archive, ArrowUpRight, ChevronDown, ChevronUp, MoreHorizontal, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { hapticTap } from "@/lib/native-bridge"
import { Reveal } from "@/components/onepage/reveal"
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"

const focusRing = "outline-none focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_4px_rgba(26,26,46,0.45)]"

/** A key in the remove question: 32px, tight. */
const confirmKey = cn(
  "inline-flex h-8 items-center gap-1.5 rounded-[9px] px-2.5 text-[13px] font-medium transition-[background-color,color] duration-150 [-webkit-tap-highlight-color:transparent]",
  focusRing,
)

/**
 * The "more" button in a block's row and its menu. `onAskRemove` opens the
 * question under the row (BlockRemoveQuestion); the parent holds that state
 * because the question is drawn under the row, not inside the button.
 */
export const BlockRowMenu = React.forwardRef<HTMLButtonElement, {
  /** The block's name, for the button's label and the phone sheet's title. */
  name: string
  isFirst: boolean
  isLast: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  onAskRemove: () => void
  /** A group's block: Move out of group, beside the moves. */
  onMoveOut?: () => void
  /** Smaller, for a group's rows. */
  compact?: boolean
}>(function BlockRowMenu({ name, isFirst, isLast, onMoveUp, onMoveDown, onAskRemove, onMoveOut, compact }, ref) {
  /* The handlers change on every render of the list; the menu's rows are built from the latest through a ref. */
  const live = React.useRef({ onMoveUp, onMoveDown, onAskRemove, onMoveOut })
  live.current = { onMoveUp, onMoveDown, onAskRemove, onMoveOut }
  const hasMoveOut = !!onMoveOut
  const items = React.useMemo<ActionMenuItem[]>(() => {
    const list: ActionMenuItem[] = [
      { id: "block-move-up", label: tt("Move up"), icon: <ChevronUp aria-hidden strokeWidth={2} />, disabled: isFirst, onClick: () => live.current.onMoveUp() },
      { id: "block-move-down", label: tt("Move down"), icon: <ChevronDown aria-hidden strokeWidth={2} />, disabled: isLast, onClick: () => live.current.onMoveDown() },
    ]
    if (hasMoveOut) list.push({ id: "block-move-out", label: tt("Move out of group"), icon: <ArrowUpRight aria-hidden strokeWidth={1.8} />, onClick: () => live.current.onMoveOut?.() })
    list.push({ id: "block-remove", label: tt("Remove"), icon: <Trash2 aria-hidden strokeWidth={1.8} />, variant: "destructive", separatorBefore: true, onClick: () => live.current.onAskRemove() })
    return list
  }, [isFirst, isLast, hasMoveOut])

  return (
    <ResponsiveActionMenu
      title={name}
      items={items}
      menuWidth="w-48"
      trigger={
        <button
          ref={ref}
          type="button"
          data-block-menu=""
          aria-label={tt("More actions for {name}", { name })}
          title={tt("More")}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "grid shrink-0 place-items-center rounded-lg text-[#6b7280] transition-colors duration-150 hover:bg-[#f1f2f4] hover:text-[#1a1a2e] data-[state=open]:bg-[#f1f2f4] data-[state=open]:text-[#1a1a2e] [-webkit-tap-highlight-color:transparent]",
            compact ? "h-7 w-7" : "h-8 w-8",
            focusRing,
          )}
        >
          <MoreHorizontal aria-hidden className={compact ? "h-4 w-4" : "h-[18px] w-[18px]"} strokeWidth={2} />
        </button>
      }
    />
  )
})

/**
 * The question Remove asks, opening under the block's row to its own height
 * (./reveal), focus on the first choice.
 */
export function BlockRemoveQuestion({
  open,
  onCancel,
  question,
  canArchive = true,
  onRemove,
  onArchive,
  keep,
  returnFocus,
  className,
}: {
  open: boolean
  onCancel: () => void
  /** "Remove this block?", or what a group's removal means for its blocks. */
  question: string
  canArchive?: boolean
  onRemove: () => void
  onArchive?: () => void
  /** Round 41: the first choice when it is not Archive (a group's block: Move out). */
  keep?: { label: string; line: string; onPick: () => void }
  /** Where focus goes when the question closes: the row's more button. */
  returnFocus?: React.RefObject<HTMLElement | null>
  className?: string
}) {
  const firstChoiceRef = React.useRef<HTMLButtonElement>(null)
  const panelId = React.useId()

  React.useEffect(() => {
    if (!open) return
    /* After the menu has let go of the focus and the box has started to open, so the ring lands on something drawn. */
    const t = window.setTimeout(() => firstChoiceRef.current?.focus({ preventScroll: true }), 120)
    return () => window.clearTimeout(t)
  }, [open])

  const archive = onArchive && canArchive && !keep
  const first = !!archive || !!keep

  return (
    <Reveal open={open} id={panelId} returnFocus={returnFocus}>
      <div
        className={cn("px-3 pb-3", className)}
        data-block-remove-question=""
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation()
            onCancel()
          }
        }}
      >
        {/*
          Round 43, the owner: "the Remove, Archive and Delete buttons are too
          fat". The question and its answers are one compact line, the way a
          confirm reads in the rest of /app: the question, then three 32px
          keys. The line each card carried is the key's title.
        */}
        <div
          role="group"
          aria-label={question}
          className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-[#fafafb] px-3 py-2 shadow-[0_0_0_1px_#ececf1]"
          data-delete-question=""
        >
          <p className="mr-auto min-w-0 text-[13px] font-medium leading-[1.35] text-[#1a1a2e]">{question}</p>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={onCancel}
              data-block-remove-cancel=""
              className={cn(confirmKey, "text-[#6b7280] hover:bg-[#f1f2f4] hover:text-[#1a1a2e]")}
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
                  onCancel()
                  onArchive?.()
                }}
                className={cn(confirmKey, "bg-white text-[#1a1a2e] shadow-[0_0_0_1px_#e5e7eb] hover:bg-[#f4f4f6] active:bg-[#ececf0]")}
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
                  onCancel()
                  keep.onPick()
                }}
                className={cn(confirmKey, "bg-white text-[#1a1a2e] shadow-[0_0_0_1px_#e5e7eb] hover:bg-[#f4f4f6] active:bg-[#ececf0]")}
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
                onCancel()
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
  )
}
