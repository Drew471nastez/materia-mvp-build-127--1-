import "server-only"

/**
 * One of the store's customer emails as it goes out, read for the server:
 * Send test (app/api/store/emails/test) and the preview route draw it with
 * the same name, logo, currency, language and signature the page's own
 * preview uses (lib/emails/customer-catalog.ts previewCustomerEmail), so a
 * test in the inbox is the preview on screen.
 */
import { resolveCreatorIdentity } from "@/lib/email"
import { storeIdentity } from "@/lib/store/identity-server"
import { orderStoreUrl } from "@/lib/physical/store-link"
import { loadBrand } from "@/lib/email-campaigns/brand-server"
import { readStoreCurrency } from "@/lib/store/selling-currency-read"
import { previewCustomerEmail } from "./customer-catalog"
import { buyerEmailLanguage } from "./words-server"
import { settleLogoShapes } from "./logo-shape-server"
import type { BuyerChannel } from "./buyer-channel"
import type { EmailCopy } from "./customer-custom"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export async function storePreview(db: Db, creatorId: string, id: string, words: EmailCopy | null | undefined, opts: { channel?: BuyerChannel; lang?: string | null } = {}): Promise<{ name: string; mail: { subject: string; html: string; text: string } | null }> {
  const channel: BuyerChannel = opts.channel === "storelib" ? "storelib" : "website"
  const [identity, store, selling, look, website, language] = await Promise.all([
    resolveCreatorIdentity(db, creatorId).catch(() => ({ fromName: "", replyTo: "", sellerEmail: "" })),
    storeIdentity(db, creatorId).catch(() => null),
    /* The store's selling currency, the one its customer emails are written in (never the payout currency). */
    readStoreCurrency(db, creatorId),
    loadBrand(db, creatorId).catch(() => null),
    /* The live website, as the sent emails link it (lib/physical/store-link.ts), never the creator page. */
    orderStoreUrl({ creator_id: creatorId }),
    buyerEmailLanguage(creatorId, channel, opts.lang ?? null).catch(() => null),
  ])
  const shopName = store?.name || identity.fromName || "Your store"
  const creatorName = identity.fromName || look?.creatorName || shopName
  const mail = previewCustomerEmail(
    id,
    {
      name: shopName,
      supportEmail: store?.email || identity.replyTo || null,
      storeUrl: website || null,
      logoUrl: store?.logoUrl ?? null,
      logoFrom: store?.logoFrom ?? null,
      phone: store?.phone ?? null,
      currency: selling.currency,
      accent: look?.accent ?? null,
    },
    words,
    { channel, language, creator: { name: creatorName, photoUrl: look?.avatarUrl ?? null, logoUrl: look?.logoUrl ?? null } },
  )
  /* The logo settled as the sent email's is (lib/emails/logo-shape-server.ts): the name beside a square one. */
  if (mail) mail.html = await settleLogoShapes(mail.html)
  /* Who the inbox shows it from: the shop, or the creator for a download bought on Storelib. */
  const signed = (channel === "storelib" && (id === "receipt" || id === "digital_refund")) || id.startsWith("membership_") ? creatorName : shopName
  return { name: signed, mail }
}
