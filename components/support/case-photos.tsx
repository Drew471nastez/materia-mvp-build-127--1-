"use client"

/**
 * PHOTOS WITH A MESSAGE TO THE SHOP: pick up to four, see them, take one
 * out. A phone's photo is made smaller here first (at most 1800 pixels
 * across, JPEG), so four of them stay well under what a request may carry;
 * the server checks each again (lib/support/case-photos-server.ts) and
 * strips its location before it is kept.
 */
import * as React from "react"
import { ChevronLeft, ChevronRight, ImagePlus, X } from "lucide-react"
import { createPortal } from "react-dom"
import { CASE_PHOTO_TYPES, MAX_CASE_PHOTOS, MAX_CASE_PHOTO_BYTES } from "@/lib/support/cases"
import { tt } from "@/lib/i18n/text"
import type { CheckoutT } from "@/lib/markets/checkout-words"

/** What one request may carry in photos, all together: under the 4.5 MB a serverless request takes, with room for the words. */
export const MAX_CASE_PHOTOS_TOTAL = 4 * 1024 * 1024
const LONGEST_SIDE = 1800

async function smaller(file: File): Promise<File> {
  if (file.type === "image/gif" || typeof createImageBitmap !== "function") return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, LONGEST_SIDE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close?.()
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85))
    if (!blob || blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.[a-z0-9]+$/i, "") + ".jpg", { type: "image/jpeg" })
  } catch {
    return file
  }
}

export interface PickedPhoto {
  file: File
  preview: string
}

/* On a buyer's order page and receipt, the page's translator (components/checkout/parts/words.tsx) says these in the buyer's language; in the dashboard, tt() in the creator's. */
export function useCasePhotos(ct?: CheckoutT) {
  const [photos, setPhotos] = React.useState<PickedPhoto[]>([])
  const [error, setError] = React.useState<string | null>(null)
  const live = React.useRef<PickedPhoto[]>([])
  live.current = photos
  /* Previews are let go when the form goes, and one by one as they are taken out. */
  React.useEffect(() => () => live.current.forEach((p) => URL.revokeObjectURL(p.preview)), [])
  const add = async (list: FileList | null) => {
    setError(null)
    const files = Array.from(list ?? [])
    if (!files.length) return
    const room = MAX_CASE_PHOTOS - photos.length
    if (files.length > room) setError(ct ? ct("Up to {maxCasePhotos} photos with a message.", { maxCasePhotos: MAX_CASE_PHOTOS }) : tt("Up to {maxCasePhotos} photos with a message.", { maxCasePhotos: MAX_CASE_PHOTOS }))
    const next: PickedPhoto[] = []
    for (const f of files.slice(0, Math.max(0, room))) {
      if (!(CASE_PHOTO_TYPES as readonly string[]).includes(f.type)) {
        setError(ct ? ct("{name} isn't a photo. Use a JPEG, PNG, WebP or GIF.", { name: f.name }) : tt("{name} isn't a photo. Use a JPEG, PNG, WebP or GIF.", { name: f.name }))
        continue
      }
      const s = await smaller(f)
      if (s.size > MAX_CASE_PHOTO_BYTES) {
        setError(ct ? ct("{name} is too large. A photo can be up to 8 MB.", { name: f.name }) : tt("{name} is too large. A photo can be up to 8 MB.", { name: f.name }))
        continue
      }
      next.push({ file: s, preview: URL.createObjectURL(s) })
    }
    const total = [...photos, ...next].reduce((n, p) => n + p.file.size, 0)
    if (total > MAX_CASE_PHOTOS_TOTAL) {
      next.forEach((p) => URL.revokeObjectURL(p.preview))
      return setError(ct ? ct("These photos are too large together. Send fewer, or smaller ones.") : tt("These photos are too large together. Send fewer, or smaller ones."))
    }
    setPhotos((p) => [...p, ...next])
  }
  const remove = (i: number) => {
    const gone = photos[i]
    if (gone) URL.revokeObjectURL(gone.preview)
    setPhotos((p) => p.filter((_, j) => j !== i))
  }
  const clear = () => {
    photos.forEach((p) => URL.revokeObjectURL(p.preview))
    setPhotos([])
  }
  return { photos, error, add, remove, clear }
}

