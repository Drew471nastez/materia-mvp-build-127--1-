import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { parseZip } from "@/lib/store-builder/zip"
import type { PageType, PageConfig } from "@/lib/store-builder/types"

export const runtime = "nodejs"

const STORAGE_BUCKET = "onepage-assets"
const SUPPORTED_FORMATS = ["storelib-theme"]

const textDecoder = new TextDecoder()

function inferContentType(filename: string): string {
  const lower = filename.toLowerCase()
  if (lower.endsWith(".png")) return "image/png"
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg"
  if (lower.endsWith(".webp")) return "image/webp"
  if (lower.endsWith(".gif")) return "image/gif"
  if (lower.endsWith(".svg")) return "image/svg+xml"
  if (lower.endsWith(".avif")) return "image/avif"
  return "application/octet-stream"
}

/**
 * Walk the imported theme JSON and replace any `storelib://images/...`
 * placeholder with the freshly-uploaded public URL on the new owner's
 * storage bucket. Leaves untouched any URL that wasn't bundled in the zip.
 */
function rewriteThemeUrls(value: unknown, urlMap: Record<string, string>): unknown {
  if (typeof value === "string") {
    let next = value
    for (const [placeholder, publicUrl] of Object.entries(urlMap)) {
      if (next.includes(placeholder)) next = next.split(placeholder).join(publicUrl)
    }
    return next
  }
  if (Array.isArray(value)) return value.map((v) => rewriteThemeUrls(v, urlMap))
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = rewriteThemeUrls(v, urlMap)
    return out
  }
  return value
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: creator } = await supabase
    .from("creators")
    .select("id, slug, username")
    .eq("user_id", user.id)
    .single()
  if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 })

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 })
  }

  const file = formData.get("file") as File | null
  if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 })
  if (file.size > 50 * 1024 * 1024) {
    return NextResponse.json({ error: "Theme file too large (max 50 MB)" }, { status: 413 })
  }

  let entries
  try {
    const buf = new Uint8Array(await file.arrayBuffer())
    entries = parseZip(buf)
  } catch (err: any) {
    return NextResponse.json({ error: `Invalid zip archive: ${err.message}` }, { status: 400 })
  }

  const manifestEntry = entries.find((e) => e.name === "manifest.json")
  const themeEntry = entries.find((e) => e.name === "theme.json")
  if (!manifestEntry || !themeEntry) {
    return NextResponse.json({ error: "Theme zip is missing manifest.json or theme.json" }, { status: 400 })
  }

  let manifest: any
  let themeJson: any
  try {
    manifest = JSON.parse(textDecoder.decode(manifestEntry.bytes))
    themeJson = JSON.parse(textDecoder.decode(themeEntry.bytes))
  } catch {
    return NextResponse.json({ error: "Theme zip contains malformed JSON" }, { status: 400 })
  }

  if (!SUPPORTED_FORMATS.includes(manifest.format)) {
    return NextResponse.json({ error: "Unrecognised theme format" }, { status: 400 })
  }

  const pageType: PageType = manifest.pageType === "product" ? "product" : "shop"

  // ─── Upload bundled images to the new owner's bucket ────────────────
  // Each entry under `images/` is uploaded under
  //   storelib-themes/<creatorId>/<timestamp>-<original-name>
  // and we build a placeholder → public URL map for the JSON rewrite step.
  const imageEntries = entries.filter((e) => e.name.startsWith("images/"))
  const urlMap: Record<string, string> = {}

  for (const entry of imageEntries) {
    const baseName = entry.name.replace(/^images\//, "")
    const objectPath = `storelib-themes/${creator.id}/${Date.now()}-${baseName}`
    try {
      const { error: upErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(objectPath, entry.bytes, {
          contentType: inferContentType(baseName),
          upsert: false,
        })
      if (upErr) {
        // Non-fatal — keep going. The placeholder will simply not be rewritten.
        console.error("Theme image upload failed", baseName, upErr.message)
        continue
      }
      const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(objectPath)
      if (data?.publicUrl) {
        urlMap[`storelib://${entry.name}`] = data.publicUrl
      }
    } catch (err) {
      console.error("Theme image upload threw", baseName, err)
    }
  }

  const rehydrated = rewriteThemeUrls(themeJson, urlMap) as PageConfig

  // ─── Persist into draft_config (does NOT auto-publish) ───────────────
  // We always write to draft so the user can preview the imported theme
  // and explicitly hit "Publish" to make it live.
  const { data: existing } = await supabase
    .from("store_builder_configs")
    .select("id, published_config")
    .eq("creator_id", creator.id)
    .eq("page_type", pageType)
    .maybeSingle()

  if (existing) {
    const { error: updateErr } = await supabase
      .from("store_builder_configs")
      .update({
        draft_config: rehydrated,
        draft_updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
    if (updateErr) {
      return NextResponse.json({ error: `Failed to import theme: ${updateErr.message}` }, { status: 500 })
    }
  } else {
    const { error: insertErr } = await supabase.from("store_builder_configs").insert({
      creator_id: creator.id,
      page_type: pageType,
      draft_config: rehydrated,
      published_config: rehydrated,
    })
    if (insertErr) {
      return NextResponse.json({ error: `Failed to import theme: ${insertErr.message}` }, { status: 500 })
    }
  }

  return NextResponse.json({
    success: true,
    pageType,
    name: manifest.name,
    imagesImported: Object.keys(urlMap).length,
    totalImagesInZip: imageEntries.length,
  })
}
