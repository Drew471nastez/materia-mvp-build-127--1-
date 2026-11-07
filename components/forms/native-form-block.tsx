"use client"
import { PublicFormRenderer } from "./public-form"
import { isOnePagePreview } from "@/lib/onepage/preview-notice"
import { UUID, actionHref } from "@/lib/forms/actions"
import { NativeActionFrame } from "./action-frame"
/* The action frame lives with the action model's editor (components/forms/action-frame); kept exported here for the blocks that import it from this file. */
export { NativeActionFrame } from "./action-frame"
export function NativeFormBlock({
  formId,
  title = "Open form",
  inline = false,
  source = "onepage",
  preview = false,
}: {
  preview?: boolean
  formId: string
  title?: string
  inline?: boolean
  source?: "onepage" | "website" | "creator_page"
}) {
  if (!UUID.test(formId || ""))
    return (
      <div className="rounded-xl border border-dashed border-[#dfe2e7] p-4 text-center text-sm text-[#6b7280]">
        Choose a published form in this block’s settings.
      </div>
    )
  if (inline)
    return (
      <div className="rounded-2xl border border-[#e5e7eb] bg-white p-5">
        <PublicFormRenderer
          key={formId}
          formId={formId}
          source={source}
          preview={preview || isOnePagePreview()}
        />
      </div>
    )
  return (
    <NativeActionFrame
      action={{ type: "form", form_id: formId }}
      source={source}
      preview={preview}
    >
      <a
        href={actionHref({ type: "form", form_id: formId }) || "#"}
        className="op-btn flex min-h-12 w-full items-center justify-center rounded-xl border border-[#e3e4e8] bg-white px-4 py-3 font-medium text-[#1a1a2e]"
      >
        {title || "Open form"}
      </a>
    </NativeActionFrame>
  )
}
