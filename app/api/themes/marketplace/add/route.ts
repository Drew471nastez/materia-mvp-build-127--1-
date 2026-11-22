import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { rateLimit } from "@/lib/api/rate-limit"
import { creatorSitePlan } from "@/lib/sites/plan-server"
import { LIBRARY_FULL_CODE, LIBRARY_FULL_MESSAGE, librarySlotsLeft } from "@/lib/website-builder/library-limit"
import { IMPORT_BUCKET, importPathFor } from "@/lib/website-builder/theme-import"
import { ADD_REFUSALS, LISTING_SETTINGS_KEY, LISTING_SLUG_RE, addVerdict, mergeListings } from "@/lib/themes/marketplace-shared"
import { PACKAGE_PATH_RE, listingRowBySlug, rowToListing } from "@/lib/themes/marketplace-server"
import { composeTemplateZip, templateMenus } from "@/lib/themes/template-packages"
import { readReleaseRows, releasedFiles, zipOf } from "@/lib/themes/releases-server"
import { withInstalledRelease } from "@/lib/themes/releases-shared"
import { readStoreMenus, writeStoreMenus } from "@/lib/website-builder/store-menus-server"
import { POST as importThemePackage } from "@/app/api/website-builder/themes/import/route"
import { authUnavailableResponse, routeUser } from "@/lib/auth/route-user"
import { storeUnavailableResponse } from "@/lib/team/server"

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
 *   a Storelib template    listed from code (marketplace-shared.ts,
 *                          CODE_TEMPLATES). Its zip is composed here from
 *                          the theme's files and the template's overlay
 *                          (lib/themes/template-packages.ts, read from
 *                          theme-packages/ on the server, never public) and
 *                          handed to the import pipeline as a form upload,
 *                          in this same request.
 *   a zip from /admin      the import pipeline (/api/website-builder/themes/
 *                          import), handed a copy of the listing's zip in
 *                          this person's own upload folder, exactly as if
 *                          they had uploaded it. It parses, cleans, stores
 *                          the pictures under their account and removes the
 *                          copy whatever happens.
 *
 * The native Storelib Default (theme-registry.ts) is not added from here any
 * more (templates round 16): mergeListings leaves a row that names it out,
 * so its address answers 404. /api/website-builder/themes/add still makes
 * one for the flows that ask it directly.
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

  /* The row hidden or not: a template listed from code that a row hides is not added behind the admin's back. */
  const row = await listingRowBySlug(slug, { includeHidden: true })
  const listing = mergeListings(row ? [rowToListing(row)] : []).find((l) => l.slug === slug) ?? null
  if (!listing || !listing.published) return NextResponse.json({ error: "No theme has this address." }, { status: 404 })

  /* A plan read that failed is a 503 Try again, never "this theme is for Pro" to a paying store (round rel2-auth). */
  const plan = listing.tier === "pro" ? await creatorSitePlan(creator.id as string).catch(() => null) : "free"
  if (plan === null) return storeUnavailableResponse()
  const verdict = addVerdict(listing, plan === "growth" || plan === "pro")
  if (verdict.ok === false) {
    const reason = (verdict as { reason: keyof typeof ADD_REFUSALS }).reason
    return NextResponse.json({ error: ADD_REFUSALS[reason], code: reason }, { status: reason === "needs_pro" ? 403 : reason === "paid_soon" ? 402 : 409 })
  }

  const forward = (url: string, payload: unknown) =>
    new Request(new URL(url, req.url), { method: "POST", headers: { "Content-Type": "application/json", cookie: req.headers.get("cookie") ?? "" }, body: JSON.stringify(payload) })

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

  /*
    AT ITS NEWEST RELEASE. A theme the admin has published releases of is
    added as the newest one (lib/themes/releases-server.ts, releasedFiles),
    and the website remembers that version, so its library row can say when
    a newer one comes. With none, or before RUN_THEME_RELEASES.sql has run,
    it is what the code or the listing's zip says, as before.
  */
  let released: { zip: Buffer; version: string } | null = null
  try {
    const { rows } = await readReleaseRows({ withFiles: true })
    const at = rows.length ? await releasedFiles(listing.slug, rows) : null
    if (at) released = { zip: await zipOf(at.files), version: at.version }
  } catch (e) {
    console.error("[themes/marketplace] the newest release could not be read:", e instanceof Error ? e.message : e)
  }

  /*
    NAMED AS THE MARKETPLACE NAMES IT, AND IT REMEMBERS WHERE IT CAME FROM.
    The listing's address is written into the new website's settings, live
    and draft (`compat.listing` for a theme in the compatible profile, a key
    of its own otherwise), so the library says "In library" on the next visit
    as well (marketplace-shared.ts installedListingSlugs). No new column.
  */
  const named = async (made: Record<string, unknown> & { install_id?: string }) => {
    if (typeof made.install_id !== "string") return
    const admin = createAdminClient()
    await admin.from("store_theme_installs").update({ name: listing.name }).eq("id", made.install_id).eq("creator_id", creator.id)
    try {
      const { data } = await admin.from("store_theme_settings").select("settings, draft_settings").eq("install_id", made.install_id).maybeSingle()
      if (!data) return
      const mark = (s: unknown) => {
        const o = s && typeof s === "object" ? (s as Record<string, unknown>) : {}
        const marked = o.compat && typeof o.compat === "object" ? { ...o, compat: { ...(o.compat as Record<string, unknown>), listing: listing.slug } } : { ...o, [LISTING_SETTINGS_KEY]: listing.slug }
        return released ? withInstalledRelease(marked, released.version) : marked
      }
      const row = data as { settings: unknown; draft_settings: unknown }
      await admin.from("store_theme_settings").update({ settings: mark(row.settings), draft_settings: mark(row.draft_settings ?? row.settings) }).eq("install_id", made.install_id)
    } catch {
      /* The website is added whatever happens to this note. */
    }
  }

  if (listing.codePackage || released) {
    let zip: Buffer
    try {
      zip = released?.zip ?? (await composeTemplateZip(listing.codePackage!))
    } catch (e) {
      console.error("[themes/marketplace] could not compose the template:", e instanceof Error ? e.message : e)
      return NextResponse.json({ error: "Could not add the theme. Try again." }, { status: 500 })
    }
    const form = new FormData()
    form.set("file", new Blob([new Uint8Array(zip)], { type: "application/zip" }), `${listing.slug}.zip`)
    const res = await importThemePackage(new Request(new URL("/api/website-builder/themes/import", req.url), { method: "POST", headers: { cookie: req.headers.get("cookie") ?? "" }, body: form }))
    if (!res.ok) return res
    /* The import's own report is about a file somebody uploaded; a template is Storelib's, so only what the page uses is passed on. */
    const { shopify: _report, ...made } = (await res.json().catch(() => ({}))) as Record<string, unknown> & { install_id?: string }
    void _report
    await named(made)
    /*
      ITS NAVIGATION, FOR A STORE WITH NONE. Menus are the store's, one set
      for every website (store-menus-server.ts), so a template never replaces
      them. A store that has no menu anywhere yet is given the template's own
      (Shop, About, FAQ ...) in place of the made up Home, Shop, Contact.
    */
    try {
      const menus = listing.codePackage ? templateMenus(listing.codePackage) : null
      if (menus && (await readStoreMenus(createAdminClient(), creator.id as string)).kind === "none") await writeStoreMenus(createAdminClient(), creator.id as string, menus)
    } catch {
      /* The website is added whatever happens to its menus. */
    }
    return NextResponse.json({ ...made, name: listing.name, install: made.install_id ? { id: made.install_id } : undefined })
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
  await named(made)
  return NextResponse.json({ ...made, name: listing.name, install: made.install_id ? { id: made.install_id } : undefined })
}
