/**
 * ===========================================================================
 *  ONE NAME AND ONE FACE
 * ===========================================================================
 * "Why is my page still showing Zarra Bianco and my old picture?"
 *
 * The page body already read the name right. The tab did not, because the
 * tab title and the favicon were built from `onepages.published_profile`,
 * a COPY of the name and the picture taken at the moment the page was
 * published (app/api/onepage/publish), and from `onepages.settings.seo_title`,
 * a copy the SEO card wrote when its Meta title box was only showing the page
 * name back at you. Renaming yourself in Settings writes `profiles`, so the
 * copies kept the name the account was opened with, for good.
 *
 * `profiles.display_name` and `profiles.avatar_url` are the name and the face
 * (lib/account/avatar says the same for the photo). Everything else is a
 * copy, and a copy has exactly two jobs here:
 *
 *   IT FOLLOWS.     When the profile changes, a copy that still holds what
 *                   the profile held is rewritten (`followsProfile`). A copy
 *                   holding something else is a page title somebody chose,
 *                   and is left alone. THAT IS THE NAME ONLY. A copy of the
 *                   PHOTO is rewritten whatever it holds
 *                   (`mirrorsProfilePhoto`): there is one photo, and the
 *                   "somebody chose this" exception is what left one creator
 *                   with three faces at once, one per editor.
 *   IT FILLS IN.    A published page is drawn from its published copy, so
 *                   that copy still wins at render time; the live profile is
 *                   what answers when the copy holds nothing
 *                   (`creatorName`, `creatorPhoto`), rather than "Creator"
 *                   and no icon.
 *
 * Kept pure and apart from any database client, so the rule can be read and
 * tested on its own (tests/creator-identity.test.ts). The writing half is
 * lib/account/profile-follow.ts.
 */
import { profileAvatar } from "./avatar"

/**
 * THE PICTURE A SIGN IN PROVIDER SENT. It belongs in one place and for one
 * moment: copied into a new profile at sign up (app/auth/callback), never
 * again (lib/account/avatar). So a provider's picture found in any OTHER
 * row is a leftover by definition — it is the Google photo that kept coming
 * back in the top bar — and it follows the profile without asking whether
 * somebody chose it, because nobody did.
 *
 * ONLY THE ACCOUNT PICTURE, NOT EVERY PICTURE ON THE SAME HOST. This used to
 * match any address on googleusercontent.com, fbcdn.net or pbs.twimg.com,
 * and those hosts also serve pictures a person chooses on purpose: Google
 * Photos and Blogger images, Instagram and Facebook posts, tweets. A picture
 * like that set as a OnePage photo was passed over and the page drew
 * something else. The shapes below are the ones a sign in hands over:
 *
 *   Google    lh3.googleusercontent.com/a/..., /a-/..., and the older
 *             /-xxxx/AAAAAAAAAAI/... account photo
 *   Facebook  graph.facebook.com/<id>/picture, platform-lookaside.fbsbx.com
 *             /platform/profilepic
 *   X         pbs.twimg.com/profile_images/...
 *   GitHub    avatars.githubusercontent.com (only ever an account picture)
 *   Discord   cdn.discordapp.com/avatars/...
 *   LinkedIn  media.licdn.com/dms/image/.../profile-displayphoto...
 *
 * An address the person uploaded is always in Storelib's own storage, so it
 * can never look like any of these.
 */
const PROVIDER_PHOTO = [
  /^https?:\/\/(?:[a-z0-9-]+\.)*googleusercontent\.com\/(?:a|a-)\//i,
  /^https?:\/\/(?:[a-z0-9-]+\.)*googleusercontent\.com\/-[^/]+\/AAAAAAAAAAI\//i,
  /^https?:\/\/graph\.facebook\.com\/(?:v[\d.]+\/)?[^/]+\/picture(?:[/?]|$)/i,
  /^https?:\/\/platform-lookaside\.fbsbx\.com\/platform\/profilepic\//i,
  /^https?:\/\/pbs\.twimg\.com\/profile_images\//i,
  /^https?:\/\/avatars\.githubusercontent\.com\//i,
  /^https?:\/\/cdn\.discordapp\.com\/avatars\//i,
  /^https?:\/\/media(?:-exp\d)?\.licdn\.com\/dms\/image\/[^?]*profile-displayphoto/i,
]

