/**
 * The library's Products with memberships folded in, for
 * scripts/check-library-memberships.mjs: the real pills
 * (components/library/library-tabs), the real list (components/library/
 * library-home) with fixture purchases and memberships, inside the column the
 * layout gives them. `#mixed` has products and two memberships, `#only` has
 * memberships and nothing else.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { LibraryTabs } from "@/components/library/library-tabs"
import { LibraryHome } from "@/components/library/library-home"
import { assembleLibrary, type LibraryExtras } from "@/lib/library/library-view"
import type { DownloadRow } from "@/lib/library/get-library-downloads"
import type { MembershipCard } from "@/lib/memberships/view-types"
import { describeStatus } from "@/lib/memberships/state"

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
  row({ productId: "p1", title: "Film Emulation Presets: Portra, Gold and Ektar", thumbnailUrl: cover("#b45309", "#78350f", "PRESETS"), createdAt: "2026-09-24T10:00:00Z", files: [{ id: "a1", fileName: "Film-Presets-Lightroom.zip", sizeBytes: 48_300_000 }, { id: "a2", fileName: "Install guide.pdf", sizeBytes: 820_000 }] }),
  row({ productId: "p2", title: "The Buyer Question Playbook", thumbnailUrl: cover("#1e3a8a", "#0f172a", "PLAYBOOK"), createdAt: "2026-09-12T10:00:00Z", creatorId: "c2", creatorName: "Luca Dragoste", creatorSlug: "lucadragoste", files: [{ id: "b1", fileName: "buyer-question-playbook.pdf", sizeBytes: 5_400_000 }] }),
  row({ productId: "p3", title: "Drum One Shots Vol. 1", thumbnailUrl: cover("#111827", "#374151", "DRUMS"), createdAt: "2026-08-30T10:00:00Z", creatorId: "c3", creatorName: "Kiko Beats", creatorSlug: "kikobeats", files: [{ id: "c1", fileName: "Drum One Shots Vol 1.zip", sizeBytes: 612_000_000 }] }),
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
    { id: "8a1f4c2e-0000-4000-8000-000000000001", product_id: "p1", created_at: "2026-09-24T10:00:00Z", status: "completed", amount_cents: 2900, receipt_token: "tok_p1_0000000000000001", stripe_payment_intent_id: "pi_a", currency: "usd", product: { title: downloads[0].title, thumbnail_url: downloads[0].thumbnailUrl, creator_id: "c1" } },
    { id: "3c9d2b7a-0000-4000-8000-000000000002", product_id: "p2", created_at: "2026-09-12T10:00:00Z", status: "completed", amount_cents: 1900, receipt_token: "tok_p2_0000000000000002", stripe_payment_intent_id: "pi_b", currency: "usd", product: { title: downloads[1].title, thumbnail_url: downloads[1].thumbnailUrl, creator_id: "c2" } },
    { id: "5e2a8f1d-0000-4000-8000-000000000003", product_id: "p3", created_at: "2026-08-30T10:00:00Z", status: "completed", amount_cents: 3500, receipt_token: "tok_p3_0000000000000003", stripe_payment_intent_id: "pi_c", currency: "usd", product: { title: downloads[2].title, thumbnail_url: downloads[2].thumbnailUrl, creator_id: "c3" } },
  ],
  reviews: [],
}

const data = assembleLibrary(downloads, extras)

const now = Date.parse("2026-10-04T10:00:00Z")
const day = 86_400_000
const base = { billing_interval: "month", amount_cents: 900, currency: "usd", trial_end: null, cancel_at_period_end: false, canceled_at: null, ended_at: null, past_due_since: null }
const card = (over: Partial<MembershipCard> & { fields: Record<string, unknown> }): MembershipCard => {
  const fields = { ...base, ...over.fields } as unknown as Parameters<typeof describeStatus>[0]
  const { fields: _f, ...rest } = over
  return {
    id: "m",
    productId: "pm",
    title: "Membership",
    cover: null,
    creator: { id: "c1", name: "Maya Chen", avatarUrl: null, handle: "mayachen" },
    status: String(fields.status),
    view: describeStatus(fields, now),
    access: fields.status !== "ended",
    unread: 0,
    lastPostAt: null,
    billingInterval: "month",
    amountCents: 900,
    currency: "usd",
    ...rest,
  }
}

const MEMBERSHIPS: MembershipCard[] = [
  card({ id: "m1", title: "Inner Circle: monthly notes and files", cover: cover("#7c3aed", "#312e81", "CIRCLE"), unread: 3, creator: { id: "c2", name: "Luca Dragoste", avatarUrl: null, handle: "lucadragoste" }, fields: { status: "active", current_period_end: new Date(now + 24 * day).toISOString() } }),
  card({ id: "m2", title: "Preset Club", fields: { status: "past_due", past_due_since: new Date(now - 2 * day).toISOString(), current_period_end: new Date(now - 2 * day).toISOString() } }),
]

const mode = location.hash.slice(1) || "mixed"

createRoot(document.getElementById("app")!).render(
  <div className="flex min-h-svh flex-col bg-[#fafafa]" data-page="library">
    <div className="sticky top-0 z-40 h-14 border-b border-black/10 bg-white" data-fake-header="" />
    <main className="flex-1">
      <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8">
        <LibraryTabs />
        <LibraryHome items={mode === "only" ? [] : data.items} creators={mode === "only" ? [] : data.creators} memberships={MEMBERSHIPS} />
      </div>
    </main>
  </div>,
)
