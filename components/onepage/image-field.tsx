"use client"

/**
 * ===========================================================================
 *  ONE PICTURE, IN ONE ROW
 * ===========================================================================
 * "Image pickers are too big; previews look weird."
 *
 * The Image block gave each picture a full width 16:9 drop box, so a block
 * of four pictures was four screens of dashed boxes, and a portrait photo
 * was shown cut to a letterbox inside it. Now a picture is a row: a 56px
 * square of the picture itself (the whole of it, `object-cover` in a square
 * is what every phone's own photo picker shows), and beside it Upload or
 * Replace, Your files, and Remove.
 *
 * THE UPLOAD IS WATCHED, AND NEVER BLANK.
 *
 *   the file chosen is shown in the square at once, from the device, while
 *   it goes up (useMediaUpload: real bytes, Stop, the reason when it fails)
 *
 *   when it is stored, the address is saved straight away, and the square
 *   keeps the local copy until the stored one has been fetched and decoded,
 *   so the square never goes grey in between
 *
 *   the picture's own width and height are handed back with the address, so
 *   the page can reserve its box before it loads (no shift on landing)
 *
 * A drop on the row works too, on a computer.
 */
import * as React from "react"
import { ImageIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { onePageImageSrc } from "@/lib/onepage/display-image"
import { ONEPAGE_IMAGE_ACCEPT } from "@/lib/onepage/media-rules"
import { FilesLibraryChooser, type PickHint } from "@/components/files/files-library"
import { LibraryButton } from "./library-pick"
import { UploadProgress, useMediaUpload } from "./upload-progress"

export interface PictureSize {
  width: number
  height: number
}

/** A picture's own size, read from a file or an address; null when it will not decode. */
export function measurePicture(src: string): Promise<PictureSize | null> {
  return new Promise((resolve) => {
    if (typeof Image === "undefined") return resolve(null)
    const img = new Image()
    img.onload = () => resolve(img.naturalWidth && img.naturalHeight ? { width: img.naturalWidth, height: img.naturalHeight } : null)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

/** Resolves once the address is in the browser's cache and decoded, or failed: what the square swaps to. */
function warm(src: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof Image === "undefined") return resolve()
    const img = new Image()
    img.onload = () => {
      if (typeof img.decode === "function") img.decode().then(() => resolve(), () => resolve())
      else resolve()
    }
    img.onerror = () => resolve()
    img.src = src
  })
}

const THUMB_PX = 56

export function OnePageImageField({
  value,
  onChange,
  prefix,
  removable = true,
  fallback,
  className,
}: {
  value: string | null | undefined
  /**
   * Round AP: what shows when nothing is chosen (a product's own picture under its custom thumbnail). It is drawn
   * in the square, but it is not the value: Remove is offered only for a picture chosen here, and takes the square
   * back to this one.
   */
  fallback?: string | null
  /** The stored address (null when removed), with the picture's own size when it is known. */
  onChange: (url: string | null, size: PictureSize | null) => void
  /** Storage name prefix: "image_<block>_<item>". */
  prefix: string
  removable?: boolean
  className?: string
}) {
  const input = React.useRef<HTMLInputElement>(null)
  const up = useMediaUpload()
  const [local, setLocal] = React.useState<string | null>(null)
  const [choosing, setChoosing] = React.useState(false)
  const [over, setOver] = React.useState(false)
  const localRef = React.useRef<string | null>(null)
  /* The caller's latest onChange: an upload that ends after other edits writes into the block as it is then. */
  const changeRef = React.useRef(onChange)
  changeRef.current = onChange
  React.useEffect(() => () => {
    if (localRef.current?.startsWith("blob:")) URL.revokeObjectURL(localRef.current)
  }, [])

  const showLocal = (url: string | null) => {
    const was = localRef.current
    localRef.current = url
    setLocal(url)
    if (was && was !== url && was.startsWith("blob:")) URL.revokeObjectURL(was)
  }

  /* The stored copy replaces the local one only once it can be drawn at once. */
  const settle = (stored: string, shownLocal: string) => {
    void warm(onePageImageSrc(stored, THUMB_PX * 2)).then(() => {
      if (localRef.current === shownLocal) showLocal(null)
    })
  }

  const send = async (file: File | undefined) => {
    if (!file || up.busy) return
    const preview = URL.createObjectURL(file)
    showLocal(preview)
    const size = await measurePicture(preview)
    const result = await up.upload(file, { prefix, want: "image" })
    if (!result) {
      /* Stopped or failed: back to what was there, and the reason under it. */
      if (localRef.current === preview) showLocal(null)
      return
    }
    changeRef.current(result.url, size)
    settle(result.url, preview)
  }

  const pick = (url: string, hint?: PickHint) => {
    up.clear()
    const shown = hint?.thumb || url
    showLocal(shown)
    void measurePicture(url).then((size) => changeRef.current(url, size))
    settle(url, shown)
  }

  const remove = () => {
    up.cancel()
    showLocal(null)
    changeRef.current(null, null)
  }

  const src = local || (value ? onePageImageSrc(value, THUMB_PX * 2) : fallback ? onePageImageSrc(fallback, THUMB_PX * 2) : null)
  const has = !!(value || local)

  return (
    <div
      data-image-field=""
      className={cn("flex items-center gap-3 rounded-xl transition-[box-shadow] duration-150", over && "shadow-[0_0_0_2px_#1a1a2e]", className)}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        if (!e.dataTransfer.files?.length) return
        e.preventDefault()
        setOver(false)
        void send(e.dataTransfer.files[0])
      }}
    >
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={up.busy}
        aria-label={has ? tt("Replace picture") : tt("Upload picture")}
        className="relative h-14 w-14 shrink-0 cursor-pointer overflow-hidden rounded-xl bg-[#f1f2f4] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)] disabled:cursor-wait"
      >
        {src ? (
          <img
            key={src}
            src={src}
            alt=""
            draggable={false}
            decoding="async"
            className={cn("absolute inset-0 h-full w-full object-cover transition-opacity duration-200", up.busy ? "opacity-60" : "opacity-100")}
          />
        ) : (
          <span className="absolute inset-0 grid place-items-center text-[#9ca3af]">
            <ImageIcon className="h-5 w-5" strokeWidth={1.6} />
          </span>
        )}
      </button>
      <div className="min-w-0 flex-1">
        {up.busy ? (
          <UploadProgress state={up.state} onCancel={() => { up.cancel(); showLocal(null) }} />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => input.current?.click()}
                className="inline-flex h-9 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-[#1a1a2e] px-3 text-[13px] font-medium text-white"
              >
                {has ? tt("Replace") : tt("Upload")}
              </button>
              <LibraryButton onClick={() => setChoosing(true)} />
              {has && removable ? (
                <button
                  type="button"
                  onClick={remove}
                  data-image-remove=""
                  className="h-9 cursor-pointer rounded-lg px-2.5 text-[13px] font-medium text-[#6b7280] transition-colors hover:bg-[#f3f4f6] hover:text-[#b42318]"
                >
                  {tt("Remove")}
                </button>
              ) : null}
            </div>
            <UploadProgress state={up.state} className="mt-1.5" />
          </>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept={ONEPAGE_IMAGE_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ""
          void send(file)
        }}
      />
      <FilesLibraryChooser open={choosing} onClose={() => setChoosing(false)} selectedUrl={value || null} onPick={pick} />
    </div>
  )
}
