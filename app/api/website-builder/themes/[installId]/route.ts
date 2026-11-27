import { websiteHandleOf } from "@/lib/website-builder/site-address-data"
import { NextResponse } from "next/server"
import { OWNER_KEEPS_SITE } from "@/lib/team/website-words"
import { websiteInstallCaller } from "@/lib/team/website"
import { ensurePolicyPages, type PagesTable } from "@/lib/website-builder/ensure-policy-pages"
import { sanitizeInstallRow } from "@/lib/website-builder/sanitize-sections"
import { creatorFacts } from "@/lib/website-builder/storefront-data-server"
import { dbFailure } from "@/lib/website-builder/write-retry"

type Params = { params: Promise<{ installId: string }> }

/**
 * The creator's own communities for a community_picker: the choices, each
 * saying whether a visitor would see it, and the public facts of the ones
 * that would, so the canvas draws a Community card as the live site will.
 * Nothing while communities are off. Read with the service role (the
 * tables are server only), by this signed in creator's id alone.
 */
async function creatorCommunitiesForBuilder(creatorId: string) {
  try {
    const { communitiesEnabled } = await import("@/lib/communities/flag")
    if (!(await communitiesEnabled())) return null
    const { communityCardsFor, creatorCommunityChoices } = await import("@/lib/communities/server/blocks")
    const { createAdminClient } = await import("@/lib/supabase/admin")
    const db = createAdminClient()
    const [choices, cards] = await Promise.all([creatorCommunityChoices(db, creatorId), communityCardsFor(db, creatorId, "all")])
    return { choices, cards }
  } catch {
    return null
  }
}

/**
 * The store owner's published forms for a form_picker: the list to choose
 * from and the facts a section reads, so the canvas draws a form section as
 * the live site will. Read with the service role, by the store owner's user
 * id alone (native_forms.owner_id), after the ownership check above.
 */
async function creatorFormsForBuilder(creatorId: string, ownerUserId: string | null) {
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin")
    const { storefrontForms } = await import("@/lib/forms/storefront-forms")
    const cards = await storefrontForms(createAdminClient(), creatorId, "all", ownerUserId)
    return { choices: Object.values(cards).map((f) => ({ id: f.id, title: f.title, kind: f.kind })), cards }
  } catch {
    return null
  }
}

/** The store's menus for the editor; menus stay with the theme when they cannot be read. */
async function builderStoreMenus(creatorId: string, installId: string) {
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin")
    const { storeMenusFor } = await import("@/lib/website-builder/store-menus-server")
    return await storeMenusFor(createAdminClient(), creatorId, installId)
  } catch {
    return { available: false, stored: false, menus: {} }
  }
}

/**
 * The creator's own collections for a collection picker, a collection list
 * and the collections page: every one as a choice, saying whether a visitor
 * sees it, and the published ones as a section reads them, so the canvas
 * draws them as the live site will. Read by this signed in creator's id
 * alone. Every shop has collections, whatever it sells; null only when
 * they could not be read.
 */
async function creatorCollectionsForBuilder(creatorId: string) {
  try {
    const { siteCollections } = await import("@/lib/website-builder/storefront-collections-server")
    const { createAdminClient } = await import("@/lib/supabase/admin")
    const { collections, choices } = await siteCollections(createAdminClient(), creatorId, { published: false })
    return { choices, cards: collections }
  } catch {
    return null
  }
}

