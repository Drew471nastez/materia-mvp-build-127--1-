import { NextResponse } from "next/server"
import { physicalJson, shopCaller } from "@/lib/physical/auth"
import { siteLanguages } from "@/lib/markets/live"
import { normalizeLocale } from "@/lib/markets/locales"
import { isPhysicalCommerceEnabled } from "@/lib/platform/physical-commerce"
import { checkoutPreviewData } from "@/lib/checkout-text/preview-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Settings › Checkout › Checkout text, the preview. GET ?lang=: what the
 * website's checkout would be handed for a buyer of this store in that
 * language (lib/checkout-text/preview-server.ts): its name and logo, its
 * settings, its currency, the checkout's words without the store's own, and
 * one download and one product that ships, priced by the checkout's own
 * quote, with the thank you and order pages for the same order. The editor
 * hands it to the real checkout in a frame (app/checkout/preview). The
 * store's (shopCaller). Reads only.
 */
export async function GET(request: Request) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const langs = await siteLanguages(c.creatorId).catch(() => null)
  const all = langs ? [langs.defaultLanguage, ...langs.others] : ["en"]
  const want = normalizeLocale(new URL(request.url).searchParams.get("lang"))
  const lang = (want && all.find((l) => l.toLowerCase() === want.toLowerCase())) || all[0] || "en"
  const physical = await isPhysicalCommerceEnabled().catch(() => false)
  const data = await checkoutPreviewData(c.db, c.creatorId, lang, { physical })
  return physicalJson(data)
}
