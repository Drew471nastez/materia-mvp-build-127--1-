import { blogArticleSections, blogListingSections } from "@/lib/website-builder/blog-page"
import { websiteInstallCaller } from "@/lib/team/website"
import { blockTreeProblem } from "@/lib/website-builder/block-tree"
import { BlockInstanceSchema } from "@/lib/website-builder/block-tree-schema"
import { readOwnSectionFields, sanitizeSections } from "@/lib/website-builder/sanitize-sections"
import { customSchemaLookup } from "@/lib/website-builder/custom-schemas"
import { withOverlayFilledIn } from "@/lib/website-builder/compat-overlay-repair"
import { GENERATED_PAGE_KEYS, isPageKey } from "@/lib/website-builder/site-pages"
import { collectionSections, collectionsPageSections, notFoundSections, searchSections, shopSections } from "@/lib/website-builder/shop-page"
import { accountPageSections } from "@/lib/website-builder/account-pages"
import type { ThemeSettingsValues } from "@/lib/website-builder/types"
import { NextResponse, after } from "next/server"
import { revalidatePublishedSite } from "@/lib/website-builder/published-site"
import { announce, websiteAddresses } from "@/lib/seo/announce"
import { indexNowKey } from "@/lib/seo/indexnow"
import { addressesAt, pagePath } from "@/lib/website-builder/site-changes"
import { translationsChanged } from "@/lib/markets/translate-queue"
import { LIMITS } from "@/lib/storelib-theme/types"
import { LIMITS as RATE_LIMITS, rateLimit } from "@/lib/api/rate-limit"
import { BODY_LIMITS, readEditorBody } from "@/lib/website-builder/request-body"
import { z } from "zod"
import { loadReviewsApp } from "@/lib/reviews/app-server"
import type { SectionInstance } from "@/lib/website-builder/types"
import { dbFailure, isDuplicate } from "@/lib/website-builder/write-retry"

type Params = { params: Promise<{ installId: string }> }

// ── Request schema ───────────────────────────────────────────
// We keep `settings` as a free-form record (section schemas vary widely)
// but cap it to reasonable shapes so callers can't inject crazy payloads.
/* The whole tree, blocks inside blocks included: lib/website-builder/block-tree.ts. */
const BlockSchema = BlockInstanceSchema

const SectionSchema = z.object({
  id: z.string().min(1).max(128),
  type: z.string().min(1).max(64),
  /* An imported Shopify theme's sections carry no name (the theme names them by type); one sent without is saved with none, not refused. */
  name: z.string().max(256).optional().default(""),
  /* The name the creator gave the section in the editor (lib/website-builder/section-name.ts). */
  label: z.string().max(80).optional(),
  settings: z.record(z.unknown()),
  blocks: z.array(BlockSchema).max(500).optional(),
  hidden: z.boolean().optional(),
  /* Which section group it sits in, kept rather than stripped: lib/storelib-theme/section-groups.ts. */
  group: z.enum(["header", "footer", "overlay"]).optional(),
  /* An imported theme's Overlay group section: the theme's group file it is drawn in (overlay-group). */
  slot: z.string().regex(/^[a-z0-9_-]{1,64}$/i).optional(),
})

const PutBodySchema = z.object({
  page_key: z.string().min(1).max(64),
  sections: z.array(SectionSchema).max(500),
  mode: z.enum(["draft", "publish"]).optional(),
})

/* The owner, or a team member with Website working in the store (lib/team/website): the site in the URL must be the store's. */
/* Round 50: a GET takes the request's read answer (lib/auth/route-user readerForRequest: Supabase Auth, or the token's verified signature when Auth is slow), as every other read does since round 49. A change still needs Auth itself. Row level security applies to every query either way. */
async function getCreatorInstall(installId: string, read = false) {
  const c = await websiteInstallCaller(installId, "id, creator_id", { read })
  if (c.error !== null) return { error: c.error, status: c.status, supabase: null }
  // The creator id comes back too: a write that lands on the LIVE columns
  // has to throw away the cached published site, and that cache is keyed by
  // creator. See lib/website-builder/published-site.ts.
  return { error: null, status: 200, supabase: c.supabase, creatorId: c.creatorId, userId: c.userId }
}

