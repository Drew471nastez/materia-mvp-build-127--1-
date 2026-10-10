/**
 * ===========================================================================
 *  AN IMPORTED THEME'S OWN FILES: ITS STYLESHEETS, SCRIPTS, ICONS, FONTS
 * ===========================================================================
 * `asset_url` points here, on the website and in the builder's canvas alike.
 * Only files under `shopify/assets/` are served, which only an imported
 * theme has, each as the type its extension names. A theme's stylesheets and
 * scripts are what its pages already send every visitor, so nothing here is
 * private; the version in the address changes with every publish, so a
 * published file is cached for good.
 *
 * Read from any origin: the builder draws the page in a sandboxed frame,
 * whose module scripts are cross-origin requests.
 */
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { assetType, binaryOf } from "@/lib/storelib-theme/compat/install"
import { installFiles, compatThemeFor } from "@/lib/website-builder/compat-site"
import { themeAsset } from "@/lib/storelib-theme/compat/site"

export const runtime = "nodejs"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NAME = /^[A-Za-z0-9_][A-Za-z0-9_.@-]*$/

interface Params {
  params: Promise<{ installId: string; version: string; name: string[] }>
}

/*
  NEVER A PAGE OF OURS. Opened straight in a tab, a theme's SVG is a
  document, and one with a <script> in it would run on whichever host served
  it, storelib.com included. A sandbox with no scripts makes every file here
  inert as a page; a stylesheet, a script or a picture loaded by a page is
  not affected, because a response's own policy only governs it as a page.
*/
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Cross-Origin-Resource-Policy": "cross-origin",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; img-src * data:; style-src 'unsafe-inline'; font-src * data:; sandbox",
}

export async function GET(_req: Request, { params }: Params) {
  const { installId, version, name: parts } = await params
  const name = decodeURIComponent(parts.join("/"))
  const type = assetType(name)
  if (!UUID.test(installId) || !NAME.test(name) || !type) return new NextResponse("Not found", { status: 404, headers: cors })
  const draft = version === "edit" || version.startsWith("draft")
  const cache = draft ? "private, max-age=0, must-revalidate" : "public, max-age=31536000, immutable"
  const admin = createAdminClient()
  const cols = draft ? "path, content, draft_content" : "path, content"
  const { data } = await admin
    .from("store_theme_custom_files")
    .select(cols)
    .eq("install_id", installId)
    .in("path", [`shopify/assets/${name}`, `shopify/assets/${name}.liquid`])
  const rows = (data ?? []) as unknown as { path: string; content: string | null; draft_content?: string | null }[]
  const plain = rows.find((r) => r.path === `shopify/assets/${name}`)
  const text = plain ? (draft ? plain.draft_content ?? plain.content : plain.content) : null
  if (typeof text === "string" && text !== "") {
    const bytes = binaryOf(text)
    return new NextResponse(bytes ? new Blob([bytes as BlobPart]) : text, { headers: { ...cors, "Content-Type": type, "Cache-Control": cache } })
  }
  if (!rows.some((r) => r.path.endsWith(".liquid"))) return new NextResponse("Not found", { status: 404, headers: cors })
  /* A `.css.liquid` asset is drawn with the theme's settings, which needs the theme. */
  const files = await installFiles(admin, installId, draft)
  const { data: settingsRow } = await admin.from("store_theme_settings").select("settings, draft_settings").eq("install_id", installId).maybeSingle()
  const s = settingsRow as { settings?: unknown; draft_settings?: unknown } | null
  const theme = compatThemeFor(installId, version, files, (draft ? s?.draft_settings ?? s?.settings : s?.settings) ?? {})
  const out = themeAsset(theme, name, () => theme.pageContext({ template: "index", path: "/", designMode: false, products: [], collections: [], menus: {}, shop: { name: "" } }))
  if (!out) return new NextResponse("Not found", { status: 404, headers: cors })
  return new NextResponse(typeof out.body === "string" ? out.body : new Blob([out.body as BlobPart]), { headers: { ...cors, "Content-Type": out.type, "Cache-Control": cache } })
}