/**
 * The name of the store's website that is live now, when it is not this one;
 * null when none is, or this one is; undefined when it could not be read.
 * Read as the caller (row level security), by the store's id.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function liveWebsiteName(db: { from(table: string): any }, creatorId: string, installId: string): Promise<string | null | undefined> {
  try {
    const { data, error } = await db.from("store_theme_installs").select("id, name").eq("creator_id", creatorId).eq("status", "published").limit(1)
    if (error) return undefined
    const row = ((data ?? []) as { id: string; name: string | null }[])[0]
    return row && row.id !== installId ? String(row.name ?? "") : null
  } catch {
    return undefined
  }
}

// ── Auth helper ──────────────────────────────────────────────
/* The owner, or a team member with Website working in the store (lib/team/website): the site in the URL must be the store's. */
/* Round 50: a GET takes the request's read answer (lib/auth/route-user readerForRequest: Supabase Auth, or the token's verified signature when Auth is slow), as every other read does since round 49. A change still needs Auth itself. Row level security applies to every query either way. */
async function getCreatorAndInstall(installId: string, read = false) {
  const c = await websiteInstallCaller<{ id: string; creator_id: string; name?: string }>(installId, "id, creator_id, name", { read })
  if (c.error !== null) return { error: c.error, status: c.status, supabase: null, creator: null, install: null, userId: null, ownerUserId: null, isOwner: false }
  return { error: null, status: 200, supabase: c.supabase, creator: c.creator, install: c.install, userId: c.userId, ownerUserId: c.ownerUserId, isOwner: c.isOwner }
}

// GET /api/website-builder/themes/[installId]
// Returns full install data with settings, pages, and username
export async function GET(_req: Request, { params }: Params) {
  const { installId } = await params
  const { error, status, supabase, install, creator, ownerUserId, isOwner } = await getCreatorAndInstall(installId, true)
  if (error) return NextResponse.json({ error }, { status })

  /*
    WHAT DOES NOT HANG ON THE INSTALL'S ROW IS ASKED FOR NOW, beside it.
    These were read one after another after the row (the username, the slug,
    the site's own name, then the rest), each a round trip to the database,
    and with the editor waiting on this answer before it draws anything every
    one of them was time on the loader. None of them throws: each answers
    with nothing when its read fails, as before. The ownership check above
    still comes first.
  */
  const besides = Promise.all([
    /* The store owner's handle, for a team member as for the owner. */
    supabase!.from("profiles").select("username").eq("id", ownerUserId!).maybeSingle(),
    supabase!.from("creators").select("slug").eq("id", creator!.id).maybeSingle(),
    /* The name the website is at, when its creator gave it one of its own. */
    websiteHandleOf(creator!.id),
    creatorFacts(supabase! as never, creator!.id),
    creatorCommunitiesForBuilder(creator!.id),
    creatorCollectionsForBuilder(creator!.id),
    creatorFormsForBuilder(creator!.id, ownerUserId ?? null),
    /* The store's menus, which every theme shares (lib/website-builder/store-menus-server.ts). */
    builderStoreMenus(creator!.id, installId),
    /* The website live now, when it is another one: what the editor's Publish says it replaces (round 67). Its name only. */
    liveWebsiteName(supabase!, creator!.id, installId),
  ])
  /* Handled at once, so a read that fails while the row is still on its way is never an unhandled rejection; awaited below as before. */
  besides.catch(() => {})

  /**
   * EVERY SITE HAS ITS POLICY PAGES BY THE TIME IT IS READ.
   *
   * A refund policy, a privacy policy and terms of service are created here
   * rather than in a migration, because a migration only covers the sites
   * that exist when somebody remembers to run it. This is idempotent and
   * writes only what is missing: see lib/website-builder/ensure-policy-pages.
   *
   * Awaited, so the pages are in the response that follows rather than
   * appearing on the next reload. A failure is logged and swallowed: not
   * having a refund policy is not a reason to refuse somebody their editor.
   */
  /*
    THE PAGES BY NAME, NOT BY CONTENT (round 65). This read every page's
    sections and drafts (16 pages on a Materia template) and then every
    section file those pages use, 4.6 MB of theme code on each open, only to
    clean sections the editor never reads from this answer: it takes the
    page keys here and each page's sections from the sections route, which
    cleans them itself. On a busy database that read was what kept the
    editor on "Still opening your website".
  */
  const readInstall = () =>
    supabase!
      .from("store_theme_installs")
      .select(`
      *,
      theme:themes(*),
      settings:store_theme_settings(*),
      pages:store_theme_pages(id, page_key)
    `)
      .eq("id", installId)
      .single()
  /*
    Round 50: the site's row is read BESIDE the policy pages check, not after
    it. They were two round trips end to end in front of every opening of
    the editor, which on a slow database was most of its wait. On the rare
    opening where a page was made or a footer linked, the row is read again
    so the answer has them, as before.
  */
  const [ensured, firstRead] = await Promise.all([
    ensurePolicyPages(
      supabase! as unknown as PagesTable,
      installId,
      String((install as { name?: unknown } | null)?.name ?? "").trim(),
    ),
    readInstall(),
  ])
  if (ensured.error) console.error(`[policy-pages] ${installId}: ${ensured.error}`)
  const { data, error: fetchError } = ensured.created.length > 0 || ensured.footersLinked > 0 ? await readInstall() : firstRead

  /* The database's own words go to the log, never to the browser. */
  if (fetchError) {
    console.error("[themes/get] read failed", { code: fetchError.code })
    /* Round 50: a database that was slow or away is a 503 the editor asks again quietly; only a query that is wrong is a 500. */
    return dbFailure(fetchError, "Could not load this website. Try again.")
  }

  /* The creator's public profile comes along for the canvas to fill `{{ creator.name }}` the way the live site will: the same four public facts, nothing else. */
  const [{ data: profile }, { data: creatorData }, siteHandle, facts, communities, collections, forms, storeMenus, liveName] = await besides

  // Username for URL display
  const username = profile?.username || creatorData?.slug || ""

  /*
    Cleaned on the way out, like the sections endpoint beside it. The editor
    renders these settings with `dangerouslySetInnerHTML`, in a session that
    is signed in, so a row written by an import or by hand must not reach it
    as written. See lib/website-builder/sanitize-sections.ts. The pages carry
    no sections here (round 65), so only the settings have anything to clean.
  */
  /* storeOwner: for a team member, the account whose folder the editor's pictures go into (lib/website-builder/team-upload-owner); null for the owner. */
  return NextResponse.json({ install: sanitizeInstallRow(data), username, siteHandle, creatorFacts: facts, communities, collections, forms, storeMenus, liveName, storeOwner: isOwner ? null : ownerUserId })
}

