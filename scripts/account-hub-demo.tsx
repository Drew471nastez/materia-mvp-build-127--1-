/**
 * The real profile (components/account/account-hub.tsx) with its real
 * Overview and Settings, filled with a made up buyer, for the probes that
 * render it in a browser: scripts/check-account-hub.mjs and
 * scripts/check-buyer-tab-bar.mjs. The page shown follows the stub router's
 * path, the way the layout's children follow the address.
 *
 * Globals a probe may set before load: __signedIn, __seller (true, or
 * "seller", "started", "none"), __oauthOnly, __emptyLibrary, __username
 * (false for none), __longName, __photo (a picture for the avatar), __bio
 * (false for none), __noBioColumn (profiles.bio not added yet).
 */
import React from "react"
import { usePathname } from "next/navigation"

import { AccountHub } from "@/components/account/account-hub"
import { AccountOverview } from "@/components/account/account-overview"
import { AccountSettings } from "@/components/account/account-settings"
import { accountOverview } from "@/lib/account/overview"
import { ACCOUNT_GUTTER_LEFT, ACCOUNT_GUTTER_RIGHT } from "@/lib/account/account-tabs"
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

function overviewData() {
  const empty = !!flag("__emptyLibrary")
  return accountOverview({
    items: empty
      ? []
      : [
          item("1", "Trapsodia Trap Pack", "Negru W", "2026-09-27T10:00:00Z", { canReview: true }),
          item("2", "Drewwww", "AndrewRullz", "2026-09-26T10:00:00Z", { review: REVIEW }),
          item("3", "Film Emulation Presets for Lightroom and Capture One, Volume Two", "Maria Lopez", "2026-08-02T10:00:00Z", { review: REVIEW }),
          item("4", "Lighting basics", "Maria Lopez", "2026-07-12T10:00:00Z", { canReview: true }),
        ],
    courses: empty ? [] : [{ title: "Lighting basics", status: "in_progress" }, { title: "Colour grading", status: "not_started" }],
    memberships: empty ? null : { current: 1, ended: 0 },
    wishlist: empty ? 0 : 7,
    seller: sellerState(),
  })
}

export function AccountDemo() {
  const path = usePathname() || "/account"
  const long = !!flag("__longName")
  const username = flag("__username") === false ? null : "alexmorgan"
  const name = long ? "Alexandra Montgomery-Richardson" : "Alex Morgan"
  const bio = flag("__bio") === false ? "" : "Buying presets and brushes for retouching work. Mostly film looks."
  const avatarUrl = flag("__photo") ? PHOTO : null
  return (
    <div className="mx-auto w-full max-w-[720px] pt-6 pb-10 lg:max-w-[1080px]" style={{ paddingLeft: ACCOUNT_GUTTER_LEFT, paddingRight: ACCOUNT_GUTTER_RIGHT }} data-probe-account-column="">
      <AccountHub identity={{ userId: "u1", name, username, avatarUrl, memberSince: "March 2025", bio }}>
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
          />
        ) : (
          <AccountOverview data={overviewData()} />
        )}
      </AccountHub>
    </div>
  )
}
