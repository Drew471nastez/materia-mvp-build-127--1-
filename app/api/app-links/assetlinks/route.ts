import { assetLinks } from "@/lib/platform/app-links"

/**
 * /.well-known/assetlinks.json (next.config.mjs rewrites it here): the file
 * Android reads to verify the app's App Links, built from the env vars in
 * lib/platform/app-links.ts. JSON, 200, no redirect.
 */
export const dynamic = "force-dynamic"

export function GET() {
  return new Response(JSON.stringify(assetLinks()), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" },
  })
}
