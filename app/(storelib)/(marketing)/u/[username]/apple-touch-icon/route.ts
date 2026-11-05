/**
 * A creator page domain's home screen icon: the creator's photo, 180 by 180
 * on white (lib/onepage/host-icon-server.ts).
 */
import { creatorIconResponse } from "@/lib/onepage/host-icon-server"
import { TOUCH_ICON_SIZE } from "@/lib/website-builder/site-favicon"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params
  return creatorIconResponse(request, decodeURIComponent(username), TOUCH_ICON_SIZE, true)
}
