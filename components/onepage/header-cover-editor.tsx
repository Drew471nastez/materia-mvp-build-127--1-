"use client"

import { useState } from "react"
import { useOnePage } from "@/lib/onepage/context"
import { cropFromSettings, coverEditorSrc, DEFAULT_COVER_CROP, isDefaultCrop } from "@/lib/images/cover-crop"
import { coverAspect } from "@/lib/onepage/theme-layout"
import { CoverCropFrame } from "@/components/app/cover-crop-frame"
import { Reveal } from "@/components/ui/reveal"
import { OnePageImageField } from "./image-field"
import { tt } from "@/lib/i18n/text"
import { cn } from "@/lib/utils"

/**
 * One cover source for Header, Design, preview and publication. Account
 * avatars are never written here. Cropping keeps the original uploaded file;
 * the page stores where the picture sits (x, y) and how close (zoom), so one
 * upload fits a phone and a laptop.
 *
 * The cover is drawn on every header layout (lib/onepage/theme-layout
 * coverImageOf): a band on Classic, edge to edge since round AL, the fading
 * picture on Hero. Pages that switched to Classic when a cover was added
 * before Hero could draw one get their layout back when it is removed.
 *
 * ROUND AR, the owner: "the picker of the cover image should not be that
 * big". With no cover it was an 840 by 630 grey box, the band's own shape at
 * the editor's full width. Now it is the editor's one picture row
 * (./image-field OnePageImageField): a small thumbnail, Upload or Replace,
 * Your files, Remove, and a picture dropped on the row on a computer. The
 * crop frame (drag to move, pinch or Ctrl and scroll to zoom) opens under
 * the row only when Adjust is pressed, at most 360px wide, in the shape the
 * page draws, so what is dragged there is what shows there.
 */
export function HeaderCoverEditor() {
  const { onepage, updateTheme } = useOnePage()
  const [adjusting, setAdjusting] = useState(false)
  if (!onepage) return null
  const theme = onepage.theme
  const crop = cropFromSettings(theme.cover_crop, theme.cover_crop?.zoom)
  /* The shape the page draws with this cover in place, whether or not one is uploaded yet. */
  const aspect = coverAspect({ ...theme, cover_image_url: theme.cover_image_url || "https://storelib.com/x", cover_profile_layout: true }, false)
  const setCover = (url: string | null) => {
    if (!url) setAdjusting(false)
    updateTheme({
      cover_image_url: url,
      cover_crop: { ...DEFAULT_COVER_CROP },
      cover_profile_layout: true,
      ...(url
        ? {}
        : {
            cover_previous_header_layout: undefined,
            ...(theme.cover_previous_header_layout &&
            (theme.header_layout ?? "classic") === "classic"
              ? { header_layout: theme.cover_previous_header_layout }
              : {}),
          }),
    })
  }
  const cover = theme.cover_image_url || null
  return (
    <div data-header-cover-editor="" data-cover-aspect={aspect.toFixed(3)} className="space-y-2">
      <p className="text-[15px] font-medium text-[#1a1a2e]">{tt("Cover image")}</p>
      <OnePageImageField
        value={cover}
        prefix="cover"
        label={cover ? tt("Replace cover image") : tt("Upload cover image")}
        thumbClassName="w-24"
        onChange={(url) => setCover(url)}
        extra={
          <button
            type="button"
            onClick={() => setAdjusting((v) => !v)}
            aria-expanded={adjusting}
            data-cover-adjust=""
            className={cn(
              "h-9 cursor-pointer rounded-lg px-2.5 text-[13px] font-medium transition-colors hover:bg-[#f3f4f6]",
              adjusting ? "text-[#1a1a2e]" : "text-[#6b7280] hover:text-[#1a1a2e]",
            )}
          >
            {adjusting ? tt("Done") : tt("Adjust")}
          </button>
        }
      />
      {!cover ? <p className="text-[13px] text-[#6b7280]">{tt("Optional. Your profile photo stays separate.")}</p> : null}
      <Reveal open={!!cover && adjusting}>
        {cover ? (
          <div className="max-w-[360px] space-y-2 pt-1" data-cover-crop="">
            <CoverCropFrame
              key={cover}
              src={coverEditorSrc(cover)}
              crop={crop}
              onChange={(next) => updateTheme({ cover_crop: next, cover_profile_layout: true })}
              aspect={aspect}
              label={tt("Move the cover image")}
            >
              {!isDefaultCrop(crop) ? (
                <button
                  type="button"
                  onClick={() => updateTheme({ cover_crop: { ...DEFAULT_COVER_CROP }, cover_profile_layout: true })}
                  className="absolute bottom-2 left-2 h-8 rounded-full bg-black/60 px-3 text-[12px] font-medium text-white transition-colors pointer-fine:hover:bg-black/75"
                >
                  {tt("Reset")}
                </button>
              ) : null}
            </CoverCropFrame>
            <p className="text-[13px] text-[#6b7280]">{tt("Drag to move. Pinch or Ctrl and scroll to zoom.")}</p>
          </div>
        ) : null}
      </Reveal>
    </div>
  )
}
