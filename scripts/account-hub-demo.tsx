/**
 * The real profile (components/account/account-hub.tsx) with its real
 * Overview and Settings, filled with a made up buyer, for the probes that
 * render it in a browser: scripts/check-account-hub.mjs and
 * scripts/check-buyer-tab-bar.mjs. The page shown follows the stub router's
 * path, the way the layout's children follow the address.
 *
 * Globals a probe may set before load: __signedIn, __seller, __oauthOnly,
 * __emptyLibrary, __username (false for none), __longName.
 */
import React from "react"
import { usePathname } from "next/navigation"

import { AccountHub } from "@/components/account/account-hub"
import { AccountOverview } from "@/components/account/account-overview"
import { AccountSettings } from "@/components/account/account-settings"
import { accountOverview } from "@/lib/account/overview"
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
    seller: flag("__seller") ? "seller" : "none",
  })
}

export function AccountDemo() {
  const path = usePathname() || "/account"
  const long = !!flag("__longName")
  const username = flag("__username") === false ? null : "alexmorgan"
  const name = long ? "Alexandra Montgomery-Richardson" : "Alex Morgan"
  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pb-10 pt-6 sm:px-6 sm:pt-10" data-probe-account-column="">
      <AccountHub identity={{ name, username, avatarUrl: null, memberSince: "March 2025" }}>
        {path.startsWith("/account/settings") ? (
          <AccountSettings
            userId="u1"
            email="alex@example.com"
            name={name}
            avatarUrl={null}
            createdAt="2025-03-14T10:00:00Z"
            hasPassword={!flag("__oauthOnly")}
            via="Google"
            isSeller={!!flag("__seller")}
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
