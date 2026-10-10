import { BlockInstanceSchema, blockTreeProblem } from "@/lib/website-builder/block-tree"
import { readTwice, UNREACHABLE } from "@/lib/website-builder/owned-install"
import { NextResponse } from "next/server"
import { revalidatePublishedSite } from "@/lib/website-builder/published-site"
import { readOwnSectionFields, sanitizeSections } from "@/lib/website-builder/sanitize-sections"
import { LIMITS } from "@/lib/storelib-theme/types"
import { LIMITS as RATE_LIMITS, rateLimit } from "@/lib/api/rate-limit"
import { BODY_LIMITS, readEditorBody } from "@/lib/website-builder/request-body"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import type { SectionInstance } from "@/lib/website-builder/types"
import { inGroup, splitGroups } from "@/lib/storelib-theme/section-groups"

type Params = { params: Promise<{ installId: string }> }

// Reuse-friendly local section schema (same shape as sections/route.ts)
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
  /* Which section group it sits in: lib/storelib-theme/section-groups.ts. */
  group: z.enum(["header", "footer", "overlay"]).optional(),
  /* An imported theme's Overlay group section: the theme's group file it is drawn in (overlay-group). */
  slot: z.string().regex(/^[a-z0-9_-]{1,64}$/i).optional(),
})
/**
 * `header` and `footer` are the two sections an older editor sends. A
 * current one sends the whole groups: `header_group` is every section of
 * the Header group (an announcement bar, the header, a header hidden because
 * another replaced it), `[]` when the creator deleted the header, and null
 * or absent to leave every page's own as it is.
 */
const GroupSchema = z.array(SectionSchema).max(25).nullable().optional()
const SyncBodySchema = z.object({
  header: SectionSchema.nullable(),
  footer: SectionSchema.nullable(),
  header_group: GroupSchema,
  footer_group: GroupSchema,
  /* What floats over every page: a popup, a bottom bar (lib/storelib-theme/section-groups.ts). */
  overlay_group: GroupSchema,
  current_page: z.string().min(1).max(64),
  mode: z.enum(["draft", "publish"]),
})

