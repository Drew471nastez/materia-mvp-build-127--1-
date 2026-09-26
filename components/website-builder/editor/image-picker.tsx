"use client"

/**
 * ===========================================================================
 *  THE IMAGE BOX IS NEVER EMPTY
 * ===========================================================================
 * Reported with a picture: choose an image, and for a moment the box under
 * the label is a blank grey rectangle. Then the picture appears in one
 * frame. "It looks cheap and then the image appears very cheap quick."
 *
 * Both halves of that are the same omission. The upload finishes, `onChange`
 * hands back the public URL, and the filled branch renders `<img src={url}>`
 * with a URL the browser has never seen — a brand new object, so a certain
 * cache miss. Between that render and the bytes arriving there is nothing in
 * the box at all, and when they do arrive the image is simply there, at full
 * opacity, in the frame it decoded.
 *
 * THE FILE IS ALREADY IN OUR HANDS. `handleFile` is holding the File the
 * whole time it is uploading it. `URL.createObjectURL` turns that into
 * something an <img> paints from memory on the next frame, with no network
 * at all, so the picture can be on screen before the upload has even
 * started. It stays there until the uploaded copy has decoded behind it, and
 * then the two are cross faded. There is no frame in between where the box
 * holds nothing.
 *
 * AND WHEN THERE IS NO FILE — a value loaded with the panel, or one set from
 * somewhere else — the box holds a sweep until the picture decodes, rather
 * than a grey rectangle. Waiting is a thing a box can show; empty is not.
 *
 * scripts/check-image-picker.mjs drives the real upload path in a browser
 * and samples the box the whole way through, because "it is never empty" is
 * a claim about frames rather than about source.
 *
 * It lives in its own module so that probe mounts the same component the
 * editor does, the way SliderNumberControl already does for the frame probe.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { ImageIcon, RefreshCw, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { createClient } from "@/lib/supabase/client"
import { withoutMetadata } from "@/lib/images/compress"
import { cn } from "@/lib/utils"

/** How long the uploaded copy takes to replace what is already on screen. */
export const IMAGE_FADE_MS = 260