// GET /api/website-builder/themes/[installId]/sections?page=home
export async function GET(req: Request, { params }: Params) {
  const { installId } = await params
  const { error, status, supabase, userId, creatorId } = await getCreatorInstall(installId, true)
  if (error || !supabase) return NextResponse.json({ error }, { status })

  const limited = await rateLimit({ bucket: "site-sections-read", subjects: [`user:${userId}`], windows: RATE_LIMITS.siteRead })
  if (limited) return limited

  const { searchParams } = new URL(req.url)
  const pageKey = searchParams.get("page") ?? "home"
  /* Storelib Reviews' "Add to product pages", read beside the page (used below). */
  const reviewsRead: Promise<boolean> = pageKey === "product" && creatorId
    ? loadReviewsApp(supabase, creatorId).then((r) => r.settings.enabled && r.settings.display.productPage, () => false)
    : Promise.resolve(false)

  const { data, error: fetchErr } = await supabase
    .from("store_theme_pages")
    .select("*")
    .eq("install_id", installId)
    .eq("page_key", pageKey)
    .maybeSingle()

  /* The database's own words go to the log, never to the browser. */
  if (fetchErr) {
    console.error("[sections] read failed", { code: fetchErr.code })
    return dbFailure(fetchErr, "Could not load this page. Try again.")
  }

  // Return draft_sections if present, else sections
  /* An imported theme's Overlay group, filled in from its files when an earlier import left it empty (compat-overlay-repair.ts). */
  const sections = await withOverlayFilledIn(supabase, installId, (data?.draft_sections ?? data?.sections) as SectionInstance[] | null)

  /*
    ═══════════════════════════════════════════════════════════════════════
     THE SHOP, SEARCH AND 404 PAGES EXIST BEFORE ANYBODY HAS ARRANGED THEM
    ═══════════════════════════════════════════════════════════════════════
    A published site answers /products and /search from the day it is
    published, built from the home page's header and footer and one section
    each. The editor asked for those keys and got an empty list, so every
    link to them in the canvas — Shop in the menu, the search icon, View all
    — landed on "that page does not exist" for a page the live site serves.

    The same builders produce them here, from the same stored home page and
    the same settings the live site reads, so what the creator opens is what
    a visitor sees. Marked `generated` so the editor knows nothing is stored
    yet; the first save stores it and it is a page like any other from then.
  */
  if ((!sections || sections.length === 0) && GENERATED_PAGE_KEYS.has(pageKey)) {
    const [{ data: home }, { data: settingsRow }] = await Promise.all([
      supabase
        .from("store_theme_pages")
        .select("sections, draft_sections")
        .eq("install_id", installId)
        .eq("page_key", "home")
        .maybeSingle(),
      supabase
        .from("store_theme_settings")
        .select("settings, draft_settings")
        .eq("install_id", installId)
        .maybeSingle(),
    ])
    const homeSections = ((home?.draft_sections ?? home?.sections) as SectionInstance[] | null) ?? []
    const theme = ((settingsRow?.draft_settings ?? settingsRow?.settings) as ThemeSettingsValues | null) ?? ({} as ThemeSettingsValues)
    /* The account pages and the contact page are built the same way:
       lib/website-builder/account-pages. The 404 page too: shop-page.ts. */
    const generated =
      pageKey === "products"
        ? shopSections(homeSections, theme)
        : pageKey === "search"
          ? searchSections(homeSections)
          : pageKey === "404"
            ? notFoundSections(homeSections)
            : pageKey === "collections"
              ? collectionsPageSections(homeSections)
              : pageKey === "collection"
                ? collectionSections(homeSections, theme, { title: "Collection name", description: "" })
                : /* The blog's two templates, Blog and Blog post: lib/website-builder/blog-page.ts. */
                  pageKey === "blogs"
                  ? blogListingSections(homeSections, theme)
                  : pageKey === "article"
                    ? blogArticleSections(homeSections, theme)
                    : (accountPageSections(pageKey, homeSections) ?? [])
    return NextResponse.json({ page: null, sections: sanitizeSections(generated), has_draft: false, generated: true })
  }

  /**
   * ===========================================================================
   *  CLEANED ON THE WAY OUT AS WELL AS ON THE WAY IN
   * ===========================================================================
   * PUT below runs every save through `sanitizeSections`, which is the
   * authority. It is not the only way a row gets written, though: a theme
   * imported from a package, a duplicate, a snapshot, a row edited by hand.
   * Those arrive already in the table, and this is what hands them to the
   * editor, where the canvas renders section settings with
   * `dangerouslySetInnerHTML` on storelib.com in the creator's own signed-in
   * session.
   *
   * So the read is cleaned too. lib/website-builder/published-site.ts and
   * app/(site)/w/[username]/render-site.tsx already do this for what a
   * visitor sees; the editor was the one read path that did not, and the
   * editor is the one where the person looking at it is signed in.
   *
   * `sanitizeSections` returns the same array when nothing was unsafe, so
   * the ordinary case costs a walk and allocates nothing.
   */
  /* A section the creator wrote is cleaned by its own schema, not only by
     the built-in ones: lib/website-builder/custom-schemas.ts. */
  const lookup = await customSchemaLookup(supabase as never, installId, [
    ...((data?.sections as SectionInstance[] | null) ?? []),
    ...((data?.draft_sections as SectionInstance[] | null) ?? []),
  ], { draft: true })
  const clean = sanitizeSections(sections ?? [], lookup)
  const page = data
    ? {
        ...data,
        sections: data.sections ? sanitizeSections(data.sections as SectionInstance[], lookup) : data.sections,
        draft_sections: data.draft_sections ? sanitizeSections(data.draft_sections as SectionInstance[], lookup) : data.draft_sections,
      }
    : data

  /*
    The product page in a store with Storelib Reviews on and "Add to product
    pages" on: the editor puts the stars and the reviews on it as the live
    page does (lib/website-builder/product-page.ts withProductReviews), so
    the creator sees them in the sidebar to move or remove.
  */
  const reviewsOn = await reviewsRead

  return NextResponse.json({
    page,
    sections: clean,
    has_draft: data?.draft_sections !== null,
    ...(reviewsOn ? { reviews_on: true } : {}),
  })
}