// PUT /api/website-builder/themes/[installId]/sections/sync-global
// Syncs header/footer sections to ALL pages for this install
export async function PUT(req: Request, { params }: Params) {
  const { installId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: creator, error: creatorReadErr } = await readTwice(() => supabase
    .from("creators").select("id").eq("user_id", user.id).maybeSingle())
  if (creatorReadErr) return NextResponse.json({ error: UNREACHABLE }, { status: 503 })
  if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 })

  const { data: install, error: installReadErr } = await readTwice(() => supabase
    .from("store_theme_installs").select("id")
    .eq("id", installId).eq("creator_id", creator.id).maybeSingle())
  if (installReadErr) return NextResponse.json({ error: UNREACHABLE }, { status: 503 })
  if (!install) return NextResponse.json({ error: "Theme not found" }, { status: 404 })

  /* Part of every autosave, so the same allowance as the other two saves: RATE_LIMITS.siteSave. */
  const limited = await rateLimit({
    bucket: "site-header-sync",
    subjects: [`user:${user.id}`],
    windows: RATE_LIMITS.siteSave,
    message: "Too many saves in a short time. Wait a moment, then keep editing.",
  })
  if (limited) return limited

  /* Read up to a cap rather than whatever arrives: lib/website-builder/request-body.ts. */
  const read = await readEditorBody(req, BODY_LIMITS.syncGlobal)
  if (read.ok === false) return read.response
  if (read.invalid) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  const body = read.json
  const parsed = SyncBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", issues: parsed.error.issues },
      { status: 400 },
    )
  }
  const { header: sentHeader, footer: sentFooter, header_group: sentHeaderGroup, footer_group: sentFooterGroup, overlay_group: sentOverlayGroup, current_page, mode } = parsed.data as {
    header: SectionInstance | null
    footer: SectionInstance | null
    header_group?: SectionInstance[] | null
    footer_group?: SectionInstance[] | null
    overlay_group?: SectionInstance[] | null
    current_page: string
    mode: "draft" | "publish"
  }

  /**
   * The same door as the sections route, for the two sections this one copies
   * onto every other page: the same block limit, and the same cleaning, by the
   * install's own file where the header or footer is a section it wrote.
   * Without it, a header sent here reached every page as it was sent.
   *
   * The sections-per-page limit is not re-checked: a sync replaces a page's
   * header and footer, so a page holds at most the two it may have lacked.
   */
  const sent = [sentHeader, sentFooter, ...(sentHeaderGroup ?? []), ...(sentFooterGroup ?? []), ...(sentOverlayGroup ?? [])].filter((s): s is SectionInstance => !!s)
  const overfull = sent.map((s) => blockTreeProblem(s)).find((problem) => problem !== null)
  if (overfull) return NextResponse.json({ error: overfull }, { status: 413 })
  const own = await readOwnSectionFields(supabase, installId, sent.map((s) => s.type))
  /**
   * What replaces each page's Header and Footer groups, or null to leave a
   * page's own. Every section is labelled for the group it is copied into,
   * whatever the request said, so a page section cannot be sent in as chrome.
   */
  const headerGroup: SectionInstance[] | null = Array.isArray(sentHeaderGroup)
    ? sanitizeSections(sentHeaderGroup, own).map((s) => inGroup(s, "header"))
    : sentHeader ? sanitizeSections([sentHeader], own) : null
  const footerGroup: SectionInstance[] | null = Array.isArray(sentFooterGroup)
    ? sanitizeSections(sentFooterGroup, own).map((s) => inGroup(s, "footer"))
    : sentFooter ? sanitizeSections([sentFooter], own) : null
  const overlayGroup: SectionInstance[] | null = Array.isArray(sentOverlayGroup)
    ? sanitizeSections(sentOverlayGroup, own).map((s) => inGroup(s, "overlay"))
    : null

  // Get all pages except the current one (current page already has the updated header/footer)
  const { data: pages, error: readErr } = await supabase
    .from("store_theme_pages")
    .select("id, page_key, sections, draft_sections")
    .eq("install_id", installId)
    .neq("page_key", current_page)

  /* A read that failed is not "no other pages": say so, rather than report a sync that did not happen. */
  if (readErr) return NextResponse.json({ error: "Could not reach the other pages. Nothing was changed." }, { status: 500 })

  if (!pages || pages.length === 0) {
    return NextResponse.json({ ok: true, synced: 0 })
  }

  /**
   * In publish mode every page goes live whole, body and all, so the whole
   * page is cleaned on the way, as the publish route cleans what it promotes.
   */
  const pageOwn = mode === "publish"
    ? await readOwnSectionFields(supabase, installId, [
        ...sent.map((s) => s.type),
        ...pages.flatMap((p) => ((p.draft_sections ?? p.sections ?? []) as SectionInstance[]).map((s) => s.type)),
      ])
    : own

  // Run page updates in parallel — they're independent writes.
  const updates = pages.map(page => {
    const existing: SectionInstance[] = (page.draft_sections ?? page.sections ?? []) as SectionInstance[]

    // Replace each page's Header and Footer groups with the shared ones; its own sections stay.
    const g = splitGroups(existing)
    const merged = [...(headerGroup ?? g.header), ...g.template, ...(footerGroup ?? g.footer), ...(overlayGroup ?? g.overlay)]

    const update = mode === "publish"
      ? { sections: sanitizeSections(merged, pageOwn), draft_sections: null }
      : { draft_sections: merged }

    return supabase
      .from("store_theme_pages")
      .update(update)
      .eq("id", page.id)
  })

  const results = await Promise.all(updates)
  const synced = results.filter(r => !r.error).length
  const failed = results.length - synced

  // A shared header pushed to every page in publish mode is a change to the
  // live site on every one of them, and so is part of one when some failed.
  if (mode === "publish" && synced > 0) await revalidatePublishedSite((creator as { id: string }).id)

  /* A write that failed is not a sync. The next save sends the header and footer again. */
  if (failed > 0) {
    console.error(`[sync-global] ${failed} of ${results.length} pages were not updated:`, results.find((r) => r.error)?.error?.message)
    return NextResponse.json(
      { error: "The header and footer did not reach every page. Save again to retry.", synced, failed },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true, synced })
}
