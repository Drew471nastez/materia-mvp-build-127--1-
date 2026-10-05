import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { mainProductSection } from "@/lib/website-builder/product-page"
import { ensureStarterWebsite } from "@/lib/website-builder/starter-website"

// Default product page template sections
const DEFAULT_PRODUCT_SECTIONS = [
  {
    id: "header-global",
    type: "header",
    name: "Header",
    hidden: false,
    settings: {
      logo_text: "My Store",
      logo_height: 64,
      cta_text: "Shop Now",
      cta_url: "/products",
      sticky: true,
      bg_color: "#ffffff",
      text_color: "#0f172a",
      nav_link_color: "#000000",
      color_scheme: "white",
      header_layout: "logo_left_nav_right",
      header_width: "full",
      header_fixed: true,
      header_transparent: false,
      vertical_padding_vw: 1.2,
      link_spacing_vw: 1.4,
      show_search: true,
      show_cart: true,
    },
    blocks: [
      { id: "nav-home",    type: "nav_link", settings: { label: "Home",    url: "/",        link_type: "custom" } },
      { id: "nav-shop",    type: "nav_link", settings: { label: "Shop",    url: "/shop",    link_type: "custom" } },
      { id: "nav-about",   type: "nav_link", settings: { label: "About",   url: "/about",   link_type: "custom" } },
      { id: "nav-contact", type: "nav_link", settings: { label: "Contact", url: "/contact", link_type: "custom" } },
    ],
  },
  /* The section that draws the real product, not a "Product Name"
     placeholder: see lib/website-builder/product-page.ts. */
  mainProductSection(),
  {
    id: "product-features",
    type: "feature_grid",
    name: "What's Included",
    hidden: false,
    settings: {
      heading: "What's Included",
      subheading: "Everything you get with your purchase",
      columns: "3",
      bg_color: "#f8fafc",
      text_color: "#0f172a",
      padding_top: 60,
      padding_bottom: 60,
    },
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
    settings: {
      heading: "What Customers Say",
      subheading: "Hear from people who love this product",
      layout: "grid",
      columns: "2",
      bg_color: "#ffffff",
      text_color: "#111827",
      padding_top: 60,
      padding_bottom: 60,
    },
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
    settings: {
      heading: "You Might Also Like",
      subheading: "More products from this creator",
      show_price: true,
      show_button: true,
      columns: "3",
      bg_color: "#f8fafc",
      text_color: "#0f172a",
      padding_top: 60,
      padding_bottom: 60,
    },
    blocks: [],
  },
  {
    id: "product-cta",
    type: "cta",
    name: "Call to Action",
    hidden: false,
    settings: {
      heading: "Ready to Get Started?",
      subheading: "Join thousands of satisfied customers.",
      button_text: "Buy Now",
      button_url: "#",
      bg_color: "#0f172a",
      text_color: "#ffffff",
      button_color: "#6366f1",
      padding_top: 60,
      padding_bottom: 60,
    },
    blocks: [],
  },
  {
    id: "footer-global",
    type: "footer",
    name: "Footer",
    hidden: false,
    settings: {
      logo_text: "My Store",
      copyright: "\u00a9 2026 My Store. All rights reserved.",
      bg_color: "#0f172a",
      text_color: "#94a3b8",
    },
    blocks: [],
  },
]

// POST /api/website-builder/initialize
// Idempotently gives a creator with no website the default theme, as a draft.
// Also ensures product page templates exist for all installs.
export async function POST() {
  const supabase = await createClient()
  const admin = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: creator } = await supabase
    .from("creators")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle()

  if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 })

  /* The default theme as a draft when the library is empty, never published
     here: the same seed the website page runs (lib/website-builder/starter-website.ts). */
  await ensureStarterWebsite(admin, creator.id)

  // Ensure product page templates exist for all installs
  const { data: installs } = await admin
    .from("store_theme_installs")
    .select("id")
    .eq("creator_id", creator.id)

  if (installs && installs.length > 0) {
    for (const install of installs) {
      // Check if product page already exists
      const { data: existing } = await admin
        .from("store_theme_pages")
        .select("id")
        .eq("install_id", install.id)
        .eq("page_key", "product")
        .maybeSingle()

      if (!existing) {
        await admin
          .from("store_theme_pages")
          .insert({
            install_id: install.id,
            page_key: "product",
            sections: DEFAULT_PRODUCT_SECTIONS,
          })
      }
    }
  }

  return NextResponse.json({ ok: true })
}
