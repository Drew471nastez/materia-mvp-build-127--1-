import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import type { Metadata } from "next"
import { PublicOnePage } from "@/components/onepage/public-onepage"

export const dynamic = "force-dynamic"

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const supabase = await createClient()

  const { data: onepage } = await supabase
    .from("onepages")
    .select("published_profile, settings")
    .eq("slug", slug)
    .eq("status", "published")
    .single()

  if (!onepage) {
    return { title: "Page Not Found" }
  }

  const profile = onepage.published_profile as any
  const settings = onepage.settings as any

  return {
    title: settings?.seo_title || profile?.title || "OnePage",
    description: settings?.seo_description || profile?.bio || undefined,
    openGraph: {
      title: settings?.seo_title || profile?.title || "OnePage",
      description: settings?.seo_description || profile?.bio || undefined,
      images: settings?.social_image_url ? [settings.social_image_url] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: settings?.seo_title || profile?.title || "OnePage",
      description: settings?.seo_description || profile?.bio || undefined,
      images: settings?.social_image_url ? [settings.social_image_url] : undefined,
    },
  }
}

export default async function PublicOnePageRoute({ params }: Props) {
  const { slug } = await params
  const supabase = await createClient()

  // Fetch published onepage
  const { data: onepage, error } = await supabase
    .from("onepages")
    .select("*")
    .eq("slug", slug)
    .eq("status", "published")
    .single()

  if (error || !onepage) {
    notFound()
  }

  // Track view (fire and forget)
  try {
    await supabase.from("onepage_views").insert({
      onepage_id: onepage.id,
      visitor_id: null,
      referrer: null,
    })
  } catch {
    // Ignore view tracking errors
  }

  // Transform database data to component props
  const publishedProfile = onepage.published_profile as any
  const publishedTheme = onepage.published_theme as any
  const publishedBlocks = onepage.published_blocks as any[]

  const transformedOnepage = {
    id: onepage.id,
    title: publishedProfile?.title || onepage.title || "",
    bio: publishedProfile?.bio || onepage.bio || "",
    slug: onepage.slug,
    avatar_url: publishedProfile?.avatar_url || onepage.avatar_url || null,
    avatar_video_url: publishedProfile?.avatar_video_url || null,
    theme: publishedTheme || onepage.theme || {
      background_type: "solid",
      background_color: "#ffffff",
      background_gradient: "",
      background_image_url: "",
      text_color: "#000000",
      secondary_text_color: "#666666",
      button_color: "#000000",
      button_text_color: "#ffffff",
      button_style: "filled",
      button_border_radius: 8,
      button_border_width: 0,
      button_border_color: "#000000",
      font_family: "Inter",
      spacing: "normal",
      card_width: "standard",
    },
    blocks: publishedBlocks || onepage.draft_blocks || [],
    social_links: publishedProfile?.social_links || onepage.social_links || {},
    settings: onepage.settings || { show_branding: true, analytics_enabled: true },
    seller_id: onepage.seller_id,
  }

  return <PublicOnePage onepage={transformedOnepage} />
}
