import { permanentRedirect } from "next/navigation"
import { loadProfileByUsername, loadCreatorForUser } from "@/lib/commerce/creator-page-data"
import { hasActiveStorefront, memberProfilePublicPath } from "@/lib/profile/member-url"

/** `storelib.com/<handle>` is a storefront only after onboarding finished; otherwise /@handle. */
export async function ensureStorefrontOrRedirectToMember(handle: string): Promise<void> {
  const profile = await loadProfileByUsername(handle)
  if (!profile?.id) return
  const creator = await loadCreatorForUser(profile.id)
  if (!hasActiveStorefront(creator)) {
    permanentRedirect(memberProfilePublicPath(handle))
  }
}
