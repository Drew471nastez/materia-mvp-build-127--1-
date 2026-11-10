"use client"

/**
 * ===========================================================================
 *  ADD CONTACT (wave 9)
 * ===========================================================================
 * One clean sheet: Email (the only thing needed), then Name, Phone, Tags and
 * Notes, each marked optional. Nothing is sent until the address is one; a
 * wrong address or phone is said under its own field, in words. While the
 * address is typed the store's people are searched for it, and a person
 * already there is named with a link to open them (adding again only adds
 * the tags and notes, nothing is lost). Add contact closes the sheet at once:
 * the list shows the person straight away (people-client) and the sheet
 * comes back, as it was, with the reason, only if the save fails.
 *
 * On a phone it is the shared bottom sheet (components/ui/sheet-dialog):
 * 44px fields at 16px, so iOS does not zoom, and the two buttons across.
 */
import * as React from "react"
import Link from "next/link"
import { SheetDialog, SheetDialogTitle } from "@/components/ui/sheet-dialog"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import type { PersonRow } from "@/lib/contacts/identity"
import { buttonAccent, buttonSecondary } from "../orders/order-parts"
import { whoOf } from "./contact-words"
import { checkDraft, draftEmail, type AddDraft, type DraftProblem } from "./add-contact-logic"

export const ADD_FIELD =
  "h-9 w-full rounded-lg border border-[#e3e4e8] bg-white px-2.5 text-[14px] text-[#1a1a2e] outline-none transition-[border-color,box-shadow] duration-100 placeholder:text-[#9ca3af] focus:border-[#1a1a2e]/40 focus:ring-2 focus:ring-[#1a1a2e]/10 max-sm:h-11 max-sm:rounded-xl max-sm:px-3 max-sm:text-[16px] aria-[invalid=true]:border-[#d92d20] aria-[invalid=true]:focus:ring-[#d92d20]/15"
const LABEL = "mb-1 flex items-baseline justify-between gap-2 text-[12px] font-medium text-[#4b5563] max-sm:text-[13px]"
const OPTIONAL = "text-[11px] font-normal text-[#9ca3af] max-sm:text-[12px]"

function problemText(p: DraftProblem): string {
  if (p.code === "email_missing") return tt("Enter their email address.")
  if (p.code === "email_invalid") return tt("Enter a valid email address.")
  return tt("Enter a phone number with digits, spaces, + ( ) or -.")
}