/*
  The store-builder-images bucket's own types (supabase/migrations/
  20260929_upload_safety.sql). It refuses SVG, so SVG is refused here, before
  the upload, rather than by the bucket after it.
*/
export const ALLOWED_TYPES = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/avif",
])
export const SAFE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "avif"])
/** The largest picture this field takes. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

export function WbImagePicker({
  value,
  onChange,
  label,
  aspectRatio = "video",
  bucket = "store-builder-images" as const,
  folder = "logos",
}: {
  value: string | undefined
  onChange: (url: string | null) => void
  label?: string
  aspectRatio?: "square" | "video" | "logo" | "favicon"
  bucket?: "product-images" | "avatars" | "covers" | "store-builder-images"
  folder?: string
}) {
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const url = typeof value === "string" && value ? value : null

  /**
   * The chosen file, as something an <img> can paint immediately. Held in a
   * ref as well as state because it has to be revoked, and an effect reading
   * it from state would revoke the one that had already replaced it.
   */
  const [preview, setPreview] = useState<string | null>(null)
  const previewRef = useRef<string | null>(null)
  const showFile = useCallback((file: File | null) => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    previewRef.current = file ? URL.createObjectURL(file) : null
    setPreview(previewRef.current)
    /*
      A replacement starts the whole sequence again. Without this the box
      still counts the PREVIOUS picture as arrived, so the file just chosen
      would sit behind it unseen until the new upload returned.
    */
    if (file) { setReadyUrl(null); setFadedUrl(null) }
  }, [])
  useEffect(() => () => { if (previewRef.current) URL.revokeObjectURL(previewRef.current) }, [])

  /**
   * Which URL has actually decoded. Comparing it to the current one is what
   * makes this correct for free when the value changes: a new url is not the
   * one that loaded, so `ready` is false again in the same render that
   * received it, with no effect to run a beat later.
   */
  const [readyUrl, setReadyUrl] = useState<string | null>(null)
  const ready = url !== null && readyUrl === url

  /**
   * ===================================================================
   *  AND WHICH ONE HAS FINISHED ARRIVING, WHICH IS NOT THE SAME THING
   * ===================================================================
   * `ready` means the stored copy has decoded, so it is allowed to start
   * appearing. It starts at nothing and takes IMAGE_FADE_MS to get there.
   *
   * The first version of this took the layer underneath away the moment
   * `ready` turned true, which put an empty box under an image at zero
   * opacity for the whole fade. Reported as a glitch right at the end of
   * an upload, and it was exactly the bug this component exists to fix,
   * moved a quarter of a second later.
   *
   * So what is underneath stays until the thing above it is actually
   * opaque. Derived from the url for the same reason `ready` is: a value
   * that changes is not finished, in the render that changes it.
   */
  const [fadedUrl, setFadedUrl] = useState<string | null>(null)
  const faded = url !== null && fadedUrl === url
  useEffect(() => {
    if (!ready || faded) return
    const timer = setTimeout(() => setFadedUrl(url), IMAGE_FADE_MS)
    return () => clearTimeout(timer)
  }, [ready, faded, url])

  /* Once it is, the file is no longer holding anything up. */
  useEffect(() => {
    if (faded && previewRef.current) showFile(null)
  }, [faded, showFile])

  const handleFile = useCallback(async (file: File) => {
    if (!ALLOWED_TYPES.has(file.type)) {
      toast.error("Use JPG, PNG, GIF, WebP or AVIF")
      return
    }
    const ext = (file.name.split(".").pop() ?? "").toLowerCase()
    if (!SAFE_EXTENSIONS.has(ext)) {
      toast.error("That file type is not allowed")
      return
    }
    if (file.size > MAX_IMAGE_BYTES) { toast.error("Image must be under 5 MB"); return }

    /* On screen before the upload starts, not after it finishes. */
    showFile(file)
    setUploading(true)
    try {
      /* The same picture without its location, camera and owner details
         (lib/images/compress, withoutMetadata): lossless, nothing re-encoded. */
      const body = await withoutMetadata(file)
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Not logged in")

      // Sanitize filename: only keep alphanumeric + timestamp
      const safeName = `${Date.now()}.${ext}`
      const filePath = `${user.id}/${folder}/${safeName}`

      const { error: uploadError } = await supabase.storage.from(bucket).upload(filePath, body, {
        cacheControl: "31536000", // 1 year — immutable content-addressed names
        upsert: true,
        contentType: file.type,
      })
      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(filePath)
      onChange(urlData.publicUrl)
    } catch {
      /* Nothing was stored, so the box goes back to being empty rather than
         showing a picture this panel does not actually have. */
      showFile(null)
      toast.error("Upload failed. Try again.")
    } finally {
      setUploading(false)
    }
  }, [bucket, folder, onChange, showFile])

  const pick = () => { if (!uploading) inputRef.current?.click() }

  const emptyAspectClass =
    aspectRatio === "favicon" ? "min-h-[60px]"
    : aspectRatio === "square" ? "aspect-square"
    : aspectRatio === "logo" ? "min-h-[72px]"
    : "aspect-video"
  // Filled preview is kept small/compact so it doesn't dominate the sidebar
  const filledClass =
    aspectRatio === "favicon" ? "h-[60px]"
    : aspectRatio === "square" ? "aspect-square max-h-[120px]"
    : aspectRatio === "logo" ? "h-[68px]"
    : "h-[96px]"

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      accept="image/*"
      className="hidden"
      onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = "" }}
    />
  )

  /*
    A local copy counts as having something to show. The first upload used to
    drop into the dashed empty box with a spinner in it, which is a third
    state nobody asked for; now it is the picture you just chose, with the
    spinner over it, and the uploaded copy arrives underneath without the
    layout moving at all.
  */
  if (url || preview) {
    return (
      <div className="space-y-2" data-wb-image-picker="filled">
        {label && <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">{label}</p>}
        <div
          data-wb-image-box
          className={cn(
            /* `dark:` only inside a `.dark` parent: Website Settings is one,
               the editor's sidebar is not, and is unchanged. */
            "relative w-full rounded-lg overflow-hidden border border-border bg-[#fafafa] dark:bg-white/[0.04] flex items-center justify-center",
            filledClass,
          )}
        >
          {/*
            What is underneath: the file itself, or a sweep when there is no
            file. `!faded` rather than `!ready`, so it is still there through
            the fade that covers it.
          */}
          {!faded && (
            preview
              ? <img src={preview} alt="" data-wb-image-layer="local" className="absolute inset-0 h-full w-full object-contain p-2" />
              : <span data-wb-image-layer="waiting" className="wb-image-skeleton absolute inset-0" aria-hidden />
          )}
          {/* And the stored copy, which fades over it once it has decoded. */}
          {url && (
            <img
              key={url}
              src={url}
              alt=""
              data-wb-image-layer="stored"
              ref={el => { if (el?.complete && el.naturalWidth > 0) setReadyUrl(url) }}
              onLoad={() => setReadyUrl(url)}
              /* A picture that will not load must not leave a sweep running
                 for ever; the box settles on the broken image instead. */
              onError={() => setReadyUrl(url)}
              className={cn(
                "wb-image-fade relative h-full w-full object-contain p-2",
                ready ? "opacity-100" : "opacity-0",
              )}
            />
          )}
          {uploading && (
            <span className="absolute inset-0 z-10 flex items-center justify-center bg-white/55">
              <span className="h-5 w-5 rounded-full border-2 border-foreground/70 border-t-transparent animate-spin" />
            </span>
          )}
        </div>
        {/*
          ONE CONTROL, SPLIT, not two buttons with a gap between them. Two
          outlined pills side by side read as two separate decisions; this is
          one decision with two answers, which is what the picture asked for.
          44px on a phone, because that is the smallest thing a thumb hits.
        */}
        <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-border">
          <button
            type="button"
            disabled={uploading}
            className="flex h-11 items-center justify-center gap-1.5 text-[13px] font-medium transition-colors hover:bg-muted/60 disabled:opacity-40 md:h-9 md:text-xs"
            onClick={pick}
          >
            <RefreshCw className="h-3.5 w-3.5 md:h-3 md:w-3" />
            Replace
          </button>
          <button
            type="button"
            disabled={uploading}
            className="flex h-11 items-center justify-center gap-1.5 border-l border-border text-[13px] font-medium transition-colors hover:bg-muted/60 disabled:opacity-40 md:h-9 md:text-xs"
            onClick={() => { showFile(null); onChange(null) }}
          >
            <Trash2 className="h-3.5 w-3.5 md:h-3 md:w-3" />
            Remove
          </button>
        </div>
        {fileInput}
      </div>
    )
  }

  return (
    <div className="space-y-2.5" data-wb-image-picker="empty">
      {label && <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">{label}</p>}
      <div
        className={cn(
          /* `wb-dropzone` is what app/globals.css shrinks on a phone: in a
             bottom sheet an aspect-video box is a third of the screen given
             to an empty rectangle. */
          "wb-dropzone relative w-full rounded-lg border-2 border-dashed transition-colors cursor-pointer flex flex-col items-center justify-center gap-1.5 py-5",
          emptyAspectClass,
          dragOver
            ? "border-foreground/40 bg-muted"
            : "border-border bg-[#fafafa] hover:border-foreground/25 hover:bg-muted/60 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]",
        )}
        onClick={pick}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); if (uploading) return; const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
      >
        <ImageIcon className="h-5 w-5 text-muted-foreground/50" />
        <p className="text-[13px] font-medium text-muted-foreground">Add Image</p>
        <p className="text-[10px] text-muted-foreground/70">Click to upload or drag &amp; drop</p>
      </div>
      {fileInput}
    </div>
  )
}

export default WbImagePicker