export function CasePhotoPicker({ state, disabled, ct }: { state: ReturnType<typeof useCasePhotos>; disabled?: boolean; ct?: CheckoutT }) {
  const input = React.useRef<HTMLInputElement>(null)
  return (
    <div data-case-photos="">
      {state.photos.length ? (
        <ul className="mb-2 flex flex-wrap gap-2">
          {state.photos.map((p, i) => (
            <li key={p.preview} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.preview} alt="" className="h-16 w-16 rounded-lg border border-[#e5e7eb] object-cover" />
              <button type="button" onClick={() => state.remove(i)} aria-label={ct ? ct("Remove photo") : tt("Remove photo")} className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full bg-[#1a1a2e] text-white">
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {state.photos.length < MAX_CASE_PHOTOS ? (
        <button type="button" disabled={disabled} onClick={() => input.current?.click()} className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-dashed border-[#c9cdd3] px-3 text-[13.5px] font-medium text-[#4b5563] hover:bg-[#f8f9fa] disabled:opacity-60" data-case-photos-add="">
          <ImagePlus className="h-4 w-4" aria-hidden />
          {state.photos.length ? (ct ? ct("Add another photo") : tt("Add another photo")) : (ct ? ct("Add photos") : tt("Add photos"))}
        </button>
      ) : null}
      <input
        ref={input}
        type="file"
        accept={CASE_PHOTO_TYPES.join(",")}
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          void state.add(e.target.files)
          e.target.value = ""
        }}
      />
      {state.error ? <p role="alert" className="mt-1.5 text-[13px] text-[#b91c1c]">{state.error}</p> : null}
    </div>
  )
}

/**
 * A message's photos in a thread: small squares, each opening full size in
 * a viewer over the page (arrows and Escape on a keyboard, the original a
 * link away). A click with a modifier key opens the original in a new tab
 * as a link does. `ct` on a buyer's page, tt() in the dashboard.
 */
export function CasePhotoStrip({ photos, dark, ct }: { photos?: { url: string; name: string }[]; dark?: boolean; ct?: CheckoutT }) {
  const [open, setOpen] = React.useState<number | null>(null)
  if (!photos?.length) return null
  return (
    <>
      <ul className="mt-2 flex flex-wrap gap-2" data-message-photos="">
        {photos.map((p, i) => (
          <li key={p.url}>
            <a
              href={p.url}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
                e.preventDefault()
                setOpen(i)
              }}
              className={`block overflow-hidden rounded-[10px] outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 ${dark ? "focus-visible:ring-white/70" : "focus-visible:ring-[#1a1a2e]/40"}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={p.name} loading="lazy" decoding="async" className={`h-20 w-20 rounded-[10px] object-cover sm:h-24 sm:w-24 ${dark ? "border border-white/20" : "border border-[#e5e7eb]"}`} />
            </a>
          </li>
        ))}
      </ul>
      {open !== null ? <PhotoViewer photos={photos} index={open} onIndex={setOpen} onClose={() => setOpen(null)} ct={ct} /> : null}
    </>
  )
}

function PhotoViewer({ photos, index, onIndex, onClose, ct }: { photos: { url: string; name: string }[]; index: number; onIndex: (i: number) => void; onClose: () => void; ct?: CheckoutT }) {
  const label = {
    close: ct ? ct("Close") : tt("Close"),
    previous: ct ? ct("Previous photo") : tt("Previous photo"),
    next: ct ? ct("Next photo") : tt("Next photo"),
    original: ct ? ct("Open the original") : tt("Open the original"),
  }
  const many = photos.length > 1
  const go = React.useCallback((step: number) => onIndex((index + step + photos.length) % photos.length), [index, onIndex, photos.length])
  const closeRef = React.useRef<HTMLButtonElement>(null)
  React.useEffect(() => {
    const was = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const overflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = overflow
      was?.focus?.()
    }
  }, [])
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
      else if (many && e.key === "ArrowRight") go(1)
      else if (many && e.key === "ArrowLeft") go(-1)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [go, many, onClose])
  const p = photos[index]
  if (!p || typeof document === "undefined") return null
  const round = "grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={p.name} className="fixed inset-0 z-[200] flex flex-col bg-[rgba(10,10,14,0.92)] pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]" onClick={onClose} data-photo-viewer="">
      <div className="flex shrink-0 items-center justify-between gap-3 px-3 py-2 text-white sm:px-5" onClick={(e) => e.stopPropagation()}>
        <a href={p.url} target="_blank" rel="noreferrer" className="min-w-0 truncate text-[13.5px] text-white/80 underline-offset-4 hover:text-white hover:underline">
          {photos.length > 1 ? `${index + 1} / ${photos.length} · ` : ""}
          {label.original}
        </a>
        <button ref={closeRef} type="button" onClick={onClose} aria-label={label.close} className={round}>
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-3 pb-4 sm:px-16">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={p.url} alt={p.name} className="max-h-full max-w-full rounded-[8px] object-contain" onClick={(e) => e.stopPropagation()} />
        {many ? (
          <>
            <button type="button" aria-label={label.previous} onClick={(e) => {
                e.stopPropagation()
                go(-1)
              }} className={`${round} absolute left-2 top-1/2 -translate-y-1/2 sm:left-4`}>
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </button>
            <button type="button" aria-label={label.next} onClick={(e) => {
                e.stopPropagation()
                go(1)
              }} className={`${round} absolute right-2 top-1/2 -translate-y-1/2 sm:right-4`}>
              <ChevronRight className="h-5 w-5" aria-hidden />
            </button>
          </>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}

/** A form body with the words and the photos, or JSON when there are none. */
export function caseRequestBody(fields: Record<string, string>, photos: PickedPhoto[]): { body: BodyInit; headers?: Record<string, string> } {
  if (!photos.length) return { body: JSON.stringify(fields), headers: { "Content-Type": "application/json" } }
  const form = new FormData()
  for (const [k, v] of Object.entries(fields)) form.set(k, v)
  for (const p of photos) form.append("photos", p.file, p.file.name)
  return { body: form }
}
