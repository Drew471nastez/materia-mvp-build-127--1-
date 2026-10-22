/**
 * GET  Where Supabase sends a creator back after they allowed Storelib to
 * read their projects. The state must be ours, unexpired and name a site the
 * person signed in now owns; the code is traded (with the PKCE verifier) for
 * a token, which is sealed into a cookie only ./projects reads. Then back to
 * Connections, which lists the projects to pick from.
 */
import { NextResponse } from "next/server"
import { open, seal } from "@/lib/ai-keys/crypto"
import { verifyState } from "@/lib/github-sync/core"
import { ownInstall } from "@/lib/github-sync/own-install"
import { handBackToApp } from "@/lib/connect/app-return"
import {
  COOKIE_PATH,
  TOKEN_COOKIE,
  TOKEN_MAX_AGE_S,
  VERIFIER_COOKIE,
  callbackUrl,
  exchangeCode,
  supabaseOAuthConfig,
} from "@/lib/website-builder/supabase-connect"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function back(req: Request, installId: string | null, result: string) {
  const url = new URL(installId ? `/website-builder/editor/${installId}` : "/app/website-builder", req.url)
  url.searchParams.set("settings", "connections")
  url.searchParams.set("supabase", result)
  const res = NextResponse.redirect(url)
  res.cookies.set(VERIFIER_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: COOKIE_PATH, maxAge: 0 })
  return res
}

export async function GET(req: Request) {
  const cfg = supabaseOAuthConfig()
  const q = new URL(req.url).searchParams
  const state = verifyState(q.get("state"), cfg?.clientSecret)
  if (!cfg || !state) return back(req, null, "expired")
  /* Started in the phone app, and this is its in-app browser: finished in the app, where the verifier cookie is (lib/connect/app-return.ts). */
  const handBack = handBackToApp(req, state)
  if (handBack) return handBack

  const own = await ownInstall(state.installId)
  if (!own || own.creatorId !== state.creatorId) return back(req, null, "expired")

  const code = q.get("code") ?? ""
  if (!code) return back(req, own.installId, "cancelled")

  const sealed = req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${VERIFIER_COOKIE}=([^;]+)`))?.[1]
  const verifier = sealed ? open(decodeURIComponent(sealed)) : null
  if (!verifier) return back(req, own.installId, "expired")

  const token = await exchangeCode(cfg, code, verifier, callbackUrl(req))
  if (!token) return back(req, own.installId, "failed")

  const res = back(req, own.installId, "pick")
  res.cookies.set(TOKEN_COOKIE, seal(JSON.stringify({ token, installId: own.installId })), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: COOKIE_PATH,
    maxAge: TOKEN_MAX_AGE_S,
  })
  return res
}
