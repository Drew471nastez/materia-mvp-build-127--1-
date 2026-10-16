import "server-only"

/**
 * ===========================================================================
 *  STORELIB REVIEWS: READING AND SAVING THE APP'S SETTINGS
 * ===========================================================================
 * store_settings.reviews (run-now part 134), read through readReviewsApp so
 * every reader gets whole, in-range settings. A published page reads them
 * through a short cache keyed by the creator, cleared by every save, so a
 * visitor's page never waits on it and a change shows on the next view.
 */
import { unstable_cache, revalidateTag } from "next/cache"
import { isMissingTable } from "@/lib/store/settings-server"
import { mergeReviewsApp, readReviewsApp, type ReviewsAppSettings } from "./app-settings"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export const REVIEWS_APP_NEEDS_PART = "Storelib Reviews needs its database update. Run SQL part 134 in Supabase, then try again."
export const reviewsAppTag = (creatorId: string) => `reviews-app:${creatorId}`

function missingColumn(error: { code?: string } | null | undefined): boolean {
  const code = String(error?.code ?? "")
  return code === "42703" || code === "PGRST204" || isMissingTable(error)
}

export async function loadReviewsApp(db: Db, creatorId: string): Promise<{ settings: ReviewsAppSettings; ready: boolean }> {
  const { data, error } = await db.from("store_settings").select("reviews").eq("creator_id", creatorId).maybeSingle()
  if (error) return { settings: readReviewsApp(null), ready: !missingColumn(error) }
  return { settings: readReviewsApp(data?.reviews), ready: true }
}

/** For a published page and the public review routes: cached for two minutes, cleared on save. Never throws. */
export function publishedReviewsApp(db: Db, creatorId: string): Promise<ReviewsAppSettings> {
  return unstable_cache(
    async () => {
      try {
        return (await loadReviewsApp(db, creatorId)).settings
      } catch {
        return readReviewsApp(null)
      }
    },
    ["reviews-app", creatorId],
    { revalidate: 120, tags: [reviewsAppTag(creatorId)] },
  )()
}

export async function saveReviewsApp(db: Db, creatorId: string, patch: unknown): Promise<{ ok: true; settings: ReviewsAppSettings } | { ok: false; error: string; status: number }> {
  const now = await loadReviewsApp(db, creatorId)
  if (!now.ready) return { ok: false, error: REVIEWS_APP_NEEDS_PART, status: 409 }
  const next = mergeReviewsApp(now.settings, patch)
  const { error } = await db.from("store_settings").upsert({ creator_id: creatorId, reviews: next, updated_at: new Date().toISOString() }, { onConflict: "creator_id" })
  /* Part 134 kept the settings under 4 KB; the request email's own words can pass that until part 189 makes room. */
  if (error && String((error as { code?: string }).code ?? "") === "23514") return { ok: false, error: "Those settings are too long to keep yet. Shorten the email's words, or run SQL part 189 in Supabase.", status: 409 }
  if (error) return { ok: false, error: missingColumn(error) ? REVIEWS_APP_NEEDS_PART : "It could not be saved.", status: missingColumn(error) ? 409 : 500 }
  forgetReviewsApp(creatorId)
  return { ok: true, settings: next }
}

export function forgetReviewsApp(creatorId: string): void {
  try {
    revalidateTag(reviewsAppTag(creatorId), { expire: 0 })
  } catch {
    /* Outside a request (tests): the cache runs out on its own. */
  }
}
