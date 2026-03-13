import { NextRequest, NextResponse } from "next/server"
import { isAdminAuthenticated } from "@/lib/admin-blog-auth"

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  return NextResponse.json({ settings: {} })
}

export async function PATCH(req: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json()
  const { type, username, url, seo_title, seo_description } = body

  if (!type) {
    return NextResponse.json({ error: "Missing type" }, { status: 400 })
  }

  return NextResponse.json({
    ok: true,
    saved: { type, username, url, seo_title, seo_description },
  })
}
