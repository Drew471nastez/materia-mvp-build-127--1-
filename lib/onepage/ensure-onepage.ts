import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import type { OnePageTheme, OnePageSettings } from "@/lib/onepage/types"
import { defaultSocialLinks, generateBlockId } from "@/lib/onepage/types"
import { hasRealUrl } from "@/lib/onepage/editor-state"

/**
 * ===========================================================================
 *  A ONEPAGE THAT EXISTS BEFORE ANYBODY ASKS FOR ONE
 * ===========================================================================
 * The creator page is published during onboarding: /api/onboarding/finalize
 * calls ensureStorePublished, so a new account has a live page at
 * storelib.com/u/<handle> from its first minute.
 *
 * THE ONEPAGE WAS NOT. The row was created lazily, the first time somebody
 * opened /app/onepage, which means a creator who never opened that screen had
 * no OnePage at all — no row, no slug, no address. The dashboard said "Set up
 * your OnePage to create a link" and a link somebody could have been given on
 * day one did not exist.
 *
 * This is the same creation, in one place, so onboarding and that screen
 * cannot drift into making two different OnePages. It was lifted out of the
 * GET handler rather than written again, because "the defaults" here are a
 * theme, six blocks and a published snapshot, and a second copy of that is a
 * second thing to keep in step.
 *
 * IDEMPOTENT, and it has to be: onboarding and a first visit can race. The
 * duplicate-key path already existed and is kept — on 23505 it fetches the row
 * the other request just wrote rather than failing.
 */
export async function ensureOnePage(
  supabase: SupabaseClient,
  userId: string,
  creator: { id: string; slug?: string | null } | null,
): Promise<Record<string, unknown> | null> {
  const { data: existing } = await supabase
    .from("onepages")
    .select("*")
    .eq("owner_id", userId)
    .maybeSingle()

  if (existing) return existing as Record<string, unknown>

  // Get user's profile for default title
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, username, avatar_url")
    .eq("id", userId)
    .single()

  const baseSlug = profile?.username || creator?.slug || userId.slice(0, 8)
  
  // Generate unique slug
  const { data: slugData } = await supabase.rpc("generate_onepage_slug", {
    base_slug: baseSlug,
  })

  const slug = slugData || baseSlug

  // Default theme configuration (matches "Default" preset from design-tab.tsx)
  const newDefaultTheme: OnePageTheme = {
    template_id: "default",
    background_type: "solid",
    background_color: "#ffffff",
    background_gradient: null,
    background_image_url: null,
    text_color: "#000000",
    secondary_text_color: "#000000",
    button_style: "filled",
    button_color: "#000000",
    button_text_color: "#ffffff",
    button_border_radius: 8,
    button_border_width: 0,
    button_border_color: "#000000",
    button_hover_color: "#333333",
    font_family: "'Inter', sans-serif",
    title_font: "'Inter', sans-serif",
    title_color: "#000000",
    card_width: "standard",
    spacing: "normal",
    gradient_direction: 135,
    gradient_animated: false,
    gradient_noise: false,
    image_brightness: 100,
    image_blur: 0,
    image_noise: false,
    header_layout: "classic",
    social_icon_color: "#000000",
    /* A new page draws its social marks in their own colours (Design › Social icons can make them one colour). */
    social_icon_tone: "brand",
  }

  // Default settings with white style for subscribe/share icons
  const newDefaultSettings: OnePageSettings = {
    show_branding: true,
    seo_title: null,
    seo_description: null,
    social_image_url: null,
    custom_domain: null,
    analytics_enabled: true,
    subscribe_enabled: true,
    subscribe_style: "white",
    share_enabled: true,
    share_style: "white",
    verified_badge_enabled: false,
    verified_badge_type: "verified_creator",
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

  // Prepare the default published profile data
  const defaultTitle = profile?.display_name || profile?.username || "My Page"
  const defaultBio = ""
  const defaultAvatarUrl = profile?.avatar_url || null
  const defaultBlocks = [headerBlock, socialRowBlock, linkBlock1, linkBlock2, dividerBlock, newsletterBlock]
  /**
   * NO DEAD LINKS ON DAY ONE. The two "My Link" buttons stay in the draft,
   * where they show a new creator what a link looks like and wait for an
   * address. The published copy leaves out any link without one: it used to
   * carry both, pointing at "https://", so every new page went live with two
   * buttons that led nowhere. hasRealUrl is the same test the published
   * page should use for links saved later.
   */
  const publishedDefaultBlocks = defaultBlocks
    .filter((b) => b.type !== "link_button" || hasRealUrl((b.data as { url?: string }).url))
    .map((b, i) => ({ ...b, sort_order: i }))

  const newOnepage = {
    owner_id: userId,
    creator_id: creator?.id || null,
    seller_id: creator?.id || null, // Set seller_id for subscribe functionality
    slug,
    title: defaultTitle,
    bio: defaultBio,
    avatar_url: defaultAvatarUrl,
    theme: newDefaultTheme,
    settings: newDefaultSettings,
    social_links: defaultSocialLinks,
    draft_blocks: defaultBlocks,
    // Auto-publish by default so page is visible immediately
    status: "published",
    published_at: new Date().toISOString(),
    published_blocks: publishedDefaultBlocks,
    published_theme: newDefaultTheme,
    published_profile: {
      title: defaultTitle,
      bio: defaultBio,
      avatar_url: defaultAvatarUrl,
      avatar_video_url: null,
      avatar_video_crop: null,
    },
    published_social_links: defaultSocialLinks,
    // Set onboarding_completed to false so OnePage onboarding shows once
    onboarding_completed: false,
  }

  // Try to create onepage with retry logic for robustness
  let created = null
  let createError = null
  const maxRetries = 3
  const originalSlug = newOnepage.slug

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
        .eq("owner_id", userId)
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
      const newCounter = Date.now() % 10000 + attempt
      newOnepage.slug = `${originalSlug}-${newCounter}`
    }
  }

  // If creation still failed after retries, do a final check for existing onepage
  if (!created && createError) {
    console.error("All OnePage creation attempts failed:", createError)

    // Final attempt: check if onepage was created by another concurrent request
    const { data: finalCheck } = await supabase
      .from("onepages")
      .select("*")
      .eq("owner_id", userId)
      .single()

    if (finalCheck) {
      created = finalCheck
    } else {
      /** The caller decides what a failure means; here it is just "none". */
      return null
    }
  }

  return created as Record<string, unknown> | null
}
