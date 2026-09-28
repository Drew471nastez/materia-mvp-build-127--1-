import { NextResponse } from "next/server"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { createAdminClient } from "@/lib/supabase/admin"
import { rateLimit, addressSubject, emailSubject, LIMITS } from "@/lib/api/rate-limit"

export const runtime = "nodejs"

/**
 * POST /api/auth/unconfirmed-account  { email, password }  ->  { userId } | 404
 *
 * The login page, when Supabase answers "Email not confirmed", sends the
 * person to /signup/verify, which needs their user id. It used to look the
 * id up from the browser by email in `profiles`, which anybody could do for
 * any address (and which run-now part 63 closes: email is a private column).
 *
 * Here the answer needs the password too. The sign in is tried again on the
 * server; only when Supabase says the password is right and the address is
 * not confirmed yet is the id looked up and returned. Anything else is a
 * plain 404, so this tells a stranger nothing about who has an account.
 */
export async function POST(request: Request) {
  let email = ""
  let password = ""
  try {
    const body = await request.json()
    email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : ""
    password = typeof body?.password === "string" ? body.password : ""
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  if (!email || !password) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const limited = await rateLimit({
    bucket: "unconfirmed-account",
    subjects: [addressSubject(request), emailSubject(email)],
    windows: LIMITS.claim,
    message: "Too many tries just now. Wait a few minutes and try again.",
  })
  if (limited) return limited

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const auth = createSupabaseClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error } = await auth.auth.signInWithPassword({ email, password })
  if (!error || !error.message.toLowerCase().includes("email not confirmed")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const { data } = await createAdminClient().from("profiles").select("id").eq("email", email).maybeSingle()
  if (!data?.id) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ userId: data.id }, { headers: { "Cache-Control": "no-store" } })
}
