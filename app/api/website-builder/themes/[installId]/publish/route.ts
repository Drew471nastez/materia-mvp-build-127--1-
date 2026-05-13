import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

type Params = { params: Promise<{ installId: string }> }

// POST /api/website-builder/themes/[installId]/publish
// body: { action: "publish" | "unpublish" | "save_draft" }
export async function POST(req: Request, { params }: Params) {
  const { installId } = await params
  const supabase = await createClient()
  const admin = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: creator } = await supabase
    .from("creators")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle()

  if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 })

  const { data: install } = await supabase
    .from("store_theme_installs")
    .select("id, creator_id, status")
    .eq("id", installId)
    .eq("creator_id", creator.id)
    .maybeSingle()

  if (!install) return NextResponse.json({ error: "Theme not found" }, { status: 404 })

  const body = await req.json()
  const action = body?.action as "publish" | "unpublish" | "save_draft"

  if (action === "publish") {
    // Use admin to bypass the unique-index constraint atomically:
    // 1. Unpublish any currently published theme
    // 2. Publish this one
    // 3. Promote draft_sections → sections for all pages
    // 4. Promote draft_settings → settings

    await admin
      .from("store_theme_installs")
      .update({ status: "unpublished" })
      .eq("creator_id", creator.id)
      .eq("status", "published")
      .neq("id", installId)

    const { error } = await admin
      .from("store_theme_installs")
      .update({ status: "published" })
      .eq("id", installId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Promote draft_settings if present
    const { data: settingsRow } = await admin
      .from("store_theme_settings")
      .select("settings, draft_settings")
      .eq("install_id", installId)
      .maybeSingle()

    if (settingsRow?.draft_settings) {
      await admin
        .from("store_theme_settings")
        .update({ settings: settingsRow.draft_settings, draft_settings: null })
        .eq("install_id", installId)
    }

    // Promote draft_sections for all pages
    const { data: pagesRows } = await admin
      .from("store_theme_pages")
      .select("id, sections, draft_sections")
      .eq("install_id", installId)

    if (pagesRows) {
      for (const page of pagesRows) {
        if (page.draft_sections) {
          await admin
            .from("store_theme_pages")
            .update({ sections: page.draft_sections, draft_sections: null })
            .eq("id", page.id)
        }
      }
    }

    // Audit log
    const { data: settings } = await admin
      .from("store_theme_settings")
      .select("settings")
      .eq("install_id", installId)
      .maybeSingle()

    await admin.from("theme_publish_history").insert({
      install_id: installId,
      creator_id: creator.id,
      action: "published",
      snapshot: settings?.settings ?? {},
    })

    return NextResponse.json({ ok: true, status: "published" })
  }

  if (action === "unpublish") {
    if (install.status !== "published") {
      return NextResponse.json({ error: "Theme is not currently published" }, { status: 400 })
    }

    await admin
      .from("store_theme_installs")
      .update({ status: "unpublished" })
      .eq("id", installId)

    await admin.from("theme_publish_history").insert({
      install_id: installId,
      creator_id: creator.id,
      action: "unpublished",
    })

    return NextResponse.json({ ok: true, status: "unpublished" })
  }

  if (action === "save_draft") {
    await admin
      .from("store_theme_installs")
      .update({ status: "draft" })
      .eq("id", installId)
      .eq("status", "unpublished") // don't downgrade published

    return NextResponse.json({ ok: true, status: "draft" })
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 })
}
