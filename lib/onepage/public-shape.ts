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
 */
import { isScheduledNow } from "@/lib/onepage/extra-blocks"
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
    liveAvatarUrl = null,
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
  const theme = (published ? row.published_theme : null) || row.theme || FALLBACK_PUBLIC_THEME
  const blocks = ((published ? row.published_blocks || row.draft_blocks : row.draft_blocks) || []) as any[]
  const social = (published ? row.published_social_links || row.social_links : row.social_links) || {}
  return {
    id: row.id,
    /*
      THE NAME AND THE FACE COME FROM ONE PLACE (lib/account/identity), so
      the page body and the tab title cannot disagree: the page's published
      copy, then its draft, then the live profile. The tab used to stop
      before that last step and say "Creator", and a sign in provider's
      picture left in a copy is passed over rather than drawn, so removing
      the photo in Settings removes it here too.
    */
    title: creatorName({ published: profile?.title, own: row.title, live: displayName }),
    bio: profile?.bio || row.bio || "",
    slug: row.slug ?? "",
    avatar_url: creatorPhoto({ published: profile?.avatar_url, own: row.avatar_url, live: liveAvatarUrl }),
    avatar_video_url: profile?.avatar_video_url || row.avatar_video_url || null,
    avatar_video_crop: profile?.avatar_video_crop || (settings as any)?.avatar_video_crop || null,
    theme,
    blocks: blocks.filter((b) => isScheduledNow(b, now)),
    social_links: social,
    settings: customDomain === undefined ? { ...settings } : { ...settings, custom_domain: customDomain },
    seller_id: sellerId === undefined ? row.seller_id || row.creator_id || null : sellerId,
  }
}

/** The editor's page, drawn as a visitor would see it once published. */
export function publicOnePageFromDraft(row: OnePageRowLike, options: { now?: number } = {}): PublicOnePageData {
  return publicOnePage(row, { source: "draft", ...options })
}
