import { randomUUID } from "node:crypto"
import { quietAfterPublish } from "@/lib/website-builder/after-publish"
import { after, NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { rateLimit } from "@/lib/api/rate-limit"
import { creatorSitePlan } from "@/lib/sites/plan-server"
import { LIBRARY_FULL_CODE, LIBRARY_FULL_MESSAGE, librarySlotsLeft } from "@/lib/website-builder/library-limit"
import { IMPORT_BUCKET, importPathFor } from "@/lib/website-builder/theme-import"
import { ADD_REFUSALS, LISTING_SETTINGS_KEY, LISTING_SLUG_RE, addVerdict, mergeListings } from "@/lib/themes/marketplace-shared"
import { PACKAGE_PATH_RE, listingRowBySlug, rowToListing } from "@/lib/themes/marketplace-server"
import { composeTemplateFiles, templateMenus } from "@/lib/themes/template-packages"
import { readReleaseRowsFor, releasedFiles, zipOf } from "@/lib/themes/releases-server"
import { convertTemplateFiles } from "@/lib/themes/template-install"
import { storeImportedTheme } from "@/lib/themes/imported-theme-store"
import { describeMedia } from "@/lib/storelib-theme/media"
import { coverAfterCreate, newestCover, renderOrigin, storeCover, type CoverOwner } from "@/lib/website-builder/cover-take"
import { templateCoverBytes } from "@/lib/website-builder/template-cover"
import { installsWithAddKey, isAddKey, oncePerKey, oneWebsitePerKey, withAddKey, type KeyedInstall } from "@/lib/themes/add-attempt"
import { MAX_BYTES as SNAPSHOT_MAX_BYTES } from "@/lib/website-builder/snapshot"
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
  /* Round 27: the press's key (lib/themes/add-attempt.ts); the same key at once on this server waits for the first. */
  const key = await req.clone().json().then((b: { key?: unknown } | null) => (isAddKey(b?.key) ? (b!.key as string) : null), () => null)
  return oncePerKey(key, () => addToLibrary(req, key))
}

