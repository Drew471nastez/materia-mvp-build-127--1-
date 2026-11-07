"use client"
import { ActionEditor } from "./action-editor"
import { FORM_PRESENTATIONS, presentationOf, type FormPresentation } from "./native-form-block"

/** The form block's settings, shared by the OnePage block and the creator page section. */
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
  return (
    <div className="space-y-3">
      <ActionEditor value={{ type: "form", form_id: formId }} onChange={(a) => onChange(a?.type === "form" ? a.form_id : "")} />
      {onPresentationChange ? (
        <div className="space-y-1.5">
          <span className="block text-xs font-medium text-[#4b5563]">Show as</span>
          <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Show as">
            {FORM_PRESENTATIONS.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={how === p.id}
                onClick={() => onPresentationChange(p.id)}
                className={`min-h-9 rounded-lg border px-2 text-[13px] font-medium ${how === p.id ? "border-[#1a1a2e] bg-[#1a1a2e] text-white" : "border-[#e3e4e8] bg-white text-[#1a1a2e]"}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      ) : onInlineChange ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={inline === true} onChange={(e) => onInlineChange(e.target.checked)} />
          Show questions inline
        </label>
      ) : null}
      {onTitleChange && how !== "inline" && how !== "card" ? (
        <label className="block space-y-1 text-xs font-medium text-[#4b5563]">
          Button text
          <input className="w-full rounded-lg border border-[#dfe2e7] bg-white px-3 py-2 text-sm" value={title ?? ""} maxLength={80} onChange={(e) => onTitleChange(e.target.value)} />
        </label>
      ) : null}
    </div>
  )
}
