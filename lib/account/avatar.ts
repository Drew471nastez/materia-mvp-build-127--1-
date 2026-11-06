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
 * the default face. The Google picture is copied into it while it has none
 * (lib/profile/provider-photo.ts, on every sign in), and never after the
 * person has chosen a photo or removed one (`AVATAR_CHOSEN`, on the account).
 *
 * The shell hears about a change at once through `announceAvatar`
 * (lib/account/avatar-store), so the header and the account sheet change with
 * the Settings circle rather than on the next page load.
 *
 * ---------------------------------------------------------------------------
 *  "IT STILL SHOWS MY GOOGLE PICTURE IN THE BLACK TOP BAR"
 * ---------------------------------------------------------------------------
 * After the rule above shipped, three ways were left for the picture Google
 * sent to come back over a photo the person had removed:
 *
 *   THE CREATOR PAGE KEPT ITS OWN COPY. Onboarding writes the Google picture
 *   into the creator page header (headerSettings.avatarUrl) as well as the
 *   profile, and the creator page's save and publish wrote that header photo
 *   back into the profile on every save, changed or not. So a removal in
 *   Settings lasted until the creator page was next saved, then the header
 *   showed Google again. Now a photo changed in Settings is written into the
 *   creator page header too (`followProfilePhoto`), and a creator page save
 *   passes its photo to the profile only when it was changed there
 *   (`pagePhotoForProfile`).
 *
 *   THE CHOICE WAS MARKED AFTER THE PHOTO WAS SAVED. The route wrote the
 *   profile, then the account's metadata. Anything that copies an account's
 *   picture into its profile when the account changes ran after the removal
 *   and undid it, once: the second removal, with the mark already there,
 *   stuck. The mark goes first now, and the profile is read back to be sure.
 *
 *   ONBOARDING STARTED FROM GOOGLE, not from the profile, so a person who
 *   removed their photo as a buyer and then became a seller got it back
 *   (`onboardingPhoto`).
 *
 * The provider's picture is read from the account the way Supabase keeps
 * it, on every sign in while the profile has no photo of its own.
 */
/** On the account's metadata once the person has uploaded or removed a photo themselves. */
export const AVATAR_CHOSEN = "storelib_avatar_chosen"

/** A stored address worth drawing: not empty, not the old placeholder. */
export function profileAvatar(url: string | null | undefined): string | null {
  const clean = url?.trim()
  return clean && !clean.includes("placeholder.svg") ? clean : null
}

/**
 * The provider's picture goes into a profile that has no photo and was never
 * given or cleared one by its owner, on EVERY sign in until it has one: the
 * owner asked for it ("on every sign in until they have one; never overwrite
 * a photo they set"), so a first sign in that missed it is not the last
 * chance. It was sign up only (`accountAgeMs` under fifteen minutes); the age
 * is still taken and no longer decides. The sign in routes ask
 * lib/profile/provider-photo.ts, which is this rule with the write.
 */
export function copyProviderAvatar(input: {
  profileExists: boolean
  profileAvatar: string | null | undefined
  providerAvatar: string | null | undefined
  chosen: boolean
  accountAgeMs?: number
}): boolean {
  return !!input.providerAvatar && !input.chosen && !profileAvatar(input.profileAvatar)
}

/**
 * The picture the seller onboarding starts with: the profile's, and the one
 * the provider sent only for a person who never chose or removed a photo.
 */
export function onboardingPhoto(input: {
  profileAvatar: string | null | undefined
  providerAvatar: string | null | undefined
  chosen: boolean
}): string | null {
  const own = profileAvatar(input.profileAvatar)
  if (own) return own
  if (input.chosen) return null
  return profileAvatar(input.providerAvatar)
}

type HeaderSettingsLike = { avatarUrl?: unknown } & Record<string, unknown>
type SectionLike = { type?: unknown; settings?: HeaderSettingsLike | null } & Record<string, unknown>
type PageConfigLike = { headerSettings?: HeaderSettingsLike | null; sections?: unknown } & Record<string, unknown>

/**
 * THE CREATOR PAGE FOLLOWS A PHOTO CHANGED IN SETTINGS. A creator page
 * config (draft or published) with the photo written into its header gets
 * the new one, or "" (the initials) for a removal; the header section's
 * own copy likewise. A header that never had a photo of its own already
 * shows the profile's and is left alone. Null when nothing changes.
 */
export function followProfilePhoto<T extends PageConfigLike>(config: T | null | undefined, url: string | null): T | null {
  if (!config || typeof config !== "object") return null
  const next = url ?? ""
  let changed = false
  const out: PageConfigLike = { ...config }
  const header = config.headerSettings
  if (header && typeof header === "object" && header.avatarUrl !== undefined && header.avatarUrl !== next) {
    out.headerSettings = { ...header, avatarUrl: next }
    changed = true
  }
  if (Array.isArray(config.sections)) {
    const sections = (config.sections as SectionLike[]).map((s) => {
      if (!s || typeof s !== "object" || s.type !== "header" || !s.settings || typeof s.settings !== "object") return s
      if (s.settings.avatarUrl === undefined || s.settings.avatarUrl === next) return s
      changed = true
      return { ...s, settings: { ...s.settings, avatarUrl: next } }
    })
    if (changed) out.sections = sections
  }
  return changed ? (out as T) : null
}

/**
 * THE PHOTO A CREATOR PAGE SAVE HANDS TO THE PROFILE: only one the person
 * changed on the creator page. `incoming` is the header photo being saved,
 * `stored` the one saved before it (the draft for a save, the published
 * page for a publish). Undefined means leave the profile alone; null means
 * the photo was removed there.
 */
export function pagePhotoForProfile(incoming: unknown, stored: unknown): string | null | undefined {
  if (typeof incoming !== "string") return undefined
  const before = typeof stored === "string" ? stored : undefined
  if (incoming === before) return undefined
  if (incoming === "") return null
  return profileAvatar(incoming) ?? undefined
}
