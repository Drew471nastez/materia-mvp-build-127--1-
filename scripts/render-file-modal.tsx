/**
 * The REAL Files page library (components/files/files-library.tsx, manage
 * mode) inside the page's card, for scripts/check-file-modal.mjs. The probe
 * answers /api/files, /api/files/usage and /_next/image itself, so a press on
 * a tile opens the real detail view with its real link field, alt text,
 * arrows and delete question.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { FilesLibrary } from "@/components/files/files-library"

function Harness() {
  return (
    <div style={{ fontFamily: "Inter, system-ui" }} className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8">
      <h1 className="text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">Files</h1>
      <section className="mt-3 rounded-2xl border border-[#e5e7eb]/60 bg-white p-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:p-4">
        <FilesLibrary mode="manage" kind="media" />
      </section>
    </div>
  )
}

createRoot(document.getElementById("app")!).render(<Harness />)
