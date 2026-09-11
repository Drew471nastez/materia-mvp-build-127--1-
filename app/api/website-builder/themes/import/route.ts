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
import {
  parseThemePackageManifest,
  MAX_IMAGE_BYTES_IN_ZIP,
  ALLOWED_IMAGE_EXTENSIONS,
  type ThemePackageManifest,
} from "@/lib/website-builder/theme-package-schema"
import { readPackage, sectionsFromTemplate } from "@/lib/storelib-theme"
import { SECTION_SCHEMAS } from "@/lib/website-builder/section-schemas"

import { DEFAULT_THEME_SOURCES } from "../../../../../themes/default/sources.generated"

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

  /**
   * ===========================================================================
   *  A .storelib-theme PACKAGE
   * ===========================================================================
   * Read as a whole or not at all (docs/theme/11): the paths, theme.json,
   * every hash in the manifest, every section compiled, every template
   * checked against the sections the theme has. A package that fails is
   * refused with the list, and nothing is written.
   *
   * The builder's earlier `manifest.json` + `images/` exports fall through
   * to the code below, which is unchanged.
   */
  if (zip.file("theme.json")) {
    const read = await readPackage(new Uint8Array(buf), { knownTypes: Object.keys(SECTION_SCHEMAS) })
    if (read.ok === false) {
      return NextResponse.json(
        { error: read.errors[0]?.message ?? "This package is not valid", errors: read.errors },
        { status: 400 },
      )
    }
    const pkg = read.value

    /** Assets, stored under this account, and every reference to them rewritten. */
    const refToUrl: Record<string, string> = {}
    await Promise.all(Object.entries(pkg.assets).map(async ([hash, asset]) => {
      try {
        const ext = (asset.filename.split(".").pop() ?? "").toLowerCase()
        if (!(ALLOWED_IMAGE_EXTENSIONS as readonly string[]).includes(ext)) return
        if (asset.bytes.byteLength > MAX_IMAGE_BYTES_IN_ZIP) return
        const path = `${user.id}/imported/${hash.slice(0, 32)}.${ext}`
        const { error: upErr } = await admin.storage.from(BUCKET).upload(path, Buffer.from(asset.bytes), {
          contentType: extToMime(ext),
          upsert: true,
          cacheControl: "31536000",
        })
        if (upErr) return
        refToUrl[`asset://${hash}`] = admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
      } catch {
        /* an asset that will not store leaves its reference alone */
      }
    }))

    const settings = rewriteUrls(JSON.parse(pkg.files["config/settings.json"] ?? "{}"), refToUrl) as Record<string, unknown>
    const pages: { page_key: string; sections: unknown }[] = []
    for (const [path, text] of Object.entries(pkg.files)) {
      const m = path.match(/^templates\/([A-Za-z0-9_.\-]+)\.json$/)
      if (!m) continue
      pages.push({ page_key: m[1], sections: rewriteUrls(sectionsFromTemplate(JSON.parse(text)), refToUrl) })
    }

    const { data: maxRow } = await admin
      .from("store_theme_installs")
      .select("sort_order")
      .eq("creator_id", creator.id)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle()
    const installName = String(pkg.theme.name ?? "Imported theme").slice(0, 80)
    const { data: created, error: createErr } = await admin
      .from("store_theme_installs")
      .insert({
        creator_id: creator.id,
        theme_id: typeof pkg.theme.source_theme_id === "string" ? pkg.theme.source_theme_id : null,
        name: installName,
        status: "unpublished",
        sort_order: ((maxRow?.sort_order ?? -1) as number) + 1,
        is_custom: true,
      })
      .select("id")
      .single()
    if (createErr || !created) {
      return NextResponse.json({ error: createErr?.message ?? "Failed to create install" }, { status: 500 })
    }

    await admin.from("store_theme_settings").insert({ install_id: created.id, settings, draft_settings: settings })
    if (pages.length > 0) {
      await admin.from("store_theme_pages").insert(pages.map(p => ({ install_id: created.id, page_key: p.page_key, sections: p.sections })))
    }
    /**
     * The theme's own source files. Only those that differ from what this
     * build ships are stored: a package that carries the same hero as the
     * bundle writes no row for it, so the install follows the theme's
     * updates rather than freezing a copy of today's file.
     */
    const rows = Object.entries(pkg.files)
      .filter(([path]) => path.endsWith(".storelib"))
      .filter(([path, content]) => DEFAULT_THEME_SOURCES[path] !== content)
      .map(([path, content]) => ({ install_id: created.id, path, content }))
    if (rows.length > 0) await admin.from("store_theme_custom_files").insert(rows)

    return NextResponse.json({ ok: true, install_id: created.id, name: installName, migrated: pkg.legacy })
  }

  const manifestFile = zip.file("manifest.json")
  if (!manifestFile) {
    return NextResponse.json({ error: "Missing manifest.json — not a storelib export" }, { status: 400 })
  }

  // Validate manifest with Zod. This covers: JSON parse errors,
  // unknown/missing `format`, malformed `install`, malformed `pages`,
  // and the optional Stage-3 `theme_pack` block. Any failure returns
  // a helpful pointer (path + reason) so creators editing zips by
  // hand get a clear error instead of a silent broken install.
  const manifestRaw = await manifestFile.async("string")
  const parsed = parseThemePackageManifest(manifestRaw)
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }
  const manifest: ThemePackageManifest = parsed.manifest

  // Upload every bundled image to the creator's storage and build a
  // remap from "images/<sha>.<ext>" -> the new public URL.
  // Safety belts:
  //   • skip files whose extension isn't on the image allow-list
  //     (nothing in the zip should execute, but belt-and-suspenders)
  //   • skip files larger than MAX_IMAGE_BYTES_IN_ZIP so one giant
  //     image can't dominate the 50 MB zip cap
  const localToRemote: Record<string, string> = {}
  const imagesFolder = zip.folder("images")
  if (imagesFolder) {
    const entries: { name: string; file: JSZip.JSZipObject }[] = []
    imagesFolder.forEach((relPath, f) => {
      if (!f.dir) entries.push({ name: relPath, file: f })
    })
    await Promise.all(entries.map(async entry => {
      try {
        const ext = (entry.name.split(".").pop() ?? "").toLowerCase()
        if (!(ALLOWED_IMAGE_EXTENSIONS as readonly string[]).includes(ext)) return
        const data = await entry.file.async("nodebuffer")
        if (data.byteLength > MAX_IMAGE_BYTES_IN_ZIP) return
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

  // Stage 3 forward-compat: if the manifest includes a `theme_pack`
  // block (schema-only overrides shipped by the creator), stash it
  // under a reserved key inside settings so downstream editor/
  // renderer code can pick it up without needing a schema migration.
  //
  // Right now the renderer still resolves schemas from the built-in
  // default theme (see lib/website-builder/section-schemas.ts).
  // When that becomes pack-aware the reserved key `_theme_pack` is
  // already populated on imported installs, so no second migration
  // is needed on the data. This is deliberately a no-op for v1 zips.
  if (manifest.theme_pack) {
    importedSettings._theme_pack = manifest.theme_pack
  }

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