// PATCH /api/website-builder/themes/[installId]
// Update install name only
export async function PATCH(req: Request, { params }: Params) {
  const { installId } = await params
  const { error, status, supabase } = await getCreatorAndInstall(installId)
  if (error) return NextResponse.json({ error }, { status })

  /* Text, trimmed, at most the 80 characters Rename allows. A body that is
     not JSON, or a name that is not text, is a 400 rather than a 500. */
  const body = (await req.json().catch(() => null)) as { name?: unknown } | null
  const name = typeof body?.name === "string" ? body.name.trim() : ""

  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 })
  if (name.length > 80) return NextResponse.json({ error: "Keep the name to 80 characters." }, { status: 400 })

  const { data, error: updateError } = await supabase!
    .from("store_theme_installs")
    .update({ name })
    .eq("id", installId)
    .select()
    .single()

  if (updateError) {
    console.error("[themes/rename] failed", { code: updateError.code })
    return NextResponse.json({ error: "Could not rename this website. Try again." }, { status: 500 })
  }
  return NextResponse.json({ install: data })
}

// DELETE /api/website-builder/themes/[installId]
// Deletes the install. Cannot delete the published/live theme.
export async function DELETE(_req: Request, { params }: Params) {
  const { installId } = await params
  const { error, status, supabase, isOwner } = await getCreatorAndInstall(installId)
  if (error) return NextResponse.json({ error }, { status })
  /* Deleting a website stays the owner's whatever is given (lib/team/website). */
  if (!isOwner) return NextResponse.json({ error: OWNER_KEEPS_SITE }, { status: 403 })

  // Prevent deleting the live theme
  const { data: install } = await supabase!
    .from("store_theme_installs")
    .select("status")
    .eq("id", installId)
    .single()

  if (install?.status === "published") {
    return NextResponse.json(
      { error: "Cannot delete the live theme. Publish another theme first." },
      { status: 400 },
    )
  }

  const { error: deleteError } = await supabase!
    .from("store_theme_installs")
    .delete()
    .eq("id", installId)

  if (deleteError) {
    console.error("[themes/delete] failed", { code: deleteError.code })
    return NextResponse.json({ error: "Could not delete this website. Try again." }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
