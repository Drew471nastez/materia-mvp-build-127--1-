import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getDefaultFileContent } from "@/lib/website-builder/theme-file-tree"

type Params = { params: Promise<{ installId: string }> }

async function getCreatorInstall(installId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Unauthorized", status: 401, supabase: null, creator: null }

  const { data: creator } = await supabase
    .from("creators").select("id").eq("user_id", user.id).maybeSingle()
  if (!creator) return { error: "Creator not found", status: 404, supabase: null, creator: null }

  const { data: install } = await supabase
    .from("store_theme_installs").select("id, theme_id, name")
    .eq("id", installId).eq("creator_id", creator.id).maybeSingle()
  if (!install) return { error: "Theme not found", status: 404, supabase: null, creator: null }

  return { error: null, status: 200, supabase, creator, install }
}

// GET /api/website-builder/themes/[installId]/files?path=templates/home.json
// Returns file content — custom override if it exists, else default
export async function GET(req: Request, { params }: Params) {
  const { installId } = await params
  const { error, status, supabase, install } = await getCreatorInstall(installId)
  if (error || !supabase || !install) return NextResponse.json({ error }, { status })

  const { searchParams } = new URL(req.url)
  const path = searchParams.get("path")

  // List all custom files if no path
  if (!path) {
    const { data, error: listErr } = await supabase
      .from("store_theme_custom_files")
      .select("path, updated_at")
      .eq("install_id", installId)
    if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 })
    return NextResponse.json({ customized_paths: data?.map(f => f.path) ?? [] })
  }

  // Try custom file first
  const { data: customFile } = await supabase
    .from("store_theme_custom_files")
    .select("content, updated_at")
    .eq("install_id", installId)
    .eq("path", path)
    .maybeSingle()

  if (customFile) {
    return NextResponse.json({ path, content: customFile.content, is_custom: true })
  }

  // Fallback to default content
  const content = getDefaultFileContent(path, (install as any).name)
  return NextResponse.json({ path, content, is_custom: false })
}

// PUT /api/website-builder/themes/[installId]/files
// body: { path: string, content: string }
export async function PUT(req: Request, { params }: Params) {
  const { installId } = await params
  const { error, status, supabase } = await getCreatorInstall(installId)
  if (error || !supabase) return NextResponse.json({ error }, { status })

  const body = await req.json()
  const { path, content } = body as { path?: string; content?: string }

  if (!path?.trim()) return NextResponse.json({ error: "path required" }, { status: 400 })
  if (content === undefined) return NextResponse.json({ error: "content required" }, { status: 400 })

  // Basic path safety — no traversal
  if (path.includes("..") || path.startsWith("/")) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 })
  }

  // Upsert
  const { data, error: upsertErr } = await supabase
    .from("store_theme_custom_files")
    .upsert({ install_id: installId, path, content }, { onConflict: "install_id,path" })
    .select()
    .single()

  if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 })
  return NextResponse.json({ file: data })
}

// DELETE /api/website-builder/themes/[installId]/files?path=...
// Reverts a file to default (removes custom override)
export async function DELETE(req: Request, { params }: Params) {
  const { installId } = await params
  const { error, status, supabase } = await getCreatorInstall(installId)
  if (error || !supabase) return NextResponse.json({ error }, { status })

  const { searchParams } = new URL(req.url)
  const path = searchParams.get("path")
  if (!path) return NextResponse.json({ error: "path required" }, { status: 400 })

  await supabase
    .from("store_theme_custom_files")
    .delete()
    .eq("install_id", installId)
    .eq("path", path)

  return NextResponse.json({ ok: true })
}
