/**
 * The Lessons card of the product editor (app/app/products/new/course-editor.tsx)
 * for scripts/check-course-editor.mjs, in a card the width the editor gives
 * it. The probe answers /api/courses/manage from a course kept in the page,
 * and takes the upload PUT itself, so every press does what it does on the site.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { CourseEditor } from "@/app/app/products/new/course-editor"

function Card() {
  const [toast, setToast] = React.useState<string | null>(null)
  return (
    <div className="min-h-svh bg-[#f8f9fa] px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-[760px] space-y-4 rounded-2xl border border-[#e5e7eb]/60 bg-white px-4 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:px-6 sm:py-6">
        <div>
          <h2 className="text-[16px] font-semibold leading-6 text-[#1a1a2e] sm:text-[17px]">Lessons</h2>
          <p className="text-[13px] leading-5 text-[#6b7280] sm:text-[14px]">Buyers watch these in their library, and pick up where they left off.</p>
        </div>
        <CourseEditor productId="11111111-1111-4111-8111-111111111111" ensureProductId={async () => "11111111-1111-4111-8111-111111111111"} onLessonCount={(n) => ((window as unknown as { __lessons: number }).__lessons = n)} notify={setToast} />
      </div>
      {toast ? <p data-toast className="mx-auto mt-3 max-w-[760px] text-[13px] text-[#b91c1c]">{toast}</p> : null}
    </div>
  )
}

createRoot(document.getElementById("app")!).render(<Card />)
