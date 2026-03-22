import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

// POST /api/website-builder/themes/add
// Adds a theme from the catalog by theme_id, creating a new install with default settings/pages
export async function POST(req: Request) {
  const supabase = await createClient()
  const admin = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: creator } = await supabase
    .from("creators").select("id").eq("user_id", user.id).maybeSingle()
  if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const themeId: string | undefined = body?.theme_id

  if (!themeId) return NextResponse.json({ error: "theme_id is required" }, { status: 400 })

  // Check max 3 installs
  const { count } = await supabase
    .from("store_theme_installs")
    .select("id", { count: "exact", head: true })
    .eq("creator_id", creator.id)

  if ((count ?? 0) >= 3) {
    return NextResponse.json({ error: "Maximum 3 websites allowed. Remove one to add another." }, { status: 400 })
  }

  // Check if this theme_id already installed
  const { data: existing } = await supabase
    .from("store_theme_installs")
    .select("id")
    .eq("creator_id", creator.id)
    .eq("theme_id", themeId)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: "Theme already added" }, { status: 400 })
  }

  // Get theme from catalog
  const { data: theme } = await admin
    .from("themes")
    .select("*")
    .eq("id", themeId)
    .maybeSingle()

  if (!theme) return NextResponse.json({ error: "Theme not found in catalog" }, { status: 404 })

  // Create install
  const { data: newInstall, error: installErr } = await admin
    .from("store_theme_installs")
    .insert({
      creator_id: creator.id,
      theme_id: themeId,
      name: theme.name,
      status: "draft",
      is_custom: false,
      sort_order: (count ?? 0) + 1,
    })
    .select()
    .single()

  if (installErr || !newInstall) {
    return NextResponse.json({ error: installErr?.message ?? "Failed to add theme" }, { status: 500 })
  }

  // Create default settings based on which theme
  const settingsMap: Record<string, Record<string, unknown>> = {
    "a1b2c3d4-e5f6-7890-abcd-ef1234567890": {
      brand_name: "My Store",
      primary_color: "#6366f1",
      secondary_color: "#8b5cf6",
      accent_color: "#f59e0b",
      background_color: "#ffffff",
      surface_color: "#f8fafc",
      text_color: "#0f172a",
      text_secondary_color: "#64748b",
      border_color: "#e2e8f0",
      font_heading: "Inter",
      font_body: "Inter",
      button_style: "rounded",
      border_radius: 8,
    },
    "b2c3d4e5-f6a7-8901-bcde-f12345678901": {
      brand_name: "My Store",
      primary_color: "#171717",
      secondary_color: "#525252",
      accent_color: "#a855f7",
      background_color: "#ffffff",
      surface_color: "#f5f5f5",
      text_color: "#0a0a0a",
      text_secondary_color: "#737373",
      border_color: "#e5e5e5",
      font_heading: "Plus Jakarta Sans",
      font_body: "Inter",
      button_style: "square",
      border_radius: 4,
    },
    "c3d4e5f6-a7b8-9012-cdef-123456789012": {
      brand_name: "My Store",
      primary_color: "#7c3aed",
      secondary_color: "#db2777",
      accent_color: "#f59e0b",
      background_color: "#0a0a0f",
      surface_color: "#1a1a2e",
      text_color: "#e2e8f0",
      text_secondary_color: "#94a3b8",
      border_color: "#2a2a4a",
      font_heading: "Space Grotesk",
      font_body: "Inter",
      button_style: "pill",
      border_radius: 9999,
    },
  }

  const defaultSettings = settingsMap[themeId] ?? {
    brand_name: "My Store",
    primary_color: "#6366f1",
    background_color: "#ffffff",
    text_color: "#0f172a",
    font_heading: "Inter",
    font_body: "Inter",
    button_style: "rounded",
    border_radius: 8,
  }

  await admin.from("store_theme_settings").insert({
    install_id: newInstall.id,
    settings: defaultSettings,
  })

  // Create default home page
  const defaultSections = [
    {
      id: "header-default",
      type: "header",
      name: "Header",
      hidden: false,
      settings: { logo_text: "My Store", cta_text: "Shop Now", cta_url: "/products", sticky: true, bg_color: defaultSettings.background_color ?? "#ffffff", text_color: defaultSettings.text_color ?? "#0f172a" },
      blocks: [],
    },
    {
      id: "hero-default",
      type: "hero",
      name: "Hero",
      hidden: false,
      settings: {
        heading: "Discover Amazing Digital Products",
        subheading: "High-quality digital downloads, courses, and resources created just for you.",
        cta_text: "Shop Now",
        cta_url: "/products",
        cta_style: "primary",
        layout: "center",
        full_height: false,
        bg_color: themeId === "c3d4e5f6-a7b8-9012-cdef-123456789012" ? "#0a0a0f" : "#0f172a",
        text_color: "#ffffff",
        overlay_opacity: 0,
      },
      blocks: [],
    },
    {
      id: "features-default",
      type: "feature_grid",
      name: "Features",
      hidden: false,
      settings: { heading: "Why Choose Us", columns: "3", bg_color: defaultSettings.surface_color ?? "#f8fafc", text_color: defaultSettings.text_color ?? "#0f172a" },
      blocks: [
        { id: "feat-1", type: "feature", settings: { icon: "zap", title: "Instant Download", description: "Get your files immediately after purchase, no waiting." } },
        { id: "feat-2", type: "feature", settings: { icon: "shield", title: "Secure & Safe", description: "All transactions are encrypted and your data is protected." } },
        { id: "feat-3", type: "feature", settings: { icon: "refresh-cw", title: "Lifetime Access", description: "Purchase once and access your content forever." } },
      ],
    },
    {
      id: "products-default",
      type: "product_list",
      name: "Featured Products",
      hidden: false,
      settings: { heading: "Featured Products", subheading: "Our most popular digital products", show_price: true, show_button: true, columns: "3", bg_color: defaultSettings.background_color ?? "#ffffff", text_color: defaultSettings.text_color ?? "#0f172a" },
      blocks: [],
    },
    {
      id: "cta-default",
      type: "cta",
      name: "Call to Action",
      hidden: false,
      settings: { heading: "Ready to Get Started?", subheading: "Join thousands of creators who trust our platform.", button_text: "Browse Products", button_url: "/products", bg_color: defaultSettings.primary_color ?? "#6366f1", text_color: "#ffffff", button_color: "#ffffff" },
      blocks: [],
    },
    {
      id: "footer-default",
      type: "footer",
      name: "Footer",
      hidden: false,
      settings: { logo_text: "My Store", copyright: "\u00a9 2026 My Store. All rights reserved.", bg_color: themeId === "c3d4e5f6-a7b8-9012-cdef-123456789012" ? "#0a0a0f" : "#0f172a", text_color: "#94a3b8" },
      blocks: [],
    },
  ]

  // Create home page
  await admin.from("store_theme_pages").insert({
    install_id: newInstall.id,
    page_key: "home",
    sections: defaultSections,
  })

  // Create product page
  const productSections = [
    defaultSections[0], // header
    {
      id: "product-hero",
      type: "split_content",
      name: "Product",
      hidden: false,
      settings: { heading: "Product Name", body: "<p>Describe your product here.</p>", button_text: "Buy Now", button_url: "#", image_position: "left", bg_color: defaultSettings.background_color ?? "#ffffff", text_color: defaultSettings.text_color ?? "#0f172a", padding_top: 60, padding_bottom: 60 },
      blocks: [],
    },
    {
      id: "product-features",
      type: "feature_grid",
      name: "What's Included",
      hidden: false,
      settings: { heading: "What's Included", subheading: "Everything you get with your purchase", columns: "3", bg_color: defaultSettings.surface_color ?? "#f8fafc", text_color: defaultSettings.text_color ?? "#0f172a" },
      blocks: [
        { id: "pf-1", type: "feature", settings: { icon: "download", title: "Instant Download", description: "Get immediate access to all files after purchase." } },
        { id: "pf-2", type: "feature", settings: { icon: "refresh-cw", title: "Free Updates", description: "Receive all future updates at no extra cost." } },
        { id: "pf-3", type: "feature", settings: { icon: "shield", title: "Satisfaction Guarantee", description: "Not happy? Get a full refund within 30 days." } },
      ],
    },
    {
      id: "product-reviews",
      type: "testimonials",
      name: "Customer Reviews",
      hidden: false,
      settings: { heading: "What Customers Say", layout: "grid", columns: "2", bg_color: defaultSettings.background_color ?? "#ffffff", text_color: defaultSettings.text_color ?? "#0f172a" },
      blocks: [
        { id: "pr-1", type: "testimonial", settings: { quote: "Absolutely love this product. It saves me hours every week!", author: "Sarah J.", role: "Designer", rating: 5, verified: true } },
        { id: "pr-2", type: "testimonial", settings: { quote: "Best purchase I've made this year. Highly recommend!", author: "Mike R.", role: "Developer", rating: 5, verified: true } },
      ],
    },
    {
      id: "product-related",
      type: "product_list",
      name: "Related Products",
      hidden: false,
      settings: { heading: "You Might Also Like", show_price: true, show_button: true, columns: "3", bg_color: defaultSettings.surface_color ?? "#f8fafc", text_color: defaultSettings.text_color ?? "#0f172a" },
      blocks: [],
    },
    defaultSections[defaultSections.length - 1], // footer
  ]

  await admin.from("store_theme_pages").insert({
    install_id: newInstall.id,
    page_key: "product",
    sections: productSections,
  })

  return NextResponse.json({ install: newInstall })
}
