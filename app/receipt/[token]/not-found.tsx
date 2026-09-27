import Link from "next/link"

/**
 * A token that matches nothing. Deliberately the same answer for a typo, an
 * old link and a guess, so the page says nothing about which it was.
 */
export default function ReceiptNotFound() {
  return (
    <main data-receipt="" className="min-h-[100dvh] bg-[#f5f6f8]">
      <div className="mx-auto w-full max-w-[520px] px-4 pt-[max(3rem,env(safe-area-inset-top))] sm:px-6 sm:pt-20">
        <h1 className="text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">Receipt not found</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-[#6b7280]">
          This link does not match an order. Open the button in your receipt email again, or sign in to find the
          purchase in your library.
        </p>
        <Link
          href="/library"
          className="mt-5 inline-flex h-10 items-center rounded-[10px] border border-[#0f0f1c] bg-[#1a1a2e] px-4 text-[14px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_1px_2px_rgba(16,24,40,0.24)] transition-[background-color,translate] duration-150 hover:bg-[#262640] active:translate-y-px"
        >
          Go to library
        </Link>
      </div>
    </main>
  )
}
