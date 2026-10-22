import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { addressSubject, emailSubject, rateLimit } from "@/lib/api/rate-limit"

export const runtime = "nodejs"

/** Twenty looks in ten minutes and a hundred a day: a person mistyping is far under, a list is far over. */
const ACCOUNT_ORIGIN_LIMITS = [
  { limit: 20, seconds: 600 },
  { limit: 100, seconds: 86400 },
] as const

function getProviders(user: any): Set<string> {
  const providers = new Set<string>()

  const appProviders = user?.app_metadata?.providers
  if (Array.isArray(appProviders)) {
    for (const p of appProviders) providers.add(String(p).toLowerCase())
  }

  if (Array.isArray(user?.identities)) {
    for (const identity of user.identities) {
      if (identity?.provider) providers.add(String(identity.provider).toLowerCase())
    }
  }

  return providers
}

async function findAuthUserByEmail(adminSupabase: ReturnType<typeof createAdminClient>, email: string) {
  const cleanEmail = email.trim().toLowerCase()

  const { data: profile } = await adminSupabase
    .from("profiles")
    .select("id")
    .eq("email", cleanEmail)
    .maybeSingle()

  if (profile?.id) {
    const { data: authUserData, error: authUserError } = await adminSupabase.auth.admin.getUserById(profile.id)
    if (!authUserError && authUserData?.user?.email?.toLowerCase() === cleanEmail) {
      return authUserData.user
    }
  }

  const perPage = 200
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await adminSupabase.auth.admin.listUsers({ page, perPage })
    if (error) break

    const users = data?.users || []
    const matchedUser = users.find((u) => u.email?.toLowerCase() === cleanEmail)
    if (matchedUser) return matchedUser

    if (users.length < perPage) break
  }

  return null
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const email = String(body?.email || "").trim().toLowerCase()

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 })
    }

    /*
      WHETHER AN ADDRESS HAS AN ACCOUNT IS ANSWERED HERE, ON PURPOSE: the
      sign up form says "this email has an account, sign in instead" and the
      login form names the way in. It was answered without limit, so the
      route was an address checker for anyone with a list, and each call can
      page through the whole user table (findAuthUserByEmail). A person types
      an address a few times; a list is hundreds. Per caller and per address.
    */
    const limited = await rateLimit({
      bucket: "account-origin",
      subjects: [addressSubject(request), emailSubject(email)],
      windows: ACCOUNT_ORIGIN_LIMITS,
      message: "Too many tries just now. Wait a minute and try again.",
    })
    if (limited) return limited

    const adminSupabase = createAdminClient()
    const user = await findAuthUserByEmail(adminSupabase, email)

    if (!user) {
      return NextResponse.json({ exists: false, methods: [], googleOnly: false, passwordEnabled: false })
    }

    const providers = getProviders(user)
    const hasGoogle = providers.has("google")
    const hasApple = providers.has("apple")
    const hasEmailProvider = providers.has("email")

    /**
     * WHAT THIS ROUTE USED TO SAY, AND WHY IT WAS WRONG FOR APPLE.
     *
     * It knew two answers: Google, or a password. An account created with
     * Sign in with Apple has `apple` and nothing else, so `googleOnly` was
     * false, `passwordEnabled` came back true, and the login form asked for a
     * password that has never existed. The person then got "Invalid login
     * credentials" — an account they own, told they have the wrong one.
     *
     * So the answer is the list of ways in, and the caller names them. The
     * two old fields are still returned because other callers read them, and
     * `passwordEnabled` now means what it says: there is a password.
     */
    const methods = [
      ...(hasEmailProvider ? (["email"] as const) : []),
      ...(hasGoogle ? (["google"] as const) : []),
      ...(hasApple ? (["apple"] as const) : []),
    ]

    return NextResponse.json({
      exists: true,
      methods,
      googleOnly: hasGoogle && !hasEmailProvider && !hasApple,
      passwordEnabled: hasEmailProvider,
      providers: Array.from(providers),
    })
  } catch (error) {
    console.error("Account origin lookup error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

