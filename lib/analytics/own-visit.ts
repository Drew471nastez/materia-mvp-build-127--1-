import "server-only"
import { createClient } from "@/lib/supabase/server"

/**
 * THE CREATOR LOOKING AT THEIR OWN PAGE IS NOT A VISITOR.
 *
 * Every time a creator checked their store after an edit it was counted as a
 * visit, and on a new store that is most of the traffic. Shopify leaves the
 * owner's own visits out, and so does app/api/track-view, by asking this.
 *
 * It only answers the question; it never refuses anybody, which is why the
 * tracker stays a public route. The session is read only when the request
 * carries a sign-in, so a visitor who never signed in costs nothing extra.
 */
export async function isOwnVisit(cookieNames: string[], ownerUserId: string | null | undefined): Promise<boolean> {
  if (!ownerUserId) return false
  const signedIn = cookieNames.some((name) => name.startsWith("sb-") && name.includes("auth-token"))
  if (!signedIn) return false
  try {
    const supabase = await createClient()
    const { data } = await supabase.auth.getUser()
    return data.user?.id === ownerUserId
  } catch {
    return false
  }
}
