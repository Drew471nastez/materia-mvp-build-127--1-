import { NextResponse } from "next/server"
import { physicalJson, readBody, shopCaller } from "@/lib/physical/auth"
import { readStoreCurrency } from "@/lib/store/selling-currency-read"
import { resolveCreatorIdentity } from "@/lib/email"
import { storeIdentity } from "@/lib/store/identity-server"
import { orderStoreUrl } from "@/lib/physical/store-link"
import { loadBrand } from "@/lib/email-campaigns/brand-server"
import { customerEmailCopyReady, loadCustomerEmailCopy, saveCustomerEmailCopy } from "@/lib/emails/customer-copy-server"
import { CUSTOMER_EMAILS } from "@/lib/emails/customer-catalog"
import { buyerEmailLanguage, emailLanguageFor, websiteEmailLanguages } from "@/lib/emails/words-server"
import { loadCheckoutConfig } from "@/lib/store/settings-server"
import { communitiesEnabled } from "@/lib/communities/flag"
import { recordActivity } from "@/lib/activity/log-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

/**
 * Emails › Customer emails (and Settings › Customer emails), in one read:
 * what every email signs with, so the page draws each preview itself, at
 * once, with lib/emails/customer-catalog.ts.
 *
 *   shop         the store's name, logo, contact and website: a website
 *                order's emails are signed with them
 *   creator      the creator's name and photo: a download bought on Storelib
 *                is signed with them (lib/emails/buyer-channel.ts)
 *   languages    the website's own language and its other published ones;
 *                `language` is the email words in the website's own
 *   copy         the store's own words for any email it changed
 *   communities  the owner's communities, whose emails are in the same list
 *   reminder     whether the checkout reminder is on (Settings › Checkout)
 *   sells        { physical, communitiesOn }: whether the store has a product
 *                it ships (null when it could not be read) and whether
 *                communities are on for Storelib, so a family it does not
 *                use says so instead of listing emails that never go out
 *                (lib/emails/family-use.ts)
 *
 *   GET                      all of the above
 *   GET ?lang=fr             { language }: the email words in one published language, for a preview in it
 *   GET ?channel=storelib    { language }: the words an email bought on Storelib is written in (English)
 *   PUT { id, copy, lang? }  one email's words; `copy: null` puts it back to the default;
 *                            `lang` (another published language) saves that language's words
 */
export async function GET(request: Request) {
  const c = await shopCaller("marketing", { read: true })
  if (c instanceof NextResponse) return c
  const db = c.db
  const q = new URL(request.url).searchParams
  const asked = q.get("lang")
  /* Bought on Storelib: English, with the store's own English checkout words (lib/emails/words-server.ts buyerEmailLanguage). */
  if (q.get("channel") === "storelib") return physicalJson({ language: await buyerEmailLanguage(c.creatorId, "storelib", null).catch(() => ({ lang: "en", words: {}, own: true })) })
  if (asked) {
    const language = await emailLanguageFor(c.creatorId, asked).catch(() => ({ lang: "en", words: {}, own: true }))
    return physicalJson({ language })
  }
  const communitiesOn = await communitiesEnabled().catch(() => false)
  const [identity, store, selling, copy, ready, look, website, languages, language, checkout, communities, physical] = await Promise.all([
    resolveCreatorIdentity(db, c.creatorId).catch(() => ({ fromName: "", replyTo: "", sellerEmail: "" })),
    storeIdentity(db, c.creatorId).catch(() => null),
    /* The store's selling currency, the one its customer emails are written in (never the payout currency). */
    readStoreCurrency(db, c.creatorId),
    loadCustomerEmailCopy(db, c.creatorId),
    customerEmailCopyReady(db, c.creatorId).catch(() => false),
    loadBrand(db, c.creatorId).catch(() => null),
    /* The live website, as the sent emails link it (lib/physical/store-link.ts), never the creator page. */
    orderStoreUrl({ creator_id: c.creatorId }),
    websiteEmailLanguages(c.creatorId),
    emailLanguageFor(c.creatorId, null).catch(() => ({ lang: "en", words: {}, own: true })),
    loadCheckoutConfig(db, c.creatorId).catch(() => null),
    communitiesOn ? ownCommunities(db, c.creatorId) : [],
    sellsPhysical(db, c.creatorId),
  ])
  return physicalJson({
    shop: {
      name: store?.name || identity.fromName || "Your store",
      supportEmail: store?.email || identity.replyTo || null,
      storeUrl: website || null,
      logoUrl: store?.logoUrl ?? null,
      logoFrom: store?.logoFrom ?? null,
      phone: store?.phone ?? null,
      currency: selling.currency,
      accent: look?.accent ?? null,
    },
    creator: { name: identity.fromName || look?.creatorName || store?.name || "", photoUrl: look?.avatarUrl ?? null, logoUrl: look?.logoUrl ?? null },
    languages,
    language,
    copy,
    ready,
    reminder: checkout ? checkout.abandonedRecovery : null,
    communities,
    sells: { physical, communitiesOn },
  })
}

/**
 * Whether the store has any product it ships, in any state (a draft is a
 * store setting up; an archived one can still have orders on their way).
 * One indexed row at most, the caller's own store only. A failed read is
 * null: the list is then shown as it always was.
 */
async function sellsPhysical(db: Db, creatorId: string): Promise<boolean | null> {
  try {
    const r = await db.from("products").select("id").eq("creator_id", creatorId).eq("type", "physical").limit(1)
    if (r.error) return null
    return Array.isArray(r.data) && r.data.length > 0
  } catch {
    return null
  }
}

/** The owner's communities, by name (asked only while communities are on). A read that fails lists none. */
async function ownCommunities(db: Db, creatorId: string): Promise<Array<{ id: string; name: string; slug: string }>> {
  try {
    const first = await db.from("communities").select("id, name, slug").eq("creator_id", creatorId).is("deleted_at", null).order("name")
    const read = first.error ? await db.from("communities").select("id, name, slug").eq("creator_id", creatorId).order("name") : first
    if (read.error) return []
    return ((read.data ?? []) as Array<{ id: string; name: string | null; slug: string | null }>).map((r) => ({ id: r.id, name: r.name || "", slug: r.slug || r.id }))
  } catch {
    return []
  }
}

export async function PUT(request: Request) {
  const c = await shopCaller("marketing")
  if (c instanceof NextResponse) return c
  const body = await readBody(request)
  if (!body) return physicalJson({ error: "Bad request." }, 400)
  const done = await saveCustomerEmailCopy(c.db, c.creatorId, body.id, body.copy === null ? null : body.copy, typeof body.lang === "string" && body.lang ? body.lang : null)
  if (!done.ok) return physicalJson({ error: done.error }, done.status)
  const name = CUSTOMER_EMAILS.find((e) => e.id === body.id)?.name ?? null
  await recordActivity(c.db, c, { action: "settings.customer_emails", subjectType: "customer_email", subjectId: String(body.id), subjectLabel: name })
  return physicalJson({ copy: done.copy })
}
