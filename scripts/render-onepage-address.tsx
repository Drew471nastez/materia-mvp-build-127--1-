/**
 * THE ONEPAGE'S PAGE ADDRESS FIELD, for scripts/check-onepage-address.mjs:
 * the real Settings tab of the OnePage editor (components/onepage/tabs/
 * settings-tab) on its Basic info section, in the real editor context, with a
 * saved page at storelib.me/satori.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { OnePageProvider } from "@/lib/onepage/context"
import { SettingsTab } from "@/components/onepage/tabs/settings-tab"
import { defaultTheme, defaultSettings, type OnePage } from "@/lib/onepage/types"

const PAGE: OnePage = {
  id: "op_address",
  owner_id: "probe-user",
  slug: "satori",
  title: "Satori Studio",
  bio: "Prints, posters and a newsletter",
  avatar_url: null,
  theme: defaultTheme,
  settings: { ...defaultSettings },
  seller_id: "seller_address",
  social_links: {},
  draft_blocks: [],
  status: "published",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  onboarding_completed: true,
} as OnePage

createRoot(document.getElementById("app")!).render(
  <OnePageProvider initialOnePage={PAGE}>
    <div style={{ background: "#f8f9fa", minHeight: "100vh", padding: 16 }}>
      <SettingsTab userPlan="free" />
    </div>
  </OnePageProvider>,
)
