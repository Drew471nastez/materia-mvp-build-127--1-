import { NextResponse } from "next/server"
import { returnPathOf } from "@/lib/site-accounts/hosts"
import { hostOf } from "@/lib/site-accounts/session"
import { originOf, privateResponse } from "@/lib/site-accounts/respond"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * The address "Sign in" and "Create account" used to have, when signing in
 * went through storelib.com. A section a creator saved in the code editor
 * before then may still link here, so it answers with the website's own sign
 * in page, where an email and a code do both. `return` is a path on this
 * website and nothing else (lib/site-accounts/hosts.ts returnPathOf).
 */
export async function GET(request: Request) {
  const host = hostOf(request)
  const path = returnPathOf(new URL(request.url).searchParams.get("return"))
  const to = new URL("/account/login", originOf(host))
  if (path !== "/account") to.searchParams.set("return", path)
  return privateResponse(NextResponse.redirect(to, 303))
}
