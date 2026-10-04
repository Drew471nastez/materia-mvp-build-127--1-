"use client"

/**
 * ===========================================================================
 *  THE PROFILE'S ONE PHOTO, CHANGED WHERE IT IS
 * ===========================================================================
 * The owner, about /account/settings: "the settings tab opens with the same
 * two profile pictures there, it looks ugly". The profile's header drew the
 * photo, and Settings' Profile card drew it again right under it, with its
 * Change and Remove.
 *
 * So there is one photo on the screen, the big one at the top of the
 * profile (components/account/account-hub.tsx), and on the Settings tab it
 * is the control: a small camera on its edge, a press on it opens the file
 * picker, and Change photo and Remove sit where Edit profile was. Settings'
 * Profile card keeps the name and nothing else.
 *
 * WHAT HAPPENS TO A PICTURE. The owner: "smooth and modern (picker, crop to
 * circle, upload progress, instant preview, no layout jump)". The picker,
 * then the picture under a circle to move and zoom (components/account/
 * photo-crop.tsx), cut there at 512px in the browser. Use photo puts it in
 * the circle at once, and a thin ring fills round its edge as the bytes go
 * up (lib/storage/upload-with-progress, the real number from the request)
 * under the owner's own folder; then it is saved through the one photo
 * route (app/api/account/avatar) and announced to every avatar in the shell
 * (lib/account/avatar-store.ts). A failure puts the old photo back and says
 * so under the buttons. The circle never empties, and the crop is a sheet
 * over the page, so nothing on the page moves.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { Camera } from "lucide-react"
import { AppAvatar } from "@/components/app/app-avatar"
import { confirmUpload } from "@/lib/storage/confirm-upload"
import { createClient } from "@/lib/supabase/client"
import { uploadWithProgress } from "@/lib/storage/upload-with-progress"
import { announceAvatar } from "@/lib/account/avatar-store"
import { cn } from "@/lib/utils"
import { PhotoCropSheet } from "./photo-crop"

/** The progress ring's length (2 * pi * 35). */
const RING = 219.91

/** The picture as the browser can draw it, orientation from the file honoured (a phone's portrait stays upright). */
async function bitmapOf(file: File): Promise<ImageBitmap> {
  return await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions)
}

/** The one photo route, which also marks the account as having chosen (lib/account/avatar). */
async function savePhoto(url: string | null) {
  const res = await fetch("/api/account/avatar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  }).catch(() => null)
  if (!res) throw new Error("Could not reach Storelib. Check your connection and try again.")
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(data?.error || (url ? "The photo did not upload. Try again in a moment." : "The photo was not removed. Try again in a moment."))
  }
}

export interface AccountPhoto {
  /** The picture just chosen, in the circle while it uploads and until the saved one is announced. */
  preview: string | null
  busy: "upload" | "remove" | null
  /** 0 to 100 while it uploads, from the request's own upload events; null otherwise. */
  progress: number | null
  error: string | null
  /** Opens the file picker. */
  pick: () => void
  remove: () => Promise<void>
  /** The hidden file input and the crop sheet when it is open; render it once. */
  input: ReactNode
}

export function useAccountPhoto(userId: string, onChanged: () => void): AccountPhoto {
  const inputRef = useRef<HTMLInputElement>(null)
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

  const [progress, setProgress] = useState<number | null>(null)
  /* The picture being placed in the crop sheet, while it is open. */
  const [placing, setPlacing] = useState<{ bitmap: ImageBitmap; src: string } | null>(null)
  const closePlacing = useCallback(() => {
    setPlacing((current) => {
      if (current) {
        URL.revokeObjectURL(current.src)
        current.bitmap.close?.()
      }
      return null
    })
  }, [])

  const choose = async (file: File | undefined) => {
    if (!file || busy) return
    setError(null)
    if (!/^image\/(jpeg|png|webp|gif|heic|heif)$/i.test(file.type) && !/\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name)) {
      setError("Choose a JPG, PNG or WebP picture.")
      return
    }
    if (file.size > 15 * 1024 * 1024) {
      setError("That picture is over 15MB. Choose a smaller one.")
      return
    }
    try {
      const bitmap = await bitmapOf(file)
      setPlacing({ bitmap, src: URL.createObjectURL(file) })
    } catch {
      setError("That picture could not be read. Try a JPG or PNG.")
    }
  }

  /* Use photo: in the circle at once, then up, with the ring filling as it goes. */
  const upload = async (blob: Blob) => {
    closePlacing()
    showPreview(URL.createObjectURL(blob))
    setBusy("upload")
    setProgress(0)
    try {
      /* The owner's folder first: storage only lets a person write there. */
      const path = `${userId}/avatar-${Date.now()}.jpg`
      await uploadWithProgress("avatars", path, blob, { upsert: true, contentType: "image/jpeg", onProgress: (p) => setProgress(Math.min(100, Math.max(0, p))) })
      confirmUpload("avatars", path)
      const {
        data: { publicUrl },
      } = createClient().storage.from("avatars").getPublicUrl(path)
      await savePhoto(publicUrl)
      announceAvatar(publicUrl)
      onChanged()
    } catch (err) {
      console.error("[account] photo not saved:", err)
      showPreview(null)
      setError("The photo did not upload. Try again in a moment.")
    } finally {
      setBusy(null)
      setProgress(null)
    }
  }

  const remove = async () => {
    if (busy) return
    setError(null)
    setBusy("remove")
    try {
      await savePhoto(null)
      showPreview(null)
      /* The header and the account sheet show the default face now, not the Google picture. */
      announceAvatar(null)
      onChanged()
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "The photo was not removed. Try again in a moment.")
    } finally {
      setBusy(null)
    }
  }

  const pick = useCallback(() => inputRef.current?.click(), [])

  const input = (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif"
        className="hidden"
        data-account-photo-input=""
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ""
          void choose(file)
        }}
      />
      {placing ? <PhotoCropSheet bitmap={placing.bitmap} src={placing.src} onCancel={closePlacing} onDone={(blob) => void upload(blob)} /> : null}
    </>
  )

  return { preview, busy, progress, error, pick, remove, input }
}

