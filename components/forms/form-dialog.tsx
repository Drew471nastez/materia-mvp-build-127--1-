"use client"
import { OnePageDialog } from "@/components/onepage/onepage-dialog"
import { PublicFormRenderer } from "./public-form"
/** The sheet loads on intent, keeping anonymous creator pages light. */
export default function FormDialog({
  onClose,
  formId,
  source,
  preview,
}: {
  onClose: () => void
  formId: string
  source: "onepage" | "website" | "creator_page"
  preview: boolean
}) {
  return (
    <OnePageDialog
      open
      onClose={onClose}
      dark={false}
      label="Form"
      width={520}
      tall
    >
      <div className="p-5">
        <button
          type="button"
          className="mb-4 min-h-9 text-sm underline"
          onClick={onClose}
        >
          Close
        </button>
        <PublicFormRenderer
          key={formId}
          formId={formId}
          source={source}
          preview={preview}
        />
      </div>
    </OnePageDialog>
  )
}
