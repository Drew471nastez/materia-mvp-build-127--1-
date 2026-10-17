import { NextResponse } from "next/server"
import { physicalJson, readBody, shopCaller } from "@/lib/physical/auth"
import { readCopy, type EmailCopy } from "@/lib/emails/customer-custom"
import { customerEmailCopyReady, loadCustomerEmailCopy, saveCustomerEmailCopy } from "@/lib/emails/customer-copy-server"
import { inEmailLanguage } from "@/lib/emails/words"
import { emailLanguageFor } from "@/lib/emails/words-server"
import { storeIdentity } from "@/lib/store/identity-server"
import { loadBrand } from "@/lib/email-campaigns/brand-server"
import { mediaUrl } from "@/lib/storage/media-url"
import { appUrl } from "@/lib/notify/urls"
import { REQUEST_EMAIL_IDS, sampleRequestEmail } from "@/lib/reviews/request-email"
import { loadReviewsApp } from "@/lib/reviews/app-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Storelib Reviews › Requests › Request email: the store's own subject,
 * heading, text and button for the ask and the reminder, kept with its other
 * customer email words (store_settings.customer_emails, lib/emails/
 * customer-custom.ts, ids review_request and review_reminder) and checked by
 * the same rules: plain text, known placeholders only. The store's owner only.
 *
 *   GET                     { ready, copy: { request, reminder } }
 *   POST { kind, copy }     a preview of the email with these words, not saved
 *   PUT  { kind, copy }     saved; `copy: null` puts the standard words back
 */
type Kind = keyof typeof REQUEST_EMAIL_IDS
const kindOf = (v: unknown): Kind | null => (v === "request" || v === "reminder" ? v : null)

export async function GET() {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const [ready, copy] = await Promise.all([customerEmailCopyReady(c.db, c.creatorId), loadCustomerEmailCopy(c.db, c.creatorId)])
  return physicalJson({ ready, copy: { request: copy[REQUEST_EMAIL_IDS.request] ?? null, reminder: copy[REQUEST_EMAIL_IDS.reminder] ?? null } })
}

export async function POST(request: Request) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const body = await readBody(request)
  const kind = kindOf(body?.kind)
  if (!body || !kind) return physicalJson({ error: "Bad request." }, 400)
  const read = body.copy === null || body.copy === undefined ? ({ ok: true, copy: null } as const) : readCopy(REQUEST_EMAIL_IDS[kind], body.copy)
  if (read.ok === false) return physicalJson({ error: read.error }, 400)
  const [identity, brand, language, app, product] = await Promise.all([
    storeIdentity(c.db, c.creatorId).catch(() => null),
    loadBrand(c.db, c.creatorId).catch(() => null),
    emailLanguageFor(c.creatorId, null).catch(() => ({ lang: "en", words: {}, own: true })),
    loadReviewsApp(c.db, c.creatorId).catch(() => null),
    c.db.from("products").select("title, thumbnail_url").eq("creator_id", c.creatorId).eq("status", "published").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ])
  const p = (product?.data ?? null) as { title?: string | null; thumbnail_url?: string | null } | null
  const mail = inEmailLanguage(language.lang, language.words, () =>
    sampleRequestEmail({
      reminder: kind === "reminder",
      shopName: identity?.name || brand?.name || "Your store",
      logoUrl: identity?.logoUrl ?? brand?.logoUrl ?? null,
      accent: brand?.accent ?? null,
      websiteUrl: identity?.websiteUrl ?? null,
      productTitle: p?.title || "Linen apron",
      productImage: mediaUrl(p?.thumbnail_url ?? null) ?? null,
      reminderOn: app?.settings.request.reminder ?? true,
      copy: read.copy as EmailCopy | null,
      origin: appUrl("/"),
    }),
  )
  return physicalJson({ subject: mail.subject, html: mail.html })
}

export async function PUT(request: Request) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const body = await readBody(request)
  const kind = kindOf(body?.kind)
  if (!body || !kind) return physicalJson({ error: "Bad request." }, 400)
  const out = await saveCustomerEmailCopy(c.db, c.creatorId, REQUEST_EMAIL_IDS[kind], body.copy ?? null)
  if (!out.ok) return physicalJson({ error: out.error }, out.status)
  return physicalJson({ copy: out.copy[REQUEST_EMAIL_IDS[kind]] ?? null })
}
