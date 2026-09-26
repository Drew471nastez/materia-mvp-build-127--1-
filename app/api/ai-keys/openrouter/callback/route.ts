/**
 * Back from OpenRouter with `?code=`: the code and this browser's verifier
 * (the cookie ../route.ts set) become the creator's own OpenRouter key,
 * which is kept sealed like a pasted one. Then back to the editor, on
 * Website settings, Connections, with `ownai=` saying how it went.
 */
import { NextResponse, type NextRequest } from "next/server"
import { currentCreatorId } from "@/lib/creators/current"
import { saveKey } from "@/lib/ai-keys/store"
import { PKCE_COOKIE, returnPath } from "@/lib/ai-keys/openrouter"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function back(request: NextRequest, path: string, result: string) {
  const url = new URL(path, request.url)
  url.searchParams.set("settings", "connections")
  url.searchParams.set("ownai", result)
  const res = NextResponse.redirect(url)
  res.cookies.set(PKCE_COOKIE, "", { path: "/api/ai-keys/openrouter", maxAge: 0 })
  return res
}

export async function GET(request: NextRequest) {
  let started: { v?: string; b?: string; c?: string } = {}
  try {
    started = JSON.parse(request.cookies.get(PKCE_COOKIE)?.value ?? "{}")
  } catch {
    started = {}
  }
  const path = typeof started.b === "string" && started.b.startsWith("/") && !started.b.startsWith("//") ? started.b : returnPath(null)
  const code = request.nextUrl.searchParams.get("code")
  if (!code) return back(request, path, "cancelled")

  const creatorId = await currentCreatorId()
  /* The same person who started it: a code arriving in somebody else's session is not theirs to keep. */
  if (!creatorId || !started.v || started.c !== creatorId) return back(request, path, "expired")

  let key: string | null = null
  try {
    const res = await fetch("https://openrouter.ai/api/v1/auth/keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, code_verifier: started.v, code_challenge_method: "S256" }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    })
    if (res.ok) {
      const body = (await res.json().catch(() => null)) as { key?: unknown } | null
      key = typeof body?.key === "string" && body.key.length > 10 ? body.key : null
    }
  } catch {
    key = null
  }
  if (!key) return back(request, path, "failed")

  const saved = await saveKey(creatorId, "openrouter", key)
  if (!saved.ok) return back(request, path, saved.tableMissing ? "not-set-up" : "failed")
  return back(request, path, "connected")
}
