/**
 * ===========================================================================
 *  THE SHAPE THE PUBLISHED PAGE IS DRAWN FROM, BUILT IN ONE PLACE
 * ===========================================================================
 * components/onepage/public-onepage.tsx draws a OnePage from one object:
 * title, bio, picture, theme, blocks, social links, settings. The public
 * route built that object from the published copy of a row, and the editor's
 * preview read the draft straight off the row in a shape of its own. Two
 * readings of one row is where "the preview is not like the live page"
 * starts, so both build it here:
 *
 *   published   what a visitor sees: the copy taken at the last publish,
 *               falling back to the row for a page published before the
 *               copies existed (app/(marketing)/l/[slug]/page.tsx)
 *   draft       what the editor shows: the row as it is being edited
 *
 * A block outside its schedule is left out in both, so it is not in the
 * page at all until it starts.
 *
 * AND THE BLOCKS ARE READ THE SAME WAY ON BOTH SIDES (drawnBlocks below):
 *
 *   social row   drawn from the page's social links, in the row's own order
 *                (lib/onepage/editor-state syncedSocialPlatforms), on a page
 *                that has social links at all. The row
 *                keeps a copy of every platform and address, and that copy
 *                was brought in line only by an effect in the Links tab, so
 *                the preview showed one set of icons on Links and another on
 *                Design, and an address edited in the social links kept the
 *                old one on the live page.
 *   link address an address typed without its scheme ("example.com/shop") is
 *                opened as https. As it was saved, the page drew it as a
 *                path on storelib.me, which is a 404.
 */
import { withoutRetiredTheme } from "./retired-themes"
import { isScheduledNow } from "@/lib/onepage/extra-blocks"
import { syncedSocialPlatforms } from "@/lib/onepage/editor-state"
import { creatorName, creatorPhoto } from "@/lib/account/identity"

/** The row as it is stored, as far as the page reads it. */
export type OnePageRowLike = {
  id: string
  slug?: string | null
  title?: string | null
  bio?: string | null
  avatar_url?: string | null
  avatar_video_url?: string | null
  theme?: unknown
  settings?: Record<string, unknown> | null
  social_links?: Record<string, unknown> | null
  draft_blocks?: unknown[] | null
  published_blocks?: unknown[] | null
  published_theme?: unknown
  published_profile?: unknown
  published_social_links?: Record<string, unknown> | null
  seller_id?: string | null
  creator_id?: string | null
}

/** A page with no theme at all (a row older than themes) is drawn in this one. */
export const FALLBACK_PUBLIC_THEME = {
  background_type: "solid",
  background_color: "#ffffff",
  background_gradient: "",
  background_image_url: "",
  text_color: "#000000",
  secondary_text_color: "#666666",
  button_color: "#000000",
  button_text_color: "#ffffff",
  button_style: "filled",
  button_border_radius: 8,
  button_border_width: 0,
  button_border_color: "#000000",
  font_family: "Inter",
  spacing: "normal",
  card_width: "standard",
}