export function providerPhoto(url: unknown): boolean {
  if (typeof url !== "string") return false
  const value = url.trim()
  return PROVIDER_PHOTO.some((shape) => shape.test(value))
}

/** Trimmed text, or null for anything that is not text worth storing. */
function text(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed === "" ? null : trimmed
}

/** A photo a copy may keep: a real address, not the placeholder, not a provider's. */
export function keptPhoto(url: unknown): string | null {
  const value = text(url)
  if (!value || providerPhoto(value)) return null
  return profileAvatar(value)
}

/**
 * THE NAME A PUBLIC SURFACE SHOWS. The page's own published name first,
 * because that is what the creator published; its draft name next, for a row
 * written before the published copy existed; and the live profile last,
 * which is the answer for a page that never had a name of its own. The tab
 * title used to stop before that last step and say "Creator".
 */
export function creatorName(input: {
  /** onepages.published_profile.title */
  published?: unknown
  /** onepages.title */
  own?: unknown
  /** profiles.display_name */
  live?: unknown
}): string {
  return text(input.published) || text(input.own) || text(input.live) || ""
}

/**
 * THE FACE A PUBLIC SURFACE SHOWS, and it is NOT the same order as the name.
 *
 * A name can honestly differ from surface to surface: a page is called one
 * thing and the person another. A face cannot. Three photos of one creator
 * were showing at once — the creator page's, the one in Settings and the
 * OnePage's — because each copy was read before the profile, and each copy
 * had been written by a different editor.
 *
 * So the live profile answers first here, always. A copy is read only for a
 * page drawn without the profile to hand, so that page shows a face rather
 * than initials while the copies are being brought into line
 * (lib/account/profile-follow).
 */
export function creatorPhoto(input: {
  /** onepages.published_profile.avatar_url */
  published?: unknown
  /** onepages.avatar_url */
  own?: unknown
  /** profiles.avatar_url */
  live?: unknown
}): string | null {
  if (input.live !== undefined) return profileAvatar(text(input.live))
  return keptPhoto(input.published) || keptPhoto(input.own) || null
}

/**
 * WHAT A COPY OF THE NAME BECOMES WHEN THE PROFILE IS RENAMED.
 *
 *   `undefined`  leave it: it is empty (it already falls back to the
 *                profile) or it holds something somebody typed.
 *   a string     it still held the old name: it follows.
 *   `null`       the profile's name was cleared, and this copy was it.
 */
export function followsProfile(stored: unknown, before: unknown, after: unknown): string | null | undefined {
  const now = text(stored)
  const was = text(before)
  const next = text(after)
  if (now === null) return undefined
  if (now === next) return undefined
  if (was !== null && now.toLowerCase() === was.toLowerCase()) return next
  return undefined
}

/**
 * WHAT A COPY OF THE PHOTO BECOMES, AND IT IS ALWAYS THE PROFILE'S.
 *
 * A copy of the name is left alone when it holds something somebody typed.
 * A copy of the photo used to be treated the same way, and that is the whole
 * of this bug: the OnePage editor wrote a photo of its own, the creator page
 * header held one from onboarding, Settings held a third, and each of them
 * counted as "chosen" from the moment it was written, so none of them ever
 * followed again. One person, three faces, for good.
 *
 * There is one photo. Every copy of it takes whatever the profile says, a
 * removal (`null`) included. `undefined` only ever means "already that, do
 * not write" — never "leave this one as it is".
 */
export function mirrorsProfilePhoto(stored: unknown, after: unknown): string | null | undefined {
  const now = text(stored)
  const next = text(after)
  if (now === next) return undefined
  return next
}

/**
 * THE META TITLE THAT WAS NEVER TYPED. The OnePage SEO card fills its Meta
 * title box with the page name and saved what it was showing, so a page
 * carried a second copy of its name that outranked everything. A stored SEO
 * title that is only the page's name again says nothing the page does not
 * already say, so it is not treated as one.
 */
export function typedSeoTitle(seoTitle: unknown, pageName: unknown): string | null {
  const typed = text(seoTitle)
  if (!typed) return null
  const name = text(pageName)
  return name && typed.toLowerCase() === name.toLowerCase() ? null : typed
}
