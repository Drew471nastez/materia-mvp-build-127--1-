import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { physicalJson, readBody, shopCaller } from "@/lib/physical/auth"
import { detectedCountry, loadStoreSettings, saveStoreSettings } from "@/lib/store/settings-server"
import { recordActivity } from "@/lib/activity/log-server"
import { storeIdentity } from "@/lib/store/identity-server"
import { revalidateTag } from "next/cache"
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
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const db = c.db
  const [settings, h, creator, account, fallback] = await Promise.all([
    loadStoreSettings(c.db, c.creatorId),
    headers(),
    db.from("creators").select("support_email, payout_currency, display_name, username").eq("id", c.creatorId).maybeSingle(),
    db.auth.admin.getUserById(c.userId).catch(() => null),
    /* What receipts show when no store logo is set: the website's logo, else the person's photo. */
    storeIdentity(db, c.creatorId, { skipStoreLogo: true, logoOnly: true }).catch(() => null),
  ])
  /*
    WHAT TO START FROM WHEN NOTHING IS SAVED YET: the name the store already
    goes by on Storelib and the email the account signs in with. Only ever a
    starting value in the form; nothing is written until Save, and a saved
    value is never replaced by these.
  */
  const row = creator?.data as { support_email?: string | null; payout_currency?: string | null; display_name?: string | null; username?: string | null } | null
  const suggested = {
    storeName: (row?.display_name || row?.username || "").trim().slice(0, 80) || null,
    contactEmail: account?.data?.user?.email ?? null,
  }
  return physicalJson({ settings, detectedCountry: detectedCountry(h), supportEmail: row?.support_email ?? null, currency: row?.payout_currency ?? null, suggested, logoDefault: fallback?.logoUrl ? { url: fallback.logoUrl, from: fallback.logoFrom } : null })
}

export async function PUT(request: Request) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const body = await readBody(request)
  if (!body) return physicalJson({ error: "Bad request." }, 400)
  const saved = await saveStoreSettings(c.db, c.creatorId, body)
  if (!saved.ok) return physicalJson({ error: saved.error }, saved.status)
  await recordActivity(c.db, c, { action: "checkout" in body ? "settings.checkout" : "settings.store" })
  /* The store's name and contact are the website's shop.name and shop.email: the live site shows a change now, not in a minute. */
  if ("storeName" in body || "supportEmail" in body) {
    try {
      revalidateTag(creatorShopTag(c.creatorId), "max")
      await revalidatePublishedSite(c.creatorId)
    } catch {
      /* The site catches up on its own within a minute. */
    }
  }
  return physicalJson({ settings: saved.settings })
}
