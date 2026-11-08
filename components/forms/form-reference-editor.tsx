"use client"
import { FormPicker } from "./form-picker"
import { tt } from "@/lib/i18n/text"
import { Segmented } from "@/components/onepage/editor-kit"
import { FORM_PRESENTATIONS, presentationOf, type FormPresentation } from "./native-form-block"
import { FIELD, FIELD_STACK, LABEL } from "./fields"

/**
 * The form block's settings, shared by the OnePage block and the creator
 * page section. The form is chosen, started or edited right here
 * (./form-picker), so a form is made where it is used.
 *
 * Round AN: "Show as" is the editor's own segmented control (two rows of
 * two), the fields are the OnePage editor's (./fields), and every word is
 * in the creator's language.
 */
const presentationWords = (): Record<FormPresentation, string> => ({
  card: tt("Card"),
  inline: tt("Inline"),
  expandable: tt("Expandable"),
  modal: tt("Button and pop-up"),
})

export function FormReferenceEditor({
  formId,
  onChange,
  inline,
  onInlineChange,
  presentation,
  onPresentationChange,
  title,
  onTitleChange,
}: {
  formId: string
  onChange: (id: string) => void
  inline?: boolean
  onInlineChange?: (value: boolean) => void
  presentation?: FormPresentation
  onPresentationChange?: (value: FormPresentation) => void
  title?: string
  onTitleChange?: (value: string) => void
}) {
  const how = presentationOf({ presentation, inline })
  const words = presentationWords()
  return (
    <div className="space-y-4">
      <FormPicker kind="form" label={tt("Form")} value={formId} onChange={onChange} />
      {onPresentationChange ? (
        <div className={FIELD_STACK}>
          <span className={LABEL}>{tt("Show as")}</span>
          <Segmented label={tt("Show as")} className="!grid-cols-2" value={how} options={FORM_PRESENTATIONS.map((p) => ({ id: p.id, label: words[p.id] ?? p.label }))} onChange={onPresentationChange} />
        </div>
      ) : onInlineChange ? (
        <label className="flex min-h-11 items-center gap-2.5 text-[14px] text-[#1a1a2e]">
          <input type="checkbox" className="h-4 w-4 accent-[#1a1a2e]" checked={inline === true} onChange={(e) => onInlineChange(e.target.checked)} />
          {tt("Show questions inline")}
        </label>
      ) : null}
      {onTitleChange && how !== "inline" && how !== "card" ? (
        <label className={FIELD_STACK}>
          <span className={LABEL}>{tt("Button text")}</span>
          <input className={FIELD} value={title ?? ""} maxLength={80} onChange={(e) => onTitleChange(e.target.value)} />
        </label>
      ) : null}
    </div>
  )
}
