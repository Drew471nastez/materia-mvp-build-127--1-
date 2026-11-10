/**
 * WAVE 10: THE ABOUT STORY'S FADE, ON A DARK AND A LIGHT SCHEME.
 *
 * The real section renderer with the story from the owner's screenshot (a
 * Markdown heading, paragraphs, a list) and a short one, on the scheme the
 * address names: ?scheme=dark (#141414, white text) or light (#ffffff) or
 * ?scheme=photo (a coloured gradient behind the section). ?short=1 is a
 * story too short to fold, which has no fade and no button.
 */
import { createRoot } from "react-dom/client"
import { createElement } from "react"
import { SectionRenderer } from "@/components/store-builder/section-renderer"
import { defaultAboutSettings } from "@/lib/store-builder/defaults"
import type { Section } from "@/lib/store-builder/types"

const q = new URLSearchParams(location.search)
const scheme = q.get("scheme") || "dark"
const LONG = `# Storelib — Complete Contacts, Forms, Emails & Community Integration


You are working directly inside the existing Storelib production codebase.

I started this shop in 2019 with **one camera** and a spare room. Today it is a small studio that makes presets, brushes and courses for *photographers who shoot at night*.

## What you'll find here
- Lightroom presets tested on thousands of photos
- Procreate brushes for texture lovers
- A portrait course with [free lessons](https://example.com/course)

> Every product is made and tested by me before it goes on sale.

Thanks for being here.`
const SHORT = "I make presets and brushes for photographers who shoot at night."
const bg = scheme === "dark" ? "#141414" : scheme === "photo" ? "linear-gradient(135deg,#1e3a8a,#7c3aed 55%,#db2777)" : "#ffffff"
const text = scheme === "light" ? "#1a1a2e" : "#ffffff"
document.body.style.background = bg
document.documentElement.className = scheme === "light" ? "light" : "dark"
const section = {
  id: "about-w10",
  type: "about",
  order: 0,
  settings: { ...defaultAboutSettings, headline: "How it started", aboutContent: q.get("short") ? SHORT : LONG, colors: { textColor: text, backgroundColor: "transparent" } },
} as Section
createRoot(document.getElementById("root")!).render(
  createElement("div", { style: { color: text, maxWidth: 1100, margin: "0 auto", padding: "24px 16px" } },
    createElement(SectionRenderer, { section, products: [], creatorName: "Ana", creatorUsername: "ana", sellerMemberSince: "2024-02-11T00:00:00.000Z", sellerTotalSales: 17, sellerProductsCount: 4 }),
  ),
)
