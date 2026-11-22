"use client"

/**
 * ===========================================================================
 *  A WEBSITE'S THEME VERSION, ITS RELEASE NOTES, AND UPDATE
 * ===========================================================================
 * The way Shopify's theme library says it: the theme's name and version,
 * whether it is up to date, and the notes of what changed. Update never
 * changes the website it is pressed on: it makes an updated copy, a draft
 * in the library with the new version's code and this website's own content
 * (app/api/website-builder/themes/[installId]/update), which the creator
 * opens, looks at and publishes when it is ready. The website stays as the
 * way back.
 *
 * On a phone it is the app's bottom sheet; from 640px a compact modal, the
 * same shape as the full library sheet (./library-full-dialog.tsx).
 */
import * as React from "react"
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { Loader2 } from "lucide-react"
import { tt } from "@/lib/i18n/text"
import type { ThemeRelease, VersionState } from "@/lib/themes/releases-shared"

export interface UpdateResult {
  installId: string
  name: string
  version: string
  kept: { path: string; why: "edited" | "yours" }[]
}

const PHONE = "(max-width: 639px)"

function usePhone(): boolean {
  const [phone, setPhone] = React.useState(false)
  React.useEffect(() => {
    const mql = window.matchMedia(PHONE)
    const check = () => setPhone(mql.matches)
    check()
    mql.addEventListener("change", check)
    return () => mql.removeEventListener("change", check)
  }, [])
  return phone
}

const day = (iso: string | null) => {
  if (!iso) return ""
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
}

/** One row of the live card's facts: the version, and Update available when there is one. */
export function ThemeVersionFact({ state, onOpen }: { state: VersionState; onOpen: () => void }) {
  const update = state.pending.length > 0
  return (
    <div className="flex items-center justify-between gap-4 py-2.5" data-theme-version="">
      <dt className="text-[#6b7280]">{tt("Theme version")}</dt>
      <dd className="min-w-0 truncate text-right">
        {state.installed ? <span className="font-medium text-[#1a1a2e]">{state.installed}</span> : null}
        {state.installed ? <span className="text-[#9ca3af]"> · </span> : null}
        <button
          type="button"
          onClick={onOpen}
          data-theme-version-open=""
          className="rounded font-medium text-[#1a1a2e] underline decoration-[#1a1a2e]/25 underline-offset-[3px] outline-none transition-colors duration-150 hover:decoration-[#1a1a2e]/70 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20"
        >
          {update ? tt("Update available") : tt("Release notes")}
        </button>
      </dd>
    </div>
  )
}

function Notes({ list }: { list: ThemeRelease[] }) {
  if (!list.length) return null
  return (
    <ol data-release-notes="" className="divide-y divide-[#eceef1] border-y border-[#eceef1]">
      {list.slice(0, 8).map((r) => (
        <li key={r.id} className="px-5 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-[14px] font-semibold text-[#1a1a2e]">{tt("Version {version}", { version: r.version })}</h3>
            <span className="shrink-0 text-[12.5px] text-[#9ca3af]">{day(r.publishedAt ?? r.createdAt)}</span>
          </div>
          <p className="mt-1 whitespace-pre-line text-[13.5px] leading-[1.5] text-[#4b5563]">{r.notes}</p>
        </li>
      ))}
    </ol>
  )
}

function Kept({ kept }: { kept: UpdateResult["kept"] }) {
  if (!kept.length) return null
  return (
    <div className="px-5 pb-1 pt-3" data-update-kept="">
      <p className="text-[13px] font-medium text-[#1a1a2e]">{tt("Kept as you edited them")}</p>
      <ul className="mt-1.5 space-y-0.5">
        {kept.slice(0, 30).map((k) => (
          <li key={k.path} className="truncate font-mono text-[12px] text-[#4b5563]">{k.path}</li>
        ))}
      </ul>
    </div>
  )
}

