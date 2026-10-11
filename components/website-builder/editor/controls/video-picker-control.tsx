"use client"

/**
 * ===========================================================================
 *  A VIDEO FILE: UPLOADED, OR LINKED
 * ===========================================================================
 * The control for `video_picker`. It was a bare text box with a <video>
 * over it, which meant the only way to put a video on a page was to have
 * one hosted somewhere already and know its address.
 *
 * Now it takes a file the way the image picker does, uploaded to the
 * creator's own storage (the same bucket, which takes MP4, WebM and
 * QuickTime), or a link to a video file anywhere. The box shows the video
 * itself, muted, so what was chosen is visible rather than described.
 *
 * A YouTube or Vimeo address is a page, not a file, and a <video> cannot
 * play it. Pasted here, it is refused with what to use instead: the
 * section's video link setting (`video_url`), which embeds the player.
 */

import * as React from "react"
import { isOwnMedia } from "@/lib/storage/media-url"
import { ChevronDown, Film, FolderOpen, Loader2, RefreshCw, Trash2, Upload } from "lucide-react"
import { toast } from "sonner"

import { confirmUpload } from "@/lib/storage/confirm-upload"
import { createClient } from "@/lib/supabase/client"
import { parseVideoUrl } from "@/lib/storelib-theme/values"
import { useEchoedValue } from "@/components/website-builder/echo-field"
import { FilesLibraryChooser, prefetchLibrary } from "@/components/files/files-library"
import { ResponsiveActionMenu } from "@/components/ui/responsive-action-menu"
import { INPUT, NOTE, PROBLEM } from "./styles"

/** What the store-builder-images bucket takes as video. */
export const VIDEO_TYPES: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "video/x-m4v": "m4v",
}
/** The largest video this control uploads from the sidebar. */
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024

