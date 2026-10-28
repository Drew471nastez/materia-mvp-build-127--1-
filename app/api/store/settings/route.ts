import { NextResponse, after } from "next/server"
import { sellerStatementName } from "@/lib/payments/statement-name-server"
import { pushStatementName } from "@/lib/payments/stripe/descriptor"
import { headers } from "next/headers"
import { physicalJson, readBody, shopCaller } from "@/lib/physical/auth"
import { OWNER_KEEPS_SETTING, memberMaySave } from "@/lib/team/settings"
import { detectedCountry, loadStoreSettings, saveStoreSettings } from "@/lib/store/settings-server"
import { recordActivity } from "@/lib/activity/log-server"
import { storeIdentity } from "@/lib/store/identity-server"
import { readStoreCurrency } from "@/lib/store/selling-currency-read"
import { revalidateTag } from "next/cache"
import { readinessChanged } from "@/lib/physical/readiness-server"
import { creatorShopTag, revalidatePublishedSite } from "@/lib/website-builder/published-site"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Settings › Store details and Settings › Checkout. Every shop has them,
 * whatever it sells, so the owner check alone (no physical commerce switch).
 * `detectedCountry` is where the request came from, for suggesting a
 * country the person has not chosen yet.
 */
export async function GET() {
  /* Round 41: the owner, or a team member with Store settings (Store details only, lib/team/settings). */
  const c = await shopCaller(["store", "settings"])
  if (c instanceof NextResponse) return c
  const db = c.db
  const [settings, h, creator, account, fallback, selling] = await Promise.all([
    loadStoreSettings(c.db, c.creatorId),
    headers(),
    db.from("creators").select("support_email, display_name, username").eq("id", c.creatorId).maybeSingle(),
    /* The store owner's sign in email, never a team member's own. */
    db.auth.admin.getUserById(c.ownerUserId ?? c.userId).catch(() => null),
    /* What receipts show when no store logo is set: the website's logo, else the person's photo. */
    storeIdentity(db, c.creatorId, { skipStoreLogo: true, logoOnly: true }).catch(() => null),
    /* The currency the store sells in (Settings › Store details), never the payout currency. */
    readStoreCurrency(db, c.creatorId),
  ])
  /*
    WHAT TO START FROM WHEN NOTHING IS SAVED YET: the name the store already
    goes by on Storelib and the email the account signs in with. Only ever a
    starting value in the form; nothing is written until Save, and a saved
    value is never replaced by these.
  */
  const row = creator?.data as { support_email?: string | null; display_name?: string | null; username?: string | null } | null
  const suggested = {
    storeName: (row?.display_name || row?.username || "").trim().slice(0, 80) || null,
    contactEmail: account?.data?.user?.email ?? null,
  }
  return physicalJson({ settings, detectedCountry: detectedCountry(h), supportEmail: row?.support_email ?? null, currency: selling.currency, suggested, logoDefault: fallback?.logoUrl ? { url: fallback.logoUrl, from: fallback.logoFrom } : null })
}

export async function PUT(request: Request) {
  const c = await shopCaller(["store", "settings"])
  if (c instanceof NextResponse) return c
  const body = await readBody(request)
  if (!body) return physicalJson({ error: "Bad request." }, 400)
  /* A team member changes the store's name, contact, phone and logo; checkout, business details and the rest stay the owner's. */
  if (c.isOwner === false && !memberMaySave(body)) return physicalJson({ error: OWNER_KEEPS_SETTING }, 403)
  const saved = await saveStoreSettings(c.db, c.creatorId, body)
  if (!saved.ok) return physicalJson({ error: saved.error }, saved.status)
  await recordActivity(c.db, c, { action: "checkout" in body ? "settings.checkout" : "settings.store" })
  /* Home's and Products' checklist reads the contact email and the business details (lib/physical/readiness-server): asked again now, so a fixed item goes at once. */
  if ("supportEmail" in body || "legal" in body) readinessChanged(c)
  /*
    The store's name and contact are the website's shop.name and shop.email: the live site shows a change now, not in a minute.
    EXPIRED, NOT "max": in Next 16 "max" marks the entry stale and hands the next visitor the old name while a new one is read.
  */
  if ("storeName" in body || "supportEmail" in body) {
    try {
      revalidateTag(creatorShopTag(c.creatorId), { expire: 0 })
      await revalidatePublishedSite(c.creatorId)
    } catch {
      /* The site catches up on its own within a minute. */
    }
  }
  /* A renamed store renames its bank statement line too, on Stripe, unless the seller typed their own (lib/payments/statement-name-server). */
  /* The bank statement line is the payments account's: renamed by the owner's save only. */
  if ("storeName" in body && c.isOwner !== false) {
    const db = c.db
    const creatorId = c.creatorId
    after(async () => {
      try {
        const { data } = await db.from("creators").select("stripe_account_id").eq("id", creatorId).maybeSingle()
        const account = (data as { stripe_account_id?: string | null } | null)?.stripe_account_id
        if (account) await pushStatementName(account, await sellerStatementName(db, creatorId))
      } catch {
        /* Checkout still sends the new name with every sale. */
      }
    })
  }
  return physicalJson({ settings: saved.settings })
}
