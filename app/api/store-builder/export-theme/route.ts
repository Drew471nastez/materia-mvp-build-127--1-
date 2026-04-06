import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { buildZip } from "@/lib/store-builder/zip"
import type { PageType, PageConfig } from "@/lib/store-builder/types"

export const runtime = "nodejs"

const EXPORT_FORMAT_VERSION = 1

// ─── Helpers ────────────────────────────────────────────────────────────────

const URL_REGEX = /https?:\/\/[^\s"'<>)]+/g
const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".avif"]

function extractImageUrls(value: unknown, out: Set<string>) {
  if (!value) return
  if (typeof value === "string") {
    const matches = value.match(URL_REGEX)
    if (matches) {
      for (const url of matches) {
        const lower = url.toLowerCase().split("?")[0]
        if (IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext)) || /\/storage\/v1\/(object|render)\/public\//.test(url)) {
          out.add(url)
        }
      }
    }
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) extractImageUrls(item, out)
    return
  }
  if (typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) extractImageUrls(v, out)
  }
}

function safeFilename(s: string): string {
  return s.replace(/[^a-z0-9\-_]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "theme"
}

function inferImageExtension(url: string, contentType?: string | null): string {
  if (contentType?.includes("png")) return "png"
  if (contentType?.includes("jpeg")) return "jpg"
  if (contentType?.includes("webp")) return "webp"
  if (contentType?.includes("gif")) return "gif"
  if (contentType?.includes("svg")) return "svg"
  if (contentType?.includes("avif")) return "avif"
  const lower = url.toLowerCase().split("?")[0]
  for (const ext of IMAGE_EXTENSIONS) {
    if (lower.endsWith(ext)) return ext.slice(1)
  }
  return "bin"
}

// FNV-1a 32-bit, plenty for filename uniqueness inside an export
function hashString(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, "0")
}

// ─── Strip dynamic content ─────────────────────────────────────────────────
// We export everything except product references and seller-specific
// runtime data. The importer rehydrates those from the new owner's data.
function stripDynamicContent<T extends PageConfig>(config: T): T {
  const cloned = JSON.parse(JSON.stringify(config)) as T
  for (const section of cloned.sections || []) {
    const s: any = section.settings
    if (Array.isArray(s?.productIds)) s.productIds = []
    if (s?.buttonLinkType === "product") {
      s.buttonProductId = undefined
      s.buttonProductSlug = undefined
    }
    if (s?.linkProductId) {
      s.linkProductId = undefined
      s.linkProductSlug = undefined
    }
  }
  return cloned
}

// ─── Route handler ─────────────────────────────────────────────────────────
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const pageType = (searchParams.get("pageType") as PageType) || "shop"
  const includeImages = searchParams.get("includeImages") !== "0"
  const stage = searchParams.get("stage") === "draft" ? "draft" : "published"

  if (!["shop", "product"].includes(pageType)) {
    return NextResponse.json({ error: "Invalid page type" }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: creator } = await supabase
    .from("creators")
    .select("id, slug, display_name, username")
    .eq("user_id", user.id)
    .single()
  if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 })

  const { data: configRow } = await supabase
    .from("store_builder_configs")
    .select("draft_config, published_config")
    .eq("creator_id", creator.id)
    .eq("page_type", pageType)
    .single()

  const sourceConfig: PageConfig | undefined =
    stage === "draft"
      ? (configRow?.draft_config as PageConfig | undefined) || (configRow?.published_config as PageConfig | undefined)
      : (configRow?.published_config as PageConfig | undefined) || (configRow?.draft_config as PageConfig | undefined)

  if (!sourceConfig) {
    return NextResponse.json({ error: "No theme config found to export" }, { status: 404 })
  }

  const cleanedConfig = stripDynamicContent(sourceConfig)

  // Collect all image URLs referenced anywhere in the config
  const imageUrlSet = new Set<string>()
  if (includeImages) extractImageUrls(cleanedConfig, imageUrlSet)

  // Fetch each image and bundle it. Failures are non-fatal — we just skip
  // the image and leave the original URL in the JSON. The recipient will
  // still see a working theme, just sourced from the original CDN.
  const imageMap: Record<string, string> = {} // url → archive path
  const imageEntries: { name: string; data: Uint8Array }[] = []

  if (includeImages) {
    const fetched = await Promise.all(
      Array.from(imageUrlSet).map(async (url) => {
        try {
          const res = await fetch(url, { cache: "no-store" })
          if (!res.ok) return null
          const buf = new Uint8Array(await res.arrayBuffer())
          const ext = inferImageExtension(url, res.headers.get("content-type"))
          const filename = `images/${hashString(url)}.${ext}`
          return { url, buf, filename }
        } catch {
          return null
        }
      }),
    )
    for (const f of fetched) {
      if (!f) continue
      imageMap[f.url] = f.filename
      imageEntries.push({ name: f.filename, data: f.buf })
    }
  }

  // Walk the config one more time and rewrite image URLs to relative
  // archive paths. The importer will re-upload them to the new owner's
  // bucket and rewrite back to absolute URLs.
  const rewriteUrls = (value: unknown): unknown => {
    if (typeof value === "string") {
      let next = value
      for (const [orig, rel] of Object.entries(imageMap)) {
        if (next.includes(orig)) next = next.split(orig).join(`storelib://${rel}`)
      }
      return next
    }
    if (Array.isArray(value)) return value.map(rewriteUrls)
    if (value && typeof value === "object") {
      const out: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = rewriteUrls(v)
      return out
    }
    return value
  }
  const themeJson = rewriteUrls(cleanedConfig) as PageConfig

  const themeName = creator.display_name || creator.username || creator.slug || "theme"
  const slug = safeFilename(themeName)

  const manifest = {
    format: "storelib-theme",
    formatVersion: EXPORT_FORMAT_VERSION,
    name: themeName,
    slug,
    pageType,
    stage,
    includesImages: includeImages && imageEntries.length > 0,
    imageCount: imageEntries.length,
    exportedAt: new Date().toISOString(),
    exportedBy: { username: creator.username, slug: creator.slug },
  }

  const zipBytes = buildZip([
    { name: "manifest.json", data: JSON.stringify(manifest, null, 2) },
    { name: "theme.json", data: JSON.stringify(themeJson, null, 2) },
    ...imageEntries,
  ])

  const downloadName = `${slug}-storelib-export.zip`

  return new Response(new Uint8Array(zipBytes), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${downloadName}"`,
      "Content-Length": String(zipBytes.length),
      "Cache-Control": "no-store",
    },
  })
}
