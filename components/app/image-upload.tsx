"use client"

import type React from "react"
import { useState, useRef, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { X, ImageIcon, AlertCircle, Video, Pencil } from "lucide-react"
import Image from "next/image"
import { COMPRESS_PROFILES, compressImage } from "@/lib/images/compress"
import { DEFAULT_COVER_CROP, coverEditorSrc, isDefaultCrop, type CoverCrop } from "@/lib/images/cover-crop"
import { CoverCropFrame } from "@/components/app/cover-crop-frame"

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
    /** Whether a finger moves the picture. Off, the frame shows the crop and a press replaces it. */
    editable?: boolean
    /**
     * The shape of the band this picture will really be drawn into, measured
     * from the page rather than assumed. A crop depends only on the ratio of
     * the frame to the image, so a frame of the same shape previews it
     * exactly; a frame of a different shape previews a different picture,
     * which is what a flat 3:1 here was doing.
     */
    aspect?: number
  }
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
}: ImageUploadProps) {
  const isVideoMode = accept === "video/*"
  const [uploading, setUploading] = useState(false)
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
          const { error: uploadError } = await supabase.storage.from(bucket).upload(filePath, upload, {
            cacheControl: "31536000",
            contentType: upload.type,
            upsert: true,
          })

          if (uploadError) {
            console.error("[v0] Upload error:", uploadError)
            throw uploadError
          }

          setProgress(70)

          // Get public URL
          const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(filePath)

          console.log("[v0] Upload successful, URL:", urlData.publicUrl)

          setProgress(100)
          onChange(urlData.publicUrl)
        }
      } catch (err) {
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
    [bucket, folder, maxSizeMB, onChange, isVideoMode],
  )

  const handleRemove = useCallback(async () => {
    if (!value) return

    // Try to delete from storage
    try {
      const supabase = createClient()
      const url = new URL(value)
      const pathMatch = url.pathname.match(new RegExp(`/storage/v1/object/public/${bucket}/(.+)`))
      if (pathMatch?.[1]) {
        await supabase.storage.from(bucket).remove([decodeURIComponent(pathMatch[1])])
      }
    } catch {
      // Ignore deletion errors
    }

    onChange(null)
  }, [value, bucket, onChange])

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
  if (value && replaceOnly && reposition) {
    const crop = reposition.value ?? DEFAULT_COVER_CROP
    const editable = reposition.editable !== false
    /* 44px to a thumb, 32px to the eye: the disc is small, its target is not. */
    const disc =
      "relative flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white transition-colors before:absolute before:-inset-1.5 before:content-[''] pointer-fine:hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
    return (
      <div className="space-y-2">
        <CoverCropFrame
          src={coverEditorSrc(value)}
          crop={crop}
          onChange={editable && !uploading ? reposition.onChange : undefined}
          onActivate={editable ? undefined : () => !uploading && inputRef.current?.click()}
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
              <button type="button" aria-label="Remove image" onClick={() => void handleRemove()} className={disc}>
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
          {uploading && (
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

  if (value && replaceOnly) {
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
        <Image
          src={value || "/placeholder.svg"}
          alt=""
          fill
          loading="eager"
          sizes={aspectRatio === "square" ? "(max-width: 640px) 40vw, 240px" : "(max-width: 640px) 100vw, 520px"}
          className="object-cover"
        />

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
            rather than the frame emptying out and jumping back. */}
        {uploading && (
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
              void handleRemove()
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
