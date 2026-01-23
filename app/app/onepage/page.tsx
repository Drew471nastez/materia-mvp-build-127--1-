import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { OnePageEditor } from "@/components/onepage/onepage-editor"
import type { OnePage } from "@/lib/onepage/types"
import { defaultTheme, defaultSettings, defaultSocialLinks } from "@/lib/onepage/types"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "OnePage Editor | Storelib",
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

  // Try to get existing onepage with proper error handling
  let { data: onepage, error: fetchError } = await supabase
    .from("onepages")
    .select("*")
    .eq("owner_id", user.id)
    .single()

  // If we got an actual error (not just "no rows found"), log it but continue to try creating
  if (fetchError && fetchError.code !== "PGRST116") {
    console.error("Error fetching onepage (will attempt to create):", fetchError)
  }

  // If no onepage exists (either null or PGRST116 error), create one
  if (!onepage) {
    // Get user's profile for default title
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, username, avatar_url")
      .eq("id", user.id)
      .single()

    // Check if store_builder_configs has social data we can use
    const { data: storeConfig } = await supabase
      .from("store_builder_configs")
      .select("draft_config")
      .eq("creator_id", creator.id)
      .eq("page_type", "shop")
      .maybeSingle()

    // Extract social links from store builder config if available
    let socialDataFromStore = { instagram: null as string | null, tiktok: null as string | null, youtube: null as string | null }
    if (storeConfig?.draft_config?.sections) {
      const headerSection = storeConfig.draft_config.sections.find((s: any) => s.type === "header")
      if (headerSection?.settings?.socialLinks) {
        const sl = headerSection.settings.socialLinks
        socialDataFromStore = {
          instagram: sl.instagram?.url || null,
          tiktok: sl.tiktok?.url || null,
          youtube: sl.youtube?.url || null,
        }
      }
    }

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

    // Create default blocks for new users
    const timestamp = Date.now()

    // 1. Header block (sort_order: 0)
    const headerBlock = {
      id: `block_${timestamp}_header`,
      type: "header",
      enabled: true,
      data: {
        show_avatar: true,
        show_name: true,
        show_bio: true,
      },
      sort_order: 0,
    }

    // 2. Social Links block (sort_order: 1) - will auto-sync with social_links
    const socialRowBlock = {
      id: `block_${timestamp + 1}_social`,
      type: "social_row",
      enabled: true,
      data: {
        platforms: [], // Will be populated by sync effect when social links are added
        style: "icons",
      },
      sort_order: 1,
    }

    // 3. First My Link block (sort_order: 2)
    const linkBlock1 = {
      id: `block_${timestamp + 2}_link1`,
      type: "link_button",
      enabled: true,
      data: {
        label: "My Link",
        url: "https://",
        icon: null,
        thumbnail_url: null,
      },
      sort_order: 2,
    }

    // 4. Second My Link block (sort_order: 3)
    const linkBlock2 = {
      id: `block_${timestamp + 3}_link2`,
      type: "link_button",
      enabled: true,
      data: {
        label: "My Link",
        url: "https://",
        icon: null,
        thumbnail_url: null,
      },
      sort_order: 3,
    }

    // 5. Divider block with Line style (sort_order: 4)
    const dividerBlock = {
      id: `block_${timestamp + 4}_divider`,
      type: "divider",
      enabled: true,
      data: {
        style: "line",
        height: 24,
      },
      sort_order: 4,
    }

    // 6. Newsletter/Email capture block (sort_order: 5)
    const newsletterBlock = {
      id: `block_${timestamp + 5}_newsletter`,
      type: "email_capture",
      enabled: true,
      data: {
        headline: "Join my newsletter",
        description: "Get updates and exclusive content",
        placeholder: "Enter your email",
        button_text: "Subscribe",
        success_message: "Thanks for subscribing!",
        lead_magnet_id: null,
        button_preset: "subscribe",
        custom_button_text: "",
        enable_digital_product: false,
        digital_product_id: null,
        digital_product_title: null,
        digital_product_thumbnail: null,
        digital_product_file_url: null,
        layout_type: "default",
        product_image: null,
        animation_type: "none",
      },
      sort_order: 5,
    }

    // Default theme configuration (matches "Default" preset)
    const newDefaultTheme = {
      template_id: "default",
      background_type: "solid" as const,
      background_color: "#ffffff",
      background_gradient: null,
      background_image_url: null,
      text_color: "#000000",
      secondary_text_color: "#000000",
      button_style: "filled" as const,
      button_color: "#000000",
      button_text_color: "#ffffff",
      button_border_radius: 8,
      button_border_width: 0,
      button_border_color: "#000000",
      button_hover_color: "#333333",
      font_family: "'Inter', sans-serif",
      title_font: "'Inter', sans-serif",
      title_color: "#000000",
      card_width: "standard" as const,
      spacing: "normal" as const,
      gradient_direction: 135,
      gradient_animated: false,
      gradient_noise: false,
      image_brightness: 100,
      image_blur: 0,
      image_noise: false,
      header_layout: "classic" as const,
      social_icon_color: "#000000",
    }

    // Default settings with white style for subscribe/share icons
    const newDefaultSettings = {
      show_branding: true,
      seo_title: null,
      seo_description: null,
      social_image_url: null,
      custom_domain: null,
      analytics_enabled: true,
      subscribe_enabled: true,
      subscribe_style: "white" as const,
      share_enabled: true,
      share_style: "white" as const,
      verified_badge_enabled: false,
      verified_badge_type: "verified_creator" as const,
    }

    // Prepare the default published profile data
    const defaultTitle = profile?.display_name || profile?.username || "My Page"
    const defaultBio = ""
    const defaultAvatarUrl = profile?.avatar_url || null
    const defaultBlocks = [headerBlock, socialRowBlock, linkBlock1, linkBlock2, dividerBlock, newsletterBlock]

    // Merge social data from store builder with defaults
    const mergedSocialLinks = {
      ...defaultSocialLinks,
      instagram: socialDataFromStore.instagram || defaultSocialLinks.instagram,
      tiktok: socialDataFromStore.tiktok || defaultSocialLinks.tiktok,
      youtube: socialDataFromStore.youtube || defaultSocialLinks.youtube,
    }

    const newOnepage = {
      owner_id: user.id,
      creator_id: creator.id,
      slug,
      title: defaultTitle,
      bio: defaultBio,
      avatar_url: defaultAvatarUrl,
      theme: newDefaultTheme,
      settings: newDefaultSettings,
      social_links: mergedSocialLinks,
      // Also save to direct columns for compatibility
      instagram: socialDataFromStore.instagram,
      tiktok: socialDataFromStore.tiktok,
      youtube: socialDataFromStore.youtube,
      draft_blocks: defaultBlocks,
      // Auto-publish by default so page is visible immediately
      status: "published",
      published_at: new Date().toISOString(),
      published_blocks: defaultBlocks,
      published_theme: newDefaultTheme,
      published_profile: {
        title: defaultTitle,
        bio: defaultBio,
        avatar_url: defaultAvatarUrl,
        avatar_video_url: null,
        avatar_video_crop: null,
      },
      published_social_links: mergedSocialLinks,
      // Set onboarding_completed to false so OnePage onboarding shows once
      onboarding_completed: false,
    }

    // Try to create onepage with retry logic for robustness
    let created = null
    let createError = null
    const maxRetries = 3

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const result = await supabase
        .from("onepages")
        .insert(newOnepage)
        .select()
        .single()

      if (!result.error) {
        created = result.data
        break
      }

      createError = result.error

      // If it's a duplicate key error (race condition), try to fetch existing
      if (result.error.code === "23505" || result.error.message?.includes("duplicate")) {
        const { data: existingAfterRace } = await supabase
          .from("onepages")
          .select("*")
          .eq("owner_id", user.id)
          .single()

        if (existingAfterRace) {
          created = existingAfterRace
          break
        }
      }

      // Log and retry for other errors
      console.error(`OnePage creation attempt ${attempt}/${maxRetries} failed:`, result.error)

      // Wait before retrying (exponential backoff)
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100))

        // Generate a new unique slug in case of slug collision
        let newSlug = baseSlug
        let newCounter = Date.now() % 10000
        while (true) {
          const { data: existing } = await supabase
            .from("onepages")
            .select("id")
            .eq("slug", newSlug)
            .single()

          if (!existing) break
          newCounter++
          newSlug = `${baseSlug}-${newCounter}`
        }
        newOnepage.slug = newSlug
      }
    }

    // If creation still failed after retries, do a final check for existing onepage
    if (!created && createError) {
      console.error("All OnePage creation attempts failed:", createError)

      // Final attempt: check if onepage was created by another concurrent request
      const { data: finalCheck } = await supabase
        .from("onepages")
        .select("*")
        .eq("owner_id", user.id)
        .maybeSingle()

      if (finalCheck) {
        created = finalCheck
      } else {
        // Try one more time with maybeSingle to handle race conditions
        const { data: raceCheck } = await supabase
          .from("onepages")
          .select("*")
          .eq("creator_id", creator.id)
          .maybeSingle()

        if (raceCheck) {
          created = raceCheck
        }
      }

      // If still no onepage found/created, create a minimal one as last resort
      if (!created) {
        // Generate a proper username-based slug as last resort
        const lastResortSlug = profile?.username || creator?.slug || `links-${user.id.slice(0, 8)}`

        const minimalOnepage = {
          owner_id: user.id,
          creator_id: creator.id,
          slug: lastResortSlug,
          title: profile?.display_name || profile?.username || "My Page",
          bio: "",
          avatar_url: profile?.avatar_url || null,
          theme: newDefaultTheme,
          settings: newDefaultSettings,
          social_links: defaultSocialLinks,
          draft_blocks: defaultBlocks,
          status: "published",
          published_at: new Date().toISOString(),
          published_blocks: defaultBlocks,
          published_theme: newDefaultTheme,
          published_profile: {
            title: profile?.display_name || profile?.username || "My Page",
            bio: "",
            avatar_url: profile?.avatar_url || null,
            avatar_video_url: null,
            avatar_video_crop: null,
          },
          onboarding_completed: false,
        }

        const { data: lastResort } = await supabase
          .from("onepages")
          .insert(minimalOnepage)
          .select()
          .maybeSingle()

        if (lastResort) {
          created = lastResort
        }
      }
    }

    onepage = created
  }

  // If onepage exists but has no social data, try to sync from store_builder_configs
  const rawOnepage = onepage as any
  if (onepage && !rawOnepage.instagram && !rawOnepage.tiktok && !rawOnepage.youtube) {
    // Check if store_builder_configs has social data we can use
    const { data: storeConfig } = await supabase
      .from("store_builder_configs")
      .select("draft_config")
      .eq("creator_id", creator.id)
      .eq("page_type", "shop")
      .maybeSingle()

    if (storeConfig?.draft_config?.sections) {
      const headerSection = storeConfig.draft_config.sections.find((s: any) => s.type === "header")
      if (headerSection?.settings?.socialLinks) {
        const sl = headerSection.settings.socialLinks
        const hasData = sl.instagram?.url || sl.tiktok?.url || sl.youtube?.url

        if (hasData) {
          // Sync social data from store builder to onepage
          await supabase
            .from("onepages")
            .update({
              instagram: sl.instagram?.url || null,
              tiktok: sl.tiktok?.url || null,
              youtube: sl.youtube?.url || null,
              social_links: {
                ...onepage.social_links,
                instagram: sl.instagram?.url || null,
                tiktok: sl.tiktok?.url || null,
                youtube: sl.youtube?.url || null,
              },
            })
            .eq("id", onepage.id)

          // Update the local onepage object with the synced data
          rawOnepage.instagram = sl.instagram?.url || null
          rawOnepage.tiktok = sl.tiktok?.url || null
          rawOnepage.youtube = sl.youtube?.url || null
          onepage.social_links = {
            ...onepage.social_links,
            instagram: sl.instagram?.url || null,
            tiktok: sl.tiktok?.url || null,
            youtube: sl.youtube?.url || null,
          }
        }
      }
    }
  }

  // Final safety check - if we still don't have an onepage, something went wrong
  // This should rarely happen with all the retry logic above
  if (!onepage) {
    console.error("Failed to get or create onepage - this should not happen")
    // Instead of redirecting to /app, try to render with a minimal state
    // The editor should handle null gracefully
  }

  return <OnePageEditor initialOnePage={onepage as OnePage} />
}
