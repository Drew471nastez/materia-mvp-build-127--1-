/**
 * ===========================================================================
 *  ONE PICTURE OF THE CREATOR IN AN EMAIL
 * ===========================================================================
 * "The emails that get sent fetch 2 different profile avatars."
 *
 * They did. The layout every creator email is drawn in (./template.ts) had
 * two places for a picture and filled them from two different rows: the
 * header from the published website's logo (store_theme_settings.logo_url)
 * and the footer from the profile photo (profiles.avatar_url). A creator
 * with both got a square logo on top and a round face underneath, two
 * pictures of one person that did not match. The automation path had its
 * own reader (lib/automations/supabase-store readIdentity) that put the
 * profile photo into the header's logo slot when there was no website, so
 * there the same face was drawn twice, once square and once round.
 *
 * Now the choice is made once, here, and every email reads it: campaigns,
 * automations, their previews in the composer and the flow builder, a test
 * send, the unsubscribe page, the buyer's receipt and the refund email.
 *
 *   the photo   profiles.avatar_url, the creator's face everywhere else on
 *               Storelib (lib/account/identity), drawn round beside the name
 *   else logo   the published website's logo, drawn in the header, for a
 *               creator who has a logo and no photo
 *   else none   the first letter of the name, never a broken picture
 *
 * Pure and browser-safe: the composer's preview draws with it too, so what
 * the preview shows is what is sent.
 */
import { optimizedImageUrl } from "@/lib/images/optimized-url"
import { toOriginalImageUrl } from "@/lib/storage/image-url"
import { emailImageUrl } from "./brand"
import { APP_ORIGIN } from "@/lib/email-variables"

export interface SenderPicture {
  /** An absolute https address, not yet sized: pass it through emailImageSrc to draw it. */
  url: string
  /** "photo" is drawn round beside the name, "logo" as it was uploaded. */
  kind: "photo" | "logo"
}

/** The creator's photo as an email can carry it: profiles.avatar_url, https, never the placeholder. */
export function senderPhoto(avatarUrl: unknown): string | null {
  return emailImageUrl(avatarUrl)
}

/**
 * THE ONE PICTURE. Every email asks this, with the profile photo and the
 * website logo as they are when it is sent, and draws only what it answers.
 */
export function senderPicture(input: { photoUrl?: unknown; logoUrl?: unknown }): SenderPicture | null {
  const photo = senderPhoto(input.photoUrl)
  if (photo) return { url: photo, kind: "photo" }
  const logo = emailImageUrl(input.logoUrl)
  if (logo) return { url: logo, kind: "logo" }
  return null
}

/** The quality the resizer is asked for. It must be listed in next.config's images.qualities. */
const EMAIL_QUALITY = 75

/**
 * A PICTURE SIZED FOR AN INBOX. A profile photo or a product thumbnail is
 * stored at whatever size it was uploaded, and an email drawing it at 40px
 * would download all of it, in every inbox, on every open.
 *
 * Supabase's own resizer is billed per picture and this project does not use
 * it (lib/storage/image-url, and a test fails the build over it). The site's
 * Next image endpoint is the one the storefront already uses for the same
 * pictures (lib/images/optimized-url), so the email asks it for twice the
 * drawn width, as an absolute address an inbox can fetch. It answers a
 * request that does not ask for WebP or AVIF with the original format, so
 * Outlook on Windows gets a PNG or a JPEG it can show. A host the endpoint
 * does not fetch from is drawn from its stored address, untouched.
 */
export function emailImageSrc(url: unknown, drawnWidth: number): string | null {
  const safe = emailImageUrl(url)
  if (!safe) return null
  const original = toOriginalImageUrl(safe)
  const sized = optimizedImageUrl(original, drawnWidth, EMAIL_QUALITY)
  return sized.startsWith("/_next/image") ? `${APP_ORIGIN}${sized}` : sized
}

/** The first letter of a name or a title, for the tile drawn where no picture is. */
export function initialOf(name: unknown, fallback = "S"): string {
  const first = typeof name === "string" ? Array.from(name.trim())[0] : undefined
  return (first && /[\p{L}\p{N}]/u.test(first) ? first : fallback).toUpperCase()
}
