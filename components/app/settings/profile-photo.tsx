"use client"

/**
 * ===========================================================================
 *  THE PROFILE PHOTO, CHANGED WHERE IT IS
 * ===========================================================================
 * "Change should not take me to the creator page. It should let me upload
 * my profile photo right there, with a small uploading state and a small
 * appearing state, without glitches, without being too direct, and without
 * ruining the image."
 *
 * It is also the ONLY place that decides. Every other photo control in the
 * app (the OnePage editor, the creator page builder, both onboarding flows)
 * saves through the same route, so a change made in any of them is this one
 * photo changing (app/api/account/avatar, lib/account/profile-follow). There
 * is no per surface override to reset.
 *
 * Change opens the file picker. The picture is cut to its centre square and
 * drawn at 512px in the browser, so it is never stretched and never sent at
 * phone camera size, and that same picture is in the circle at once, faded
 * in over 200ms, a little dim, with a thin ring turning round its edge while
 * it uploads. When it is saved the dim lifts; if it fails the old photo comes
 * back and a line under the buttons says so. The circle never empties and
 * nothing moves around it.
 */
import { useEffect, useRef, useState } from "react"
import { confirmUpload } from "@/lib/storage/confirm-upload"
import { createClient } from "@/lib/supabase/client"
import { AppAvatar } from "@/components/app/app-avatar"
import { announceAvatar } from "@/lib/account/avatar-store"
import { secondaryDepth } from "@/components/ui/depth-button"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"

const SIDE = 512

/** The centre square of the picture at SIDE px, as a JPEG. Orientation from the file is honoured. */
async function squareOf(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions)
  const side = Math.min(bitmap.width, bitmap.height)
  const sx = (bitmap.width - side) / 2
  const sy = (bitmap.height - side) / 2
  const out = Math.min(SIDE, side)
  const canvas = document.createElement("canvas")
  canvas.width = out
  canvas.height = out
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("no canvas")
  ctx.imageSmoothingQuality = "high"
  /* A white ground, so a transparent PNG does not turn black as a JPEG. */
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, out, out)
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, out, out)
  bitmap.close?.()
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("no blob"))), "image/jpeg", 0.9),
  )
}

/**
 * Saved through app/api/account/avatar, which also marks the account as
 * having chosen, so signing in with Google again never brings its picture
 * back over a photo that was removed (lib/account/avatar).
 */
async function savePhoto(url: string | null) {
  const res = await fetch("/api/account/avatar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  }).catch(() => null)
  if (!res) throw new Error(tt("Could not reach Storelib. Check your connection and try again."))
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(data?.error || (url ? tt("The photo did not upload. Try again in a moment.") : tt("The photo was not removed. Try again in a moment.")))
  }
}

