import { NextResponse } from "next/server"
import { physicalJson, readBody, shopCaller } from "@/lib/physical/auth"
import { resolveCreatorIdentity } from "@/lib/email"
import { storeIdentity } from "@/lib/store/identity-server"
import { loadBrand } from "@/lib/email-campaigns/brand-server"
import { customerEmailCopyReady, loadCustomerEmailCopy, saveCustomerEmailCopy } from "@/lib/emails/customer-copy-server"
import { CUSTOMER_EMAILS } from "@/lib/emails/customer-catalog"
import { recordActivity } from "@/lib/activity/log-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Settings › Customer emails, in one read: the store's name, logo, contact
 * and website as every email signs with them (so the page draws each
 * preview itself, at once, with lib/emails/customer-catalog.ts), and the
 * store's own words for any email it changed (lib/emails/customer-custom.ts).
 *
 *   GET                      { shop, copy, ready }
 *   PUT { id, copy }         one email's words; `copy: null` puts it back to the default
 */
export async function GET() {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const db = c.db
  const [identity, store, { data: creator }, copy, ready, look] = await Promise.all([
    resolveCreatorIdentity(db, c.creatorId).catch(() => ({ fromName: "", replyTo: "", sellerEmail: "" })),
    storeIdentity(db, c.creatorId).catch(() => null),
    db.from("creators").select("payout_currency").eq("id", c.creatorId).maybeSingle(),
    loadCustomerEmailCopy(db, c.creatorId),
    customerEmailCopyReady(db, c.creatorId).catch(() => false),
    loadBrand(db, c.creatorId).catch(() => null),
  ])
  return physicalJson({
    shop: {
      name: store?.name || identity.fromName || "Your store",
      supportEmail: store?.email || identity.replyTo || null,
      storeUrl: store?.websiteUrl ?? null,
      logoUrl: store?.logoUrl ?? null,
      phone: store?.phone ?? null,
      currency: (creator?.payout_currency as string | null) || "USD",
      accent: look?.accent ?? null,
    },
    copy,
    ready,
  })
}

export async function PUT(request: Request) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const body = await readBody(request)
  if (!body) return physicalJson({ error: "Bad request." }, 400)
  const done = await saveCustomerEmailCopy(c.db, c.creatorId, body.id, body.copy === null ? null : body.copy)
  if (!done.ok) return physicalJson({ error: done.error }, done.status)
  const name = CUSTOMER_EMAILS.find((e) => e.id === body.id)?.name ?? null
  await recordActivity(c.db, c, { action: "settings.customer_emails", subjectType: "customer_email", subjectId: String(body.id), subjectLabel: name })
  return physicalJson({ copy: done.copy })
}
