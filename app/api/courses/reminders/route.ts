import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { verifyLink } from "@/lib/email-campaigns/link-sign"
import { isUuid } from "@/lib/courses/access"
import { STOP_PURPOSE } from "@/lib/courses/nudge"
import { PRIVATE, sessionUserId } from "@/lib/courses/route-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * /api/courses/reminders: the emails about one course, off or on.
 *
 *   GET  ?e=<enrollment>&s=<signature>   the link in every course email: a
 *        page with one button. A GET never changes anything, because mail
 *        scanners open every link in an email before the reader does.
 *   POST ?e=<enrollment>&s=<signature>   that button, and the one click
 *        unsubscribe a mail client sends (RFC 8058). Turns them off.
 *   POST { productId, emailsOff }          the switch in the player, for the
 *        signed in buyer's own course.
 *
 * The signature is made with the server's link key over the enrollment id
 * (lib/email-campaigns/link-sign), so the link works without signing in and
 * cannot be changed to turn off somebody else's.
 */

function page(title: string, body: string, form?: { action: string }): NextResponse {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title></head><body style="margin:0;background:#f8f9fa;font-family:Inter,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a2e"><main style="max-width:420px;margin:12vh auto 0;padding:0 16px"><div style="background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:28px 24px"><h1 style="margin:0 0 8px;font-size:20px">${title}</h1><p style="margin:0;font-size:15px;line-height:1.55;color:#4b5563">${body}</p>${
    form
      ? `<form method="post" action="${form.action}" style="margin-top:20px"><button type="submit" style="height:44px;padding:0 18px;border:0;border-radius:8px;background:#1a1a2e;color:#fff;font-size:15px;font-weight:600;cursor:pointer">Stop these emails</button></form>`
      : ""
  }<p style="margin:20px 0 0;font-size:14px"><a href="/account/library/courses" style="color:#6d28d9">Your courses</a></p></div></main></body></html>`
  return new NextResponse(html, { headers: { ...PRIVATE, "Content-Type": "text/html; charset=utf-8" } })
}

function signed(url: URL): string | null {
  const e = url.searchParams.get("e")
  const s = url.searchParams.get("s")
  return isUuid(e) && verifyLink(e, STOP_PURPOSE, s) ? e : null
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const id = signed(url)
  if (!id) return page("This link has expired", "Open the course in your library to change its emails.")
  return page("Stop emails about this course?", "You will not get progress reminders or a note when you finish. Your course and your place in it stay as they are.", {
    action: `/api/courses/reminders?e=${encodeURIComponent(id)}&s=${encodeURIComponent(url.searchParams.get("s") ?? "")}`,
  })
}

export async function POST(request: Request) {
  const url = new URL(request.url)
  const admin = createAdminClient()

  const id = signed(url)
  if (id) {
    await admin.from("course_enrollments").update({ emails_off: true, updated_at: new Date().toISOString() }).eq("id", id)
    /* A mail client's one click wants a plain 200; a person pressing the button wants a page. */
    const fromForm = (request.headers.get("content-type") ?? "").includes("application/x-www-form-urlencoded") && !(await request.clone().text()).includes("List-Unsubscribe")
    return fromForm ? page("Done", "You will not get emails about this course again. Turn them back on from the course in your library.") : NextResponse.json({ ok: true }, { headers: PRIVATE })
  }

  const userId = await sessionUserId()
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401, headers: PRIVATE })
  let body: { productId?: unknown; emailsOff?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400, headers: PRIVATE })
  }
  if (!isUuid(body.productId) || typeof body.emailsOff !== "boolean") return NextResponse.json({ error: "Bad request" }, { status: 400, headers: PRIVATE })
  const { data, error } = await admin
    .from("course_enrollments")
    .update({ emails_off: body.emailsOff, updated_at: new Date().toISOString() })
    .eq("buyer_id", userId)
    .eq("product_id", body.productId)
    .select("id")
  if (error || !data || data.length === 0) return NextResponse.json({ error: "Open a lesson first, then try again." }, { status: 409, headers: PRIVATE })
  return NextResponse.json({ ok: true, emailsOff: body.emailsOff }, { headers: PRIVATE })
}
