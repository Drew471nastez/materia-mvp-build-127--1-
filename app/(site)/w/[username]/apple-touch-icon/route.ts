/**
 * A published website's home screen icon, on its own host: 180 by 180 on
 * white (lib/website-builder/site-favicon.ts).
 */
import { TOUCH_ICON_SIZE } from "@/lib/website-builder/site-favicon"
import { noIcon, siteIconSource, squareIconResponse } from "@/lib/website-builder/site-favicon-server"

export async function GET(request: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params
  const icon = await siteIconSource(username)
  /* The `?v=` the page linked: held longer when it names this picture (site-favicon-server.ts). */
  return icon ? squareIconResponse(icon.source, TOUCH_ICON_SIZE, true, new URL(request.url).searchParams.get("v")) : noIcon()
}
