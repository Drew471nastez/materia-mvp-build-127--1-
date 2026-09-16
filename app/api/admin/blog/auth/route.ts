import { NextRequest, NextResponse } from "next/server"
import { createHash, scryptSync, timingSafeEqual } from "node:crypto"
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
 * THERE IS A BUILT-IN CREDENTIAL AGAIN, AND IT IS NOT WRITTEN DOWN.
 *
 * What was asked for is a login that works with nothing configured. What that
 * cannot mean is the password back in this file as a string. This cookie
 * opens a dashboard over the whole platform and, through
 * /api/admin/spam-purge, can delete user accounts — and a password in source
 * is a password that everybody with the repository has, that stays in the
 * history long after it is changed, and that gets tried on other things
 * because people reuse passwords.
 *
 * So what is in the file is a SCRYPT DIGEST and the salt it was made with.
 * The login works exactly as asked with nothing set anywhere; reading this
 * file does not tell you the password; and scrypt is deliberately slow and
 * memory-hard, so the digest is not a cheap thing to guess against either.
 *
 * `BLOG_ADMIN_PASSWORD` still wins when it is set. That is how to rotate
 * without a deploy, and how to have a password this file has never seen.
 * `BLOG_ADMIN_USER` still overrides the username, which is compared without
 * regard to case because a username is not a secret.
 */
const EXPECTED_USER = (process.env.BLOG_ADMIN_USER || "storelib").trim()

/**
 * The built-in credential. `scryptSync(password, salt, 32)` and the salt,
 * both hex. Changing the password without an environment variable means
 * replacing these two lines with a fresh pair.
 */
const BUILTIN_SALT = "f541f0ac1d61bdf5f7d4cdb491dcef77"
const BUILTIN_DIGEST = "43235df7deb6e096ac31b957e9ed18a166d37b950044a6533b8d4df171b3fe46"

/** Constant time against the built-in digest. */
function matchesBuiltin(password: string): boolean {
  const want = Buffer.from(BUILTIN_DIGEST, "hex")
  let got: Buffer
  try {
    got = scryptSync(password, BUILTIN_SALT, want.length)
  } catch {
    return false
  }
  return got.length === want.length && timingSafeEqual(got, want)
}

/** Constant time, and length-independent because the digests are equal size. */
function sameSecret(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest()
  const hb = createHash("sha256").update(b).digest()
  return timingSafeEqual(ha, hb)
}

export async function POST(req: NextRequest) {
  /* The environment when it is set, the built-in digest when it is not.
     Never a default written out as a string. */
  const expectedPassword = process.env.BLOG_ADMIN_PASSWORD ?? ""

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
   *
   * THE USERNAME IS FOLDED TO LOWER CASE AND THE PASSWORD IS NOT, which is a
   * deliberate asymmetry rather than an oversight.
   *
   * The password is a secret: every byte of it counts, and comparing it
   * loosely would hand an attacker a smaller space to search. The username is
   * not a secret at all — its default is written in this file, in the
   * repository — so the only thing case-sensitivity there can do is refuse
   * the right person. It very nearly did: the login was typed as "Storelib"
   * and, because this refusal says nothing about which half was wrong, that
   * would have read as a bad password for as long as it took to notice the
   * capital letter.
   *
   * Lowercasing before the digest keeps the comparison constant-time and
   * length-independent, because the digests are still equal size.
   */
  const ok =
    sameSecret(username.toLowerCase(), EXPECTED_USER.toLowerCase()) &&
    (expectedPassword ? sameSecret(password, expectedPassword) : matchesBuiltin(password))
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
