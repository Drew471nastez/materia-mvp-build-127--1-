/**
 * ===========================================================================
 *  AN IMPORTED THEME'S OWN FILES: ITS STYLESHEETS, SCRIPTS, ICONS, FONTS
 * ===========================================================================
 * `asset_url` points here, on the website and in the builder's canvas alike.
 * Only files under `shopify/assets/` are served, which only an imported
 * theme has, each as the type its extension names. A theme's stylesheets and
 * scripts are what its pages already send every visitor, so nothing here is
 * private.
 *
 * THE VERSION IN THE ADDRESS is a hash of what the file is drawn from
 * (lib/storelib-theme/compat/asset-version.ts), so a file is cached for good
 * and its address moves only when its output does. The `published_at`
 * version addresses used before are still answered, cached as they always
 * were, because a page cached before the change may still name them. A hash
 * that is not the file's current one (a page drawn a moment before a save)
 * is answered with the current file but held for a minute, not a year, so
 * an address never keeps an output that is not its own.
 *
 * Read from any origin: the builder draws the page in a sandboxed frame,
 * whose module scripts are cross-origin requests.
 *
 * A DRAFT version (`edit`, `draft-<time>`) serves the unpublished file only
 * with the pass it carries (lib/storelib-theme/compat/draft-version.ts).
 */
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { ASSET_MAP_PATH, assetType, binaryOf } from "@/lib/storelib-theme/compat/asset-file"
import { isOptimizableImage } from "@/lib/images/optimized-url"
import { fixThemeCss } from "@/lib/storelib-theme/compat/css-fixes"
import { assetVersion, isContentVersion, plainAssetVersion } from "@/lib/storelib-theme/compat/asset-version"
import { splitAssetVersion } from "@/lib/storelib-theme/compat/draft-version"
import { isDraftAssetPass } from "@/lib/website-builder/draft-asset-pass"
import { keepAnswer, keptAnswer, readAssetRows, type AssetAdmin, type AssetRow } from "@/lib/storelib-theme/compat/asset-serve"

/*
  LIGHT TO START (round AQ). Right after a deploy every file of a page is a
  function call on a server that may be starting (Vercel's cache key names
  the deployment, lib/storelib-theme/compat/asset-serve.ts), and loading
  this route loaded the whole Liquid engine, the theme reader and the SCSS
  compiler before the first byte of a plain script. Those are needed only
  for a `.liquid` file, the rare one, and are loaded then.
*/
const liquidParts = () =>
  Promise.all([import("@/lib/website-builder/compat-site"), import("@/lib/storelib-theme/compat/site"), import("@/lib/storelib-theme/compat/scss")]).then(([site, compat, scss]) => ({
    installFiles: site.installFiles,
    compatThemeFor: site.compatThemeFor,
    themeAsset: compat.themeAsset,
    compileScss: scss.compileScss,
  }))

