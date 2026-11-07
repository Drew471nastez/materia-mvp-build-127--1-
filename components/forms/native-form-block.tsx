"use client"
import { useId, useState, lazy, Suspense, type ReactNode } from "react"
import { PublicFormRenderer } from "./public-form"
const FormDialog = lazy(() => import("./form-dialog"))
import { isOnePagePreview } from "@/lib/onepage/preview-notice"
import { UUID, actionHref, type NativeAction } from "@/lib/forms/actions"

export type FormPresentation = "inline" | "card" | "expandable" | "modal"
export const FORM_PRESENTATIONS: { id: FormPresentation; label: string }[] = [
  { id: "card", label: "Card" },
  { id: "inline", label: "Inline" },
  { id: "expandable", label: "Expandable" },
  { id: "modal", label: "Button and pop-up" },
]

/** A saved block's presentation. Blocks from before presentations had only inline on or off. */
export function presentationOf(data: { presentation?: unknown; inline?: unknown }): FormPresentation {
  return FORM_PRESENTATIONS.some((p) => p.id === data.presentation) ? (data.presentation as FormPresentation) : data.inline === true ? "card" : "modal"
}

type Source = "onepage" | "website" | "creator_page"

/** Shared action scope keeps forms native while retaining the anchor as a
 * no-JavaScript fallback and keeping the existing analytics click handler. */
export function NativeActionFrame({
  action,
  children,
  source = "onepage",
  preview = false,
  sourceBlock,
}: {
  preview?: boolean
  action?: NativeAction
  children: ReactNode
  source?: Source
  sourceBlock?: string
}) {
  const [open, setOpen] = useState(false)
  const id = action?.type === "form" && UUID.test(action.form_id) ? action.form_id : null
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
          <FormDialog onClose={() => setOpen(false)} formId={id} source={source} preview={preview || isOnePagePreview()} sourceBlock={sourceBlock} />
        </Suspense>
      ) : null}
    </>
  )
}

export function NativeFormBlock({
  formId,
  title = "Open form",
  inline = false,
  presentation,
  source = "onepage",
  preview = false,
}: {
  preview?: boolean
  formId: string
  title?: string
  /** Older blocks: true shows the questions in a card. */
  inline?: boolean
  presentation?: FormPresentation
  source?: Source
}) {
  const [expanded, setExpanded] = useState(false)
  const region = useId()
  const how = presentation || presentationOf({ inline })
  if (!UUID.test(formId || ""))
    return <div className="rounded-xl border border-dashed border-[#dfe2e7] p-4 text-center text-sm text-[#6b7280]">Choose a published form in this block’s settings.</div>
  const form = <PublicFormRenderer key={formId} formId={formId} source={source} sourceBlock={title} preview={preview || isOnePagePreview()} />
  if (how === "inline") return <div data-form-presentation="inline">{form}</div>
  if (how === "card")
    return (
      <div data-form-presentation="card" className="rounded-2xl border border-[#e5e7eb] bg-white p-5 text-[#1a1a2e] shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:p-6">
        {form}
      </div>
    )
  if (how === "expandable")
    return (
      <div data-form-presentation="expandable" className="overflow-hidden rounded-xl border border-[#e3e4e8] bg-white text-[#1a1a2e]">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={region}
          onClick={() => setExpanded((v) => !v)}
          className="op-btn flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left font-medium"
        >
          <span className="min-w-0 truncate">{title || "Open form"}</span>
          <svg aria-hidden="true" viewBox="0 0 16 16" className={`h-4 w-4 shrink-0 transition-transform duration-200 motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`}>
            <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {expanded ? (
          <div id={region} className="border-t border-[#eef0f2] p-4 sm:p-5">
            {form}
          </div>
        ) : null}
      </div>
    )
  return (
    <NativeActionFrame action={{ type: "form", form_id: formId }} source={source} preview={preview} sourceBlock={title}>
      <a
        href={actionHref({ type: "form", form_id: formId }) || "#"}
        data-form-presentation="modal"
        className="op-btn flex min-h-12 w-full items-center justify-center rounded-xl border border-[#e3e4e8] bg-white px-4 py-3 font-medium text-[#1a1a2e]"
      >
        {title || "Open form"}
      </a>
    </NativeActionFrame>
  )
}
