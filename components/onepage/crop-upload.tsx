"use client"

/**
 * ===========================================================================
 *  CROP, THEN UPLOAD: THE BODY OF EVERY ONEPAGE CROP SHEET
 * ===========================================================================
 * The profile photo and video (in the Links tab and the Design tab), the
 * logo and the wallpaper video each open a sheet with this inside: the
 * cropper (components/onepage/media-cropper.tsx), one line of help, the
 * upload's progress with Stop, and Cancel / Save.
 *
 *   picture   the framed part is drawn onto a canvas at `outputSize` and
 *             that new file is uploaded (so the stored picture is exactly
 *             what was framed, and small)
 *   video     the file is uploaded as it is, straight to storage (resumable
 *             above 6 MB, up to 2 GB), and the crop is handed back to be
 *             saved beside it; the page draws the video through it
 *             (lib/onepage/media-crop.ts croppedMediaStyle)
 *
 * The sheet stays open while it uploads; Save becomes the progress, Stop
 * stops it, and a failure says why under it and leaves everything as it was
 * so Save can be pressed again. Once the bytes are up the bar stays full and
 * reads Saving until the address is written, so the sheet never flicks back
 * to Cancel / Save in between.
 *
 * A VIDEO GOES UP WITH ITS FIRST FRAME (round 40). The frame is read from
 * the file in the browser before the upload starts (lib/onepage/
 * capture-poster), uploaded after the video as a small JPEG, and handed back
 * on the crop (`crop.poster`), so the page can draw that frame where the
 * video will be while the video loads (components/onepage/poster-video).
 * A video already in the creator's Files (`existingUrl`) is not uploaded
 * again: only its crop is saved, with the poster Files already keeps.
 */
import { useState } from "react"
import { Loader2 } from "lucide-react"
import { tt } from "@/lib/i18n/text"
import { cn } from "@/lib/utils"
import type { MediaCrop } from "@/lib/onepage/media-crop"
import { UploadError, cropImageBlob, uploadMessage, uploadOnePageMedia, type MediaUploadResult } from "@/lib/onepage/media-upload"
import { captureVideoPoster } from "@/lib/onepage/capture-poster"
import { withPoster } from "@/lib/onepage/poster-video"
import { MediaCropper } from "./media-cropper"
import { UploadProgress, useMediaUpload } from "./upload-progress"

export interface CropUploadProps {
  kind: "image" | "video"
  /** What the cropper shows (an object URL). */
  src: string
  /** The file chosen (for a picture, a JPEG already when it was a HEIC). */
  file: Blob
  aspect: number | null
  shape?: "circle" | "rect"
  initial?: MediaCrop | null
  /** Storage name prefix: "avatar", "wallpaper-video". */
  prefix: string
  bucket?: string
  /** A picture's longest side after the crop. */
  outputSize?: number
  outputType?: "image/jpeg" | "image/png" | "image/webp"
  help?: string
  maxHeight?: number
  /** Called after the upload: save the address (and the crop). Throw to show an error. */
  onSaved: (result: MediaUploadResult, crop: MediaCrop) => Promise<void> | void
  onCancel: () => void
  saveLabel?: string
  /** A video already stored (picked from Files): nothing is uploaded, the crop is saved with this address. */
  existingUrl?: string | null
  /** Its first frame, when Files keeps one. */
  existingPoster?: string | null
}

export function CropUpload({ kind, src, file, aspect, shape = "rect", initial, prefix, bucket, outputSize = 1024, outputType = "image/jpeg", help, maxHeight, onSaved, onCancel, saveLabel, existingUrl, existingPoster }: CropUploadProps) {
  const [crop, setCrop] = useState<MediaCrop | null>(null)
  const [saving, setSaving] = useState(false)
  /* Uploaded; the address (and the poster) being written. */
  const [writing, setWriting] = useState(false)
  const up = useMediaUpload()

  const save = async () => {
    if (!crop || saving) return
    setSaving(true)
    up.clear()
    try {
      if (kind === "video" && existingUrl) {
        setWriting(true)
        const poster = existingPoster || (await upPoster(await captureVideoPoster(existingUrl), prefix))
        await onSaved({ url: existingUrl, path: "", bucket: "", mime: "video/mp4", size: 0, kind: "video" }, withPoster(crop, poster))
        return
      }
      /* The first frame is read from the file on this device while it goes up: quick, and nothing to download. */
      const frame = kind === "video" ? captureVideoPoster(src) : null
      const body = kind === "image" ? await cropImageBlob(file, crop, { size: outputSize, type: outputType }) : file
      const result = await up.upload(body, { prefix, bucket, want: kind })
      if (!result) return
      setWriting(true)
      const poster = frame ? await upPoster(await frame, prefix) : null
      await onSaved(result, kind === "video" ? withPoster(crop, poster) : crop)
    } catch (err) {
      /* A picture that would not draw is an UploadError with its own words; anything else failed after the upload. */
      up.fail(err instanceof UploadError ? uploadMessage(err) : tt("The file went up, but it did not save. Try again."))
    } finally {
      setSaving(false)
      setWriting(false)
    }
  }

  return (
    <div className="space-y-4" data-crop-upload={kind}>
      <MediaCropper kind={kind} src={src} aspect={aspect} shape={shape} initial={initial} onChange={setCrop} maxHeight={maxHeight} />
      <p className="text-center text-[12.5px] text-[#6b7280]">{help ?? tt("Drag to move. Drag a corner or an edge to resize. Pinch to zoom.")}</p>
      <div className="min-h-[44px]">
        {writing ? (
          /* The bytes are up (or there were none to send): a full bar until the address is written. */
          <UploadProgress state={{ phase: "uploading", loaded: 1, total: 1, percent: 100 }} finishing />
        ) : saving && up.state.phase === "idle" ? (
          /* The crop being drawn, before the first byte: the same line, never the buttons again. */
          <UploadProgress state={{ phase: "preparing" }} />
        ) : up.state.phase === "idle" || up.state.phase === "error" ? (
          <div className="space-y-3">
            <UploadProgress state={up.state} />
            <div className="flex gap-2">
              <button type="button" onClick={onCancel} className="h-11 flex-1 cursor-pointer rounded-xl border border-[#e3e4e8] bg-white text-[14px] font-medium text-[#1a1a2e]">
                {tt("Cancel")}
              </button>
              <button
                type="button"
                onClick={save}
                disabled={!crop || saving}
                data-crop-save=""
                className={cn("flex h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#1a1a2e] text-[14px] font-medium text-white disabled:cursor-default disabled:opacity-60")}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {up.state.phase === "error" ? tt("Try again") : saveLabel ?? tt("Save")}
              </button>
            </div>
          </div>
        ) : (
          <UploadProgress state={up.state} onCancel={up.cancel} />
        )}
      </div>
    </div>
  )
}

/** The first frame, uploaded beside the video; null when there is none or it did not go up (the video is saved either way). */
async function upPoster(frame: Blob | null, prefix: string): Promise<string | null> {
  if (!frame) return null
  try {
    const named = new File([frame], "poster.jpg", { type: "image/jpeg" })
    return (await uploadOnePageMedia(named, { prefix: `${prefix}-poster`, want: "image" })).url
  } catch {
    return null
  }
}
