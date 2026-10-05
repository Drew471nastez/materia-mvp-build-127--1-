"use client"

import type React from "react"
import { confirmUpload } from "@/lib/storage/confirm-upload"
import { useState, useRef, useCallback, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { X, ImageIcon, AlertCircle, Video, Pencil } from "lucide-react"
import Image from "next/image"
import { COMPRESS_PROFILES, compressImage } from "@/lib/images/compress"
import { DEFAULT_COVER_CROP, coverEditorSrc, isDefaultCrop, type CoverCrop } from "@/lib/images/cover-crop"
import { CoverCropFrame } from "@/components/app/cover-crop-frame"
import { uploadWithProgress } from "@/lib/storage/upload-with-progress"

interface ImageUploadProps {
  bucket: "product-images" | "avatars" | "covers" | "store-builder-images"
  folder?: string
  value?: string
  onChange: (url: string | null) => void
  aspectRatio?: "square" | "video" | "cover" | "compact"
  maxSizeMB?: number
  accept?: "image/*" | "video/*"
  /**
   * "You can change this, you cannot empty it."
   *
   * The default state puts a red destructive button in the corner of whatever
   * you uploaded, which is the wrong offer for an avatar or a cover: there is
   * no such thing as a profile with no picture, only one with a different
   * picture. Deleting it leaves a hole nobody wanted, and a red button on a
   * photo you just chose reads as a warning about the photo.
   *
   * With this set the image itself is the control — click it and pick another
   * — and there is no delete at all.
   */
  replaceOnly?: boolean
  /** Overlay label on hover, e.g. "Change banner". */
  replaceLabel?: string
  /**
   * Adds a quiet remove control alongside replace-only mode.
   *
   * An avatar has no empty state worth offering — a profile without a picture
   * is not a thing anyone wants. A BANNER does: plenty of pages look better
   * with none, so removing it is a real choice and needs a way to make it.
   */
  allowRemove?: boolean
  /**
   * TURNS THE FRAME INTO THE REPOSITIONER.
   *
   * A cover is drawn into a 3:1 strip, so most of the picture is cropped
   * away and which part survives is worth choosing. That used to be a second
   * 3:1 box under this one, showing the same photograph again — two pictures
   * of the same picture, with nothing to say which was the real one.
   *
   * Given this, the frame itself is the control: drag the image inside it and
   * the crop follows, in the box that is already showing the crop. Replace
   * and remove move to corner controls, because a click that might be the
   * start of a drag cannot also open a file dialog.
   *
   * Replace-only mode with a value, which is what a cover is. Absent, the
   * frame behaves exactly as it did.
   *
   * The crop is the position AND the zoom (lib/images/cover-crop): one
   * finger moves, two pinch. `editable: false` still draws the saved crop,
   * so the frame shows what the page shows, and a press replaces the
   * picture instead.
   */
  reposition?: {
    value: CoverCrop | null | undefined
    onChange: (next: CoverCrop) => void
    /** Whether a finger moves the picture. Off, the frame shows the crop and a press may replace it. */
    editable?: boolean
    /** When `editable` is false, a tap on the frame opens the file picker. Off, only the corner controls do. */
    replaceOnTap?: boolean
    /**
     * The shape of the band this picture will really be drawn into, measured
     * from the page rather than assumed. A crop depends only on the ratio of
     * the frame to the image, so a frame of the same shape previews it
     * exactly; a frame of a different shape previews a different picture,
     * which is what a flat 3:1 here was doing.
     */
    aspect?: number
  }
  /**
   * THE PICKED PICTURE, AT ONCE, COMING INTO FOCUS. Replace-only images
   * (the profile's cover and picture) show the chosen file the moment it is
   * chosen, soft and a little blurred, sharpening as its bytes actually go
   * up (real progress, from lib/storage/upload-with-progress), with a
   * hairline along its foot. The uploaded copy takes over only once it is
   * decoded and painted, so nothing flashes when it lands. The product
   * editor's photo grid is the same idea (app/app/products/new/media-grid).
   * Off by default: every other caller keeps the bar it has.
   */
  livePreview?: boolean
  /**
   * WITH NO PICTURE YET, THE BAND IT WILL FILL. A cover with `reposition`
   * and nothing chosen draws the band's own shape (`reposition.aspect`) in
   * the quiet grey a profile shows without a cover, with one plain button
   * in it, rather than the dashed "click to upload" box. A press anywhere or
   * a picture dropped on it starts the same upload. Opt in: every other
   * caller keeps the box it has.
   */
  emptyBand?: { label: string; hint?: string }
}

/** A picture on its way up: its own preview, and how far the upload has got. */
interface Pending {
  url: string
  /** 0..100 */
  progress: number
  /** The upload is done and the parent has the new URL; the preview waits for it to paint. */
  handedOver: boolean
}

/**
 * Held until the uploaded copy can paint at once, never longer than 4s: the
 * same wait the product editor's photos use, so the swap is not a flash.
 */
function warm(url: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new window.Image()
    const done = () => resolve()
    const timer = window.setTimeout(done, 4000)
    img.onload = () => {
      window.clearTimeout(timer)
      ;(img.decode ? img.decode().catch(() => {}) : Promise.resolve()).then(done)
    }
    img.onerror = () => { window.clearTimeout(timer); done() }
    img.decoding = "async"
    img.src = url
  })
}

