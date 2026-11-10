"use client"
/**
 * A form inside the OnePage's block sheet (components/onepage/block-sheet),
 * opened by a Form block's button or a button whose action is a form or a
 * chat with questions first (./action-frame). Loaded on the press.
 *
 * The sheet hands its colours down as --sheet-* (light on a light page,
 * dark on a dark one); the visitor's form reads them, and here its fields
 * take the sheet's own field fill and hairline, so the questions sit on the
 * sheet rather than in white boxes pasted onto it.
 */
import type { CSSProperties } from "react"
import { PublicFormRenderer } from "./public-form"

export default function FormSheetBody(props: {
  formId: string
  source: "onepage" | "website" | "creator_page"
  preview: boolean
  sourceBlock?: string
  shownTitle?: string
  onSubmitted?: (answers: Record<string, unknown>, fields: { id: string; type?: string }[]) => void
  onUnavailable?: () => void
}) {
  return (
    <div className="px-2 pb-4 pt-1 sm:px-1" data-form-sheet="" style={{ "--form-field": "var(--sheet-field)", "--form-line": "var(--sheet-rule)" } as CSSProperties}>
      <PublicFormRenderer key={props.formId} {...props} quietLoading />
    </div>
  )
}
