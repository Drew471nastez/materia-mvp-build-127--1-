"use client"

/**
 * ===========================================================================
 *  A VIDEO BLOCK'S SOURCE, AND A SONG'S COVER (round AR3)
 * ===========================================================================
 * The owner: "for the video I can just upload a video I have from my files on
 * Storelib, or upload my own video, to display here in the OnePage, a very
 * modern, smooth, clean player".
 *
 *   VideoSourceFields  a YouTube, Vimeo or TikTok address, or Upload, or Your
 *                      files (the store's videos, components/files/files-library).
 *                      An uploaded video gets its poster and two switches:
 *                      start by itself (muted) and play again at the end.
 *   useCoverFromPreview  a song's cover and a Vimeo video's frame for the
 *                      card layout, read once from the address's public
 *                      preview (app/api/onepage/link-preview, server side,
 *                      with its address checks), never typed over.
 */
import * as React from "react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { secondaryDepth } from "@/components/ui/depth-button"
import { Switch } from "@/components/onepage/editor-kit"
import { OnePageImageField } from "@/components/onepage/image-field"
import { FilesLibraryChooser, LibraryButton } from "@/components/onepage/library-pick"
import { UploadProgress, useMediaUpload } from "@/components/onepage/upload-progress"
import { ONEPAGE_VIDEO_ACCEPT } from "@/lib/onepage/media-rules"
import { videoFileUrl } from "@/lib/onepage/media-layout"
import { videoSource } from "@/lib/onepage/extra-blocks"
import type { VideoBlockData } from "@/lib/onepage/types"

const fieldInput =
  "block h-11 w-full rounded-xl border border-[#e3e4e8] bg-white px-3.5 text-[16px] text-[#1a1a2e] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[#9ca3af] focus:border-[#1a1a2e] focus:shadow-[0_0_0_3px_rgba(26,26,46,0.08)] sm:text-[14px]"

export function VideoSourceFields({ data, blockId, updateData }: { data: VideoBlockData; blockId: string; updateData: (patch: Partial<VideoBlockData>) => void }) {
  const up = useMediaUpload()
  const input = React.useRef<HTMLInputElement>(null)
  const [choosing, setChoosing] = React.useState(false)
  const file = videoFileUrl(data.url)
  const ok = !data.url?.trim() || videoSource(data.url) !== null
  const send = async (f: File | undefined) => {
    if (!f) return
    const r = await up.upload(f, { prefix: `video_${blockId}`, want: "video" })
    if (r) updateData({ url: r.url })
  }
  return (
    <div className="space-y-3" data-video-source="">
      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-[#1a1a2e]">{tt("Video")}</span>
        <input
          className={fieldInput}
          value={file ? "" : data.url || ""}
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder={file ? tt("Your uploaded video") : "https://youtube.com/watch?v=..."}
          onChange={(e) => updateData({ url: e.target.value.trim() })}
          aria-invalid={!ok || undefined}
        />
      </label>
      {!ok ? <p className="text-[12px] text-[#b42318]">{tt("Paste a YouTube, Vimeo or TikTok video link, or upload a video.")}</p> : null}
      {up.busy ? (
        <UploadProgress state={up.state} onCancel={up.cancel} />
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" data-video-upload="" onClick={() => input.current?.click()} className={cn(secondaryDepth, "h-9 rounded-lg px-3 text-[13px]")}>
            {file ? tt("Replace video") : tt("Upload a video")}
          </button>
          <LibraryButton kind="video" onClick={() => setChoosing(true)} />
          {file ? (
            <button type="button" onClick={() => updateData({ url: "", poster_url: null })} className="h-9 rounded-lg px-2.5 text-[13px] font-medium text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#b42318]">
              {tt("Remove")}
            </button>
          ) : null}
        </div>
      )}
      {!up.busy ? <UploadProgress state={up.state} /> : null}
      <input
        ref={input}
        type="file"
        accept={ONEPAGE_VIDEO_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ""
          void send(f)
        }}
      />
      <FilesLibraryChooser open={choosing} onClose={() => setChoosing(false)} kind="video" selectedUrl={file} onPick={(url) => { setChoosing(false); updateData({ url }) }} />
      {file ? (
        <div className="space-y-3 border-t border-[#eef0f2] pt-3" data-video-file-options="">
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-[#1a1a2e]">{tt("Cover picture")}</span>
            <OnePageImageField value={data.poster_url} prefix={`video_poster_${blockId}`} onChange={(url) => updateData({ poster_url: url })} />
          </div>
          <div className="flex min-h-11 items-center justify-between gap-3">
            <span className="min-w-0">
              <span className="block text-[14px] font-medium text-[#1a1a2e]">{tt("Play by itself")}</span>
              <span className="block text-[12.5px] text-[#6b7280]">{tt("Starts muted when it is on screen")}</span>
            </span>
            <Switch label={tt("Play by itself")} checked={!!data.autoplay} onChange={(autoplay) => updateData({ autoplay })} />
          </div>
          <div className="flex min-h-11 items-center justify-between gap-3">
            <span className="text-[14px] font-medium text-[#1a1a2e]">{tt("Play again at the end")}</span>
            <Switch label={tt("Play again at the end")} checked={!!data.loop} onChange={(loop) => updateData({ loop })} />
          </div>
        </div>
      ) : null}
    </div>
  )
}

export { useCoverFromPreview } from "./cover-from-preview"
