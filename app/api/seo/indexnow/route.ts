import { NextResponse, after } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { announce, productAddresses, profileAddresses, removedProductAddresses } from "@/lib/seo/announce"
import { authUnavailableResponse, routeUser } from "@/lib/auth/route-user"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** A slug as it can sit in a path: nothing that could reshape the address it is put into. */
const SLUG = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,199}$/

/**
 * "I just saved this; tell the search engines." Products and profiles are
 * saved from the browser straight to the database, with no server route of
 * their own to hang this on, so the screens that save them call here after
 * a save has succeeded (lib/seo/announce-client.ts).
 *
 *   { product: "<id>" }            a product was published, changed or taken down
 *   { removedProduct: "<slug>" }   a product was deleted; the row is gone, so
 *                                  the slug it had is sent, and is believed
 *                                  only when no product of theirs still has it
 *   { profile: true }              the creator's own page changed
 *
 * The creator comes from the session and a product must be theirs. The
 * answer is immediate: the addresses are worked out and sent after it
 * (`after()`), and nothing that happens there can reach the person saving.
 * Does nothing at all while INDEXNOW_KEY is unset.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const who = await routeUser()
  if (who.kind === "unavailable") return authUnavailableResponse()
  const user = who.kind === "user" ? who.user : null
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = (await request.json().catch(() => null)) as { product?: unknown; removedProduct?: unknown; profile?: unknown } | null
  const admin = createAdminClient()
  const { data: creator } = await admin.from("creators").select("id").eq("user_id", user.id).maybeSingle()
  const creatorId = (creator as { id?: string } | null)?.id
  if (!creatorId) return NextResponse.json({ ok: true })

  if (typeof body?.product === "string" && UUID.test(body.product)) {
    const productId = body.product
    after(() => announce(() => productAddresses(productId, creatorId)))
  } else if (typeof body?.removedProduct === "string" && SLUG.test(body.removedProduct)) {
    const slug = body.removedProduct
    after(() => announce(() => removedProductAddresses(slug, creatorId)))
  } else if (body?.profile === true) {
    after(() => announce(() => profileAddresses(creatorId)))
  }
  return NextResponse.json({ ok: true }, { status: 202 })
}
