import type { Metadata } from "next"
import Link from "next/link"
import { ShoppingBag } from "lucide-react"

// The bag icon in the header needs somewhere real to land. There is no cart
// system in the product yet — no line items, no persistence — so this is an
// honest empty state rather than a mock of one, and it stays correct for as long
// as that remains true. When a cart lands, this page is where it renders.
export const metadata: Metadata = {
  title: "Bag | Storelib",
  robots: { index: false, follow: true },
}

export default function CartPage() {
  return (
    <div className="mx-auto flex min-h-[60svh] max-w-xl flex-col items-center justify-center px-6 py-16 text-center">
      <span className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
        <ShoppingBag className="h-7 w-7" />
      </span>
      <h1 className="text-xl font-semibold text-neutral-900">Coșul tău este gol</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-neutral-500">
        Articolele pe care le adaugi vor apărea aici.
      </p>
      <Link
        href="/"
        className="mt-7 inline-flex h-11 items-center justify-center rounded-full bg-[#7c3aed] px-6 text-[15px] font-semibold text-white transition-transform active:scale-[0.97]"
      >
        Descoperă anunțuri
      </Link>
    </div>
  )
}
