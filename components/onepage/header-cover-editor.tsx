"use client"

import { useState } from "react"
import { ImageUpload } from "@/components/app/image-upload"
import { useOnePage } from "@/lib/onepage/context"
import { cropFromSettings, DEFAULT_COVER_CROP } from "@/lib/images/cover-crop"
import { coverAspect } from "@/lib/onepage/theme-layout"
import { FilesLibraryChooser, LibraryButton } from "@/components/onepage/library-pick"
import { tt } from "@/lib/i18n/text"

/**
 * One cover source for Header, Design, preview and publication. Account
 * avatars are never written here. Cropping keeps the original uploaded file;
 * the page stores where the picture sits (x, y) and how close (zoom), so one
 * upload fits a phone and a laptop.
 *
 * The cover is drawn on every header layout (lib/onepage/theme-layout
 * coverImageOf): a band on Classic, edge to edge since round AL, the fading
 * picture on Hero. The crop frame takes the shape the page will draw, so
 * what is dragged here is what shows there. Pages that switched to Classic
 * when a cover was added before Hero could draw one get their layout back
 * when it is removed.
 *
 * Round AL: "have the option to choose from my own files". Beside the
 * upload, "Your files" opens the same chooser the photo and the wallpaper
 * use (components/onepage/library-pick). A picture from Files is used as it
 * is stored, as a fresh cover from the middle, and is then moved and zoomed
 * in the same frame as an upload.
 */
export function HeaderCoverEditor() {
  const { onepage, updateTheme } = useOnePage()
  const [library, setLibrary] = useState(false)
  if (!onepage) return null
  const theme = onepage.theme
  const crop = cropFromSettings(theme.cover_crop, theme.cover_crop?.zoom)
  /* The shape the page draws with this cover in place, whether or not one is uploaded yet. */
  const aspect = coverAspect({ ...theme, cover_image_url: theme.cover_image_url || "https://storelib.com/x", cover_profile_layout: true }, false)
  const setCover = (url: string | null) =>
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
  return (
    <div
      data-header-cover-editor=""
      data-cover-aspect={aspect.toFixed(3)}
      className="space-y-2"
    >
      <div className="flex min-h-9 items-center justify-between gap-3">
        <p className="text-[15px] font-medium text-[#1a1a2e]">{tt("Cover image")}</p>
        <LibraryButton onClick={() => setLibrary(true)} />
      </div>
      <ImageUpload
        bucket="covers"
        aspectRatio="cover"
        value={theme.cover_image_url || undefined}
        replaceOnly
        allowRemove
        livePreview
        maxSizeMB={15}
        replaceLabel={tt("Replace cover image")}
        emptyBand={{
          label: tt("Upload cover image"),
          hint: tt("Optional. Your profile photo stays separate."),
        }}
        onChange={(url) => setCover(url || null)}
        reposition={{
          value: crop,
          onChange: (next) =>
            updateTheme({ cover_crop: next, cover_profile_layout: true }),
          aspect,
          editable: true,
        }}
      />
      {theme.cover_image_url ? (
        <p className="text-[13px] text-[#6b7280]">
          {tt("Drag to move. Pinch or Ctrl and scroll to zoom.")}
        </p>
      ) : null}
      <FilesLibraryChooser
        open={library}
        onClose={() => setLibrary(false)}
        selectedUrl={theme.cover_image_url || null}
        onPick={(url) => setCover(url)}
      />
    </div>
  )
}
