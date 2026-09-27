/**
 * The real receipt page (app/receipt/[token]/receipt-view.tsx) with the
 * review card under it, for scripts/check-receipt.mjs. The view model is
 * what lib/receipts/load.ts hands the page; `?case=` picks one of the
 * orders below. The router is a stub; the probe's server answers every
 * /api call the page makes (download, resend, change address, reviews).
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { ReceiptView } from "@/app/receipt/[token]/receipt-view"

const params = new URLSearchParams(location.search)
const which = params.get("case") || "free"
const origin = location.origin

const seller = { name: "AndrewRullz", username: "andrewrullz", avatarUrl: `${origin}/seller.png`, supportEmail: "help@andrewrullz.com" }
const token = "rcpt_0123456789abcdefghijklmnopqrstuv"

const base = {
  number: "1BE1AC18",
  createdAt: "2026-09-27T10:12:00Z",
  currency: "usd",
  state: "open",
  refundedCents: 0,
  payment: { method: null, brand: null, last4: null },
  seller,
  buyer: { firstName: "Ghita", maskedEmail: "na••••@gmail.com", email: "sent", unclaimed: false },
  primary: { orderId: "1be1ac18-0000-4000-8000-000000000001", token },
  invoice: false,
  discountCents: 0,
  discountCode: null,
}

const line = (over: Record<string, unknown>) => ({
  orderId: "1be1ac18-0000-4000-8000-000000000001",
  token,
  productId: "9a9a9a9a-0000-4000-8000-000000000001",
  title: "Drewwww",
  slug: "drewwww",
  thumbnailUrl: `${origin}/thumb.png`,
  type: "digital",
  variantName: null,
  state: "open",
  subtotalCents: 0,
  tipCents: 0,
  totalCents: 0,
  refundedCents: 0,
  refundedAt: null,
  files: [],
  courseHref: null,
  refundPolicy: null,
  ...over,
})

const uuidPdf = { id: "f0000000-0000-4000-8000-000000000001", name: "6e6ba82c-3022-42a6-818b-41109a0910b4 (4).pdf", sizeBytes: 32 * 1024 }

const CASES: Record<string, { receipt: any; viewer: any }> = {
  /* The owner's screenshots: a free PDF, a signed-in buyer. */
  free: {
    receipt: { ...base, items: [line({ files: [uuidPdf] })], subtotalCents: 0, tipCents: 0, totalCents: 0 },
    viewer: { signedIn: true, isBuyer: true, name: "Ghita Nastase", avatarUrl: `${origin}/buyer.png` },
  },
  /* Paid by card, with a code and a tip, and a refund policy. */
  paid: {
    receipt: {
      ...base,
      items: [
        line({
          title: "Brand Kit for Small Studios",
          variantName: "Extended licence",
          subtotalCents: 2400,
          tipCents: 300,
          totalCents: 2700,
          listCents: 3000,
          files: [{ id: "f0000000-0000-4000-8000-000000000002", name: "Brand Kit.zip", sizeBytes: 48_300_000 }],
          refundPolicy: { label: "30-day money back guarantee", finePrint: "Write to me within 30 days and I will refund you, no questions asked." },
        }),
      ],
      subtotalCents: 2400,
      tipCents: 300,
      totalCents: 2700,
      discountCents: 600,
      discountCode: "AUTUMN20",
      payment: { method: "card", brand: "visa", last4: "4242" },
      invoice: true,
    },
    viewer: { signedIn: true, isBuyer: true, name: "Ghita Nastase", avatarUrl: null },
  },
  /* One product, several files. */
  multi: {
    receipt: {
      ...base,
      items: [
        line({
          title: "Lightroom Presets, Volume 2",
          subtotalCents: 1500,
          totalCents: 1500,
          files: [
            { id: "f0000000-0000-4000-8000-000000000003", name: "Presets (Lightroom Classic).zip", sizeBytes: 12_400_000 },
            { id: "f0000000-0000-4000-8000-000000000004", name: "Presets (Mobile DNG).zip", sizeBytes: 8_100_000 },
            { id: "f0000000-0000-4000-8000-000000000005", name: "Install guide.pdf", sizeBytes: 640_000 },
          ],
        }),
      ],
      subtotalCents: 1500,
      tipCents: 0,
      totalCents: 1500,
      payment: { method: "card", brand: "mastercard", last4: "5100" },
      invoice: true,
    },
    viewer: { signedIn: true, isBuyer: true, name: "Ghita Nastase", avatarUrl: `${origin}/buyer.png` },
  },
  /* A course and a basket line with nothing to download. */
  nofiles: {
    receipt: {
      ...base,
      items: [
        line({ title: "Watercolour Basics", type: "course", subtotalCents: 4900, totalCents: 4900, courseHref: "/dashboard/courses/x", thumbnailUrl: null }),
        line({
          orderId: "1be1ac18-0000-4000-8000-000000000002",
          productId: "9a9a9a9a-0000-4000-8000-000000000002",
          title: "Private Discord invite",
          type: "link",
          subtotalCents: 500,
          totalCents: 500,
        }),
      ],
      subtotalCents: 5400,
      tipCents: 0,
      totalCents: 5400,
      payment: { method: "paypal", brand: null, last4: null },
      invoice: false,
    },
    viewer: { signedIn: true, isBuyer: true, name: "Ghita Nastase", avatarUrl: null },
  },
  /* The same free PDF, opened from the email by somebody not signed in. */
  guest: {
    receipt: {
      ...base,
      buyer: { ...base.buyer, unclaimed: true },
      items: [line({ files: [uuidPdf] })],
      subtotalCents: 0,
      tipCents: 0,
      totalCents: 0,
    },
    viewer: { signedIn: false, isBuyer: false },
  },
}

const chosen = CASES[which] ?? CASES.free
;(window as any).__receiptCase = which

createRoot(document.getElementById("app")!).render(
  <ReceiptView receipt={chosen.receipt as never} viewer={chosen.viewer as never} locale="en-US" />,
)
