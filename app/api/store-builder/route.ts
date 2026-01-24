import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { defaultShopPageConfig, defaultProductPageConfig } from "@/lib/store-builder/defaults"
import type { PageType } from "@/lib/store-builder/types"

// GET - Fetch store builder config for a page type or specific product
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const pageType = searchParams.get("pageType") as PageType
  const productId = searchParams.get("productId")

  if (!pageType || !["shop", "product"].includes(pageType)) {
    return NextResponse.json({ error: "Invalid page type" }, { status: 400 })
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Get creator
  const { data: creator } = await supabase.from("creators").select("id").eq("user_id", user.id).single()

  if (!creator) {
    return NextResponse.json({ error: "Creator not found" }, { status: 404 })
  }

  if (productId && pageType === "product") {
    const { data: productConfig } = await supabase
      .from("product_page_configs")
      .select("*")
      .eq("creator_id", creator.id)
      .eq("product_id", productId)
      .single()

    if (productConfig) {
      // Return existing product config
      return NextResponse.json({
        ...productConfig,
        is_product_specific: true,
      })
    }

    // No product-specific config exists, try to get the default template
    const { data: defaultConfig } = await supabase
      .from("store_builder_configs")
      .select("*")
      .eq("creator_id", creator.id)
      .eq("page_type", "product")
      .single()

    if (defaultConfig) {
      // Return default config as starting point
      return NextResponse.json({
        draft_config: defaultConfig.draft_config,
        published_config: defaultConfig.published_config,
        is_default: true,
        product_id: productId,
      })
    }

    // If no default exists either, return hardcoded default
    return NextResponse.json({
      draft_config: defaultProductPageConfig,
      published_config: defaultProductPageConfig,
      is_default: true,
      product_id: productId,
    })
  }

  // Handle shop or default product template
  let { data: config } = await supabase
    .from("store_builder_configs")
    .select("*")
    .eq("creator_id", creator.id)
    .eq("page_type", pageType)
    .single()

  if (!config) {
    // Create default config
    const defaultConfig = pageType === "shop" ? defaultShopPageConfig : defaultProductPageConfig

    // Check if onepages has social data we can use for the header
    let socialLinksForHeader = null
    if (pageType === "shop") {
      const { data: onepage } = await supabase
        .from("onepages")
        .select("instagram, tiktok, youtube, social_links")
        .eq("creator_id", creator.id)
        .maybeSingle()

      if (onepage) {
        const rawOnepage = onepage as any
        const instagramUrl = rawOnepage.instagram || onepage.social_links?.instagram || null
        const tiktokUrl = rawOnepage.tiktok || onepage.social_links?.tiktok || null
        const youtubeUrl = rawOnepage.youtube || onepage.social_links?.youtube || null

        if (instagramUrl || tiktokUrl || youtubeUrl) {
          socialLinksForHeader = {
            instagram: { enabled: !!instagramUrl, url: instagramUrl || "" },
            tiktok: { enabled: !!tiktokUrl, url: tiktokUrl || "" },
            youtube: { enabled: !!youtubeUrl, url: youtubeUrl || "" },
            twitter: { enabled: false, url: "" },
            spotify: { enabled: false, url: "" },
          }
        }
      }
    }

    // If we have social data from onepages, inject it into the default config
    let configToInsert = { ...defaultConfig }
    if (socialLinksForHeader) {
      // IMPORTANT: Store Builder UI reads from headerSettings.socialLinks, not sections[header].settings
      // So we need to inject social links into BOTH locations for compatibility
      configToInsert = {
        ...configToInsert,
        headerSettings: {
          ...configToInsert.headerSettings,
          showSocialMedia: true,
          showSocialIconsOnMobile: true,
          socialLinks: socialLinksForHeader,
        }
      }

      // Also inject into sections for backward compatibility
      if (configToInsert.sections) {
        const headerIndex = configToInsert.sections.findIndex((s: any) => s.type === "header")
        if (headerIndex !== -1) {
          configToInsert.sections[headerIndex] = {
            ...configToInsert.sections[headerIndex],
            settings: {
              ...configToInsert.sections[headerIndex].settings,
              showSocialMedia: true,
              showSocialIconsOnMobile: true,
              socialLinks: socialLinksForHeader,
            }
          }
        }
      }
    }

    const { data: newConfig, error } = await supabase
      .from("store_builder_configs")
      .insert({
        creator_id: creator.id,
        page_type: pageType,
        draft_config: configToInsert,
        published_config: configToInsert,
      })
      .select()
      .single()

    if (error) {
      console.error("Error creating config:", error)
      return NextResponse.json({ error: "Failed to create config" }, { status: 500 })
    }

    config = newConfig
  } else if (pageType === "shop") {
    // ALWAYS check if onepages has social data and sync it to store_builder_configs
    // This ensures the Store Builder always displays the latest social links from main onboarding
    // The main onboarding saves to BOTH onepages AND store_builder_configs, but we need to
    // ensure they're in sync in case of timing issues or stale data
    const { data: onepage } = await supabase
      .from("onepages")
      .select("instagram, tiktok, youtube, social_links")
      .eq("creator_id", creator.id)
      .maybeSingle()

    if (onepage) {
      const rawOnepage = onepage as any
      const instagramUrl = rawOnepage.instagram || onepage.social_links?.instagram || null
      const tiktokUrl = rawOnepage.tiktok || onepage.social_links?.tiktok || null
      const youtubeUrl = rawOnepage.youtube || onepage.social_links?.youtube || null

      // Get existing social links from config
      const existingHeaderSettingsSocialLinks = config.draft_config?.headerSettings?.socialLinks
      const existingInstagram = existingHeaderSettingsSocialLinks?.instagram?.url || ""
      const existingTiktok = existingHeaderSettingsSocialLinks?.tiktok?.url || ""
      const existingYoutube = existingHeaderSettingsSocialLinks?.youtube?.url || ""

      // Check if onepages has different/newer data than store_builder_configs
      const needsSync = (
        (instagramUrl && instagramUrl !== existingInstagram) ||
        (tiktokUrl && tiktokUrl !== existingTiktok) ||
        (youtubeUrl && youtubeUrl !== existingYoutube) ||
        // Also sync if onepages has data but store_builder_configs is empty
        ((instagramUrl || tiktokUrl || youtubeUrl) && !existingInstagram && !existingTiktok && !existingYoutube)
      )

      if (needsSync) {
        // Build social links data from onepages (source of truth from main onboarding)
        const socialLinksData = {
          instagram: { enabled: !!instagramUrl, url: instagramUrl || existingInstagram || "" },
          tiktok: { enabled: !!tiktokUrl, url: tiktokUrl || existingTiktok || "" },
          youtube: { enabled: !!youtubeUrl, url: youtubeUrl || existingYoutube || "" },
          twitter: existingHeaderSettingsSocialLinks?.twitter || { enabled: false, url: "" },
          spotify: existingHeaderSettingsSocialLinks?.spotify || { enabled: false, url: "" },
        }

        // IMPORTANT: Update BOTH headerSettings.socialLinks AND sections[header].settings
        // The UI reads from headerSettings.socialLinks
        let updatedDraftConfig = {
          ...config.draft_config,
          headerSettings: {
            ...config.draft_config?.headerSettings,
            showSocialMedia: true,
            showSocialIconsOnMobile: true,
            socialLinks: socialLinksData,
          }
        }

        // Also update sections for backward compatibility
        if (updatedDraftConfig.sections) {
          const sections = [...updatedDraftConfig.sections]
          const headerIndex = sections.findIndex((s: any) => s.type === "header")
          if (headerIndex !== -1) {
            sections[headerIndex] = {
              ...sections[headerIndex],
              settings: {
                ...sections[headerIndex].settings,
                showSocialMedia: true,
                showSocialIconsOnMobile: true,
                socialLinks: socialLinksData,
              }
            }
            updatedDraftConfig = { ...updatedDraftConfig, sections }
          }
        }

        // Save the synced config back to database
        await supabase
          .from("store_builder_configs")
          .update({ draft_config: updatedDraftConfig })
          .eq("id", config.id)

        // Update local config object to return
        config.draft_config = updatedDraftConfig
      }
    }
  }

  return NextResponse.json(config)
}

