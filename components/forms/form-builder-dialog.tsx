"use client"
/**
 * The form builder (./forms-manager FormEditor), opened from a Form block, a
 * button that opens a form, a chat button's questions, and the list in
 * Emails › Leads › Forms, so a form is made and edited where it is used.
 * Loaded on the press that opens it.
 *
 * ROUND AN: one column. On a computer a centred dialog, 640px wide and at
 * most 88% of the window tall, its middle the only part that scrolls (a thin
 * scrollbar); on a phone the shared bottom sheet (components/ui/sheet-dialog
 * over components/ui/bottom-sheet), rising, following the thumb and sitting
 * on the keyboard rather than under it. A press outside never throws work
 * away: Escape, the scrim and a pull down all go through the builder's own
 * Close, which asks when there are changes not saved.
 */
import { useEffect, useRef, useState } from "react"
import { SheetDialog, SheetDialogTitle } from "@/components/ui/sheet-dialog"
import { usePhoneWidth } from "@/components/ui/choice-list"
import { tt } from "@/lib/i18n/text"
import { FormEditor, type SavedForm } from "./forms-manager"
import { FormsNotSetUp, readForms, useFormsList, type FormRow } from "./form-picker"

export default function FormBuilderDialog({
  formId,
  form: given,
  onClose,
  onSaved,
}: {
  formId: string
  /** The form itself, when the caller already holds it (the forms list): no second read. */
  form?: SavedForm
  onClose: () => void
  onSaved: (form: FormRow) => void
}) {
  const phone = usePhoneWidth()
  const { forms, loading, missing, error, retry } = useFormsList(!given)
  const form = given ?? (forms.find((f) => f.id === formId) as SavedForm | undefined)
  /* A form made a moment ago elsewhere: the list is read again, once, to find it; then it is said to be gone, never a wait. */
  const [searched, setSearched] = useState(false)
  useEffect(() => {
    if (given || loading || missing || error || form || searched) return
    setSearched(true)
    void readForms(true)
  }, [given, loading, missing, error, form, searched])
  /* Every way out asks the builder first (FormEditor closeRef). */
  const guard = useRef<(() => void) | null>(null)
  const requestClose = () => (guard.current ? guard.current() : onClose())
  return (
    <SheetDialog
      open
      onClose={requestClose}
      phone={phone}
      label={form?.title || tt("Form")}
      showCloseButton={false}
      className="flex h-[min(88dvh,820px)] w-[min(640px,calc(100vw-32px))] max-w-none flex-col gap-0 overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white p-0 shadow-[0_24px_64px_-16px_rgba(17,24,39,0.28),0_2px_8px_rgba(17,24,39,0.06)] sm:max-w-none"
      sheet={{ maxHeight: "calc(var(--vv-h, 100dvh) * 0.94)", height: "calc(var(--vv-h, 100dvh) * 0.94)" }}
      dialog={{ "aria-describedby": undefined, onInteractOutside: (e: Event) => e.preventDefault(), ...({ "data-form-builder-dialog": "" } as object) }}
    >
      <SheetDialogTitle className="sr-only">{form?.title || tt("Form")}</SheetDialogTitle>
      {form ? (
        <FormEditor key={form.id} form={{ ...form, integration_settings: form.integration_settings ?? ({} as SavedForm["integration_settings"]) }} closeRef={guard} onBack={onClose} onSaved={(f) => onSaved(f)} />
      ) : missing ? (
        <div className="p-6">
          <FormsNotSetUp />
        </div>
      ) : error ? (
        <div className="space-y-3 p-6 text-[14px] text-[#4b5563]">
          <p role="alert">{error}</p>
          <button type="button" className="font-medium text-[#1a1a2e] underline" onClick={retry}>
            {tt("Try again")}
          </button>
        </div>
      ) : searched && !loading ? (
        <p className="p-6 text-[14px] text-[#4b5563]">{tt("This form is not there any more. It may have been archived.")}</p>
      ) : (
        <div className="space-y-3 p-6" role="status" aria-label={tt("Loading form")}>
          <div className="h-5 w-40 animate-pulse rounded-md bg-[#f1f2f4] motion-reduce:animate-none" />
          <div className="h-11 animate-pulse rounded-xl bg-[#f6f7f8] motion-reduce:animate-none" />
          <div className="h-32 animate-pulse rounded-xl bg-[#f6f7f8] motion-reduce:animate-none" />
        </div>
      )}
    </SheetDialog>
  )
}
