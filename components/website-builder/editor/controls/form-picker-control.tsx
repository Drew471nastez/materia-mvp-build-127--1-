"use client"

/**
 * The control for `form_picker`: one of the creator's own forms, stored by
 * id (Contacts › Forms). The same picker every other place that takes a form
 * uses (components/forms/form-picker.tsx): the forms by name with a draft
 * said under its name, New form from a template and Edit questions in the
 * form builder over the editor, so a form is made where it is used and
 * nobody types an id. The value is the id and only the id; the live page
 * resolves it against this creator's forms (L4, lib/storelib-theme/
 * resolve.ts), so an id that is not theirs draws nothing.
 */
import { FormPicker } from "@/components/forms/form-picker"

export function FormPickerControl({ value, onChange, label, booking }: { value: string; onChange: (v: string) => void; label?: string; booking?: boolean }) {
  return (
    <div data-form-picker-control="">
      <FormPicker value={value} onChange={onChange} label={label || "Form"} kind={booking ? "booking" : "form"} />
    </div>
  )
}
