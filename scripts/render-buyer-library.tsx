/**
 * The library's screens for scripts/check-buyer-library.mjs: the real components
 * (components/library/*) with fixture purchases, inside the same container
 * the layout gives them (app/library/layout.tsx), Next's router and links
 * stood in for. `window.__mode` picks the screen.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { LibraryTabs } from "@/components/library/library-tabs"
import { LibraryHome } from "@/components/library/library-home"
import { LibraryReviews } from "@/components/library/library-reviews"
import { LibraryReceipts } from "@/components/library/library-receipts"
import { LibraryProduct } from "@/components/library/library-product"
import { assembleLibrary, type LibraryExtras } from "@/lib/library/library-view"
import type { DownloadRow } from "@/lib/library/get-library-downloads"

/* A cover drawn in the page, so the probe needs no network for pictures. */
function cover(a: string, b: string, label: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="160" height="160" fill="url(#g)"/><text x="14" y="140" font-family="Inter,Arial" font-weight="700" font-size="22" fill="rgba(255,255,255,0.92)">${label}</text></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

const row = (over: Partial<DownloadRow>): DownloadRow => ({
  id: "e",
  productId: "p",
  title: "Product",
  thumbnailUrl: null,
  creatorName: "Maya Chen",
  createdAt: "2026-09-20T10:00:00Z",
  purchasedAtLabel: "",
  files: [],
  creatorId: "c1",
  creatorSlug: "mayachen",
  creatorAvatarUrl: null,
  productSlug: "product",
  productStatus: "published",
  ...over,
})

const downloads: DownloadRow[] = [
  row({ productId: "p1", title: "Film Emulation Presets: Portra, Gold and Ektar", thumbnailUrl: cover("#b45309", "#78350f", "PRESETS"), createdAt: "2026-09-24T10:00:00Z", files: [{ id: "a1", fileName: "Film-Presets-Lightroom.zip", sizeBytes: 48_300_000 }, { id: "a2", fileName: "Film-Presets-Mobile.dng.zip", sizeBytes: 12_900_000 }, { id: "a3", fileName: "Install guide.pdf", sizeBytes: 820_000 }] }),
  row({ productId: "p2", title: "The Buyer Question Playbook", thumbnailUrl: cover("#1e3a8a", "#0f172a", "PLAYBOOK"), createdAt: "2026-09-12T10:00:00Z", creatorId: "c2", creatorName: "Luca Dragoste", creatorSlug: "lucadragoste", files: [{ id: "b1", fileName: "buyer-question-playbook.pdf", sizeBytes: 5_400_000 }] }),
  row({ productId: "p3", title: "Drum One Shots Vol. 1", thumbnailUrl: cover("#111827", "#374151", "DRUMS"), createdAt: "2026-08-30T10:00:00Z", creatorId: "c3", creatorName: "Kiko Beats", creatorSlug: "kikobeats", files: [{ id: "c1", fileName: "Drum One Shots Vol 1.zip", sizeBytes: 612_000_000 }] }),
  row({ productId: "p4", title: "Notion Content Calendar", thumbnailUrl: cover("#7c3aed", "#4c1d95", "NOTION"), createdAt: "2026-07-02T10:00:00Z", creatorId: "c2", creatorName: "Luca Dragoste", creatorSlug: "lucadragoste", files: [] }),
  row({ productId: "p5", title: "Watercolor Brush Pack", thumbnailUrl: cover("#0f766e", "#134e4a", "BRUSHES"), createdAt: "2026-05-18T10:00:00Z", files: [{ id: "e1", fileName: "brushes.abr", sizeBytes: 31_000_000 }] }),
]

const extras: LibraryExtras = {
  ownCreatorId: null,
  variantFiles: new Map(),
  creators: [
    { id: "c1", name: "Maya Chen", slug: "mayachen", avatarUrl: null, supportEmail: "hello@mayachen.co" },
    { id: "c2", name: "Luca Dragoste", slug: "lucadragoste", avatarUrl: null, supportEmail: null },
    { id: "c3", name: "Kiko Beats", slug: "kikobeats", avatarUrl: null, supportEmail: null },
  ],
  orders: [
    { id: "8a1f4c2e-0000-4000-8000-000000000001", product_id: "p1", created_at: "2026-09-24T10:00:00Z", status: "completed", amount_cents: 2900, receipt_token: "tok_p1_0000000000000001", stripe_session_id: "cs_a", stripe_payment_intent_id: "pi_a", currency: "usd", product: { title: "Film Emulation Presets: Portra, Gold and Ektar", thumbnail_url: downloads[0].thumbnailUrl, creator_id: "c1" } },
    { id: "3c9d2b7a-0000-4000-8000-000000000002", product_id: "p2", created_at: "2026-09-12T10:00:00Z", status: "completed", amount_cents: 1900, receipt_token: "tok_p2_0000000000000002", stripe_payment_intent_id: "pi_b", currency: "usd", product: { title: "The Buyer Question Playbook", thumbnail_url: downloads[1].thumbnailUrl, creator_id: "c2" } },
    { id: "5e2a8f1d-0000-4000-8000-000000000003", product_id: "p3", created_at: "2026-08-30T10:00:00Z", status: "completed", amount_cents: 3500, receipt_token: "tok_p3_0000000000000003", stripe_payment_intent_id: "pi_c", currency: "usd", product: { title: "Drum One Shots Vol. 1", thumbnail_url: downloads[2].thumbnailUrl, creator_id: "c3" } },
    { id: "9b7c3e4f-0000-4000-8000-000000000004", product_id: "p4", created_at: "2026-07-02T10:00:00Z", status: "completed", amount_cents: 0, receipt_token: "tok_p4_0000000000000004", currency: "usd", product: { title: "Notion Content Calendar", thumbnail_url: downloads[3].thumbnailUrl, creator_id: "c2" } },
    { id: "2d4f6a8c-0000-4000-8000-000000000005", product_id: "p5", created_at: "2026-05-18T10:00:00Z", status: "refunded", amount_cents: 1500, refund_amount_cents: 1500, receipt_token: "tok_p5_0000000000000005", stripe_payment_intent_id: "pi_e", currency: "usd", product: { title: "Watercolor Brush Pack", thumbnail_url: downloads[4].thumbnailUrl, creator_id: "c1" } },
  ],
  reviews: [{ id: "r1", product_id: "p2", rating: 4, content: "Short, practical, and I used two of the question lists the same week. The section on pricing pages is the best part.", created_at: "2026-09-15T10:00:00Z", seller_reply: "Thank you!" }],
}

const data = assembleLibrary(downloads, extras)
const mode = (window as unknown as { __mode?: string }).__mode || "home"

function Shell({ children, tabs = true }: { children: React.ReactNode; tabs?: boolean }) {
  return (
    <div className="flex min-h-svh flex-col bg-[#fafafa]" data-page="library">
      <div className="h-14 border-b border-black/10 bg-[#0b0b10]" data-fake-header="" />
      <main className="flex-1">
        <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8">
          {tabs ? <LibraryTabs /> : null}
          {children}
        </div>
      </main>
    </div>
  )
}

function Screen() {
  switch (mode) {
    case "empty":
      return (
        <Shell>
          <LibraryHome items={[]} creators={[]} wishlistCount={3} />
        </Shell>
      )
    case "reviews":
      return (
        <Shell>
          <LibraryReviews items={data.items} />
        </Shell>
      )
    case "receipts":
      return (
        <Shell>
          <LibraryReceipts receipts={data.receipts} />
        </Shell>
      )
    case "product": {
      const item = data.items[0]
      return (
        <Shell>
          <LibraryProduct
            data={{
              productId: item.productId,
              title: item.title,
              thumbnailUrl: item.thumbnailUrl,
              productSlug: item.productSlug,
              archived: false,
              purchasedAt: item.purchasedAt,
              state: item.state,
              files: item.files.map((f, i) => ({ ...f, addedAt: i === 2 ? "2026-09-26T10:00:00Z" : null })),
              receiptToken: item.receiptToken,
              receiptNumber: "8A1F4C2E",
              invoice: true,
              isOwn: false,
              creator: data.creators.find((c) => c.id === "c1")!,
              reviewer: { name: "Sam Rivera", avatarUrl: null },
            }}
          />
        </Shell>
      )
    }
    default:
      return (
        <Shell>
          <LibraryHome items={data.items} creators={data.creators} toReview={data.items.filter((i) => i.canReview).length} highlight={mode === "highlight" ? "p1" : null} />
        </Shell>
      )
  }
}

createRoot(document.getElementById("app")!).render(<Screen />)