/** A link a <video> element can play: an address ending in a video file's extension, or one of this site's own uploads. */
export function isVideoFileUrl(value: string): boolean {
  const v = value.trim()
  if (!/^(https?:\/\/|\/(?![/\\]))/i.test(v)) return false
  const path = v.split(/[?#]/)[0].toLowerCase()
  return /\.(mp4|webm|mov|m4v|ogv)$/.test(path) || /\/storage\/v1\/object\/public\/store-builder-images\//.test(v)
}

export function VideoPickerControl({ value, onChange, label }: { value: string; onChange: (v: unknown) => void; label?: string }) {
  const [shown, set] = useEchoedValue(value ?? "", onChange)
  const [uploading, setUploading] = React.useState(false)
  /* The store's own videos (components/files/files-library.tsx, kind "video"): part of this control, as Your files is part of the image picker. */
  const [choosing, setChoosing] = React.useState(false)
  const warm = () => void prefetchLibrary("video")
  const input = React.useRef<HTMLInputElement>(null)
  const text = typeof shown === "string" ? shown.trim() : ""
  const playable = !!text && isVideoFileUrl(text)
  const player = text && !playable ? parseVideoUrl(text) : null

  const upload = async (file: File) => {
    const ext = VIDEO_TYPES[file.type]
    if (!ext) {
      toast.error("Choose an MP4, WebM or MOV video")
      return
    }
    if (file.size > MAX_VIDEO_BYTES) {
      toast.error("A video here is at most 200 MB")
      return
    }
    setUploading(true)
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error("Not signed in")
      const path = `${user.id}/videos/${Date.now()}.${ext}`
      const { error } = await supabase.storage.from("store-builder-images").upload(path, file, {
        cacheControl: "31536000",
        upsert: true,
        contentType: file.type,
      })
      if (error) throw error
      confirmUpload("store-builder-images", path)
      set(supabase.storage.from("store-builder-images").getPublicUrl(path).data.publicUrl)
    } catch {
      toast.error("Upload failed. Try again.")
    } finally {
      setUploading(false)
    }
  }

  const actionClass = "inline-flex items-center gap-1 rounded-md border border-black/[0.08] bg-white px-2.5 h-8 text-[12.5px] font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-40 max-sm:h-10 max-sm:px-3.5"
  return (
    <div className="space-y-1.5" data-video-picker="">
      {playable ? (
        <div className="space-y-1.5">
          <div className="relative aspect-video w-full overflow-hidden rounded-md border border-border bg-black">
            <video src={text} className="h-full w-full object-cover" muted playsInline preload="metadata" />
            {uploading && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
                <Loader2 className="h-4 w-4 animate-spin" />
              </span>
            )}
          </div>
          {/* A video already there: Change (upload another or choose one of yours) and Remove, under it. */}
          <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-border">
            <ResponsiveActionMenu
              title="Change video"
              menuWidth="w-56"
              align="start"
              items={[
                { label: "Upload a new one", icon: <Upload className="h-4 w-4" />, onClick: () => input.current?.click() },
                { label: "Choose from your files", icon: <FolderOpen className="h-4 w-4" />, onClick: () => setChoosing(true) },
              ]}
              trigger={
                <button type="button" disabled={uploading} onPointerEnter={warm} onFocus={warm} className="flex h-10 w-full items-center justify-center gap-1.5 text-[13px] font-medium transition-colors hover:bg-muted/60 disabled:opacity-40 md:h-9 md:text-xs data-[state=open]:bg-muted/60" data-video-change="">
                  <RefreshCw className="h-3 w-3" />
                  Change
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </button>
              }
            />
            <button type="button" aria-label="Remove video" disabled={uploading} onClick={() => set("")} className="flex h-10 items-center justify-center gap-1.5 border-l border-border text-[13px] font-medium transition-colors hover:bg-muted/60 disabled:opacity-40 md:h-9 md:text-xs">
              <Trash2 className="h-3 w-3" />
              Remove
            </button>
          </div>
        </div>
      ) : (
        <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border text-[12px] text-muted-foreground" data-video-empty="">
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Film className="h-4 w-4" strokeWidth={1.75} />}
          <span className="font-medium text-foreground/80">{uploading ? "Uploading" : "Add a video"}</span>
          {!uploading && (
            <span className="flex items-center gap-1.5">
              <button type="button" onClick={() => input.current?.click()} className={actionClass} data-video-upload="">
                <Upload className="h-3 w-3" />
                Upload
              </button>
              <button type="button" onClick={() => setChoosing(true)} onPointerEnter={warm} onFocus={warm} className={actionClass} data-video-library="">
                <FolderOpen className="h-3 w-3" />
                Your files
              </button>
            </span>
          )}
        </div>
      )}
      <FilesLibraryChooser kind="video" open={choosing} onClose={() => setChoosing(false)} selectedUrl={text || null} onPick={(url) => set(url)} />
      <input
        ref={input}
        type="file"
        accept={Object.keys(VIDEO_TYPES).join(",")}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ""
          if (file) void upload(file)
        }}
      />
      <input
        type="url"
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        aria-label={label ? `${label} link` : "Video link"}
        aria-invalid={!!text && !playable}
        className={INPUT}
        placeholder="Or paste a link to an .mp4 or .webm"
        /* An uploaded video is the player above, never an address here (lib/storage/media-url.ts). */
        value={typeof shown === "string" && !isOwnMedia(shown) ? shown : ""}
        onChange={(e) => set(e.target.value)}
      />
      {text && player && (
        <p className={PROBLEM} role="alert">
          That is a {player.host === "youtube" ? "YouTube" : "Vimeo"} page, which a video file setting cannot play. Use the section&apos;s video link setting for it.
        </p>
      )}
      {text && !playable && !player && <p className={PROBLEM} role="alert">This is not a link to a video file. It should end in .mp4, .webm or .mov.</p>}
      {!text && <p className={NOTE}>MP4, WebM or MOV, up to 200 MB.</p>}
    </div>
  )
}
