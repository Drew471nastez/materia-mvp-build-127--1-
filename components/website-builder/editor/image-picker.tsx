"use client"

/**
 * ===========================================================================
 *  ONE UPLOAD FIELD FOR EVERY PICTURE AND VIDEO IN THE SIDEBAR
 * ===========================================================================
 * "The uploading of the images, the content, the videos ... should be very
 * smooth for uploading and adding, not old school, very modern uploading,
 * optimized."
 *
 * Every image and video setting in the builder is this field: a section's
 * image, the logo, the favicon, the share image in Website Settings, and a
 * background video. What it does, in the order somebody meets it:
 *
 *   ADD           click or press Enter on the box, drop a file on it, or
 *                 paste one (a file, or a link) while it has focus
 *   AT ONCE       the file is on screen the moment it is chosen, painted
 *                 from memory before a byte has gone anywhere
 *   SMALLER       a photo is resized and re-encoded in the browser first
 *                 (lib/images/compress, the store-builder-images profile):
 *                 a 4 MB camera JPEG goes up as a few hundred KB of WebP
 *   HOW FAR       a hairline along the foot of the picture, from the
 *                 request's own upload events (lib/storage/upload-with-
 *                 progress), not a number made up in steps
 *   ARRIVES       the stored copy fades in over the local one once it has
 *                 decoded, so the box is never empty and never flashes
 *   SAYS WHY      a file it cannot take, or an upload that did not finish,
 *                 is a line under the box in plain words, with Try again
 *                 when trying again could help. No toast that has gone
 *                 before it is read.
 *   DESCRIBED     where the section has a description for the picture (its
 *                 alt text), it is edited right under it
 *
 * THE BOX IS NEVER EMPTY, and that part is older than the rest: see the
 * derived `ready` and `faded` below. scripts/check-image-picker.mjs samples
 * the box through a whole upload, and scripts/check-media-field.mjs drives
 * drops, pastes, progress and errors against a fake storage endpoint.
 *
 * Only what the bucket takes: store-builder-images accepts JPEG, PNG, WebP,
 * GIF and AVIF pictures and the common video types (supabase/migrations/
 * 20260929_upload_safety.sql). SVG is not offered, because the bucket would
 * refuse it after the upload rather than before it.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react"
import { Film, ImageIcon, RefreshCw, Trash2 } from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import { COMPRESS_PROFILES, compressImage } from "@/lib/images/compress"
import { uploadWithProgress } from "@/lib/storage/upload-with-progress"
import { cn } from "@/lib/utils"

/** How long the uploaded copy takes to replace what is already on screen. */
export const IMAGE_FADE_MS = 260

export type MediaKind = "image" | "video"

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif"])
const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "avif"])
const VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime", "video/x-m4v"])
const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "mov", "m4v"])

const MB = 1024 * 1024
/** What may be chosen. A photo this size is resized before it goes anywhere. */
export const MAX_IMAGE_BYTES = 25 * MB
/** What may be stored, after resizing. */
export const MAX_STORED_IMAGE_BYTES = 10 * MB
export const MAX_VIDEO_BYTES = 50 * MB

const sizeText = (bytes: number) => (bytes >= MB ? `${Math.round((bytes / MB) * 10) / 10} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`)

/**
 * Whether a file can go up as this kind, and if not, the sentence that says
 * why. Pure, so the rules are tested as rules (tests/media-field.test.ts).
 */
export function checkMediaFile(
  file: { name: string; type: string; size: number },
  kind: MediaKind,
): { ok: true; ext: string } | { ok: false; error: string } {
  const ext = (file.name.split(".").pop() ?? "").toLowerCase()
  const type = (file.type || "").toLowerCase()
  if (kind === "image") {
    if (!IMAGE_TYPES.has(type) || !IMAGE_EXTENSIONS.has(ext)) return { ok: false, error: "Use a JPG, PNG, WebP, GIF or AVIF picture." }
    if (file.size > MAX_IMAGE_BYTES) return { ok: false, error: `That picture is ${sizeText(file.size)}. Pictures can be up to 25 MB.` }
    return { ok: true, ext: ext === "jpeg" ? "jpg" : ext }
  }
  if (!VIDEO_TYPES.has(type) || !VIDEO_EXTENSIONS.has(ext)) return { ok: false, error: "Use an MP4, MOV or WebM video." }
  if (file.size > MAX_VIDEO_BYTES) return { ok: false, error: `That video is ${sizeText(file.size)}. Videos can be up to 50 MB.` }
  return { ok: true, ext }
}