/**
 * The circle. On the profile it is a picture and is handed no `photo` at
 * all; in Settings' Profile section it is the control, with a small camera
 * on its edge and a press on it opening the picker.
 */
export function AccountAvatar({
  src,
  name,
  photo,
  editable,
  className,
  size,
}: {
  src: string | null
  name: string
  photo?: AccountPhoto
  editable?: boolean
  className: string
  size: number
}) {
  const uploading = photo?.busy === "upload"
  return (
    <div className={cn("relative shrink-0 rounded-full", className)} data-account-avatar="">
      <AppAvatar src={src} name={name || "You"} alt="" size={size} sizedByClass className="h-full w-full" />
      {photo?.preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={photo.preview}
          src={photo.preview}
          alt=""
          data-photo-preview=""
          className={cn(
            "absolute inset-0 h-full w-full rounded-full object-cover animate-in fade-in-0 duration-200",
            "transition-[opacity,filter] duration-300 ease-out",
            uploading ? "opacity-85" : "opacity-100",
          )}
        />
      ) : null}
      {uploading ? (
        /* A thin ring filling round the edge as the bytes go up: the upload, without covering the face. */
        <svg aria-hidden="true" viewBox="0 0 72 72" className="pointer-events-none absolute -inset-[3px] h-[calc(100%+6px)] w-[calc(100%+6px)] -rotate-90" data-photo-progress={photo?.progress ?? ""}>
          <circle cx="36" cy="36" r="35" fill="none" stroke="rgba(26,26,46,0.10)" strokeWidth="1.5" />
          <circle
            cx="36"
            cy="36"
            r="35"
            fill="none"
            stroke="#1a1a2e"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeDasharray={RING}
            strokeDashoffset={RING * (1 - Math.max(0.04, (photo?.progress ?? 0) / 100))}
            className="transition-[stroke-dashoffset] duration-150 ease-linear motion-reduce:transition-none"
          />
        </svg>
      ) : null}
      {editable && photo ? (
        <button
          type="button"
          onClick={photo.pick}
          disabled={!!photo.busy}
          aria-label="Change profile photo"
          data-account-avatar-edit=""
          className="absolute inset-0 cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/25 focus-visible:ring-offset-2 disabled:cursor-default [-webkit-tap-highlight-color:transparent]"
        />
      ) : null}
      {/* The camera: only where the photo is the control. */}
      <span
        aria-hidden="true"
        data-account-avatar-camera=""
        className={cn(
          /*
            A BADGE, NOT A SECOND BUTTON. At 32px with a 3px ring it took
            most of one quadrant of the photo and read as the loudest thing
            in the card: "the photo icon there is too big in the profile
            avatar circle in the settings". 26px with a 2.5px ring, and the
            glyph a little smaller with it, so it still says the photo can
            be changed without competing with the face behind it.
          */
          "pointer-events-none absolute bottom-0 right-0 flex h-[26px] w-[26px] items-center justify-center rounded-full bg-[#1a1a2e] text-white ring-[2.5px] ring-[#fafafa]",
          "transition-[opacity,scale] duration-150 ease-out motion-reduce:transition-none",
          editable ? "scale-100 opacity-100" : "scale-75 opacity-0",
        )}
      >
        <Camera className="h-[13px] w-[13px]" strokeWidth={2} />
      </span>
    </div>
  )
}
