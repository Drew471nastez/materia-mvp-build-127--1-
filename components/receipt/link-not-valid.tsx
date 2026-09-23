import Link from "next/link"

/** The one answer an old access link gets when it does not check out. */
export function LinkNotValid() {
  return (
    <main className="min-h-[100dvh] bg-[#f8f9fa]">
      <div className="mx-auto w-full max-w-[520px] px-4 pt-[max(3rem,env(safe-area-inset-top))] sm:px-6 sm:pt-20">
        <h1 className="text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">This link is not valid</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-[#6b7280]">
          Open the button in your receipt email instead, or sign in with the email you paid with to find the purchase
          in your library.
        </p>
        <div className="mt-5 flex gap-2">
          <Link
            href="/login?redirect=%2Flibrary"
            className="inline-flex h-10 items-center rounded-xl bg-[#8b5cf6] px-4 text-[14px] font-semibold text-white hover:bg-[#7c3aed]"
          >
            Sign in
          </Link>
        </div>
      </div>
    </main>
  )
}
