"use client"

/**
 * ===========================================================================
 *  THE LAYOUT AN EMAIL IS ON: ONE LINE, AND ONE PICKER
 * ===========================================================================
 * "The user can start from templates, switch templates, edit templates, and
 * revert to not using a template, all clean and simple."
 *
 * THE LINE sits right above the email, once there is something in it: which
 * layout it is on ("Newsletter", or "None"), "edited" once the words are no
 * longer the layout's own, and two plain buttons. Change opens the picker;
 * Remove takes the layout out and leaves a blank email. Editing needs no
 * button at all: the layout is the email's own blocks, written over in
 * place like anything else.
 *
 * THE PICKER is the composer's dialog (./ui.tsx ComposeDialog: a card on a
 * computer, the shared sheet on a phone) with the layouts in it, Blank first
 * and the current one ticked. A choice that would throw away words somebody
 * wrote asks first, in the same dialog, so nothing stacks; a choice that
 * would not (an email still exactly as its layout wrote it, or an empty one)
 * just happens.
 *
 * What changing does to the email is lib/email-campaigns/layouts.ts.
 */
import * as React from "react"
import { cn } from "@/lib/utils"
import type { StarterId } from "@/lib/email-campaigns/starters"
import { layoutName } from "@/lib/email-campaigns/layouts"
import { ComposeDialog, buttonAccent, buttonSecondary } from "./ui"
import { StarterList, type LayoutChoice } from "./starter-list"

const quiet =
  "inline-flex h-10 shrink-0 cursor-pointer select-none items-center rounded-lg px-2.5 text-[14px] font-medium text-[#1a1a2e] transition-colors duration-100 hover:bg-[#eceef1] active:bg-[#e4e6ea] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1a1a2e] sm:h-8 sm:text-[13px] [-webkit-tap-highlight-color:transparent]"

export function LayoutBar({ layout, edited, onChange, onRemove, className }: { layout: StarterId | null; edited: boolean; onChange: () => void; onRemove: () => void; className?: string }) {
  return (
    <div data-layout-bar="" className={cn("flex min-h-10 min-w-0 items-center gap-2 pl-1", className)}>
      <p className="flex min-w-0 flex-1 items-baseline gap-1.5 text-[14px] sm:text-[13px]">
        <span className="shrink-0 text-[#6b7280]">Layout</span>
        <span data-layout-name="" className="min-w-0 truncate font-semibold text-[#1a1a2e]">
          {layout ? layoutName(layout) : "None"}
        </span>
        {layout && edited ? <span className="shrink-0 text-[13px] text-[#6b7280] sm:text-[12px]">edited</span> : null}
      </p>
      <div className="-mr-1 flex shrink-0 items-center">
        <button type="button" className={quiet} onClick={onChange} data-layout-change="">
          {layout ? "Change" : "Choose"}
        </button>
        {layout ? (
          <button type="button" className={quiet} onClick={onRemove} data-layout-remove="" aria-label="Remove the layout and start from blank">
            Remove
          </button>
        ) : null}
      </div>
    </div>
  )
}

export type LayoutDialogState = null | { mode: "pick" } | { mode: "confirm"; choice: LayoutChoice }

export function LayoutDialog({
  state,
  current,
  onClose,
  onChoose,
  onApply,
}: {
  state: LayoutDialogState
  /** What the email is on now: a layout, or "blank" for none. */
  current: LayoutChoice
  onClose: () => void
  /** A row was tapped: the composer applies it, or asks first by setting the state to confirm. */
  onChoose: (choice: LayoutChoice) => void
  /** Yes, replace it. */
  onApply: (choice: LayoutChoice) => void
}) {
  /* The last state stays drawn while the dialog closes, so its words do not change on the way out. */
  const [shown, setShown] = React.useState<Exclude<LayoutDialogState, null>>({ mode: "pick" })
  React.useEffect(() => {
    if (state) setShown(state)
  }, [state])
  const confirming = shown.mode === "confirm"
  const choice = confirming ? shown.choice : null
  const title = !confirming ? "Layout" : choice === "blank" ? "Start from blank?" : `Use the ${layoutName(choice as StarterId)} layout?`
  return (
    <ComposeDialog
      open={state !== null}
      onClose={onClose}
      title={title}
      description={confirming ? "What you wrote in this email is replaced." : "Choose a layout for this email, or Blank for none."}
      footer={
        confirming ? (
          <>
            <button type="button" className={buttonSecondary} onClick={onClose}>
              Keep my email
            </button>
            <button type="button" className={buttonAccent} onClick={() => choice && onApply(choice)} data-layout-confirm="">
              {choice === "blank" ? "Clear it" : "Replace it"}
            </button>
          </>
        ) : undefined
      }
    >
      {confirming ? (
        <p className="text-[14px] leading-[21px] text-[#1a1a2e]">
          {choice === "blank"
            ? "Everything in the email goes and it starts empty. A subject or preview text you typed yourself stays."
            : "What is in the email now is replaced with the layout. A subject or preview text you typed yourself stays."}
        </p>
      ) : (
        <StarterList bare withBlank current={current} onPick={onChoose} className="-mx-5 -my-2 sm:-my-4" />
      )}
    </ComposeDialog>
  )
}
