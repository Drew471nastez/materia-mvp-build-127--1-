import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET() {
  try {
    const supabase = await createClient()

    const { data: templates, error } = await supabase
      .from("onepage_templates")
      .select("*")
      .order("sort_order", { ascending: true })

    if (error) {
      console.error("Templates fetch error:", error)
      return NextResponse.json({ error: "Failed to fetch templates" }, { status: 500 })
    }

    return NextResponse.json({ templates })
  } catch (error) {
    console.error("Templates error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
