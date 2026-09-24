import { NextResponse, after } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { announce, productAddresses, profileAddresses } from "@/lib/seo/announce"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * "I just saved this; tell the search engines." Products and profiles are
 * saved from the browser straight to the database, with no server route of
 * their own to hang this on, so the screens that save them call here after
 * a save has succeeded (lib/seo/announce-client.ts).
 *
 *   { product: "<id>" }   a product was published, changed or taken down
 *   { profile: true }     the creator's own page changed
 *
 * The creator comes from the session and a product must be theirs. The
 * answer is immediate: the addresses are worked out and sent after it
 * (`after()`), and nothing that happens there can reach the person saving.
 * Does nothing at all while INDEXNOW_KEY is unset.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = (await request.json().catch(() => null)) as { product?: unknown; profile?: unknown } | null
  const admin = createAdminClient()
  const { data: creator } = await admin.from("creators").select("id").eq("user_id", user.id).maybeSingle()
  const creatorId = (creator as { id?: string } | null)?.id
  if (!creatorId) return NextResponse.json({ ok: true })

  if (typeof body?.product === "string" && UUID.test(body.product)) {
    const productId = body.product
    after(() => announce(() => productAddresses(productId, creatorId)))
  } else if (body?.profile === true) {
    after(() => announce(() => profileAddresses(creatorId)))
  }
  return NextResponse.json({ ok: true }, { status: 202 })
}
