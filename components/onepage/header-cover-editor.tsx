"use client"

import { ImageUpload } from "@/components/app/image-upload"
import { useOnePage } from "@/lib/onepage/context"
import { cropFromSettings, DEFAULT_COVER_CROP } from "@/lib/images/cover-crop"

/** One cover source for Header, Design, preview and publication. Account
 * avatars are never written here. Cropping keeps the original uploaded file. */
export function HeaderCoverEditor() {
  const { onepage, updateTheme } = useOnePage()
  if (!onepage) return null
  const theme = onepage.theme
  const crop = cropFromSettings(theme.cover_crop, theme.cover_crop?.zoom)
  return (
    <div
      data-header-cover-editor=""
      className="space-y-2 border-t border-[#eef0f2] pt-3"
    >
      <p className="text-xs font-semibold text-[#1a1a2e]">Cover Image</p>
      <ImageUpload
        bucket="covers"
        aspectRatio="cover"
        value={theme.cover_image_url || undefined}
        replaceOnly
        allowRemove
        livePreview
        maxSizeMB={15}
        replaceLabel="Replace cover image"
        emptyBand={{
          label: "Upload cover image",
          hint: "Optional. Your profile photo stays separate.",
        }}
        onChange={(url) =>
          updateTheme({
            cover_image_url: url,
            cover_crop: { ...DEFAULT_COVER_CROP },
            cover_profile_layout: true,
            ...(url
              ? {
                  header_layout: "classic" as const,
                  cover_previous_header_layout:
                    theme.cover_previous_header_layout ??
                    theme.header_layout ??
                    "classic",
                }
              : {
                  header_layout:
                    theme.cover_previous_header_layout ?? theme.header_layout,
                  cover_previous_header_layout: undefined,
                }),
          })
        }
        reposition={{
          value: crop,
          onChange: (next) =>
            updateTheme({ cover_crop: next, cover_profile_layout: true }),
          aspect: 3,
          editable: true,
        }}
      />
      {theme.cover_image_url ? (
        <p className="text-xs text-[#6b7280]">
          Drag to reposition. Pinch or Ctrl + scroll to crop closer.
        </p>
      ) : null}
    </div>
  )
}
