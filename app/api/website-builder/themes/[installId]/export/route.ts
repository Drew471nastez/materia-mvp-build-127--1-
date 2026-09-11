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
import { DEFAULT_THEME_SOURCES } from "../../../../../../themes/default/sources.generated"
import crypto from "crypto"
import {
  CURRENT_THEME_PACKAGE_FORMAT,
  type ThemePackageManifest,
} from "@/lib/website-builder/theme-package-schema"
import { buildPackage, sha256, templateFromSections, type PackageAsset } from "@/lib/storelib-theme"
import { THEME_FORMAT, THEME_FORMAT_VERSION } from "@/lib/storelib-theme/types"

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

const extToMime = (ext: string): string => ({
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
  webp: "image/webp", svg: "image/svg+xml", avif: "image/avif",
  mp4: "video/mp4", webm: "video/webm",
}[ext] ?? "application/octet-stream")

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

  /**
   * ===========================================================================
   *  THE THEME, AS ONE FILE
   * ===========================================================================
   * A `.storelib-theme` package: the folder in docs/theme/01 with a manifest
   * that hashes every file and every asset (docs/theme/11). What is in it is
   * the theme and only the theme — no install id, no publish state, no
   * account data — so it imports into any account.
   *
   * Every image this theme points at is downloaded, stored under the hash of
   * its own bytes, and every reference to it rewritten to `asset://<hash>`.
   * A URL that cannot be fetched is left as it was rather than dropped: an
   * export that silently loses a picture is worse than one that keeps a link.
   *
   * `?legacy=1` still writes the older `manifest.json` + `images/` zip, for
   * anything that reads that format.
   */
  const legacyImages: Record<string, Buffer> = {}
  const urls = new Set<string>()
  collectImageUrls(settings, urls)
  collectImageUrls(exportPages, urls)

  const legacy = new URL(_req.url).searchParams.get("legacy") === "1"

  const assets: Record<string, PackageAsset> = {}
  const urlToRef: Record<string, string> = {}
  const imageMap: Record<string, string> = {}
  await Promise.all(Array.from(urls).map(async url => {
    try {
      const res = await fetch(url)
      if (!res.ok) return
      const buf = Buffer.from(await res.arrayBuffer())
      const ext = (url.split(".").pop() ?? "bin").split("?")[0].toLowerCase()
      if (legacy) {
        const sha = crypto.createHash("sha1").update(buf).digest("hex").slice(0, 16)
        imageMap[url] = `images/${sha}.${ext}`
        legacyImages[`${sha}.${ext}`] = buf
        return
      }
      const bytes = new Uint8Array(buf)
      const hash = sha256(bytes)
      assets[hash] = {
        bytes,
        filename: (url.split("/").pop() ?? `image.${ext}`).split("?")[0].slice(0, 120),
        mime_type: extToMime(ext),
      }
      urlToRef[url] = `asset://${hash}`
    } catch {
      // ignore — keep the original URL
    }
  }))

  if (legacy) {
    const zip = new JSZip()
    const imagesFolder = zip.folder("images")!
    for (const [name, buf] of Object.entries(legacyImages)) imagesFolder.file(name, buf)
    const manifest: ThemePackageManifest = {
      format: CURRENT_THEME_PACKAGE_FORMAT,
      exported_at: new Date().toISOString(),
      install: { name: install.name, theme_id: install.theme_id, sort_order: install.sort_order },
      settings: rewriteImageUrls(settings, imageMap) as Record<string, unknown>,
      pages: rewriteImageUrls(exportPages, imageMap) as { page_key: string; sections: unknown }[],
      image_map: imageMap,
    }
    zip.file("manifest.json", JSON.stringify(manifest, null, 2))
    const legacyBlob = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" })
    return new NextResponse(legacyBlob as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${safeFilename(install.name)}.storelib-export.zip"`,
        "Cache-Control": "no-store",
      },
    })
  }

  const files: Record<string, string> = {}
  files["config/settings.json"] = JSON.stringify(rewriteImageUrls(settings, urlToRef), null, 2) + "\n"
  for (const page of exportPages) {
    if (!/^[A-Za-z0-9_.\-]+$/.test(page.page_key)) continue
    const list = rewriteImageUrls(page.sections ?? [], urlToRef) as Parameters<typeof templateFromSections>[0]
    files[`templates/${page.page_key}.json`] = JSON.stringify(templateFromSections(Array.isArray(list) ? list : []), null, 2) + "\n"
  }

  /**
   * The source files. A section this creator edited in the code editor is
   * their file; one they never touched is the theme's, and it travels so the
   * package stands on its own in an account whose bundled theme has moved on.
   */
  const { data: savedFiles } = await supabase
    .from("store_theme_custom_files")
    .select("path, content")
    .eq("install_id", installId)
  const saved = new Map((savedFiles ?? []).map(r => [r.path as string, r.content as string]))
  for (const [path, content] of Object.entries(DEFAULT_THEME_SOURCES)) files[path] = saved.get(path) ?? content
  for (const [path, content] of saved) if (path.endsWith(".storelib") && !(path in files)) files[path] = content

  const pkg = await buildPackage({
    theme: {
      format: THEME_FORMAT,
      format_version: THEME_FORMAT_VERSION,
      name: install.name,
      version: "1.0.0",
      engine: { min: 1 },
      source_theme_id: install.theme_id ?? undefined,
    },
    files,
    assets,
  }, { generated_at: new Date().toISOString() })

  const blob = Buffer.from(pkg)
  const filename = `${safeFilename(install.name)}.storelib-theme`
  return new NextResponse(blob as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  })
}
