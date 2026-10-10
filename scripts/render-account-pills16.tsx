/**
 * /account as you arrive on it from a community, for
 * scripts/check-account-pills16.mjs: the account layout's pieces in its order
 * (app/account/layout.tsx and the root layout), each the real component.
 *
 *   the boot script that holds a bar's room before the page wakes
 *   AccountCommunityChrome   the community's own bar over the profile
 *                            (mounted by the root layout)
 *   the site header          only while the community's bar is not drawn
 *                            (AccountHeaderSwitch's rule)
 *   the hub and its pages    scripts/account-hub-demo.tsx
 *   SettingsSubpageHost      Edit profile's full screen layer
 *   BuyerTabBar              the phone's tab bar
 *
 * The community context and its remembered bar are written before the first
 * render, as a visit to the community leaves them. ?ctx=0 draws /account
 * with no community behind it. The same file renders the account page at
 * commit 91eb630d (before round 15) and now, so the two can be compared.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { LocaleProvider } from "@/components/locale-provider"
import { PlatformHeaderClient } from "@/components/platform/platform-header-client"
import { BuyerTabBar } from "@/components/nav/buyer-tab-bar"
import { AccountCommunityChrome, useAccountCommunityChromeActive } from "@/components/account/account-community-chrome"
import { SettingsSubpageHost } from "@/components/account/settings-subpage"
import { ACCOUNT_COMMUNITY_HEADER_BOOT } from "@/lib/nav/account-community-header-boot"
import { enterCommunityContext } from "@/lib/nav/community-context"
import { rememberCommunityChrome } from "@/lib/nav/community-chrome-cache"
import type { TopBarData } from "@/components/community/member/view-types"
import { AccountDemo } from "./account-hub-demo"

const params = new URLSearchParams(location.search)
const SLUG = "clay-studio"
const LOGO =
  "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="#1a1a2e"/><circle cx="48" cy="44" r="20" fill="#f4efe6"/></svg>`)
export const TOP_BAR: TopBarData = {
  community: { id: "c1", slug: SLUG, name: "Clay Studio", logoUrl: LOGO },
  creator: { name: "Maya Okafor", href: "/mayao" },
  me: { name: "Alex Morgan", avatarUrl: null, profileHref: "/@alexmorgan", username: "alexmorgan" },
  communities: [{ id: "c1", slug: SLUG, name: "Clay Studio", logoUrl: LOGO }],
  manageHref: null,
}

try {
  localStorage.clear()
  sessionStorage.clear()
} catch {
  /* no storage */
}
if (params.get("ctx") !== "0") {
  enterCommunityContext(SLUG, { id: "c1", name: "Clay Studio" })
  rememberCommunityChrome(SLUG, TOP_BAR)
}
/* The boot script, as the layout writes it before the page wakes. */
new Function(ACCOUNT_COMMUNITY_HEADER_BOOT)()

function HeaderSwitch() {
  const community = useAccountCommunityChromeActive()
  return community ? null : <PlatformHeaderClient />
}

function Shell() {
  return (
    <>
      <AccountCommunityChrome />
      <div className="flex min-h-svh flex-col bg-[#fafafa]" data-page="account">
        <HeaderSwitch />
        <main className="flex-1 overflow-x-clip">
          <AccountDemo />
        </main>
        <footer className="bg-[#111] px-4 py-10 text-[13px] text-white/70">Storelib</footer>
        <BuyerTabBar />
      </div>
      <SettingsSubpageHost />
    </>
  )
}

createRoot(document.getElementById("app")!).render(
  <LocaleProvider>
    <Shell />
  </LocaleProvider>,
)
