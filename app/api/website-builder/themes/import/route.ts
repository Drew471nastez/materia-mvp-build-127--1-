// ============================================================
// Theme import — accepts a .storelib-export zip and creates a
// new install (unpublished) for the current creator.
// ------------------------------------------------------------
// • parses manifest.json
// • re-uploads every bundled image to the creator's storage bucket
// • rewrites every references in the settings + pages to point at
//   the newly uploaded URLs
// • creates a fresh store_theme_installs row + settings + pages
// ============================================================
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import JSZip from "jszip"

const BUCKET = "store-builder-images"

function rewriteUrls(node: unknown, urlMap: Record<string, string>): unknown {
  if (typeof node === "string") return urlMap[node] ?? node
  if (Array.isArray(node)) return node.map(v => rewriteUrls(v, urlMap))
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) out[k] = rewriteUrls(v, urlMap)
    return out
  }
  return node
}

// POST /api/website-builder/themes/import
// multipart/form-data with `file` field containing the zip
export async function POST(req: Request) {
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

  // Parse multipart form
  const form = await req.formData()
  const file = form.get("file")
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 })
  }
  if (file.size > 50 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (max 50 MB)" }, { status: 413 })
  }

  // Load the zip
  const buf = Buffer.from(await file.arrayBuffer())
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(buf)
  } catch {
    return NextResponse.json({ error: "Invalid zip file" }, { status: 400 })
  }

  const manifestFile = zip.file("manifest.json")
  if (!manifestFile) {
    return NextResponse.json({ error: "Missing manifest.json — not a storelib export" }, { status: 400 })
  }

  let manifest: {
    format?: string
    install?: { name?: string; theme_id?: string; sort_order?: number }
    settings?: Record<string, unknown>
    pages?: { page_key: string; sections: unknown }[]
    image_map?: Record<string, string>
  }
  try {
    manifest = JSON.parse(await manifestFile.async("string"))
  } catch {
    return NextResponse.json({ error: "Could not parse manifest.json" }, { status: 400 })
  }

  if (manifest.format !== "storelib-theme/v1") {
    return NextResponse.json({ error: `Unsupported format: ${manifest.format}` }, { status: 400 })
  }

  // Upload every bundled image to the creator's storage and build a
  // remap from "images/<sha>.<ext>" -> the new public URL.
  const localToRemote: Record<string, string> = {}
  const imagesFolder = zip.folder("images")
  if (imagesFolder) {
    const entries: { name: string; file: JSZip.JSZipObject }[] = []
    imagesFolder.forEach((relPath, f) => {
      if (!f.dir) entries.push({ name: relPath, file: f })
    })
    await Promise.all(entries.map(async entry => {
      try {
        const data = await entry.file.async("nodebuffer")
        const ext = entry.name.split(".").pop()?.toLowerCase() ?? "bin"
        const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`
        const path = `${user.id}/imported/${safeName}`
        const { error: upErr } = await admin.storage.from(BUCKET).upload(path, data, {
          contentType: extToMime(ext),
          upsert: true,
          cacheControl: "31536000",
        })
        if (upErr) return
        const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path)
        localToRemote[`images/${entry.name}`] = pub.publicUrl
      } catch {
        // skip — manifest will keep the original local path which won't render
      }
    }))
  }

  // Rewrite manifest URLs back to the freshly uploaded URLs
  const importedSettings = rewriteUrls(manifest.settings ?? {}, localToRemote) as Record<string, unknown>
  const importedPages = rewriteUrls(manifest.pages ?? [], localToRemote) as { page_key: string; sections: unknown }[]

  // Create a new install (unpublished, sorted to the end)
  const { data: maxRow } = await admin
    .from("store_theme_installs")
    .select("sort_order")
    .eq("creator_id", creator.id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextOrder = ((maxRow?.sort_order ?? -1) as number) + 1

  const installName = (manifest.install?.name ?? "Imported Theme").slice(0, 80)

  const { data: newInstall, error: insertErr } = await admin
    .from("store_theme_installs")
    .insert({
      creator_id: creator.id,
      theme_id: manifest.install?.theme_id ?? null,
      name: installName,
      status: "unpublished",
      sort_order: nextOrder,
      is_custom: true,
    })
    .select("id")
    .single()
  if (insertErr || !newInstall) {
    return NextResponse.json({ error: insertErr?.message ?? "Failed to create install" }, { status: 500 })
  }

  // Insert settings (as draft so the user can review before publishing)
  await admin
    .from("store_theme_settings")
    .insert({
      install_id: newInstall.id,
      settings: importedSettings,
      draft_settings: importedSettings,
    })

  // Insert pages
  if (importedPages.length > 0) {
    await admin
      .from("store_theme_pages")
      .insert(importedPages.map(p => ({
        install_id: newInstall.id,
        page_key: p.page_key,
        sections: p.sections,
      })))
  }

  return NextResponse.json({ ok: true, install_id: newInstall.id, name: installName })
}

function extToMime(ext: string): string {
  switch (ext) {
    case "jpg":
    case "jpeg": return "image/jpeg"
    case "png":  return "image/png"
    case "gif":  return "image/gif"
    case "webp": return "image/webp"
    case "svg":  return "image/svg+xml"
    case "avif": return "image/avif"
    default:     return "application/octet-stream"
  }
}
