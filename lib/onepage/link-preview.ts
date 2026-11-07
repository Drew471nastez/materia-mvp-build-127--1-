/**
 * ===========================================================================
 *  A LINK'S PREVIEW, MERGED WITHOUT TOUCHING WHAT THE CREATOR CHANGED
 * ===========================================================================
 * The server reads a pasted address's public title, description, picture and
 * icon (app/api/onepage/link-preview). This decides which of them land on
 * the card. A field the creator typed, uploaded or removed is marked in
 * `link_preview` (title_edited, description_edited, image_edited,
 * image_hidden) and a refresh never writes over it. A field that still holds
 * the previous preview's value is the preview's, and follows the new one.
 *
 * Client safe: no server imports, so the editor and the tests share it.
 */
import type { LinkButtonBlockData } from "./types"

export interface FetchedPreview {
  url?: string
  title?: string
  description?: string
  image?: string | null
  favicon?: string | null
}
export type LinkPreviewState = NonNullable<LinkButtonBlockData["link_preview"]>

/** The placeholder names a new link starts with, in any language the editor shows. */
export function isPlaceholderTitle(label: string | null | undefined, placeholders: readonly string[] = []): boolean {
  const t = (label ?? "").trim()
  return !t || /^(?:my\s*link|link)$/i.test(t) || placeholders.includes(t)
}

export interface PreviewMerge {
  /** Fields for the block's data. Empty when the preview is off. */
  data: Partial<LinkButtonBlockData>
  /** The description line to write, or undefined to leave it as it is. */
  subtitle?: string
}

/**
 * What a fetched preview changes. `subtitle` is the block's description line
 * (style.presentation.subtitle) as it is now.
 */
export function mergeLinkPreview(current: LinkButtonBlockData, subtitle: string | undefined, meta: FetchedPreview, placeholders: readonly string[] = []): PreviewMerge {
  const prev: LinkPreviewState = current.link_preview ?? {}
  if (prev.enabled === false) return { data: {} }
  const title = typeof meta.title === "string" ? meta.title.slice(0, 200) : ""
  const description = typeof meta.description === "string" ? meta.description.slice(0, 600) : ""
  const image = typeof meta.image === "string" && meta.image ? meta.image : null
  const next: LinkPreviewState = {
    ...prev,
    url: meta.url ?? prev.url,
    title,
    description,
    image,
    favicon: typeof meta.favicon === "string" && meta.favicon ? meta.favicon : null,
  }
  const data: Partial<LinkButtonBlockData> = { link_preview: next }
  /* Typed, cleared or removed by hand: the creator's, for good (Restore preview gives it back). */
  if (title && !prev.title_edited && (isPlaceholderTitle(current.label, placeholders) || current.label === prev.title)) data.label = title
  const pictureIsPreview = !current.thumbnail_url || current.thumbnail_url === prev.image
  if (!prev.image_hidden && !prev.image_edited && pictureIsPreview && current.thumbnail_url !== image) data.thumbnail_url = image
  let nextSubtitle: string | undefined
  const subtitleIsPreview = !subtitle?.trim() || subtitle === prev.description
  if (!prev.description_edited && subtitleIsPreview && description !== (subtitle ?? "")) nextSubtitle = description
  return { data, subtitle: nextSubtitle }
}

/** Marks for an edit made by hand, so the next refresh leaves it. */
export const editedMark = {
  title: (p: LinkPreviewState | undefined): LinkPreviewState => ({ ...p, title_edited: true }),
  description: (p: LinkPreviewState | undefined): LinkPreviewState => ({ ...p, description_edited: true }),
  /** An uploaded or picked picture. */
  image: (p: LinkPreviewState | undefined): LinkPreviewState => ({ ...p, image_edited: true, image_hidden: false }),
  /** The picture removed: no picture, and none from the next refresh either. */
  imageRemoved: (p: LinkPreviewState | undefined): LinkPreviewState => ({ ...p, image_hidden: true, image_edited: false }),
}

/** Back to the preview's own values: the marks cleared, the fetched values put back. */
export function restorePreview(current: LinkButtonBlockData): PreviewMerge {
  const p = current.link_preview ?? {}
  return {
    data: {
      label: p.title || current.label,
      thumbnail_url: p.image ?? null,
      link_preview: { ...p, title_edited: false, description_edited: false, image_edited: false, image_hidden: false },
    },
    subtitle: p.description ?? "",
  }
}
