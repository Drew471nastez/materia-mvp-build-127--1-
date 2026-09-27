/**
 * The review surfaces with made up data, for scripts/check-reviews.mjs.
 * `?view=` picks one:
 *
 *   product         the reviews block on a product page (components/reviews/reviews-list)
 *   seller          the seller's Reviews list in /app (app/app/reviews/reviews-client)
 *   receipt         the receipt's review card for a guest, from the review
 *                   request email's fourth star (?rate=4)
 *   receipt-own     the same card once they have reviewed: theirs, the seller's reply, Edit and Delete
 *   library         the card on a product in the library
 *
 * The probe's server answers /api/reviews/breakdown, /check and the writes.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { ReviewsList } from "@/components/reviews/reviews-list"
import { ReceiptReview } from "@/components/reviews/receipt-review"
import { LibraryReview } from "@/components/reviews/library-review"
import { ReviewsClient } from "@/app/app/reviews/reviews-client"

const params = new URLSearchParams(location.search)
const view = params.get("view") || "product"
const origin = location.origin
const days = (n: number) => new Date(Date.parse("2026-09-27T10:00:00Z") - n * 86_400_000).toISOString()

const REVIEWS = [
  {
    id: "r1",
    product_id: "p1",
    rating: 5,
    content: "Clean files and the setup guide is clear. I had my budget running in ten minutes and the monthly view is exactly what I needed.",
    created_at: days(2),
    buyer: { id: "b1", display_name: "Ghita Nastase", avatar_url: `${origin}/buyer.png` },
    seller_reply: "Thank you Ghita. The yearly view is coming in the next update.",
    seller_reply_at: days(1),
  },
  { id: "r2", product_id: "p1", rating: 4, content: "Good template. I would like a dark version.", created_at: days(9), reviewer_name: "Ana", buyer: null },
  {
    id: "r3",
    product_id: "p1",
    rating: 5,
    content:
      "I tried three budget templates before this one. This is the first one I kept using after the first week.\n\nThe categories make sense, the formulas do not break when you add rows, and the dashboard page shows the three numbers I actually look at. The only thing I changed was the currency, which took a minute. If you are on the fence, the price is less than one takeaway and it paid for itself in the first month. I also like that it works on my phone in the Notion app.\n\nOne more thing: the setup guide at the start walks you through linking the pages, which I would have missed on my own. After a month I added a savings goal page from the same blocks and it fitted in without any trouble.",
    created_at: days(21),
    edited_at: days(20),
    buyer: { id: "b3", display_name: "Mihai Popescu", avatar_url: null },
  },
  { id: "r4", product_id: "p1", rating: 2, content: "The import from my bank did not work, I had to type everything.", created_at: days(40), buyer: { id: "b4", display_name: "Lena", avatar_url: null } },
]

const token = "rcpt_0123456789abcdefghijklmnopqrstuv"
const item = {
  orderId: "1be1ac18-0000-4000-8000-000000000001",
  token,
  productId: "9a9a9a9a-0000-4000-8000-000000000001",
  title: "Notion Budget",
  slug: "notion-budget",
  thumbnailUrl: null,
  type: "digital",
  variantName: null,
  state: "open",
  subtotalCents: 1200,
  tipCents: 0,
  totalCents: 1200,
  refundedCents: 0,
  refundedAt: null,
  files: [],
  courseHref: null,
}

function Page() {
  if (view === "product") {
    return (
      <div className="bg-white py-12">
        <div className="mx-auto w-full max-w-[1200px] px-3 sm:px-4 lg:px-6">
          <ReviewsList productId="p1" initialReviews={REVIEWS as never} initialTotal={12} reviewsCount={12} reviewsAverage={4.3} isMobile={window.innerWidth < 768} />
        </div>
      </div>
    )
  }
  if (view === "seller") {
    const rows = [
      ...REVIEWS.map((r) => ({ ...r, edited_at: r.edited_at ?? null, status: "published", reviewer_name: r.reviewer_name ?? null, seller_reply: r.seller_reply ?? null, seller_reply_at: r.seller_reply_at ?? null })),
      { id: "r5", product_id: "p2", rating: 1, content: "Scam, the seller is a thief, call me on 0722 000 000.", created_at: days(3), edited_at: null, status: "hidden", reviewer_name: null, seller_reply: null, seller_reply_at: null, buyer: { display_name: "anon123", avatar_url: null } },
    ]
    const products = [
      { id: "p1", title: "Notion Budget", slug: "notion-budget", thumbnail_url: null },
      { id: "p2", title: "Lightroom Presets Vol. 2", slug: "presets-2", thumbnail_url: null },
    ]
    return (
      <div className="h-screen">
        <ReviewsClient initialReviews={rows as never} products={products} ready />
      </div>
    )
  }
  if (view === "library") {
    return (
      <div className="min-h-screen bg-[#fafafa] px-4 py-8">
        <div className="mx-auto max-w-5xl">
          <LibraryReview productId="9a9a9a9a-0000-4000-8000-000000000001" productTitle="Notion Budget" reviewerName="Ghita Nastase" reviewerAvatarUrl={`${origin}/buyer.png`} sellerName="Maria Studio" />
        </div>
      </div>
    )
  }
  return (
    <div className="min-h-screen bg-[#f5f6f8] px-4 py-8">
      <div className="mx-auto max-w-[560px]" id="review">
        <ReceiptReview
          item={item as never}
          viewer={{ signedIn: false, isBuyer: false }}
          receiptPath={`/receipt/${token}`}
          buyerFirstName="Ana"
          sellerName="Maria Studio"
          loginHref="/login"
          signupHref="/signup"
        />
      </div>
    </div>
  )
}

createRoot(document.getElementById("app")!).render(<Page />)
