/**
 * ===========================================================================
 *  THE HELPER SCRIPTS AN OLDER THEME ASKS FOR BY NAME
 * ===========================================================================
 * `shopify_asset_url` and `global_asset_url` point here for the scripts an
 * older theme loads by name (option_selection.js, api.jquery.js and two
 * more), served under Storelib's own names (option-selection.js,
 * cart-api.js, common.js, customer-area.js) so the page's source names no
 * other platform. Written in lib/storelib-theme/compat/shopify-global-
 * assets.ts, the same for every site: cached for a day, readable from any
 * origin (the builder draws the page in a sandboxed frame).
 */
import { SERVED_GLOBAL_ASSETS, shopifyGlobalAsset } from "@/lib/storelib-theme/compat/shopify-global-assets"

export const dynamic = "force-static"
export const generateStaticParams = () => SERVED_GLOBAL_ASSETS.map((name) => ({ name }))

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Cross-Origin-Resource-Policy": "cross-origin",
  "X-Content-Type-Options": "nosniff",
}

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const js = shopifyGlobalAsset(decodeURIComponent((await params).name))
  if (!js) return new Response("Not found", { status: 404, headers })
  return new Response(js, { headers: { ...headers, "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800" } })
}
