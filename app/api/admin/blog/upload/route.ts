import { NextRequest, NextResponse } from "next/server"
import { adminFailure } from "@/lib/admin/gate"
import { createAdminClient } from "@/lib/supabase/admin"
import { isAdminAuthenticated } from "@/lib/admin-blog-auth"

export async function POST(req: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const formData = await req.formData()
  const file = formData.get("file") as File
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 })

  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg"
  const fileName = `blog/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`

  const supabase = createAdminClient()
  const { error } = await supabase.storage
    .from("lead-form-files-v2")
    .upload(fileName, file, { contentType: file.type, upsert: false })

  if (error) return adminFailure("blog upload", error)

  const { data: { publicUrl } } = supabase.storage
    .from("lead-form-files-v2")
    .getPublicUrl(fileName)

  return NextResponse.json({ url: publicUrl })
}
