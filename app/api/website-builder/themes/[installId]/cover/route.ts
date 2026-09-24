import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { isThemeId } from "@/lib/website-builder/theme-registry"
import { renderOrigin, takeCover } from "@/lib/website-builder/cover-take"

/**
 * ===========================================================================
 *  POST /api/website-builder/themes/[installId]/cover
 * ===========================================================================
 * Take the website's cover: open its saved home page in a real browser on
 * the server, photograph it at a laptop's width and a phone's, and keep the
 * pictures in the install's snapshot folder, where the website page finds
 * them. The editor asks for this a little while after a save has settled,
 * and the website page asks when the cover it has is older than the site.
 *
 * Scope: the signed-in user's creator must own the install, as on every
 * install route. The browser is sent to THIS deployment's own render page
 * with a two-minute pass for this one install; nothing in the request names
 * a URL, so there is nothing here to point it anywhere else.
 *
 * Cost: a browser launch and two page loads, a few seconds on a function.
 * Not repeated within MIN_GAP_MS of the last cover — two tabs, a double
 * save, a page refreshed twice all get the picture that already exists.
 *
 * Failure keeps the last cover. A cover is a convenience; nothing about the
 * website depends on it, and nothing here can change the website.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
/** A cold browser launch plus two page loads, with room to spare. */
export const maxDuration = 60

type Params = { params: Promise<{ installId: string }> }

export async function POST(req: Request, { params }: Params) {
  const { installId } = await params
  if (!isThemeId(installId)) return NextResponse.json({ error: "Invalid install id" }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: creator } = await supabase.from("creators").select("id").eq("user_id", user.id).maybeSingle()
  if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 })

  const { data: install } = await supabase
    .from("store_theme_installs")
    .select("id")
    .eq("id", installId)
    .eq("creator_id", (creator as { id: string }).id)
    .maybeSingle()
  if (!install) return NextResponse.json({ error: "Theme not found" }, { status: 404 })

  /* The photographing is shared with the routes that create a website: lib/website-builder/cover-take.ts */
  try {
    const cover = await takeCover(
      { installId, userId: user.id, creatorId: (creator as { id: string }).id },
      renderOrigin(req.url),
    )
    return NextResponse.json(cover)
  } catch (e) {
    /* Said out loud: a cover that silently never arrives is how this went
       unnoticed for a week the last time. */
    console.error("[cover] could not take the screenshots:", e instanceof Error ? e.message : e)
    return NextResponse.json({ error: "The cover could not be taken" }, { status: 502 })
  }
}
