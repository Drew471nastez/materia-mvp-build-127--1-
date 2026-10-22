import { NextResponse } from "next/server"
import { shopCaller } from "@/lib/physical/auth"
import { loadCustomerEmailCopy } from "@/lib/emails/customer-copy-server"
import { storePreview } from "@/lib/emails/customer-preview-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Settings › Customer emails: one email as it is sent, drawn by its own
 * template with the store's name, logo, contact, website and saved words,
 * in the language and under the name the place it was bought decides
 * (?channel=website|storelib, ?lang=fr), with sample items and buyer
 * (lib/emails/customer-preview-server.ts). The owner's alone; the page shows
 * it in a sandboxed frame.
 */
export async function GET(request: Request) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const q = new URL(request.url).searchParams
  const id = q.get("id") ?? ""
  const saved = await loadCustomerEmailCopy(c.db, c.creatorId)
  const { mail } = await storePreview(c.db, c.creatorId, id, saved[id], { channel: q.get("channel") === "storelib" ? "storelib" : "website", lang: q.get("lang") })
  if (!mail) return NextResponse.json({ error: "That email was not found." }, { status: 404 })
  return NextResponse.json({ subject: mail.subject, html: mail.html }, { headers: { "Cache-Control": "no-store" } })
}