/** "example.com/shop" opens https://example.com/shop; anything with a scheme, a path, an anchor or no dot is left as it is. */
export function linkHref(url: unknown): unknown {
  if (typeof url !== "string") return url
  const trimmed = url.trim()
  if (!trimmed || /^[a-z][a-z0-9+.-]*:/i.test(trimmed) || /^[/#?]/.test(trimmed)) return url
  if (/^www\.|^[^\s/@]+\.[a-z]{2,}(?:[:/?#]|$)/i.test(trimmed)) return `https://${trimmed.replace(/^\/+/, "")}`
  return url
}

function drawnBlock(block: any, social: Record<string, unknown>): any {
  if (!block || typeof block !== "object" || !block.data || typeof block.data !== "object") return block
  /* A page with no social links at all keeps its row as saved: it was made before the links were the row's source, and the editor brings it in line the next time it is saved. */
  if (block.type === "social_row" && Object.values(social || {}).some((v) => typeof v === "string" && v.trim() !== "")) {
    const platforms = syncedSocialPlatforms(block.data.platforms, social)
    return platforms ? { ...block, data: { ...block.data, platforms } } : block
  }
  if (block.type === "link_button") {
    const href = linkHref(block.data.url)
    return href === block.data.url ? block : { ...block, data: { ...block.data, url: href } }
  }
  /* A clickable picture's link typed without its scheme ("instagram.com/mara") opens as https too, not as a 404 under storelib.me. */
  if (block.type === "image") {
    const link = linkHref(block.data.link_url)
    const images = Array.isArray(block.data.images) ? block.data.images : null
    const nextImages = images?.map((img: any) => {
      if (!img || typeof img !== "object") return img
      const href = linkHref(img.link_url)
      return href === img.link_url ? img : { ...img, link_url: href }
    })
    const imagesChanged = !!images && nextImages!.some((img: any, i: number) => img !== images[i])
    if (link === block.data.link_url && !imagesChanged) return block
    return { ...block, data: { ...block.data, link_url: link, ...(imagesChanged ? { images: nextImages } : {}) } }
  }
  if (block.type === "group" && Array.isArray(block.data.children)) {
    const children = block.data.children.map((c: any) => drawnBlock(c, social))
    return children.every((c: any, i: number) => c === block.data.children[i]) ? block : { ...block, data: { ...block.data, children } }
  }
  return block
}

/** The blocks as both sides draw them: in their schedule, social rows from the social links, link addresses that open. */
export function drawnBlocks(blocks: any[], social: Record<string, unknown>, now: number): any[] {
  return blocks.filter((b) => isScheduledNow(b, now)).map((b) => drawnBlock(b, social))
}

/**
 * WHAT IS NOT ON THE PAGE IS NOT SENT (the OnePage production audit, P-F3).
 * A switched off block, and a group's block outside its schedule, were left
 * out by the page's own component in the browser, after the whole block
 * list had been sent with the page: a link switched off "until launch" was
 * in every visitor's page source. They are left out here, groups included,
 * on both sides: the editor's preview never drew them either, and the
 * preview and the live page stay one shape (tests/onepage-preview-live-r10).
 */
function withoutHidden(blocks: any[], now: number): any[] {
  const out: any[] = []
  for (const b of blocks) {
    if (!b || typeof b !== "object" || b.enabled === false || !isScheduledNow(b, now)) continue
    if (b.type === "group" && b.data && Array.isArray(b.data.children)) {
      const children = withoutHidden(b.data.children, now)
      out.push(children.length === b.data.children.length ? b : { ...b, data: { ...b.data, children } })
      continue
    }
    out.push(b)
  }
  return out
}

export type PublicOnePageData = {
  id: string
  title: string
  bio: string
  slug: string
  avatar_url: string | null
  avatar_video_url: string | null
  avatar_video_crop: any
  theme: any
  blocks: any[]
  social_links: Record<string, unknown>
  settings: Record<string, unknown>
  seller_id: string | null
}

export function publicOnePage(
  row: OnePageRowLike,
  {
    source,
    displayName = null,
    liveAvatarUrl = undefined,
    customDomain,
    sellerId,
    now = Date.now(),
  }: {
    source: "published" | "draft"
    /** The owner's profile name, for a page with no title of its own. */
    displayName?: string | null
    /** The owner's profile photo, for a page with no picture of its own. */
    liveAvatarUrl?: string | null
    /** The creator page's own domain, when one is connected (lib/custom-domains/store). */
    customDomain?: string | null
    /** Who is selling on this page; the row's own reference when not given. */
    sellerId?: string | null
    now?: number
  },
): PublicOnePageData {
  const published = source === "published"
  const profile = (published ? (row.published_profile as Record<string, any> | null) : null) || null
  const settings = row.settings || { show_branding: true, analytics_enabled: true, subscribe_enabled: true }
  /* A theme no longer offered (Editorial) is drawn as its successor, the creator's own changes kept (lib/onepage/retired-themes). */
  const theme = withoutRetiredTheme((published ? row.published_theme : null) || row.theme || FALLBACK_PUBLIC_THEME)
  const blocks = ((published ? row.published_blocks || row.draft_blocks : row.draft_blocks) || []) as any[]
  const social = (published ? row.published_social_links || row.social_links : row.social_links) || {}
  return {
    id: row.id,
    /*
      THE NAME AND THE FACE COME FROM ONE PLACE (lib/account/identity), so
      the page body and the tab title cannot disagree. Published: the copy
      taken at the last publish, then the row, then the live profile. Draft
      (the editor's preview): the row the creator is editing, then the live
      profile; the published copy is never read, so a new upload shows the
      moment it is made. A sign in provider's picture left in a copy is
      passed over rather than drawn; a photo uploaded to the page is always
      drawn.
    */
    title: creatorName({ published: profile?.title, own: row.title, live: displayName }),
    bio: profile?.bio || row.bio || "",
    slug: row.slug ?? "",
    avatar_url: creatorPhoto({ published: profile?.avatar_url, own: row.avatar_url, live: liveAvatarUrl }),
    avatar_video_url: profile?.avatar_video_url || row.avatar_video_url || null,
    avatar_video_crop: profile?.avatar_video_crop || (settings as any)?.avatar_video_crop || null,
    theme,
    blocks: drawnBlocks(withoutHidden(blocks, now), social as Record<string, unknown>, now),
    social_links: social,
    settings: customDomain === undefined ? { ...settings } : { ...settings, custom_domain: customDomain },
    seller_id: sellerId === undefined ? row.seller_id || row.creator_id || null : sellerId,
  }
}

/**
 * The editor's page, drawn as a visitor would see it once published: the
 * draft first, because that is what the creator is editing and what the next
 * save publishes, then the owner's live name and photo, which is what the
 * published page falls back on for a page with none of its own. Without that
 * last step the preview drew an empty circle where the live page drew the
 * profile photo.
 */
export function publicOnePageFromDraft(
  row: OnePageRowLike,
  options: { now?: number; displayName?: string | null; liveAvatarUrl?: string | null } = {},
): PublicOnePageData {
  return publicOnePage(row, { source: "draft", ...options })
}
