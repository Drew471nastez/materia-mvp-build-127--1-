import { NextResponse } from "next/server"
import { revalidatePublishedSite } from "@/lib/website-builder/published-site"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import type { SectionInstance } from "@/lib/website-builder/types"

type Params = { params: Promise<{ installId: string }> }

// Reuse-friendly local section schema (same shape as sections/route.ts)
const BlockSchema = z.object({
  id: z.string().min(1).max(128),
  type: z.string().min(1).max(64),
  settings: z.record(z.unknown()),
})
const SectionSchema = z.object({
  id: z.string().min(1).max(128),
  type: z.string().min(1).max(64),
  name: z.string().max(256),
  settings: z.record(z.unknown()),
  blocks: z.array(BlockSchema).max(500).optional(),
  hidden: z.boolean().optional(),
})
const SyncBodySchema = z.object({
  header: SectionSchema.nullable(),
  footer: SectionSchema.nullable(),
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

  const { data: creator } = await supabase
    .from("creators").select("id").eq("user_id", user.id).maybeSingle()
  if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 })

  const { data: install } = await supabase
    .from("store_theme_installs").select("id")
    .eq("id", installId).eq("creator_id", creator.id).maybeSingle()
  if (!install) return NextResponse.json({ error: "Theme not found" }, { status: 404 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const parsed = SyncBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", issues: parsed.error.issues },
      { status: 400 },
    )
  }
  const { header, footer, current_page, mode } = parsed.data as {
    header: SectionInstance | null
    footer: SectionInstance | null
    current_page: string
    mode: "draft" | "publish"
  }

  // Get all pages except the current one (current page already has the updated header/footer)
  const { data: pages } = await supabase
    .from("store_theme_pages")
    .select("id, page_key, sections, draft_sections")
    .eq("install_id", installId)
    .neq("page_key", current_page)

  if (!pages || pages.length === 0) {
    return NextResponse.json({ ok: true, synced: 0 })
  }

  // Run page updates in parallel — they're independent writes.
  const updates = pages.map(page => {
    const existing: SectionInstance[] = (page.draft_sections ?? page.sections ?? []) as SectionInstance[]

    // Remove old header/footer and replace with shared ones
    const bodySections = existing.filter(s => s.type !== "header" && s.type !== "footer")
    const merged = [
      ...(header ? [header] : existing.filter(s => s.type === "header")),
      ...bodySections,
      ...(footer ? [footer] : existing.filter(s => s.type === "footer")),
    ]

    const update = mode === "publish"
      ? { sections: merged, draft_sections: null }
      : { draft_sections: merged }

    return supabase
      .from("store_theme_pages")
      .update(update)
      .eq("id", page.id)
  })

  const results = await Promise.all(updates)
  const synced = results.filter(r => !r.error).length

  // A shared header pushed to every page in publish mode is a change to the
  // live site on every one of them.
  if (mode === "publish") await revalidatePublishedSite((creator as { id: string }).id)

  return NextResponse.json({ ok: true, synced })
}