/**
 * THE PENDING PICTURE'S OWN LAYERS, drawn over whatever frame it is in: a
 * blurred copy that fades as the upload goes, a sheen, and the hairline.
 * Only opacity and transform change, so it animates on the compositor.
 */
function PendingVeil({ pending, fading }: { pending: Pending; fading?: boolean }) {
  const p = Math.max(0, Math.min(100, pending.progress)) / 100
  return (
    <span
      aria-hidden={fading || undefined}
      data-upload-pending=""
      className="pointer-events-none absolute inset-0 overflow-hidden transition-opacity duration-200 ease-out"
      style={{ opacity: fading ? 0 : 1 }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- a local blob preview, not a remote image */}
      <img
        src={pending.url}
        alt=""
        draggable={false}
        className="absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ease-out motion-reduce:transition-none"
        style={{ filter: "blur(14px) saturate(0.75) brightness(0.96)", transform: "scale(1.08)", opacity: Math.max(0, 1 - p) }}
      />
      <span className="absolute inset-y-0 -left-1/2 w-1/2 animate-[media-sheen_1.6s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/25 to-transparent motion-reduce:hidden" />
      <span
        role="progressbar"
        aria-label="Uploading"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pending.progress)}
        className="absolute inset-x-2.5 bottom-2.5 h-[3px] overflow-hidden rounded-full bg-white/35 shadow-[0_1px_2px_rgba(0,0,0,0.15)]"
      >
        <span
          className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-white transition-transform duration-300 ease-out motion-reduce:transition-none"
          data-keep-transform=""
          style={{ transform: `scaleX(${p.toFixed(3)})` }}
        />
      </span>
    </span>
  )
}

