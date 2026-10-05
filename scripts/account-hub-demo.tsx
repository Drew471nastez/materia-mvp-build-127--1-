/**
 * The real profile center (components/account/account-hub.tsx: the
 * profile's own header, the owner's pills) with its real pages under it,
 * filled with a made up buyer, for the probes that render it in a browser:
 * scripts/check-account-hub.mjs, scripts/check-account-center.mjs and
 * scripts/check-buyer-tab-bar.mjs. The page shown follows the stub router's
 * path, the way the layout's children follow the address:
 *
 *   /account                 Activity (components/profile/profile-activity)
 *   /account/library         the library's sub pills over the products list
 *   /account/library/<tab>   the sub pills over that tab's shape
 *   /account/settings        Settings
 *
 * Globals a probe may set before load: __signedIn, __seller (true, or
 * "seller", "started", "none"), __oauthOnly, __emptyLibrary, __username
 * (false for none), __longName, __photo (a picture for the avatar), __bio
 * (false for none), __noBioColumn (profiles.bio not added yet), __cover
 * (a cover picture), __communities (false: the switch is off).
 */
import React from "react"
import { usePathname } from "next/navigation"

import { AccountHub } from "@/components/account/account-hub"
import { AccountSettings } from "@/components/account/account-settings"
import { ProfileActivity, type ActivityItemView } from "@/components/profile/profile-activity"
import { LibraryTabs } from "@/components/library/library-tabs"
import { LibraryHome } from "@/components/library/library-home"
import { skeletonFor } from "@/components/library/library-skeletons"
import type { SellerState } from "@/lib/account/seller-access"
import type { LibraryItem } from "@/lib/library/library-view"

const flag = (k: string) => (window as unknown as Record<string, unknown>)[k]

const thumb = (fill: string, dot: string) =>
  "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="${fill}"/><circle cx="48" cy="40" r="18" fill="${dot}"/></svg>`)

const item = (id: string, title: string, creator: string, at: string, extra: Partial<LibraryItem> = {}): LibraryItem =>
  ({
    productId: id,
    title,
    thumbnailUrl: thumb(["#fde68a", "#c7d2fe", "#fecaca", "#bbf7d0"][Number(id) % 4], "#1f2937"),
    productSlug: null,
    archived: false,
    purchasedAt: at,
    creator: { id: creator, name: creator, slug: null, avatarUrl: null },
    files: [],
    state: "open",
    receiptToken: null,
    review: null,
    canReview: false,
    ...extra,
  }) as LibraryItem

const REVIEW = { id: "r", rating: 5, content: "", createdAt: "", editedAt: null, hidden: false, sellerReply: null }

function sellerState(): SellerState {
  const s = flag("__seller")
  return s === "started" || s === "none" || s === "seller" ? s : s ? "seller" : "none"
}

const PHOTO =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="160" height="160" fill="#9ca3af"/><circle cx="80" cy="64" r="30" fill="#f3e3d3"/><rect x="34" y="104" width="92" height="70" rx="40" fill="#ffffff"/></svg>`)

function libraryItems(): LibraryItem[] {
  if (flag("__emptyLibrary")) return []
  return [
    item("1", "Trapsodia Trap Pack", "Negru W", "2026-09-27T10:00:00Z", { canReview: true }),
    item("2", "Drewwww", "AndrewRullz", "2026-09-26T10:00:00Z", { review: REVIEW }),
    item("3", "Film Emulation Presets for Lightroom and Capture One, Volume Two", "Maria Lopez", "2026-08-02T10:00:00Z", { review: REVIEW }),
    item("4", "Lighting basics", "Maria Lopez", "2026-07-12T10:00:00Z", { canReview: true }),
  ]
}

const NOW = Date.parse("2026-10-03T12:00:00Z")
const ago = (h: number) => new Date(NOW - h * 3600_000).toISOString()
const ACTIVITY: ActivityItemView[] = [
  { key: "rv:r1", at: ago(5), kind: "reviewed", title: "Film Emulation Presets", context: null, excerpt: "The Portra look is the one I keep coming back to. Skin tones stay natural.", rating: 5, href: "/p/presets", imageUrl: thumb("#c7d2fe", "#1f2937") },
  { key: "ca:000000000000004", at: ago(50), kind: "joined", title: "Retouch Club", context: null, excerpt: null, rating: null, href: "/community/retouch-club", imageUrl: thumb("#1a1a2e", "#f4efe6") },
]

const COVER =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 600" width="1600" height="600"><rect width="1600" height="600" fill="#d9d2c5"/><path d="M0 430 C 420 320, 860 520, 1600 380 L1600 600 L0 600 Z" fill="#8a7f6c"/><circle cx="300" cy="170" r="70" fill="#f4efe6"/></svg>`)

function Page({ path }: { path: string }) {
  if (path === "/account") {
    return <ProfileActivity userId="u1" initial={ACTIVITY} initialNext={null} now={NOW} emptyText="Nothing here yet." />
  }
  if (path.startsWith("/account/library")) {
    const items = libraryItems()
    const shape = path === "/account/library" ? null : skeletonFor(path, true)
    return (
      <div data-page="library">
        <LibraryTabs />
        {shape ?? <LibraryHome items={items} creators={[]} highlight={null} purchased={false} toReview={items.filter((i) => i.canReview).length} wishlistCount={7} />}
      </div>
    )
  }
  return null
}

export function AccountDemo() {
  const path = usePathname() || "/account"
  const long = !!flag("__longName")
  const username = flag("__username") === false ? null : "alexmorgan"
  const name = long ? "Alexandra Montgomery-Richardson" : "Alex Morgan"
  const bio = flag("__bio") === false ? "" : "Buying presets and brushes for retouching work. Mostly film looks."
  const avatarUrl = flag("__photo") ? PHOTO : null
  const coverUrl = flag("__cover") ? COVER : null
  return (
    /* The layout's main column: the hub draws the profile's 960px column itself now, under a cover that runs edge to edge (app/account/layout.tsx). */
    <div className="min-w-0" data-probe-account-column="">
      <AccountHub identity={{ userId: "u1", name, username, avatarUrl, bio, coverUrl, followers: 12, following: 30, creator: !!flag("__creator") }} communities={flag("__communities") !== false}>
        {path.startsWith("/account/settings") ? (
          <AccountSettings
            userId="u1"
            email="alex@example.com"
            name={name}
            bio={bio}
            bioSupported={!flag("__noBioColumn")}
            avatarUrl={avatarUrl}
            createdAt="2025-03-14T10:00:00Z"
            hasPassword={!flag("__oauthOnly")}
            via="Google"
            isSeller={sellerState() === "seller"}
            newsletter={false}
            personalized={true}
            cover={{ url: coverUrl, supported: true }}
            privacy={{ showActivity: true, showCommunities: true, supported: true }}
            /* A live store: Privacy has no activity switch (lib/profile/account-creator.ts). */
            creator={!!flag("__creator")}
            initialSection={(flag("__section") as "profile" | "account" | "privacy" | "preferences" | undefined) ?? "profile"}
          />
        ) : (
          <Page path={path} />
        )}
      </AccountHub>
    </div>
  )
}
