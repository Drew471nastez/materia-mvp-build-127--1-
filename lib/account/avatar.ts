/**
 * ===========================================================================
 *  ONE PROFILE PHOTO
 * ===========================================================================
 * "If I delete the profile photo, Settings shows the initials, but up in the
 * black top bar it still shows my Google image."
 *
 * The header used to walk a chain: the profile's photo, else the creator
 * page header's, else the OnePage's, else the picture Google sent at sign in.
 * Removing the profile's photo only uncovered the next link, so the photo
 * the person had just removed stayed in the corner of every screen.
 *
 * Now there is one answer everywhere in the app: `profiles.avatar_url`, or
 * the initials. The Google picture is copied into it once, when the account
 * is made (app/auth/callback), and never again after the person has chosen
 * a photo or removed one (`AVATAR_CHOSEN`, kept on the account).
 *
 * The shell hears about a change at once through `announceAvatar`
 * (lib/account/avatar-store), so the header and the account sheet change with
 * the Settings circle rather than on the next page load.
 */
/** On the account's metadata once the person has uploaded or removed a photo themselves. */
export const AVATAR_CHOSEN = "storelib_avatar_chosen"

/** A stored address worth drawing: not empty, not the old placeholder. */
export function profileAvatar(url: string | null | undefined): string | null {
  return url && !url.includes("placeholder.svg") ? url : null
}

/**
 * The provider's picture goes into a profile at sign up only: a profile that
 * has no photo and was never given one. `accountAgeMs` is how long ago the
 * auth user was made; a sign in to an older account is not a sign up.
 */
export function copyProviderAvatar(input: {
  profileExists: boolean
  profileAvatar: string | null | undefined
  providerAvatar: string | null | undefined
  chosen: boolean
  accountAgeMs: number
}): boolean {
  if (!input.providerAvatar || input.chosen || profileAvatar(input.profileAvatar)) return false
  return !input.profileExists || input.accountAgeMs < 15 * 60 * 1000
}
