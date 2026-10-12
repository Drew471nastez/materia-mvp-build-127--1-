"use client"

/**
 * PHOTOS WITH A MESSAGE TO THE SHOP: pick up to four, see them, take one
 * out. A phone's photo is made smaller here first (at most 1800 pixels
 * across, JPEG), so four of them stay well under what a request may carry;
 * the server checks each again (lib/support/case-photos-server.ts) and
 * strips its location before it is kept.
 */
import * as React from "react"
import { ImagePlus, X } from "lucide-react"
import { CASE_PHOTO_TYPES, MAX_CASE_PHOTOS, MAX_CASE_PHOTO_BYTES } from "@/lib/support/cases"

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

export function useCasePhotos() {
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
    if (files.length > room) setError(`Up to ${MAX_CASE_PHOTOS} photos with a message.`)
    const next: PickedPhoto[] = []
    for (const f of files.slice(0, Math.max(0, room))) {
      if (!(CASE_PHOTO_TYPES as readonly string[]).includes(f.type)) {
        setError(`${f.name} isn't a photo. Use a JPEG, PNG, WebP or GIF.`)
        continue
      }
      const s = await smaller(f)
      if (s.size > MAX_CASE_PHOTO_BYTES) {
        setError(`${f.name} is too large. A photo can be up to 8 MB.`)
        continue
      }
      next.push({ file: s, preview: URL.createObjectURL(s) })
    }
    const total = [...photos, ...next].reduce((n, p) => n + p.file.size, 0)
    if (total > MAX_CASE_PHOTOS_TOTAL) {
      next.forEach((p) => URL.revokeObjectURL(p.preview))
      return setError("These photos are too large together. Send fewer, or smaller ones.")
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

export function CasePhotoPicker({ state, disabled }: { state: ReturnType<typeof useCasePhotos>; disabled?: boolean }) {
  const input = React.useRef<HTMLInputElement>(null)
  return (
    <div data-case-photos="">
      {state.photos.length ? (
        <ul className="mb-2 flex flex-wrap gap-2">
          {state.photos.map((p, i) => (
            <li key={p.preview} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.preview} alt="" className="h-16 w-16 rounded-lg border border-[#e5e7eb] object-cover" />
              <button type="button" onClick={() => state.remove(i)} aria-label="Remove photo" className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full bg-[#1a1a2e] text-white">
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {state.photos.length < MAX_CASE_PHOTOS ? (
        <button type="button" disabled={disabled} onClick={() => input.current?.click()} className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-dashed border-[#c9cdd3] px-3 text-[13.5px] font-medium text-[#4b5563] hover:bg-[#f8f9fa] disabled:opacity-60" data-case-photos-add="">
          <ImagePlus className="h-4 w-4" aria-hidden />
          {state.photos.length ? "Add another photo" : "Add photos"}
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

/** A message's photos in a thread: small, each opening full size in a new tab. */
export function CasePhotoStrip({ photos, dark }: { photos?: { url: string; name: string }[]; dark?: boolean }) {
  if (!photos?.length) return null
  return (
    <ul className="mt-2 flex flex-wrap gap-2" data-message-photos="">
      {photos.map((p) => (
        <li key={p.url}>
          <a href={p.url} target="_blank" rel="noreferrer" className="block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt={p.name} className={`h-20 w-20 rounded-lg object-cover ${dark ? "border border-white/20" : "border border-[#e5e7eb]"}`} />
          </a>
        </li>
      ))}
    </ul>
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
