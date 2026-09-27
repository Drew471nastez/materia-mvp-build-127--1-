/**
 * A creator's brand, read at send time with the service role.
 *
 *   name     the published website's own store name, else the display name,
 *            else the username
 *   logo     the published website's logo, when it is an https picture
 *   colour   the website's button or primary colour when one was chosen,
 *            else the store's brand colour, else the default ink
 *   address  the Address card in Settings (profiles.address_line1 ...)
 *
 * Every read is allowed to fail: an email is never held up by a missing
 * website or a column that is not there, it just falls back to the plain
 * look (lib/email-campaigns/brand.ts DEFAULT_BRAND).
 */
import "server-only"

import { APP_URL } from "@/lib/email-automation"
import { addressLine, brandName, DEFAULT_BRAND, hexColor, httpsUrl, type Brand } from "./brand"
import { senderPhoto } from "./sender"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export interface BrandExtras {
  /**
   * The creator's own photo, for the footer beside their name: this
   * business's profile photo as it is now (profiles.avatar_url, the one photo
   * the app shows everywhere, lib/account/avatar). A second business is its
   * own profile, so its own photo. With it, the logo above is not drawn: an
   * email carries one picture of the creator (./sender senderPicture).
   */
  avatarUrl: string | null
  /** The name to sign with: the profile's display name, else the username. */
  creatorName: string
}

async function quietly<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn()
  } catch {
    return null
  }
}

export async function loadBrand(db: Db, creatorId: string): Promise<Brand & BrandExtras> {
  const creator = await quietly(async () => {
    const { data } = await db.from("creators").select("id, user_id, slug, headline").eq("id", creatorId).maybeSingle()
    return data as { user_id?: string; slug?: string | null; headline?: string | null } | null
  })
  if (!creator) return { ...DEFAULT_BRAND, avatarUrl: null, creatorName: DEFAULT_BRAND.name }

  const [profile, colour, site] = await Promise.all([
    quietly(async () => {
      const { data } = await db
        .from("profiles")
        .select("display_name, username, avatar_url, address_line1, address_line2, city, state, postal_code, country")
        .eq("id", creator.user_id)
        .maybeSingle()
      if (data) return data as Record<string, string | null>
      /* Before the address columns existed: the name and photo alone. */
      const { data: basic } = await db.from("profiles").select("display_name, username, avatar_url").eq("id", creator.user_id).maybeSingle()
      return (basic ?? null) as Record<string, string | null> | null
    }),
    quietly(async () => {
      const { data, error } = await db.from("creators").select("brand_color").eq("id", creatorId).maybeSingle()
      return error ? null : ((data?.brand_color as string | null) ?? null)
    }),
    quietly(async () => {
      const { data } = await db
        .from("store_theme_installs")
        .select("id, store_theme_settings ( settings )")
        .eq("creator_id", creatorId)
        .eq("status", "published")
        .order("sort_order", { ascending: true })
        .limit(1)
        .maybeSingle()
      const row = data as { store_theme_settings?: unknown } | null
      const s = Array.isArray(row?.store_theme_settings) ? row?.store_theme_settings[0] : row?.store_theme_settings
      const settings = (s as { settings?: Record<string, unknown> } | null)?.settings
      return settings && typeof settings === "object" ? settings : null
    }),
  ])

  const handle = profile?.username || creator.slug || null
  return {
    name: brandName(site?.brand_name, profile?.display_name, profile?.username, creator.headline, creator.slug),
    logoUrl: httpsUrl(site?.logo_url),
    storeUrl: handle ? `${APP_URL}/${encodeURIComponent(handle)}` : null,
    accent: hexColor(site?.button_color) ?? hexColor(site?.primary_color) ?? hexColor(colour) ?? DEFAULT_BRAND.accent,
    address: profile
      ? addressLine({
          line1: profile.address_line1,
          line2: profile.address_line2,
          city: profile.city,
          state: profile.state,
          postal: profile.postal_code,
          country: profile.country,
        })
      : null,
    avatarUrl: senderPhoto(profile?.avatar_url),
    creatorName: brandName(profile?.display_name, profile?.username, creator.headline, creator.slug),
  }
}
