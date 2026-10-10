import { NextResponse } from "next/server"
import { shopCaller } from "@/lib/physical/auth"
import { previewCustomerEmail } from "@/lib/emails/customer-catalog"
import { resolveCreatorIdentity } from "@/lib/email"
import { getMainDomain } from "@/lib/url-helpers"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Settings › Customer emails: one email as it is sent, drawn by its own
 * template with the store's name, address for questions and creator page,
 * and sample items and buyer (lib/emails/customer-catalog.ts). The owner's
 * alone; the page shows it in a sandboxed frame.
 */
export async function GET(request: Request) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const id = new URL(request.url).searchParams.get("id") ?? ""
  const db = c.db
  const [identity, { data: creator }] = await Promise.all([
    resolveCreatorIdentity(db, c.creatorId).catch(() => ({ fromName: "", replyTo: "", sellerEmail: "" })),
    db.from("creators").select("username, slug, payout_currency").eq("id", c.creatorId).maybeSingle(),
  ])
  const handle = (creator?.username || creator?.slug || "") as string
  const mail = previewCustomerEmail(id, {
    name: identity.fromName || "Your store",
    supportEmail: identity.replyTo || null,
    storeUrl: handle ? `https://${getMainDomain()}/${encodeURIComponent(handle)}` : null,
    currency: (creator?.payout_currency as string | null) || "USD",
  })
  if (!mail) return NextResponse.json({ error: "That email was not found." }, { status: 404 })
  return NextResponse.json({ subject: mail.subject, html: mail.html }, { headers: { "Cache-Control": "no-store" } })
}
