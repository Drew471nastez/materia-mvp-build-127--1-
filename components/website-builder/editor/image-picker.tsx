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
import { confirmUpload } from "@/lib/storage/confirm-upload"
import { ChevronDown, FolderOpen, ImageIcon, RefreshCw, Trash2, Upload } from "lucide-react"
import { toast } from "sonner"

import { createClient } from "@/lib/supabase/client"
import { withoutMetadata } from "@/lib/images/compress"
import { cn } from "@/lib/utils"
import { FilesLibraryChooser, prefetchLibrary, type PickHint } from "@/components/files/files-library"
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"

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
  layout = "box",
}: {
  value: string | undefined
  onChange: (url: string | null) => void
  label?: string
  aspectRatio?: "square" | "video" | "logo" | "favicon"
  /**
   * "row" is the section setting's picker: a thumbnail and its two actions on
   * one line, about 64px, rather than a 16:9 box the width of the sidebar.
   * "box" stays for Website settings' logo and favicon, where the picture is
   * the whole point of the panel.
   */
  layout?: "box" | "row"
  bucket?: "product-images" | "avatars" | "covers" | "store-builder-images"
  folder?: string
}) {
  const [uploading, setUploading] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)
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
  const showFile = useCallback((file: File | string | null) => {
    if (previewRef.current?.startsWith("blob:")) URL.revokeObjectURL(previewRef.current)
    previewRef.current = file === null ? null : typeof file === "string" ? file : URL.createObjectURL(file)
    setPreview(previewRef.current)
    /*
      A replacement starts the whole sequence again. Without this the box
      still counts the PREVIOUS picture as arrived, so the file just chosen
      would sit behind it unseen until the new upload returned.
    */
    if (file) { setReadyUrl(null); setFadedUrl(null) }
  }, [])
  useEffect(() => () => { if (previewRef.current?.startsWith("blob:")) URL.revokeObjectURL(previewRef.current) }, [])

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

  /*
    A STORED COPY THAT WILL NOT LOAD. Reported as a broken picture in SEO &
    Social: the box settled on the browser's broken image icon, which says
    nothing about what to do. A copy asked for the moment its upload finished
    can miss once on its way through /media, so it is asked for again, once,
    a moment later. A second miss is a picture that is not there: the box
    says so in words and offers Replace and Remove, and the local copy is not
    passed off as saved.
  */
  const [miss, setMiss] = useState<{ url: string; tries: number } | null>(null)
  const tries = url !== null && miss?.url === url ? miss.tries : 0
  const broken = tries > 1
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (retryTimer.current) clearTimeout(retryTimer.current) }, [])
  const storedSrc = url && tries === 1 ? `${url}${url.includes("?") ? "&" : "?"}r=1` : url
  const storedFailed = () => {
    if (!url) return
    if (tries === 0) {
      if (retryTimer.current) clearTimeout(retryTimer.current)
      retryTimer.current = setTimeout(() => setMiss({ url, tries: 1 }), 1200)
      return
    }
    setMiss({ url, tries: 2 })
    showFile(null)
  }

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
      confirmUpload(bucket, filePath)

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
  const choose = () => { if (!uploading) setLibraryOpen(true) }
  /*
    THE LIBRARY IS ASKED FOR BEFORE IT IS OPENED. Once, when the editor is
    idle after a picture field first shows (a second field asks nothing:
    the list is kept), and again with its first screen of pictures on a
    hover or a focus of the field's own "Your files", so the window opens
    on the grid rather than on a wait (components/files/files-library.tsx).
  */
  useEffect(() => {
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback
    const id = ric ? ric(() => void prefetchLibrary("image"), { timeout: 3000 }) : window.setTimeout(() => void prefetchLibrary("image"), 1500)
    return () => {
      const cancel = (window as unknown as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback
      if (ric && cancel) cancel(id)
      else window.clearTimeout(id)
    }
  }, [])
  const warmLibrary = () => void prefetchLibrary("image", { warmFirst: true })
  /* A picture picked from the library: on screen at once from the copy the grid already decoded (or the file just uploaded), and the stored one fades over it. */
  const picked = (url: string, hint?: PickHint) => {
    if (hint?.file) showFile(hint.file)
    else if (hint?.thumb) showFile(hint.thumb)
    else showFile(null)
    onChange(url)
  }
  /* What "Change" offers on a picture already there. */
  const changeItems: ActionMenuItem[] = [
    { label: "Upload a new one", icon: <Upload className="h-4 w-4" />, onClick: pick },
    { label: "Choose from your files", icon: <FolderOpen className="h-4 w-4" />, onClick: choose },
  ]

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

  /*
    THE STORE'S FILES ARE PART OF THE FIELD, not a line of text under it
    (round R6, the owner: "Choose from your files belongs inside the image
    picker"). An empty field offers Upload and Your files side by side in
    its own box; a filled one has Change, a menu with the same two. What is
    left here is the hidden file input and the chooser itself.
  */
  const fileInput = (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = "" }}
      />
      <FilesLibraryChooser
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        selectedUrl={url ?? null}
        onPick={picked}
      />
    </>
  )
  /* The menu on a picture already there: Upload a new one, or Choose from your files. */
  const changeMenu = (className: string, iconClass: string) => (
    <ResponsiveActionMenu
      title="Change image"
      menuWidth="w-56"
      align="start"
      items={changeItems}
      trigger={
        <button
          type="button"
          disabled={uploading}
          onPointerEnter={warmLibrary}
          onFocus={warmLibrary}
          className={className}
          data-wb-image-change=""
        >
          <RefreshCw className={iconClass} />
          Change
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      }
    />
  )
  /* Upload and Your files, side by side: the two ways a picture gets into an empty field. */
  const emptyActions = (size: "row" | "box") => (
    <span className={cn("flex items-center gap-1.5", size === "box" && "justify-center")}>
      <button
        type="button"
        disabled={uploading}
        onClick={e => { e.stopPropagation(); pick() }}
        className={cn(
          "inline-flex items-center gap-1 rounded-md border border-black/[0.08] bg-white font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-40 dark:border-white/10 dark:bg-white/[0.06] dark:hover:bg-white/[0.1]",
          size === "row" ? "h-7 px-2 text-[12px] max-sm:h-9 max-sm:px-3" : "h-8 px-2.5 text-[12.5px] max-sm:h-10 max-sm:px-3.5",
        )}
        data-wb-image-upload=""
      >
        <Upload className="h-3 w-3" />
        Upload
      </button>
      <button
        type="button"
        disabled={uploading}
        onClick={e => { e.stopPropagation(); choose() }}
        onPointerEnter={warmLibrary}
        onFocus={warmLibrary}
        className={cn(
          "inline-flex items-center gap-1 rounded-md border border-black/[0.08] bg-white font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-40 dark:border-white/10 dark:bg-white/[0.06] dark:hover:bg-white/[0.1]",
          size === "row" ? "h-7 px-2 text-[12px] max-sm:h-9 max-sm:px-3" : "h-8 px-2.5 text-[12.5px] max-sm:h-10 max-sm:px-3.5",
        )}
        data-wb-image-library=""
      >
        <FolderOpen className="h-3 w-3" />
        Your files
      </button>
    </span>
  )

  /*
    A local copy counts as having something to show. The first upload used to
    drop into the dashed empty box with a spinner in it, which is a third
    state nobody asked for; now it is the picture you just chose, with the
    spinner over it, and the uploaded copy arrives underneath without the
    layout moving at all.
  */
  /*
   * ═════════════════════════════════════════════════════════════════════
   *  THE SECTION'S PICTURE, ON ONE LINE
   * ═════════════════════════════════════════════════════════════════════
   * The box below was a 16:9 rectangle the width of the sidebar: about 170px
   * of dashed border to say "nothing here yet", and a 96px picture plus a row
   * of buttons once there was. In a panel of a dozen settings that was most
   * of the screen given to one of them ("the image picker is too big, the
   * whole container when an image is added"). Shopify's own is a small
   * thumbnail with its actions beside it, and so is this: the picture at
   * 56px, its name, Replace and Remove. Everything else (the upload, the
   * local copy painted at once, the cross fade, the sweep while a stored
   * picture loads) is the same component underneath, unchanged.
   */
  if (layout === "row") {
    /*
      THE PICTURE, NOT ITS NAME (round 22, the owner: "I don't want them to display the url, only the photos"). A file
      name like 1791487228371-a0tzff.png says nothing a creator can use, so the row is the picture itself, a little wider
      than square so a landscape photo reads as one, with Replace and Remove beside it.
    */
    if (url || preview) {
      return (
        <div className="space-y-2" data-wb-image-picker="filled">
          {label && <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">{label}</p>}
          <div className="flex items-center gap-3 rounded-lg border border-border bg-white p-1.5 pr-2 dark:bg-white/[0.04]">
            <div
              data-wb-image-box
              className="relative h-16 w-24 shrink-0 overflow-hidden rounded-md border border-black/[0.06] bg-[#f4f4f5] dark:bg-white/[0.06]"
            >
              {broken ? (
                <span data-wb-image-layer="missing" className="absolute inset-0 flex items-center justify-center text-muted-foreground/60" aria-hidden>
                  <ImageIcon className="h-[18px] w-[18px]" />
                </span>
              ) : !faded && (
                preview
                  ? <img src={preview} alt="" data-wb-image-layer="local" className="absolute inset-0 h-full w-full object-cover" />
                  : <span data-wb-image-layer="waiting" className="wb-image-skeleton absolute inset-0" aria-hidden />
              )}
              {url && !broken && (
                <img
                  key={`${url}#${tries}`}
                  src={storedSrc ?? url}
                  alt=""
                  data-wb-image-layer="stored"
                  ref={el => { if (el?.complete && el.naturalWidth > 0) setReadyUrl(url) }}
                  onLoad={() => setReadyUrl(url)}
                  onError={storedFailed}
                  className={cn("wb-image-fade relative h-full w-full object-cover", ready ? "opacity-100" : "opacity-0")}
                />
              )}
              {uploading && (
                <span className="absolute inset-0 z-10 flex items-center justify-center bg-white/55">
                  <span className="h-4 w-4 rounded-full border-2 border-foreground/70 border-t-transparent animate-spin" />
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              {broken ? <p className="text-[12.5px] font-medium text-foreground">This picture could not be loaded</p> : null}
              <div className={cn("flex flex-wrap items-center gap-1", broken && "mt-1")}>
                {changeMenu("inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-40 max-sm:h-9 data-[state=open]:bg-muted", "h-3 w-3")}
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => { showFile(null); onChange(null) }}
                  className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40 max-sm:h-9"
                >
                  <Trash2 className="h-3 w-3" />
                  Remove
                </button>
              </div>
            </div>
          </div>
          {fileInput}
        </div>
      )
    }
    return (
      <div className="space-y-2" data-wb-image-picker="empty">
        {label && <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">{label}</p>}
        <div
          role="group"
          aria-label="Add image"
          data-wb-image-box=""
          className={cn(
            "wb-dropzone-row flex min-h-16 w-full cursor-pointer items-center gap-3 rounded-lg border border-dashed px-2 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900/15",
            dragOver
              ? "border-foreground/40 bg-muted"
              : "border-neutral-300 bg-[#fafafa] hover:border-neutral-400 hover:bg-muted/60 dark:border-white/15 dark:bg-white/[0.03]",
          )}
          onClick={pick}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); if (uploading) return; const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-black/[0.06] bg-white text-muted-foreground/70 dark:bg-white/[0.05]">
            <ImageIcon className="h-[18px] w-[18px]" />
          </span>
          <span className="min-w-0 space-y-1.5">
            <span className="block text-[13px] font-medium text-foreground">Add image</span>
            {emptyActions("row")}
          </span>
        </div>
        {fileInput}
      </div>
    )
  }

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
          {broken ? (
            <span data-wb-image-layer="missing" className="flex flex-col items-center gap-1.5 px-4 text-center">
              <ImageIcon className="h-5 w-5 text-muted-foreground/50" aria-hidden />
              <span className="text-[12.5px] text-muted-foreground">This picture could not be loaded. Change it or remove it.</span>
            </span>
          ) : !faded && (
            preview
              ? <img src={preview} alt="" data-wb-image-layer="local" className="absolute inset-0 h-full w-full object-contain p-2" />
              : <span data-wb-image-layer="waiting" className="wb-image-skeleton absolute inset-0" aria-hidden />
          )}
          {/* And the stored copy, which fades over it once it has decoded. */}
          {url && !broken && (
            <img
              key={`${url}#${tries}`}
              src={storedSrc ?? url}
              alt=""
              data-wb-image-layer="stored"
              ref={el => { if (el?.complete && el.naturalWidth > 0) setReadyUrl(url) }}
              onLoad={() => setReadyUrl(url)}
              /* A picture that will not load must not leave a sweep running
                 for ever, nor settle on the browser's broken image: one
                 retry, then words (storedFailed). */
              onError={storedFailed}
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
          {changeMenu("flex h-11 items-center justify-center gap-1.5 text-[13px] font-medium transition-colors hover:bg-muted/60 disabled:opacity-40 md:h-9 md:text-xs data-[state=open]:bg-muted/60", "h-3.5 w-3.5 md:h-3 md:w-3")}
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
        <p className="text-[13px] font-medium text-muted-foreground">Add image</p>
        {emptyActions("box")}
        <p className="text-[10px] text-muted-foreground/70">or drop a picture here</p>
      </div>
      {fileInput}
    </div>
  )
}

export default WbImagePicker
