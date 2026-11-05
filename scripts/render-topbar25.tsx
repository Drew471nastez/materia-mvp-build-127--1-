/**
 * The top of a creator page, the way app/(storelib)/(marketing)/u/[username]/page.tsx
 * puts it together: the page root in the scheme's colours, the top bar the
 * rule picks (lib/storefront/subscribe-bar-visibility.ts), then the real
 * header with its cover, then the tabs. Driven by scripts/check-topbar25.mjs.
 *
 *   ?case=visitor     opened on its own, signed out or signed in: SubscribeBar
 *   ?case=owner       the owner, opened on its own: LiveSubscribeBar + pencil
 *   ?case=editor      the owner inside the creator page editor's frame
 *   ?case=explore     a visitor from Explore: the bar with the chevron first
 *   ?case=community   from a community: the slim bar alone
 *   &scheme=blacks    any offered scheme (default "blacks", the owner's)
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { SubscribeBar } from "@/components/store-builder/subscribe-bar"
import { LiveSubscribeBar } from "@/components/store-builder/live-subscribe-bar"
import { ProfileTopBar, TopBarBack } from "@/components/profile/profile-top-bar"
import { ShopHeaderRenderer } from "@/components/store-builder/section-renderer"
import { StorefrontTabs } from "@/components/storefront/storefront-tabs"
import { resolveStorefrontChrome } from "@/lib/store-builder/storefront-chrome"
import { defaultShopHeaderSettings } from "@/lib/store-builder/defaults"
import { storefrontHeaderSurface, storefrontRootStyle, storefrontTabsSurface } from "@/components/storefront/storefront-template"
import { cameFromCommunity, showsSubscribeBar } from "@/lib/storefront/subscribe-bar-visibility"
import type { ShopHeaderSettings, ThemePreset } from "@/lib/store-builder/types"

const q = new URLSearchParams(location.search)
const which = q.get("case") || "visitor"
const scheme = (q.get("scheme") || "blacks") as ThemePreset

const embedded = which === "editor"
const viewerIsOwner = which === "owner" || which === "editor"
const from = which === "community" ? "community" : which === "explore" ? "explore" : null
const backShown = which === "community" || which === "explore"
/* The page's own decision, word for word. */
const newsletterBar = embedded || showsSubscribeBar({ creatorPage: true, fromCommunity: cameFromCommunity({ from, backTarget: null, referer: null }) })

const chrome = resolveStorefrontChrome(scheme, {})
const settings = {
  visible: true,
  text: "",
  customCtaText: "",
  placeholder: "Enter your email",
  buttonText: "",
  showAvatar: true,
  avatarUrl: "https://storelib.com/__cover/face.png",
  creatorName: "AndrewRullz",
  style: "style1",
  buttonStyle: "style1",
  enableStickyBar: true,
  enableStickyOnScrollUp: true,
  dismissible: false,
  position: "top",
  creatorUserId: "p1",
  ...chrome.bar,
} as never

const header = {
  ...defaultShopHeaderSettings,
  bio: "Building cool stuff on the internet...CEO @Storelib",
  showBio: true,
  coverImageUrl: "https://storelib.com/__cover/cover.png",
  avatarUrl: "https://storelib.com/__cover/face.png",
} as unknown as ShopHeaderSettings

function Page() {
  return (
    <div className="min-h-screen overflow-x-clip" data-storefront-root="" style={storefrontRootStyle(chrome)}>
      {newsletterBar &&
        (viewerIsOwner ? (
          <LiveSubscribeBar
            settings={settings}
            creatorId="c1"
            leading={!embedded ? <TopBarBack initiallyShown={backShown} /> : undefined}
            editor={{ values: { text: "", buttonText: "", style: "style1", buttonStyle: "style1", backgroundColor: "", textColor: "", buttonColor: "", buttonTextColor: "" } }}
          />
        ) : (
          <SubscribeBar settings={settings} creatorId="c1" leading={!embedded ? <TopBarBack initiallyShown={backShown} /> : undefined} />
        ))}
      {!embedded && !newsletterBar ? (
        <ProfileTopBar
          always
          initiallyShown={backShown}
          name="AndrewRullz"
          avatarUrl="https://storelib.com/__cover/face.png"
          colors={{ background: chrome.bar.backgroundColor, text: chrome.bar.textColor }}
          width="max-w-[1150px]"
        />
      ) : null}
      <div data-probe-header="">
        <ShopHeaderRenderer
          settings={header}
          profile={{ id: "p1", display_name: "AndrewRullz", username: "andrewrullz", avatar_url: "https://storelib.com/__cover/face.png", created_at: "2026-01-01" } as never}
          creator={{ id: "c1", bio: "Building cool stuff on the internet...CEO @Storelib" } as never}
          products={[]}
          productCount={0}
          surface={storefrontHeaderSurface(chrome)}
        />
      </div>
      <StorefrontTabs
        tabs={[
          { id: "home", label: "Home", panel: <div style={{ height: 2400 }} /> },
          { id: "products", label: "Products", panel: <div /> },
          { id: "communities", label: "Communities", panel: <div /> },
        ]}
        surface={storefrontTabsSurface(chrome)}
      />
    </div>
  )
}

createRoot(document.getElementById("app")!).render(<Page />)