export function ProfilePhoto({
  userId,
  src,
  name,
  onChanged,
}: {
  userId: string
  src: string | null
  name: string
  /** The saved address, or null once removed. */
  onChanged: (url: string | null) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const previewRef = useRef<string | null>(null)
  useEffect(() => () => { if (previewRef.current) URL.revokeObjectURL(previewRef.current) }, [])

  const showPreview = (url: string | null) => {
    if (previewRef.current && previewRef.current !== url) URL.revokeObjectURL(previewRef.current)
    previewRef.current = url
    setPreview(url)
  }

  const choose = async (file: File | undefined) => {
    if (!file || busy) return
    setError(null)
    if (!/^image\/(jpeg|png|webp|gif|heic|heif)$/i.test(file.type) && !/\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name)) {
      setError(tt("Choose a JPG, PNG or WebP picture."))
      return
    }
    if (file.size > 15 * 1024 * 1024) {
      setError(tt("That picture is over 15MB. Choose a smaller one."))
      return
    }
    let blob: Blob
    try {
      blob = await squareOf(file)
    } catch {
      setError(tt("That picture could not be read. Try a JPG or PNG."))
      return
    }
    showPreview(URL.createObjectURL(blob))
    setBusy("upload")
    try {
      const supabase = createClient()
      /* The owner's folder first: storage only lets a person write there. */
      const path = `${userId}/avatar-${Date.now()}.jpg`
      const { error: uploadError } = await supabase.storage.from("avatars").upload(path, blob, { upsert: true, contentType: "image/jpeg" })
      if (uploadError) throw uploadError
      confirmUpload("avatars", path)
      const {
        data: { publicUrl },
      } = supabase.storage.from("avatars").getPublicUrl(path)
      await savePhoto(publicUrl)
      announceAvatar(publicUrl)
      onChanged(publicUrl)
    } catch (err) {
      console.error("[settings] photo not saved:", err)
      showPreview(null)
      setError(tt("The photo did not upload. Try again in a moment."))
    } finally {
      setBusy(null)
    }
  }

  const remove = async () => {
    if (busy) return
    setError(null)
    setBusy("remove")
    try {
      await savePhoto(null)
      showPreview(null)
      /* The header and the account sheet show the initials now, not the Google picture. */
      announceAvatar(null)
      onChanged(null)
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : tt("The photo was not removed. Try again in a moment."))
    } finally {
      setBusy(null)
    }
  }

  const uploading = busy === "upload"

  return (
    <div className="flex items-center gap-4" data-profile-photo="">
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={!!busy}
        aria-label={tt("Change profile photo")}
        className="relative h-16 w-16 shrink-0 cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/25 focus-visible:ring-offset-2 disabled:cursor-default sm:h-[72px] sm:w-[72px]"
      >
        {/* The shell's one avatar: a quiet circle while the photo comes, the photo fading in. */}
        <AppAvatar src={src || null} name={name} size={72} sizedByClass className="h-16 w-16 sm:h-[72px] sm:w-[72px]" />
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={preview}
            src={preview}
            alt=""
            data-photo-preview=""
            className={cn(
              "absolute inset-0 h-full w-full rounded-full object-cover animate-in fade-in-0 duration-200",
              "transition-[opacity,filter] duration-300 ease-out",
              uploading ? "opacity-70 saturate-[0.85]" : "opacity-100",
            )}
          />
        ) : null}
        {uploading ? (
          /* A thin ring turning round the edge: the upload, without covering the face. */
          <svg aria-hidden="true" viewBox="0 0 72 72" className="pointer-events-none absolute -inset-[3px] h-[calc(100%+6px)] w-[calc(100%+6px)] animate-spin [animation-duration:1.1s]">
            <circle cx="36" cy="36" r="34.5" fill="none" stroke="rgba(26,26,46,0.10)" strokeWidth="2" />
            <circle cx="36" cy="36" r="34.5" fill="none" stroke="#1a1a2e" strokeWidth="2" strokeLinecap="round" strokeDasharray="54 163" />
          </svg>
        ) : null}
      </button>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold text-[#1a1a2e]">{tt("Profile photo")}</p>
        <p className="mb-2 text-[13px] text-[#6b7280]" aria-live="polite">
          {uploading ? tt("Uploading…") : busy === "remove" ? tt("Removing…") : tt("JPG, PNG or WebP, cut to a square.")}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={!!busy}
            data-photo-change=""
            className={cn(secondaryDepth, "h-11 rounded-lg px-4 text-[13px] sm:h-9 sm:px-3")}
          >
            {src || preview ? tt("Change") : tt("Upload")}
          </button>
          {src || preview ? (
            <button
              type="button"
              onClick={() => void remove()}
              disabled={!!busy}
              className="h-11 rounded-lg px-3 text-[13px] font-medium text-[#6b7280] underline-offset-4 transition-colors hover:text-[#1a1a2e] hover:underline disabled:opacity-50 sm:h-9 sm:px-2"
            >
              {tt("Remove")}
            </button>
          ) : null}
        </div>
        {error ? (
          <p role="alert" className="mt-2 text-[12px] text-[#b42318]">
            {error}
          </p>
        ) : null}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ""
          void choose(file)
        }}
      />
    </div>
  )
}
