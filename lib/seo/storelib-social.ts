/** The networks the footer has an icon for (components/marketing/footer.tsx SOCIAL_ICONS). */
export type StorelibSocialNetwork = "facebook" | "instagram" | "x" | "tiktok" | "youtube"

/**
 * STORELIB'S OWN PROFILES ELSEWHERE, ONE LIST. The storelib.com footer draws
 * an icon for each (components/marketing/footer.tsx) and the Organization's
 * `sameAs` names each, so the two can never disagree; with none listed the
 * footer draws no icons and the Organization has no sameAs.
 *
 * Checked October 2026, and none is confirmed yet: storelib.com links no
 * profile, the App Store listing names none, and the accounts called
 * "storelib" that exist are not Storelib's (x.com/storelib is "LIB STORE";
 * youtube.com/@storelib and linkedin.com/company/storelib do not exist;
 * instagram, tiktok and facebook show nothing that names storelib.com).
 *
 * TO ADD A PROFILE: only once it is Storelib's own, which means its bio or
 * its links name storelib.com (or storelib.com already links to it). Add
 * `{ network: "instagram", url: "https://www.instagram.com/<handle>/" }`
 * below, with the full https address of the profile itself (not a post),
 * and the footer icon and the sameAs follow on the next deploy. A network
 * not in StorelibSocialNetwork needs its icon in the footer first. An
 * address that is somebody else's tells a search engine Storelib is them.
 */
export const STORELIB_SOCIAL: readonly { network: StorelibSocialNetwork; url: string }[] = []
