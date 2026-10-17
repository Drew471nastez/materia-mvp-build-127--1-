import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin/gate"
import { emailGallery, renderGalleryEmail } from "@/lib/admin/email-gallery"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/admin/emails            -> { emails }: every email Storelib sends, by section and category
 * GET /api/admin/emails?id=<id>    -> { subject, preview, html, text }: one, drawn with sample data
 * The admin cookie first. Sends nothing; no real person's data is in a preview (lib/admin/email-gallery.ts).
 */
export async function GET(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  const id = new URL(request.url).searchParams.get("id")
  if (!id) return NextResponse.json({ emails: emailGallery() }, { headers: { "Cache-Control": "no-store" } })
  try {
    const email = renderGalleryEmail(id)
    if (!email) return NextResponse.json({ error: "No such email." }, { status: 404 })
    return NextResponse.json(email, { headers: { "Cache-Control": "no-store" } })
  } catch (e) {
    console.error("[admin/emails] draw:", e instanceof Error ? e.message.slice(0, 200) : "unknown")
    return NextResponse.json({ error: "This email could not be drawn. The server log has why." }, { status: 500 })
  }
}
