import "server-only"

/**
 * WHETHER THE SIGNED IN PERSON HAS A LIVE STORE.
 *
 * The owner: "In creator pages or creator profiles there should be no
 * activity." So /account asks this once: a creator's own profile has no
 * Activity pill and opens on their Communities instead (app/account/page.tsx,
 * lib/profile/owner-pills.ts). The same test the creator page and /@handle
 * use (lib/profile/member-url.ts hasActiveStorefront), over the creator row
 * the request already caches (loadCreatorForUser), so the layout and the
 * page share one read. A failed read is a plain profile, never an error page.
 */
import { cache } from "react"
import { loadCreatorForUser } from "@/lib/commerce/creator-page-data"
import { hasActiveStorefront } from "@/lib/profile/member-url"

export const accountIsCreator = cache(async (userId: string): Promise<boolean> => {
  try {
    return hasActiveStorefront(await loadCreatorForUser(userId))
  } catch {
    return false
  }
})
