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
import { inboxImageUrl } from "./inbox-image"
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
 * drawn width, as an absolute address an inbox can fetch.
 *
 * UPLOADS GO THROUGH /api/email/img NOW (./inbox-image): one PNG or JPEG for
 * every client, a PNG whenever the picture has any transparency, JPEG quality
 * 86, 3x for small marks. What follows is the site's image endpoint, which
 * still sizes a picture on Storelib's own address.
 *
 * WHAT FORMAT EACH INBOX GETS. The endpoint picks by the Accept header. A
 * client that does not say it takes WebP or AVIF (Outlook on Windows asks
 * for "*\/*") gets a JPEG, or a PNG when the upload was a PNG, even when
 * the stored file is a WebP; Gmail and Apple Mail, which do say so, get the
 * smaller WebP or AVIF they can show. Measured on storelib.com by
 * scripts/check-email-weight.mjs. Two things it cannot do: a WebP whose
 * JPEG would come out larger than the stored file is sent as stored, and a
 * JPEG has no transparency, so a see-through WebP logo reaches Outlook on a
 * black ground. Quality stays at 75, the setting that keeps the JPEG
 * smaller than the upload, at twice the drawn size, where it is not told
 * apart from the original.
 *
 * An SVG is never drawn as the creator's picture: Gmail and Outlook do not
 * show SVG, and the resizer refuses it. The initial is drawn instead. A host
 * the endpoint does not fetch from is drawn from its stored address.
 */
export function emailImageSrc(url: unknown, drawnWidth: number): string | null {
  const safe = emailImageUrl(url)
  if (!safe || isSvg(safe)) return null
  return sized(safe, drawnWidth)
}

/**
 * A picture a creator put in the body of an email (a campaign's picture or
 * product card, a picture in the text), sized as above. Unlike the sender's
 * picture it is never dropped: an SVG, which cannot be resized, is drawn
 * from its stored address, as it was before.
 */
export function inboxImageSrc(url: unknown, drawnWidth: number): string | null {
  const safe = emailImageUrl(url)
  if (!safe) return null
  return isSvg(safe) ? safe : sized(safe, drawnWidth)
}

function isSvg(url: string): boolean {
  try {
    return /\.svgz?$/i.test(new URL(url).pathname)
  } catch {
    return false
  }
}

/** Storelib's own address as the path the resizer takes; anything else unchanged. */
function ownPath(url: string): string {
  try {
    const u = new URL(url)
    const own = new URL(APP_ORIGIN).hostname.replace(/^www\./, "")
    if (u.hostname.replace(/^www\./, "") === own && u.pathname !== "/_next/image") return `${u.pathname}${u.search}`
  } catch {
    /* not a URL: left as it is */
  }
  return url
}

function sized(safe: string, drawnWidth: number): string {
  /* A stored upload: made for inboxes by /api/email/img (./inbox-image), transparency kept, never a WebP. */
  const inbox = inboxImageUrl(APP_ORIGIN, toOriginalImageUrl(safe), drawnWidth)
  if (inbox) return inbox
  const original = ownPath(toOriginalImageUrl(safe))
  const resized = optimizedImageUrl(original, drawnWidth, EMAIL_QUALITY)
  if (resized.startsWith("/_next/image")) return `${APP_ORIGIN}${resized}`
  /* Not resized: the stored address, whole again if it was made a path above. */
  return resized.startsWith("/") ? `${APP_ORIGIN}${resized}` : resized
}

/** The first letter of a name or a title, for the tile drawn where no picture is. */
export function initialOf(name: unknown, fallback = "S"): string {
  const first = typeof name === "string" ? Array.from(name.trim())[0] : undefined
  return (first && /[\p{L}\p{N}]/u.test(first) ? first : fallback).toUpperCase()
}
