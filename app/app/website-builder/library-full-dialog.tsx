"use client"

/**
 * ===========================================================================
 *  THE LIBRARY IS FULL: SAY SO, AND SAY WHAT TO DO
 * ===========================================================================
 * Every way into a full library (Import, Add theme, Duplicate) opens this,
 * with the same words: the rule, which websites are taking the room, and a
 * Remove beside each draft. The live one is not offered; take it offline
 * first. Removing goes through the page's own confirmation, so nothing is
 * deleted from here without the usual question.
 *
 * On a phone it is the app's shared bottom sheet, so it rises, drags and
 * closes like every other sheet; from 640px up it is a compact modal. Both
 * draw the same content in the Polaris shape: a title, one sentence, the
 * websites as a plain list with a small status badge, and one Close.
 *
 * It was a centred modal on a phone, with the list boxed inside the box and
 * each Remove a bordered red button with an icon. Remove is a plain red word
 * now, which is how Polaris draws a destructive action in a list.
 */
import * as React from "react"
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { DRAFT_LIMIT } from "@/lib/website-builder/library-limit"
import { cn } from "@/lib/utils"
import { tt, msg } from "@/lib/i18n/text"

export type LibraryAction = "import" | "add" | "duplicate"

const VERB: Record<LibraryAction, string> = {
  get import() { return tt("import another theme") },
  get add() { return tt("add another theme") },
  get duplicate() { return tt("make a copy") },
}

export const LIBRARY_FULL_TITLE = msg("Your library is full")

/** The one sentence under the title, from the limit rather than written out. */
export function libraryFullSentence(action: LibraryAction | null): string {
  const drafts = `${DRAFT_LIMIT} ${DRAFT_LIMIT === 1 ? "draft" : "drafts"}`
  return tt("You can keep one live website and {drafts}, so remove a draft to {value}.", { drafts, value: action ? VERB[action] : tt("add another") })
}

export interface LibraryEntry {
  id: string
  name: string
  live: boolean
  /** The website that was live, when nothing is now. */
  offline?: boolean
}

/** The same breakpoint the action menus use, and the one the sheet hides itself from. */
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

/** A Polaris tone badge: a word on a tint, 20px high. */
function StatusBadge({ live, offline }: { live: boolean; offline?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-md px-1.5 text-[12px] font-medium",
        live ? "bg-[#cdfee1] text-[#0c5132]" : offline ? "bg-[#ffef9d] text-[#4f4700]" : "bg-[#f1f2f4] text-[#3f3f46]",
      )}
    >
      {live ? tt("Live") : offline ? tt("Offline") : tt("Draft")}
    </span>
  )
}

function EntryList({ entries, onRemove }: { entries: LibraryEntry[]; onRemove?: (id: string) => void }) {
  return (
    <ul data-library-list="" className="divide-y divide-[#eceef1] border-y border-[#eceef1]">
      {entries.map((e) => (
        <li key={e.id} className="flex min-h-[52px] items-center gap-3 px-5 py-1.5 sm:min-h-[44px] sm:py-1">
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <span className="truncate text-[14px] font-medium text-[#1a1a2e]">{e.name}</span>
            <StatusBadge live={e.live} offline={e.offline} />
          </span>
          {!e.live && onRemove ? (
            <button
              type="button"
              onClick={() => onRemove(e.id)}
              aria-label={tt("Remove {name}", { name: e.name })}
              className="-mr-2 inline-flex h-11 shrink-0 items-center rounded-lg px-2 text-[14px] font-medium text-[#c4290c] outline-none transition-colors duration-150 hover:bg-[#fef1ee] focus-visible:ring-2 focus-visible:ring-[#c4290c]/25 active:bg-[#fde4df] sm:h-8 sm:text-[13px]"
            >
              {tt("Remove")}
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

export function LibraryFullDialog({
  action,
  entries,
  onClose,
  onRemove,
}: {
  /** Null while closed. */
  action: LibraryAction | null
  entries: LibraryEntry[]
  onClose: () => void
  /** Absent where removing is not possible from this page. */
  onRemove?: (id: string) => void
}) {
  const phone = usePhone()
  const open = action !== null
  /* The words stay as they were while it closes, rather than changing under the fade. */
  const [shown, setShown] = React.useState<LibraryAction | null>(action)
  if (action !== null && action !== shown) setShown(action)
  const sentence = libraryFullSentence(action ?? shown)

  if (phone) {
    return (
      <BottomSheet
        isOpen={open}
        onClose={onClose}
        label={tt(LIBRARY_FULL_TITLE)}
        header={
          <div className="px-5 pb-4 pt-3">
            <h2 className="text-[17px] font-semibold text-[#1a1a2e]">{tt(LIBRARY_FULL_TITLE)}</h2>
            <p className="mt-1 text-[14px] leading-[1.45] text-[#6b7280]">{sentence}</p>
          </div>
        }
      >
        <div data-library-full="" data-surface="sheet">
          <EntryList entries={entries} onRemove={onRemove} />
          <div className="px-5 pb-1 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-12 w-full items-center justify-center rounded-xl border border-[#e5e7eb] bg-white text-[15px] font-semibold text-[#1a1a2e] shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors duration-150 active:bg-[#f3f4f6]"
            >
              {tt("Close")}
            </button>
          </div>
        </div>
      </BottomSheet>
    )
  }

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent
        data-library-full=""
        data-surface="modal"
        className="block max-w-[calc(100%-2rem)] gap-0 overflow-hidden rounded-2xl border-[#e5e7eb] p-0 shadow-[0_20px_48px_-16px_rgba(17,24,39,0.28),0_2px_6px_rgba(17,24,39,0.06)] sm:max-w-[440px]"
      >
        <div className="px-5 pb-4 pt-5">
          <AlertDialogTitle className="text-[16px] font-semibold text-[#1a1a2e]">{tt(LIBRARY_FULL_TITLE)}</AlertDialogTitle>
          <AlertDialogDescription className="mt-1 text-[13.5px] leading-[1.5] text-[#6b7280]">{sentence}</AlertDialogDescription>
        </div>
        <EntryList entries={entries} onRemove={onRemove} />
        <div className="flex justify-end px-5 py-3">
          <AlertDialogCancel className="mt-0 h-9 rounded-lg border-[#e5e7eb] px-3.5 text-[13px] font-semibold text-[#1a1a2e] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            {tt("Close")}
          </AlertDialogCancel>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  )
}