// PUT /api/website-builder/themes/[installId]/sections
// body: { page_key: string, sections: SectionInstance[], mode: "draft" | "publish" }
export async function PUT(req: Request, { params }: Params) {
  const { installId } = await params
  const { error, status, supabase, creatorId, userId } = await getCreatorInstall(installId)
  if (error || !supabase) return NextResponse.json({ error }, { status })

  /* Per person, after they are known, sized for autosave in two tabs: RATE_LIMITS.siteSave. */
  const limited = await rateLimit({
    bucket: "site-sections-save",
    subjects: [`user:${userId}`],
    windows: RATE_LIMITS.siteSave,
    message: "Too many saves in a short time. Wait a moment, then keep editing.",
  })
  if (limited) return limited

  /* Read up to a cap rather than whatever arrives: lib/website-builder/request-body.ts. */
  const read = await readEditorBody(req, BODY_LIMITS.sections)
  if (read.ok === false) return read.response
  if (read.invalid) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  const body = read.json

  const parsed = PutBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", issues: parsed.error.issues },
      { status: 400 },
    )
  }
  const { page_key, sections: raw, mode } = parsed.data as {
    page_key: string
    sections: SectionInstance[]
    mode?: "draft" | "publish"
  }

  /**
   * THE AUTHORITY ON WHAT REACHES THE DATABASE.
   *
   * Several sections put a setting straight into the DOM, and a published
   * storefront is served from storelib.com/<username>, the platform's own
   * origin. Script in a rich text body therefore ran in the session of any
   * signed-in visitor who opened that store. The rich text control is a
   * plain textarea, so putting it there took no tooling at all.
   *
   * Cleaned here rather than only at render, because a value that never
   * enters the database cannot be missed by a read path somebody adds later.
   * See lib/website-builder/sanitize.ts for the allow lists. A section type
   * the install wrote itself is cleaned by its own file's schema.
   */
  const own = await readOwnSectionFields(supabase, installId, raw.map((s) => s.type))
  const sections = sanitizeSections(raw, own)

  /**
   * ===========================================================================
   *  WHAT A PAGE WILL HOLD
   * ===========================================================================
   * These ceilings existed and were enforced when a theme was IMPORTED as a
   * package, and nowhere on the path people actually use: the editor and the
   * assistant could both grow a page past any of them, one section at a time,
   * and the first anyone would know is a page that takes a second to render.
   *
   * Checked here because this is the single door every section change goes
   * through, whichever surface made it.
   */
  if (sections.length > LIMITS.sectionsPerTemplate) {
    return NextResponse.json(
      { error: `A page holds ${LIMITS.sectionsPerTemplate} sections. This one has ${sections.length}.` },
      { status: 413 },
    )
  }
  /* Every block counts, at every depth, and blocks nest no deeper than MAX_BLOCK_DEPTH. */
  const overfull = sections.map((s) => blockTreeProblem(s)).find((problem) => problem !== null)
  if (overfull) return NextResponse.json({ error: overfull }, { status: 413 })

  const update =
    mode === "publish"
      ? { sections, draft_sections: null }
      : { draft_sections: sections }

  // Upsert
  const { data: existing, error: lookupErr } = await supabase
    .from("store_theme_pages")
    .select("id")
    .eq("install_id", installId)
    .eq("page_key", page_key)
    .maybeSingle()
  if (lookupErr) return dbFailure(lookupErr, "Could not save the page. Try again.")

  /**
   * A NEW page takes an address the editor could have made: lowercase
   * letters, numbers and hyphens (isPageKey, lib/website-builder/site-pages.ts).
   * A page that already exists is saved under the key it has, whatever it
   * is: an imported theme may have stored "About_Us" or "page.about", and
   * refusing those would be refusing a save.
   */
  if (!existing && !isPageKey(page_key)) {
    return NextResponse.json({ error: "A page address uses lowercase letters, numbers and hyphens." }, { status: 400 })
  }

  let result
  if (existing) {
    const { data, error: updateErr } = await supabase
      .from("store_theme_pages")
      .update(update)
      .eq("id", existing.id)
      .select()
      .single()
    if (updateErr) {
      console.error("[sections] save failed", { code: updateErr.code })
      return dbFailure(updateErr, "Could not save this page. Try again.")
    }
    result = data
  } else {
    const insertData =
      mode === "publish"
        ? { install_id: installId, page_key, sections, draft_sections: null }
        : { install_id: installId, page_key, sections: [], draft_sections: sections }

    let { data, error: insertErr } = await supabase
      .from("store_theme_pages")
      .insert(insertData)
      .select()
      .single()
    /*
      THE SAME SAVE, SENT AGAIN (round 50). The editor sends a save again
      when an answer did not come back in time (lib/website-builder/
      save-request.ts), and the first try may have created the page while
      its answer was lost. UNIQUE(install_id, page_key) then refused the
      second, and the editor said the save failed. The page is there, so
      this save is written to it, as it would have been one moment later.
    */
    if (insertErr && isDuplicate(insertErr)) {
      ;({ data, error: insertErr } = await supabase
        .from("store_theme_pages")
        .update(update)
        .eq("install_id", installId)
        .eq("page_key", page_key)
        .select()
        .single())
    }
    if (insertErr) {
      console.error("[sections] create failed", { code: insertErr.code })
      return dbFailure(insertErr, "Could not save this page. Try again.")
    }
    result = data
  }

  /**
   * `mode: "publish"` writes the LIVE columns, so it changes the website and
   * the cached copy of it has to go. A draft save changes nothing a visitor
   * can see, and throwing the cache away on every keystroke would undo the
   * point of having one.
   */
  if (mode === "publish" && creatorId) {
    await revalidatePublishedSite(creatorId)
    /* Its words, translated in a few minutes when Translate changes automatically is on (lib/markets/translate-queue.ts). */
    translationsChanged(creatorId)
    /* The page, to the search engines that take IndexNow, when it is a page of the live website (lib/website-builder/site-changes.ts). */
    const announced = creatorId
    if (indexNowKey()) after(() => announce(async () => addressesAt(await websiteAddresses(announced), [pagePath(page_key)])))
  }

  return NextResponse.json({ page: result })
}

