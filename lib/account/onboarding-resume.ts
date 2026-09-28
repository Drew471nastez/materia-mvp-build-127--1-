/**
 * ===========================================================================
 *  A SETUP BEGUN AND NOT FINISHED OPENS WHERE IT WAS LEFT
 * ===========================================================================
 * Seller onboarding writes a creators row in one place before it is done:
 * on the plan step, just before a paid plan's checkout (components/app/
 * creator-onboarding-modal.tsx handleSelectPaid), with the store's slug,
 * its bio and its category. Somebody who went to that checkout and came
 * back without paying, then pressed Sell on Storelib again, was put on step
 * one with every field empty, as if they had never been there.
 *
 * This reads that row back: the store name the slug came from, the bio and
 * the category, and the plan step as where to open, because the row only
 * exists once the first three steps were done. A profile marked as a
 * creator by the old "I'm a creator" choice, with no row behind it, has
 * nothing to read back but a name, and opens on step one with it.
 *
 * Pure and browser safe: /sell reads the rows on the server and hands the
 * answer to the onboarding.
 */

export interface OnboardingResume {
  displayName: string
  bio: string
  category: string | null
  /** The step to open on: 4, the plan, when the first three were done; 1 otherwise. */
  step: 1 | 4
}

export function slugOf(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

/** "maya-prints" to "Maya Prints": a name whose slug is the slug it came from. */
function nameFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

export function onboardingResume(input: {
  creator: { slug?: string | null; display_name?: string | null; bio?: string | null; niche_tags?: unknown; onboarding_completed?: boolean | null } | null | undefined
  profile?: { display_name?: string | null; is_creator?: boolean | null } | null
}): OnboardingResume | null {
  const { creator, profile } = input
  if (creator?.onboarding_completed === true) return null
  if (creator) {
    const slug = (creator.slug || "").trim().toLowerCase()
    /* The name as it was typed when its slug matches; else the slug in words, which gives the same slug back. */
    const typed = [creator.display_name, profile?.display_name].map((n) => (n || "").trim()).find((n) => n && slugOf(n) === slug)
    const displayName = typed || (slug && slug !== "creator" ? nameFromSlug(slug) : "")
    const tags = Array.isArray(creator.niche_tags) ? creator.niche_tags.filter((t): t is string => typeof t === "string" && t.trim() !== "") : []
    return { displayName, bio: (creator.bio || "").trim(), category: tags[0] ?? null, step: displayName ? 4 : 1 }
  }
  if (profile?.is_creator === true) {
    const name = (profile.display_name || "").trim()
    return name ? { displayName: name, bio: "", category: null, step: 1 } : null
  }
  return null
}
