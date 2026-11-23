/**
 * The library's theme version line, its dialog and the admin's releases
 * panel, mounted alone for scripts/check-theme-version.mjs. ?view= picks:
 *   fact       the live card's facts with the version line
 *   pending    the dialog with an update and its notes
 *   result     the dialog after Update, with the files kept
 *   current    the dialog when the theme is up to date
 *   admin      the admin's releases panel for a template
 *   row        a library row as the page draws it, with Update available
 */
import * as React from "react"
import { createRoot } from "react-dom/client"
import { ThemeVersionDialog, ThemeVersionFact, UpdateAvailableLine } from "@/app/(storelib)/app/website-builder/theme-version"
import { ReleasesPanel, type AdminRelease } from "@/app/(storelib)/admin/themes/releases-admin"
import type { ThemeRelease, VersionState } from "@/lib/themes/releases-shared"

const release = (version: string, notes: string, target = "base"): ThemeRelease => ({ id: `r-${version}`, target, family: "materia", version, notes, source: "code", published: true, publishedAt: "2026-11-20T10:00:00.000Z", createdAt: "2026-11-20T10:00:00.000Z" })
const r210 = release("2.1.0", "Product pages load the second picture sooner.\nThe footer's newsletter field fits on a phone.")
const r202 = release("2.0.2", "Collection filters keep their place after Back.", "clothing")
const behind: VersionState = { slug: "clothing", installed: "2.0.1", latest: r210, pending: [r210, r202], current: null }
const upToDate: VersionState = { slug: "clothing", installed: "2.1.0", latest: r210, pending: [], current: r210 }
const view = new URLSearchParams(location.search).get("view") ?? "fact"

function App() {
  if (view === "admin") {
    const releases: AdminRelease[] = [
      { ...r210, layer: "theme", files: 412 },
      { ...r202, layer: "overlay", files: 38 },
      { ...release("2.0.1", "Lookbook section takes six pictures.", "clothing"), published: false, layer: "overlay", files: 38 },
    ]
    return (
      <div className="min-h-screen bg-[#0b0b0f] p-4 text-[#ededf0] [font-family:Inter,system-ui,sans-serif]">
        <div className="mx-auto max-w-[560px]">
          <ReleasesPanel target="clothing" title="Clothing releases" releases={releases} notice={null} onChanged={() => undefined} />
        </div>
      </div>
    )
  }
  if (view === "row") {
    return (
      <div className="mx-auto max-w-[1200px] p-4">
        <div className="overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white">
          <div data-row="" className="flex w-full min-w-0 items-center gap-3 p-3 sm:gap-4 sm:px-4">
            <span className="block aspect-[16/10] w-24 shrink-0 rounded-lg border border-[#e5e7eb] bg-[#f3f4f6] sm:w-28" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-semibold text-[#1a1a2e]">Spring collection with a long name</span>
              <span className="mt-0.5 block truncate text-[12.5px] text-[#6b7280]">Draft · Edited 3 hours ago</span>
              <UpdateAvailableLine />
            </span>
            <span className="h-11 w-11 shrink-0 rounded-lg border border-[#e5e7eb]" />
          </div>
        </div>
      </div>
    )
  }
  if (view === "fact") {
    return (
      <div className="mx-auto max-w-[420px] rounded-2xl border border-[#e5e7eb]/60 bg-white p-6">
        <dl data-facts="" className="divide-y divide-[#f0f1f3] border-y border-[#f0f1f3] text-[13px]">
          <div className="flex items-center justify-between gap-4 py-2.5">
            <dt className="text-[#6b7280]">Last edited</dt>
            <dd className="text-right font-medium text-[#1a1a2e]">2 hours ago</dd>
          </div>
          <ThemeVersionFact state={behind} onOpen={() => undefined} />
          <ThemeVersionFact state={upToDate} onOpen={() => undefined} />
        </dl>
      </div>
    )
  }
  const state = view === "current" ? upToDate : behind
  const result = view === "result" ? { installId: "x", name: "My shop (2.1.0)", version: "2.1.0", kept: [{ path: "sections/main-product.storelib", why: "edited" as const }, { path: "sections/my-banner.storelib", why: "yours" as const }] } : null
  return <ThemeVersionDialog state={state} themeName="Clothing" busy={false} result={result} onUpdate={() => undefined} onOpenCopy={() => undefined} onClose={() => undefined} />
}

createRoot(document.getElementById("root")!).render(<App />)
