import { NextResponse } from "next/server"
import { physicalJson, readBody, shopCaller } from "@/lib/physical/auth"
import { renderEmail } from "@/lib/notify/templates"
import { baseUrl as storelibBase } from "@/lib/notify/urls"
import { loadReviewsApp } from "@/lib/reviews/app-server"
import { mergeReviewsApp } from "@/lib/reviews/app-settings"
import { emailCopyFor } from "@/lib/reviews/request-copy"
import { mediaUrl } from "@/lib/storage/media-url"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Reviews › Requests › Email: the request email as a buyer would get it,
 * drawn by the same template the hourly run sends (lib/notify/templates
 * reviewAsk) with the words being typed, before they are saved.
 *
 *   POST { email: {...}, reminder?: boolean }  → { subject, fromName, html }
 *
 * The store's newest product and its name stand in for a real order, and
 * "Maya" for the buyer. The links in it lead nowhere: the page draws it in a
 * frame that runs nothing.
 */
const SAMPLE_TOKEN = "AAAAAAAAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAA"

export async function POST(request: Request) {
  const c = await shopCaller("products")
  if (c instanceof NextResponse) return c
  const body = await readBody(request)
  const { settings: saved } = await loadReviewsApp(c.db, c.creatorId)
  const settings = mergeReviewsApp(saved, { email: body?.email ?? {}, request: body?.request ?? {} })
  const reminder = body?.reminder === true
  const [{ data: product }, { data: creator }, { data: store }] = await Promise.all([
    c.db.from("products").select("id, title, thumbnail_url").eq("creator_id", c.creatorId).neq("status", "deleted").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    c.db.from("creators").select("display_name, slug, support_email").eq("id", c.creatorId).maybeSingle(),
    c.db.from("store_settings").select("store_name").eq("creator_id", c.creatorId).maybeSingle(),
  ])
  const p = (product ?? null) as { id: string; title: string | null; thumbnail_url: string | null } | null
  const cr = (creator ?? {}) as { display_name?: string | null; slug?: string | null; support_email?: string | null }
  const storeName = ((store as { store_name?: string | null } | null)?.store_name || cr.display_name || cr.slug || "Your store").trim()
  const title = p?.title || "Linen apron"
  const copy = emailCopyFor(settings, { firstName: "Maya", product: title, store: storeName }, reminder)
  const rendered = renderEmail(
    reminder ? "REVIEW_REMINDER" : "REVIEW_REQUEST",
    {
      productTitle: title,
      productId: p?.id ?? "",
      productImage: mediaUrl(p?.thumbnail_url ?? null) ?? "",
      creatorName: storeName,
      creatorSupportEmail: cr.support_email ?? "",
      reviewToken: SAMPLE_TOKEN,
      reminderOn: settings.request.reminder,
      copySubject: copy.subject ?? "",
      copyHeading: copy.heading ?? "",
      copyParagraphs: copy.paragraphs ?? [],
      copyButton: copy.button ?? "",
      copyFromName: copy.fromName ?? "",
      hideProduct: !copy.showProduct,
    },
    { baseUrl: storelibBase(), recipientName: "Maya", unsubscribeUrl: `${storelibBase()}/api/notify/unsubscribe`, preferencesUrl: null, when: null },
  )
  return physicalJson({ subject: rendered.subject, fromName: rendered.fromName ? `${rendered.fromName} via Storelib` : "Storelib", html: rendered.html })
}
