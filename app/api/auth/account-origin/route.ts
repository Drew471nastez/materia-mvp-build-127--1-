import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"

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

    const adminSupabase = createAdminClient()
    const user = await findAuthUserByEmail(adminSupabase, email)

    if (!user) {
      return NextResponse.json({ exists: false, googleOnly: false, passwordEnabled: false })
    }

    const providers = getProviders(user)
    const hasGoogle = providers.has("google")
    const hasEmailProvider = providers.has("email")
    const googleOnly = hasGoogle && !hasEmailProvider

    return NextResponse.json({
      exists: true,
      googleOnly,
      passwordEnabled: !googleOnly,
      providers: Array.from(providers),
    })
  } catch (error) {
    console.error("Account origin lookup error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

