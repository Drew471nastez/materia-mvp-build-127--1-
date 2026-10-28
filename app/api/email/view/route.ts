/**
 * ===========================================================================
 *  VIEW IN BROWSER
 * ===========================================================================
 * GET ?t=<signed token> -> the campaign email as one HTML document
 * (lib/email-campaigns/view-online-server.ts). Public: the token is the key,
 * signed by the server, so an id alone opens nothing. The page runs no
 * script, counts no open, is never indexed, never cached by a shared cache,
 * and sends no referrer, so the token does not travel to the sites it links.
 * A token that is not one ours, or an email that has no page (a draft, a
 * deleted one), answers one plain "not found" page.
 */
import { type NextRequest } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { renderViewOnline } from "@/lib/email-campaigns/view-online-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const VIEW_HEADERS: Record<string, string> = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  /* The email is HTML the renderer wrote; the page still runs nothing and is framed by nobody. */
  "Content-Security-Policy": "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; font-src https:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
}

const GONE = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Email not found</title></head><body style="margin:0;padding:64px 16px;background:#f8f9fa;font-family:Inter,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a2e;text-align:center"><p style="margin:0;font-size:16px;font-weight:600">This email is not available</p><p style="margin:8px 0 0;font-size:14px;color:#6b7280">The link may be cut off. Open the email in your inbox instead.</p></body></html>`

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("t")
  try {
    const view = await renderViewOnline(createAdminClient(), token)
    if (view.ok) return new Response(view.html, { status: 200, headers: VIEW_HEADERS })
  } catch {
    /* A read that failed is the same page as a link that leads nowhere. */
  }
  return new Response(GONE, { status: 404, headers: VIEW_HEADERS })
}
