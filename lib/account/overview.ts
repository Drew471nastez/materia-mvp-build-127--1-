/**
 * ===========================================================================
 *  WHAT THE PROFILE'S OVERVIEW SAYS
 * ===========================================================================
 * The buyer's profile at /account, in a few facts that each open the place
 * they are about: what they bought (/library), the courses they are part way
 * through (/library/courses), their memberships (/library/memberships), the
 * reviews they wrote (/library/reviews) and what they saved
 * (/library/wishlist). Then the newest purchases, and selling.
 *
 * Built by a pure function from what the library's own loaders return, so
 * the numbers are the library's numbers and never a second count of the
 * same rows, and the rules (which facts are shown, which purchases are the
 * newest) are tested without a database (tests/account-hub.test.ts).
 *
 * A fact about something this person has never had is left out rather than
 * shown as a zero: somebody who never bought a course has no "Courses in
 * progress 0". Purchases and the wishlist are always there; they are what
 * the page is for.
 */
import type { LibraryItem } from "@/lib/library/library-view"
import type { SellerState } from "@/lib/account/seller-access"

/** How many of the newest purchases the overview lists. */
export const RECENT_PURCHASES = 3

export interface OverviewFact {
  key: "purchases" | "courses" | "memberships" | "communities" | "reviews" | "wishlist"
  label: string
  href: string
  value: number
  /** A line under the label, when there is something specific to say. */
  detail: string | null
}

export interface OverviewPurchase {
  productId: string
  title: string
  thumbnailUrl: string | null
  creatorName: string
  purchasedAt: string
  href: string
}

/**
 * THE WAY INTO SELLING, ONE OF THREE (lib/account/seller-access.ts):
 *
 *   "seller"   Dashboard, to /app. Only an account whose onboarding is
 *              finished; the owner: "The Dashboard thing in the profile page
 *              should not appear if I'm not a seller; then it should show
 *              Become a seller."
 *   "started"  Finish setting up your store, to /sell, which opens the
 *              onboarding again where it was left.
 *   "none"     Become a seller, to /sell, which starts it for this same
 *              account, keeping everything bought and saved.
 */
export interface SellingEntry {
  key: "dashboard" | "finish" | "become"
  href: "/app" | "/sell"
  title: string
  detail: string
}

export function sellingEntry(state: SellerState): SellingEntry {
  if (state === "seller") return { key: "dashboard", href: "/app", title: "Dashboard", detail: "Your store, products and sales." }
  if (state === "started") return { key: "finish", href: "/sell", title: "Finish setting up your store", detail: "Pick up seller setup where you left it." }
  return { key: "become", href: "/sell", title: "Become a seller", detail: "Sell on Storelib with this same account." }
}

export interface AccountOverviewData {
  facts: OverviewFact[]
  recent: OverviewPurchase[]
  seller: SellerState
  selling: SellingEntry
}

/** The courses as lib/courses/load.ts loadMyCourses returns them, the part this needs. */
export interface OverviewCourse {
  title: string
  status: "not_started" | "in_progress" | "completed"
}

export interface OverviewInput {
  /** The library (lib/library/load-library.ts), or null when it could not be read. */
  items: LibraryItem[] | null
  /** Newest activity first, as loadMyCourses sorts them; null when they could not be read. */
  courses: OverviewCourse[] | null
  /** Running memberships and ended ones; null when memberships are not set up or could not be read. */
  memberships: { current: number; ended: number } | null
  wishlist: number
  seller: SellerState
  /** Communities they are an active member of; null while communities are off or could not be read. */
  communities?: number | null
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function accountOverview({ items, courses, memberships, wishlist, seller, communities = null }: OverviewInput): AccountOverviewData {
  const owned = items ?? []
  const facts: OverviewFact[] = [{ key: "purchases", label: "Purchases", href: "/library", value: owned.length, detail: null }]

  if (courses && courses.length > 0) {
    const going = courses.filter((c) => c.status === "in_progress")
    const fresh = courses.filter((c) => c.status === "not_started").length
    facts.push({
      key: "courses",
      label: "Courses in progress",
      href: "/library/courses",
      value: going.length,
      /* The one they had open last: it is where Continue goes on the courses page. */
      detail: going[0] ? `Continue ${going[0].title}` : fresh > 0 ? `${plural(fresh, "course", "courses")} not started` : "All finished",
    })
  }

  if (memberships && memberships.current + memberships.ended > 0) {
    facts.push({
      key: "memberships",
      label: "Memberships",
      href: "/library/memberships",
      value: memberships.current,
      detail: memberships.current === 0 ? "None running" : null,
    })
  }

  /* Only for somebody who is in one: an account in none is not told about a zero. */
  if (communities && communities > 0) {
    facts.push({ key: "communities", label: "Communities", href: "/library/communities", value: communities, detail: null })
  }

  if (owned.length > 0) {
    const written = owned.filter((i) => i.review).length
    const open = owned.filter((i) => i.canReview).length
    facts.push({
      key: "reviews",
      label: "Reviews written",
      href: "/library/reviews",
      value: written,
      detail: open > 0 ? `${plural(open, "purchase", "purchases")} to review` : null,
    })
  }

  facts.push({ key: "wishlist", label: "Wishlist", href: "/library/wishlist", value: wishlist, detail: null })

  const recent = owned
    .slice()
    .sort((a, b) => String(b.purchasedAt).localeCompare(String(a.purchasedAt)))
    .slice(0, RECENT_PURCHASES)
    .map((i) => ({
      productId: i.productId,
      title: i.title,
      thumbnailUrl: i.thumbnailUrl,
      creatorName: i.creator.name,
      purchasedAt: i.purchasedAt,
      href: `/library/products/${i.productId}`,
    }))

  return { facts, recent, seller, selling: sellingEntry(seller) }
}
