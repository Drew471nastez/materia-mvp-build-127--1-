"use client"

/**
 * ===========================================================================
 *  THE LIBRARY IS FULL: SAY SO, AND SAY WHAT TO DO
 * ===========================================================================
 * With three websites in the library, Import did nothing at all: the button
 * was disabled, and a disabled button takes no click, so the one message
 * written for this case (a toast) could never be shown. Add and Duplicate
 * showed that toast, which appears for four seconds in a corner and names a
 * rule without a way out.
 *
 * Every way into the library now opens this instead, with the same words:
 * what the rule is, which websites are taking the room, and a Remove beside
 * each draft (the live one is not offered; take it offline first). Removing
 * goes through the page's own confirmation, so nothing is deleted from here
 * without the usual question.
 */
import * as React from "react"
import { Trash2 } from "lucide-react"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { THEME_INSTALL_LIMIT } from "@/lib/website-builder/theme-registry"

export type LibraryAction = "import" | "add" | "duplicate"

const VERB: Record<LibraryAction, string> = {
  import: "import another theme",
  add: "add another theme",
  duplicate: "make a copy",
}

export interface LibraryEntry {
  id: string
  name: string
  live: boolean
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
  return (
    <AlertDialog open={action !== null} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent className="max-w-[440px] gap-0 overflow-hidden rounded-2xl p-0" data-library-full="">
        <AlertDialogHeader className="space-y-1.5 px-5 pb-4 pt-5 text-left">
          <AlertDialogTitle className="text-[17px] font-semibold text-[#1a1a2e]">Your library is full</AlertDialogTitle>
          <AlertDialogDescription className="text-[13.5px] leading-relaxed text-[#6b7280]">
            You can keep {THEME_INSTALL_LIMIT} websites: one live and {THEME_INSTALL_LIMIT - 1} drafts. Remove a draft to {action ? VERB[action] : "add another"}.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="mx-5 mb-5 divide-y divide-[#eceef1] overflow-hidden rounded-xl border border-[#e5e7eb] bg-[#fafbfb]">
          {entries.map((e) => (
            <li key={e.id} className="flex min-h-[48px] items-center justify-between gap-3 px-3.5 py-2">
              <span className="min-w-0">
                <span className="block truncate text-[13.5px] font-medium text-[#1a1a2e]">{e.name}</span>
                <span className="block text-[12px] text-[#6b7280]">{e.live ? "Live" : "Draft"}</span>
              </span>
              {!e.live && onRemove ? (
                <button
                  type="button"
                  onClick={() => onRemove(e.id)}
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-[#e5e7eb] bg-white px-2.5 text-[12.5px] font-medium text-[#b42318] shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-colors hover:bg-[#fef3f2]"
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.9} />
                  Remove
                </button>
              ) : null}
            </li>
          ))}
        </ul>
        <AlertDialogFooter className="border-t border-[#eceef1] bg-[#fafbfb] px-5 py-3">
          <AlertDialogCancel className="h-9 rounded-lg">Close</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
