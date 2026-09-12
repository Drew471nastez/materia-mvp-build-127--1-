import { NextRequest, NextResponse } from "next/server"
import { createHash, timingSafeEqual } from "node:crypto"
import { ADMIN_COOKIE, SESSION_MAX_AGE, issueSessionToken } from "@/lib/admin-session"

/** `node:crypto`, and a cookie that must be set on the real host. */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  SIGNING IN TO THE ADMIN
 * ===========================================================================
 * The username and the password were written here, in the repository:
 *
 *     const USERNAME = "storelib"
 *     const PASSWORD = "…"
 *
 * so everybody who could read the repo could sign in, and the only way to
 * change either was a deploy. They come from the environment now.
 *
 * THERE IS NO DEFAULT PASSWORD. With `BLOG_ADMIN_PASSWORD` unset this route
 * refuses everybody, including whoever set it up, because a default password
 * on an endpoint that can delete accounts is the same bug in a different
 * place. Set it in the environment and the login works again; the username
 * keeps its old value unless `BLOG_ADMIN_USER` says otherwise.
 */
const EXPECTED_USER = (process.env.BLOG_ADMIN_USER || "storelib").trim()

/** Constant time, and length-independent because the digests are equal size. */
function sameSecret(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest()
  const hb = createHash("sha256").update(b).digest()
  return timingSafeEqual(ha, hb)
}

export async function POST(req: NextRequest) {
  const expectedPassword = process.env.BLOG_ADMIN_PASSWORD ?? ""
  if (!expectedPassword) {
    return NextResponse.json(
      { error: "Blog admin is not configured. Set BLOG_ADMIN_PASSWORD in the environment." },
      { status: 503 },
    )
  }

  let username = ""
  let password = ""
  try {
    const body = await req.json()
    username = typeof body.username === "string" ? body.username.trim() : ""
    password = typeof body.password === "string" ? body.password : ""
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  /**
   * Both compared, and both in constant time, and the answer is the same
   * either way: "invalid credentials" never says which half was wrong.
   */
  const ok = sameSecret(username, EXPECTED_USER) && sameSecret(password, expectedPassword)
  if (!ok) return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })

  const token = issueSessionToken()
  if (!token) {
    return NextResponse.json(
      { error: "Blog admin is not configured. Set BLOG_ADMIN_SECRET in the environment." },
      { status: 503 },
    )
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    // The cookie opens an admin. It has no business leaving HTTPS, and no
    // business being sent from anybody else's page.
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  })
  return res
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.delete(ADMIN_COOKIE)
  return res
}