export const runtime = "nodejs"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/* Spaces and brackets too: "hero (1).png" is a name a theme ships. Never a slash or a dot first. */
const NAME = /^[A-Za-z0-9_][A-Za-z0-9_.@ ()+-]*$/
/* A picture in assets/ is stored in the media library at import, and the asset map says where. */
const PICTURE = /\.(png|jpe?g|gif|webp|avif|ico|bmp)$/i

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
  if (UUID.test(installId) && NAME.test(name) && PICTURE.test(name)) {
    /*
      A STYLESHEET'S url(bg.png) is relative to the stylesheet, so it lands
      here; the picture lives in the media library. Sent on to it, and only
      to an address of Storelib's own storage, never anywhere the map says.
    */
    const { data } = await createAdminClient().from("store_theme_custom_files").select("content").eq("install_id", installId).eq("path", ASSET_MAP_PATH).maybeSingle()
    let to: unknown = null
    try {
      to = (JSON.parse(String((data as { content?: string } | null)?.content ?? "{}")) as Record<string, unknown>)[name]
    } catch {
      to = null
    }
    const ours = (u: string) => {
      try {
        return new URL(u).hostname === (process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com")
      } catch {
        return false
      }
    }
    if (typeof to === "string" && /^https:\/\//.test(to) && (isOptimizableImage(to) || ours(to))) return NextResponse.redirect(to, { status: 302, headers: { ...cors, "Cache-Control": "public, max-age=3600" } })
    return new NextResponse("Not found", { status: 404, headers: cors })
  }
  const type = assetType(name)
  if (!UUID.test(installId) || !NAME.test(name) || !type) return new NextResponse("Not found", { status: 404, headers: cors })
  /*
    A DRAFT ONLY WITH ITS PASS (lib/storelib-theme/compat/draft-version.ts):
    the unpublished file and settings are served for a draft version whose
    pass this server signed for this install. Without one, the published
    file, never the draft and never a 404. Either way never cached.
  */
  const asked = splitAssetVersion(version)
  const draft = asked.draft && isDraftAssetPass(installId, asked.pass)
  const cache = asked.draft ? "private, max-age=0, must-revalidate" : "public, max-age=31536000, immutable"
  /* A hash that is not this file's: the current file, held for a minute. */
  const cacheFor = (current: string | null) => (isContentVersion(version) && current !== version ? "public, max-age=60" : cache)
  /* Answered at this content address on this server before: the same bytes, no read (asset-serve.ts keeps only an exact hash match). */
  const hit = asked.draft ? null : keptAnswer(installId, version, name)
  if (hit) return new NextResponse(typeof hit.body === "string" ? hit.body : new Blob([hit.body as BlobPart]), { headers: { ...cors, "Content-Type": hit.type, "Cache-Control": hit.cache, "X-Storelib-Asset": "kept" } })
  const admin = createAdminClient()
  const cols = draft ? "path, content, draft_content" : "path, content"
  let rows: AssetRow[]
  try {
    /* Read with the other files of this install asked for in the same moment (asset-serve.ts readAssetRows): one query, not one each. */
    rows = await readAssetRows(admin as unknown as AssetAdmin, installId, cols, [`shopify/assets/${name}`, `shopify/assets/${name}.liquid`])
  } catch {
    /* The database did not answer: not "no such file", and never kept anywhere. */
    return new NextResponse("Try again", { status: 503, headers: { ...cors, "Cache-Control": "no-store", "Retry-After": "2" } })
  }
  const plain = rows.find((r) => r.path === `shopify/assets/${name}`)
  const text = plain ? (draft ? plain.draft_content ?? plain.content : plain.content) : null
  if (typeof text === "string" && text !== "") {
    const bytes = binaryOf(text)
    /* A stylesheet as the page draws its own (lib/storelib-theme/compat/css-fixes.ts). */
    const body = bytes ?? (/^text\/css/.test(type) ? fixThemeCss(text) : text)
    const control = cacheFor(plainAssetVersion(text))
    if (!asked.draft) keepAnswer(installId, version, name, plainAssetVersion(text), { body, type, cache: control }, isContentVersion)
    return new NextResponse(typeof body === "string" ? body : new Blob([body as BlobPart]), { headers: { ...cors, "Content-Type": type, "Cache-Control": control } })
  }
  if (!rows.some((r) => r.path.endsWith(".liquid"))) return new NextResponse("Not found", { status: 404, headers: cors })
  /* A `.css.liquid` asset is drawn with the theme's settings, which needs the theme. */
  const { installFiles, compatThemeFor, themeAsset, compileScss } = await liquidParts()
  const files = await installFiles(admin, installId, draft)
  const { data: settingsRow } = await admin.from("store_theme_settings").select("settings, draft_settings").eq("install_id", installId).maybeSingle()
  const s = settingsRow as { settings?: unknown; draft_settings?: unknown } | null
  const settings = (draft ? s?.draft_settings ?? s?.settings : s?.settings) ?? {}
  const theme = compatThemeFor(installId, version, files, settings)
  const out = themeAsset(theme, name, () => theme.pageContext({ template: "index", path: "/", designMode: false, products: [], collections: [], menus: {}, shop: { name: "" } }), { scss: compileScss })
  if (!out) return new NextResponse("Not found", { status: 404, headers: cors })
  const current = isContentVersion(version) ? assetVersion(files, name, settings) : null
  const control = cacheFor(current)
  if (!asked.draft && typeof out.body === "string") keepAnswer(installId, version, name, current, { body: out.body, type: out.type, cache: control }, isContentVersion)
  return new NextResponse(typeof out.body === "string" ? out.body : new Blob([out.body as BlobPart]), { headers: { ...cors, "Content-Type": out.type, "Cache-Control": control } })
}
