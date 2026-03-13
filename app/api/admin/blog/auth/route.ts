import { NextRequest, NextResponse } from "next/server"
import { getSessionToken } from "@/lib/admin-blog-auth"

const USERNAME = "storelib"
const PASSWORD = "Amfetamina11"

export async function POST(req: NextRequest) {
  const { username, password } = await req.json()

  if (username !== USERNAME || password !== PASSWORD) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set("blog_admin", getSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: "/",
  })
  return res
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.delete("blog_admin")
  return res
}
