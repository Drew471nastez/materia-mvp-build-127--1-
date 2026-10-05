import { appleAppSiteAssociation } from "@/lib/platform/app-links"

/**
 * /.well-known/apple-app-site-association (next.config.mjs rewrites it here):
 * the file iOS reads to open storelib.com links in the app, built from the
 * env vars in lib/platform/app-links.ts. JSON, 200, no redirect, no sign in,
 * which is everything Apple asks of it.
 */
export const dynamic = "force-dynamic"

export function GET() {
  return new Response(JSON.stringify(appleAppSiteAssociation()), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" },
  })
}
