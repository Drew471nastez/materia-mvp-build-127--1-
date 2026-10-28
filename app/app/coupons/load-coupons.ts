import "server-only"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { teamPageStore } from "@/lib/team/server"
import { readStoreCurrency } from "@/lib/store/selling-currency-read"

/**
 * The store, its published products (what a code can be limited to) and,
 * when asked, one of its codes. The owner reads with their own client:
 * row-level security answers exactly as it does for the API. A team member
 * given Marketing (lib/team) reads the store they work in through the
 * service role, every query by the store's id; without it they are told
 * (state "denied") and nothing is read.
 */
export async function loadCouponArea(couponId: string | null) {
  /* The creator row the /app layout read, once per request (lib/team/server teamPageStore, lib/auth/request-scope.ts). */
  const access = await teamPageStore("marketing")
  if (access.kind === "signed_out") return { state: "signed-out" as const }
  if (access.kind === "denied") return { state: "denied" as const, acting: access.acting }
  if (access.kind === "none") return { state: "no-creator" as const }
  const creator = { id: access.creatorId }
  const supabase = access.isOwner ? await createClient() : (createAdminClient() as unknown as Awaited<ReturnType<typeof createClient>>)

  const [products, coupons, store] = await Promise.all([
    supabase
      .from("products")
      .select("id, title, price_cents, thumbnail_url, status")
      .eq("creator_id", creator.id)
      .eq("status", "published")
      .order("title"),
    couponId
      ? supabase.from("coupons").select("*").eq("id", couponId).eq("creator_id", creator.id).limit(1)
      : supabase.from("coupons").select("*").eq("creator_id", creator.id).order("created_at", { ascending: false }),
    /* The store's own currency (Settings › Country and currency): a fixed amount off and a minimum are in it, as checkout reads them. */
    readStoreCurrency(supabase as never, creator.id as string).catch(() => ({ currency: "USD" })),
  ])

  return {
    state: "ready" as const,
    creatorId: creator.id as string,
    products: products.data ?? [],
    coupons: coupons.data ?? [],
    currency: (store.currency || "USD").toUpperCase(),
  }
}