async function addToLibrary(req: Request, key: string | null): Promise<Response> {
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

  /*
    THE SAME PRESS AGAIN (round 27, lib/themes/add-attempt.ts): a website of
    this store already made with this key is the answer, and nothing is made.
    Before the rate limit, so a retry of a press that worked is never refused.
  */
  const replay = async (made: KeyedInstall) => {
    const cover = await newestCover({ installId: made.id, userId: user.id }).catch(() => null)
    return NextResponse.json({ ok: true, install_id: made.id, name: made.name, install: { id: made.id }, replay: true, cover: cover ? { url: cover.url, mobile_url: cover.mobile_url, updated_at: cover.updated_at ?? new Date().toISOString() } : null, cover_pending: false })
  }
  if (key) {
    const same = await installsWithAddKey(createAdminClient(), creator.id as string, key)
    if (same[0]) return replay(same[0])
  }
  /* Two servers raced with the same key: the oldest website stays and is the answer. */
  const settled = async (installId: unknown): Promise<KeyedInstall | null> =>
    key && typeof installId === "string" ? oneWebsitePerKey(createAdminClient(), creator.id as string, key, installId).catch(() => null) : null

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
  let released: { files: Map<string, Buffer>; version: string } | null = null
  try {
    /* Round 27: only this listing's and the base's rows, and the files of a pinned release held by this server (releases-server.ts). */
    const { rows } = await readReleaseRowsFor(listing.slug)
    const at = rows.length ? await releasedFiles(listing.slug, rows) : null
    if (at) released = { files: at.files, version: at.version }
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
  /* The listing's note in a website's settings, live and draft alike. */
  const mark = (s: unknown): Record<string, unknown> => {
    const o = s && typeof s === "object" ? (s as Record<string, unknown>) : {}
    const marked = o.compat && typeof o.compat === "object" ? { ...o, compat: { ...(o.compat as Record<string, unknown>), listing: listing.slug } } : { ...o, [LISTING_SETTINGS_KEY]: listing.slug }
    const keyed = key ? withAddKey(marked, key) : marked
    return released ? withInstalledRelease(keyed, released.version) : keyed
  }
  const named = async (made: Record<string, unknown> & { install_id?: string }) => {
    if (typeof made.install_id !== "string") return
    const admin = createAdminClient()
    await admin.from("store_theme_installs").update({ name: listing.name }).eq("id", made.install_id).eq("creator_id", creator.id)
    try {
      const { data } = await admin.from("store_theme_settings").select("settings, draft_settings").eq("install_id", made.install_id).maybeSingle()
      if (!data) return
      const row = data as { settings: unknown; draft_settings: unknown }
      await admin.from("store_theme_settings").update({ settings: mark(row.settings), draft_settings: mark(row.draft_settings ?? row.settings) }).eq("install_id", made.install_id)
    } catch {
      /* The website is added whatever happens to this note. */
    }
  }

  /*
    ═══════════════════════════════════════════════════════════════════════
     A STORELIB TEMPLATE, STORED IN THIS REQUEST (round 27)
    ═══════════════════════════════════════════════════════════════════════
    The owner: "adding a theme takes too long", "sometimes it says the
    server is slow". Production: 6 to 11 s before the photograph was even
    tried (fra1, 2026-11-25). The template was zipped (23 MB), sent to the
    import as somebody's upload, checked as a stranger's file, unzipped,
    converted, its 49 pictures sent one after the other, its 986 rows
    written 200 at a time in a row, then renamed and its settings read and
    written again, then up to 8 s waited for a photograph. Now its files go
    straight to the same conversion (held per server), the same writes
    (lib/themes/imported-theme-store.ts: pictures a few at a time and only
    the new ones, rows in parallel parts) with the name and the listing's
    note in the first write, and its picture is the template's own cover.
    The import's checks on a stranger's upload stay for uploaded themes,
    below; a template is Storelib's own code. Same rows, same answer.
  */
  if (listing.codePackage) {
    const t0 = performance.now()
    const timing: string[] = []
    let lapAt = t0
    const lap = (step: string) => {
      const now = performance.now()
      timing.push(`${step};dur=${Math.round(now - lapAt)}`)
      lapAt = now
    }
    const owner = { userId: user.id, creatorId: creator.id as string }
    /* The template's picture, asked for now: a static file the CDN serves (marketplace-shared.ts templateCoverPath). */
    const coverAsked = templateCoverBytes({ cover: listing.cover, phone: listing.screenshots?.[1] ?? null }, renderOrigin(req.url), SNAPSHOT_MAX_BYTES)
    let files: Map<string, Buffer>
    try {
      files = released?.files ?? composeTemplateFiles(listing.codePackage)
    } catch (e) {
      console.error("[themes/marketplace] could not compose the template:", e instanceof Error ? e.message : e)
      return NextResponse.json({ error: "Could not add the theme. Try again." }, { status: 500 })
    }
    lap("compose")
    const converted = await convertTemplateFiles(files, listing.name).catch((e) => {
      console.error("[themes/marketplace] could not convert the template:", e instanceof Error ? e.message : e)
      return null
    })
    lap("convert")
    if (!converted) return NextResponse.json({ error: "Could not add the theme. Try again." }, { status: 500 })
    const admin = createAdminClient()
    const stored = await storeImportedTheme(admin, owner, converted.theme, converted.report, { name: listing.name, mark, timing: lap })
    if (stored.ok === false) {
      const failure = stored as { status: number; error: string; code?: string }
      return NextResponse.json(failure.code ? { error: failure.error, code: failure.code } : { error: failure.error }, { status: failure.status })
    }
    const earlier = await settled(stored.installId)
    if (earlier) return replay(earlier)
    /*
      ITS NAVIGATION, FOR A STORE WITH NONE. Menus are the store's, one set
      for every website (store-menus-server.ts), so a template never replaces
      them. A store that has no menu anywhere yet is given the template's own
      (Shop, About, FAQ ...) in place of the made up Home, Shop, Contact.
    */
    try {
      const menus = templateMenus(listing.codePackage)
      if (menus && (await readStoreMenus(admin, owner.creatorId)).kind === "none") await writeStoreMenus(admin, owner.creatorId, menus)
    } catch {
      /* The website is added whatever happens to its menus. */
    }
    lap("menus")
    const cover = await firstTemplateCover({ installId: stored.installId, ...owner }, await coverAsked, renderOrigin(req.url))
    lap("cover")
    console.info("[themes/marketplace] added", { slug: listing.slug, ms: Math.round(performance.now() - t0), steps: timing.join(",") })
    return NextResponse.json(
      { ok: true, install_id: stored.installId, name: listing.name, migrated: false, media: describeMedia(stored.imported), left_out: [], ...cover, install: { id: stored.installId } },
      { headers: { "Server-Timing": timing.join(", ") } },
    )
  }

  if (released) {
    /* An uploaded theme's newest release: the import pipeline, as an upload, with every check a stranger's file gets. */
    let zip: Buffer
    try {
      zip = await zipOf(released.files)
    } catch (e) {
      console.error("[themes/marketplace] could not compose the release:", e instanceof Error ? e.message : e)
      return NextResponse.json({ error: "Could not add the theme. Try again." }, { status: 500 })
    }
    const form = new FormData()
    form.set("file", new Blob([new Uint8Array(zip)], { type: "application/zip" }), `${listing.slug}.zip`)
    const res = await importThemePackage(new Request(new URL("/api/website-builder/themes/import", req.url), { method: "POST", headers: { cookie: req.headers.get("cookie") ?? "" }, body: form }))
    if (!res.ok) return res
    /* The import's own report is about a file somebody uploaded; only what the page uses is passed on. */
    const { shopify: _report, ...made } = (await res.json().catch(() => ({}))) as Record<string, unknown> & { install_id?: string }
    void _report
    await named(made)
    const earlier = await settled(made.install_id)
    if (earlier) return replay(earlier)
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
  const earlier = await settled(made.install_id)
  if (earlier) return replay(earlier)
  return NextResponse.json({ ...made, name: listing.name, install: made.install_id ? { id: made.install_id } : undefined })
}

/**
 * The new website's first picture without waiting for a browser: the
 * template's own cover, stored as the website's (cover-take.ts storeCover),
 * and a photograph of the website itself after the answer, as every new
 * website gets. Without the template's picture, nothing is waited for: the
 * answer says the picture is coming and the photograph runs after it.
 */
async function firstTemplateCover(owner: CoverOwner, bytes: { desktop: Buffer; phone: Buffer | null } | null, origin: string): Promise<{ cover: { url: string; mobile_url: string | null; updated_at: string } | null; cover_pending: boolean }> {
  if (bytes) {
    try {
      const c = await storeCover(owner, bytes.desktop, bytes.phone)
      after(async () => {
        /* After the editor's first read: the new website is most often opened at once (round 67, after-publish.ts). */
        await quietAfterPublish()
        await coverAfterCreate(owner, origin, "template")
      })
      return { cover: { url: c.url, mobile_url: c.mobile_url, updated_at: c.updated_at ?? new Date().toISOString() }, cover_pending: false }
    } catch (e) {
      console.error("[cover] template: could not store the template's picture:", e instanceof Error ? e.message : e)
    }
  }
  after(async () => {
        /* After the editor's first read: the new website is most often opened at once (round 67, after-publish.ts). */
        await quietAfterPublish()
        await coverAfterCreate(owner, origin, "template")
      })
  return { cover: null, cover_pending: true }
}
