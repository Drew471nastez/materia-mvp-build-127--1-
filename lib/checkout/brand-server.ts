import "server-only"

/**
 * ===========================================================================
 *  THE SHOP AT THE TOP OF ITS CHECKOUT
 * ===========================================================================
 * A buyer who pressed Check out on a creator's website should see that shop
 * across the top of the page they pay on: its logo, its name, Back to it.
 * The basket checkout and the physical checkout read it here, from the
 * database, never from the link (a logo in a query string would let anyone
 * dress storelib.com up as any shop).
 *
 *   logo   Settings › Store details' logo, else the published website's
 *          own logo (a website builder theme's Branding › Logo, or an
 *          imported Shopify theme's `logo` setting), else the person's
 *          photo: lib/store/logo-server.ts, the same logo receipts, order
 *          emails and the Logo card in Store details show
 *   name   Store details' store name, else the website's brand name, else
 *          their display name, else their username (the same file)
 *
 * `kind` says which: a logo is drawn as it is (a wordmark is wide), a photo
 * as a round avatar beside the name. Every read fails soft to less: a
 * checkout never breaks over its header.
 */
import { cache } from "react"
import { compatOf, compatValues } from "@/lib/storelib-theme/compat/install"
import { chooseStoreLogo, chooseStoreName, compatPicture, pictureUrl as absolute, themeSettingsOf, websiteLogo as siteLogo } from "@/lib/store/logo-server"
import { faviconOf } from "@/lib/website-builder/favicon-sync"
import { readBrandShows, type BrandShows } from "@/lib/store/checkout-config"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export interface CheckoutBrand {
  name: string
  imageUrl: string | null
  /** A logo is drawn as it is; a photo is round, beside the name. */
  kind: "logo" | "photo" | null
  /** What the bar shows, Settings › Checkout › Top of checkout (store_settings.checkout.brandShows): the logo and the name, either alone. Absent: both. */
  shows?: BrandShows
  /** The browser tab's icon: the website's favicon, else its logo, else the person's photo (as the live site does, lib/website-builder/site-icon). */
  iconUrl?: string | null
  /** The picture a shared checkout link shows: the website's share image, else its logo (not an SVG, which share cards cannot draw), else the photo. */
  shareImageUrl?: string | null
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "")

async function soft<T>(read: () => PromiseLike<{ data: unknown; error?: unknown }>): Promise<T | null> {
  try {
    const { data, error } = await read()
    return error ? null : ((data as T) ?? null)
  } catch {
    return null
  }
}

export async function checkoutBrand(db: Db, creatorId: string): Promise<CheckoutBrand> {
  const [settings, creator, install, checkoutRow] = await Promise.all([
    soft<{ store_name?: string | null; logo_url?: string | null }>(() => db.from("store_settings").select("store_name, logo_url").eq("creator_id", creatorId).maybeSingle()).then(
      async (r) => r ?? (await soft<{ store_name?: string | null }>(() => db.from("store_settings").select("store_name").eq("creator_id", creatorId).maybeSingle())),
    ),
    soft<{ display_name?: string | null; username?: string | null; avatar_url?: string | null; user_id?: string | null }>(() =>
      db.from("creators").select("display_name, username, avatar_url, user_id").eq("id", creatorId).maybeSingle(),
    ),
    soft<{ id: string; store_theme_settings?: unknown }>(() =>
      db.from("store_theme_installs").select("id, store_theme_settings ( settings )").eq("creator_id", creatorId).eq("status", "published").limit(1).maybeSingle(),
    ),
    /* Apart from the name and logo: a database without part 109's column still has its logo. */
    soft<{ checkout?: { brandShows?: unknown } | null }>(() => db.from("store_settings").select("checkout").eq("creator_id", creatorId).maybeSingle()),
  ])
  const profile = creator?.user_id
    ? await soft<{ display_name?: string | null; username?: string | null; avatar_url?: string | null }>(() => db.from("profiles").select("display_name, username, avatar_url").eq("id", creator.user_id).maybeSingle())
    : null

  const theme = themeSettingsOf(install)
  let websiteIcon: string | null = null
  let websiteShare: string | null = null
  /* The website's one favicon (Website settings, Branding and an imported theme's own are one value: lib/website-builder/favicon-sync.ts). */
  const ownIcon = faviconOf(theme as Record<string, unknown>)
  const [websiteLogo] = await Promise.all([
    siteLogo(db, install).catch(() => null),
    (async () => {
      if (compatOf(theme)) {
        /* An imported theme's own picture by its theme address only when the site has no favicon a browser can fetch. */
        const favicon = ownIcon ? "" : str(compatValues(theme).favicon)
        websiteIcon = ownIcon ? absolute(ownIcon) : favicon && install?.id ? await compatPicture(db, install.id, favicon) : null
      } else {
        websiteIcon = absolute(ownIcon)
        websiteShare = absolute(str(theme.seo_og_image))
      }
    })(),
  ])

  const name = chooseStoreName({ store: settings?.store_name, theme, profile, creator }, "Checkout")
  const logo = chooseStoreLogo({ store: (settings as { logo_url?: string | null } | null)?.logo_url, website: websiteLogo }).url
  const photo = absolute(str(profile?.avatar_url) || str(creator?.avatar_url))
  const drawable = (v: string | null) => (v && !/\.svg(?:\?|$)/i.test(v) ? v : null)
  const iconUrl = websiteIcon ?? logo ?? photo
  const shareImageUrl = websiteShare ?? drawable(logo) ?? photo
  const shows = readBrandShows(checkoutRow?.checkout?.brandShows)
  if (logo) return { name, imageUrl: logo, kind: "logo", shows, iconUrl, shareImageUrl }
  return { name, imageUrl: photo, kind: photo ? "photo" : null, shows, iconUrl, shareImageUrl }
}

/**
 * The same, once per request for a website's checkout: its page and its
 * metadata (the tab's title and icon, the share card) both ask, and the
 * second is answered from the first (app/checkout/site/layout.tsx).
 */
export const checkoutBrandOf = cache(async (creatorId: string): Promise<CheckoutBrand> => {
  const { createAdminClient } = await import("@/lib/supabase/admin")
  return checkoutBrand(createAdminClient(), creatorId)
})
