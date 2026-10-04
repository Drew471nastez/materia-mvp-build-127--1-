import { NextResponse } from "next/server"

import { LIMITS, rateLimit } from "@/lib/api/rate-limit"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { revalidatePublishedSite } from "@/lib/website-builder/published-site"
import { readEditorBody } from "@/lib/website-builder/request-body"
import { storeMenusFor, writeStoreMenus } from "@/lib/website-builder/store-menus-server"

/*
 * ===========================================================================
 *  THE STORE'S MENUS: READ AND SAVE
 * ===========================================================================
 * GET  ?install=<id>  -> { available, stored, menus }
 * PUT  { menus }      -> { menus }
 *
 * Menus belong to the store, not to a theme (lib/website-builder/
 * store-menus-server.ts), so this takes no theme. `install` only says which
 * theme's menus to offer when nothing is live and nothing is stored yet.
 *
 * A save goes live at once, on every theme, the way Shopify's Navigation
 * does: the published site's cache is dropped with it.
 */

const NO_STORE = { "Cache-Control": "no-store" }
/** Twelve menus of links, well under the 256 KB the table allows. */
const MENUS_BODY = 256 * 1024

async function creatorOf() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: "Sign in to edit menus." }, { status: 401, headers: NO_STORE }) }
  const admin = createAdminClient()
  const { data: creator } = await admin.from("creators").select("id").eq("user_id", user.id).maybeSingle()
  if (!creator) return { error: NextResponse.json({ error: "Creator not found" }, { status: 404, headers: NO_STORE }) }
  return { admin, userId: user.id, creatorId: (creator as { id: string }).id }
}

export async function GET(req: Request) {
  const who = await creatorOf()
  if ("error" in who) return who.error
  const install = new URL(req.url).searchParams.get("install")
  const installId = install && /^[0-9a-f-]{36}$/i.test(install) ? install : null
  try {
    const read = await storeMenusFor(who.admin, who.creatorId, installId)
    return NextResponse.json(read, { headers: NO_STORE })
  } catch {
    /* Menus stay with the theme; the editor works exactly as it did. */
    return NextResponse.json({ available: false, stored: false, menus: {} }, { headers: NO_STORE })
  }
}

export async function PUT(req: Request) {
  const who = await creatorOf()
  if ("error" in who) return who.error

  /* Typing a link's name saves as you go, like the theme's settings: the same allowance. */
  const limited = await rateLimit({
    bucket: "store-menus-save",
    subjects: [`user:${who.userId}`],
    windows: LIMITS.siteSave,
    message: "Too many saves in a short time. Wait a moment, then keep editing.",
  })
  if (limited) return limited

  const read = await readEditorBody(req, MENUS_BODY)
  if (read.ok === false) return read.response
  if (read.invalid) return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: NO_STORE })
  const body = read.json as { menus?: unknown } | null
  const menus = body?.menus
  if (!menus || typeof menus !== "object" || Array.isArray(menus)) {
    return NextResponse.json({ error: "Send the menus as an object." }, { status: 400, headers: NO_STORE })
  }

  const saved = await writeStoreMenus(who.admin, who.creatorId, menus)
  if (!saved.ok) {
    return NextResponse.json(
      saved.unavailable
        ? { error: "Menus for the whole store are not switched on yet.", unavailable: true }
        : { error: "Could not save the menus. Try again." },
      { status: saved.unavailable ? 409 : 500, headers: NO_STORE },
    )
  }
  await revalidatePublishedSite(who.creatorId)
  return NextResponse.json({ menus: saved.menus }, { headers: NO_STORE })
}
