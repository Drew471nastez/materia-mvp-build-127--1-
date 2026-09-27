import Link from "next/link"

/**
 * A token that matches nothing. Deliberately the same answer for a typo, an
 * old link and a guess, so the page says nothing about which it was.
 */
export default function ReceiptNotFound() {
  return (
    <main data-receipt="" className="min-h-[100dvh] bg-[#f8f9fa]">
      <div className="mx-auto w-full max-w-[520px] px-4 pt-[max(3rem,env(safe-area-inset-top))] sm:px-6 sm:pt-20">
        <h1 className="text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">Receipt not found</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-[#6b7280]">
          This link does not match an order. Open the button in your receipt email again, or sign in to find the
          purchase in your library.
        </p>
        <Link
          href="/library"
          className="mt-5 inline-flex h-10 items-center rounded-xl bg-[#8b5cf6] px-4 text-[14px] font-semibold text-white hover:bg-[#7c3aed]"
        >
          Go to library
        </Link>
      </div>
    </main>
  )
}