export function AddContactSheet({
  open,
  phone,
  marketing,
  draft,
  onDraft,
  error,
  lookup,
  onClose,
  onSubmit,
}: {
  open: boolean
  phone: boolean
  marketing: boolean
  /** What is typed, kept by the list so a failed save reopens the sheet as it was. */
  draft: AddDraft
  onDraft: (d: AddDraft) => void
  /** Why the last save did not go through, shown at the foot. */
  error: string | null
  /** The person in the store with this address, if any. */
  lookup: (email: string) => Promise<PersonRow | null>
  onClose: () => void
  onSubmit: (d: AddDraft, existing: PersonRow | null) => void
}) {
  const [problems, setProblems] = React.useState<DraftProblem[]>([])
  const [existing, setExisting] = React.useState<PersonRow | null>(null)
  const emailRef = React.useRef<HTMLInputElement>(null)
  const phoneRef = React.useRef<HTMLInputElement>(null)
  const set = (patch: Partial<AddDraft>) => {
    onDraft({ ...draft, ...patch })
    /* A field's message goes as soon as the field is changed. */
    if (problems.length) setProblems((ps) => ps.filter((p) => !(p.field in patch)))
  }
  React.useEffect(() => {
    if (open) setProblems([])
  }, [open])

  /* Already in the store? Asked a moment after the last key, only for a whole address. */
  const email = draftEmail(draft.email)
  React.useEffect(() => {
    if (!open || !email) return setExisting(null)
    let live = true
    const t = window.setTimeout(() => {
      void lookup(email).then((p) => live && setExisting(p))
    }, 250)
    return () => {
      live = false
      window.clearTimeout(t)
    }
  }, [open, email, lookup])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const found = checkDraft(draft)
    setProblems(found)
    if (found.length) {
      ;(found[0].field === "email" ? emailRef : phoneRef).current?.focus()
      return
    }
    onSubmit(draft, existing && (existing.email ?? "").toLowerCase() === email ? existing : null)
  }
  const problemOf = (f: DraftProblem["field"]) => problems.find((p) => p.field === f)
  const emailProblem = problemOf("email")
  const phoneProblem = problemOf("phone")

  return (
    <SheetDialog open={open} onClose={onClose} phone={phone} label={tt("Add contact")} className="p-0 sm:max-w-[460px]" dialog={{ "aria-describedby": undefined }}>
      <form onSubmit={submit} noValidate className="flex max-h-full min-h-0 flex-col" data-add-contact-form="">
        <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto px-5 pb-2 pt-5 max-sm:px-4 max-sm:pt-1">
          <div>
            <SheetDialogTitle className="text-[17px] font-semibold text-[#1a1a2e]">{tt("Add contact")}</SheetDialogTitle>
            <p className="mt-1 text-[13px] text-[#6b7280] max-sm:text-[14px]">{tt("Only an email address is needed. Everything else is optional.")}</p>
          </div>
          <label className="block">
            <span className={LABEL}>{tt("Email")}</span>
            <input
              ref={emailRef}
              type="email"
              inputMode="email"
              autoComplete="off"
              autoFocus={!phone}
              value={draft.email}
              onChange={(e) => set({ email: e.target.value })}
              placeholder="name@example.com"
              aria-invalid={emailProblem ? true : undefined}
              aria-describedby={emailProblem ? "add-email-problem" : existing ? "add-email-existing" : undefined}
              className={ADD_FIELD}
              data-add-email=""
            />
            {emailProblem ? (
              <span id="add-email-problem" className="mt-1 block text-[12px] text-[#b42318] max-sm:text-[13px]" role="alert" data-add-problem="email">
                {problemText(emailProblem)}
              </span>
            ) : null}
          </label>
          {existing && !emailProblem ? (
            <div id="add-email-existing" className="flex items-start justify-between gap-3 rounded-xl bg-[#fff8e6] px-3 py-2.5 text-[13px] text-[#5c4300]" role="status" data-add-existing={existing.id}>
              <span className="min-w-0">{tt("{name} is already in your contacts. Adding them again keeps everything and adds the tags and notes below.", { name: whoOf(existing) })}</span>
              <Link href={`/app/contacts/${existing.id}`} className="shrink-0 font-medium text-[#1a1a2e] underline-offset-2 hover:underline" onClick={onClose}>
                {tt("Open")}
              </Link>
            </div>
          ) : null}
          <label className="block">
            <span className={LABEL}>
              {tt("Name")}
              <span className={OPTIONAL}>{tt("Optional")}</span>
            </span>
            <input value={draft.name} onChange={(e) => set({ name: e.target.value })} maxLength={120} autoComplete="off" className={ADD_FIELD} data-add-name="" />
          </label>
          <label className="block">
            <span className={LABEL}>
              {tt("Phone")}
              <span className={OPTIONAL}>{tt("Optional")}</span>
            </span>
            <input
              ref={phoneRef}
              type="tel"
              inputMode="tel"
              autoComplete="off"
              value={draft.phone}
              onChange={(e) => set({ phone: e.target.value })}
              maxLength={40}
              aria-invalid={phoneProblem ? true : undefined}
              aria-describedby={phoneProblem ? "add-phone-problem" : undefined}
              className={ADD_FIELD}
              data-add-phone=""
            />
            {phoneProblem ? (
              <span id="add-phone-problem" className="mt-1 block text-[12px] text-[#b42318] max-sm:text-[13px]" role="alert" data-add-problem="phone">
                {problemText(phoneProblem)}
              </span>
            ) : null}
          </label>
          <label className="block">
            <span className={LABEL}>
              {tt("Tags")}
              <span className={OPTIONAL}>{tt("Separate with commas")}</span>
            </span>
            <input value={draft.tags} onChange={(e) => set({ tags: e.target.value })} placeholder={tt("VIP, Wholesale")} autoComplete="off" className={ADD_FIELD} data-add-tags="" />
          </label>
          <label className="block">
            <span className={LABEL}>
              {tt("Notes")}
              <span className={OPTIONAL}>{tt("Optional")}</span>
            </span>
            <textarea value={draft.notes} onChange={(e) => set({ notes: e.target.value })} maxLength={5000} rows={3} className={cn(ADD_FIELD, "h-auto resize-none py-2 max-sm:h-auto max-sm:py-2.5")} data-add-notes="" />
          </label>
          {marketing ? (
            <label className="flex cursor-pointer items-start gap-2.5 text-[13px] text-[#1a1a2e] max-sm:text-[14px]">
              <input type="checkbox" checked={draft.agreed} onChange={(e) => set({ agreed: e.target.checked })} className="mt-0.5 h-4 w-4 shrink-0 accent-[#1a1a2e] max-sm:h-5 max-sm:w-5" />
              <span>{tt("They agreed to get my marketing emails. Add them to my email list.")}</span>
            </label>
          ) : null}
          {error ? (
            <p className="rounded-xl bg-[#fef3f2] px-3 py-2.5 text-[13px] text-[#b42318]" role="alert" data-add-error="">
              {error}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t border-[#eef0f2] px-5 py-3 max-sm:border-0 max-sm:px-4 max-sm:pb-4 max-sm:[&>button]:h-11 max-sm:[&>button]:flex-1 max-sm:[&>button]:rounded-xl max-sm:[&>button]:text-[15px]">
          <button type="button" className={buttonSecondary} onClick={onClose}>
            {tt("Cancel")}
          </button>
          <button type="submit" className={buttonAccent} data-add-submit="">
            {tt("Add contact")}
          </button>
        </div>
      </form>
    </SheetDialog>
  )
}