export function ImageUpload({
  bucket,
  folder = "",
  value,
  onChange,
  aspectRatio = "video",
  maxSizeMB = 5,
  accept = "image/*",
  replaceOnly = false,
  replaceLabel = "Change image",
  allowRemove = false,
  reposition,
  livePreview = false,
  emptyBand,
}: ImageUploadProps) {
  const isVideoMode = accept === "video/*"
  const [uploading, setUploading] = useState(false)
  const [pending, setPending] = useState<Pending | null>(null)
  /* The pending preview's blob URL is released once nothing shows it. */
  const pendingUrl = useRef<string | null>(null)
  const clearPending = useCallback(() => {
    setPending(null)
    const url = pendingUrl.current
    pendingUrl.current = null
    if (url) window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }, [])
  useEffect(() => () => { if (pendingUrl.current) URL.revokeObjectURL(pendingUrl.current) }, [])
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const aspectClasses = {
    square: "aspect-square",
    video: "aspect-video",
    cover: "aspect-[3/1]",
    /* An "add another" box, not a preview: one line of text and an icon. */
    compact: "min-h-[104px]",
  }

  const isCover = !!reposition

  /**
   * THE HAND-OVER. The parent has the uploaded URL and the frame is drawing
   * it: a cover's frame loads exactly the URL `warm` decoded, so it paints
   * on the first frame and the veil fades off it. The avatar is a next/image
   * with its own srcset, which `warm` cannot guess, so its preview stays on
   * top until that image says it has loaded (`landed`), then fades.
   */
  const [landed, setLanded] = useState(false)
  useEffect(() => {
    if (!pending?.handedOver) { setLanded(false); return }
    if (!isCover && !landed) {
      /* An image that never reports (an error, a stalled optimiser) does not keep the preview forever. */
      const t = window.setTimeout(() => setLanded(true), 6000)
      return () => window.clearTimeout(t)
    }
    const t = window.setTimeout(clearPending, 220)
    return () => window.clearTimeout(t)
  }, [pending?.handedOver, landed, isCover, clearPending])

  const handleUpload = useCallback(
    async (file: File) => {
      setError(null)
      setUploading(true)
      setProgress(0)

      // Validate file type
      if (isVideoMode) {
        if (!file.type.startsWith("video/")) {
          setError("Please upload a video file")
          setUploading(false)
          return
        }
      } else {
        if (!file.type.startsWith("image/")) {
          setError("Please upload an image file")
          setUploading(false)
          return
        }
      }

      // Validate file size
      const maxBytes = maxSizeMB * 1024 * 1024
      if (file.size > maxBytes) {
        setError(`${isVideoMode ? "Video" : "Image"} must be under ${maxSizeMB}MB`)
        setUploading(false)
        return
      }

      try {
        // For video uploads, use direct upload via API to bypass RLS issues
        if (isVideoMode) {
          setProgress(10)

          // Try direct upload via PUT endpoint first (more reliable)
          const formData = new FormData()
          formData.append("file", file)
          formData.append("folder", folder)
          formData.append("bucket", "product-videos")

          // Simulate progress during upload
          const progressInterval = setInterval(() => {
            setProgress((prev) => Math.min(prev + 3, 85))
          }, 300)

          try {
            const uploadResponse = await fetch("/api/storage/upload-video", {
              method: "PUT",
              body: formData,
            })

            clearInterval(progressInterval)

            if (!uploadResponse.ok) {
              const errorData = await uploadResponse.json()
              throw new Error(errorData.error || "Upload failed")
            }

            const { publicUrl } = await uploadResponse.json()

            setProgress(100)
            console.log("[v0] Video upload successful, URL:", publicUrl)
            onChange(publicUrl)
          } catch (directUploadErr) {
            clearInterval(progressInterval)
            console.error("[v0] Direct upload failed, trying signed URL method:", directUploadErr)

            // Fallback to signed URL method
            setProgress(10)

            const signedUrlResponse = await fetch("/api/storage/upload-video", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                filename: file.name,
                contentType: file.type,
                folder: folder,
                bucket: "product-videos",
              }),
            })

            if (!signedUrlResponse.ok) {
              const errorData = await signedUrlResponse.json()
              throw new Error(errorData.error || "Failed to get upload URL")
            }

            const { token, path, publicUrl, bucket } = await signedUrlResponse.json()

            setProgress(20)

            const supabase = createClient()

            const fallbackProgressInterval = setInterval(() => {
              setProgress((prev) => Math.min(prev + 5, 90))
            }, 500)

            try {
              const { error: uploadError } = await supabase.storage
                .from(bucket)
                .uploadToSignedUrl(path, token, file, {
                  contentType: file.type,
                  upsert: true,
                })

              clearInterval(fallbackProgressInterval)

              if (uploadError) {
                console.error("[v0] Signed URL upload error:", uploadError)
                throw uploadError
              }

              /* A signed upload URL cannot limit what went through it, so the
                 server reads the bytes it got and checks them
                 (lib/storage/confirm-upload.ts). Nothing here waits. */
              confirmUpload(bucket, path)
              setProgress(100)
              console.log("[v0] Video upload successful via signed URL, URL:", publicUrl)
              onChange(publicUrl)
            } catch (signedUploadErr) {
              clearInterval(fallbackProgressInterval)
              throw signedUploadErr
            }
          }
        } else {
          /**
           * RESIZED BEFORE IT LEAVES THE BROWSER.
           *
           * Nothing used to touch the file: a phone camera JPEG went to
           * storage at 4032×3024 and four megabytes, and came back at four
           * megabytes to be painted into a 137px avatar. Serving it through
           * Next's optimizer hides that from the viewer, but the origin object
           * is still four megabytes — it costs storage, it costs the optimizer
           * a slow first fetch, and anything reading the original pays again.
           *
           * The size is chosen per bucket because the right size is a fact
           * about where the image is shown. An unknown bucket, or an SVG, or a
           * file that comes out bigger than it went in, passes through
           * untouched — see lib/images/compress.ts.
           */
          /* Shown now, before anything is compressed or sent. */
          const live = livePreview && replaceOnly
          if (live) {
            if (pendingUrl.current) URL.revokeObjectURL(pendingUrl.current)
            const url = URL.createObjectURL(file)
            pendingUrl.current = url
            /* Decoded first, so the frame never shows an empty box between the old picture and this one. */
            await warm(url)
            setPending({ url, progress: 0, handedOver: false })
          }
          const profile = COMPRESS_PROFILES[bucket]
          const upload = profile ? await compressImage(file, profile) : file
          if (upload !== file) {
            console.log(
              `[v0] Compressed ${(file.size / 1024).toFixed(0)}KB → ${(upload.size / 1024).toFixed(0)}KB`,
            )
          }

          // For image uploads, use the standard Supabase client
          const supabase = createClient()

          const {
            data: { user },
          } = await supabase.auth.getUser()

          if (!user) {
            throw new Error("You must be logged in to upload images")
          }

          // Generate unique path with user folder
          const timestamp = Date.now()
          // The compressed file's own extension, not the original's — the
          // bytes are WebP now and a path ending .heic would be a lie that
          // some CDNs and every "download this" flow act on.
          const ext = upload.name.split(".").pop()
          const safeName = `${timestamp}.${ext}`
          const filePath = folder ? `${user.id}/${folder}/${safeName}` : `${user.id}/${safeName}`

          console.log("[v0] Uploading to bucket:", bucket, "path:", filePath)

          setProgress(30)

          // Upload to Supabase Storage
          /**
           * A YEAR, not an hour.
           *
           * Every path here is `<user>/<timestamp>.<ext>` — a new upload is a
           * new URL, always. So the bytes at any given URL never change, and
           * an hour's cache meant a visitor who came back tomorrow downloaded
           * the whole cover again for no reason. That is the other half of
           * "sometimes it takes very long to load": sometimes was after the
           * hour was up.
           */
          if (live) {
            /* The real number, so the picture sharpens as the bytes go (lib/storage/upload-with-progress). */
            await uploadWithProgress(bucket, filePath, upload, {
              cacheControl: "31536000",
              contentType: upload.type,
              upsert: true,
              onProgress: (percent) => setPending((p) => (p ? { ...p, progress: Math.min(96, percent) } : p)),
            })
          } else {
            const { error: uploadError } = await supabase.storage.from(bucket).upload(filePath, upload, {
              cacheControl: "31536000",
              contentType: upload.type,
              upsert: true,
            })

            if (uploadError) {
              console.error("[v0] Upload error:", uploadError)
              throw uploadError
            }
          }
          confirmUpload(bucket, filePath)

          setProgress(70)

          // Get public URL
          const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(filePath)

          console.log("[v0] Upload successful, URL:", urlData.publicUrl)

          setProgress(100)
          if (live) {
            setPending((p) => (p ? { ...p, progress: 100 } : p))
            /* The copy the frame will ask for, decoded before it is asked for. */
            await warm(reposition ? coverEditorSrc(urlData.publicUrl) : urlData.publicUrl)
            setPending((p) => (p ? { ...p, handedOver: true } : p))
          }
          onChange(urlData.publicUrl)
        }
      } catch (err) {
        if (livePreview) clearPending()
        console.error("[v0] Upload error:", err)
        // Handle specific Supabase storage errors
        const errorMessage = err instanceof Error ? err.message : String(err)
        if (errorMessage.toLowerCase().includes("exceeded the maximum allowed size") ||
            errorMessage.toLowerCase().includes("payload too large") ||
            errorMessage.toLowerCase().includes("file too large")) {
          setError(`${isVideoMode ? "Video" : "File"} is too large. Please use a file under ${maxSizeMB}MB.`)
        } else {
          setError(err instanceof Error ? err.message : `Failed to upload ${isVideoMode ? "video" : "image"}`)
        }
      } finally {
        setUploading(false)
        setProgress(0)
      }
    },
    [bucket, folder, maxSizeMB, onChange, isVideoMode, livePreview, replaceOnly, isCover, clearPending],
  )

  /**
   * REMOVING IS A CHANGE TO THE FORM, NOT TO STORAGE.
   *
   * This used to delete the file from the bucket the moment the X was
   * pressed, before anything was saved. Every caller is a form with a Cancel
   * or a draft: the profile sheet, a product before Save, a builder draft
   * whose PUBLISHED page still points at the picture. Remove, then Cancel,
   * and the saved page was left pointing at a file that no longer existed:
   * a broken cover on the live page. The picture now leaves the form only;
   * the file stays where the saved record can still reach it.
   */
  const handleRemove = useCallback(() => {
    if (!value) return
    onChange(null)
  }, [value, onChange])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file) handleUpload(file)
    },
    [handleUpload],
  )

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) handleUpload(file)
    },
    [handleUpload],
  )

  /**
   * ===========================================================================
   *  THE FRAME IS THE REPOSITIONER
   * ===========================================================================
   * One box, not two: this is the 3:1 crop the page will draw, and dragging
   * inside it moves the picture behind that crop. Nothing under it — no
   * second preview, no slider, no readout. What you see is the result.
   *
   * The whole surface cannot be the replace button here, because a press that
   * might be the start of a drag cannot also open a file dialog, so replace
   * and remove are discs in the corner. They stay visible rather than
   * appearing on hover: there is no hover on a phone, and on a phone the
   * frame itself no longer answers a tap.
   */
  if ((value || pending) && replaceOnly && reposition) {
    /* A picture on its way up is drawn from the middle at its own size, as it will be saved. */
    const showingPending = !!pending && !pending.handedOver
    const crop = showingPending ? DEFAULT_COVER_CROP : reposition.value ?? DEFAULT_COVER_CROP
    const editable = reposition.editable === true && !showingPending
    const replaceOnTap = reposition.replaceOnTap !== false
    /* 44px to a thumb, 32px to the eye: the disc is small, its target is not. */
    const disc =
      "relative flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white transition-colors before:absolute before:-inset-1.5 before:content-[''] pointer-fine:hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
    return (
      <div className="space-y-2">
        <CoverCropFrame
          src={showingPending || !value ? pending!.url : coverEditorSrc(value)}
          crop={crop}
          onChange={editable && !uploading ? reposition.onChange : undefined}
          onActivate={editable || !replaceOnTap ? undefined : () => !uploading && inputRef.current?.click()}
          aspect={reposition.aspect ?? 3}
          label={replaceLabel}
        >
          {/*
            Only once it has been moved. A reset on a picture that is already
            where it started is a control with nothing to do.
          */}
          {editable && !isDefaultCrop(crop) && !uploading && (
            <button
              type="button"
              onClick={() => reposition.onChange(DEFAULT_COVER_CROP)}
              className="absolute bottom-2 left-2 h-8 rounded-full bg-black/60 px-3 text-[12px] font-medium text-white transition-colors pointer-fine:hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              Reset
            </button>
          )}

          <div className="absolute right-2 top-2 flex items-center gap-2">
            <button
              type="button"
              aria-label={replaceLabel}
              onClick={() => !uploading && inputRef.current?.click()}
              className={disc}
            >
              <Pencil className="h-3.5 w-3.5" strokeWidth={2.25} />
            </button>
            {allowRemove && !uploading && (
              <button type="button" aria-label="Remove image" onClick={handleRemove} className={disc}>
                <X className="h-3.5 w-3.5" strokeWidth={2.25} />
              </button>
            )}
          </div>

          {/*
            UPLOADING, WITHOUT A WASH. The picture that is there stays exactly
            as it is, clean, and a thin bar along its bottom edge says how far
            the new one has got. A dark veil over the whole frame was the
            loudest thing on the sheet for the length of every upload.
          */}
          {pending && <PendingVeil pending={pending} fading={pending.handedOver} />}
          {uploading && !pending && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] bg-black/15" role="progressbar" aria-label="Uploading" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
              <div
                className="h-full origin-left bg-white transition-transform duration-200 ease-out"
                data-keep-transform=""
                style={{ transform: `scaleX(${Math.max(progress, 8) / 100})` }}
              />
            </div>
          )}
        </CoverCropFrame>
        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}
        <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={handleFileSelect} />
      </div>
    )
  }

  if (emptyBand && reposition && !value && !pending) {
    return (
      <div className="space-y-2">
        <div
          role="button"
          tabIndex={0}
          aria-label={emptyBand.label}
          data-upload-empty-band=""
          onClick={() => !uploading && inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault()
              if (!uploading) inputRef.current?.click()
            }
          }}
          onDrop={handleDrop}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={(e) => {
            e.preventDefault()
            setDragOver(false)
          }}
          style={{ aspectRatio: String(reposition.aspect ?? 3) }}
          className={`group/band relative flex w-full cursor-pointer items-center justify-center overflow-hidden rounded-xl bg-[radial-gradient(120%_140%_at_50%_0%,#f4f5f7_0%,#e7e9ed_100%)] outline-none ring-1 ring-inset transition-[box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/25 ${
            dragOver ? "ring-[#1a1a2e]/30" : "ring-black/[0.06]"
          }`}
        >
          <span className="pointer-events-none flex flex-col items-center gap-1 px-4 text-center">
            <span className="inline-flex h-9 items-center gap-2 rounded-[10px] border border-[#e4e7ec] bg-white px-3.5 text-[13px] font-medium text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.06)] transition-[scale] duration-150 group-active/band:scale-[0.97] motion-reduce:transition-none">
              <ImageIcon className="h-4 w-4 text-[#4b5563]" strokeWidth={1.9} aria-hidden />
              {dragOver ? "Drop it here" : emptyBand.label}
            </span>
            {emptyBand.hint ? <span className="text-[12px] leading-[1.4] text-[#6b7280] max-[380px]:hidden">{emptyBand.hint}</span> : null}
          </span>
        </div>
        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}
        <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={handleFileSelect} />
      </div>
    )
  }

  if ((value || pending) && replaceOnly) {
    return (
      <div
        role="button"
        tabIndex={0}
        aria-label={replaceLabel}
        onClick={() => !uploading && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            if (!uploading) inputRef.current?.click()
          }
        }}
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={(e) => {
          e.preventDefault()
          setDragOver(false)
        }}
        className={`group relative cursor-pointer overflow-hidden rounded-lg border transition-colors ${
          dragOver ? "border-blue-500" : "border-border"
        } ${aspectClasses[aspectRatio]}`}
      >
        {/* Eager: this is a preview inside a sheet that starts below the
            screen, and a lazy image there loads as the sheet arrives. Sized
            for the frame, not for the whole window. */}
        {value && (
          <Image
            /* A new picture is a new element, so `onLoad` below is the new one's. */
            key={value}
            src={value || "/placeholder.svg"}
            alt=""
            fill
            loading="eager"
            sizes={aspectRatio === "square" ? "(max-width: 640px) 40vw, 240px" : "(max-width: 640px) 100vw, 520px"}
            className="object-cover"
            onLoad={() => { if (pending?.handedOver) setLanded(true) }}
            onError={() => { if (pending?.handedOver) setLanded(true) }}
          />
        )}

        {/* The chosen picture, sharp underneath its own veil, until the uploaded copy has painted. */}
        {pending && (
          <span className="pointer-events-none absolute inset-0 transition-opacity duration-200 ease-out" style={{ opacity: pending.handedOver && landed ? 0 : 1 }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- a local blob preview */}
            <img src={pending.url} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
            <PendingVeil pending={pending} fading={pending.handedOver} />
          </span>
        )}

        {/* The whole image is the button; the label only appears under a
            mouse. A finger has no hover, and on a phone that answers "yes" to
            hover anyway the wash stuck to the picture after the tap. */}
        <div
          className={`absolute inset-0 flex items-center justify-center bg-black/0 text-sm font-medium text-white opacity-0 transition-all duration-200 pointer-fine:group-hover:bg-black/45 pointer-fine:group-hover:opacity-100 group-focus-visible:bg-black/45 group-focus-visible:opacity-100 ${
            dragOver ? "bg-black/45 opacity-100" : ""
          }`}
        >
          {replaceLabel}
        </div>

        {/* Uploading: the old picture stays put under a dim wash and a bar,
            rather than the frame emptying out and jumping back. (Not with a
            live preview, which is its own state: see PendingVeil.) */}
        {uploading && !pending && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/55 backdrop-blur-[1px]">
            <div className="h-1 w-2/3 overflow-hidden rounded-full bg-white/25">
              <div
                className="h-full rounded-full bg-white transition-[width] duration-200 ease-out"
                style={{ width: `${Math.max(progress, 8)}%` }}
              />
            </div>
            <span className="text-xs font-medium text-white/90">Uploading…</span>
          </div>
        )}

        {/*
          The remove control, when there is one. A small dark disc with a thin
          × — not the old destructive-red button, which shouted "danger" about
          a photo somebody had just chosen. It appears with the hover overlay
          rather than sitting on the image permanently.
        */}
        {allowRemove && !uploading && (
          <button
            type="button"
            aria-label="Remove image"
            onClick={(e) => {
              e.stopPropagation()
              handleRemove()
            }}
            className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white opacity-0 backdrop-blur-sm transition-all duration-200 hover:bg-black/75 focus-visible:opacity-100 focus-visible:outline-none group-hover:opacity-100"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2.25} />
          </button>
        )}

        <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={handleFileSelect} />
      </div>
    )
  }

  if (value) {
    return (
      <div className={`relative overflow-hidden rounded-lg border border-border ${aspectClasses[aspectRatio]}`}>
        <Image src={value || "/placeholder.svg"} alt="Uploaded image" fill className="object-cover" />
        <Button
          type="button"
          variant="destructive"
          size="icon"
          className="absolute right-2 top-2 h-8 w-8"
          onClick={handleRemove}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div
        className={`relative flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed transition-colors ${aspectClasses[aspectRatio]} ${
          dragOver ? "border-blue-500 bg-blue-500/5" : "border-border hover:border-muted-foreground/50"
        } ${uploading ? "pointer-events-none opacity-50" : ""}`}
        onClick={() => inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={(e) => {
          e.preventDefault()
          setDragOver(false)
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={handleFileSelect}
          disabled={uploading}
        />
        {uploading ? (
          <div className="flex flex-col items-center gap-2 p-4">
            <Progress value={progress} className="h-2 w-32" />
            <p className="text-sm text-muted-foreground">Uploading... {progress}%</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              {isVideoMode ? (
                <Video className="h-6 w-6 text-muted-foreground" />
              ) : (
                <ImageIcon className="h-6 w-6 text-muted-foreground" />
              )}
            </div>
            <p className="text-sm font-medium">Click to upload{!isVideoMode && " or drag and drop"}</p>
            <p className="text-xs text-muted-foreground">
              {isVideoMode ? `MP4, MOV, WebM up to ${maxSizeMB}MB` : `PNG, JPG, GIF up to ${maxSizeMB}MB`}
            </p>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}
    </div>
  )
}
