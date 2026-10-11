import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requestUser } from "@/lib/businesses/server"
import { LIMITS, rateLimit } from "@/lib/api/rate-limit"
import { ROLE_LABEL, ROLE_SUMMARY } from "@/lib/team/roles"
import { TEAM_STORE_COOKIE, acceptInvite, hashToken } from "@/lib/team/server"

/**
 * ===========================================================================
 *  THE LINK IN A TEAM INVITE
 * ===========================================================================
 * GET  shows the invite: signed out, to sign in first and come back here;
 *      signed in, a page with one button. Opening the link changes nothing,
 *      so an email scanner that opens every link accepts nobody.
 * POST is that button: the invite is accepted for the signed in account
 *      (its email has to be the one invited, lib/team/server.ts) and the
 *      store opens in the dashboard.
 */
export const dynamic = "force-dynamic"

function page(title: string, body: string, status = 200): NextResponse {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title} · Storelib</title><style>body{margin:0;background:#f8f9fa;font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif;color:#1a1a2e;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px;box-sizing:border-box}main{width:100%;max-width:440px;background:#fff;border-radius:16px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,.04);border:1px solid rgba(229,231,235,.6)}h1{margin:0 0 8px;font-size:22px;line-height:30px}p{margin:0 0 20px;font-size:15px;line-height:22px;color:#6b7280}button,a.btn{display:inline-block;width:100%;box-sizing:border-box;text-align:center;background:#1a1a2e;color:#fff;border:0;border-radius:12px;padding:12px 16px;font:600 15px/22px inherit;cursor:pointer;text-decoration:none}a.quiet{display:block;margin-top:12px;text-align:center;color:#6b7280;font-size:14px}</style></head><body><main>${body}</main></body></html>`
  return new NextResponse(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex", "Referrer-Policy": "no-referrer" } })
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const token = url.searchParams.get("token") ?? ""
  if (token.length < 20 || token.length > 100) return page("Invite", "<h1>This link is not complete</h1><p>Open it from the invite email again.</p>", 400)
  const user = await requestUser(req)
  if (!user) {
    const back = `/api/team/join?token=${encodeURIComponent(token)}`
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(back)}`, url.origin), 303)
  }
  const db = createAdminClient()
  const { data } = await db.from("store_team_members").select("creator_id, email, role, expires_at").eq("token_hash", hashToken(token)).maybeSingle()
  const invite = data as { creator_id: string; email: string; role: "manager" | "staff"; expires_at: string | null } | null
  if (!invite) return page("Invite", "<h1>This invite is no longer open</h1><p>It has been used, replaced or removed. Ask the store's owner to send a new one.</p><a class=\"btn\" href=\"/app\">Go to my dashboard</a>", 404)
  const { data: c } = await db.from("creators").select("slug, display_name").eq("id", invite.creator_id).maybeSingle()
  const store = esc(((c as { display_name?: string | null; slug?: string | null } | null)?.display_name || (c as { slug?: string | null } | null)?.slug || "this store"))
  const role = `${ROLE_LABEL[invite.role]}: ${ROLE_SUMMARY[invite.role].toLowerCase()}`
  if (!user.email || user.email.toLowerCase() !== invite.email) {
    return page("Invite", `<h1>Sign in as ${esc(invite.email)}</h1><p>This invite to ${store} was sent to ${esc(invite.email)}. You're signed in with another account.</p><a class="btn" href="/login?next=${encodeURIComponent(`/api/team/join?token=${token}`)}">Use another account</a>`, 403)
  }
  return page(
    "Join the team",
    `<h1>Join ${store}</h1><p>You've been invited as ${esc(role)}. You'll work in it from your own dashboard, and you can go back to your own account any time.</p><form method="post" action="/api/team/join"><input type="hidden" name="token" value="${esc(token)}"><button type="submit">Accept and open the store</button></form><a class="quiet" href="/app">Not now</a>`,
  )
}

export async function POST(req: Request) {
  /* Only this page's own button: a form on another site is refused before anything is read. */
  const origin = req.headers.get("origin")
  if (origin && origin !== new URL(req.url).origin) return page("Invite", "<h1>Open the invite from your email</h1><p>This request did not come from Storelib.</p>", 403)
  const user = await requestUser(req)
  const form = await req.formData().catch(() => null)
  const token = String(form?.get("token") ?? "")
  if (!user) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(`/api/team/join?token=${token}`)}`, req.url), 303)
  const limited = await rateLimit({ bucket: "team-accept", subjects: [`user:${user.id}`], windows: LIMITS.claim, message: "Too many tries." })
  if (limited) return page("Invite", "<h1>Too many tries</h1><p>Wait a few minutes and open the link again.</p>", 429)
  const out = await acceptInvite(createAdminClient(), token, user)
  if (out.ok === false) return page("Invite", `<h1>Could not join</h1><p>${esc(out.error)}</p><a class="btn" href="/app">Go to my dashboard</a>`, out.status)
  const res = NextResponse.redirect(new URL("/app", req.url), 303)
  res.cookies.set(TEAM_STORE_COOKIE, out.creatorId, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 24 * 90 })
  return res
}
