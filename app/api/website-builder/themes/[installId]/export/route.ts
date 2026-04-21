// ============================================================
// Theme export — packages an install into a .storelib-export zip
// ------------------------------------------------------------
// The zip contains:
//   manifest.json   — { format: "storelib-theme/v1", install, settings, pages, exported_at }
//   images/<sha>.<ext> — every distinct image referenced from settings
//                        and section blocks, downloaded once
//   manifest.json image_map field maps original_url -> images/<sha>.<ext>
// ============================================================
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import JSZip from "jszip"
import crypto from "crypto"
import {
  CURRENT_THEME_PACKAGE_FORMAT,
  type ThemePackageManifest,
} from "@/lib/website-builder/theme-package-schema"

type Params = { params: Promise<{ installId: string }> }

// Walk an arbitrary JSON value and collect every URL that points to an image.
function collectImageUrls(node: unknown, out: Set<string>) {
  if (!node) return
  if (typeof node === "string") {
    if (/^https?:\/\//i.test(node) && /\.(jpe?g|png|gif|webp|svg|avif)(\?|$)/i.test(node)) {
      out.add(node)
    }
    return
  }
  if (Array.isArray(node)) {
    for (const v of node) collectImageUrls(v, out)
    return
  }
  if (typeof node === "object") {
    for (const v of Object.values(node as Record<string, unknown>)) collectImageUrls(v, out)
  }
}

// Walk an arbitrary JSON value and replace any matching URL with the local
// path from `imageMap` (returns a new structure).
function rewriteImageUrls(node: unknown, imageMap: Record<string, string>): unknown {
  if (typeof node === "string") {
    return imageMap[node] ?? node
  }
  if (Array.isArray(node)) {
    return node.map(v => rewriteImageUrls(v, imageMap))
  }
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      out[k] = rewriteImageUrls(v, imageMap)
    }
    return out
  }
  return node
}

function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "theme"
}

// GET /api/website-builder/themes/[installId]/export
// Streams a .storelib-export zip back to the browser.
export async function GET(_req: Request, { params }: Params) {
  const { installId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: creator } = await supabase
    .from("creators")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle()
  if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 })

  const { data: install, error: installErr } = await supabase
    .from("store_theme_installs")
    .select("id, name, theme_id, status, sort_order, creator_id")
    .eq("id", installId)
    .eq("creator_id", creator.id)
    .maybeSingle()
  if (installErr || !install) return NextResponse.json({ error: "Theme not found" }, { status: 404 })

  const { data: settingsRow } = await supabase
    .from("store_theme_settings")
    .select("settings, draft_settings")
    .eq("install_id", installId)
    .maybeSingle()

  const { data: pages } = await supabase
    .from("store_theme_pages")
    .select("page_key, sections")
    .eq("install_id", installId)

  // Use draft_settings when available so creators can export work in progress
  const settings = settingsRow?.draft_settings ?? settingsRow?.settings ?? {}
  const exportPages = pages ?? []

  // Collect every distinct image URL from settings + section data
  const urls = new Set<string>()
  collectImageUrls(settings, urls)
  collectImageUrls(exportPages, urls)

  const zip = new JSZip()
  const imagesFolder = zip.folder("images")!
  const imageMap: Record<string, string> = {}

  // Download every image and add it to the zip. Failures degrade gracefully —
  // the URL is left unchanged in the manifest so the import side can still
  // reference the original CDN URL.
  await Promise.all(Array.from(urls).map(async url => {
    try {
      const res = await fetch(url)
      if (!res.ok) return
      const buf = Buffer.from(await res.arrayBuffer())
      const ext = (url.split(".").pop() ?? "bin").split("?")[0].toLowerCase()
      const sha = crypto.createHash("sha1").update(buf).digest("hex").slice(0, 16)
      const filename = `${sha}.${ext}`
      imagesFolder.file(filename, buf)
      imageMap[url] = `images/${filename}`
    } catch {
      // ignore — keep the original URL
    }
  }))

  // Rewrite URLs in settings + sections so the import resolves them locally
  const exportSettings = rewriteImageUrls(settings, imageMap)
  const exportSections = rewriteImageUrls(exportPages, imageMap)

  // Build the manifest. Format bumped to v2 (supersets v1) so we
  // can ship the optional `theme_pack` block for schema packs.
  // This install currently uses the built-in default theme, so the
  // theme_pack is omitted — the importer falls back to default.
  const manifest: ThemePackageManifest = {
    format: CURRENT_THEME_PACKAGE_FORMAT,
    exported_at: new Date().toISOString(),
    install: {
      name: install.name,
      theme_id: install.theme_id ?? undefined,
      sort_order: install.sort_order,
    },
    settings: exportSettings as Record<string, unknown>,
    pages: exportSections as { page_key: string; sections: unknown }[],
    image_map: imageMap,
  }

  zip.file("manifest.json", JSON.stringify(manifest, null, 2))

  const blob = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" })
  const filename = `${safeFilename(install.name)}.storelib-export.zip`

  return new NextResponse(blob as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  })
}
