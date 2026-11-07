"use client"
import { OnePageDialog } from "@/components/onepage/onepage-dialog"
import { PublicFormRenderer } from "./public-form"
/** The sheet loads on intent, keeping anonymous creator pages light. */
export default function FormDialog({
  onClose,
  formId,
  source,
  preview,
  sourceBlock,
  onSubmitted,
  onUnavailable,
}: {
  /** The form could not be shown: a chat opens without its questions. */
  onUnavailable?: () => void
  /** After the answers are saved (a pre-chat form: components/forms/action-frame). */
  onSubmitted?: (answers: Record<string, unknown>, fields: { id: string; type?: string }[]) => void
  onClose: () => void
  formId: string
  source: "onepage" | "website" | "creator_page"
  preview: boolean
  sourceBlock?: string
}) {
  return (
    <OnePageDialog open onClose={onClose} dark={false} label="Form" width={520} tall>
      <div className="p-5">
        <div className="mb-2 flex justify-end">
          <button type="button" aria-label="Close" className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[#4b5563] hover:bg-[#f1f2f4]" onClick={onClose}>
            <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <PublicFormRenderer key={formId} formId={formId} source={source} preview={preview} sourceBlock={sourceBlock} onSubmitted={onSubmitted} onUnavailable={onUnavailable} />
      </div>
    </OnePageDialog>
  )
}
