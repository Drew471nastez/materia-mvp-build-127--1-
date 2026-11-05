/**
 * A creator page domain's /favicon.ico: the creator's photo, 192 by 192,
 * never Storelib's icon. proxy.ts sends the request here from a domain
 * connected to the creator page (lib/onepage/host-icon-server.ts says why).
 */
import { creatorIconResponse } from "@/lib/onepage/host-icon-server"
import { FAVICON_SIZE } from "@/lib/website-builder/site-favicon"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params
  return creatorIconResponse(request, decodeURIComponent(username), FAVICON_SIZE, false)
}
