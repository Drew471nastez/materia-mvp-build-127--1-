import { NextRequest, NextResponse } from "next/server"
import { getSessionToken } from "@/lib/admin-blog-auth"

const USERNAME = "storelib"
const PASSWORD = "Amfetamina11"

export async function POST(req: NextRequest) {
  let username: string | undefined
  let password: string | undefined

  try {
    const body = await req.json()
    username = typeof body.username === "string" ? body.username.trim() : ""
    password = typeof body.password === "string" ? body.password : ""
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

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
