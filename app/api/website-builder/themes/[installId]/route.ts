import { websiteHandleOf } from "@/lib/website-builder/site-address-data"
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { ensurePolicyPages, type PagesTable } from "@/lib/website-builder/ensure-policy-pages"
import { sanitizeInstallRow, sectionsOfInstallRow } from "@/lib/website-builder/sanitize-sections"
import { customSchemaLookup } from "@/lib/website-builder/custom-schemas"
import { creatorFacts } from "@/lib/website-builder/storefront-data-server"

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
 * The creator's own collections for a collection picker, a collection list
 * and the collections page: every one as a choice, saying whether a visitor
 * sees it, and the published ones as a section reads them, so the canvas
 * draws them as the live site will. Read by this signed in creator's id
 * alone. Nothing while physical commerce, where collections live, is off.
 */
async function creatorCollectionsForBuilder(creatorId: string) {
  try {
    const { isPhysicalCommerceEnabled } = await import("@/lib/platform/physical-commerce")
    if (!(await isPhysicalCommerceEnabled())) return null
    const { siteCollections } = await import("@/lib/website-builder/storefront-collections-server")
    const { createAdminClient } = await import("@/lib/supabase/admin")
    const { collections, choices } = await siteCollections(createAdminClient(), creatorId, { published: false })
    return { choices, cards: collections }
  } catch {
    return null
  }
}

// ── Auth helper ──────────────────────────────────────────────
async function getCreatorAndInstall(installId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Unauthorized", status: 401, supabase, creator: null, install: null }

  const { data: creator } = await supabase
    .from("creators")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle()

  if (!creator) return { error: "Creator not found", status: 404, supabase, creator: null, install: null }

  const { data: install } = await supabase
    .from("store_theme_installs")
    .select("id, creator_id")
    .eq("id", installId)
    .eq("creator_id", creator.id)
    .maybeSingle()

  if (!install) return { error: "Theme not found", status: 404, supabase, creator, install: null }

  return { error: null, status: 200, supabase, creator, install }
}

// GET /api/website-builder/themes/[installId]
// Returns full install data with settings, pages, and username
export async function GET(_req: Request, { params }: Params) {
  const { installId } = await params
  const { error, status, supabase, install, creator } = await getCreatorAndInstall(installId)
  if (error) return NextResponse.json({ error }, { status })

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
  const ensured = await ensurePolicyPages(
    supabase! as unknown as PagesTable,
    installId,
    String((install as { name?: unknown } | null)?.name ?? "").trim(),
  )
  if (ensured.error) console.error(`[policy-pages] ${installId}: ${ensured.error}`)

  const { data, error: fetchError } = await supabase!
    .from("store_theme_installs")
    .select(`
      *,
      theme:themes(*),
      settings:store_theme_settings(*),
      pages:store_theme_pages(*)
    `)
    .eq("id", installId)
    .single()

  /* The database's own words go to the log, never to the browser. */
  if (fetchError) {
    console.error("[themes/get] read failed", { code: fetchError.code })
    return NextResponse.json({ error: "Could not load this website. Try again." }, { status: 500 })
  }

  // Get username for URL display
  const { data: { user } } = await supabase!.auth.getUser()
  const { data: profile } = await supabase!
    .from("profiles")
    .select("username")
    .eq("id", user!.id)
    .maybeSingle()

  const { data: creatorData } = await supabase!
    .from("creators")
    .select("slug")
    .eq("id", creator!.id)
    .maybeSingle()

  const username = profile?.username || creatorData?.slug || ""

  /*
    Cleaned on the way out, like the sections endpoint beside it. The editor
    renders these settings with `dangerouslySetInnerHTML`, in a session that
    is signed in, so a row written by an import or by hand must not reach it
    as written. See lib/website-builder/sanitize-sections.ts.
  */
  /* The name the website is at, when its creator gave it one of its own. */
  const siteHandle = await websiteHandleOf(creator!.id)
  /*
    A section the creator wrote is cleaned by the schema its own file
    declares (lib/website-builder/custom-schemas.ts), and the creator's
    public profile comes along for the canvas to fill `{{ creator.name }}`
    the way the live site will: the same four public facts, nothing else.
  */
  const [lookup, facts, communities, collections] = await Promise.all([
    customSchemaLookup(supabase! as never, installId, sectionsOfInstallRow(data), { draft: true }),
    creatorFacts(supabase! as never, creator!.id),
    creatorCommunitiesForBuilder(creator!.id),
    creatorCollectionsForBuilder(creator!.id),
  ])
  return NextResponse.json({ install: sanitizeInstallRow(data, lookup), username, siteHandle, creatorFacts: facts, communities, collections })
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
  const { error, status, supabase } = await getCreatorAndInstall(installId)
  if (error) return NextResponse.json({ error }, { status })

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
