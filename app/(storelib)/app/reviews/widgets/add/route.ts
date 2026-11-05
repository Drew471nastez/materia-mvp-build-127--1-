import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { creatorFor } from "@/lib/team/server"
import { editorAddress, readPlacement } from "@/lib/reviews/widgets/placement"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * /app/reviews/widgets/add: AN ADDRESS, NOT A PAGE (Storelib Reviews ›
 * Widgets › Add to website). Opens the website builder on the live website
 * (the first one when none is live), on the page asked for, with the widget
 * to add (lib/reviews/widgets/placement.ts). A product page opens on one of
 * the store's published products, so the widget is seen with real reviews.
 * Signed out goes to sign in and back here.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const want = readPlacement(url.searchParams)
  const back = (path: string) => NextResponse.redirect(new URL(path, url), 303)
  if (!want) return back("/app/reviews/widgets")
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return back(`/login?next=${encodeURIComponent(url.pathname + url.search)}`)
  const db = createAdminClient()
  const found = await creatorFor(db, user.id, "store")
  if (found.kind !== "store") return back("/app/reviews/widgets")
  const creatorId = found.creator.id
  const { data: installs } = await db.from("store_theme_installs").select("id, status").eq("creator_id", creatorId).order("sort_order", { ascending: true })
  const list = (installs ?? []) as { id: string; status: string }[]
  const site = list.find((i) => i.status === "published") ?? list[0]
  if (!site) return back("/app/website-builder")
  let slug: string | null = null
  if (want.page === "product") {
    /* The product with the most reviews, so the widget shows real ones; any published one otherwise. */
    const { data } = await db.from("products").select("slug").eq("creator_id", creatorId).eq("status", "published").not("slug", "is", null).order("reviews_count", { ascending: false, nullsFirst: false }).limit(1)
    slug = ((data ?? []) as { slug: string | null }[])[0]?.slug ?? null
  }
  return back(editorAddress(site.id, want, slug))
}
