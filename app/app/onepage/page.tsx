import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { OnePageEditor } from "@/components/onepage/onepage-editor"
import type { OnePage } from "@/lib/onepage/types"
import { defaultTheme, defaultSettings, defaultSocialLinks } from "@/lib/onepage/types"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "OnePage Editor | Materia",
}

export default async function OnePageEditorPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  // Get creator info
  const { data: creator } = await supabase
    .from("creators")
    .select("id, slug")
    .eq("user_id", user.id)
    .single()

  if (!creator) {
    redirect("/onboarding")
  }

  // Try to get existing onepage
  let { data: onepage, error } = await supabase
    .from("onepages")
    .select("*")
    .eq("owner_id", user.id)
    .single()

  // If no onepage exists, create one
  if (!onepage) {
    // Get user's profile for default title
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, username, avatar_url")
      .eq("id", user.id)
      .single()

    const baseSlug = profile?.username || creator?.slug || user.id.slice(0, 8)

    // Generate unique slug using the helper function
    let slug = baseSlug
    let counter = 0
    while (true) {
      const { data: existing } = await supabase
        .from("onepages")
        .select("id")
        .eq("slug", slug)
        .single()
      
      if (!existing) break
      counter++
      slug = `${baseSlug}-${counter}`
    }

    // Create default header block
    const headerBlock = {
      id: `block_${Date.now()}_header`,
      type: "header",
      enabled: true,
      data: {
        show_avatar: true,
        show_name: true,
        show_bio: true,
      },
      sort_order: 0,
    }

    const newOnepage = {
      owner_id: user.id,
      creator_id: creator.id,
      slug,
      title: profile?.display_name || profile?.username || "My Page",
      bio: "",
      avatar_url: profile?.avatar_url || null,
      theme: defaultTheme,
      settings: defaultSettings,
      social_links: defaultSocialLinks,
      draft_blocks: [headerBlock],
      status: "draft",
    }

    const { data: created, error: createError } = await supabase
      .from("onepages")
      .insert(newOnepage)
      .select()
      .single()

    if (createError) {
      console.error("Error creating onepage:", createError)
      return (
        <div className="flex items-center justify-center h-screen">
          <p className="text-destructive">Failed to create OnePage. Please try again.</p>
        </div>
      )
    }

    onepage = created
  }

  return <OnePageEditor initialOnePage={onepage as OnePage} />
}
