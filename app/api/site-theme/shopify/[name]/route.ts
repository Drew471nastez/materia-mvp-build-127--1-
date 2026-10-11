/**
 * ===========================================================================
 *  SHOPIFY'S HELPER SCRIPTS, STORELIB'S OWN COPIES
 * ===========================================================================
 * `shopify_asset_url` and `global_asset_url` point here for the scripts older
 * themes ask Shopify for by name (option_selection.js, api.jquery.js,
 * shopify_common.js, customer_area.js). They are written in
 * lib/storelib-theme/compat/shopify-global-assets.ts and are the same for
 * every site, so they are cached for a day and can be read from any origin
 * (the builder draws the page in a sandboxed frame).
 */
import { SHOPIFY_GLOBAL_ASSETS, shopifyGlobalAsset } from "@/lib/storelib-theme/compat/shopify-global-assets"

export const dynamic = "force-static"
export const generateStaticParams = () => SHOPIFY_GLOBAL_ASSETS.map((name) => ({ name }))

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
