import { notFound } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/admin"
import type { Metadata } from "next"
import { PublicOnePage } from "@/components/onepage/public-onepage"

export const dynamic = "force-dynamic"

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params

  // Use admin client for metadata to bypass RLS issues in metadata context
  const supabase = createAdminClient()

  const { data: onepage, error } = await supabase
    .from("onepages")
    .select("published_profile, settings, seller_id, avatar_url, title")
    .eq("slug", slug)
    .eq("status", "published")
    .single()

  if (error || !onepage) {
    // Fallback title using the slug
    return { title: slug ? `${slug} | Storelib` : "Page Not Found" }
  }

  const profile = onepage.published_profile as any
  const settings = onepage.settings as any

  // Priority: 1. SEO Page Title (if explicitly set and not empty)
  //           2. Display Name from published_profile.title
  //           3. OnePage title
  //           4. "Creator"
  const displayName = profile?.title || onepage.title || "Creator"
  const seoTitle = settings?.seo_title?.trim()

  // If SEO title is set, use it. Otherwise use Display Name with Storelib suffix
  const pageTitle = seoTitle || `${displayName} | Storelib`

  // Determine favicon URL - priority: avatar_url, then store builder avatar
  let faviconUrl = profile?.avatar_url || onepage.avatar_url

  // If no avatar, try to get store builder avatar
  if (!faviconUrl && onepage.seller_id) {
    try {
      // Try to get store builder config avatar
      const { data: storeConfig } = await supabase
        .from("store_builder_configs")
        .select("published_config")
        .eq("creator_id", onepage.seller_id)
        .eq("page_type", "shop")
        .maybeSingle()

      const headerSettings = storeConfig?.published_config?.headerSettings as any
      if (headerSettings?.avatarUrl) {
        faviconUrl = headerSettings.avatarUrl
      } else if (headerSettings?.faviconUrl) {
        faviconUrl = headerSettings.faviconUrl
      } else {
        // Fall back to creator profile avatar
        const { data: creator } = await supabase.from("creators").select("user_id").eq("id", onepage.seller_id).single()

        if (creator?.user_id) {
          const { data: profileData } = await supabase
            .from("profiles")
            .select("avatar_url")
            .eq("id", creator.user_id)
            .single()

          faviconUrl = profileData?.avatar_url
        }
      }
    } catch {
      // Ignore favicon fetching errors
    }
  }

  return {
    title: pageTitle,
    description: settings?.seo_description || profile?.bio || undefined,
    openGraph: {
      title: pageTitle,
      description: settings?.seo_description || profile?.bio || undefined,
      images: settings?.social_image_url ? [settings.social_image_url] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: pageTitle,
      description: settings?.seo_description || profile?.bio || undefined,
      images: settings?.social_image_url ? [settings.social_image_url] : undefined,
    },
    ...(faviconUrl && {
      icons: {
        icon: faviconUrl,
        apple: faviconUrl,
      },
    }),
  }
}

export default async function PublicOnePageRoute({ params }: Props) {
  const { slug } = await params

  // Use admin client to bypass RLS for public page access
  const adminSupabase = createAdminClient()

  // Fetch published onepage using admin client to ensure all data is available
  const { data: onepage, error } = await adminSupabase
    .from("onepages")
    .select("*")
    .eq("slug", slug)
    .eq("status", "published")
    .single()

  if (error || !onepage) {
    notFound()
  }

  // Track view (fire and forget) - use admin client
  try {
    await adminSupabase.from("onepage_views").insert({
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
    avatar_video_url: publishedProfile?.avatar_video_url || onepage.avatar_video_url || null,
    avatar_video_crop: publishedProfile?.avatar_video_crop || (onepage.settings as any)?.avatar_video_crop || null,
    theme: publishedTheme ||
      onepage.theme || {
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
    settings: onepage.settings || { show_branding: true, analytics_enabled: true, subscribe_enabled: true },
    seller_id: onepage.seller_id || onepage.owner_id || onepage.creator_id, // Fallback to owner_id or creator_id if seller_id is null
  }

  return <PublicOnePage onepage={transformedOnepage} />
}
