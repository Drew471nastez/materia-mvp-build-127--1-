/**
 * ===========================================================================
 *  ROUND 31: A LIBRARY'S ROWS AND THE APP'S DOWNLOAD TRAY (render harness)
 * ===========================================================================
 * The real library list (components/library/library-home.tsx, so the real
 * product rows, the real "7 files" list and the real file rows) over fixture
 * purchases, and the real tray (components/downloads/download-tray.tsx) on
 * the same page, driven through the real download store, which the probe
 * reaches as window.__dl. ?dark=1 sets the dark look as lib/appearance does.
 *
 * Rendered by scripts/check-library-round31.mjs.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { LibraryHome } from "@/components/library/library-home"
import { DownloadTray } from "@/components/downloads/download-tray"
import { assembleLibrary, type LibraryExtras } from "@/lib/library/library-view"
import type { DownloadRow } from "@/lib/library/get-library-downloads"
import { patchJob, removeJob, startJob, downloadJobs } from "@/lib/downloads/download-store"

const params = new URLSearchParams(location.search)
if (params.get("dark") === "1") document.documentElement.setAttribute("data-sl-dark", "")

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
  row({
    productId: "p1",
    title: "Film Emulation Presets: Portra, Gold and Ektar",
    thumbnailUrl: cover("#b45309", "#78350f", "PRESETS"),
    createdAt: "2026-09-24T10:00:00Z",
    files: [
      { id: "a1", fileName: "Film-Presets-Lightroom-Classic.zip", sizeBytes: 48_300_000 },
      { id: "a2", fileName: "Film-Presets-Mobile.dng.zip", sizeBytes: 12_900_000 },
      { id: "a3", fileName: "Install guide.pdf", sizeBytes: 820_000 },
      { id: "a4", fileName: "Portra 400 reference frames.jpg", sizeBytes: 6_400_000 },
      { id: "a5", fileName: "Gold 200 LUT.cube", sizeBytes: 1_100_000 },
      { id: "a6", fileName: "Ektar 100 before and after.mp4", sizeBytes: 212_000_000 },
      { id: "a7", fileName: "LICENSE", sizeBytes: 4_200 },
    ],
  }),
  row({ productId: "p2", title: "The Buyer Question Playbook", thumbnailUrl: cover("#1e3a8a", "#0f172a", "PLAYBOOK"), createdAt: "2026-09-12T10:00:00Z", creatorId: "c2", creatorName: "Luca Dragoste", creatorSlug: "lucadragoste", files: [{ id: "b1", fileName: "buyer-question-playbook.pdf", sizeBytes: 5_400_000 }] }),
  row({ productId: "p3", title: "Drum One Shots Vol. 1", thumbnailUrl: cover("#111827", "#374151", "DRUMS"), createdAt: "2026-08-30T10:00:00Z", creatorId: "c3", creatorName: "Kiko Beats", creatorSlug: "kikobeats", files: [{ id: "c1", fileName: "Drum One Shots Vol 1.zip", sizeBytes: 612_000_000 }, { id: "c2", fileName: "Kit notes.pdf", sizeBytes: 300_000 }] }),
  row({ productId: "p4", title: "Notion Content Calendar", thumbnailUrl: cover("#7c3aed", "#4c1d95", "NOTION"), createdAt: "2026-07-02T10:00:00Z", creatorId: "c2", creatorName: "Luca Dragoste", creatorSlug: "lucadragoste", files: [] }),
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
    { id: "8a1f4c2e-0000-4000-8000-000000000001", product_id: "p1", created_at: "2026-09-24T10:00:00Z", status: "completed", amount_cents: 2900, receipt_token: "tok_p1_0000000000000001", stripe_session_id: "cs_a", stripe_payment_intent_id: "pi_a", currency: "usd", product: { title: "Film Emulation Presets", thumbnail_url: null, creator_id: "c1" } },
    { id: "3c9d2b7a-0000-4000-8000-000000000002", product_id: "p2", created_at: "2026-09-12T10:00:00Z", status: "completed", amount_cents: 1900, receipt_token: "tok_p2_0000000000000002", stripe_payment_intent_id: "pi_b", currency: "usd", product: { title: "The Buyer Question Playbook", thumbnail_url: null, creator_id: "c2" } },
    { id: "5e2a8f1d-0000-4000-8000-000000000003", product_id: "p3", created_at: "2026-08-30T10:00:00Z", status: "completed", amount_cents: 3500, receipt_token: "tok_p3_0000000000000003", stripe_payment_intent_id: "pi_c", currency: "usd", product: { title: "Drum One Shots Vol. 1", thumbnail_url: null, creator_id: "c3" } },
    { id: "9b7c3e4f-0000-4000-8000-000000000004", product_id: "p4", created_at: "2026-07-02T10:00:00Z", status: "completed", amount_cents: 0, receipt_token: "tok_p4_0000000000000004", currency: "usd", product: { title: "Notion Content Calendar", thumbnail_url: null, creator_id: "c2" } },
  ],
  reviews: [],
} as unknown as LibraryExtras

const data = assembleLibrary(downloads, extras)

/* The store, for the probe to drive the tray exactly as lib/downloads/download-file.ts does. */
;(window as unknown as { __dl: unknown }).__dl = { startJob, patchJob, removeJob, downloadJobs }

function Page() {
  return (
    <div className="min-h-svh bg-[#fafafa]" data-page="library">
      <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8">
        <LibraryHome items={data.items} creators={data.creators} />
      </div>
      <DownloadTray />
    </div>
  )
}

createRoot(document.getElementById("app")!).render(<Page />)