// POST - Save draft config
export async function POST(request: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { pageType, config, productId } = await request.json()

  console.log("[v0] API POST received", { pageType, productId, sections: config?.sections?.length })

  if (!pageType || !config) {
    return NextResponse.json({ error: "Missing pageType or config" }, { status: 400 })
  }

  // Get creator
  const { data: creator } = await supabase.from("creators").select("id").eq("user_id", user.id).single()

  if (!creator) {
    return NextResponse.json({ error: "Creator not found" }, { status: 404 })
  }

  console.log("[v0] Creator found", { creatorId: creator.id })

  if (config.headerSettings && config.headerSettings.avatarUrl !== undefined) {
    // If avatarUrl is empty string, set profile.avatar_url to null (removal)
    // If avatarUrl has a value, set it to that value
    const avatarValue = config.headerSettings.avatarUrl === "" ? null : config.headerSettings.avatarUrl
    const { error: profileError } = await supabase
      .from("profiles")
      .update({ avatar_url: avatarValue })
      .eq("id", user.id)

    if (profileError) {
      console.error("[v0] Error updating profile avatar:", profileError)
    } else {
      console.log("[v0] Profile avatar synced:", avatarValue ? "set" : "removed")
    }
  }

  if (productId && pageType === "product") {
    console.log("[v0] Saving product-specific config", { productId, creatorId: creator.id })

    // Check if record exists
    const { data: existing } = await supabase
      .from("product_page_configs")
      .select("id, published_config")
      .eq("creator_id", creator.id)
      .eq("product_id", productId)
      .single()

    console.log("[v0] Existing product config", { exists: !!existing })

    if (existing) {
      // Update existing record
      const { data: updatedConfig, error } = await supabase
        .from("product_page_configs")
        .update({
          draft_config: config,
          draft_updated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("creator_id", creator.id)
        .eq("product_id", productId)
        .select()
        .single()

      if (error) {
        console.error("[v0] Error updating product config:", error)
        return NextResponse.json({ error: "Failed to save product config" }, { status: 500 })
      }

      console.log("[v0] Product config updated successfully", { id: updatedConfig.id })
      return NextResponse.json(updatedConfig)
    } else {
      // Insert new record - must include published_config
      const { data: newConfig, error } = await supabase
        .from("product_page_configs")
        .insert({
          creator_id: creator.id,
          product_id: productId,
          draft_config: config,
          published_config: config, // Set published_config on first save
          draft_updated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single()

      if (error) {
        console.error("[v0] Error inserting product config:", error)
        return NextResponse.json({ error: "Failed to save product config" }, { status: 500 })
      }

      console.log("[v0] Product config inserted successfully", { id: newConfig.id })
      return NextResponse.json(newConfig)
    }
  }

  console.log("[v0] Saving default template", { pageType, creatorId: creator.id })

  // Save to store_builder_configs for shop or default product template
  const { data: existing } = await supabase
    .from("store_builder_configs")
    .select("id")
    .eq("creator_id", creator.id)
    .eq("page_type", pageType)
    .single()

  console.log("[v0] Existing default config", { exists: !!existing })

  if (existing) {
    const { data: updatedConfig, error } = await supabase
      .from("store_builder_configs")
      .update({
        draft_config: config,
        draft_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("creator_id", creator.id)
      .eq("page_type", pageType)
      .select()
      .single()

    if (error) {
      console.error("[v0] Error updating config:", error)
      return NextResponse.json({ error: "Failed to save config" }, { status: 500 })
    }

    console.log("[v0] Default config updated successfully", { id: updatedConfig.id })
    return NextResponse.json(updatedConfig)
  } else {
    const { data: newConfig, error } = await supabase
      .from("store_builder_configs")
      .insert({
        creator_id: creator.id,
        page_type: pageType,
        draft_config: config,
        published_config: config,
        draft_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      console.error("[v0] Error inserting config:", error)
      return NextResponse.json({ error: "Failed to save config" }, { status: 500 })
    }

    console.log("[v0] Default config inserted successfully", { id: newConfig.id })
    return NextResponse.json(newConfig)
  }
}

// PUT - Publish config (copy draft to published)
export async function PUT(request: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { pageType, productId } = await request.json()

  console.log("[v0] API PUT (publish) received", { pageType, productId })

  if (!pageType) {
    return NextResponse.json({ error: "Missing pageType" }, { status: 400 })
  }

  // Get creator
  const { data: creator } = await supabase.from("creators").select("id").eq("user_id", user.id).single()

  if (!creator) {
    return NextResponse.json({ error: "Creator not found" }, { status: 404 })
  }

  console.log("[v0] Creator found for publish", { creatorId: creator.id })

  if (productId && pageType === "product") {
    console.log("[v0] Publishing product-specific config", { productId, creatorId: creator.id })

    const { data: currentConfig } = await supabase
      .from("product_page_configs")
      .select("draft_config")
      .eq("creator_id", creator.id)
      .eq("product_id", productId)
      .single()

    if (!currentConfig) {
      console.error("[v0] No product config found to publish")
      return NextResponse.json({ error: "No product config found to publish. Please save first." }, { status: 404 })
    }

    console.log("[v0] Found draft config to publish", { sections: currentConfig.draft_config?.sections?.length })

    if (currentConfig.draft_config?.headerSettings?.avatarUrl !== undefined) {
      const avatarValue =
        currentConfig.draft_config.headerSettings.avatarUrl === ""
          ? null
          : currentConfig.draft_config.headerSettings.avatarUrl
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ avatar_url: avatarValue })
        .eq("id", user.id)

      if (profileError) {
        console.error("[v0] Error updating profile avatar on publish:", profileError)
      }
    }

    const { data: publishedConfig, error } = await supabase
      .from("product_page_configs")
      .update({
        published_config: currentConfig.draft_config,
        published_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("creator_id", creator.id)
      .eq("product_id", productId)
      .select()
      .single()

    if (error) {
      console.error("[v0] Error publishing product config:", error)
      return NextResponse.json({ error: "Failed to publish product config" }, { status: 500 })
    }

    console.log("[v0] Product config published successfully", {
      id: publishedConfig.id,
      sections: publishedConfig.published_config?.sections?.length,
    })
    return NextResponse.json(publishedConfig)
  }

  console.log("[v0] Publishing default template", { pageType, creatorId: creator.id })

  // Publish shop or default product template
  const { data: currentConfig } = await supabase
    .from("store_builder_configs")
    .select("draft_config")
    .eq("creator_id", creator.id)
    .eq("page_type", pageType)
    .single()

  if (!currentConfig) {
    console.error("[v0] No config found to publish")
    return NextResponse.json({ error: "No config found to publish" }, { status: 404 })
  }

  console.log("[v0] Found draft config to publish", { sections: currentConfig.draft_config?.sections?.length })

  if (currentConfig.draft_config?.headerSettings?.avatarUrl !== undefined) {
    const avatarValue =
      currentConfig.draft_config.headerSettings.avatarUrl === ""
        ? null
        : currentConfig.draft_config.headerSettings.avatarUrl
    const { error: profileError } = await supabase
      .from("profiles")
      .update({ avatar_url: avatarValue })
      .eq("id", user.id)

    if (profileError) {
      console.error("[v0] Error updating profile avatar on publish:", profileError)
    }
  }

  const { data: publishedConfig, error } = await supabase
    .from("store_builder_configs")
    .update({
      published_config: currentConfig.draft_config,
      published_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("creator_id", creator.id)
    .eq("page_type", pageType)
    .select()
    .single()

  if (error) {
    console.error("[v0] Error publishing config:", error)
    return NextResponse.json({ error: "Failed to publish config" }, { status: 500 })
  }

  console.log("[v0] Default config published successfully", {
    id: publishedConfig.id,
    sections: publishedConfig.published_config?.sections?.length,
  })
  return NextResponse.json(publishedConfig)
}
