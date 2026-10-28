/**
 * A published website's web app manifest, on its own host: its name and its
 * icons at the same host (lib/website-builder/site-favicon.ts).
 */
import { siteManifest } from "@/lib/website-builder/site-favicon"
import { noIcon, siteIconSource } from "@/lib/website-builder/site-favicon-server"

export async function GET(_request: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params
  const icon = await siteIconSource(username)
  if (!icon) return noIcon()
  return new Response(JSON.stringify(siteManifest(icon)), {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
    },
  })
}
