// ============================================================
// Website Builder: Theme-settings schema groups
// Drives the "Theme settings" panel in the Store Editor
// ============================================================
import type { ThemeSettingsGroup } from "./types"

export const THEME_SETTINGS_GROUPS: ThemeSettingsGroup[] = [
  {
    id: "branding",
    label: "Branding",
    icon: "image",
    fields: [
      { id: "brand_name", label: "Store name", type: "text", placeholder: "My Store" },
      { id: "logo_url", label: "Logo", type: "image" },
      { id: "favicon_url", label: "Favicon", type: "image" },
    ],
  },
  {
    id: "colors",
    label: "Colors",
    icon: "palette",
    fields: [
      { id: "primary_color", label: "Primary", type: "color", default: "#6366f1" },
      { id: "secondary_color", label: "Secondary", type: "color", default: "#8b5cf6" },
      { id: "accent_color", label: "Accent", type: "color", default: "#f59e0b" },
      { id: "background_color", label: "Page background", type: "color", default: "#ffffff" },
      { id: "surface_color", label: "Surface / card", type: "color", default: "#f8fafc" },
      { id: "text_color", label: "Heading text", type: "color", default: "#0f172a" },
      { id: "text_secondary_color", label: "Body text", type: "color", default: "#64748b" },
      { id: "border_color", label: "Border", type: "color", default: "#e2e8f0" },
    ],
  },
  {
    id: "typography",
    label: "Typography",
    icon: "type",
    fields: [
      {
        id: "font_heading",
        label: "Heading font",
        type: "select",
        default: "Inter",
        options: [
          { label: "Inter", value: "Inter" },
          { label: "Plus Jakarta Sans", value: "Plus Jakarta Sans" },
          { label: "Space Grotesk", value: "Space Grotesk" },
          { label: "DM Sans", value: "DM Sans" },
          { label: "Poppins", value: "Poppins" },
          { label: "Montserrat", value: "Montserrat" },
        ],
      },
      {
        id: "font_body",
        label: "Body font",
        type: "select",
        default: "Inter",
        options: [
          { label: "Inter", value: "Inter" },
          { label: "DM Sans", value: "DM Sans" },
          { label: "Plus Jakarta Sans", value: "Plus Jakarta Sans" },
          { label: "Space Grotesk", value: "Space Grotesk" },
          { label: "Poppins", value: "Poppins" },
        ],
      },
      { id: "font_size_base", label: "Base font size (px)", type: "range", min: 13, max: 20, step: 1, default: 16, unit: "px" },
    ],
  },
  {
    id: "layout",
    label: "Layout",
    icon: "layout",
    fields: [
      {
        id: "button_style",
        label: "Button style",
        type: "select",
        default: "rounded",
        options: [
          { label: "Rounded", value: "rounded" },
          { label: "Square", value: "square" },
          { label: "Pill", value: "pill" },
        ],
      },
      { id: "border_radius", label: "Border radius (px)", type: "range", min: 0, max: 24, step: 1, default: 8, unit: "px" },
      { id: "page_width", label: "Max page width (px)", type: "range", min: 900, max: 1600, step: 20, default: 1280, unit: "px" },
      { id: "spacing_scale", label: "Spacing scale", type: "range", min: 0.5, max: 2.0, step: 0.1, default: 1.0 },
    ],
  },
  {
    id: "announcement",
    label: "Announcement bar",
    icon: "megaphone",
    fields: [
      { id: "announcement_bar_enabled", label: "Show announcement bar", type: "toggle", default: false },
      { id: "announcement_bar_text", label: "Message", type: "text", placeholder: "Free shipping on all orders!" },
      { id: "announcement_bar_bg", label: "Background", type: "color", default: "#6366f1" },
      { id: "announcement_bar_color", label: "Text color", type: "color", default: "#ffffff" },
    ],
  },
  {
    id: "social",
    label: "Social links",
    icon: "share-2",
    fields: [
      { id: "social_twitter", label: "Twitter / X URL", type: "link", placeholder: "https://twitter.com/username" },
      { id: "social_instagram", label: "Instagram URL", type: "link", placeholder: "https://instagram.com/username" },
      { id: "social_youtube", label: "YouTube URL", type: "link", placeholder: "https://youtube.com/@channel" },
      { id: "social_tiktok", label: "TikTok URL", type: "link", placeholder: "https://tiktok.com/@username" },
      { id: "social_linkedin", label: "LinkedIn URL", type: "link" },
      { id: "social_discord", label: "Discord URL", type: "link" },
    ],
  },
  {
    id: "seo",
    label: "SEO",
    icon: "search",
    fields: [
      { id: "seo_title", label: "Default page title", type: "text", placeholder: "My Store — Digital Products" },
      { id: "seo_description", label: "Meta description", type: "textarea", placeholder: "Discover our collection of digital products..." },
    ],
  },
]