/**
 * ===========================================================================
 *  DELETE /api/website-builder/themes/[installId]/sections?page=<key>
 * ===========================================================================
 * Removing a page a creator made. The editor had a delete button that only
 * took the page out of React state: the row stayed, so the page came back on
 * the next reload, and on a published site it stayed up at its address. A
 * delete that does not delete is worse than no delete at all.
 *
 * `home` and `product` are the theme's own pages and are not removable. The
 * live columns change here, so the published site is invalidated for the
 * same reason `mode: "publish"` does it above.
 */
export async function DELETE(req: Request, { params }: Params) {
  const { installId } = await params
  const { error, status, supabase, creatorId, userId } = await getCreatorInstall(installId)
  if (error || !supabase) return NextResponse.json({ error }, { status })

  const limited = await rateLimit({
    bucket: "site-page-delete",
    subjects: [`user:${userId}`],
    windows: RATE_LIMITS.siteAction,
    message: "Too many pages deleted in a short time. Wait a minute and try again.",
  })
  if (limited) return limited

  const { searchParams } = new URL(req.url)
  /**
   * The key exactly as stored, the same as PUT. This used to lowercase it and
   * PUT never did, so a page an import had stored as "About_Us" saved fine
   * and could never be deleted: the delete looked for "about_us", matched
   * nothing, and answered ok.
   */
  const pageKey = searchParams.get("page") ?? ""
  if (!pageKey) return NextResponse.json({ error: "Which page?" }, { status: 400 })
  if (pageKey === "home" || pageKey === "product") {
    return NextResponse.json({ error: "The home and product pages are part of the theme." }, { status: 400 })
  }
  /* The same rule as PUT: an address the editor could have made, or a page this site already has. */
  if (!isPageKey(pageKey)) {
    const { data: found, error: lookupErr } = await supabase
      .from("store_theme_pages")
      .select("id")
      .eq("install_id", installId)
      .eq("page_key", pageKey)
      .maybeSingle()
    if (lookupErr) return NextResponse.json({ error: "Could not delete the page. Try again." }, { status: 500 })
    if (!found) return NextResponse.json({ error: "That is not a page on this site." }, { status: 400 })
  }

  /*
    Where the page is live, read before it goes: after the delete it is a
    404 and in no list, and search engines are told to look at it again
    (lib/website-builder/site-changes.ts). Only when IndexNow is on.
  */
  const liveBefore = creatorId && indexNowKey() ? addressesAt(await websiteAddresses(creatorId).catch(() => [] as string[]), [pagePath(pageKey)]) : []

  const { error: deleteErr } = await supabase
    .from("store_theme_pages")
    .delete()
    .eq("install_id", installId)
    .eq("page_key", pageKey)

  if (deleteErr) {
    console.error("[sections] delete failed", { code: deleteErr.code })
    return NextResponse.json({ error: "Could not delete this page. Try again." }, { status: 500 })
  }

  if (creatorId) await revalidatePublishedSite(creatorId)
  if (liveBefore.length > 0) after(() => announce(async () => liveBefore))

  return NextResponse.json({ ok: true })
}
