/**
 * ===========================================================================
 *  "ABOUT <NAME>" ON YOUR OWN PAGE
 * ===========================================================================
 * /account is the page everybody else sees, seen by its owner, so it ends
 * the way /@handle ends: the creator page's About block, with the day they
 * joined, where they are from, how many communities they are in and the
 * line they wrote about themselves (components/profile/person-about.tsx).
 * Before round 13 the owner's own page had no About at all, and the day
 * they joined was a line in their Activity, which is not activity.
 *
 * Every value is read here, with the service role, and only shown when it
 * is there: no location column yet (part 98 not run), communities switched
 * off, or an empty bio each simply leave their row out. A read that fails
 * leaves the row out too, rather than taking the page down.
 *
 * Inside /account's own column (components/account/account-column.tsx), so
 * the block's rules keep the page's left edge: `inset={false}`.
 *
 * No "use client": a server component, as app/account/page.tsx's own bodies
 * are.
 */
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { communitiesEnabled } from "@/lib/communities/flag"
import { locationLine, readProfileLocation } from "@/lib/profile/location"
import { profileCommunities } from "@/lib/profile/profile-communities"
import { PersonAbout } from "@/components/profile/person-about"
import { profileSocialLinks } from "@/lib/profile/social-links"

/** The account's own ink, not a storefront scheme's: the profile centre is a Storelib page. */
/* The account's ink, light in the dark look (round 29: it stayed #1a1a2e on the dark page). */
const ACCOUNT_INK = "var(--sl-ink-strong, #1a1a2e)"

/** Their own line about themselves. Nothing where the column has not been added yet. */
async function readBio(userId: string): Promise<string | null> {
  try {
    const supabase = await createClient()
    const { data } = await supabase.from("profiles").select("bio").eq("id", userId).maybeSingle()
    return ((data as { bio?: string | null } | null)?.bio || "").trim() || null
  } catch {
    return null
  }
}

async function readSocials(userId: string) {
  try {
    const db = createAdminClient()
    const { data, error } = await db
      .from("profiles")
      .select("instagram_url, tiktok_url, youtube_url, twitter_url, linkedin_url, bluesky_url")
      .eq("id", userId)
      .maybeSingle()
    if (error || !data) return []
    return profileSocialLinks(data as Record<string, unknown>)
  } catch {
    return []
  }
}

export async function AccountAbout({ userId, name, joinedAt }: { userId: string; name: string; joinedAt: string | null }) {
  const db = createAdminClient()
  const [place, bio, communitiesOn, socials] = await Promise.all([
    readProfileLocation(db, userId).catch(() => null),
    readBio(userId),
    communitiesEnabled().catch(() => false),
    readSocials(userId),
  ])
  /* The count the page shows is the count the page lists: the ones they run and the ones they are in. */
  const lists = communitiesOn
    ? await profileCommunities(db, userId, { includeMemberships: true }).catch(() => ({ owned: [], member: [] }))
    : null
  return (
    <PersonAbout
      name={name}
      joinedAt={joinedAt}
      bio={bio}
      location={locationLine(place)}
      communities={lists ? lists.owned.length + lists.member.length : null}
      socials={socials}
      chrome={{ text: ACCOUNT_INK }}
      inset={false}
    />
  )
}
