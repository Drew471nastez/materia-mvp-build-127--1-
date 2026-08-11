import "server-only"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * ===========================================================================
 *  READING A LISTING YOU OWN, ON THE SERVER
 * ===========================================================================
 *
 * This exists so the edit screen can arrive ALREADY FILLED IN.
 *
 * It used to fetch itself: the sheet mounted empty, slid up, and then the row
 * landed a few hundred milliseconds later and every field, every chip and eight
 * photographs appeared at once. Two arrivals for one action — the screen, and
 * then its contents — and the second one lands after the slide has finished, so
 * it cannot be part of the transition and reads as the page changing its mind.
 *
 * A route that knows which listing it is can read the row while it renders, and
 * then there is nothing to pop in: the form's very first painted frame has the
 * title, the price and the photographs in it.
 *
 * ---------------------------------------------------------------------------
 * OWNERSHIP IS PART OF THE QUERY
 * ---------------------------------------------------------------------------
 * Exactly as in app/api/listings/[id]/route.ts, and deliberately the same
 * shape: the id in the URL is a uuid anybody can read off a listing page, so
 * the row is fetched by id AND by the caller's own creator id in one statement
 * — not fetched and then compared, which is the version that leaks a row's
 * existence through timing and through which error comes back. Somebody else's
 * listing is indistinguishable from one that does not exist.
 *
 * `server-only` at the top so this can never be pulled into a client bundle by
 * an absent-minded import: it holds the service-role client.
 */

/** Everything the sell form needs to render itself exactly as it was left. */
export const OWNED_LISTING_SELECT =
  "id, title, slug, description, price_cents, compare_at_cents, thumbnail_url, gallery_urls, " +
  "image_variants, category, subcategory, brand, condition, colour, size, era, source_tags, " +
  "style_tags, status, created_at"

export type OwnedListing = {
  id: string
  title: string | null
  slug: string | null
  description: string | null
  price_cents: number | null
  compare_at_cents: number | null
  thumbnail_url: string | null
  gallery_urls: string[] | null
  image_variants: unknown
  category: string | null
  subcategory: string | null
  brand: string | null
  condition: string | null
  colour: string | null
  size: string | null
  era: string | null
  source_tags: string[] | null
  style_tags: string[] | null
  status: string | null
  created_at: string | null
}

async function callerCreatorId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  const userId = auth?.user?.id
  if (!userId) return null
  const admin = createAdminClient()
  const { data } = await admin.from("creators").select("id").eq("user_id", userId).maybeSingle()
  return data?.id ?? null
}

/**
 * The row, or null for "not yours / not there / not signed in" — one answer for
 * all three, on purpose.
 *
 * Null is not an error here. The edit screen renders an empty form for it, which
 * is the same thing it does for a listing that was deleted on another device,
 * and the worst case is writing a listing from scratch on a screen that is for
 * writing listings. Throwing would replace a recoverable state with an error
 * page.
 */
export async function loadOwnedListing(id: string): Promise<OwnedListing | null> {
  if (!id) return null
  try {
    const creatorId = await callerCreatorId()
    if (!creatorId) return null
    const admin = createAdminClient()
    const { data, error } = await admin
      .from("products")
      .select(OWNED_LISTING_SELECT)
      .eq("id", id)
      .eq("creator_id", creatorId)
      .maybeSingle()
    if (error || !data) return null
    return data as unknown as OwnedListing
  } catch {
    // A form that fills itself in from nothing still works. An edit screen that
    // 500s because the database hiccuped does not.
    return null
  }
}
