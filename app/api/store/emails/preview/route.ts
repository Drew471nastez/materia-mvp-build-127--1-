import { NextResponse } from "next/server"
import { shopCaller } from "@/lib/physical/auth"
import { previewCustomerEmail } from "@/lib/emails/customer-catalog"
import { resolveCreatorIdentity } from "@/lib/email"
import { storeIdentity } from "@/lib/store/identity-server"
import { orderStoreUrl } from "@/lib/physical/store-link"
import { loadBrand } from "@/lib/email-campaigns/brand-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Settings › Customer emails: one email as it is sent, drawn by its own
 * template with the store's name, logo, contact and website,
 * and sample items and buyer (lib/emails/customer-catalog.ts). The owner's
 * alone; the page shows it in a sandboxed frame.
 */
export async function GET(request: Request) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const id = new URL(request.url).searchParams.get("id") ?? ""
  const db = c.db
  const [identity, store, { data: creator }, look, website] = await Promise.all([
    resolveCreatorIdentity(db, c.creatorId).catch(() => ({ fromName: "", replyTo: "", sellerEmail: "" })),
    storeIdentity(db, c.creatorId).catch(() => null),
    db.from("creators").select("payout_currency").eq("id", c.creatorId).maybeSingle(),
    loadBrand(db, c.creatorId).catch(() => null),
    /* The live website, as the sent emails link it (lib/physical/store-link.ts), never the creator page. */
    orderStoreUrl({ creator_id: c.creatorId }),
  ])
  /* The same store the sent email signs with: its name, logo, contact and website (lib/store/identity-server.ts). */
  const mail = previewCustomerEmail(id, {
    name: store?.name || identity.fromName || "Your store",
    supportEmail: store?.email || identity.replyTo || null,
    storeUrl: website || null,
    logoUrl: store?.logoUrl ?? null,
    phone: store?.phone ?? null,
    currency: (creator?.payout_currency as string | null) || "USD",
    accent: look?.accent ?? null,
  })
  if (!mail) return NextResponse.json({ error: "That email was not found." }, { status: 404 })
  return NextResponse.json({ subject: mail.subject, html: mail.html }, { headers: { "Cache-Control": "no-store" } })
}
