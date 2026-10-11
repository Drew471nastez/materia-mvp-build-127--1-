/**
 * The REAL "Choose from your files" (components/files/files-library.tsx),
 * over a page shaped like Settings > Store details, for
 * scripts/check-files-picker.mjs. The probe answers /api/files and
 * /_next/image itself, so the component's own fetch, thumbnails, menu and
 * delete run end to end.
 *
 *   /                 one picture (a logo field)
 *   /?multi=3         a list's add field: several ticked, at most 3
 *   /?manage=1        the Files page itself, with Select
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { FilesLibrary, FilesLibraryChooser, type PickMany } from "@/components/files/files-library"

const params = new URLSearchParams(location.search)
const multi = params.has("multi") ? Number(params.get("multi")) : null
const manage = params.has("manage")

function Harness() {
  const [open, setOpen] = React.useState(false)
  const [picked, setPicked] = React.useState<string | null>(null)
  const [many, setMany] = React.useState<string[]>([])
  const w = globalThis as unknown as { __open: () => void; __close: () => void; __picked: () => string | null; __pickedMany: () => string[] }
  w.__open = () => setOpen(true)
  w.__close = () => setOpen(false)
  w.__picked = () => picked
  w.__pickedMany = () => many
  if (manage) {
    return (
      <div style={{ padding: 24, fontFamily: "Inter, system-ui" }} className="mx-auto max-w-[1200px]">
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "#1a1a2e" }}>Files</h1>
        <section className="mt-4 rounded-2xl border border-[#e5e7eb]/60 bg-white p-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:p-4">
          <FilesLibrary mode="manage" />
        </section>
      </div>
    )
  }
  return (
    <div style={{ padding: 24, fontFamily: "Inter, system-ui" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: "#1a1a2e" }}>Settings</h1>
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="mt-4 rounded-2xl border border-[#e5e7eb]/60 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <p className="text-[16px] font-semibold text-[#1a1a2e]">Store details {i + 1}</p>
          <p className="mt-1 text-[14px] text-[#6b7280]">The logo on receipts and order emails.</p>
          {i === 0 ? (
            <button type="button" data-open-chooser="" onClick={() => setOpen(true)} className="mt-3 inline-flex h-10 items-center rounded-lg border border-[#e5e7eb] bg-white px-4 text-[14px] font-medium">
              Change
            </button>
          ) : null}
        </div>
      ))}
      {multi !== null ? (
        <FilesLibraryChooser open={open} onClose={() => setOpen(false)} multiple max={multi} onPickMany={(picks: PickMany) => setMany(picks.map((p) => p.url))} />
      ) : (
        <FilesLibraryChooser open={open} onClose={() => setOpen(false)} selectedUrl={picked} onPick={(url) => setPicked(url)} />
      )}
    </div>
  )
}

createRoot(document.getElementById("app")!).render(<Harness />)