/** A link somebody pasted, when it is one a page can load. */
export function pastedLink(text: string): string | null {
  const t = text.trim()
  if (!/^https?:\/\/\S+$/i.test(t) || t.length > 2000) return null
  try {
    const u = new URL(t)
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null
  } catch {
    return null
  }
}

class Refused extends Error {}

/** A random tail for the storage key, so two uploads in one millisecond are two files. */
function tail(): string {
  try {
    return crypto.randomUUID().slice(0, 8)
  } catch {
    return Math.random().toString(36).slice(2, 10)
  }
}

type Aspect = "square" | "video" | "logo" | "favicon"

export interface MediaFieldProps {
  value: string | undefined
  onChange: (url: string | null) => void
  label?: string
  kind?: MediaKind
  aspectRatio?: Aspect
  bucket?: "product-images" | "avatars" | "covers" | "store-builder-images"
  folder?: string
  /** The picture's description, when the section keeps one beside it. */
  alt?: { value: string; onChange: (value: string) => void; label?: string }
}

export function MediaField({
  value,
  onChange,
  label,
  kind = "image",
  aspectRatio = "video",
  bucket = "store-builder-images",
  folder = "sections",
  alt,
}: MediaFieldProps) {
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<{ message: string; retry?: File } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const barRef = useRef<HTMLSpanElement>(null)
  const altId = useId()
  const errorId = useId()

  const url = typeof value === "string" && value ? value : null
  const isVideo = kind === "video"

  /**
   * The chosen file, as something an <img> or <video> can paint immediately.
   * Held in a ref as well as state because it has to be revoked, and an
   * effect reading it from state would revoke the one that had already
   * replaced it.
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
   * And which one has FINISHED arriving, which is not the same thing:
   * `ready` lets the stored copy start to appear, over IMAGE_FADE_MS. What
   * is underneath stays until the thing above it is opaque.
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

  /** How far the upload has got, written to the bar directly: a video reports hundreds of times. */
  const progressFrame = useRef(0)
  const setProgress = useCallback((percent: number) => {
    if (progressFrame.current) cancelAnimationFrame(progressFrame.current)
    progressFrame.current = requestAnimationFrame(() => {
      progressFrame.current = 0
      const bar = barRef.current
      if (!bar) return
      bar.style.transform = `scaleX(${Math.max(0.02, Math.min(1, percent / 100)).toFixed(3)})`
      bar.parentElement?.setAttribute("aria-valuenow", String(Math.round(percent)))
    })
  }, [])
  useEffect(() => () => { if (progressFrame.current) cancelAnimationFrame(progressFrame.current) }, [])

  const handleFile = useCallback(async (file: File) => {
    const verdict = checkMediaFile(file, kind)
    /* `in`, not `!verdict.ok`: it narrows under the test build's looser settings too. */
    if ("error" in verdict) {
      setError({ message: verdict.error })
      return
    }
    setError(null)

    /* On screen before anything is resized or sent. */
    showFile(file)
    setUploading(true)
    setProgress(2)
    try {
      const body = kind === "image" ? await compressImage(file, COMPRESS_PROFILES["store-builder-images"]) : file
      if (kind === "image" && body.size > MAX_STORED_IMAGE_BYTES) {
        throw new Refused(`That picture is still ${sizeText(body.size)} after resizing. Use one under 10 MB.`)
      }
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Refused("You are signed out. Sign in again to upload.")

      /* The resized file's own extension: its bytes are WebP now. */
      const ext = kind === "image" ? (body.name.split(".").pop() ?? verdict.ext).toLowerCase() : verdict.ext
      const filePath = `${user.id}/${folder}/${Date.now()}-${tail()}.${ext}`
      await uploadWithProgress(bucket, filePath, body, {
        cacheControl: "31536000", // a year: every key is new, so its bytes never change
        upsert: false,
        contentType: body.type,
        onProgress: (p) => setProgress(Math.min(99, p)),
      })
      setProgress(100)
      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(filePath)
      onChange(urlData.publicUrl)
    } catch (e) {
      /* Nothing was stored, so the box goes back to what it had rather than
         showing a picture this field does not actually have. */
      showFile(null)
      setError(
        e instanceof Refused
          ? { message: e.message }
          : { message: "The upload did not finish. Check your connection and try again.", retry: file },
      )
    } finally {
      setUploading(false)
    }
  }, [bucket, folder, kind, onChange, setProgress, showFile])

  const pick = () => { if (!uploading) inputRef.current?.click() }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (uploading) return
    const f = e.dataTransfer.files[0]
    if (f) {
      void handleFile(f)
      return
    }
    const link = pastedLink(e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain"))
    if (link) { setError(null); onChange(link) }
  }
  const dragProps = {
    onDragEnter: (e: React.DragEvent) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragOver(true) } },
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); if (!dragOver) setDragOver(true) },
    onDragLeave: (e: React.DragEvent) => {
      /* Leaving for one of its own children is not leaving. */
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false)
    },
    onDrop,
  }
  /** A file or a link pasted while the box has focus. */
  const onPaste = (e: React.ClipboardEvent) => {
    if (uploading) return
    const f = Array.from(e.clipboardData.files)[0]
    if (f) {
      e.preventDefault()
      void handleFile(f)
      return
    }
    const link = pastedLink(e.clipboardData.getData("text/plain"))
    if (link) {
      e.preventDefault()
      setError(null)
      onChange(link)
    }
  }

  const emptyAspectClass =
    aspectRatio === "favicon" ? "min-h-[64px]"
    : aspectRatio === "square" ? "aspect-square"
    : aspectRatio === "logo" ? "min-h-[80px]"
    : "aspect-[16/7]"
  /* The filled box is kept compact so it does not own the sidebar. */
  const filledClass =
    aspectRatio === "favicon" ? "h-[64px]"
    : aspectRatio === "square" ? "aspect-square max-h-[140px]"
    : aspectRatio === "logo" ? "h-[72px]"
    : "h-[112px]"

  const noun = isVideo ? "video" : "image"
  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      accept={isVideo ? "video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov,.m4v" : "image/jpeg,image/png,image/webp,image/gif,image/avif"}
      className="hidden"
      tabIndex={-1}
      aria-hidden
      onChange={e => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = "" }}
    />
  )

  const problem = error && (
    <p id={errorId} role="alert" className="flex flex-wrap items-baseline gap-x-2 text-[12.5px] leading-snug text-[#b42318] dark:text-red-300">
      <span>{error.message}</span>
      {error.retry && (
        <button
          type="button"
          onClick={() => { const f = error.retry; if (f) void handleFile(f) }}
          className="font-medium text-[#1a1a2e] underline underline-offset-2 dark:text-white"
        >
          Try again
        </button>
      )}
    </p>
  )

  const altField = alt && (
    <div className="space-y-1.5">
      <label htmlFor={altId} className="block text-xs font-medium text-muted-foreground">{alt.label ?? "Description"}</label>
      <input
        id={altId}
        type="text"
        value={alt.value}
        onChange={e => alt.onChange(e.target.value)}
        placeholder="What the picture shows"
        className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm transition-colors focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
      />
    </div>
  )

  /*
    A local copy counts as having something to show. The first upload drops
    into the preview layout with the picture you chose in it, and the stored
    copy arrives underneath without the layout moving at all.
  */
  if (url || preview) {
    const src = preview ?? url ?? ""
    return (
      <div className="space-y-2" data-wb-image-picker="filled" data-media-kind={kind}>
        {label && <p className="wb-field-label text-[13px] font-medium text-[#374151]">{label}</p>}
        <div
          data-wb-image-box
          tabIndex={0}
          role="group"
          aria-label={`${label ?? (isVideo ? "Video" : "Image")}. Paste or drop a file to replace it.`}
          aria-describedby={error ? errorId : undefined}
          onPaste={onPaste}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); pick() } }}
          {...dragProps}
          className={cn(
            /* `dark:` only inside a `.dark` parent: Website Settings is one,
               the editor's sidebar is not. */
            "relative w-full overflow-hidden rounded-lg border bg-[#fafafa] outline-none transition-[border-color,box-shadow] duration-150 dark:bg-white/[0.04] flex items-center justify-center",
            "focus-visible:ring-2 focus-visible:ring-black/10",
            dragOver ? "border-[#1a1a2e] dark:border-white/60" : "border-border",
            filledClass,
          )}
        >
          {isVideo ? (
            /* A video's first frame, from the file or from storage. */
            <video
              key={src}
              /* `#t=0.1` so Safari draws a first frame instead of a black box. */
              src={src.includes("#") ? src : `${src}#t=0.1`}
              muted
              playsInline
              preload="metadata"
              data-wb-image-layer={preview ? "local" : "stored"}
              className="h-full w-full object-cover"
            />
          ) : (
            <>
              {/*
                What is underneath: the file itself, or a sweep when there is
                no file. `!faded` rather than `!ready`, so it is still there
                through the fade that covers it.
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
            </>
          )}
          {dragOver && (
            <span className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 text-[13px] font-medium text-[#1a1a2e] dark:bg-black/60 dark:text-white">
              Drop to replace
            </span>
          )}
          {/* How far the upload has got: a hairline along the foot, from real progress events. */}
          {uploading && (
            <span
              role="progressbar"
              aria-label="Uploading"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={2}
              data-wb-upload-progress=""
              className="absolute inset-x-2 bottom-2 z-10 h-[3px] overflow-hidden rounded-full bg-black/10 dark:bg-white/15"
            >
              <span ref={barRef} className="wb-upload-bar absolute inset-0 origin-left rounded-full bg-[#1a1a2e] dark:bg-white" style={{ transform: "scaleX(0.02)" }} />
            </span>
          )}
        </div>
        {/*
          ONE CONTROL, SPLIT, not two buttons with a gap between them. Two
          outlined pills side by side read as two separate decisions; this is
          one decision with two answers. 44px on a phone, because that is the
          smallest thing a thumb hits.
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
            onClick={() => { showFile(null); setError(null); onChange(null) }}
          >
            <Trash2 className="h-3.5 w-3.5 md:h-3 md:w-3" />
            Remove
          </button>
        </div>
        {problem}
        {altField}
        {fileInput}
      </div>
    )
  }

  return (
    <div className="space-y-2" data-wb-image-picker="empty" data-media-kind={kind}>
      {label && <p className="wb-field-label text-[13px] font-medium text-[#374151]">{label}</p>}
      <button
        type="button"
        onClick={pick}
        onPaste={onPaste}
        aria-describedby={error ? errorId : undefined}
        {...dragProps}
        className={cn(
          /* `wb-dropzone` is what app/globals.css shrinks on a phone: in a
             bottom sheet a tall box is a third of the screen given to an
             empty rectangle. */
          "wb-dropzone relative w-full rounded-lg border border-dashed transition-[border-color,background-color] duration-150 cursor-pointer flex flex-col items-center justify-center gap-1 py-5 outline-none",
          "focus-visible:ring-2 focus-visible:ring-black/10",
          emptyAspectClass,
          dragOver
            ? "border-[#1a1a2e] bg-[#f3f4f6] dark:border-white/60 dark:bg-white/[0.08]"
            : "border-[#d1d5db] bg-[#fafafa] hover:border-[#9ca3af] hover:bg-[#f6f7f8] dark:border-white/15 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]",
        )}
      >
        {isVideo
          ? <Film className="h-5 w-5 text-[#9ca3af]" aria-hidden />
          : <ImageIcon className="h-5 w-5 text-[#9ca3af]" aria-hidden />}
        <span className="wb-dropzone-title block text-[13px] font-medium text-[#1a1a2e] dark:text-white/85">{dragOver ? "Drop to add" : `Add ${noun}`}</span>
        {/* Not on a phone: "drop" is not advice for a touchscreen (app/globals.css). */}
        <span className="wb-dropzone-hint block text-[11.5px] text-[#6b7280] dark:text-white/50">Drop, paste or click</span>
      </button>
      {problem}
      {altField}
      {fileInput}
    </div>
  )
}

/** The image field every caller already knows by this name. */
export function WbImagePicker(props: Omit<MediaFieldProps, "kind">) {
  return <MediaField {...props} kind="image" />
}

export default WbImagePicker
