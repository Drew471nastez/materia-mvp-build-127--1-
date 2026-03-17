// ============================================================
// Website Builder: Section schemas — drives the visual editor
// ============================================================
import type { SectionSchema } from "./types"

export const SECTION_SCHEMAS: Record<string, SectionSchema> = {
  header: {
    type: "header",
    name: "Header",
    description: "Site-wide navigation bar",
    icon: "layout-template",
    category: "structure",
    fields: [
      { id: "logo_text", label: "Logo text", type: "text", placeholder: "My Store" },
      { id: "logo_url", label: "Logo image", type: "image" },
      { id: "cta_text", label: "Button text", type: "text", placeholder: "Shop Now" },
      { id: "cta_url", label: "Button URL", type: "link" },
      { id: "sticky", label: "Sticky header", type: "toggle", default: true },
      { id: "bg_color", label: "Background", type: "color", default: "#ffffff" },
      { id: "text_color", label: "Text color", type: "color", default: "#0f172a" },
    ],
    blocks: [
      {
        type: "nav_link",
        name: "Nav link",
        fields: [
          { id: "label", label: "Label", type: "text", placeholder: "Home" },
          { id: "url", label: "URL", type: "link" },
        ],
      },
    ],
    max_blocks: 8,
  },

  hero: {
    type: "hero",
    name: "Hero",
    description: "Full-width hero section with heading, subheading, and CTA",
    icon: "star",
    category: "content",
    fields: [
      { id: "heading", label: "Heading", type: "text", placeholder: "Welcome to our store" },
      { id: "subheading", label: "Subheading", type: "textarea", placeholder: "Discover our products" },
      { id: "cta_text", label: "Button text", type: "text", placeholder: "Shop Now" },
      { id: "cta_url", label: "Button URL", type: "link" },
      {
        id: "cta_style",
        label: "Button style",
        type: "select",
        default: "primary",
        options: [
          { label: "Primary", value: "primary" },
          { label: "Secondary", value: "secondary" },
          { label: "Outline", value: "outline" },
          { label: "Ghost", value: "ghost" },
        ],
      },
      { id: "image_url", label: "Background image", type: "image" },
      {
        id: "layout",
        label: "Layout",
        type: "select",
        default: "center",
        options: [
          { label: "Center", value: "center" },
          { label: "Left", value: "left" },
          { label: "Right", value: "right" },
        ],
      },
      { id: "full_height", label: "Full screen height", type: "toggle", default: false },
      { id: "bg_color", label: "Background color", type: "color", default: "#0f172a" },
      { id: "text_color", label: "Text color", type: "color", default: "#ffffff" },
      { id: "overlay_opacity", label: "Image overlay opacity", type: "range", min: 0, max: 100, step: 5, default: 40 },
    ],
    presets: [
      {
        name: "Dark hero",
        settings: {
          heading: "Build Something Great",
          subheading: "Premium digital products for creators.",
          cta_text: "Get Started",
          cta_url: "/products",
          cta_style: "primary",
          layout: "center",
          full_height: false,
          bg_color: "#0f172a",
          text_color: "#ffffff",
        },
      },
      {
        name: "Light hero",
        settings: {
          heading: "Build Something Great",
          subheading: "Premium digital products for creators.",
          cta_text: "Get Started",
          cta_url: "/products",
          cta_style: "primary",
          layout: "left",
          full_height: false,
          bg_color: "#f8fafc",
          text_color: "#0f172a",
        },
      },
    ],
  },

  rich_text: {
    type: "rich_text",
    name: "Rich text",
    description: "A text block with optional heading",
    icon: "type",
    category: "content",
    fields: [
      { id: "heading", label: "Heading", type: "text", placeholder: "About us" },
      { id: "body", label: "Body text", type: "textarea", placeholder: "Write your story..." },
      {
        id: "alignment",
        label: "Alignment",
        type: "select",
        default: "left",
        options: [
          { label: "Left", value: "left" },
          { label: "Center", value: "center" },
          { label: "Right", value: "right" },
        ],
      },
      {
        id: "max_width",
        label: "Content width",
        type: "select",
        default: "medium",
        options: [
          { label: "Narrow", value: "narrow" },
          { label: "Medium", value: "medium" },
          { label: "Wide", value: "wide" },
          { label: "Full", value: "full" },
        ],
      },
      { id: "bg_color", label: "Background", type: "color", default: "#ffffff" },
      { id: "text_color", label: "Text color", type: "color", default: "#0f172a" },
    ],
  },

  image_banner: {
    type: "image_banner",
    name: "Image banner",
    description: "Large image with optional text overlay",
    icon: "image",
    category: "media",
    fields: [
      { id: "image_url", label: "Image", type: "image" },
      { id: "heading", label: "Overlay heading", type: "text" },
      { id: "subheading", label: "Overlay subheading", type: "text" },
      {
        id: "aspect_ratio",
        label: "Aspect ratio",
        type: "select",
        default: "16:9",
        options: [
          { label: "16:9 (Widescreen)", value: "16:9" },
          { label: "3:1 (Banner)", value: "3:1" },
          { label: "4:3 (Classic)", value: "4:3" },
          { label: "Auto", value: "auto" },
        ],
      },
      { id: "overlay_opacity", label: "Overlay opacity", type: "range", min: 0, max: 100, step: 5, default: 30 },
      { id: "text_color", label: "Text color", type: "color", default: "#ffffff" },
    ],
  },

  product_list: {
    type: "product_list",
    name: "Product list",
    description: "Display your products in a grid",
    icon: "shopping-bag",
    category: "commerce",
    fields: [
      { id: "heading", label: "Heading", type: "text", placeholder: "Featured Products" },
      { id: "subheading", label: "Subheading", type: "text" },
      { id: "show_price", label: "Show prices", type: "toggle", default: true },
      { id: "show_button", label: "Show buy button", type: "toggle", default: true },
      {
        id: "columns",
        label: "Columns",
        type: "select",
        default: "3",
        options: [
          { label: "2 columns", value: "2" },
          { label: "3 columns", value: "3" },
          { label: "4 columns", value: "4" },
        ],
      },
      { id: "bg_color", label: "Background", type: "color", default: "#ffffff" },
      { id: "text_color", label: "Text color", type: "color", default: "#0f172a" },
    ],
  },

  testimonials: {
    type: "testimonials",
    name: "Testimonials",
    description: "Customer reviews and testimonials",
    icon: "message-square",
    category: "social-proof",
    fields: [
      { id: "heading", label: "Section heading", type: "text", placeholder: "What customers say" },
      { id: "bg_color", label: "Background", type: "color", default: "#f8fafc" },
      { id: "text_color", label: "Text color", type: "color", default: "#0f172a" },
    ],
    blocks: [
      {
        type: "testimonial",
        name: "Testimonial",
        fields: [
          { id: "quote", label: "Quote", type: "textarea", placeholder: "Amazing product!" },
          { id: "author", label: "Author name", type: "text", placeholder: "Jane Smith" },
          { id: "role", label: "Role / title", type: "text", placeholder: "Designer" },
          { id: "avatar_url", label: "Avatar", type: "image" },
          { id: "rating", label: "Rating (1–5)", type: "number", min: 1, max: 5, default: 5 },
        ],
      },
    ],
    max_blocks: 12,
    presets: [
      {
        name: "3 testimonials",
        settings: { heading: "What people say", bg_color: "#f8fafc" },
        blocks: [
          { id: "t-1", type: "testimonial", settings: { quote: "Absolutely changed how I work.", author: "Alex M.", role: "Freelancer", rating: 5 } },
          { id: "t-2", type: "testimonial", settings: { quote: "Worth every cent. Highly recommend.", author: "Sara J.", role: "Designer", rating: 5 } },
          { id: "t-3", type: "testimonial", settings: { quote: "The best purchase I made this year.", author: "Chris L.", role: "Developer", rating: 5 } },
        ],
      },
    ],
  },

  faq: {
    type: "faq",
    name: "FAQ",
    description: "Frequently asked questions accordion",
    icon: "help-circle",
    category: "content",
    fields: [
      { id: "heading", label: "Section heading", type: "text", placeholder: "Frequently Asked Questions" },
      { id: "subheading", label: "Subheading", type: "text" },
      { id: "bg_color", label: "Background", type: "color", default: "#ffffff" },
      { id: "text_color", label: "Text color", type: "color", default: "#0f172a" },
    ],
    blocks: [
      {
        type: "faq_item",
        name: "FAQ item",
        fields: [
          { id: "question", label: "Question", type: "text", placeholder: "How does it work?" },
          { id: "answer", label: "Answer", type: "textarea", placeholder: "Here's how..." },
        ],
      },
    ],
    max_blocks: 20,
    presets: [
      {
        name: "3 FAQs",
        settings: { heading: "Frequently Asked Questions" },
        blocks: [
          { id: "faq-1", type: "faq_item", settings: { question: "How do I access my purchase?", answer: "You'll receive an email with a download link immediately after purchase." } },
          { id: "faq-2", type: "faq_item", settings: { question: "Do you offer refunds?", answer: "Yes, we offer a 30-day money-back guarantee on all purchases." } },
          { id: "faq-3", type: "faq_item", settings: { question: "Can I use these commercially?", answer: "Yes! All our products include a commercial license." } },
        ],
      },
    ],
  },

  cta: {
    type: "cta",
    name: "Call to action",
    description: "A high-visibility call-to-action section",
    icon: "megaphone",
    category: "content",
    fields: [
      { id: "heading", label: "Heading", type: "text", placeholder: "Ready to get started?" },
      { id: "subheading", label: "Subheading", type: "textarea" },
      { id: "button_text", label: "Button text", type: "text", placeholder: "Get Started" },
      { id: "button_url", label: "Button URL", type: "link" },
      { id: "bg_color", label: "Background", type: "color", default: "#6366f1" },
      { id: "text_color", label: "Text color", type: "color", default: "#ffffff" },
      { id: "button_color", label: "Button color", type: "color", default: "#ffffff" },
    ],
  },

  stats: {
    type: "stats",
    name: "Stats",
    description: "Highlight key numbers and metrics",
    icon: "bar-chart-2",
    category: "content",
    fields: [
      { id: "bg_color", label: "Background", type: "color", default: "#f8fafc" },
      { id: "text_color", label: "Text color", type: "color", default: "#0f172a" },
    ],
    blocks: [
      {
        type: "stat",
        name: "Stat",
        fields: [
          { id: "value", label: "Value", type: "text", placeholder: "10K+" },
          { id: "label", label: "Label", type: "text", placeholder: "Customers" },
        ],
      },
    ],
    max_blocks: 6,
    presets: [
      {
        name: "4 stats",
        settings: {},
        blocks: [
          { id: "s-1", type: "stat", settings: { value: "10K+", label: "Customers" } },
          { id: "s-2", type: "stat", settings: { value: "50+", label: "Products" } },
          { id: "s-3", type: "stat", settings: { value: "4.9★", label: "Rating" } },
          { id: "s-4", type: "stat", settings: { value: "100%", label: "Digital" } },
        ],
      },
    ],
  },

  feature_grid: {
    type: "feature_grid",
    name: "Feature grid",
    description: "A grid of features with icons",
    icon: "grid",
    category: "content",
    fields: [
      { id: "heading", label: "Heading", type: "text", placeholder: "Why choose us" },
      { id: "subheading", label: "Subheading", type: "text" },
      {
        id: "columns",
        label: "Columns",
        type: "select",
        default: "3",
        options: [
          { label: "2 columns", value: "2" },
          { label: "3 columns", value: "3" },
          { label: "4 columns", value: "4" },
        ],
      },
      { id: "bg_color", label: "Background", type: "color", default: "#ffffff" },
      { id: "text_color", label: "Text color", type: "color", default: "#0f172a" },
    ],
    blocks: [
      {
        type: "feature",
        name: "Feature",
        fields: [
          {
            id: "icon",
            label: "Icon",
            type: "select",
            default: "zap",
            options: [
              { label: "Zap", value: "zap" },
              { label: "Shield", value: "shield" },
              { label: "Star", value: "star" },
              { label: "Check", value: "check-circle" },
              { label: "Download", value: "download" },
              { label: "Heart", value: "heart" },
              { label: "Globe", value: "globe" },
              { label: "Lock", value: "lock" },
              { label: "Refresh", value: "refresh-cw" },
              { label: "Rocket", value: "rocket" },
            ],
          },
          { id: "title", label: "Title", type: "text", placeholder: "Feature name" },
          { id: "description", label: "Description", type: "textarea", placeholder: "Describe this feature" },
        ],
      },
    ],
    max_blocks: 12,
  },

  logo_bar: {
    type: "logo_bar",
    name: "Logo bar",
    description: "Show logos of brands, press, or partners",
    icon: "award",
    category: "social-proof",
    fields: [
      { id: "heading", label: "Heading", type: "text", placeholder: "As seen in" },
      { id: "bg_color", label: "Background", type: "color", default: "#f8fafc" },
      { id: "grayscale", label: "Grayscale logos", type: "toggle", default: true },
    ],
    blocks: [
      {
        type: "logo",
        name: "Logo",
        fields: [
          { id: "image_url", label: "Logo image", type: "image" },
          { id: "alt", label: "Alt text", type: "text", placeholder: "Brand name" },
          { id: "url", label: "Link URL", type: "link" },
        ],
      },
    ],
    max_blocks: 10,
  },

  gallery: {
    type: "gallery",
    name: "Gallery",
    description: "An image grid gallery",
    icon: "layout-grid",
    category: "media",
    fields: [
      { id: "heading", label: "Heading", type: "text" },
      {
        id: "columns",
        label: "Columns",
        type: "select",
        default: "3",
        options: [
          { label: "2 columns", value: "2" },
          { label: "3 columns", value: "3" },
          { label: "4 columns", value: "4" },
        ],
      },
      { id: "bg_color", label: "Background", type: "color", default: "#ffffff" },
    ],
    blocks: [
      {
        type: "gallery_image",
        name: "Image",
        fields: [
          { id: "image_url", label: "Image", type: "image" },
          { id: "caption", label: "Caption", type: "text" },
        ],
      },
    ],
    max_blocks: 20,
  },

  pricing: {
    type: "pricing",
    name: "Pricing",
    description: "Pricing plans and tiers",
    icon: "dollar-sign",
    category: "commerce",
    fields: [
      { id: "heading", label: "Heading", type: "text", placeholder: "Simple, transparent pricing" },
      { id: "subheading", label: "Subheading", type: "text" },
      { id: "bg_color", label: "Background", type: "color", default: "#ffffff" },
      { id: "text_color", label: "Text color", type: "color", default: "#0f172a" },
    ],
    blocks: [
      {
        type: "pricing_plan",
        name: "Plan",
        fields: [
          { id: "name", label: "Plan name", type: "text", placeholder: "Pro" },
          { id: "price", label: "Price", type: "text", placeholder: "$29" },
          { id: "period", label: "Period", type: "text", placeholder: "per month" },
          { id: "description", label: "Description", type: "text" },
          { id: "features", label: "Features (one per line)", type: "textarea" },
          { id: "cta_text", label: "Button text", type: "text", placeholder: "Get started" },
          { id: "cta_url", label: "Button URL", type: "link" },
          { id: "is_featured", label: "Highlight as featured", type: "toggle", default: false },
        ],
      },
    ],
    max_blocks: 4,
  },

  footer: {
    type: "footer",
    name: "Footer",
    description: "Site footer with links and copyright",
    icon: "layout-template",
    category: "structure",
    fields: [
      { id: "logo_text", label: "Logo text", type: "text", placeholder: "My Store" },
      { id: "logo_url", label: "Logo image", type: "image" },
      { id: "copyright", label: "Copyright text", type: "text", placeholder: "© 2026 My Store" },
      { id: "bg_color", label: "Background", type: "color", default: "#0f172a" },
      { id: "text_color", label: "Text color", type: "color", default: "#94a3b8" },
    ],
    blocks: [
      {
        type: "footer_link",
        name: "Footer link",
        fields: [
          { id: "label", label: "Label", type: "text", placeholder: "About" },
          { id: "url", label: "URL", type: "link" },
        ],
      },
    ],
    max_blocks: 16,
  },
}

// Ordered list of sections available in the "Add section" panel
export const ADDABLE_SECTIONS = [
  "hero",
  "rich_text",
  "image_banner",
  "product_list",
  "feature_grid",
  "testimonials",
  "stats",
  "faq",
  "cta",
  "logo_bar",
  "gallery",
  "pricing",
]

// Structure sections (header/footer) — shown separately at top/bottom of sidebar
export const STRUCTURE_SECTIONS = ["header", "footer"]

// Category labels for the add-section panel
export const SECTION_CATEGORIES: Record<string, string> = {
  structure: "Structure",
  content: "Content",
  media: "Media",
  commerce: "Commerce",
  "social-proof": "Social Proof",
}
