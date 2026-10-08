/**
 * GET ?installId=  "Connect Supabase". Sends the creator to Supabase to sign
 * in and allow Storelib to read their projects, with a signed note of which
 * site this is for and a PKCE verifier kept in a sealed cookie. Supabase
 * sends them back to ./callback. See lib/website-builder/supabase-connect.ts.
 */
import { NextResponse } from "next/server"
import { seal } from "@/lib/ai-keys/crypto"
import { signState } from "@/lib/github-sync/core"
import { ownInstall } from "@/lib/github-sync/own-install"
import { COOKIE_PATH, VERIFIER_COOKIE, authorizeUrl, callbackUrl, pkce, supabaseOAuthConfig } from "@/lib/website-builder/supabase-connect"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const installId = new URL(req.url).searchParams.get("installId") ?? ""
  const own = await ownInstall(installId)
  if (!own) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const cfg = supabaseOAuthConfig()
  if (!cfg) return NextResponse.json({ error: "Supabase sign in is not set up on Storelib yet." }, { status: 503 })

  const { verifier, challenge } = pkce()
  const state = signState({ installId: own.installId, creatorId: own.creatorId }, cfg.clientSecret)
  const res = NextResponse.redirect(authorizeUrl(cfg, callbackUrl(req), state, challenge))
  res.cookies.set(VERIFIER_COOKIE, seal(verifier), { httpOnly: true, secure: true, sameSite: "lax", path: COOKIE_PATH, maxAge: 600 })
  return res
}
