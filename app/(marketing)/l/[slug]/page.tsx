import { notFound } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/admin"
import type { Metadata } from "next"
import { PublicOnePage } from "@/components/onepage/public-onepage"
import { headers } from "next/headers"
import crypto from "crypto"

// Hash IP address for privacy (same as track API)
function hashIP(ip: string): string {
  return crypto.createHash("sha256").update(ip + process.env.SUPABASE_URL).digest("hex").slice(0, 16)
}

export const dynamic = "force-dynamic"

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params

  const supabase = createAdminClient()

  // First try to find onepage by slug
  let { data: onepage, error } = await supabase
    .from("onepages")
    .select("published_profile, settings, seller_id, creator_id, owner_id, avatar_url, title")
    .eq("slug", slug)
    .eq("status", "published")
    .single()

  // If not found by slug, try to find by username (for subdomain routing)
  if (error || !onepage) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, username")
      .ilike("username", slug)
      .maybeSingle()

    if (profile) {
      const { data: creator } = await supabase
        .from("creators")
        .select("id")
        .eq("user_id", profile.id)
        .maybeSingle()

      if (creator) {
        const { data: creatorOnepage } = await supabase
          .from("onepages")
          .select("published_profile, settings, seller_id, creator_id, owner_id, avatar_url, title")
          .or(`seller_id.eq.${creator.id},creator_id.eq.${creator.id}`)
          .eq("status", "published")
          .maybeSingle()

        if (creatorOnepage) {
          onepage = creatorOnepage
          error = null
        }
      }

      if (!onepage) {
        const { data: ownerOnepage } = await supabase
          .from("onepages")
          .select("published_profile, settings, seller_id, creator_id, owner_id, avatar_url, title")
          .eq("owner_id", profile.id)
          .eq("status", "published")
          .maybeSingle()

        if (ownerOnepage) {
          onepage = ownerOnepage
          error = null
        }
      }
    }
  }

  if (!onepage) {
    return { title: slug ? `${slug} | Storelib` : "Page Not Found" }
  }

  const profile = onepage.published_profile as any
  const settings = onepage.settings as any

  // SEO Title Priority: seo_title > display name > title > "Creator"
  const displayName = profile?.title || onepage.title || "Creator"
  const seoTitle = settings?.seo_title?.trim()
  const pageTitle = seoTitle || `${displayName} | Storelib`

  // Favicon
  let faviconUrl = profile?.avatar_url || onepage.avatar_url
  const effectiveSellerId = onepage.seller_id || onepage.creator_id || null

  if (!faviconUrl && effectiveSellerId) {
    try {
      const { data: storeConfig } = await supabase
        .from("store_builder_configs")
        .select("published_config")
        .eq("creator_id", effectiveSellerId)
        .eq("page_type", "shop")
        .maybeSingle()

      const headerSettings = storeConfig?.published_config?.headerSettings as any
      if (headerSettings?.avatarUrl) {
        faviconUrl = headerSettings.avatarUrl
      } else if (headerSettings?.faviconUrl) {
        faviconUrl = headerSettings.faviconUrl
      }
    } catch {
      // Ignore
    }
  }

  // Social image fallback: social_image_url > avatar_url > profile avatar
  const socialImageUrl = settings?.social_image_url || profile?.avatar_url || onepage.avatar_url || faviconUrl || undefined

  return {
    title: pageTitle,
    description: settings?.seo_description || profile?.bio || undefined,
    openGraph: {
      title: pageTitle,
      description: settings?.seo_description || profile?.bio || undefined,
      images: socialImageUrl ? [socialImageUrl] : undefined,
    },
    twitter: {
      card: socialImageUrl ? "summary_large_image" : "summary",
      title: pageTitle,
      description: settings?.seo_description || profile?.bio || undefined,
      images: socialImageUrl ? [socialImageUrl] : undefined,
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

  const adminSupabase = createAdminClient()

  // First try to find onepage by slug
  let { data: onepage, error } = await adminSupabase
    .from("onepages")
    .select("*")
    .eq("slug", slug)
    .eq("status", "published")
    .single()

  // If not found by slug, try to find by username (for subdomain routing)
  // This handles the case where username.storelib.com/links is accessed
  // and the middleware passes the username as the slug
  if (error || !onepage) {
    // Look up the user by username
    const { data: profile } = await adminSupabase
      .from("profiles")
      .select("id, username")
      .ilike("username", slug)
      .maybeSingle()

    if (profile) {
      // Find the creator for this user
      const { data: creator } = await adminSupabase
        .from("creators")
        .select("id")
        .eq("user_id", profile.id)
        .maybeSingle()

      if (creator) {
        // Try to find onepage by seller_id (creator_id)
        const { data: creatorOnepage } = await adminSupabase
          .from("onepages")
          .select("*")
          .eq("seller_id", creator.id)
          .eq("status", "published")
          .maybeSingle()

        if (creatorOnepage) {
          onepage = creatorOnepage
          error = null
        } else {
          // Also try by creator_id field
          const { data: altOnepage } = await adminSupabase
            .from("onepages")
            .select("*")
            .eq("creator_id", creator.id)
            .eq("status", "published")
            .maybeSingle()

          if (altOnepage) {
            onepage = altOnepage
            error = null
          }
        }
      }

      // If still not found, try by owner_id (user_id)
      if (!onepage) {
        const { data: ownerOnepage } = await adminSupabase
          .from("onepages")
          .select("*")
          .eq("owner_id", profile.id)
          .eq("status", "published")
          .maybeSingle()

        if (ownerOnepage) {
          onepage = ownerOnepage
          error = null
        }
      }
    }
  }

  if (!onepage) {
    notFound()
  }

  // Track view with IP/device deduplication (one view per IP per day)
  try {
    const headersList = await headers()
    const forwardedFor = headersList.get("x-forwarded-for")
    const ip = forwardedFor ? forwardedFor.split(",")[0].trim() : "unknown"
    const ipHash = hashIP(ip)
    const userAgent = headersList.get("user-agent") || ""
    const referrer = headersList.get("referer") || ""

    // Generate visitor ID from IP hash + user agent (for deduplication)
    const visitorId = crypto
      .createHash("sha256")
      .update(ipHash + userAgent)
      .digest("hex")
      .slice(0, 32)

    // Check for duplicate view (same IP within the same calendar day - UTC)
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    const todayStr = today.toISOString()

    const { data: existingView } = await adminSupabase
      .from("onepage_views")
      .select("id")
      .eq("onepage_id", onepage.id)
      .eq("ip_hash", ipHash)
      .gte("created_at", todayStr)
      .maybeSingle()

    // Only insert if no view from this IP today
    if (!existingView) {
      await adminSupabase.from("onepage_views").insert({
        onepage_id: onepage.id,
        visitor_id: visitorId,
        referrer,
        user_agent: userAgent.slice(0, 500),
        ip_hash: ipHash,
      })
    }
  } catch {
    // Ignore
  }

  const publishedProfile = onepage.published_profile as any
  const publishedTheme = onepage.published_theme as any
  const publishedBlocks = onepage.published_blocks as any[]

  // IMPORTANT: Resolve the correct creator_id for subscribe functionality
  // Priority: seller_id > creator_id > lookup from owner_id
  let resolvedCreatorId = onepage.seller_id || onepage.creator_id || null

  // If no direct creator reference, look up creator by owner_id (user_id)
  if (!resolvedCreatorId && onepage.owner_id) {
    const { data: creator } = await adminSupabase
      .from("creators")
      .select("id")
      .eq("user_id", onepage.owner_id)
      .maybeSingle()

    if (creator) {
      resolvedCreatorId = creator.id

      // Also update the onepage record so future lookups are faster
      await adminSupabase
        .from("onepages")
        .update({ seller_id: creator.id, creator_id: creator.id })
        .eq("id", onepage.id)
    }
  }

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
    seller_id: resolvedCreatorId,
  }

  return <PublicOnePage onepage={transformedOnepage} />
}
