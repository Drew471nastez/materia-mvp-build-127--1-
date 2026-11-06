"use client"
import { useState, lazy, Suspense, type ReactNode } from "react"
import { PublicFormRenderer } from "./public-form"
const FormDialog = lazy(() => import("./form-dialog"))
import { isOnePagePreview } from "@/lib/onepage/preview-notice"
import { UUID, actionHref, type NativeAction } from "@/lib/forms/actions"
/** Shared action scope keeps forms native while retaining the anchor as a
 * no-JavaScript fallback and keeping the existing analytics click handler. */
export function NativeActionFrame({
  action,
  children,
  source = "onepage",
  preview = false,
}: {
  preview?: boolean
  action?: NativeAction
  children: ReactNode
  source?: "onepage" | "website" | "creator_page"
}) {
  const [open, setOpen] = useState(false)
  const id =
    action?.type === "form" && UUID.test(action.form_id) ? action.form_id : null
  if (!id) return <>{children}</>
  return (
    <>
      <div
        onClickCapture={(e) => {
          if ((e.target as Element).closest("a")) {
            e.preventDefault()
            setOpen(true)
          }
        }}
      >
        {children}
      </div>
      {open ? (
        <Suspense fallback={null}>
          <FormDialog
            onClose={() => setOpen(false)}
            formId={id}
            source={source}
            preview={preview || isOnePagePreview()}
          />
        </Suspense>
      ) : null}
    </>
  )
}
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
