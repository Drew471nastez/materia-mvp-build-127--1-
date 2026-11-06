"use client"
import { ActionEditor } from "./action-editor"
export function FormReferenceEditor({
  formId,
  onChange,
  inline,
  onInlineChange,
  title,
  onTitleChange,
}: {
  formId: string
  onChange: (id: string) => void
  inline?: boolean
  onInlineChange?: (value: boolean) => void
  title?: string
  onTitleChange?: (value: string) => void
}) {
  return (
    <div className="space-y-3">
      <ActionEditor
        value={{ type: "form", form_id: formId }}
        onChange={(a) => onChange(a?.type === "form" ? a.form_id : "")}
      />
      {onTitleChange ? (
        <label className="block space-y-1 text-xs font-medium">
          Button title
          <input
            className="w-full rounded-lg border border-[#dfe2e7] bg-white px-3 py-2 text-sm"
            value={title ?? ""}
            onChange={(e) => onTitleChange(e.target.value)}
          />
        </label>
      ) : null}
      {onInlineChange ? (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={inline === true}
            onChange={(e) => onInlineChange(e.target.checked)}
          />
          Show questions inline
        </label>
      ) : null}
    </div>
  )
}
