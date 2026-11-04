import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { rateLimit } from "@/lib/api/rate-limit"
import { creatorSitePlan } from "@/lib/sites/plan-server"
import { LIBRARY_FULL_CODE, LIBRARY_FULL_MESSAGE, librarySlotsLeft } from "@/lib/website-builder/library-limit"
import { IMPORT_BUCKET, importPathFor } from "@/lib/website-builder/theme-import"
import { ADD_REFUSALS, LISTING_SLUG_RE, addVerdict, builtinListings } from "@/lib/themes/marketplace-shared"
import { PACKAGE_PATH_RE, listingRowBySlug, rowToListing } from "@/lib/themes/marketplace-server"
import { POST as addRegistryTheme } from "@/app/api/website-builder/themes/add/route"
import { POST as importThemePackage } from "@/app/api/website-builder/themes/import/route"
import { authUnavailableResponse, routeUser } from "@/lib/auth/route-user"

export const runtime = "nodejs"
/* The same work the import does, and its photograph after. */
export const maxDuration = 60

/**
 * ===========================================================================
 *  POST /api/themes/marketplace/add   { slug }
 * ===========================================================================
 * "Add to my library" on storelib.com/themes and on the library's cards. The
 * theme becomes a draft website the creator can edit and publish, made the
 * way every other one is:
 *
 *   Storelib's own theme   the registry add (/api/website-builder/themes/add)
 *   a zip from /admin      the import pipeline (/api/website-builder/themes/
 *                          import), handed a copy of the listing's zip in
 *                          this person's own upload folder, exactly as if
 *                          they had uploaded it. It parses, cleans, stores
 *                          the pictures under their account and removes the
 *                          copy whatever happens.
 *
 * Checked here, on the server, whatever the page showed: signed in, a
 * published listing, Pro themes for a Pro plan (the plan every check reads,
 * which an admin's override is part of), paid themes not on sale yet, and
 * room in the library.
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const who = await routeUser()
  if (who.kind === "unavailable") return authUnavailableResponse()
  const user = who.kind === "user" ? who.user : null
  if (!user) return NextResponse.json({ error: "Sign in to add themes.", code: "signin" }, { status: 401 })

  const { data: creator } = await supabase.from("creators").select("id").eq("user_id", user.id).maybeSingle()
  if (!creator) return NextResponse.json({ error: "Set up your store first.", code: "no_store" }, { status: 404 })

  const body = (await req.json().catch(() => null)) as { slug?: unknown } | null
  const slug = typeof body?.slug === "string" ? body.slug.trim().toLowerCase() : ""
  if (!LISTING_SLUG_RE.test(slug)) return NextResponse.json({ error: "No theme has this address." }, { status: 404 })

  const row = await listingRowBySlug(slug)
  const listing = row ? rowToListing(row) : builtinListings().find((b) => b.slug === slug) ?? null
  if (!listing || !listing.published) return NextResponse.json({ error: "No theme has this address." }, { status: 404 })

  const plan = listing.tier === "pro" ? await creatorSitePlan(creator.id as string) : "free"
  const verdict = addVerdict(listing, plan === "growth" || plan === "pro")
  if (verdict.ok === false) {
    const reason = (verdict as { reason: keyof typeof ADD_REFUSALS }).reason
    return NextResponse.json({ error: ADD_REFUSALS[reason], code: reason }, { status: reason === "needs_pro" ? 403 : reason === "paid_soon" ? 402 : 409 })
  }

  const forward = (url: string, payload: unknown) =>
    new Request(new URL(url, req.url), { method: "POST", headers: { "Content-Type": "application/json", cookie: req.headers.get("cookie") ?? "" }, body: JSON.stringify(payload) })

  if (listing.builtinThemeId) {
    return addRegistryTheme(forward("/api/website-builder/themes/add", { theme_id: listing.builtinThemeId }))
  }

  const limited = await rateLimit({
    bucket: "theme-import",
    subjects: [`user:${user.id}`],
    windows: [{ limit: 5, seconds: 60 }, { limit: 30, seconds: 3600 }],
    message: "That is a lot of themes in a short time. Wait a minute and try again.",
  })
  if (limited) return limited
  if ((await librarySlotsLeft(supabase, creator.id)) === 0) {
    return NextResponse.json({ error: LIBRARY_FULL_MESSAGE, code: LIBRARY_FULL_CODE }, { status: 400 })
  }

  const source = row?.package_path ?? ""
  if (!PACKAGE_PATH_RE.test(source)) return NextResponse.json({ error: ADD_REFUSALS.no_package, code: "no_package" }, { status: 409 })
  const copy = importPathFor(user.id, randomUUID())
  const { error: copyErr } = await createAdminClient().storage.from(IMPORT_BUCKET).copy(source, copy)
  if (copyErr) {
    console.error("[themes/marketplace] could not copy the package:", copyErr.message)
    return NextResponse.json({ error: "Could not add the theme. Try again." }, { status: 500 })
  }

  const res = await importThemePackage(forward("/api/website-builder/themes/import", { path: copy }))
  if (!res.ok) return res
  const made = (await res.json().catch(() => ({}))) as Record<string, unknown> & { install_id?: string }
  /* Named as the marketplace names it, not as the zip's own theme.json does. */
  if (typeof made.install_id === "string") {
    await createAdminClient().from("store_theme_installs").update({ name: listing.name }).eq("id", made.install_id).eq("creator_id", creator.id)
  }
  return NextResponse.json({ ...made, name: listing.name, install: made.install_id ? { id: made.install_id } : undefined })
}
