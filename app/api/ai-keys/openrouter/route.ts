/**
 * ===========================================================================
 *  CONNECT OPENROUTER IN ONE CLICK
 * ===========================================================================
 * GET ?installId=  sends the creator to OpenRouter to sign in and approve a
 * key for Storelib (OAuth with PKCE, openrouter.ai/docs/use-cases/oauth-pkce).
 * OpenRouter sends them back to ./callback with a code, which only this
 * browser can turn into a key: the verifier it needs is in an httpOnly
 * cookie set here, and never leaves the server's hands otherwise.
 *
 * Why OpenRouter: it is the one way to connect somebody's own AI account
 * without asking them to find and paste a key, and it answers for Claude
 * and ChatGPT both, billed to them. Claude.ai and ChatGPT subscriptions
 * cannot be signed into from another website; a Claude or OpenAI key can be
 * pasted instead (POST /api/ai-keys).
 */
import { createHash, randomBytes } from "node:crypto"
import { NextResponse, type NextRequest } from "next/server"
import { currentCreatorId } from "@/lib/creators/current"
import { PKCE_COOKIE, returnPath } from "@/lib/ai-keys/openrouter"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const creatorId = await currentCreatorId()
  if (!creatorId) return NextResponse.redirect(new URL("/login", request.url))

  const verifier = randomBytes(32).toString("base64url")
  const challenge = createHash("sha256").update(verifier).digest("base64url")
  const back = returnPath(request.nextUrl.searchParams.get("installId"))

  const auth = new URL("https://openrouter.ai/auth")
  auth.searchParams.set("callback_url", new URL("/api/ai-keys/openrouter/callback", request.url).toString())
  auth.searchParams.set("code_challenge", challenge)
  auth.searchParams.set("code_challenge_method", "S256")
  auth.searchParams.set("key_label", "Storelib")

  const res = NextResponse.redirect(auth)
  res.cookies.set(PKCE_COOKIE, JSON.stringify({ v: verifier, b: back, c: creatorId }), {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/api/ai-keys/openrouter",
    maxAge: 600,
  })
  return res
}
