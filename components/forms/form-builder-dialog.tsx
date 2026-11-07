"use client"
/**
 * The form builder over the OnePage editor: the same builder as Emails ›
 * Leads › Forms (./forms-manager FormEditor), opened from a Form block, a
 * button that opens a form, or a chat button's questions, so a form is made
 * and edited where it is used. A wide dialog on a computer, a tall sheet on
 * a phone (components/ui/sheet-dialog). Loaded on the press that opens it.
 */
import { useEffect, useState } from "react"
import { SheetDialog, SheetDialogTitle } from "@/components/ui/sheet-dialog"
import { usePhoneWidth } from "@/components/ui/choice-list"
import { tt } from "@/lib/i18n/text"
import { FormEditor, type SavedForm } from "./forms-manager"
import { FormsNotSetUp, readForms, useFormsList, type FormRow } from "./form-picker"

export default function FormBuilderDialog({ formId, onClose, onSaved }: { formId: string; onClose: () => void; onSaved: (form: FormRow) => void }) {
  const phone = usePhoneWidth()
  const { forms, loading, missing, error, retry } = useFormsList(true)
  const form = forms.find((f) => f.id === formId) as SavedForm | undefined
  /* A form made a moment ago elsewhere: the list is read again, once, to find it; then it is said to be gone, never a wait. */
  const [searched, setSearched] = useState(false)
  useEffect(() => {
    if (loading || missing || error || form || searched) return
    setSearched(true)
    void readForms(true)
  }, [loading, missing, error, form, searched])
  return (
    <SheetDialog
      open
      onClose={onClose}
      phone={phone}
      label={tt("Form")}
      className="max-h-[92dvh] w-[min(1120px,calc(100vw-32px))] max-w-none overflow-y-auto bg-[#f8f9fa] p-0 sm:max-w-none"
      sheet={{ maxHeight: "94dvh" }}
      dialog={{ "aria-describedby": undefined, onInteractOutside: (e) => e.preventDefault() }}
    >
      <SheetDialogTitle className="sr-only">{form?.title || tt("Form")}</SheetDialogTitle>
      {form ? (
        <FormEditor key={form.id} form={{ ...form, integration_settings: form.integration_settings ?? ({} as SavedForm["integration_settings"]) }} embedded onBack={onClose} onSaved={(f) => onSaved(f)} />
      ) : missing ? (
        <div className="p-6">
          <FormsNotSetUp />
        </div>
      ) : error ? (
        <div className="space-y-3 p-6 text-sm text-[#4b5563]">
          <p role="alert">{error}</p>
          <button type="button" className="font-medium text-[#1a1a2e] underline" onClick={retry}>
            {tt("Try again")}
          </button>
        </div>
      ) : searched && !loading ? (
        <p className="p-6 text-sm text-[#4b5563]">{tt("This form is not there any more. It may have been archived.")}</p>
      ) : (
        <div className="p-6 text-sm text-[#6b7280]" role="status">
          {tt("Loading form")}
        </div>
      )}
    </SheetDialog>
  )
}
