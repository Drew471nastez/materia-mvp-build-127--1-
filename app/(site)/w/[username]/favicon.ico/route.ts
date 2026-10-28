/**
 * A published website's /favicon.ico, on its own host: its favicon (or logo)
 * as a 192 by 192 PNG, never Storelib's icon. The proxy sends the request
 * here from <name>.storelib.com and from a connected website domain.
 * lib/website-builder/site-favicon.ts says why.
 */
import { FAVICON_SIZE } from "@/lib/website-builder/site-favicon"
import { noIcon, siteIconSource, squareIconResponse } from "@/lib/website-builder/site-favicon-server"

export async function GET(_request: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params
  const icon = await siteIconSource(username)
  return icon ? squareIconResponse(icon.source, FAVICON_SIZE, false) : noIcon()
}