export function ThemeVersionDialog({
  state,
  themeName,
  busy,
  result,
  onUpdate,
  onOpenCopy,
  onClose,
}: {
  /** Null while closed. */
  state: VersionState | null
  /** The theme's name as the marketplace lists it. */
  themeName: string
  busy: boolean
  result: UpdateResult | null
  onUpdate: () => void
  onOpenCopy: (installId: string) => void
  onClose: () => void
}) {
  const phone = usePhone()
  /* The words stay as they were while it closes. */
  const [shown, setShown] = React.useState<VersionState | null>(state)
  if (state !== null && state !== shown) setShown(state)
  const s = state ?? shown
  if (!s) return null
  const update = s.pending.length > 0 && !result
  const title = s.installed ? tt("{name} version {version}", { name: themeName, version: s.installed }) : themeName
  const line = result
    ? tt("Added {name} as a draft.", { name: result.name })
    : update
      ? tt("Version {version} is available.", { version: s.latest?.version ?? "" })
      : tt("This theme is up to date.")
  const notes = result ? [] : update ? s.pending : s.current ? [s.current] : s.latest ? [s.latest] : []

  const body = (
    <>
      <Notes list={notes} />
      {result ? <Kept kept={result.kept} /> : null}
      {update ? <p className="px-5 pt-3 text-[13px] leading-[1.5] text-[#6b7280]">{tt("Update adds a copy with the new version and your content. Your website stays as it is until you publish the copy.")}</p> : null}
    </>
  )
  const primary = (size: string) =>
    result ? (
      <button type="button" onClick={() => onOpenCopy(result.installId)} data-update-open="" className={`${PRIMARY} ${size}`}>
        {tt("Open copy")}
      </button>
    ) : update ? (
      <button type="button" onClick={onUpdate} disabled={busy} data-update-theme="" className={`${PRIMARY} ${size}`}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {busy ? tt("Updating") : tt("Update")}
      </button>
    ) : null

  if (phone) {
    return (
      <BottomSheet
        isOpen={state !== null}
        onClose={onClose}
        dismissible={!busy}
        label={title}
        header={
          <div className="px-5 pb-4 pt-3">
            <h2 className="text-[17px] font-semibold text-[#1a1a2e]">{title}</h2>
            <p className="mt-1 text-[14px] leading-[1.45] text-[#6b7280]">{line}</p>
          </div>
        }
      >
        <div data-theme-version-dialog="" data-surface="sheet">
          {body}
          <div className="flex flex-col gap-2 px-5 pb-1 pt-4">
            {primary("h-12 w-full rounded-xl text-[15px]")}
            <button type="button" onClick={onClose} disabled={busy} className="inline-flex h-12 w-full items-center justify-center rounded-xl border border-[#e5e7eb] bg-white text-[15px] font-semibold text-[#1a1a2e] shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors duration-150 active:bg-[#f3f4f6] disabled:opacity-60">
              {tt("Close")}
            </button>
          </div>
        </div>
      </BottomSheet>
    )
  }

  return (
    <AlertDialog open={state !== null} onOpenChange={(o) => !o && !busy && onClose()}>
      <AlertDialogContent
        data-theme-version-dialog=""
        data-surface="modal"
        className="block max-w-[calc(100%-2rem)] gap-0 overflow-hidden rounded-2xl border-[#e5e7eb] p-0 shadow-[0_20px_48px_-16px_rgba(17,24,39,0.28),0_2px_6px_rgba(17,24,39,0.06)] sm:max-w-[480px]"
      >
        <div className="px-5 pb-4 pt-5">
          <AlertDialogTitle className="text-[16px] font-semibold text-[#1a1a2e]">{title}</AlertDialogTitle>
          <AlertDialogDescription className="mt-1 text-[13.5px] leading-[1.5] text-[#6b7280]">{line}</AlertDialogDescription>
        </div>
        <div className="max-h-[min(52vh,440px)] overflow-y-auto">{body}</div>
        <div className="flex justify-end gap-2 px-5 py-3">
          <button type="button" onClick={onClose} disabled={busy} className="inline-flex h-9 items-center rounded-lg border border-[#e5e7eb] bg-white px-3.5 text-[13px] font-semibold text-[#1a1a2e] shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors duration-150 hover:bg-[#f8f9fa] disabled:opacity-60">
            {tt("Close")}
          </button>
          {primary("h-9 px-3.5 text-[13px]")}
        </div>
      </AlertDialogContent>
    </AlertDialog>
  )
}

const PRIMARY =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#1a1a2e] font-semibold text-white outline-none transition-colors duration-150 hover:bg-[#2d2d44] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/25 disabled:opacity-70"
