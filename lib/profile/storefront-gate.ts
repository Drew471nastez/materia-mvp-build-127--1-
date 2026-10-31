import { permanentRedirect } from "next/navigation"
import { loadProfileByUsernameStrict, loadCreatorForUserStrict } from "@/lib/commerce/creator-page-data"
import { hasActiveStorefront, memberProfilePublicPath } from "@/lib/profile/member-url"

/**
 * `storelib.com/<handle>` is a storefront only after onboarding finished; otherwise /@handle.
 *
 * Only on reads that ANSWERED. Both reads are strict: a timeout or a failed
 * read throws (SiteReadError) and the page shows its error screen with Try
 * again. It used to read a failed creator read as "no storefront" and send
 * the visitor, and every search engine, a PERMANENT redirect to the member
 * profile.
 */
export async function ensureStorefrontOrRedirectToMember(handle: string): Promise<void> {
  const profile = await loadProfileByUsernameStrict(handle)
  if (!profile?.id) return
  const creator = await loadCreatorForUserStrict(profile.id)
  if (!hasActiveStorefront(creator)) {
    permanentRedirect(memberProfilePublicPath(handle))
  }
}
