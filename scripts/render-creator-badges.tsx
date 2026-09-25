/**
 * The creator page's header with the real Veteran badge beside the name, and
 * a product page's creator row (a link, the way the page draws it) carrying
 * the same badge. Driven by scripts/check-creator-badges.mjs.
 */
import { createElement } from "react"
import { createRoot } from "react-dom/client"

import { ShopHeaderRenderer } from "@/components/store-builder/section-renderer"
import { CreatorBadges } from "@/components/storefront/creator-badges"
import { defaultShopHeaderSettings } from "@/lib/store-builder/defaults"
import { creatorBadges } from "@/lib/creators/badges"

const profile = { display_name: "Luca Dragoste", username: "lucadragoste", avatar_url: null, created_at: "2025-12-16T00:00:00Z" }
const badges = creatorBadges(profile)
const dark = new URLSearchParams(location.search).get("theme") === "dark"
const ink = dark ? "#f4f4f5" : undefined

try {
  createRoot(document.getElementById("root")!).render(
    createElement(
      "div",
      { style: { background: dark ? "#0f0f10" : "#f6f6f7", color: dark ? "#f4f4f5" : undefined, minHeight: "100vh" } },
      createElement(ShopHeaderRenderer, {
        settings: { ...defaultShopHeaderSettings, bio: "SEO and GEO for product brands." } as never,
        creator: { cover_url: null, bio: null },
        profile,
        products: [],
        productCount: 1,
        badges,
        surface: dark ? { textColor: "#f4f4f5", mutedColor: "#a1a1aa" } : undefined,
      }),
      createElement(
        "div",
        { style: { maxWidth: 560, margin: "40px auto", padding: "0 16px" } },
        createElement(
          "a",
          { href: "#went-to-the-creator", "data-probe-row": "", className: "creator-link inline-flex items-center gap-3 rounded-lg min-h-[44px]" },
          createElement("span", { className: "h-10 w-10 rounded-full bg-[#d8d4cc]" }),
          createElement("p", { className: "font-medium truncate", style: { color: ink } }, "Luca Dragoste"),
          createElement(CreatorBadges, { badges, ink, size: 17, className: "-ml-1.5" }),
        ),
      ),
    ),
  )
} catch (e) {
  ;(window as unknown as { __err: string }).__err = String((e as Error)?.stack || e)
}
