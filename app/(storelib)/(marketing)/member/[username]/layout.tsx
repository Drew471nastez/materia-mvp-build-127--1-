import type React from "react"
import { headers } from "next/headers"
import { permanentRedirect } from "next/navigation"
import { loadCreatorForUser, loadProfileByUsername } from "@/lib/commerce/creator-page-data"
import { hasActiveStorefront } from "@/lib/profile/member-url"
import { PROFILE_PATH_HEADER, creatorPageTarget } from "@/lib/profile/profile-redirect"
import { isReservedRootSegment } from "@/lib/routes/reserved-segments"
import { isReservedWord } from "@/lib/reserved-words"

/**
 * A CREATOR HAS ONE PAGE (lib/profile/profile-redirect.ts). Their /@handle,
 * and /member/<handle> which it is rewritten to, answers a permanent
 * redirect to storelib.com/<handle> with the query kept. Here, in the
 * layout, because a layout is outside the route's loading skeleton: the 308
 * leaves before anything is streamed. Everybody else falls through to their
 * profile. The same loaders and the same rule as the creator page's own
 * door (lib/profile/storefront-gate.ts), so the two can never send a person
 * back and forth. A lookup that fails renders the profile, never an error.
 */
export default async function MemberProfileLayout({ children, params }: { children: React.ReactNode; params: Promise<{ username: string }> }) {
  const { username } = await params
  let handle = ""
  try {
    handle = decodeURIComponent(username || "").trim().replace(/^@/, "")
  } catch {
    handle = ""
  }
  if (handle && !isReservedRootSegment(handle) && !isReservedWord(handle)) {
    let target: string | null = null
    try {
      const profile = await loadProfileByUsername(handle)
      const creator = profile?.id ? await loadCreatorForUser(profile.id) : null
      if (profile?.username && hasActiveStorefront(creator)) {
        target = creatorPageTarget(profile.username, (await headers()).get(PROFILE_PATH_HEADER))
      }
    } catch {
      target = null
    }
    if (target) permanentRedirect(target)
  }
  return children
}
